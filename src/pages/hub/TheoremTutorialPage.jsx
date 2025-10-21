// src/pages/TheoremTutorialPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  BookOpen,
  Activity,
  Play,
  Pause,
  Cpu,
  Download,
  Settings,
  Menu,
  X,
  RefreshCcw,
  Users,
  Lightbulb,
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
} from "recharts";

/* ============================
   Utilities
   ============================ */
const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const round = (v, p = 6) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** p;
  return Math.round(n * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================
   Improved useTheoremSim hook
   - Avoids max-depth by:
     1) Storing params in a ref (paramsRef) — avoids re-running effects when parent recreates param object
     2) Performing the compute inside RAF loop and updating a stable snapshot state (setSnapshot)
     3) Using slice-based history updates capped at maxHistory
     4) Minimal effect dependency list
   - API: useTheoremSim({ running, stepMs, theorem, params })
     returns: { history, snapshot } where snapshot = { probeV, probeI, power, Vth, Rth, In }
   ============================ */
function useTheoremSim({
  running,
  stepMs = 80,
  theorem = "superposition",
  params = {},
  maxHistory = 720,
} = {}) {
  // initial bounded buffer
  const initial = useRef(Array.from({ length: 200 }, (_, i) => ({ t: i, probeV: 0, probeI: 0, power: 0 })));
  const [history, setHistory] = useState(initial.current);

  // snapshot holds the latest computed physics state (stable object in state)
  const [snapshot, setSnapshot] = useState({ probeV: 0, probeI: 0, power: 0, Vth: 0, Rth: 0, In: 0 });

  // keep params in ref to avoid re-triggering RAF effect when parent re-creates the params object
  const paramsRef = useRef(params);
  useEffect(() => {
    // shallow copy numeric-cleaned values into paramsRef
    paramsRef.current = {
      V1: toNum(params.V1, 0),
      V2: toNum(params.V2, 0),
      I1: toNum(params.I1, 0),
      R1: Math.max(1e-6, toNum(params.R1, 1e-6)),
      R2: Math.max(1e-6, toNum(params.R2, 1e-6)),
      RL: Math.max(1e-6, toNum(params.RL, 1e-6)),
      Rs: Math.max(1e-6, toNum(params.Rs, 1e-6)),
      Rs2: Math.max(1e-6, toNum(params.Rs2, 1e-6)),
    };
  }, [params.V1, params.V2, params.I1, params.R1, params.R2, params.RL, params.Rs, params.Rs2]);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // compute function (pure) — uses only numeric values
  const computeTheoremStatePure = useCallback((p, thName) => {
    const V1 = Number(p.V1 || 0);
    const V2 = Number(p.V2 || 0);
    const R1 = Number(p.R1 || 1e-6);
    const R2 = Number(p.R2 || 1e-6);
    const RL = Number(p.RL || 1e-6);
    const Rs = Number(p.Rs || 1e-6);

    let probeV = 0,
      probeI = 0,
      power = 0,
      Vth = 0,
      Rth = 0,
      In = 0;

    switch ((thName || "superposition").toLowerCase()) {
      case "superposition": {
        const v1 = V1 * (RL / (R1 + RL));
        const v2 = V2 * (RL / (R2 + RL));
        probeV = v1 + v2;
        probeI = probeV / RL;
        power = probeV * probeI;
        break;
      }
      case "maxpower": {
        Vth = V1;
        Rth = Rs;
        probeI = Vth / (Rth + RL);
        probeV = probeI * RL;
        power = probeV * probeI;
        break;
      }
      case "thevenin": {
        const v1_oc = V1 * (R2 / (R1 + R2));
        const v2_oc = V2 * (R1 / (R1 + R2));
        Vth = v1_oc + v2_oc;
        Rth = 1 / (1 / R1 + 1 / R2);
        probeV = Vth * (RL / (Rth + RL));
        probeI = probeV / RL;
        power = probeV * probeI;
        In = Rth > 0 ? Vth / Rth : 0;
        break;
      }
      case "sourcetrans": {
        Vth = V1;
        Rth = Rs;
        In = R1 > 0 ? V1 / Rs : 0;
        const Rpar = 1 / (1 / Rs + 1 / RL);
        probeV = In * Rpar;
        probeI = probeV / RL;
        power = probeV * probeI;
        break;
      }
      default: {
        probeV = V1 * (RL / (R1 + RL));
        probeI = probeV / RL;
        power = probeV * probeI;
        break;
      }
    }

    return { probeV: Number(probeV), probeI: Number(probeI), power: Number(power), Vth: Number(Vth), Rth: Number(Rth), In: Number(In) };
  }, []);

  // RAF-driven loop that computes snapshot and appends to history.
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
      if (dt < stepMs) return;
      lastRef.current = ts;
      tRef.current += dt;
      const tSeconds = tRef.current / 1000;

      // get stable params from ref
      const p = paramsRef.current;
      // compute pure steady-state values
      const steady = computeTheoremStatePure(p, theorem);

      // create a small first-order transient to make scope animate
      const tau = clamp((p.RL || 10) * 1e-3, 0.005, 2);
      const alpha = 1 - Math.exp(-tSeconds / tau);

      const probeV = steady.probeV * alpha;
      const probeI = steady.probeI * alpha;
      const power = steady.power * alpha;

      // update snapshot (stable state object)
      setSnapshot({
        probeV,
        probeI,
        power,
        Vth: steady.Vth,
        Rth: steady.Rth,
        In: steady.In,
      });

      // update history with slice pattern and cap
      setHistory((h) => {
        const next = h.slice(); // shallow clone
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, probeV, probeI, power });
        if (next.length > maxHistory) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // Only re-run the loop when `running`, `stepMs`, `theorem`, or the compute callback changes.
    // Note: params stored in paramsRef updated by separate effect above, so not included here (avoids infinite loops).
  }, [running, stepMs, theorem, computeTheoremStatePure, maxHistory]);

  return { history, snapshot };
}

