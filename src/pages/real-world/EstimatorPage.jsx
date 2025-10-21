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

import { toPng } from "html-to-image";  

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
 function SolarVisualizerSVG({
  panelCount = 8,
  panelWatt = 400,
  producedW = 2500,
  batteryFrac = 0.65,
  sunFactor = 0.9,
  running = true,
}) {
  const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(panelCount))));
  const rows = Math.ceil(panelCount / cols);
  const panelW = 86;
  const panelH = 54;
  const spacingX = 22;
  const spacingY = 18;
  const width = Math.max(960, cols * (panelW + spacingX) + 260);
  const height = Math.max(460, rows * (panelH + spacingY) + 240);

  const dotCount = clamp(Math.round(6 + producedW / 180), 6, 40);
  const dotSpeed = clamp(3 / (sunFactor + 0.05), 0.6, 6);

  return (
    <motion.div
      className="w-full rounded-2xl p-5 bg-gradient-to-b from-[#0a0a0a] via-[#121212] to-[#1a0e00] border border-[#2e1800] shadow-[0_0_45px_rgba(255,150,50,0.15)] backdrop-blur-xl overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div className="flex items-center gap-3">
          <motion.div
            className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-lg"
            animate={{
              boxShadow: [
                "0 0 12px #ffb84a",
                "0 0 24px #ff7a2d",
                "0 0 12px #ffb84a",
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, repeatType: "mirror" }}
          >
            <Sun className="w-6 h-6 text-black" />
          </motion.div>
          <div>
            <div className="text-lg font-semibold text-[#ffb84a]">
              Solar Energy Control Center
            </div>
            <div className="text-xs text-zinc-400">
              Holographic Smart Grid • Energy Flow Simulation
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap text-xs text-zinc-300">
          <span className="px-3 py-1 border border-[#332208] rounded-full bg-black/40">
            Panels: <span className="text-[#ffb84a]">{panelCount}</span>
          </span>
          <span className="px-3 py-1 border border-[#332208] rounded-full bg-black/40">
            Output: <span className="text-[#ff9a3d]">{round(producedW, 1)} W</span>
          </span>
          <span className="px-3 py-1 border border-[#332208] rounded-full bg-black/40">
            Battery:{" "}
            <span className="text-[#ffaa00]">{Math.round(batteryFrac * 100)}%</span>
          </span>
        </div>
      </div>

      {/* SVG Scene */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-[26rem]"
      >
        {/* ===== DEFINITIONS ===== */}
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a0e00" />
            <stop offset="70%" stopColor="#000000" />
          </linearGradient>

          <radialGradient id="sunGlow" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#ffdd55" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ff7a2d00" />
          </radialGradient>

          <linearGradient id="energyFlow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffb84a" />
            <stop offset="100%" stopColor="#ffaa00" />
          </linearGradient>

          <linearGradient id="panelGlass" x1="0" x2="1">
            <stop offset="0%" stopColor="#111" />
            <stop offset="100%" stopColor="#222" />
          </linearGradient>

          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="beamGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffb84a40" />
            <stop offset="100%" stopColor="#00000000" />
          </linearGradient>
        </defs>

        {/* ===== BACKGROUND ===== */}
        <rect x="0" y="0" width={width} height={height} fill="url(#skyGrad)" />

        {/* subtle parallax particles */}
        {Array.from({ length: 25 }).map((_, i) => (
          <motion.circle
            key={i}
            cx={Math.random() * width}
            cy={Math.random() * height}
            r={Math.random() * 1.4 + 0.6}
            fill="#ffb84a"
            fillOpacity={Math.random() * 0.25}
            animate={{ y: [0, -15, 0], opacity: [0.3, 0.7, 0.3] }}
            transition={{
              duration: 4 + Math.random() * 6,
              repeat: Infinity,
              delay: Math.random() * 3,
            }}
          />
        ))}

        {/* ===== SUN & BEAMS ===== */}
        <motion.circle
          cx={useMemo(() => 180 + sunFactor * 480, [sunFactor])}
          cy={useMemo(() => 100 + (1 - sunFactor) * 70, [sunFactor])}
          r="40"
          fill="url(#sunGlow)"
          style={{ filter: "url(#softGlow)" }}
          animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
        {/* sunlight beams */}
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.rect
            key={i}
            x={180 + i * 60}
            y="0"
            width="120"
            height={height / 2}
            fill="url(#beamGrad)"
            opacity={0.08 + i * 0.03}
            animate={{
              opacity: [0.1, 0.25, 0.1],
              x: [180 + i * 60, 170 + i * 60, 180 + i * 60],
            }}
            transition={{ duration: 8 + i, repeat: Infinity }}
          />
        ))}

        {/* ===== SOLAR PANEL GRID ===== */}
        <g transform="translate(160,240)">
          {Array.from({ length: panelCount }).map((_, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * (panelW + spacingX);
            const y = row * (panelH + spacingY);
            const glow = 0.1 + sunFactor * 0.8;

            const pathStr = `M ${x + panelW / 2} ${y + panelH} C ${
              x + 100
            } ${y + 40}, ${width - 200} ${height - 160}, ${width - 140} ${
              height - 160
            }`;

            return (
              <g key={i} transform={`translate(${x},${y})`}>
                <rect
                  x="0"
                  y="0"
                  width={panelW}
                  height={panelH}
                  rx="6"
                  fill="url(#panelGlass)"
                  stroke="#332208"
                  strokeWidth="1.5"
                  style={{
                    filter: "drop-shadow(0 0 8px rgba(255,150,50,0.15))",
                  }}
                />
                {/* reflection shimmer */}
                <motion.rect
                  x="-20"
                  y="0"
                  width={panelW / 2}
                  height={panelH}
                  fill="#ffffff15"
                  animate={{ x: [0, panelW + 10] }}
                  transition={{
                    duration: 3 + Math.random() * 2,
                    repeat: Infinity,
                    delay: i * 0.25,
                  }}
                />
                <rect
                  x="0"
                  y="0"
                  width={panelW}
                  height={panelH}
                  fill="#ffb84a10"
                  opacity={glow * 0.5}
                />

                <text
                  x={panelW / 2 - 14}
                  y={panelH + 12}
                  fontSize="10"
                  fill="#ffaa00"
                >
                  {panelWatt} W
                </text>

                {/* energy flow dots */}
                {Array.from({
                  length: Math.min(5, Math.ceil(dotCount / panelCount) + 1),
                }).map((__, d) => {
                  const delay = (i + d) * 0.12;
                  return (
                    <circle
                      key={`${i}-${d}`}
                      r="3.4"
                      fill="url(#energyFlow)"
                      style={{
                        offsetPath: `path('${pathStr}')`,
                        animation: `flow ${dotSpeed}s linear ${-delay}s infinite`,
                        animationPlayState: running ? "running" : "paused",
                      }}
                    />
                  );
                })}
              </g>
            );
          })}
        </g>

        {/* ===== CONTROL HUB ===== */}
        <g transform={`translate(${width - 180}, ${height - 160})`}>
          <rect
            x="-40"
            y="-20"
            width="200"
            height="120"
            rx="16"
            fill="#1a0e00cc"
            stroke="#ff7a2d"
            style={{
              backdropFilter: "blur(8px)",
              filter: "drop-shadow(0 0 10px rgba(255,150,50,0.3))",
            }}
          />
          <text x="10" y="10" fontSize="12" fill="#ffb84a">
            Power Console
          </text>

          {/* battery */}
          <g transform="translate(20,30)">
            <Battery className="w-5 h-5 text-[#ffaa00]" />
            <rect
              x="40"
              y="0"
              width="120"
              height="12"
              rx="6"
              fill="#0b0b0b"
              stroke="#332208"
            />
            <rect
              x="40"
              y="0"
              width={Math.max(8, 120 * batteryFrac)}
              height="12"
              rx="6"
              fill="#ffaa00"
              style={{ filter: "drop-shadow(0 0 6px #ffb84a)" }}
            />
            <text x="170" y="10" fontSize="10" fill="#ffb84a">
              {Math.round(batteryFrac * 100)}%
            </text>
          </g>

          {/* home icon */}
          <g transform="translate(20,70)">
            <Home className="w-5 h-5 text-[#ff9a3d]" />
            <text x="36" y="10" fontSize="11" fill="#ff9a3d">
              Smart Home
            </text>
          </g>
        </g>

        {/* ===== OVERLAY TEXT ===== */}
        <text
          x="40"
          y={height - 30}
          fontSize="14"
          fill="#ffb84a"
          opacity="0.75"
          style={{ letterSpacing: "1px" }}
        >
          System Active • Real-Time Solar Energy Flow
        </text>

        <style>{`
          @keyframes flow {
            0% { offset-distance: 0%; opacity: 1; transform: scale(0.9); }
            50% { opacity: 0.95; transform: scale(1.05); }
            100% { offset-distance: 100%; opacity: 0; transform: scale(0.9); }
          }
          circle[style] { will-change: offset-distance, opacity, transform; }
        `}</style>
      </svg>
    </motion.div>
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
  
  const snapshotPNG = async () => {
    const node = document.querySelector(".snapshot");
    if (!node) {
      toast.error("Snapshot target not found");
      return;
    }

    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#000",
        quality: 1,
      });
      const link = document.createElement("a");
      link.download = `snapshot-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Snapshot saved!");
    } catch (error) {
      console.error("Snapshot failed:", error);
      toast.error("Failed to capture snapshot");
    }
 
}
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
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={snapshotPNG}>Snapshot</Button>
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
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={snapshotPNG}>Snapshot</Button>
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
              <Card className="bg-black/70 border snapshot border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
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
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{round(estimates.neededArrayW, 1)} W</div>
                      <div className="text-xs text-zinc-400 mt-1">To meet {estimates.dailyWh} Wh/day</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Panels</div>
                      <div className="text-lg font-semibold text-[#00ffbf] truncate">{usagePanelCount} × {panelWatt}W</div>
                      <div className="text-xs text-zinc-400 mt-1">Area ~ {round(estimates.area || 0, 2)} m²</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Battery stored energy</div>
                      <div className="text-lg font-semibold text-[#9ee6ff] truncate">{round(estimates.battWh || 0, 0)} Wh</div>
                      <div className="text-xs text-zinc-400 mt-1">≈ {round(estimates.battAh48 || 0, 1)} Ah @48V</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 col-span-full">
                      <div className="text-xs text-zinc-400">Estimated Cost (rough)</div>
                      <div className="text-2xl font-bold text-[#ffd24a] truncate">≈ ${round(estimates.totalCost, 0)}</div>
                      <div className="text-xs text-zinc-400 mt-1">Includes panels, battery estimate, and install.</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Current Production</div>
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{round(latest.Pprod || 0, 1)} W</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Battery</div>
                      <div className="text-lg font-semibold text-[#00ffbf] truncate">{Math.round((latest.batt || 0) * 100)}%</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Peak Load</div>
                      <div className="text-lg font-semibold text-[#ffd24a] truncate">{round(estimates.peakW, 1)} W</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Thermometer/></span>
                    <span>
                      Tip: Use local average sun hours for accurate sizing. This estimator uses a simplified model and gives starting figures — for final system design consult an installer.
                    </span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={snapshotPNG}><Download className="w-4 h-4 mr-2" />Snapshot</Button>
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
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 cursor-pointer text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
