// src/pages/OhmsLawAdvanced.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Battery,
  CircuitBoard,
  Play,
  Pause,
  RefreshCw,
  Search,
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
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/* ===========================
   Utilities
   =========================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 2) =>
  Math.round((Number(v) + Number.EPSILON) * Math.pow(10, p)) / Math.pow(10, p);
const parseNumber = (value) => {
  if (value === "" || value === null || value === undefined) return NaN;
  const v = Number(value);
  return Number.isFinite(v) ? v : NaN;
};

/* ===========================
   Waveform generator
   =========================== */
function generateWaveform({ mode = "DC", V = 5, freq = 50, samples = 240 }) {
  const data = [];
  if (mode === "DC") {
    for (let i = 0; i < samples; i++) data.push({ x: i, y: V });
  } else {
    // AC sine with sample mapping
    for (let i = 0; i < samples; i++) {
      const y = Math.sin((i / samples) * freq * 2 * Math.PI) * V;
      data.push({ x: i, y });
    }
  }
  return data;
}

/* ===========================
   Dial component - improved ids
   =========================== */
function Dial({ label, value, max = 10, unit = "", accent = "#ff7a2d" }) {
  const pct = clamp(Math.abs(value) / Math.max(1, Math.abs(max)), 0, 1);
  const angle = -60 + pct * 120;
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className="flex flex-col items-center min-w-[110px]">
      <svg viewBox="-50 -50 100 70" width="120" height="80" className="block">
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" x2="1">
            <stop offset="0%" stopColor="#ff7a2d" />
            <stop offset="100%" stopColor="#ffd24a" />
          </linearGradient>
        </defs>
        <g transform="translate(0, -10)">
          <path d="M -40 20 A 40 40 0 0 1 40 20" fill="none" stroke="#222" strokeWidth="6" strokeLinecap="round" />
          <path d="M -36 18 A 36 36 0 0 1 36 18" fill="none" stroke={`url(#grad-${id})`} strokeWidth="3" strokeLinecap="round" />
          <line x1="0" y1="0" x2={Math.cos((angle * Math.PI) / 180) * 30} y2={Math.sin((angle * Math.PI) / 180) * 30} stroke={accent} strokeWidth="3" strokeLinecap="round" />
          <circle cx="0" cy="0" r="3" fill="#111" stroke={accent} strokeWidth="1" />
        </g>
      </svg>
      <div className="text-xs text-zinc-400 uppercase">{label}</div>
      <div className="text-sm font-semibold" style={{ color: accent }}>
        {Number.isFinite(value) ? `${round(value, 4)} ${unit}` : `-- ${unit}`}
      </div>
    </div>
  );
}

/* ===========================
   Circuit visual component
   Uses offset-path animation for pulses.
   Supports pausing by setting animationPlayState.
   =========================== */
