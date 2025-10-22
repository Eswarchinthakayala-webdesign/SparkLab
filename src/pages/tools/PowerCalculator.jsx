// src/pages/PowerCalculator.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Battery,
  CircuitBoard,
  Activity,
  Search,
  RefreshCw,
  Play,
  Pause,
  Download,
  Gauge,
  Thermometer,
  Wind,
  Camera,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Toaster, toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { toPng } from "html-to-image";  


/* ============================
   Utilities
   ============================ */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 3) => (Number.isFinite(v) ? Math.round(v * 10 ** p) / 10 ** p : NaN);
const parseNumber = (v) => {
  if (v === "" || v === null || v === undefined) return NaN;
  const n = Number(v);
  return Number.isNaN(n) ? NaN : n;
};

/* ============================
   Simulation Hook
   ============================ */
function useSimLoop({ running, timestep = 100, supplyType = "DC", initial = { V: 12, I: 1.2, R: 10 } }) {
  const [history, setHistory] = useState(() => {
    const arr = [];
    for (let i = 0; i < 120; i++) arr.push({ t: i, V: 0, I: 0, P_vi: 0, P_ir: 0, P_vr: 0, P_display: 0 });
    return arr;
  });

  const valuesRef = useRef({ ...initial, supplyType });
  const rafRef = useRef(null);
  const lastRef = useRef(performance.now());
  const timeRef = useRef(0);

  const setValues = useCallback((vals) => {
    valuesRef.current = { ...valuesRef.current, ...vals };
  }, []);

  useEffect(() => {
    valuesRef.current.supplyType = supplyType;
  }, [supplyType]);

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
      timeRef.current += dt;
      const tSeconds = timeRef.current / 1000;

      const { V: Vbase, I: Ibase, R } = valuesRef.current;
      let Vinst = Number.isFinite(Vbase) ? Vbase : 0;
      let Iinst = Number.isFinite(Ibase) ? Ibase : 0;

      if (valuesRef.current.supplyType === "AC") {
        const freq = valuesRef.current.freq || 50;
        const omega = 2 * Math.PI * freq;
        Vinst = (Number.isFinite(Vbase) ? Vbase : 0) * Math.sin(omega * tSeconds);
        if (Number.isFinite(R) && R !== 0) Iinst = Vinst / R;
      } else {
        Vinst = (Number.isFinite(Vbase) ? Vbase : 0) * (1 + (Math.random() - 0.5) * 0.001);
        Iinst = (Number.isFinite(Ibase) ? Ibase : (Number.isFinite(R) && R !== 0 ? (Number.isFinite(Vbase) ? Vbase / R : 0) : 0)) * (1 + (Math.random() - 0.5) * 0.001);
      }

      const P_vi = Number.isFinite(Vinst) && Number.isFinite(Iinst) ? Vinst * Iinst : NaN;
      const P_ir = Number.isFinite(Iinst) && Number.isFinite(R) ? Iinst * Iinst * R : NaN;
      const P_vr = Number.isFinite(Vinst) && Number.isFinite(R) && R !== 0 ? (Vinst * Vinst) / R : NaN;

      const mode = valuesRef.current.mode || "VI";
      const P_display = mode === "VI" ? P_vi : mode === "IR" ? P_ir : P_vr;

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({
          t: lastT + 1,
          V: Vinst,
          I: Iinst,
          P_vi: P_vi,
          P_ir: P_ir,
          P_vr: P_vr,
          P_display,
        });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep]);

  return { history, setValues, setHistory: setHistory => setHistory, valuesRef };
}

/* ============================
   Circuit Visualizer (SVG)
   ============================ */
