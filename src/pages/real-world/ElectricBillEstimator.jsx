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
  CircleX,
  SquarePen
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
   - Replace or persist as you wish
   - Each slab: { upto: number|null, rate: number }
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
   computeBillFromSlabs(consumption, slabs)
   returns { breakdown, subtotal }
   where breakdown: [{ slabFrom, slabTo, kWh, rate, cost }]
   ============================ */
function computeBillFromSlabs(consumption, slabs) {
  const breakdown = [];
  let remaining = Math.max(0, Number(consumption) || 0);
  let lower = 0;
  for (const s of slabs) {
    const upto = s.upto;
    if (upto === null) {
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
   misc utils
   ============================ */
function mixHex(a, b, t) {
  const ha = parseInt(a.slice(1), 16);
  const hb = parseInt(b.slice(1), 16);
  const ra = (ha >> 16) & 0xff, ga = (ha >> 8) & 0xff, ba = ha & 0xff;
  const rb = (hb >> 16) & 0xff, gb = (hb >> 8) & 0xff, bb = hb & 0xff;
  const r = Math.round(ra + (rb - ra) * t).toString(16).padStart(2, "0");
  const g = Math.round(ga + (gb - ga) * t).toString(16).padStart(2, "0");
  const b2 = Math.round(ba + (bb - ba) * t).toString(16).padStart(2, "0");
  return `#${r}${g}${b2}`;
}

/* ============================
   ElectricVisualizerSVG
   - Now uses the same slabs/sum/fixed/meter/tax passed from parent
   - Displays identical "Est. Monthly Bill" number as the main calculation
   ============================ */
function ElectricVisualizerSVG({
  consumptionDaily = 0,
  instantaneousKW = 0,
  running = true,
  monthlyConsumption = 0, // kWh/month (for tariff level)
  slabs = [], // tariff slabs (same shape as baseTariff.slabs)
  subtotal = 0, // energy subtotal (used for intermediate display)
  fixed = 0,
  meter = 0,
  tax = 0,
  total = 0,
}) {
  // local animated display for total (smooth rolling)
  const [displayBill, setDisplayBill] = useState(total);

  useEffect(() => {
    let raf = null;
    let start = null;
    const from = displayBill;
    const to = total;
    const duration = 700;
    function step(ts) {
      if (!start) start = ts;
      const t = clamp((ts - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = from + (to - from) * eased;
      setDisplayBill(val);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Visual params
  const abs = Math.max(0, instantaneousKW);
  const dotCount = clamp(Math.round(6 + abs * 8), 6, 40);
  const speed = clamp(1.2 / (abs + 0.01), 0.25, 3.0);

  // determine slab index for monthlyConsumption
  const slabIndex = useMemo(() => {
    let rem = Math.max(0, Number(monthlyConsumption) || 0);
    let lower = 0;
    for (let i = 0; i < slabs.length; i++) {
      const s = slabs[i];
      if (s.upto === null) {
        return i;
      }
      const cap = Math.max(0, s.upto - lower);
      if (rem <= s.upto) {
        return i;
      }
      lower = s.upto;
    }
    return Math.max(0, slabs.length - 1);
  }, [monthlyConsumption, slabs]);

  // palette for visualizer, try to map to slabs length
  const defaultPalette = ["#00d2ff", "#7aff8c", "#ffd24a", "#ff6a9a", "#ff3366"];
  const color = slabs && slabs[slabIndex] && slabs[slabIndex].color ? slabs[slabIndex].color : defaultPalette[slabIndex] || defaultPalette[defaultPalette.length - 1];
  const glowColor = `${color}99`;

  const svgWidth = 980;
  const svgHeight = 300;

  const glowStyle = {
    filter: `drop-shadow(0 0 8px ${glowColor}) drop-shadow(0 0 16px ${glowColor})`,
  };

  return (
    <motion.div
      className="w-full rounded-2xl p-4 bg-gradient-to-b from-black/60 to-zinc-900/10 border border-zinc-800 shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34 }}
    >
      <div className="flex items-start flex-col md:flex-row justify-between gap-3">
        <div className="flex items-center  gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Home className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Consumption Visualizer</div>
            <div className="text-xs text-zinc-400">Realtime meter • flow • monthly estimate</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Daily: <span className="text-[#ffd24a] ml-1">{round(consumptionDaily, 3)} kWh</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Inst: <span className="text-[#00ffbf] ml-1">{round(instantaneousKW, 4)} kW</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-56" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="glass" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#0b0b0b" />
              <stop offset="100%" stopColor="#131313" />
            </linearGradient>
            <linearGradient id="glow" x1="0" x2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.85" />
              <stop offset="100%" stopColor={mixHex(color, "#ffffff", 0.35)} stopOpacity="0.2" />
            </linearGradient>
            <radialGradient id="cityGlow" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor={color} stopOpacity="0.40" />
              <stop offset="60%" stopColor={color} stopOpacity="0.08" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="spark" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feColorMatrix type="matrix" values="1 0 0 0 0   0 0.9 0 0 0   0 0 0.9 0 0  0 0 0 1 0" />
            </filter>
          </defs>

          {/* subtle background grid lines */}
          <g opacity="0.04">
            {Array.from({length:20}).map((_,i)=>{
              const y = 20 + i*22;
              return <line key={i} x1="0" y1={y} x2="1000" y2={y} stroke="#7efcff" strokeWidth="0.3" strokeOpacity={0.04} />;
            })}
          </g>

          {/* City silhouette (background) */}
          <g transform="translate(20,220)" style={{mixBlendMode:"screen"}}>
            <rect x="0" y="-100" width="960" height="220" fill="url(#cityGlow)" opacity={0.9} />
            <g transform="translate(40,30)" style={{transition:"opacity 600ms ease"}}>
              <rect x="0" y="10" width="70" height="70" rx="6" fill="#091018" stroke="#0f1720"/>
              <rect x="85" y="-10" width="48" height="90" rx="4" fill="#081017" stroke="#0f1720"/>
              <rect x="150" y="0" width="100" height="80" rx="4" fill="#071018" stroke="#0f1720"/>
              <rect x="260" y="-20" width="56" height="100" rx="4" fill="#061018" stroke="#0f1720"/>
              <rect x="330" y="8" width="90" height="72" rx="4" fill="#081218" stroke="#0f1720"/>
              <rect x="430" y="-16" width="140" height="110" rx="4" fill="#071018" stroke="#0f1720"/>
              <rect x="590" y="6" width="60" height="74" rx="4" fill="#081218" stroke="#0f1720"/>
              <rect x="670" y="-8" width="120" height="88" rx="6" fill="#061018" stroke="#0f1720"/>
              <rect x="820" y="10" width="90" height="70" rx="6" fill="#071018" stroke="#0f1720"/>
              <g opacity={clamp(instantaneousKW/5, 0.08, 1)}>
                {Array.from({length:16}).map((_,i) => {
                  const x = 8 + (i * 58) % 740;
                  const y = Math.floor(i/6)*20;
                  return <rect key={i} x={x} y={y} width="18" height="8" rx="1" fill={mixHex("#02121a", color, 0.9)} opacity={0.9} />;
                })}
              </g>
            </g>
          </g>

          {/* left: house + meter + flow */}
          <g transform="translate(40,60)">
            {/* House */}
            <g className="house" transform="translate(0,40)">
              <rect x="0" y="50" width="170" height="90" rx="10" fill="#071018" stroke="#122128" />
              <polygon points="0,50 85,10 170,50" fill="#061017" stroke="#122128" />
              <rect x="22" y="83" width="40" height="44" rx="6" fill="#07121a" stroke="#0e1a22" />
              <rect x="110" y="83" width="40" height="44" rx="6" fill="#07121a" stroke="#0e1a22" />
              <text x="6" y="160" fill="#98c7de" fontSize="11">Home</text>
              <ellipse cx="85" cy="36" rx={30 + clamp(instantaneousKW*2, 0, 40)} ry={8 + clamp(instantaneousKW*1.5, 0, 16)} fill={color} opacity="0.06" />
            </g>

            {/* Smart meter box */}
            <g transform="translate(210,85)">
              <rect x="0" y="0" width="140" height="72" rx="10" fill="#071021" stroke="#12313a" />
              <text x="10" y="18" fill="#ffd24a" fontSize="12">Smart Meter</text>
              <text x="10" y="36" fill="#e6fbff" fontSize="18">{round(instantaneousKW,3)} kW</text>
              <g transform="translate(10,44)">
                <rect x="0" y="6" width={clamp(instantaneousKW*22, 4, 120)} height="8" rx="4" fill={color} />
              </g>
            </g>

            {/* flow path (animated dots using SMIL animateMotion fallback) */}
            <g transform="translate(150,40)">
              <path id="flowPath-vis" d="M 120 60 C 180 30, 270 30, 360 60 C 420 82, 500 82, 580 60" fill="none" stroke="transparent" />
              {Array.from({length: dotCount}).map((_, i) => {
                const dur = clamp(3.2 - abs*0.3, 0.9, 4.0);
                const delay = (i / dotCount) * (dur / 2);
                const r = 5;
                return (
                  <g key={i} opacity={running ? 1 : 0}>
                    <circle cx="0" cy="0" r={r} fill={`url(#glow)`} filter="url(#spark)" />
                    <animateMotion
                      dur={`${dur}s`}
                      begin={`${-delay}s`}
                      repeatCount="indefinite"
                      rotate="auto"
                      keyTimes="0;1"
                    >
                      <mpath href="#flowPath-vis" />
                    </animateMotion>
                  </g>
                );
              })}
              <g>
                <circle cx="120" cy="60" r={2.2} fill="#fff7" opacity={0.9}>
                  <animate attributeName="opacity" values="0.6;0.12;0.6" dur="1400ms" repeatCount="indefinite" />
                </circle>
              </g>
            </g>
          </g>

          {/* right: radial gauge and cards */}
          <g transform="translate(680,28)">
            <rect x="0" y="0" width="300" height="200" rx="12" fill="#07121a" stroke="#122b36" />
            <text x="18" y="20" fontSize="12" fill="#bfeeff">Instant Load</text>

            <g transform="translate(150,120)">
              <circle cx="0" cy="0" r="74" fill="#061217" stroke="#0c2b34" strokeWidth="1" />
              <circle cx="0" cy="0" r="64" fill="none" stroke={`url(#glow)`} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(clamp((instantaneousKW/5)*402/100,0,402))} 402`} transform="rotate(-220)" opacity="0.95" filter="url(#softGlow)" />

              <g className="needle" transform={`rotate(${clamp((instantaneousKW/5)*260,0,260) - 130})`}>
                <rect x="-3" y="-6" width="6" height="80" rx="3" fill="#ffd24a" />
                <circle cx="0" cy="76" r="6" fill="#ffd24a" stroke="#000" strokeWidth="1" />
              </g>

              <text x="0" y="0" fill="#e6fbff" fontSize="14" textAnchor="middle" dy="-6">{round(instantaneousKW,2)} kW</text>
              <text x="0" y="20" fill="#9fb4c9" fontSize="12" textAnchor="middle">Load • {Math.round(clamp((instantaneousKW/5)*100,0,100))}%</text>
            </g>

            <g transform="translate(-260,-30)" className="coins">
              <rect x="0" y="0" width="240" height="110" rx="8" fill="#07121a" />
              <text x="12" y="12" fill="#9fe8ff" fontSize="12">Estimated Monthly Bill</text>
              <text x="12" y="42" fill="#fff" fontSize="28" fontWeight="700">₹{round(displayBill,2).toLocaleString()}</text>
              <foreignObject x="156" y="36" width="60" height="36">
                <div style={{display:"flex", gap:8}}>
                  <div className="coin" style={{width:22,height:22,borderRadius:11,background:"linear-gradient(180deg,#ffd24a,#ffb057)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 6px 18px rgba(255,166,38,0.12)"}}>₹</div>
                  <div className="coin" style={{width:16,height:16,borderRadius:8,background:"linear-gradient(180deg,#ffd24a,#ffb057)",display:"flex",alignItems:"center",justifyContent:"center"}}>₹</div>
                </div>
              </foreignObject>
              <text x="12" y="84" fontSize="12" fill="#9fb4c9">Monthly: {round(monthlyConsumption, 2)} kWh • Today: {round(consumptionDaily,3)} kWh</text>
            </g>
          </g>

          <style>{`
            @keyframes flowDots {
              0% { offset-distance: 0%; opacity: 1; transform: scale(0.95); }
              50% { opacity: 0.9; transform: scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: scale(0.82); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) { text { font-size: 10px; } }
          `}</style>
        </svg>
      </div>
    </motion.div>
  );
}

/* ============================
   ConsumptionOscilloscope (unchanged)
   ============================ */
function ConsumptionOscilloscope({ history = [], running }) {
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
    const fixed = fixedCharge === "" ? def.fixedCharge : Number(fixedCharge || 0);
    return { ...def, fixedCharge: fixed };
  }, [userType, fixedCharge]);

  // compute monthly bill breakdown (uses computeBillFromSlabs -> progressive)
  const consumption = useMemo(() => (Number.isFinite(Number(monthlyConsumption)) ? Number(monthlyConsumption) : 0), [monthlyConsumption]);
  const { breakdown, subtotal } = useMemo(() => computeBillFromSlabs(consumption, baseTariff.slabs), [consumption, baseTariff.slabs]);
  const fixed = baseTariff.fixedCharge || 0;
  const meter = Number(meterRent || 0);
  const tax = (Number(taxPercent || 0) / 100) * (subtotal + fixed + meter);
  const total = subtotal + fixed + meter + tax;

  // instantaneous power estimate (kW)
  const instantaneousKW = useMemo(() => {
    const h = Math.max(0.1, Number(dailyHours) || 1);
    const daily = consumption / 30;
    const avgKW = daily / h; // kW average
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
      const dailyKWh = consumption / 30;
      const jitter = 0.9 + Math.random() * 0.2;
      const kWh = round(Math.max(0.01, dailyKWh * jitter), 4);
      const { subtotal: subDaily } = computeBillFromSlabs(kWh, baseTariff.slabs);
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
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
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
                    <SelectItem value="residential"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Residential</SelectItem>
                    <SelectItem value="commercial"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Commercial</SelectItem>
                    <SelectItem value="industrial"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Industrial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={snapshotPNG}>Save</Button>
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
                    <SelectItem value="residential"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Residential</SelectItem>
                    <SelectItem value="commercial"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Commercial</SelectItem>
                    <SelectItem value="industrial"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Industrial</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={snapshotPNG}>Save</Button>
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
                          <Button variant="ghost" className="border  border-zinc-800 text-orange-400 cursor-pointer hover:bg-black/10 hover:text-orange-500 p-2" onClick={() => setCustomTariffOpen((s) => !s)}>{customTariffOpen ? <CircleX/> :<SquarePen/> }</Button>
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
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300" onClick={() => { setHistory(Array.from({ length: 30 }, (_, i) => ({ t: i + 1, kWh: round((Number(monthlyConsumption || 0) / 30) * (0.9 + Math.random() * 0.2), 3), cost: 0 }))); toast("Re-seeded history"); }}>Reseed</Button>
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
              <Card className="bg-black/70 border snapshot border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
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
                  <ElectricVisualizerSVG
                    consumptionDaily={consumptionDaily}
                    instantaneousKW={instantaneousKW}
                    running={running}
                    monthlyConsumption={consumption}
                    slabs={baseTariff.slabs}
                    subtotal={subtotal}
                    fixed={fixed}
                    meter={meter}
                    tax={tax}
                    total={total}
                  />
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
                    <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={exportBillCSV}><Download className="w-4 h-4 mr-2" /> Export Bill</Button>
                    <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300" onClick={() => { navigator.clipboard?.writeText(`Estimated total: ${currency(total)} for ${consumption} kWh/month`); toast.success("Copied summary"); }}>Copy</Button>
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
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 cursor-pointer text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
