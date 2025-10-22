// src/pages/CalibrationSimPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Activity,
  CircuitBoard,
  Play,
  Pause,
  Plus,
  Trash2,
  Layers,
  Gauge,
  Download,
  Settings,
  Menu,
  X,
  Lightbulb,
  Cpu,
  Sliders,
  User,
  FileText as Tool,
  Thermometer,
  BarChart2,
  Eye,
  ZapOff,
  Wrench,
  RotateCcw,
  ActivitySquare,
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
import { toPng } from "html-to-image";

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
const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/* ============================
   Calibration Simulation Hook
   - Simulates devices and measurements with noise/drift
   ============================ */
function useCalibrationSim({
  running,
  device = "multimeter",
  timestep = 80,
  targetValue = 5.0,
  seriesResistance = 10,
  manualOverride = null,
  calibration = { offset: 0, gain: 1.0 }, // applied to raw readings to produce corrected measurement
}) {
  const historyRef = useRef(Array.from({ length: 400 }, (_, i) => ({ t: i, raw: 0, meas: 0 })));
  const historyLen = 600;
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(nowMs());
  const rafRef = useRef(null);

  // Device specific dynamic model:
  const computeInstant = useCallback(
    (tSeconds) => {
      // Raw signal generation depending on device
      if (device === "multimeter") {
        // DC measurement with small random drift and exponential settling toward targetValue
        const settlingTau = 0.8 + Math.abs((targetValue || 1) / 10);
        const base = targetValue || 0;
        // simulate slight sinusoidal noise + gaussian noise
        const sin = Math.sin(tSeconds * 2 * Math.PI * 0.5) * (0.002 * Math.max(1, Math.abs(base)));
        const noise = (Math.random() - 0.5) * 0.005 * Math.max(1, Math.abs(base));
        // approach base using 1 - exp(-t/tau)
        const approach = base * (1 - Math.exp(-tSeconds / settlingTau));
        const raw = approach + sin + noise;
        return { raw, type: "voltage" };
      } else if (device === "oscilloscope") {
        // simulate waveform: sinewave whose amplitude is targetValue, plus phase and jitter
        const freq = 2 + ((targetValue || 1) % 3); // vary frequency a bit by target
        const amplitude = Math.max(0.001, Math.abs(targetValue || 1));
        const raw = amplitude * Math.sin(2 * Math.PI * freq * tSeconds + (Math.random() - 0.5) * 0.1) + (Math.random() - 0.5) * 0.02 * amplitude;
        return { raw, type: "wave" };
      } else if (device === "functionGenerator") {
        // output is a controlled waveform - simulate amplitude and offset
        const freq = 1 + ((targetValue || 1) % 4);
        const amplitude = Math.max(0.001, Math.abs(targetValue || 1));
        const raw = amplitude * Math.sin(2 * Math.PI * freq * tSeconds);
        return { raw, type: "wave" };
      } else {
        // fallback
        const raw = (Math.random() - 0.5) * 0.01;
        return { raw, type: "voltage" };
      }
    },
    [device, targetValue]
  );

  useEffect(() => {
    let alive = true;
    lastRef.current = nowMs();

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

      // compute raw
      const inst = computeInstant(tSeconds);
      let raw = inst.raw;

      // simulate measurement chain (meter internal offset/gain/drift)
      // Add slow drift over long time
      const drift = Math.sin(tSeconds / 30) * 0.002 * (Math.sign(targetValue || 1));
      raw = raw * (1 + drift);

      // apply manual override if provided
      if (manualOverride !== null && manualOverride !== undefined) {
        raw = manualOverride;
      }

      // calibration applied: meas = raw * gain + offset
      const meas = raw * (calibration.gain || 1) + (calibration.offset || 0);

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, raw, meas });
        if (next.length > historyLen) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeInstant, manualOverride, calibration, historyLen]);

  // latest values
  const latest = history.length ? history[history.length - 1] : { raw: 0, meas: 0 };

  return { history, latest };
}

/* ============================
   Small Gauge Components
   - Ammeter / Voltmeter needles rendered in SVG
   ============================ */
