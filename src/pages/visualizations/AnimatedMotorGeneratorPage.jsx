// src/pages/AnimatedMotorGeneratorPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Play,
  Pause,
  Settings,
  Download,
  Layers,
  Gauge,
  CircuitBoard,
  Activity,
  Menu,
  X,

  Thermometer,
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
import {Slider } from "@/components/ui/slider"
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

/* ---------- Utilities ---------- */
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

/* ---------- Motor simulation hook ----------
   - Simple dynamic model for a motor/generator.
   - state: omega (rad/s), I (A), V (V), torque (Nm), rpm
   - equations:
     I(t) approximated quasi-steady: I = (V_applied - Kb*omega) / R_total
     torque = Kt * I
     angular accel alpha = (torque - loadTorque - friction*omega) / J
     integrate omega using dω/dt = alpha
   - For generator mode, voltage is generated: V_generated = Kb * omega,
     and the applied circuit/load determines current.
------------------------------------------*/
function useMotorSim({
  running,
  timestep = 60,
  mode = "dc-motor", // 'dc-motor' | 'bldc' | 'generator'
  Vsup = 12,
  R = 1.0,
  Kt = 0.08, // torque constant (Nm/A)
  Kb = 0.08, // back-emf constant (V/(rad/s))
  J = 0.01, // inertia (kg*m^2)
  loadTorque = 0.02, // external torque (Nm)
  friction = 0.002, // viscous friction coeff
  loadResistance = 10, // only for generator mode - external load
}) {
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, rpm: 0, V: 0, I: 0, torque: 0, P: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const omegaRef = useRef(0); // rad/s
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);
  const energyRef = useRef(0);

  // safe param refs to avoid re-creating RAF loops too often
  const paramsRef = useRef({ mode, Vsup, R, Kt, Kb, J, loadTorque, friction, loadResistance });
  useEffect(() => {
    paramsRef.current = { mode, Vsup, R, Kt, Kb, J, loadTorque, friction, loadResistance };
  }, [mode, Vsup, R, Kt, Kb, J, loadTorque, friction, loadResistance]);

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
      if (dtMs < timestep) return;
      lastRef.current = ts;
      const dt = dtMs / 1000;

      // pull params
      const { mode: m, Vsup: V, R: Rtotal, Kt: Kt_p, Kb: Kb_p, J: J_p, loadTorque: Tload, friction: b, loadResistance: RL } =
        paramsRef.current;

      const omega = omegaRef.current;
      let I = 0;
      let appliedV = 0;
      let torque = 0;
      let electricalPower = 0;
      let mechPower = 0;

      if (m === "generator") {
        // generator: produced voltage depends on omega
        const Vgen = Kb_p * omega; // V
        // current depends on connected load: current = Vgen / (R + RL)
        I = Vgen / Math.max(1e-6, Rtotal + RL);
        appliedV = Vgen;
        torque = Kt_p * I * -1; // generator exerts reaction torque opposing rotation -> negative mechanical torque
        // mechanical (output) power ~ torque * omega (watch signs)
        electricalPower = Vgen * I;
        mechPower = torque * omega;
      } else {
        // motor: voltage applied drives current; back-EMF reduces current
        appliedV = V; // supply voltage
        // ohm-law with back-EMF: I = (V - Kb*omega)/R
        I = (V - Kb_p * omega) / Math.max(1e-6, Rtotal);
        // clamp physical current (allow negative for reversing)
        if (!Number.isFinite(I)) I = 0;
        torque = Kt_p * I; // torque produced
        electricalPower = appliedV * I;
        mechPower = torque * omega;
      }

      // friction (viscous) torque = b * omega (opposes motion)
      const frictionTorque = b * omega;
      // total torque accelerating rotor:
      // motors: torque - loadTorque - frictionTorque
      // generators: torque (negative) - loadTorque - frictionTorque (we allow Tload to act against rotation)
      const netTorque = torque - Tload - frictionTorque;

      // angular acceleration (rad/s^2)
      const alpha = netTorque / Math.max(1e-6, J_p);
      // integrate omega
      let omegaNext = omega + alpha * dt;
      // protect from negative/infinite explosion
      omegaNext = clamp(omegaNext, -2000, 2000); // rad/s clamp

      omegaRef.current = omegaNext;

      const rpm = (omegaNext * 60) / (2 * Math.PI);

      // record energy (simple integration of electrical power over dt)
      energyRef.current += electricalPower * dt;

      // push history sample
      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        const sample = {
          t: lastT + 1,
          rpm: round(rpm, 3),
          omega: round(omegaNext, 6),
          V: round(appliedV, 6),
          I: round(I, 6),
          torque: round(torque, 6),
          netTorque: round(netTorque, 6),
          P_elec: round(electricalPower, 6),
          P_mech: round(mechPower, 6),
          E: round(energyRef.current, 6),
        };
        next.push(sample);
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep]);

  // expose latest values + history
  const latest = history.length ? history[history.length - 1] : { rpm: 0, V: 0, I: 0, torque: 0, P_elec: 0, E: 0 };
  return {
    history,
    latest,
    // convenience getters
    rpm: latest.rpm || 0,
    I: latest.I || 0,
    V: latest.V || 0,
    torque: latest.torque || 0,
    energy: latest.E || 0,
    // ability to reset initial speed
    setOmega: (radPerSec) => {
      omegaRef.current = radPerSec;
    },
  };
}

