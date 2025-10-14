// src/pages/SimulatorPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Cpu,
  Thermometer,
  BatteryCharging,
  Play,
  Pause,
  Download,
  Settings,
  Menu,
  X,
  Zap as Flash,
  Trash2 as ZapOff,

  Activity,
  Usb,
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
   DMM Simulation Hook
   - Simulates a simple resistor network and provides V/I/R readings over time.
   - Supports measureMode: "voltage" | "current" | "resistance"
   - For resistance measurement we "inject" a small test current or use user-supplied test voltage.
   ============================ */
function useDmmSim({
  running,
  timestep = 80,
  measureMode = "voltage",
  circuit = { type: "series", resistors: [100, 220] }, // resistances in ohms
  Vsup = 5,
  manualProbe = { node: 0 }, // for voltage measurement node index
  manualI = "",
  testCurrent = 0.001, // 1 mA injection for Ohm measurement by default
}) {
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, V: 0, I: 0, R: 0 })));
  const [history, setHistory] = useState(historyRef.current);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // compute equivalent resistance depending on type
  const computeReq = useCallback((circ) => {
    if (!circ || !circ.resistors || circ.resistors.length === 0) return { Req: NaN, parts: [] };
    const parts = circ.resistors.map((r) => (Number.isFinite(Number(r)) && r > 0 ? Number(r) : NaN));
    if (circ.type === "series") {
      const Req = parts.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      return { Req, parts };
    } else {
      // parallel
      let denom = 0;
      parts.forEach((p) => {
        if (Number.isFinite(p) && p > 0) denom += 1 / p;
      });
      const Req = denom > 0 ? 1 / denom : Infinity;
      return { Req, parts };
    }
  }, []);

  const eq = useMemo(() => computeReq(circuit), [circuit, computeReq]);

  // core instant compute:
  const computeInstant = useCallback(
    (tSeconds) => {
      // baseline: if circuit has supply, V across whole network = Vsup
      const Rtot = eq.Req;
      const VsupNum = Number.isFinite(Number(Vsup)) ? Number(Vsup) : 0;

      // simulated current if driven by Vsup across Rtot
      const I_sim = Rtot > 0 && Number.isFinite(Rtot) ? VsupNum / Rtot : 0;

      // for voltage measurement: assume nodes of series chain - compute node voltages
      const nodeVoltages = [];
      if (circuit.type === "series") {
        // voltage divider
        const parts = eq.parts;
        let accum = 0;
        for (let i = 0; i < parts.length; ++i) {
          const r = parts[i];
          const drop = (I_sim * r) || 0;
          accum += drop;
          nodeVoltages.push(round(accum, 6)); // voltage at node after resistor i
        }
      } else {
        // parallel: node voltage equals Vsup
        for (let i = 0; i < eq.parts.length; ++i) nodeVoltages.push(VsupNum);
      }

      // measurement logic:
      let V_meas = 0;
      let I_meas = 0;
      let R_meas = 0;

      // manualI overrides measured current when provided
      const I_used = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : I_sim;

      if (measureMode === "voltage") {
        // choose node index from manualProbe.node (0-based). If -1 use supply.
        const idx = Number.isFinite(Number(manualProbe.node)) ? Number(manualProbe.node) : 0;
        if (idx < 0) {
          V_meas = VsupNum;
        } else {
          V_meas = nodeVoltages[Math.min(Math.max(0, idx), nodeVoltages.length - 1)] || 0;
        }
        I_meas = I_used;
        R_meas = Number.isFinite(Rtot) ? Rtot : Infinity;
      } else if (measureMode === "current") {
        // measure current through entire circuit (I_sim or manual override)
        I_meas = I_used;
        V_meas = VsupNum;
        R_meas = Number.isFinite(Rtot) && Rtot > 0 ? V_meas / I_meas : Rtot;
      } else {
        // resistance measurement: simulate injecting testCurrent and measuring resulting voltage
        const Itest = testCurrent || 0.001;
        // For real DMM, R = measured V / injected I (accounting for series resistance). We'll simulate simply:
        const Vdrop = Itest * (Rtot || 0);
        R_meas = Rtot;
        V_meas = Vdrop;
        I_meas = Itest;
      }

      // small flicker / noise to feel more "real"
      const noise = (Math.sin(tSeconds * 7.3) * 0.002 + Math.sin(tSeconds * 12.7) * 0.001) * (Math.max(1, Math.abs(I_meas)) + 1);

      return { V: V_meas + noise, I: I_meas + noise * 0.01, R: R_meas };
    },
    [eq, Vsup, measureMode, manualProbe, manualI, testCurrent]
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

      const inst = computeInstant(tSeconds);

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, V: inst.V, I: inst.I, R: inst.R });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeInstant]);

  return { history, eq };
}