function NeedleGauge({ value = 0, min = -10, max = 10, label = "V", units = "V", size = 140 }) {
  // Map value to angle: -120deg to +120deg
  const clampVal = clamp(value, min, max);
  const angle = ((clampVal - min) / (max - min)) * 240 - 120; // -120..+120

  const center = size / 2;
  const radius = center - 12;
  return (
    <svg width={size} height={size / 1.1} viewBox={`0 0 ${size} ${size / 1.1}`} className="block">
      <defs>
        <linearGradient id="gaugeGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#ff7a2d" />
          <stop offset="100%" stopColor="#ffd24a" />
        </linearGradient>
      </defs>
      <g transform={`translate(${center},${center / 1.05})`}>
        <circle r={radius} fill="#060606" stroke="#222" strokeWidth="3" />
        {/* ticks */}
        {Array.from({ length: 11 }).map((_, i) => {
          const a = -120 + (i * 24);
          const rad = (a * Math.PI) / 180;
          const x1 = Math.cos(rad) * (radius - 6);
          const y1 = Math.sin(rad) * (radius - 6);
          const x2 = Math.cos(rad) * (radius - 18);
          const y2 = Math.sin(rad) * (radius - 18);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#222" strokeWidth="2" />;
        })}
        {/* needle */}
        <g transform={`rotate(${angle})`}>
          <rect x="-3" y="-6" width="6" height={radius - 22} rx="3" fill="url(#gaugeGrad)" />
        </g>
        <circle r="6" fill="#111" stroke="#333" strokeWidth="2" />
        {/* center text */}
        <text x="0" y={radius / 4} fontSize="12" fill="#ffd24a" textAnchor="middle" fontWeight="600">{label}</text>
        <text x="0" y={radius / 2} fontSize="11" fill="#fff" textAnchor="middle">{round(value, 6)} {units}</text>
      </g>
    </svg>
  );
}

