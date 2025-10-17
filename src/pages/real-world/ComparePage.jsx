// src/pages/ComparePage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Activity,
  CircuitBoard,
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
  Cpu,
  Users,
  Sun,
  Wind,
  Snowflake,
  Bolt,
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
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";

/* ============================
   Utilities
   ============================ */
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return Number.isFinite(v) ? +v : NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nowSec = () => performance.now() / 1000;

/* ============================
   Appliance definitions (base data)
   - ratedPower (W) typical
   - category: lighting / fan / ac / heater
   - description used in UI
   ============================ */
const BASE_APPLIANCES = [
  {
    id: "led_bulb",
    name: "LED Bulb",
    ratedW: 10,
    category: "lighting",
    icon: Sun,
    desc: "Energy efficient LED lamp.",
  },
  {
    id: "cfl_bulb",
    name: "CFL Bulb",
    ratedW: 14,
    category: "lighting",
    icon: Sun,
    desc: "Compact fluorescent lamp (warm-up behavior).",
  },
  {
    id: "ceiling_fan",
    name: "Ceiling Fan",
    ratedW: 75,
    category: "fan",
    icon: Wind,
    desc: "Standard ceiling fan with speed control.",
  },
  {
    id: "table_fan",
    name: "Table Fan",
    ratedW: 45,
    category: "fan",
    icon: Wind,
    desc: "Small table fan.",
  },
  {
    id: "ac_split",
    name: "AC (1.5 Ton, Split)",
    ratedW: 1500,
    category: "ac",
    icon: Snowflake,
    desc: "AC with compressor (high startup inrush).",
  },
  {
    id: "space_heater",
    name: "Space Heater",
    ratedW: 1200,
    category: "heater",
    icon: Bolt,
    desc: "Resistive heater — essentially linear with setting.",
  },
];

/* ============================
   Appliance behavior model
   - simple but realistic per-device models:
     * steady-state power = ratedW * (setting%/100) * efficiencyFactor
     * fans approximate linear scaling with speed
     * AC has higher startup inrush and cycling behavior
     * CFL has warm-up transient (slower to reach rated)
   - units: W, A (calculated from V)
   ============================ */
function computeApplianceInstant({
  base,
  setting = 100, // percent
  count = 1,
  ambientTemp = 25,
  mainsV = 230,
  t, // seconds since sim start
  lastState = {},
}) {
  // base: { id, ratedW, category }
  const s = clamp(Number(setting) / 100, 0, 1);
  const n = Math.max(1, Math.floor(Number(count) || 0 || 1));

  const rated = Number(base.ratedW) || 0;
  let eff = 1.0;
  let P = 0; // power (W)

  if (base.category === "lighting") {
    // LED: near instantaneous; CFL: warm-up (exponential ramp)
    if (base.id === "cfl_bulb") {
      const tau = 12; // seconds to warm
      const ramp = 1 - Math.exp(-Math.max(0, t) / tau);
      P = rated * s * (0.9 + 0.2 * ramp); // slight change on warm
    } else {
      P = rated * s;
    }
    eff = base.id === "led_bulb" ? 0.9 : 0.75;
  } else if (base.category === "fan") {
    // fans roughly scale with cube of speed for aerodynamic load, but electrical motors often near linear at low speeds.
    // We simulate a soft cubic-ish relation for realism:
    const cubic = Math.pow(Math.max(0.05, s), 2.4);
    P = rated * cubic;
    eff = 0.85;
  } else if (base.category === "ac") {
    // AC behaviour: startup inrush then cycling.
    // model compressor start transient: if recently turned on, inrush factor for a few seconds.
    const inrush = lastState && lastState.turnedOnAt ? Math.max(0, 6 - (t - lastState.turnedOnAt)) : 0;
    const inrushFactor = 1 + Math.min(6, inrush) * 1.8; // large spike initially
    // cycling: we'll simulate simple duty cycle (compressor cycles based on setting/ambient)
    const duty = clamp(s * 0.6 + 0.3, 0.35, 1);
    P = rated * duty * s * (1 + (inrush > 0 ? inrushFactor : 0));
    eff = 0.32; // typical SEER -> low electrical efficiency (compressor heavy)
  } else if (base.category === "heater") {
    P = rated * s;
    eff = 0.98;
  } else {
    P = rated * s;
    eff = 0.8;
  }

  // adjust slightly for ambient temp (AC uses more at higher ambient)
  if (base.category === "ac") {
    const delta = Math.max(0, ambientTemp - 24);
    P *= 1 + delta * 0.02; // 2% higher per degC
  }

  // total for count
  const Ptot = P * n;
  const I = mainsV > 0 ? Ptot / mainsV : 0;

  return {
    P: Ptot,
    I,
    eff,
    display: {
      perUnitW: P,
      totalW: Ptot,
      currentA: I,
    },
  };
}

