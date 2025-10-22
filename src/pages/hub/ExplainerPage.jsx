// src/pages/ExplainerPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  CircuitBoard,
  Play,
  Pause,
  Settings,
  Menu,
  X,
  Layers,
  Activity,
  Lightbulb,
  Monitor,
  Thermometer,
  Sparkles,
  Cpu,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { toPng } from "html-to-image";  

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
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
   Utilities (safe numeric helpers)
   ============================ */
const toNum = (v, d = 0) => (isNaN(parseFloat(v)) ? d : parseFloat(v));
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const round = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;


/* ============================
   Simulation hook: useExplainerSim
   - supports multiple explainers (RC, RL, RLC, Voltage Divider, LED)
   - returns realtime history and descriptive state
   ============================ */
 function useExplainerSim({ running, timestep = 80, concept = "rc", params = {} }) {
  const historyRef = useRef([]);
  const [history, setHistory] = useState([]);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // --- COMPUTATION ENGINE ---
const computeInstant = useCallback(
  (tSeconds) => {
    const V = Number(params.Vsup) || 5;
    const R = Math.max(1e-6, Number(params.R) || 1000);
    const C = Math.max(1e-12, Number(params.C) || 1e-6);
    const L = Math.max(1e-9, Number(params.L) || 1e-3);
    const freq = Math.max(0.01, Number(params.freq) || 50);

    // --- RC ---
    if (concept === "rc") {
      const tau = R * C;
      const Vc = V * (1 - Math.exp(-tSeconds / tau));
      const I = (V / R) * Math.exp(-tSeconds / tau);
      return { t: tSeconds, Vc, I, P: Vc * I, meta: { tau } };
    }

    // --- RL ---
    if (concept === "rl") {
      const tauL = L / R;
      const Iinf = V / R;
      const I = Iinf * (1 - Math.exp(-tSeconds / tauL));
      const Vl = V - I * R;
      return { t: tSeconds, I, Vl, P: Vl * I, meta: { tauL } };
    }

    // --- RLC ---
    if (concept === "rlc") {
      const w = 2 * Math.PI * freq;
      const Xl = w * L;
      const Xc = 1 / (w * C);
      const Z = Math.sqrt(R ** 2 + (Xl - Xc) ** 2);
      const Iamp = V / Z;
      const phi = Math.atan2(Xl - Xc, R);
      const I = Iamp * Math.sin(w * tSeconds);
      return { t: tSeconds, I, P: 0.5 * Iamp ** 2 * R, meta: { Xl, Xc, Z, Iamp, phi } };
    }

    // --- LED ---
    if (concept === "led") {
      const Vf = Number(params.Vf) || 2.0;
      const Rled = Math.max(1, Number(params.R) || 220);
      const Vdrop = Math.max(0, V - Vf);
      const I = Vdrop / Rled;
      const on = I > 0.001;
      return { t: tSeconds, I, P: V * I, on, meta: { Vf, Rled, Vdrop } };
    }

    // --- Divider ---
    if (concept === "divider") {
      const R1 = Number(params.R1) || 1000;
      const R2 = Number(params.R2) || 1000;
      const Vout = V * (R2 / (R1 + R2));
      const I = V / (R1 + R2);
      return { t: tSeconds, Vout, I, meta: { R1, R2 } };
    }

    return { t: tSeconds, I: 0, Vc: 0, P: 0, meta: {} };
  },
  [concept, params]
);


  // --- Reset on concept change (not params) ---
  useEffect(() => {
    tRef.current = 0;
    lastRef.current = performance.now();
    historyRef.current = [];
    setHistory([]);
  }, [concept]);

  // --- Simulation Loop ---
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
      const sample = computeInstant(tSeconds);

      historyRef.current.push(sample);
      if (historyRef.current.length > 720) historyRef.current.shift();
      setHistory([...historyRef.current]);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeInstant]);

  const latest = history.length ? history[history.length - 1] : null;
  return { history, latest };
}


/* ============================
   Visualizer: ExplainerSVG
   - renders different visualizations depending on concept
   - uses animated particles/needles/led glow for realistic, data-driven visuals
   ============================ */
