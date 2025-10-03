// src/pages/TransformerCalculatorPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Network,
  Play,
  Pause,
  Plus,
  Trash2,
  Layers,
  Gauge,
  Download,
  Settings,
  Database,
  ZapOff,
  Repeat,
  Activity,
  Menu,
  X,
  Lightbulb,
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

/**
 * Fixed TransformerCalculatorPage.jsx
 * - Throttled/buffered waveform updates to avoid Recharts render-loop
 * - Disabled Recharts animations
 * - Improved responsiveness and mobile UX
 * - Kept original features (CSV export, snapshot, reset, interactive visual)
 */

/* ============================
   Utilities
   ============================ */
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TWO_PI = Math.PI * 2;

/* ============================
   useTransformerWave
   - buffered RAF -> commit at most `commitMs` (defaults to 100ms)
   ============================ */
function useTransformerWave({
  running,
  freq,
  Vm,
  turnsRatio,
  loadVA,
  pf,
  coreLoss,
  copperLoss,
  showPeak,
  commitMs = 100,
}) {
  const [history, setHistory] = useState([]);
  const lastRef = useRef(performance.now());
  const tRef = useRef(0);
  const rafRef = useRef(null);

  // buffer to accumulate frames between state commits
  const bufferRef = useRef([]);
  const lastCommitRef = useRef(performance.now());

  // treat Vm input as RMS by default; Vpk computed
  const Vrms = Math.max(0, Vm);
  const Vpk = Vrms * Math.SQRT2;

  // compute steady-state metrics (memoized, primitive deps)
  const results = useMemo(() => {
    const Vs_rms = Vrms * (turnsRatio || 1);
    const Is_rms = Vs_rms > 0 ? (loadVA || 0) / Vs_rms : 0;
    const Ip_rms = (turnsRatio && turnsRatio !== 0) ? Is_rms / turnsRatio : Is_rms;

    const Ip_pk = Ip_rms * Math.SQRT2;
    const Is_pk = Is_rms * Math.SQRT2;

    const copper = Math.max(0, copperLoss || 0);
    const core = Math.max(0, coreLoss || 0);
    const totalLosses = copper + core;

    const S_in = Vrms * Ip_rms;
    const P_load = (loadVA || 0) * (pf || 1);
    const P_in = P_load + totalLosses;
    const eff = P_in > 0 ? (P_load / P_in) * 100 : 0;
    const regApprox = Ip_rms > 0 ? clamp((copper / (P_load || 1)) * 100, 0, 20) : 0;

    return {
      Vrms,
      Vpk,
      Vs_rms,
      Vp_rms: Vrms,
      Ip_rms,
      Is_rms,
      Ip_pk,
      Is_pk,
      copper,
      core,
      totalLosses,
      S_in,
      P_load,
      P_in,
      eff,
      regApprox,
    };
  }, [Vrms, turnsRatio, loadVA, pf, copperLoss, coreLoss]);

  // RAF loop: push to buffer, commit at throttled rate
  useEffect(() => {
    let alive = true;
    lastRef.current = performance.now();
    lastCommitRef.current = performance.now();

    const step = (ts) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(step);

      if (!running) {
        lastRef.current = ts;
        return;
      }

      const dt = ts - lastRef.current;
      // skip tiny dt to avoid noise
      if (dt < 8) {
        lastRef.current = ts;
        return;
      }
      lastRef.current = ts;
      tRef.current += dt;
      const t = tRef.current / 1000;

      // compute instant values
      const w = TWO_PI * freq;
      const Vinst = results.Vpk * Math.sin(w * t);
      const currentPhase = Math.acos(clamp(pf || 1, -1, 1));
      const Iinst = results.Is_pk * Math.sin(w * t - currentPhase);
      const Pinst = Vinst * Iinst;

      // push into buffer
      bufferRef.current.push({ t, V: Vinst, I: Iinst, P: Pinst });

      // commit at most every commitMs ms
      const now = performance.now();
      if (now - lastCommitRef.current >= commitMs) {
        if (!alive) return;
        setHistory((h) => {
          // append buffered frames, trim to limit
          const next = h.length === 0 ? [...bufferRef.current] : [...h, ...bufferRef.current];
          bufferRef.current.length = 0;
          if (next.length > 720) {
            // keep last 720 points
            return next.slice(next.length - 720);
          }
          return next;
        });
        lastCommitRef.current = now;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // flush remaining buffer synchronously once at unmount
      if (bufferRef.current.length) {
        setHistory((h) => {
          const next = [...h, ...bufferRef.current];
          bufferRef.current.length = 0;
          if (next.length > 720) return next.slice(next.length - 720);
          return next;
        });
      }
    };
    // NOTE: using primitive deps only to avoid identity churn
  }, [running, freq, Vm, turnsRatio, loadVA, pf, coreLoss, copperLoss, commitMs, results.Is_pk, results.Vpk]);

  return { history, summary: results };
}

