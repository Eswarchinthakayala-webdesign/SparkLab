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
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const toNum = (v, fallback = NaN) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/* ============================
   Simulation hook: useExplainerSim
   - supports multiple explainers (RC, RL, RLC, Voltage Divider, LED)
   - returns realtime history and descriptive state
   ============================ */
function useExplainerSim({
  running,
  timestep = 80,
  concept = "rc",
  params = {},
}) {
  const historyRef = useRef([]);
  const [history, setHistory] = useState([]);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  const computeInstant = useCallback(
    (tSeconds) => {
      // base params with safe conversions
      const V = toNum(params.Vsup, 5);
      const R = Math.max(1e-6, toNum(params.R, 1000));
      const C = Math.max(1e-12, toNum(params.C, 1e-6)); // in F
      const L = Math.max(1e-9, toNum(params.L, 1e-3)); // in H
      const freq = Math.max(0.0001, toNum(params.freq, 50));
      // per-concept models (simple, pedagogical)
      if (concept === "rc") {
        // step response charging Vc = V*(1-exp(-t/RC))
        const tau = clamp(R * C, 1e-9, 1e6);
        const Vc = V * (1 - Math.exp(-tSeconds / tau));
        const dVdt = (V / tau) * Math.exp(-tSeconds / tau);
        const I = C * dVdt;
        const P = Vc * I;
        const energy = 0.5 * C * Vc * Vc;
        return { t: tSeconds, Vc, I, P, energy, meta: { tau } };
      } else if (concept === "rl") {
        // step response in RL: I = V/R*(1 - exp(-R t / L))
        const tauL = clamp(L / R, 1e-9, 1e6);
        const Iinf = V / R;
        const I = Iinf * (1 - Math.exp(-tSeconds / tauL));
        const dIdt = (Iinf / tauL) * Math.exp(-tSeconds / tauL);
        const Vl = L * dIdt;
        const P = Vl * I;
        const energy = 0.5 * L * I * I;
        return { t: tSeconds, I, Vl, P, energy, meta: { tauL } };
      } else if (concept === "rlc") {
        // simple driven RLC at freq -> compute steady-state amplitude (voltage across C)
        // R, L, C are series RLC driven by sinusoidal source V*sin(2πft)
        const w = 2 * Math.PI * freq;
        const Xl = w * L;
        const Xc = 1 / (w * C);
        const Z = Math.sqrt(R * R + (Xl - Xc) * (Xl - Xc));
        const Iamp = V / Z;
        // phase and instantaneous values for visualization: use tSeconds mod period
        const instI = Iamp * Math.sin(w * tSeconds);
        const Vc = instI * Xc * Math.cos(Math.atan2(Xl - Xc, R)); // approximate phasing for demo
        const P = (Iamp * Iamp) * R * 0.5; // average power on resistor
        return { t: tSeconds, I: instI, Vc, P, meta: { Xl, Xc, Z, Iamp } };
      } else if (concept === "divider") {
        // simple two-resistor divider: Vout = V*(R2/(R1+R2))
        const R1 = Math.max(1e-6, toNum(params.R1, 1000));
        const R2 = Math.max(1e-6, toNum(params.R2, 1000));
        const Vout = V * (R2 / (R1 + R2));
        const I = V / (R1 + R2);
        const P = Vout * I;
        return { t: tSeconds, Vout, I, P, meta: { R1, R2 } };
      } else if (concept === "led") {
        // LED forward conduction model (simple diode + resistor)
        // Use piecewise: if V > Vf (0.7..2.2) current flows as (V-Vf)/R
        const Vf = toNum(params.Vf, 2.0);
        const Rled = Math.max(1e-3, toNum(params.R, 220));
        const I = Math.max(0, (V - Vf) / Rled);
        const P = V * I;
        const on = I > 1e-6;
        return { t: tSeconds, I, P, on, Vf, meta: { Rled } };
      }
      // default fallback
      return { t: tSeconds, I: 0, Vc: 0, P: 0, energy: 0, meta: {} };
    },
    [concept, params]
  );

  useEffect(() => {
    let alive = true;
    lastRef.current = performance.now();
    tRef.current = 0;
    historyRef.current = [];
    setHistory([]);
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
      // push to history
      historyRef.current.push(sample);
      if (historyRef.current.length > 720) historyRef.current.shift();
      // update state (throttle updates slightly by copying)
      setHistory(historyRef.current.slice());
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeInstant, concept, params]);

  // api: history, latest, meta
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
      <div className="flex items-start justify-between gap-3">
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
              {/* supply block */}
              <g transform={`translate(40, ${svgH / 2 - 12})`}>
                <rect x="-24" y="-28" width="48" height="56" rx="6" fill="#060606" stroke="#222" />
                <text x="-36" y="-40" fontSize="12" fill="#ffd24a">{params.Vsup} V</text>
              </g>

              {/* resistor */}
              <g transform={`translate(240, ${svgH / 2})`}>
                <rect x="-30" y="-18" width="60" height="36" rx="8" fill="#0a0a0a" stroke="#222" />
                <text x="-24" y="-26" fontSize="12" fill="#ffb86b">R = {params.R} Ω</text>
                <text x="-24" y="36" fontSize="12" fill="#fff">I ~ {round(I, 6)} A</text>
              </g>

              {/* capacitor */}
              <g transform={`translate(520, ${svgH / 2})`}>
                <rect x="-30" y="-22" width="60" height="44" rx="8" fill="#0a0a0a" stroke="#222" />
                <rect x="-18" y="-10" width="36" height="20" rx="6" fill="#ffb86b" opacity={0.95} />
                <text x="-24" y="-32" fontSize="12" fill="#ffd24a">C = {params.Cu || params.C} μF</text>
                <text x="-24" y="36" fontSize="12" fill="#fff">Vc {`≈`} {round(Vc, 3)} V</text>
              </g>

              {/* animated dots along path from supply->resistor->cap */}
              {Array.from({ length: dotCount }).map((_, di) => {
                const pathStr = `M 104 ${svgH / 2} H 260 H 520`;
                const delay = (di / dotCount) * speed;
                const style = {
                  offsetPath: `path('${pathStr}')`,
                  animationName: "flowExplainer",
                  animationDuration: `${speed}s`,
                  animationTimingFunction: "linear",
                  animationDelay: `${-delay}s`,
                  animationIterationCount: "infinite",
                  animationPlayState: running ? "running" : "paused",
                  transformOrigin: "0 0",
                };
                return <circle key={`dot-rc-${di}`} r="4" fill="#ffd24a" style={style} />;
              })}
            </>
          )}

          {concept === "rl" && (
            <>
              {/* supply */}
              <g transform={`translate(40, ${svgH / 2 - 12})`}>
                <rect x="-24" y="-28" width="48" height="56" rx="6" fill="#060606" stroke="#222" />
                <text x="-36" y="-40" fontSize="12" fill="#ffd24a">{params.Vsup} V</text>
              </g>

              {/* inductor (coil effect) */}
              <g transform={`translate(420, ${svgH / 2})`}>
                <rect x="-38" y="-24" width="76" height="48" rx="10" fill="#0a0a0a" stroke="#222" />
                {/* stylized coils */}
                {Array.from({ length: 5 }).map((_, i) => (
                  <ellipse key={i} cx={-18 + i * 9} cy={0} rx="6" ry="12" fill="none" stroke="#ff6a9a" strokeWidth="3" />
                ))}
                <text x="-34" y="-36" fontSize="12" fill="#ff6a9a">L = {params.Lm || params.L} mH</text>
                <text x="-34" y="36" fontSize="12" fill="#fff">I {`≈`} {round(I, 6)} A</text>
              </g>

              {Array.from({ length: dotCount }).map((_, di) => {
                const pathStr = `M 104 ${svgH / 2} H 420`;
                const delay = (di / dotCount) * speed;
                const style = {
                  offsetPath: `path('${pathStr}')`,
                  animationName: "flowExplainerInd",
                  animationDuration: `${speed}s`,
                  animationTimingFunction: "linear",
                  animationDelay: `${-delay}s`,
                  animationIterationCount: "infinite",
                  animationPlayState: running ? "running" : "paused",
                  transformOrigin: "0 0",
                };
                return <circle key={`dot-rl-${di}`} r="4" fill="#00ffbf" style={style} />;
              })}
            </>
          )}

          {concept === "rlc" && (
            <>
              {/* R -> L -> C series depiction */}
              <g transform={`translate(120, ${svgH / 2})`}>
                <text x="-36" y="-36" fontSize="12" fill="#ffd24a">Series RLC</text>
                <rect x="-40" y="-16" width="80" height="32" rx="8" fill="#0a0a0a" stroke="#222" />
                <text x="-28" y="4" fontSize="11" fill="#ffb86b">R</text>
                <text x="6" y="4" fontSize="11" fill="#ff6a9a">L</text>
                <text x="32" y="4" fontSize="11" fill="#ffd24a">C</text>
                <text x="-36" y="36" fontSize="12" fill="#fff">Iamp {`≈`} {latest.meta ? round(latest.meta.Iamp || 0, 4) : "—"}</text>
              </g>

              {/* animated sinusoidal waveform (small sparkles) */}
              {Array.from({ length: dotCount }).map((_, di) => {
                const x0 = 300 + di * 18;
                const y0 = svgH / 2 + Math.sin((Date.now() / 500 + di) / 6) * 18;
                return <circle key={`spark-${di}`} cx={x0} cy={y0} r="3" fill="#ffd24a" opacity={0.85} />;
              })}
            </>
          )}

          {concept === "divider" && (
            <>
              {/* R1, R2 vertical stack with Vout node */}
              <g transform={`translate(420, ${svgH / 2 - 16})`}>
                <rect x="-36" y="-26" width="72" height="18" rx="8" fill="#0a0a0a" stroke="#222" />
                <text x="-30" y="-14" fontSize="11" fill="#ffb86b">R1 = {params.R1} Ω</text>
                <rect x="-36" y="2" width="72" height="18" rx="8" fill="#0a0a0a" stroke="#222" />
                <text x="-30" y="14" fontSize="11" fill="#ff9a4a">R2 = {params.R2} Ω</text>
                <text x="-36" y="36" fontSize="12" fill="#fff">Vout {`=`} {round(latest.Vout ?? 0, 3)} V</text>
              </g>

              {/* small dot flow */}
              {Array.from({ length: dotCount }).map((_, di) => {
                const pathStr = `M 104 ${svgH / 2} H 420`;
                const delay = (di / dotCount) * speed;
                const style = {
                  offsetPath: `path('${pathStr}')`,
                  animationName: "flowExplainer",
                  animationDuration: `${speed}s`,
                  animationTimingFunction: "linear",
                  animationDelay: `${-delay}s`,
                  animationIterationCount: "infinite",
                  animationPlayState: running ? "running" : "paused",
                  transformOrigin: "0 0",
                };
                return <circle key={`dot-divider-${di}`} r="4" fill="#ff9a4a" style={style} />;
              })}
            </>
          )}

          {concept === "led" && (
            <>
              {/* resistor + LED */}
              <g transform={`translate(260, ${svgH / 2})`}>
                <rect x="-50" y="-20" width="100" height="44" rx="10" fill="#0a0a0a" stroke="#222" />
                <text x="-42" y="-28" fontSize="12" fill="#ffb86b">R = {params.R} Ω</text>

                <g transform={`translate(28,0)`}>
                  <circle cx="0" cy="0" r="14" fill={on ? "#ffdd88" : "#222"} stroke={on ? "#ff6a00" : "#333"} strokeWidth="3" />
                  <text x="-12" y="36" fontSize="12" fill="#fff">{on ? "LED ON" : "LED OFF"}</text>
                </g>
              </g>

              {Array.from({ length: dotCount }).map((_, di) => {
                const pathStr = `M 104 ${svgH / 2} H 260`;
                const delay = (di / dotCount) * speed;
                const style = {
                  offsetPath: `path('${pathStr}')`,
                  animationName: "flowExplainer",
                  animationDuration: `${speed}s`,
                  animationTimingFunction: "linear",
                  animationDelay: `${-delay}s`,
                  animationIterationCount: "infinite",
                  animationPlayState: running ? "running" : "paused",
                  transformOrigin: "0 0",
                };
                return <circle key={`dot-led-${di}`} r="4" fill={on ? "#ffd24a" : "#555"} style={style} />;
              })}
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
                      <div className="text-lg font-semibold text-[#ff9a4a]">{latest ? round(latest.t ?? 0, 3) : "—"} s</div>
                      <div className="text-xs text-zinc-400 mt-1">Simulation time</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Instant Current</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{latest ? round(latest.I ?? 0, 6) : "—"} A</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Instant Voltage</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{latest ? round(latest.Vc ?? latest.Vout ?? 0, 6) : "—"} V</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Power</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{latest ? round(latest.P ?? 0, 6) : "—"} W</div>
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