/* ============================
   Simulation hook for appliances
   - uses requestAnimationFrame to sample ~12-60Hz depending on timestep
   - returns history array with timestamps and per-appliance data
   - supports manual overrides (e.g., force current)
   ============================ */
function useApplianceSim({
  running,
  timestep = 80,
  mainsV = 230,
  ambientTemp = 25,
  appliances = [],
}) {
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, totalP: 0, totalI: 0, items: [] })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const startRef = useRef(nowSec());
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);
  const lastStatesRef = useRef({}); // track turnedOnAt per appliance

  useEffect(() => {
    let alive = true;
    lastRef.current = performance.now();
    startRef.current = nowSec();
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
      const tSeconds = (nowSec() - startRef.current);

      // compute per appliance
      const items = appliances.map((ap) => {
        const lastState = lastStatesRef.current[ap.instanceId] || {};
        // mark turnedOnAt if on and not recorded
        if (ap.enabled && (!lastState.turnedOnAt || lastState.lastEnabled !== ap.enabled)) {
          lastStatesRef.current[ap.instanceId] = { ...(lastState || {}), turnedOnAt: tSeconds, lastEnabled: ap.enabled };
        } else if (!ap.enabled) {
          lastStatesRef.current[ap.instanceId] = { ...(lastState || {}), lastEnabled: ap.enabled };
        }
        const inst = computeApplianceInstant({
          base: ap.base,
          setting: ap.setting,
          count: ap.count,
          ambientTemp,
          mainsV,
          t: tSeconds,
          lastState: lastStatesRef.current[ap.instanceId],
        });
        return {
          instanceId: ap.instanceId,
          id: ap.base.id,
          name: ap.base.name,
          P: inst.P,
          I: inst.I,
          eff: inst.eff,
          setting: ap.setting,
          count: ap.count,
          category: ap.base.category,
        };
      });

      const totalP = items.reduce((s, it) => s + (Number.isFinite(it.P) ? it.P : 0), 0);
      const totalI = items.reduce((s, it) => s + (Number.isFinite(it.I) ? it.I : 0), 0);

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, totalP, totalI, items, ts: Date.now() });
        if (next.length > 1200) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, appliances, mainsV, ambientTemp]);

  return { history };
}

/* ============================
   VisualizerSVG for appliances
   - renders mains bus, appliances as stylized blocks/icons
   - dot flow animation based on total current (bigger current => more/ faster dots)
   - interactive hover shows per-appliance tooltip (simple)
   ============================ */
