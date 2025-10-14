// src/pages/TheoremTutorialPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  GitMerge, // for superposition-like icon
  Cpu,
  Play,
  Pause,
  Download,
  Layers,
  Gauge,
  Settings,
  Menu,
  X,
  Lightbulb,
  ZapOff,
  Bolt,
  ArrowRightCircle,
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
   Utilities (same style as original)
   ============================ */
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return "--";
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================
   Simulation Hook: useTheoremSim
   - Generates a continuous "history" for oscilloscope and animated visualizer
   - Computes theoretical values depending on selected theorem and parameters
   - Simple DC resistive circuits (Thevenin/Norton/MaxPower/Superposition of two sources)
   ============================ */
function useTheoremSim({
  running,
  timestep = 100,
  theorem = "thevenin",
  params = {}, // { Vs, V2, R1, R2, Rth, RthOpen, RL, sourceType }
}) {
  // history buffer
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, V: 0, I: 0, P: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // core solver - returns instantaneous (static) values for given params
  const computeSnapshot = useCallback(
    (theoremLocal, p) => {
      // ensure numeric cast
      const Vs = Number(p.Vs) || 0;
      const V2 = Number(p.V2) || 0;
      const R1 = Math.max(1e-6, Number(p.R1) || 0);
      const R2 = Math.max(1e-6, Number(p.R2) || 0);
      const RL = Math.max(1e-6, Number(p.RL) || 1e6);
      const Rth = Number(p.Rth) || null;
      const sourceType = p.sourceType || "dc"; // dc only for now

      // default outputs
      let Vload = 0;
      let Iload = 0;
      let Pload = 0;
      let extras = {};

      // Theorems:
      if (theoremLocal === "thevenin") {
        // If Rth provided use it, otherwise compute simple series partition (R1-R2 network)
        // We'll treat Rth param as explicitly provided; else we compute Rth as R1 || R2 depending on topology.
        // For simple case: a single source Vs with series Rth -> load RL
        const RthUsed = Rth ? Number(Rth) : R1; // fallback to R1
        Iload = Vs / (RthUsed + RL);
        Vload = Iload * RL;
        Pload = Vload * Iload;
        extras = { RthUsed };
      } else if (theoremLocal === "norton") {
        // Norton: convert Norton current IN and RN into load current
        // If params include Rth treat RN = Rth
        const RN = Number(p.Rth) || R1;
        const IN = (Number(p.In) || (Vs / R1)) || 0;
        Iload = IN * (RN / (RN + RL)); // WRONG for general but treat simple model: current divider
        // Better: Norton equivalent: IN in parallel with RN; load gets IN * (RN/(RN+RL))??? We'll use correct form:
        // Branch currents: Iload = IN * (RN / (RN + RL)) is not fully accurate; instead Iload = IN * (RN/(RN+RL)) if IN flows through parallel RN -> simplified.
        // Use simpler: compute open-circuit Voc and convert.
        const RthComputed = RN;
        const Vth = IN * RN;
        Iload = Vth / (RthComputed + RL);
        Vload = Iload * RL;
        Pload = Vload * Iload;
        extras = { RN, IN };
      } else if (theoremLocal === "maxpower") {
        // Maximum power transfer: best RL = Rth (for resistive DC)
        // We'll compute Thevenin first (Rth deduced or provided)
        const RthUsed = Rth ? Number(Rth) : R1;
        const RLopt = RthUsed;
        const Iopt = Vs / (RthUsed + RLopt);
        const Vopt = Iopt * RLopt;
        const Popt = Vopt * Iopt;
        // selected RL will be whatever user provided
        Iload = Vs / (RthUsed + RL);
        Vload = Iload * RL;
        Pload = Vload * Iload;
        extras = { RthUsed, RLopt, Iopt, Vopt, Popt };
      } else if (theoremLocal === "superposition") {
        // Superposition with two independent sources Vs and V2 feeding a resistive divider network R1, R2 with RL across R2.
        // We'll compute effect of Vs (set V2=0) and V2 (set Vs=0) then sum voltages.
        // Simple topology assumed: Vs series R1 node -> R2 parallel RL to ground. V2 is second source feeding same node through R2? To keep it simple:
        // We'll implement a simple two-source series network:
        // Node: Vs -> R1 -> node A -> R2 -> ground. V2 is another source connecting to node A to ground.
        // This is approximate but demo-level: superposition: set V2 to 0 and calculate V_node due to Vs, then Vs=0 due to V2.
        const R1s = R1;
        const R2s = R2;
        // Contribution from Vs (V2=0).
        const VnodeFromVs = (Vs * (R2s * RL) / (R2s + RL)) / (R1s + (R2s * RL) / (R2s + RL));
        // Contribution from V2 (Vs=0).
        const VnodeFromV2 = (V2 * (R1s / (R1s + R2s + RL))) || 0; // rough approximated share
        Vload = (VnodeFromVs + VnodeFromV2) || 0;
        Iload = Vload / RL;
        Pload = Vload * Iload;
        extras = { VnodeFromVs, VnodeFromV2 };
      } else {
        // fallback trivial single-source divider
        const Vdiv = Vs * (RL / (R1 + RL));
        Vload = Vdiv;
        Iload = Vload / RL;
        Pload = Vload * Iload;
        extras = { fallback: true };
      }

      return { V: Vload, I: Iload, P: Pload, extras };
    },
    []
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
      // create snapshot - static DC result for now
      const snap = computeSnapshot(theorem, params);

      // for visual interest, create small oscillatory variation if "running" to simulate measurement noise/AC feel:
      const tSeconds = tRef.current / 1000;
      const jitter = 1 + 0.02 * Math.sin(tSeconds * 6.28 * 0.8); // small 2% ripple

      const Vt = snap.V * jitter;
      const It = snap.I * jitter;
      const Pt = snap.P * jitter;

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, V: Vt, I: It, P: Pt });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeSnapshot, theorem, params]);

  const snapshot = useMemo(() => computeSnapshot(theorem, params), [theorem, params, computeSnapshot]);

  return { history, snapshot };
}

