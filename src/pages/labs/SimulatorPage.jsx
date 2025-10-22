// src/pages/SimulatorPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Grid,
  Zap,

  Activity,
  Play,
  Pause,
  Download,
  Settings,
  Menu,
  X,
  AlertTriangle,

  Plug,
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
import { toPng } from "html-to-image";

/* ===========================
   Utilities
   =========================== */
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ===========================
   Simple DMM simulation hook
   - Models a simple circuit: Vsup -> seriesR -> loadR -> GND
   - Modes:
     - VOLTAGE: DMM measures voltage across load
     - CURRENT: DMM measures current through load (via series path)
     - RESISTANCE: DMM applies small test current/voltage and measures R (with safety)
   - Produces time-series for oscilloscope + an animated "raw" value
   =========================== */
function useDMMSim({
  running,
  timestep = 100,
  Vsup = 5,
  seriesR = 1,
  loadR = 1000,
  mode = "VOLTAGE",
  dmmRange = null, // e.g., { type: 'AUTO' } or specific scale
  noise = 0.002,
}) {
  // history entries: { tIndex, value } where value is measured quantity (V, A, or Ω)
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, v: 0 })));
  const [history, setHistory] = useState(historyRef.current);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // safe test current for resistance measurement (in A)
  const TEST_CURRENT_A = 1e-4; // 100 μA typical DMM small current
  // small noise generator
  const randNoise = useCallback((scale) => (Math.random() - 0.5) * 2 * scale, []);

  const computeInstantValue = useCallback(
    (tSeconds) => {
      // circuit simple model:
      // I = Vsup / (seriesR + loadR)
      const Rseries = Math.max(1e-6, Number(seriesR));
      const Rload = Math.max(1e-9, Number(loadR)); // avoid divide-by-zero
      const V = Number(Vsup);

      if (mode === "VOLTAGE") {
        // voltage across load: V * (Rload / (Rseries + Rload))
        const Vload = V * (Rload / (Rseries + Rload));
        const noiseVal = randNoise(noise) * Math.max(1, Math.abs(Vload));
        return clamp(Vload + noiseVal, -1e6, 1e6);
      }

      if (mode === "CURRENT") {
        const I = V / (Rseries + Rload);
        const noiseVal = randNoise(noise) * Math.max(1e-6, Math.abs(I));
        return clamp(I + noiseVal, -1e3, 1e3);
      }

      // RESISTANCE mode: simulate measuring R by applying small TEST_CURRENT_A
      if (mode === "RESISTANCE") {
        // if circuit is powered (Vsup > 0) real DMM resistance reading will be confused,
        // so we simulate that the user is in "open" circuit measurement (we temporarily "disconnect" Vsup).
        // The DMM applies TEST_CURRENT_A across the unknown and measures voltage: R = V_meas / I_test.
        const measuredV = Rload * TEST_CURRENT_A;
        const noiseVal = randNoise(noise) * Math.max(1, Math.abs(measuredV));
        const Rmeas = clamp((measuredV + noiseVal) / TEST_CURRENT_A, 0, 1e9);
        return Rmeas;
      }

      return 0;
    },
    [Vsup, seriesR, loadR, mode, noise, randNoise]
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
      const val = computeInstantValue(tSeconds);

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, v: val });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeInstantValue]);

  const latest = history.length ? history[history.length - 1].v : 0;
  return { history, latest };
}