function VisualizerSVG({ mainsV = 230, history = [], running = true, appliances = [] }) {
  const latest = history.length ? history[history.length - 1] : { totalP: 0, totalI: 0, items: [] };
  const totalI = latest.totalI || 0;
  const totalP = latest.totalP || 0;

  const absI = Math.abs(totalI);
  const dotCount = clamp(Math.round(4 + absI * 6), 3, 40);
  const speed = clamp(1.6 / (absI + 0.02), 0.2, 5);
  const svgWidth = Math.max(900, 180 + appliances.length * 180);
  const busY = 80;
  const startX = 120;
  const spacing = 160;

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start md:flex-row flex-col justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Appliance Compare Visualizer</div>
            <div className="text-xs text-zinc-400">Real-time power flow • current meters • oscilloscope</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V<sub>mains</sub>: <span className="text-[#ffd24a] ml-1">{mainsV} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I (total): <span className="text-[#00ffbf] ml-1">{round(totalI, 6)} A</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">P (total): <span className="text-[#ff9a4a] ml-1">{round(totalP, 3)} W</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} 220`} preserveAspectRatio="xMidYMid meet" className="w-full h-52">
          {/* mains supply block */}
          <g transform={`translate(48,${busY})`}>
            <rect x="-36" y="-28" width="72" height="56" rx="8" fill="#FFA500" stroke="#222" />
            <text x="-50" y="-42" fontSize="12" fill="#ffd24a">{mainsV} V</text>
            <text x="-50" y="36" fontSize="10" fill="#9aa">Mains</text>
          </g>

          {/* bus */}
          <path d={`M ${96} ${busY} H ${svgWidth - 80}`} stroke="#111" strokeWidth="8" strokeLinecap="round" />

          {/* appliances */}
          {appliances.map((ap, i) => {
            const x = startX + i * spacing;
            const inst = latest.items ? latest.items.find((it) => it.instanceId === ap.instanceId) : null;
            const P = inst ? inst.P : 0;
            const I = inst ? inst.I : 0;
            // color by category
            const fill = ap.base.category === "lighting" ? "#ffb86b" : ap.base.category === "fan" ? "#7ef0ff" : ap.base.category === "ac" ? "#ff6a9a" : "#ffd24a";
            const small = Math.min(1, Math.max(0.05, Math.abs(I) / 6));
            const dotColor = "#ffd24a";

            return (
              <g key={ap.instanceId}>
                {/* branch */}
                <path d={`M ${x} ${busY} V ${busY + 46}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

                {/* appliance box */}
                <g transform={`translate(${x},${busY + 46})`}>
               <rect width="68" height="52" rx="10" fill={fill} opacity={0.98} />
                          <text x="4" y="10" fontSize="10" fill="#0b0b0b" fontWeight={700}>{ap.base.name}</text>
                          <text x="4" y="36" fontSize="13" fill="#0b0b0b" fontWeight={800}>{Math.round(P)} W</text>
                          <text x="4" y="48" fontSize="9" fill="#0b0b0b" opacity={0.7}>{ap.setting}% × {ap.count}</text>
                </g>

                {/* animated flow dots along branch */}
                {Array.from({ length: dotCount }).map((_, di) => {
                  const pathStr = `M ${x} ${busY - 10} V ${busY + 46} H ${x + 22}`;
                  const delay = (di / dotCount) * speed;
                  const style = {
                    offsetPath: `path('${pathStr}')`,
                    animationName: "flowAp",
                    animationDuration: `${speed}s`,
                    animationTimingFunction: "linear",
                    animationDelay: `${-delay}s`,
                    animationIterationCount: "infinite",
                    animationPlayState: running ? "running" : "paused",
                    transformOrigin: "0 0",
                  };
                  return <circle key={`adot-${i}-${di}`} r={3 + small * 3} fill={dotColor} style={style} />;
                })}
              </g>
            );
          })}

          {/* readout */}
          <g transform={`translate(${svgWidth - 160},18)`}>
            <rect x="-84" y="-16" width="168" height="120" rx="10" fill="#060606" stroke="#222" />
            <text x="-70" y="-0" fontSize="12" fill="#ffb57a">Live Summary</text>

            <text x="-70" y="22" fontSize="12" fill="#fff">Total P: <tspan fill="#ff9a4a">{round(totalP, 3)} W</tspan></text>
            <text x="-70" y="44" fontSize="12" fill="#fff">Total I: <tspan fill="#00ffbf">{round(totalI, 6)} A</tspan></text>
            <text x="-70" y="66" fontSize="12" fill="#fff">Snapshots: <tspan fill="#ffd24a">Live</tspan></text>
          </g>

          <style>{`
            @keyframes flowAp {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.92; transform: translate(0,0) scale(1.03); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.85); }
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
   MultiOscilloscope for ComparePage
   - plots: total power, per-appliance traces, energy accumulation
   ============================ */
function MultiOscilloscope({ history = [], appliances = [], running }) {
  // build data for last N points
  const slice = history.slice(-360);
  const data = slice.map((d, idx) => {
    const obj = { t: idx, totalP: round(d.totalP, 3), totalI: round(d.totalI, 4), ts: d.ts };
    // per appliance short names: use id_index
    d.items.forEach((it) => {
      obj[it.instanceId] = round(it.P, 3);
    });
    // cumulative energy (Wh) approx: integrate using simple trapezoid with 1-second steps (coarse)
    // We'll compute incremental energy across history in a simplified way
    return obj;
  });

  // derive a palette for up to N traces
  const palette = ["#ffd24a", "#00ffbf", "#ff9a4a", "#7ef0ff", "#ff6a9a", "#ffd77a", "#9ee6ff"];

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Live Plot — Total Power & Appliances</div>
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
            <Line type="monotone" dataKey="totalP" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Total Power (W)" />
            {appliances.slice(0, 6).map((ap, i) => (
              <Line key={ap.instanceId} type="monotone" dataKey={ap.instanceId} stroke={palette[i % palette.length]} strokeWidth={1.6} dot={false} isAnimationActive={false} name={`${ap.base.name}`} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-md bg-zinc-900/40 border border-zinc-800">
          <div className="text-xs text-zinc-400">Last Sample (Total)</div>
          <div className="text-lg font-semibold text-[#ff9a4a]">{history.length ? `${round(history[history.length - 1].totalP, 3)} W` : "—"}</div>
        </div>
        <div className="p-3 rounded-md bg-zinc-900/40 border border-zinc-800">
          <div className="text-xs text-zinc-400">Total Current</div>
          <div className="text-lg font-semibold text-[#00ffbf]">{history.length ? `${round(history[history.length - 1].totalI, 4)} A` : "—"}</div>
        </div>
        <div className="p-3 rounded-md bg-zinc-900/40 border border-zinc-800">
          <div className="text-xs text-zinc-400">Samples</div>
          <div className="text-lg font-semibold text-[#ffd24a]">{history.length}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================
   Main ComparePage
   ============================ */
export default function ComparePage() {
  // UI state
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mainsV, setMainsV] = useState("230");
  const [ambient, setAmbient] = useState("25");
  const [timestep, setTimestep] = useState(80);
  const [currencyPerKwh, setCurrencyPerKwh] = useState("8.5"); // local currency per kWh as example
  // appliance instances (user can add multiple)
  const [instances, setInstances] = useState(() =>
    // default: compare LED vs CFL vs ceiling fan
    [
      { instanceId: "ap-1", base: BASE_APPLIANCES.find((b) => b.id === "led_bulb"), setting: 100, count: 4, enabled: true },
      { instanceId: "ap-2", base: BASE_APPLIANCES.find((b) => b.id === "cfl_bulb"), setting: 100, count: 2, enabled: true },
      { instanceId: "ap-3", base: BASE_APPLIANCES.find((b) => b.id === "ceiling_fan"), setting: 70, count: 1, enabled: true },
    ]
  );

  // simulation hook
  const { history } = useApplianceSim({
    running,
    timestep,
    mainsV: Number(mainsV) || 230,
    ambientTemp: Number(ambient) || 25,
    appliances: instances,
  });

  // actions
  const addInstance = (baseId) => {
    const base = BASE_APPLIANCES.find((b) => b.id === baseId) || BASE_APPLIANCES[0];
    setInstances((s) => [...s, { instanceId: `ap-${Date.now()}`, base, setting: 100, count: 1, enabled: true }]);
    toast.success("Added appliance");
  };

  const removeInstance = (id) => {
    setInstances((s) => s.filter((it) => it.instanceId !== id));
    toast("Removed appliance");
  };

  const updateInstance = (id, patch) => {
    setInstances((s) => s.map((it) => (it.instanceId === id ? { ...it, ...patch } : it)));
  };

  const resetAll = () => {
    setInstances([
      { instanceId: "ap-1", base: BASE_APPLIANCES.find((b) => b.id === "led_bulb"), setting: 100, count: 4, enabled: true },
      { instanceId: "ap-2", base: BASE_APPLIANCES.find((b) => b.id === "cfl_bulb"), setting: 100, count: 2, enabled: true },
      { instanceId: "ap-3", base: BASE_APPLIANCES.find((b) => b.id === "ceiling_fan"), setting: 70, count: 1, enabled: true },
    ]);
    toast.success("Reset to recommended comparison");
  };

  const exportCSV = () => {
    const rows = [
      ["t", "timestamp", "totalP", "totalI", ...instances.map((it) => `${it.base.name}_P`)],
      ...history.map((d) => {
        const row = [d.t, d.ts, d.totalP, d.totalI];
        const map = {};
        d.items.forEach((it) => (map[it.instanceId] = it.P));
        instances.forEach((it) => row.push(map[it.instanceId] || 0));
        return row;
      }),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appliance-compare-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  // compute totals & simple cost estimate for last minute
  const lastSample = history.length ? history[history.length - 1] : null;
  const totalW = lastSample ? lastSample.totalP : 0;
  const estimateKW = totalW / 1000;
  const costPerHour = estimateKW * Number(currencyPerKwh || 0); // currency per hour
  const costPerDay = costPerHour * 24;

  return (
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.22)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
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
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Compare Appliances • Real-time</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-32">
                <Input value={mainsV} onChange={(e) => setMainsV(e.target.value)} className="bg-black/80 border border-zinc-800 text-white text-sm" placeholder="Mains V" />
              </div>
              <div className="w-24">
                <Input value={ambient} onChange={(e) => setAmbient(e.target.value)} className="bg-black/80 border border-zinc-800 text-white text-sm" placeholder="Ambient°C" />
              </div>

              <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={() => toast("Snapshot saved")}>Snapshot</Button>
              <Button variant="ghost" className="border border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={() => setRunning((r) => !r)}>{running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</Button>

              <Button variant="ghost" className="border border-zinc-700 text-zinc-300 p-2 rounded-lg" onClick={resetAll}><Settings className="w-5 h-5" /></Button>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex gap-2">
                <Input value={mainsV} onChange={(e) => setMainsV(e.target.value)} className="bg-black/80 border border-zinc-800 text-white text-sm" placeholder="Mains V" />
                <Input value={ambient} onChange={(e) => setAmbient(e.target.value)} className="bg-black/80 border border-zinc-800 text-white text-sm" placeholder="Ambient°C" />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Run"}</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={resetAll}>Reset</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left controls */}
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Compare Appliances</div>
                        <div className="text-xs text-zinc-400">Add devices, tune settings, compare realtime</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-400">Mains Voltage (V)</label>
                    <Input value={mainsV} onChange={(e) => setMainsV(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Ambient Temperature (°C)</label>
                    <Input value={ambient} onChange={(e) => setAmbient(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Electricity Price (per kWh)</label>
                    <Input value={currencyPerKwh} onChange={(e) => setCurrencyPerKwh(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    <div className="text-xs text-zinc-500 mt-1">Used to estimate running cost.</div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-zinc-400">Add Appliance</div>
                    <div className="flex gap-2 flex-wrap">
                      {BASE_APPLIANCES.map((b) => (
                        <Button key={b.id} className="bg-transparent border border-zinc-800 hover:bg-orange-400/50 cursor-pointer text-zinc-200 text-xs px-3 py-1 rounded-md" onClick={() => addInstance(b.id)}>
                          <div className="flex items-center gap-2"><b className="text-orange-300">+</b> {b.name}</div>
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="text-xs text-zinc-400 mb-2">Instances</div>
                    <div className="space-y-2">
                      {instances.map((it) => (
                        <div key={it.instanceId} className="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-[#ffd24a] truncate">{it.base.name}</div>
                                <div className="text-xs text-zinc-400 truncate">×{it.count}</div>
                              </div>
                              <div className="text-xs text-zinc-400">{it.base.desc}</div>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" className="p-1 border bg-red-500 cursor-pointer hover:bg-red-600 border-zinc-800" onClick={() => removeInstance(it.instanceId)}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-zinc-400">Setting (%)</label>
                              <Input value={it.setting} onChange={(e) => updateInstance(it.instanceId, { setting: clamp(Number(e.target.value), 0, 100) })} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400">Count</label>
                              <Input value={it.count} onChange={(e) => updateInstance(it.instanceId, { count: clamp(Number(e.target.value) || 1, 1, 100) })} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                            </div>
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">{it.base.category.toUpperCase()}</Badge>
                            <div className="ml-auto text-xs text-zinc-400">Enabled</div>
                            <Select value={it.enabled ? "on" : "off"} onValueChange={(v) => updateInstance(it.instanceId, { enabled: v === "on" })}>
                              <SelectTrigger className="w-24 cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                                <SelectValue placeholder="Enable" />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                                <SelectItem value="on"    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">On</SelectItem>
                                <SelectItem value="off"    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Off</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1  bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                    <Button variant="outline" className="flex-1 cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button variant="ghost" className="flex-1 bg-white cursor-pointer border border-zinc-800" onClick={exportCSV}><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
                    <Button variant="ghost" className="flex-1 bg-white cursor-pointer border border-zinc-800" onClick={() => { setInstances([]); toast("Cleared instances"); }}>Clear</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right: Visualizer + Oscilloscope */}
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated power flow • realistic startup & duty cycles</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mains: <span className="text-[#ffd24a] ml-1">{mainsV} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Running: <span className="text-[#00ffbf] ml-1">{running ? "Yes" : "No"}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Instances: <span className="text-[#ffd24a] ml-1">{instances.length}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <VisualizerSVG mainsV={Number(mainsV)} history={history} running={running} appliances={instances} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <MultiOscilloscope history={history} appliances={instances} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Gauge className="w-5 h-5" /> Summary & Cost
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Instant Total</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(totalW, 2)} W</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Est. Cost/hr</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{round(costPerHour, 2)} /hr</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Est. Cost/day</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{round(costPerDay, 2)} /day</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs text-zinc-400 mb-2">Breakdown</div>
                    <div className="space-y-2">
                      {instances.map((it) => {
                        const last = history.length ? (history[history.length - 1].items.find((x) => x.instanceId === it.instanceId) || {}) : {};
                        return (
                          <div key={it.instanceId} className="p-2 rounded-md bg-zinc-900/20 border border-zinc-800 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-[#ffd24a] truncate">{it.base.name} ×{it.count}</div>
                              <div className="text-xs text-zinc-400">{it.setting}% • {round(last.P || 0, 2)} W</div>
                            </div>
                            <div className="text-xs text-zinc-400">{round(((last.P || 0) / (totalW || 1)) * 100, 1)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb /></span>
                    <span>
                      Tip: Increase/decrease device <span className="text-white font-semibold">setting</span> to see live power & cost changes. AC shows startup spikes; fans scale nonlinearly.
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile sticky */}
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
