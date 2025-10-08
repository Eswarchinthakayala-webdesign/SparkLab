// src/pages/RLCVisualizerPage.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
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

function CircuitSVG({ R, L, C, freq, Vin, measure, running, timeDomain }) {
  // timeDomain includes magnitude & phasor info
  const samples = (timeDomain && timeDomain.data) || [];
  const phMag = timeDomain ? timeDomain.magnitude : 0;
  const iph = timeDomain ? timeDomain.Iph : { re: 0, im: 0 };
  // instantaneous current amplitude (peak)
  const Ipeak = absC(iph);
  const Irms = Ipeak / Math.sqrt(2);
  const dotCount = clamp(Math.round(4 + Irms * 6), 3, 20);
  const speed = clamp(0.9 / (Irms + 0.001), 0.12, 2.0);

  const svgW = 900;
  const svgH = 240;

  // simple path for series: left supply -> R -> L -> C -> ground
  const startX = 80;
  const gap = 200;
  const xR = startX;
  const xL = startX + gap;
  const xC = startX + gap * 2;
  const busY = 120;

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">RLC Frequency Visualizer</div>
            <div className="text-xs text-zinc-400">Series topology • Realtime Bode & Oscilloscope</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">f: <span className="text-[#ffd24a] ml-1">{freq} Hz</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vin: <span className="text-[#ffd24a] ml-1">{Vin} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Irms: <span className="text-[#00ffbf] ml-1">{round(Irms, 6)} A</span></Badge>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-56">
          {/* supply left */}
          <g transform={`translate(${startX - 70},${busY})`}>
            <rect x="-22" y="-26" width="44" height="52" rx="6" fill="#060606" stroke="#222" />
            <text x="-34" y="-36" fontSize="12" fill="#ffd24a">{Vin} V</text>
          </g>

          {/* main bus */}
          <path d={`M ${startX - 20} ${busY} H ${xC + 120}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* resistor */}
          <g transform={`translate(${xR}, ${busY})`}>
            <rect x="-40" y="-18" width="80" height="36" rx="8" fill="#0a0a0a" stroke="#222" />
            <text x="-26" y="-26" fontSize="12" fill="#ffd24a">R = {R} Ω</text>
            <text x="-26" y="6" fontSize="11" fill="#fff">V_R</text>
          </g>

          {/* inductor */}
          <g transform={`translate(${xL}, ${busY})`}>
            <rect x="-40" y="-18" width="80" height="36" rx="8" fill="#0a0a0a" stroke="#222" />
            <text x="-26" y="-26" fontSize="12" fill="#ffd24a">L = {L} mH</text>
            <text x="-26" y="6" fontSize="11" fill="#fff">V_L</text>
          </g>

          {/* capacitor */}
          <g transform={`translate(${xC}, ${busY})`}>
            <rect x="-40" y="-18" width="80" height="36" rx="8" fill="#0a0a0a" stroke="#222" />
            <text x="-26" y="-26" fontSize="12" fill="#ffd24a">C = {C} μF</text>
            <text x="-26" y="6" fontSize="11" fill="#fff">V_C</text>
          </g>

          {/* ground */}
          <path d={`M ${xC + 120} ${busY} V ${busY + 40} H ${xC + 140}`} stroke="#111" strokeWidth="4" strokeLinecap="round" />

          {/* animated dots moving along series path */}
          {Array.from({ length: dotCount }).map((_, di) => {
            const pathStr = `M ${startX - 20} ${busY} H ${xC + 120}`;
            const delay = (di / dotCount) * speed;
            const style = {
              offsetPath: `path('${pathStr}')`,
              animationName: "flowRLC",
              animationDuration: `${speed}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
              transformOrigin: "0 0",
            };
            const dotColor = phMag >= 0 ? "#ffd24a" : "#ff6a9a";
            return <circle key={`dot-${di}`} r="4" fill={dotColor} style={style} />;
          })}

          {/* readout box */}
          <g transform={`translate(${svgW - 180}, 20)`}>
            <rect x="-80" y="-14" width="160" height="120" rx="10" fill="#060606" stroke="#222" />
            <text x="-68" y="2" fontSize="12" fill="#ffb57a">Readouts</text>
            <text x="-68" y="26" fontSize="12" fill="#fff">|H|: <tspan fill="#ffd24a">{round(phMag, 6)}</tspan></text>
            <text x="-68" y="48" fontSize="12" fill="#fff">Phase: <tspan fill="#00ffbf">{round(timeDomain?.phase ?? 0, 2)}°</tspan></text>
            <text x="-68" y="70" fontSize="12" fill="#fff">Irms: <tspan fill="#00ffbf">{round(Irms, 6)} A</tspan></text>
            <text x="-68" y="92" fontSize="12" fill="#fff">Mode: <tspan fill="#ffd24a">{measure}</tspan></text>
          </g>

          <style>{`
            @keyframes flowRLC {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
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

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.2)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-6 h-6 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">RLC Frequency Response • Bode & Oscilloscope</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-36">
                <Select value={measure} onValueChange={(v) => setMeasure(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Measure" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="R" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200">Across R (voltage)</SelectItem>
                    <SelectItem value="L" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200">Across L (voltage)</SelectItem>
                    <SelectItem value="C" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200">Across C (voltage)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-1 rounded-lg shadow-md" onClick={() => toast.success("Snapshot saved")} title="Snapshot">Snapshot</Button>
                <Button variant="ghost" className="border border-zinc-700 text-zinc-300 p-2 rounded-lg" onClick={toggleRunning} title={running ? "Pause" : "Play"}>{running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</Button>
                <Button variant="ghost" className="border border-zinc-700 text-zinc-300 p-2 rounded-lg" onClick={resetDefaults} title="Reset"><Settings className="w-5 h-5" /></Button>
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
                    <SelectItem value="R" className="text-white hover:bg-orange-500/20">Across R</SelectItem>
                    <SelectItem value="L" className="text-white hover:bg-orange-500/20">Across L</SelectItem>
                    <SelectItem value="C" className="text-white hover:bg-orange-500/20">Across C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black py-2" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
              <Button variant="ghost" className="flex-1 border border-zinc-800 py-2" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16"></div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden w-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">RLC: Frequency Response</div>
                        <div className="text-xs text-zinc-400">Interactive Bode plots • Realtime oscilloscope</div>
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
                      <label className="text-xs text-zinc-400">Resistance (Ω)</label>
                      <Input value={R} onChange={(e) => setR(Number(e.target.value))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400">Inductance (mH)</label>
                      <Input value={L} onChange={(e) => setL(Number(e.target.value))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400">Capacitance (μF)</label>
                      <Input value={C} onChange={(e) => setC(Number(e.target.value))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Input amplitude (V)</label>
                      <Input value={Vin} onChange={(e) => setVin(Number(e.target.value))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400">Selected frequency for time-domain (Hz)</label>
                      <Input value={fCenter} onChange={(e) => setFCenter(Number(e.target.value))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500 mt-1">Use this frequency to view oscilloscope/time-domain waveform.</div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-zinc-400">Freq min (Hz)</label>
                        <Input value={fMin} onChange={(e) => setFMin(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Freq max (Hz)</label>
                        <Input value={fMax} onChange={(e) => setFMax(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Sweep points</label>
                        <Input value={sweepPoints} onChange={(e) => setSweepPoints(Number(e.target.value))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    <div className="flex gap-2 mt-2">
                      <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a]" onClick={() => setSweepAuto((s) => !s)}><Layers className="w-4 h-4 mr-2" />{sweepAuto ? "Stop Auto Sweep" : "Auto Sweep"}</Button>
                      <Button variant="ghost" className="border border-zinc-800" onClick={() => exportBodeCSV()}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
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
                  <div className="text-xs text-zinc-400">Log frequency axis</div>
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
                  <div className="text-sm font-medium text-orange-400">Oscilloscope — Time Domain</div>
                  <div className="text-xs text-zinc-400">Showing one period at selected frequency</div>
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
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-zinc-300 text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2" onClick={() => exportBodeCSV()}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
