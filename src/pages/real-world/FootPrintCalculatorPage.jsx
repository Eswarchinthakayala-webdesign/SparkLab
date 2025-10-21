// src/pages/FootPrintCalculatorPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Globe,
  Leaf,
  Truck,
  Home,
  Plane,
  Play,
  Pause,
  Plus,
  Trash2,
  Layers,
  Gauge,
  Download,
  Settings,
  Menu,
  X,
  Lightbulb,
  User,
  Activity,
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

/* ============================
   Emission Factors (baseline estimations)
   - These are illustrative; replace with region-specific factors or API-driven values
   Units:
   - transport: gCO2e per km for car/bus/train
   - electricity: gCO2e per kWh
   - heating: gCO2e per kWh (gas/oil)
   - flight: gCO2e per flight-hour or per km
   - diet: kgCO2e per week per diet type (converted)
   ============================ */
const DEFAULT_FACTORS = {
  car_g_per_km: 180, // gCO2e per km (typical petrol car)
  bus_g_per_km: 80,
  train_g_per_km: 45,
  electricity_g_per_kwh: 475, // varies hugely by grid
  heating_g_per_kwh: 250,
  flight_g_per_km: 120,
  diet_kg_per_week: {
    omnivore: 14, // kgCO2e/week
    vegetarian: 6,
    vegan: 5,
    pescatarian: 8,
  },
};

/* ============================
   Simulation hook for footprint
   - runs in requestAnimationFrame, accumulates history (CO2e/sec or CO2e/hour)
   - activities: array of { id, type, label, unit, value } where value is numeric
   - userType selects presets (commuter, household...)
   ============================ */
function useFootprintSim({
  running,
  timestep = 120,
  activities = [],
  factors = DEFAULT_FACTORS,
  userType = "custom",
}) {
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, co2: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // Sum instantaneous emissions (gCO2e per hour) based on activities.
  const computeInstantTotals = useCallback(
    (activitiesLocal) => {
      // We'll compute instantaneous gCO2e per hour (convert to gCO2e per second for timeline)
      let total_g_per_hour = 0;
      const breakdown = {};

      for (const a of activitiesLocal) {
        // a: { id, type, label, unit, value, factorOverride? }
        const val = Number(a.value) || 0;
        if (a.type === "transport") {
          // expect unit: km/day (user-friendly). We'll convert to km/hr for instantaneous estimate
          // treat "value" as km per day for this UI. Convert: km/day -> km/hour = /24
          const kmPerHour = val / 24;
          const veh = a.subtype || "car"; // car, bus, train
          const gpkm = a.factorOverride ?? (veh === "car" ? factors.car_g_per_km : veh === "bus" ? factors.bus_g_per_km : factors.train_g_per_km);
          const gPerHour = gpkm * kmPerHour;
          breakdown[a.id] = gPerHour;
          total_g_per_hour += gPerHour;
        } else if (a.type === "electricity") {
          // unit: kWh/month (value) -> convert to kWh/hr
          const kwhPerHour = val / (30 * 24);
          const gPerHour = kwhPerHour * (a.factorOverride ?? factors.electricity_g_per_kwh);
          breakdown[a.id] = gPerHour;
          total_g_per_hour += gPerHour;
        } else if (a.type === "heating") {
          // unit: kWh/month
          const kwhPerHour = val / (30 * 24);
          const gPerHour = kwhPerHour * (a.factorOverride ?? factors.heating_g_per_kwh);
          breakdown[a.id] = gPerHour;
          total_g_per_hour += gPerHour;
        } else if (a.type === "flight") {
          // unit: flightHours/year (value) -> flightHours/year -> convert to hours/hour
          // assume value is hours/year, convert to hours/day -> hours/hour immediate small
          // but we'll allow user to specify 'hours/year', then convert to hours/hour = / (365*24)
          const flightHoursPerHour = val / (365 * 24);
          // approximate g per flight-hour (or could use distance)
          const gPerHour = flightHoursPerHour * (a.factorOverride ?? (factors.flight_g_per_km * 800 / 1)); // approximate 800 km/h
          breakdown[a.id] = gPerHour;
          total_g_per_hour += gPerHour;
        } else if (a.type === "diet") {
          // unit: kgCO2e/week (we accept user's direct input or map from preset)
          // We'll treat value as kgCO2e/week -> convert to g/hour
          const kgPerWeek = val;
          const gPerHour = (kgPerWeek * 1000) / (7 * 24);
          breakdown[a.id] = gPerHour;
          total_g_per_hour += gPerHour;
        } else if (a.type === "other") {
          // freeform gCO2e per month value
          const gPerHour = (val * 1000) / (30 * 24); // val in kg/month
          breakdown[a.id] = gPerHour;
          total_g_per_hour += gPerHour;
        }
      }

      // return totals in different units for UI convenience
      const total_g_per_second = total_g_per_hour / 3600;
      const total_kg_per_year = (total_g_per_hour * 24 * 365) / 1000; // approximate
      return { total_g_per_hour, total_g_per_second, total_kg_per_year, breakdown };
    },
    [factors]
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

      const { total_g_per_second } = computeInstantTotals(activities);
      // convert to grams per timestep (approx): total_g_per_second * dt_seconds
      const gramsThisStep = total_g_per_second * (dt / 1000);

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        // We'll store instantaneous rate in g/hour for plotting consistency (convert back)
        const currentGPerHour = (total_g_per_second * 3600);
        next.push({ t: lastT + 1, co2: currentGPerHour, rawSeconds: tSeconds });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeInstantTotals, activities]);

  const lastSnapshot = useMemo(() => {
    if (!history || history.length === 0) return { co2: 0 };
    return history[history.length - 1];
  }, [history]);

  const totalsNow = useMemo(() => computeInstantTotals(activities), [computeInstantTotals, activities]);

  return { history, totalsNow, lastSnapshot };
}