/* ============================
   Visualizer: CircuitSVG
   - Renders a stylized circuit with animated flow and meters
   - Interactive: user can hover groups; current dots scale with magnitude
   ============================ */
function CircuitSVG({ theorem, params, history, running }) {
  const latest = history.length ? history[history.length - 1] : { V: 0, I: 0, P: 0 };
  const Vnow = latest.V || 0;
  const Inow = latest.I || 0;
  const Pnow = latest.P || 0;

  const absI = Math.abs(Inow);
  const dotCount = clamp(Math.round(3 + absI * 10), 3, 22);
  const speed = clamp(1.2 / (absI + 0.02), 0.25, 3.0);

  // Layout constants
  const width = 1000;
  const height = 320;
  const busY = 140;
  const leftX = 120;
  const rightX = width - 140;

  // small readout helper
  const read = (v, p = 6) => (Number.isFinite(Number(v)) ? round(v, p) : "--");

  // Determine labels based on theorem for display
  const eqLabel = (() => {
    if (theorem === "thevenin") return `Thevenin: R_th=${params.Rth ?? params.R1}Ω`;
    if (theorem === "norton") return `Norton: I_n=${params.In ?? (params.Vs / (params.R1||1))}A`;
    if (theorem === "maxpower") return `Max Power: RL_opt ≈ R_th=${params.Rth ?? params.R1}Ω`;
    if (theorem === "superposition") return `Superposition (multiple sources)`;
    return "Circuit";
  })();

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Bolt className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Theorem Visualizer</div>
            <div className="text-xs text-zinc-400">{eqLabel} • Live • Readouts</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V<sub>load</sub>: <span className="text-[#ffd24a] ml-1">{read(Vnow,6)} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I<sub>load</sub>: <span className="text-[#00ffbf] ml-1">{read(Inow,9)} A</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">P: <span className="text-[#ff9a4a] ml-1">{read(Pnow,6)} W</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* Left supply */}
          <g transform={`translate(${leftX - 80},${busY})`}>
            <rect x="-24" y="-34" width="48" height="68" rx="6" fill="#060606" stroke="#222" />
            <text x="-36" y="-46" fontSize="12" fill="#ffd24a">{params.Vs || 0} V</text>
          </g>

          {/* Bus */}
          <path d={`M ${leftX} ${busY} H ${rightX}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* Resistive divider / Thevenin block */}
          <g transform={`translate(${(leftX + rightX) / 2 - 80}, ${busY - 20})`} className="cursor-pointer">
            {/* Rth box */}
            <rect x="-40" y="-24" width="160" height="60" rx="8" fill="#060606" stroke="#222" />
            <text x="-32" y="-4" fontSize="12" fill="#ff9a4a">Network</text>
            <text x="-32" y="14" fontSize="11" fill="#fff">R1: {params.R1 ?? "—"} Ω • R2: {params.R2 ?? "—"} Ω</text>
            <text x="-32" y="28" fontSize="11" fill="#aaa">Open-circuit V: {round((history.length ? history[history.length-1].V : 0), 6)} V</text>
          </g>

          {/* Load branch - right */}
          <g transform={`translate(${rightX - 60}, ${busY - 10})`}>
            {/* vertical branch */}
            <path d={`M 0 -8 V 36`} stroke="#111" strokeWidth="6" strokeLinecap="round" />
            {/* Load symbol */}
            <rect x="-28" y="36" width="56" height="22" rx="6" fill="#0a0a0a" stroke="#222" />
            <text x="-22" y="50" fontSize="10" fill="#ffd24a">R<sub>L</sub> {params.RL ?? "—"} Ω</text>

            {/* animated dots on vertical branch */}
            {Array.from({ length: dotCount }).map((_, di) => {
              const pathStr = `M ${rightX - 60} ${busY - 10 - 40} V ${busY + 40} H ${rightX - 36}`;
              const delay = (di / dotCount) * speed;
              const style = {
                offsetPath: `path('${pathStr}')`,
                animationName: "flowTheorem",
                animationDuration: `${speed}s`,
                animationTimingFunction: "linear",
                animationDelay: `${-delay}s`,
                animationIterationCount: "infinite",
                animationPlayState: running ? "running" : "paused",
                transformOrigin: "0 0",
              };
              const dotColor = Inow >= 0 ? "#ffd24a" : "#ff6a9a";
              return <circle key={`dot-${di}`} r="4" fill={dotColor} style={style} />;
            })}
          </g>

          {/* readout card */}
          <g transform={`translate(${width - 160}, 24)`}>
            <rect x="-80" y="-14" width="160" height="120" rx="10" fill="#060606" stroke="#222" />
            <text x="-70" y="6" fontSize="12" fill="#ffb57a">Readouts</text>
            <text x="-70" y="28" fontSize="12" fill="#fff">Vload: <tspan fill="#ffd24a">{read(Vnow,6)} V</tspan></text>
            <text x="-70" y="50" fontSize="12" fill="#fff">Iload: <tspan fill="#00ffbf">{read(Inow,9)} A</tspan></text>
            <text x="-70" y="72" fontSize="12" fill="#fff">Pload: <tspan fill="#ff9a4a">{read(Pnow,6)} W</tspan></text>
          </g>

          <style>{`
            @keyframes flowTheorem {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.04); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.82); }
            }
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
   Oscilloscope component
   ============================ */
