// src/pages/CapacitanceInductanceCalculator.jsx
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

/* ============================
   Utilities
   ============================ */
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================
   Simulation hook
   - Step-response simulation used for UI/animation
   ============================ */
function useComponentSim({
  running,
  timestep = 80,
  compType = "capacitor",
  groups = [{ type: "series", values: [10] }],
  Vsup = 12,
  seriesResistance = 10,
}) {
  const historyRef = useRef(Array.from({ length: 160 }, (_, i) => ({ t: i, P: 0, V: 0, I: 0, E: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // compute equivalent for groups
  const computeEquivalent = useCallback(
    (groupsLocal) => {
      if (!groupsLocal || groupsLocal.length === 0) return { totalReq: 0, groupReqs: [] };

      const toSI = (val) => (compType === "capacitor" ? val * 1e-6 : val * 1e-3);

      const groupReqs = groupsLocal.map((g) => {
        const vals = g.values.map((v) => (Number.isFinite(v) && v > 0 ? toSI(v) : NaN));
        if (compType === "capacitor") {
          if (g.type === "series") {
            // series capacitors -> 1/Ceq = sum(1/Ci)
            let denom = 0;
            vals.forEach((c) => {
              if (Number.isFinite(c) && c > 0) denom += 1 / c;
            });
            const Ceq = denom > 0 ? 1 / denom : 0;
            return { Req: Ceq, vals };
          } else {
            // parallel capacitors -> sum Ci
            const Ceq = vals.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
            return { Req: Ceq, vals };
          }
        } else {
          if (g.type === "series") {
            // inductors in series -> sum
            const Leq = vals.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
            return { Req: Leq, vals };
          } else {
            // inductors in parallel -> 1/Leq = sum(1/Li)
            let denom = 0;
            vals.forEach((L) => {
              if (Number.isFinite(L) && L > 0) denom += 1 / L;
            });
            const Leq = denom > 0 ? 1 / denom : 0;
            return { Req: Leq, vals };
          }
        }
      });

      // combine groupReqs (groups are treated as parallel branches)
      let totalReq = 0;
      if (compType === "capacitor") {
        totalReq = groupReqs.reduce((a, b) => a + (Number.isFinite(b.Req) ? b.Req : 0), 0);
      } else {
        let denom = 0;
        groupReqs.forEach((g) => {
          if (Number.isFinite(g.Req) && g.Req > 0) denom += 1 / g.Req;
        });
        totalReq = denom > 0 ? 1 / denom : 0;
      }

      return { totalReq, groupReqs };
    },
    [compType]
  );

  const computeInstant = useCallback(
    (tSeconds, totalReq) => {
      const R = Math.max(1e-6, seriesResistance);
      if (!Number.isFinite(totalReq) || totalReq <= 0) return { Vt: 0, It: 0, Pt: 0, energy: 0 };

      if (compType === "capacitor") {
        const C = totalReq;
        const tau = clamp(R * C, 1e-6, 1e6);
        const Vt = Vsup * (1 - Math.exp(-tSeconds / tau));
        const dVdt = (Vsup / tau) * Math.exp(-tSeconds / tau);
        const It = C * dVdt;
        const Pt = Vt * It;
        const energy = 0.5 * C * Vt * Vt;
        return { Vt, It, Pt, energy };
      } else {
        const L = totalReq;
        const tauL = clamp(L / R, 1e-6, 1e6);
        const Iinf = Vsup / R;
        const It = Iinf * (1 - Math.exp(-tSeconds / tauL));
        const dIdt = (Iinf / tauL) * Math.exp(-tSeconds / tauL);
        const Vl = L * dIdt;
        const Pt = Vl * It;
        const energy = 0.5 * L * It * It;
        return { Vt: Vl, It, Pt, energy };
      }
    },
    [compType, Vsup, seriesResistance]
  );

  const eq = useMemo(() => computeEquivalent(groups), [groups, computeEquivalent]);

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

      const totalReq = eq.totalReq;
      const { Vt, It, Pt, energy } = computeInstant(tSeconds, totalReq);

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, P: Pt, V: Vt, I: It, E: energy });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeInstant, eq.totalReq]);

  return { history, eq };
}