function CircuitVisual({ V, I, R, mode, running, size = "md" }) {
  const baseSpeed = 2.5;
  const speed = clamp(baseSpeed / (Math.abs(I) + 0.15), 0.35, 3.5);
  const pulseCount = clamp(3 + Math.round(Math.abs(I) * 2), 1, 12);
  const pulses = Array.from({ length: pulseCount }, (_, i) => i);

  // responsive heights
  const heights = { sm: 200, md: 260, lg: 340 };
  const height = heights[size] || heights.md;

  const offsetPathStr = "path('M 80 60 H 360 V 180 H 540 H 220 V 80 H 80')";

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox="0 0 900 280" className="w-full" style={{ height }}>
        <defs>
          <linearGradient id="wireGradViz" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff7a2d" />
            <stop offset="100%" stopColor="#ffd24a" />
          </linearGradient>
          <filter id="glowViz" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4.0" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Wires */}
        <path d="M 80 60 H 360" stroke="#2b2b2b" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M 360 60 V 180 H 540" stroke="#2b2b2b" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M 540 180 H 220" stroke="#2b2b2b" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M 220 180 V 80 H 80" stroke="#2b2b2b" strokeWidth="4" fill="none" strokeLinecap="round" />

        {/* Battery */}
        <g transform="translate(40, 78)">
          <rect x="0" y="0" width="32" height="60" rx="4" fill="#0b0b0b" stroke="#333" />
          <rect x="36" y="10" width="6" height="40" rx="2" fill="#ffd24a" />
          <text x="0" y="-6" fill="#ffb57a" fontSize="12">{Number.isFinite(V) ? round(V, 2) : "--"} V</text>
        </g>

        {/* Resistor */}
        <g transform="translate(370, 60)">
          <path d="M 0 10 l 10 -20 l 10 40 l 10 -40 l 10 40 l 10 -20" stroke="#ff7a2d" strokeWidth="5" fill="none" strokeLinecap="round" />
          <text x="0" y="56" fill="#ffd24a" fontSize="12">{Number.isFinite(R) ? `${round(R, 2)} Ω` : "-- Ω"}</text>
        </g>

        {/* Ammeter */}
        <g transform="translate(260, 140)">
          <circle r="24" fill="#0b0b0b" stroke="#333" />
          <path d="M -14 6 A 20 20 0 0 1 14 6" fill="none" stroke="#ff7a2d" strokeWidth="2" />
          <text x="-8" y="4" fill="#ffd24a" fontSize="10">A</text>
        </g>

        {/* Voltmeter */}
        <g transform="translate(420, 52)">
          <circle r="18" fill="#0b0b0b" stroke="#333" />
          <text x="-8" y="4" fill="#ffd24a" fontSize="10">V</text>
        </g>

        {/* Pulses */}
        {pulses.map((p, i) => {
          const delay = (i * (speed / pulseCount));
          const dur = speed;
          return (
            <circle
              key={`pl-${i}`}
              r="6"
              fill="url(#wireGradViz)"
              style={{
                filter: "url(#glowViz)",
                offsetPath: offsetPathStr,
                offsetRotate: "auto",
                animation: `moveAlong ${dur}s linear ${delay}s infinite`,
                animationPlayState: running ? "running" : "paused",
              }}
            />
          );
        })}

        <style>{`
          @keyframes moveAlong {
            0% { offset-distance: 0%; opacity: 0.95; transform: translate(-6px, -6px) scale(0.95); }
            10% { opacity: 1; }
            50% { opacity: 0.92; transform: translate(0,0) scale(1.06); }
            100% { offset-distance: 100%; opacity: 0.06; transform: translate(6px, 6px) scale(0.9); }
          }
        `}</style>
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-between mt-3 text-xs sm:text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className="backdrop-blur bg-[rgba(255,122,45,0.06)] border border-[rgba(255,122,45,0.12)] text-[#ffb57a]">Mode: {mode}</Badge>
          <Badge className="backdrop-blur bg-[rgba(255,255,255,0.02)] border border-zinc-800 text-zinc-300">I: {Number.isFinite(I) ? `${round(I, 4)} A` : "-- A"}</Badge>
          <Badge className="backdrop-blur bg-[rgba(255,255,255,0.02)] border border-zinc-800 text-zinc-300">V: {Number.isFinite(V) ? `${round(V, 4)} V` : "-- V"}</Badge>
        </div>
        <div className="text-zinc-500">Pulses speed ∝ current (I)</div>
      </div>
    </div>
  );
}

/* ===========================
   Main page component
   =========================== */