/* ============================
   OscilloscopePanel (charts with animations disabled)
   ============================ */
function OscilloscopePanel({ history = [], running, title = "Oscilloscope" }) {
  const data = useMemo(
    () =>
      history.slice(-400).map((d, idx) => ({
        t: idx,
        V: round(d.V, 6),
        I: round(d.I, 8),
        P: round(d.P, 6),
      })),
    [history]
  );

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${running ? "bg-[#ff7a2d] animate-pulse" : "bg-zinc-700"}`} />
          <div className="text-sm font-medium text-[#ff7a2d] ">{title}</div>
        </div>
  <Badge
  className="bg-gradient-to-r from-orange-500/20 via-orange-600/20 to-orange-700/20 
             border border-orange-500/40 text-orange-300 
             px-3 py-1 rounded-full shadow-sm text-xs font-medium 
             backdrop-blur-sm"
>
  Voltage • Current • Power
</Badge>

      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#070707", border: "1px solid #222", color: "#fff",borderRadius:"10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            {/* disable Recharts animations and dots to avoid internal re-render churn */}
            <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} animationDuration={0} name="Voltage (V)" />
            <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} animationDuration={0} name="Current (A)" />
            <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} animationDuration={0} name="Power (W)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   TransformerVisualizer (responsive)
   ============================ */
function TransformerVisualizer({ summary, turnsDescription, running, showPeak }) {
  const {
    Vrms,
    Vpk,
    Vs_rms,
    Ip_rms,
    Is_rms,
    copper,
    core,
    P_load,
    eff,
  } = summary;

  // responsive svg width/height: use viewBox to scale
  const svgW = 920;
  const svgH = 360;

  const dotCount = clamp(Math.round(6 + Math.abs(Is_rms) * 6), 4, 18);
  const dotSpeed = clamp(1.2 / (Math.abs(Is_rms) / 2 + 0.2), 0.6, 3.0);

  // needle angles (safe clamped)
  const vmeterAngle = clamp((Vrms / Math.max(1, Vrms || 1)) * 45, -45, 45);
  const ameterAngle = clamp((Is_rms / Math.max(0.001, Is_rms || 0.001)) * 60, -60, 60);

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Transformer Visualizer</div>
            <div className="text-xs text-zinc-400">{turnsDescription}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vs: <span className="text-[#ffd24a] ml-1">{round(Vs_rms, 3)} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Is: <span className="text-[#ffd24a] ml-1">{round(Is_rms, 4)} A</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">η: <span className="text-[#ff9a4a] ml-1">{round(eff, 2)}%</span></Badge>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-72 sm:h-80 lg:h-96">
          {/* core */}
          <g transform="translate(60,40)">
            <rect x="0" y="0" width="300" height="260" rx="18" fill="#060606" stroke="#222" />
            <rect x="14" y="14" width="272" height="232" rx="12" fill="#0b0b0b" stroke="#1a1a1a" />
          </g>

          {/* primary */}
          <g transform="translate(80,110)">
            <text x="-60" y="-18" fill="#ffd24a" style={{ fontSize: "12px" }}>Primary</text>
            {Array.from({ length: 9 }).map((_, i) => (
              <path key={`pcoil-${i}`} d={`M ${20 - i * 6} ${40 - i * 2} q 12 -20 24 0`} stroke="#ffb86b" strokeWidth="8" fill="none" strokeLinecap="round" />
            ))}
            <rect x="-8" y="36" width="8" height="84" rx="2" fill="#0a0a0a" stroke="#222" />
            <text x="-60" y="140" fill="#fff" style={{ fontSize: 11 }}>Vp: <tspan fill="#ffd24a">{round(Vrms, 3)} V</tspan></text>
          </g>

          {/* secondary */}
          <g transform={`translate(${svgW - 320},110)`}>
            <text x="14" y="-18" fill="#ffd24a" style={{ fontSize: "12px" }}>Secondary</text>
            {Array.from({ length: 9 }).map((_, i) => (
              <path key={`scoil-${i}`} d={`M ${-20 + i * 6} ${40 - i * 2} q -12 -20 -24 0`} stroke="#ff9a4a" strokeWidth="8" fill="none" strokeLinecap="round" />
            ))}
            <rect x="28" y="36" width="8" height="84" rx="2" fill="#0a0a0a" stroke="#222" />
            <text x="-10" y="140" fill="#fff" style={{ fontSize: 11 }}>Vs: <tspan fill="#ffd24a">{round(Vs_rms, 3)} V</tspan></text>
          </g>

          {/* load box */}
          <g transform={`translate(${svgW - 190},220)`}>
            <rect x="0" y="0" width="120" height="64" rx="8" fill="#060606" stroke="#222" />
            <text x="10" y="22" style={{ fontSize: 12 }} fill="#ffd24a">Load</text>
            <text x="10" y="40" style={{ fontSize: 11 }} fill="#fff">{round(P_load, 2)} W</text>
          </g>

          {/* animated dots - use limited count to reduce paint on mobile */}
          {Array.from({ length: dotCount }).map((_, di) => {
            const xStart = svgW - 320 + 14;
            const pathStr = `M ${xStart} 132 H ${svgW - 260} V 264 H ${xStart}`;
            const delay = (di / dotCount) * dotSpeed;
            const style = {
              offsetPath: `path('${pathStr}')`,
              WebkitOffsetPath: `path('${pathStr}')`,
              animation: `flowT ${dotSpeed}s linear ${-delay}s infinite`,
              animationPlayState: running ? "running" : "paused",
            };
            return <circle key={`dot-${di}`} r={Math.max(2.6, Math.min(4.2, 4.2 - (window?.innerWidth < 420 ? 1 : 0)))} fill="#ffd24a" style={style} />;
          })}

          {/* voltmeter */}
          <g transform="translate(20,200)">
            <rect x="0" y="0" width="84" height="84" rx="12" fill="#060606" stroke="#222" />
            <text x="12" y="20" style={{ fontSize: 11 }} fill="#ffd24a">Voltmeter</text>
            <text x="12" y="46" style={{ fontSize: 14 }} fill="#fff">{round(Vrms, 3)} V</text>
            <g transform="translate(42,62)">
              <rect x="-30" y="-6" width="60" height="12" rx="6" fill="#111" />
              <motion.rect
                initial={{ rotate: -30 }}
                animate={{ rotate: vmeterAngle }}
                transition={{ type: "spring", stiffness: 120, damping: 16 }}
                x="-2" y="-8" width="4" height="20" rx="2" fill="#ffd24a"
                style={{ transformOrigin: "50% 50%" }}
              />
            </g>
          </g>

          {/* ammeter */}
          <g transform={`translate(${svgW - 110},200)`}>
            <rect x="0" y="0" width="84" height="84" rx="12" fill="#060606" stroke="#222" />
            <text x="10" y="20" style={{ fontSize: 11 }} fill="#ffd24a">Ammeter</text>
            <text x="10" y="46" style={{ fontSize: 14 }} fill="#fff">{round(Is_rms, 4)} A</text>
            <g transform="translate(42,62)">
              <rect x="-30" y="-6" width="60" height="12" rx="6" fill="#111" />
              <motion.rect
                initial={{ rotate: -40 }}
                animate={{ rotate: ameterAngle }}
                transition={{ type: "spring", stiffness: 110, damping: 14 }}
                x="-2" y="-8" width="4" height="20" rx="2" fill="#ffd24a"
                style={{ transformOrigin: "50% 50%" }}
              />
            </g>
          </g>

          {/* losses badge */}
          <g transform={`translate(${svgW / 2 - 120},16)`}>
            <rect x="0" y="-62" width="280" height="36" rx="8" fill="#060606" stroke="#222" />
            <text x="12" y="-40" style={{ fontSize: 12 }} fill="#ffd24a">Losses</text>
            <text x="120" y="-40" style={{ fontSize: 11 }} fill="#fff">Core: {round(core,2)} W • Copper: {round(copper,2)} W</text>
          </g>

          <style>{`
            @keyframes flowT {
              0% { offset-distance: 0%; opacity: 1; transform: scale(0.98); }
              50% { opacity: 0.9; transform: scale(1.04); }
              100% { offset-distance: 100%; opacity: 0; transform: scale(0.9); }
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
   Small summary card
   ============================ */
function SummaryCard({ title, value, subtitle, color = "#ffd24a" }) {
  return (
    <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
      <div className="text-xs text-zinc-400">{title}</div>
      <div className="text-lg font-semibold" style={{ color }}>{value}</div>
      {subtitle && <div className="text-xs text-zinc-400 mt-1">{subtitle}</div>}
    </div>
  );
}

/* ============================
   Page Component
   ============================ */
export default function TransformerCalculatorPage() {
  // inputs
  const [Vm, setVm] = useState("230");
  const [freq, setFreq] = useState("50");
  const [turnsChoice, setTurnsChoice] = useState("ratio");
  const [turnsRatio, setTurnsRatio] = useState("0.5");
  const [Np, setNp] = useState("100");
  const [Ns, setNs] = useState("50");
  const [transformerType, setTransformerType] = useState("step-down");
  const [loadVA, setLoadVA] = useState("1000");
  const [pf, setPf] = useState("0.9");
  const [coreLoss, setCoreLoss] = useState("25");
  const [copperLoss, setCopperLoss] = useState("40");
  const [showPeak, setShowPeak] = useState(false);

  // UI
  const [running, setRunning] = useState(true);
  const [mobileHeaderOpen, setMobileHeaderOpen] = useState(false);

  // compute turns ratio
  const ratioComputed = useMemo(() => {
    if (turnsChoice === "turns") {
      const p = toNum(Np) || 1;
      const s = toNum(Ns) || 1;
      return s / p;
    }
    return toNum(turnsRatio) || 1;
  }, [turnsChoice, turnsRatio, Np, Ns]);

  const turnsDescription = useMemo(() => {
    if (transformerType === "step-up") return `Step-up (x${round(ratioComputed, 3)})`;
    if (transformerType === "step-down") return `Step-down (x${round(ratioComputed, 3)})`;
    return `Isolation (x${round(ratioComputed, 3)})`;
  }, [transformerType, ratioComputed]);

  // waveform sim with buffered commits
  const { history, summary } = useTransformerWave({
    running,
    freq: toNum(freq) || 50,
    Vm: toNum(Vm) || 230,
    turnsRatio: ratioComputed,
    loadVA: toNum(loadVA) || 0,
    pf: clamp(toNum(pf) || 1, -1, 1),
    coreLoss: toNum(coreLoss) || 0,
    copperLoss: toNum(copperLoss) || 0,
    showPeak,
    commitMs: 100, // commit frames at most every 100ms
  });

  // derived summary values
  const Vs = round(summary.Vs_rms, 3);
  const Ip = round(summary.Ip_rms, 6);
  const Is = round(summary.Is_rms, 6);
  const eff = round(summary.eff, 3);
  const totalLosses = round(summary.totalLosses, 3);
  const Pload = round(summary.P_load, 3);

  // CSV export
  const exportCSV = useCallback(() => {
    const rows = [
      ["t", "V_inst", "I_inst", "P_inst"],
      ...history.map((d) => [round(d.t, 6), round(d.V, 6), round(d.I, 6), round(d.P, 6)]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transformer-wave-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  }, [history]);

  const snapshot = () => {
    toast.success("Snapshot saved (in-memory)");
  };

  const reset = () => {
    setVm("230");
    setFreq("50");
    setTurnsChoice("ratio");
    setTurnsRatio("0.5");
    setNp("100");
    setNs("50");
    setTransformerType("step-down");
    setLoadVA("1000");
    setPf("0.9");
    setCoreLoss("25");
    setCopperLoss("40");
    setShowPeak(false);
    toast("Reset to defaults");
  };

  return (
    <div className="min-h-screen bg-black pb-20 sm:pb-2  text-white">
      <Toaster position="top-right" richColors />

      {/* Header (responsive with mobile slide-down) */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-black/40 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* top row */}
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-3 select-none">
                <div className="w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm text-zinc-300 leading-none">SparkLab</div>
                  <div className=" font-semibold text-xs text-zinc-400">Transformer Calculator</div>
                </div>
              </motion.div>
            </div>

            <div className="hidden sm:flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2">
                <div className="text-xs text-zinc-400">Vm (RMS)</div>
                <Input className="w-20 bg-zinc-900/60 border border-zinc-800 text-white text-sm" value={Vm} onChange={(e) => setVm(e.target.value)} />
                <div className="text-xs text-zinc-400">Hz</div>
                <Input className="w-20 bg-zinc-900/60 border border-zinc-800 text-white text-sm" value={freq} onChange={(e) => setFreq(e.target.value)} />
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer" onClick={snapshot}>Snapshot</Button>
                <Button variant="ghost" className="border border-zinc-800 cursor-pointer" onClick={() => setRunning((r) => { toast(!r ? "Simulation resumed" : "Simulation paused"); return !r; })}>
                  {running ? <Pause /> : <Play />}
                </Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-800" onClick={reset}><Settings /></Button>
              </div>
            </div>

            {/* mobile menu toggle */}
            <div className="flex sm:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2" onClick={() => setMobileHeaderOpen((s) => !s)}>
                {mobileHeaderOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* mobile slide-down panel */}
          <div className={`sm:hidden transition-all duration-300 overflow-hidden ${mobileHeaderOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-1 flex-1">
                <div className="text-[11px] text-zinc-400">Vm</div>
                <Input value={Vm} onChange={(e) => setVm(e.target.value)} className="flex-1 bg-zinc-900/60 border border-zinc-800 text-white text-xs" />
              </div>
              <div className="flex items-center gap-1 flex-1">
                <div className="text-[11px] text-zinc-400">Hz</div>
                <Input value={freq} onChange={(e) => setFreq(e.target.value)} className="flex-1 bg-zinc-900/60 border border-zinc-800 text-white text-xs" />
              </div>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-xs py-2" onClick={snapshot}>Snapshot</Button>
              <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2" onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Play"}</Button>
              <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2" onClick={reset}>Reset</Button>
            </div>
          </div>
        </div>
      </header>

      {/* main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* left: controls */}
<div className="lg:col-span-4 space-y-4">
  <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
    <CardHeader className="px-4 py-3 sm:px-6">
      <CardTitle className="text-[#ffd24a] flex items-center gap-2 text-base sm:text-lg">
        <Activity className="w-4 h-4 sm:w-5 sm:h-5" /> Transformer Setup
      </CardTitle>
    </CardHeader>

    <CardContent className="space-y-4 px-4 sm:px-6 py-3 sm:py-4">

      {/* Primary Voltage */}
      <div className="w-full">
        <label className="text-xs sm:text-sm text-zinc-400">Primary Voltage (Vrms)</label>
        <Input
          value={Vm}
          onChange={(e) => setVm(e.target.value)}
          className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
        />
      </div>

      {/* Frequency */}
      <div className="w-full">
        <label className="text-xs sm:text-sm text-zinc-400">Frequency (Hz)</label>
        <Input
          value={freq}
          onChange={(e) => setFreq(e.target.value)}
          className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
        />
      </div>

      {/* Turns Choice */}
      <div className="grid grid-cols-1  gap-3">
        <div className="w-full">
          <label className="text-xs sm:text-sm text-zinc-400">Define turns by</label>
          <Select value={turnsChoice} onValueChange={(v) => setTurnsChoice(v)}>
            <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500 rounded-md shadow-sm">
              <SelectValue placeholder="Select option" />
            </SelectTrigger>

            <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
              <SelectItem
                value="ratio"
                className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md"
              >
                Turns ratio (Ns/Np)
              </SelectItem>
              <SelectItem
                value="turns"
                className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md"
              >
                Turns (Np & Ns)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {turnsChoice === "ratio" ? (
          <div className="w-full">
            <label className="text-xs sm:text-sm text-zinc-400">Turns ratio (Ns / Np)</label>
            <Input
              value={turnsRatio}
              onChange={(e) => setTurnsRatio(e.target.value)}
              className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
            />
          </div>
        ) : (
          <>
            <div className="w-full">
              <label className="text-xs sm:text-sm text-zinc-400">Np (primary turns)</label>
              <Input
                value={Np}
                onChange={(e) => setNp(e.target.value)}
                className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
              />
            </div>
            <div className="w-full">
              <label className="text-xs sm:text-sm text-zinc-400">Ns (secondary turns)</label>
              <Input
                value={Ns}
                onChange={(e) => setNs(e.target.value)}
                className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
              />
            </div>
          </>
        )}
      </div>

      {/* Transformer Type */}
      <div className="w-full">
        <label className="text-xs sm:text-sm text-zinc-400">Transformer Type</label>
        <Select value={transformerType} onValueChange={(v) => setTransformerType(v)}>
          <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500 rounded-md shadow-sm">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>

          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
            <SelectItem value="step-down" className="text-white data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 hover:bg-orange-500/20 rounded-md">Step-down</SelectItem>
            <SelectItem value="step-up" className="text-white data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 hover:bg-orange-500/20 rounded-md">Step-up</SelectItem>
            <SelectItem value="isolation" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Isolation</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Load & Power Factor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="w-full">
          <label className="text-xs sm:text-sm text-zinc-400">Load (VA)</label>
          <Input
            value={loadVA}
            onChange={(e) => setLoadVA(e.target.value)}
            className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
          />
        </div>
        <div className="w-full">
          <label className="text-xs sm:text-sm text-zinc-400">Power Factor (0..1)</label>
          <Input
            value={pf}
            onChange={(e) => setPf(e.target.value)}
            className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
          />
        </div>
      </div>

      {/* Losses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="w-full">
          <label className="text-xs sm:text-sm text-zinc-400">Core Loss (W)</label>
          <Input
            value={coreLoss}
            onChange={(e) => setCoreLoss(e.target.value)}
            className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
          />
        </div>
        <div className="w-full">
          <label className="text-xs sm:text-sm text-zinc-400">Copper Loss (W)</label>
          <Input
            value={copperLoss}
            onChange={(e) => setCopperLoss(e.target.value)}
            className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
          />
        </div>
      </div>

      {/* Wave Mode */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Badge className="bg-black/70 border border-orange-500/40 text-orange-300 text-xs sm:text-sm px-3 py-1 rounded-full shadow-sm backdrop-blur-sm">
          Wave mode
        </Badge>
        <Button
          variant="outline"
          className={`px-3 cursor-pointer py-1 text-xs sm:text-sm ${showPeak ? "bg-zinc-800/60" : ""}`}
          onClick={() => setShowPeak((s) => !s)}
        >
          {showPeak ? "Peak view" : "RMS view"}
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
        <div className="flex flex-wrap gap-2">
          <Button className=" cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> Snapshot
          </Button>
          <Button variant="outline" className="border cursor-pointer border-zinc-700" onClick={() => setRunning(true)}>
            <Play className="w-4 h-4" />
          </Button>
          <Button variant="outline" className="border cursor-pointer border-zinc-700" onClick={() => setRunning(false)}>
            <Pause className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}>
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={reset}>
            <Repeat className="w-4 h-4" />
          </Button>
        </div>
      </div>

    </CardContent>
  </Card>
</div>


          {/* right: visual + oscilloscope + summary */}
<div className="lg:col-span-8 space-y-4">
  <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
    <CardHeader>
      <CardTitle className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Title + Icon */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Network className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="text-base sm:text-lg font-semibold text-[#ffd24a]">
              Interactive Transformer Visualizer
            </div>
            <div className="text-xs text-zinc-400">
              Real-time animation • meters • oscilloscope
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm">
            Type: <span className="text-[#ffd24a] ml-1">{transformerType}</span>
          </Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm">
            Ratio: <span className="text-[#ffd24a] ml-1">{round(ratioComputed, 4)}</span>
          </Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm">
            Load: <span className="text-[#ffd24a] ml-1">{round(loadVA || 0, 2)} VA</span>
          </Badge>
        </div>
      </CardTitle>
    </CardHeader>

    <CardContent>
      {/* Visualizer (placeholder) */}
      <TransformerVisualizer
        summary={summary}
        turnsDescription={turnsDescription}
        running={running}
        showPeak={showPeak}
      />
    </CardContent>
  </Card>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* Oscilloscope */}
    <OscilloscopePanel
      history={history}
      running={running}
      title="Voltage / Current / Power"
    />

    {/* Results */}
    <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
      <CardHeader>
        <CardTitle className="flex  text-[#ffd24a] items-center gap-2 text-sm sm:text-base">
          <Gauge className="w-4 h-4 text-[#ffd24a]" /> Results
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SummaryCard
            title="Vs (secondary RMS)"
            value={`${Vs} V`}
            subtitle="Secondary voltage"
            color="#ffd24a"
          />
          <SummaryCard
            title="Ip (primary RMS)"
            value={`${Ip} A`}
            subtitle="Primary RMS current"
            color="#ff9a4a"
          />
          <SummaryCard
            title="Is (secondary RMS)"
            value={`${Is} A`}
            subtitle="Secondary RMS current"
            color="#ff9a4a"
          />
          <SummaryCard
            title="Load Power"
            value={`${Pload} W`}
            subtitle="Real load power"
            color="#ffd24a"
          />
          <SummaryCard
            title="Total Losses"
            value={`${totalLosses} W`}
            subtitle={`Core ${round(summary.core, 2)}W • Copper ${round(summary.copper, 2)}W`}
            color="#ff9a4a"
          />
          <SummaryCard
            title="Efficiency"
            value={`${eff} %`}
            subtitle="Idealized"
            color="#00ffbf"
          />
        </div>

        <div
  className="mt-3 text-xs sm:text-sm 
             bg-black/70 border border-orange-500/30 
             text-orange-300 px-3 py-2 rounded-md shadow-sm 
             backdrop-blur-sm flex items-start gap-2"
>
  <Lightbulb className="w-10 h-4 text-orange-400 mt-[4px]" />
  <span>
    Tip: Adjust copper & core losses to see impact on efficiency. 
    Use the turns input to switch between ratio and explicit turns.
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
