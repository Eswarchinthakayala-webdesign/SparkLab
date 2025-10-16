// src/pages/InverterSizingPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Sun,
  Battery,
  Zap,
  Activity,
  Play,
  Pause,
  Download,
  Settings,

  Gauge,
  Menu,
  X,
  Lightbulb,
  Settings2 as Tool,
  Bolt
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
   Inverter Simulation Hook
   - Simulates PV input, battery SOC, inverter output power & surge
   - Produces history for plotting and values for visualizer
   ============================ */
function useInverterSim({
  running,
  timestep = 120,
  systemVoltage = 48,
  pvArray = { Vmp: 36, Isc: 8, panels: 4 }, // simplified PV array model
  batteryBank = { capacityAh: 200, voltage: 48, SoC: 0.8 },
  inverter = { efficiency: 0.92, continuousVA: 3000, surgeVA: 6000, type: "pure" },
  load = { continuousW: 1500, surgeW: 4000 },
  chargeControllerEff = 0.95,
}) {
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, Ppv: 0, Ibatt: 0, Pload: 0, SoC: batteryBank.SoC })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // derived pv power (simple Vmp*Isc*panels*irradiance factor * temp factor)
  const computePVPower = useCallback((irradiance = 1.0) => {
    const { Vmp, Isc, panels } = pvArray;
    // approximate MPP power per panel = Vmp * Isc * 0.85 (fill factor)
    const perPanel = Vmp * Isc * 0.85;
    const raw = perPanel * panels * irradiance;
    const usable = raw * chargeControllerEff * inverter.efficiency;
    return Math.max(0, usable);
  }, [pvArray, chargeControllerEff, inverter.efficiency]);

  const computeBatteryCurrent = useCallback((powerFromPV, loadPower, batVoltage, soc) => {
    // Positive Ibatt means charging, negative means discharging
    // Net power to/from battery = powerFromPV - loadPower (if positive -> charging, else -> discharge)
    const net = powerFromPV - loadPower;
    // Include inverter and battery efficiency
    const netAfterEff = net * (net >= 0 ? 0.98 : 0.95);
    const I = netAfterEff / Math.max(1e-6, batVoltage);
    // limit to some charge/discharge C-rate safe bounds (example: 0.2C charge/discharge)
    const maxC = 0.5; // allow up to 0.5C short bursts for simulation purposes
    const maxI = (batteryBank.capacityAh * maxC);
    return clamp(I, -maxI, maxI);
  }, [batteryBank.capacityAh]);

  // single-step update function
  const stepCompute = useCallback((tSeconds, state) => {
    // irradiance as a simple function of time-of-sim: sinusoidal day curve
    // tSeconds cycles every 30s in UI to show day/night quickly
    const cycle = (tSeconds % 30) / 30; // 0..1
    const irradiance = Math.max(0, Math.sin(Math.PI * cycle)); // 0..1
    const Ppv = computePVPower(irradiance);
    const Pload = load.continuousW; // assume constant continuous load for now
    const Ibatt = computeBatteryCurrent(Ppv, Pload, systemVoltage, state.SoC);
    // update SoC: deltaAh = I (A) * dt(h)
    const dtHours = timestep / 1000 / 3600;
    const dAh = Ibatt * dtHours; // positive means battery gaining Ah
    const newAh = clamp(state.SoC * batteryBank.capacityAh + dAh, 0, batteryBank.capacityAh);
    const newSoC = newAh / batteryBank.capacityAh;
    // compute inverter loading & headroom
    const PoutAvailable = Ppv + (Ibatt > 0 ? 0 : Math.abs(Ibatt) * systemVoltage); // PV + battery discharge
    const inverterLoadFactor = clamp(Pload / Math.max(1, inverter.continuousVA * inverter.efficiency), 0, 2);
    const surgeHeadroom = inverter.surgeVA - (Pload * 1.0);
    return { Ppv, Ibatt, Pload, SoC: newSoC, PoutAvailable, inverterLoadFactor, surgeHeadroom, irradiance };
  }, [computePVPower, computeBatteryCurrent, batteryBank.capacityAh, inverter, load.continuousW, systemVoltage, timestep]);

  // run RAF simulation loop
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

      setHistory((h) => {
        const state = h.length ? h[h.length - 1] : { SoC: batteryBank.SoC };
        const { Ppv, Ibatt, Pload, SoC, PoutAvailable, inverterLoadFactor, surgeHeadroom, irradiance } = stepCompute(tSeconds, state);
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, Ppv, Ibatt, Pload, SoC, PoutAvailable, inverterLoadFactor, surgeHeadroom, irradiance });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, stepCompute, batteryBank.SoC]);

  // return history and some quick computed summaries (memoized)
  const latest = history.length ? history[history.length - 1] : { Ppv: 0, Ibatt: 0, Pload: 0, SoC: batteryBank.SoC };

  const recommendations = useMemo(() => {
    // Suggest inverter sizing: round up continuous load with safety margin
    const cont = Math.max(1, latest.Pload);
    const recommendationVA = Math.ceil((cont / inverter.efficiency) * 1.3 / 100) * 100; // 30% safety, round to 100 VA
    const suggestedSurge = Math.max(inverter.surgeVA, Math.ceil(latest.Pload * 2.0)); // suggest 2x surge if greater
    const batteryAhForAutonomy = (batteryBank.capacityAh * latest.SoC);
    const estimatedAutonomyHours = (batteryAhForAutonomy * systemVoltage) / Math.max(1, latest.Pload) || 0;
    return { recommendationVA, suggestedSurge, estimatedAutonomyHours };
  }, [latest, inverter.efficiency, inverter.surgeVA, batteryBank.capacityAh, systemVoltage]);

  return { history, latest, recommendations };
}

