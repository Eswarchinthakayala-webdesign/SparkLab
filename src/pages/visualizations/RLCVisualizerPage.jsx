// src/pages/RLCVisualizerPage.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import {
  Zap,
  CircuitBoard,
  Play,
  Pause,
  Menu,
  X,
  Layers,
  Download,
  Settings,
  Activity,
  Camera,

} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Slider } from "@/components/ui/slider";
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
import { toPng } from "html-to-image";  

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  Legend,
  Area,
  AreaChart,
} from "recharts";

/* ============================
   Utilities (complex math + helpers)
   ============================ */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

function logspace(fmin, fmax, n = 201) {
  const a = Math.log10(Math.max(1e-12, fmin));
  const b = Math.log10(Math.max(1e-12, fmax));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const val = 10 ** (a + (b - a) * t);
    out.push(val);
  }
  return out;
}

/* Simple complex helpers: objects { re, im } */
const addC = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const subC = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const mulC = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const divC = (a, b) => {
  const den = b.re * b.re + b.im * b.im || 1e-30;
  return { re: (a.re * b.re + a.im * b.im) / den, im: (a.im * b.re - a.re * b.im) / den };
};
const absC = (a) => Math.sqrt((a.re || 0) ** 2 + (a.im || 0) ** 2);
const phaseDeg = (a) => Math.atan2(a.im || 0, a.re || 0) * (180 / Math.PI);

/* ============================
   Transfer function for Series R-L-C
   - Supports measuring voltage across R, L, C (like a divider)
   - Units: R in ohms (Ω), L input in mH -> converted to H, C in μF -> converted to F
   ============================ */

function computeSeriesTransfer({ R_ohm, L_mH, C_uF, freqHz, measure = "R" }) {
  const w = 2 * Math.PI * freqHz;
  const L = (Number.isFinite(L_mH) ? L_mH : 0) * 1e-3;
  const C = (Number.isFinite(C_uF) ? C_uF : 0) * 1e-6;
  const R = Number.isFinite(R_ohm) ? R_ohm : 0;

  // impedances
  const ZR = { re: R, im: 0 };
  const ZL = { re: 0, im: w * L };
  const ZC = { re: 0, im: C > 0 ? -1 / (w * C) : 1e30 }; // open at w->0 -> large negative imag
  // total
  const Ztot = addC(addC(ZR, ZL), ZC);

  let Zout = ZR;
  if (measure === "L") Zout = ZL;
  else if (measure === "C") Zout = ZC;
  // transfer = Zout / Ztot (voltage division)
  const H = divC(Zout, Ztot);
  const mag = absC(H);
  const magdB = 20 * Math.log10(Math.max(1e-30, mag));
  const ph = phaseDeg(H);
  return { H, mag, magdB, ph };
}

/* ============================
   Build Bode data array (freq sweep)
   ============================ */
function buildBodeData({ R, L, C, fmin, fmax, n = 201, measure }) {
  const freqs = logspace(fmin, fmax, n);
  return freqs.map((f) => {
    const r = computeSeriesTransfer({ R_ohm: R, L_mH: L, C_uF: C, freqHz: f, measure });
    return {
      f,
      fLog: Math.log10(Math.max(f, 1e-12)),
      mag: r.mag,
      magdB: r.magdB,
      phase: r.ph,
    };
  });
}

/* ============================
   Time-domain steady-state (sinusoid) generator
   - For selected frequency, compute steady-state sinusoidal voltages across components
   - Returns array of samples for one period (nSamples)
   ============================ */

