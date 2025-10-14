// src/pages/TesterPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Cpu,
  Zap,
  Play,
  Pause,
  Settings,
  Download,
  Menu,
  X,
  Sparkles,
  ArrowRightCircle,
  Triangle,
  Activity,
  CircuitBoard,
  Gauge,
  Trash2,
  Plus,
  Search,
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
  ScatterChart,
  Scatter,
} from "recharts";

/* ------------------------------
   Utilities
   ------------------------------ */
const round = (v, p = 6) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  const f = 10 ** p;
  return Math.round(n * f) / f;
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------
   Device simulation hook
   - Supports 'diode' (Shockley) and 'transistor' (simple BJT-like)
   - Two modes: "single" (time response for step supply) and "sweep" (IV curve sweep)
   - Returns: history (time), ivCurve (sweep), instant values, run control
   ------------------------------ */
function useDeviceSim({
  running,
  deviceType = "diode",
  mode = "single",
  Vsup = 5,
  seriesR = 100,
  manualI = "",
  diodeParams = { Is: 1e-9, n: 1.8, T: 300 }, // Is (A), ideality n, temp K (for Vt)
  transistorParams = { beta: 100, Vcesat: 0.2, Vth: 0.7 }, // simple BJT-ish param
  sweepRange = { from: -1, to: 1, steps: 200 },
  timestep = 60,
}) {
  const historyRef = useRef(Array.from({ length: 200 }, (_, i) => ({ t: i, V: 0, I: 0, P: 0 })));
  const [history, setHistory] = useState(historyRef.current);
  const ivRef = useRef([]);
  const [ivCurve, setIvCurve] = useState([]);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);
  const sweepIdxRef = useRef(0);

  // thermal voltage (Vt = kT/q). Use approx 25.85 mV at 300K
  const Vt = useMemo(() => 0.02585 * (diodeParams.T ? diodeParams.T / 300 : 1), [diodeParams.T]);

  const diodeI = useCallback(
    (vd) => {
      // Shockley diode equation: I = Is * (exp(vd/(n*Vt)) - 1)
      const { Is = 1e-9, n = 1.8 } = diodeParams;
      // clamp exponent to avoid overflow
      const x = vd / (n * Vt || 0.026);
      // avoid blowing up:
      const expTerm = x > 100 ? Math.exp(100) : Math.exp(clamp(x, -60, 60));
      return Is * (expTerm - 1);
    },
    [diodeParams, Vt]
  );

  const transistorIc = useCallback(
    (vbe, vce, Ib = 1e-6) => {
      // Simple BJT model:
      // If vce < Vcesat => saturation, Ic ~ beta_sat * Ib (we clamp)
      // Else in active region Ic = beta * Ib
      const { beta = 100, Vcesat = 0.2 } = transistorParams;
      if (vce <= Vcesat) {
        return Math.max(0, 10 * Ib); // reduced gain in saturation (approx)
      }
      return Math.max(0, beta * Ib);
    },
    [transistorParams]
  );

  // compute instantaneous given supply, seriesR, and selected device operating point
  const computeInstant = useCallback(
    (tSeconds, sweepV = null) => {
      // If sweepV provided -> compute IV at that applied diode voltage (before series drop)
      if (deviceType === "diode") {
        if (mode === "sweep" && Number.isFinite(sweepV)) {
          const I = diodeI(sweepV);
          return { V: sweepV, I, P: sweepV * I };
        } else {
          // single step: Vsup step applied across seriesR and diode -> solve iteratively:
          // For diode: Vd + I*R = Vsup  => I = diodeI(Vd) ; numeric solve for Vd
          // Use simple Newton / secant search over Vd in [-1, Vsup]
          const VsupN = Number(Vsup) || 0;
          const R = Math.max(1e-6, Number(seriesR) || 1);
          // Solve f(Vd) = Vd + R*I(Vd) - VsupN = 0
          let a = -1;
          let b = VsupN;
          let fa = a + R * diodeI(a) - VsupN;
          let fb = b + R * diodeI(b) - VsupN;
          // If signs are same, expand search bounds
          if (fa * fb > 0) {
            a = -5;
            b = Math.max(VsupN + 2, 5);
            fa = a + R * diodeI(a) - VsupN;
            fb = b + R * diodeI(b) - VsupN;
          }
          let Vd = 0;
          for (let i = 0; i < 60; i++) {
            const mid = 0.5 * (a + b);
            const fm = mid + R * diodeI(mid) - VsupN;
            if (Math.abs(fm) < 1e-9) {
              Vd = mid;
              break;
            }
            if (fa * fm < 0) {
              b = mid;
              fb = fm;
            } else {
              a = mid;
              fa = fm;
            }
            Vd = mid;
          }
          const I = diodeI(Vd);
          return { V: Vd, I, P: Vd * I };
        }
      } else {
        // transistor (simple). Provide two modes:
        // - Sweep: compute collector current vs Vce for fixed Ib (provided via manualI or a default)
        // - Single: apply Vsup across seriesR and transistor collector-emitter; solve Vce such that
        //   Vce + I*R = Vsup, with I = Ic(vbe, vce, Ib). We'll assume a fixed Ib or manual base current.
        const VsupN = Number(Vsup) || 0;
        const R = Math.max(1e-6, Number(seriesR) || 1);
        const Ib = Number(manualI) || 1e-6;
        if (mode === "sweep" && Number.isFinite(sweepV)) {
          // For transistor sweep we treat sweepV as Vce applied while Vbe set to transistorParams.Vth
          const Vce = sweepV;
          const Ic = transistorIc(transistorParams.Vth, Vce, Ib);
          return { V: Vce, I: Ic, P: Vce * Ic };
        } else {
          // Single solve: find Vce such that Vce + Ic(Vce)*R = Vsup
          let a = 0;
          let b = Math.max(VsupN, 1);
          let fa = a + transistorIc(transistorParams.Vth, a, Ib) * R - VsupN;
          let fb = b + transistorIc(transistorParams.Vth, b, Ib) * R - VsupN;
          // Ensure bracket
          if (fa * fb > 0) {
            b = Math.max(5, VsupN + 2);
            fb = b + transistorIc(transistorParams.Vth, b, Ib) * R - VsupN;
          }
          let Vce = 0;
          for (let i = 0; i < 60; i++) {
            const mid = 0.5 * (a + b);
            const fm = mid + transistorIc(transistorParams.Vth, mid, Ib) * R - VsupN;
            if (Math.abs(fm) < 1e-9) {
              Vce = mid;
              break;
            }
            if (fa * fm < 0) {
              b = mid;
              fb = fm;
            } else {
              a = mid;
              fa = fm;
            }
            Vce = mid;
          }
          const Ic = transistorIc(transistorParams.Vth, Vce, Ib);
          return { V: Vce, I: Ic, P: Vce * Ic };
        }
      }
    },
    [deviceType, diodeI, transistorIc, mode, Vsup, seriesR, transistorParams, manualI]
  );

  // Sweep generator
  const startSweep = useCallback(() => {
    ivRef.current = [];
    setIvCurve([]);
    sweepIdxRef.current = 0;
  }, []);

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

      // If sweep mode -> advance sweep index and compute IV points
      if (mode === "sweep") {
        const steps = Math.max(2, Number(sweepRange.steps || 200));
        let idx = sweepIdxRef.current;
        if (idx >= steps) {
          // finished sweep; keep last sample repeating
          idx = steps - 1;
        } else {
          // compute sweep step
          const v = sweepRange.from + ((sweepRange.to - sweepRange.from) * idx) / (steps - 1);
          const { V, I, P } = computeInstant(tSeconds, v);
          ivRef.current.push({ V, I, P });
          // Limit ivRef
          if (ivRef.current.length > steps) ivRef.current.shift();
          setIvCurve([...ivRef.current]);
          sweepIdxRef.current = idx + 1;
        }
      } else {
        // single-time mode: compute instantaneous device operating point
        const { V, I, P } = computeInstant(tSeconds, null);
        setHistory((h) => {
          const next = h.slice();
          const lastT = next.length ? next[next.length - 1].t : 0;
          next.push({ t: lastT + 1, V, I, P });
          if (next.length > 720) next.shift();
          return next;
        });
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeInstant, mode, sweepRange, sweepIdxRef, sweepRange.steps]);

  return {
    history,
    ivCurve,
    startSweep,
    computeInstant,
  };
}

