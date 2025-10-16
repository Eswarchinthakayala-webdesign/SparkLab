// src/pages/ElectricBillEstimator.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Home,
  DollarSign,
  BatteryCharging,
  Play,
  Pause,
  Download,
  Settings,
  Menu,
  X,
  Activity,
  Gauge,
  Lightbulb,
  Trash2,
  Plus,
  Layers,
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
  BarChart,
  Bar,
} from "recharts";

/* ============================
   Utilities (same style as your file)
   ============================ */
const round = (v, p = 4) => {
  if (!Number.isFinite(v)) return Number.isNaN ? NaN : NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const currency = (v) => `₹${Number.isFinite(v) ? round(v, 2).toLocaleString() : "—"}`;

/* ============================
   Default tariff slabs (example)
   - You should replace these with your local tariff structure or allow user to edit them.
   - Each slab: { upto: number|null, rate: number } where upto is cumulative kWh boundary; null means rest.
   ============================ */
const TARIFFS = {
  residential: {
    label: "Residential",
    slabs: [
      { upto: 50, rate: 3.0 }, // first 50 kWh @ ₹3
      { upto: 150, rate: 4.5 }, // next upto 150 kWh @ ₹4.5
      { upto: 300, rate: 6.0 }, // next upto 300 kWh @ ₹6
      { upto: null, rate: 8.5 }, // rest @ ₹8.5
    ],
    fixedCharge: 50,
  },
  commercial: {
    label: "Commercial",
    slabs: [
      { upto: 100, rate: 7.0 },
      { upto: 300, rate: 8.5 },
      { upto: null, rate: 10.0 },
    ],
    fixedCharge: 150,
  },
  industrial: {
    label: "Industrial",
    slabs: [
      { upto: 500, rate: 6.0 },
      { upto: 1500, rate: 7.0 },
      { upto: null, rate: 9.0 },
    ],
    fixedCharge: 500,
  },
};

/* ============================
   Tariff calculation helpers
   - computeBillFromSlabs(consumption, slabs)
   - returns breakdown: array of { slabFrom, slabTo, kWh, rate, cost } and subtotal
   ============================ */
function computeBillFromSlabs(consumption, slabs) {
  // slabs is array of { upto: number|null, rate }
  const breakdown = [];
  let remaining = Math.max(0, Number(consumption) || 0);
  let lower = 0;
  for (const s of slabs) {
    const upto = s.upto;
    if (upto === null) {
      // everything remaining goes here
      const kWh = remaining;
      const cost = kWh * s.rate;
      breakdown.push({ slabFrom: lower + 1, slabTo: null, kWh, rate: s.rate, cost });
      remaining = 0;
      break;
    } else {
      const slabCapacity = Math.max(0, upto - lower);
      const inSlab = Math.min(remaining, slabCapacity);
      const cost = inSlab * s.rate;
      breakdown.push({ slabFrom: lower + 1, slabTo: upto, kWh: inSlab, rate: s.rate, cost });
      remaining -= inSlab;
      lower = upto;
      if (remaining <= 0) break;
    }
  }
  const subtotal = breakdown.reduce((a, b) => a + (Number.isFinite(b.cost) ? b.cost : 0), 0);
  return { breakdown, subtotal };
}

/* ============================
   Visualization components
   - Animated SVG meter + house
   - Use instantaneous power to set dot density & color
   ============================ */
function ElectricVisualizerSVG({ consumptionDaily = 0, instantaneousKW = 0, running = true }) {
  // consumptionDaily in kWh/day (for indicator)
  // instantaneousKW is current power draw in kW (for dot speed/density)
  const abs = Math.max(0, instantaneousKW);
  const dotCount = clamp(Math.round(4 + abs * 6), 3, 30);
  const speed = clamp(1.2 / (abs + 0.01), 0.25, 3.0);

  // color gradient: low (warm orange) -> high (hot pink)
  const colorLow = "#ffd24a";
  const colorHigh = "#ff6a9a";

  const mix = (a, b, t) => {
    // simple hex mix
    const ha = parseInt(a.slice(1), 16);
    const hb = parseInt(b.slice(1), 16);
    const ra = (ha >> 16) & 0xff, ga = (ha >> 8) & 0xff, ba = ha & 0xff;
    const rb = (hb >> 16) & 0xff, gb = (hb >> 8) & 0xff, bb = hb & 0xff;
    const r = Math.round(ra + (rb - ra) * t).toString(16).padStart(2, "0");
    const g = Math.round(ga + (gb - ga) * t).toString(16).padStart(2, "0");
    const b2 = Math.round(ba + (bb - ba) * t).toString(16).padStart(2, "0");
    return `#${r}${g}${b2}`;
  };

  const color = mix(colorLow, colorHigh, clamp(abs / 5, 0, 1)); // normalize at 5kW

  const svgWidth = 920;
  const svgHeight = 260;

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Home className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Consumption Visualizer</div>
            <div className="text-xs text-zinc-400">Realtime meter • flow • daily estimate</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Daily: <span className="text-[#ffd24a] ml-1">{round(consumptionDaily, 3)} kWh</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Inst: <span className="text-[#00ffbf] ml-1">{round(instantaneousKW, 4)} kW</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-56" preserveAspectRatio="xMidYMid meet">
          {/* house silhouette */}
          <defs>
            <linearGradient id="glass" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#0b0b0b" />
              <stop offset="100%" stopColor="#131313" />
            </linearGradient>
            <linearGradient id="glow" x1="0" x2="1">
              <stop offset="0%" stopColor="#ff7a2d" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ffd24a" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          <g transform={`translate(40,20)`}>
            <rect x="0" y="80" width="160" height="100" rx="8" fill="url(#glass)" stroke="#222" />
            <polygon points="0,80 80,20 160,80" fill="#080808" stroke="#222" />
            <rect x="18" y="110" width="36" height="36" rx="4" fill="#0a0a0a" stroke="#222" />
            <rect x="106" y="110" width="36" height="36" rx="4" fill="#0a0a0a" stroke="#222" />
            <text x="6" y="205" fontSize="11" fill="#888">Smart Home</text>

            {/* small meter */}
            <g transform="translate(190,90)">
              <rect x="0" y="0" width="120" height="56" rx="8" fill="#060606" stroke="#222" />
              <text x="8" y="18" fontSize="12" fill="#ffd24a">Meter</text>
              <text x="8" y="36" fontSize="12" fill="#fff">{round(instantaneousKW, 3)} kW</text>
            </g>
          </g>

          {/* path for flowing dots */}
          <g transform="translate(40,20)">
            {/* path from meter to house */}
            <path id="flowPath" d="M 210 118 C 250 100, 300 100, 350 120" fill="none" stroke="transparent" strokeWidth="2" />
            {/* animated dots */}
            {Array.from({ length: dotCount }).map((_, i) => {
              const delay = (i / dotCount) * speed;
              const style = {
                offsetPath: `path('M 210 118 C 250 100, 300 100, 350 120')`,
                animationName: "flowDots",
                animationDuration: `${speed}s`,
                animationTimingFunction: "linear",
                animationDelay: `${-delay}s`,
                animationIterationCount: "infinite",
                animationPlayState: running ? "running" : "paused",
              };
              return <circle key={`dot-${i}`} r={4} fill={color} style={style} />;
            })}
          </g>

          {/* mini gauge that pulses with power */}
          <g transform={`translate(${svgWidth - 210},28)`}> 
            <rect x="0" y="0" width="180" height="84" rx="8" fill="#060606" stroke="#222" />
            <text x="12" y="18" fontSize="12" fill="#ffb57a">Instant Power</text>
            <text x="12" y="40" fontSize="18" fill="#fff">{round(instantaneousKW, 4)} kW</text>
            <rect x="12" y="52" width={clamp(instantaneousKW * 20, 4, 156)} height="8" rx="4" fill={color} />
          </g>

          <style>{`
            @keyframes flowDots {
              0% { offset-distance: 0%; opacity: 1; transform: translate(-2px,-2px) scale(0.95); }
              50% { opacity: 0.9; transform: translate(0,0) scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.82); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) { text { font-size: 10px; } }
          `}</style>
        </svg>
      </div>
    </div>
  );
}