/* ===========================
   Animated Multimeter SVG
   - shows dial, digital readout, probes, and small animations when measuring
   - colors follow orange/black theme
   =========================== */

 function MultimeterSVG({
  mode = "VOLTAGE", // "VOLTAGE" | "CURRENT" | "RESISTANCE"
  reading = 0,
  running = true,
  probesConnected = false,
  rangeLabel = "AUTO",
}) {
  // unit and display
const _clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _round = (v, p = 4) => (Number.isFinite(v) ? Math.round(v * 10 ** p) / 10 ** p : v);

  const unit = mode === "VOLTAGE" ? "V" : mode === "CURRENT" ? "A" : "Ω";
  const display = (() => {
    if (!Number.isFinite(reading)) return "--";
    if (mode === "VOLTAGE") return `${_round(reading, 4)} ${unit}`;
    if (mode === "CURRENT") {
      if (Math.abs(reading) >= 1e-3) return `${_round(reading * 1000, 3)} mA`;
      return `${_round(reading, 9)} A`;
    }
    if (mode === "RESISTANCE") {
      if (reading >= 1e6) return `${_round(reading / 1e6, 3)} MΩ`;
      if (reading >= 1e3) return `${_round(reading / 1e3, 3)} kΩ`;
      return `${_round(reading, 4)} Ω`;
    }
    return `${_round(reading, 4)} ${unit}`;
  })();

  const intensity = _clamp(
    Math.min(Math.abs(reading) / (mode === "CURRENT" ? 0.01 : 10), 1),
    0.05,
    1
  );

  const colorMap = {
    VOLTAGE: "#00eaff",
    CURRENT: "#ffb84a",
    RESISTANCE: "#c084fc",
  };
  const accent = colorMap[mode] || "#ffd24a";

  const knobAngle =
    mode === "VOLTAGE" ? -120 : mode === "CURRENT" ? -60 : mode === "RESISTANCE" ? 0 : 160;

  return (
    <div className="w-full rounded-2xl p-4 bg-gradient-to-b from-[#050505]/90 to-[#0a0a0a]/70 border border-zinc-800/80 shadow-[0_0_40px_rgba(255,200,100,0.05)]">
      <div className="flex flex-col items-center gap-3">
        <svg
          viewBox="0 0 560 300"
          className="w-full h-[340px]"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* === DEFINITIONS === */}
          <defs>
            <radialGradient id="bodyGrad" cx="50%" cy="40%" r="80%">
              <stop offset="0%" stopColor="#101010" />
              <stop offset="80%" stopColor="#070707" />
              <stop offset="100%" stopColor="#040404" />
            </radialGradient>
            <linearGradient id="edgeGlow" x1="0" x2="1">
              <stop offset="0%" stopColor="#444" />
              <stop offset="50%" stopColor="#888" />
              <stop offset="100%" stopColor="#444" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="neonPulse">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feColorMatrix
                in="b"
                type="matrix"
                values="1 0 0 0 0
                        0 1 0 0 0
                        0 0 1 0 0
                        0 0 0 1 0"
              />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* === BODY === */}
          <rect
            x="8"
            y="8"
            rx="24"
            width="544"
            height="284"
            fill="url(#bodyGrad)"
            stroke="#1c1c1c"
            strokeWidth="3"
            filter="url(#glow)"
          />
          <rect
            x="12"
            y="12"
            rx="20"
            width="536"
            height="276"
            fill="none"
            stroke="url(#edgeGlow)"
            strokeWidth="0.8"
            opacity="0.4"
          />

          {/* === DIGITAL DISPLAY === */}
          <g transform="translate(30,30)">
            <rect
              x="0"
              y="0"
              rx="10"
              width="340"
              height="90"
              fill="#000"
              stroke="#222"
              strokeWidth="2"
              filter="url(#glow)"
            />
            <text
              x="20"
              y="58"
              fontFamily="monospace"
              fontSize="36"
              fill={accent}
              filter="url(#neonPulse)"
              style={{ letterSpacing: "1px" }}
            >
              {display}
            </text>
            <text x="22" y="78" fontSize="12" fill="#888">
              {rangeLabel} • {mode}
            </text>
            <rect
              x="12"
              y="12"
              width="316"
              height="66"
              rx="6"
              fill="none"
              stroke={accent}
              opacity="0.12"
              strokeWidth="1.5"
            />
          </g>

          {/* === ROTARY DIAL === */}
          <g transform="translate(460,80)">
            <circle cx="0" cy="0" r="62" fill="#080808" stroke="#111" strokeWidth="2" />
            <circle
              cx="0"
              cy="0"
              r="60"
              fill="url(#bodyGrad)"
              stroke="#2a2a2a"
              strokeWidth="1.5"
            />
            {["V", "A", "Ω", "OFF"].map((d, i) => {
              const ang = (-120 + i * 60) * (Math.PI / 180);
              const x = Math.cos(ang) * 46;
              const y = Math.sin(ang) * 46;
              return (
                <g key={d} transform={`translate(${x},${y})`}>
                  <text
                    x="-6"
                    y="6"
                    fontSize="12"
                    fill={d[0] === mode[0] ? accent : "#555"}
                  >
                    {d}
                  </text>
                </g>
              );
            })}
            {/* knob pointer */}
            <g transform={`rotate(${knobAngle})`}>
              <rect
                x="-2"
                y="-5"
                width="40"
                height="10"
                rx="3"
                fill={accent}
                filter="url(#glow)"
              />
            </g>
            <circle cx="0" cy="0" r="6" fill="#000" stroke="#333" strokeWidth="2" />
          </g>

          {/* === PROBE JACKS === */}
          <g transform="translate(60,160)">
            <circle cx="0" cy="0" r="16" fill="#111" stroke="#333" strokeWidth="2" />
            <circle
              cx="0"
              cy="0"
              r={6 + (probesConnected ? 2 : 0)}
              fill={probesConnected ? accent : "#333"}
              filter="url(#glow)"
            />
            <text x="28" y="5" fontSize="11" fill="#ccc">
              COM
            </text>

            <g transform="translate(0,42)">
              <circle cx="0" cy="0" r="16" fill="#111" stroke="#333" strokeWidth="2" />
              <circle
                cx="0"
                cy="0"
                r={6 + intensity * 4}
                fill={probesConnected ? accent : "#222"}
                filter="url(#glow)"
              />
              <text x="28" y="5" fontSize="11" fill="#ccc">
                {mode === "RESISTANCE" ? "Ω/μA" : "V/A"}
              </text>
            </g>
          </g>

          {/* === PROBE CONNECTION ANIMATION === */}
          <g transform="translate(260,190)">
            <path
              d="M-80 60 Q -40 10 0 30 T 80 10"
              stroke={probesConnected ? accent : "#333"}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              style={{
                filter: "url(#glow)",
                opacity: probesConnected ? 0.8 : 0.3,
                animation: probesConnected ? "probeFlow 2s linear infinite" : "none",
              }}
            />
            <circle
              cx="80"
              cy="10"
              r={8}
              fill={probesConnected ? accent : "#222"}
              filter="url(#neonPulse)"
            />
            <text x="96" y="16" fontSize="12" fill="#aaa">
              Probe
            </text>
          </g>

          {/* === STATUS PANEL === */}
          <g transform="translate(40,100)">
            <rect x="0" y="0" width="140" height="34" rx="10" fill="#080808" stroke="#222" />
            <circle
              cx="18"
              cy="17"
              r="6"
              fill={running ? "#00ffbf" : "#444"}
              filter="url(#glow)"
            />
            <text x="34" y="21" fontSize="11" fill="#888">
              {running ? "RUNNING" : "PAUSED"}
            </text>
            <circle
              cx="90"
              cy="17"
              r="6"
              fill={probesConnected ? accent : "#444"}
              filter="url(#glow)"
            />
            <text x="106" y="21" fontSize="11" fill="#888">
              {probesConnected ? "PROBE" : "OPEN"}
            </text>
          </g>

          {/* === BRAND MARK === */}
          <g transform="translate(460,240)">
            <text
              x="-6"
              y="6"
              fontSize="12"
              fill="#777"
              letterSpacing="1"
              style={{ fontFamily: "Rajdhani, sans-serif" }}
            >
              SparkLab DMM
            </text>
          </g>

          {/* === ANIMATIONS === */}
          <style>{`
            @keyframes probeFlow {
              0% { stroke-dasharray: 6 30; stroke-dashoffset: 0; }
              100% { stroke-dasharray: 6 30; stroke-dashoffset: -36; }
            }

            @keyframes ledPulse {
              0% { opacity: 0.6; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.2); }
              100% { opacity: 0.6; transform: scale(1); }
            }

            circle[fill="#00ffbf"], circle[fill="${accent}"] {
              animation: ledPulse 2.8s ease-in-out infinite;
            }

            text {
              user-select: none;
            }

            @media (max-width: 640px) {
              text { font-size: 10px; }
            }
          `}</style>
        </svg>
      </div>
    </div>
  );
}


