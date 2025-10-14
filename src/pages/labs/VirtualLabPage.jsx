// src/pages/VirtualLabPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
 Waves as WaveSine,
  Play,
  Pause,
  Download,
  Settings,
  Menu,
  X,
  Sliders,
  Cpu,
  CircleDot,
  ZapOff,
  FileText,
  Activity,
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
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

/* ============================
   Waveform generator hook
   - Generates real-time waveform samples (value over time)
   - Supports sine, square, triangle, pulse, custom (function string)
   - timebase controls sampling frequency, display length
   ============================ */
function useWaveSim({
  running,
  waveform = "sine",
  amplitude = 1,
  offset = 0,
  frequency = 1,
  phase = 0,
  noise = 0,
  pulseDuty = 0.5,
  customFn = "",
  timebase = 0.01, // seconds per pixel/sample (i.e., dt)
  maxSamples = 1024,
}) {
  const historyRef = useRef(Array.from({ length: Math.min(360, maxSamples) }, (_, i) => ({ t: i, y: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // compile custom function (safe-ish)
  const evalCustom = useMemo(() => {
    if (!customFn || !customFn.trim()) return null;
    try {
      // only allow Math, t, amp, freq, phase etc.
      // eslint-disable-next-line no-new-func
      const fn = new Function("t", "Math", "amp", "freq", "phase", `return (${customFn});`);
      return (tSec, amp, freq, phase) => {
        try {
          return Number(fn(tSec, Math, amp, freq, phase));
        } catch {
          return 0;
        }
      };
    } catch {
      return null;
    }
  }, [customFn]);

  const computeSample = useCallback(
    (tSeconds) => {
      const w = 2 * Math.PI * frequency;
      let y = 0;
      switch (waveform) {
        case "sine":
          y = amplitude * Math.sin(w * tSeconds + phase) + offset;
          break;
        case "square": {
          const s = Math.sign(Math.sin(w * tSeconds + phase));
          y = amplitude * (s >= 0 ? 1 : -1) + offset;
          break;
        }
        case "triangle": {
          // triangle between -1 and 1
          const period = 1 / frequency;
          const p = ((tSeconds / period + phase / (2 * Math.PI)) % 1 + 1) % 1;
          y = amplitude * (4 * Math.abs(p - 0.5) - 1) + offset;
          break;
        }
        case "pulse": {
          const period = 1 / frequency;
          const p = ((tSeconds % period) + period) % period;
          y = amplitude * (p < pulseDuty * period ? 1 : 0) + offset;
          break;
        }
        case "custom": {
          if (evalCustom) {
            const v = evalCustom(tSeconds, amplitude, frequency, phase);
            y = Number.isFinite(v) ? v + offset : offset;
          } else {
            y = offset;
          }
          break;
        }
        default:
          y = offset;
      }
      // add noise
      if (noise > 0) {
        y += (Math.random() * 2 - 1) * noise;
      }
      return y;
    },
    [waveform, amplitude, offset, frequency, phase, noise, pulseDuty, evalCustom]
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
      const dtMs = ts - lastRef.current;
      // accumulate until dt > desired sample period (timebase*1000)
      if (dtMs < Math.max(8, timebase * 1000)) return;
      lastRef.current = ts;
      tRef.current += dtMs;
      const tSeconds = tRef.current / 1000;

      const y = computeSample(tSeconds);

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, y });
        if (next.length > maxSamples) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, computeSample, timebase, maxSamples]);

  return { history, computeSample };
}

/* ============================
   SVG Circuit Visualizer
   - Simple circuit shapes for RC, RL, RLC, and 'Open' (no circuit)
   - Animated dots to represent current/flow; dot speed responds to frequency/amplitude
   ============================ */
function CircuitVisualizer({ circuit = "open", amplitude = 1, frequency = 1, running = true, probeValue = 0 }) {
  // map circuit to simple SVG layout
  const width = 900;
  const height = 220;
  const busY = 110;
  // dot animation params
  const absAmp = Math.abs(amplitude);
  const dotCount = clamp(Math.round(2 + absAmp * 6), 2, 16);
  const baseSpeed = clamp(1 / Math.max(0.1, frequency), 0.08, 2.5); // seconds per cycle

  const dotColor = amplitude >= 0 ? "#ffd24a" : "#ff6a9a";

  // paths for dot motion depend on circuit
  const pathMain = circuit === "open" ? `M 80 ${busY} L ${width - 80} ${busY}` : `M 80 ${busY} L ${width - 260} ${busY} L ${width - 260} ${busY - 48} L ${width - 120} ${busY - 48} L ${width - 120} ${busY}`;
  // variation for R, L, C segments can be drawn (simplified)

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Circuit Visualizer</div>
            <div className="text-xs text-zinc-400">Animated flow — circuit: {circuit.toUpperCase()}</div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Freq: <span className="text-[#ffd24a] ml-1">{frequency} Hz</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Amp: <span className="text-[#00ffbf] ml-1">{round(amplitude, 4)}</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full h-44">
          {/* base bus */}
          <path d={`M 80 ${busY} H ${width - 80}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* generate a simplified circuit drawing based on selection */}
          {circuit === "rc" && (
            <>
              {/* resistor (zigzag) near end */}
              <g transform={`translate(${width - 260}, ${busY - 10})`}>
                <rect x="-40" y="-8" width="80" height="16" rx="6" fill="#0a0a0a" stroke="#222" />
                <text x="-36" y="-12" fontSize="10" fill="#ffd24a">R</text>
              </g>
              {/* capacitor */}
              <g transform={`translate(${width - 120}, ${busY - 24})`}>
                <rect x="-12" y="-6" width="24" height="12" fill="#ffb86b" rx="3" />
                <text x="-6" y="-16" fontSize="10" fill="#ffd24a">C</text>
              </g>
            </>
          )}

          {circuit === "rl" && (
            <>
              <g transform={`translate(${width - 240}, ${busY - 16})`}>
                <rect x="-44" y="-8" width="88" height="16" rx="6" fill="#0a0a0a" stroke="#222" />
                <text x="-36" y="-12" fontSize="10" fill="#ffd24a">R</text>
              </g>
              <g transform={`translate(${width - 120}, ${busY - 18})`}>
                <rect x="-18" y="-8" width="36" height="16" fill="#ff6a9a" rx="8" />
                <text x="-6" y="-16" fontSize="10" fill="#ffd24a">L</text>
              </g>
            </>
          )}

          {circuit === "rlc" && (
            <>
              <g transform={`translate(${width - 300}, ${busY - 16})`}>
                <rect x="-44" y="-8" width="88" height="16" rx="6" fill="#0a0a0a" stroke="#222" />
                <text x="-36" y="-12" fontSize="10" fill="#ffd24a">R</text>
              </g>
              <g transform={`translate(${width - 220}, ${busY - 18})`}>
                <rect x="-18" y="-8" width="36" height="16" fill="#ff6a9a" rx="8" />
                <text x="-6" y="-16" fontSize="10" fill="#ffd24a">L</text>
              </g>
              <g transform={`translate(${width - 120}, ${busY - 24})`}>
                <rect x="-12" y="-6" width="24" height="12" fill="#ffb86b" rx="3" />
                <text x="-6" y="-16" fontSize="10" fill="#ffd24a">C</text>
              </g>
            </>
          )}

          {/* animate dots along pathMain */}
          {Array.from({ length: dotCount }).map((_, i) => {
            const delay = (i / dotCount) * baseSpeed;
            const style = {
              offsetPath: `path('${pathMain}')`,
              animationName: "dotTravel",
              animationDuration: `${baseSpeed}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
            };
            return <circle key={`dot-${i}`} r="4" fill={dotColor} style={style} />;
          })}

          {/* probe reading bubble */}
          <g transform={`translate(${width - 60}, ${busY - 60})`}>
            <rect x="-72" y="-30" width="140" height="56" rx="8" fill="#060606" stroke="#222" />
            <text x="-64" y="-6" fontSize="12" fill="#ffb57a">Probe</text>
            <text x="-64" y="12" fontSize="14" fill="#fff">V: <tspan fill="#ffd24a">{round(probeValue, 4)} V</tspan></text>
          </g>

          <style>{`
            @keyframes dotTravel {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
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
   Oscilloscope Chart
   - Plots waveform (voltage) and optionally current/power if circuit active
   ============================ */
function Oscilloscope({ history = [], running = true, probeOverride = null, showCurrent = false, scale = 1 }) {
  // map history to data
  const data = history.slice(-720).map((d, idx) => {
    const y = d.y || 0;
    const yUsed = probeOverride !== null ? probeOverride : y;
    // simplistic current estimate for 'demo': I = V/R with R=1 when showCurrent true
    const I = showCurrent ? round(yUsed / 1, 6) : 0;
    const P = showCurrent ? round(yUsed * I, 6) : 0;
    return {
      t: idx,
      V: round(yUsed * scale, 6),
      I: round(I, 6),
      P: round(P, 6),
    };
  });

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — Voltage (V) {showCurrent ? "• Current (A) • Power (W)" : ""}</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "8px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Voltage (V)" />
            {showCurrent && <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Current (A)" />}
            {showCurrent && <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Power (W)" />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Virtual Lab Page
   ============================ */
export default function VirtualLabPage() {
  // simulation & UI state
  const [waveform, setWaveform] = useState("sine");
  const [frequency, setFrequency] = useState(5); // hz
  const [amplitude, setAmplitude] = useState(1);
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState(0);
  const [noise, setNoise] = useState(0);
  const [pulseDuty, setPulseDuty] = useState(0.5);
  const [customFn, setCustomFn] = useState("");
  const [timebase, setTimebase] = useState(0.01);
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [probeManual, setProbeManual] = useState("");
  const [circuit, setCircuit] = useState("open"); // open, rc, rl, rlc
  const [scale, setScale] = useState(1); // vertical scale for display
  const [samples, setSamples] = useState(720);

  const { history, computeSample } = useWaveSim({
    running,
    waveform,
    amplitude,
    offset,
    frequency,
    phase,
    noise,
    pulseDuty,
    customFn,
    timebase,
    maxSamples: samples,
  });

  // derived probe value
  const probeValueSim = history.length ? history[history.length - 1].y : 0;
  const probeUsed = Number.isFinite(Number(probeManual)) && probeManual !== "" ? Number(probeManual) : probeValueSim;

  // convenience
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Oscilloscope resumed" : "Oscilloscope paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setWaveform("sine");
    setFrequency(5);
    setAmplitude(1);
    setOffset(0);
    setPhase(0);
    setNoise(0);
    setPulseDuty(0.5);
    setTimebase(0.01);
    setCircuit("open");
    setProbeManual("");
    setScale(1);
    setSamples(720);
    toast("Reset to defaults");
  };

  const exportCSV = () => {
    const rows = [["t", "V_sim", "V_probe_manual", "V_used"]];
    history.forEach((d, idx) => {
      const vSim = round(d.y, 9);
      const vManual = Number.isFinite(Number(probeManual)) && probeManual !== "" ? Number(probeManual) : "";
      const vUsed = vManual !== "" ? Number(vManual) : vSim;
      rows.push([d.t, vSim, vManual, vUsed]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oscilloscope-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const snapshot = () => {
    // produce a small snapshot of last few values (demo)
    const last = history.slice(-8).map((d) => round(d.y, 6)).join(", ");
    toast.success(`Snapshot: [${last}]`);
  };

  // small safety: limit frequency and amplitude for animation performance
  const safeFrequency = clamp(Number(frequency), 0.001, 2000);
  const safeAmplitude = clamp(Number(amplitude), -1000, 1000);

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
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
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Oscilloscope Virtual Lab</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-36">
                <Select value={waveform} onValueChange={(v) => setWaveform(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Wave" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="sine" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Sine</SelectItem>
                    <SelectItem value="square" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Square</SelectItem>
                    <SelectItem value="triangle" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Triangle</SelectItem>
                    <SelectItem value="pulse" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Pulse</SelectItem>
                    <SelectItem value="custom" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={snapshot} title="Snapshot">Snapshot</Button>

              <Button variant="ghost" className="border border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400" onClick={toggleRunning} title={running ? "Pause" : "Play"}>
                {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>

              <Button variant="ghost" className="border border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400" onClick={resetDefaults} title="Reset">
                <Settings className="w-5 h-5" />
              </Button>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile slide */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="w-28">
                  <Select value={waveform} onValueChange={(v) => setWaveform(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Wave" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="sine" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Sine</SelectItem>
                      <SelectItem value="square" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-mde">Square</SelectItem>
                      <SelectItem value="triangle" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Triangle</SelectItem>
                      <SelectItem value="pulse" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Pulse</SelectItem>
                      <SelectItem value="custom" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={snapshot}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={resetDefaults}>Reset</Button>
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Oscilloscope Controls</div>
                        <div className="text-xs text-zinc-400">Realtime waveform generator • timebase • probes</div>
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
                      <label className="text-xs text-zinc-400">Waveform</label>
                      <Select value={waveform} onValueChange={(v) => setWaveform(v)}>
                        <SelectTrigger className="w-full bg-zinc-900/50 border border-zinc-800 text-white text-sm rounded-md">
                          <SelectValue placeholder="Waveform" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                          <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="sine">Sine</SelectItem>
                          <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="square">Square</SelectItem>
                          <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="triangle">Triangle</SelectItem>
                          <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="pulse">Pulse</SelectItem>
                          <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="custom">Custom (JS)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Frequency (Hz)</label>
                      <Input type="number" value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Amplitude (V)</label>
                      <Input type="number" value={amplitude} onChange={(e) => setAmplitude(Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Offset (V)</label>
                      <Input type="number" value={offset} onChange={(e) => setOffset(Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-zinc-400">Phase (rad)</label>
                        <Input type="number" value={phase} onChange={(e) => setPhase(Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Noise (±V)</label>
                        <Input type="number" value={noise} onChange={(e) => setNoise(Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    {waveform === "pulse" && (
                      <div>
                        <label className="text-xs text-zinc-400">Pulse Duty (0–1)</label>
                        <Input type="number" value={pulseDuty} onChange={(e) => setPulseDuty(clamp(Number(e.target.value), 0, 1))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    )}

                    {waveform === "custom" && (
                      <div>
                        <label className="text-xs text-zinc-400">Custom function (JS) — expression that returns a V given t,Math,amp,freq,phase</label>
                        <Input value={customFn} onChange={(e) => setCustomFn(e.target.value)} placeholder="e.g., amp*Math.sin(2*Math.PI*freq*t + phase) + 0.2*Math.sin(20*t)" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <div className="text-xs text-zinc-500 mt-1">Use `t` as seconds. Example: <code>amp*Math.sin(2*Math.PI*freq*t)</code></div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 mt-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-zinc-400">Timebase (s/sample)</label>
                        <Input type="number" value={timebase} onChange={(e) => setTimebase(Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div className="w-28">
                        <label className="text-xs text-zinc-400">Samples</label>
                        <Input type="number" value={samples} onChange={(e) => setSamples(clamp(Number(e.target.value), 64, 4096))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-zinc-400">Circuit</label>
                        <Select value={circuit} onValueChange={(v) => setCircuit(v)}>
                          <SelectTrigger className="w-full bg-zinc-900/50 border border-zinc-800 text-white text-sm rounded-md">
                            <SelectValue placeholder="Circuit" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                            <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="open">Open (no circuit)</SelectItem>
                            <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="rc">RC (demo)</SelectItem>
                            <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="rl">RL (demo)</SelectItem>
                            <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="rlc">RLC (demo)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="w-28">
                        <label className="text-xs text-zinc-400">Scale</label>
                        <Input type="number" value={scale} onChange={(e) => setScale(Number(e.target.value))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
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
                        <WaveSine className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Oscilloscope Visualizer</div>
                        <div className="text-xs text-zinc-400">Real-time waveform • circuit flow • probe</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{waveform}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Freq: <span className="text-[#ffd24a] ml-1">{safeFrequency} Hz</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Amp: <span className="text-[#ffd24a] ml-1">{round(safeAmplitude, 4)} V</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden space-y-4">
                  <CircuitVisualizer circuit={circuit} amplitude={safeAmplitude} frequency={safeFrequency} running={running} probeValue={probeUsed} />

                  <div>
                    <Oscilloscope history={history} running={running} probeOverride={Number.isFinite(Number(probeManual)) && probeManual !== "" ? Number(probeManual) : null} showCurrent={circuit !== "open"} scale={scale} />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <CircleDot className="w-5 h-5" /> Probe & Readouts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs text-zinc-400">Manual Probe Override (V)</label>
                      <Input value={probeManual} onChange={(e) => setProbeManual(e.target.value)} placeholder="Leave empty to use live probe" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Live Probe</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{round(probeValueSim, 6)} V</div>
                      <div className="text-xs text-zinc-400 mt-1">Displayed value uses manual override if set.</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Last Sample</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{history.length ? round(history[history.length - 1].y, 6) : 0} V</div>
                    </div>

                    <div className="mt-2 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                      <span className="text-orange-400"><Activity /></span>
                      <span>
                        Tip: Change <span className="text-white font-semibold">Timebase</span> and <span className="text-white font-semibold">Samples</span> to adjust resolution and duration of the oscilloscope trace.
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <FileText className="w-5 h-5" /> Utilities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    <Button className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-2" onClick={exportCSV}><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
                    <Button variant="ghost" className="border border-zinc-800 text-zinc-300 px-3 py-2" onClick={snapshot}><ZapOff className="w-4 h-4 mr-2" /> Snapshot</Button>
                    <Button variant="outline" className="px-3 py-2" onClick={() => { navigator.clipboard?.writeText(JSON.stringify({ waveform, frequency, amplitude, offset }, null, 2)); toast.success("Copied config"); }}><Sliders className="w-4 h-4 mr-2" /> Copy Config</Button>
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