/* ------------------------------
   Visualizer for the Tester
   - Animated SVG showing a simple circuit: supply -> series resistor -> device -> ground
   - Animated moving 'charge' dots, and dynamic meter readouts (ammeter needle approximated)
   ------------------------------ */
function VisualizerSVGTester({
  deviceType,
  mode,
  history = [],
  ivCurve = [],
  Vsup,
  seriesR,
  running,
  manualI,
}) {
  const latest = history.length ? history[history.length - 1] : { V: 0, I: 0, P: 0 };
  const displayI = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : latest.I || 0;
  const absI = Math.abs(displayI);
  const dotCount = clamp(Math.round(3 + absI * 30), 3, 28);
  const speed = clamp(1.8 / (absI + 0.005), 0.18, 6);
  const svgW = 980;
  const svgH = 320;

  // meter needle angle mapping for ammeter (I -> angle)
  const needleAngle = clamp((displayI / Math.max(1e-6, Math.abs(displayI) + 1e-3)) * 45, -60, 60);

  // color palette (no oklch)
  const accent = "#ff7a2d";
  const accent2 = "#ffd24a";
  const green = "#00ffbf";
  const pink = "#ff6a9a";
  const bgRect = "#0b0b0b";
  const borderRect = "#222";

  // Choose symbol rendering for device
  const deviceSymbol = (x, y) => {
    if (deviceType === "diode") {
      return (
        <g transform={`translate(${x}, ${y})`}>
          {/* diode triangle and bar */}
          <polygon points="0,-14 20,0 0,14" fill={accent2} stroke={borderRect} strokeWidth="1" />
          <rect x="22" y="-14" width="6" height="28" fill={accent} stroke={borderRect} rx="1" />
        </g>
      );
    } else {
      // transistor symbol (simple NPN) with base left, collector top, emitter bottom
      return (
        <g transform={`translate(${x}, ${y})`} >
          <line x1="-14" y1="0" x2="10" y2="0" stroke={accent2} strokeWidth="2" />
          <path d="M 10 -10 L 26 0 L 10 10 Z" fill={accent} stroke={borderRect} strokeWidth="1" />
          <circle cx="28" cy="0" r="1.6" fill={borderRect} />
          <text x="-30" y="-6" fontSize="10" fill="#ffd24a">B</text>
          <text x="30" y="-12" fontSize="10" fill="#ffd24a">C</text>
          <text x="30" y="18" fontSize="10" fill="#ffd24a">E</text>
        </g>
      );
    }
  };

  // Build animated path string for moving dots (series path)
  const pathStr = `M 120 160 H 260 L 420 160`;

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">
              {deviceType === "diode" ? "Diode Tester" : "Transistor Tester"}
            </div>
            <div className="text-xs text-zinc-400">Real-time IV • Oscilloscope • Animated flow</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{mode}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vsup: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">R<sub>s</sub>: <span className="text-[#ffd24a] ml-1">{seriesR} Ω</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I: <span className="text-[#00ffbf] ml-1">{round(displayI, 9)} A</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* supply */}
          <g transform="translate(60,160)">
            <rect x="-26" y="-36" width="52" height="72" rx="8" fill={bgRect} stroke={borderRect} />
            <text x="-44" y="-46" fontSize="12" fill={accent2}>{Vsup} V</text>
          </g>

          {/* series resistor box */}
          <g transform="translate(280,140)">
            <rect x="-14" y="-14" width="120" height="28" rx="8" fill={bgRect} stroke={borderRect} />
            <text x="36" y="6" fontSize="12" fill="#ffd24a">R = {seriesR} Ω</text>
          </g>

          {/* device symbol */}
          {deviceSymbol(520, 160)}

          {/* ground */}
          <g transform="translate(640,160)">
            <line x1="0" y1="0" x2="0" y2="18" stroke="#444" strokeWidth="2" />
            <line x1="-12" x2="12" y1="18" y2="18" stroke="#444" strokeWidth="2" />
            <line x1="-8" x2="8" y1="22" y2="22" stroke="#444" strokeWidth="2" />
            <line x1="-4" x2="4" y1="26" y2="26" stroke="#444" strokeWidth="2" />
          </g>

          {/* path for moving dots */}
          <path id="chargePath" d={pathStr} stroke="transparent" fill="none" />

          {/* animated dots */}
          {Array.from({ length: dotCount }).map((_, i) => {
            const delay = (i / dotCount) * speed;
            const style = {
              offsetPath: `path('${pathStr}')`,
              animationName: "flowDots",
              animationDuration: `${speed}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
              transformOrigin: "0 0",
            };
            const dotColor = displayI >= 0 ? accent2 : pink;
            return <circle key={`d-${i}`} r="4" fill={dotColor} style={style} />;
          })}

          {/* small readouts on right */}
          <g transform={`translate(${svgW - 180},40)`}>
            <rect x="-80" y="-34" width="160" height="140" rx="10" fill={bgRect} stroke={borderRect} />
            <text x="-70" y="-12" fontSize="12" fill={accent2}>Readouts</text>
            <text x="-70" y="8" fontSize="12" fill="#fff">Vdevice: <tspan fill={accent2}>{round(latest.V, 6)} V</tspan></text>
            <text x="-70" y="30" fontSize="12" fill="#fff">I: <tspan fill={green}>{round(latest.I, 9)} A</tspan></text>
            <text x="-70" y="52" fontSize="12" fill="#fff">P: <tspan fill={accent}>{round(latest.P, 8)} W</tspan></text>
          </g>

          {/* ammeter needle approximation */}
          <g transform="translate(760,160)">
            <rect x="-54" y="-54" width="108" height="108" rx="12" fill={bgRect} stroke={borderRect} />
            <text x="-28" y="-30" fontSize="11" fill="#ffd24a">Ammeter</text>
            <circle cx="0" cy="12" r="30" fill="#050506" stroke="#222" />
            <line x1="0" y1="12" x2="0" y2="-10" stroke="#666" strokeWidth="2" />
            <line
              x1="0"
              y1="12"
              x2={30 * Math.cos((needleAngle - 90) * (Math.PI / 180))}
              y2={30 * Math.sin((needleAngle - 90) * (Math.PI / 180))}
              stroke={green}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <text x="-20" y="56" fontSize="9" fill="#999">I = {round(latest.I, 9)} A</text>
          </g>

          <style>{`
            @keyframes flowDots {
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

      {/* IV mini-preview */}
      <div className="mt-3">
        <div className="rounded-md p-2 bg-black/60 border border-zinc-800">
          <div className="text-xs text-zinc-400">IV Preview (sweep mode shows curve)</div>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-full h-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ivCurve.slice(-250)}>
                  <CartesianGrid stroke="#111" strokeDasharray="3 3" />
                  <XAxis dataKey="V" tick={{ fill: "#888" }} />
                  <YAxis tick={{ fill: "#888" }} />
                  <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="I(V)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------
   Oscilloscope (time traces)
   ------------------------------ */
function MultiOscilloscopeTester({ history = [], running, manualI }) {
  const data = history.slice(-360).map((d, idx) => {
    const I_sim = d.I || 0;
    const I_manual = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : null;
    const I_used = I_manual !== null ? I_manual : I_sim;
    const V = d.V || 0;
    const P_used = V * I_used;
    return {
      t: idx,
      V: round(V, 6),
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
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
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

/* ------------------------------
   IV curve detailed plot (scatter)
   ------------------------------ */
function IVPlot({ ivCurve = [] }) {
  const data = ivCurve.map((d, i) => ({ V: d.V, I: d.I, idx: i }));
  return (
    <div className="rounded-xl p-3 bg-black/60 border border-zinc-800">
      <div className="text-sm text-[#ffd24a] mb-2">I-V Characteristic</div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis type="number" dataKey="V" name="Voltage (V)" tick={{ fill: "#888" }} />
            <YAxis type="number" dataKey="I" name="Current (A)" tick={{ fill: "#888" }} />
            <ReTooltip cursor={{ stroke: "#333" }} contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Scatter data={data} fill="#00ffbf" line={{ stroke: "#00ffbf" }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------
   Main Tester Page component
   ------------------------------ */
export default function TesterPage() {
  // UI state
  const [deviceType, setDeviceType] = useState("diode"); // 'diode' | 'transistor'
  const [mode, setMode] = useState("single"); // 'single' | 'sweep'
  const [Vsup, setVsup] = useState("5");
  const [seriesR, setSeriesR] = useState("100");
  const [running, setRunning] = useState(true);
  const [manualI, setManualI] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const [diodeParams, setDiodeParams] = useState({ Is: 1e-9, n: 1.8, T: 300 });
  const [transistorParams, setTransistorParams] = useState({ beta: 100, Vcesat: 0.2, Vth: 0.7 });

  const [sweepFrom, setSweepFrom] = useState("-1");
  const [sweepTo, setSweepTo] = useState("1");
  const [sweepSteps, setSweepSteps] = useState("200");

  const { history, ivCurve, startSweep, computeInstant } = useDeviceSim({
    running,
    deviceType,
    mode,
    Vsup: Number(Vsup),
    seriesR: Number(seriesR),
    manualI,
    diodeParams,
    transistorParams,
    sweepRange: { from: Number(sweepFrom), to: Number(sweepTo), steps: Number(sweepSteps) },
    timestep: 60,
  });

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setDeviceType("diode");
    setMode("single");
    setVsup("5");
    setSeriesR("100");
    setManualI("");
    setDiodeParams({ Is: 1e-9, n: 1.8, T: 300 });
    setTransistorParams({ beta: 100, Vcesat: 0.2, Vth: 0.7 });
    setSweepFrom("-1");
    setSweepTo("1");
    setSweepSteps("200");
    toast.success("Reset to defaults");
  };

  const runSweep = () => {
    setRunning(true);
    startSweep();
    toast.success("Sweep started");
  };

  const exportCSV = () => {
    const rows = [
      ["V", "I", "P"],
      ...ivCurve.map((r) => [r.V, r.I, r.P]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `device-iv-${deviceType}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-2 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
                <Zap className="w-6 h-6 text-black" />
              </div>
              <div>
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200">SparkLab — Tester</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5">Diode & Transistor IV Tester</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-36">
                <Select value={deviceType} onValueChange={(v) => setDeviceType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border border-zinc-800 text-white text-sm rounded-md">
                    <SelectValue placeholder="Device" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                    <SelectItem value="diode" className="text-white">Diode</SelectItem>
                    <SelectItem value="transistor" className="text-white">Transistor (BJT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-1 rounded-lg shadow-md" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
              <Button variant="ghost" className="border border-zinc-700 text-zinc-300 p-2 rounded-lg" onClick={toggleRunning} title={running ? "Pause" : "Play"}>
                {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>
              <Button variant="ghost" className="border border-zinc-700 text-zinc-300 p-2 rounded-lg" onClick={resetDefaults} title="Reset"><Settings className="w-5 h-5" /></Button>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Panel */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={deviceType} onValueChange={(v) => setDeviceType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border border-zinc-800 text-white text-sm rounded-md">
                    <SelectValue placeholder="Device" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                    <SelectItem value="diode" className="text-white">Diode</SelectItem>
                    <SelectItem value="transistor" className="text-white">Transistor (BJT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
              <Button variant="ghost" className="flex-1 border border-zinc-800" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16"></div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls */}
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Tester Controls</div>
                        <div className="text-xs text-zinc-400">Supply • Series R • Mode • Sweep</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Live</Badge>
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
                      <label className="text-xs text-zinc-400">Manual Base / Current Input (A)</label>
                      <Input value={manualI} onChange={(e) => setManualI(e.target.value)} placeholder="Optional: base current (transistor) or forced I" type="text" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500 mt-1">Leave empty to use simulated current.</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Select value={mode} onValueChange={(v) => setMode(v)}>
                      <SelectTrigger className="w-full bg-black/80 border border-zinc-800 text-white text-sm rounded-md">
                        <SelectValue placeholder="Mode" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                        <SelectItem value="single" className="text-white">Single (step)</SelectItem>
                        <SelectItem value="sweep" className="text-white">Sweep (IV curve)</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => { setRunning(true); toast.success("Started"); }}><Play className="w-4 h-4 mr-2" />Run</Button>
                  </div>

                  {mode === "sweep" && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <Input value={sweepFrom} onChange={(e) => setSweepFrom(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <Input value={sweepTo} onChange={(e) => setSweepTo(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <Input value={sweepSteps} onChange={(e) => setSweepSteps(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={runSweep}><ArrowRightCircle className="w-4 h-4 mr-2" /> Start Sweep</Button>
                        <Button variant="ghost" className="border border-zinc-800" onClick={() => { setRunning(false); toast("Sweep paused"); }}>Pause</Button>
                      </div>
                    </div>
                  )}

                  {/* device params */}
                  <div className="space-y-2">
                    {deviceType === "diode" ? (
                      <div className="space-y-2">
                        <div className="text-xs text-zinc-400">Diode Params</div>
                        <div className="grid grid-cols-3 gap-2">
                          <Input value={diodeParams.Is} onChange={(e) => setDiodeParams((s) => ({ ...s, Is: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                          <Input value={diodeParams.n} onChange={(e) => setDiodeParams((s) => ({ ...s, n: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                          <Input value={diodeParams.T} onChange={(e) => setDiodeParams((s) => ({ ...s, T: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs text-zinc-400">Transistor Params</div>
                        <div className="grid grid-cols-3 gap-2">
                          <Input value={transistorParams.beta} onChange={(e) => setTransistorParams((s) => ({ ...s, beta: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                          <Input value={transistorParams.Vcesat} onChange={(e) => setTransistorParams((s) => ({ ...s, Vcesat: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                          <Input value={transistorParams.Vth} onChange={(e) => setTransistorParams((s) => ({ ...s, Vth: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 justify-between mt-2">
                    <div className="flex gap-2">
                      <Button className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
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
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                        <CircuitBoard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Tester Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated flow • meters • oscilloscope • IV curve</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Device: <span className="text-[#ffd24a] ml-1">{deviceType}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{mode}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vsup: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <VisualizerSVGTester deviceType={deviceType} mode={mode} history={history} ivCurve={ivCurve} Vsup={Number(Vsup)} seriesR={Number(seriesR)} running={running} manualI={manualI} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MultiOscilloscopeTester history={history} manualI={manualI} running={running} />
              <IVPlot ivCurve={ivCurve} />
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