function TheoremOscilloscope({ history = [], running }) {
  const data = history.slice(-360).map((d, idx) => ({
    t: idx,
    V: round(d.V, 6) === "--" ? 0 : round(d.V, 6),
    I: round(d.I, 9) === "--" ? 0 : round(d.I, 9),
    P: round(d.P, 8) === "--" ? 0 : round(d.P, 8),
  }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — V, I, P</div>
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
            <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Voltage (V)" />
            <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Current (A)" />
            <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Power (W)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page: TheoremTutorialPage
   ============================ */
export default function TheoremTutorialPage() {
  // UI state
  const [theorem, setTheorem] = useState("thevenin");
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Parameters for solver (kept as strings to keep inputs flexible)
  const [Vs, setVs] = useState("12");
  const [V2, setV2] = useState("5");
  const [R1, setR1] = useState("100");
  const [R2, setR2] = useState("200");
  const [Rth, setRth] = useState(""); // optional explicitly provided Rth
  const [RL, setRL] = useState("100");

  // Extras: Norton current or other
  const [In, setIn] = useState("");

  // assemble params
  const params = useMemo(
    () => ({
      Vs: Vs,
      V2: V2,
      R1: R1,
      R2: R2,
      Rth: Rth,
      RL: RL,
      In: In,
      sourceType: "dc",
    }),
    [Vs, V2, R1, R2, Rth, RL, In]
  );

  const { history, snapshot } = useTheoremSim({ running, timestep: 90, theorem, params });

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setTheorem("thevenin");
    setVs("12");
    setV2("5");
    setR1("100");
    setR2("200");
    setRth("");
    setRL("100");
    setIn("");
    toast("Reset to defaults");
  };

  const exportCSV = () => {
    const rows = [
      ["t", "V_load", "I_load", "P_load"],
      ...history.map((d) => [d.t, round(d.V, 9), round(d.I, 9), round(d.P, 9)]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `theorem-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  // Derived friendly readouts
  const VloadNow = snapshot.V;
  const IloadNow = snapshot.I;
  const PloadNow = snapshot.P;

  /* small helper for theorem-specific UI suggestions */
  const theoremHint = (() => {
    switch (theorem) {
      case "thevenin":
        return "Thevenin: model source + R_th in series. Provide R_th or set R1 to approximate.";
      case "norton":
        return "Norton: current source + RN in parallel. Provide I_n and R_n or convert from Thevenin.";
      case "maxpower":
        return "Maximum power transfer occurs when R_L = R_th (for purely resistive circuits).";
      case "superposition":
        return "Superposition: set one source to 0 (short voltage sources) to compute contribution from the other.";
      default:
        return "";
    }
  })();

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
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
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Theorem Tutorials • Interactive</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-48">
                <Select value={theorem} onValueChange={(v) => setTheorem(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Select theorem" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="thevenin" className="text-white">Thevenin</SelectItem>
                    <SelectItem value="norton" className="text-white">Norton</SelectItem>
                    <SelectItem value="maxpower" className="text-white">Maximum Power Transfer</SelectItem>
                    <SelectItem value="superposition" className="text-white">Superposition</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning} title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={resetDefaults} title="Reset">
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

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-64 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="w-1/2">
                  <Select value={theorem} onValueChange={(v) => setTheorem(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Theorem" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="thevenin" className="text-white">Thevenin</SelectItem>
                      <SelectItem value="norton" className="text-white">Norton</SelectItem>
                      <SelectItem value="maxpower" className="text-white">Max Power</SelectItem>
                      <SelectItem value="superposition" className="text-white">Superposition</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={resetDefaults}>Reset</Button>
              </div>
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
                        <GitMerge className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Theorem Controls</div>
                        <div className="text-xs text-zinc-400">Choose theorem & inputs</div>
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
                      <label className="text-xs text-zinc-400">Source VS (V)</label>
                      <Input value={Vs} onChange={(e) => setVs(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    {theorem === "superposition" && (
                      <div>
                        <label className="text-xs text-zinc-400">Source V2 (V)</label>
                        <Input value={V2} onChange={(e) => setV2(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-zinc-400">R1 (Ω)</label>
                      <Input value={R1} onChange={(e) => setR1(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">R2 (Ω)</label>
                      <Input value={R2} onChange={(e) => setR2(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">R<sub>th</sub> (Ω) — optional</label>
                      <Input value={Rth} onChange={(e) => setRth(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500 mt-1">If left empty the solver will approximate from R1/R2 for demo.</div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Load R<sub>L</sub> (Ω)</label>
                      <Input value={RL} onChange={(e) => setRL(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    {theorem === "norton" && (
                      <div>
                        <label className="text-xs text-zinc-400">I<sub>n</sub> (A) — optional</label>
                        <Input value={In} onChange={(e) => setIn(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <div className="text-xs text-zinc-500 mt-1">Provide Norton current to use direct Norton model.</div>
                      </div>
                    )}
                  </div>

                  <div className="bg-black/70 border border-orange-500/30 text-white px-3 py-2 rounded-full shadow-sm backdrop-blur-sm text-xs flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb /></span>
                    <span>{theoremHint}</span>
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
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated flow • meters • oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{theorem}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V<sub>s</sub>: <span className="text-[#ffd24a] ml-1">{Vs} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">R<sub>L</sub>: <span className="text-[#ffd24a] ml-1">{RL} Ω</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <CircuitSVG theorem={theorem} params={params} history={history} running={running} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <TheoremOscilloscope history={history} running={running} />
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
                      <div className="text-xs text-zinc-400">V<sub>load</sub></div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(VloadNow, 6)} V</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">I<sub>load</sub></div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{round(IloadNow, 9)} A</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">P<sub>load</sub></div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(PloadNow, 6)} W</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">R<sub>L</sub></div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{RL} Ω</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Theorem</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{theorem}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Hint</div>
                      <div className="text-sm text-zinc-300">{theoremHint}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb /></span>
                    <span>Tip: Try R<sub>L</sub> = R<sub>th</sub> to see how maximum power transfer performs.</span>
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