function buildTimeDomain({ R, L, C, freq, measure, Vin = 1, nSamples = 512 }) {
  const w = 2 * Math.PI * freq;
  const L_h = (Number.isFinite(L) ? L : 0) * 1e-3;
  const C_f = (Number.isFinite(C) ? C : 0) * 1e-6;
  const R_ohm = Number.isFinite(R) ? R : 0;

  // compute steady-state phasors
  const ZR = { re: R_ohm, im: 0 };
  const ZL = { re: 0, im: w * L_h };
  const ZC = { re: 0, im: C_f > 0 ? -1 / (w * C_f) : 1e30 };
  const Ztot = addC(addC(ZR, ZL), ZC);
  const VinPh = { re: Vin, im: 0 };
  const Iph = divC(VinPh, Ztot); // phasor current
  const VoutPh = (() => {
    if (measure === "R") return mulC(Iph, ZR);
    if (measure === "L") return mulC(Iph, ZL);
    return mulC(Iph, ZC);
  })();

  // samples: v_in(t) and v_out(t)
  const data = [];
  for (let i = 0; i < nSamples; i++) {
    const t = (i / nSamples) * (1 / freq); // time within one period
    const ang = w * t;
    // real-time sinusoid from phasor: Re{V * e^{jωt}} = V_re*cos(ωt) - V_im*sin(ωt)
    const vinT = VinPh.re * Math.cos(ang) - VinPh.im * Math.sin(ang);
    const voutT = VoutPh.re * Math.cos(ang) - VoutPh.im * Math.sin(ang);
    const iT = Iph.re * Math.cos(ang) - Iph.im * Math.sin(ang);
    data.push({ t: i, time: round(t, 6), Vin: vinT, Vout: voutT, I: iT });
  }
  return {
    data,
    magnitude: absC(divC(VoutPh, VinPh)),
    phase: phaseDeg(divC(VoutPh, VinPh)),
    Iph,
    VoutPh,
  };
}

