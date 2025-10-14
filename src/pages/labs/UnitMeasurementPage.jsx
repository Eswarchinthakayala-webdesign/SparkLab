// src/pages/UnitMeasurementPage.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Settings,
  Play,
  Pause,
  Download,
  Menu,
  X,
  Gauge,
  Waves as WaveSquare,
  Cpu,
  Activity,
  Sun,
  Bolt,
  Clock,
  Speaker,
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
   Utilities: conversions & helpers
   ============================ */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

const conversions = {
  // category: { units: [...], convert: (value, from, to) => result }
  "Electrical": {
    units: ["V", "A", "W"],
    convert: (val, from, to, extra = {}) => {
      // val: numeric; if converting W<->(V,A) we need V & A context
      const n = Number(val);
      if (!Number.isFinite(n)) return NaN;
      // direct conversions supported:
      if (from === to) return n;
      if (from === "V" && to === "W") {
        // requires I in extra
        const I = Number(extra.I ?? 0);
        return n * I;
      }
      if (from === "A" && to === "W") {
        const V = Number(extra.V ?? 0);
        return n * V;
      }
      if (from === "W" && to === "V") {
        const I = Number(extra.I ?? 0);
        return I !== 0 ? n / I : NaN;
      }
      if (from === "W" && to === "A") {
        const V = Number(extra.V ?? 0);
        return V !== 0 ? n / V : NaN;
      }
      if (from === "V" && to === "A") {
        const R = extra.R ?? null;
        return R ? n / R : NaN;
      }
      if (from === "A" && to === "V") {
        const R = extra.R ?? null;
        return R ? n * R : NaN;
      }
      return NaN;
    },
  },
  "Frequency": {
    units: ["Hz", "kHz", "MHz"],
    convert: (val, from, to) => {
      const n = Number(val);
      if (!Number.isFinite(n)) return NaN;
      const toHz = {
        Hz: 1,
        kHz: 1e3,
        MHz: 1e6,
      };
      return n * (toHz[from] / toHz[to]);
    },
  },
  "Audio & Gain": {
    units: ["dB", "Linear"],
    convert: (val, from, to) => {
      const n = Number(val);
      if (!Number.isFinite(n)) return NaN;
      if (from === to) return n;
      if (from === "dB" && to === "Linear") {
        // 20*log10(A) -> A = 10^(dB/20)
        return Math.pow(10, n / 20);
      }
      if (from === "Linear" && to === "dB") {
        return 20 * Math.log10(n || 1e-12);
      }
      return NaN;
    },
  },
  "Misc": {
    units: ["percent"],
    convert: (val, from, to) => Number(val),
  },
};

/* ============================
   Simulation / Live signal hook
   - produces a steady waveform for Hz and dynamic values for others
   ============================ */
function useLiveSignal({
  running,
  timestep = 80, // ms
  unitCategory = "Electrical",
  primaryUnit = "V",
  secondaryUnit = "A",
  manualPrimary = "",
  manualSecondary = "",
}) {
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, primary: 0, secondary: 0 })));
  const [history, setHistory] = useState(historyRef.current);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // base simulated signals
  const baseSignal = useCallback(
    (tSeconds) => {
      // produce different templates depending on selected category/unit
      if (unitCategory === "Frequency") {
        // sine with frequency taken from manualPrimary (Hz) or default 2 Hz
        const freq = Number(manualPrimary) && Number(manualPrimary) > 0 ? Number(manualPrimary) : 2;
        const amp = 1;
        const val = amp * Math.sin(2 * Math.PI * freq * tSeconds);
        return { primary: val, secondary: 0 };
      }
      if (unitCategory === "Audio & Gain") {
        // produce amplitude slowly changing to simulate gain
        const gain = Number(manualPrimary) && Number(manualPrimary) > 0 ? Number(manualPrimary) : 1;
        const val = gain * Math.sin(2 * Math.PI * 2 * tSeconds) * (0.5 + 0.5 * Math.sin(tSeconds / 6));
        return { primary: val, secondary: 0 };
      }
      // Electrical: produce V waveform (ramped/sine) and derived I (via user R or manual)
      const Vmanual = Number.isFinite(Number(manualPrimary)) && manualPrimary !== "" ? Number(manualPrimary) : (5 + 2 * Math.sin(2 * Math.PI * 0.5 * tSeconds));
      const Imanual = Number.isFinite(Number(manualSecondary)) && manualSecondary !== "" ? Number(manualSecondary) : (0.2 + 0.05 * Math.cos(2 * Math.PI * 0.8 * tSeconds));
      return { primary: Vmanual, secondary: Imanual };
    },
    [unitCategory, manualPrimary, manualSecondary]
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
      const { primary, secondary } = baseSignal(tSeconds);

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, primary, secondary });
        if (next.length > 720) next.shift();
        return next;
      });
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, baseSignal]);

  return { history };
}

