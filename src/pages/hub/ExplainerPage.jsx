// src/pages/ExplainerPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Play,
  Pause,

  Menu,
  X,

  Download,
  BugPlayIcon as Bulb,
  Activity,
  CircuitBoard,
  
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
import { Switch } from "@/components/ui/switch";

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

/* ===========================
   Utilities
   =========================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

/* ===========================
   Lightweight simulation hook
   - supports step, sine (AC), and pulse modes
   - returns live history + instantaneous values
   - designed for explainer visuals (fast, stable)
   =========================== */
function useExplainerSim({
  running,
  mode = "step", // "step" | "sine" | "pulse"
  Vsup = 5,
  seriesR = 10,
  compValue = 10, // μF for cap or mH for inductor where applicable
  compType = "cap", // "cap" or "ind"
  timestep = 80,
  freq = 1,
  pulseDuty = 0.5,
}) {
  const historyRef = useRef([]);
  const [history, setHistory] = useState([]);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // compute equivalent quickly (single component for explainer)
  const eq = useMemo(() => {
    if (compType === "cap") return { totalReq: compValue * 1e-6, display: `${compValue} μF` };
    return { totalReq: compValue * 1e-3, display: `${compValue} mH` };
  }, [compValue, compType]);

  const computeInstant = useCallback(
    (tSeconds) => {
      const R = Math.max(1e-6, seriesR);
      if (compType === "cap") {
        const C = eq.totalReq;
        if (mode === "step") {
          const tau = clamp(R * C, 1e-6, 1e6);
          const Vt = Vsup * (1 - Math.exp(-tSeconds / tau));
          const dVdt = (Vsup / tau) * Math.exp(-tSeconds / tau);
          const It = C * dVdt;
          const P = Vt * It;
          return { V: Vt, I: It, P, E: 0.5 * C * Vt * Vt };
        } else if (mode === "sine") {
          const omega = 2 * Math.PI * freq;
          const Vt = Vsup * Math.sin(omega * tSeconds);
          const dVdt = Vsup * omega * Math.cos(omega * tSeconds);
          const It = C * dVdt;
          const P = Vt * It;
          return { V: Vt, I: It, P, E: 0.5 * C * Vt * Vt };
        } else if (mode === "pulse") {
          // simple square wave amplitude toggling between 0 and Vsup
          const period = 1 / Math.max(1e-6, freq);
          const phase = (tSeconds % period) / period;
          const Vtarget = phase < pulseDuty ? Vsup : 0;
          // use RC exponential to reach Vtarget (simple approximation)
          const tau = clamp(R * C, 1e-6, 1e6);
          const Vt = Vtarget + (0 - Vtarget) * Math.exp(-tSeconds / tau);
          const dVdt = (Vtarget - Vt) / tau;
          const It = C * dVdt;
          const P = Vt * It;
          return { V: Vt, I: It, P, E: 0.5 * C * Vt * Vt };
        }
      } else {
        // inductor: simulate I(t) similarly but for brevity we use simple models
        const L = eq.totalReq;
        if (mode === "step") {
          const tau = clamp(L / R, 1e-6, 1e6);
          const Iinf = Vsup / R;
          const It = Iinf * (1 - Math.exp(-tSeconds / tau));
          const Vl = L * (Iinf / tau) * Math.exp(-tSeconds / tau);
          const P = Vl * It;
          return { V: Vl, I: It, P, E: 0.5 * L * It * It };
        } else if (mode === "sine") {
          const omega = 2 * Math.PI * freq;
          const Ipeak = Vsup / Math.sqrt(R * R + Math.pow(omega * L, 2));
          const phase = Math.atan2(omega * L, R);
          const It = Ipeak * Math.sin(omega * tSeconds - phase);
          const Vl = L * (Ipeak * omega * Math.cos(omega * tSeconds - phase));
          const P = Vl * It;
          return { V: Vl, I: It, P, E: 0.5 * L * It * It };
        } else {
          // pulse for inductor: simple approximated response
          const period = 1 / Math.max(1e-6, freq);
          const phase = (tSeconds % period) / period;
          const Vtarget = phase < pulseDuty ? Vsup : 0;
          const tau = clamp(L / R, 1e-6, 1e6);
          const Iinf = Vtarget / R;
          const It = Iinf * (1 - Math.exp(-tSeconds / tau));
          const Vl = L * ((Iinf / tau) * Math.exp(-tSeconds / tau));
          const P = Vl * It;
          return { V: Vl, I: It, P, E: 0.5 * L * It * It };
        }
      }
      return { V: 0, I: 0, P: 0, E: 0 };
    },
    [mode, Vsup, seriesR, compType, eq.totalReq, freq, pulseDuty]
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

      const inst = computeInstant(tSeconds);
      // push history
      historyRef.current = [...(historyRef.current || []).slice(-480), { t: tSeconds, ...inst }];
      if (alive) setHistory(historyRef.current);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, computeInstant, timestep, freq, pulseDuty]);

  return { history, instant: history.length ? history[history.length - 1] : { V: 0, I: 0, P: 0, E: 0 }, eq };
}