export default function OhmsLawAdvanced() {
  // basic controls
  const [mode, setMode] = useState("DC"); // DC | AC
  const [compute, setCompute] = useState("V"); // V | I | R
  const [Vraw, setVraw] = useState("5");
  const [Iraw, setIraw] = useState("1");
  const [Rraw, setRraw] = useState("5");
  const [freq, setFreq] = useState(50);
  const [running, setRunning] = useState(true);

  // history for charts
  const [history, setHistory] = useState(() => {
    const arr = [];
    for (let i = 0; i < 48; i++) arr.push({ t: i, V: 0, I: 0, R: 0 });
    return arr;
  });

  // graph selector - which graphs to show
  const [graphMode, setGraphMode] = useState("VI"); // "VI" | "RI" | "VR" | "ALL"

  // parsed values
  const V = parseNumber(Vraw);
  const I = parseNumber(Iraw);
  const R = parseNumber(Rraw);

  // compute missing variable
  const computed = useMemo(() => {
    if (compute === "V") {
      if (Number.isFinite(I) && Number.isFinite(R)) return I * R;
      return NaN;
    }
    if (compute === "I") {
      if (Number.isFinite(V) && Number.isFinite(R) && R !== 0) return V / R;
      return NaN;
    }
    if (compute === "R") {
      if (Number.isFinite(V) && Number.isFinite(I) && I !== 0) return V / I;
      return NaN;
    }
    return NaN;
  }, [compute, V, I, R]);

  // when user chooses compute, clear that field so they can enter others
  useEffect(() => {
    if (compute === "V") setVraw("");
    if (compute === "I") setIraw("");
    if (compute === "R") setRraw("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compute]);

  // waveform for oscilloscope
  const waveform = useMemo(() => {
    const amp = Number.isFinite(V) ? Math.abs(V) : Number.isFinite(computed) ? Math.abs(computed) : 1;
    return generateWaveform({ mode, V: amp, freq, samples: 240 });
  }, [mode, V, computed, freq]);

  // derived displayed values
  const displayedV = Number.isFinite(V) ? V : compute === "V" && Number.isFinite(computed) ? computed : 0;
  const displayedI = Number.isFinite(I) ? I : compute === "I" && Number.isFinite(computed) ? computed : 0;
  const displayedR = Number.isFinite(R) ? R : compute === "R" && Number.isFinite(computed) ? computed : 0;

  // history update interval (real-time simulation)
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setHistory((prev) => {
        const lastT = prev.length ? prev[prev.length - 1].t : 0;
        const newPoint = {
          t: lastT + 1,
          V: Number.isFinite(V) ? V : compute === "V" && Number.isFinite(computed) ? computed : 0,
          I: Number.isFinite(I) ? I : compute === "I" && Number.isFinite(computed) ? computed : 0,
          R: Number.isFinite(R) ? R : compute === "R" && Number.isFinite(computed) ? computed : 0,
        };
        const next = [...prev.slice(-140), newPoint]; // cap length
        return next;
      });
    }, 430);
    return () => clearInterval(id);
  }, [Vraw, Iraw, Rraw, compute, computed, running]);

  // helper to reset
  const resetAll = () => {
    setVraw("5");
    setIraw("1");
    setRraw("5");
    setHistory(() => {
      const arr = [];
      for (let i = 0; i < 48; i++) arr.push({ t: i, V: 0, I: 0, R: 0 });
      return arr;
    });
  };

  // prepare data sets for the three graphs (V-I, R-I, V-R)
  const viData = useMemo(() => {
    // produce pairs from history where both V and I are finite
    return history.map((d) => ({ x: d.V, y: d.I, t: d.t })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  }, [history]);

  const riData = useMemo(() => {
    return history.map((d) => ({ x: d.R, y: d.I, t: d.t })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  }, [history]);

  const vrData = useMemo(() => {
    return history.map((d) => ({ x: d.V, y: d.R, t: d.t })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  }, [history]);

  // responsive circuit size: small <640, md >=640 <1024, large >=1024
  const [circuitSize, setCircuitSize] = useState("md");
  useEffect(() => {
    const handler = () => {
      const w = window.innerWidth;
      if (w < 640) setCircuitSize("sm");
      else if (w < 1024) setCircuitSize("md");
      else setCircuitSize("lg");
    };
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  /* ===========
     Render
     =========== */
  return (
    <div className="min-h-screen   bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-black/40 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">
                <Zap className="w-5 h-5" />
              </div>
              <div className="truncate">
                <div className="text-sm text-zinc-300 leading-none truncate">SparkLab</div>
                <div className="text-xs text-zinc-400 -mt-0.5 truncate">Ohm’s Law Visualizer</div>
              </div>
            </div>

            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:block w-56">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                  <Input placeholder="Search docs..." className="pl-9 bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-500" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button className="hidden sm:inline-flex bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => window.location.href = "/signup"}>Get Started</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top grid (controls + preview) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls col */}
          <div className="lg:col-span-5">
            <motion.div layout className="p-1 rounded-2xl bg-gradient-to-r from-[#ff7a2d]/8 to-[#ffd24a]/6">
              <Card className="bg-black/70 backdrop-blur-md rounded-2xl border border-zinc-800 overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <CircuitBoard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg text-orange-499 font-semibold">Ohm’s Law</div>
                        <div className="text-xs text-zinc-400">Compute V = I × R (live, interactive)</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="backdrop-blur bg-[rgba(255,122,45,0.06)] border border-[rgba(255,122,45,0.12)] text-[#ffb57a]">{mode} Mode</Badge>
                      <Select value={mode} onValueChange={(v) => setMode(v)}>
                        <SelectTrigger className="w-28 bg-zinc-900/70 border border-zinc-800 text-orange-400 hover:border-orange-400 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition">
                            <SelectValue placeholder="Select Mode" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-lg">
                            <SelectItem
                            value="DC"
                            className="text-orange-300 hover:bg-orange-600/30 hover:text-white cursor-pointer transition"
                            >
                            DC
                            </SelectItem>
                            <SelectItem
                            value="AC"
                            className="text-orange-300 hover:bg-orange-600/30 hover:text-white cursor-pointer transition"
                            >
                            AC
                            </SelectItem>
                        </SelectContent>
                        </Select>

                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm text-zinc-400 mb-2">Compute</div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setCompute("V")} className={`px-3 py-2 rounded-lg cursor-pointer text-sm ${compute === "V" ? "bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" : "bg-zinc-900 border border-zinc-800 text-zinc-300"}`}>Voltage (V)</button>
                      <button onClick={() => setCompute("I")} className={`px-3 py-2 rounded-lg cursor-pointer text-sm ${compute === "I" ? "bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" : "bg-zinc-900 border border-zinc-800 text-zinc-300"}`}>Current (A)</button>
                      <button onClick={() => setCompute("R")} className={`px-3 py-2 rounded-lg cursor-pointer text-sm ${compute === "R" ? "bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" : "bg-zinc-900 border border-zinc-800 text-zinc-300"}`}>Resistance (Ω)</button>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {/* Voltage input */}
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Voltage (V)</label>
                      <div className="flex gap-2 items-center">
                        <Input type="number" value={Vraw} onChange={(e) => setVraw(e.target.value)} placeholder="Voltage (V)" className="bg-zinc-900/60 border-zinc-800 text-white" />
                        <input aria-label="Voltage slider" type="range" min="0" max="240" step="0.1" value={Number.isFinite(Number(Vraw)) ? Number(Vraw) : 0} onChange={(e) => setVraw(e.target.value)} className="w-40 accent-orange-400" />
                      </div>
                    </div>

                    {/* Current input */}
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Current (A)</label>
                      <div className="flex gap-2 items-center">
                        <Input type="number" value={Iraw} onChange={(e) => setIraw(e.target.value)} placeholder="Current (A)" className="bg-zinc-900/60 border-zinc-800 text-white" />
                        <input aria-label="Current slider" type="range" min="0" max="20" step="0.01" value={Number.isFinite(Number(Iraw)) ? Number(Iraw) : 0} onChange={(e) => setIraw(e.target.value)} className="w-40 accent-orange-400" />
                      </div>
                    </div>

                    {/* Resistance input */}
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Resistance (Ω)</label>
                      <div className="flex gap-2 items-center">
                        <Input type="number" value={Rraw} onChange={(e) => setRraw(e.target.value)} placeholder="Resistance (Ω)" className="bg-zinc-900/60 border-zinc-800 text-white" />
                        <input aria-label="Resistance slider" type="range" min="0" max="2000" step="0.1" value={Number.isFinite(Number(Rraw)) ? Number(Rraw) : 0} onChange={(e) => setRraw(e.target.value)} className="w-40 accent-orange-400" />
                      </div>
                    </div>

                    {/* Frequency */}
                    {mode === "AC" && (
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">AC Frequency (Hz)</label>
                        <div className="flex gap-2 items-center">
                          <Input type="number" value={freq} onChange={(e) => setFreq(Number(e.target.value || 1))} placeholder="Frequency (Hz)" className="bg-zinc-900/60 border-zinc-800 text-white" />
                          <input type="range" min="1" max="1000" step="1" value={freq} onChange={(e) => setFreq(Number(e.target.value))} className="w-40 accent-orange-400" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* computed + controls */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-xs text-zinc-400">Computed</div>
                      <div className="text-2xl font-bold text-[#ff9a4a]">
                        {compute === "V" ? (Number.isFinite(I) && Number.isFinite(R) ? `${round(I * R, 6)} V` : "-- V")
                          : compute === "I" ? (Number.isFinite(V) && Number.isFinite(R) && R !== 0 ? `${round(V / R, 6)} A` : "-- A")
                            : compute === "R" ? (Number.isFinite(V) && Number.isFinite(I) && I !== 0 ? `${round(V / I, 6)} Ω` : "-- Ω")
                              : "--"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="border-zinc-700 text-black cursor-pointer " onClick={resetAll}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Reset
                      </Button>
                      <Button className="cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => setRunning((r) => !r)}>
                        {running ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />} {running ? "Pause All" : "Run All"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* presets */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { id: "basic", label: "Basic: 5V, 1A", V: 5, I: 1, R: 5 },
                { id: "led", label: "LED: 5V, 20mA", V: 5, I: 0.02, R: 250 },
                { id: "motor", label: "Motor: 12V, 1.5A", V: 12, I: 1.5, R: 8 },
              ].map((p) => (
                <button key={p.id} onClick={() => { setVraw(String(p.V)); setIraw(String(p.I)); setRraw(String(p.R)); }} className="px-3 py-2 cursor-pointer bg-zinc-900 border border-zinc-800 rounded-lg text-sm hover:bg-zinc-800">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Visualizer & dials column */}
          <div className="lg:col-span-7 space-y-4">
            <motion.div layout className="p-1 rounded-2xl bg-gradient-to-r from-[#ff7a2d]/8 to-[#ffd24a]/6">
              <Card className="bg-black/70 backdrop-blur-md rounded-2xl border border-zinc-800 overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Battery className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-orange-400">Live Visualizer</div>
                        <div className="text-xs text-zinc-400">Real-time circuit, meters & oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className="backdrop-blur bg-[rgba(255,255,255,0.02)] border border-zinc-800 text-zinc-300">{compute}</Badge>
                      <Badge className="backdrop-blur bg-[rgba(255,255,255,0.02)] border border-zinc-800 text-zinc-300">Mode {mode}</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  {/* top: visual + dials */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                    <div className="lg:col-span-2">
                      {/* circuit visual — bigger and responsive */}
                      <div className="w-full rounded-xl overflow-hidden border border-zinc-800 p-3 bg-[linear-gradient(180deg,rgba(255,255,255,0.01),transparent)]">
                        <CircuitVisual V={displayedV} I={displayedI} R={displayedR} mode={mode} running={running} size={circuitSize} />
                      </div>
                    </div>

                    {/* dials + oscilloscope */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-around bg-zinc-900/30 rounded-xl p-3">
                        <Dial label="Voltage" value={displayedV} max={Math.max(12, Math.abs(displayedV) * 1.5)} unit="V" accent="#ff7a2d" />
                        <Dial label="Current" value={displayedI} max={Math.max(2, Math.abs(displayedI) * 1.5)} unit="A" accent="#ffd24a" />
                      </div>

                      {/* Oscilloscope card */}
                      <div className="bg-zinc-900/30 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-orange-400">Oscilloscope</div>
                          <div className="text-xs text-zinc-400">Realtime waveform</div>
                        </div>

                        <div style={{ height: 160 }} className="mb-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={waveform}>
                              <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
                              <XAxis dataKey="x" hide />
                              <YAxis domain={["auto", "auto"]} hide />
                              <Tooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222",borderRadius:"10px" }} />
                              <Line type="monotone" dataKey="y" stroke="#ff7a2d" strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setMode(mode === "DC" ? "AC" : "DC")} className="px-3 py-1 rounded-lg bg-orange-400 cursor-pointer border border-zinc-800 text-zinc-300">Toggle AC/DC</button>
                            <div className="text-xs text-zinc-400">Freq: {freq} Hz</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setFreq((f) => Math.max(1, f - 1))} className="px-2 py-1 bg-zinc-900 border text-orange-400 cursor-pointer border-zinc-800 rounded">-</button>
                            <button onClick={() => setFreq((f) => f + 1)} className="px-2 py-1 bg-zinc-900 border text-orange-400 cursor-pointer border-zinc-800 rounded">+</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* bottom: live history chart (V & I) */}
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-zinc-900/30 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-orange-400">Live History (Voltage / Current)</div>
                        <div className="text-xs text-zinc-400">updates while running</div>
                      </div>
                      <div style={{ height: 180 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={history}>
                            <CartesianGrid stroke="#1f1f1f" />
                            <XAxis dataKey="t" tick={{ fill: "#888" }} />
                            <YAxis tick={{ fill: "#888" }} />
                            <Tooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222",borderRadius:"10px" }} />
                            <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="I" stroke="#ff7a2d" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Graph selector & plots */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-orange-400">Analytical Plots</div>
                        <div className="flex items-center gap-2">
                          <Select value={graphMode} onValueChange={(v) => setGraphMode(v)}>
                            <SelectTrigger className="w-36 bg-zinc-900/70 border border-zinc-800 text-orange-400 hover:border-orange-400 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition">
                                <SelectValue placeholder="Select Graph" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-lg">
                                <SelectItem
                                className="text-orange-300 hover:bg-orange-600/30 hover:text-white cursor-pointer transition"
                                value="VI"
                                >
                                V - I
                                </SelectItem>
                                <SelectItem
                                className="text-orange-300 hover:bg-orange-600/30 hover:text-white cursor-pointer transition"
                                value="RI"
                                >
                                R - I
                                </SelectItem>
                                <SelectItem
                                className="text-orange-300 hover:bg-orange-600/30 hover:text-white cursor-pointer transition"
                                value="VR"
                                >
                                V - R
                                </SelectItem>
                                <SelectItem
                                className="text-orange-300 hover:bg-orange-600/30 hover:text-white cursor-pointer transition"
                                value="ALL"
                                >
                                All
                                </SelectItem>
                            </SelectContent>
                            </Select>

                        </div>
                      </div>

                      {/* Single or multiple plots depending on selector */}
                      <div className="grid grid-cols-1 gap-3">
                        {(graphMode === "VI" || graphMode === "ALL") && (
                          <div className="bg-zinc-900/30 rounded-xl p-2">
                            <div className="text-xs text-zinc-400 mb-2">V–I Curve</div>
                            <div style={{ height: 120 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={viData}>
                                  <CartesianGrid stroke="#1f1f1f" />
                                  <XAxis dataKey="x" tick={{ fill: "#888" }} />
                                  <YAxis tick={{ fill: "#888" }} />
                                  <Tooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222",borderRadius:"10px" }} />
                                  <Line dataKey="y" stroke="#ff7a2d" strokeWidth={2} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {(graphMode === "RI" || graphMode === "ALL") && (
                          <div className="bg-zinc-900/30 rounded-xl p-2">
                            <div className="text-xs text-zinc-400 mb-2">R–I Curve</div>
                            <div style={{ height: 120 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={riData}>
                                  <CartesianGrid stroke="#1f1f1f" />
                                  <XAxis dataKey="x" tick={{ fill: "#888" }} />
                                  <YAxis tick={{ fill: "#888" }} />
                                  <Tooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222",borderRadius:"10px" }} />
                                  <Line dataKey="y" stroke="#ffd24a" strokeWidth={2} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {(graphMode === "VR" || graphMode === "ALL") && (
                          <div className="bg-zinc-900/30 rounded-xl p-2">
                            <div className="text-xs text-zinc-400 mb-2">V–R Curve</div>
                            <div style={{ height: 120 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={vrData}>
                                  <CartesianGrid stroke="#1f1f1f" />
                                  <XAxis dataKey="x" tick={{ fill: "#888" }} />
                                  <YAxis tick={{ fill: "#888" }} />
                                  <Tooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222",borderRadius:"10px" }} />
                                  <Line dataKey="y" stroke="#ff7a2d" strokeWidth={2} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