function CircuitVisualizer({
  Vdisplay,
  Idisplay,
  R,
  Pdisplay,
  running,
  mode,
  supplyType,
}) {
  const glow = clamp(Math.abs(Pdisplay) / Math.max(1, 50), 0, 1);
  const glowOp = 0.08 + glow * 0.6;
  const dotCount = clamp(Math.round(4 + Math.abs(Idisplay) * 2), 2, 12);
  const flowDuration = clamp(2.5 / (Math.abs(Idisplay) + 0.05), 0.4, 4);

  const pathStr = "M 120 48 H 340 V 120 H 280 V 200 H 120";

  const Meter = ({ label, value, unit, color = "#ff7a2d" }) => (
    <div className="flex flex-col items-center gap-1 min-w-[72px]">
      <div className="w-20 h-12 sm:w-24 sm:h-14 rounded-lg bg-zinc-900/50 border border-zinc-800 flex items-center justify-center">
        <div className="text-xs sm:text-sm font-semibold" style={{ color }}>{Number.isFinite(value) ? `${round(value, 3)}${unit}` : `-- ${unit}`}</div>
      </div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );

  return (
    <div className="w-full rounded-xl p-2 sm:p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800">
      <svg viewBox="0 0 520 260" preserveAspectRatio="xMidYMid meet" className="w-full h-44 sm:h-56 md:h-64 lg:h-72 block">
        <defs>
          <linearGradient id="wireG" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff7a2d" />
            <stop offset="100%" stopColor="#ffd24a" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={6 * glow} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* wires (tighter gaps) */}
        <path d="M 120 48 H 340" stroke="#111" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M 340 48 V 120 H 280" stroke="#111" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M 280 120 H 120" stroke="#111" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M 120 120 V 200 H 280" stroke="#111" strokeWidth="6" strokeLinecap="round" fill="none" />

        <path d="M 120 48 H 340 V 120 H 280 V 200 H 120" stroke="url(#wireG)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.6" />

        {/* battery */}
        <g transform="translate(60,68)">
          <rect x="-20" y="-20" width="40" height="80" rx="6" fill="#060606" stroke="#222" />
          <rect x="28" y="6" width="6" height="30" rx="2" fill="#ffd24a" />
          <text x="-22" y="-28" fontSize="12" fill="#ffb57a">{Number.isFinite(Vdisplay) ? `${round(Math.abs(Vdisplay), 2)} V` : "-- V"}</text>
        </g>

        {/* resistor */}
        <g transform="translate(312,86)">
          <rect x="-18" y="-28" width="76" height="68" rx="10" fill="#0b0b0b" opacity={0.0} />
          <path d="M 0 0 l 6 -14 l 6 28 l 6 -28 l 6 28 l 6 -14" stroke="#333" strokeWidth="6" fill="none" strokeLinecap="round" />
          <rect x="-14" y="-36" width="84" height="76" rx="8" fill="#ff7a2d" opacity={glowOp} filter={glow > 0 ? "url(#glow)" : ""} />
          <text x="-6" y="66" fontSize="12" fill="#ffd24a">{Number.isFinite(R) ? `${round(R, 2)} Ω` : "-- Ω"}</text>
        </g>

        {/* ammeter */}
        <g transform="translate(200,130)">
          <circle cx="0" cy="0" r="22" fill="#0b0b0b" stroke="#222" strokeWidth="2" />
          <text x="-8" y="6" fontSize="12" fill="#ffd24a">A</text>
          <text x="-34" y="40" fontSize="11" fill="#fff">{Number.isFinite(Idisplay) ? `${round(Idisplay, 4)} A` : "-- A"}</text>
        </g>

        {/* voltmeter */}
        <g transform="translate(420,92)">
          <circle cx="0" cy="0" r="20" fill="#0b0b0b" stroke="#222" strokeWidth="2" />
          <text x="-7" y="5" fontSize="12" fill="#ffd24a">V</text>
          <text x="-36" y="38" fontSize="11" fill="#fff">{Number.isFinite(Vdisplay) ? `${round(Vdisplay, 4)} V` : "-- V"}</text>
        </g>

        {/* wattmeter */}
        <g transform="translate(300,22)">
          <rect x="-48" y="-14" width="96" height="28" rx="6" fill="#060606" stroke="#222" />
          <text x="-44" y="6" fontSize="12" fill="#ffb57a">P</text>
          <text x="-4" y="6" fontSize="12" fill="#ff9a4a" fontWeight="600">{Number.isFinite(Pdisplay) ? `${round(Pdisplay, 3)} W` : "-- W"}</text>
        </g>

        {/* animated dots */}
        {Array.from({ length: dotCount }).map((_, i) => {
          const delay = (i / dotCount) * flowDuration;
          const circleStyle = {
            offsetPath: `path('${pathStr}')`,
            offsetRotate: "auto",
            animationName: "flow",
            animationDuration: `${flowDuration}s`,
            animationTimingFunction: "linear",
            animationDelay: `${delay}s`,
            animationIterationCount: "infinite",
            animationFillMode: "none",
            animationPlayState: running ? "running" : "paused",
          };
          return (
            <circle
              key={`dot-${i}`}
              r="5"
              fill="#ff9a4a"
              style={circleStyle}
            />
          );
        })}

        <text x="20" y="18" fontSize="12" fill="#ffb57a">Supply: <tspan fill="#ffd24a">{supplyType}</tspan></text>
        <text x="420" y="18" fontSize="12" fill="#ffb57a">Mode: <tspan fill="#ffd24a">{mode}</tspan></text>

        <style>
          {`@keyframes flow {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-4px, -4px) scale(0.92); }
              5% { opacity: 1; }
              50% { opacity: 0.95; transform: translate(0,0) scale(1.02); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.9); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }`}
        </style>
      </svg>

      {/* small meter row under visual - responsive stacking */}
      <div className="mt-3 flex flex-row gap-3 items-center sm:items-center justify-between">
        <div className="flex flex-row gap-3 items-center w-full sm:w-auto">
          <Meter label="Voltage" value={Vdisplay} unit=" V" color="#ffd24a" />
          <Meter label="Current" value={Idisplay} unit=" A" color="#00ffbf" />
          <Meter label="Power" value={Pdisplay} unit=" W" color="#ff7a2d" />
        </div>

        <div className="sm:flex hidden items-center gap-2 w-full sm:w-auto justify-end ">
          <div className="text-xs text-zinc-400 mr-2 hidden sm:block">AC Freq:</div>
          <div className="w-28">
            <div className="text-xs text-zinc-400">Supply</div>
            <div className="text-sm font-semibold text-zinc-200 truncate">{supplyType}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================
   Oscilloscope component
   ============================ */
function Oscilloscope({ history, primary = "#ff7a2d", running }) {
  const data = history.slice(-160);
  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/20 border border-zinc-800">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-orange-300 font-medium">Oscilloscope — Power</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-36 sm:h-44 md:h-56 lg:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" hide />
            <YAxis tick={{ fill: "#888" }} />
            <Tooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222",borderRadius:"10px" }} />
            <Line type="monotone" dataKey="P_display" stroke={primary} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Multi-line history chart
   ============================ */
function MultiHistory({ history }) {
  const data = history.slice(-420);
  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/20 border border-zinc-800">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-orange-300 font-medium">History</div>
        <div className="text-xs text-zinc-400">V / I / P (formulas)</div>
      </div>
      <div className="h-44 sm:h-56 md:h-72 lg:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="6 6" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <Tooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222" ,borderRadius:"10px"}} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line dataKey="V" stroke="#ffd24a" dot={false} strokeWidth={2} />
            <Line dataKey="I" stroke="#00ffaa" dot={false} strokeWidth={2} />
            <Line dataKey="P_vi" stroke="#ff7a2d" dot={false} strokeWidth={2} />
            <Line dataKey="P_ir" stroke="#ff5a9a" dot={false} strokeWidth={2} />
            <Line dataKey="P_vr" stroke="#ffb84a" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page Component
   ============================ */
export default function PowerCalculatorPage() {
  const [mode, setMode] = useState("VI"); // VI | IR | VR
  const [supplyType, setSupplyType] = useState("DC"); // DC or AC
  const [freq, setFreq] = useState(50);

  const [Vraw, setVraw] = useState("12");
  const [Iraw, setIraw] = useState("1.2");
  const [Rraw, setRraw] = useState("10");

  const [running, setRunning] = useState(true);
  const [timestep] = useState(80);

  const Vbase = parseNumber(Vraw);
  const Ibase = parseNumber(Iraw);
  const R = parseNumber(Rraw);

  const { history, setValues, valuesRef } = useSimLoop({
    running,
    timestep,
    supplyType,
    initial: { V: Number.isFinite(Vbase) ? Vbase : 0, I: Number.isFinite(Ibase) ? Ibase : 0, R: Number.isFinite(R) ? R : 0, mode },
  });

  useEffect(() => {
    setValues({ V: Number.isFinite(Vbase) ? Vbase : 0, I: Number.isFinite(Ibase) ? Ibase : 0, R: Number.isFinite(R) ? R : 0, mode, freq, supplyType });
  }, [Vraw, Iraw, Rraw, mode, setValues, freq, supplyType]);

  const last = history.length ? history[history.length - 1] : { V: 0, I: 0, P_display: 0, P_vi: 0, P_ir: 0, P_vr: 0 };

  const toggleRunning = () => {
    setRunning((r) => {
      const next = !r;
      toast(next ? "Simulation started" : "Simulation paused");
      return next;
    });
  };

  const resetAll = () => {
    setVraw("12");
    setIraw("1.2");
    setRraw("10");
    setFreq(50);
    toast("Reset to defaults");
  };
  
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

  const exportCSV = () => {
    const rows = [["t", "V", "I", "P_vi", "P_ir", "P_vr", "P_display"], ...history.map((d) => [d.t, round(d.V, 6), round(d.I, 6), round(d.P_vi, 6), round(d.P_ir, 6), round(d.P_vr, 6), round(d.P_display, 6)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `power-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const presets = [
    { id: "usb", label: "USB (5V, 0.5A)", V: 5, I: 0.5, R: 10 },
    { id: "led", label: "LED Demo (12V, 0.6A)", V: 12, I: 0.6, R: 20 },
    { id: "motor", label: "Motor (24V, 2A)", V: 24, I: 2, R: 12 },
  ];

  const Vdisplay = last.V;
  const Idisplay = last.I;
  const P_vi = last.P_vi;
  const P_ir = last.P_ir;
  const P_vr = last.P_vr;
  const Pdisplay = last.P_display;

  return (
    <div className="min-h-screen  pb-20 bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-black/40 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 min-w-0">
              <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <div className="text-sm text-zinc-300 leading-none truncate">SparkLab</div>
                  <div className="text-xs text-zinc-400 mt-0.5 truncate">Power Calculator</div>
                </div>
              </motion.div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block w-64 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                  <Input placeholder="Search tools..." className="pl-9 bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-500" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge className="bg-gradient-to-tr from-[#ff7a2d]/8 to-[#ffd24a]/6 border border-[#ff7a2d]/12 text-[#ff9a4a] px-3 py-1 rounded-full">Live</Badge>
                <Button className="inline-flex bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black" onClick={snapshotPNG}><Camera/> <span className="hidden sm:flex">Snapshot</span></Button>
                <Button variant="ghost" className="border border-zinc-800 cursor-pointer text-zinc-300 p-2" onClick={toggleRunning} aria-label="Play / Pause">
                  {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Controls */}
          <div className="md:col-span-5 lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Power Calculator</div>
                        <div className="text-xs text-zinc-400">P = V·I | I²R | V²/R (Realtime)</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                     <Select value={mode} onValueChange={(v) => setMode(v)}>
  <SelectTrigger className="w-36 bg-black/80 border border-zinc-800 text-white hover:border-orange-500 focus:ring-2 focus:ring-orange-500 rounded-md">
    <SelectValue placeholder="Select mode" />
  </SelectTrigger>

  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
    <SelectItem
      value="VI"
      className="text-white cursor-pointer data-[highlighted]:text-orange-200 hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      P = V × I
    </SelectItem>
    <SelectItem
      value="IR"
      className="text-white  cursor-pointer data-[highlighted]:text-orange-200 hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      P = I² × R
    </SelectItem>
    <SelectItem
      value="VR"
      className="text-white  cursor-pointer data-[highlighted]:text-orange-200 hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      P = V² / R
    </SelectItem>
  </SelectContent>
</Select>

                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* supply type */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                   <Badge className="bg-orange-500/30 backdrop-blur-sm border border-orange-400 text-white px-3 py-1 rounded-full shadow-sm">
  Supply
</Badge>

                    <Select
  value={supplyType}
  onValueChange={(v) => setSupplyType(v)}
>
  <SelectTrigger className="w-28 bg-black/80 border border-zinc-800 text-white hover:border-orange-500 focus:ring-2 focus:ring-orange-500 rounded-md">
    <SelectValue placeholder="Select..." />
  </SelectTrigger>

  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
    <SelectItem
      value="DC"
      className="text-white cursor-pointer hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 data-[highlighted]:text-orange-200 rounded-md"
    >
      DC
    </SelectItem>
    <SelectItem
      value="AC"
      className="text-white cursor-pointer hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 data-[highlighted]:text-orange-200 rounded-md"
    >
      AC
    </SelectItem>
  </SelectContent>
</Select>

                    {supplyType === "AC" && (
                      <div className="ml-0 sm:ml-2 w-full sm:w-32">
                        <div className="text-xs text-zinc-400">Freq (Hz)</div>
                        <Input value={String(freq)} onChange={(e) => setFreq(Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    )}
                  </div>

                  {/* inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="text-xs text-zinc-400">Voltage (V)</label>
                      <Input value={Vraw} onChange={(e) => setVraw(e.target.value)} type="number" placeholder="Voltage (V)" className="bg-zinc-900/60 border border-zinc-800 text-white w-full" />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="text-xs text-zinc-400">Current (A)</label>
                      <Input value={Iraw} onChange={(e) => setIraw(e.target.value)} type="number" placeholder="Current (A)" className="bg-zinc-900/60 border border-zinc-800 text-white w-full" />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="text-xs text-zinc-400">Resistance (Ω)</label>
                      <Input value={Rraw} onChange={(e) => setRraw(e.target.value)} type="number" placeholder="Resistance (Ω)" className="bg-zinc-900/60 border border-zinc-800 text-white w-full" />
                    </div>
                  </div>

                  {/* computed result */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-zinc-400">Computed (selected)</div>
                      <div className="text-2xl font-bold text-[#ff9a4a]">
                        {mode === "VI" ? (Number.isFinite(P_vi) ? `${round(P_vi, 4)} W` : "-- W")
                          : mode === "IR" ? (Number.isFinite(P_ir) ? `${round(P_ir, 4)} W` : "-- W")
                          : Number.isFinite(P_vr) ? `${round(P_vr, 4)} W` : "-- W"}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3 w-full sm:w-auto">
                      <div className="flex items-center gap-2">
                        <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer" onClick={() => { setRunning(true); toast.success("Simulation started"); }}>
                          <Play className="w-4 h-4 mr-2" /> Run
                        </Button>
                        <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer" onClick={() => { setRunning(false); toast("Simulation paused"); }}>
                          <Pause className="w-4 h-4 mr-2" /> Pause
                        </Button>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button variant="ghost" className="border border-zinc-800 cursor-pointer text-zinc-300" onClick={() => { navigator.clipboard?.writeText(`${round(Pdisplay, 4)} W`); toast.success("Copied"); }}>
                          Copy
                        </Button>
                        <Button variant="ghost" className="border border-zinc-800 cursor-pointer text-zinc-300" onClick={exportCSV}>
                          <Download className="w-4 h-4 mr-2" /> Export
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* presets */}
                  <div className="grid grid-cols-2 gap-2">
                    {presets.map((p) => (
                      <button key={p.id} onClick={() => { setVraw(String(p.V)); setIraw(String(p.I)); setRraw(String(p.R)); toast(`${p.label} applied`); }} className="px-3 py-2 cursor-pointer rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-200">
                        {p.label}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Visual area */}
          <div className="md:col-span-7 lg:col-span-8 space-y-4">
<motion.div
  className="w-full max-w-full  snapshot"
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.32 }}
>
  <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
    <CardHeader>
      <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 flex-wrap w-full">
        {/* Left side */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">
              Circuit Visualizer
            </div>
            <div className="text-xs text-zinc-400">
              Animated flow • voltmeter • ammeter • wattmeter
            </div>
          </div>
        </div>

        {/* Right side (badges) */}
        <div className="flex items-center gap-2 flex-wrap mt-2 sm:mt-0">
          <Badge className="bg-orange-500/30 backdrop-blur-sm border border-orange-400 text-white px-3 py-1 rounded-full shadow-sm">
            Mode: <span className="text-[#ffd24a] ml-1">{mode}</span>
          </Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">
            Supply: <span className="text-[#ffd24a] ml-1">{supplyType}</span>
          </Badge>
        </div>
      </CardTitle>
    </CardHeader>

    <CardContent className="w-full max-w-full overflow-hidden">
      <CircuitVisualizer
        Vdisplay={Vdisplay}
        Idisplay={Idisplay}
        R={R}
        Pdisplay={Pdisplay}
        running={running}
        mode={mode}
        supplyType={supplyType}
      />
    </CardContent>
  </Card>
</motion.div>


            {/* Oscilloscope + history */}
            {/* Oscilloscope + history */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
  <motion.div
    className="w-full max-w-full"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.32, delay: 0.06 }}
  >
    <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap">
          <div className="flex items-center gap-2 text-orange-500 flex-shrink-0">
            <Activity className="w-5 h-5 text-orange-500" /> Oscilloscope
          </div>
          <div className="bg-orange-500/30 backdrop-blur-sm border border-orange-400 text-white text-xs px-2 py-1 rounded-full shadow-sm truncate">
  Power Waveform
</div>

        </CardTitle>
      </CardHeader>
      <CardContent className="w-full max-w-full overflow-hidden">
        <Oscilloscope history={history} primary="#ff7a2d" running={running} />
      </CardContent>
    </Card>
  </motion.div>

  <motion.div
    className="w-full max-w-full"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.32, delay: 0.08 }}
  >
    <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap">
          <div className="flex items-center text-[#ffd24a] gap-2 flex-shrink-0">
            <Gauge className="w-5 h-5 text-[#ffd24a]" /> History
          </div>
          <div className="bg-orange-500/30 backdrop-blur-sm border border-orange-400 text-white text-xs px-2 py-1 rounded-full shadow-sm truncate">
  V / I / P (all formulas)
</div>

        </CardTitle>
      </CardHeader>
      <CardContent className="w-full max-w-full overflow-hidden">
        <MultiHistory history={history} />
      </CardContent>
    </Card>
  </motion.div>
</div>

          </div>
        </div>
      </main>

      {/* sticky mobile controls (centered, visible on small -> hide on large) */}
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden"
        role="region"
        aria-label="Mobile controls"
      >
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-black/80 to-zinc-900/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-4 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-4 py-2 border-zinc-700 text-black cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2 cursor-pointer" onClick={resetAll}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>

      {/* desktop quick controls (hidden on mobile, visible on lg+) */}
      <div className="hidden lg:flex fixed bottom-6 right-6 z-60 flex-col gap-2 p-2 bg-black/70 border border-zinc-800 rounded-lg shadow-lg">
        <Button className="px-3 cursor-pointer py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => setRunning(true)} aria-label="Run">
          <Play className="w-4 h-4" />
        </Button>
        <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)} aria-label="Pause">
          <Pause className="w-4 h-4" />
        </Button>
        <Button variant="ghost" className="px-3 py-2 border cursor-pointer border-zinc-800 text-zinc-300" onClick={resetAll} aria-label="Reset">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button variant="ghost" className="px-3 py-2 border cursor-pointer border-zinc-800 text-zinc-300" onClick={exportCSV} aria-label="Export CSV">
          <Download className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