/* ===========================
   Small Meters (Voltmeter & Ammeter)
   - simple circular meter that reads from simulation
   =========================== */
function Meter({ label, value, unit, min = 0, max = 10, accent = "#ffb86b" }) {
  const pct = clamp((value - min) / (max - min || 1), 0, 1);
  const angle = -120 + pct * 240; // -120deg to +120deg
  return (
    <div className="w-32 sm:w-36 p-2 bg-zinc-900/50 border border-zinc-800 rounded-lg flex flex-col items-center">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-20 h-20">
          <defs>
            <radialGradient id="g" cx="50%" cy="30%">
              <stop offset="0%" stopColor="#111" />
              <stop offset="100%" stopColor="#060606" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="45" fill="url(#g)" stroke="#222" />
          {/* ticks */}
          {Array.from({ length: 9 }).map((_, i) => {
            const a = (-120 + (i / 8) * 240) * (Math.PI / 180);
            const x1 = 50 + Math.cos(a) * 36;
            const y1 = 50 + Math.sin(a) * 36;
            const x2 = 50 + Math.cos(a) * 42;
            const y2 = 50 + Math.sin(a) * 42;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#333" strokeWidth="1" />;
          })}
          {/* needle */}
          <g transform={`rotate(${angle} 50 50)`}>
            <rect x="49" y="18" width="2" height="36" fill={accent} rx="1" />
            <circle cx="50" cy="56" r="3" fill="#111" stroke={accent} strokeWidth="1.2" />
          </g>
        </svg>
      </div>
      <div className="mt-1 text-sm font-semibold" style={{ color: accent }}>
        {round(value, 4)} {unit}
      </div>
    </div>
  );
}

/* ===========================
   Circuit Visualizer (SVG)
   - Animated dots representing current flow (uses offset-path)
   - Adjustable detail level
   =========================== */