/* ============================
   Theorem Visualizer (unchanged visual style)
   - Kept your structure and styling
   - Uses snapshot from hook
   ============================ */
function TheoremVisualizer({
  theorem = "superposition",
  params = {},
  history = [],
  running,
  userRole = "student",
}) {
  const latest = history.length ? history[history.length - 1] : { probeV: 0, probeI: 0, power: 0 };
  const probeV = latest.probeV || 0;
  const probeI = latest.probeI || 0;
  const power = latest.power || 0;

  const absI = Math.abs(probeI);
  const dotCount = clamp(Math.round(2 + absI * 10), 2, 22);
  const speed = clamp(1.6 / (absI + 0.01), 0.25, 4.5);

  const colorAccent = "#ffd24a";
  const orange = "#ff7a2d";
  const pink = "#ff6a9a";
  const green = "#00ffbf";

  const svgW = 1100;
  const svgH = 340;

  const fmt = (v, unit = "") => (Number.isFinite(Number(v)) ? `${round(v, 6)}${unit}` : `—${unit}`);

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/10 border border-zinc-800 overflow-hidden">
      <div className="flex items-start flex-wrap justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">
              {theorem === "superposition"
                ? "Superposition"
                : theorem === "maxpower"
                ? "Maximum Power Transfer"
                : theorem === "thevenin"
                ? "Thevenin & Norton"
                : theorem === "sourcetrans"
                ? "Source Transformation"
                : "Theorem Tutorial"}
            </div>
            <div className="text-xs text-zinc-400">Interactive theorem visualizer • live probe • oscilloscope</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V<sub>probe</sub>: <span className="text-[#ffd24a] ml-1">{fmt(probeV, " V")}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I<sub>probe</sub>: <span className="text-[#00ffbf] ml-1">{fmt(probeI, " A")}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">P: <span className="text-[#ff9a4a] ml-1">{fmt(power, " W")}</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-72">
          <rect x="20" y="20" width={svgW - 40} height={svgH - 40} rx="12" fill="#050509" stroke="#111" />

{theorem === "superposition" && (
  <g>
    <g transform="translate(140,120)">
      {/* === Source 1 (Left Top) === */}
      <rect
        x="-60"
        y="-40"
        width="70"
        height="80"
        rx="10"
        fill="url(#srcGrad1)"
        stroke="#ff7a2d"
        strokeWidth="1.5"
        filter="drop-shadow(0 0 8px #ff7a2d55)"
      />
      <circle cx="-25" cy="0" r="13" stroke="#ff7a2d" strokeWidth="3" fill="none" />
      <text x="-80" y="-50" fontSize="12" fill="#ffb84a" fontWeight="600">
        V₁
      </text>
      <text x="-80" y="-35" fontSize="10" fill="#bbb">
        {fmt(params.V1, " V")}
      </text>

      {/* === R1 === */}
      <path
        d="M 20 0 H 120"
        stroke="#ffb84a"
        strokeWidth="4"
        strokeDasharray="12 6"
        strokeLinecap="round"
        filter="drop-shadow(0 0 5px #ffb84a55)"
      />
      <text x="60" y="-8" fontSize="11" fill="#ffb84a" fontWeight="500">
        R₁ = {fmt(params.R1, " Ω")}
      </text>

      {/* === Top branch connection → RL → Ground === */}
      <path
        d="M 120 0 L 220 0 L 220 100"
        stroke="#ff7a2d"
        strokeWidth="5"
        strokeLinecap="round"
        filter="drop-shadow(0 0 8px #ff7a2d99)"
      />

      {/* === Load resistor RL === */}
      <rect
        x="205"
        y="100"
        width="30"
        height="60"
        rx="6"
        fill="url(#resGrad)"
        stroke="#ffb84a"
        strokeWidth="1.8"
        filter="drop-shadow(0 0 10px #ffb84a44)"
      />
      <text x="250" y="135" fontSize="11" fill="#ffb84a">
        RL = {fmt(params.RL, " Ω")}
      </text>

      {/* === Ground symbol === */}
      <line x1="220" y1="160" x2="220" y2="168" stroke="#777" strokeWidth="2" />
      <line x1="210" y1="168" x2="230" y2="168" stroke="#777" strokeWidth="2" />
      <line x1="212" y1="172" x2="228" y2="172" stroke="#777" strokeWidth="1.6" />

      {/* === Source 2 (Bottom Left) === */}
      <rect
        x="-60"
        y="100"
        width="70"
        height="80"
        rx="10"
        fill="url(#srcGrad2)"
        stroke="#00ffd0"
        strokeWidth="1.5"
        filter="drop-shadow(0 0 8px #00ffd055)"
      />
      <circle cx="-25" cy="140" r="13" stroke="#00ffd0" strokeWidth="3" fill="none" />
      <text x="-80" y="90" fontSize="12" fill="#00ffd0" fontWeight="600">
        V₂
      </text>
      <text x="-80" y="105" fontSize="10" fill="#bbb">
        {fmt(params.V2, " V")}
      </text>

      {/* === R2 === */}
      <path
        d="M 20 140 H 120"
        stroke="#00ffd0"
        strokeWidth="4"
        strokeDasharray="12 6"
        strokeLinecap="round"
        filter="drop-shadow(0 0 5px #00ffd055)"
      />
      <text x="60" y="130" fontSize="11" fill="#00ffd0" fontWeight="500">
        R₂ = {fmt(params.R2, " Ω")}
      </text>

      {/* === Lower branch join to top node === */}
      <path
        d="M 120 140 L 220 0"
        stroke="#333"
        strokeWidth="2"
        strokeDasharray="4 6"
      />

      {/* === Node indicator (glowing based on probeV) === */}
      <circle
        cx="220"
        cy="0"
        r="10"
        fill="url(#nodePulse)"
        stroke="#ffb84a"
        strokeWidth="1.5"
        filter="drop-shadow(0 0 8px #ffb84a99)"
      />
      <text x="240" y="-5" fontSize="12" fill="#ffb84a" fontWeight="600">
        Vnode = {fmt(latest?.probeV || 0, " V")}
      </text>

      {/* === Gradient defs for realism === */}
      <defs>
        <linearGradient id="srcGrad1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a0a00" />
          <stop offset="100%" stopColor="#2b1400" />
        </linearGradient>
        <linearGradient id="srcGrad2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#001a15" />
          <stop offset="100%" stopColor="#002b24" />
        </linearGradient>
        <linearGradient id="resGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1900" />
          <stop offset="100%" stopColor="#1a0f00" />
        </linearGradient>
        <radialGradient id="nodePulse" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffb84a" stopOpacity="1" />
          <stop offset="100%" stopColor="#ffb84a" stopOpacity="0.1" />
        </radialGradient>
      </defs>
    </g>

    {/* === Animated current flow (lines/arrows) === */}
    {Array.from({ length: dotCount }).map((_, i) => {
      const delay = (i / dotCount) * speed;
      const pathV1 = `M 80 120 H 220`;
      const pathV2 = `M 80 260 L 220 120`;

      const styleV1 = {
        offsetPath: `path('${pathV1}')`,
        animation: `flowFutur ${speed}s linear ${-delay}s infinite`,
        animationPlayState: running ? "running" : "paused",
      };
      const styleV2 = {
        offsetPath: `path('${pathV2}')`,
        animation: `flowFutur ${speed}s linear ${-delay}s infinite`,
        animationPlayState: running ? "running" : "paused",
      };

      return (
        <g key={`flow-${i}`}>
          <polygon
            points="0,0 6,3 0,6"
            fill="#ffb84a"
            style={styleV1}
            opacity="0.9"
          />
          <polygon
            points="0,0 6,3 0,6"
            fill="#00ffd0"
            style={styleV2}
            opacity="0.9"
          />
        </g>
      );
    })}

    {/* === Animations === */}
    <style>{`
      @keyframes flowFutur {
        0% { offset-distance: 0%; opacity: 0.9; transform: scale(0.9); }
        40% { opacity: 1; transform: scale(1.1); }
        100% { offset-distance: 100%; opacity: 0; transform: scale(0.85); }
      }

      circle[fill*="nodePulse"] {
        animation: pulseNode 2s ease-in-out infinite;
      }

      @keyframes pulseNode {
        0%, 100% { r: 10; filter: drop-shadow(0 0 6px #ffb84a88); }
        50% { r: 12; filter: drop-shadow(0 0 12px #ffb84a); }
      }
    `}</style>
  </g>
)}



{theorem === "maxpower" && (
  <g>
    {/* === LEFT PANEL: Thevenin Equivalent Source === */}
    <g transform="translate(80,100)">
      <rect
        x="0"
        y="-50"
        width="260"
        height="140"
        rx="14"
        fill="url(#gradMaxBg)"
        stroke="#222"
        filter="drop-shadow(0 0 10px #000)"
      />
      <text x="20" y="-25" fontSize="13" fill="#ffb84a" fontWeight="600">
        Thevenin Equivalent Network
      </text>

      {/* Voltage Source Symbol */}
      <circle
        cx="40"
        cy="30"
        r="14"
        stroke="#ff7a2d"
        strokeWidth="3"
        fill="none"
      />
      <text x="30" y="35" fontSize="10" fill="#ffb84a">
        Vth
      </text>
      <text x="20" y="55" fontSize="10" fill="#ccc">
        {fmt(params.V1, " V")}
      </text>

      {/* Series Resistance */}
      <path
        d="M 60 30 H 150"
        stroke="#ffb84a"
        strokeWidth="4"
        strokeDasharray="10 6"
        filter="drop-shadow(0 0 6px #ffb84a88)"
      />
      <text x="90" y="20" fontSize="11" fill="#ffb84a">
        Rth = {fmt(params.Rs, " Ω")}
      </text>

      {/* Load RL */}
      <rect
        x="180"
        y="10"
        width="50"
        height="40"
        rx="6"
        fill={
          params.RL === Number(params.Rs)
            ? "url(#gradMaxRLGlow)"
            : "url(#gradMaxRL)"
        }
        stroke={params.RL === Number(params.Rs) ? "#ffd24a" : "#222"}
        strokeWidth={params.RL === Number(params.Rs) ? 2.5 : 1.2}
        filter={
          params.RL === Number(params.Rs)
            ? "drop-shadow(0 0 10px #ffd24a88)"
            : "drop-shadow(0 0 6px #ff7a2d44)"
        }
      />
      <text
        x="182"
        y="65"
        fontSize="11"
        fill={params.RL === Number(params.Rs) ? "#ffd24a" : "#fff"}
        fontWeight={params.RL === Number(params.Rs) ? 600 : 400}
      >
        RL = {fmt(params.RL, " Ω")}
      </text>

      {/* Annotation */}
      <text
        x="70"
        y="100"
        fontSize="11"
        fill={params.RL === Number(params.Rs) ? "#00ffbf" : "#bbb"}
        fontWeight="600"
      >
        {params.RL === Number(params.Rs)
          ? "✓ Maximum Power Condition Met (RL = Rth)"
          : "Adjust RL for Max Power"}
      </text>

      {/* Electron Flow Animation */}
      {Array.from({ length: dotCount }).map((_, i) => {
        const pathStr = `M 60 30 H 230`;
        const delay = (i / dotCount) * speed;
        const color =
          params.RL === Number(params.Rs) ? "#ffd24a" : "#ff7a2d";
        const style = {
          offsetPath: `path('${pathStr}')`,
          animation: `flowMaxPower ${speed}s linear ${-delay}s infinite`,
          animationPlayState: running ? "running" : "paused",
        };
        return (
          <circle
            key={`mp-dot-${i}`}
            r="3.5"
            fill={color}
            style={style}
            filter={`drop-shadow(0 0 8px ${color}90)`}
          />
        );
      })}
    </g>

    {/* === RIGHT PANEL: Power Indicator === */}
    <g transform="translate(400,100)">
      <rect
        x="0"
        y="-40"
        width="200"
        height="120"
        rx="14"
        fill="url(#gradMeterBg)"
        stroke="#222"
        filter="drop-shadow(0 0 8px #000)"
      />
      <text x="20" y="-18" fontSize="13" fill="#00ffd0" fontWeight="600">
        Load Power Indicator
      </text>

      {/* Power Bar */}
      <rect
        x="30"
        y="20"
        width="140"
        height="20"
        rx="6"
        fill="#111"
        stroke="#222"
      />
      <rect
        x="30"
        y="20"
        width={Math.min(
          140,
          (params.RL === Number(params.Rs) ? 140 : 140 * 0.6)
        )}
        height="20"
        rx="6"
        fill={
          params.RL === Number(params.Rs)
            ? "url(#gradPowerGlow)"
            : "url(#gradPowerNormal)"
        }
        filter={
          params.RL === Number(params.Rs)
            ? "drop-shadow(0 0 8px #ffd24a)"
            : "drop-shadow(0 0 4px #ff7a2d44)"
        }
      />

      <text
        x="100"
        y="60"
        fontSize="12"
        textAnchor="middle"
        fill={
          params.RL === Number(params.Rs) ? "#ffd24a" : "#ffb84a"
        }
      >
        P = {fmt(latest?.power || 0, " W")}
      </text>

      {params.RL === Number(params.Rs) && (
        <text
          x="100"
          y="85"
          fontSize="11"
          textAnchor="middle"
          fill="#00ffbf"
        >
          ✅ Maximum Power Delivered
        </text>
      )}
    </g>

    {/* === DEFINITIONS === */}
    <defs>
      <linearGradient id="gradMaxBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0a0a0a" />
        <stop offset="100%" stopColor="#141414" />
      </linearGradient>
      <linearGradient id="gradMaxRL" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#222" />
        <stop offset="100%" stopColor="#111" />
      </linearGradient>
      <linearGradient id="gradMaxRLGlow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffd24a" />
        <stop offset="100%" stopColor="#ffb84a" />
      </linearGradient>
      <linearGradient id="gradMeterBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0a0a0a" />
        <stop offset="100%" stopColor="#101010" />
      </linearGradient>
      <linearGradient id="gradPowerNormal" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ff7a2d" />
        <stop offset="100%" stopColor="#ffb84a" />
      </linearGradient>
      <linearGradient id="gradPowerGlow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ffd24a" />
        <stop offset="100%" stopColor="#ffeb9a" />
      </linearGradient>
    </defs>

    {/* === ANIMATIONS === */}
    <style>{`
      @keyframes flowMaxPower {
        0% { offset-distance: 0%; opacity: 1; transform: scale(0.85); }
        50% { opacity: 0.9; transform: scale(1.05); }
        100% { offset-distance: 100%; opacity: 0; transform: scale(0.9); }
      }
    `}</style>
  </g>
)}


          {theorem === "thevenin" && (
  <g>
    {/* === ORIGINAL NETWORK === */}
    <g transform="translate(80,80)">
      <rect
        x="0"
        y="0"
        width="260"
        height="200"
        rx="14"
        fill="url(#gradNetBg)"
        stroke="#222"
        filter="drop-shadow(0 0 6px #111)"
      />
      <text x="20" y="22" fontSize="13" fill="#ffb84a" fontWeight="600">
        Original Network
      </text>
      <text x="20" y="48" fontSize="11" fill="#ddd">
        V₁ = {fmt(params.V1, " V")}    R₁ = {fmt(params.R1, " Ω")}
      </text>
      <text x="20" y="68" fontSize="11" fill="#ddd">
        V₂ = {fmt(params.V2, " V")}    R₂ = {fmt(params.R2, " Ω")}
      </text>

      {/* Stylized circuit lines */}
      <path
        d="M 40 110 H 180"
        stroke="#ff7a2d"
        strokeWidth="4"
        strokeDasharray="10 6"
        filter="drop-shadow(0 0 6px #ff7a2d66)"
      />
      <path
        d="M 40 150 H 180"
        stroke="#00ffd0"
        strokeWidth="4"
        strokeDasharray="10 6"
        filter="drop-shadow(0 0 6px #00ffd066)"
      />

      {/* Voltage Sources */}
      <circle cx="30" cy="110" r="10" stroke="#ff7a2d" strokeWidth="3" fill="none" />
      <circle cx="30" cy="150" r="10" stroke="#00ffd0" strokeWidth="3" fill="none" />
      <text x="18" y="113" fontSize="10" fill="#ffb84a">V₁</text>
      <text x="18" y="153" fontSize="10" fill="#00ffd0">V₂</text>

      {/* Node Output */}
      <circle
        cx="200"
        cy="130"
        r="9"
        fill="url(#gradNodePulse)"
        stroke="#ffb84a"
        strokeWidth="1.5"
        filter="drop-shadow(0 0 8px #ffb84a)"
      />
      <text x="215" y="134" fontSize="11" fill="#ffb84a" fontWeight="600">
        Vth = {fmt(latest?.Vth ?? 0, " V")}
      </text>
    </g>

    {/* === THEVENIN EQUIVALENT === */}
    <g transform="translate(380,100)">
      <rect
        x="0"
        y="0"
        width="300"
        height="140"
        rx="14"
        fill="url(#gradTheveninBg)"
        stroke="#333"
        filter="drop-shadow(0 0 8px #111)"
      />
      <text x="20" y="20" fontSize="13" fill="#ffb84a" fontWeight="600">
        Thevenin Equivalent
      </text>

      {/* Thevenin Voltage Source */}
      <circle cx="60" cy="70" r="14" stroke="#ff7a2d" strokeWidth="3" fill="none" />
      <text x="50" y="105" fontSize="11" fill="#ffb84a">
        Vth = {fmt(latest?.Vth ?? 0, " V")}
      </text>

      {/* Thevenin Resistance */}
      <path
        d="M 75 70 H 150"
        stroke="#ffb84a"
        strokeWidth="4"
        strokeDasharray="10 5"
        filter="drop-shadow(0 0 5px #ffb84a66)"
      />
      <text x="100" y="60" fontSize="11" fill="#ffb84a">
        Rth = {fmt(latest?.Rth ?? 0, " Ω")}
      </text>

      {/* Load RL */}
      <rect
        x="180"
        y="50"
        width="50"
        height="40"
        rx="6"
        fill="url(#gradRes)"
        stroke="#ffb84a"
        strokeWidth="1.5"
        filter="drop-shadow(0 0 8px #ffb84a55)"
      />
      <text x="240" y="70" fontSize="11" fill="#ffb84a">
        RL = {fmt(params.RL, " Ω")}
      </text>

      {/* Animated energy flow */}
      {Array.from({ length: dotCount }).map((_, i) => {
        const delay = (i / dotCount) * speed;
        const pathStr = `M 60 70 H 230`;
        const style = {
          offsetPath: `path('${pathStr}')`,
          animation: `flowThevenin ${speed}s linear ${-delay}s infinite`,
          animationPlayState: running ? "running" : "paused",
        };
        return (
          <polygon
            key={`thdot-${i}`}
            points="0,0 6,3 0,6"
            fill="#ffb84a"
            style={style}
          />
        );
      })}
    </g>

    {/* === DEFINITIONS === */}
    <defs>
      <linearGradient id="gradNetBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0a0a0a" />
        <stop offset="100%" stopColor="#111" />
      </linearGradient>
      <linearGradient id="gradTheveninBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0d0d0d" />
        <stop offset="100%" stopColor="#141414" />
      </linearGradient>
      <linearGradient id="gradRes" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#332000" />
        <stop offset="100%" stopColor="#1a0e00" />
      </linearGradient>
      <radialGradient id="gradNodePulse" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#ffb84a" stopOpacity="1" />
        <stop offset="100%" stopColor="#ffb84a" stopOpacity="0.1" />
      </radialGradient>
    </defs>

    {/* === ANIMATIONS === */}
    <style>{`
      @keyframes flowThevenin {
        0% { offset-distance: 0%; opacity: 0.9; transform: scale(0.9); }
        40% { opacity: 1; transform: scale(1.1); }
        100% { offset-distance: 100%; opacity: 0; transform: scale(0.8); }
      }
      circle[fill*="gradNodePulse"] {
        animation: pulseThNode 2s ease-in-out infinite;
      }
      @keyframes pulseThNode {
        0%,100% { r: 9; filter: drop-shadow(0 0 6px #ffb84a77); }
        50% { r: 11; filter: drop-shadow(0 0 12px #ffb84a); }
      }
    `}</style>
  </g>
)}


         {theorem === "sourcetrans" && (
  <g>
    {/* === VOLTAGE SOURCE REPRESENTATION === */}
    <g transform="translate(80,100)">
      <rect
        x="0"
        y="-50"
        width="220"
        height="120"
        rx="14"
        fill="url(#gradSrcBg)"
        stroke="#222"
        filter="drop-shadow(0 0 8px #111)"
      />
      <text x="16" y="-28" fontSize="13" fill="#ffb84a" fontWeight="600">
        Voltage Source Representation
      </text>

      {/* Voltage Source Symbol */}
      <circle cx="40" cy="20" r="14" stroke="#ff7a2d" strokeWidth="3" fill="none" />
      <text x="32" y="25" fontSize="10" fill="#ffb84a">V₁</text>
      <text x="20" y="45" fontSize="10" fill="#ccc">{fmt(params.V1, " V")}</text>

      {/* Series Resistor */}
      <path
        d="M 60 20 H 160"
        stroke="#ffb84a"
        strokeWidth="4"
        strokeDasharray="10 6"
        filter="drop-shadow(0 0 8px #ffb84a66)"
      />
      <text x="90" y="10" fontSize="11" fill="#ffb84a">
        Rₛ = {fmt(params.Rs, " Ω")}
      </text>

      {/* Load */}
      <rect
        x="180"
        y="0"
        width="40"
        height="40"
        rx="6"
        fill="url(#gradResST)"
        stroke="#ff7a2d"
        strokeWidth="1.5"
        filter="drop-shadow(0 0 6px #ff7a2d55)"
      />
      <text x="180" y="60" fontSize="11" fill="#ffb84a">
        RL = {fmt(params.RL, " Ω")}
      </text>

      {/* Flow animation voltage → load */}
      {Array.from({ length: dotCount }).map((_, i) => {
        const pathStr = `M 60 20 H 180`;
        const delay = (i / dotCount) * speed;
        const style = {
          offsetPath: `path('${pathStr}')`,
          animation: `flowSrcTrans ${speed}s linear ${-delay}s infinite`,
          animationPlayState: running ? "running" : "paused",
        };
        return (
          <circle
            key={`srcV-${i}`}
            r="3"
            fill="#ffb84a"
            style={style}
            filter="drop-shadow(0 0 6px #ff7a2d)"
          />
        );
      })}
    </g>

    {/* === EQUIVALENCE ARROW === */}
    <g transform="translate(320,140)">
      <polygon
        points="0,-6 60,-6 60,-16 80,0 60,16 60,6 0,6"
        fill="url(#gradArrow)"
        filter="drop-shadow(0 0 8px #ffb84a)"
      />
      <text x="12" y="30" fontSize="11" fill="#ffb84a" fontWeight="500">
        Equivalent Form
      </text>
    </g>

    {/* === CURRENT SOURCE REPRESENTATION === */}
    <g transform="translate(440,100)">
      <rect
        x="0"
        y="-50"
        width="260"
        height="120"
        rx="14"
        fill="url(#gradEqBg)"
        stroke="#222"
        filter="drop-shadow(0 0 8px #111)"
      />
      <text x="16" y="-28" fontSize="13" fill="#00ffd0" fontWeight="600">
        Current Source Representation
      </text>

      {/* Current Source Symbol */}
      <circle cx="50" cy="20" r="14" stroke="#00ffd0" strokeWidth="3" fill="none" />
      <text x="40" y="25" fontSize="10" fill="#00ffd0">Ieq</text>
      <text x="30" y="45" fontSize="10" fill="#ccc">
        = V/R = {fmt(params.V1 / (params.Rs || 1e-6), " A")}
      </text>

      {/* Parallel Resistor */}
      <rect
        x="120"
        y="-10"
        width="40"
        height="60"
        rx="6"
        fill="url(#gradResST)"
        stroke="#00ffd0"
        strokeWidth="1.5"
        filter="drop-shadow(0 0 6px #00ffd055)"
      />
      <text x="120" y="65" fontSize="11" fill="#00ffd0">
        Rₛ = {fmt(params.Rs, " Ω")}
      </text>

      {/* Load (parallel to Rs) */}
      <rect
        x="190"
        y="-10"
        width="40"
        height="60"
        rx="6"
        fill="url(#gradResST)"
        stroke="#00ffd0"
        strokeWidth="1.5"
        filter="drop-shadow(0 0 6px #00ffd055)"
      />
      <text x="190" y="65" fontSize="11" fill="#00ffd0">
        RL = {fmt(params.RL, " Ω")}
      </text>

      {/* Parallel connection line */}
      <path
        d="M 50 20 H 230"
        stroke="#00ffd0"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="8 6"
        filter="drop-shadow(0 0 6px #00ffd055)"
      />

      {/* Animated flow from current source splitting into Rs and RL */}
      {Array.from({ length: dotCount }).map((_, i) => {
        const delay = (i / dotCount) * speed;
        const pathStr = `M 50 20 H 230`;
        const style = {
          offsetPath: `path('${pathStr}')`,
          animation: `flowSrcTrans ${speed}s linear ${-delay}s infinite`,
          animationPlayState: running ? "running" : "paused",
        };
        return (
          <circle
            key={`srcI-${i}`}
            r="3"
            fill="#00ffd0"
            style={style}
            filter="drop-shadow(0 0 6px #00ffd0)"
          />
        );
      })}
    </g>

    {/* === DEFINITIONS === */}
    <defs>
      <linearGradient id="gradSrcBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0a0a0a" />
        <stop offset="100%" stopColor="#151515" />
      </linearGradient>
      <linearGradient id="gradEqBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0a0a0a" />
        <stop offset="100%" stopColor="#101010" />
      </linearGradient>
      <linearGradient id="gradArrow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ff7a2d" />
        <stop offset="100%" stopColor="#00ffd0" />
      </linearGradient>
      <linearGradient id="gradResST" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#222" />
        <stop offset="100%" stopColor="#111" />
      </linearGradient>
    </defs>

    {/* === ANIMATIONS === */}
    <style>{`
      @keyframes flowSrcTrans {
        0% { offset-distance: 0%; opacity: 0.9; transform: scale(0.8); }
        40% { opacity: 1; transform: scale(1.1); }
        100% { offset-distance: 100%; opacity: 0; transform: scale(0.8); }
      }
    `}</style>
  </g>
)}


          <g transform={`translate(${svgW - 260},20)`}>
            <rect x="-10" y="-10" width="240" height="220" rx="12" fill="#060606" stroke="#222" />
            <text x="6" y="8" fontSize="12" fill="#ffb57a">Theorem Readouts</text>

            <text x="6" y="36" fontSize="12" fill="#fff">V<sub>probe</sub>: <tspan fill="#ffd24a">{fmt(probeV," V")}</tspan></text>
            <text x="6" y="56" fontSize="12" fill="#fff">I<sub>probe</sub>: <tspan fill="#00ffbf">{fmt(probeI," A")}</tspan></text>
            <text x="6" y="76" fontSize="12" fill="#fff">P: <tspan fill="#ff9a4a">{fmt(power," W")}</tspan></text>
          </g>

          <style>{`
            @keyframes flowTheorem {
              0% { offset-distance: 0%; opacity: 0.95; transform: scale(0.95); }
              45% { opacity: 0.9; transform: scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: scale(0.8); }
            }
          `}</style>
        </svg>
      </div>
    </div>
  );
}

