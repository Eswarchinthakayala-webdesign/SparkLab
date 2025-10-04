// src/pages/PowerFactorCalculator.jsx
"use client";

/**
 * Updated PowerFactorCalculator.jsx
 * - Reworked RealTimeOscilloscope to use RAF + buffered commits (prevents nested Recharts updates)
 * - AnimatedNumber now shows the springed value (smooth)
 * - useOscilloscopeSim: new hook generating V/I samples in real-time, commits at commitMs
 * - Minor perf/stability improvements and small UI/UX polish
 *
 * Note: keep your shadcn UI component imports as they are in your project.
 */

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { Toaster, toast } from "sonner";
import {
  Hexagon,
  Zap,
  BatteryCharging,
  Play,
  Pause,
  Download,
  RefreshCw,
  Circle,
  Activity,
} from "lucide-react";

// shadcn-ui imports - adjust paths if different in your project
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "../../lib/utils";

/* --------------------------
   Utilities
   -------------------------- */
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 2) => {
  if (!Number.isFinite(v)) return "—";
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

/* --------------------------
   Power calculations
   -------------------------- */
function computePowerStats(V, I, pf, loadType = "inductive") {
  const Vn = Number(V) || 0;
  const In = Number(I) || 0;
  const PF = clamp(Number(pf) || 0, 0.01, 0.9999);
  const S = Vn * In; // VA
  const P = S * PF; // W (approx)
  const Qmag = Math.sqrt(Math.max(0, S * S - P * P));
  const Q = loadType === "inductive" ? Qmag : -Qmag; // sign
  const phi = Math.acos(PF);
  return { V: Vn, I: In, S, P, Q, PF, phi };
}

function computeCorrection(P, Q, targetPF, loadType = "inductive", freq = 50, V = 230) {
  const pf_t = clamp(Number(targetPF) || 0.95, 0.01, 0.9999);
  if (!P || !Number.isFinite(P)) return { Qc: 0, Q_after: Q, PF_after: 1, C_uF: 0 };

  const phi_t = Math.acos(pf_t);
  const Qt_mag = P * Math.tan(phi_t);
  const Q_target = loadType === "inductive" ? Qt_mag : -Qt_mag;
  const Qc = Q - Q_target;
  const Q_after = Q - Qc;
  const S_after = Math.sqrt(P * P + Q_after * Q_after);
  const PF_after = P / (S_after || 1);

  let C_uF = 0;
  if (Math.abs(Qc) > 1e-6 && V > 0) {
    const C = Math.abs(Qc) / (V * V * 2 * Math.PI * freq);
    C_uF = C * 1e6;
  }

  return { Qc, Q_after, PF_after, C_uF };
}

/* --------------------------
   AnimatedNumber (fixed)
   - shows animated spring value smoothly
   -------------------------- */
function AnimatedNumber({ value = 0, precision = 2, className = "" }) {
  const mv = useMotionValue(Number(value) || 0);
  const spring = useSpring(mv, { stiffness: 220, damping: 28 });
  const [display, setDisplay] = useState(Number(value) || 0);

  useEffect(() => {
    mv.set(Number(value) || 0);
  }, [value, mv]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => setDisplay(v));
    return () => unsub && unsub();
  }, [spring]);

  return <motion.span className={className}>{round(display, precision)}</motion.span>;
}

/* --------------------------
   useOscilloscopeSim
   - single-phase sine generator using RAF
   - buffers frames and commits at commitMs (to avoid too-frequent React updates)
   -------------------------- */