/* ============================
   Circuit Visualizer (SVG)
   - Renders resistors and animated electrons based on measured current
   - Shows voltmeter/ammeter/ohmmeter dials (readouts)
   ============================ */
function CircuitVisualizer({ circuit, Vsup, measureMode, history = [], running, manualProbe, manualI }) {
  const latest = history.length ? history[history.length - 1] : { V: 0, I: 0, R: 0 };
  const Vsim = latest.V || 0;
  const Isim = latest.I || 0;
  const Rsim = latest.R || 0;

  const Iused = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : Isim;
  const absI = Math.abs(Iused);
  const dotCount = clamp(Math.round(3 + absI * 30), 3, 36);
  const speed = clamp(1.2 / (absI + 0.01), 0.18, 5); // seconds per cycle - smaller means faster animation for higher I

  const parts = circuit.resistors || [];
  const partCount = Math.max(1, parts.length);
  const spacing = Math.max(80, Math.min(220, Math.floor(520 / Math.max(1, Math.min(partCount, 6)))));
  const startX = 140;
  const svgWidth = Math.max(900, startX + spacing * partCount + 160);
  const busY = 140;
  const busStart = 80;
  const busEnd = svgWidth - 80;

  // helper to format values
  const formatOhm = (r) => {
    if (!Number.isFinite(r)) return "--";
    if (r >= 1000) return `${round(r / 1000, 3)} kΩ`;
    return `${round(r, 3)} Ω`;
  };

  const formatVolt = (v) => {
    if (!Number.isFinite(v)) return "--";
    if (Math.abs(v) < 1e-3) return `${round(v * 1e6, 3)} μV`;
    if (Math.abs(v) < 1) return `${round(v * 1e3, 3)} mV`;
    return `${round(v, 4)} V`;
  };

  const formatAmp = (i) => {
    if (!Number.isFinite(i)) return "--";
    if (Math.abs(i) < 1e-3) return `${round(i * 1e6, 3)} μA`;
    if (Math.abs(i) < 1) return `${round(i * 1e3, 3)} mA`;
    return `${round(i, 6)} A`;
  };

  // voltmeter placement: measure node index
  const selectedNodeIdx = Number.isFinite(Number(manualProbe.node)) ? Number(manualProbe.node) : 0;

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Usb className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Digital Multimeter • Live Visualizer</div>
            <div className="text-xs text-zinc-400">Select measurement • V / A / Ω • Animated flow</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{measureMode.toUpperCase()}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V<sub>sup</sub>: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">R<sub>eq</sub>: <span className="text-[#ff9a4a] ml-1">{formatOhm(Rsim)}</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} 300`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* supply */}
          <g transform={`translate(${busStart - 60},${busY})`}>
            <rect x="-22" y="-36" width="44" height="72" rx="6" fill="#060606" stroke="#222" />
            <text x="-36" y="-46" fontSize="12" fill="#ffd24a">{Vsup} V</text>
          </g>

          {/* bus */}
          <path d={`M ${busStart} ${busY} H ${busEnd}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* resistors */}
          {parts.map((r, i) => {
            const x = startX + i * spacing;
            const resistorLabel = `${r} Ω`;
            return (
              <g key={`r-${i}`}>
                {/* vertical branch */}
                <path d={`M ${x} ${busY} V ${busY - 80}`} stroke="#111" strokeWidth="4" strokeLinecap="round" />
                {/* resistor symbol (zig-zag as rect sequence) */}
                <g transform={`translate(${x - 24},${busY - 80})`}>
                  <rect x="0" y="0" rx="6" width="48" height="28" fill="#0a0a0a" stroke="#222" />
                  <rect x="4" y="4" width="40" height="20" rx="4" fill="#ffb86b" opacity={0.95} />
                  <text x="6" y="-6" fontSize="10" fill="#ffd24a">{resistorLabel}</text>
                </g>

                {/* small node connector down to bus */}
                <path d={`M ${x + 24} ${busY - 66} V ${busY}`} stroke="#111" strokeWidth="4" strokeLinecap="round" />

                {/* numeric label above */}
                <text x={x} y={busY - 96} fontSize="11" fill="#fff" textAnchor="middle">{formatOhm(Number(r))}</text>
              </g>
            );
          })}

          {/* voltmeter indicator near selected node */}
          <g transform={`translate(${startX + Math.min(partCount - 1, selectedNodeIdx) * spacing}, ${busY - 120})`}>
            <rect x="-38" y="-24" width="76" height="42" rx="10" fill="#060606" stroke="#222" />
            <text x="0" y="-6" fontSize="11" fill="#ffd24a" textAnchor="middle">Vmeter</text>
            <text x="0" y="12" fontSize="12" fill="#fff" fontWeight="600" textAnchor="middle">{formatVolt(Vsim)}</text>
          </g>

          {/* ammeter / ohmmeter readouts on right */}
          <g transform={`translate(${svgWidth - 160}, ${20})`}>
            <rect x="-80" y="-14" width="160" height="128" rx="12" fill="#060606" stroke="#222" />
            <text x="-60" y="6" fontSize="12" fill="#ffb57a">Meters</text>

            <text x="-60" y="30" fontSize="12" fill="#fff">V: <tspan fill="#ffd24a">{formatVolt(Vsim)}</tspan></text>
            <text x="-60" y="54" fontSize="12" fill="#fff">I: <tspan fill="#00ffbf">{formatAmp(Iused)}</tspan></text>
            <text x="-60" y="78" fontSize="12" fill="#fff">R: <tspan fill="#ff9a4a">{formatOhm(Rsim)}</tspan></text>
          </g>

          {/* animated electrons (dots) travelling along bus and down branches */}
          {Array.from({ length: dotCount }).map((_, di) => {
            // choose a branch path for each dot (distribute across parts)
            const branchIndex = di % partCount;
            const x = startX + branchIndex * spacing;
            const pathStr = `M ${busStart} ${busY} H ${x} V ${busY - 80} H ${x + 24}`;
            const delay = (di / dotCount) * speed;
            const style = {
              offsetPath: `path('${pathStr}')`,
              animationName: "dmmFlow",
              animationDuration: `${speed}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
              transformOrigin: "0 0",
            };
            const dotColor = Iused >= 0 ? "#ffd24a" : "#ff6a9a";
            return <circle key={`dot-${di}`} r="3.5" fill={dotColor} style={style} />;
          })}

          <style>{`
            @keyframes dmmFlow {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-1px,-1px) scale(0.9); }
              45% { opacity: 0.95; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(4px,4px) scale(0.8); }
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
   Oscilloscope component
   - Plots the selected measurement in time (V / I / R)
   ============================ */
function DmmOscilloscope({ history = [], selectedChannel = "V", running }) {
  const data = history.slice(-360).map((d, idx) => {
    return {
      t: idx,
      V: round(d.V, 6),
      I: round(d.I, 9),
      R: round(d.R, 6),
    };
  });

  const colors = {
    V: "#ffd24a",
    I: "#00ffbf",
    R: "#ff9a4a",
  };

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Scope — {selectedChannel === "V" ? "Voltage (V)" : selectedChannel === "I" ? "Current (A)" : "Resistance (Ω)"}</div>
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
            <Line type="monotone" dataKey={selectedChannel} stroke={colors[selectedChannel]} strokeWidth={2} dot={false} isAnimationActive={false} name={selectedChannel === "V" ? "Voltage (V)" : selectedChannel === "I" ? "Current (A)" : "Resistance (Ω)"} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Simulator Page Component
   ============================ */
export default function SimulatorPage() {
  // UI state
  const [measureMode, setMeasureMode] = useState("voltage"); // voltage | current | resistance
  const [Vsup, setVsup] = useState("5");
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [manualI, setManualI] = useState(""); // optional override
  const [manualProbe, setManualProbe] = useState({ node: 0 }); // for voltage node selection
  const [testCurrent, setTestCurrent] = useState("0.001"); // 1 mA default for resistance measurement
  const [selectedChannel, setSelectedChannel] = useState("V"); // channel shown in scope

  const [circuit, setCircuit] = useState({ type: "series", resistors: [100, 220] }); // default circuit

  const { history, eq } = useDmmSim({
    running,
    timestep: 80,
    measureMode,
    circuit,
    Vsup: Number.isFinite(Number(Vsup)) ? Number(Vsup) : 0,
    manualProbe,
    manualI,
    testCurrent: Number.isFinite(Number(testCurrent)) ? Number(testCurrent) : 0.001,
  });

  useEffect(() => {
    // when mode changes, auto-set scope channel
    if (measureMode === "voltage") setSelectedChannel("V");
    if (measureMode === "current") setSelectedChannel("I");
    if (measureMode === "resistance") setSelectedChannel("R");
  }, [measureMode]);

  // small helpers for mutating circuit
  const addResistor = () => setCircuit((s) => ({ ...s, resistors: [...s.resistors, 100] }));
  const updateResistor = (idx, val) => setCircuit((s) => ({ ...s, resistors: s.resistors.map((r, i) => (i === idx ? (Number.isFinite(Number(val)) ? Number(val) : 0) : r)) }));
  const removeResistor = (idx) => setCircuit((s) => ({ ...s, resistors: s.resistors.filter((_, i) => i !== idx) }));
  const setCircuitType = (t) => setCircuit((s) => ({ ...s, type: t }));

  // derived display values
  const ReqDisplay = useMemo(() => {
    const R = eq && Number.isFinite(eq.Req) ? eq.Req : NaN;
    if (!Number.isFinite(R)) return "--";
    if (R >= 1000) return `${round(R / 1000, 4)} kΩ`;
    return `${round(R, 4)} Ω`;
  }, [eq]);

  const IeqSim = history.length ? history[history.length - 1].I : 0;
  const IeqUsed = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : IeqSim;

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setMeasureMode("voltage");
    setVsup("5");
    setRunning(true);
    setCircuit({ type: "series", resistors: [100, 220] });
    setManualI("");
    setManualProbe({ node: 0 });
    setTestCurrent("0.001");
    toast("Reset to defaults");
  };

  const exportCSV = () => {
    const rows = [["t", "V", "I", "R"], ...history.map((d) => [d.t, round(d.V, 9), round(d.I, 9), round(d.R, 6)])];
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

  return (
    <div className="min-h-screen bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)]
                 bg-[length:18px_18px] text-white overflow-x-hidden">
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
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Digital Multimeter Simulator</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-36">
                <Select value={measureMode} onValueChange={(v) => setMeasureMode(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Measure" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="voltage" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Voltage (V)</SelectItem>
                    <SelectItem value="current" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Current (A)</SelectItem>
                    <SelectItem value="resistance" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Resistance (Ω)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={() => toast.success("Snapshot saved")} title="Save Snapshot">Snapshot</Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning} aria-label="Play / Pause" title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={resetDefaults} aria-label="Reset" title="Reset">
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
                  <Select value={measureMode} onValueChange={(v) => setMeasureMode(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Measure" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="voltage" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Voltage (V)</SelectItem>
                      <SelectItem value="current" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Current (A)</SelectItem>
                      <SelectItem value="resistance" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Resistance (Ω)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Run"}</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={resetDefaults}>Reset</Button>
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Digital Multimeter</div>
                        <div className="text-xs text-zinc-400">Measure Voltage, Current, Resistance — live</div>
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
                      <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
                      <Input value={Vsup} onChange={(e) => setVsup(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Manual Current Override (A) — optional</label>
                      <Input value={manualI} onChange={(e) => setManualI(e.target.value)} placeholder="Leave empty to use simulated value" type="text" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500 mt-1">Override measured current. Helpful to emulate probe loading or clamp meters.</div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Resistance Test Current (A) — used when measuring Ω</label>
                      <Input value={testCurrent} onChange={(e) => setTestCurrent(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500 mt-1">Small test current injected to derive R: R = V / I.</div>
                    </div>
                  </div>

                  {/* Circuit Editor */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">{circuit.type.toUpperCase()}</Badge>
                        <div className="text-xs text-zinc-400">Circuit layout (resistors)</div>
                      </div>

                      <Select value={circuit.type} onValueChange={(v) => setCircuitType(v)}>
                        <SelectTrigger className="w-32 bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500 rounded-md shadow-sm">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                          <SelectItem value="series" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Series</SelectItem>
                          <SelectItem value="parallel" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Parallel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      {circuit.resistors.map((val, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input value={val} onChange={(e) => updateResistor(idx, e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                          <div className="text-xs text-zinc-400">Ω</div>
                          <div className="ml-auto flex gap-2">
                            <Button variant="ghost" onClick={() => removeResistor(idx)} className="p-1 border border-zinc-800 bg-red-500 cursor-pointer text-black hover:bg-red-600"><ZapOff className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={addResistor}><PlusIconFallback /> Add Resistor</Button>
                      <Button variant="ghost" className="border border-zinc-800 text-zinc-300 cursor-pointer" onClick={() => { setCircuit({ type: "series", resistors: [100, 220] }); toast("Reset circuit"); }}>Reset Circuit</Button>
                    </div>
                  </div>

                  <div className="bg-black/70 border border-orange-500/30 text-white px-3 py-2 rounded-full shadow-sm backdrop-blur-sm text-xs flex flex-wrap gap-2 items-center">
                    <span>Equivalent: <span className="text-[#ff9a4a] font-semibold">{ReqDisplay}</span></span>
                    <span>•</span>
                    <span>I<sub>sim</sub>: <span className="text-[#00ffbf] font-semibold">{round(IeqSim, 9)} A</span></span>
                    <span>•</span>
                    <span>I<sub>used</sub>: <span className="text-[#ffd24a] font-semibold">{manualI === "" ? "—" : `${manualI} A`}</span></span>
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

          {/* Visual & scope column */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Usb className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive DMM Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated electron flow • dynamic meters • oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{measureMode}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vsup: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Req: <span className="text-[#ff9a4a] ml-1">{ReqDisplay}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <CircuitVisualizer circuit={circuit} Vsup={Number(Vsup)} measureMode={measureMode} history={history} running={running} manualProbe={manualProbe} manualI={manualI} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <DmmOscilloscope history={history} selectedChannel={selectedChannel} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <BatteryCharging className="w-5 h-5" /> Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Equivalent</div>
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{ReqDisplay}</div>
                      <div className="text-xs text-zinc-400 mt-1">Total R</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">I<sub>sim</sub> (last)</div>
                      <div className="text-lg font-semibold text-[#00ffbf] truncate">{round(IeqSim, 9)} A</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">I<sub>used</sub></div>
                      <div className="text-lg font-semibold text-[#ffd24a] truncate">{manualI === "" ? "—" : `${manualI} A`}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Last Voltage</div>
                      <div className="text-lg font-semibold text-[#ffd24a] truncate">{round(history.length ? history[history.length - 1].V : 0, 6)} V</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Last Resistance</div>
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{round(history.length ? history[history.length - 1].R : 0, 6)} Ω</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Manual Probe</div>
                      <div className="text-lg font-semibold text-[#ffd24a] truncate">Node {manualProbe.node}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Flash /></span>
                    <span>
                      Tip: switch modes to quickly verify node voltages, line currents, or measure resistance by injecting a small test current. Use manual current override to emulate clamp meters.
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

/* ============================
   Small helper icon fallback (kept inline so file remains self-contained)
   - You can remove and use proper lucide icons as needed
   ============================ */
function PlusIconFallback() {
  return <svg viewBox="0 0 24 24" className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16M4 12h16" /></svg>;
}