/* ============================
   Oscilloscope / charts for consumption
   - Accepts simulated history (array of { t, kWh, dailyCost })
   ============================ */
function ConsumptionOscilloscope({ history = [], running }) {
  // map history to chart-friendly format
  const data = history.slice(-360).map((d, idx) => ({ t: idx, kWh: round(d.kWh, 4), cost: round(d.cost, 2) }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — kWh (left) & Cost (right)</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis yAxisId="left" orientation="left" tick={{ fill: "#888" }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line yAxisId="left" type="monotone" dataKey="kWh" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="kWh" />
            <Line yAxisId="right" type="monotone" dataKey="cost" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Cost (₹)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main page component: Electric Bill Estimator
   ============================ */
export default function ElectricBillEstimatorPage() {
  // header & ui state
  const [userType, setUserType] = useState("residential"); // residential|commercial|industrial
  const [customTariffOpen, setCustomTariffOpen] = useState(false);
  const [monthlyConsumption, setMonthlyConsumption] = useState("250"); // kWh
  const [dailyHours, setDailyHours] = useState("5"); // average hours/day of usage
  const [peakKW, setPeakKW] = useState("1.2"); // kW
  const [peakSplit, setPeakSplit] = useState("0.2"); // fraction of consumption in on-peak
  const [fixedCharge, setFixedCharge] = useState(""); // allows override
  const [meterRent, setMeterRent] = useState("30");
  const [taxPercent, setTaxPercent] = useState("5"); // % taxes
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [history, setHistory] = useState(() => {
    // seed some plausible last 30 days
    const m = Number(monthlyConsumption || 0);
    const daily = m / 30;
    return Array.from({ length: 30 }, (_, i) => ({ t: i + 1, kWh: round(Math.max(0.1, daily * (0.9 + Math.random() * 0.2)), 3), cost: 0 }));
  });

  // build current tariff (from defaults or custom)
  const baseTariff = useMemo(() => {
    const def = TARIFFS[userType] || TARIFFS.residential;
    // allow fixedCharge override if set
    const fixed = fixedCharge === "" ? def.fixedCharge : Number(fixedCharge || 0);
    return { ...def, fixedCharge: fixed };
  }, [userType, fixedCharge]);

  // compute monthly bill breakdown
  const consumption = useMemo(() => (Number.isFinite(Number(monthlyConsumption)) ? Number(monthlyConsumption) : 0), [monthlyConsumption]);
  const { breakdown, subtotal } = useMemo(() => computeBillFromSlabs(consumption, baseTariff.slabs), [consumption, baseTariff.slabs]);
  const fixed = baseTariff.fixedCharge || 0;
  const meter = Number(meterRent || 0);
  const tax = (Number(taxPercent || 0) / 100) * (subtotal + fixed + meter);
  const total = subtotal + fixed + meter + tax;

  // instantaneous power estimate (kW)
  const instantaneousKW = useMemo(() => {
    // crude estimate: monthlyConsumption / (30*dailyHours)
    const h = Math.max(0.1, Number(dailyHours) || 1);
    const daily = consumption / 30;
    const avgKW = daily / h; // kW average
    // bias with peakKW
    const peak = Math.max(0, Number(peakKW) || 0);
    return Math.max(avgKW, peak * 0.6); // show larger of average or a fraction of peak
  }, [consumption, dailyHours, peakKW]);

  // daily consumption used by visualizer (kWh/day)
  const consumptionDaily = useMemo(() => round(consumption / 30, 4), [consumption]);

  // history simulation step
  const tRef = useRef(0);
  useEffect(() => {
    let raf = null;
    let last = performance.now();
    const step = (ts) => {
      raf = requestAnimationFrame(step);
      if (!running) {
        last = ts;
        return;
      }
      const dt = ts - last;
      if (dt < 600) return; // step approx every 600ms (~real-time feel)
      last = ts;
      tRef.current++;
      // simulate next data point by jittering daily consumption and computing per-day cost via same slab logic
      const dailyKWh = consumption / 30;
      const jitter = 0.9 + Math.random() * 0.2;
      const kWh = round(Math.max(0.01, dailyKWh * jitter), 4);
      const { subtotal: subDaily } = computeBillFromSlabs(kWh, baseTariff.slabs);
      // we compute cost per day simply as slab cost (this is approximate; slabs normally apply monthly but this gives a running visualization)
      const dailyCost = round(subDaily + fixed / 30 + meter / 30 + ((taxPercent ? Number(taxPercent) : 0) / 100) * (subDaily + fixed / 30 + meter / 30), 2);

      setHistory((h) => {
        const next = h.slice();
        next.push({ t: next.length + 1, kWh, cost: dailyCost });
        if (next.length > 360) next.shift();
        return next;
      });
    };
    raf = requestAnimationFrame(step);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [running, consumption, baseTariff.slabs, fixed, meter, taxPercent]);

  /* --------------------------
     Actions
     -------------------------- */
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setUserType("residential");
    setMonthlyConsumption("250");
    setDailyHours("5");
    setPeakKW("1.2");
    setPeakSplit("0.2");
    setFixedCharge("");
    setMeterRent("30");
    setTaxPercent("5");
    setHistory(Array.from({ length: 30 }, (_, i) => ({ t: i + 1, kWh: round(250 / 30 * (0.9 + Math.random() * 0.2), 3), cost: 0 })));
    toast("Reset to defaults");
  };

  const exportCSV = () => {
    const rows = [["day", "kWh", "cost"]];
    for (const d of history) rows.push([d.t, d.kWh, d.cost]);
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `electric-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const exportBillCSV = () => {
    const rows = [["description", "value"]];
    rows.push(["Monthly Consumption (kWh)", consumption]);
    breakdown.forEach((b, i) => rows.push([`Slab ${i + 1} (${b.slabFrom}-${b.slabTo || "∞"} kWh)`, `${b.kWh} kWh @ ₹${b.rate} = ₹${round(b.cost, 2)}`]));
    rows.push(["Subtotal (energy)", round(subtotal, 2)]);
    rows.push(["Fixed Charge", round(fixed, 2)]);
    rows.push(["Meter Rent", round(meter, 2)]);
    rows.push([`Tax (${taxPercent}%)`, round(tax, 2)]);
    rows.push(["Total", round(total, 2)]);
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `electric-bill-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported Bill CSV");
  };

  /* --------------------------
     UI rendering
     -------------------------- */
  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
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
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Electricity Bill Estimator</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-40">
                <Select value={userType} onValueChange={(v) => setUserType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="User Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="residential" className="text-white">Residential</SelectItem>
                    <SelectItem value="commercial" className="text-white">Commercial</SelectItem>
                    <SelectItem value="industrial" className="text-white">Industrial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={() => toast.success("Saved preset (demo)")}>Save</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning} title={running ? "Pause" : "Play"}>{running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={resetDefaults}><Settings className="w-5 h-5" /></Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile slide-down */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <Select value={userType} onValueChange={(v) => setUserType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="User Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="residential" className="text-white">Residential</SelectItem>
                    <SelectItem value="commercial" className="text-white">Commercial</SelectItem>
                    <SelectItem value="industrial" className="text-white">Industrial</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={() => toast.success("Saved (demo)")}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16" />

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls column */}
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Electric Bill Estimator</div>
                        <div className="text-xs text-zinc-400">Slab-based • Realtime visualizer</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm hover:border-orange-400">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-xs text-zinc-400">Estimated Monthly Consumption (kWh)</label>
                      <Input value={monthlyConsumption} onChange={(e) => setMonthlyConsumption(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Average daily hours of use</label>
                      <Input value={dailyHours} onChange={(e) => setDailyHours(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Peak kW (approx)</label>
                      <Input value={peakKW} onChange={(e) => setPeakKW(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Meter Rent (₹ / month)</label>
                      <Input value={meterRent} onChange={(e) => setMeterRent(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Tax (%)</label>
                      <Input value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>
                  </div>

                  {/* tariff editor */}
                  <div className="space-y-3">
                    <div className="border border-zinc-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">{baseTariff.label}</Badge>
                          <div className="text-xs text-zinc-400">Slab rates</div>
                        </div>

                        <div className="flex gap-2">
                          <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2" onClick={() => setCustomTariffOpen((s) => !s)}>{customTariffOpen ? "Close" : "Edit"}</Button>
                        </div>
                      </div>

                      <div className="mb-2">
                        {baseTariff.slabs.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 justify-between text-xs text-zinc-300 py-1">
                            <div>{s.upto === null ? `> ${i === 0 ? 0 : baseTariff.slabs[i - 1].upto} kWh` : `1 - ${s.upto} kWh`}</div>
                            <div className="font-semibold text-[#ffd24a]">₹{s.rate}/kWh</div>
                          </div>
                        ))}
                      </div>

                      {customTariffOpen && (
                        <div className="space-y-2 mt-2">
                          <div className="text-xs text-zinc-400">Override Fixed Charge (leave empty to use default ₹{baseTariff.fixedCharge})</div>
                          <Input value={fixedCharge} onChange={(e) => setFixedCharge(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                          <div className="text-xs text-zinc-400">Tip: Edit tariff slab definitions in code or add UI to persist custom tariffs.</div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => toast.success("Saved tariff (demo)")}><Layers className="w-4 h-4 mr-2" /> Save Tariff</Button>
                      <Button variant="ghost" className="border border-zinc-800 text-zinc-300" onClick={() => { setHistory(Array.from({ length: 30 }, (_, i) => ({ t: i + 1, kWh: round((Number(monthlyConsumption || 0) / 30) * (0.9 + Math.random() * 0.2), 3), cost: 0 }))); toast("Re-seeded history"); }}>Reseed</Button>
                    </div>
                  </div>

                  <div className="bg-black/70 border border-orange-500/30 text-white px-3 py-2 rounded-full shadow-sm backdrop-blur-sm text-xs flex flex-wrap gap-2 items-center">
                    <span>
                      Energy: <span className="text-[#ff9a4a] font-semibold">{consumption} kWh</span>
                    </span>
                    <span>•</span>
                    <span>
                      Subtotal: <span className="text-[#ff9a4a] font-semibold">{currency(subtotal)}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2 justify-between mt-2">
                    <div className="flex gap-2">
                      <Button className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportBillCSV}><Download className="w-4 h-4" />Bill</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Visuals + summary */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <BatteryCharging className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated flow • daily estimate • realtime bill</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Type: <span className="text-[#ffd24a] ml-1">{baseTariff.label}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Subtotal: <span className="text-[#ff9a4a] ml-1">{currency(subtotal)}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Total: <span className="text-[#ffd24a] ml-1">{currency(total)}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <ElectricVisualizerSVG consumptionDaily={consumptionDaily} instantaneousKW={instantaneousKW} running={running} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <ConsumptionOscilloscope history={history} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Gauge className="w-5 h-5 " /> Bill Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Energy (kWh)</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{consumption} kWh</div>
                      <div className="text-xs text-zinc-400 mt-1">Monthly consumption</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Subtotal (Energy)</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{currency(subtotal)}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Fixed Charge</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{currency(fixed)}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Meter Rent</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{currency(meter)}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Taxes</div>
                      <div className="text-lg font-semibold text-[#9ee6ff]">{currency(tax)}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Total</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{currency(total)}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb /></span>
                    <span>
                      Tip: Use the daily hours & peak kW to approximate instantaneous load; edit slab definitions to match your local tariff for precise bills.
                    </span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={exportBillCSV}><Download className="w-4 h-4 mr-2" /> Export Bill</Button>
                    <Button variant="ghost" className="border border-zinc-800 text-zinc-300" onClick={() => { navigator.clipboard?.writeText(`Estimated total: ${currency(total)} for ${consumption} kWh/month`); toast.success("Copied summary"); }}>Copy</Button>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-zinc-400 mb-2">Slab Breakdown</div>
                    <div className="grid grid-cols-1 gap-2">
                      {breakdown.map((b, i) => (
                        <div key={i} className="flex items-center justify-between bg-zinc-900/20 border border-zinc-800 p-2 rounded-md">
                          <div className="text-xs text-zinc-300">{b.slabTo ? `${b.slabFrom}-${b.slabTo} kWh` : `> ${b.slabFrom} kWh`}</div>
                          <div className="text-sm font-semibold text-[#ff9a4a]">{b.kWh} kWh — ₹{round(b.cost, 2)}</div>
                        </div>
                      ))}
                    </div>
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
