// src/pages/ErrorCalculatorPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Activity,
  Gauge,
  Download,
  Settings,
  Menu,
  X,
  Play,
  Pause,
  Triangle,
  Circle,
  AlertTriangle,
  Database,
  Cpu,
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
const round = (v, p = 4) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================
   Simulation Hook
   - maintains a history of readings for oscilloscope and animation
   ============================ */
function useErrorSim({ running, timestep = 120, practical = 0, theoretical = 0 }) {
  const historyRef = useRef(Array.from({ length: 160 }, (_, i) => ({ t: i, practical: 0, theoretical: 0, absErr: 0, pctErr: 0 })));
  const [history, setHistory] = useState(historyRef.current);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  const computeMetrics = useCallback((pr, th) => {
    const p = Number(pr);
    const t = Number(th);
    if (!Number.isFinite(p) || !Number.isFinite(t)) return { abs: NaN, pct: NaN, signedPct: NaN };
    const abs = p - t;
    const pct = (Math.abs(abs) / (Math.abs(t) > 0 ? Math.abs(t) : 1)) * 100;
    const signedPct = (abs / (Math.abs(t) > 0 ? Math.abs(t) : 1)) * 100;
    return { abs, pct, signedPct };
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
      const t = tRef.current / 1000;

      const { abs, pct, signedPct } = computeMetrics(practical, theoretical);

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, practical: Number(practical) || 0, theoretical: Number(theoretical) || 0, absErr: abs, pctErr: pct, signedPct });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, practical, theoretical, computeMetrics]);

  return { history };
}

/* ============================
   Visualizer SVG
   - Animated meters + flow dots
   - Needle positions respond to values
   ============================ */
function ErrorVisualizerSVG({ practical, theoretical, history = [], running }) {
  // Latest values
  const latest = history.length ? history[history.length - 1] : { practical: 0, theoretical: 0, pctErr: 0 };
  const p = Number.isFinite(Number(practical)) ? Number(practical) : latest.practical || 0;
  const t = Number.isFinite(Number(theoretical)) ? Number(theoretical) : latest.theoretical || 0;
  const abs = p - t;
  const pct = Number.isFinite(latest.pctErr) ? latest.pctErr : Math.abs((abs / (Math.abs(t) || 1)) * 100);
  const sign = abs >= 0 ? 1 : -1;

  // needle angles: map values to -60..+60 degrees window for meter
  const mapToAngle = (val, maxRange = Math.max(Math.abs(t), Math.abs(p), 1) * 1.6) => {
    const ratio = clamp(val / maxRange, -1, 1);
    return ratio * 60;
  };

  const needleAnglePractical = mapToAngle(p);
  const needleAngleTheoretical = mapToAngle(t);
  const dotCount = clamp(Math.round(6 + pct / 6), 4, 22);
  const speed = clamp(1.6 - pct / 100, 0.35, 2.2);

  // responsive
  const svgW = 980;
  const svgH = 280;

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Error Visualizer</div>
            <div className="text-xs text-zinc-400">Live % difference • meter needles • flow animation</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Prac: <span className="text-[#00ffbf] ml-1">{isNaN(p) ? "—" : p}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Theo: <span className="text-[#ffd24a] ml-1">{isNaN(t) ? "—" : t}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">%Err: <span className="text-[#ff9a4a] ml-1">{isNaN(pct) ? "—" : `${round(pct, 3)} %`}</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* bus */}
          <path d={`M 60 ${svgH / 2} H ${svgW - 60}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* left: supply / signal */}
          <g transform={`translate(120, ${svgH / 2})`}>
            <rect x="-42" y="-38" width="84" height="76" rx="8" fill="#060606" stroke="#222" />
            <text x="-20" y="-48" fontSize="12" fill="#ffd24a">SOURCE</text>
            <text x="-20" y="58" fontSize="11" fill="#fff">Ref</text>
          </g>

          {/* right: meter cluster */}
          <g transform={`translate(${svgW - 200}, ${svgH / 2})`}>
            <rect x="-80" y="-72" width="160" height="144" rx="12" fill="#060606" stroke="#222" />
            <text x="-64" y="-54" fontSize="12" fill="#ffb57a">Meters</text>

            {/* big semicircle meter for practical */}
            <g transform={`translate(-30, 10)`}>
              <path d="M -80 40 A 80 80 0 0 1 80 40" fill="none" stroke="#222" strokeWidth="10" />
              <path d="M -76 36 A 76 76 0 0 1 76 36" fill="none" stroke="#111" strokeWidth="6" />
              <line x1="0" y1="0" x2="0" y2="-56" transform={`rotate(${needleAnglePractical})`} stroke="#00ffbf" strokeWidth="3" strokeLinecap="round" />
              <text x="-28" y="64" fontSize="10" fill="#00ffbf">Practical</text>
            </g>

            {/* small semicircle meter for theoretical */}
            <g transform={`translate(50, 10)`}>
              <path d="M -40 20 A 40 40 0 0 1 40 20" fill="none" stroke="#222" strokeWidth="8" />
              <path d="M -36 16 A 36 36 0 0 1 36 16" fill="none" stroke="#111" strokeWidth="4" />
              <line x1="0" y1="0" x2="0" y2="-28" transform={`rotate(${needleAngleTheoretical})`} stroke="#ffd24a" strokeWidth="2.6" strokeLinecap="round" />
              <text x="-18" y="44" fontSize="9" fill="#ffd24a">Theoretical</text>
            </g>
          </g>

          {/* animated dots along bus indicating "flow" */}
          {Array.from({ length: dotCount }).map((_, di) => {
            const pathStr = `M 140 ${svgH / 2} H ${svgW - 200}`;
            const delay = (di / dotCount) * speed;
            const style = {
              offsetPath: `path('${pathStr}')`,
              animationName: "errFlow",
              animationDuration: `${speed}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
            };
            // colour indicates sign: positive error (practical > theoretical) => greenish, negative => pinkish
            const dotColor = sign >= 0 ? "#00ffbf" : "#ff6a9a";
            return <circle key={`err-dot-${di}`} r="4" fill={dotColor} style={style} cx="0" cy="0" />;
          })}

          {/* readouts */}
          <g transform={`translate(${svgW / 2 - 40}, 24)`}>
            <rect x="-120" y="-12" width="240" height="92" rx="8" fill="#060606" stroke="#222" />
            <text x="-110" y="6" fontSize="12" fill="#ffb57a">Readouts</text>
            <text x="-110" y="28" fontSize="13" fill="#fff">Practical: <tspan fill="#00ffbf">{isNaN(p) ? "—" : p}</tspan></text>
            <text x="-110" y="48" fontSize="13" fill="#fff">Theoretical: <tspan fill="#ffd24a">{isNaN(t) ? "—" : t}</tspan></text>
            <text x="-110" y="68" fontSize="13" fill="#fff">Error: <tspan fill="#ff9a4a">{isNaN(pct) ? "—" : `${round(pct, 4)} %`}</tspan></text>
          </g>

          <style>{`
            @keyframes errFlow {
              0% { offset-distance: 0%; opacity: 1; transform: translate(-2px,-2px) scale(0.95); }
              50% { opacity: 0.95; transform: translate(0,0) scale(1.02); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.9); }
            }
            @media (max-width: 640px) {
              text { font-size: 9px; }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
          `}</style>
        </svg>
      </div>
    </div>
  );
}