function CircuitVisualizer({ compType = "cap", compValue = 10, mode = "step", Vsup = 5, running = true, instant = { V: 0, I: 0, P: 0, E: 0 }, detail = "futuristic" }) {
  const absI = Math.abs(instant.I || 0);
  // more current => more dots and faster animation
  const dotCount = clamp(Math.round(3 + Math.abs(absI) * 10), 3, 22);
  const speed = clamp(1.5 / (absI + 0.02), 0.18, 3.2);

  const svgWidth = 960;
  const svgHeight = 320;
  const busY = 160;
  const startX = 120;
  const compX = svgWidth / 2;
  const endX = svgWidth - 120;

  // style variations by 'detail'
  const glow = detail === "futuristic";
  const compFill = compType === "cap" ? "#ffb86b" : "#ff6a9a";

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-md ${glow ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" : "bg-orange-600"} text-black flex items-center justify-center`}>
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">{compType === "cap" ? "Capacitor" : "Inductor"} Explainer</div>
            <div className="text-xs text-zinc-400">Mode: {mode} • Live visual</div>
          </div>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I: <span className="text-[#00ffbf] ml-1">{round(instant.I, 6)} A</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">P: <span className="text-[#ff9a4a] ml-1">{round(instant.P, 6)} W</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* supply */}
          <g transform={`translate(${startX - 64},${busY})`}>
            <rect x="-20" y="-28" width="40" height="56" rx="6" fill="#060606" stroke="#222" />
            <text x="-36" y="-38" fontSize="12" fill="#ffd24a">{Vsup}V</text>
          </g>

          {/* bus */}
          <path d={`M ${startX} ${busY} H ${endX}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* component block */}
          <g transform={`translate(${compX},${busY})`}>
            <rect x="-64" y="-30" width="128" height="60" rx="12" fill="#060606" stroke="#222" />
            <rect x="-44" y="-18" width="88" height="36" rx="8" fill={compFill} opacity="0.95" />
            <text x="-36" y="-26" fontSize="12" fill="#ffd24a">{compType === "cap" ? `${compValue} μF` : `${compValue} mH`}</text>
            <text x="-36" y="34" fontSize="11" fill="#fff">Interactive component</text>

            {glow && <filter id="f1"><feGaussianBlur stdDeviation="6" result="b" /></filter>}
          </g>

          {/* measure leads */}
          <path d={`M ${startX + 36} ${busY} H ${compX - 64}`} stroke="#222" strokeWidth="3" strokeLinecap="round" />
          <path d={`M ${compX + 64} ${busY} H ${endX - 36}`} stroke="#222" strokeWidth="3" strokeLinecap="round" />

          {/* animated dots along bus */}
          {Array.from({ length: dotCount }).map((_, di) => {
            const pathStr = `M ${startX} ${busY} H ${endX}`;
            const delay = (di / dotCount) * speed;
            const style = {
              offsetPath: `path('${pathStr}')`,
              animationName: "flowExplainer",
              animationDuration: `${speed}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
            };
            return <circle key={`d-${di}`} r={4} fill="#ffd24a" style={style} />;
          })}

          {/* small oscilloscope widget on the right */}
          <g transform={`translate(${endX - 200},${40})`}>
            <rect x="-10" y="-20" width="200" height="120" rx="10" fill="#060606" stroke="#222" />
            <text x="-2" y="-2" fontSize="11" fill="#ffb57a">Scope</text>
            {/* dynamic indicator bars */}
            <rect x="8" y="18" width={Math.max(8, Math.min(180, Math.abs(instant.V) * 10))} height="12" rx="4" fill="#ffd24a" />
            <rect x="8" y="40" width={Math.max(8, Math.min(180, Math.abs(instant.I) * 30))} height="12" rx="4" fill="#00ffbf" />
            <rect x="8" y="62" width={Math.max(8, Math.min(180, Math.abs(instant.P) * 40))} height="12" rx="4" fill="#ff9a4a" />
          </g>

          <style>{`
            @keyframes flowExplainer {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(1); }
              40% { opacity: 0.95; transform: translate(0,0) scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(4px,6px) scale(0.88); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) { text { font-size: 9px; } }
          `}</style>
        </svg>
      </div>
    </div>
  );
}

/* ===========================
   ExplainerPage (main)
   =========================== */