/* ============================
   Oscilloscope (unchanged)
   ============================ */
function TheoremOscilloscope({ history = [], running }) {
  const data = useMemo(() => history.slice(-360).map((d, idx) => ({
    t: idx,
    V: round(d.probeV, 6),
    I: round(d.probeI, 9),
    P: round(d.power, 8),
  })), [history]);

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — Probe Voltage & Current</div>
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
            <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="V (V)" />
            <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="I (A)" />
            <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="P (W)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page Component
   - Uses the improved hook and stable patterns
   ============================ */
export default function TheoremTutorialPage() {
  const [theorem, setTheorem] = useState("superposition");
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userRole, setUserRole] = useState("student");

  // params kept as simple scalar state so updates are explicit
  const [V1, setV1] = useState(12);
  const [V2, setV2] = useState(6);
  const [I1, setI1] = useState(0);
  const [R1, setR1] = useState(10);
  const [R2, setR2] = useState(10);
  const [RL, setRL] = useState(10);
  const [Rs, setRs] = useState(10);
  const [Rs2, setRs2] = useState(10);

  // Build params object but memoize it (so identity stable unless values change)
  const params = useMemo(() => ({
    V1, V2, I1, R1, R2, RL, Rs, Rs2,
  }), [V1, V2, I1, R1, R2, RL, Rs, Rs2]);

  // derived values from hook's snapshot
  const { history, snapshot } = useTheoremSim({
    running,
    stepMs: 80,
    theorem,
    params,
    maxHistory: 720,
  });

  const [derived, setDerived] = useState({ Vth: null, Rth: null, In: null });

  // update derived when snapshot changes (stable update)
  useEffect(() => {
    setDerived({
      Vth: Number.isFinite(snapshot.Vth) ? snapshot.Vth : null,
      Rth: Number.isFinite(snapshot.Rth) ? snapshot.Rth : null,
      In: Number.isFinite(snapshot.In) ? snapshot.In : null,
    });
  }, [snapshot]);

  // handlers with numeric parsing & validation to avoid NaN in state
  const updateParam = (key, value) => {
    const n = value === "" ? 0 : Number(value);
    switch (key) {
      case "V1": setV1(Number.isFinite(n) ? n : 0); break;
      case "V2": setV2(Number.isFinite(n) ? n : 0); break;
      case "I1": setI1(Number.isFinite(n) ? n : 0); break;
      case "R1": setR1(Number.isFinite(n) ? Math.max(1e-6, n) : 1e-6); break;
      case "R2": setR2(Number.isFinite(n) ? Math.max(1e-6, n) : 1e-6); break;
      case "RL": setRL(Number.isFinite(n) ? Math.max(1e-6, n) : 1e-6); break;
      case "Rs": setRs(Number.isFinite(n) ? Math.max(1e-6, n) : 1e-6); break;
      case "Rs2": setRs2(Number.isFinite(n) ? Math.max(1e-6, n) : 1e-6); break;
      default: break;
    }
  };

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
  // Reset to defaults
  const resetDefaults = () => {
    setTheorem("superposition");
    setV1(12); setV2(6); setI1(0); setR1(10); setR2(10); setRL(10); setRs(10); setRs2(10);
    setRunning(true);
    toast("Reset theorem defaults");
  };

  // Export CSV — safe and synchronous
  const exportCSV = () => {
    const rows = [["t","V_probe","I_probe","P"]];
    history.forEach((d) => rows.push([d.t, round(d.probeV,9), round(d.probeI,9), round(d.power,9)]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `theorem-history-${theorem}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV snapshot");
  };

  // small UI helper
  const roleHint =
    userRole === "student"
      ? "Try changing V1/V2 and see how superposition adds contributions."
      : userRole === "instructor"
      ? "Use the MaxPower preset to demonstrate RL matching in class—toggle RL to Rs for max power."
      : "Expert tip: compute Rth by turning off independent sources (short voltage, open current) and computing net resistance.";

  // keyboard shortcuts: space toggles running, r resets
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        toggleRunning();
      }
      if (e.key === "r") {
        resetDefaults();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable handlers inside

  return (
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Theorem Tutorials — Superposition & More</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-44">
                <Select value={theorem} onValueChange={(v) => setTheorem(v)}>
                  <SelectTrigger className="w-full focus:border-orange-500 bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Select Theorem" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="superposition"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Superposition</SelectItem>
                    <SelectItem value="thevenin"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Thevenin & Norton</SelectItem>
                    <SelectItem value="maxpower"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Maximum Power Transfer</SelectItem>
                    <SelectItem value="sourcetrans"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Source Transformation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={snapshotPNG}>Snapshot</Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning} aria-label="Play / Pause" title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={resetDefaults} aria-label="Reset" title="Reset Defaults">
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border text-orange-400 hover:bg-black hover:text-orange-500 cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="flex-1">
                  <Select value={theorem} onValueChange={(v) => setTheorem(v)}>
                    <SelectTrigger className="w-full focus:border-orange-400 bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Select Theorem" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="superposition"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Superposition</SelectItem>
                      <SelectItem value="thevenin" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Thevenin & Norton</SelectItem>
                      <SelectItem value="maxpower"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Maximum Power</SelectItem>
                      <SelectItem value="sourcetrans"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Source Trans</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 cursor-pointer rounded-md" onClick={snapshotPNG}>Snapshot</Button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="h-16 sm:h-16"></div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Controls</div>
                        <div className="text-xs text-zinc-400">Adjust sources, resistances, and load</div>
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
                      <label className="text-xs text-zinc-400">V1 (V)</label>
                      <Input value={V1} onChange={(e) => updateParam("V1", e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">V2 (V) — used in Superposition / Thevenin</label>
                      <Input value={V2} onChange={(e) => updateParam("V2", e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">I1 (A) — optional current source</label>
                      <Input value={I1} onChange={(e) => updateParam("I1", e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-zinc-400">R1 (Ω)</label>
                        <Input value={R1} onChange={(e) => updateParam("R1", e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">R2 (Ω)</label>
                        <Input value={R2} onChange={(e) => updateParam("R2", e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Load RL (Ω)</label>
                      <Input value={RL} onChange={(e) => updateParam("RL", e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Series Rs (Ω) — used for Thevenin/MaxPower</label>
                      <Input value={Rs} onChange={(e) => updateParam("Rs", e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => { setRunning(true); toast.success("Simulation running"); }}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="flex-1 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1 border cursor-pointer text-orange-400 hover:bg-black hover:text-orange-500 border-zinc-800  p-2" onClick={exportCSV}><Download className="w-4 h-4" /> Export</Button>
                      <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-orange-400 hover:bg-black hover:text-orange-500 p-2" onClick={resetDefaults}><RefreshCcw className="w-4 h-4" /> Reset</Button>
                    </div>
                  </div>

                  <div className="bg-black/70 border border-orange-500/30 text-white px-3 py-2 rounded-md shadow-sm backdrop-blur-sm text-xs flex flex-wrap gap-2 items-center">
                    <span>
                      Tip: <span className="text-white font-semibold">{roleHint}</span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="space-y-2">
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[#ffd24a]">
                    <Users className="w-5 h-5" /> User Role
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    <Button className={`py-2 cursor-pointer text-orange-400 hover:bg-black  text-sm ${userRole === "student" ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" : "bg-black/60 border hover:text-orange-400 border-zinc-800 text-zinc-300"}`} onClick={() => setUserRole("student")}>Student</Button>
                    <Button className={`py-2 text-orange-400 hover:bg-black  cursor-pointer text-sm ${userRole === "instructor" ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" : "bg-black/60 border hover:text-orange-500 border-zinc-800 text-zinc-300"}`} onClick={() => setUserRole("instructor")}>Instructor</Button>
                    <Button className={`py-2 text-orange-400 hover:bg-black  cursor-pointer text-sm ${userRole === "expert" ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" : "bg-black/60 border border-zinc-800 hover:text-orange-500 text-zinc-300"}`} onClick={() => setUserRole("expert")}>Expert</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border snapshot border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Theorem Visualizer</div>
                        <div className="text-xs text-zinc-400">Switch between theorems and interact</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{theorem}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Role: <span className="text-[#ffd24a] ml-1">{userRole}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <TheoremVisualizer theorem={theorem} params={{ ...params, ...derived }} history={history} running={running} userRole={userRole} />
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
                    <Cpu className="w-5 h-5" /> Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Probe Voltage</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(history.length ? history[history.length - 1].probeV : 0, 6)} V</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Probe Current</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{round(history.length ? history[history.length - 1].probeI : 0, 9)} A</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Power</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(history.length ? history[history.length - 1].power : 0, 8)} W</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Vth</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{derived.Vth === null ? "—" : round(derived.Vth, 6)}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Rth</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{derived.Rth === null ? "—" : round(derived.Rth, 6)}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">In</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{derived.In === null ? "—" : round(derived.In, 9)}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb/></span>
                    <span>
                      Pro tip: Toggle between theorems and adjust RL to see how max power occurs when RL = Rth.
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-orange-400 hover:bg-black hover:text-orange-500 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