/* ============================
   Visualizer SVG for Inverter
   - Shows PV array -> charge controller -> battery -> inverter -> load
   - Animated dots indicate flow of energy; dot speed/count based on power/current
   ============================ */
function InverterVisualizerSVG({ latest, inverterType, systemVoltage }) {
  const { Ppv = 0, Ibatt = 0, Pload = 0, SoC = 0, PoutAvailable = 0 } = latest || {};
  const absI = Math.abs(Ibatt);
  const dotCount = clamp(Math.round(3 + Math.abs(Ppv) / 500), 3, 30);
  const speed = clamp(1.6 / (absI + 0.01), 0.2, 4.0);

  const svgW = 1100;
  const svgH = 320;
  const left = 80;
  const center = svgW / 2;

  const batteryFill = clamp(SoC, 0, 1);

  const pvLabel = `${round(Ppv, 1)} W`;
  const battLabel = `${round(SoC * 100, 1)} % • ${round(Ibatt, 2)} A`;
  const loadLabel = `${round(Pload, 1)} W`;

  // color mapping
  const pvColor = "#ffb86b";
  const batColor = "#ffd24a";
  const invColor = "#ff7a2d";
  const loadColor = "#ff9a4a";

  // small helper for animated dot style
  const dotStyle = (path) => ({
    offsetPath: `path('${path}')`,
    animationName: "flowInv",
    animationDuration: `${speed}s`,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    transformOrigin: "0 0",
  });

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/35 to-zinc-900/18 border border-zinc-800 overflow-hidden">
      <div className="flex items-start md:flex-row flex-col justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Battery className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Inverter Sizing Visualizer</div>
            <div className="text-xs text-zinc-400">Real-time energy flow • PV ↔ Battery ↔ Inverter ↔ Load</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Type: <span className="text-[#ffd24a] ml-1">{inverterType}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vsys: <span className="text-[#ffd24a] ml-1">{systemVoltage} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">PV: <span className="text-[#00ffbf] ml-1">{pvLabel}</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* PV panels (left) */}
          <g transform={`translate(${left},60)`}>
            <rect x="-10" y="-30" width="120" height="70" rx="8" fill="#060606" stroke="#222" />
            <g transform="translate(0,0)">
              <rect x="2" y="-28" width="116" height="64" rx="6" fill={pvColor} opacity={0.08} />
              <text x="58" y="-6" fontSize="12" fill="#ffd24a" textAnchor="middle">PV Array</text>
              <text x="58" y="12" fontSize="11" fill="#fff" textAnchor="middle">{pvLabel}</text>
            </g>
          </g>

          {/* arrow from PV to charge controller */}
          <path d={`M ${left + 120} 100 H ${center - 160}`} stroke="#111" strokeWidth="4" markerEnd="url(#arrow)" />
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#ffd24a" />
            </marker>
          </defs>

          {/* charge controller box */}
          <g transform={`translate(${center - 130},70)`}>
            <rect x="-36" y="-26" width="160" height="60" rx="10" fill="#060606" stroke="#222" />
            <text x="44" y="-6" fontSize="12" fill="#ffd24a">MPPT Charge Controller</text>
            <text x="44" y="12" fontSize="11" fill="#fff">Efficient harvest + limit</text>
          </g>

          {/* battery (center-left) */}
          <g transform={`translate(${center - 40},170)`}>
            <rect x="-70" y="-46" width="140" height="92" rx="10" fill="#060606" stroke="#222" />
            <rect x="-62" y="-36" width={124} height="72" rx="6" fill="#000000" />
            <rect x="-62" y={22 - 72} width={124 * batteryFill} height="72" rx="6" fill={batColor} opacity={0.95} />
            <text x="-2" y="6" fontSize="12" fill="#ffd24a" textAnchor="middle">Battery</text>
            <text x="-2" y="24" fontSize="11" fill="#fff" textAnchor="middle">{battLabel}</text>
          </g>

          {/* inverter box (center-right) */}
          <g transform={`translate(${center + 200},110)`}>
            <rect x="-80" y="-60" width="160" height="120" rx="14" fill="#060606" stroke="#222" />
            <text x="0" y="-8" fontSize="13" fill="#ffd24a" textAnchor="middle">Inverter</text>
            <text x="0" y="12" fontSize="11" fill="#fff" textAnchor="middle">Converts {systemVoltage} V DC → AC</text>
            <rect x="-44" y="28" width="88" height="6" rx="3" fill={invColor} opacity={0.9} />
          </g>

          {/* load (right) */}
          <g transform={`translate(${svgW - 160},140)`}>
            <rect x="-20" y="-40" width="120" height="80" rx="12" fill="#060606" stroke="#222" />
            <text x="40" y="-6" fontSize="12" fill="#ffd24a">AC Load</text>
            <text x="40" y="12" fontSize="11" fill="#fff">{loadLabel}</text>
          </g>

          {/* animated flow dots: PV -> controller -> battery */}
          {Array.from({ length: dotCount }).map((_, i) => {
            const path = `M ${left + 80} 95 H ${center - 40} V ${170}`;
            const delay = (i / dotCount) * speed;
            const style = {
              ...dotStyle(path),
              animationDelay: `${-delay}s`,
              animationPlayState: "running",
            };
            return <circle key={`pv-dot-${i}`} r="4" fill={pvColor} style={style} />;
          })}

          {/* battery -> inverter -> load dots */}
          {Array.from({ length: Math.max(3, Math.round(dotCount * 0.7)) }).map((_, i) => {
            const path = `M ${center + 20} 170 H ${center + 200} V ${150}`;
            const delay = (i / dotCount) * (speed * 0.9);
            const style = {
              ...dotStyle(path),
              animationDelay: `${-delay}s`,
              animationPlayState: "running",
            };
            return <circle key={`bat-dot-${i}`} r="4" fill={invColor} style={style} />;
          })}

          {/* readout panel */}
          <g transform={`translate(${svgW - 220},20)`}>
            <rect x="-90" y="-20" width="180" height="120" rx="8" fill="#060606" stroke="#222" />
            <text x="-70" y="-2" fontSize="12" fill="#ffb57a">Readouts</text>
            <text x="-70" y="18" fontSize="12" fill="#fff">PV: <tspan fill="#ffd24a">{pvLabel}</tspan></text>
            <text x="-70" y="36" fontSize="12" fill="#fff">Battery: <tspan fill="#00ffbf">{battLabel}</tspan></text>
            <text x="-70" y="54" fontSize="12" fill="#fff">Load: <tspan fill="#ff9a4a">{loadLabel}</tspan></text>
          </g>

          <style>{`
            @keyframes flowInv {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
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
   Oscilloscope for inverter metrics
   - Plots PV power, battery current, load power
   ============================ */
function InverterOscilloscope({ history = [], running }) {
  const data = history.slice(-360).map((d, idx) => ({
    t: idx,
    Ppv: round(d.Ppv || 0, 2),
    Ibatt: round(d.Ibatt || 0, 3),
    Pload: round(d.Pload || 0, 2),
  }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — PV Power, Battery Current, Load Power</div>
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
            <Line type="monotone" dataKey="Ppv" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="PV Power (W)" />
            <Line type="monotone" dataKey="Ibatt" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Battery Current (A)" />
            <Line type="monotone" dataKey="Pload" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Load Power (W)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Inverter Sizing Page
   ============================ */
export default function InverterSizingPage() {
  // UI state
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // system inputs
  const [scenario, setScenario] = useState("offgrid"); // offgrid, grid-tied, backup
  const [inverterType, setInverterType] = useState("pure"); // pure, modified, hybrid
  const [systemVoltage, setSystemVoltage] = useState("48");
  const [pvPanels, setPvPanels] = useState("4");
  const [pvVmp, setPvVmp] = useState("36");
  const [pvIsc, setPvIsc] = useState("8");
  const [batteryAh, setBatteryAh] = useState("200");
  const [batterySoC, setBatterySoC] = useState("0.8");
  const [inverterEff, setInverterEff] = useState("0.92");
  const [inverterVA, setInverterVA] = useState("3000");
  const [inverterSurge, setInverterSurge] = useState("6000");
  const [loadContinuous, setLoadContinuous] = useState("1500");
  const [loadSurge, setLoadSurge] = useState("4000");
  const [chargeControllerEff, setChargeControllerEff] = useState("0.95");

  // prepare objects for sim hook
  const pvArray = useMemo(() => ({ Vmp: toNum(pvVmp) || 36, Isc: toNum(pvIsc) || 8, panels: Math.max(1, Math.round(toNum(pvPanels) || 4)) }), [pvVmp, pvIsc, pvPanels]);
  const batteryBank = useMemo(() => ({ capacityAh: Math.max(1, toNum(batteryAh) || 200), voltage: toNum(systemVoltage) || 48, SoC: clamp(Number(batterySoC), 0, 1) }), [batteryAh, systemVoltage, batterySoC]);
  const inverter = useMemo(() => ({ efficiency: clamp(Number(inverterEff) || 0.92, 0.5, 0.99), continuousVA: Math.max(100, toNum(inverterVA) || 3000), surgeVA: Math.max(0, toNum(inverterSurge) || 6000), type: inverterType }), [inverterEff, inverterVA, inverterSurge, inverterType]);
  const load = useMemo(() => ({ continuousW: Math.max(0, toNum(loadContinuous) || 1500), surgeW: Math.max(0, toNum(loadSurge) || 4000) }), [loadContinuous, loadSurge]);

  // run simulation
  const { history, latest, recommendations } = useInverterSim({
    running,
    timestep: 120,
    systemVoltage: toNum(systemVoltage) || 48,
    pvArray,
    batteryBank,
    inverter,
    load,
    chargeControllerEff: clamp(Number(chargeControllerEff) || 0.95, 0.5, 1),
  });

  // small derived values
  const batteryEnergyWh = batteryBank.capacityAh * batteryBank.voltage;
  const autonomyHours = recommendations.estimatedAutonomyHours || 0;

  // mutators
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setScenario("offgrid");
    setInverterType("pure");
    setSystemVoltage("48");
    setPvPanels("4");
    setPvVmp("36");
    setPvIsc("8");
    setBatteryAh("200");
    setBatterySoC("0.8");
    setInverterEff("0.92");
    setInverterVA("3000");
    setInverterSurge("6000");
    setLoadContinuous("1500");
    setLoadSurge("4000");
    setChargeControllerEff("0.95");
    toast("Reset to defaults");
  };

  const exportCSV = () => {
    const rows = [
      ["t", "Ppv", "Ibatt", "Pload", "SoC", "PoutAvailable", "irradiance"],
      ...history.map((d) => [d.t, round(d.Ppv, 3), round(d.Ibatt, 4), round(d.Pload, 3), round(d.SoC, 4), round(d.PoutAvailable || 0, 3), round(d.irradiance || 0, 3)]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inverter-sizing-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  // computed recommendation string
  const recStr = `Recommend ≥ ${recommendations.recommendationVA} VA (surge ≥ ${recommendations.suggestedSurge} W), autonomy ≈ ${round(autonomyHours, 2)} h`;

  return (
    <div className="min-h-screen bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.22)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Inverter Sizing & Simulation</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-40">
                <Select value={inverterType} onValueChange={(v) => setInverterType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Inverter Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="pure"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Pure Sine</SelectItem>
                    <SelectItem value="modified"      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Modified Sine</SelectItem>
                    <SelectItem value="hybrid"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Hybrid (Grid+Battery)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning} aria-label="Play / Pause" title={running ? "Pause" : "Play"}>{running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={resetDefaults} aria-label="Reset" title="Reset Defaults"><Settings className="w-5 h-5" /></Button>
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
                <div className="w-36">
                  <Select value={inverterType} onValueChange={(v) => setInverterType(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Inverter Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="pure"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Pure Sine</SelectItem>
                      <SelectItem value="modified"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Modified Sine</SelectItem>
                      <SelectItem value="hybrid"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16"></div>

      {/* Main */}
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Inverter Sizing</div>
                        <div className="text-xs text-zinc-400">Design, simulate & visualize</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-xs text-zinc-400">Scenario</label>
                      <Select value={scenario} onValueChange={(v) => setScenario(v)}>
                        <SelectTrigger className="w-full cursor-pointer bg-zinc-900/60 border border-zinc-800 text-white text-sm rounded-md">
                          <SelectValue placeholder="Scenario" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                          <SelectItem value="offgrid"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Off-grid</SelectItem>
                          <SelectItem value="grid"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Grid-tied</SelectItem>
                          <SelectItem value="backup"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Backup</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">System Voltage (V)</label>
                      <Input value={systemVoltage} onChange={(e) => setSystemVoltage(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-zinc-400">PV Panels</label>
                        <Input value={pvPanels} onChange={(e) => setPvPanels(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Vmp per panel (V)</label>
                        <Input value={pvVmp} onChange={(e) => setPvVmp(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Isc per panel (A)</label>
                        <Input value={pvIsc} onChange={(e) => setPvIsc(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Charge Ctrl Eff</label>
                        <Input value={chargeControllerEff} onChange={(e) => setChargeControllerEff(e.target.value)} type="number" step="0.01" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-zinc-400">Battery (Ah)</label>
                        <Input value={batteryAh} onChange={(e) => setBatteryAh(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Battery SoC (0-1)</label>
                        <Input value={batterySoC} onChange={(e) => setBatterySoC(e.target.value)} type="number" step="0.01" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-zinc-400">Inverter Efficiency</label>
                        <Input value={inverterEff} onChange={(e) => setInverterEff(e.target.value)} type="number" step="0.01" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Continuous VA</label>
                        <Input value={inverterVA} onChange={(e) => setInverterVA(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Surge VA</label>
                        <Input value={inverterSurge} onChange={(e) => setInverterSurge(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Load Continuous (W)</label>
                        <Input value={loadContinuous} onChange={(e) => setLoadContinuous(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Load Surge (W)</label>
                        <Input value={loadSurge} onChange={(e) => setLoadSurge(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 bg-black/70 border border-orange-500/30 text-white px-3 py-2 rounded-md shadow-sm backdrop-blur-sm text-xs flex items-start gap-2">
                    <span className="text-orange-400"><LightbulbNoFillIconPlaceholder /></span>
                    <span>
                      Tip: Use the scenario selector to simulate different operating modes. The visualizer animates energy flow based on PV, battery, and load values.
                    </span>
                  </div>

                  <div className="flex items-center gap-2 justify-between mt-2">
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
                        <Battery className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated energy flow • estimated autonomy • surge margin</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vsys: <span className="text-[#ffd24a] ml-1">{systemVoltage} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">PV: <span className="text-[#ffd24a] ml-1">{pvPanels}×{pvVmp}V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Rec: <span className="text-[#ff9a4a] ml-1">{recommendations.recommendationVA} VA</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <InverterVisualizerSVG latest={latest} inverterType={inverterType} systemVoltage={toNum(systemVoltage) || 48} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <InverterOscilloscope history={history} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Gauge className="w-5 h-5 " /> Summary & Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Recommended Inverter</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{recommendations.recommendationVA} VA</div>
                      <div className="text-xs text-zinc-400 mt-1">30% safety margin applied</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Estimated Autonomy</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{round(autonomyHours, 2)} h</div>
                      <div className="text-xs text-zinc-400 mt-1">Based on usable SoC & battery size</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Surge Headroom</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{round(latest?.surgeHeadroom || 0, 2)} W</div>
                      <div className="text-xs text-zinc-400 mt-1">Positive → spare surge capacity</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Battery Energy</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(batteryEnergyWh, 0)} Wh</div>
                      <div className="text-xs text-zinc-400 mt-1">Battery capacity × voltage</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">PV Power (now)</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{round(latest?.Ppv || 0, 1)} W</div>
                      <div className="text-xs text-zinc-400 mt-1">Simulated irradiance curve</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Battery Current</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{round(latest?.Ibatt || 0, 3)} A</div>
                      <div className="text-xs text-zinc-400 mt-1">Positive → charging</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Tool className="w-4 h-4" /></span>
                    <span>
                      Tip: Increase PV panels or battery Ah to improve autonomy; choose inverter VA above continuous load with surge margin for motors starting.
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
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-zinc-300 text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================
   Note: For the small placeholder icon used in the tip above, you can replace
   `LightbulbNoFillIconPlaceholder` with `Lightbulb` or another lucide icon import.
   It's left as a tiny placeholder name to avoid duplicate import issues.
   ============================ */
function LightbulbNoFillIconPlaceholder() {
  return <Lightbulb className="w-4 h-4 text-orange-400" />;
}