/* ============================
   Visualizer: circuit + animated flow + probes
   - Animated dots driven by measured value to simulate current flow
   ============================ */
 function CalibrationVisualizer({
  device,
  history,
  latest,
  running,
  probes = {},
  width = "100%",
}) {
  const val = latest ? latest.meas || 0 : 0;
  const absVal = Math.abs(val);
  const dotCount = clamp(Math.round(6 + absVal * 8), 6, 30);
  const speed = clamp(1.0 / (absVal + 0.02), 0.15, 2.5);
  const svgW = 1000;
  const svgH = 280;
  const fmt = (v) => (Number.isFinite(v) ? round(v, 4) : "--");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative w-full rounded-xl p-5 bg-gradient-to-b from-black/70 to-zinc-900/50 border border-zinc-800 overflow-hidden shadow-[0_0_25px_#000_inset]"
    >
      {/* Neon glow background lines */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-full h-[2px] top-0 bg-gradient-to-r from-[#ff7a2d40] via-[#ffd24a70] to-[#ff7a2d40] blur-sm animate-pulse" />
        <div className="absolute bottom-0 w-full h-[1px] bg-gradient-to-r from-[#ffd24a20] via-[#00ffbf40] to-[#ff9a4a30]" />
      </div>

      {/* Header */}
      <div className="flex items-start flex-col sm:flex-row justify-between gap-3 z-10 relative">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center shadow-[0_0_20px_#ffb84d60]">
            <CircuitBoard className="w-6 h-6" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a] tracking-wide">
              Calibration Visualizer
            </div>
            <div className="text-xs text-zinc-400">
              Real-time flow • active probes • precision meters
            </div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900/80 border border-zinc-700 text-zinc-300 px-3 py-1 rounded-full backdrop-blur">
            Device:
            <span className="text-[#ffd24a] ml-1 font-medium">{device}</span>
          </Badge>
          <Badge className="bg-zinc-900/80 border border-zinc-700 text-zinc-300 px-3 py-1 rounded-full backdrop-blur">
            Measured:
            <span className="text-[#00ffbf] ml-1 font-medium">
              {fmt(latest ? latest.meas : 0)}
            </span>
          </Badge>
        </div>
      </div>

      {/* SVG VISUALIZATION */}
      <div className="mt-4 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-72"
        >
          {/* main circuit bus */}
          <rect
            x="60"
            y={svgH / 2 - 22}
            width={svgW - 120}
            height="44"
            rx="10"
            fill="url(#busGrad)"
            stroke="#222"
            strokeWidth="1.2"
          />

          {/* source */}
          <g transform={`translate(110,${svgH / 2 - 10})`}>
            <rect
              x="-36"
              y="-30"
              width="72"
              height="60"
              rx="10"
              fill="url(#blockGrad)"
              stroke="#333"
            />
            <text
              x="0"
              y="6"
              fontSize="12"
              fill="#ffd24a"
              textAnchor="middle"
              fontFamily="monospace"
            >
              Source
            </text>
          </g>

          {/* load */}
          <g transform={`translate(${svgW - 60},${svgH / 2 - 10})`}>
            <rect
              x="-36"
              y="-30"
              width="72"
              height="60"
              rx="10"
              fill="url(#blockGrad)"
              stroke="#333"
            />
            <text
              x="0"
              y="6"
              fontSize="12"
              fill="#ff9a4a"
              textAnchor="middle"
              fontFamily="monospace"
            >
              Load
            </text>
          </g>

          {/* glowing current flow */}
          {Array.from({ length: dotCount }).map((_, di) => {
            const frac = di / dotCount;
            const x =
              160 + frac * (svgW - 320) +
              Math.sin((di + (Date.now() % 1000) / 200) * 3.14) * 4;
            const y = svgH / 2;
            const delay = (di / dotCount) * speed;
            const color = val >= 0 ? "#ffd24a" : "#ff6a9a";
            const glow = val >= 0 ? "#ffd24a88" : "#ff6a9a88";
            const style = {
              animationName: "flowPulse",
              animationDuration: `${speed}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
            };
            return (
              <circle
                key={`dot-${di}`}
                cx={x}
                cy={y}
                r="4.5"
                fill={color}
                stroke={glow}
                strokeWidth="1.4"
                style={style}
              />
            );
          })}

          {/* meters area */}
          <g transform={`translate(${svgW / 2 + 180},${svgH / 2 - 60})`}>
            <foreignObject x="-140" y="-22" width="280" height="140">
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex gap-3">
                  <div className="w-36 backdrop-blur bg-zinc-900/40 p-1 rounded-xl border border-zinc-800/70 shadow-[0_0_15px_#ffb84d20]">
                    <NeedleGauge
                      value={latest ? latest.meas : 0}
                      min={-10}
                      max={10}
                      label={device === "multimeter" ? "V" : "A"}
                      units={device === "multimeter" ? "V" : "A"}
                      size={120}
                    />
                  </div>
                  <div className="w-36 backdrop-blur bg-zinc-900/40 p-1 rounded-xl border border-zinc-800/70 shadow-[0_0_15px_#00ffbf20]">
                    <NeedleGauge
                      value={
                        history && history.length
                          ? history[history.length - 1].raw
                          : 0
                      }
                      min={-10}
                      max={10}
                      label="Raw"
                      units=""
                      size={120}
                    />
                  </div>
                </div>
              </div>
            </foreignObject>
          </g>

          {/* probe A & B */}
          {[
            { x: svgW / 2 - 120, label: "Probe A", val: probes.A },
            { x: svgW / 2 + 80, label: "Probe B", val: probes.B },
          ].map((p, i) => (
            <g key={i} transform={`translate(${p.x},${svgH / 2 - 80})`}>
              <rect
                x="-32"
                y="-20"
                width="64"
                height="40"
                rx="8"
                fill="url(#blockGrad)"
                stroke="#222"
              />
              <text
                x="0"
                y="0"
                fontSize="11"
                fill="#fff"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {p.label}
              </text>
              <text
                x="0"
                y="15"
                fontSize="10"
                fill="#ffd24a"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {fmt(p.val ?? latest.meas)}
              </text>
            </g>
          ))}

          {/* defs for gradients */}
          <defs>
            <linearGradient id="busGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#202020" />
              <stop offset="50%" stopColor="#333" />
              <stop offset="100%" stopColor="#202020" />
            </linearGradient>
            <linearGradient id="blockGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#111" />
              <stop offset="100%" stopColor="#1e1e1e" />
            </linearGradient>
          </defs>

          <style>{`
            @keyframes flowPulse {
              0% { transform: translateX(-3px); opacity: 0.7; }
              50% { transform: translateX(3px); opacity: 1; }
              100% { transform: translateX(-3px); opacity: 0.7; }
            }
            circle[style] { will-change: transform, opacity; }
            text { user-select: none; }
          `}</style>
        </svg>
      </div>
    </motion.div>
  );
}


/* ============================
   Oscilloscope/Plot
   ============================ */
function ScopePlot({ history = [], device = "multimeter", running }) {
  // build dataset last N points
  const data = history.slice(-360).map((d, idx) => ({ t: idx, raw: round(d.raw, 6), meas: round(d.meas, 6) }));
  const yKey = device === "oscilloscope" ? "raw" : "meas";

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Scope — {device === "oscilloscope" ? "Waveform" : "Measurement Trace"}</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "8px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="meas" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Corrected" />
            <Line type="monotone" dataKey="raw" stroke="#00ffbf" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Raw" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page Component: CalibrationSimPage
   ============================ */
export default function CalibrationSimPage() {
  const [device, setDevice] = useState("multimeter"); // multimeter | oscilloscope | functionGenerator
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [targetValue, setTargetValue] = useState("5"); // user target (V or amplitude)
  const [seriesResistance, setSeriesResistance] = useState("10");
  const [manualOverride, setManualOverride] = useState("");
  const [calOffset, setCalOffset] = useState("0");
  const [calGain, setCalGain] = useState("1.0");
  const [probeA, setProbeA] = useState("");
  const [probeB, setProbeB] = useState("");
  const [preset, setPreset] = useState("default");

  const calibration = useMemo(() => ({ offset: toNum(calOffset) || 0, gain: toNum(calGain) || 1 }), [calOffset, calGain]);

  const { history, latest } = useCalibrationSim({
    running,
    device,
    timestep: 80,
    targetValue: Number.isFinite(Number(targetValue)) ? Number(targetValue) : 0,
    seriesResistance: Number.isFinite(Number(seriesResistance)) ? Number(seriesResistance) : 10,
    manualOverride: manualOverride === "" ? null : Number(manualOverride),
    calibration,
  });

  // quick computed displays
  const latestRaw = latest ? latest.raw : 0;
  const latestMeas = latest ? latest.meas : 0;

  // controls
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetAll = () => {
    setDevice("multimeter");
    setTargetValue("5");
    setSeriesResistance("10");
    setManualOverride("");
    setCalOffset("0");
    setCalGain("1.0");
    setProbeA("");
    setProbeB("");
    setPreset("default");
    toast("Reset to defaults");
  };

  const exportCSV = () => {
    const rows = [["t", "raw", "meas"], ...history.map((d) => [d.t, d.raw, d.meas])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calib-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const quickAutoCalibrate = () => {
    // simple routine: estimate offset as average difference between target and raw over last N points,
    // and estimate gain as ratio; then set calibration state
    const N = Math.min(history.length, 120);
    const sample = history.slice(-N);
    if (sample.length < 6) {
      toast.error("Not enough samples to auto-calibrate");
      return;
    }
    const rawAvg = sample.reduce((a, b) => a + b.raw, 0) / sample.length;
    const measAvg = sample.reduce((a, b) => a + b.meas, 0) / sample.length;
    const target = Number.isFinite(Number(targetValue)) ? Number(targetValue) : measAvg;
    // estimate gain = (target - offset)/rawAvg; we try a small linear fit
    const estimatedGain = rawAvg !== 0 ? (target / rawAvg) : 1;
    const estimatedOffset = target - estimatedGain * rawAvg;
    setCalGain(round(estimatedGain, 6).toString());
    setCalOffset(round(estimatedOffset, 6).toString());
    toast.success("Auto-calibration applied");
  };

  const applyPreset = (p) => {
    if (p === "low-voltage") {
      setDevice("multimeter");
      setTargetValue("0.5");
      setSeriesResistance("50");
    } else if (p === "audio-scope") {
      setDevice("oscilloscope");
      setTargetValue("1.0");
      setSeriesResistance("10");
    } else {
      setDevice("multimeter");
      setTargetValue("5");
      setSeriesResistance("10");
    }
    setPreset(p);
    toast(`Applied preset: ${p}`);
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
  return (
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md hover:scale-105 transition-transform duration-200">
                <Zap className="w-6 h-6 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200">SparkLab — Calibration</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5">Instrument Calibration Simulator</div>
              </div>
            </motion.div>

            {/* Desktop Controls */}
            <div className="hidden md:flex items-center gap-4">
              <div className="w-40">
                <Select value={device} onValueChange={(v) => setDevice(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Device" />
                  </SelectTrigger>

                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="multimeter"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Multimeter</SelectItem>
                    <SelectItem value="oscilloscope"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Oscilloscope</SelectItem>
                    <SelectItem value="functionGenerator"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Function Generator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-1 cursor-pointer rounded-lg" onClick={snapshotPNG}>Snapshot</Button>
                <Button variant="ghost" className="border border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer p-2 rounded-lg" onClick={toggleRunning} title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" className="border border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer p-2 rounded-lg" onClick={resetAll}><Settings className="w-5 h-5" /></Button>
              </div>
            </div>

            {/* mobile toggle */}
            <div className="md:hidden">
              <Button variant="ghost" className="border border-zinc-800 p-2 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* mobile panel */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Select value={device} onValueChange={(v) => setDevice(v)}>
                  <SelectTrigger className="w-full bg-black/80  border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Device" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="multimeter"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Multimeter</SelectItem>
                    <SelectItem value="oscilloscope"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Oscilloscope</SelectItem>
                    <SelectItem value="functionGenerator"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Function Generator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 cursor-pointer rounded-md" onClick={snapshotPNG} >Snapshot</Button>
                <Button variant="ghost" className="flex-1 border border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
                <Button variant="ghost" className="flex-1 border border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer text-xs py-2 rounded-md" onClick={resetAll}>Reset</Button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="h-16 sm:h-16"></div>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Controls */}
<div className="lg:col-span-4 space-y-6">
  {/* Calibration Controls */}
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.28 }}
  >
    <Card className="bg-gradient-to-b from-black/60 via-zinc-900/40 to-zinc-950/30 border border-zinc-800 rounded-2xl shadow-[0_0_25px_rgba(255,122,45,0.08)] backdrop-blur-sm overflow-hidden w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center shadow-md">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-[#ffd24a]">Calibration Controls</div>
              <div className="text-xs text-zinc-400">Select device • Set target • Apply calibration</div>
            </div>
          </div>

          <Badge className="bg-zinc-900/60 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-[0_0_10px_rgba(255,160,60,0.3)] backdrop-blur-sm">
            <Gauge className="w-3.5 h-3.5 mr-1" /> Mode
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Target & Resistance */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs text-zinc-400">Target Value (V / amplitude)</label>
            <Input
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              type="number"
              className="bg-zinc-900/60 border border-zinc-800 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-[#ff7a2d]"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400">Series Resistance (Ω)</label>
            <Input
              value={seriesResistance}
              onChange={(e) => setSeriesResistance(e.target.value)}
              type="number"
              className="bg-zinc-900/60 border border-zinc-800 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-[#ffd24a]"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400">Manual Override (raw)</label>
            <Input
              value={manualOverride}
              onChange={(e) => setManualOverride(e.target.value)}
              placeholder="Leave empty for simulated"
              type="text"
              className="bg-zinc-900/60 border border-zinc-800 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-orange-500"
            />
            <div className="text-xs text-zinc-500 mt-1">
              Use to inject a fixed raw value (e.g., test probe reading)
            </div>
          </div>
        </div>

        {/* Calibration Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-400">Calibration</div>
              <div className="text-sm text-white font-medium">Offset & Gain</div>
            </div>
            <Badge className="bg-zinc-900/60 border border-orange-400 text-orange-300 rounded-full px-3 py-1 shadow-[0_0_10px_rgba(255,180,60,0.2)]">
              <Wrench className="w-3.5 h-3.5 mr-1" />
              {calibration.gain}× + {calibration.offset}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              value={calOffset}
              onChange={(e) => setCalOffset(e.target.value)}
              type="number"
              className="bg-zinc-900/60 border border-zinc-800 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-[#ff7a2d]"
            />
            <Input
              value={calGain}
              onChange={(e) => setCalGain(e.target.value)}
              type="number"
              className="bg-zinc-900/60 border border-zinc-800 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-[#ffd24a]"
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] hover:opacity-90 cursor-pointer"
              onClick={quickAutoCalibrate}
            >
              <Tool className="w-4 h-4 mr-2" /> Auto Calibrate
            </Button>

            <Button
              variant="ghost"
              className="flex-1 border border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 bg-black cursor-pointer"
              onClick={() => {
                setCalGain("1.0");
                setCalOffset("0");
                toast("Calibration reset");
              }}
            >
              <RotateCcw className="w-4 h-4 mr-2" /> Reset
            </Button>
          </div>
        </div>

        {/* Probes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-zinc-400 flex items-center gap-1">
              <ActivitySquare className="w-3.5 h-3.5" /> Probes
            </div>
            <div className="text-xs text-zinc-400">Simulated probe values</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Probe A (optional)"
              value={probeA}
              onChange={(e) => setProbeA(e.target.value)}
              type="number"
              className="bg-zinc-900/60 border border-zinc-800 text-white focus:ring-1 focus:ring-[#ff7a2d]"
            />
            <Input
              placeholder="Probe B (optional)"
              value={probeB}
              onChange={(e) => setProbeB(e.target.value)}
              type="number"
              className="bg-zinc-900/60 border border-zinc-800 text-white focus:ring-1 focus:ring-[#ffd24a]"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <Button
              className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer hover:opacity-90"
              onClick={() => setRunning(true)}
            >
              <Play className="w-4 h-4 mr-2" /> Run
            </Button>
            <Button
              variant="outline"
              className="px-3 py-2 border border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 bg-black cursor-pointer"
              onClick={() => setRunning(false)}
            >
              <Pause className="w-4 h-4 mr-2" /> Pause
            </Button>
          </div>

          <Button
            variant="ghost"
            className="border border-zinc-800  p-2 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer"
            onClick={exportCSV}
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  </motion.div>

  {/* Presets */}
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
  >
    <Card className="bg-gradient-to-b from-black/60 via-zinc-900/40 to-zinc-950/30 border border-zinc-800 rounded-2xl shadow-[0_0_25px_rgba(255,122,45,0.08)] overflow-hidden backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center shadow-md">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-[#ffd24a]">Presets</div>
              <div className="text-xs text-zinc-400">Quick start configurations</div>
            </div>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] hover:opacity-90 cursor-pointer"
            onClick={() => applyPreset('default')}
          >
            Default
          </Button>
          <Button
            className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] hover:opacity-90 cursor-pointer"
            onClick={() => applyPreset('low-voltage')}
          >
            Low V
          </Button>
          <Button
            className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] hover:opacity-90 cursor-pointer"
            onClick={() => applyPreset('audio-scope')}
          >
            Audio Scope
          </Button>
        </div>
      </CardContent>
    </Card>
  </motion.div>
</div>


          {/* Right: Visual + Scope + Summary */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border snapshot border-zinc-800 rounded-2xl w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                        <CircuitBoard className="w-5 h-5 text-black" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Instrument Visualizer</div>
                        <div className="text-xs text-zinc-400">Real-time probe & meter simulation</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Device: <span className="text-[#ffd24a] ml-1">{device}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Target: <span className="text-[#ffd24a] ml-1">{targetValue}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full overflow-hidden">
                  <CalibrationVisualizer device={device} history={history} latest={latest} running={running} probes={{ A: probeA === "" ? null : Number(probeA), B: probeB === "" ? null : Number(probeB) }} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <ScopePlot history={history} device={device} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Gauge className="w-5 h-5" /> Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Latest Raw</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{round(latestRaw, 6)}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Corrected</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(latestMeas, 6)}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Calibration</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{`${calibration.gain}× + ${calibration.offset}`}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Probe A</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{probeA === "" ? "—" : probeA}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Probe B</div>
                      <div className="text-lg font-semibold text-[#9ee6ff]">{probeB === "" ? "—" : probeB}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Preset</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{preset}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb /></span>
                    <span>
                      Tip: Use <span className="text-white font-semibold">Auto Calibrate</span> after letting the simulation run for a few seconds to compute offset/gain.
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
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm cursor-pointer" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer bg-black text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
