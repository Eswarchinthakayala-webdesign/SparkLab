// src/pages/EstimatorPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Sun,
  Battery,
  Home,
  Factory,
  Globe,
  Cpu,
  Play,
  Pause,
  Download,
  Settings,
  Menu,
  X,
  Layers,
  Gauge,
  LucideEvCharger as LightningCharge,
  CloudSun,
  Thermometer,
  Wallet,
  Percent,
  MapPin,
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
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 3) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

/* ============================
   Sun profile simulation hook
   - Returns history (per minute steps) and instantaneous values
   - Produces a simple bell curve sun irradiance profile scaled by "sunHours"
   ============================ */
function useSolarSim({
  running,
  timestep = 250, // ms between animation frames
  panelWatt = 400,
  panelAreaM2 = 1.95,
  panelCount = 6,
  peakSunHours = 5, // typical daily equivalent full sun hours
  systemLoss = 0.2, // fraction (20% system losses)
  inverterEff = 0.95,
  loadPower = 500, // W
}) {
  const historyRef = useRef(Array.from({ length: 360 }, (_, i) => ({ t: i, Pprod: 0, Pload: 0, batt: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // maps "time-of-day" tSeconds -> sun factor (0..1)
  const sunFactorAt = useCallback(
    (secondsSinceStartOfSim) => {
      // simulate a day over 24*60*60 but our sim cycles faster: map t to phase 0..24
      const secsPerCycle = 60 * 60; // treat 1 hour real-time per minute of sim (fast)
      const hours = ((secondsSinceStartOfSim / 1000) / 3600) * (24 / (secsPerCycle / 3600));
      // simpler: create a bell centered at mid-day (12) with width based on peakSunHours
      const x = (hours % 24) - 12; // -12..12 with 0 at noon
      const sigma = clamp(peakSunHours / 2.2, 1.2, 5);
      const val = Math.exp(-(x * x) / (2 * sigma * sigma)); // gaussian 0..1
      return clamp(val, 0, 1);
    },
    [peakSunHours]
  );

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

      const sunFactor = sunFactorAt(tRef.current);
      // instantaneous production before losses
      const rawPanelPower = panelWatt * panelCount * sunFactor; // W
      const afterLoss = rawPanelPower * (1 - systemLoss) * inverterEff;
      const produced = clamp(afterLoss, 0, Infinity);
      const consumed = clamp(loadPower, 0, Infinity);
      // battery state approximated as fraction - we'll integrate energy delta
      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        // battery fraction approximated as 0..1 where 0 = empty, 1 = full (very rough)
        const prevBatt = next.length ? next[next.length - 1].batt : 0.5;
        const energyDeltaWh = (produced - consumed) * (dt / 1000) / 3600; // Wh
        // assume battery capacity normalization of 5000 Wh for visual scaling (actual sizing done elsewhere)
        const battCapWh = 5000;
        let newBatt = clamp(prevBatt + energyDeltaWh / battCapWh, 0, 1);
        next.push({ t: lastT + 1, Pprod: produced, Pload: consumed, batt: newBatt, sun: sunFactor });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, panelWatt, panelCount, sunFactorAt, systemLoss, inverterEff, loadPower]);

  return { history };
}

/* ============================
   SVG Visualizer
   - Draws array of panels, animated dots (current flow), inverter, battery gauge
   - Drives visuals from computed values (panels, produced watt, battery fraction)
   ============================ */
function SolarVisualizerSVG({ panelCount, panelWatt, producedW, batteryFrac, sunFactor, running }) {
  // responsive sizing
  const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(panelCount))));
  const rows = Math.ceil(panelCount / cols);
  const panelW = 86;
  const panelH = 52;
  const spacingX = 18;
  const spacingY = 14;
  const width = Math.max(680, cols * (panelW + spacingX) + 240);
  const height = Math.max(320, rows * (panelH + spacingY) + 160);

  // animated dot count proportional to producedW
  const dotCount = clamp(Math.round(3 + producedW / 200), 3, 36);
  const dotSpeed = clamp(3 / (sunFactor + 0.05), 0.6, 6); // seconds per cycle

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Sun className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Solar Estimator Visualizer</div>
            <div className="text-xs text-zinc-400">Live energy flow • panels • battery • inverter</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Panels: <span className="text-[#ffd24a] ml-1">{panelCount}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">P: <span className="text-[#ff9a4a] ml-1">{round(producedW, 1)} W</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Batt: <span className="text-[#00ffbf] ml-1">{Math.round(batteryFrac * 100)}%</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* sun icon */}
          <g transform={`translate(60,60)`}>
            <circle cx="0" cy="0" r="28" fill="#ffd24a" stroke="#ffb86b" strokeWidth="2" />
            <g transform="translate(-6,-6)" opacity={0.95}>
              <CloudSun className="w-6 h-6" />
            </g>
          </g>

          {/* panel grid */}
          <g transform={`translate(140,40)`}>
            {Array.from({ length: panelCount }).map((_, i) => {
              const col = i % cols;
              const row = Math.floor(i / cols);
              const x = col * (panelW + spacingX);
              const y = row * (panelH + spacingY);
              const tilt = (Math.sin((i + (performance.now() % 1000) / 1000) * 2) * 4) || 0;
              const panelFill = `url(#panelGrad)`;
              const glow = clamp(sunFactor, 0, 1);
              // path for animated dot on panel to bus
              const pathStr = `M ${x + panelW / 2} ${y + panelH} L ${width - 220} ${height - 120}`;
              return (
                <g key={`p-${i}`} transform={`translate(${x},${y}) rotate(${tilt})`} className="panel">
                  <rect x="0" y="0" rx="6" ry="6" width={panelW} height={panelH} fill="#071023" stroke="#112" strokeWidth="2" />
                  {/* cells */}
                  <g transform="translate(8,8)">
                    {Array.from({ length: 3 }).map((__, r) => (
                      <rect key={r} x="0" y={r * 12} width={panelW - 16} height="8" rx="2" fill={`rgba(8,20,48,${0.2 + glow * 0.7})`} stroke="#021" />
                    ))}
                  </g>
                  {/* panel label */}
                  <text x={8} y={panelH - 6} fontSize="10" fill="#ffd24a">{panelWatt} W</text>

                  {/* animated dots traveling from panel to bus */}
                  {Array.from({ length: Math.min(6, Math.round(dotCount / (cols * rows) + 1)) }).map((__, di) => {
                    const delay = ((i + di) % 7) * 0.12;
                    const style = {
                      offsetPath: `path('${pathStr}')`,
                      animationName: "flowToBus",
                      animationDuration: `${dotSpeed}s`,
                      animationTimingFunction: "linear",
                      animationDelay: `${-delay}s`,
                      animationIterationCount: "infinite",
                      animationPlayState: running ? "running" : "paused",
                      transformOrigin: "0 0",
                    };
                    return <circle key={`dot-${i}-${di}`} r="3.2" fill="#ffd24a" style={style} />;
                  })}
                </g>
              );
            })}
          </g>

          {/* bus / inverter / load cluster */}
          <g transform={`translate(${width - 240}, ${height - 160})`}>
            <rect x="-20" y="-10" width="200" height="120" rx="12" fill="#060606" stroke="#222" />
            <text x="8" y="6" fontSize="12" fill="#ff9a4a">Inverter</text>
            <text x="8" y="28" fontSize="11" fill="#fff">AC Out: <tspan fill="#ffd24a">{round(producedW, 1)} W</tspan></text>
            <g transform="translate(10,48)">
              <rect x="0" y="0" width="36" height="36" rx="6" fill="#0b0b0b" stroke="#222" />
              <LightningCharge className="w-5 h-5" />
              <text x="44" y="22" fontSize="11" fill="#00ffbf">Load</text>
            </g>

            <g transform="translate(10,90)">
              <rect x="0" y="0" width="160" height="18" rx="8" fill="#0b0b0b" stroke="#222" />
              <rect x="4" y="4" width={Math.max(4, 152 * batteryFrac)} height="10" rx="6" fill="#00ffbf" />
              <text x="6" y="14" fontSize="10" fill="#000">Battery {Math.round(batteryFrac * 100)}%</text>
            </g>
          </g>

          <defs>
            <linearGradient id="panelGrad" x1="0" x2="1">
              <stop offset="0%" stopColor="#07162b" />
              <stop offset="100%" stopColor="#02122a" />
            </linearGradient>
          </defs>

          <style>{`
            @keyframes flowToBus {
              0% { offset-distance: 0%; opacity: 0.9; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.95; transform: translate(0,0) scale(1.05); }
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
   Oscilloscope for Power traces
   - Shows production, load, battery %
   ============================ */
function SolarOscilloscope({ history = [], running }) {
  const data = history.slice(-360).map((d, idx) => ({
    t: idx,
    Pprod: round(d.Pprod, 1),
    Pload: round(d.Pload, 1),
    batt: round((d.batt || 0) * 100, 1),
  }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — Production, Load, Battery%</div>
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
            <Line type="monotone" dataKey="Pprod" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Produced (W)" />
            <Line type="monotone" dataKey="Pload" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Load (W)" />
            <Line type="monotone" dataKey="batt" stroke="#9ee6ff" strokeWidth={2} dot={false} isAnimationActive={false} name="Battery (%)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Estimator Page
   ============================ */
export default function EstimatorPage() {
  // UI state
  const [userType, setUserType] = useState("residential");
  const [dailyConsumption, setDailyConsumption] = useState("4000"); // Wh/day
  const [peakLoad, setPeakLoad] = useState("1200"); // W
  const [panelWatt, setPanelWatt] = useState("400");
  const [panelArea, setPanelArea] = useState("1.95"); // m^2 typical
  const [sunHours, setSunHours] = useState("5"); // equivalent full sun hours
  const [systemLoss, setSystemLoss] = useState("20"); // percent
  const [inverterEff, setInverterEff] = useState("95"); // percent
  const [batteryBackupHours, setBatteryBackupHours] = useState("4"); // hours required
  const [panelCountManual, setPanelCountManual] = useState(""); // optional manual override

  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // compute key estimates
  const estimates = useMemo(() => {
    const dailyWh = Math.max(0, toNum(dailyConsumption));
    const peakW = Math.max(0, toNum(peakLoad));
    const panelW = Math.max(1, toNum(panelWatt));
    const sun = clamp(toNum(sunHours), 0.1, 12);
    const lossFrac = clamp(toNum(systemLoss) / 100, 0, 0.9);
    const invEff = clamp(toNum(inverterEff) / 100, 0.3, 0.999);

    // required array wattage to meet dailyWh accounting for sun hours and system losses
    // needed W_p = dailyWh / (sunHours * (1 - loss) * inverterEff)
    const neededArrayW = dailyWh / (sun * (1 - lossFrac) * invEff || 1e-9);
    const panelsReq = Math.ceil(neededArrayW / panelW);

    // battery sizing: Wh needed = backupHours * peakLoad * safety (1.2)
    const battWh = Math.max(0, toNum(batteryBackupHours)) * peakW * 1.2;
    // battery Ah at nominal 48V system: Ah = Wh / V
    const battAh48 = battWh / 48;

    // approx area
    const area = panelsReq * toNum(panelArea);

    // cost estimate (very rough) - per panel cost and battery cost heuristics
    const panelCostPerW = 0.4; // USD per watt (example)
    const batCostPerWh = 0.18; // USD per Wh
    const totalCost = neededArrayW * panelCostPerW + battWh * batCostPerWh + 600; // +installation fixed

    return {
      neededArrayW,
      panelsReq,
      battWh,
      battAh48,
      area,
      totalCost,
      peakW,
      dailyWh,
    };
  }, [dailyConsumption, peakLoad, panelWatt, sunHours, systemLoss, inverterEff, batteryBackupHours, panelArea]);

  // allow manual override of panels
  const usagePanelCount = useMemo(() => {
    const manual = toNum(panelCountManual);
    return Number.isFinite(manual) && manual > 0 ? Math.round(manual) : estimates.panelsReq;
  }, [panelCountManual, estimates.panelsReq]);

  // simulation hook to produce live produced power & history
  const { history } = useSolarSim({
    running,
    timestep: 180,
    panelWatt: toNum(panelWatt),
    panelAreaM2: toNum(panelArea),
    panelCount: usagePanelCount,
    peakSunHours: clamp(toNum(sunHours), 0.5, 10),
    systemLoss: clamp(toNum(systemLoss) / 100, 0, 0.9),
    inverterEff: clamp(toNum(inverterEff) / 100, 0.3, 0.999),
    loadPower: clamp(toNum(peakLoad), 0, 20000),
  });

  const latest = history.length ? history[history.length - 1] : { Pprod: 0, batt: 0, sun: 0 };

  const exportCSV = () => {
    const rows = [["t", "Pprod", "Pload", "batt", "sun"], ...history.map((d) => [d.t, round(d.Pprod, 3), round(d.Pload, 3), round(d.batt, 4), round(d.sun, 4)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `solar-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const resetDefaults = () => {
    setUserType("residential");
    setDailyConsumption("4000");
    setPeakLoad("1200");
    setPanelWatt("400");
    setPanelArea("1.95");
    setSunHours("5");
    setSystemLoss("20");
    setInverterEff("95");
    setBatteryBackupHours("4");
    setPanelCountManual("");
    toast("Reset to defaults");
  };

  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)]
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
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Solar Panel Estimator</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-40">
                <Select value={userType} onValueChange={(v) => setUserType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="User Type" />
                  </SelectTrigger>

                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="residential"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Residential</SelectItem>
                    <SelectItem value="commercial"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Commercial</SelectItem>
                    <SelectItem value="offgrid"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Off-grid</SelectItem>
                    <SelectItem value="hybrid"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={() => setRunning((r) => !r)} aria-label="Play / Pause" title={running ? "Pause" : "Play"}>
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
              <div className="w-full">
                <Select value={userType} onValueChange={(v) => setUserType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="User Type" />
                  </SelectTrigger>

                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="residential"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Residential</SelectItem>
                    <SelectItem value="commercial"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Commercial</SelectItem>
                    <SelectItem value="offgrid"      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Off-grid</SelectItem>
                    <SelectItem value="hybrid"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-row gap-2">
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Play"}</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={resetDefaults}>Reset</Button>
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
                        <Sun className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Estimator</div>
                        <div className="text-xs text-zinc-400">Daily sizing • battery • cost • realtime visualizer</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs text-zinc-400">User Type</label>
                      <Select value={userType} onValueChange={(v) => setUserType(v)}>
                        <SelectTrigger className="w-full  cursor-pointer bg-zinc-900/60 border border-zinc-800 text-white">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                          <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="residential">Residential <Home className="w-4 h-4 inline ml-2" /></SelectItem>
                          <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="commercial">Commercial <Factory className="w-4 h-4 inline ml-2" /></SelectItem>
                          <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="offgrid">Off-grid <Globe className="w-4 h-4 inline ml-2" /></SelectItem>
                          <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="hybrid">Hybrid <Cpu className="w-4 h-4 inline ml-2" /></SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Daily Consumption (Wh/day)</label>
                      <Input value={dailyConsumption} onChange={(e) => setDailyConsumption(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Peak Load (W)</label>
                      <Input value={peakLoad} onChange={(e) => setPeakLoad(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-zinc-400">Panel Watt (W)</label>
                        <Input value={panelWatt} onChange={(e) => setPanelWatt(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Panel Area (m²)</label>
                        <Input value={panelArea} onChange={(e) => setPanelArea(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-zinc-400">Sun Hours (peak eq.)</label>
                        <Input value={sunHours} onChange={(e) => setSunHours(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">System Loss (%)</label>
                        <Input value={systemLoss} onChange={(e) => setSystemLoss(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-zinc-400">Inverter Eff (%)</label>
                        <Input value={inverterEff} onChange={(e) => setInverterEff(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Battery backup (hrs)</label>
                        <Input value={batteryBackupHours} onChange={(e) => setBatteryBackupHours(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Override Panel Count (optional)</label>
                      <Input value={panelCountManual} onChange={(e) => setPanelCountManual(e.target.value)} type="number" placeholder={`${Math.max(1, Math.round(estimates.panelsReq))}`} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500 mt-1">Set to force number of panels (overrides estimator). Leave blank for auto.</div>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                    <Button variant="outline" className="flex-1 px-3 py-2 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Visual + Oscilloscope + Summary */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Sun className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated panels • energy flow • battery gauge</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">User: <span className="text-[#ffd24a] ml-1">{userType}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Panels: <span className="text-[#ffd24a] ml-1">{usagePanelCount}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Sun: <span className="text-[#ffd24a] ml-1">{sunHours} h</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <SolarVisualizerSVG
                    panelCount={usagePanelCount}
                    panelWatt={toNum(panelWatt)}
                    producedW={latest.Pprod}
                    batteryFrac={latest.batt}
                    sunFactor={latest.sun}
                    running={running}
                  />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <SolarOscilloscope history={history} running={running} />

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Gauge className="w-5 h-5 " /> Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Array required (W)</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(estimates.neededArrayW, 1)} W</div>
                      <div className="text-xs text-zinc-400 mt-1">To meet {estimates.dailyWh} Wh/day</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Panels</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{usagePanelCount} × {panelWatt}W</div>
                      <div className="text-xs text-zinc-400 mt-1">Area ~ {round(estimates.area || 0, 2)} m²</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Battery stored energy</div>
                      <div className="text-lg font-semibold text-[#9ee6ff]">{round(estimates.battWh || 0, 0)} Wh</div>
                      <div className="text-xs text-zinc-400 mt-1">≈ {round(estimates.battAh48 || 0, 1)} Ah @48V</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 col-span-full">
                      <div className="text-xs text-zinc-400">Estimated Cost (rough)</div>
                      <div className="text-2xl font-bold text-[#ffd24a]">≈ ${round(estimates.totalCost, 0)}</div>
                      <div className="text-xs text-zinc-400 mt-1">Includes panels, battery estimate, and install.</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Current Production</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(latest.Pprod || 0, 1)} W</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Battery</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{Math.round((latest.batt || 0) * 100)}%</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Peak Load</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{round(estimates.peakW, 1)} W</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Thermometer/></span>
                    <span>
                      Tip: Use local average sun hours for accurate sizing. This estimator uses a simplified model and gives starting figures — for final system design consult an installer.
                    </span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => { toast.success("Snapshot saved"); }}><Download className="w-4 h-4 mr-2" />Snapshot</Button>
                    <Button variant="ghost" className="flex-1 border border-zinc-800 text-zinc-300 cursor-pointer" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
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