/* ============================
   Visualizer components
   - Meter (needle), Waveform (frequency), LiveReadout
   ============================ */

function NeedleMeter({ value = 0, min = -1, max = 1, label = "", unit = "", color = "#ff9a4a" }) {
  // map value to angle -120deg..120deg
  const v = Number(value);
  const ratio = Number.isFinite(v) ? (v - min) / (max - min) : 0.5;
  const clamped = clamp(ratio, 0, 1);
  const angle = -120 + clamped * 240;
  return (
    <div className="w-full h-44 flex items-center justify-center">
      <svg viewBox="0 0 220 110" className="w-64 md:w-72">
        <defs>
          <linearGradient id="g1" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff7a2d" />
            <stop offset="100%" stopColor="#ffd24a" />
          </linearGradient>
        </defs>

        <g transform="translate(110,90)">
          {/* arc background */}
          <path d="M -80 0 A 80 80 0 0 1 80 0" stroke="#111" strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d="M -78 0 A 78 78 0 0 1 78 0" stroke="rgba(255,122,45,0.16)" strokeWidth="6" fill="none" strokeLinecap="round" />
          {/* ticks */}
          {Array.from({ length: 9 }).map((_, i) => {
            const a = (-120 + (i / 8) * 240) * (Math.PI / 180);
            const x1 = Math.cos(a) * 72;
            const y1 = Math.sin(a) * 72 * -1;
            const x2 = Math.cos(a) * 84;
            const y2 = Math.sin(a) * 84 * -1;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#222" strokeWidth="2" strokeLinecap="round" />;
          })}
          {/* needle */}
          <g transform={`rotate(${angle})`}>
            <rect x="-2" y="-4" width="120" height="8" rx="4" fill={color} transform="translate(0,-4)" style={{ transformOrigin: "0px 0px", transition: "transform 0.18s linear" }} />
            <circle cx="0" cy="0" r="8" fill="#0a0a0a" stroke="#222" strokeWidth="2" />
          </g>

          {/* center dot */}
          <circle cx="0" cy="0" r="4" fill="#fff" opacity="0.9" />

          {/* labels */}
          <text x="0" y="-42" textAnchor="middle" fill="#ffd24a" fontSize="12" fontWeight="600">{label}</text>
          <text x="0" y="-26" textAnchor="middle" fill="#fff" fontSize="11">{round(value, 4)} {unit}</text>
        </g>
      </svg>
    </div>
  );
}