export default function ExplainerPage() {
  // UI state
  const [mobileOpen, setMobileOpen] = useState(false);
  const [running, setRunning] = useState(true);
  const [compType, setCompType] = useState("cap"); // cap | ind
  const [mode, setMode] = useState("step"); // step | sine | pulse
  const [Vsup, setVsup] = useState("5");
  const [seriesR, setSeriesR] = useState("10");
  const [compValue, setCompValue] = useState("10"); // μF or mH
  const [freq, setFreq] = useState("1");
  const [pulseDuty, setPulseDuty] = useState(0.5);
  const [timestep, setTimestep] = useState(80);
  const [detail, setDetail] = useState("futuristic"); // minimal | detailed | futuristic
  const [userType, setUserType] = useState("student"); // student | instructor | engineer
  const [showHelp, setShowHelp] = useState(true);
  const [autoScale, setAutoScale] = useState(true);

  // map userType to presets
  useEffect(() => {
    if (userType === "student") {
      setCompValue("10");
      setSeriesR("10");
      setVsup("5");
      setMode("step");
    } else if (userType === "instructor") {
      setCompValue("22");
      setSeriesR("5");
      setVsup("12");
      setMode("sine");
    } else {
      // engineer
      setCompValue("4.7");
      setSeriesR("2");
      setVsup("9");
      setMode("pulse");
      setFreq("10");
      setPulseDuty(0.3);
    }
  }, [userType]);

  const { history, instant, eq } = useExplainerSim({
    running,
    mode,
    Vsup: Number(Vsup) || 0,
    seriesR: Number(seriesR) || 1,
    compValue: Number(compValue) || 1,
    compType: compType === "cap" ? "cap" : "ind",
    timestep: Math.max(40, Number(timestep) || 80),
    freq: Number(freq) || 1,
    pulseDuty: Number(pulseDuty) || 0.5,
  });

  // scope data
  const scopeData = history.slice(-360).map((d, i) => ({
    t: (i / 60).toFixed(2),
    V: round(d.V, 5),
    I: round(d.I, 6),
    P: round(d.P, 6),
  }));

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Resumed" : "Paused");
      return nxt;
    });
  };

  const exportPNG = () => {
    toast.success("Export snapshot (mock) — integrate html2canvas to capture real screenshot.");
  };

  return (
    <div className="min-h-screen bg-[#05060a] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.32 }} className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
                <Zap className="w-6 h-6 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm md:text-lg font-semibold text-zinc-200">SparkLab • Explainers</div>
                <div className="text-xs text-zinc-400 -mt-0.5">Animated Concept Explainers — Step-by-step visuals</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-3">
              <div className="w-36">
                <Select value={userType} onValueChange={(v) => setUserType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border border-zinc-800 rounded-md text-white text-sm">
                    <SelectValue placeholder="Profile" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="instructor">Instructor</SelectItem>
                    <SelectItem value="engineer">Engineer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-1" onClick={() => toast.success("Saved preset")}>Save</Button>
                <Button variant="ghost" className="border border-zinc-800 p-2" onClick={toggleRunning} title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" className="border border-zinc-800 p-2" onClick={() => { setShowHelp(!showHelp); toast(showHelp ? "Hide help" : "Show help"); }}>
                  <Bulb className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border border-zinc-800 p-2" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* mobile slide controls */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-64 py-3" : "max-h-0"}`}>
            <div className="flex gap-2 items-center">
              <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => toast.success("Saved preset")}>Save</Button>
              <Button variant="ghost" className="flex-1 border border-zinc-800" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16" />

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* left panel: controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Explainer Controls</div>
                        <div className="text-xs text-zinc-400">Choose mode, component, and live parameters</div>
                      </div>
                    </div>
                    <div>
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-zinc-400">Profile</label>
                      <Select value={userType} onValueChange={(v) => setUserType(v)}>
                        <SelectTrigger className="w-full bg-zinc-900/50 border border-zinc-800 rounded-md text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                          <SelectItem value="student">Student</SelectItem>
                          <SelectItem value="instructor">Instructor</SelectItem>
                          <SelectItem value="engineer">Engineer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Detail</label>
                      <Select value={detail} onValueChange={(v) => setDetail(v)}>
                        <SelectTrigger className="w-full bg-zinc-900/50 border border-zinc-800 rounded-md text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                          <SelectItem value="minimal">Minimal</SelectItem>
                          <SelectItem value="detailed">Detailed</SelectItem>
                          <SelectItem value="futuristic">Futuristic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Component</label>
                    <div className="flex gap-2 mt-2">
                      <Button className={`flex-1 ${compType === "cap" ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" : "bg-zinc-900/40"}`} onClick={() => setCompType("cap")}>Capacitor (μF)</Button>
                      <Button className={`flex-1 ${compType === "ind" ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" : "bg-zinc-900/40"}`} onClick={() => setCompType("ind")}>Inductor (mH)</Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Mode</label>
                    <div className="flex gap-2 mt-2">
                      <Button className={`flex-1 ${mode === "step" ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" : "bg-zinc-900/40"}`} onClick={() => setMode("step")}>Step</Button>
                      <Button className={`flex-1 ${mode === "sine" ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" : "bg-zinc-900/40"}`} onClick={() => setMode("sine")}>Sine</Button>
                      <Button className={`flex-1 ${mode === "pulse" ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" : "bg-zinc-900/40"}`} onClick={() => setMode("pulse")}>Pulse</Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-zinc-400">V (V)</label>
                      <Input value={Vsup} onChange={(e) => setVsup(e.target.value)} type="number" className="bg-zinc-900/40 border border-zinc-800 text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400">R<sub>s</sub> (Ω)</label>
                      <Input value={seriesR} onChange={(e) => setSeriesR(e.target.value)} type="number" className="bg-zinc-900/40 border border-zinc-800 text-white" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-zinc-400">{compType === "cap" ? "C (μF)" : "L (mH)"}</label>
                      <Input value={compValue} onChange={(e) => setCompValue(e.target.value)} type="number" className="bg-zinc-900/40 border border-zinc-800 text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400">Freq (Hz)</label>
                      <Input value={freq} onChange={(e) => setFreq(e.target.value)} type="number" step="0.1" className="bg-zinc-900/40 border border-zinc-800 text-white" />
                    </div>
                  </div>

                  {mode === "pulse" && (
                    <div>
                      <label className="text-xs text-zinc-400">Pulse Duty</label>
                      <input type="range" min="0.05" max="0.95" step="0.01" value={pulseDuty} onChange={(e) => setPulseDuty(Number(e.target.value))} className="w-full" />
                    </div>
                  )}

                  <div className="flex items-center gap-2 justify-between mt-2">
                    <div className="flex gap-2">
                      <Button className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 border-zinc-700 text-white" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" className="border border-zinc-800 p-2" onClick={exportPNG}><Download className="w-4 h-4" /></Button>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-zinc-400">
                    Equivalent: <span className="text-[#ff9a4a] font-semibold ml-1">{eq.display}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* explanation card */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/60 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-[#ffd24a]">Guided Steps</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-zinc-300 space-y-2">
                    <div>
                      <div className="text-xs text-zinc-400">1. Select profile</div>
                      <div className="text-xs">Profiles set sensible defaults: <span className="font-semibold">Student, Instructor, Engineer</span>.</div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-400">2. Choose mode</div>
                      <div className="text-xs">Step shows transient charging / ramp. Sine shows AC reactive behavior. Pulse shows periodic switching response.</div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-400">3. Observe visualizer</div>
                      <div className="text-xs">Animated particles show current flow; meters & scope are live and reflect values computed from the physics model.</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Tip</Badge>
                    <div className="mt-2 text-xs text-zinc-400">Toggle detail for a futuristic look, or minimal for simpler diagrams during lecturing.</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* right panel: visual / scope / meters */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                        <CircuitBoard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Animated Explainer</div>
                        <div className="text-xs text-zinc-400">Interactive circuit visualizer • live meters • oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className="bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{mode}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full">Profile: <span className="text-[#ffd24a] ml-1">{userType}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full">
                  <CircuitVisualizer compType={compType === "cap" ? "cap" : "ind"} compValue={Number(compValue)} mode={mode} Vsup={Number(Vsup)} running={running} instant={instant} detail={detail} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-[#ffd24a]">Oscilloscope — Live</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={scopeData}>
                          <CartesianGrid stroke="#111" strokeDasharray="3 3" />
                          <XAxis dataKey="t" tick={{ fill: "#888" }} />
                          <YAxis tick={{ fill: "#888" }} />
                          <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
                          <Legend wrapperStyle={{ color: "#aaa" }} />
                          <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Voltage (V)" />
                          <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Current (A)" />
                          <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Power (W)" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-[#ffd24a]">Meters</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-2">
                      <Meter label="Voltmeter" value={instant.V} unit="V" min={-Number(Vsup)*1.2} max={Number(Vsup)*1.2} accent="#ffd24a" />
                      <div className="mt-2" />
                      <Meter label="Ammeter" value={instant.I} unit="A" min={-Math.max(0.01, Math.abs(instant.I)*2)} max={Math.max(0.01, Math.abs(instant.I)*2)} accent="#00ffbf" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="bg-black/60 border border-zinc-800 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-[#ffd24a]">Summary & Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-md">
                    <div className="text-xs text-zinc-400">Equivalent</div>
                    <div className="text-lg font-semibold text-[#ff9a4a]">{eq.display}</div>
                  </div>
                  <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-md">
                    <div className="text-xs text-zinc-400">I (instant)</div>
                    <div className="text-lg font-semibold text-[#00ffbf]">{round(instant.I, 6)} A</div>
                  </div>
                  <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-md">
                    <div className="text-xs text-zinc-400">P (instant)</div>
                    <div className="text-lg font-semibold text-[#ff9a4a]">{round(instant.P, 6)} W</div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-zinc-400">
                  {showHelp ? (
                    <>
                      <div>Tip: Change mode to see different behaviors. Use 'Pulse' to demonstrate switching systems, 'Sine' for AC reactance, and 'Step' for classic transient charging.</div>
                      <div className="mt-2">Pro tip: For lecture mode choose <span className="font-semibold">minimal</span> detail to keep attention on the math, or <span className="font-semibold">futuristic</span> for demo videos and marketing visuals.</div>
                    </>
                  ) : (
                    <div className="text-center text-zinc-500">Help hidden — toggle via header bulb.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* mobile sticky */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-zinc-300 text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2" onClick={exportPNG}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