/* ---------- Visualizer: Motor + Circuit ---------- */
function MotorVisualizer({ mode, history = [], latest = {}, running, manualLoad }) {
  // draw rotor with rotating inner disc whose angle is driven by latest.rpm
  const rpm = Number(latest.rpm || 0);
  // angle per second = rpm * 360 / 60 = rpm * 6 deg/s
  // But we will compute angle from rpm and an accumulated angle ref for smoothness
  const angleRef = useRef(0);
  const lastTs = useRef(performance.now());
  useEffect(() => {
    let alive = true;
    const tick = (ts) => {
      if (!alive) return;
      const dt = (ts - lastTs.current) / 1000;
      lastTs.current = ts;
      // rpm -> deg/sec
      const degPerSec = rpm * 6;
      angleRef.current = (angleRef.current + degPerSec * dt) % 360;
      requestAnimationFrame(tick);
    };
    lastTs.current = performance.now();
    requestAnimationFrame(tick);
    return () => {
      alive = false;
    };
  }, [rpm]);

  const angle = angleRef.current;

  // current-based animation
  const I = Number(latest.I || 0);
  const absI = Math.abs(I);
  const dotCount = clamp(Math.round(3 + absI * 12), 2, 22);
  const speed = clamp(1.2 / (absI + 0.01), 0.18, 2.2); // seconds per cycle

  // sizes
  const size = 520;
  const center = { x: size / 2, y: size / 2 };

  // small helper to compute color by sign
  const flowColor = I >= 0 ? "#00ffbf" : "#ff6a9a";

  const latestTorque = latest.netTorque ?? latest.torque ?? 0;
  const labelTorque = round(latestTorque, 6);

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">{mode === "generator" ? "Generator" : "Motor"} Visualizer</div>
            <div className="text-xs text-zinc-400">Real-time animation • rotor • coils • circuit</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">RPM: <span className="text-[#ffd24a] ml-1">{round(rpm, 2)}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I: <span className="text-[#00ffbf] ml-1">{round(I, 6)} A</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Torque: <span className="text-[#ff9a4a] ml-1">{labelTorque} Nm</span></Badge>
        </div>
      </div>

      <div className="mt-4 w-full overflow-x-auto flex gap-6">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[700px] h-[420px]">
          <defs>
            <radialGradient id="rotorGloss" cx="30%" cy="25%">
              <stop offset="0%" stopColor="#ffd24a" stopOpacity="0.45" />
              <stop offset="45%" stopColor="#ff7a2d" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.2" />
            </radialGradient>
          </defs>

          {/* stator (outer) */}
          <g transform={`translate(${center.x},${center.y})`}>
            <circle r="200" fill="#060606" stroke="#222" strokeWidth="6" />
            {/* stator coils - 4 positions */}
            {[0, 90, 180, 270].map((ang, i) => {
              const rad = (ang * Math.PI) / 180;
              const x = Math.cos(rad) * 150;
              const y = Math.sin(rad) * 150;
              return (
                <g key={i} transform={`translate(${x}, ${y})`}>
                  <rect x="-36" y="-18" width="72" height="36" rx="10" fill="#0b0b0b" stroke="#222" />
                  <rect x="-30" y="-12" width="60" height="24" rx="8" fill="#ffb86b" opacity="0.95" />
                </g>
              );
            })}

            {/* rotor (rotates) */}
            <g transform={`rotate(${angle})`}>
              <circle r="80" fill="url(#rotorGloss)" stroke="#111" strokeWidth="4" />
              {/* rotor spokes */}
              {[0, 60, 120].map((a, i) => {
                const r = (a * Math.PI) / 180;
                const x1 = Math.cos(r) * 10;
                const y1 = Math.sin(r) * 10;
                const x2 = Math.cos(r) * 70;
                const y2 = Math.sin(r) * 70;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0b0b0b" strokeWidth="8" strokeLinecap="round" />;
              })}

              {/* center cap */}
              <circle r="18" fill="#111" stroke="#222" strokeWidth="2" />
            </g>

            {/* decorative arrows to indicate torque direction */}
            <g transform="translate(0,-220)" opacity="0.9">
              <path d="M -26 -4 L 0 -20 L 26 -4" fill="#ff9a4a" transform={`rotate(${angle * 0.18})`} opacity="0.55" />
            </g>
          </g>

          {/* circuit wires to the left */}
{/* Armature wire with strict vertical flow */}
<g transform={`translate(${20}, ${center.y})`}>
  {/* Vertical wire */}
  <rect
    x="-10"
    y="-80"
    width="20"
    height="160"
    rx="10"
    fill="#060606"
    stroke="#222"
  />
  <text x="40" y="-90" fontSize="12" fill="#ffd24a">
    Armature
  </text>

  {/* Strict vertical-flow dots (no bending) */}
  {Array.from({ length: dotCount }).map((_, di) => {
    const delay = (di / dotCount) * speed;
    return (
      <circle
        key={`w-dot-${di}`}
        r="4"
        cx="0"
        cy={-80 + (160 * di) / dotCount}
        fill={flowColor}
        style={{
          animation: `wireFlowStrict ${speed}s linear ${-delay}s infinite`,
          animationPlayState: running ? "running" : "paused",
        }}
      />
    );
  })}

  {/* Simple linear animation */}
  <style>{`
    @keyframes wireFlowStrict {
      0% { cy: -80; opacity: 0.9; }
      50% { opacity: 1; }
      100% { cy: 80; opacity: 0; }
    }
  `}</style>
</g>


          {/* readout box */}
          <g transform={`translate(${size - 180}, 60)`}>
            <rect x="12" y="-48" width="240" height="180" rx="10" fill="#060606" stroke="#222" />
            <text x="20" y="-22" fontSize="12" fill="#ffb57a">Readouts</text>

            <text x="20" y="2" fontSize="12" fill="#fff">V: <tspan fill="#ffd24a">{round(latest.V, 4)} V</tspan></text>
            <text x="20" y="22" fontSize="12" fill="#fff">I: <tspan fill="#00ffbf">{round(latest.I, 6)} A</tspan></text>
            <text x="20" y="42" fontSize="12" fill="#fff">RPM: <tspan fill="#ffd24a">{round(latest.rpm, 2)}</tspan></text>
            <text x="20" y="62" fontSize="12" fill="#fff">Torque: <tspan fill="#ff9a4a">{round(latest.torque, 6)} Nm</tspan></text>
            <text x="20" y="82" fontSize="12" fill="#fff">Energy: <tspan fill="#9ee6ff">{round(latest.E, 6)} J</tspan></text>
          </g>

          <style>{`
            @keyframes wireFlow {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-1px,-1px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
          `}</style>
        </svg>

        {/* small vertical column with meters */}
        <div className="flex flex-col gap-3 w-60">
          <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
            <div className="text-xs text-zinc-400">Voltmeter</div>
            <div className="text-lg font-semibold text-[#ffd24a]">{round(latest.V, 4)} V</div>
          </div>
          <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
            <div className="text-xs text-zinc-400">Ammeter</div>
            <div className="text-lg font-semibold text-[#00ffbf]">{round(latest.I, 6)} A</div>
          </div>
          <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
            <div className="text-xs text-zinc-400">RPM</div>
            <div className="text-lg font-semibold text-[#ffd24a]">{round(latest.rpm, 2)}</div>
          </div>
          <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
            <div className="text-xs text-zinc-400">Load torque</div>
            <div className="text-lg font-semibold text-[#ff9a4a]">{round(manualLoad ?? 0, 6)} Nm</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Oscilloscope for V, I, RPM ---------- */
function MotorOscilloscope({ history = [], running }) {
  const data = history.slice(-360).map((d, idx) => ({
    t: idx,
    V: d.V,
    I: d.I,
    RPM: d.rpm,
    P: d.P_elec,
  }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — V, I, RPM</div>
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
            <Line type="monotone" dataKey="RPM" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="RPM" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Main Page Component ---------- */
export default function AnimatedMotorGeneratorPage() {
  // UI state
  const [mode, setMode] = useState("dc-motor");
  const [preset, setPreset] = useState("small-dc");
  const [Vsup, setVsup] = useState("12");
  const [R, setR] = useState("1.0");
  const [Kt, setKt] = useState("0.08");
  const [Kb, setKb] = useState("0.08");
  const [J, setJ] = useState("0.01");
  const [loadTorque, setLoadTorque] = useState("0.02");
  const [friction, setFriction] = useState("0.002");
  const [loadResistance, setLoadResistance] = useState("10");
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // presets
  useEffect(() => {
    if (preset === "small-dc") {
      setMode("dc-motor");
      setVsup("12");
      setR("1.0");
      setKt("0.08");
      setKb("0.08");
      setJ("0.01");
      setLoadTorque("0.02");
      setFriction("0.002");
      setLoadResistance("10");
    } else if (preset === "bldc-fast") {
      setMode("bldc");
      setVsup("24");
      setR("0.4");
      setKt("0.02");
      setKb("0.02");
      setJ("0.005");
      setLoadTorque("0.01");
      setFriction("0.001");
      setLoadResistance("8");
    } else if (preset === "large-generator") {
      setMode("generator");
      setVsup("0");
      setR("0.6");
      setKt("0.2");
      setKb("0.2");
      setJ("0.08");
      setLoadTorque("0.5");
      setFriction("0.005");
      setLoadResistance("30");
    }
  }, [preset]);

  const { history, latest, rpm, I, V, torque, energy, setOmega } = useMotorSim({
    running,
    timestep: 60,
    mode,
    Vsup: Number.isFinite(Number(Vsup)) ? Number(Vsup) : 0,
    R: Number.isFinite(Number(R)) ? Number(R) : 1,
    Kt: Number.isFinite(Number(Kt)) ? Number(Kt) : 0.08,
    Kb: Number.isFinite(Number(Kb)) ? Number(Kb) : 0.08,
    J: Number.isFinite(Number(J)) ? Number(J) : 0.01,
    loadTorque: Number.isFinite(Number(loadTorque)) ? Number(loadTorque) : 0,
    friction: Number.isFinite(Number(friction)) ? Number(friction) : 0.002,
    loadResistance: Number.isFinite(Number(loadResistance)) ? Number(loadResistance) : 10,
  });

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setPreset("small-dc");
    toast("Reset to preset: Small DC Motor");
  };

  const exportCSV = () => {
    const rows = [
      ["t", "rpm", "V", "I", "torque", "P_elec", "E"],
      ...history.map((d) => [d.t, d.rpm, d.V, d.I, d.torque, d.P_elec, d.E]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `motor-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const snapshot = () => {
    toast.success("Snapshot saved (UI-only)");
  };

  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2 sm:py-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.36 }}
              className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <div className="w-10 h-10  rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-5 h-5  text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm  font-semibold text-zinc-200">SparkLab</div>
                <div className="text-xs  text-zinc-400 -mt-0.5 truncate">Motor & Generator Lab</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-40">
                <Select value={mode} onValueChange={(v) => setMode(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="dc-motor">DC Motor</SelectItem>
                    <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="bldc" >BLDC (fast)</SelectItem>
                    <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="generator">Generator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200"
                  onClick={snapshot}
                  title="Save Snapshot"
                >
                  Snapshot
                </Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={resetDefaults}>
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

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="w-28 sm:w-36 md:w-44">
                  <Select value={mode} onValueChange={(v) => setMode(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem  value="dc-motor" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">DC Motor</SelectItem>
                      <SelectItem value="bldc" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">BLDC (fast)</SelectItem>
                      <SelectItem value="generator" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Generator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={snapshot}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Run"}</Button>
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Motor / Generator Controls</div>
                        <div className="text-xs text-zinc-400">Realtime • Physics-driven • Interactive</div>
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
                      <label className="text-xs text-zinc-400">Preset</label>
                      <Select value={preset} onValueChange={(v) => setPreset(v)}>
                        <SelectTrigger className="w-full cursor-pointer bg-zinc-900/60 border border-zinc-800 text-white text-sm rounded-md">
                          <SelectValue placeholder="Select preset" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 cursor-pointer border border-zinc-800 rounded-md shadow-lg">
                          <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="small-dc">Small DC Motor</SelectItem>
                          <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="bldc-fast">BLDC (Fast)</SelectItem>
                          <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="large-generator">Large Generator</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

<div className="space-y-4">
  {/* Supply Voltage */}
  <div className="bg-zinc-900 p-2 rounded-2xl">
    <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
    <div className="flex items-center flex-col gap-3">
      <Input
        type="number"
        value={Vsup}
        onChange={(e) => setVsup(Number(e.target.value))}
        className="bg-zinc-900/60 border border-zinc-800 text-white w-full"
      />
      <Slider
        value={[Number(Vsup)]}
        onValueChange={(v) => setVsup(v[0])}
        min={0}
        max={240}
        step={1}
        className="flex-1 cursor-pointer"
      />
    </div>
  </div>

  {/* Armature Resistance */}
  <div className="bg-zinc-900 p-2 rounded-2xl">
    <label className="text-xs text-zinc-400">Armature Resistance (Ω)</label>
    <div className="flex items-center flex-col gap-3">
      <Input
        type="number"
        value={R}
        onChange={(e) => setR(Number(e.target.value))}
        className="bg-zinc-900/60 border border-zinc-800 text-white w-full"
      />
      <Slider
        value={[Number(R)]}
        onValueChange={(v) => setR(v[0])}
        min={0}
        max={50}
        step={0.1}
        className="flex-1 cursor-pointer"
      />
    </div>
  </div>

  {/* Kt and Kb */}
  <div className="grid grid-cols-2 gap-4">
    <div className="bg-zinc-900 p-2 rounded-2xl">
      <label className="text-xs text-zinc-400">Kt (Nm/A)</label>
      <div className="flex items-center flex-col gap-3">
        <Input
          type="number"
          value={Kt}
          onChange={(e) => setKt(Number(e.target.value))}
          className="bg-zinc-900/60 border border-zinc-800 text-white w-full"
        />
        <Slider
          value={[Number(Kt)]}
          onValueChange={(v) => setKt(v[0])}
          min={0}
          max={2}
          step={0.01}
          className="flex-1 cursor-pointer"
        />
      </div>
    </div>

    <div className="bg-zinc-900 p-2 rounded-2xl">
      <label className="text-xs text-zinc-400">Kb (V/(rad/s))</label>
      <div className="flex items-center flex-col gap-3">
        <Input
          type="number"
          value={Kb}
          onChange={(e) => setKb(Number(e.target.value))}
          className="bg-zinc-900/60 border border-zinc-800 text-white w-full"
        />
        <Slider
          value={[Number(Kb)]}
          onValueChange={(v) => setKb(v[0])}
          min={0}
          max={2}
          step={0.01}
          className="flex-1 cursor-pointer"
        />
      </div>
    </div>
  </div>

  {/* Rotor Inertia */}
  <div className="bg-zinc-900 p-2 rounded-2xl">
    <label className="text-xs text-zinc-400">Rotor Inertia (J)</label>
    <div className="flex items-center flex-col gap-3">
      <Input
        type="number"
        value={J}
        onChange={(e) => setJ(Number(e.target.value))}
        className="bg-zinc-900/60 border border-zinc-800 text-white w-full"
      />
      <Slider
        value={[Number(J)]}
        onValueChange={(v) => setJ(v[0])}
        min={0}
        max={1}
        step={0.001}
        className="flex-1 cursor-pointer"
      />
    </div>
  </div>

  {/* Load Torque */}
  <div className="bg-zinc-900 p-2 rounded-2xl">
    <label className="text-xs text-zinc-400">Load Torque (Nm)</label>
    <div className="flex items-center flex-col gap-3">
      <Input
        type="number"
        value={loadTorque}
        onChange={(e) => setLoadTorque(Number(e.target.value))}
        className="bg-zinc-900/60 border border-zinc-800 text-white w-full"
      />
      <Slider
        value={[Number(loadTorque)]}
        onValueChange={(v) => setLoadTorque(v[0])}
        min={0}
        max={20}
        step={0.1}
        className="flex-1 cursor-pointer"
      />
    </div>
  </div>

  {/* Friction */}
  <div className="bg-zinc-900 p-2 rounded-2xl">
    <label className="text-xs text-zinc-400">Friction (viscous)</label>
    <div className="flex items-center flex-col gap-3">
      <Input
        type="number"
        value={friction}
        onChange={(e) => setFriction(Number(e.target.value))}
        className="bg-zinc-900/60 border border-zinc-800 text-white w-full"
      />
      <Slider
        value={[Number(friction)]}
        onValueChange={(v) => setFriction(v[0])}
        min={0}
        max={2}
        step={0.01}
        className="flex-1 cursor-pointer"
      />
    </div>
  </div>

  {/* Load Resistance */}
  <div className="bg-zinc-900 p-2 rounded-2xl">
    <label className="text-xs text-zinc-400">Load Resistance (Ω) — generator mode</label>
    <div className="flex items-center flex-col gap-3">
      <Input
        type="number"
        value={loadResistance}
        onChange={(e) => setLoadResistance(Number(e.target.value))}
        className="bg-zinc-900/60 border border-zinc-800 text-white w-full"
      />
      <Slider
        value={[Number(loadResistance)]}
        onValueChange={(v) => setLoadResistance(v[0])}
        min={0}
        max={100}
        step={0.5}
        className="flex-1 cursor-pointer"
      />
    </div>
  </div>
</div>


                  </div>

                  <div className="flex items-center gap-2 justify-between mt-2">
                    <div className="flex gap-2">
                      <Button className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={snapshot}><Layers className="w-4 h-4" /></Button>
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Motor / Generator</div>
                        <div className="text-xs text-zinc-400">Animated rotor • circuit flow • oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{mode}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">R: <span className="text-[#ffd24a] ml-1">{R} Ω</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <MotorVisualizer mode={mode} history={history} latest={latest} running={running} manualLoad={Number(loadTorque)} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <MotorOscilloscope history={history} running={running} />
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
                      <div className="text-xs text-zinc-400">RPM</div>
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{round(rpm, 2)}</div>
                      <div className="text-xs text-zinc-400 mt-1">Angular speed</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Current (I)</div>
                      <div className="text-lg font-semibold text-[#00ffbf] truncate">{round(I, 6)} A</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Torque</div>
                      <div className="text-lg font-semibold text-[#ffd24a] truncate">{round(torque, 6)} Nm</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Electrical Power</div>
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{round(latest.P_elec ?? 0, 6)} W</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Stored Energy</div>
                      <div className="text-lg font-semibold text-[#9ee6ff] truncate">{round(energy, 6)} J</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Mode</div>
                      <div className="text-lg font-semibold text-[#ffd24a] truncate ">{mode}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Thermometer /></span>
                    <span>
                      Tip: Try switching to <span className="text-white font-semibold">Generator</span> and increase rotor speed (e.g., externally by calling setOmega) to see generated voltage & current.
                    </span>
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
            <Button variant="outline" className="px-3 cursor-pointer py-2 border-zinc-700 text-black text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 cursor-pointer p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
