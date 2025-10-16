// src/pages/EnergySimulator.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Sun,
  Wind,
  Battery,
  PlugZap,
  Play,
  Pause,
  Layers,
  Download,
  Settings,
  Menu,
  X,
  Activity,
  Gauge,
  Lightbulb,
} from "lucide-react";
import { Toaster, toast } from "sonner";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";

/* ============================
   Utilities
   ============================ */
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================
   Renewable energy simulation hook
   - Simulates solar PV (irradiance→I,V,P), wind turbine (wind speed curve),
     battery charging/discharging, inverter losses, and consumer load.
   - Produces history buffer for plots and visualizer
   ============================ */
function useEnergySim({
  running,
  timestep = 100,
  simType = "solar", // "solar" | "wind" | "hybrid"
  solarConfig = { panelWp: 350, tiltFactor: 1.0, efficiency: 0.20, irradiance: 800 }, // irradiance W/m^2
  windConfig = { ratedPower: 2000, cutIn: 3.5, ratedSpeed: 12, cutOut: 25, rotorArea: 30 },
  batteryConfig = { capacity_kWh: 10, soc: 0.5, chargeEff: 0.95, dischargeEff: 0.95 },
  loadWatts = 500,
  gridAllowed = true,
}) {
  // history seeded for charts
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, P_gen: 0, P_load: 0, P_batt: 0, soc: 0, V_bus: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // internal states
  const socRef = useRef(clamp(batteryConfig.soc, 0, 1)); // state-of-charge [0..1]
  const busVoltageRef = useRef(230); // AC bus nominal voltage in V

  // helpers — basic PV model: P = irradiance * area * eff; panelWp approximates area*eff at STC
  const pvPowerFromIrradiance = useCallback((irradiance, panelWp, tiltFactor, eff) => {
    // crude model: scale STC power (Wp) linearly by irradiance fraction (1000 W/m^2 STC)
    const p = (panelWp * (irradiance / 1000) * tiltFactor * eff) || 0;
    return Math.max(0, p); // W
  }, []);

  // wind power from speed (Betz-limited crude model)
  const windPowerFromSpeed = useCallback((v, rotorArea, cp = 0.4, rho = 1.225) => {
    // P = 0.5 * rho * A * v^3 * cp
    const P = 0.5 * rho * rotorArea * Math.pow(v, 3) * cp;
    return Math.max(0, P);
  }, []);

  // wind turbine mapping to rated power (clamp at rated)
  const windTurbineOutput = useCallback((v, cfg) => {
    const { cutIn, ratedSpeed, cutOut, ratedPower, rotorArea } = cfg;
    if (v < cutIn || v >= cutOut) return 0;
    // scale using cubic rule until rated speed
    const p = windPowerFromSpeed(v, rotorArea);
    return Math.min(ratedPower, p);
  }, [windPowerFromSpeed]);

  // a simple dynamic profile generator (irradiance and wind speed) to simulate "real-time" variation
  const sampleEnvironment = useCallback((tSeconds) => {
    // diurnal irradiance: sin wave centered about midday peak (assume peak at 12:00 => we'll map tSeconds mod 86400)
    const daySeconds = 24 * 3600;
    const mod = (tSeconds % daySeconds) / daySeconds; // 0..1 across day
    const solarFactor = Math.max(0, Math.sin((mod - 0.25) * Math.PI * 2)); // peaks at mod=0.75 -> midday mapping
    const irradiance = 100 + 900 * solarFactor * Math.max(0.15, 0.9 * Math.exp(-0.00005 * tSeconds)); // some long-term decay possible

    // wind: noise + slow drifting pattern
    const base = 4 + 3 * Math.sin((tSeconds / 1800) * 2 * Math.PI * 0.5) + 2 * Math.sin((tSeconds / 600) * 2 * Math.PI * 1.5);
    // add small random jitter
    const jitter = (Math.sin(tSeconds * 0.023) + Math.sin(tSeconds * 0.07)) * 0.6;
    const windSpeed = Math.max(0.1, base + jitter + 0.2 * Math.sin(tSeconds * 0.011));

    return { irradiance: round(irradiance, 2), windSpeed: round(windSpeed, 2) };
  }, []);

  useEffect(() => {
    let alive = true;
    lastRef.current = performance.now();

    const step = (ts) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(step);
      if (!running) {
        lastRef.current = ts;
        return;
      }
      const dt = ts - lastRef.current;
      if (dt < timestep) return;
      lastRef.current = ts;
      tRef.current += dt;
      const tSeconds = tRef.current / 1000;

      // environment samples
      const env = sampleEnvironment(Math.floor(tSeconds));
      const irradiance = env.irradiance;
      const windSpeed = env.windSpeed;

      // generation
      let P_pv = 0;
      let P_wind = 0;
      if (simType === "solar" || simType === "hybrid") {
        P_pv = pvPowerFromIrradiance(irradiance, solarConfig.panelWp, solarConfig.tiltFactor, solarConfig.efficiency);
      }
      if (simType === "wind" || simType === "hybrid") {
        P_wind = windTurbineOutput(windSpeed, windConfig);
      }
      const P_gen_raw = P_pv + P_wind;

      // inverter & balance losses (simple fixed efficiency)
      const inverterEff = 0.96;
      const P_gen_ac = P_gen_raw * inverterEff;

      // load
      const P_load = loadWatts;

      // battery decision logic: simple priority to store excess generation, discharge when gen < load and soc > 0
      const battCapWh = batteryConfig.capacity_kWh * 1000;
      let soc = socRef.current;
      let P_batt = 0; // positive means discharging (delivering to load), negative means charging
      const margin = 1.0; // small margin to avoid oscillation

      const surplus = P_gen_ac - P_load;

      if (surplus > 1) {
        // charge battery with available surplus
        const chargePower = surplus * batteryConfig.chargeEff; // W
        // convert to SOC delta over this time slice (dt)
        const deltaWh = (chargePower * (dt / 1000)) / 3600; // W * s -> Wh
        const newSoc = clamp(soc + deltaWh / battCapWh, 0, 1);
        P_batt = -(newSoc > soc ? Math.min(chargePower, surplus) : 0); // negative => charging
        soc = newSoc;
      } else if (surplus < -1) {
        // need to discharge battery to support load if allowed
        const deficit = -surplus; // W needed
        // available discharge power is limited by SOC and dischargeEff
        const availWh = soc * battCapWh;
        const availW = (availWh * 3600) / Math.max(1, dt / 1000); // rough conversion (avoid division by zero)
        const dischargePower = Math.min(deficit / batteryConfig.dischargeEff, availW);
        // SOC change
        const deltaWh = (dischargePower * (dt / 1000)) / 3600;
        const newSoc = clamp(soc - deltaWh / battCapWh, 0, 1);
        P_batt = (newSoc < soc ? Math.min(dischargePower, deficit) : 0); // positive => delivering
        soc = newSoc;
      }

      // if grid allowed, small remainder may be taken/given to grid (we don't model grid injection in detail)
      const P_grid = gridAllowed ? (P_gen_ac + (P_batt > 0 ? P_batt : 0) - P_load) : 0;

      // update refs
      socRef.current = soc;
      busVoltageRef.current = 230 + 6 * Math.sin(tSeconds / 7); // small voltage variation for visual

      // push history sample
      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({
          t: lastT + 1,
          P_gen: round(P_gen_ac, 3),
          P_pv: round(P_pv * inverterEff, 3),
          P_wind: round(P_wind * inverterEff, 3),
          P_load: round(P_load, 3),
          P_batt: round(P_batt, 3),
          soc: round(soc, 4),
          V_bus: round(busVoltageRef.current, 2),
          env: { irradiance, windSpeed },
          tSeconds: Math.floor(tSeconds),
          P_grid: round(P_grid, 3),
        });
        if (next.length > 1440) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    running,
    timestep,
    simType,
    solarConfig,
    windConfig,
    batteryConfig,
    loadWatts,
    gridAllowed,
    pvPowerFromIrradiance,
    windTurbineOutput,
    sampleEnvironment,
  ]);

  // summary derived values
  const latest = history.length ? history[history.length - 1] : null;

  return { history, latest, socRef };
}

