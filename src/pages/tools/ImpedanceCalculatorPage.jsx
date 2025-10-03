// src/pages/ImpedanceCalculatorPage.jsx
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

/*
  Fixed & improved ImpedanceCalculatorPage.jsx
  - Throttled history updates to avoid infinite Recharts re-rendering
  - Stabilized effect dependencies (primitive deps)
  - Disabled Recharts animations that caused re-renders
  - Responsive layout improvements for small screens
  - Kept original UX/feature set (manual current, groups, CSV export)
*/

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
const deg = (rad) => (rad * 180) / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================
   Complex arithmetic
   ============================ */
function cAdd(a, b) {
  return { re: a.re + b.re, im: a.im + b.im };
}
function cInv(a) {
  const d = a.re * a.re + a.im * a.im;
  return { re: a.re / d, im: -a.im / d };
}
function cMag(a) {
  return Math.sqrt(a.re * a.re + a.im * a.im);
}
function cPhase(a) {
  return Math.atan2(a.im, a.re);
}

/* ============================
   Simulation hook
   - computes eq impedance and produces buffered/throttled waveform history
   ============================ */
function useImpedanceSim({ running, freq = 50, Vm = 12, groups = [] }) {
  // Public history state (updated on a throttle)
  const [history, setHistory] = useState([]);

  // Refs for RAF simulation and buffering
  const rafRef = useRef(null);
  const tRef = useRef(0);
  const lastRAFRef = useRef(performance.now());
  const bufferRef = useRef([]); // accumulate points between state updates
  const lastCommitRef = useRef(performance.now());

  // component impedance helper
  const compImpedance = useCallback((c, w) => {
    if (!c) return { re: 0, im: 0 };
    if (c.type === "R") return { re: c.val, im: 0 };
    if (c.type === "L") return { re: 0, im: w * (c.val * 1e-3) };
    if (c.type === "C") {
      const C = c.val * 1e-6;
      if (C <= 0) return { re: 0, im: 0 };
      return { re: 0, im: -1 / (w * C) };
    }
    return { re: 0, im: 0 };
  }, []);

  // compute eq impedance (memoized)
  const eq = useMemo(() => {
    const w = 2 * Math.PI * freq;
    if (!groups || groups.length === 0) return { Zeq: { re: 0, im: 0 }, groupZ: [] };
    const groupZ = groups.map((g) => {
      const zList = g.values.map((c) => compImpedance(c, w));
      if (g.type === "series") {
        return zList.reduce((acc, z) => cAdd(acc, z), { re: 0, im: 0 });
      } else {
        // parallel
        let accInv = { re: 0, im: 0 };
        zList.forEach((z) => {
          const inv = z.re === 0 && z.im === 0 ? { re: Infinity, im: 0 } : cInv(z);
          accInv = cAdd(accInv, inv);
        });
        return (!isFinite(accInv.re) || !isFinite(accInv.im)) ? { re: 0, im: 0 } : cInv(accInv);
      }
    });
    const Zeq = groupZ.reduce((a, b) => cAdd(a, b), { re: 0, im: 0 });
    return { Zeq, groupZ };
  }, [groups, freq, compImpedance]);

  // use primitive parts of eq in deps to avoid object identity churn
  const ZeqRe = eq.Zeq?.re ?? 0;
  const ZeqIm = eq.Zeq?.im ?? 0;

  // simulate waveform (RAF) — buffer updates and commit to React state at a controlled cadence
  useEffect(() => {
    let alive = true;
    lastRAFRef.current = performance.now();
    lastCommitRef.current = performance.now();

    const w = 2 * Math.PI * freq;
    const VmLocal = Vm;

    const step = (ts) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(step);

      if (!running) {
        lastRAFRef.current = ts;
        return;
      }

      const dt = ts - lastRAFRef.current;
      // accumulate time but don't update state too often
      lastRAFRef.current = ts;
      tRef.current += dt;

      // only compute at small time steps (avoid tiny dt)
      if (dt < 8) return;

      const t = tRef.current / 1000;
      const magZ = cMag({ re: ZeqRe, im: ZeqIm }) || 1e-12;
      const ph = cPhase({ re: ZeqRe, im: ZeqIm }) || 0;
      const Im = VmLocal / magZ;

      const v = VmLocal * Math.sin(w * t);
      const i = Im * Math.sin(w * t - ph);
      const p = v * i;

      // push into the buffer
      bufferRef.current.push({ t, v, i, p });

      // commit buffer to react state at most every 100ms (10 fps) to avoid chart thrash
      const now = performance.now();
      if (now - lastCommitRef.current >= 100) {
        // batch-commit
        setHistory((h) => {
          const next = [...h, ...bufferRef.current.map((d) => ({ ...d }))];
          // limit length
          if (next.length > 720) next.splice(0, next.length - 720);
          return next;
        });
        bufferRef.current.length = 0;
        lastCommitRef.current = now;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // flush any remaining buffer on unmount
      if (bufferRef.current.length > 0) {
        setHistory((h) => {
          const next = [...h, ...bufferRef.current.map((d) => ({ ...d }))];
          if (next.length > 720) next.splice(0, next.length - 720);
          return next;
        });
        bufferRef.current.length = 0;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, freq, Vm, ZeqRe, ZeqIm, groups.length]); // stable primitive deps

  return { history, eq };
}

/* ============================
   VisualizerSVG
   ============================ */
function VisualizerSVG({ groups, Vm, eq, running, manualI }) {
  const magZ = cMag(eq.Zeq) || 0;
  const angleZ = cPhase(eq.Zeq) || 0;
  const IeqSim = magZ > 0 ? Vm / magZ : 0;
  const IeqUsed =
    Number.isFinite(Number(manualI)) && manualI !== ""
      ? Number(manualI)
      : IeqSim;
  const pf = Math.cos(angleZ);

  const groupCount = Math.max(1, groups.length);

  // Responsive spacing: tighter on small screens, wider on desktops
  const baseSpacing =
    typeof window !== "undefined" && window.innerWidth < 640
      ? 100 // mobile
      : window.innerWidth < 1024
      ? 130 // tablet
      : 160; // desktop
  const spacing = clamp(baseSpacing, 80, 200);

  // SVG width scales with group count, but capped for responsiveness
  const svgWidth = Math.max(600, 160 + spacing * groupCount);
  const startX = 120;

  // dot animation sizing (kept but limited)
  const dotCount = clamp(Math.round(6 + Math.abs(IeqUsed) * 6), 4, 14);
  const dotSpeed = clamp(1.2 / (Math.abs(IeqUsed) / 2 + 0.2), 0.6, 3.0);

  const formatComp = (c) => {
    if (!c) return "--";
    if (c.type === "R") return `${c.val} Ω`;
    if (c.type === "L") return `${c.val} mH`;
    if (c.type === "C") return `${c.val} μF`;
    return `${c.val}`;
  };

  // accent colors (orange theme)
  const compOrange = "#ff9a4a";
  const compPink = "#ff6a9a";
  const compLight = "#ffb86b";

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base sm:text-lg font-semibold text-[#ffd24a]">
              RLC Visualizer
            </div>
            <div className="text-[10px] sm:text-xs text-zinc-400">
              AC source • animated flow • per-group equivalents
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap mt-2 sm:mt-0">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 sm:px-3 py-1 rounded-full">
            Vm: <span className="text-[#ffd24a] ml-1">{Vm} V</span>
          </Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 sm:px-3 py-1 rounded-full">
            I<sub>used</sub>:{" "}
            <span className="text-[#ffd24a] ml-1">{round(IeqUsed, 6)} A</span>
          </Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 sm:px-3 py-1 rounded-full">
            PF: <span className="text-[#ffd24a] ml-1">{round(pf, 4)}</span>
          </Badge>
        </div>
      </div>

      {/* SVG */}
      <div className="mt-3 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} 320`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-56 sm:h-64 lg:h-72"
        >
          {/* Source */}
          <g transform={`translate(100,160)`}>
            <rect
              x="-100"
              y="-28"
              rx="8"
              width="52"
              height="56"
              fill="#0b0b0b"
              stroke="#222"
            />
            <text
              x="-86"
              y="6"
              fill="#ffd24a"
              style={{ fontSize: "clamp(10px, 1.2vw, 14px)" }}
              fontWeight="700"
            >
              AC
            </text>
          </g>

          {/* bus */}
          <path
            d={`M 130 160 H ${svgWidth - 80}`}
            stroke="#111"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* groups */}
          {groups.map((g, gi) => {
            const x = startX + gi * spacing;
            return (
              <g key={`g-${gi}`}>
                <path
                  d={`M ${x} 160 V 72`}
                  stroke="#111"
                  strokeWidth="6"
                  strokeLinecap="round"
                />

                {g.values.map((c, ci) => {
                  const y = 88 + ci * 48;
                  const col =
                    c.type === "R"
                      ? compOrange
                      : c.type === "L"
                      ? compLight
                      : compPink;
                  return (
                    <g
                      key={`c-${gi}-${ci}`}
                      transform={`translate(${x},${y})`}
                      className="component-block"
                    >
                      <rect
                        x="-28"
                        y="-12"
                        width="56"
                        height="24"
                        rx="8"
                        fill="#060606"
                        stroke="#222"
                      />
                      <rect
                        x="-22"
                        y="-8"
                        width="44"
                        height="16"
                        rx="6"
                        fill={col}
                        opacity="0.95"
                      />
                      <text
                        x="-18"
                        y="-18"
                        style={{ fontSize: "clamp(8px, 1vw, 12px)" }}
                        fill="#ffd24a"
                      >
                        {formatComp(c)}
                      </text>
                    </g>
                  );
                })}

                <g transform={`translate(${x}, 56)`}>
                  <rect
                    x="-44"
                    y="-50"
                    width="88"
                    height="36"
                    rx="8"
                    fill="#060606"
                    stroke="#222"
                  />
                  <text
                    x="-30"
                    y="-28"
                    style={{ fontSize: "clamp(9px, 1vw, 13px)" }}
                    fill="#ffd24a"
                    fontWeight="700"
                  >
                    {g.type.toUpperCase()}
                  </text>
                </g>

                {/* animated dots (CSS motion using offsetPath) */}
                {Array.from({ length: dotCount }).map((_, di) => {
                  const pathStr = `M ${x} 72 V 160 H ${x + 24}`;
                  const delay = (di / dotCount) * dotSpeed;
                  const style = {
                    offsetPath: `path('${pathStr}')`,
                    WebkitOffsetPath: `path('${pathStr}')`,
                    animationName: "flowImp",
                    animationDuration: `${dotSpeed}s`,
                    animationTimingFunction: "linear",
                    animationDelay: `${-delay}s`,
                    animationIterationCount: "infinite",
                    animationPlayState: running ? "running" : "paused",
                    transformOrigin: "0 0",
                  };
                  const fillColor = pf >= 0 ? "#ffd24a" : "#ff6a9a";
                  return (
                    <circle
                      key={`d-${gi}-${di}`}
                      r={window.innerWidth < 640 ? "3.2" : "4.2"}
                      fill={fillColor}
                      style={style}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* right readout */}
          <g transform={`translate(${svgWidth - 160},44)`}>
            <rect
              x="60"
              y="-34"
              width="160"
              height="140"
              rx="12"
              fill="#060606"
              stroke="#222"
            />
            <text
              x="70"
              y="-12"
              style={{ fontSize: "clamp(9px, 1vw, 13px)" }}
              fill="#ffb57a"
            >
              Summary
            </text>

            <text
              x="70"
              y="6"
              style={{ fontSize: "clamp(9px, 1vw, 12px)" }}
              fill="#ffd24a"
            >
              |Z|:{" "}
              <tspan fill="#fff">
                {round(cMag(eq.Zeq || { re: 0, im: 0 }), 6)} Ω
              </tspan>
            </text>
            <text
              x="70"
              y="30"
              style={{ fontSize: "clamp(9px, 1vw, 12px)" }}
              fill="#9ee6ff"
            >
              ∠Z:{" "}
              <tspan fill="#fff">
                {round(deg(cPhase(eq.Zeq || { re: 0, im: 0 })), 3)}°
              </tspan>
            </text>
            <text
              x="70"
              y="54"
              style={{ fontSize: "clamp(9px, 1vw, 12px)" }}
              fill="#ffd24a"
            >
              Ieq: <tspan fill="#fff">{round(IeqUsed, 6)} A</tspan>
            </text>
          </g>

          {/* Animations */}
          <style>{`
            @keyframes flowImp {
              0% { offset-distance: 0%; opacity: 1; transform: scale(0.98); }
              40% { opacity: 0.9; transform: scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: scale(0.9); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
          `}</style>
        </svg>
      </div>
    </div>
  );
}


/* ============================
   Oscilloscope Panel
   ============================ */
function Oscilloscope({ history = [], manualI, running }) {
  // Keep data array small and memoized
  const data = useMemo(() => (
    history.slice(-300).map((d, idx) => {
      const I_sim = d.i || 0;
      const I_manual = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : null;
      const I_used = I_manual !== null ? Number(I_manual) : I_sim;
      const V = d.v || 0;
      const P_used = V * I_used;
      return { t: idx, V: round(V, 6), I_used: round(I_used, 9), P: round(P_used, 8) };
    })
  ), [history, manualI]);

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${running ? 'bg-[#ff7a2d] animate-pulse' : 'bg-zinc-700'}`} />
          <div className="text-sm font-medium text-[#ff7a2d]">Oscilloscope</div>
        </div>
      <Badge
  className="bg-black/70 border border-orange-500/40 text-orange-300 
             px-3 py-1 rounded-full shadow-md text-xs font-medium 
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
            {/* Disabled animations and dots to prevent chart internal re-render loops */}
            <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} animationDuration={0} name="Voltage (V)" />
            <Line type="monotone" dataKey="I_used" stroke="#ffb86b" strokeWidth={2} dot={false} isAnimationActive={false} animationDuration={0} name="Current (A)" />
            <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} animationDuration={0} name="Power (W)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Header({ Vm, setVm, freq, setFreq, running, toggleRun, resetDefaults }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-black/70 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Top row */}
        <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
          {/* Logo + Title */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="leading-tight">
              <div className="text-[11px] sm:text-xs md:text-sm text-zinc-300">SparkLab</div>
              <div className=" font-semibold text-xs text-zinc-400">
                Impedance (RLC) Calculator
              </div>
            </div>
          </div>

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center gap-4">
            {/* Inputs */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Vm</span>
              <Input
                value={Vm}
                onChange={(e) => setVm(e.target.value)}
                className="w-20 bg-zinc-900/60 border border-zinc-800 text-white text-sm"
              />
              <span className="text-xs text-zinc-400">Hz</span>
              <Input
                value={freq}
                onChange={(e) => setFreq(e.target.value)}
                className="w-20 bg-zinc-900/60 border border-zinc-800 text-white text-sm"
              />
            </div>
            {/* Buttons */}
            <div className="flex items-center gap-2">
              <Button
                className="cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm px-3"
                onClick={() => toast("Snapshot saved")}
              >
                Snapshot
              </Button>
              <Button
                variant="ghost"
                className="border cursor-pointer border-zinc-800 p-2"
                onClick={toggleRun}
              >
                {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>
              <Button
                variant="ghost"
                className="border cursor-pointer border-zinc-800 p-2"
                onClick={resetDefaults}
              >
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              className="border border-zinc-800 p-2"
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
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] text-zinc-400">Vm</span>
            <Input
              value={Vm}
              onChange={(e) => setVm(e.target.value)}
              className="flex-1 bg-zinc-900/60 border border-zinc-800 text-white text-xs"
            />
            <span className="text-[11px] text-zinc-400">Hz</span>
            <Input
              value={freq}
              onChange={(e) => setFreq(e.target.value)}
              className="flex-1 bg-zinc-900/60 border border-zinc-800 text-white text-xs"
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2"
              onClick={() => toast.success("Snapshot saved")}
            >
              Snapshot
            </Button>
            <Button
              variant="ghost"
              className="flex-1 border border-zinc-800 text-xs py-2"
              onClick={toggleRun}
            >
              {running ? "Pause" : "Play"}
            </Button>
            <Button
              variant="ghost"
              className="flex-1 border border-zinc-800 text-xs py-2"
              onClick={resetDefaults}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
/* ============================
   Main Page — improved responsiveness
   ============================ */
export default function ImpedanceCalculatorPage() {
  // core UI state
  const [Vm, setVm] = useState("12");
  const [freq, setFreq] = useState("50");
  const [running, setRunning] = useState(true);

  // manual current input (A)
  const [manualCurrent, setManualCurrent] = useState("");

  // groups: each group = { type: 'series' | 'parallel', values: [{type: 'R'|'L'|'C', val: number}] }
  const [groups, setGroups] = useState(() => [
    { type: "series", values: [{ type: "R", val: 100 }, { type: "L", val: 10 }] },
    { type: "parallel", values: [{ type: "C", val: 10 }] },
  ]);

  const { history, eq } = useImpedanceSim({
    running,
    freq: toNum(freq) || 50,
    Vm: toNum(Vm) || 12,
    groups,
  });

  // mutators
  const addGroup = () => setGroups((s) => [...s, { type: "series", values: [{ type: "R", val: 10 }] }]);
  const removeGroup = (gi) => setGroups((s) => s.filter((_, i) => i !== gi));
  const addComponent = (gi) => setGroups((s) => s.map((g, i) => (i === gi ? { ...g, values: [...g.values, { type: "R", val: 10 }] } : g)));
  const removeComponent = (gi, ci) => setGroups((s) => s.map((g, i) => (i === gi ? { ...g, values: g.values.filter((_, j) => j !== ci) } : g)));
  const updateComponent = (gi, ci, field, value) => {
    setGroups((s) =>
      s.map((g, i) =>
        i === gi
          ? {
              ...g,
              values: g.values.map((c, j) => (j === ci ? { ...c, [field]: field === "val" ? Number(value) : value } : c)),
            }
          : g
      )
    );
  };
  const changeGroupType = (gi, type) => setGroups((s) => s.map((g, i) => (i === gi ? { ...g, type } : g)));

  // export CSV (include manual current & used power)
  const exportCSV = () => {
    const rows = [
      ["t", "v", "i_sim", "i_manual", "i_used", "p_used"],
      ...history.map((d) => {
        const v = round(d.v, 6);
        const i_sim = round(d.i, 9);
        const i_manual = Number.isFinite(Number(manualCurrent)) && manualCurrent !== "" ? Number(manualCurrent) : "";
        const i_used = i_manual !== "" ? Number(i_manual) : i_sim;
        const p_used = round(v * i_used, 8);
        return [round(d.t, 6), v, i_sim, i_manual, i_used, p_used];
      }),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `impedance-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  // derived results
  const magZ = cMag(eq.Zeq) || 0;
  const angle = cPhase(eq.Zeq) || 0;
  const IeqSim = magZ > 0 ? (toNum(Vm) || 0) / magZ : 0;
  const IeqUsed = Number.isFinite(Number(manualCurrent)) && manualCurrent !== "" ? Number(manualCurrent) : IeqSim;
  const pf = Math.cos(angle) || 0;
  const P = (toNum(Vm) || 0) * IeqUsed * pf; // using IeqUsed
  const Q = (toNum(Vm) || 0) * IeqUsed * Math.sin(angle);
  const S = (toNum(Vm) || 0) * IeqUsed;

  // small UI helpers
  const toggleRun = () => {
    setRunning((r) => {
      const n = !r;
      toast.success(n ? "Simulation resumed" : "Simulation paused");
      return n;
    });
  };
  const resetDefaults = () => {
    setVm("12");
    setFreq("50");
    setGroups([
      { type: "series", values: [{ type: "R", val: 100 }, { type: "L", val: 10 }] },
      { type: "parallel", values: [{ type: "C", val: 10 }] },
    ]);
    setManualCurrent("");
    toast("Reset to defaults");
  };

  return (
    <div className="min-h-screen bg-black pb-20 sm:pb-2 text-white">
      <Toaster position="top-right" richColors />
      {/* header */}
       <Header
        Vm={Vm}
        setVm={setVm}
        freq={freq}
        setFreq={setFreq}
        running={running}
        toggleRun={toggleRun}
        resetDefaults={resetDefaults}
      />
      {/* main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Circuit Controls</div>
                        <div className="text-xs text-zinc-400">Set AC source & groups</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-500/30 backdrop-blur-sm border border-orange-400 text-white px-3 py-1 rounded-full shadow-sm">
  AC
</Badge>

                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-400">Supply (Vm)</label>
                    <Input value={Vm} onChange={(e) => setVm(e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Frequency (Hz)</label>
                    <Input value={freq} onChange={(e) => setFreq(e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Manual Current (A) — optional</label>
                    <Input value={manualCurrent} onChange={(e) => setManualCurrent(e.target.value)} placeholder="Leave empty to use simulated I" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    <div className="text-xs text-zinc-500 mt-1">If set, this current will be used for power calculations and oscilloscope traces.</div>
                  </div>

                  <div className="space-y-3">
                    {groups.map((g, gi) => (
                      <div key={gi} className="border border-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
          <Badge
  className="bg-black/80 border border-zinc-800 text-orange-400 
             px-3 py-1 rounded-full shadow-sm 
             hover:border-orange-500 hover:text-orange-300 
             transition-colors"
>
  {g.type.toUpperCase()}
</Badge>

                            <div className="text-xs text-zinc-400">Group components</div>
                            <div className="text-xs text-zinc-400 ml-2">({g.values.length})</div>
                          </div>

                          <Select value={g.type} onValueChange={(v) => changeGroupType(gi, v)}>
  <SelectTrigger className="w-36 bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500 rounded-md shadow-sm">
    <SelectValue placeholder="Select type" />
  </SelectTrigger>

  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
    <SelectItem
      value="series"
      className="text-white hover:bg-orange-500/20  data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      Series
    </SelectItem>
    <SelectItem
      value="parallel"
      className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      Parallel
    </SelectItem>
  </SelectContent>
</Select>

                        </div>

                        <div className="space-y-2">
                          {g.values.map((c, ci) => (
                            <div key={ci} className="flex items-center gap-2">
                              <Select
  value={c.type}
  onValueChange={(v) => updateComponent(gi, ci, "type", v)}
>
  <SelectTrigger
    className="w-24 bg-black/80 border cursor-pointer border-zinc-800 
               text-white text-sm hover:border-orange-500 
               focus:ring-2 focus:ring-orange-500 rounded-md shadow-sm"
  >
    <SelectValue placeholder="Select" />
  </SelectTrigger>

  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
    <SelectItem
      value="R"
      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      R (Ω)
    </SelectItem>
    <SelectItem
      value="L"
      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      L (mH)
    </SelectItem>
    <SelectItem
      value="C"
      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md"
    >
      C (μF)
    </SelectItem>
  </SelectContent>
</Select>


                              <Input value={c.val} onChange={(e) => updateComponent(gi, ci, "val", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white text-sm" />

                              <div className="ml-auto flex gap-1">
                                <Button variant="ghost" className="p-1 border border-zinc-800 bg-red-500 text-black hover:bg-red-600 cursor-pointer" onClick={() => removeComponent(gi, ci)}><Trash2 className="w-4 h-4" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex gap-2">
                          <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => addComponent(gi)}><Plus className="w-4 h-4 mr-2" /> Add Component</Button>
                          <Button variant="ghost" className="border border-zinc-800 text-zinc-300 cursor-pointer" onClick={() => removeGroup(gi)}>Remove Group</Button>
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2">
                      <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={addGroup}><Layers className="w-4 h-4 mr-2" /> Add Group</Button>
                      <Button variant="ghost" className="border border-zinc-800 text-zinc-300 cursor-pointer" onClick={() => { setGroups([{ type: "series", values: [{ type: "R", val: 100 }] }]); toast("Groups reset"); }}>Reset Groups</Button>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-400">
                    Tip: Use series groups for components in-line; use parallel for branches.
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* visualizer & oscilloscope */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <CircuitBoard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated flow • per-group meter • readouts</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vm: <span className="text-[#ffd24a] ml-1">{Vm} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">f: <span className="text-[#ffd24a] ml-1">{freq} Hz</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">
                        I<sub>eq</sub>: <span className="text-[#ffd24a] ml-1">{round(IeqUsed, 6)} A</span>
                      </Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <VisualizerSVG groups={groups} Vm={toNum(Vm) || 0} eq={eq} running={running} manualI={manualCurrent} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Oscilloscope history={history} manualI={manualCurrent} running={running} />

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Gauge className="w-4 h-4 " /> Summary & Power
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
                      <div className="text-xs text-zinc-400">|Z|</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(cMag(eq.Zeq || { re: 0, im: 0 }), 6)} Ω</div>
                      <div className="text-xs text-zinc-400 mt-1">Angle</div>
                      <div className="text-sm text-[#9ee6ff]">{round(deg(angle || 0), 3)}°</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
                      <div className="text-xs text-zinc-400">I<sub>sim</sub> (last)</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{round(IeqSim, 6)} A</div>
                      <div className="text-xs text-zinc-400 mt-1">Power Factor</div>
                      <div className="text-sm text-[#ffd24a]">{round(pf, 4)}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
                      <div className="text-xs text-zinc-400">I<sub>used</sub></div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{round(IeqUsed, 6)} A</div>
                      <div className="text-xs text-zinc-400 mt-1">Manual override (if any)</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Real Power (P)</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{round(P, 6)} W</div>
                      <div className="text-xs text-zinc-400 mt-1">Reactive (Q)</div>
                      <div className="text-sm text-[#9ee6ff]">{round(Q, 6)} var</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Apparent Power (S)</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(S, 6)} VA</div>
                      <div className="text-xs text-zinc-400 mt-1">S = Vm × I<sub>used</sub></div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Manual Current</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{manualCurrent === "" ? "—" : `${manualCurrent} A`}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Button className="cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a]" onClick={exportCSV}><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
                    <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300" onClick={() => { navigator.clipboard?.writeText(JSON.stringify({ Z: eq.Zeq, I_used: IeqUsed, P })); toast("Copied summary to clipboard"); }}>Copy</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* mobile sticky */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
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