/* ============================
   Oscilloscope for Error (Practical vs Theoretical)
   ============================ */
function ErrorOscilloscope({ history = [], running }) {
  const data = history.slice(-360).map((d, idx) => ({
    t: idx,
    practical: round(d.practical, 6),
    theoretical: round(d.theoretical, 6),
    pctErr: round(d.pctErr, 6),
  }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — Practical vs Theoretical</div>
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
            <Line type="monotone" dataKey="theoretical" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Theoretical" />
            <Line type="monotone" dataKey="practical" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Practical" />
            <Line type="monotone" dataKey="pctErr" stroke="#ff9a4a" strokeWidth={1.6} dot={false} isAnimationActive={false} name="% Error" yAxisId="right" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page Component
   ============================ */
export default function ErrorCalculatorPage() {
  // UI state
  const [measurementType, setMeasurementType] = useState("voltage");
  const [unit, setUnit] = useState("V");
  const [practical, setPractical] = useState("5");
  const [theoretical, setTheoretical] = useState("4.7");
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Simulation hook
  const { history } = useErrorSim({ running, timestep: 140, practical: Number(practical), theoretical: Number(theoretical) });

  // derived metrics (instant)
  const last = history.length ? history[history.length - 1] : { practical: 0, theoretical: 0, absErr: 0, pctErr: 0, signedPct: 0 };
  const absInstant = Number.isFinite(last.absErr) ? last.absErr : (Number(practical) - Number(theoretical));
  const pctInstant = Number.isFinite(last.pctErr) ? last.pctErr : (Math.abs(absInstant) / (Math.abs(Number(theoretical)) || 1)) * 100;
  const signedPct = Number.isFinite(last.signedPct) ? last.signedPct : ((absInstant) / (Math.abs(Number(theoretical)) || 1)) * 100;

  // friendly labels
  const measurementLabel = useMemo(() => {
    switch (measurementType) {
      case "voltage": return "Voltage";
      case "current": return "Current";
      case "resistance": return "Resistance";
      case "capacitance": return "Capacitance";
      default: return "Measurement";
    }
  }, [measurementType]);

  const exportCSV = () => {
    const rows = [
      ["t", "practical", "theoretical", "absErr", "pctErr"],
      ...history.map((d) => [d.t, d.practical, d.theoretical, d.absErr, d.pctErr]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `error-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const resetDefaults = () => {
    setMeasurementType("voltage");
    setUnit("V");
    setPractical("5");
    setTheoretical("4.7");
    setRunning(true);
    toast("Reset to defaults");
  };

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Live updates resumed" : "Live updates paused");
      return nxt;
    });
  };

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
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
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Error Calculator • % Difference</div>
              </div>
            </motion.div>

            {/* Desktop Controls */}
            <div className="hidden md:flex items-center gap-4">
              <div className="w-44">
                <Select value={measurementType} onValueChange={(v) => setMeasurementType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Measurement" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="voltage" className="text-white cursor-pointer">Voltage (V)</SelectItem>
                    <SelectItem value="current" className="text-white cursor-pointer">Current (A)</SelectItem>
                    <SelectItem value="resistance" className="text-white cursor-pointer">Resistance (Ω)</SelectItem>
                    <SelectItem value="capacitance" className="text-white cursor-pointer">Capacitance (μF)</SelectItem>
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

            {/* Mobile Menu Toggle */}
            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Slide-down Panel */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="w-36">
                  <Select value={measurementType} onValueChange={(v) => setMeasurementType(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Measurement" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="voltage" className="text-white cursor-pointer">Voltage (V)</SelectItem>
                      <SelectItem value="current" className="text-white cursor-pointer">Current (A)</SelectItem>
                      <SelectItem value="resistance" className="text-white cursor-pointer">Resistance (Ω)</SelectItem>
                      <SelectItem value="capacitance" className="text-white cursor-pointer">Capacitance (μF)</SelectItem>
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Error Calculator</div>
                        <div className="text-xs text-zinc-400">Practical vs Theoretical — % difference</div>
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
                      <label className="text-xs text-zinc-400">Measurement Type</label>
                      <div className="mt-2">
                        <Select value={measurementType} onValueChange={(v) => setMeasurementType(v)}>
                          <SelectTrigger className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm rounded-md">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                            <SelectItem value="voltage" className="text-white">Voltage (V)</SelectItem>
                            <SelectItem value="current" className="text-white">Current (A)</SelectItem>
                            <SelectItem value="resistance" className="text-white">Resistance (Ω)</SelectItem>
                            <SelectItem value="capacitance" className="text-white">Capacitance (μF)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Unit</label>
                      <div className="mt-2">
                        <Select value={unit} onValueChange={(v) => setUnit(v)}>
                          <SelectTrigger className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm rounded-md">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                            <SelectItem value="V" className="text-white">V</SelectItem>
                            <SelectItem value="A" className="text-white">A</SelectItem>
                            <SelectItem value="Ω" className="text-white">Ω</SelectItem>
                            <SelectItem value="μF" className="text-white">μF</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Theoretical Value</label>
                      <Input value={theoretical} onChange={(e) => setTheoretical(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Practical Value (measured)</label>
                      <Input value={practical} onChange={(e) => setPractical(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500 mt-1">Values update the visualizer and oscilloscope in real time.</div>
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                        <div className="text-xs text-zinc-400">Absolute Error</div>
                        <div className="text-lg font-semibold text-[#ff9a4a]">{isNaN(absInstant) ? "—" : `${round(absInstant, 6)} ${unit}`}</div>
                        <div className="text-xs text-zinc-400 mt-1">Practical − Theoretical</div>
                      </div>
                      <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                        <div className="text-xs text-zinc-400">Percent Error</div>
                        <div className="text-lg font-semibold text-[#ff9a4a]">{isNaN(pctInstant) ? "—" : `${round(pctInstant, 6)} %`}</div>
                        <div className="text-xs text-zinc-400 mt-1">Unsigned</div>
                      </div>
                      <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                        <div className="text-xs text-zinc-400">Signed %</div>
                        <div className="text-lg font-semibold text-[#00ffbf]">{isNaN(signedPct) ? "—" : `${round(signedPct, 6)} %`}</div>
                        <div className="text-xs text-zinc-400 mt-1">Positive when practical &gt; theoretical</div>
                      </div>
                    </div>
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
                        <Gauge className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Needles • meters • real-time flow • oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{measurementLabel}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Unit: <span className="text-[#ffd24a] ml-1">{unit}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Live: <span className="text-[#00ffbf] ml-1">{running ? "Yes" : "No"}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <ErrorVisualizerSVG practical={Number(practical)} theoretical={Number(theoretical)} history={history} running={running} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <ErrorOscilloscope history={history} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Database className="w-5 h-5" /> Summary & Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Current Practical</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{isNaN(last.practical) ? "—" : `${last.practical} ${unit}`}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Current Theoretical</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{isNaN(last.theoretical) ? "—" : `${last.theoretical} ${unit}`}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Percent Error</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{isNaN(last.pctErr) ? "—" : `${round(last.pctErr, 6)} %`}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 sm:col-span-3">
                      <div className="text-xs text-zinc-400">Design Improvement Suggestions</div>
                      <ul className="list-disc list-inside mt-2 text-xs text-zinc-300 space-y-1">
                        <li>Use multiple measurements and average to reduce measurement noise.</li>
                        <li>Calibrate instruments and include offset corrections (zero-offset removal).</li>
                        <li>If % error &gt; 5%, check measurement setup and reference wiring first.</li>
                        <li>Visualizer can be extended to compare moving averages and show confidence bands.</li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><AlertTriangle /></span>
                    <span>
                      Tip: For better accuracy, sample multiple practical readings and use the averaged practical value to compute percent error.
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