/* ===========================
   Oscilloscope component for DMM
   - Plots last N samples of selected measurement
   =========================== */
function DMMScope({ history = [], mode }) {
  const data = history.slice(-300).map((d, idx) => {
    return { t: idx, val: d.v };
  });

  // axis label formatting based on mode
  const yKey = "val";

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Scope — {mode}</div>
      </div>
      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey={yKey} stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name={mode} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ===========================
   Main Simulator Page
   - Combines controls, SVG, scope, summary, export, and mobile-friendly actions
   =========================== */
export default function SimulatorPage() {
  // UI state
  const [mode, setMode] = useState("VOLTAGE"); // VOLTAGE | CURRENT | RESISTANCE
  const [Vsup, setVsup] = useState("5");
  const [seriesR, setSeriesR] = useState("1");
  const [loadR, setLoadR] = useState("1000");
  const [running, setRunning] = useState(true);
  const [manualOverride, setManualOverride] = useState(""); // if set, used as measured value
  const [probesConnected, setProbesConnected] = useState(true);
  const [range, setRange] = useState("AUTO");
  const [noise, setNoise] = useState(0.002);
  const [mobileOpen, setMobileOpen] = useState(false);

  // hook: produces history + latest real measured value
  const { history, latest } = useDMMSim({
    running,
    timestep: 120,
    Vsup: Number(Vsup),
    seriesR: Number(seriesR),
    loadR: Number(loadR),
    mode,
    noise: Number(noise),
  });

  const effectiveReading = Number.isFinite(Number(manualOverride)) && manualOverride !== "" ? Number(manualOverride) : latest;

  // friendly string for display for top summary
  const formattedReading = useMemo(() => {
    if (!Number.isFinite(effectiveReading)) return "--";
    if (mode === "VOLTAGE") return `${round(effectiveReading, 6)} V`;
    if (mode === "CURRENT") {
      if (Math.abs(effectiveReading) >= 1e-3) return `${round(effectiveReading * 1000, 6)} mA`;
      return `${round(effectiveReading, 9)} A`;
    }
    // resistance
    if (effectiveReading >= 1e6) return `${round(effectiveReading / 1e6, 6)} MΩ`;
    if (effectiveReading >= 1e3) return `${round(effectiveReading / 1e3, 6)} kΩ`;
    return `${round(effectiveReading, 6)} Ω`;
  }, [effectiveReading, mode]);

  // basic safety checks and error messages
  const validationErrors = useMemo(() => {
    const errs = [];
    if (!Number.isFinite(Number(Vsup))) errs.push("Supply voltage must be numeric.");
    if (!Number.isFinite(Number(seriesR)) || Number(seriesR) < 0) errs.push("Series resistance must be ≥ 0.");
    if (!Number.isFinite(Number(loadR)) || Number(loadR) <= 0) errs.push("Load resistance must be > 0.");
    if (mode === "CURRENT" && Number(loadR) < 0.001) errs.push("Load too low for safe current reading (simulate realistic values).");
    return errs;
  }, [Vsup, seriesR, loadR, mode]);

  // UI actions
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulator resumed" : "Simulator paused");
      return nxt;
    });
  };

  const snapshot = () => {
    toast.success("Snapshot captured");
    // TODO: could implement actual image capture if desired
  };

  const exportCSV = () => {
    const rows = [["t", "value"], ...history.map((h) => [h.t, h.v])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dmm-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const resetDefaults = () => {
    setMode("VOLTAGE");
    setVsup("5");
    setSeriesR("1");
    setLoadR("1000");
    setManualOverride("");
    setRange("AUTO");
    setNoise(0.002);
    setProbesConnected(true);
    toast("Defaults restored");
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

  // small computed summary
  const summary = useMemo(() => {
    return {
      reading: formattedReading,
      Vsup: `${Vsup} V`,
      Iapprox: mode === "CURRENT" ? `${round(Number(Vsup) / (Number(seriesR) + Number(loadR)), 6)} A` : "—",
      LoadR: `${loadR} Ω`,
    };
  }, [formattedReading, Vsup, seriesR, loadR, mode]);

  return (
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.36 }}
              className="flex items-center gap-3 cursor-pointer select-none"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
                <Zap className="w-6 h-6 text-black" />
              </div>
              <div>
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5">Digital Multimeter Simulator</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-3">
              <div className="w-36">
                <Select value={mode} onValueChange={(v) => setMode(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="VOLTAGE"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Voltage (V)</SelectItem>
                    <SelectItem value="CURRENT"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Current (A)</SelectItem>
                    <SelectItem value="RESISTANCE"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Resistance (Ω)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-1 rounded-lg shadow-md" onClick={snapshotPNG}>Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 p-2 rounded-lg" onClick={toggleRunning} title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 p-2 rounded-lg" onClick={resetDefaults} title="Reset">
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 p-2 rounded-lg" onClick={() => setMobileOpen((s) => !s)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-56 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex gap-2">
                <Select value={mode} onValueChange={(v) => setMode(v)}>
                  <SelectTrigger className="w-full cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="VOLTAGE"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Voltage (V)</SelectItem>
                    <SelectItem value="CURRENT"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Current (A)</SelectItem>
                    <SelectItem value="RESISTANCE"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Resistance (Ω)</SelectItem>
                  </SelectContent>
                </Select>

                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={snapshotPNG}>Snapshot</Button>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1 cursor-pointer border text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 border-zinc-800" onClick={toggleRunning}>{running ? "Pause" : "Run"}</Button>
                <Button variant="ghost" className="flex-1 cursor-pointer border text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 border-zinc-800" onClick={exportCSV}>Export</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Controls (left) */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">DMM Controls</div>
                        <div className="text-xs text-zinc-400">Configure circuit • ranges • manual overrides</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Mode</Badge>
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
                      <label className="text-xs text-zinc-400">Series Resistance (Ω)</label>
                      <Input value={seriesR} onChange={(e) => setSeriesR(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Load Resistance (Ω)</label>
                      <Input value={loadR} onChange={(e) => setLoadR(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Manual Override (use to set measured)</label>
                      <Input value={manualOverride} onChange={(e) => setManualOverride(e.target.value)} placeholder="Leave empty to use simulated value" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div className="flex gap-2">
                      <Select value={range} onValueChange={(v) => setRange(v)}>
                        <SelectTrigger className="w-full bg-black/80 border cursor-pointer focus:border-orange-500 border-zinc-800 text-white text-sm rounded-md">
                          <SelectValue placeholder="Range" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                          <SelectItem value="AUTO"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Auto</SelectItem>
                          <SelectItem value="V:20"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Voltage 20V</SelectItem>
                          <SelectItem value="V:200"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Voltage 200V</SelectItem>
                          <SelectItem value="I:10"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Current 10A</SelectItem>
                          <SelectItem value="R:2k"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Resistance 2kΩ</SelectItem>
                        </SelectContent>
                      </Select>

                      <Input value={noise} onChange={(e) => setNoise(Number(e.target.value))} type="number" className="w-28 bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => setProbesConnected((s) => !s)}>{probesConnected ? "Disconnect Probes" : "Connect Probes"}</Button>
                      <Button variant="ghost" className="border cursor-pointer text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 border-zinc-800" onClick={() => { setManualOverride(""); toast("Manual override cleared"); }}>Clear</Button>
                    </div>

                    <div className="flex gap-2">
                      <Button className="px-3 cursor-pointer py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 cursor-pointer border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    </div>

                    <div className="flex gap-2 mt-2">
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 p-2" onClick={resetDefaults}><Settings className="w-4 h-4" /></Button>
                    </div>
                  </div>

                  {/* validation indicator */}
                  <div className="mt-2">
                    {validationErrors.length ? (
                      <div className="text-xs text-red-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        <div>{validationErrors[0]}</div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-400">All systems nominal</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Visual + Scope (right) */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border snapshot border-zinc-800 rounded-2xl w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-start md:flex-row flex-col md:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                        <Plug className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Digital Multimeter Simulator</div>
                        <div className="text-xs text-zinc-400">Real-time measurements • probe animation • scope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{mode}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full ">Reading: <div className="text-[#00ffbf] w-10 truncate ml-1">{formattedReading}</div></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Range: <span className="text-[#ffd24a] ml-1">{range}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <MultimeterSVG mode={mode} reading={effectiveReading} running={running} probesConnected={probesConnected} rangeLabel={range} />
                    </div>

                    <div className="space-y-4">
                      <DMMScope history={history} mode={mode} />

                      <Card className="bg-black/60 border border-zinc-800 rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs text-zinc-400">Summary</div>
                            <div className="text-lg font-semibold text-[#ff9a4a]">{summary.reading}</div>
                            <div className="text-xs text-zinc-500 mt-1">Vsup: {summary.Vsup} • Load: {summary.LoadR}</div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-zinc-400">Approx I</div>
                            <div className="text-lg font-semibold text-[#00ffbf]">{summary.Iapprox}</div>
                            <div className="text-xs text-zinc-400 mt-1">Manual override: {manualOverride === "" ? "—" : manualOverride}</div>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </main>

      {/* mobile sticky controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 cursor-pointer py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 cursor-pointer border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 bg-black text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