/* ============================
   Visualizer (SVG) for CO2 flow
   - draws city/house/transport icons as sources
   - particles flow into an 'atmosphere' collector whose glow intensity scales with emissions
   - particleCount & speed scale with total emissions
   ============================ */
function FootprintVisualizerSVG({ activities = [], totalsNow = {}, running }) {
  const latest = totalsNow;
  const gPerHour = latest.total_g_per_hour || 0;
  const gPerSecond = latest.total_g_per_second || 0;

  // visual params scale
  const intensity = clamp(gPerHour / 20000, 0, 1.8); // scale to map emission range
  const particleCount = clamp(Math.round(8 + intensity * 80), 6, 160);
  const speed = clamp(1.8 / (intensity + 0.05), 0.2, 3.5);

  // layout constants
  const svgW = 1100;
  const svgH = 320;
  const centerX = svgW - 200;
  const centerY = svgH / 2;

  // create a short readable label for each activity
  const sourceNodes = activities.map((a, i) => {
    const x = 120 + (i % 4) * 160;
    const y = 70 + Math.floor(i / 4) * 90;
    return { ...a, x, y };
  });

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start md:flex-row flex-col justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Carbon Visualizer</div>
            <div className="text-xs text-zinc-400">Live CO₂ flow • per-hour rates • interactive</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">g/h: <span className="text-[#ff9a4a] ml-1">{round(gPerHour, 2)}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">kg/yr: <span className="text-[#ffd24a] ml-1">{round(totalsNow.total_kg_per_year || 0, 2)}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">{running ? "Live" : "Paused"}</Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* atmosphere collector */}
          <defs>
            <radialGradient id="atmGlow" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#ffb86b" stopOpacity={0.9} />
              <stop offset="60%" stopColor="#ff7a2d" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0.0} />
            </radialGradient>
          </defs>

          {/* faint grid */}
          <g opacity="0.04">
            <rect x="0" y="0" width={svgW} height={svgH} fill="#000" />
          </g>

          {/* sources */}
          {sourceNodes.map((s, i) => (
            <g key={`src-${s.id}`} transform={`translate(${s.x},${s.y})`} className="source-block">
              <rect x="-48" y="-30" width="96" height="60" rx="10" fill="#060606" stroke="#222" />
              <text x="-40" y="-8" fontSize="11" fill="#ffd24a">{s.label}</text>
              <text x="-40" y="12" fontSize="10" fill="#fff">{s.type === "transport" ? `${s.value} km/day` : s.type === "electricity" ? `${s.value} kWh/mo` : s.type === "diet" ? `${s.value} kgCO₂e/wk` : `${s.value}`}</text>
              {/* small icon */}
              <g transform="translate(30,0)">
                {s.type === "transport" ? <Truck className="w-5 h-5" /> : s.type === "electricity" ? <Zap className="w-5 h-5" /> : s.type === "diet" ? <Leaf className="w-5 h-5" /> : s.type === "flight" ? <Plane className="w-5 h-5" /> : <Home className="w-5 h-5" />}
              </g>
            </g>
          ))}

          {/* connecting paths + animated particles */}
          {sourceNodes.map((s, i) => {
            const pathStr = `M ${s.x + 20} ${s.y} C ${s.x + 120} ${s.y} ${centerX - 120} ${centerY} ${centerX - 40} ${centerY}`;
            const particleDelay = (i / Math.max(1, sourceNodes.length)) * 0.6;
            const particleColor = "#ff9a4a";
            const localParticleCount = clamp(Math.round(2 + (s.value / 20) * (particleCount / 6)), 2, 24);
            return (
              <g key={`flow-${s.id}`}>
                <path d={pathStr} stroke="#111" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                {Array.from({ length: localParticleCount }).map((_, pi) => {
                  const delay = (pi / localParticleCount) * speed + particleDelay;
                  const style = {
                    offsetPath: `path('${pathStr}')`,
                    animationName: "flowCO2",
                    animationDuration: `${speed}s`,
                    animationTimingFunction: "linear",
                    animationDelay: `${-delay}s`,
                    animationIterationCount: "infinite",
                    animationPlayState: running ? "running" : "paused",
                    transformOrigin: "0 0",
                  };
                  return <circle key={`p-${s.id}-${pi}`} r={3 + Math.min(3, intensity)} fill={particleColor} style={style} />;
                })}
              </g>
            );
          })}

          {/* atmosphere collector on right */}
          <g transform={`translate(${centerX},${centerY})`}>
            <circle r={54 + intensity * 40} fill="url(#atmGlow)" stroke="#2b2b2b" strokeWidth="1.5" />
            <text x="-24" y="-6" fontSize="12" fill="#fff">Atmosphere</text>
            <text x="-24" y="12" fontSize="11" fill="#ffd24a">{round((totalsNow.total_g_per_hour || 0), 1)} g/h</text>
          </g>

          {/* small readout panel */}
          <g transform={`translate(${svgW - 120},14)`}>
            <rect x="-110" y="-14" width="220" height="88" rx="8" fill="#060606" stroke="#222" />
            <text x="-98" y="0" fontSize="12" fill="#ffb57a">Live Readings</text>
            <text x="-98" y="20" fontSize="12" fill="#fff">g/h: <tspan fill="#ff9a4a">{round(totalsNow.total_g_per_hour || 0, 2)}</tspan></text>
            <text x="-98" y="40" fontSize="12" fill="#fff">g/s: <tspan fill="#00ffbf">{round(totalsNow.total_g_per_second || 0, 4)}</tspan></text>
            <text x="-98" y="60" fontSize="12" fill="#fff">kg/yr: <tspan fill="#ffd24a">{round(totalsNow.total_kg_per_year || 0, 2)}</tspan></text>
          </g>

          <style>{`
            @keyframes flowCO2 {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-1px,-1px) scale(0.88); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.82); }
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
   Oscilloscope (CO2 history)
   - last N points plotted, axis styled for dark theme
   ============================ */
function CO2Oscilloscope({ history = [], running }) {
  const data = history.slice(-360).map((d, idx) => ({ t: idx, CO2_gph: round(d.co2, 2) }));
  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — CO₂ (g/h)</div>
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
            <Line type="monotone" dataKey="CO2_gph" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="CO₂ g/h" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Footprint page
   ============================ */
export default function FootPrintCalculatorPage() {
  // UI state
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userType, setUserType] = useState("custom");
  const [factors, setFactors] = useState(DEFAULT_FACTORS);

  // activities schema: id, type, label, unit, value, subtype, factorOverride
  const [activities, setActivities] = useState([
    { id: "a1", type: "transport", subtype: "car", label: "Daily commute", unit: "km/day", value: 30 },
    { id: "a2", type: "electricity", label: "Electricity", unit: "kWh/mo", value: 300 },
    { id: "a3", type: "diet", label: "Diet (omnivore)", unit: "kgCO2e/wk", value: 14 },
  ]);
  

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
  // presets
  const PRESETS = {
    custom: [],
    commuter: [
      { id: "p1", type: "transport", subtype: "car", label: "Daily commute", unit: "km/day", value: 40 },
      { id: "p2", type: "electricity", label: "Electricity", unit: "kWh/mo", value: 220 },
      { id: "p3", type: "diet", label: "Omnivore diet", unit: "kgCO2e/wk", value: 14 },
    ],
    urban_household: [
      { id: "h1", type: "electricity", label: "Electricity", unit: "kWh/mo", value: 350 },
      { id: "h2", type: "heating", label: "Heating", unit: "kWh/mo", value: 400 },
      { id: "h3", type: "diet", label: "Mixed diet", unit: "kgCO2e/wk", value: 12 },
    ],
    business_traveler: [
      { id: "b1", type: "transport", subtype: "train", label: "Local travel", unit: "km/day", value: 20 },
      { id: "b2", type: "flight", label: "Flights", unit: "hrs/year", value: 40 },
      { id: "b3", type: "electricity", label: "Hotel electricity", unit: "kWh/mo", value: 120 },
    ],
    vegetarian: [
      { id: "v1", type: "transport", subtype: "car", label: "Commute", unit: "km/day", value: 20 },
      { id: "v2", type: "electricity", label: "Electricity", unit: "kWh/mo", value: 200 },
      { id: "v3", type: "diet", label: "Vegetarian diet", unit: "kgCO2e/wk", value: 6 },
    ],
  };

  // when userType changes, load preset
  useEffect(() => {
    if (userType === "custom") return;
    const preset = PRESETS[userType] ?? [];
    // assign fresh ids to avoid duplicates
    const mapped = preset.map((p, i) => ({ ...p, id: `${userType}-${i}-${Date.now()}` }));
    setActivities(mapped);
    toast.success(`Loaded preset: ${userType}`);
  }, [userType]);

  // simulation hook
  const { history, totalsNow } = useFootprintSim({ running, activities, factors, timestep: 120, userType });

  // mutators
  const addActivity = (type = "transport") => {
    const id = `a-${Date.now()}`;
    const newAct =
      type === "transport"
        ? { id, type: "transport", subtype: "car", label: "New transport", unit: "km/day", value: 10 }
        : type === "electricity"
        ? { id, type: "electricity", label: "Electricity", unit: "kWh/mo", value: 200 }
        : type === "diet"
        ? { id, type: "diet", label: "Diet", unit: "kgCO2e/wk", value: 8 }
        : { id, type: "other", label: "Other (kg/mo)", unit: "kg/mo", value: 5 };
    setActivities((s) => [...s, newAct]);
  };

  const removeActivity = (id) => setActivities((s) => s.filter((a) => a.id !== id));

  const updateActivity = (id, patch) => setActivities((s) => s.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const toggleRunning = () => {
    setRunning((r) => {
      const next = !r;
      toast(next ? "Simulation resumed" : "Simulation paused");
      return next;
    });
  };

  const resetDefaults = () => {
    setUserType("custom");
    setFactors(DEFAULT_FACTORS);
    setActivities([
      { id: "a1", type: "transport", subtype: "car", label: "Daily commute", unit: "km/day", value: 30 },
      { id: "a2", type: "electricity", label: "Electricity", unit: "kWh/mo", value: 300 },
      { id: "a3", type: "diet", label: "Diet (omnivore)", unit: "kgCO2e/wk", value: 14 },
    ]);
    toast("Reset to defaults");
  };

  const exportCSV = () => {
    const rows = [
      ["t_index", "co2_g_per_hour"],
      ...history.map((d) => [d.t, round(d.co2, 4)]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `footprint-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const snapshot = () => {
    toast.success("Snapshot saved (local preview)");
  };

  const totalKgPerYear = totalsNow.total_kg_per_year ?? 0;
  const gPerHour = totalsNow.total_g_per_hour ?? 0;

  // build per-activity summary for summary panel
  const activityBreakdown = useMemo(() => {
    const br = totalsNow.breakdown || {};
    return activities.map((a) => {
      const gph = br[a.id] ?? 0;
      return { ...a, gph, pct: (gph / (totalsNow.total_g_per_hour || 1)) * 100 };
    });
  }, [activities, totalsNow]);

  return (
    <div
      className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden"
    >
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.36 }}
              className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Carbon Footprint Calculator</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-44">
                <Select value={userType} onValueChange={(v) => setUserType(v)}>
                  <SelectTrigger className="w-full  bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Profile" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="custom"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Custom</SelectItem>
                    <SelectItem value="commuter"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Commuter</SelectItem>
                    <SelectItem value="urban_household"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Urban Household</SelectItem>
                    <SelectItem value="business_traveler"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Business Traveler</SelectItem>
                    <SelectItem value="vegetarian"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Vegetarian</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={snapshotPNG} title="Save Snapshot">Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400" onClick={toggleRunning} title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400" onClick={resetDefaults} title="Reset Defaults">
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

          {/* mobile panel */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="w-36">
                  <Select value={userType} onValueChange={(v) => setUserType(v)}>
                    <SelectTrigger className="w-full  bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Profile" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="custom"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Custom</SelectItem>
                      <SelectItem value="commuter"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Commuter</SelectItem>
                      <SelectItem value="urban_household"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Urban Household</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={snapshotPNG}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16" />

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
                        <div className="text-lg font-semibold text-[#ffd24a]">Footprint: Live Calculator</div>
                        <div className="text-xs text-zinc-400">Add activities, adjust factors, watch live visualization</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-xs text-zinc-400">Profile</label>
                      <div className="mt-1">
                        <Select value={userType} onValueChange={(v) => setUserType(v)}>
                          <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 
               text-white text-sm rounded-md shadow-sm 
               hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                            <SelectValue placeholder="Select profile" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800">
                            <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="custom">Custom</SelectItem>
                            <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="commuter">Commuter</SelectItem>
                            <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="urban_household">Urban Household</SelectItem>
                            <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="business_traveler">Business Traveler</SelectItem>
                            <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="vegetarian">Vegetarian</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Grid Emission Factor (gCO₂/kWh)</label>
                      <Input value={factors.electricity_g_per_kwh} onChange={(e) => setFactors((f) => ({ ...f, electricity_g_per_kwh: Number(e.target.value || 0) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500 mt-1">Adjust for local grid mix.</div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Flight factor (gCO₂/km)</label>
                      <Input value={factors.flight_g_per_km} onChange={(e) => setFactors((f) => ({ ...f, flight_g_per_km: Number(e.target.value || 0) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {activities.map((a, idx) => (
                      <div key={a.id} className="border border-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">{a.type.toUpperCase()}</Badge>
                            <div className="text-xs text-zinc-400">{a.unit}</div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={() => removeActivity(a.id)} className="p-1 border border-zinc-800 bg-red-500 cursor-pointer text-black hover:bg-red-600"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input value={a.label} onChange={(e) => updateActivity(a.id, { label: e.target.value })} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                            {a.type === "transport" && (
                              <Select value={a.subtype || "car"} onValueChange={(v) => updateActivity(a.id, { subtype: v })}>
                                <SelectTrigger className="w-28 cursor-pointer bg-zinc-900/60 border border-zinc-800 text-white">
                                  <SelectValue placeholder="Vehicle" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border border-zinc-800">
                                  <SelectItem     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="car">Car</SelectItem>
                                  <SelectItem     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="bus">Bus</SelectItem>
                                  <SelectItem     className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="train">Train</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Input value={String(a.value)} onChange={(e) => updateActivity(a.id, { value: Number(e.target.value || 0) })} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                            <div className="text-xs text-zinc-400">— {a.unit}</div>
                            <Input value={a.factorOverride ?? ""} onChange={(e) => updateActivity(a.id, { factorOverride: e.target.value === "" ? undefined : Number(e.target.value) })} type="text" placeholder="factor override (optional)" className="bg-black/60 border border-zinc-800 text-white text-xs ml-auto w-36" />
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2">
                      <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => addActivity("transport")}><Plus className="w-4 h-4 mr-2" /> Add Transport</Button>
                      <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => addActivity("electricity")}><Zap className="w-4 h-4 mr-2" /> Add Elec</Button>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => addActivity("diet")} className="flex-1 cursor-pointer">Add Diet</Button>
                      <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-zinc-300" onClick={() => { setActivities([]); toast("Cleared activities"); }}>Clear</Button>
                    </div>
                  </div>

                  <div className="bg-black/70 border border-orange-500/30 text-white px-3 py-2 rounded-full shadow-sm backdrop-blur-sm text-xs flex flex-wrap gap-2 items-center">
                    <span>Est. yearly: <span className="text-[#ff9a4a] font-semibold">{round(totalKgPerYear, 2)} kgCO₂e</span></span>
                    <span>•</span>
                    <span>g/h: <span className="text-[#00ffbf] font-semibold">{round(gPerHour, 2)}</span></span>
                  </div>

                  <div className="flex items-center gap-2 justify-between mt-2">
                    <div className="flex gap-2">
                      <Button className="px-3 py-2 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 cursor-pointer border-zinc-700 text-black" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Visual + charts */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 snapshot border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated flow • per-hour • year estimate</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">kg/yr: <span className="text-[#ffd24a] ml-1">{round(totalKgPerYear, 1)}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">g/h: <span className="text-[#ff9a4a] ml-1">{round(gPerHour, 1)}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">{running ? "Live" : "Paused"}</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <FootprintVisualizerSVG activities={activities} totalsNow={totalsNow} running={running} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <CO2Oscilloscope history={history} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Gauge className="w-5 h-5 " /> Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Est. Yearly</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(totalKgPerYear, 2)} kg</div>
                      <div className="text-xs text-zinc-400 mt-1">Projected</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">g/h (live)</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{round(gPerHour, 2)}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Activities</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{activities.length}</div>
                    </div>
                    <div className="sm:col-span-3 rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Breakdown</div>
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        {activityBreakdown.map((b) => (
                          <div key={`br-${b.id}`} className="flex items-center justify-between">
                            <div className="text-sm text-gray-600">{b.label}</div>
                            <div className="text-sm font-semibold text-orange-300">{round(b.gph, 2)} g/h</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb /></span>
                    <div>
                      <div>Tip: adjust grid factor and activity values to see immediate impact. Try reducing km/day or electricity to see real-time drops in the visualizer.</div>
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
            <Button className="px-3  py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2 cursor-pointer" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