/* ============================
   Visualizer SVG
   - Responsive spacing, prevents overlap, better animations
   - All colors moved to orange/dark theme (no sky-blue)
   ============================ */
function VisualizerSVG({ compType, groups = [], Vsup, history = [], running, manualI }) {
  const latest = history.length ? history[history.length - 1] : { P: 0, V: 0, I: 0, E: 0 };
  // effective current: use manualI if provided, otherwise simulated latest.I
  const ItSim = latest.I || 0;
  const ItUsed = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : ItSim;
  const Pt = latest.P || 0;
  const Et = latest.E || 0;

  // dot animation parameters scale with current magnitude (use ItUsed)
  const absI = Math.abs(ItUsed);
  const dotCount = clamp(Math.round(2 + absI * 8), 2, 18);
  const speed = clamp(1.6 / (absI + 0.01), 0.28, 4.5); // seconds per cycle

  // responsive spacing
  const groupCount = Math.max(1, groups.length);
  const spacing = Math.max(110, Math.min(240, Math.floor(520 / Math.max(1, Math.min(groupCount, 6)))));
  const startX = 160;
  const svgWidth = Math.max(900, startX + spacing * groupCount + 160);
  const busStart = 100;
  const busEnd = svgWidth - 80;

  const formatGroupReq = (grp) => {
    if (!grp || !grp.values) return "--";
    if (compType === "capacitor") {
      if (grp.type === "series") {
        let denom = 0;
        grp.values.forEach((v) => {
          if (Number.isFinite(v) && v > 0) denom += 1 / (v * 1e-6);
        });
        const CeqF = denom > 0 ? 1 / denom : 0;
        return `${round(CeqF * 1e6, 4)} μF`;
      } else {
        const CeqF = grp.values.reduce((a, b) => a + (Number.isFinite(b) ? b * 1e-6 : 0), 0);
        return `${round(CeqF * 1e6, 4)} μF`;
      }
    } else {
      if (grp.type === "series") {
        const Leq = grp.values.reduce((a, b) => a + (Number.isFinite(b) ? b * 1e-3 : 0), 0);
        return `${round(Leq * 1e3, 4)} mH`;
      } else {
        let denom = 0;
        grp.values.forEach((v) => {
          if (Number.isFinite(v) && v > 0) denom += 1 / (v * 1e-3);
        });
        const Leq = denom > 0 ? 1 / denom : 0;
        return `${round(Leq * 1e3, 4)} mH`;
      }
    }
  };

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">
              {compType === "capacitor" ? "Capacitance" : "Inductance"} Visualizer
            </div>
            <div className="text-xs text-zinc-400">Live animation • meters • oscilloscope</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V<sub>sup</sub>: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I<sub>used</sub>: <span className="text-[#00ffbf] ml-1">{round(ItUsed, 9)} A</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">P (last): <span className="text-[#ff9a4a] ml-1">{round(Pt, 6)} W</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} 320`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* supply */}
          <g transform={`translate(${busStart - 60},160)`}>
            <rect x="-22" y="-36" width="44" height="72" rx="6" fill="#060606" stroke="#222" />
            <text x="-36" y="-46" fontSize="12" fill="#ffd24a">{Vsup} V</text>
          </g>

          {/* bus */}
          <path d={`M ${busStart} 160 H ${busEnd}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* groups placed across bus */}
          {groups.map((g, i) => {
            const x = startX + i * spacing;
            const label = g.type ? g.type.toUpperCase() : "GROUP";
            const groupReqStr = formatGroupReq(g);

            return (
              <g key={`grp-${i}`}>
                {/* vertical bus down to group */}
                <path d={`M ${x} 160 V 60`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

                {/* components stacked */}
                {g.values.map((v, idx) => {
                  const y = 80 + idx * 48;
                  // use orange/pink for components but keep within theme (no sky blue)
                  const fill = compType === "capacitor" ? "#ffb86b" : "#ff6a9a";
                  const subLabel = compType === "capacitor" ? `${v} μF` : `${v} mH`;
                  return (
                    <g key={`cmp-${i}-${idx}`} transform={`translate(${x},${y})`} className="component-block">
                      <rect x="-28" y="-10" width="56" height="20" rx="6" fill="#0a0a0a" stroke="#222" />
                      <rect x="-22" y="-6" width="44" height="12" rx="4" fill={fill} opacity={0.95} />
                      <text x="-18" y="-16" fontSize="10" fill="#ffd24a">{subLabel}</text>
                    </g>
                  );
                })}

                {/* label box */}
                <g transform={`translate(${x}, 40)`}>
                  <rect x="-48" y="-20" width="96" height="36" rx="8" fill="#060606" stroke="#222" />
                  <text x="-40" y="-6" fontSize="11" fill="#ff9a4a">{label}</text>
                  <text x="-40" y="12" fontSize="11" fill="#fff">{groupReqStr}</text>
                </g>

                {/* animated dots along branch and to bus */}
                {Array.from({ length: dotCount }).map((_, di) => {
                  // path along vertical to bus then a short horizontal into bus for visual
                  const pathStr = `M ${x} 60 V 160 H ${x + 24}`;
                  const delay = (di / dotCount) * speed;
                  const style = {
                    offsetPath: `path('${pathStr}')`,
                    animationName: compType === "capacitor" ? "flowCap" : "flowInd",
                    animationDuration: `${speed}s`,
                    animationTimingFunction: "linear",
                    animationDelay: `${-delay}s`,
                    animationIterationCount: "infinite",
                    animationPlayState: running ? "running" : "paused",
                    transformOrigin: "0 0",
                  };
                  // Dot color: orange-ish for overall theme; if current negative use pinkish to show direction
                  const dotColor = absI >= 0 && ItUsed >= 0 ? "#ffd24a" : "#ff6a9a";
                  return <circle key={`dot-${i}-${di}`} r="4" fill={dotColor} style={style} />;
                })}
              </g>
            );
          })}

          {/* readout panel */}
          <g transform={`translate(${svgWidth - 140},40)`}>
            <rect x="-80" y="-34" width="160" height="140" rx="10" fill="#060606" stroke="#222" />
            <text x="-70" y="-12" fontSize="12" fill="#ffb57a">Readouts</text>

            <text x="-70" y="8" fontSize="12" fill="#fff">V(t): <tspan fill="#ffd24a">{round(latest.V, 6)} V</tspan></text>
            <text x="-70" y="30" fontSize="12" fill="#fff">I(t): <tspan fill="#00ffbf">{round(ItSim, 9)} A</tspan></text>
            <text x="-70" y="52" fontSize="12" fill="#fff">P(t): <tspan fill="#ff9a4a">{round(latest.P, 8)} W</tspan></text>
            <text x="-70" y="74" fontSize="12" fill="#fff">E: <tspan fill="#9ee6ff">{round(latest.E, 8)}</tspan></text>
          </g>

          <style>{`
            @keyframes flowCap {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }
            @keyframes flowInd {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(-6px,6px) scale(0.82); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            /* small device fix: make the svg elements scale nicely */
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
   Oscilloscope (V, I, P)
   - last N points plotted, axis styled for dark theme
   - Will use manual I if provided (passed from parent)
   ============================ */
function MultiOscilloscope({ history = [], manualI, running }) {
  // history: array { t, P, V, I }
  // We'll build a data array plotting V, I_used, P
  const data = history.slice(-360).map((d, idx) => {
    const I_sim = d.I || 0;
    const I_manual = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : null;
    const I_used = I_manual !== null ? I_manual : I_sim;
    const V = d.V || 0;
    const P_used = V * I_used; // compute used power (manual or simulated)
    return {
      t: idx,
      V: round(V, 6),
      I_sim: round(I_sim, 9),
      I_used: round(I_used, 9),
      P: round(P_used, 8),
    };
  });

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — Voltage (V), Current (I), Power (P)</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff",borderRadius:"10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Voltage (V)" />
            <Line type="monotone" dataKey="I_used" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Current (A)" />
            <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Power (W)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page Component
   ============================ */
export default function CapacitanceInductanceCalculatorPage() {
  // UI state
  const [compType, setCompType] = useState("capacitor");
  const [Vsup, setVsup] = useState("12");
  const [running, setRunning] = useState(true);
  const [seriesResistance, setSeriesResistance] = useState("10");
  const [mobileOpen, setMobileOpen] = useState(false);
  // NEW: manual current input (user may override simulated current)
  const [manualCurrent, setManualCurrent] = useState(""); // empty string => use simulated

  // groups
  const [groups, setGroups] = useState([
    { type: "series", values: [10, 10] },
    { type: "parallel", values: [20] },
  ]);

  // simulation
  const { history, eq } = useComponentSim({
    running,
    timestep: 80,
    compType,
    groups,
    Vsup: Number.isFinite(Number(Vsup)) ? Number(Vsup) : 0,
    seriesResistance: Number.isFinite(Number(seriesResistance)) ? Number(seriesResistance) : 10,
  });

  // friendly Ceq display
  const totalEqUser = useMemo(() => {
    if (!eq || !Number.isFinite(eq.totalReq) || eq.totalReq === 0) return "--";
    if (compType === "capacitor") {
      return `${round(eq.totalReq * 1e6, 6)} μF`;
    } else {
      return `${round(eq.totalReq * 1e3, 6)} mH`;
    }
  }, [eq, compType]);

  // Ieq (equivalent instantaneous current) - simulated latest I
  const IeqSim = history.length ? history[history.length - 1].I : 0;
  // effective I used across UI: manual if provided else simulated
  const IeqUsed = Number.isFinite(Number(manualCurrent)) && manualCurrent !== "" ? Number(manualCurrent) : IeqSim;

  /* ---------------------------
     Mutators (consolidated)
     --------------------------- */
  const addGroup = () => setGroups((s) => [...s, { type: "series", values: [10] }]);
  const removeGroup = (gi) => setGroups((s) => s.filter((_, i) => i !== gi));

  const addComponent = (gi) =>
    setGroups((s) => s.map((g, i) => (i === gi ? { ...g, values: [...g.values, 10] } : g)));

  const removeComponent = (gi, ri) =>
    setGroups((s) => s.map((g, i) => (i === gi ? { ...g, values: g.values.filter((_, idx) => idx !== ri) } : g)));

  const updateValue = (gi, ri, v) =>
    setGroups((s) =>
      s.map((g, i) =>
        i === gi
          ? { ...g, values: g.values.map((val, idx) => (idx === ri ? (Number.isFinite(Number(v)) ? Number(v) : 0) : val)) }
          : g
      )
    );

  const changeGroupType = (gi, type) =>
    setGroups((s) => s.map((g, i) => (i === gi ? { ...g, type } : g)));

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setCompType("capacitor");
    setVsup("12");
    setSeriesResistance("10");
    setGroups([{ type: "series", values: [10, 10] }, { type: "parallel", values: [20] }]);
    setManualCurrent("");
    toast("Reset to defaults");
  };

  const exportCSV = () => {
    // include simulated I, manual I, used I and used P
    const rows = [
      ["t", "V_sim", "I_sim", "I_manual", "I_used", "P_used", "E_sim"],
      ...history.map((d, idx) => {
        const V = round(d.V, 9);
        const I_sim = round(d.I, 9);
        const I_manual = Number.isFinite(Number(manualCurrent)) && manualCurrent !== "" ? Number(manualCurrent) : "";
        const I_used = I_manual !== "" ? Number(I_manual) : I_sim;
        const P_used = round(V * I_used, 9);
        const E = round(d.E, 9);
        return [d.t, V, I_sim, I_manual, I_used, P_used, E];
      }),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `capind-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
<header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
  <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">

    {/* Top row */}
    <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">

      {/* Logo + Title */}
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
          <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Capacitance & Inductance Lab</div>
        </div>
      </motion.div>

      {/* Desktop Controls */}
      <div className="hidden md:flex items-center gap-4">

        {/* Component Type Selector */}
        <div className="w-28 sm:w-36 md:w-44">
         <Select value={compType} onValueChange={(v) => setCompType(v)}>
  <SelectTrigger
    className="w-full bg-black/80 border cursor-pointer border-zinc-800 
               text-white text-sm rounded-md shadow-sm 
               hover:border-orange-500 focus:ring-2 focus:ring-orange-500"
  >
    <SelectValue placeholder="Component" />
  </SelectTrigger>

  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
    <SelectItem
      value="capacitor"
      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      Capacitor (μF)
    </SelectItem>
    <SelectItem
      value="inductor"
      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      Inductor (mH)
    </SelectItem>
  </SelectContent>
</Select>

        </div>

  

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200"
            onClick={() => toast.success("Snapshot saved")}
            title="Save Snapshot"
          >
            Snapshot
          </Button>
          <Button
            variant="ghost"
            className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200"
            onClick={toggleRunning}
            aria-label="Play / Pause"
            title={running ? "Pause" : "Play"}
          >
            {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>
          <Button
            variant="ghost"
            className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200"
            onClick={resetDefaults}
            aria-label="Reset"
            title="Reset Defaults"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Mobile Menu Toggle */}
      <div className="md:hidden">
        <Button
          variant="ghost"
          className="border cursor-pointer border-zinc-800 p-2 rounded-lg"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>
    </div>

    {/* Mobile Slide-down Panel */}
    <div
      className={`md:hidden transition-all duration-300 overflow-hidden ${
        mobileOpen ? "max-h-60 py-3" : "max-h-0"
      }`}
    >
      <div className="flex flex-col gap-2 mb-3">
      
 

        {/* Mobile Buttons */}
     
        <div className="flex flex-row gap-2">
             <div className="w-28 sm:w-36 md:w-44">
       <Select value={compType} onValueChange={(v) => setCompType(v)}>
  <SelectTrigger
    className="w-full bg-black/80 border cursor-pointer border-zinc-800 
               text-white text-sm rounded-md shadow-sm 
               hover:border-orange-500 focus:ring-2 focus:ring-orange-500"
  >
    <SelectValue placeholder="Component" />
  </SelectTrigger>

  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
    <SelectItem
      value="capacitor"
      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      Capacitor (μF)
    </SelectItem>
    <SelectItem
      value="inductor"
      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      Inductor (mH)
    </SelectItem>
  </SelectContent>
</Select>

        </div>
          <Button
            className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md"
            onClick={() => toast.success("Snapshot saved")}
          >
            Snapshot
          </Button>
          <Button
            variant="ghost"
            className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md"
            onClick={toggleRunning}
          >
            {running ? "Pause" : "Play"}
          </Button>
          <Button
            variant="ghost"
            className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md"
            onClick={resetDefaults}
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  </div>
</header>
<div className="h-16 sm:h-16"></div>

      {/* Main */}
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Calc: {compType === "capacitor" ? "Capacitance" : "Inductance"}</div>
                        <div className="text-xs text-zinc-400">Series & Parallel • Live visualizer</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                     <Badge
  className="bg-black/80 border border-orange-500 text-orange-300 
             px-3 py-1 rounded-full shadow-sm 
             hover:border-orange-400 hover:text-orange-200 
             transition-colors"
>
  Mode
</Badge>

                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
                      <Input value={Vsup} onChange={(e) => setVsup(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Series Resistance (Ω) — used for dynamics</label>
                      <Input value={seriesResistance} onChange={(e) => setSeriesResistance(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Manual Current Input (A) — optional</label>
                      <Input value={manualCurrent} onChange={(e) => setManualCurrent(e.target.value)} placeholder="Leave empty to use simulated I" type="text" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500 mt-1">If set, this current will be used to compute displayed power and oscilloscope traces.</div>
                    </div>
                  </div>

                  {/* group editor */}
                  <div className="space-y-3">
                    {groups.map((g, gi) => (
                      <div key={gi} className="border border-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                           <Badge
  className="bg-black/80 border border-orange-500 text-orange-300 
             px-3 py-1 rounded-full shadow-sm 
             hover:border-orange-400 hover:text-orange-200 
             transition-colors"
>
  {g.type.toUpperCase()}
</Badge>

                            <div className="text-xs text-zinc-400">{compType === "capacitor" ? "μF per component" : "mH per component"}</div>
                          </div>

                         <Select value={g.type} onValueChange={(v) => changeGroupType(gi, v)}>
  <SelectTrigger
    className="w-32 bg-black/80 border cursor-pointer border-zinc-800 
               text-white text-sm hover:border-orange-500 
               focus:ring-2 focus:ring-orange-500 rounded-md shadow-sm"
  >
    <SelectValue placeholder="Select type" />
  </SelectTrigger>

  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
    <SelectItem
      value="series"
      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      Series
    </SelectItem>
    <SelectItem
      value="parallel"
      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      Parallel
    </SelectItem>
  </SelectContent>
</Select>

                        </div>

                        <div className="space-y-2">
                          {g.values.map((val, ri) => (
                            <div key={ri} className="flex items-center gap-2">
                              <Input value={val} onChange={(e) => updateValue(gi, ri, e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                              <div className="flex gap-1 ml-auto">
                                <Button variant="ghost" onClick={() => removeComponent(gi, ri)} className="p-1 border border-zinc-800 bg-red-500 cursor-pointer text-black hover:bg-red-600"><Trash2 className="w-4 h-4" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex gap-2">
                          <Button variant="outline" onClick={() => addComponent(gi)} className="flex-1 cursor-pointer bg-transparent border border-zinc-800 text-[#ffd24a] "><Plus className="w-4 h-4 mr-2" /> Add {compType === "capacitor" ? "Capacitor" : "Inductor"}</Button>
                          <Button variant="ghost" className="border border-zinc-800 text-zinc-300 cursor-pointer" onClick={() => removeGroup(gi)}>Remove Group</Button>
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2">
                      <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={addGroup}><Layers className="w-4 h-4 mr-2" /> Add Group</Button>
                      <Button variant="ghost" className="border border-zinc-800 text-zinc-300 cursor-pointer" onClick={() => { setGroups([{ type: "series", values: [10, 10] }]); toast("Reset groups"); }}>Reset Groups</Button>
                    </div>
                  </div>

             <div className="bg-black/70 border border-orange-500/30 text-white 
                px-3 py-2 rounded-full shadow-sm backdrop-blur-sm text-xs flex flex-wrap gap-2 items-center">
  <span>
    Equivalent: <span className="text-[#ff9a4a] font-semibold">{totalEqUser}</span>
  </span>
  <span>•</span>
  <span>
    I<sub>eq</sub>: <span className="text-[#00ffbf] font-semibold">{round(IeqUsed, 9)} A</span>
  </span>
</div>

                  <div className="flex items-center gap-2 justify-between mt-2">
                    <div className="flex gap-2">
                      <Button className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Visual + Oscilloscope */}
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
                        <div className="text-xs text-zinc-400">Animated flow • meters • energy • oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{compType}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vsup: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">R<sub>s</sub>: <span className="text-[#ffd24a] ml-1">{seriesResistance} Ω</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <VisualizerSVG compType={compType} groups={groups} Vsup={Number(Vsup)} history={history} running={running} manualI={manualCurrent} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <MultiOscilloscope history={history} manualI={manualCurrent} running={running} />
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
                      <div className="text-xs text-zinc-400">Equivalent</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{totalEqUser}</div>
                      <div className="text-xs text-zinc-400 mt-1">Ceq / Leq (converted)</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">I<sub>sim</sub> (last)</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{round(IeqSim, 9)} A</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">I<sub>used</sub></div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{round(IeqUsed, 9)} A</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Last Power (sim)</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(history.length ? history[history.length - 1].P : 0, 8)} W</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Stored Energy</div>
                      <div className="text-lg font-semibold text-[#9ee6ff]">{round(history.length ? history[history.length - 1].E : 0, 8)} J</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Manual Current</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{manualCurrent === "" ? "—" : `${manualCurrent} A`}</div>
                    </div>
                  </div>

                  <div
  className="mt-3 text-xs sm:text-sm 
             bg-black/70 border border-orange-500/30 
             text-orange-300 px-3 py-2 rounded-md shadow-sm 
             backdrop-blur-sm flex items-start gap-2"
>
  <span className="text-orange-400"><Lightbulb/></span>
  <span>
    Tip: Provide a manual current to instantly compute power: 
    <span className="text-white font-semibold"> P = V × I</span>.
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
