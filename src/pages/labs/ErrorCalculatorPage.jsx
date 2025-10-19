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
  MessageSquareTextIcon,
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
 function ErrorVisualizerSVG({ practical, theoretical, history = [], running = true }) {
  // use latest history fallback
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d = 2) => Number.parseFloat(v).toFixed(d);
const map = (v, a1, a2, b1, b2) => b1 + ((v - a1) * (b2 - b1)) / (a2 - a1);
  const latest = history.length ? history[history.length - 1] : { practical: 0, theoretical: 0, pctErr: 0 };
  const p = Number.isFinite(Number(practical)) ? Number(practical) : latest.practical || 0;
  const t = Number.isFinite(Number(theoretical)) ? Number(theoretical) : latest.theoretical || 0;
  const abs = p - t;
  const pct = Number.isFinite(Number(((Math.abs(abs) / (Math.abs(t) || 1)) * 100))) ? Math.abs((abs / (Math.abs(t) || 1)) * 100) : 0;
  const sign = abs >= 0 ? 1 : -1;

  // visual params
  const svgW = 980;
  const svgH = 320;
  const centerX = svgW / 2;
  const centerY = svgH / 2;

  // meter settings
  const meterRadius = 70;
  const meterCirc = 2 * Math.PI * meterRadius;
  const pctClamped = clamp(pct, 0, 100);

  // color states depending on error
  const meterColor = pctClamped <= 5 ? "#1dd97d" : pctClamped <= 10 ? "#ffd24a" : "#ff6b4a"; // green -> yellow -> red

  // compute needle angles for small semicircles (-60..60)
  const maxRange = Math.max(Math.abs(t), Math.abs(p), 1) * 1.6;
  const mapToAngle = (val) => map(clamp(val, -maxRange, maxRange), -maxRange, maxRange, -60, 60);
  const needleAnglePractical = mapToAngle(p);
  const needleAngleTheoretical = mapToAngle(t);

  // waveform generation (sine) — used to draw two wave paths; amplitude modulated by values
  const waveform = useMemo(() => {
    const points = 240; // resolution
    const width = svgW - 260; // available width for wave area
    const left = 140;
    const right = left + width;
    const xStep = width / (points - 1);

    // amplitude scale based on values
    const maxAmp = 28; // px
    const ampT = clamp((Math.abs(t) / (Math.abs(maxRange) || 1)) * maxAmp + 6, 6, maxAmp);
    const ampP = clamp((Math.abs(p) / (Math.abs(maxRange) || 1)) * maxAmp + 6, 6, maxAmp);

    // small phase offset shows drift
    const phaseOffset = clamp((p - t) / (maxRange || 1), -1, 1) * Math.PI * 0.6;

    const tPoints = [];
    const pPoints = [];
    for (let i = 0; i < points; i++) {
      const x = left + i * xStep;
      const tY = centerY - Math.sin((i / points) * Math.PI * 4 + 0.0) * ampT;
      const pY = centerY - Math.sin((i / points) * Math.PI * 4 + phaseOffset) * ampP + (sign * clamp((pct / 100) * 6, -8, 8));
      tPoints.push([x, tY]);
      pPoints.push([x, pY]);
    }

    const toPath = (pts) => {
      return pts.reduce((acc, [x, y], i) => (i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`), "");
    };

    return {
      left,
      right,
      tPath: toPath(tPoints),
      pPath: toPath(pPoints),
      tPoints,
      pPoints,
      ampT,
      ampP,
    };
  }, [p, t, pct]);

  // particle sparkles — lightweight animation via CSS keyframes with unique offsets
  const dotCount = clamp(Math.round(8 + pct / 6), 6, 28);

  // core pulse speed (higher error -> faster)
  const coreSpeed = map(clamp(pct, 0, 100), 0, 100, 2.6, 0.6);
  const coreScale = map(clamp(pct, 0, 100), 0, 100, 0.96, 1.18);

  // meter dash length mapping
  const meterFill = map(pctClamped, 0, 100, 0.02, 0.98);
  const meterDashOffset = Math.max(0, meterCirc * (1 - meterFill));

  // Animated counters
  const [animatedPct, setAnimatedPct] = useState(pctClamped);
  useEffect(() => {
    if (!running) return;
    let raf;
    const start = performance.now();
    const from = animatedPct;
    const to = pctClamped;
    const dur = 600;
    const tick = (tstamp) => {
      const dt = clamp((tstamp - start) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - dt, 3); // easeOutCubic
      setAnimatedPct(from + (to - from) * eased);
      if (dt < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pctClamped, running]);

  // small animation heartbeat for formulas inside core
  const [showFormulaPulse, setShowFormulaPulse] = useState(true);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setShowFormulaPulse((s) => !s), 1200);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div className="w-full rounded-xl p-4 bg-gradient-to-b from-black/60 to-zinc-900/10 border  border-zinc-800 overflow-hidden">
      <div className="flex items-start md:flex-row flex-col   justify-between gap-3">
        <div className="flex items-center gap-3">
           <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <MessageSquareTextIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Error Visualizer</div>
            <div className="text-xs text-zinc-400">Live % difference • cinematic neon UI • waveform comparison</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Prac: <span className="text-[#00ffbf] ml-1">{isNaN(p) ? "—" : p}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Theo: <span className="text-[#ffd24a] ml-1">{isNaN(t) ? "—" : t}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">%Err: <span className="text-[#ff9a4a] ml-1">{isNaN(pctClamped) ? "—" : `${round(pctClamped, 3)} %`}</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-hidden">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-72">
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <linearGradient id="meterGradient" x1="0" x2="1">
              <stop offset="0%" stopColor="#1dd97d" />
              <stop offset="40%" stopColor="#ffd24a" />
              <stop offset="100%" stopColor="#ff6b4a" />
            </linearGradient>

            <linearGradient id="theoGrad" x1="0" x2="1">
              <stop offset="0%" stopColor="#00eaff" />
              <stop offset="100%" stopColor="#00b3ff" />
            </linearGradient>

            <linearGradient id="pracGrad" x1="0" x2="1">
              <stop offset="0%" stopColor="#ff7a2d" />
              <stop offset="100%" stopColor="#ffd24a" />
            </linearGradient>

            <radialGradient id="coreGrad">
              <stop offset="0%" stopColor="#a56bff" stopOpacity="1" />
              <stop offset="60%" stopColor="#7b4bff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#2a0b3a" stopOpacity="0.12" />
            </radialGradient>

            <mask id="waveMask">
              <rect x="0" y="0" width="100%" height="100%" fill="#000" />
              <path d={waveform.tPath} stroke="#fff" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" transform="translate(0,0)" />
            </mask>
          </defs>

          {/* subtle grid background */}
          <g opacity="0.06">
            <rect x="0" y="0" width={svgW} height={svgH} fill="#0b0b0f" />
            {Array.from({ length: 30 }).map((_, i) => (
              <line key={`g-${i}`} x1={20 + i * 30} x2={20 + i * 30} y1={0} y2={svgH} stroke="#fff" strokeWidth="0.3" />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={`h-${i}`} x1={0} x2={svgW} y1={10 + i * 26} y2={10 + i * 26} stroke="#fff" strokeWidth="0.3" />
            ))}
          </g>

          {/* horizontal bus line */}
          <path d={`M 120 ${centerY} H ${svgW - 120}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* left source box */}
          <g transform={`translate(60, ${centerY})`}>
            <rect x="-44" y="-42" width="88" height="84" rx="8" fill="#808080" stroke="#1a1a1a" />
            <text x="-32" y="-54" fontSize="11" fill="#a9a9a9">Ideal Source</text>
            <text x="-34" y="60" fontSize="11" fill="#00eaff">Ideal Value</text>
          </g>

          {/* right meters cluster */}
          <g transform={`translate(${svgW - 140}, ${centerY})`}>
            <rect x="-72" y="-88" width="144" height="176" rx="12" fill="#07070a" stroke="#1a1a1a" />
            <text x="-56" y="-64" fontSize="11" fill="#ffb57a">Meters</text>

            {/* practical semicircle */}
            <g transform={`translate(-28, 10)`}>
              <path d="M -72 48 A 72 72 0 0 1 72 48" fill="none" stroke="#151515" strokeWidth="10" />
              <path d="M -68 44 A 68 68 0 0 1 68 44" fill="none" stroke="#0b0b0d" strokeWidth="6" />
              <line x1="0" y1="0" x2="0" y2="-50" transform={`rotate(${needleAnglePractical})`} stroke="#00ffbf" strokeWidth="3.2" strokeLinecap="round" />
              <text x="-28" y="84" fontSize="10" fill="#00ffbf">Practical</text>
            </g>

            {/* theoretical semicircle */}
            <g transform={`translate(48, 10)`}>
              <path d="M -36 24 A 36 36 0 0 1 36 24" fill="none" stroke="#151515" strokeWidth="8" />
              <path d="M -32 20 A 32 32 0 0 1 32 20" fill="none" stroke="#0b0b0d" strokeWidth="4" />
              <line x1="0" y1="0" x2="0" y2="-26" transform={`rotate(${needleAngleTheoretical})`} stroke="#ffd24a" strokeWidth="2.8" strokeLinecap="round" />
              <text x="-18" y="62" fontSize="9" fill="#ffd24a">Theoretical</text>
            </g>
          </g>

          {/* The two energy streams — thick glowing beams */}
          <g>
            {/* theoretical beam (cyan) */}
            <path
              d={`M ${waveform.left - 20} ${centerY - 120} C ${centerX - 160} ${centerY - 80}, ${centerX - 80} ${centerY - 16}, ${centerX - 12} ${centerY - 2}`}
              stroke="url(#theoGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              fill="none"
              filter="url(#glow)"
              opacity="0.98"
              style={{ mixBlendMode: 'screen' }}
            />

            {/* practical beam (amber) */}
            <path
              d={`M ${waveform.left - 20} ${centerY + 120} C ${centerX - 160} ${centerY + 80}, ${centerX - 80} ${centerY + 16}, ${centerX - 12} ${centerY + 2}`}
              stroke="url(#pracGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              fill="none"
              filter="url(#glow)"
              opacity="0.98"
              style={{ mixBlendMode: 'screen' }}
            />

            {/* animated particles along beams */}
            {Array.from({ length: dotCount }).map((_, i) => {
              const offset = (i / dotCount) * 1.0;
              const ySign = i % 2 === 0 ? -1 : 1;
              const cx = waveform.left + (i * 12) % (waveform.right - waveform.left);
              const cy = centerY + ySign * (40 + ((i % 5) * 3));
              const delay = (i / dotCount) * 1.6;
              const color = i % 2 === 0 ? '#00eaff' : '#ff7a2d';
              return (
                <circle key={`part-${i}`} cx={cx} cy={cy} r={2 + ((i % 3) / 2)} fill={color} opacity={0.9} filter="url(#glow)" style={{ animation: `beamDot 1.6s linear ${-delay}s infinite`, transformOrigin: 'center' }} />
              );
            })}
          </g>

          {/* waveform overlay (two lines) */}
          <g>
            <path d={waveform.tPath} stroke="#00eaff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" opacity="0.95" />
            <path d={waveform.pPath} stroke="#ff7a2d" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" opacity="0.95" />

            {/* glowing area between curves: draw polygon connecting p and t paths reversed */}
            <path
              d={`${waveform.tPath} L ${waveform.pPoints[waveform.pPoints.length - 1][0]} ${waveform.pPoints[waveform.pPoints.length - 1][1]} ${waveform.pPath.split('M ')[1].replace('L', 'L ')} Z`}
              fill="#ff9a4a"
              opacity="0.06"
              filter="url(#glow)"
            />
          </g>

          {/* central Error Analyzer Core */}
          <g transform={`translate(${centerX - 12}, ${centerY})`}>
            {/* holographic rings */}
            <g>
              <ellipse cx="0" cy="0" rx="86" ry="38" fill="none" stroke="#a56bff" strokeWidth="1.2" opacity="0.08" />
              <ellipse cx="0" cy="0" rx="68" ry="28" fill="none" stroke="#7b4bff" strokeWidth="1.6" opacity="0.06" />
              <ellipse cx="0" cy="0" rx="46" ry="18" fill="none" stroke="#a56bff" strokeWidth="2" opacity="0.05" />
            </g>

            {/* core body */}
            <g style={{ transformOrigin: 'center', transform: `scale(${coreScale})`, transition: 'transform 220ms linear' }}>
              <circle cx="0" cy="0" r="30" fill="url(#coreGrad)" stroke="#d9c8ff" strokeWidth="1.2" filter="url(#glow)" />

              {/* facets / crystal shine */}
              <path d="M -6 -22 L 10 -6 L 6 18 L -10 6 Z" fill="#ffffff22" opacity="0.25" />
              <path d="M 12 -4 L 18 2 L 6 18 L 0 6 Z" fill="#ffffff12" opacity="0.18" />

              {/* core pulse ring */}
              <circle cx="0" cy="0" r="42" fill="none" stroke="#a56bff" strokeWidth="2" opacity="0.12" style={{ animation: `corePulse ${coreSpeed}s ease-in-out infinite` }} />
            </g>

            {/* formula + dynamic % inside core */}
            <g transform="translate(-4, -6)">
              <text x="0" y="-4" fontSize="10" fill="#e9e5ff" textAnchor="middle" opacity={showFormulaPulse ? 1 : 0.5} style={{ transition: 'opacity 320ms' }}>
                Error = |Prac - Theo| / Theo × 100
              </text>
              <text x="0" y="12" fontSize="18" fontWeight="700" fill="#fff" textAnchor="middle" style={{ letterSpacing: '0.6px' }}>{round(animatedPct, 3)}%</text>
            </g>

            {/* tiny indicator arcs that shift color proportionally */}
            <g transform="translate(0,36)">
              <path d="M -56 0 A 56 56 0 0 1 56 0" fill="none" stroke="url(#meterGradient)" strokeWidth="4" strokeLinecap="round" opacity="0.16" />
            </g>
          </g>

          {/* radial error gauge (left of center) */}
          <g transform={`translate(${centerX +120}, ${centerY + 90})`}>
            <circle cx="0" cy="0" r={meterRadius} fill="#050507" stroke="#111" strokeWidth="6" />
            <circle
              cx="0"
              cy="0"
              r={meterRadius}
              fill="none"
              stroke="url(#meterGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${meterCirc}`}
              strokeDashoffset={meterDashOffset}
              style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.9,.2,1), stroke 400ms' }}
            />
            {/* ticks */}
            {Array.from({ length: 11 }).map((_, i) => {
              const a = map(i, 0, 10, -125, -55) * (Math.PI / 180);
              const x1 = Math.cos(a) * (meterRadius - 6);
              const y1 = Math.sin(a) * (meterRadius - 6);
              const x2 = Math.cos(a) * (meterRadius - 14);
              const y2 = Math.sin(a) * (meterRadius - 14);
              return <line key={`tick-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#222" strokeWidth={i % 5 === 0 ? 2 : 1} />;
            })}

            {/* needle */}
            <g style={{ transform: `rotate(${map(animatedPct, 0, 100, -120, -60)}deg)`, transformOrigin: 'center', transition: 'transform 600ms cubic-bezier(.2,.9,.2,1)' }}>
              <line x1="0" y1="8" x2="0" y2={-meterRadius + 12} stroke="#fff" strokeWidth="2.2" strokeLinecap="round" filter="url(#glow)" />
              <circle cx="0" cy="0" r="4" fill="#111" stroke="#fff" strokeWidth="1.2" />
            </g>

            <text x="0" y={meterRadius + 16} fontSize="11" fill="#a9a9a9" textAnchor="middle">Error (%)</text>
            <text x="0" y={meterRadius + 32} fontSize="16" fontWeight={700} fill={meterColor} textAnchor="middle">{round(animatedPct, 2)}%</text>
          </g>

          {/* readouts box */}
          <g transform={`translate(${centerX+200}, 22)`}>
            <rect x="-120" y="-12" width="150" height="96" rx="8" fill="#07070a" stroke="#111" />
            <text x="-110" y="6" fontSize="12" fill="#ffb57a">Readouts</text>
            <text x="-110" y="32" fontSize="13" fill="#fff">Practical: <tspan fill="#00ffbf">{isNaN(p) ? '—' : p}</tspan></text>
            <text x="-110" y="52" fontSize="13" fill="#fff">Theoretical: <tspan fill="#ffd24a">{isNaN(t) ? '—' : t}</tspan></text>
            <text x="-110" y="72" fontSize="13" fill="#fff">Error: <tspan fill="#ff9a4a">{isNaN(pctClamped) ? '—' : `${round(pctClamped, 3)} %`}</tspan></text>
          </g>

          {/* small annotations next to streams */}
          <text x={waveform.left - 40} y={centerY - 128} fontSize="11" fill="#9be9ff">Ideal Value</text>
          <text x={waveform.left - 40} y={centerY + 136} fontSize="11" fill="#ffd6a8">Measured Value</text>

          <style>{`
            @keyframes beamDot {
              0% { opacity: 0; transform: translateY(0) scale(0.9); }
              30% { opacity: 1; transform: translateY(0) scale(1.05); }
              100% { opacity: 0; transform: translateY(${sign >= 0 ? 6 : -6}px) scale(0.85); }
            }

            @keyframes corePulse {
              0% { transform: scale(0.96); opacity: 1; }
              50% { transform: scale(1.04); opacity: 0.84; }
              100% { transform: scale(0.96); opacity: 1; }
            }

            /* subtle flow dots moving along bus using offset-path when supported */
            @keyframes errFlow {
              0% { offset-distance: 0%; opacity: 0.9; }
              60% { opacity: 1; }
              100% { offset-distance: 100%; opacity: 0; }
            }

            /* responsiveness */
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
                    <SelectItem value="voltage"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Voltage (V)</SelectItem>
                    <SelectItem value="current"    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Current (A)</SelectItem>
                    <SelectItem value="resistance"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Resistance (Ω)</SelectItem>
                    <SelectItem value="capacitance"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Capacitance (μF)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={snapshotPNG} title="Save Snapshot">Snapshot</Button>
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
                      <SelectItem value="voltage"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Voltage (V)</SelectItem>
                      <SelectItem value="current"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Current (A)</SelectItem>
                      <SelectItem value="resistance"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Resistance (Ω)</SelectItem>
                      <SelectItem value="capacitance"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Capacitance (μF)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={snapshotPNG}>Snapshot</Button>
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
                          <SelectTrigger className="w-full focus:border-orange-500  bg-zinc-900/60 border cursor-pointer border-zinc-800 text-orange-200 text-sm rounded-md">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                            <SelectItem value="voltage"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Voltage (V)</SelectItem>
                            <SelectItem value="current"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Current (A)</SelectItem>
                            <SelectItem value="resistance"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Resistance (Ω)</SelectItem>
                            <SelectItem value="capacitance"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Capacitance (μF)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Unit</label>
                      <div className="mt-2">
                        <Select value={unit} onValueChange={(v) => setUnit(v)}>
                          <SelectTrigger className="w-full focus:border-orange-400 bg-zinc-900/60 cursor-pointer border border-zinc-800 text-orange-100 text-sm rounded-md">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                            <SelectItem value="V"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">V</SelectItem>
                            <SelectItem value="A"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">A</SelectItem>
                            <SelectItem value="Ω"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Ω</SelectItem>
                            <SelectItem value="μF"     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">μF</SelectItem>
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
                        <div className="text-lg font-semibold text-[#ff9a4a] truncate">{isNaN(absInstant) ? "—" : `${round(absInstant, 6)} ${unit}`}</div>
                        <div className="text-xs text-zinc-400 mt-1">Practical − Theoretical</div>
                      </div>
                      <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                        <div className="text-xs text-zinc-400">Percent Error</div>
                        <div className="text-lg font-semibold text-[#ff9a4a] truncate">{isNaN(pctInstant) ? "—" : `${round(pctInstant, 6)} %`}</div>
                        <div className="text-xs text-zinc-400 mt-1">Unsigned</div>
                      </div>
                      <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                        <div className="text-xs text-zinc-400">Signed %</div>
                        <div className="text-lg font-semibold text-[#00ffbf] truncate">{isNaN(signedPct) ? "—" : `${round(signedPct, 6)} %`}</div>
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
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden snapshot">
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
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{isNaN(last.pctErr) ? "—" : `${round(last.pctErr, 6)} %`}</div>
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
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
