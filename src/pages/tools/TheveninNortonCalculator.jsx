// src/pages/TheveninNortonCalculatorPage.jsx
"use client";

/**
 * Thevenin/Norton Calculator — Professional Simulator
 * - Fully responsive layout
 * - Improved circuit visualizer with animated wire glow & moving dash flow
 * - Draggable analog meters with persistent positions (localStorage)
 * - Cleaned imports, accessibility, responsive SVGs and panels
 *
 * Notes:
 * - Update the shadcn/ui imports paths to match your project if needed.
 * - Uses CSS offset-path fallback where available; main visual flow is via animated stroke dash.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useSpring } from "framer-motion";
import { Toaster, toast } from "sonner";
import {
  Zap,
  CircuitBoard,
  Gauge,
  Play,
  Pause,
  Download,
  Settings,
  Activity,
  BookOpen,
  Repeat,
  Menu,
  FileText,
  X,
} from "lucide-react";

// shadcn-like UI components (adjust paths if necessary)
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// Recharts for oscilloscope
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

/* ----------------------------------------
   Utilities (small, safe helpers)
   ---------------------------------------- */
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (v, d = 4) => (Number.isFinite(v) ? Number(Number(v).toFixed(d)) : 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ----------------------------------------
   Thevenin/Norton calculations
   ---------------------------------------- */
function computeTheveninNorton({ Vs, Rs, Rl }) {
  // Basic resistive circuit assumptions (DC/rms style values)
  const Vth = Vs;
  const Rth = Rs;
  const In = Rth !== 0 ? Vth / Rth : 0;
  const Iload = (Rs + Rl) !== 0 ? Vs / (Rs + Rl) : 0;
  const Vload = Iload * Rl;
  const Pload = Iload * Iload * Rl;
  return { Vth, Rth, In, Iload, Vload, Pload };
}

/* ----------------------------------------
   Wave simulation hook (produces history)
   - Buffered RAF commits to avoid rendering thrash
   ---------------------------------------- */
function useCircuitWaveSim({ running, freq = 50, Vs = 12, Rs = 4, Rl = 6, commitMs = 80 }) {
  const [history, setHistory] = useState([]); // {t, Va, Ia}
  const rafRef = useRef(null);
  const lastRef = useRef(performance.now());
  const tRef = useRef(0);
  const bufferRef = useRef([]);
  const lastCommitRef = useRef(performance.now());

  useEffect(() => {
    let alive = true;
    lastRef.current = performance.now();
    lastCommitRef.current = performance.now();

    const w = 2 * Math.PI * (freq || 50);
    const Vpk = Vs * Math.SQRT2;
    const Ipk = (Vs / Math.max(Rs + Rl, 1e-6)) * Math.SQRT2; // avoid divide by zero
    const phi = 0; // resistive circuit (in-phase)

    const step = (ts) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(step);
      if (!running) {
        lastRef.current = ts;
        return;
      }
      const dt = ts - lastRef.current;
      if (dt < 6) {
        lastRef.current = ts;
        return;
      }
      lastRef.current = ts;
      tRef.current += dt;
      const t = tRef.current / 1000;

      const Va = Vpk * Math.sin(w * t);
      const Ia = Ipk * Math.sin(w * t - phi);
      bufferRef.current.push({ t, Va, Ia });

      const now = performance.now();
      if (now - lastCommitRef.current >= commitMs) {
        setHistory((h) => {
          const next = [...h, ...bufferRef.current];
          bufferRef.current.length = 0;
          const maxKeep = 1200;
          if (next.length > maxKeep) return next.slice(next.length - maxKeep);
          return next;
        });
        lastCommitRef.current = now;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (bufferRef.current.length) {
        setHistory((h) => {
          const next = [...h, ...bufferRef.current];
          bufferRef.current.length = 0;
          return next.slice(-1200);
        });
      }
    };
  }, [running, freq, Vs, Rs, Rl, commitMs]);

  return { history };
}

/* ----------------------------------------
   Repositionable Draggable wrapper for meters
   - Stores position in localStorage per id
   - Works on desktop & touch
   ---------------------------------------- */
function Draggable({ id, children, initial = { x: 0, y: 0 }, boundaryRef = null }) {
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem(`meterPos:${id}`);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  const draggingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const rootRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(`meterPos:${id}`, JSON.stringify(pos));
    } catch {}
  }, [id, pos]);

  useEffect(() => {
    const handleMove = (e) => {
      if (!draggingRef.current || !rootRef.current) return;
      const evt = e.touches ? e.touches[0] : e;
      const dx = evt.clientX - startRef.current.clientX;
      const dy = evt.clientY - startRef.current.clientY;
      let nx = startRef.current.x + dx;
      let ny = startRef.current.y + dy;

      // optional boundary clamp to a container rect
      if (boundaryRef && boundaryRef.current) {
        const rect = boundaryRef.current.getBoundingClientRect();
        const elRect = rootRef.current.getBoundingClientRect();
        nx = clamp(nx, 0 - elRect.width / 2 + 12, rect.width - elRect.width / 2 - 12);
        ny = clamp(ny, 0 - elRect.height / 2 + 12, rect.height - elRect.height / 2 - 12);
      }

      setPos({ x: nx, y: ny });
    };

    const handleUp = () => {
      draggingRef.current = false;
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [boundaryRef]);

  const startDrag = (e) => {
    const evt = e.touches ? e.touches[0] : e;
    draggingRef.current = true;
    startRef.current = {
      clientX: evt.clientX,
      clientY: evt.clientY,
      x: pos.x,
      y: pos.y,
    };
    document.body.style.userSelect = "none";
  };

  const reset = () => {
    setPos(initial);
    try {
      localStorage.removeItem(`meterPos:${id}`);
    } catch {}
  };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="draggable-meter"
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        touchAction: "none",
        zIndex: 30,
        cursor: "grab",
      }}
      onPointerDown={startDrag}
      onTouchStart={startDrag}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "inline-block" }}>{children}</div>
        <button
          onClick={reset}
          aria-label="Reset meter"
          style={{
            background: "transparent",
            border: "1px dashed rgba(255,255,255,0.06)",
            color: "#ddd",
            padding: 6,
            borderRadius: 8,
            fontSize: 12,
            opacity: 0.9,
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------
   AnalogMeter (refined)
   - angle range [-80deg .. +80deg]
   - animated needle via framer useSpring
   - compact, responsive, theme-aware
   ---------------------------------------- */
function AnalogMeter({ label = "V", value = 0, max = 20, units = "V", color = "#ffd24a", size = 160 }) {
  const percent = clamp(value / max, 0, 1);
  const angleRange = 160;
  const angle = -80 + percent * angleRange;
  const spring = useSpring(angle, { stiffness: 120, damping: 18, mass: 0.6 });

  const glowIntensity = 0.25 + 0.75 * percent;
  const glowColor = percent > 0.85 ? "#ff4d4d" : color;

  const tickCount = 9;
  const ticks = Array.from({ length: tickCount }).map((_, i) => {
    const t = -80 + (i / (tickCount - 1)) * 160;
    const rad = (t * Math.PI) / 180;
    const rOuter = 0.43 * size;
    const rInner = 0.33 * size;
    const x1 = Math.cos(rad) * rOuter;
    const y1 = Math.sin(rad) * rOuter;
    const x2 = Math.cos(rad) * rInner;
    const y2 = Math.sin(rad) * rInner;
    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={i / (tickCount - 1) > 0.85 ? "#ff6b6b" : "#bbb"}
        strokeWidth={i % 2 === 0 ? 2 : 1}
        strokeLinecap="round"
      />
    );
  });

  // scale to requested size
  const viewBoxSize = 160;
  const scale = size / viewBoxSize;

  return (
    <motion.div
      className="select-none"
      style={{ width: size, height: size * 0.65, display: "inline-block", transformOrigin: "center" }}
    >
      <svg viewBox="0 0 160 104" style={{ width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id="arcGrad2" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#00d4ff" />
            <stop offset="60%" stopColor="#ffd24a" />
            <stop offset="100%" stopColor="#ff6b6b" />
          </linearGradient>
          <filter id="glowSmallMeter">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width="160" height="104" rx="10" fill="#060606" />

        <g transform="translate(80,58)">
          <path d="M -68 0 A 68 68 0 0 1 68 0" stroke="#192024" strokeWidth="10" fill="none" strokeLinecap="round" />
          <path
            d={`M -68 0 A 68 68 0 0 1 ${Math.cos((angle * Math.PI) / 180) * 68} ${Math.sin((angle * Math.PI) / 180) * 68}`}
            stroke="url(#arcGrad2)"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            filter="url(#glowSmallMeter)"
          />
          {ticks}
          <motion.line
            x1={0}
            y1={0}
            x2={0}
            y2={-48}
            stroke={glowColor}
            strokeWidth="3.5"
            strokeLinecap="round"
            style={{
              rotate: spring,
              filter: `drop-shadow(0 0 ${6 * glowIntensity}px ${glowColor})`,
            }}
            transformOrigin="0 0"
          />
          <circle r="6" fill="#0b0b0b" stroke={glowColor} strokeWidth="1.5" />
          <circle r="2" fill={glowColor} />
        </g>

        <rect x="26" y="78" width="108" height="18" rx="6" fill="rgba(255,255,255,0.03)" />
        <text x="80" y="88" fontSize="9" fill="#9aa4ad" textAnchor="middle">
          {label}
        </text>
        <text x="80" y="98" fontSize="11" fill="#fff" textAnchor="middle" fontWeight="700">
          {round(value, 3)} {units}
        </text>
      </svg>
    </motion.div>
  );
}

/* ----------------------------------------
   Circuit visualizer
   - Responsive SVG, animated wire glow & dashes
   - small flow particles (via CSS offset-path where supported)
   - Draggable meters overlay
   ---------------------------------------- */
function CircuitVisualizer({ Vs, Rs, Rl, mode = "thevenin", running = true }) {
  const { Iload, Vload } = useMemo(() => computeTheveninNorton({ Vs, Rs, Rl }), [Vs, Rs, Rl]);
  const glow = clamp(Math.abs(Iload) / 2, 0.1, 1);
  const speed = clamp(1 / (Math.abs(Iload) + 0.2), 0.5, 2);

  // Path for current flow dots (used in offset-path)
  const flowPath = `M 100 200 H 220 L 280 140 H 400 L 480 140 H 600 L 660 200 H 780`;

  const dotCount = 15;
  const dots = Array.from({ length: dotCount }).map((_, i) => ({
    id: i,
    delay: (i * 0.1) % 1.2,
    dur: speed * (0.7 + (i % 3) * 0.3),
  }));

  return (
    <div className="p-4 bg-gradient-to-b from-black/30 to-zinc-900/10 border border-zinc-800 rounded-xl relative overflow-hidden">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
          <CircuitBoard className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-[#ffd24a] text-lg font-semibold">Realistic Thevenin / Norton Circuit</h2>
          <p className="text-zinc-400 text-xs">Live current flow simulation</p>
        </div>
      </div>

      <svg viewBox="0 0 880 300" className="w-full h-[260px] sm:h-[300px]">
        <defs>
          {/* wire gradients */}
          <linearGradient id="wireGrad" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#555" />
            <stop offset="50%" stopColor="#999" />
            <stop offset="100%" stopColor="#444" />
          </linearGradient>

          <linearGradient id="flowGrad" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#ffd24a" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffd24a" stopOpacity={0.7 + glow * 0.3} />
            <stop offset="100%" stopColor="#ffd24a" stopOpacity="0" />
          </linearGradient>

          {/* glow effect */}
          <filter id="glow">
            <feGaussianBlur stdDeviation={3 + glow * 4} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* main wire */}
        <path
          d={flowPath}
          stroke="url(#wireGrad)"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        {/* overlay glowing wire */}
        <path
          d={flowPath}
          stroke="url(#flowGrad)"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="25 100"
          style={{
            filter: "url(#glow)",
            animation: running ? `dashFlow ${speed}s linear infinite` : "none",
          }}
        />

        {/* Voltage Source */}
        <g transform="translate(60,200)">
          <circle r="36" fill="#050505" stroke="#444" strokeWidth="2" />
          <circle r="8" fill="#ffd24a" />
          <text x="-12" y="5" fill="#ffd24a" fontWeight="bold" fontSize="14">Vs</text>
        </g>

        {/* Rs resistor */}
        <g transform="translate(220,160)">
          <polyline
            points="0,20 10,0 20,40 30,0 40,40 50,0 60,40 70,0 80,40 90,20"
            stroke="#ffd24a"
            strokeWidth="3"
            fill="none"
            filter="url(#glow)"
          />
          <text x="35" y="55" fill="#fff" fontSize="12">Rs</text>
        </g>

        {/* Thevenin or Norton */}
        {mode === "thevenin" ? (
          <g transform="translate(330,160)">
            <circle cx="35" cy="20" r="25" fill="#060606" stroke="#555" strokeWidth="2" />
            <text x="25" y="25" fill="#ffd24a" fontSize="12">Vth</text>
            <polyline
              points="70,20 80,0 90,40 100,0 110,40 120,20"
              stroke="#00ffbf"
              strokeWidth="3"
              fill="none"
            />
            <text x="86" y="55" fill="#fff" fontSize="12">Rth</text>
          </g>
        ) : (
          <g transform="translate(330,160)">
            <polyline
              points="0,20 10,0 20,40 30,0 40,40 50,0 60,20"
              stroke="#00ffbf"
              strokeWidth="3"
              fill="none"
            />
            <circle cx="100" cy="20" r="14" fill="#111" stroke="#555" strokeWidth="2" />
            <line x1="100" y1="6" x2="100" y2="34" stroke="#ffd24a" strokeWidth="2" />
            <text x="92" y="50" fill="#ffd24a" fontSize="12">In</text>
          </g>
        )}

        {/* Load Rl */}
        <g transform="translate(480,140)">
          <rect
            x="0"
            y="0"
            width="100"
            height="60"
            rx="10"
            fill="#111"
            stroke="#333"
            strokeWidth="2"
          />
          <text x="38" y="34" fill="#fff" fontSize="12">Rl</text>
        </g>

        {/* Ground */}
        <g transform="translate(780,200)">
          <line x1="0" y1="0" x2="0" y2="20" stroke="#666" strokeWidth="2" />
          <line x1="-10" y1="20" x2="10" y2="20" stroke="#666" strokeWidth="2" />
          <line x1="-6" y1="25" x2="6" y2="25" stroke="#666" strokeWidth="2" />
          <line x1="-3" y1="30" x2="3" y2="30" stroke="#666" strokeWidth="2" />
        </g>

        {/* Current flow arrow */}
        <g transform="translate(660,160)">
          <polygon
            points="0,0 12,10 0,20 0,13 -10,13 -10,7 0,7"
            fill="#ffd24a"
            style={{
              animation: running ? `arrowPulse 1s ease-in-out infinite` : "none",
            }}
          />
        </g>

        {/* Output readings box */}
        <g transform="translate(700,40)">
          <rect x="0" y="0" width="160" height="80" rx="10" fill="#0a0a0a" stroke="#222" />
          <text x="10" y="20" fill="#ffd24a" fontSize="12">Load Readings</text>
          <text x="10" y="42" fill="#fff" fontSize="13">V = {round(Vload, 3)} V</text>
          <text x="10" y="62" fill="#fff" fontSize="13">I = {round(Iload, 4)} A</text>
        </g>
      </svg>

      {/* Flowing dots animation along wire */}
      <div aria-hidden style={{ position: "relative", height: 0, pointerEvents: "none" }}>
        {dots.map((dot) => (
          <div
            key={dot.id}
            className="flow-dot"
            style={{
              position: "absolute",
              width: 8 + Math.min(5, Math.abs(Iload) * 6),
              height: 8 + Math.min(5, Math.abs(Iload) * 6),
              borderRadius: "50%",
              background: "radial-gradient(circle, #ffd24a, #ff7a2d)",
              boxShadow: `0 0 ${6 + glow * 10}px rgba(255,210,74,0.9)`,
              left: -20,
              top: -20,
              offsetPath: `path("${flowPath}")`,
              WebkitOffsetPath: `path("${flowPath}")`,
              animation: running
                ? `dotFlow ${dot.dur}s linear ${dot.delay}s infinite`
                : "none",
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes dashFlow {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -130; }
        }
        @keyframes dotFlow {
          0% { offset-distance: 0%; -webkit-offset-distance: 0%; }
          100% { offset-distance: 100%; -webkit-offset-distance: 100%; }
        }
        @keyframes arrowPulse {
          0%, 100% { opacity: 0.7; transform: translateX(0px); }
          50% { opacity: 1; transform: translateX(5px); }
        }
        @media (max-width: 520px) {
          .flow-dot { display: none; }
        }
      `}</style>
    </div>
  );
}
/* ----------------------------------------
   Oscilloscope panel
   ---------------------------------------- */
function OscilloscopePanel({ history = [], freq = 50, running }) {
  const data = useMemo(
    () =>
      history.slice(-800).map((d, i) => ({
        t: i,
        Va: round(d.Va, 3),
        Ia: round(d.Ia, 4),
      })),
    [history]
  );

  return (
    <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-[#ffd24a] flex items-center gap-2"><Activity className="w-4 h-4" /> Oscilloscope</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-52 sm:h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="#111" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fill: "#888" }} hide={data.length === 0} />
              <YAxis tick={{ fill: "#888" }} />
              <ReTooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #222", color: "#fff",borderRadius:"10px" }} />
              <Legend wrapperStyle={{ color: "#aaa" }} />
              <Line dataKey="Va" stroke="#ffd24a" dot={false} isAnimationActive={false} name="Voltage (V)" />
              <Line dataKey="Ia" stroke="#00ffbf" dot={false} isAnimationActive={false} name="Current (A)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------
   Formulas / explanation panel
   ---------------------------------------- */
function FormulasPanel({ Vs, Rs, Rl }) {
  const { Vth, Rth, In, Iload, Vload, Pload } = computeTheveninNorton({ Vs, Rs, Rl });

  return (
    <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-[#ffd24a] flex items-center gap-2"><BookOpen className="w-4 h-4" /> Formulas & Explanation</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-zinc-300 space-y-2">
        <div><strong>Vth (open-circuit):</strong> Vth = Vs = <span className="text-white">{round(Vth,4)} V</span></div>
        <div><strong>Rth (Thevenin resistance):</strong> Rth = Rs = <span className="text-white">{round(Rth,4)} Ω</span></div>
        <div><strong>Norton current:</strong> In = Vth / Rth = <span className="text-white">{round(In,4)} A</span></div>
        <div><strong>Load current:</strong> Iload = Vs / (Rs + Rl) = <span className="text-white">{round(Iload,4)} A</span></div>
        <div><strong>Load voltage:</strong> Vload = Iload × Rl = <span className="text-white">{round(Vload,4)} V</span></div>
        <div><strong>Load power:</strong> Pload = Iload² × Rl = <span className="text-white">{round(Pload,4)} W</span></div>

        <div className="text-xs text-zinc-400 mt-2">Tip: For maximum power transfer, choose Rl ≈ Rth (source internal resistance).</div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------
   Main Page Component
   ---------------------------------------- */
export default function TheveninNortonCalculatorPage() {
  const [Vs, setVs] = useState("12");
  const [Rs, setRs] = useState("4");
  const [Rl, setRl] = useState("6");
  const [mode, setMode] = useState("thevenin");
  const [running, setRunning] = useState(true);
  const [freq, setFreq] = useState("50");
  const [mobileOpen, setMobileOpen] = useState(false);

  const { history } = useCircuitWaveSim({
    running,
    freq: toNum(freq),
    Vs: toNum(Vs),
    Rs: toNum(Rs),
    Rl: toNum(Rl),
    commitMs: 70,
  });

  const results = useMemo(() => computeTheveninNorton({ Vs: toNum(Vs), Rs: toNum(Rs), Rl: toNum(Rl) }), [Vs, Rs, Rl]);
  const { Vth, Rth, In, Iload, Vload, Pload } = results;

  const toggleRun = useCallback(() => {
    setRunning((r) => {
      const n = !r;
      toast(n ? "Simulation running" : "Simulation paused");
      return n;
    });
  }, []);

  const reset = useCallback(() => {
    setVs("12"); setRs("4"); setRl("6"); setMode("thevenin"); setFreq("50"); setRunning(true);
    toast("Defaults restored");
  }, []);

  const snapshot = useCallback(() => {
    toast.success("Snapshot taken (temporary)");
  }, []);

  const exportCSV = useCallback(() => {
    const header = ["t", "Va", "Ia"];
    const rows = [header];
    history.forEach((d) => rows.push([round(d.t, 5), round(d.Va, 5), round(d.Ia, 6)]));
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thevenin-norton-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  }, [history]);

  // Header component
  const Header = (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-black/60 border-b border-zinc-800 py-2">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm text-zinc-300">SparkLab</div>
              <div className="font-semibold text-xs sm:text-sm md:text-sm text-zinc-400">Thevenin & Norton Calculator</div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="text-xs text-zinc-400">Freq</div>
              <Input value={freq} onChange={(e) => setFreq(e.target.value)} className="w-16 bg-zinc-900/60 border border-zinc-800 text-white text-sm" />
            </div>

            <div className="flex items-center gap-2">
              <Button className="cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={snapshot}>Snapshot</Button>
              <Button variant="ghost" className="border cursor-pointer border-zinc-800" onClick={toggleRun}>{running ? <Pause /> : <Play />}</Button>
              <Button variant="ghost" className="border cursor-pointer border-zinc-800" onClick={exportCSV}><Download /></Button>
              <Button variant="ghost" className="border cursor-pointer border-zinc-800" onClick={reset}><Repeat /></Button>
            </div>
          </div>

          <div className="md:hidden">
            <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2" onClick={() => setMobileOpen((s) => !s)}>
              {mobileOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>

        <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1 flex-1">
              <div className="text-[11px] text-zinc-400">Freq</div>
              <Input value={freq} onChange={(e) => setFreq(e.target.value)} className="flex-1 bg-zinc-900/60 border border-zinc-800 text-white text-xs" />
            </div>
            <div className="flex items-center gap-1">
              <Button className="px-3 py-2 cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={snapshot}>Snapshot</Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1 cursor-pointer border border-zinc-800 text-xs py-2" onClick={toggleRun}>{running ? "Pause" : "Run"}</Button>
            <Button variant="ghost" className="flex-1 cursor-pointer border border-zinc-800 text-xs py-2" onClick={exportCSV}>Export</Button>
            <Button variant="ghost" className="flex-1 cursor-pointer border border-zinc-800 text-xs py-2" onClick={reset}>Reset</Button>
          </div>
        </div>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white">
      <Toaster position="top-right" richColors />
      {Header}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* left controls */}
    <div className="lg:col-span-4 space-y-4">
      {/* Configuration Card */}
      <Card className="bg-black/70 border border-zinc-800 rounded-2xl shadow-lg backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-[#ffd24a] flex items-center gap-2">
            <Activity className="w-5 h-5" /> Configuration
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-zinc-400">Source Voltage (Vs)</label>
              <Input
                type="number"
                value={Vs}
                onChange={(e) => setVs(e.target.value)}
                className="bg-zinc-900/60 border border-zinc-800 text-white focus:ring-2 focus:ring-[#ffd24a]/30"
                placeholder="e.g. 12"
              />
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-zinc-400">Internal Resistance (Rs)</label>
              <Input
                type="number"
                value={Rs}
                onChange={(e) => setRs(e.target.value)}
                className="bg-zinc-900/60 border border-zinc-800 text-white focus:ring-2 focus:ring-[#ffd24a]/30"
                placeholder="e.g. 4"
              />
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-zinc-400">Load Resistance (Rl)</label>
              <Input
                type="number"
                value={Rl}
                onChange={(e) => setRl(e.target.value)}
                className="bg-zinc-900/60 border border-zinc-800 text-white focus:ring-2 focus:ring-[#ffd24a]/30"
                placeholder="e.g. 6"
              />
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-zinc-400">Equivalent Type</label>
             <Select value={mode} onValueChange={(v) => setMode(v)}>
  <SelectTrigger
    className="w-full bg-black/70 border border-orange-500/30 
    text-[#ffd24a] text-sm rounded-md shadow-sm cursor-pointer 
    hover:border-orange-500/50 focus:ring-2 focus:ring-orange-500/40 
    transition-all duration-300"
  >
    <SelectValue placeholder="Select Type" />
  </SelectTrigger>

  <SelectContent
    className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg"
  >
    <SelectItem
      value="thevenin"
      className="text-white hover:bg-orange-500/20 
      data-[highlighted]:text-orange-300 data-[highlighted]:bg-orange-500/30 
      cursor-pointer rounded-sm transition-all duration-200"
    >
      Thevenin
    </SelectItem>

    <SelectItem
      value="norton"
      className="text-white hover:bg-orange-500/20 
      data-[highlighted]:text-orange-300 data-[highlighted]:bg-orange-500/30 
      cursor-pointer rounded-sm transition-all duration-200"
    >
      Norton
    </SelectItem>
  </SelectContent>
</Select>

            </div>
          </div>

          {/* Action Buttons - Responsive Layout */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mt-4">
            {/* Left group (Snapshot + Run/Pause) */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 w-full sm:w-auto">
              <Button
                className="cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] hover:from-[#ff9933] hover:to-[#ffe066] text-black font-medium px-3 sm:px-4"
                onClick={snapshot}
              >
                <FileText className="w-4 h-4 mr-1.5 sm:mr-2" /> Snapshot
              </Button>

              <Button
                variant="outline"
                onClick={() => setRunning(true)}
                className="border cursor-pointer border-zinc-800"
              >
                <Play className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                onClick={() => setRunning(false)}
                className="border cursor-pointer border-zinc-800 "
              >
                <Pause className="w-4 h-4" />
              </Button>
            </div>

            {/* Right group (Export + Reset) */}
            <div className="flex flex-wrap justify-center sm:justify-end gap-2 w-full sm:w-auto">
              <Button
                variant="ghost"
                className="border cursor-pointer border-zinc-800 text-zinc-300 hover:text-black transition-all duration-200"
                onClick={exportCSV}
              >
                <Download className="w-4 h-4" />
              </Button>

              <Button
                variant="ghost"
                className="border cursor-pointer border-zinc-800 text-zinc-300 hover:text-black transition-all duration-200"
                onClick={reset}
              >
                <Repeat className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Formulas Panel below */}
      <div className="w-full">
        <FormulasPanel Vs={toNum(Vs)} Rs={toNum(Rs)} Rl={toNum(Rl)} />
      </div>

      {/* Style adjustments for smooth scaling */}
      <style>{`
        @media (max-width: 640px) {
          input, select {
            font-size: 14px !important;
          }
          label {
            font-size: 11px;
          }
        }
      `}</style>
    </div>
          {/* right: visual + oscilloscope + summary */}
          <div className="lg:col-span-8 space-y-4">
            <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-start sm:items-center gap-4 flex-col sm:flex-row justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
                      <CircuitBoard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-[#ffd24a]">Interactive Thevenin / Norton Visualizer</div>
                      <div className="text-xs text-zinc-400">Animated circuit • analog meters • waveform</div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Badge className="bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs">Vth: <span className="text-[#ffd24a] ml-1">{round(Vth,3)} V</span></Badge>
                    <Badge className="bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs">Rth: <span className="text-[#ffd24a] ml-1">{round(Rth,3)} Ω</span></Badge>
                    <Badge className="bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs">Iload: <span className="text-[#ffd24a] ml-1">{round(Iload,4)} A</span></Badge>
                  </div>
                </CardTitle>
              </CardHeader>

              <CardContent>
                <CircuitVisualizer Vs={toNum(Vs)} Rs={toNum(Rs)} Rl={toNum(Rl)} mode={mode} running={running} />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OscilloscopePanel history={history} running={running} />
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-3">
                <div className="text-xs text-zinc-400">Quick Results</div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                    <div className="text-xs text-zinc-400">Vload</div>
                    <div className="text-lg font-semibold text-white">{round(Vload,4)} V</div>
                  </div>
                  <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                    <div className="text-xs text-zinc-400">Iload</div>
                    <div className="text-lg font-semibold text-white">{round(Iload,4)} A</div>
                  </div>
                  <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                    <div className="text-xs text-zinc-400">Pload</div>
                    <div className="text-lg font-semibold text-white">{round(Pload,4)} W</div>
                  </div>
                  <div className="rounded-md p-3 bg-zinc-900/10 border border-zinc-800">
                    <div className="text-xs text-zinc-400">In</div>
                    <div className="text-lg font-semibold text-white">{round(In,4)} A</div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-zinc-400">
                  Tip: Set Rl ≈ Rs to observe maximum power transfer. Use the oscillator frequency to see waveforms.
                </div>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