function useOscilloscopeSim({ running, freq = 50, Vrms = 230, Irms = 5, pf = 0.9, commitMs = 80 }) {
  const [history, setHistory] = useState([]); // frames: { t, v, i, p }
  const rafRef = useRef(null);
  const lastRef = useRef(performance.now());
  const tRef = useRef(0);
  const bufferRef = useRef([]);
  const lastCommitRef = useRef(performance.now());

  // memoized params
  const params = useMemo(() => {
    const Vpk = Vrms * Math.SQRT2;
    const Ipk = Irms * Math.SQRT2;
    const phi = Math.acos(clamp(pf, 0.001, 0.9999));
    return { Vpk, Ipk, phi };
  }, [Vrms, Irms, pf]);

  useEffect(() => {
    let alive = true;
    lastRef.current = performance.now();
    lastCommitRef.current = performance.now();

    const w = 2 * Math.PI * (freq || 50);

    const step = (ts) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(step);

      if (!running) {
        lastRef.current = ts;
        return;
      }

      const dt = ts - lastRef.current;
      if (dt < 6) {
        lastRef.current = ts;
        return;
      }
      lastRef.current = ts;

      tRef.current += dt;
      const t = tRef.current / 1000;

      // instantaneous
      const v = params.Vpk * Math.sin(w * t);
      const i = params.Ipk * Math.sin(w * t - params.phi); // lagging by phi
      const p = v * i;

      bufferRef.current.push({ t, v, i, p });

      const now = performance.now();
      if (now - lastCommitRef.current >= commitMs) {
        setHistory((h) => {
          const next = h.length ? [...h, ...bufferRef.current] : [...bufferRef.current];
          bufferRef.current.length = 0;
          const keep = 1000;
          if (next.length > keep) return next.slice(next.length - keep);
          return next;
        });
        lastCommitRef.current = now;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (bufferRef.current.length) {
        setHistory((h) => {
          const next = [...h, ...bufferRef.current];
          bufferRef.current.length = 0;
          const keep = 1000;
          if (next.length > keep) return next.slice(next.length - keep);
          return next;
        });
      }
    };
  }, [running, params.Vpk, params.Ipk, params.phi, freq, commitMs]);

  const reset = useCallback(() => {
    setHistory([]);
    tRef.current = 0;
    bufferRef.current.length = 0;
  }, []);

  return { history, reset };
}

/* --------------------------
   RealTimeOscilloscope (now driven by history from useOscilloscopeSim)
   - Recharts rendering, no internal animation (isAnimationActive=false)
   - uses a slice of recent history
   -------------------------- */