/* ============================
   Animated Circuit SVG for series R-L-C
   - shows R, L, C in series and animated dots showing current flow
   - instrument readouts for Vrms, Irms (computed from phasors)
   ============================ */
 function CircuitSVG({
  R = 100,
  L = 10,
  C = 1,
  freq = 60,
  Vin = 5,
  measure = "AC",
  running = true,
  timeDomain = null,
}) {
  // --- helpers ---
  const absC = (z) => {
    if (!z) return 0;
    if (typeof z === "number") return Math.abs(z);
    return Math.sqrt((z.re ?? 0) ** 2 + (z.im ?? 0) ** 2);
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round = (v, n = 3) => (Number(v) || 0).toFixed(n);

  // --- derived values ---
  const iph = timeDomain?.Iph ?? { re: 0, im: 0 };
  const phMag = timeDomain?.magnitude ?? 0;
  const phase = timeDomain?.phase ?? 0;
  const Ipeak = absC(iph);
  const Irms = Ipeak / Math.sqrt(2);
  const dotCount = clamp(Math.round(4 + Irms * 8), 4, 28);
  const speed = clamp(0.9 / (Irms + 0.001), 0.12, 2.2);

  // --- layout ---
  const svgW = 980;
  const svgH = 360;
  const startX = 120;
  const busY = 150;
  const xR = 300;
  const xL = 520;
  const xC = 740;
  const groundY = busY + 110;

  // Full circuit path for offset-path animation (top + down + bottom return)
  // Top: startX -> xR -> xL -> xC -> down to ground -> along bottom back to startX
  const circuitPath = useMemo(
    () =>
      `M ${startX} ${busY} H ${xR - 24} H ${xL - 24} H ${xC - 24} V ${groundY} H ${startX}`,
    [startX, xR, xL, xC, busY, groundY]
  );

  // Visible copper trace path (a slightly different route for nicer corners)
  const visiblePath = useMemo(
    () =>
      `M ${startX} ${busY} 
       H ${xR - 40} 
       L ${xR - 20} ${busY} 
       H ${xL - 40} 
       L ${xL - 20} ${busY}
       H ${xC - 20}
       V ${busY + 80}
       H ${startX}
       `,
    [startX, xR, xL, xC, busY]
  );

  // CSS for dot animation: animationPlayState controlled inline
  const dotStyleBase = (delay) => ({
    offsetPath: `path('${circuitPath}')`,
    animation: `flow ${speed}s linear ${-delay}s infinite`,
    WebkitOffsetPath: `path('${circuitPath}')`,
    animationPlayState: running ? "running" : "paused",
  });

  // --- Colors & theme ---
  const wireGrad = "url(#wireGrad)";
  const glowFilter = "url(#glow)";

  return (
    <div className="w-full rounded-xl p-5 bg-gradient-to-br from-black via-[#120700] to-[#0b0604] border border-[#662f00]/30 shadow-[0_12px_60px_rgba(255,130,40,0.06)] snapshot">
      {/* header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#ff8a2b] to-[#ffd186] flex items-center justify-center shadow-[0_0_24px_rgba(255,140,40,0.28)]">
            <CircuitBoard className="w-6 h-6 text-black" />
          </div>
          <div>
            <div className="text-xl font-semibold text-[#ffb86b]">RLC Circuit</div>
            <div className="text-xs text-zinc-400">Series R → L → C </div>
          </div>
        </div>

        <div className="flex gap-2 items-center flex-wrap text-xs font-mono text-zinc-300">
          <div className="px-2 py-1 rounded-md border border-[#ffb86b]/20">f: <span className="text-[#ffb86b] ml-1">{freq} Hz</span></div>
          <div className="px-2 py-1 rounded-md border border-[#ffb86b]/20">Vin: <span className="text-[#ffb86b] ml-1">{Vin} V</span></div>
          <div className="px-2 py-1 rounded-md border border-[#ffb86b]/20">Irms: <span className="text-[#00ffbf] ml-1">{round(Irms, 6)} A</span></div>
        </div>
      </div>

      {/* svg area */}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-[380px]" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="wireGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ff7a2b" stopOpacity="1" />
              <stop offset="50%" stopColor="#ffb86b" stopOpacity="1" />
              <stop offset="100%" stopColor="#ff7a2b" stopOpacity="1" />
            </linearGradient>

            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <radialGradient id="capPlate" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#ffd9a6" stopOpacity="1" />
              <stop offset="100%" stopColor="#ff9a2e" stopOpacity="1" />
            </radialGradient>

            <linearGradient id="resGrad" x1="0" x2="1">
              <stop offset="0" stopColor="#ffb86b" />
              <stop offset="1" stopColor="#ff7a2b" />
            </linearGradient>
          </defs>

          {/* visible copper trace (thick) */}
          <path d={visiblePath} stroke={wireGrad} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" filter={glowFilter} opacity="0.9" />

          {/* top wire thin highlight */}
          <path d={visiblePath} stroke="#2b1100" strokeWidth="1" fill="none" opacity="0.25" />

          {/* battery (left) */}
          <g transform={`translate(${startX - 70}, ${busY - 30})`}>
            <rect width="22" height="64" rx="6" fill="#0b0b0b" stroke="#ffb86b" strokeWidth="1.5"></rect>
            <rect x="28" y="18" width="6" height="28" rx="2" fill="#ffd9a6"></rect>
            <text x="-6" y="-12" fill="#ffd9a6" fontSize="12">Vin</text>
          </g>

          {/* RESISTOR: realistic body with textured zigzag */}
          <g transform={`translate(${xR - 80}, ${busY})`}>
            <rect x="-10" y="-22" width="140" height="44" rx="10" fill="#150f09" stroke="#2a1400" />
            <path d="M0 0 l12 -18 l24 18 l24 -18 l24 18 l24 -18 l28 18" transform="translate(8,0)" stroke="url(#resGrad)" strokeWidth="4" fill="none" strokeLinecap="round" filter={glowFilter} />
            <text x="22" y="-30" fontSize="12" fill="#ffd9a6">R = {R} Ω</text>
            <motion.text
              x="22"
              y="10"
              fontSize="11"
              fill="#fff"
              animate={running ? { opacity: [0.5, 1, 0.5] } : { opacity: 0.6 }}
              transition={{ duration: 1.2, repeat: running ? Infinity : 0 }}
            >
              Vₙ
            </motion.text>
          </g>

          {/* INDUCTOR: coils, aligned and contained */}
          <g transform={`translate(${xL - 90}, ${busY})`}>
            {[...Array(6)].map((_, i) => (
              <motion.circle
                key={i}
                cx={i * 20}
                cy={0}
                r={9}
                stroke="#ff9a2e"
                strokeWidth="3"
                fill="none"
                filter={glowFilter}
                animate={running ? { strokeOpacity: [0.6, 1, 0.6], scale: [1, 1.03, 1] } : { strokeOpacity: 0.6 }}
                transition={{ duration: 1.6 + i * 0.08, repeat: running ? Infinity : 0, ease: "easeInOut" }}
              />
            ))}
            <text x="30" y="-26" fontSize="12" fill="#ffd9a6">L = {L} mH</text>
          </g>

          {/* CAPACITOR SYMBOL: two plates with animated charge dots */}
          <g transform={`translate(${xC - 10}, ${busY})`}>
            {/* left plate */}
            <rect x="-26" y="-30" width="6" height="60" rx="1" fill="url(#capPlate)" stroke="#ffb86b" strokeWidth="1.2" filter={glowFilter} />
            {/* right plate */}
            <rect x="20" y="-30" width="6" height="60" rx="1" fill="url(#capPlate)" stroke="#ffb86b" strokeWidth="1.2" filter={glowFilter} />

            {/* plate gap indicator */}
            <line x1="-10" y1="-40" x2="10" y2="-40" stroke="transparent" />

            <text x="-28" y="-44" fontSize="12" fill="#ffd9a6">C = {C} μF</text>

            {/* Animated charge dots near plates: left (negative) and right (positive) */}
            {Array.from({ length: 6 }).map((_, i) => {
              const tDelay = (i / 6) * 0.8;
              const leftStyle = {
                transformOrigin: "0 0",
                animation: `pulseDot ${1.2 + (i % 3) * 0.12}s ease-in-out ${-tDelay}s infinite`,
                animationPlayState: running ? "running" : "paused",
              };
              const rightStyle = {
                transformOrigin: "0 0",
                animation: `pulseDot ${1.0 + (i % 3) * 0.14}s ease-in-out ${-tDelay - 0.4}s infinite`,
                animationPlayState: running ? "running" : "paused",
              };

              return (
                <g key={i}>
                  <circle cx={-40 - (i % 3) * 8} cy={-10 + (i % 2) * 12} r="3" fill="#ffb86b" style={leftStyle} opacity="0.8" />
                  <circle cx={60 + (i % 3) * 8} cy={-10 + (i % 2) * 12} r="3" fill="#ff9a2e" style={rightStyle} opacity="0.85" />
                </g>
              );
            })}
          </g>

          {/* ground under capacitor */}
          <g transform={`translate(${xC + 12}, ${groundY})`}>
            <line x1="0" y1="0" x2="0" y2="12" stroke="#ff9a2e" strokeWidth="2" />
            <line x1="-12" y1="12" x2="12" y2="12" stroke="#ff9a2e" strokeWidth="2" />
            <line x1="-8" y1="18" x2="8" y2="18" stroke="#ff9a2e" strokeWidth="2" />
          </g>

          {/* SMALL READOUT PANEL (top-right) */}
          <g transform={`translate(${svgW - 220}, 18)`}>
            <rect x="8" y="-100" width="204" height="120" rx="10" fill="#0b0b0b" stroke="#2a1400" />
            <text x="20" y="-80" fontSize="12" fill="#ffd9a6" fontWeight="700">Readouts</text>
            <text x="20" y="-67" fontSize="12" fill="#fff">|H|: <tspan fill="#ffb86b">{round(phMag, 6)}</tspan></text>
            <text x="20" y="-52" fontSize="12" fill="#fff">Phase: <tspan fill="#00ffbf">{round(phase, 2)}°</tspan></text>
            <text x="20" y="-37" fontSize="12" fill="#fff">Irms: <tspan fill="#00ffbf">{round(Irms, 6)} A</tspan></text>
            <text x="20" y="-22" fontSize="12" fill="#fff">Mode: <tspan fill="#ffb86b">{measure}</tspan></text>
          </g>

          {/* animated current flow dots (render always, but pause by animationPlayState) */}
          {Array.from({ length: dotCount }).map((_, i) => {
            const delay = (i / dotCount) * speed;
            const s = dotStyleBase(delay);
            return (
              <circle
                key={i}
                r="4.5"
                fill="#ffd9a6"
                style={s}
                filter={glowFilter}
                opacity="0.95"
              />
            );
          })}

        

          {/* CSS keyframes inside SVG */}
          <style>{`
            @keyframes flow {
              0% { offset-distance: 10%; transform: scale(1); opacity: 0.95; }
              40% { transform: scale(1.2); opacity: 1; }
              100% { offset-distance: 100%; transform: scale(0.85); opacity: 0.2; }
            }
            @keyframes pulseDot {
              0% { transform: translateY(10px) scale(1); opacity: 0.9; }
              50% { transform: translateY(-6px) scale(1.25); opacity: 1; }
              100% { transform: translateY(0px) scale(1); opacity: 0.85; }
            }
            /* ensure CSS offset-path works across browsers */
            circle[style] { will-change: offset-distance, transform, opacity; }
          `}</style>
        </svg>
      </div>
    </div>
  );
}



/* ============================
   Main Page Component
   ============================ */

export default function RLCVisualizerPage() {
  // UI state
  const [R, setR] = useState(10); // ohms
  const [L, setL] = useState(10); // mH
  const [C, setC] = useState(10); // μF
  const [Vin, setVin] = useState(1); // Vpeak
  const [measure, setMeasure] = useState("R"); // "R" | "L" | "C"
  const [fCenter, setFCenter] = useState(1000); // Hz (selected freq to visualize time-domain)
  const [fMin, setFMin] = useState(1);
  const [fMax, setFMax] = useState(1000000);
  const [sweepPoints, setSweepPoints] = useState(301);

  const [running, setRunning] = useState(true);
  const [sweepAuto, setSweepAuto] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // compute bode (memoized)
  const bodeData = useMemo(
    () =>
      buildBodeData({
        R,
        L,
        C,
        fmin: Math.max(1e-3, Number(fMin)),
        fmax: Math.max(10, Number(fMax)),
        n: Math.max(51, Math.min(1201, Number(sweepPoints))),
        measure,
      }),
    [R, L, C, fMin, fMax, sweepPoints, measure]
  );

  // selected frequency time-domain snapshot
  const timeDomain = useMemo(() => buildTimeDomain({ R, L, C, freq: Math.max(1e-6, Number(fCenter)), measure, Vin, nSamples: 512 }), [R, L, C, fCenter, measure, Vin]);

  // animation for auto sweep: slowly move center frequency between min and max
  const sweepRef = useRef(0);
  useEffect(() => {
    if (!sweepAuto) return;
    let alive = true;
    const start = performance.now();
    const dur = 60000; // 60s full sweep
    const loop = (t) => {
      if (!alive) return;
      const dt = (t - start) % dur;
      const fraction = dt / dur; // 0..1
      const logMin = Math.log10(Math.max(1e-3, fMin));
      const logMax = Math.log10(Math.max(10, fMax));
      const val = 10 ** (logMin + (logMax - logMin) * fraction);
      setFCenter(Math.round(val));
      requestAnimationFrame(loop);
    };
    const id = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [sweepAuto, fMin, fMax]);

  // export bode CSV
  const exportBodeCSV = () => {
    const rows = [["f(Hz)", "mag", "mag(dB)", "phase(deg)"], ...bodeData.map((d) => [d.f, d.mag, d.magdB, d.phase])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rlc-bode-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Bode CSV exported");
  };

  const toggleRunning = () => {
    setRunning((s) => {
      const nxt = !s;
      toast(nxt ? "Visualizer running" : "Visualizer paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setR(10);
    setL(10);
    setC(10);
    setVin(1);
    setFMin(1);
    setFMax(1000000);
    setFCenter(1000);
    setSweepPoints(301);
    toast("Reset defaults");
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
    <div className="min-h-screen bg-[#05060a] pb-20 bg-[radial-gradient(circle,_rgba(255,122,28,0.2)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2 sm:py-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-6 h-6 text-black/80" />
              </div>
              <div className="truncate">
                <div className="text-sm font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs  text-zinc-400 mt-0.5 truncate">RLC Frequency Response </div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-36">
                <Select value={measure} onValueChange={(v) => setMeasure(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Measure" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="R"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Across R (voltage)</SelectItem>
                    <SelectItem value="L"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Across L (voltage)</SelectItem>
                    <SelectItem value="C"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Across C (voltage)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-1 rounded-lg shadow-md" onClick={snapshotPNG} title="Snapshot"><Camera/> Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg" onClick={toggleRunning} title={running ? "Pause" : "Play"}>{running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg" onClick={resetDefaults} title="Reset"><Settings className="w-5 h-5" /></Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* mobile slide */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex gap-2">
              <div className="w-36">
                <Select value={measure} onValueChange={(v) => setMeasure(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Measure" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="R"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Across R</SelectItem>
                    <SelectItem value="L"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Across L</SelectItem>
                    <SelectItem value="C"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Across C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="cursor-pointer flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black py-2" onClick={snapshotPNG}> <Camera/> Snapshot</Button>
              <Button variant="ghost" className="cursor-pointer flex-1 border border-zinc-800 py-2" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16"></div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left controls */}
          <div className="lg:col-span-4 space-y-4">
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden w-full shadow-lg shadow-black/40">
    <CardHeader>
      <CardTitle className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">RLC: Frequency Response</div>
            <div className="text-xs text-zinc-400">Interactive Bode plots & oscilloscope</div>
          </div>
        </div>
        <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">
          Mode
        </Badge>
      </CardTitle>
    </CardHeader>

    <CardContent className="space-y-6">
      <div className="grid grid-cols-1 gap-5">
        {/* Resistance */}
        <div className="space-y-1">
        <label className=" text-xs text-zinc-400">Resistance (Ω)</label>
          <div className="flex items-center pt-2 flex-col-reverse gap-3">
            <Slider
              value={[R]}
              onValueChange={(v) => setR(v[0])}
              min={1}
              max={1000}
              step={1}
              className="flex-1 cursor-pointer"
            />
            <Input
              type="number"
              value={R}
              onChange={(e) => setR(Number(e.target.value))}
              className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
            />
          </div>
        </div>

        {/* Inductance */}
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Inductance (mH)</label>
          <div className="flex items-center pt-2 flex-col-reverse gap-3">
            <Slider
              value={[L]}
              onValueChange={(v) => setL(v[0])}
              min={0.1}
              max={500}
              step={0.1}
              className="flex-1 cursor-pointer"
            />
            <Input
              type="number"
              value={L}
              onChange={(e) => setL(Number(e.target.value))}
              className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
            />
          </div>
        </div>

        {/* Capacitance */}
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Capacitance (μF)</label>
          <div className="flex items-center pt-2 flex-col-reverse gap-3">
            <Slider
              value={[C]}
              onValueChange={(v) => setC(v[0])}
              min={0.01}
              max={100}
              step={0.01}
              className="flex-1 cursor-pointer"
            />
            <Input
              type="number"
              value={C}
              onChange={(e) => setC(Number(e.target.value))}
              className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
            />
          </div>
        </div>

        {/* Input amplitude */}
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Input Amplitude (V)</label>
          <div className="flex items-center flex-col-reverse pt-2 gap-3">
            <Slider
              value={[Vin]}
              onValueChange={(v) => setVin(v[0])}
              min={0.1}
              max={20}
              step={0.1}
              className="flex-1 cursor-pointer"
            />
            <Input
              type="number"
              value={Vin}
              onChange={(e) => setVin(Number(e.target.value))}
              className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
            />
          </div>
        </div>

        {/* Center Frequency */}
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Selected Frequency for Time-Domain (Hz)</label>
          <div className="flex items-center flex-col-reverse pt-2 gap-3">
            <Slider
              value={[fCenter]}
              onValueChange={(v) => setFCenter(v[0])}
              min={1}
              max={20000}
              step={1}
              className="flex-1 cursor-pointer"
            />
            <Input
              type="number"
              value={fCenter}
              onChange={(e) => setFCenter(Number(e.target.value))}
              className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
            />
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Use this frequency to view oscilloscope/time-domain waveform.
          </div>
        </div>

        {/* Sweep settings */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Freq Min (Hz)</label>
            <Input
              type="number"
              value={fMin}
              onChange={(e) => setFMin(Number(e.target.value))}
              className="bg-zinc-900/60 border border-zinc-800 text-white text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Freq Max (Hz)</label>
            <Input
              type="number"
              value={fMax}
              onChange={(e) => setFMax(Number(e.target.value))}
              className="bg-zinc-900/60 border border-zinc-800 text-white text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Sweep Points</label>
            <Input
              type="number"
              value={sweepPoints}
              onChange={(e) => setSweepPoints(Number(e.target.value))}
              className="bg-zinc-900/60 border border-zinc-800 text-white text-sm"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            className="flex-1 cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black font-semibold hover:opacity-90"
            onClick={() => setSweepAuto((s) => !s)}
          >
            <Layers className="w-4 h-4 mr-2" />
            {sweepAuto ? "Stop Auto Sweep" : "Auto Sweep"}
          </Button>
          <Button
            variant="ghost"
            className="border cursor-pointer border-zinc-800 hover:border-orange-500 text-zinc-300"
            onClick={exportBodeCSV}
          >
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</motion.div>
          </div>

          {/* Right: Visual + Bode + Scope */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <CircuitBoard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive RLC Visualizer</div>
                        <div className="text-xs text-zinc-400">Bode magnitude & phase • Realtime waveform</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Measure: <span className="text-[#ffd24a] ml-1">{measure}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">f: <span className="text-[#ffd24a] ml-1">{fCenter} Hz</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vin: <span className="text-[#ffd24a] ml-1">{Vin} V</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <CircuitSVG R={R} L={L} C={C} freq={fCenter} Vin={Vin} measure={measure} running={running} timeDomain={timeDomain} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Bode: magnitude & phase stacked */}
              <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-orange-400">Bode Plot — Magnitude (dB)</div>
                  <div className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm text-xs">Log frequency axis</div>
                </div>

                <div className="h-44 sm:h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bodeData.map(d => ({ x: d.fLog, f: d.f, magdB: d.magdB }))}>
                      <CartesianGrid stroke="#111" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="x"
                        tick={{ fill: "#888" }}
                        tickFormatter={(v) => {
                          // v is log10(freq): show human-readable Hz
                          const val = 10 ** v;
                          if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
                          if (val >= 1e3) return `${(val / 1e3).toFixed(2)}k`;
                          return `${Math.round(val)}`;
                        }}
                        label={{ value: "Frequency (Hz)", position: "bottom", fill: "#aaa", offset: 0 }}
                      />
                      <YAxis tick={{ fill: "#888" }} domain={["auto", "auto"]} />
                      <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} formatter={(value, name) => [round(value, 3), name]} />
                      <Legend wrapperStyle={{ color: "#aaa" }} />
                      <Line type="monotone" dataKey="magdB" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Mag (dB)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 text-sm font-medium text-orange-400">Phase (degrees)</div>
                <div className="h-40 sm:h-44 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bodeData.map(d => ({ x: d.fLog, phase: d.phase }))}>
                      <CartesianGrid stroke="#111" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="x"
                        tick={{ fill: "#888" }}
                        tickFormatter={(v) => {
                          const val = 10 ** v;
                          if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
                          if (val >= 1e3) return `${(val / 1e3).toFixed(2)}k`;
                          return `${Math.round(val)}`;
                        }}
                        label={{ value: "Frequency (Hz)", position: "bottom", fill: "#aaa", offset: 0 }}
                      />
                      <YAxis tick={{ fill: "#888" }} domain={["auto", "auto"]} />
                      <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} formatter={(value, name) => [round(value, 3), name]} />
                      <Line type="monotone" dataKey="phase" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Phase (deg)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Oscilloscope / time-domain */}
              <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-orange-400">Time Domain</div>
                  <div className=" bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm text-xs truncate">Showing one period at selected frequency</div>
                </div>

                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeDomain.data.map(d => ({ idx: d.t, Vin: d.Vin, Vout: d.Vout, I: d.I }))}>
                      <CartesianGrid stroke="#111" strokeDasharray="3 3" />
                      <XAxis dataKey="idx" tick={{ fill: "#888" }} />
                      <YAxis tick={{ fill: "#888" }} />
                      <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
                      <Legend wrapperStyle={{ color: "#aaa" }} />
                      <Line type="monotone" dataKey="Vin" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Vin" />
                      <Line type="monotone" dataKey="Vout" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name={`V_${measure}`} />
                      <Line type="monotone" dataKey="I" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="I (A)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                    <div className="text-xs text-zinc-400">Magnitude |H|</div>
                    <div className="text-lg font-semibold text-[#ff9a4a]">{round(timeDomain.magnitude, 6)}</div>
                  </div>
                  <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                    <div className="text-xs text-zinc-400">Phase (deg)</div>
                    <div className="text-lg font-semibold text-[#00ffbf]">{round(timeDomain.phase, 3)}°</div>
                  </div>
                  <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                    <div className="text-xs text-zinc-400">Irms</div>
                    <div className="text-lg font-semibold text-[#ffd24a]">{round(Math.abs(timeDomain.Iph ? (absC(timeDomain.Iph) / Math.sqrt(2)) : 0), 6)} A</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* mobile sticky controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 cursor-pointer py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 cursor-pointer p-2" onClick={() => exportBodeCSV()}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