function ExplainerSVG({ concept, params, history = [], running }) {
  const latest = history.length ? history[history.length - 1] : {};
  // envelope metrics
  const I = latest.I ?? 0;
  const Vc = latest.Vc ?? latest.Vout ?? 0;
  const P = latest.P ?? 0;
  const on = latest.on ?? false;

  // particle count scaled with |I|
  const absI = Math.min(12, Math.abs(I) * 8 + 2);
  const dotCount = clamp(Math.round(absI), 2, 18);
  const speed = clamp(1.2 / (Math.abs(I) + 0.02), 0.25, 3.0);
  const svgW = 1100;
  const svgH = 320;

  // helpers for small animated needle
  const needleAngle = (val, maxVal = 5) => {
    // map [-maxVal,maxVal] to [-40,40] degrees
    const v = clamp(val, -maxVal, maxVal);
    return (v / maxVal) * 40;
  };

  // Choose layout per concept
  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start flex-wrap justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">
              {concept === "rc" ? "RC Charging" : concept === "rl" ? "RL Charging" : concept === "rlc" ? "RLC Resonance" : concept === "divider" ? "Voltage Divider" : "LED Circuit"}
            </div>
            <div className="text-xs text-zinc-400">Interactive explainer • real-time • animated</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V<sub>sup</sub>: <span className="text-[#ffd24a] ml-1">{params.Vsup} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I (now): <span className="text-[#00ffbf] ml-1">{round(I, 6)} A</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">P: <span className="text-[#ff9a4a] ml-1">{round(P, 6)} W</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* base horizontal bus */}
          <path d={`M 60 ${svgH / 2} H ${svgW - 60}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* depending on concept, draw a different diagram */}
{concept === "rc" && (
  <>
    <defs>
      {/* Neon gradients and glow filters */}
      <linearGradient id="wireGlow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#ff8a3d" stopOpacity="0.95" />
        <stop offset="50%" stopColor="#ffd24a" stopOpacity="1" />
        <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.95" />
      </linearGradient>

      <linearGradient id="voltagePulse" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#ffb86b" />
        <stop offset="100%" stopColor="#ffd24a" />
      </linearGradient>

      <linearGradient id="capFill" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffd24a" stopOpacity="1" />
        <stop offset="100%" stopColor="#ffb86b" stopOpacity="0.25" />
      </linearGradient>

      <linearGradient id="batteryGlow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00f0ff" stopOpacity="1" />
        <stop offset="100%" stopColor="#39ff14" stopOpacity="1" />
      </linearGradient>

      <filter id="glowFilter" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id="softInner" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="inner" />
        <feComposite in="SourceGraphic" in2="inner" operator="atop" />
      </filter>

      <style>{`
        /* Core animations and utility */
        @keyframes electronFlow {
          0% { offset-distance: 0%; opacity: 0.95; transform: translateZ(0); }
          100% { offset-distance: 100%; opacity: 0.95; }
        }
        @keyframes wirePulse {
          0% { stroke-dashoffset: 0; }
          50% { stroke-dashoffset: 8; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes capFillAnim {
          0% { transform: translateY(40%); opacity: 0.2; }
          50% { transform: translateY(0%); opacity: 0.9; }
          100% { transform: translateY(40%); opacity: 0.2; }
        }
        @keyframes flicker {
          0% { opacity: 1; }
          50% { opacity: 0.85; }
          100% { opacity: 1; }
        }
        .neonText { font-family: monospace; filter: url(#glowFilter); }
        .holo { opacity: 0.12; mix-blend-mode: screen; }
      `}</style>
    </defs>

    {/* Background & Ambient Panel */}
    <defs>
      <linearGradient id="panelBg" x1="0" x2="1">
        <stop offset="0%" stopColor="#020205" />
        <stop offset="100%" stopColor="#06060b" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="100%" height="100%" fill="url(#panelBg)" />

    {/* Holographic grid / faint blueprint traces */}
    <g opacity="0.07">
      <rect x="0" y="0" width="100%" height="100%" fill="none" />
      <g transform={`translate(0, ${svgH * 0.08})`} className="holo">
        <path d={`M20 ${svgH*0.6} H ${1200}`} stroke="#00f0ff" strokeWidth="0.6" strokeDasharray="2 6" />
      </g>
    </g>

    {/* ---- Circuit Loop Coordinates ----
        We'll map main nodes across x positions for clarity:
        battery: x=80, resistor: x=320, switch/junction: x=420, capacitor: x=640, return to battery via bottom trace
    */}

    {/* 🔋 BATTERY / DC SUPPLY MODULE */}
    <g transform={`translate(80, ${svgH / 2 - 10})`} >
      {/* battery housing */}
      <rect x="-36" y="-44" width="72" height="88" rx="10" fill="#07070a" stroke="url(#batteryGlow)" strokeWidth="1.8" filter="url(#glowFilter)" />
      {/* terminals */}
      <rect x="-8" y="-52" width="16" height="6" rx="2" fill="#00f0ff" filter="url(#glowFilter)" />
      <rect x="-8" y="46" width="16" height="6" rx="2" fill="#ff6b6b" filter="url(#glowFilter)" />
      {/* + and - */}
      <text x="-6" y="-58" fill="#00f0ff" fontSize="10" className="neonText">+</text>
      <text x="-6" y="62" fill="#ff6b6b" fontSize="10" className="neonText">−</text>

      {/* digital voltmeter embedded */}
      <g transform="translate(0,8)">
        <rect x="-30" y="-6" width="60" height="22" rx="4" fill="#010101" stroke="#002a2a" strokeWidth="0.6" />
        <text x="-24" y="10" fontSize="12" fill="#00f0ff" className="neonText">{`Vs ${params.Vsup ?? 5} V`}</text>
      </g>

      {/* pulsing arcs at terminals */}
      <g opacity="0.9">
        <path d="M -2 -52 C -14 -56, 14 -56, 2 -52" stroke="#00f0ff" strokeWidth="1" fill="none" style={{ filter: 'url(#glowFilter)', opacity: 0.9 }} />
        <path d="M -2 52 C -14 56, 14 56, 2 52" stroke="#ffd24a" strokeWidth="1" fill="none" style={{ filter: 'url(#glowFilter)', opacity: 0.85 }} />
      </g>
    </g>

    {/* Wiring: top trace from battery to resistor to switch to capacitor */}
    <path
      id="topWire"
      d={`M 96 ${svgH / 2 - 10} H 220 Q 260 ${svgH / 2 - 10} 300 ${svgH / 2 - 10} H 370 H 520`}
      stroke="url(#wireGlow)"
      strokeWidth="4"
      strokeLinecap="round"
      filter="url(#glowFilter)"
      style={{ strokeDasharray: 10, animation: running ? `wirePulse ${Math.max(0.9, speed/2)}s linear infinite` : 'none' }}
      opacity="0.96"
    />

    {/* Junction / Node markers along top wire */}
    {[
      { x: 220, label: 'J1' },
      { x: 370, label: 'J2' },
      { x: 520, label: 'J3' },
    ].map((n, idx) => (
      <g key={`node-${idx}`} transform={`translate(${n.x}, ${svgH / 2 - 10})`}>
        <circle r="5" fill="#ffb86b" opacity="0.12" />
        <circle r="3" fill="#ffd24a" filter="url(#glowFilter)" />
      </g>
    ))}

    {/* 🔸 RESISTOR - cylindrical with neon waves */}
    <g transform={`translate(320, ${svgH / 2 - 10})`} >
      {/* cylinder body */}
      <ellipse cx="0" cy="0" rx="42" ry="18" fill="#0b0b0b" stroke="#00f0ff55" strokeWidth="1" filter="url(#softInner)" />
      <rect x="-42" y="-12" width="84" height="24" rx="12" fill="#0b0b0b" stroke="#00f0ff88" strokeWidth="0.8" />
      {/* neon wave lines across body */}
      {Array.from({ length: 8 }).map((_, i) => {
        const y = -8 + i * 3.4;
        return <path key={i} d={`M -38 ${y} Q 0 ${y + (i%2?3:-3)} 38 ${y}`} stroke="#39ff14" strokeWidth={1} opacity={0.85} filter="url(#glowFilter)" />;
      })}
      {/* resistor label & temperature shimmer */}
      <text x="-24" y="-22" fontSize="12" fill="#39ff14" className="neonText">R = {params.R ?? 1000} Ω</text>
      <rect x="-24" y="18" width="48" height="6" rx="3" fill="#ff8a3d" opacity="0.08" style={{ animation: running ? `flicker 3s ease-in-out infinite` : 'none' }} />
      <text x="-30" y="36" fontSize="11" fill="#fff" fontFamily="monospace">I ≈ {round(I, 6)} A</text>
    </g>

    {/* Small Ammeter in series before resistor (series trace) */}
    <g transform={`translate(220, ${svgH / 2 - 10})`}>
      <rect x="-16" y="-16" width="32" height="32" rx="6" fill="#040404" stroke="#22c55e66" strokeWidth="1" filter="url(#glowFilter)" />
      <text x="-10" y="6" fontSize="11" fill="#22c55e" className="neonText">A</text>
      <text x="-22" y="26" fontSize="10" fill="#9af5b4">{round(Math.abs(I), 6)} A</text>
    </g>

    {/* Animated SPST SWITCH */}
    <g transform={`translate(430, ${svgH / 2 - 10})`} style={{ cursor: 'pointer' }}>
      <rect x="-22" y="-16" width="44" height="32" rx="6" fill="#0a0a0a" stroke="#00a3ff22" strokeWidth="1" />
      {/* hinge and lever */}
      <line x1="-10" y1="0" x2="16" y2={running ? -10 : 10} stroke="#00f0ff" strokeWidth="2.5" strokeLinecap="round" style={{ transformOrigin: 'center', transition: 'all 280ms ease' }} filter="url(#glowFilter)" />
      <circle cx="-12" cy="0" r="3.2" fill="#39ff14" filter="url(#glowFilter)" />
      <text x="-26" y="-22" fontSize="10" fill="#00f0ff" className="neonText">SW</text>
    </g>

    {/* ----- CAPACITOR MODULE ----- */}
    <g transform={`translate(640, ${svgH / 2 - 10})`}>
      {/* capacitor body */}
      <rect x="-38" y="-40" width="76" height="80" rx="10" fill="#060607" stroke="#ffd24a88" strokeWidth="1.4" filter="url(#softInner)" />
      {/* plates */}
      <rect x="-22" y="-22" width="8" height="44" rx="3" fill="#ffd24a" style={{ filter: 'url(#glowFilter)', animation: running ? `flicker 2.2s infinite` : 'none' }} />
      <rect x="14" y="-22" width="8" height="44" rx="3" fill="#ffd24a" style={{ filter: 'url(#glowFilter)', animation: running ? `flicker 2.2s infinite` : 'none' }} />
      {/* dynamic charge fill between plates - clipped */}
      <g transform="translate(0,10)">
        <clipPath id="capClip">
          <rect x="-14" y="-22" width="28" height="44" rx="2" />
        </clipPath>
        <rect
          clipPath="url(#capClip)"
          x="-14"
          y={-22 + (1 - Math.min(1, (Vc ?? 0) / (params.Vsup ?? 5))) * 44}
          width="28"
          height={Math.max(0, Math.min(44, (Vc ?? 0) / (params.Vsup ?? 5) * 44))}
          rx="2"
          fill="url(#capFill)"
          opacity="0.95"
          style={{ transition: 'all 300ms linear' }}
        />
      </g>

      {/* labels */}
      <text x="-32" y="-48" fontSize="12" fill="#ffd24a" className="neonText">C = {params.Cu ?? params.C ?? 100} μF</text>
      <text x="-32" y="54" fontSize="11" fill="#fff" fontFamily="monospace">Vc(t) ≈ {round(Vc, 3)} V</text>

      {/* voltmeter connected across capacitor */}
      <g transform="translate(0, 82)">
        <rect x="-28" y="-12" width="56" height="24" rx="4" fill="#040404" stroke="#ffb86b22" strokeWidth="0.8" />
        <text x="-24" y="8" fontSize="12" fill="#ffb86b" className="neonText">V: {round(Vc, 3)} V</text>
      </g>
    </g>

    {/* Bottom return trace from capacitor back to battery (complete loop) */}
    <path
      id="bottomWire"
      d={`M 520 ${svgH / 2 + 14} H 360 Q 320 ${svgH / 2 + 14} 280 ${svgH / 2 + 14} H 120 H 96`}
      stroke="#ff8a3d"
      strokeWidth="4"
      strokeLinecap="round"
      filter="url(#glowFilter)"
      opacity="0.85"
      style={{ strokeDasharray: 8, animation: running ? `wirePulse ${Math.max(0.9, speed/2)}s linear infinite` : 'none' }}
    />

    {/* Electron flow particles — follow topWire path when charging, reverse on discharge */}
    {Array.from({ length: dotCount ?? 18 }).map((_, di) => {
      // negative delay to stagger
      const delay = (di / (dotCount || 18)) * (speed ?? 2);
      // decide path based on charge/discharge (if Vc < Vs => charging forward)
      const charging = (Vc ?? 0) < (params.Vsup ?? 5);
      const pathTop = `path('M 96 ${svgH / 2 - 10} H 220 Q 260 ${svgH / 2 - 10} 300 ${svgH / 2 - 10} H 370 H 520')`;
      const pathBottom = `path('M 520 ${svgH / 2 + 14} H 360 Q 320 ${svgH / 2 + 14} 280 ${svgH / 2 + 14} H 120 H 96')`;
      const style = {
        offsetPath: charging ? pathTop : pathBottom,
        animationName: 'electronFlow',
        animationDuration: `${Math.max(0.6, speed ?? 2)}s`,
        animationTimingFunction: 'linear',
        animationDelay: `${-delay}s`,
        animationIterationCount: 'infinite',
        animationPlayState: running ? 'running' : 'paused',
        filter: 'url(#glowFilter)',
      };
      return (
        <circle
          key={`electron-${di}`}
          r={3}
          fill={charging ? '#39ff14' : '#00f0ff'}
          opacity="0.96"
          style={style}
        />
      );
    })}

    {/* Floating data particles and small waveform overlay */}
    <g transform={`translate(${svgH * 0.02}, ${svgH * 0.07})`} opacity="0.06">
      <circle cx="20" cy="20" r="3" fill="#00f0ff" />
      <rect x="60" y="10" width="120" height="28" rx="4" fill="#000" />
    </g>

    {/* Ambient HUD frame & title */}
    <g transform={`translate(24, 24)`}>
      <text x="0" y="12" fontSize="14" fill="#00f0ff" className="neonText">RC Circuit </text>
      <text x="0" y="28" fontSize="10" fill="#7f7f7f" fontFamily="monospace">Charging / Discharging Visualization</text>
    </g>

    {/* subtle micro-vibration when current is high */}
    <g transform={`translate(0,0)` } style={{ transform: (Math.abs(I) > 0.02 ? `translateY(${Math.sin(Date.now()/120) * 0.3}px)` : 'none') }} />

  </>
)}


{concept === "rl" && (
  <>
    <defs>
      {/* ✨ Gradients and glow filters */}
      <linearGradient id="wireGlowRL" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00eaff" stopOpacity="0.6" />
        <stop offset="50%" stopColor="#00ffbf" stopOpacity="1" />
        <stop offset="100%" stopColor="#00eaff" stopOpacity="0.6" />
      </linearGradient>

      <linearGradient id="coilGlow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ff6a9a" />
        <stop offset="100%" stopColor="#ff2df1" />
      </linearGradient>

      <filter id="glowRL" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id="fieldGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="10" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="0 0 0 0 0.8  0 0 0 0 0.2  0 0 0 0 0.6  0 0 0 1 0"
        />
      </filter>

      <style>{`
        @keyframes flowExplainerRL {
          0% { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }
        @keyframes fieldPulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.05); }
        }
        @keyframes currentPulse {
          0%, 100% { stop-color: #00ffbf; }
          50% { stop-color: #00eaff; }
        }
        @keyframes coilFlicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </defs>

    {/* 🔋 Power Supply */}
    <g transform={`translate(60, ${svgH / 2 - 60})`}>
      <rect
        x="-26"
        y="-36"
        width="52"
        height="72"
        rx="12"
        fill="#050505"
        stroke="url(#wireGlowRL)"
        strokeWidth="2"
        filter="url(#glowRL)"
      />
      <text
        x="-24"
        y="-48"
        fontSize="12"
        fill="#00ffbf"
        fontFamily="monospace"
      >
        {params.Vsup} V
      </text>
      <circle
        r="9"
        cx="0"
        cy="0"
        fill="#00ffbf"
        filter="url(#glowRL)"
        style={{ animation: "coilFlicker 2s infinite" }}
      />
      <circle r="4" fill="#000" />
    </g>

    {/* ⚡ Clear Wiring Path (top → right → down → left → up) */}
    <path
      id="rlWirePath"
      d={`M 86 ${svgH / 2 - 60} 
         H 420 
         V ${svgH / 2 + 60} 
         H 86 
         Z`}
      fill="none"
      stroke="url(#wireGlowRL)"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      filter="url(#glowRL)"
      opacity="0.95"
    />

    {/* 🌀 Inductor */}
    <g transform={`translate(420, ${svgH / 2})`}>
      <rect
        x="-44"
        y="-28"
        width="88"
        height="56"
        rx="14"
        fill="#0a0a0a"
        stroke="url(#coilGlow)"
        strokeWidth="1.8"
        filter="url(#glowRL)"
      />
      <circle
        cx="0"
        cy="0"
        r="38"
        fill="#ff2df122"
        filter="url(#fieldGlow)"
        style={{ animation: "fieldPulse 2.2s infinite ease-in-out" }}
      />
      {Array.from({ length: 6 }).map((_, i) => (
        <ellipse
          key={i}
          cx={-25 + i * 10}
          cy={0}
          rx="6"
          ry="14"
          fill="none"
          stroke="url(#coilGlow)"
          strokeWidth="2.5"
          opacity="0.95"
          style={{ animation: "coilFlicker 3s infinite" }}
        />
      ))}

      <text
        x="-38"
        y="-38"
        fontSize="12"
        fill="#ff6a9a"
        fontFamily="monospace"
      >
        L = {params.Lm || params.L} mH
      </text>
      <text
        x="-34"
        y="40"
        fontSize="12"
        fill="#fff"
        fontFamily="monospace"
      >
        I ≈ {round(I, 6)} A
      </text>
    </g>

    {/* ⚙️ Flowing Current Dots Following Entire Loop */}
    {Array.from({ length: dotCount }).map((_, di) => {
      const pathStr = `M 86 ${svgH / 2 - 60} H 420 V ${svgH / 2 + 60} H 86 Z`;
      const delay = (di / dotCount) * speed;
      const style = {
        offsetPath: `path('${pathStr}')`,
        animationName: "flowExplainerRL",
        animationDuration: `${speed}s`,
        animationTimingFunction: "linear",
        animationDelay: `${-delay}s`,
        animationIterationCount: "infinite",
        animationPlayState: running ? "running" : "paused",
        transformOrigin: "0 0",
        filter: "url(#glowRL)",
      };
      return (
        <circle
          key={`dot-rl-${di}`}
          r="3.5"
          fill="#00ffbf"
          opacity="0.95"
          style={style}
        />
      );
    })}

    {/* 💫 Subtle Energy Flow Highlight Line */}
    <rect
      x="86"
      y={svgH / 2 - 62}
      width="334"
      height="4"
      rx="2"
      fill="url(#wireGlowRL)"
      opacity="0.25"
      style={{ animation: "currentPulse 2s infinite ease-in-out" }}
    />
  </>
)}


  {concept === "rlc" && (
  <>
    <defs>
      {/* ✨ Neon Gradients & Glow Filters */}
      <linearGradient id="wireGlowRLC" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00eaff" stopOpacity="0.6" />
        <stop offset="50%" stopColor="#00ffbf" stopOpacity="1" />
        <stop offset="100%" stopColor="#00eaff" stopOpacity="0.6" />
      </linearGradient>

      <linearGradient id="resGlow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffb86b" />
        <stop offset="100%" stopColor="#ff8c00" />
      </linearGradient>

      <linearGradient id="coilGlowRLC" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ff6a9a" />
        <stop offset="100%" stopColor="#ff2df1" />
      </linearGradient>

      <linearGradient id="capGlow" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#00fff7" />
        <stop offset="100%" stopColor="#00baff" />
      </linearGradient>

      <filter id="glowRLC" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id="fieldPulse" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="10" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="0 0 0 0 0.8  0 0 0 0 0.2  0 0 0 0 0.6  0 0 0 1 0"
        />
      </filter>

      <style>{`
        @keyframes flowExplainerRLC {
          0% { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }
        @keyframes capPulse {
          0%, 100% { opacity: 0.5; height: 30px; }
          50% { opacity: 1; height: 38px; }
        }
        @keyframes fieldPulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.05); }
        }
        @keyframes currentPulse {
          0%, 100% { stop-color: #00ffbf; }
          50% { stop-color: #00eaff; }
        }
        @keyframes coilFlicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </defs>

    {/* 🔋 Power Supply */}
    <g transform={`translate(80, ${svgH / 2 - 60})`}>
      <rect
        x="-26"
        y="-36"
        width="52"
        height="72"
        rx="12"
        fill="#050505"
        stroke="url(#wireGlowRLC)"
        strokeWidth="2"
        filter="url(#glowRLC)"
      />
      <text x="-22" y="-48" fontSize="12" fill="#00ffbf" fontFamily="monospace">
        {params.Vsup} V
      </text>
      <circle
        r="9"
        cx="0"
        cy="0"
        fill="#00ffbf"
        filter="url(#glowRLC)"
        style={{ animation: "coilFlicker 2s infinite" }}
      />
      <circle r="4" fill="#000" />
    </g>

    {/* ⚡ Complete Circuit Path (Rectangular Loop) */}
    <path
      id="rlcWirePath"
      d={`M 110 ${svgH / 2 - 60} 
          H 500 
          V ${svgH / 2 + 60} 
          H 110 Z`}
      fill="none"
      stroke="url(#wireGlowRLC)"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      filter="url(#glowRLC)"
      opacity="0.95"
    />

    {/* 🧩 R-L-C COMPONENTS (Top Path) */}
    <g transform={`translate(190, ${svgH / 2 - 60})`}>
      {/* 🟧 Resistor */}
      <rect
        x="-30"
        y="-12"
        width="60"
        height="24"
        rx="4"
        fill="#1a1a1a"
        stroke="url(#resGlow)"
        strokeWidth="2"
        filter="url(#glowRLC)"
      />
      <text x="-10" y="-16" fontSize="11" fill="#ffb86b" fontFamily="monospace">
        R
      </text>
    </g>

    <g transform={`translate(310, ${svgH / 2 - 60})`}>
      {/* 🌀 Inductor */}
      <rect
        x="-36"
        y="-20"
        width="72"
        height="40"
        rx="10"
        fill="#0a0a0a"
        stroke="url(#coilGlowRLC)"
        strokeWidth="1.8"
        filter="url(#glowRLC)"
      />
      {Array.from({ length: 6 }).map((_, i) => (
        <ellipse
          key={i}
          cx={-20 + i * 8}
          cy={0}
          rx="5"
          ry="12"
          fill="none"
          stroke="url(#coilGlowRLC)"
          strokeWidth="2"
          opacity="0.9"
          style={{ animation: "coilFlicker 3s infinite" }}
        />
      ))}
      <text x="-10" y="-24" fontSize="11" fill="#ff6a9a" fontFamily="monospace">
        L
      </text>
    </g>

    <g transform={`translate(430, ${svgH / 2 - 60})`}>
      {/* 🧊 Capacitor */}
      <rect
        x="-14"
        y="-20"
        width="8"
        height="40"
        fill="url(#capGlow)"
        filter="url(#glowRLC)"
        style={{ animation: "capPulse 2s infinite ease-in-out" }}
      />
      <rect
        x="6"
        y="-20"
        width="8"
        height="40"
        fill="url(#capGlow)"
        filter="url(#glowRLC)"
        style={{ animation: "capPulse 2s infinite ease-in-out" }}
      />
      <text x="-4" y="-28" fontSize="11" fill="#00fff7" fontFamily="monospace">
        C
      </text>
    </g>

    {/* 🧲 Magnetic Field Aura near Inductor */}
    <circle
      cx="310"
      cy={svgH / 2 - 60}
      r="40"
      fill="#ff2df133"
      filter="url(#fieldPulse)"
      style={{ animation: "fieldPulse 2.5s infinite ease-in-out" }}
    />

    {/* ⚙️ Flowing Energy Particles */}
    {Array.from({ length: dotCount }).map((_, di) => {
      const pathStr = `M 110 ${svgH / 2 - 60} H 500 V ${svgH / 2 + 60} H 110 Z`;
      const delay = (di / dotCount) * speed;
      const style = {
        offsetPath: `path('${pathStr}')`,
        animationName: "flowExplainerRLC",
        animationDuration: `${speed}s`,
        animationTimingFunction: "linear",
        animationDelay: `${-delay}s`,
        animationIterationCount: "infinite",
        animationPlayState: running ? "running" : "paused",
        transformOrigin: "0 0",
        filter: "url(#glowRLC)",
      };
      return (
        <circle
          key={`dot-rlc-${di}`}
          r="3.5"
          fill="#00ffbf"
          opacity="0.95"
          style={style}
        />
      );
    })}

    {/* ⚡ Waveform + Amplitude Label */}
    <text
      x="200"
      y={svgH / 2 + 85}
      fontSize="12"
      fill="#fff"
      fontFamily="monospace"
    >
      Iₐₘₚ ≈ {latest.meta ? round(latest.meta.Iamp || 0, 4) : "—"} A
    </text>

    <path
      d={`M 180 ${svgH / 2 + 40} 
          Q 200 ${svgH / 2 + 20}, 220 ${svgH / 2 + 40}
          T 260 ${svgH / 2 + 40}
          T 300 ${svgH / 2 + 40}
          T 340 ${svgH / 2 + 40}
          T 380 ${svgH / 2 + 40}`}
      stroke="#ffd24a"
      strokeWidth="2"
      fill="none"
      filter="url(#glowRLC)"
      opacity="0.9"
    />
  </>
)}

{concept === "divider" && (
  <>
    <defs>
      {/* ✨ Neon gradients & glow filters */}
      <linearGradient id="wireGlowDivider" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00eaff" stopOpacity="0.6" />
        <stop offset="50%" stopColor="#00ffbf" stopOpacity="1" />
        <stop offset="100%" stopColor="#00eaff" stopOpacity="0.6" />
      </linearGradient>

      <linearGradient id="resGlow1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffb86b" />
        <stop offset="100%" stopColor="#ff9a4a" />
      </linearGradient>

      <filter id="glowDivider" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id="voutGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="10" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="0 0 0 0 0.1  0 0 0 0 1  0 0 0 0 0.7  0 0 0 1 0"
        />
      </filter>

      <style>{`
        @keyframes flowExplainerDivider {
          0% { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }
        @keyframes resistorPulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.7; }
        }
        @keyframes nodePulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </defs>

    {/* 🔋 Voltage Source */}
    <g transform={`translate(100, ${svgH / 2 - 70})`}>
      <rect
        x="-26"
        y="-36"
        width="52"
        height="72"
        rx="12"
        fill="#050505"
        stroke="url(#wireGlowDivider)"
        strokeWidth="2"
        filter="url(#glowDivider)"
      />
      <text
        x="-22"
        y="-48"
        fontSize="12"
        fill="#00ffbf"
        fontFamily="monospace"
      >
        Vin {params.Vin || params.Vsup} V
      </text>
      <circle
        r="9"
        cx="0"
        cy="0"
        fill="#00ffbf"
        filter="url(#glowDivider)"
        style={{ animation: "nodePulse 2s infinite ease-in-out" }}
      />
      <circle r="4" fill="#000" />
    </g>

    {/* ⚡ Clear Wire Path (Top to Bottom) */}
    <path
      id="dividerWire"
      d={`M 130 ${svgH / 2 - 70} 
          H 420 
          V ${svgH / 2 + 70} 
          H 130 
          Z`}
      fill="none"
      stroke="url(#wireGlowDivider)"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      filter="url(#glowDivider)"
      opacity="0.95"
    />

    {/* 🧩 R1 (Top resistor) */}
    <g transform={`translate(420, ${svgH / 2 - 30})`}>
      <rect
        x="-36"
        y="-18"
        width="72"
        height="20"
        rx="8"
        fill="#0a0a0a"
        stroke="url(#resGlow1)"
        strokeWidth="2"
        filter="url(#glowDivider)"
        style={{ animation: "resistorPulse 2s infinite" }}
      />
      <text x="-30" y="-26" fontSize="11" fill="#ffb86b" fontFamily="monospace">
        R₁ = {params.R1} Ω
      </text>
    </g>

    {/* ⚡ Vout Node (Between R1 & R2) */}
    <g transform={`translate(420, ${svgH / 2 + 10})`}>
      <circle
        r="6"
        fill="#00ffff"
        filter="url(#voutGlow)"
        style={{ animation: "nodePulse 1.8s infinite" }}
      />
      <text
        x="14"
        y="4"
        fontSize="12"
        fill="#00ffea"
        fontFamily="monospace"
      >
        Vout = {round(latest.Vout ?? 0, 3)} V
      </text>
    </g>

    {/* 🧩 R2 (Bottom resistor) */}
    <g transform={`translate(420, ${svgH / 2 + 40})`}>
      <rect
        x="-36"
        y="0"
        width="72"
        height="20"
        rx="8"
        fill="#0a0a0a"
        stroke="url(#resGlow1)"
        strokeWidth="2"
        filter="url(#glowDivider)"
        style={{ animation: "resistorPulse 2s infinite" }}
      />
      <text x="-30" y="40" fontSize="11" fill="#ff9a4a" fontFamily="monospace">
        R₂ = {params.R2} Ω
      </text>
    </g>

    {/* ⚙️ Flowing Current Dots Along the Path */}
    {Array.from({ length: dotCount }).map((_, di) => {
      const pathStr = `M 130 ${svgH / 2 - 70} H 420 V ${svgH / 2 + 70} H 130 Z`;
      const delay = (di / dotCount) * speed;
      const style = {
        offsetPath: `path('${pathStr}')`,
        animationName: "flowExplainerDivider",
        animationDuration: `${speed}s`,
        animationTimingFunction: "linear",
        animationDelay: `${-delay}s`,
        animationIterationCount: "infinite",
        animationPlayState: running ? "running" : "paused",
        transformOrigin: "0 0",
        filter: "url(#glowDivider)",
      };
      return (
        <circle
          key={`dot-divider-${di}`}
          r="3.5"
          fill="#00ffbf"
          opacity="0.95"
          style={style}
        />
      );
    })}

    {/* ⚡ Highlighted Vin → Vout voltage drop effect */}
    <rect
      x="130"
      y={svgH / 2 - 72}
      width="290"
      height="3"
      rx="2"
      fill="url(#wireGlowDivider)"
      opacity="0.3"
      style={{ animation: "resistorPulse 1.5s infinite" }}
    />

    {/* ⚡ Ground Label */}
    <g transform={`translate(130, ${svgH / 2 + 72})`}>
      <line x1="-10" y1="0" x2="10" y2="0" stroke="#888" strokeWidth="1.2" />
      <line x1="-6" y1="4" x2="6" y2="4" stroke="#888" strokeWidth="1.2" />
      <line x1="-2" y1="8" x2="2" y2="8" stroke="#888" strokeWidth="1.2" />
      <text x="12" y="4" fontSize="10" fill="#ccc" fontFamily="monospace">
        GND
      </text>
    </g>
  </>
)}

{concept === "led" && (
  <>
    <defs>
      {/* ⚡ Neon gradients */}
      <linearGradient id="wireFlowLED" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00f5ff" stopOpacity="0.6" />
        <stop offset="50%" stopColor="#00ffaa" stopOpacity="1" />
        <stop offset="100%" stopColor="#00f5ff" stopOpacity="0.6" />
      </linearGradient>

      <linearGradient id="resBodyLED" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7a5230" />
        <stop offset="50%" stopColor="#fcb45a" />
        <stop offset="100%" stopColor="#7a5230" />
      </linearGradient>

      <radialGradient id="ledCore" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stopColor="#fff8cc" />
        <stop offset="50%" stopColor="#ffca3a" />
        <stop offset="100%" stopColor="#ff6500" />
      </radialGradient>

      <radialGradient id="ledHalo" cx="50%" cy="50%" r="80%">
        <stop offset="0%" stopColor="#ffcc55" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#ff3300" stopOpacity="0" />
      </radialGradient>

      <filter id="bloom" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#00ffaa44" />
      </filter>

      <filter id="ledHaloEffect" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="12" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="1 0 0 0 0  0.4 1 0 0 0  0 0 0.6 0 0  0 0 0 2 0"
        />
      </filter>

      <style>{`
        @keyframes flowParticles {
          0% { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }
        @keyframes heatPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        @keyframes ledGlowPulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        @keyframes flicker {
          0%, 100% { opacity: 1; }
          45% { opacity: 0.8; }
          50% { opacity: 1; }
          55% { opacity: 0.9; }
          60% { opacity: 1; }
        }
      `}</style>
    </defs>

    {/* 🔋 Power source */}
    <g transform={`translate(100, ${svgH / 2})`}>
      <rect
        x="-25"
        y="-36"
        width="50"
        height="72"
        rx="12"
        fill="#050505"
        stroke="url(#wireFlowLED)"
        strokeWidth="2.5"
        filter="url(#bloom)"
      />
      <text x="-22" y="-48" fontSize="12" fill="#00ffaa" fontFamily="monospace">
        Vin {params.Vin || params.Vsup} V
      </text>
      <circle cx="0" cy="0" r="8" fill="#00ffaa" filter="url(#bloom)" />
    </g>

    {/* ⚡ Main conductive wire */}
    <path
      id="ledWire"
      d={`M 130 ${svgH / 2} H 320`}
      stroke="url(#wireFlowLED)"
      strokeWidth="4"
      strokeLinecap="round"
      filter="url(#bloom)"
      opacity="0.9"
    />

    {/* ⚙️ Resistor */}
    <g transform={`translate(210, ${svgH / 2})`}>
      <rect
        x="-46"
        y="-18"
        width="92"
        height="36"
        rx="10"
        fill="url(#resBodyLED)"
        stroke="#ffb86b"
        strokeWidth="1.6"
        filter="url(#softShadow)"
        style={{ animation: "heatPulse 2s infinite ease-in-out" }}
      />
      <text
        x="-40"
        y="-28"
        fontSize="12"
        fill="#ffb86b"
        fontFamily="monospace"
      >
        R = {params.R} Ω
      </text>

      {/* Metallic sheen */}
      <rect
        x="-46"
        y="-18"
        width="92"
        height="36"
        rx="10"
        fill="url(#wireFlowLED)"
        opacity="0.15"
      />
    </g>

    {/* 💡 LED */}
    <g transform={`translate(340, ${svgH / 2})`}>
      {/* LED body */}
      <circle
        cx="0"
        cy="0"
        r="16"
        fill={on ? "url(#ledCore)" : "#111"}
        stroke={on ? "#ffcc00" : "#444"}
        strokeWidth="3"
        filter={on ? "url(#ledHaloEffect)" : "url(#softShadow)"}
        style={{
          animation: on
            ? "ledGlowPulse 2s infinite ease-in-out, flicker 3s infinite"
            : "none",
        }}
      />

      {/* LED filament lines */}
      {on && (
        <>
          <line
            x1="-6"
            y1="0"
            x2="6"
            y2="0"
            stroke="#fff8cc"
            strokeWidth="1.4"
            opacity="0.9"
            filter="url(#bloom)"
          />
          <circle cx="0" cy="0" r="4" fill="#fff8cc" opacity="0.9" />
        </>
      )}

      {/* Radiant glow cone */}
      {on && (
        <polygon
          points="16,-6 80,0 16,6"
          fill="url(#ledHalo)"
          opacity="0.7"
          filter="url(#ledHaloEffect)"
        />
      )}

      <text
        x="-20"
        y="34"
        fontSize="12"
        fill={on ? "#ffd966" : "#777"}
        fontFamily="monospace"
      >
        {on ? "LED ON" : "LED OFF"}
      </text>
    </g>

    {/* ⚡ Flowing current particles */}
    {Array.from({ length: dotCount }).map((_, di) => {
      const pathStr = `M 130 ${svgH / 2} H 340`;
      const delay = (di / dotCount) * speed;
      const style = {
        offsetPath: `path('${pathStr}')`,
        animationName: "flowParticles",
        animationDuration: `${speed}s`,
        animationTimingFunction: "linear",
        animationDelay: `${-delay}s`,
        animationIterationCount: "infinite",
        animationPlayState: running ? "running" : "paused",
        transformOrigin: "0 0",
        filter: "url(#bloom)",
      };
      return (
        <circle
          key={`dot-led-${di}`}
          r="3.5"
          fill={on ? "#ffdd66" : "#444"}
          opacity={on ? 0.95 : 0.4}
          style={style}
        />
      );
    })}

    {/* 🪨 Ground reference */}
    <g transform={`translate(100, ${svgH / 2 + 44})`}>
      <line x1="-10" y1="0" x2="10" y2="0" stroke="#666" strokeWidth="1.2" />
      <line x1="-6" y1="4" x2="6" y2="4" stroke="#666" strokeWidth="1.2" />
      <line x1="-2" y1="8" x2="2" y2="8" stroke="#666" strokeWidth="1.2" />
      <text x="12" y="5" fontSize="10" fill="#ccc" fontFamily="monospace">
        GND
      </text>
    </g>
  </>
)}


          {/* readout panel */}
          <g transform={`translate(${svgW - 220},28)`}>
            <rect x="-100" y="-18" width="200" height="110" rx="10" fill="#060606" stroke="#222" />
            <text x="-88" y="2" fontSize="12" fill="#ffb57a">Readouts</text>

            {concept === "rc" && (
              <>
                <text x="-88" y="24" fontSize="12" fill="#fff">Vc: <tspan fill="#ffd24a">{round(Vc, 6)} V</tspan></text>
                <text x="-88" y="44" fontSize="12" fill="#fff">I: <tspan fill="#00ffbf">{round(I, 8)} A</tspan></text>
                <text x="-88" y="64" fontSize="12" fill="#fff">Energy: <tspan fill="#9ee6ff">{round(latest.energy ?? 0, 8)}</tspan></text>
              </>
            )}

            {concept === "rl" && (
              <>
                <text x="-88" y="24" fontSize="12" fill="#fff">I: <tspan fill="#00ffbf">{round(I, 8)} A</tspan></text>
                <text x="-88" y="44" fontSize="12" fill="#fff">V_L: <tspan fill="#ff9a4a">{round(latest.Vl ?? 0, 6)} V</tspan></text>
                <text x="-88" y="64" fontSize="12" fill="#fff">Energy: <tspan fill="#9ee6ff">{round(latest.energy ?? 0, 8)}</tspan></text>
              </>
            )}

            {concept === "rlc" && (
              <>
                <text x="-88" y="24" fontSize="12" fill="#fff">Iamp: <tspan fill="#00ffbf">{latest.meta ? round(latest.meta.Iamp || 0, 6) : "—"}</tspan></text>
                <text x="-88" y="44" fontSize="12" fill="#fff">Xl: <tspan fill="#ff9a4a">{latest.meta ? round(latest.meta.Xl || 0, 4) : "—"}</tspan></text>
                <text x="-88" y="64" fontSize="12" fill="#fff">Xc: <tspan fill="#ffd24a">{latest.meta ? round(latest.meta.Xc || 0, 4) : "—"}</tspan></text>
              </>
            )}

            {concept === "divider" && (
              <>
                <text x="-88" y="24" fontSize="12" fill="#fff">Vout: <tspan fill="#ffd24a">{round(latest.Vout ?? 0, 6)} V</tspan></text>
                <text x="-88" y="44" fontSize="12" fill="#fff">I: <tspan fill="#00ffbf">{round(latest.I ?? 0, 8)} A</tspan></text>
              </>
            )}

            {concept === "led" && (
              <>
                <text x="-88" y="24" fontSize="12" fill="#fff">I: <tspan fill="#00ffbf">{round(latest.I ?? 0, 8)} A</tspan></text>
                <text x="-88" y="44" fontSize="12" fill="#fff">State: <tspan fill={latest.on ? "#00ffbf" : "#ff9a4a"}>{latest.on ? "Forward" : "Off"}</tspan></text>
                <text x="-88" y="64" fontSize="12" fill="#fff">Vf: <tspan fill="#ffd24a">{round(latest.Vf ?? params.Vf ?? 0, 3)} V</tspan></text>
              </>
            )}
          </g>

          <style>{`
            @keyframes flowExplainer {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }
            @keyframes flowExplainerInd {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(-6px,6px) scale(0.82); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) {
              text { font-size: 10px; }
            }
          `}</style>
        </svg>
      </div>
    </div>
  );
}

/* ============================
   Oscilloscope / Plot
   - For each concept we plot the most relevant trace(s)
   ============================ */
function ExplainerOscilloscope({ history = [], concept }) {
  // build data depending on concept
  const data = history.slice(-360).map((d, idx) => {
    if (concept === "rc") {
      return { t: idx, Vc: round(d.Vc ?? 0, 6), I: round(d.I ?? 0, 8) };
    } else if (concept === "rl") {
      return { t: idx, I: round(d.I ?? 0, 8), Vl: round(d.Vl ?? 0, 6) };
    } else if (concept === "rlc") {
      return { t: idx, I: round(d.I ?? 0, 6), Vc: round(d.Vc ?? 0, 6) };
    } else if (concept === "divider") {
      return { t: idx, Vout: round(d.Vout ?? 0, 6) };
    } else if (concept === "led") {
      return { t: idx, I: round(d.I ?? 0, 6) };
    }
    return { t: idx };
  });

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — live traces</div>
        <div className="text-xs text-zinc-400">{history.length ? "Live" : "Idle"}</div>
      </div>
      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            {concept === "rc" && <Line dataKey="Vc" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Vc (V)" />}
            {concept === "rc" && <Line dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="I (A)" />}
            {concept === "rl" && <Line dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="I (A)" />}
            {concept === "rl" && <Line dataKey="Vl" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="V_L (V)" />}
            {concept === "rlc" && <Line dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="I (A)" />}
            {concept === "rlc" && <Line dataKey="Vc" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="V_C (V)" />}
            {concept === "divider" && <Line dataKey="Vout" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Vout (V)" />}
            {concept === "led" && <Line dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="I (A)" />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Explainer Page
   ============================ */
export default function ExplainerPage() {
  // UI state
  const [concept, setConcept] = useState("rc");
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState("student"); // student/instructor/engineer
  // param store keyed by concept (store user-friendly units)
  const [params, setParams] = useState({
    rc: { Vsup: 5, R: 1000, C: 1e-6, Cu: 1, label: "RC", },
    rl: { Vsup: 5, R: 100, L: 10e-3, Lm: 10, label: "RL", },
    rlc: { Vsup: 5, R: 10, L: 10e-3, C: 0.1e-6, freq: 1000, label: "RLC", },
    divider: { Vsup: 12, R1: 1000, R2: 1000, label: "Divider", },
    led: { Vsup: 5, R: 220, Vf: 2.0, label: "LED", },
  });

  // select param view for current concept
  const activeParams = params[concept];

  // hook
  const paramForSim = useMemo(() => {
    // convert units into SI where needed:
    if (concept === "rc") {
      return { Vsup: toNum(activeParams.Vsup, 5), R: toNum(activeParams.R, 1000), C: toNum(activeParams.C, 1e-6), Cu: activeParams.Cu };
    }
    if (concept === "rl") {
      return { Vsup: toNum(activeParams.Vsup, 5), R: toNum(activeParams.R, 100), L: toNum(activeParams.L, 10e-3), Lm: activeParams.Lm };
    }
    if (concept === "rlc") {
      return { Vsup: toNum(activeParams.Vsup, 5), R: toNum(activeParams.R, 10), L: toNum(activeParams.L, 10e-3), C: toNum(activeParams.C, 0.1e-6), freq: toNum(activeParams.freq, 1000) };
    }
    if (concept === "divider") {
      return { Vsup: toNum(activeParams.Vsup, 12), R1: toNum(activeParams.R1, 1000), R2: toNum(activeParams.R2, 1000) };
    }
    if (concept === "led") {
      return { Vsup: toNum(activeParams.Vsup, 5), R: toNum(activeParams.R, 220), Vf: toNum(activeParams.Vf, 2.0) };
    }
    return {};
  }, [concept, activeParams]);

  const { history, latest } = useExplainerSim({ running, timestep: 80, concept, params: paramForSim });

  // actions
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };
  const resetToPresets = () => {
    setParams((p) => ({
      ...p,
      rc: { Vsup: 5, R: 1000, C: 1e-6, Cu: 1 },
      rl: { Vsup: 5, R: 100, L: 10e-3, Lm: 10 },
      rlc: { Vsup: 5, R: 10, L: 10e-3, C: 0.1e-6, freq: 1000 },
      divider: { Vsup: 12, R1: 1000, R2: 1000 },
      led: { Vsup: 5, R: 220, Vf: 2.0 },
    }));
    toast.success("Presets restored");
  };

  const updateActiveParam = (k, v) => {
    setParams((p) => ({ ...p, [concept]: { ...p[concept], [k]: v } }));
  };

  // convenience: convert μF input to C in F for simulation, keep both stored for readability
  useEffect(() => {
    if (concept === "rc") {
      // keep `C` in F derived from Cu (microfarads) if user modifies Cu
      const cu = params.rc.Cu ?? 1;
      setParams((p) => ({ ...p, rc: { ...p.rc, C: cu * 1e-6 } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // small validation when user enters crazy values
  useEffect(() => {
    // check for negative or zero supplies
    const V = toNum(activeParams.Vsup, 0);
    if (V <= 0) toast.error("Supply voltage should be > 0");
    // check certain concept-specific constraints
    if (concept === "rlc") {
      if (!Number.isFinite(activeParams.freq) || activeParams.freq <= 0) toast.error("Frequency must be > 0 for RLC simulation");
    }
    // no blocking; these are just helpful nudges
  }, [activeParams, concept]);
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
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-6 h-6 text-black" />
              </div>
              <div>
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5">Animated Concept Explainers • BEEE</div>
              </div>
            </motion.div>

            {/* desktop controls */}
            <div className="hidden md:flex items-center gap-4">
              <div className="w-52">
                <Select value={concept} onValueChange={(v) => setConcept(v)}>
                  <SelectTrigger className="w-full cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Select Concept" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="rc">RC Charging</SelectItem>
                    <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="rl">RL Charging</SelectItem>
                    <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="rlc">RLC Resonance</SelectItem>
                    <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="divider">Voltage Divider</SelectItem>
                    <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="led">LED + Resistor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black px-3 py-1 rounded-lg shadow-md hover:scale-105" onClick={snapshotPNG}>
                  Snapshot
                </Button>

                <Button variant="ghost" className="border cursor-pointer text-orange-400 hover:bg-black hover:text-orange-500
 border-zinc-700  p-2 rounded-lg" onClick={toggleRunning} title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" className="border border-zinc-700 text-orange-400 hover:bg-black hover:text-orange-500
cursor-pointer p-2 rounded-lg" onClick={resetToPresets} title="Reset Presets">
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* mobile menu toggle */}
            <div className="md:hidden">
              <Button variant="ghost" className="border text-orange-400 cursor-pointer hover:bg-black hover:text-orange-500
 border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen((s) => !s)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* mobile panel */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={concept} onValueChange={(v) => setConcept(v)}>
                    <SelectTrigger className="w-full  cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Concept" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="rc">RC Charging</SelectItem>
                      <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="rl">RL Charging</SelectItem>
                      <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="rlc">RLC Resonance</SelectItem>
                      <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="divider">Voltage Divider</SelectItem>
                      <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="led">LED + Resistor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-2 rounded-md cursor-pointer" onClick={snapshotPNG}>Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-orange-400 hover:bg-black hover:text-orange-500
 px-3 py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16" />

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Explainer Controls</div>
                        <div className="text-xs text-zinc-400">Change parameters & presets</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Role: {role}</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  {/* Concept-specific inputs */}
                  {concept === "rc" && (
                    <>
                      <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
                      <Input type="number" value={activeParams.Vsup} onChange={(e) => updateActiveParam("Vsup", Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />
                      <label className="text-xs text-zinc-400">Resistance R (Ω)</label>
                      <Input type="number" value={activeParams.R} onChange={(e) => updateActiveParam("R", Math.max(0, Number(e.target.value)))} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />
                      <label className="text-xs text-zinc-400">Capacitance (μF)</label>
                      <Input type="number" value={activeParams.Cu ?? (activeParams.C * 1e6)} onChange={(e) => {
                        const cu = Math.max(0, Number(e.target.value));
                        updateActiveParam("Cu", cu);
                        updateActiveParam("C", cu * 1e-6);
                      }} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </>
                  )}

                  {concept === "rl" && (
                    <>
                      <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
                      <Input type="number" value={activeParams.Vsup} onChange={(e) => updateActiveParam("Vsup", Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />
                      <label className="text-xs text-zinc-400">Resistance R (Ω)</label>
                      <Input type="number" value={activeParams.R} onChange={(e) => updateActiveParam("R", Math.max(0, Number(e.target.value)))} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />
                      <label className="text-xs text-zinc-400">Inductance (mH)</label>
                      <Input type="number" value={activeParams.Lm ?? (activeParams.L * 1e3)} onChange={(e) => {
                        const lm = Math.max(0, Number(e.target.value));
                        updateActiveParam("Lm", lm);
                        updateActiveParam("L", lm * 1e-3);
                      }} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </>
                  )}

                  {concept === "rlc" && (
                    <>
                      <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
                      <Input type="number" value={activeParams.Vsup} onChange={(e) => updateActiveParam("Vsup", Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-zinc-400">R (Ω)</label>
                          <Input type="number" value={activeParams.R} onChange={(e) => updateActiveParam("R", Math.max(0, Number(e.target.value)))} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400">freq (Hz)</label>
                          <Input type="number" value={activeParams.freq} onChange={(e) => updateActiveParam("freq", Math.max(0.1, Number(e.target.value)))} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />
                        </div>
                      </div>

                      <label className="text-xs text-zinc-400">L (mH)</label>
                      <Input type="number" value={activeParams.Lm ?? (activeParams.L * 1e3)} onChange={(e) => {
                        const lm = Math.max(0, Number(e.target.value));
                        updateActiveParam("Lm", lm);
                        updateActiveParam("L", lm * 1e-3);
                      }} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />
                      <label className="text-xs text-zinc-400">C (μF)</label>
                      <Input type="number" value={(activeParams.C || 0) * 1e6} onChange={(e) => {
                        const cu = Math.max(0, Number(e.target.value));
                        updateActiveParam("C", cu * 1e-6);
                      }} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </>
                  )}

                  {concept === "divider" && (
                    <>
                      <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
                      <Input type="number" value={activeParams.Vsup} onChange={(e) => updateActiveParam("Vsup", Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />
                      <label className="text-xs text-zinc-400">R1 (Ω)</label>
                      <Input type="number" value={activeParams.R1} onChange={(e) => updateActiveParam("R1", Math.max(1e-6, Number(e.target.value)))} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />
                      <label className="text-xs text-zinc-400">R2 (Ω)</label>
                      <Input type="number" value={activeParams.R2} onChange={(e) => updateActiveParam("R2", Math.max(1e-6, Number(e.target.value)))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </>
                  )}

                  {concept === "led" && (
                    <>
                      <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
                      <Input type="number" value={activeParams.Vsup} onChange={(e) => updateActiveParam("Vsup", Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />
                      <label className="text-xs text-zinc-400">Resistor R (Ω)</label>
                      <Input type="number" value={activeParams.R} onChange={(e) => updateActiveParam("R", Math.max(0, Number(e.target.value)))} className="bg-zinc-900/60 border border-zinc-800 text-white mb-2" />
                      <label className="text-xs text-zinc-400">LED forward Vf (V)</label>
                      <Input type="number" value={activeParams.Vf} onChange={(e) => updateActiveParam("Vf", Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </>
                  )}

                  <div className="mt-4 flex gap-2">
                    <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => { setRunning(true); toast.success("Running"); }}>
                      <Play className="w-4 h-4 mr-2" /> Run
                    </Button>
                    <Button variant="outline" className="flex-1 cursor-pointer border-zinc-700" onClick={() => { setRunning(false); toast("Paused"); }}>
                      <Pause className="w-4 h-4 mr-2" /> Pause
                    </Button>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button variant="ghost" className="flex-1 border text-orange-400 hover:bg-black hover:text-orange-500
 cursor-pointer border-zinc-800" 
onClick={snapshotPNG}
><Layers className="w-4 h-4 mr-2" /> Snapshot</Button>
                    <Button variant="ghost" className="flex-1 border text-orange-400 hover:bg-black hover:text-orange-500
 cursor-pointer border-zinc-800" onClick={() => updateActiveParam("C", (activeParams.C || 0) * 1) && toast("Action")}>Apply</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Quick tips / explanation card */}
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[#ffd24a]">
                    <Lightbulb className="w-4 h-4" /> Concept Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-zinc-300">
                    {concept === "rc" && (
                      <div>
                        RC circuits show exponential charging: <span className="text-white font-semibold">V<sub>C</sub>(t) = V(1 − e^(−t/RC))</span>. Change R and C to see tau = RC change.
                      </div>
                    )}
                    {concept === "rl" && (
                      <div>
                        RL circuits show current rise with time constant <span className="text-white font-semibold">τ = L/R</span>. Inductor resists change in current.
                      </div>
                    )}
                    {concept === "rlc" && (
                      <div>
                        RLC circuits have resonance where reactance cancels. Adjust <span className="text-white font-semibold">f</span>, <span className="text-white font-semibold">L</span>, and <span className="text-white font-semibold">C</span> to observe amplitude changes.
                      </div>
                    )}
                    {concept === "divider" && (
                      <div>
                        Voltage divider: Vout = V * (R2 / (R1 + R2)). Useful for reference voltages and sensors.
                      </div>
                    )}
                    {concept === "led" && (
                      <div>
                        LED conduction: when Vsup &gt; Vf, current flows through resistor: I = (Vsup − Vf) / R. Watch LED glow & current.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right: visual + oscilloscope */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 snapshot border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <CircuitBoard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Explainer</div>
                        <div className="text-xs text-zinc-400">Animated visuals & live plots</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{concept}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Role: <span className="text-[#ffd24a] ml-1">{role}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <ExplainerSVG concept={concept} params={activeParams} history={history} running={running} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ExplainerOscilloscope history={history} concept={concept} />

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[#ffd24a]">
                    <Monitor className="w-5 h-5" /> Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Latest (t)</div>
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{latest ? round(latest.t ?? 0, 3) : "—"} s</div>
                      <div className="text-xs text-zinc-400 mt-1">Simulation time</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Instant Current</div>
                      <div className="text-lg font-semibold text-[#00ffbf] truncate">{latest ? round(latest.I ?? 0, 6) : "—"} A</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Instant Voltage</div>
                      <div className="text-lg font-semibold text-[#ffd24a] truncate">{latest ? round(latest.Vc ?? latest.Vout ?? 0, 6) : "—"} V</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Power</div>
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{latest ? round(latest.P ?? 0, 6) : "—"} W</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb /></span>
                    <span>
                      Tip: Try changing the parameters while simulation is running to see immediate changes in the animation and oscilloscope.
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
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-orange-400 hover:bg-black hover:text-orange-500
 cursor-pointer bg-black text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-orange-400 hover:bg-black hover:text-orange-500
 cursor-pointer p-2" onClick={() => toast("Share feature coming soon")}>Share</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