function RealTimeOscilloscope({ history = [], running = true, title = "Oscilloscope", height = 220 }) {
  const data = useMemo(() => {
    const slice = history.length > 400 ? history.slice(history.length - 400) : history;
    return slice.map((d, idx) => ({ t: idx, v: round(d.v, 3), i: round(d.i, 4) }));
  }, [history]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-black/60 p-3">
      <div className="flex justify-between mb-2">
        <div className="text-sm text-[#ffd24a] font-medium">{title}</div>
        <Badge
  className="bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded-full 
  shadow-sm hover:border-orange-500/50 transition-all duration-300"
>
  Phase Shift:&nbsp;
  {history.length
    ? `${round(
        Math.acos(
          clamp(
            history[history.length - 1]?.i /
              (Math.SQRT2 * ((history[history.length - 1]?.v || 1) / Math.SQRT2)) || 1,
            -1,
            1
          )
        ) * (180 / Math.PI),
        1
      )}°`
    : "—"}
</Badge>

      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#222" strokeDasharray="3 3" />
            <XAxis dataKey="t" hide />
            <YAxis tick={{ fill: "#888" }} />
            <Tooltip contentStyle={{ background: "#070707", border: "1px solid #222", color: "#fff",borderRadius:"10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="v" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="V (pk)" />
            <Line type="monotone" dataKey="i" stroke="#00ffbf" strokeWidth={1.6} dot={false} isAnimationActive={false} name="I (pk)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* --------------------------
   CircuitFlow (unchanged logic but kept safe)
   - still uses SVG animateMotion (does not update React state) so it's safe
   -------------------------- */
function CircuitFlow({ V = 230, I = 5, PF = 0.9, running = true }) {
  const wirePath = "M 60 160 H 280 a16 16 0 0 1 16 -16 V 80 H 520 V 120 h120 a16 16 0 0 1 16 16 H 760 V 220 H 60 Z";
  const baseSpeed = clamp(1.6 - PF / 2, 0.45, 2.6);
  const speed = clamp(baseSpeed * (1 + I / Math.max(1, 10)), 0.6, 4.2);
  const dots = clamp(Math.round(6 + I / 1.2), 6, 28);

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/60 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <svg viewBox="0 0 820 260" className="w-full h-72" preserveAspectRatio="xMidYMid meet">
        <defs>
          <path id="pfWire" d={wirePath} fill="none" />
          <linearGradient id="pfWireGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffd24a" />
            <stop offset="60%" stopColor="#ff7a2d" />
            <stop offset="100%" stopColor="#ffd24a" />
          </linearGradient>
          <filter id="glowSmall" x="-40%" y="-40%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Wire */}
        <path d={wirePath} stroke="url(#pfWireGrad)" strokeWidth="8" fill="none" strokeLinecap="round" filter="url(#glowSmall)" />

        {/* AC Source */}
        <g transform="translate(90,170)">
          <circle r="24" fill="#070707" stroke="#ffb86b" strokeWidth="3" filter="url(#glowSmall)" />
          <text x="-10" y="7" fill="#ffd24a" fontSize="12" fontWeight="700">AC</text>
        </g>

        {/* Inductor */}
        <g transform="translate(330,90)">
          <path d="M -60 40 q 10 -30 20 0 q 10 -30 20 0 q 10 -30 20 0" fill="none" stroke="#ff8d42" strokeWidth="4" strokeLinecap="round" />
          <text x="8" y="-10" fill="#ff8d42" fontSize="12">L</text>
        </g>

        {/* Capacitor */}
        <g transform="translate(520,70)">
          <line x1="0" y1="0" x2="0" y2="60" stroke="#9ee6ff" strokeWidth="4" />
          <line x1="20" y1="0" x2="20" y2="60" stroke="#9ee6ff" strokeWidth="4" />
          <text x="-6" y="-6" fill="#9ee6ff" fontSize="12">C</text>
        </g>

        {/* Resistor */}
        <g transform="translate(650,150)">
          <path d="M 0 0 l 8 -8 l 8 8 l 8 -8 l 8 8 l 8 -8" stroke="#00ffbf" strokeWidth="3" fill="none" strokeLinecap="round" />
          <text x="28" y="-12" fill="#00ffbf" fontSize="12">R</text>
        </g>

        {/* Meters box */}
        <g transform="translate(10,10)">
          <rect x="0" y="0" width="260" height="76" rx="10" fill="#060606" stroke="#222" />
          <text x="12" y="20" fill="#ffd24a" fontSize="12">Voltage</text>
          <text x="12" y="40" fill="#fff" fontSize="14" fontWeight="600">{round(V)} V</text>
          <text x="140" y="20" fill="#9ee6ff" fontSize="12">Current</text>
          <text x="140" y="40" fill="#fff" fontSize="14" fontWeight="600">{round(I)} A</text>
        </g>

        {/* Animated dots along the path using SVG animateMotion (no React updates) */}
        {Array.from({ length: dots }).map((_, idx) => {
          const delay = (idx / dots) * (speed / 1.5);
          return (
            <circle key={idx} r={4} fill={idx % 2 ? "#ffd24a" : "#9ee6ff"}>
              {running && (
                <animateMotion dur={`${speed}s`} repeatCount="indefinite" begin={`${(delay % speed).toFixed(2)}s`}>
                  <mpath xlinkHref="#pfWire" />
                </animateMotion>
              )}
            </circle>
          );
        })}

        {/* Ammeter */}
        <g transform="translate(430,36)">
          <circle r="20" stroke="#ffd24a" strokeWidth="3" fill="#060606" />
          <text x="-6" y="6" fill="#ffd24a" fontSize="12">A</text>
        </g>

        {/* Voltmeter */}
        <g transform="translate(760,170)">
          <circle r="22" stroke="#9ee6ff" strokeWidth="3" fill="#060606" />
          <text x="-8" y="6" fill="#9ee6ff" fontSize="12">V</text>
        </g>
      </svg>
    </div>
  );
}

/* --------------------------
   Phasor Diagram (unchanged)
   -------------------------- */
function Phasor({ P = 0, Q = 0 }) {
  const maxLen = 60;
  const mag = Math.sqrt(P * P + Q * Q) || 1;
  const px = (P / Math.max(1, mag)) * maxLen;
  const qy = (Q / Math.max(1, mag)) * maxLen;

  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      <svg viewBox="-80 -80 160 160" className="w-36 h-36">
        <circle cx="0" cy="0" r="62" stroke="#111" fill="none" />
        <line x1="0" y1="0" x2={px} y2="0" stroke="#ffd24a" strokeWidth="2.5" markerEnd="url(#arrow)" />
        <line x1="0" y1="0" x2="0" y2={-qy} stroke="#9ee6ff" strokeWidth="2.5" markerEnd="url(#arrow)" />
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill="#fff" />
          </marker>
        </defs>
        <text x="-36" y="46" fill="#aaa" fontSize="10">P</text>
        <text x="36" y="-46" fill="#aaa" fontSize="10">Q</text>
      </svg>
    </div>
  );
}

/* --------------------------
   Main Page
   -------------------------- */
export default function PowerFactorCalculator() {
  // inputs & UI state
  const [V, setV] = useState(415);
  const [I, setI] = useState(12);
  const [PF, setPF] = useState(0.72);
  const [loadType, setLoadType] = useState("inductive");
  const [targetPF, setTargetPF] = useState(0.95);
  const [freq, setFreq] = useState(50);
  const [running, setRunning] = useState(true);
  const [preset, setPreset] = useState("industrial");
  const [mobileOpen, setMobileOpen] = useState(false);

  // presets effect
  useEffect(() => {
    if (preset === "industrial") {
      setV(415); setI(12); setPF(0.72); setLoadType("inductive");
    } else if (preset === "commercial") {
      setV(230); setI(8); setPF(0.85); setLoadType("inductive");
    } else {
      setV(230); setI(4); setPF(0.95); setLoadType("inductive");
    }
  }, [preset]);

  const stats = useMemo(() => computePowerStats(V, I, PF, loadType), [V, I, PF, loadType]);
  const correction = useMemo(() => computeCorrection(stats.P, stats.Q, targetPF, loadType, freq, stats.V), [stats.P, stats.Q, targetPF, loadType, freq, stats.V]);

  // spring displays for V and I
  const vMv = useMotionValue(stats.V);
  const iMv = useMotionValue(stats.I);
  useEffect(() => vMv.set(stats.V), [stats.V, vMv]);
  useEffect(() => iMv.set(stats.I), [stats.I, iMv]);
  useSpring(vMv, { stiffness: 200, damping: 28 });
  useSpring(iMv, { stiffness: 200, damping: 28 });

  // real-time oscilloscope simulation hook
  const { history, reset: resetOsc } = useOscilloscopeSim({
    running,
    freq,
    Vrms: stats.V,
    Irms: stats.I,
    pf: stats.PF,
    commitMs: 100,
  });

  // actions
  const applyCorrection = useCallback(() => {
    if (!correction || !Number.isFinite(correction.PF_after)) {
      toast.error("Correction not available");
      return;
    }
    setPF(round(correction.PF_after, 3));
    toast.success("Applied correction (simulated)");
  }, [correction]);

  const resetAll = useCallback(() => {
    setPreset("industrial");
    resetOsc();
    toast("Reset to industrial preset");
  }, [resetOsc]);

  const exportCSV = useCallback(() => {
    const rows = [
      ["V","I","PF","P(W)","Q(VAR)","S(VA)"],
      [stats.V, stats.I, stats.PF, round(stats.P,3), round(stats.Q,3), round(stats.S,3)]
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `powerfactor-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  }, [stats]);

  return (
    <div className="min-h-screen bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-black/60 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
              <Hexagon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200">
                SparkLab
              </div>
              <div className="text-xs text-zinc-400">
                Power Factor Calculator
              </div>
            </div>
          </div>

          <div className="sm:flex gap-2 hidden items-center">
            <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-xs">
              PF:{" "}
              <span className="text-[#ffd24a] ml-1">
                <AnimatedNumber value={stats.PF} precision={3} />
              </span>
            </Badge>
            <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-xs">
              Load:{" "}
              <span className="text-[#ffd24a] ml-1">{loadType}</span>
            </Badge>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left controls */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
            <CardHeader className="p-4">
              <CardTitle className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#ffd24a]">Inputs</div>
                    <div className="text-xs text-zinc-400">Voltage • Current • PF • Load Type</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                 <Select onValueChange={(v) => setPreset(v)} defaultValue={preset}>
  <SelectTrigger
    className="w-36 bg-black/80 border border-orange-500/30 
    text-white text-sm rounded-md shadow-sm cursor-pointer 
    hover:border-orange-500/50 focus:ring-2 focus:ring-orange-500 
    transition-all duration-300"
  >
    <SelectValue placeholder="Preset" />
  </SelectTrigger>

  <SelectContent
    className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg"
  >
    <SelectItem
      value="industrial"
      className="text-white hover:bg-orange-500/20 
      data-[highlighted]:text-orange-300 data-[highlighted]:bg-orange-500/30 
      cursor-pointer rounded-sm transition-all duration-200"
    >
      Industrial
    </SelectItem>

    <SelectItem
      value="commercial"
      className="text-white hover:bg-orange-500/20 
      data-[highlighted]:text-orange-300 data-[highlighted]:bg-orange-500/30 
      cursor-pointer rounded-sm transition-all duration-200"
    >
      Commercial
    </SelectItem>

    <SelectItem
      value="residential"
      className="text-white hover:bg-orange-500/20 
      data-[highlighted]:text-orange-300 data-[highlighted]:bg-orange-500/30 
      cursor-pointer rounded-sm transition-all duration-200"
    >
      Residential
    </SelectItem>
  </SelectContent>
</Select>

                </div>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs pb-1 text-zinc-400">Voltage (Vrms)</Label>
                  <Input type="number" value={V} onChange={(e) => setV(toNum(e.target.value))} className="bg-zinc-900/40 border-zinc-800 text-[#ffd24a]" />
                </div>
                <div>
                  <Label className="text-xs pb-1 text-zinc-400">Current (Arms)</Label>
                  <Input type="number" value={I} onChange={(e) => setI(toNum(e.target.value))} className="bg-zinc-900/40 border-zinc-800 text-[#9ee6ff]" />
                </div>
              </div>

              <div>
                <Label className="text-xs pb-1 text-zinc-400">Power Factor (0.01 - 1.00)</Label>
                <div className="flex items-center gap-3">
                  <Input type="number" value={PF} onChange={(e) => setPF(clamp(Number(e.target.value) || 0, 0.01, 0.9999))} className="w-28 bg-zinc-900/40 border-zinc-800 text-[#ff7a2d]" />
                  <div className="flex-1">
                    <Slider defaultValue={[Math.round(PF * 100)]} max={100} className={cn("relative w-full h-3", "bg-zinc-700 dark:bg-zinc-800", "rounded-full")} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs pb-1 text-zinc-400">Load Type</Label>
                  <Select defaultValue={loadType} onValueChange={(v) => setLoadType(v)}>
  <SelectTrigger
    className="w-full bg-black/70 border border-orange-500/30 
    text-[#ffd24a] text-sm rounded-md shadow-sm cursor-pointer 
    hover:border-orange-500/50 focus:ring-2 focus:ring-orange-500 
    transition-all duration-300"
  >
    <SelectValue placeholder="Select Load Type" />
  </SelectTrigger>

  <SelectContent
    className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg"
  >
    <SelectItem
      value="inductive"
      className="text-white hover:bg-orange-500/20 
      data-[highlighted]:text-orange-300 data-[highlighted]:bg-orange-500/30 
      cursor-pointer rounded-sm transition-all duration-200"
    >
      Inductive
    </SelectItem>

    <SelectItem
      value="capacitive"
      className="text-white hover:bg-orange-500/20 
      data-[highlighted]:text-orange-300 data-[highlighted]:bg-orange-500/30 
      cursor-pointer rounded-sm transition-all duration-200"
    >
      Capacitive
    </SelectItem>
  </SelectContent>
</Select>

                </div>
                <div>
                  <Label className="text-xs pb-1 text-zinc-400">Grid Freq</Label>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-1 rounded-full text-xs">{freq} Hz</Badge>
                    <Button variant="ghost" onClick={() => setFreq((f) => (f === 50 ? 60 : 50))} className="text-xs">Toggle</Button>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs pb-1 text-zinc-400">Target PF</Label>
                <div className="flex items-center gap-3">
                  <Input type="number" value={targetPF} onChange={(e) => setTargetPF(clamp(toNum(e.target.value), 0.5, 0.9999))} className="w-28 pb-1 bg-zinc-900/40 border-zinc-800 text-[#ffd24a]" />
                  <div className="flex-1">
                    <Slider value={[targetPF]} onValueChange={(v) => setTargetPF(clamp(v[0], 0.5, 0.9999))} min={0.5} max={0.9999} step={0.01} />
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-between p-3 bg-black/50 border-t border-zinc-800">
              <Badge
  className="bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded-full 
  shadow-sm hover:border-orange-500/50 transition-all duration-300"
>Quick Actions
</Badge>

              <div className="flex items-center gap-2">
                <Button className="bg-white cursor-pointer" variant="ghost" onClick={() => { setRunning((r) => !r); toast.info(running ? "Paused" : "Running"); }}>
                  {running ? <Pause className="w-4 h-4 mr-1 text-[#ffd24a]" /> : <Play className="w-4 h-4 mr-1 text-zinc-300" />}
                  {running ? "Pause" : "Run"}
                </Button>
                <Button className="cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={applyCorrection}><RefreshCw className="w-4 h-4 mr-2" />Apply</Button>
              </div>
            </CardFooter>
          </Card>

          {/* Live readouts */}
          <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm text-[#ffd24a]">Live Readouts</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 p-4">
              <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                <div className="text-xs text-zinc-400">P (W)</div>
                <div className="text-lg font-semibold text-[#00ffbf]"><AnimatedNumber value={stats.P} /></div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                <div className="text-xs text-zinc-400">S (VA)</div>
                <div className="text-lg font-semibold text-[#ffd24a]"><AnimatedNumber value={stats.S} /></div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                <div className="text-xs text-zinc-400">Q (VAR)</div>
                <div className="text-lg font-semibold text-[#9ee6ff]"><AnimatedNumber value={stats.Q} /></div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                <div className="text-xs text-zinc-400">Suggested Qc</div>
                <div className="text-lg font-semibold text-[#9ee6ff]">{round(correction.Qc)}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Visualizers */}
        <div className="lg:col-span-8 space-y-4">
          <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
            <CardHeader className="p-4">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#ffd24a]">Circuit Visualizer</div>
                    <div className="text-xs text-zinc-400">Flowing current • meters • phasor</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300">PF: <span className="text-[#ffd24a] ml-1">{round(stats.PF,3)}</span></Badge>
                  <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300">Q: <span className="text-[#ffd24a] ml-1">{round(stats.Q,2)}</span></Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-3 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <CircuitFlow V={stats.V} I={stats.I} PF={stats.PF} running={running} />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-center">
                    <Phasor P={Math.abs(stats.P)} Q={Math.abs(stats.Q)} />
                  </div>
                  <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                    <div className="text-xs text-zinc-400">Meters</div>
                    <div className="flex items-center gap-4 mt-2">
                      <div>
                        <div className="text-xs text-zinc-400">Voltage</div>
                        <div className="text-lg font-semibold text-[#ffd24a]">{round(stats.V)} V</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-400">Current</div>
                        <div className="text-lg font-semibold text-[#9ee6ff]">{round(stats.I)} A</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-400">PF</div>
                        <div className="text-lg font-semibold text-[#ff7a2d]">{round(stats.PF,3)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Updated Oscilloscope now driven by RAF-simulated history */}
              <RealTimeOscilloscope history={history} running={running} title="Voltage & Current Waveforms" />
            </CardContent>
          </Card>

          <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm text-[#ffd24a]">Correction Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                <div className="text-xs text-zinc-400">Required Qc</div>
                <div className="text-lg font-semibold text-[#9ee6ff]">{round(correction.Qc)} VAR</div>
                <div className="text-xs text-zinc-400 mt-1">Reactive capacity to add</div>
              </div>

              <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                <div className="text-xs text-zinc-400">PF (after)</div>
                <div className="text-lg font-semibold text-[#ffd24a]">{round(correction.PF_after,3)}</div>
                <div className="text-xs text-zinc-400 mt-1">Estimated after applying Qc</div>
              </div>

              <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                <div className="text-xs text-zinc-400">Capacitor (μF)</div>
                <div className="text-lg font-semibold text-white">{correction.C_uF ? `${round(correction.C_uF,1)} μF` : "—"}</div>
                <div className="text-xs text-zinc-400 mt-1">Estimate @ {freq} Hz</div>
              </div>
            </CardContent>

            <CardFooter className="p-3 flex gap-3 justify-end bg-black/50 border-t border-zinc-800">
              <Button className="cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={applyCorrection}><RefreshCw className="w-4 h-4 mr-2" />Simulate Apply</Button>
              <Button className="bg-white cursor-pointer" variant="ghost" onClick={resetAll}>Reset</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
