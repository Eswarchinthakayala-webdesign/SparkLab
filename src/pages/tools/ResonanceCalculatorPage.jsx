// src/pages/ResonanceCalculatorPage.jsx
"use client";

/**
 * ResonanceCalculatorPage.jsx
 * - Professional SparkLab theme
 * - Web Worker simulation (buffered) to avoid React update loops
 * - Responsive design (mobile, tablet, desktop)
 * - SVG visualizer + CSS animations (no per-frame React state)
 * - Oscilloscope (Recharts) fed from worker buffer (throttled)
 * - Animated meters (framer-motion)
 *
 * NOTE: Keep imports aligned to your project structure (shadcn components path).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useSpring, useMotionValue } from "framer-motion";
import { Toaster, toast } from "sonner";
import {
  Zap,
  Gauge,
  CircuitBoard,
  Activity,
  Play,
  Pause,
  Download,
  Settings,
  Radio,
  Menu,
  X,
  RefreshCw,
  Hexagon,
SquarePower,
} from "lucide-react";

import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as ReTooltip, Legend } from "recharts";

// shadcn-like components - update paths if needed
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

////////////////////////////////////////////////////////////////////////////////
// Utilities
////////////////////////////////////////////////////////////////////////////////
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (v, p = 4) => {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

////////////////////////////////////////////////////////////////////////////////
// Inline Web Worker factory
// Returns { worker, terminate() } or { worker: null } if worker creation fails.
// The worker receives messages: { type: 'updateParams', params }, { type: 'control', action: 'start'|'stop' }
// It posts messages: { type: 'frames', frames: [...] } periodically (buffered).
////////////////////////////////////////////////////////////////////////////////
function createSimulationWorker() {
  // worker code as string
  const code = `
  let running = true;
  let params = {
    L: 0.01, C: 1e-6, R: 10, mode: 'LC', freqProbe: 1000, sampleRate: 4096, commitMs: 120
  };
  let t = 0;
  let buffer = [];
  let lastCommit = performance.now();
  function updateParams(p) { params = {...params, ...p}; }
  function simulateStep(dt) {
    // dt in seconds
    // compute resonant freq based on current L,C
    const L = Number(params.L) || 0;
    const C = Number(params.C) || 0;
    const R = Number(params.R) || 0;
    if (!L || !C) return;
    const w0 = 1/Math.sqrt(L*C);
    // for demonstration we'll simulate a driven sinusoid near resonance
    // compute instantaneous voltage (Vp=1 normalized) and current depending on R/L/C model
    const freq = params.freqProbe || (w0/(2*Math.PI));
    const w = 2 * Math.PI * freq;
    // simple driven RLC (series) model instantaneous: v = Vp*sin(wt), current approximated as I = v/Z (using phasor magnitude)
    // Compute impedances (magnitude) at drive freq:
    const XL = w * L;
    const XC = 1 / (w * C);
    const Zeq = Math.sqrt(Math.pow(R,2) + Math.pow(XL - XC,2));
    const Imag = Zeq > 0 ? 1 / Zeq : 0; // Vpeak=1
    // instantaneous using phase shift phi = atan((XL-XC)/R)
    const phi = Math.atan2(XL - XC, R);
    const v = Math.sin(w * t);
    const i = Imag * Math.sin(w * t - phi);
    const p = v * i;
    buffer.push({ t, v, i, p, freq, L, C, R });
  }
  function loop() {
    const now = performance.now();
    const targetDt = 1000 / (params.sampleRate || 2048); // ms per sample
    if (running) {
      // produce a small batch each loop iteration (aim near sampleRate but we buffer)
      const batchCount = 4; // produce few samples per loop
      for (let k=0;k<batchCount;k++){
        simulateStep(targetDt/1000);
        t += targetDt/1000;
      }
    }
    const now2 = performance.now();
    if (now2 - lastCommit >= (params.commitMs || 120) && buffer.length > 0) {
      postMessage({ type: 'frames', frames: buffer.splice(0) });
      lastCommit = now2;
    }
    setTimeout(loop, 8); // run at ~125Hz on main thread of worker
  }

  onmessage = (ev) => {
    const data = ev.data;
    if (!data) return;
    if (data.type === 'updateParams') {
      updateParams(data.params);
    } else if (data.type === 'control') {
      if (data.action === 'start') running = true;
      if (data.action === 'stop') running = false;
      if (data.action === 'reset') { t = 0; buffer = []; }
    }
  };

  loop();
  `;

  try {
    const blob = new Blob([code], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    return {
      worker,
      terminate: () => {
        worker.terminate();
        URL.revokeObjectURL(url);
      },
    };
  } catch (err) {
    console.error("Worker creation failed:", err);
    return { worker: null, terminate: () => {} };
  }
}

////////////////////////////////////////////////////////////////////////////////
// useResonanceSimulation hook
// abstracts worker vs fallback loop and provides buffered history
////////////////////////////////////////////////////////////////////////////////
function useResonanceSimulation({ L, C, R, mode, probeFreq, running, sampleRate = 4096, commitMs = 120 }) {
  const [history, setHistory] = useState([]); // committed frames
  const workerRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const { worker, terminate } = createSimulationWorker();
    workerRef.current = worker;
    if (!worker) {
      // fallback to in-main simulation if worker not supported
      let alive = true;
      let t = 0;
      let buffer = [];
      let lastCommit = performance.now();
      const simulateStep = (dt) => {
        const Lval = Number(L) || 0;
        const Cval = Number(C) || 0;
        const Rval = Number(R) || 0;
        if (!Lval || !Cval) return;
        const w0 = 1 / Math.sqrt(Lval * Cval);
        const w = 2 * Math.PI * (probeFreq || w0 / (2 * Math.PI));
        const XL = w * Lval;
        const XC = 1 / (w * Cval);
        const Zeq = Math.sqrt(Rval*Rval + Math.pow(XL - XC,2));
        const Imag = Zeq > 0 ? 1 / Zeq : 0;
        const phi = Math.atan2(XL - XC, Rval);
        const v = Math.sin(w * t);
        const i = Imag * Math.sin(w * t - phi);
        const p = v*i;
        buffer.push({ t, v, i, p, freq: probeFreq, L: Lval, C: Cval, R: Rval });
        t += dt;
      };
      const loop = () => {
        if (!alive) return;
        if (running) {
          // produce multiple steps
          const dt = 1 / (sampleRate || 2048);
          for (let k = 0; k < 4; k++) simulateStep(dt);
        }
        const now = performance.now();
        if (now - lastCommit >= commitMs && buffer.length > 0) {
          setHistory((h) => {
            const next = [...h, ...buffer.splice(0)];
            const maxKeep = 1200;
            if (next.length > maxKeep) return next.slice(next.length - maxKeep);
            return next;
          });
          lastCommit = now;
        }
        setTimeout(loop, 8);
      };
      loop();
      return () => { alive = false; mountedRef.current = false; };
    } else {
      // worker exists
      const onMessage = (ev) => {
        const d = ev.data;
        if (!d) return;
        if (d.type === "frames" && Array.isArray(d.frames) && d.frames.length) {
          setHistory((h) => {
            const next = [...h, ...d.frames];
            const maxKeep = 1200;
            if (next.length > maxKeep) return next.slice(next.length - maxKeep);
            return next;
          });
        }
      };
      worker.addEventListener("message", onMessage);
      // initialize params
      worker.postMessage({ type: "updateParams", params: { L, C, R, mode, freqProbe: probeFreq, sampleRate, commitMs } });
      worker.postMessage({ type: "control", action: running ? "start" : "stop" });
      return () => {
        worker.removeEventListener("message", onMessage);
        terminate();
        mountedRef.current = false;
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only once

  // keep worker params in sync
  useEffect(() => {
    const w = workerRef.current;
    if (w) {
      w.postMessage({ type: "updateParams", params: { L, C, R, mode, freqProbe: probeFreq, sampleRate, commitMs } });
      w.postMessage({ type: "control", action: running ? "start" : "stop" });
    }
  }, [L, C, R, mode, probeFreq, sampleRate, commitMs, running]);

  // expose history and a reset control
  const reset = useCallback(() => {
    const w = workerRef.current;
    if (w) {
      w.postMessage({ type: "control", action: "reset" });
      setHistory([]);
    } else {
      setHistory([]);
    }
  }, []);

  return { history, reset };
}

////////////////////////////////////////////////////////////////////////////////
// AnimatedNumber: framer-motion + spring for smooth meter numbers
////////////////////////////////////////////////////////////////////////////////
function AnimatedNumber({ value = 0, precision = 2, className = "" }) {
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 280, damping: 30 });
  useEffect(() => mv.set(value), [value, mv]);
  const display = useMemo(() => {
    // We'll just render the numeric value using toFixed; framer-motion handles fluidity internally
    return Number(value).toFixed(precision);
  }, [value, precision]);
  return <motion.span className={className}>{display}</motion.span>;
}

////////////////////////////////////////////////////////////////////////////////
// Oscilloscope (Recharts) - memoized data to avoid re-renders
////////////////////////////////////////////////////////////////////////////////
function Oscilloscope({ history = [], running, height = 220 }) {
  const data = useMemo(() => {
    const slice = history.length > 400 ? history.slice(history.length - 400) : history;
    return slice.map((d, idx) => ({ t: idx, v: round(d.v, 4), i: round(d.i, 6) }));
  }, [history]);

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${running ? "bg-[#ff7a2d] animate-pulse" : "bg-zinc-700"}`} />
          <div className="text-sm font-medium text-[#ff7a2d]">Oscilloscope</div>
        </div>
        <div
  className="inline-flex items-center gap-2 text-xs sm:text-sm
  bg-orange-900/20 border border-orange-500/30 text-zinc-300
  px-3 py-1.5 rounded-full shadow-sm"
>
  <span className="text-orange-400">
    <span className="text-yellow-400 font-medium">v</span> (yellow)
    &nbsp;•&nbsp;
    <span className="text-cyan-400 font-medium">i</span> (cyan)
  </span>
</div>

      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#070707", border: "1px solid #222", color: "#fff",borderRadius:"10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line dataKey="v" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="i" stroke="#00ffbf" strokeWidth={1.4} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

////////////////////////////////////////////////////////////////////////////////
// PhasorDiagram component - visualizes rotating phasors for L & C (I vectors)
////////////////////////////////////////////////////////////////////////////////
function PhasorDiagram({ L, C, R, probeFreq, running }) {
  // compute magnitudes of I (approx at probeFreq)
  const Lval = toNum(L);
  const Cval = toNum(C);
  const Rval = toNum(R);
  const w = 2 * Math.PI * (probeFreq || (Lval && Cval ? 1 / (2 * Math.PI * Math.sqrt(Lval * Cval)) : 50));
  const XL = w * Lval;
  const XC = Cval ? 1 / (w * Cval) : 0;
  // for normalized Vpk=1, Ipk magnitudes:
  const Is = Math.sqrt(Rval*Rval + (XL - XC)*(XL - XC)) ? 1 / Math.sqrt(Rval*Rval + (XL - XC)*(XL - XC)) : 0;
  const Ia_mag = Is;
  const Ib_mag = Is;
  const Ic_mag = Is;

  const maxI = Math.max(Ia_mag, Ib_mag, Ic_mag, 0.0001);
  const scale = (v) => (v / maxI) * 40;

  // base angles
  const baseAngles = [0, -2 * Math.PI / 3, 2 * Math.PI / 3];
  const colors = ["#ffd24a", "#9ee6ff", "#ff9a4a"];

  return (
    <svg width="160" height="160" viewBox="0 0 160 160" className="mx-auto">
      <rect x="0" y="0" width="160" height="160" rx="8" fill="#060606" stroke="#222" />
      <g transform="translate(80,80)">
        <circle r="60" stroke="#222" strokeDasharray="4 4" fill="none" />
        {baseAngles.map((ang, i) => {
          const len = scale([Ia_mag, Ib_mag, Ic_mag][i]);
          const x = Math.cos(ang) * len;
          const y = Math.sin(ang) * len;
          const color = colors[i];
          return (
            <g key={i}>
              <line x1="0" y1="0" x2={x} y2={y} stroke={color} strokeWidth="3" strokeLinecap="round" />
              <circle cx={x} cy={y} r="3.5" fill={color} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}


////////////////////////////////////////////////////////////////////////////////
// LCVisualizer component - responsive, uses CSS animations for flowing current
////////////////////////////////////////////////////////////////////////////////
function LCVisualizer({ L, C, R, mode, running, compact = false })  {
  const Lval = toNum(L);
  const Cval = toNum(C);
  const Rval = toNum(R);

  // Derived parameters
  const f0 = useMemo(
    () => (Lval && Cval ? 1 / (2 * Math.PI * Math.sqrt(Lval * Cval)) : 0),
    [Lval, Cval]
  );
  const XL = 2 * Math.PI * (f0 || 1) * Lval;
  const XC = Cval ? 1 / (2 * Math.PI * (f0 || 1) * Cval) : 0;
  const Q = mode !== "LC" && Rval ? Math.sqrt(Lval / Cval) / Rval : 0;

  const speed = Math.max(5 - Q / 60, 0.5);
  const totalDots = 50;
  const wirePathId = "wirePath";

  return (
    <div className="w-full rounded-xl p-4 bg-gradient-to-b from-black/40 to-zinc-900/30 border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center shadow-md">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">
              RLC Resonance Circuit
            </div>
            <div className="text-xs text-zinc-400">
              Real-time current flow • Voltmeter • Phasor simulation
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-2 sm:mt-0">
          <span className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full text-xs">
            Mode: <span className="text-[#ffd24a]">{mode}</span>
          </span>
          <span className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full text-xs">
            f₀: <span className="text-[#ffd24a]">{round(f0, 2)} Hz</span>
          </span>
          <span className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full text-xs">
            Q: <span className="text-[#ffd24a]">{round(Q, 2)}</span>
          </span>
        </div>
      </div>

      {/* Circuit */}
      <div className="mt-3 w-full relative">
        <svg
          viewBox="0 0 900 320"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-72 sm:h-80 md:h-[22rem]"
        >
          <defs>
            <path
              id={wirePathId}
              d="M 110 170 H 630 V 240 H 110 Z"
              fill="none"
            />
            <linearGradient id="wireGrad">
              <stop offset="0%" stopColor="#ffd24a" />
              <stop offset="50%" stopColor="#ff7a2d" />
              <stop offset="100%" stopColor="#ffd24a" />
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer Wire */}
          <path
            d="M 110 170 H 630 V 240 H 110 Z"
            stroke="url(#wireGrad)"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            filter="url(#glow)"
          />

          {/* AC Source */}
          <g transform="translate(120,200)">
            <circle r="25" fill="#0b0b0b" stroke="#ffb86b" strokeWidth="3" filter="url(#glow)" />
            <text x="-10" y="5" fill="#ffd24a" fontSize="12" fontWeight="700">
              AC
            </text>
          </g>

          {/* Resistor */}
          {mode !== "LC" && (
            <g transform="translate(260,150)">
              <path
                d="M 0 10 l 10 -10 l 10 10 l 10 -10 l 10 10 l 10 -10 l 10 10"
                stroke="#00ffbf"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
              <text x="28" y="-12" fill="#00ffbf" fontSize="12">
                R
              </text>
            </g>
          )}

          {/* Inductor */}
          <g transform="translate(420,150)">
            <path
              d="M -40 10 q 10 -30 20 0 q 10 -30 20 0 q 10 -30 20 0 q 10 -30 20 0"
              fill="none"
              stroke="#ff9a4a"
              strokeWidth="4"
              strokeLinecap="round"
              filter="url(#glow)"
            />
            <text x="10" y="-20" fill="#ff9a4a" fontSize="12">
              L
            </text>
          </g>

          {/* Capacitor */}
          <g transform="translate(620,120)">
            <line x1="-10" y1="10" x2="-10" y2="80" stroke="#9ee6ff" strokeWidth="4" />
            <line x1="-20" y1="10" x2="-20" y2="80" stroke="#9ee6ff" strokeWidth="4" />
            <text x="-16" y="-1" fill="#9ee6ff" fontSize="12">
              C
            </text>
          </g>

          {/* Voltmeter */}
          <g transform="translate(640,200)">
            <circle r="25" fill="#0b0b0b" stroke="#9ee6ff" strokeWidth="3" filter="url(#glow)" />
            <text x="-10" y="5" fill="#9ee6ff" fontSize="12">
              V
            </text>
          </g>
             <g transform="translate(780,40)">
            <rect x="-90" y="-90" width="170" height="120" rx="12" fill="#060606" stroke="#222" />
            <text x="-80" y="-70" fill="#ffd24a" fontSize="12">Meters</text>
            <text x="-80" y="-50" fill="#9ee6ff" fontSize="12">XL: <tspan fill="#fff">{round(XL,2)} Ω</tspan></text>
            <text x="-80" y="-35" fill="#ffd24a" fontSize="12">XC: <tspan fill="#fff">{round(XC,2)} Ω</tspan></text>
            <text x="-80" y="-20" fill="#00ffbf" fontSize="12">Q (approx): <tspan fill="#fff">{mode === 'LC' ? '—' : 'see results'}</tspan></text>
          </g>

          {/* Animated dots */}
          {Array.from({ length: totalDots }).map((_, i) => {
            const begin = `${(i * speed) / totalDots}s`;
            return (
              <circle key={`${i}-${running}`} r={4} fill="#00ffbf">
                {running && (
                  <animateMotion dur={`${speed}s`} repeatCount="indefinite" begin={begin}>
                    <mpath xlinkHref={`#${wirePathId}`} />
                  </animateMotion>
                )}
              </circle>
            );
          })}
        </svg>
      </div>

      {/* Formulas & Phasor */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-1 border border-zinc-800 rounded-md p-2">
      <div className="inline-flex items-center gap-2 text-xs sm:text-sm 
  bg-black/70 border border-orange-500/30 text-orange-400 
  px-3 py-1.5 rounded-md shadow-sm mb-1">
  <span>Phasor (I vectors)</span>
</div>

          <PhasorDiagram L={L} C={C} R={R} probeFreq={f0} running={running} />
        </div>
      <div className="sm:col-span-1 rounded-lg p-4 bg-black/70 border border-orange-500/20 
     text-sm leading-relaxed text-zinc-200 shadow-md hover:border-orange-500/30 
     transition-colors duration-300">
  <div><strong className="text-orange-400">f₀</strong> = 1 / (2π√(LC))</div>
  <div><strong className="text-orange-400">X<sub>L</sub></strong> = 2πfL <span className="text-zinc-400">— inductive reactance</span></div>
  <div><strong className="text-orange-400">X<sub>C</sub></strong> = 1 / (2πfC) <span className="text-zinc-400">— capacitive reactance</span></div>
  <div><strong className="text-orange-400">Q</strong> = (1/R)√(L/C)</div>
  <div className="mt-3 text-zinc-400 text-[13px]">
    At resonance (<span className="text-orange-400">X<sub>L</sub> = X<sub>C</sub></span>), current peaks and the circuit becomes purely resistive.
  </div>
</div>


      </div>
    </div>
  );
}
////////////////////////////////////////////////////////////////////////////////
// Main Page Component
////////////////////////////////////////////////////////////////////////////////
export default function ResonanceCalculatorPage() {
  // inputs
  const [L, setL] = useState("0.01"); // H
  const [C, setC] = useState("1e-6"); // F
  const [R, setR] = useState("10"); // ohm
  const [mode, setMode] = useState("SeriesRLC"); // 'LC' | 'SeriesRLC' | 'ParallelRLC'
  const [probeFreq, setProbeFreq] = useState(0); // optional manual probe frequency (0 => use f0)
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const Lval = toNum(L);
  const Cval = toNum(C);
  const Rval = toNum(R);
  const f0 = Lval && Cval ? 1 / (2 * Math.PI * Math.sqrt(Lval * Cval)) : 0;
  const Q = (() => {
    if (mode === "LC") return NaN;
    if (mode === "SeriesRLC") return Rval === 0 ? Infinity : (1 / Rval) * Math.sqrt(Lval / Cval);
    if (mode === "ParallelRLC") return Rval * Math.sqrt(Cval / Lval);
    return NaN;
  })();
  const BW = f0 && Q ? f0 / (Q || 1) : 0;

  // simulation hook
  const { history, reset } = useResonanceSimulation({
    L: Lval,
    C: Cval,
    R: Rval,
    mode,
    probeFreq: probeFreq || f0 || 1000,
    sampleRate: 4096,
    commitMs: 120,
    running,
  });

  // derived summary numbers for UI
  const latest = history.length ? history[history.length - 1] : null;
  const vNow = latest ? round(latest.v, 4) : 0;
  const iNow = latest ? round(latest.i, 6) : 0;
  const pNow = latest ? round(latest.p, 6) : 0;

  // animated number springs
  const vSpring = useSpring(vNow, { stiffness: 200, damping: 28 });
  const iSpring = useSpring(iNow, { stiffness: 200, damping: 28 });

  // snapshot
  const snapshot = useCallback(() => {
    toast.success("Snapshot (temporary) saved");
  }, []);

  // export CSV (history)
  const exportCSV = useCallback(() => {
    const rows = [["t", "v", "i", "p"]];
    history.forEach((d) => rows.push([round(d.t,6), round(d.v,6), round(d.i,6), round(d.p,6)]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resonance-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  }, [history]);

  // reset handler
  const handleReset = useCallback(() => {
    setL("0.01"); setC("1e-6"); setR("10"); setMode("SeriesRLC"); setProbeFreq(0);
    reset();
    toast("Reset to defaults");
  }, [reset]);

  // responsive header (mobile toggle)
  const Header = (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-black/60 border-b border-zinc-800 py-2">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm text-zinc-300">SparkLab</div>
              <div className="font-semibold text-xs sm:text-sm md:text-sm text-zinc-400">Resonance Frequency Calculator</div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="text-xs text-zinc-400">L</div>
              <Input value={L} onChange={(e) => setL(e.target.value)} className="w-28 bg-zinc-900/60 border border-zinc-800 text-white text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-zinc-400">C</div>
              <Input value={C} onChange={(e) => setC(e.target.value)} className="w-36 bg-zinc-900/60 border border-zinc-800 text-white text-sm" />
            </div>

            <Button className="cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={snapshot}>Snapshot</Button>
            <Button variant="ghost" className="border cursor-pointer border-zinc-800" onClick={() => setRunning((s) => !s)}>{running ? <Pause /> : <Play />}</Button>
            <Button variant="ghost" className="border cursor-pointer border-zinc-800" onClick={exportCSV}><Download /></Button>
          </div>

          <div className="md:hidden">
            <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2" onClick={() => setMobileOpen((s) => !s)}>{mobileOpen ? <X /> : <Menu />}</Button>
          </div>
        </div>

        <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-56 py-3" : "max-h-0"}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1 flex-1">
              <div className="text-[11px] text-zinc-400">L (H)</div>
              <Input value={L} onChange={(e) => setL(e.target.value)} className="flex-1 bg-zinc-900/60 border border-zinc-800 text-white text-xs" />
            </div>
            <div className="flex items-center gap-1 flex-1">
              <div className="text-[11px] text-zinc-400">C (F)</div>
              <Input value={C} onChange={(e) => setC(e.target.value)} className="flex-1 bg-zinc-900/60 border border-zinc-800 text-white text-xs" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button className="cursor-pointer flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2" onClick={snapshot}>Snapshot</Button>
            <Button variant="ghost" className="flex-1 cursor-pointer border border-zinc-800 text-xs py-2" onClick={() => setRunning((s) => !s)}>{running ? "Pause" : "Play"}</Button>
            <Button variant="ghost" className="flex-1 cursor-pointer border border-zinc-800 text-xs py-2" onClick={exportCSV}>Export</Button>
          </div>
        </div>
      </div>
    </header>
  );

  // Responsive layout
  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white pb-20 sm:pb-2">
      <Toaster position="top-right" richColors />
      {Header}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left controls (inputs + results + formulas) */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-[#ffd24a] flex items-center gap-2"><CircuitBoard className="w-5 h-5" /> Configuration</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-400">Inductance (H)</label>
                    <Input value={L} onChange={(e) => setL(e.target.value)} className="w-full bg-zinc-900/60 border border-zinc-800 text-white" />
                    <div className="text-xs text-zinc-500 mt-1">Try 0.01</div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400">Capacitance (F)</label>
                    <Input value={C} onChange={(e) => setC(e.target.value)} className="w-full bg-zinc-900/60 border border-zinc-800 text-white" />
                    <div className="text-xs text-zinc-500 mt-1">Try 1e-6</div>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-zinc-400">Resistance (Ω)</label>
                  <Input value={R} onChange={(e) => setR(e.target.value)} className="w-full bg-zinc-900/60 border border-zinc-800 text-white" />
                </div>

                <div>
                  <label className="text-xs text-zinc-400">Circuit Type</label>
                 <Select value={mode} onValueChange={(v) => setMode(v)}>
  <SelectTrigger className="w-full bg-black/70 border border-orange-500/30 
    text-white text-sm rounded-md shadow-sm hover:border-orange-500/50 
    focus:ring-2 focus:ring-orange-500 transition-all duration-300">
    <SelectValue placeholder="Select Mode" />
  </SelectTrigger>

  <SelectContent className="bg-zinc-900 cursor-pointer border border-zinc-800 rounded-md shadow-lg">
    <SelectItem
      value="LC"
      className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-300 
        data-[highlighted]:bg-orange-500/30 cursor-pointer rounded-sm transition-all duration-200"
    >
      LC (Ideal)
    </SelectItem>
    <SelectItem
      value="SeriesRLC"
      className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-300 
        data-[highlighted]:bg-orange-500/30 cursor-pointer rounded-sm transition-all duration-200"
    >
      Series RLC
    </SelectItem>
    <SelectItem
      value="ParallelRLC"
      className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-300 
        data-[highlighted]:bg-orange-500/30 cursor-pointer rounded-sm transition-all duration-200"
    >
      Parallel RLC
    </SelectItem>
  </SelectContent>
</Select>

                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="text-xs text-zinc-400">Probe Frequency (Hz)</label>
                    <Input value={probeFreq || ""} onChange={(e) => setProbeFreq(e.target.value)} placeholder={`auto f0 (${round(f0,2)} Hz)`} className="w-full bg-zinc-900/60 border border-zinc-800 text-white" />
                    <div className="text-xs text-zinc-500 mt-1">Leave empty to use f₀</div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button className=" cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a]" onClick={snapshot}><SquarePower className="w-4 h-4 mr-1" /> Snapshot</Button>
                    <Button className="cursor-pointer" variant="outline" onClick={() => setRunning(true)}><Play /></Button>
                    <Button className="cursor-pointer" variant="outline" onClick={() => setRunning(false)}><Pause /></Button>
                  </div>
                </div>

              </CardContent>
            </Card>

            <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-[#ffd24a] flex items-center gap-2"><Gauge className="w-5 h-5" /> Calculated</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-zinc-400">Resonant Frequency f₀</div>
                    <div className="text-lg font-semibold text-[#ffd24a]">{round(f0, 4)} Hz</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Bandwidth</div>
                    <div className="text-lg font-semibold text-[#ff7a2d]">{(isFinite(BW) ? round(BW, 4) : "—")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Quality Factor Q</div>
                    <div className="text-lg font-semibold text-[#00ffbf]">{isFinite(Q) ? round(Q, 4) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Current (instant)</div>
                    <div className="text-lg font-semibold text-[#9ee6ff]">{round(iNow, 6)} A</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-[#ffd24a] flex items-center gap-2"><Activity className="w-5 h-5" /> Formulas</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-300">
                <div className="space-y-2">
                  <div><strong>f₀</strong> = 1 / (2π√(LC))</div>
                  <div><strong>XL</strong> = 2πfL</div>
                  <div><strong>XC</strong> = 1 / (2πfC)</div>
                  <div><strong>Q (series)</strong> = 1/R × √(L/C)</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Visualizer + Oscilloscope + Results */}
<div className="lg:col-span-8 space-y-4 w-full">

  {/* Resonance Visualizer Card */}
 <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
      {/* Header */}
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
          {/* Left Section: Icon + Title */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black flex-shrink-0">
              <Hexagon className="w-5 h-5" />
            </div>
            <div className="truncate min-w-0">
              <div className="text-base sm:text-lg font-semibold text-[#ffd24a] truncate">
                Resonance Visualizer
              </div>
              <div className="text-[11px] sm:text-xs text-zinc-400 truncate">
                Animated circuit • phasor diagram • meters
              </div>
            </div>
          </div>

          {/* Right Section: Badges */}
          <div className="flex flex-wrap gap-2 mt-2 sm:mt-0 justify-start sm:justify-end w-full sm:w-auto">
            <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs truncate">
              Mode: <span className="text-[#ffd24a] ml-1">{mode}</span>
            </Badge>
            <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs truncate">
              f₀: <span className="text-[#ffd24a] ml-1">{round(isFinite(1/(2*Math.PI*Math.sqrt(L*C))) ? 1/(2*Math.PI*Math.sqrt(L*C)) : 0, 2)} Hz</span>
            </Badge>
            <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs truncate">
              Q: <span className="text-[#ffd24a] ml-1">
                {isFinite(Math.sqrt(L/C) / (R || 1)) ? round(Math.sqrt(L/C) / (R || 1), 3) : "—"}
              </span>
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      {/* Content */}
      <CardContent className="w-full p-3 sm:p-5 overflow-hidden">
        {/* Wrapper for SVG to control responsiveness */}
        <div className="relative w-full overflow-x-auto overflow-y-hidden">
          <LCVisualizer L={L} C={C} R={R} mode={mode} running={running} />
        </div>
      </CardContent>
    </Card>
  

  {/* Grid for Oscilloscope and Live Readouts */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">

    {/* Oscilloscope */}
    <Oscilloscope history={history} running={running} height={260} className="w-full" />

    {/* Live Readouts Card */}
    <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full">
      <CardHeader>
        <CardTitle className="flex text-[#ffd24a] items-center gap-2 text-sm md:text-base">
          <Activity className="w-4 h-4 " /> Live Readouts
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          <div>
            <div className="text-xs text-zinc-400 truncate">Instant V (pk)</div>
            <div className="text-lg font-semibold text-[#ffd24a] truncate">{round(vNow,4)} V</div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 truncate">Instant I (pk)</div>
            <div className="text-lg font-semibold text-[#9ee6ff] truncate">{round(iNow,6)} A</div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 truncate">Instant P</div>
            <div className="text-lg font-semibold text-[#00ffbf] truncate">{round(pNow,6)} W</div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 truncate">Snapshot</div>
            <div className="text-lg font-semibold text-[#ff7a2d] truncate">Click Snapshot</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-3 flex flex-wrap gap-2 w-full">
          <Button className=" cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] flex-1 md:flex-none min-w-[120px]" onClick={snapshot}>
            <RefreshCw className="w-4 h-4 mr-2" /> Snapshot
          </Button>
          <Button variant="ghost" className="border cursor-pointer border-zinc-800 flex-1 md:flex-none min-w-[80px] text-white" onClick={exportCSV}><Download /></Button>
          <Button variant="ghost" className="border cursor-pointer border-zinc-800 flex-1 md:flex-none min-w-[80px] text-white" onClick={handleReset}><Settings /></Button>
        </div>
      </CardContent>
    </Card>

  </div>
</div>


        </div>
      </main>

      {/* mobile sticky controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:translate-x-0 sm:right-6 sm:bottom-6 lg:hidden">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="cursor-pointer px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 cursor-pointer py-2 border-zinc-700 text-black" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
            <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={handleReset}><Settings className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