function Waveform({ history = [], unit = "Hz", color = "#ffd24a", height = 120 }) {
  // Map history to area chart points
  const data = history.slice(-200).map((d, idx) => ({ x: idx, y: d.primary }));
  return (
    <div className="rounded-md p-2 bg-black/50 border border-zinc-800">
      <div className="text-xs text-zinc-400 mb-1">Waveform — {unit}</div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="x" hide />
            <YAxis hide />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "8px" }} />
            <Area type="monotone" dataKey="y" stroke={color} fill={color} isAnimationActive={false} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Oscilloscope({ history = [], primaryLabel = "V", secondaryLabel = "I" }) {
  const data = history.slice(-360).map((d, idx) => ({
    t: idx,
    primary: round(d.primary, 6),
    secondary: round(d.secondary, 6),
  }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/10 border border-zinc-800">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — {primaryLabel}{secondaryLabel ? ` & ${secondaryLabel}` : ""}</div>
      </div>
      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="primary" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name={primaryLabel} />
            {secondaryLabel && <Line type="monotone" dataKey="secondary" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name={secondaryLabel} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page Component
   ============================ */
export default function UnitMeasurementPage() {
  // UI & state
  const [category, setCategory] = useState("Electrical");
  const [fromUnit, setFromUnit] = useState("V");
  const [toUnit, setToUnit] = useState("A");
  const [fromVal, setFromVal] = useState("12");
  const [toVal, setToVal] = useState("");
  const [secondaryVal, setSecondaryVal] = useState(""); // e.g., I when converting V->W or V->A via R
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // pick units list dynamically
  const units = useMemo(() => {
    const cat = conversions[category];
    return cat ? cat.units : [];
  }, [category]);

  // update default units when category changes
  useEffect(() => {
    const u = conversions[category].units;
    setFromUnit(u[0]);
    setToUnit(u[Math.min(1, u.length - 1)]);
  }, [category]);

  // live signal hook (feeds oscilloscope & waveform)
  const { history } = useLiveSignal({
    running,
    timestep: 80,
    unitCategory: category,
    primaryUnit: fromUnit,
    secondaryUnit: toUnit,
    manualPrimary: fromVal,
    manualSecondary: secondaryVal,
  });

  // compute conversion whenever inputs change
  useEffect(() => {
    const conv = conversions[category]?.convert;
    if (!conv) return;
    try {
      const res = conv(fromVal, fromUnit, toUnit, { V: Number(fromVal), I: Number(secondaryVal), R: secondaryVal ? Number(secondaryVal) : null });
      setToVal(Number.isNaN(res) ? "" : String(round(res, 8)));
    } catch (err) {
      setToVal("");
    }
  }, [fromVal, fromUnit, toUnit, category, secondaryVal]);

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Live simulation resumed" : "Live simulation paused");
      return nxt;
    });
  };

  const exportCSV = () => {
    const rows = [["t", "primary", "secondary"], ...history.map((d) => [d.t, round(d.primary, 9), round(d.secondary, 9)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unit-measurement-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const snapshot = () => {
    toast.success("Snapshot saved");
  };

  // recommended range for needle meters depending on category/unit
  const suggestedRange = useMemo(() => {
    if (category === "Frequency") return { min: -1, max: 1, unit: fromUnit };
    if (category === "Audio & Gain") return { min: -2, max: 2, unit: fromUnit };
    if (category === "Electrical") {
      if (fromUnit === "V") return { min: 0, max: Math.max(12, Number(fromVal || 12) * 1.5), unit: "V" };
      if (fromUnit === "A") return { min: 0, max: Math.max(1, Number(fromVal || 1) * 2), unit: "A" };
      if (fromUnit === "W") return { min: 0, max: Math.max(10, Number(fromVal || 10) * 2), unit: "W" };
    }
    return { min: -1, max: 1, unit: fromUnit };
  }, [category, fromUnit, fromVal]);

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.14)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header (matches style in the uploaded page) */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Measurement Unit Converter & Visualizer</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-36">
                <Select value={category} onValueChange={(v) => setCategory(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    {Object.keys(conversions).map((k) => (
                      <SelectItem key={k} value={k} className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={snapshot} title="Save Snapshot">Snapshot</Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning} aria-label="Play / Pause" title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={() => { setFromVal(""); setSecondaryVal(""); toast("Cleared inputs"); }}>
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="w-28 sm:w-36 md:w-44">
                  <Select value={category} onValueChange={(v) => setCategory(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      {Object.keys(conversions).map((k) => (
                        <SelectItem key={k} value={k} className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">
                          {k}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={snapshot}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={() => { setFromVal(""); setSecondaryVal(""); toast("Cleared inputs"); }}>Clear</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden w-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <WaveSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Measurement Converter</div>
                        <div className="text-xs text-zinc-400">Convert & visualize real-time measurements</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm hover:border-orange-400 hover:text-orange-200 transition-colors">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs text-zinc-400">Category</label>
                      <Select value={category} onValueChange={(v) => setCategory(v)}>
                        <SelectTrigger className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm rounded-md">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                          {Object.keys(conversions).map((k) => (
                            <SelectItem key={k} value={k} className="text-white">{k}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2 items-end">
                      <div>
                        <label className="text-xs text-zinc-400">From</label>
                        <Select value={fromUnit} onValueChange={(v) => setFromUnit(v)}>
                          <SelectTrigger className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm rounded-md">
                            <SelectValue placeholder="From" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                            {units.map((u) => <SelectItem key={u} value={u} className="text-white">{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs text-zinc-400">To</label>
                        <Select value={toUnit} onValueChange={(v) => setToUnit(v)}>
                          <SelectTrigger className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm rounded-md">
                            <SelectValue placeholder="To" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                            {units.map((u) => <SelectItem key={u} value={u} className="text-white">{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Input ({fromUnit})</label>
                      <Input value={fromVal} onChange={(e) => setFromVal(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    {/* context input for conversions requiring a second value (e.g., I or R). */}
                    <div>
                      <label className="text-xs text-zinc-400">Context / Secondary (e.g., I or R) — optional</label>
                      <Input value={secondaryVal} onChange={(e) => setSecondaryVal(e.target.value)} placeholder="Current (A) or Resistance (Ω) depending on conversion" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500 mt-1">If converting between V/A/W you may need to provide the other value (I or V) or R.</div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Result ({toUnit})</label>
                      <Input value={toVal} readOnly className="bg-zinc-900/40 border border-zinc-800 text-white" />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => { navigator.clipboard?.writeText(toVal); toast.success("Copied result"); }}>Copy Result</Button>
                    <Button variant="ghost" className="border border-zinc-800 text-zinc-300 cursor-pointer" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Gauge className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Summary</div>
                        <div className="text-xs text-zinc-400">Quick readouts & tips</div>
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">From</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{fromVal === "" ? "—" : `${fromVal} ${fromUnit}`}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">To</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{toVal === "" ? "—" : `${toVal} ${toUnit}`}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Category</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{category}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Live</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{running ? "Yes" : "No"}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><LightbulbIcon /></span>
                    <span>
                      Tip: For power conversions (W ↔ V/A) provide the missing value (V or I) in the context input. For gain/dB conversions use Linear (amplitude) ↔ dB.
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right: Visualizer & Oscilloscope */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Real-time meters • waveform • oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Category: <span className="text-[#ffd24a] ml-1">{category}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">From: <span className="text-[#ffd24a] ml-1">{fromUnit}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">To: <span className="text-[#ffd24a] ml-1">{toUnit}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      {/* Needle meter shows the 'from' value */}
                      <NeedleMeter value={Number(fromVal || 0)} min={suggestedRange.min} max={suggestedRange.max} label={`Input (${fromUnit})`} unit={fromUnit} color="#ff9a4a" />
                    </div>

                    <div className="space-y-3">
                      {/* if converting frequency show waveform, else show waveform of primary */}
                      {category === "Frequency" ? (
                        <Waveform history={history} unit={fromUnit} color="#ffd24a" height={160} />
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                              <div className="text-xs text-zinc-400">Primary ({fromUnit})</div>
                              <div className="text-lg font-semibold text-[#ff9a4a]">{fromVal || "—"}</div>
                            </div>
                            <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                              <div className="text-xs text-zinc-400">Secondary (context)</div>
                              <div className="text-lg font-semibold text-[#00ffbf]">{secondaryVal || "—"}</div>
                            </div>
                          </div>

                          <div className="rounded-md p-2 bg-black/50 border border-zinc-800">
                            <div className="text-xs text-zinc-400 mb-1">Derived: {toUnit}</div>
                            <div className="text-2xl font-semibold text-[#ffd24a]">{toVal || "—"} {toUnit}</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <Oscilloscope history={history} primaryLabel={fromUnit} secondaryLabel={category === "Electrical" ? (toUnit || "I") : ""} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Cpu className="w-5 h-5" /> Live Controls
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center gap-2">
                      <Button className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                      <Button variant="ghost" className="px-3 py-2 border border-zinc-800 text-zinc-300" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
                    </div>

                    <div className="text-xs text-zinc-400">
                      Live visualizer reads manual input if provided — otherwise it simulates a signal based on category.
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Simulation params</div>
                      <div className="text-sm text-white mt-2">Timestep: 80ms • Buffer: {history.length} points</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile sticky controls */}
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

/* ============================
   Small helper icon (inline) — to avoid adding another import
   ============================ */
function LightbulbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 18h6" stroke="#ffb86b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"></path>
      <path d="M10 22h4" stroke="#ffb86b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"></path>
      <path d="M12 2a6.5 6.5 0 0 0-4 11.9V16a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.1A6.5 6.5 0 0 0 12 2z" stroke="#ffb86b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"></path>
    </svg>
  );
}
