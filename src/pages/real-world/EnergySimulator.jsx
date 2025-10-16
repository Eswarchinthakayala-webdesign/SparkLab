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


 function EnergyVisualizerSVG({
  simType,
  history = [],
  running,
  selectedAsset = "system",
}) {
  const latest = history.length
    ? history[history.length - 1]
    : {
        P_gen: 0,
        P_load: 0,
        P_batt: 0,
        soc: 0,
        env: { irradiance: 0, windSpeed: 0 },
        P_grid: 0,
      };

  const P_gen = latest.P_gen || 0;
  const P_load = latest.P_load || 0;
  const P_batt = latest.P_batt || 0;
  const soc = latest.soc || 0;
  const P_grid = latest.P_grid || 0;
  const irradiance = latest.env?.irradiance ?? 0;
  const windSpeed = latest.env?.windSpeed ?? 0;

  const norm = (x, cap = 5000) => clamp(Math.abs(x) / cap, 0, 1);
  const genIntensity = norm(P_gen, 4000);
  const loadIntensity = norm(P_load, 2000);
  const battIntensity = norm(P_batt, 2000);

  const dotCountGen = clamp(Math.round(6 + genIntensity * 18), 4, 28);
  const dotCountLoad = clamp(Math.round(4 + loadIntensity * 16), 4, 22);
  const dotCountBatt = clamp(Math.round(2 + battIntensity * 14), 2, 16);

  const speedGen = clamp(1.8 / (genIntensity + 0.05), 0.3, 3.2);
  const speedLoad = clamp(1.4 / (loadIntensity + 0.05), 0.3, 3.2);

  const width = 1100;
  const height = 400;

  // orange theme tones
  const solarColor = "#ffb84a";
  const windColor = "#ff8c33";
  const batteryColor = "#ffaa33";
  const gridColor = "#ff6a00";

  return (
    <motion.div
      className="w-full rounded-2xl p-4 bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#000000] border border-[#1a1a1a] shadow-[0_0_35px_rgba(255,153,51,0.08)] backdrop-blur-lg overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <motion.div
            className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff8a00] to-[#ffcc33] flex items-center justify-center shadow-lg"
            animate={{
              boxShadow: [
                "0 0 10px #ffb84a",
                "0 0 18px #ff9933",
                "0 0 10px #ffb84a",
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, repeatType: "mirror" }}
          >
            <Activity className="w-6 h-6 text-black" />
          </motion.div>
          <div>
            <div className="text-lg font-semibold text-[#ffcc66]">
              Renewable Energy Simulator
            </div>
            <div className="text-xs text-zinc-400">
              Solar • Wind • Battery • Grid
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <Badge className="bg-black/40 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">
            Gen:{" "}
            <span className="text-[#ffcc33] ml-1">{round(P_gen, 2)} W</span>
          </Badge>
          <Badge className="bg-black/40 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">
            Load:{" "}
            <span className="text-[#ff9933] ml-1">{round(P_load, 0)} W</span>
          </Badge>
          <Badge className="bg-black/40 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">
            SOC:{" "}
            <span className="text-[#ffaa33] ml-1">
              {Math.round(soc * 100)}%
            </span>
          </Badge>
        </div>
      </div>

      {/* SVG */}
      <div className="mt-3 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-72"
        >
          {/* background */}
          <defs>
            <linearGradient id="duskSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2b1b00" />
              <stop offset="70%" stopColor="#0a0500" />
              <stop offset="100%" stopColor="#000000" />
            </linearGradient>
            <radialGradient id="sunGlow" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#ffcc33" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ff6600" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect x="0" y="0" width={width} height={height} fill="url(#duskSky)" />

          {/* Sun */}
          <motion.circle
            cx={useMemo(() => 160 + genIntensity * 180, [genIntensity])}
            cy={useMemo(() => 70 + (1 - genIntensity) * 60, [genIntensity])}
            r="28"
            fill="url(#sunGlow)"
            animate={{ opacity: [0.8, 1, 0.8], scale: [1, 1.06, 1] }}
            transition={{ duration: 3, repeat: Infinity }}
          />

          {/* Solar Panels */}
          <g transform="translate(100,260)">
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(${i * 60},0)`}>
                <rect
                  x="0"
                  y="0"
                  width="50"
                  height="25"
                  rx="4"
                  fill="#0c0c0c"
                  stroke="#332200"
                />
                <motion.rect
                  x="0"
                  y="0"
                  width="50"
                  height="25"
                  rx="4"
                  fill={solarColor}
                  fillOpacity={0.1 + genIntensity * 0.4}
                  animate={{ opacity: [0.2, 0.7, 0.2] }}
                  transition={{ duration: 2 + i, repeat: Infinity }}
                />
              </g>
            ))}
            <text
              x="20"
              y="45"
              fontSize="11"
              fill="#ffcc66"
              opacity="0.8"
            >{`Irr: ${irradiance} W/m²`}</text>
          </g>

          {/* Wind Turbine */}
          <g transform="translate(340,180)">
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="80"
              stroke="#3a2a1a"
              strokeWidth="3"
            />
            <motion.g
              animate={{ rotate: 360 }}
              transition={{
                repeat: Infinity,
                ease: "linear",
                duration: clamp(8 / (windSpeed + 0.5), 1, 10),
              }}
            >
              {[0, 120, 240].map((a, i) => (
                <polygon
                  key={i}
                  points="0,-8 80,0 0,8"
                  fill={windColor}
                  fillOpacity="0.75"
                  transform={`rotate(${a})`}
                  style={{
                    filter: `drop-shadow(0 0 6px ${windColor})`,
                  }}
                />
              ))}
            </motion.g>
            <text x="-25" y="100" fontSize="11" fill="#ffb84a">{`Wind: ${round(
              windSpeed,
              1
            )} m/s`}</text>
          </g>

          {/* Battery */}
          <g transform="translate(780,200)">
            <rect
              x="-50"
              y="-40"
              width="100"
              height="80"
              rx="10"
              fill="#090909"
              stroke="#332200"
            />
            <rect
              x="-40"
              y="10"
              width={Math.max(5, Math.min(80, soc * 80))}
              height="10"
              rx="4"
              fill={batteryColor}
              style={{
                filter: `drop-shadow(0 0 6px ${batteryColor})`,
              }}
            />
            <text x="-28" y="-10" fontSize="11" fill="#ffcc66">
              Battery
            </text>
            <text x="-28" y="0" fontSize="10" fill={batteryColor}>
              {Math.round(soc * 100)}%
            </text>
          </g>

          {/* Flow paths */}
          <path
            id="solarFlow"
            d="M 250 260 C 280 240, 360 200, 500 220"
            stroke={solarColor}
            strokeWidth="2"
            strokeOpacity="0.2"
            fill="none"
          />
          <path
            id="windFlow"
            d="M 360 180 C 400 180, 460 200, 500 220"
            stroke={windColor}
            strokeWidth="2"
            strokeOpacity="0.25"
            fill="none"
          />
          <path
            id="battFlow"
            d="M 500 220 C 600 220, 720 200, 780 200"
            stroke={batteryColor}
            strokeWidth="2"
            strokeOpacity="0.25"
            fill="none"
          />

          {/* Animated dots */}
          {[...Array(dotCountGen)].map((_, i) => {
            const delay = (i / dotCountGen) * speedGen;
            return (
              <circle
                key={`s${i}`}
                r="4"
                fill={solarColor}
                style={{
                  offsetPath:
                    "path('M 250 260 C 280 240, 360 200, 500 220')",
                  animation: `flow ${speedGen}s linear ${-delay}s infinite`,
                }}
              />
            );
          })}
          {[...Array(dotCountLoad)].map((_, i) => {
            const delay = (i / dotCountLoad) * speedLoad;
            return (
              <circle
                key={`w${i}`}
                r="3.5"
                fill={windColor}
                style={{
                  offsetPath:
                    "path('M 360 180 C 400 180, 460 200, 500 220')",
                  animation: `flow ${speedLoad}s linear ${-delay}s infinite`,
                }}
              />
            );
          })}
          {[...Array(dotCountBatt)].map((_, i) => {
            const delay = (i / dotCountBatt) * 1.5;
            return (
              <circle
                key={`b${i}`}
                r="3.5"
                fill={batteryColor}
                style={{
                  offsetPath:
                    "path('M 500 220 C 600 220, 720 200, 780 200')",
                  animation: `flow 1.5s linear ${-delay}s infinite`,
                }}
              />
            );
          })}

          {/* Info Panel */}
          <g transform={`translate(${width - 240},80)`}>
            <rect
              x="0"
              y="0"
              width="200"
              height="140"
              rx="10"
              fill="#1a0f00aa"
              stroke="#332200"
            />
            <text x="20" y="26" fontSize="12" fill="#ffcc66">
              Solar: {round(irradiance, 1)} W/m²
            </text>
            <text x="20" y="50" fontSize="12" fill="#ffb84a">
              Wind: {round(windSpeed, 1)} m/s
            </text>
            <text x="20" y="74" fontSize="12" fill="#ffaa33">
              Gen: {round(P_gen, 2)} W
            </text>
            <text x="20" y="98" fontSize="12" fill="#ff9933">
              Load: {round(P_load, 0)} W
            </text>
            <text x="20" y="122" fontSize="12" fill="#ffcc66">
              Grid: {round(P_grid, 2)} W
            </text>
          </g>

          <style>{`
            @keyframes flow {
              0% { offset-distance: 0%; opacity: 1; transform: scale(0.9); }
              50% { opacity: 0.9; transform: scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: scale(0.9); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) {
              text { font-size: 9px; }
            }
          `}</style>
        </svg>
      </div>
    </motion.div>
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
    <div className="min-h-screen pb-20 bg-[#05060a]
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
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <Card className="bg-gradient-to-br from-zinc-950/90 to-black/80 border border-zinc-800/70 rounded-2xl shadow-xl overflow-hidden w-full max-w-full">
          <CardHeader className="border-b border-zinc-800/60 bg-black/30">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <Activity className="w-5 h-5 text-black" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-[#ffd24a]">
                    Energy Simulator
                  </div>
                  <div className="text-xs text-zinc-400">
                    Solar • Wind • Hybrid • Battery
                  </div>
                </div>
              </div>

              <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">
                Live Mode
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6 p-5">
            {/* Solar Config */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Sun className="w-4 h-4 text-[#ffb84a]" /> <span>Solar Configuration</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  value={solarConfig.panelWp}
                  onChange={(e) =>
                    setSolarConfig((s) => ({
                      ...s,
                      panelWp: Number(e.target.value),
                    }))
                  }
                  type="number"
                  placeholder="Panel Wp"
                  className="bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500"
                />
                <Input
                  value={solarConfig.tiltFactor}
                  onChange={(e) =>
                    setSolarConfig((s) => ({
                      ...s,
                      tiltFactor: Number(e.target.value),
                    }))
                  }
                  type="number"
                  placeholder="Tilt Factor"
                  className="bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500"
                />
                <Input
                  value={solarConfig.efficiency}
                  onChange={(e) =>
                    setSolarConfig((s) => ({
                      ...s,
                      efficiency: Number(e.target.value),
                    }))
                  }
                  type="number"
                  placeholder="Efficiency"
                  className="bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500"
                />
              </div>
              <p className="text-xs text-zinc-500">
                Calculates: <span className="text-zinc-400">Panel Wp × irradiance × tilt × eff → DC output</span>
              </p>
            </div>

            {/* Wind Config */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Wind className="w-4 h-4 text-[#ff7a2d]" /> <span>Wind Configuration</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  value={windConfig.ratedPower}
                  onChange={(e) =>
                    setWindConfig((s) => ({
                      ...s,
                      ratedPower: Number(e.target.value),
                    }))
                  }
                  type="number"
                  placeholder="Rated Power (W)"
                  className="bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500"
                />
                <Input
                  value={windConfig.rotorArea}
                  onChange={(e) =>
                    setWindConfig((s) => ({
                      ...s,
                      rotorArea: Number(e.target.value),
                    }))
                  }
                  type="number"
                  placeholder="Rotor Area (m²)"
                  className="bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500"
                />
              </div>
              <p className="text-xs text-zinc-500">
                Wind power model uses cubic velocity relation; rated values cap output.
              </p>
            </div>

            {/* Battery Config */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Battery className="w-4 h-4 text-[#ffd24a]" /> <span>Battery Configuration</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  value={batteryConfig.capacity_kWh}
                  onChange={(e) =>
                    setBatteryConfig((s) => ({
                      ...s,
                      capacity_kWh: Number(e.target.value),
                    }))
                  }
                  type="number"
                  placeholder="Capacity (kWh)"
                  className="bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500"
                />
                <Input
                  value={batteryConfig.soc}
                  onChange={(e) =>
                    setBatteryConfig((s) => ({
                      ...s,
                      soc: Number(e.target.value),
                    }))
                  }
                  type="number"
                  placeholder="SOC (%)"
                  className="bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500"
                />
                <Input
                  value={batteryConfig.chargeEff}
                  onChange={(e) =>
                    setBatteryConfig((s) => ({
                      ...s,
                      chargeEff: Number(e.target.value),
                    }))
                  }
                  type="number"
                  placeholder="Charge Eff (%)"
                  className="bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500"
                />
              </div>
              <p className="text-xs text-zinc-500">
                Battery auto-balances energy — stores surplus, discharges during deficit.
              </p>
            </div>

            {/* Load + Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                  <PlugZap className="w-4 h-4 text-[#ff7a2d]" /> Load (W)
                </label>
                <Input
                  value={loadWatts}
                  onChange={(e) => setLoadWatts(Number(e.target.value))}
                  type="number"
                  placeholder="Load watts"
                  className="bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                  <PlugZap className="w-4 h-4 text-[#ffd24a]" /> Grid Allowed
                </label>
                <Select
                  value={gridAllowed ? "yes" : "no"}
                  onValueChange={(v) => setGridAllowed(v === "yes")}
                >
                  <SelectTrigger className="w-full bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm cursor-pointer focus:ring-1 focus:ring-[#ff7a2d]">
                    <SelectValue placeholder="Grid" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="yes" className="text-white">
                      Yes
                    </SelectItem>
                    <SelectItem value="no" className="text-white">
                      No
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4 border-t border-zinc-800/70">
              <div className="flex gap-2">
                <Button
                  className="flex items-center gap-2 cursor-pointer px-4 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] hover:scale-[1.02] transition-transform"
                  onClick={() => setRunning(true)}
                >
                  <Play className="w-4 h-4" /> Run
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 px-4 py-2 border-zinc-700 text-orange-300 hover:text-orange-400 cursor-pointer hover:bg-zinc-800/50"
                  onClick={() => setRunning(false)}
                >
                  <Pause className="w-4 h-4" /> Pause
                </Button>
              </div>

              <Button
                variant="ghost"
                className="flex items-center gap-2 border cursor-pointer border-zinc-800 text-zinc-300 p-2 hover:text-orange-500"
                onClick={exportCSV}
              >
                <Download className="w-4 h-4" /> Export CSV
              </Button>
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