/* ============================
   Visualizer SVG for Energy System
   - Animated flows for PV array, wind turbine, battery, load and grid
   - Counts/speeds derived from power magnitudes (so it's not static)
   ============================ */
function EnergyVisualizerSVG({ simType, history = [], running, selectedAsset = "system" }) {
  const latest = history.length ? history[history.length - 1] : { P_gen: 0, P_load: 0, P_batt: 0, soc: 0, env: { irradiance: 0, windSpeed: 0 }, P_grid: 0 };
  const P_gen = latest.P_gen || 0;
  const P_load = latest.P_load || 0;
  const P_batt = latest.P_batt || 0;
  const soc = latest.soc || 0;
  const P_grid = latest.P_grid || 0;
  const irradiance = latest.env?.irradiance ?? 0;
  const windSpeed = latest.env?.windSpeed ?? 0;

  // scale flows into visual metrics
  const norm = (x, cap = 5000) => clamp(Math.abs(x) / cap, 0, 1); // maps W to 0..1 relative
  const genIntensity = norm(P_gen, 4000);
  const loadIntensity = norm(P_load, 2000);
  const battIntensity = norm(P_batt, 2000);
  const gridIntensity = norm(P_grid, 4000);

  const dotCountGen = clamp(Math.round(4 + genIntensity * 18), 4, 28);
  const dotCountLoad = clamp(Math.round(4 + loadIntensity * 14), 4, 20);
  const dotCountBatt = clamp(Math.round(2 + battIntensity * 12), 2, 16);
  const dotCountGrid = clamp(Math.round(2 + gridIntensity * 12), 2, 16);

  const speedGen = clamp(1.8 / (genIntensity + 0.05), 0.3, 3.2);
  const speedLoad = clamp(1.6 / (loadIntensity + 0.05), 0.3, 3.2);

  // responsive layout
  const width = Math.max(980, 1100);
  const height = 360;

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start flex-col md:flex-row justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Energy Visualizer</div>
            <div className="text-xs text-zinc-400">Real-time • PV / Wind • Battery • Grid</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Generation: <span className="text-[#ffd24a] ml-1">{round(P_gen, 2)} W</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Load: <span className="text-[#00ffbf] ml-1">{round(P_load, 0)} W</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Battery SOC: <span className="text-[#ff9a4a] ml-1">{Math.round(soc * 100)}%</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* left: PV & wind cluster */}
          <g transform="translate(60,60)">
            {/* PV box */}
            <g transform="translate(0,0)">
              <rect x="-10" y="-10" width="120" height="60" rx="10" fill="#060606" stroke="#222" />
              <text x="6" y="8" fontSize="12" fill="#ffd24a">PV Array</text>
              <text x="6" y="24" fontSize="11" fill="#fff">{`Irr: ${irradiance} W/m²`}</text>
              <rect x="6" y="32" width="108" height="8" rx="4" fill="#ffb86b" opacity={0.9} />
            </g>

            {/* Wind box */}
            <g transform="translate(0,90)">
              <rect x="-10" y="-10" width="120" height="60" rx="10" fill="#060606" stroke="#222" />
              <text x="6" y="8" fontSize="12" fill="#ff9a4a">Wind Turbine</text>
              <text x="6" y="24" fontSize="11" fill="#fff">{`Speed: ${windSpeed} m/s`}</text>
              <rect x="6" y="32" width="108" height="8" rx="4" fill="#ff6a9a" opacity={0.95} />
            </g>
          </g>

          {/* pipe to central inverter / bus */}
          <path d={`M 180 80 H 320`} stroke="#111" strokeWidth="8" strokeLinecap="round" />
          <text x="240" y="72" fontSize="11" fill="#ffd24a">AC Bus</text>

          {/* battery block */}
          <g transform="translate(720,40)">
            <rect x="-70" y="-30" width="140" height="80" rx="12" fill="#060606" stroke="#222" />
            <text x="-30" y="-8" fontSize="12" fill="#ffd24a">Battery</text>
            <text x="-30" y="10" fontSize="11" fill="#fff">{`SOC: ${Math.round(soc * 100)}%`}</text>
            <rect x="-50" y="18" width={Math.max(8, Math.min(100, Math.round(soc * 100)))} height="8" rx="4" fill="#00ffbf" />
          </g>

          {/* load block */}
          <g transform="translate(480,200)">
            <rect x="-60" y="-30" width="160" height="60" rx="10" fill="#060606" stroke="#222" />
            <text x="-46" y="-6" fontSize="12" fill="#ffd24a">Load</text>
            <text x="-46" y="10" fontSize="11" fill="#fff">{`Demand: ${round(P_load, 0)} W`}</text>
          </g>

          {/* grid connection */}
          <g transform="translate(480,20)">
            <rect x="-48" y="-18" width="96" height="36" rx="8" fill="#060606" stroke="#222" />
            <text x="-36" y="-2" fontSize="11" fill="#ff9a4a">Grid</text>
            <text x="-36" y="12" fontSize="11" fill="#fff">{`Net: ${round(P_grid, 0)} W`}</text>
          </g>

          {/* animated dots for generation→bus */}
          {Array.from({ length: dotCountGen }).map((_, i) => {
            const pathStr = `M 180 80 H 320`; // generation→bus
            const delay = (i / dotCountGen) * speedGen;
            const style = {
              offsetPath: `path('${pathStr}')`,
              animationName: "flowGen",
              animationDuration: `${speedGen}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
              transformOrigin: "0 0",
            };
            return <circle key={`gdot-${i}`} r="4" fill="#ffd24a" style={style} />;
          })}

          {/* bus→load animated */}
          {Array.from({ length: dotCountLoad }).map((_, i) => {
            const pathStr = `M 320 80 H 480 V 200`; // bus to load
            const delay = (i / dotCountLoad) * speedLoad;
            const style = {
              offsetPath: `path('${pathStr}')`,
              animationName: "flowLoad",
              animationDuration: `${speedLoad}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
              transformOrigin: "0 0",
            };
            return <circle key={`ldot-${i}`} r="4" fill="#00ffbf" style={style} />;
          })}

          {/* battery animated dots (charge/discharge) */}
          {Array.from({ length: dotCountBatt }).map((_, i) => {
            const charging = P_batt < 0;
            const pathStr = charging ? `M 320 80 H 720` : `M 720 80 H 480 V 200`; // direction changes
            const delay = (i / dotCountBatt) * 1.6;
            const style = {
              offsetPath: `path('${pathStr}')`,
              animationName: charging ? "flowCharge" : "flowDischarge",
              animationDuration: `${1.6}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
              transformOrigin: "0 0",
            };
            const color = charging ? "#ff9a4a" : "#ffd24a";
            return <circle key={`bdot-${i}`} r="3.6" fill={color} style={style} />;
          })}

          {/* small readout box */}
          <g transform={`translate(${width - 160},40)`}>
            <rect x="-80" y="-36" width="160" height="140" rx="10" fill="#060606" stroke="#222" />
            <text x="-70" y="-12" fontSize="12" fill="#ffb57a">Readouts</text>

            <text x="-70" y="8" fontSize="12" fill="#fff">Gen: <tspan fill="#ffd24a">{round(P_gen, 2)} W</tspan></text>
            <text x="-70" y="30" fontSize="12" fill="#fff">Load: <tspan fill="#00ffbf">{round(P_load, 0)} W</tspan></text>
            <text x="-70" y="52" fontSize="12" fill="#fff">Battery: <tspan fill="#ff9a4a">{round(P_batt, 2)} W</tspan></text>
            <text x="-70" y="74" fontSize="12" fill="#fff">Grid: <tspan fill="#9ee6ff">{round(P_grid, 2)} W</tspan></text>
          </g>

          <style>{`
            @keyframes flowGen {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }
            @keyframes flowLoad {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(-6px,6px) scale(0.82); }
            }
            @keyframes flowCharge {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.9); }
              50% { opacity: 1; transform: translate(0,0) scale(1.02); }
              100% { offset-distance: 100%; opacity: 0; }
            }
            @keyframes flowDischarge {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(2px,-2px) scale(0.95); }
              50% { opacity: 1; transform: translate(0,0) scale(1.02); }
              100% { offset-distance: 100%; opacity: 0; }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) {
              text { font-size: 9px; }
            }
          `}</style>
        </svg>
      </div>
    </div>
  );
}

/* ============================
   Oscilloscope (Generation, Load, Battery)
   - plots last N points for P_gen, P_load, P_batt, P_grid
   ============================ */
function EnergyOscilloscope({ history = [], running }) {
  const data = history.slice(-480).map((d, idx) => ({
    t: idx,
    P_gen: round(d.P_gen, 2),
    P_load: round(d.P_load, 2),
    P_batt: round(d.P_batt, 2),
    P_grid: round(d.P_grid, 2),
  }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Energy Oscilloscope — Generation, Load, Battery</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="P_gen" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Generation (W)" />
            <Line type="monotone" dataKey="P_load" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Load (W)" />
            <Line type="monotone" dataKey="P_batt" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Battery (W)" />
            <Line type="monotone" dataKey="P_grid" stroke="#9ee6ff" strokeWidth={2} dot={false} isAnimationActive={false} name="Grid (W)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page Component
   ============================ */
export default function EnergySimulatorPage() {
  // state
  const [simType, setSimType] = useState("hybrid");
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // configs state (controlled inputs)
  const [solarConfig, setSolarConfig] = useState({ panelWp: 350, tiltFactor: 1.0, efficiency: 0.20, irradiance: 800 });
  const [windConfig, setWindConfig] = useState({ ratedPower: 2000, cutIn: 3.5, ratedSpeed: 12, cutOut: 25, rotorArea: 30 });
  const [batteryConfig, setBatteryConfig] = useState({ capacity_kWh: 10, soc: 0.5, chargeEff: 0.95, dischargeEff: 0.95 });
  const [loadWatts, setLoadWatts] = useState(500);
  const [gridAllowed, setGridAllowed] = useState(true);

  const { history, latest, socRef } = useEnergySim({
    running,
    timestep: 120,
    simType,
    solarConfig,
    windConfig,
    batteryConfig,
    loadWatts,
    gridAllowed,
  });

  const totalGen = latest ? latest.P_gen : 0;
  const P_load = latest ? latest.P_load : loadWatts;
  const P_batt = latest ? latest.P_batt : 0;
  const soc = latest ? latest.soc : batteryConfig.soc;

  /* ---------------------------
     Mutators and helpers
     --------------------------- */
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setSimType("hybrid");
    setSolarConfig({ panelWp: 350, tiltFactor: 1.0, efficiency: 0.20, irradiance: 800 });
    setWindConfig({ ratedPower: 2000, cutIn: 3.5, ratedSpeed: 12, cutOut: 25, rotorArea: 30 });
    setBatteryConfig({ capacity_kWh: 10, soc: 0.5, chargeEff: 0.95, dischargeEff: 0.95 });
    setLoadWatts(500);
    setGridAllowed(true);
    toast("Reset to defaults");
  };

  const exportCSV = () => {
    const rows = [
      ["t", "tSeconds", "P_gen", "P_pv", "P_wind", "P_load", "P_batt", "SOC", "V_bus", "irradiance", "windSpeed", "P_grid"],
      ...history.map((d) => [
        d.t,
        d.tSeconds || 0,
        d.P_gen,
        d.P_pv,
        d.P_wind,
        d.P_load,
        d.P_batt,
        d.soc,
        d.V_bus,
        d.env?.irradiance ?? "",
        d.env?.windSpeed ?? "",
        d.P_grid,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `energy-sim-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  /* ---------------------------
     UI render
     --------------------------- */
  return (
    <div className="min-h-screen bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.22)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.36 }}
              className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Renewable Energy Simulator</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-44">
                <Select value={simType} onValueChange={(v) => setSimType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="solar" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Solar</SelectItem>
                    <SelectItem value="wind" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Wind</SelectItem>
                    <SelectItem value="hybrid" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={() => toast.success("Snapshot saved")} title="Save Snapshot">Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning} aria-label="Play / Pause" title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={resetDefaults} aria-label="Reset" title="Reset Defaults">
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="w-28 sm:w-36 md:w-44">
                  <Select value={simType} onValueChange={(v) => setSimType(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="solar" className="text-white hover:bg-orange-500/20">Solar</SelectItem>
                      <SelectItem value="wind" className="text-white hover:bg-orange-500/20">Wind</SelectItem>
                      <SelectItem value="hybrid" className="text-white hover:bg-orange-500/20">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Run"}</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={resetDefaults}>Reset</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16"></div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden w-full max-w-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Simulator</div>
                        <div className="text-xs text-zinc-400">Solar • Wind • Hybrid • Battery</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">
                    {/* Solar config */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-zinc-400">Solar Panel (Wp)</div>
                        <div className="text-xs text-zinc-400">Tilt & Efficiency</div>
                      </div>
                      <div className="flex gap-2">
                        <Input value={solarConfig.panelWp} onChange={(e) => setSolarConfig((s) => ({ ...s, panelWp: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <Input value={solarConfig.tiltFactor} onChange={(e) => setSolarConfig((s) => ({ ...s, tiltFactor: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <Input value={solarConfig.efficiency} onChange={(e) => setSolarConfig((s) => ({ ...s, efficiency: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div className="text-xs text-zinc-500">PanelWp × irradiance fraction × tilt × eff → gross DC output</div>
                    </div>

                    {/* Wind config */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-zinc-400">Wind Rated Power (W)</div>
                        <div className="text-xs text-zinc-400">Rotor area (m²)</div>
                      </div>
                      <div className="flex gap-2">
                        <Input value={windConfig.ratedPower} onChange={(e) => setWindConfig((s) => ({ ...s, ratedPower: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <Input value={windConfig.rotorArea} onChange={(e) => setWindConfig((s) => ({ ...s, rotorArea: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div className="text-xs text-zinc-500">Simple cubic wind power model applied; rated values cap output</div>
                    </div>

                    {/* Battery config */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-zinc-400">Battery (kWh)</div>
                        <div className="text-xs text-zinc-400">SOC / Eff</div>
                      </div>
                      <div className="flex gap-2">
                        <Input value={batteryConfig.capacity_kWh} onChange={(e) => setBatteryConfig((s) => ({ ...s, capacity_kWh: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <Input value={batteryConfig.soc} onChange={(e) => setBatteryConfig((s) => ({ ...s, soc: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <Input value={batteryConfig.chargeEff} onChange={(e) => setBatteryConfig((s) => ({ ...s, chargeEff: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div className="text-xs text-zinc-500">Battery will absorb surplus and discharge for deficits (simple logic)</div>
                    </div>

                    {/* load and grid */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-zinc-400">Load (W)</label>
                        <Input value={loadWatts} onChange={(e) => setLoadWatts(Number(e.target.value))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div className="w-36">
                        <label className="text-xs text-zinc-400">Grid Allowed</label>
                        <Select value={gridAllowed ? "yes" : "no"} onValueChange={(v) => setGridAllowed(v === "yes")}>
                          <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm">
                            <SelectValue placeholder="Grid" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                            <SelectItem value="yes" className="text-white">Yes</SelectItem>
                            <SelectItem value="no" className="text-white">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2 justify-between">
                    <div className="flex gap-2">
                      <Button className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Visual + Oscilloscope */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <CircuitIcon simType={simType} />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated flows • battery • grid • oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{simType}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Gen: <span className="text-[#ffd24a] ml-1">{round(totalGen, 1)} W</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Load: <span className="text-[#00ffbf] ml-1">{round(P_load, 0)} W</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <EnergyVisualizerSVG simType={simType} history={history} running={running} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <EnergyOscilloscope history={history} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Gauge className="w-5 h-5 " /> Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Total Generation</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(totalGen, 1)} W</div>
                      <div className="text-xs text-zinc-400 mt-1">AC after inverter</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Battery SOC</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{Math.round(soc * 100)}%</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Battery Power</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{round(P_batt, 1)} W</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Load</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(P_load, 0)} W</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Irradiance</div>
                      <div className="text-lg font-semibold text-[#9ee6ff]">{latest?.env?.irradiance ?? "—"}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Wind Speed</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{latest?.env?.windSpeed ?? "—"} m/s</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb /></span>
                    <span>
                      Tip: Use Hybrid for combined PV + Wind behavior. Battery automatically stores surplus and discharges for deficits in this simple demo.
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* mobile sticky controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2 cursor-pointer" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================
   Small helper: CircuitIcon (switch icon by simType)
   ============================ */
function CircuitIcon({ simType }) {
  if (simType === "solar") return <Sun className="w-5 h-5 text-black" />;
  if (simType === "wind") return <Wind className="w-5 h-5 text-black" />;
  return <PlugZap className="w-5 h-5 text-black" />;
}
