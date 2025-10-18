// src/pages/GlossaryPage.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  BookOpen,
  Zap as Lightning,
  Cpu,
  Play,
  Pause,
  User,
  Users,
  Zap,
  Columns,
  Waves as WaveSquare,
  Terminal,
  Mic,
  Settings,
  Award,
} from "lucide-react";
import { Toaster, toast } from "sonner";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

/* ======================
   Sample Glossary Data
   Extend this list with more BEEE terms and metadata
   Each term has:
     - id, name, short, definition
     - category (Circuit, Electromagnetics, Power, Measurement, Semiconductor)
     - tags []
     - visual: { symbol: 'capacitor'|'inductor'|'resistor'|'diode'|'opamp'|'coil'|'antenna', waveform: {type, amp, freq, phase} }
     - complexity: 1..5 (used to tailor explanations for user type)
====================== */
const SAMPLE_TERMS = [
  {
    id: "C",
    name: "Capacitance",
    short: "Ability to store electric charge",
    definition:
      "Capacitance (C) is the ratio of the change in electric charge of a system to the corresponding change in its electric potential. Unit: Farad (F). Commonly used unit: microfarad (μF).",
    category: "Circuit",
    tags: ["passive", "energy-storage"],
    complexity: 2,
    visual: { symbol: "capacitor", waveform: { type: "exp_charge", amp: 1.0, freq: 0.8, phase: 0 } },
  },
  {
    id: "L",
    name: "Inductance",
    short: "Opposition to change in current",
    definition:
      "Inductance (L) defines the induced voltage in a coil for a given change in current: v = L (di/dt). Unit: Henry (H). Commonly used unit: millihenry (mH).",
    category: "Circuit",
    tags: ["passive", "magnetic"],
    complexity: 3,
    visual: { symbol: "inductor", waveform: { type: "exp_rise", amp: 0.6, freq: 0.6, phase: 0 } },
  },
  {
    id: "R",
    name: "Resistance",
    short: "Opposition to current",
    definition:
      "Resistance (R) is a measure of the opposition to current flow in an electrical circuit. Unit: Ohm (Ω).",
    category: "Circuit",
    tags: ["passive", "dissipative"],
    complexity: 1,
    visual: { symbol: "resistor", waveform: { type: "sine", amp: 0.4, freq: 2.2, phase: 0.3 } },
  },
  {
    id: "V",
    name: "Voltage (Potential Difference)",
    short: "Energy per unit charge",
    definition:
      "Voltage is the electrical potential difference between two points. Measured in Volts (V).",
    category: "Measurement",
    tags: ["basic", "measurement"],
    complexity: 1,
    visual: { symbol: "voltage_source", waveform: { type: "sine", amp: 1.0, freq: 1.6, phase: 0 } },
  },
  {
    id: "Q",
    name: "Q-Factor (Quality Factor)",
    short: "Resonator sharpness",
    definition:
      "The Q factor describes how underdamped a resonator is — higher Q means narrower resonance and less energy loss per cycle.",
    category: "Electromagnetics",
    tags: ["resonance", "rf"],
    complexity: 4,
    visual: { symbol: "resonator", waveform: { type: "sine_damped", amp: 1.0, freq: 3.6, phase: 0 } },
  },
  {
    id: "PSU",
    name: "Power Supply Unit",
    short: "Device that provides power",
    definition:
      "A device that converts AC mains to regulated DC rails for electronics. Includes rectifier, filter, and regulator stages.",
    category: "Power",
    tags: ["system", "supply"],
    complexity: 2,
    visual: { symbol: "psu", waveform: { type: "rectified", amp: 1.0, freq: 2.0, phase: 0 } },
  },

  // ========================= NEW 20 TERMS ============================= //

  {
    id: "I",
    name: "Current",
    short: "Flow of electric charge",
    definition:
      "Electric current is the rate of flow of charge through a conductor. Measured in amperes (A).",
    category: "Measurement",
    tags: ["basic", "flow"],
    complexity: 1,
    visual: { symbol: "current_source", waveform: { type: "sine", amp: 0.8, freq: 1.6, phase: 0.2 } },
  },
  {
    id: "P",
    name: "Power",
    short: "Rate of energy transfer",
    definition:
      "Power in an electric circuit is the rate at which energy is consumed or produced. P = VI watts.",
    category: "Power",
    tags: ["energy", "rate"],
    complexity: 2,
    visual: { symbol: "power_meter", waveform: { type: "sine_squared", amp: 1.0, freq: 3.2, phase: 0 } },
  },
  {
    id: "E",
    name: "Energy",
    short: "Capacity to do electrical work",
    definition:
      "Electrical energy is the total work done by moving charges. Measured in Joules (J) or kilowatt-hours (kWh).",
    category: "Power",
    tags: ["energy", "storage"],
    complexity: 1,
    visual: { symbol: "energy_core", waveform: { type: "ramp", amp: 0.8, freq: 0.5, phase: 0 } },
  },
  {
    id: "AC",
    name: "Alternating Current",
    short: "Current that reverses direction periodically",
    definition:
      "Alternating current changes direction and amplitude periodically. Common form: sinusoidal AC used in mains supply.",
    category: "Power",
    tags: ["waveform", "supply"],
    complexity: 2,
    visual: { symbol: "ac_source", waveform: { type: "sine", amp: 1.0, freq: 1.0, phase: 0 } },
  },
  {
    id: "DC",
    name: "Direct Current",
    short: "Unidirectional flow of charge",
    definition:
      "Direct current flows in one direction with constant magnitude, typically from batteries or rectifiers.",
    category: "Power",
    tags: ["steady", "battery"],
    complexity: 1,
    visual: { symbol: "dc_source", waveform: { type: "flat", amp: 0.8, freq: 0, phase: 0 } },
  },
  {
    id: "D",
    name: "Diode",
    short: "Allows current in one direction",
    definition:
      "A diode is a semiconductor device that conducts current primarily in one direction. Used for rectification and protection.",
    category: "Electronics",
    tags: ["semiconductor", "rectifier"],
    complexity: 2,
    visual: { symbol: "diode", waveform: { type: "rectified", amp: 0.9, freq: 2.4, phase: 0 } },
  },
  {
    id: "TR",
    name: "Transistor",
    short: "Electronic switch or amplifier",
    definition:
      "A transistor controls current flow between collector and emitter based on base input. Foundational to amplifiers and logic circuits.",
    category: "Electronics",
    tags: ["active", "amplifier"],
    complexity: 3,
    visual: { symbol: "transistor", waveform: { type: "pulse_mod", amp: 1.0, freq: 4.0, phase: 0 } },
  },
  {
    id: "LED",
    name: "Light Emitting Diode",
    short: "Converts electrical energy to light",
    definition:
      "An LED emits light when current passes through it. Efficient, durable, and used in indicators and displays.",
    category: "Optoelectronics",
    tags: ["light", "semiconductor"],
    complexity: 2,
    visual: { symbol: "led", waveform: { type: "pulse", amp: 1.0, freq: 1.5, phase: 0 } },
  },
  {
    id: "SCR",
    name: "Silicon Controlled Rectifier",
    short: "Controlled rectifying device",
    definition:
      "An SCR is a four-layer semiconductor that conducts when triggered, used in AC control and power electronics.",
    category: "Electronics",
    tags: ["power", "control"],
    complexity: 4,
    visual: { symbol: "scr", waveform: { type: "pulse", amp: 0.8, freq: 3.0, phase: 0 } },
  },
  {
    id: "BJTC",
    name: "BJT (Transistor Amplifier)",
    short: "Current-controlled current source",
    definition:
      "A Bipolar Junction Transistor (BJT) amplifies current; base current controls a larger collector current.",
    category: "Electronics",
    tags: ["amplifier", "switch"],
    complexity: 3,
    visual: { symbol: "bjt", waveform: { type: "gain_wave", amp: 1.2, freq: 3.0, phase: 0 } },
  },
  {
    id: "OPAMP",
    name: "Operational Amplifier",
    short: "High-gain differential amplifier",
    definition:
      "An op-amp amplifies the voltage difference between two inputs, widely used in analog signal conditioning.",
    category: "Electronics",
    tags: ["analog", "amplifier"],
    complexity: 4,
    visual: { symbol: "opamp", waveform: { type: "triangular", amp: 1.0, freq: 2.0, phase: 0 } },
  },
  {
    id: "BR",
    name: "Bridge Rectifier",
    short: "Converts AC to DC",
    definition:
      "A bridge rectifier uses four diodes to convert AC input into pulsating DC output.",
    category: "Power",
    tags: ["conversion", "rectifier"],
    complexity: 2,
    visual: { symbol: "bridge_rectifier", waveform: { type: "rectified_full", amp: 1.0, freq: 2.0, phase: 0 } },
  },
  {
    id: "XFMR",
    name: "Transformer",
    short: "Transfers power via magnetic coupling",
    definition:
      "A transformer converts AC voltage from one level to another using electromagnetic induction. Works only with AC.",
    category: "Power",
    tags: ["ac", "magnetic", "transfer"],
    complexity: 3,
    visual: { symbol: "transformer", waveform: { type: "sine", amp: 1.0, freq: 1.0, phase: 0.5 } },
  },
  {
    id: "RL",
    name: "RL Circuit",
    short: "Resistor-Inductor combination",
    definition:
      "An RL circuit contains both resistance and inductance, causing current to lag voltage by a phase angle.",
    category: "Circuit",
    tags: ["transient", "ac"],
    complexity: 3,
    visual: { symbol: "rl_circuit", waveform: { type: "exp_rise", amp: 1.0, freq: 1.4, phase: 0 } },
  },
  {
    id: "RC",
    name: "RC Circuit",
    short: "Resistor-Capacitor combination",
    definition:
      "An RC circuit exhibits charging and discharging transients when voltage is applied, with exponential behavior.",
    category: "Circuit",
    tags: ["transient", "filter"],
    complexity: 2,
    visual: { symbol: "rc_circuit", waveform: { type: "exp_charge", amp: 1.0, freq: 1.0, phase: 0 } },
  },
  {
    id: "RLC",
    name: "RLC Circuit",
    short: "Resonant circuit with R, L, and C",
    definition:
      "An RLC circuit can resonate at a particular frequency where inductive and capacitive reactances cancel out.",
    category: "Circuit",
    tags: ["resonance", "filter"],
    complexity: 4,
    visual: { symbol: "rlc_circuit", waveform: { type: "sine_damped", amp: 1.0, freq: 2.0, phase: 0 } },
  },
  {
    id: "PHASOR",
    name: "Phasor",
    short: "Rotating vector for AC analysis",
    definition:
      "A phasor represents a sinusoidal quantity as a rotating vector in complex form, simplifying AC calculations.",
    category: "AC Analysis",
    tags: ["ac", "math"],
    complexity: 3,
    visual: { symbol: "phasor", waveform: { type: "rotating", amp: 1.0, freq: 1.6, phase: 0 } },
  },
  {
    id: "Z",
    name: "Impedance",
    short: "Opposition to AC current",
    definition:
      "Impedance (Z) is the combined effect of resistance and reactance in an AC circuit. Measured in Ohms (Ω).",
    category: "AC Analysis",
    tags: ["complex", "ac"],
    complexity: 3,
    visual: { symbol: "impedance", waveform: { type: "vector", amp: 0.8, freq: 1.2, phase: 0.3 } },
  },
  {
    id: "Y",
    name: "Admittance",
    short: "Ease of current flow",
    definition:
      "Admittance is the reciprocal of impedance and represents how easily a circuit allows current to flow.",
    category: "AC Analysis",
    tags: ["complex", "ac"],
    complexity: 3,
    visual: { symbol: "admittance", waveform: { type: "vector", amp: 0.8, freq: 1.2, phase: 0.3 } },
  },
  {
    id: "PF",
    name: "Power Factor",
    short: "Cosine of phase angle between voltage and current",
    definition:
      "Power factor indicates efficiency in AC systems. PF = cos(ϕ). A lower PF means more reactive power and losses.",
    category: "AC Analysis",
    tags: ["efficiency", "phase"],
    complexity: 2,
    visual: { symbol: "pf_meter", waveform: { type: "cosine", amp: 1.0, freq: 1.0, phase: 0 } },
  },
  {
    id: "TORQUE",
    name: "Electromagnetic Torque",
    short: "Rotational effect due to magnetic fields",
    definition:
      "Torque in machines is produced by interaction between magnetic fields of rotor and stator. Unit: N·m.",
    category: "Machines",
    tags: ["motor", "field"],
    complexity: 3,
    visual: { symbol: "motor_torque", waveform: { type: "sine", amp: 1.0, freq: 1.0, phase: 0.2 } },
  },
  {
    id: "GEN",
    name: "Generator",
    short: "Converts mechanical to electrical energy",
    definition:
      "A generator works on the principle of electromagnetic induction — motion in a magnetic field induces EMF.",
    category: "Machines",
    tags: ["energy", "conversion"],
    complexity: 3,
    visual: { symbol: "generator", waveform: { type: "sine", amp: 1.0, freq: 1.0, phase: 0 } },
  },
  {
    id: "MTR",
    name: "Motor",
    short: "Converts electrical to mechanical energy",
    definition:
      "A motor operates by magnetic field interaction between stator and rotor currents, producing torque and rotation.",
    category: "Machines",
    tags: ["motion", "conversion"],
    complexity: 3,
    visual: { symbol: "motor", waveform: { type: "sine", amp: 1.0, freq: 1.0, phase: 0.5 } },
  },
];


/* ======================
   Helper utilities
====================== */
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

/* ======================
   Icon mapper
====================== */
function IconForSymbol({ symbol, className = "w-5 h-5" }) {
  switch (symbol) {
    case "capacitor":
      return <Columns className={className} />;
    case "inductor":
      return <WaveSquare className={className} />;
    case "resistor":
      return <Terminal className={className} />;
    case "diode":
      return <Zap className={className} />;
    case "voltage_source":
      return <Lightning className={className} />;
    case "resonator":
      return <Mic className={className} />;
    case "psu":
      return <Cpu className={className} />;
    default:
      return <BookOpen className={className} />;
  }
}

/* ======================
   Visualizer:
   - Renders symbol + animated waveform (SVG)
   - Driven by `visual` metadata from selected term
   - Includes interactive knobs for amplitude & frequency — changes are reflected in animation
====================== */
function TermVisualizer({ visual, running = true, onChange }) {
  // local animated parameters (start from visual metadata)
  const [amp, setAmp] = useState(visual?.waveform?.amp ?? 1);
  const [freq, setFreq] = useState(visual?.waveform?.freq ?? 1);
  const [phase, setPhase] = useState(visual?.waveform?.phase ?? 0);
  const rafRef = useRef(null);
  const tRef = useRef(0);
  const svgRef = useRef(null);
  const [time, setTime] = useState(0);

  useEffect(() => {
    // sync when visual changes externally
    setAmp(visual?.waveform?.amp ?? 1);
    setFreq(visual?.waveform?.freq ?? 1);
    setPhase(visual?.waveform?.phase ?? 0);
  }, [visual]);

  useEffect(() => {
    // inform parent of interactive parameter changes
    onChange?.({ amp, freq, phase });
  }, [amp, freq, phase, onChange]);

  useEffect(() => {
    let alive = true;
    const step = (ts) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(step);
      tRef.current += 16;
      if (running) setTime((tRef.current / 1000) % 100000);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running]);

  // waveform generator for svg path
  const makeWavePath = (w, h) => {
    const points = 220;
    const mid = h / 2;
    let d = `M 0 ${mid}`;
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * w;
      const t = (time / 1000) * freq + (i / points) * (freq * 0.8);
      let y;
      switch (visual?.waveform?.type) {
        case "sine":
          y = mid + Math.sin(t * 2 * Math.PI + phase) * amp * (h / 3);
          break;
        case "exp_charge":
          // emulate charging exponential: y = mid + (1 - e^-t)*amp
          y = mid + (1 - Math.exp(-t * 0.8)) * amp * (h / 3);
          break;
        case "exp_rise":
          y = mid + (1 - Math.exp(-t * 0.6)) * amp * (h / 3);
          break;
        case "sine_damped":
          y = mid + Math.sin(t * 2 * Math.PI + phase) * Math.exp(-t * 0.6) * amp * (h / 2);
          break;
        case "rectified":
          y = mid + (Math.sign(Math.sin(t * 2 * Math.PI + phase)) * 0.9) * amp * (h / 3);
          break;
        default:
          y = mid + Math.sin(t * 2 * Math.PI + phase) * amp * (h / 3);
      }
      d += ` L ${round(x, 2)} ${round(y, 2)}`;
    }
    return d;
  };

  return (
    <Card className="bg-black/75 border border-zinc-800 rounded-2xl p-3">
      <CardHeader className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black shadow">
            <IconForSymbol symbol={visual?.symbol} className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#ffd24a]">Visualizer</div>
            <div className="text-xs text-zinc-400">Live waveform • animated symbol • interactive knobs</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode</Badge>
          <div className="text-xs text-zinc-400">{visual?.symbol ?? "—"}</div>
        </div>
      </CardHeader>

      <CardContent className="mt-2">
        <div className="w-full  flex flex-col md:flex-row gap-3">
          {/* SVG visual */}
          <div className=" bg-black/50 border border-zinc-800 rounded-lg p-2">
            <svg ref={svgRef} viewBox="20 10 680 400" className="w-full sm:h-[500px] h-36">
              {/* symbol (left) */}
              <g transform="translate(18,20)">
                {/* Symbol simplified shapes */}
               {visual?.symbol === "capacitor" && (
  <>
    {/* Capacitor plates */}
    <g transform="translate(60, 50)">
      {/* Left Plate (negative) */}
      <rect
        x="-20"
        y="-20"
        width="8"
        height="40"
        rx="2"
        fill="#00eaff"
        opacity="0.8"
        style={{
          filter: "drop-shadow(0 0 6px #00eaff)",
        }}
      />
      {/* Right Plate (positive) */}
      <rect
        x="20"
        y="-20"
        width="8"
        height="40"
        rx="2"
        fill="#ffd24a"
        opacity="0.8"
        style={{
          filter: "drop-shadow(0 0 6px #ffd24a)",
        }}
      />

      {/* Gap Field / Electric Field Glow */}
      <rect
        x="-12"
        y="-20"
        width="24"
        height="40"
        fill="url(#electricGradient)"
        rx="4"
        opacity="0.3"
      />

      {/* Capacitor label */}
      <text x="0" y="-30" fontSize="12" fill="#ff7a2d" textAnchor="middle">
        C
      </text>
      <text x="0" y="50" fontSize="18" fill="#ff7a2d" textAnchor="middle">
        Capacitance
      </text>

      {/* Animated charge particles (electrons) */}
      {Array.from({ length: 12 }).map((_, i) => {
        const delay = (i / 12) * 2; // staggered animation
        return (
          <circle
            key={i}
            r="2"
            fill="#00eaff"
            style={{
              offsetPath: "path('M -60 0 Q 0 -10 0 0')",
              animationName: "chargeFlow",
              animationDuration: "2s",
              animationTimingFunction: "ease-in-out",
              animationDelay: `-${delay}s`,
              animationIterationCount: "infinite",
              transformOrigin: "0 0",
            }}
          />
        );
      })}

      {Array.from({ length: 12 }).map((_, i) => {
        const delay = (i / 12) * 2;
        return (
          <circle
            key={`p-${i}`}
            r="2"
            fill="#ffd24a"
            style={{
              offsetPath: "path('M 60 0 Q 0 10 0 0')",
              animationName: "chargeFlowReverse",
              animationDuration: "2s",
              animationTimingFunction: "ease-in-out",
              animationDelay: `-${delay}s`,
              animationIterationCount: "infinite",
              transformOrigin: "0 0",
            }}
          />
        );
      })}

      {/* Holographic rings (charge effect) */}
      <circle
        r="25"
        fill="none"
        stroke="#00eaff"
        strokeWidth="1"
        opacity="0.2"
        style={{
          animation: "pulseRing 2s infinite",
        }}
      />
      <circle
        r="25"
        fill="none"
        stroke="#ffd24a"
        strokeWidth="1"
        opacity="0.2"
        style={{
          animation: "pulseRing 2s infinite",
          animationDelay: "1s",
        }}
      />
    </g>

   <g transform="translate(280, 80)">
      <rect x="0" y="0" width="160" height="60" rx="6" fill="#0a0a0a" stroke="#222" />
      <path
        d="M0 60 C 20 55 40 40 60 25 C 80 15 100 8 120 4 C 140 2 160 0 160 0"
        fill="none"
        stroke="#ff7a2d"
        strokeWidth="2"
        strokeLinecap="round"
        style={{
          animation: "waveCharge 3s infinite",
        }}
      />
      <text x="80" y="55" fontSize="10" fill="#ffd24a" textAnchor="middle">
        Voltage (V) across C
      </text>
    </g>

    {/* SVG gradients */}
    <defs>
      <linearGradient id="electricGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#00eaff" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#ffd24a" stopOpacity="0.4" />
      </linearGradient>
    </defs>

    <style>{`
      @keyframes chargeFlow {
        0% { offset-distance: 0%; opacity: 0; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.2); }
        100% { offset-distance: 100%; opacity: 0; transform: scale(0.8); }
      }
      @keyframes chargeFlowReverse {
        0% { offset-distance: 0%; opacity: 0; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.2); }
        100% { offset-distance: 100%; opacity: 0; transform: scale(0.8); }
      }
      @keyframes pulseRing {
        0% { transform: scale(0.8); opacity: 0.1; }
        50% { transform: scale(1.1); opacity: 0.25; }
        100% { transform: scale(0.8); opacity: 0.1; }
      }
      @keyframes waveCharge {
        0% { stroke-dashoffset: 160; }
        100% { stroke-dashoffset: 0; }
      }
    `}</style>
  </>
)}

                {visual?.symbol === "inductor" && (
  <>
    {/* Inductor coil visualization */}
    <g transform="translate(60, 50)">
      {/* Coiled wire */}
      <g stroke="#00eaff" strokeWidth="3" fill="none" strokeLinecap="round">
        {Array.from({ length: 5 }).map((_, i) => (
          <path
            key={i}
            d={`M ${i * 12} 0 q 6 -20 12 0 q 6 -20 12 0`}
            style={{
              filter: "drop-shadow(0 0 6px #00eaff)",
              animation: `coilGlow ${(1 + i * 0.1)}s infinite alternate`,
            }}
          />
        ))}
      </g>
       <text x="8" y="52" fontSize="18" fill="#00eaff" textAnchor="middle">
        Inductance
      </text>

      {/* Animated current particles */}
      {Array.from({ length: 10 }).map((_, i) => {
        const delay = (i / 10) * 2;
        return (
          <circle
            key={i}
            r="2"
            fill="#ffd24a"
            style={{
              offsetPath: "path('M 0 0 q 6 -20 12 0 q 6 -20 12 0 q 6 -20 18 0')",
              animationName: "currentFlow",
              animationDuration: "2s",
              animationTimingFunction: "ease-in-out",
              animationDelay: `-${delay}s`,
              animationIterationCount: "infinite",
              transformOrigin: "0 0",
            }}
          />
        );
      })}

      {/* Pulsing magnetic rings */}
      {Array.from({ length: 3 }).map((_, i) => (
        <circle
          key={i}
          r={15 + i * 6}
          fill="none"
          stroke="#00eaff"
          strokeWidth="1.2"
          opacity="0.2"
          style={{
            animation: "magneticPulse 2.5s infinite",
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
    </g>

    {/* Exponential current waveform below inductor */}
    <g transform="translate(280, 80)">
      <rect x="0" y="0" width="200" height="60" rx="6" fill="#0a0a0a" stroke="#222" />
      <path
        d="M0 60 C 20 50 40 30 60 15 C 80 8 100 4 120 2 C 140 1 160 0 200 0"
        fill="none"
        stroke="#ff7a2d"
        strokeWidth="2"
        strokeLinecap="round"
        style={{
          animation: "waveCurrent 3s infinite",
        }}
      />
      <text x="100" y="55" fontSize="10" fill="#ffd24a" textAnchor="middle">
        Current (I) vs Time
      </text>
    </g>

    {/* Filters & gradients */}
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* Animations */}
    <style>{`
      @keyframes coilGlow {
        0% { stroke-opacity: 0.6; }
        50% { stroke-opacity: 1; }
        100% { stroke-opacity: 0.6; }
      }
      @keyframes currentFlow {
        0% { offset-distance: 0%; opacity: 0.3; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.2); }
        100% { offset-distance: 100%; opacity: 0.3; transform: scale(0.8); }
      }
      @keyframes magneticPulse {
        0% { transform: scale(0.8); opacity: 0.1; }
        50% { transform: scale(1.2); opacity: 0.25; }
        100% { transform: scale(0.8); opacity: 0.1; }
      }
      @keyframes waveCurrent {
        0% { stroke-dashoffset: 200; }
        100% { stroke-dashoffset: 0; }
      }
    `}</style>
  </>
)}

{visual?.symbol === "resistor" && (
  <>
    {/* === Resistor: futuristic, holographic, animated explanation of R === */}
    <svg viewBox="0 0 360 180" className="w-full h-[180px]">
      <defs>
        {/* neon glow filter */}
        <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* stronger inner glow for resistor */}
        <filter id="resistorInner" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
          <feComposite in="SourceGraphic" in2="b" operator="over" />
        </filter>

        {/* heat-haze (animated) */}
        <filter id="heatHaze">
          <feTurbulence id="turb" baseFrequency="0.012" numOctaves="2" seed="3" result="turb" />
          <feDisplacementMap in="SourceGraphic" in2="turb" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* subtle blur for particles */}
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>

        {/* gradient for resistor warm glow */}
        <linearGradient id="resGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#ffb84a" stopOpacity="1" />
          <stop offset="60%" stopColor="#ff7a2d" stopOpacity="1" />
          <stop offset="100%" stopColor="#ff4444" stopOpacity="0.95" />
        </linearGradient>

        {/* wire gradient */}
        <linearGradient id="wireGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#0d6bff" stopOpacity="1" />
          <stop offset="100%" stopColor="#00eaff" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* background subtle panel (not required but keeps standalone look) */}
      <rect x="0" y="0" width="100%" height="100%" fill="url(#bg)" opacity="0.0" />

      {/* --- Wires paths (invisible stroke used for offset-path animation) */}
      {/*
        We define one path that runs from left terminal, through a zigzag resistor region, to right terminal.
        Particles use offset-path with the same SVG path string so they travel the same route.
      */}
      <path
        id="flowPath"
        d="
          M 18 92
          H 100
          L 118 92
          l 6 -18 12 36 12 -36 12 36 12 -36 12 36 12 -36 12 36 12 -36 12 36
          L 244 92
          H 342
        "
        fill="none"
        stroke="transparent"
        strokeWidth="8"
      />

      {/* visible wires */}
      <path d="M18 92 H98" stroke="url(#wireGrad)" strokeWidth="6" strokeLinecap="round" />
      <path d="M246 92 H342" stroke="url(#wireGrad)" strokeWidth="6" strokeLinecap="round" />

      {/* resistor zigzag (visual only) */}
      <g transform="translate(100,74)">
        {/* base plate behind resistor */}
        <rect x="0" y="0" width="146" height="36" rx="6" fill="#070707" stroke="#111" strokeWidth="1.2" />
        {/* Zig-zag path as resistor body */}
        <polyline
          points="6,18 18,6 30,30 42,6 54,30 66,6 78,30 90,6 102,30 114,6 126,30 138,18"
          fill="none"
          stroke="#1b1b1b"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* heated overlay (glow changes with animation phases) */}
        <rect
          x="6"
          y="4"
          width="132"
          height="28"
          rx="5"
          fill="url(#resGrad)"
          opacity="0.0"
          id="resGlow"
          style={{ filter: "url(#neonGlow)" }}
        />
        {/* top shimmer to simulate hot surface */}
        <g id="shimmerGroup" opacity="0.0" filter="url(#heatHaze)">
          <rect x="6" y="-6" width="132" height="12" rx="4" fill="#ff7a2d" opacity="0.06" />
        </g>

        {/* resistor label */}
        <text x="70" y="50" textAnchor="middle" fontSize="16" fill="#ffd24a">
          Resistance
        </text>
      </g>

      {/* electrons (particles) flowing left → right */}
      {/* We'll create many particles with staggered animation delays; CSS keyframes slow them across the resistor region and fade/scale */}
      {Array.from({ length: 18 }).map((_, idx) => {
        const delay = (idx / 18) * 2.2; // stagger
        return (
          <circle
            key={`e-${idx}`}
            r="3"
            fill="#00eaff"
            opacity="0.95"
            style={{
              offsetPath:
                "path('M 18 92 H 100 L 118 92 l 6 -18 12 36 12 -36 12 36 12 -36 12 36 12 -36 12 36 L 244 92 H 342')",
              animationName: "flowElectron",
              animationDuration: "3.6s",
              animationTimingFunction: "linear",
              animationDelay: `-${delay}s`,
              animationIterationCount: "infinite",
              transformOrigin: "0 0",
              filter: "url(#soft)",
            }}
            className="electron"
          />
        );
      })}

      {/* scattered particles (some lose energy inside resistor and flicker out) */}
      {Array.from({ length: 8 }).map((_, i) => {
        const dly = (i / 8) * 2.4 + 0.2;
        return (
          <circle
            key={`s-${i}`}
            r="2.2"
            fill="#ff4444"
            opacity="0.0"
            style={{
              offsetPath:
                "path('M 140 92 C 150 80 170 80 180 92')",
              animationName: "scatter",
              animationDuration: "2.8s",
              animationDelay: `-${dly}s`,
              animationIterationCount: "infinite",
              animationTimingFunction: "ease-out",
              transformOrigin: "0 0",
              filter: "url(#soft)",
            }}
          />
        );
      })}

      {/* heat aura (outer glow) */}
      <g id="heatAura" opacity="0.0">
        <ellipse cx="173" cy="90" rx="90" ry="20" fill="#ff7a2d" opacity="0.06" filter="url(#neonGlow)" />
      </g>

      {/* small "infrared" smoke lines (subtle) */}
      <g id="smoke" opacity="0.0" stroke="#ff6a4a" strokeWidth="0.8" strokeLinecap="round" fill="none">
        <path d="M160 66 q6 -12 12 0 q6 12 12 0" opacity="0.12" />
        <path d="M180 62 q6 -10 12 0 q6 10 12 0" opacity="0.1" />
      </g>


      {/* CSS animations & keyframes */}
      <style>{`
        /* Flowing electrons travel the full path.
           Key idea: particles travel quickly on wires, slow & fade across resistor region (approx middle of path).
           We simulate that by manipulating offset-distance & opacity with keyframes that ease in/out.
        */

        @keyframes flowElectron {
          /* 0 - start on left wire */
          0% {
            offset-distance: 0%;
            transform: translateY(0) scale(0.9);
            opacity: 0.95;
            fill: #00eaff;
          }

          /* 28% ~ just before entering resistor region */
          28% {
            offset-distance: 32%;
            transform: translateY(0) scale(1);
            opacity: 0.95;
            fill: #00eaff;
          }

          /* 40% - inside resistor: slow down, dim, change tint */
          40% {
            offset-distance: 44%;
            transform: translateY(-1px) scale(0.8);
            opacity: 0.6;
            fill: #7fdfff;
            filter: drop-shadow(0 0 6px rgba(0,234,255,0.5));
          }

          /* 55% - deepest in resistor: slowest, most dim, slight red tint for lost energy*/
          55% {
            offset-distance: 52%;
            transform: translateY(0) scale(0.7);
            opacity: 0.35;
            fill: #ffd24a;
            filter: none;
          }

          /* 70% - exiting resistor: regained blue but a bit dim; some scatter occurs separately */
          70% {
            offset-distance: 66%;
            transform: translateY(0) scale(0.95);
            opacity: 0.85;
            fill: #00d6ff;
            filter: drop-shadow(0 0 6px rgba(0,214,255,0.55));
          }

          /* 100% - on right wire */
          100% {
            offset-distance: 100%;
            opacity: 0.95;
            transform: translateY(0) scale(1);
            fill: #00eaff;
          }
        }

        /* particles that "scatter" (lose energy) and flicker out around resistor */
        @keyframes scatter {
          0% {
            offset-distance: 0%;
            opacity: 0;
            transform: translateY(0) scale(0.6);
          }
          10% {
            offset-distance: 30%;
            opacity: 0.8;
            transform: translateY(-2px) scale(1.0);
            fill: #ff6a4a;
          }
          50% {
            offset-distance: 70%;
            opacity: 0.4;
            transform: translateY(-6px) scale(0.8);
            fill: #ff4444;
          }
          100% {
            offset-distance: 100%;
            opacity: 0;
            transform: translateY(-10px) scale(0.6);
          }
        }

        /* resistor glow pulsing based on "phases" of the demo loop */
        @keyframes resGlowPulse {
          0% { opacity: 0.0; filter: blur(0px); }
          20% { opacity: 0.08; filter: blur(1px); }
          40% { opacity: 0.24; filter: blur(2.4px); }
          60% { opacity: 0.42; filter: blur(4px); }
          80% { opacity: 0.32; filter: blur(3px); }
          100% { opacity: 0.12; filter: blur(1px); }
        }

        /* shimmer (heat-haze) activation */
        @keyframes shimmerOn {
          0% { opacity: 0; }
          25% { opacity: 0.06; transform: translateY(-1px); }
          50% { opacity: 0.12; transform: translateY(0px); }
          75% { opacity: 0.08; transform: translateY(-1px); }
          100% { opacity: 0.0; transform: translateY(0px); }
        }

        /* heat aura expansion */
        @keyframes aura {
          0% { opacity: 0.0; transform: scale(0.9); }
          30% { opacity: 0.06; transform: scale(1.02); }
          60% { opacity: 0.12; transform: scale(1.08); }
          100% { opacity: 0.02; transform: scale(1.0); }
        }

        /* waveform animation (simple left-to-right draw) */
        @keyframes waveAC {
          0% { stroke-dasharray: 1 200; stroke-dashoffset: 200; }
          50% { stroke-dasharray: 120 200; stroke-dashoffset: 100; }
          100% { stroke-dasharray: 1 200; stroke-dashoffset: 0; }
        }

        /* animate turbine to create heat-haze movement */
        /* Simple JS-less animation: animate baseFrequency via CSS not supported; use SVG animate tag could be used,
           but to keep cross-browser consistent we'll animate the group opacity/transform for shimmer */
      `}</style>

      {/* Attach animations to elements via inline style so they run on mount */}
      <style>{`
        /* apply animations to elements we defined above via ids/classes */
        #resGlow { animation: resGlowPulse 8s infinite linear; }
        #shimmerGroup { animation: shimmerOn 8s infinite linear; }
        #heatAura { animation: aura 8s infinite linear; }
        #smoke { animation: shimmerOn 8s infinite linear; transform-origin: center; }

        /* small performance note: offset-path currently has best support in modern browsers; if missing,
           particles will not move along the path but remain visible (graceful degrade). */
      `}</style>
    </svg>
  </>
)}


              {visual?.symbol === "voltage_source" && (
  <>
    {/* ============================================================
        Futuristic Voltage Source Visualizer
        - Two terminals (left negative / right positive)
        - Animated electric field arcs & plasma displacement
        - Charge particles accelerate across gap synced to sine (1.6 Hz)
        - Waveform overlay (V(t) ~ sin) below, lens flares and pulse on peaks
       ============================================================ */}

    <g transform="translate(8,6)">
      <defs>
        {/* Soft neon aura */}
        <filter id="voltageAura" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="8" result="gblur" />
          <feMerge>
            <feMergeNode in="gblur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Plasma / arc distortion */}
        <filter id="plasma" x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="2" result="turb" />
          <feDisplacementMap in="SourceGraphic" in2="turb" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* hue shift to subtly change colors with voltage sign */}
        <filter id="hueShift" x="-30%" y="-30%" width="160%" height="160%">
          <feColorMatrix type="hueRotate" values="0" result="h" />
          <feMerge><feMergeNode in="h" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        {/* glow for sparks */}
        <filter id="sparkGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* linear gradient for field */}
        <linearGradient id="fieldGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#00121a" stopOpacity="0.0" />
          <stop offset="40%" stopColor="#00eaff" stopOpacity="0.06" />
          <stop offset="60%" stopColor="#ffb84a" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0.0" />
        </linearGradient>

        {/* plate gradients */}
        <radialGradient id="leftPlate" cx="30%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#002834" stopOpacity="1" />
          <stop offset="60%" stopColor="#003f58" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#001217" stopOpacity="1" />
        </radialGradient>
        <radialGradient id="rightPlate" cx="70%" cy="70%" r="80%">
          <stop offset="0%" stopColor="#3a001a" stopOpacity="1" />
          <stop offset="60%" stopColor="#5a0033" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#13000a" stopOpacity="1" />
        </radialGradient>

        {/* small sparkle gradient */}
        <radialGradient id="spark" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="40%" stopColor="#00eaff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#00eaff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* background subtle field rectangle for contrast */}
      <rect x="-6" y="-6" width="420" height="200" rx="14" fill="url(#fieldGrad)" opacity="0.06" />

      {/* Left Terminal (negative) */}
      <g transform="translate(36,70)">
        <rect x="-12" y="-30" width="48" height="80" rx="8" fill="url(#leftPlate)" stroke="#00242f" strokeWidth="1.2" filter="url(#voltageAura)" />
        {/* left electrode highlight */}
        <rect x="-6" y="-26" width="36" height="72" rx="6" fill="none" stroke="#00eaff" strokeWidth="1.2" opacity="0.22" />
        <text x="12" y="68" fontSize="30" fill="#00eaff" textAnchor="middle">−</text>
      </g>

      {/* Right Terminal (positive) */}
      <g transform="translate(320,70)">
        <rect x="-36" y="-30" width="48" height="80" rx="8" fill="url(#rightPlate)" stroke="#3b001f" strokeWidth="1.2" filter="url(#voltageAura)" />
        <rect x="-30" y="-26" width="36" height="72" rx="6" fill="none" stroke="#ffb84a" strokeWidth="1.2" opacity="0.22" />
        <text x="-12" y="68" fontSize="30" fill="#ffb84a" textAnchor="middle">+</text>
      </g>
       <text x="180" y="148" fontSize="18" fill="#00eaff" textAnchor="middle">vol</text>
       <text x="210" y="148" fontSize="18" fill="#ffb84a" textAnchor="middle">tage</text>

      {/* connecting rails/wires */}
      <g transform="translate(64,110)">
        <path d="M0 0 H 240" stroke="#091214" strokeWidth="6" strokeLinecap="round" />
        <path d="M0 0 H 240" stroke="rgba(0,234,255,0.06)" strokeWidth="2" strokeLinecap="round" />
        {/* moving glow along wire to indicate direction, animated with same period as waveform */}
        {Array.from({ length: 10 }).map((_, i) => {
          const delay = (i / 10) * 0.625; // one period is 0.625s (1/1.6 Hz)
          return (
            <circle
              key={`wireGlow-${i}`}
              r="2.2"
              fill="#00eaff"
              style={{
                offsetPath: `path('M ${8 + i * 24} 0 H ${8 + i * 24 + 8}')`,
                animationName: 'wirePulse',
                animationDuration: '0.62s',
                animationTimingFunction: 'linear',
                animationDelay: `-${delay}s`,
                animationIterationCount: 'infinite',
                transformOrigin: '0 0',
                filter: 'url(#voltageAura)'
              }}
              opacity="0.9"
            />
          );
        })}
      </g>

      {/* Electric field arcs — multiple layered arcs that shimmer and shift color with voltage */}
      <g transform="translate(88,70)">
        {/* base arcs (many paths with slight offsets) */}
        {[0, 6, 12].map((off, idx) => (
          <path
            key={idx}
            d={`M 0 ${-6} C 56 ${-20 - off} 140 ${-20 - off} 232 ${-6}`}
            fill="none"
            stroke="#00eaff"
            strokeWidth={idx === 1 ? 2.6 : 1.8}
            strokeLinecap="round"
            opacity={0.46 - idx * 0.08}
            style={{
              filter: 'url(#plasma)',
              animation: `arcShift ${0.625}s ease-in-out ${idx * 0.08}s infinite`
            }}
          />
        ))}

        {/* brighter arcs that flash at peaks */}
        <path
          d={`M 0 0 C 56 -12 140 -12 232 0`}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.12"
          style={{ animation: 'peakFlash 1.25s ease-in-out infinite' }}
        />

        {/* quick electric micro-arcs (sparks) that appear near peaks — red/magenta/amber blended */}
        {Array.from({ length: 5 }).map((_, i) => {
          const delay = (i / 5) * 1.25;
          return (
            <line
              key={`spark-${i}`}
              x1={40 + i * 36}
              y1={-6 - (i % 2 === 0 ? 4 : 0)}
              x2={44 + i * 36}
              y2={-12 - (i % 2 === 0 ? 6 : 2)}
              stroke="url(#spark)"
              strokeWidth="1.6"
              strokeLinecap="round"
              style={{
                filter: 'url(#sparkGlow)',
                opacity: 0.0,
                animation: `sparkPop 1.25s linear ${-delay}s infinite`
              }}
            />
          );
        })}
      </g>

      {/* animated charge particles moving from right (+) to left (−) — speed modulated by sine (1.6Hz) */}
      {Array.from({ length: 14 }).map((_, i) => {
        const baseDelay = (i / 14) * 0.625;
        return (
          <circle
            key={`charge-${i}`}
            r="2.4"
            fill="#ffffff"
            style={{
              offsetPath: "path('M 320 80 Q 256 68 160 72 Q 64 76 28 84')",
              animationName: 'chargeFlowVoltage',
              animationDuration: '0.62s',
              animationTimingFunction: 'cubic-bezier(.2,.9,.1,.95)',
              animationDelay: `-${baseDelay}s`,
              animationIterationCount: 'infinite',
              transformOrigin: '0 0',
              filter: 'url(#voltageAura)'
            }}
            opacity="0.95"
          />
        );
      })}

      {/* lens flare / holo ripple at center when voltage is high */}
      <g transform="translate(176,68)">
        <circle r="18" fill="none" stroke="#00eaff" opacity="0.06" style={{ filter: 'url(#voltageAura)', animation: 'centerPulse 1.25s ease-in-out infinite' }} />
        <circle r="18" fill="none" stroke="#ffb84a" opacity="0.03" style={{ filter: 'url(#voltageAura)', animation: 'centerPulse 1.25s ease-in-out 0.3s infinite' }} />
      </g>

      {/* waveform overlay below showing V(t) ~ sin(2π·1.6t) — animated stroke shifting */}
   
    </g>

    {/* =========================
        Animations & Keyframes
       ========================= */}
    <style>{`
      /* arc wobble synchronized with waveform (period 0.625s => 1.6Hz) */
      @keyframes arcShift {
        0% { transform: translateY(0) scaleY(1); opacity: 0.45; }
        25% { transform: translateY(-2px) scaleY(1.01); opacity: 0.65; }
        50% { transform: translateY(0) scaleY(1); opacity: 0.85; }
        75% { transform: translateY(2px) scaleY(0.99); opacity: 0.65; }
        100% { transform: translateY(0) scaleY(1); opacity: 0.45; }
      }

      /* wire glowing moving pulses (fast) */
      @keyframes wirePulse {
        0% { offset-distance: 0%; opacity: 0.0; transform: scale(0.8); }
        20% { opacity: 0.8; transform: scale(1.0); }
        100% { offset-distance: 100%; opacity: 0.0; transform: scale(0.7); }
      }

      /* sparks popping near peaks */
      @keyframes sparkPop {
        0% { opacity: 0; transform: translateY(0) scale(0.9); }
        20% { opacity: 1; transform: translateY(-6px) scale(1.06); }
        60% { opacity: 0.6; transform: translateY(-10px) scale(0.98); }
        100% { opacity: 0; transform: translateY(-16px) scale(0.9); }
      }

      /* charge particles crossing gap (speed modulated by animation timing) */
      @keyframes chargeFlowVoltage {
        0% { offset-distance: 0%; opacity: 0.2; transform: scale(0.8); }
        20% { opacity: 0.95; transform: scale(1.05); }
        80% { opacity: 0.9; transform: scale(0.95); }
        100% { offset-distance: 100%; opacity: 0.0; transform: scale(0.8); }
      }

      /* center pulse lens flare synced to peaks */
      @keyframes centerPulse {
        0% { transform: scale(0.92); opacity: 0.02; }
        30% { transform: scale(1.06); opacity: 0.14; }
        50% { transform: scale(1.16); opacity: 0.22; }
        80% { transform: scale(1.02); opacity: 0.08; }
        100% { transform: scale(0.92); opacity: 0.02; }
      }

      /* voltage waveform motion (fast 1.6Hz period) */
      @keyframes waveVoltage {
        0% { stroke-dashoffset: 0; transform: translateY(0); opacity: 0.95; }
        25% { transform: translateY(-2px) scaleY(1.03); opacity: 1; }
        50% { transform: translateY(0); opacity: 0.95; }
        75% { transform: translateY(2px) scaleY(0.97); opacity: 0.9; }
        100% { transform: translateY(0); opacity: 0.95; }
      }

      /* peak flash — occasional brightening */
      @keyframes peakFlash {
        0% { opacity: 0.08; }
        40% { opacity: 0.28; }
        50% { opacity: 0.6; filter: blur(2px); }
        60% { opacity: 0.28; }
        100% { opacity: 0.08; }
      }

      /* ensure offset-path animations are performant */
      circle[style] { will-change: offset-distance, transform, opacity; }
      @media (max-width: 640px) { text { font-size: 9px; } }
    `}</style>
  </>
)}
{visual?.symbol === "resonator" && (
  <>
    {/*
      Resonator visualization block.
      NOTE: This fragment uses Framer Motion components like <motion.g> and <motion.path>.
      Make sure `import { motion } from "framer-motion"` exists in the parent file.
      It also relies on modern CSS `offset-path` support for particle motion; if a browser
      lacks it the particles will gracefully remain visible (no critical failure).
    */}
    <svg viewBox="0 0 900 360" className="w-full h-[360px]">
      <defs>
        {/* Background gradient (you can also apply outside SVG) */}
        <linearGradient id="bgGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#050505" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </linearGradient>

        {/* neon glow filter */}
        <filter id="neon" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              0.9 0   0   0  0
              0   0.9 0   0  0
              0   0   0.9 0  0
              0   0   0   1  0
            "
          />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* soft halo */}
        <filter id="halo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="12" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* displacement for plasma arcs */}
        <filter id="plasma" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence baseFrequency="0.008" numOctaves="2" seed="10" result="turb" />
          <feDisplacementMap in="SourceGraphic" in2="turb" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* gradient for energy arcs */}
        <linearGradient id="energyGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="1" />
          <stop offset="60%" stopColor="#00ffbf" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#b388ff" stopOpacity="0.7" />
        </linearGradient>

        {/* amber highlight for losses / dissipation */}
        <linearGradient id="amberGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#ffb84a" />
          <stop offset="100%" stopColor="#ff7a2d" />
        </linearGradient>

        {/* subtle blur for particles */}
        <filter id="softBlur">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>

        {/* marker / node glow circle */}
        <radialGradient id="nodeGlow" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.9" />
          <stop offset="70%" stopColor="#00f0ff" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* base background */}
      <rect x="0" y="0" width="100%" height="100%" fill="url(#bgGrad)" />

      {/* Layout:
          - left: power source (battery)
          - center-left: resistor/wire to resonator (LC tank)
          - center: resonator (coiled + capacitor ring)
          - center-right: load/ground
          - bottom: waveform panel
      */}

      {/* === Grid / PCB-like faint lines (for cinematic feel) === */}
      <g opacity="0.06" stroke="#0b0b0b" strokeWidth="0.6">
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={i} x1={60 + i * 60} y1="12" x2={60 + i * 60} y2="340" />
        ))}
      </g>

      {/* === Power source (left) === */}
      <g transform="translate(60,120)">
        {/* battery body */}
        <rect x="-12" y="-18" width="60" height="72" rx="6" fill="#070707" stroke="#111" />
        <rect x="-6" y="-12" width="48" height="60" rx="4" fill="#0b0b0b" stroke="#1a1a1a" />

        {/* battery terminals */}
        <rect x="46" y="10" width="14" height="6" rx="1" fill="#ffd24a" stroke="#ffb84a" filter="url(#neon)" />
        <rect x="-26" y="-12" width="8" height="20" rx="1" fill="#111" />

        <text x="10" y="54" fontSize="10" fill="#9aa">V<sub>src</sub></text>
      </g>

      {/* === Wire from battery to resonator (top trace) === */}
      {/* long path id used for offset-path particle animation */}
      <path
        id="pathToRes"
        d="M 100 150 C 165 150 220 120 300 120"
        fill="none"
        stroke="transparent"
        strokeWidth="8"
      />

      <motion.path
        d="M 100 150 C 165 150 220 120 300 120"
        stroke="url(#energyGrad)"
        strokeWidth="4"
        strokeLinecap="round"
        style={{ filter: "url(#neon)" }}
        animate={{ strokeOpacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* small node glow */}
      <circle cx="100" cy="150" r="6" fill="url(#nodeGlow)" opacity="0.95" />
      <circle cx="300" cy="120" r="6" fill="url(#nodeGlow)" opacity="0.95" />

      {/* === Resonator (center): coil + capacitor ring + field rings === */}
      <g transform="translate(320,120)">
        {/* coil: a stylized 3D-like coil (multiple arcs) */}
        <g id="coilGroup">
          {Array.from({ length: 7 }).map((_, i) => {
            const xOff = i * 8;
            const strokeW = 4 - (i * 0.35);
            return (
              <path
                key={i}
                d={`M ${-80 + xOff} 16 q 14 -36 28 0 q 14 -36 28 0 q 14 -36 28 0`}
                fill="none"
                stroke="#00f0ff"
                strokeWidth={strokeW}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: "url(#neon)", opacity: 0.85 - i * 0.06 }}
              />
            );
          })}
        </g>

        {/* capacitor ring: concentric thin rings that indicate energy storage */}
        <g transform="translate(88, -6)">
          <circle r="28" fill="none" stroke="#00ffbf" strokeWidth="1.6" opacity="0.8" style={{ filter: "url(#halo)" }} />
          <circle r="18" fill="none" stroke="#b388ff" strokeWidth="1.2" opacity="0.6" />
        </g>

        {/* resonator core plate for subtle holographic center */}
        <circle cx="46" cy="14" r="10" fill="#070707" stroke="#111" />

        {/* magnetic field rings (animated) */}
        {Array.from({ length: 5 }).map((_, rI) => (
          <circle
            key={rI}
            cx="46"
            cy="14"
            r={32 + rI * 10}
            fill="none"
            stroke="#b388ff"
            strokeWidth={1}
            opacity={0.04}
            style={{
              transformOrigin: "46px 14px",
              animation: `fieldPulse ${3 + rI * 0.6}s ${0.12 * rI}s infinite ease-in-out`,
              filter: "url(#halo)",
            }}
          />
        ))}

        {/* label */}
        <text x="46" y="60" fontSize="11" fill="#ffd24a" textAnchor="middle">
          Resonator (L‖C)
        </text>
      </g>

      {/* === Wire from resonator to load/ground (right) === */}
      <path
        id="pathFromRes"
        d="M 392 120 C 470 120 540 150 620 150"
        fill="none"
        stroke="transparent"
        strokeWidth="8"
      />
      <motion.path
        d="M 392 120 C 470 120 540 150 620 150"
        stroke="url(#energyGrad)"
        strokeWidth="4"
        strokeLinecap="round"
        style={{ filter: "url(#neon)" }}
        animate={{ strokeOpacity: [0.4, 1, 0.4] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* load / ground block (right) */}
      <g transform="translate(620,120)">
        <rect x="-6" y="-18" width="40" height="72" rx="6" fill="#070707" stroke="#111" />
        <rect x="-2" y="-12" width="32" height="60" rx="4" fill="#0b0b0b" stroke="#1a1a1a" />
        <text x="18" y="54" fontSize="10" fill="#9aa">Load</text>
        <line x1="30" y1="40" x2="60" y2="40" stroke="#00eaff" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* === Moving energy particles on paths (left → resonator → right) === */}
      {/*
         We create many small circles that use CSS offset-path equal to the path strings.
         They are staggered and use keyframes to simulate different phases: rise (faster), steady, decay (slower).
      */}
      {Array.from({ length: 18 }).map((_, i) => {
        const delay = (i / 18) * 1.6;
        return (
          <circle
            key={`pL-${i}`}
            r={i % 3 === 0 ? 3.2 : 2.2}
            fill="#00f0ff"
            style={{
              offsetPath: "path('M 100 150 C 165 150 220 120 300 120')",
              animationName: "moveToRes",
              animationDuration: "2.6s",
              animationTimingFunction: "cubic-bezier(.2,.8,.2,1)",
              animationDelay: `-${delay}s`,
              animationIterationCount: "infinite",
              transformOrigin: "0 0",
              filter: "url(#softBlur)",
            }}
          />
        );
      })}

      {Array.from({ length: 22 }).map((_, i) => {
        const delay = (i / 22) * 2.2 + 0.5;
        return (
          <circle
            key={`pR-${i}`}
            r={i % 4 === 0 ? 3.6 : 2.4}
            fill="#00ffbf"
            style={{
              offsetPath: "path('M 392 120 C 470 120 540 150 620 150')",
              animationName: "moveFromRes",
              animationDuration: "3.2s",
              animationTimingFunction: "cubic-bezier(.25,.9,.1,1)",
              animationDelay: `-${delay}s`,
              animationIterationCount: "infinite",
              transformOrigin: "0 0",
              filter: "url(#softBlur)",
            }}
          />
        );
      })}

      {/* === A few particles that loop locally around the resonator (to show oscillation) === */}
      {Array.from({ length: 12 }).map((_, i) => {
        const delay = (i / 12) * 1.6;
        return (
          <circle
            key={`osc-${i}`}
            r={1.6}
            fill="#b388ff"
            style={{
              offsetPath: "path('M 340 120 q 18 -16 36 0 q 18 16 36 0')",
              animationName: "oscLoop",
              animationDuration: `${1.4 + (i % 4) * 0.12}s`,
              animationTimingFunction: "ease-in-out",
              animationDelay: `-${delay}s`,
              animationIterationCount: "infinite",
              transformOrigin: "0 0",
              opacity: 0.85,
              filter: "url(#halo)",
            }}
          />
        );
      })}

      {/* === Waveform Panel (bottom) === */}
      <g transform="translate(60,240)">
        <rect x="0" y="0" width="720" height="84" rx="10" fill="#060606" stroke="#111" />
        <g transform="translate(12,12)">
          {/* dynamic waveform path — stroke color controlled by motion (amplitude & phase) */}
          <motion.path
            d={`
              M 0 36
              Q 40 ${36 - 22 * 0.85} 80 36
              T 160 36
              T 240 36
              T 320 36
              T 400 36
              T 480 36
              T 560 36
              T 640 36
            `}
            fill="none"
            stroke="url(#energyGrad)"
            strokeWidth="2.2"
            strokeLinecap="round"
            style={{ filter: "url(#neon)" }}
            animate={{ strokeDashoffset: [0, -60, 0], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <text x="360" y="68" textAnchor="middle" fontSize="11" fill="#ffd24a">
            Voltage / Current Waveform — Resonant Oscillation
          </text>
        </g>
      </g>

      {/* === Node & component labels (modern HUD style) === */}
      <g fontSize="11" fill="#9aa" fontFamily="Inter, system-ui, -apple-system">
        <text x="18" y="132">Source</text>
        <text x="300" y="100">Node A</text>
        <text x="400" y="100">Resonator</text>
        <text x="620" y="100">Load</text>
      </g>

      {/* === Style / Keyframes for particle motion, pulses, fields === */}
      <style>{`
        /* particle motions along path */
        @keyframes moveToRes {
          0% { offset-distance: 0%; opacity: 0.95; transform: scale(0.9); filter: drop-shadow(0 0 6px rgba(0,240,255,0.6)); }
          40% { offset-distance: 36%; opacity: 0.95; transform: scale(1.02); }
          55% { offset-distance: 48%; opacity: 0.5; transform: scale(0.8); filter: none; }
          70% { offset-distance: 66%; opacity: 0.85; transform: scale(0.95); filter: drop-shadow(0 0 6px rgba(0,214,255,0.45)); }
          100% { offset-distance: 100%; opacity: 0.95; transform: scale(1); }
        }

        @keyframes moveFromRes {
          0% { offset-distance: 0%; opacity: 0.95; transform: scale(0.95); filter: drop-shadow(0 0 6px rgba(0,255,191,0.6)); }
          30% { offset-distance: 34%; opacity: 0.95; transform: scale(1.05); }
          55% { offset-distance: 58%; opacity: 0.6; transform: scale(0.85); filter: none; }
          88% { offset-distance: 88%; opacity: 0.95; transform: scale(1.0); filter: drop-shadow(0 0 6px rgba(180,120,255,0.45)); }
          100% { offset-distance: 100%; opacity: 0.95; transform: scale(1.0); }
        }

        @keyframes oscLoop {
          0% { offset-distance: 0%; opacity: 0.8; transform: translateY(0) scale(0.9); }
          50% { offset-distance: 50%; opacity: 1; transform: translateY(-4px) scale(1.05); }
          100% { offset-distance: 100%; opacity: 0.8; transform: translateY(0) scale(0.9); }
        }

        /* field ring pulse */
        @keyframes fieldPulse {
          0% { stroke-width: 1; opacity: 0.02; transform: scale(0.92); }
          30% { stroke-width: 1.8; opacity: 0.12; transform: scale(1.05); }
          60% { stroke-width: 2.4; opacity: 0.18; transform: scale(1.12); }
          100% { stroke-width: 1; opacity: 0.03; transform: scale(0.95); }
        }

        /* small local oscillation around resonator to indicate energy exchange */
        @keyframes localGlow {
          0% { filter: blur(0px); opacity: 0.6; transform: translateY(0); }
          50% { filter: blur(4px); opacity: 1; transform: translateY(-2px); }
          100% { filter: blur(0px); opacity: 0.6; transform: translateY(0); }
        }

        /* subtle HUD pulse to circuit traces */
        path[stroke^="url"] {
          stroke-width: 3.2;
          mix-blend-mode: screen;
        }

      `}</style>

      {/* small inline animations for accessibility / fallback */}
      <style>{`
        /* animate certain elements via IDs for easier customization */
        #coilGroup { animation: localGlow 3.6s infinite ease-in-out; transform-origin: 46px 14px; }
      `}</style>
    </svg>
  </>
)}

              {visual?.symbol === "psu" && (
  <>
    {/* === PSU Cinematic Holographic Visualization === */}
    <svg viewBox="0 0 980 300" className="w-full h-[300px]">
      <defs>
        {/* Color gradients */}
        <linearGradient id="gradBg" x1="0" x2="1">
          <stop offset="0%" stopColor="#050505" />
          <stop offset="100%" stopColor="#111217" />
        </linearGradient>

        <linearGradient id="acGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="1" />
          <stop offset="100%" stopColor="#7ff7ff" stopOpacity="1" />
        </linearGradient>

        <linearGradient id="dcGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#ffb84a" />
          <stop offset="100%" stopColor="#ff7a2d" />
        </linearGradient>

        <linearGradient id="flux" x1="0" x2="1">
          <stop offset="0%" stopColor="#9b6bff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#6bf0ff" stopOpacity="0.9" />
        </linearGradient>

        {/* Neon glow filter */}
        <filter id="neon" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feColorMatrix type="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 0 0 1 0" in="blur" result="cm" />
          <feMerge>
            <feMergeNode in="cm" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Heat / shimmer / distortion filter */}
        <filter id="distort" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence id="turb" baseFrequency="0.006" numOctaves="2" seed="8" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* soft blur for particle trails */}
        <filter id="softBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" />
        </filter>

        {/* animated stroke dash for wave */}
        <path id="acWavePath" d="M 50 60 C 90 10 130 110 170 60 C 210 10 250 110 290 60" fill="none" />

        {/* path for power flow through stages (single continuous route) */}
        <path
          id="flowPathFull"
          d="
            M 40 150
            H 120
            C 160 150 160 150 200 150
            H 260
            C 300 150 300 150 340 150
            H 420
            C 460 150 460 150 500 150
            H 620
            C 660 150 660 150 700 150
            H 920
          "
          fill="none"
        />
      </defs>

      {/* background matte rectangle */}
      <rect x="0" y="0" width="100%" height="100%" fill="url(#gradBg)" rx="8" />

      {/* --- AC Source (Left) --- */}
      <g transform="translate(24,36)">
        <g>
          {/* animated sine wave panel */}
          <rect x="0" y="0" width="320" height="120" rx="10" fill="#f06d0640" stroke="#111" />
          <g transform="translate(10,18)">
            <path
              d="M 0 45 C 40 5 80 85 120 45 C 160 5 200 85 240 45"
              stroke="#9b6bff"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              style={{ filter: "url(#softBlur)", strokeDasharray: "6 180", animation: "acWaveMove 1.6s linear infinite" }}
            />
            <text x="128" y="105" textAnchor="middle" fontSize="11" fill="#9ee6ff" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
              AC IN
            </text>
          </g>
        </g>

        {/* wire to transformer */}
        <path d="M320 60 H 360" stroke="#0af0ff" strokeWidth="4" strokeLinecap="round" opacity="0.95" />
      </g>

      {/* --- Transformer (Dual coils) --- */}
      <g transform="translate(360,86)">
        {/* primary coil */}
        <g transform="translate(0,0)">
          <rect x="-8" y="-22" width="20" height="64" rx="4" fill="#0a0a0a" stroke="#111" />
          {Array.from({ length: 6 }).map((_, i) => (
            <path
              key={`p${i}`}
              d={`M ${12 + i * 6} -8 q 4 -18 12 0`}
              fill="none"
              stroke="#00eaff"
              strokeWidth="2.6"
              strokeLinecap="round"
              style={{ filter: "url(#neon)", opacity: 0.95 }}
            />
          ))}
          <text x="50" y="50" fontSize="10" fill="#9ee6ff">Transformer</text>
        </g>

        {/* core and flux lines */}
        <g transform="translate(88,0)">
          <rect x="-8" y="-32" width="26" height="88" rx="6" fill="#080808" stroke="#222" />
          <g>
            {Array.from({ length: 6 }).map((_, k) => (
              <ellipse
                key={k}
                cx="40"
                cy="10"
                rx={28 + k * 8}
                ry={6 + k * 2}
                fill="none"
                stroke="url(#flux)"
                strokeWidth="1"
                opacity={0.06}
                style={{ filter: "url(#neon)", animation: `fluxPulse ${1.8 + k * 0.15}s ease-in-out ${k * 0.06}s infinite` }}
              />
            ))}
          </g>
        </g>

        {/* wire to rectifier */}
        <path d="M 220 40 H 260" stroke="#0af0ff" strokeWidth="4" strokeLinecap="round" />
      </g>

      {/* --- Rectifier (diode bridge) --- */}
      <g transform="translate(580,100)">
        {/* diamond diodes */}
        <g transform="translate(-40,-20)">
          <rect x="-60" y="-34" width="120" height="84" rx="10" fill="#06060a" stroke="#111" />
          {/* four diodes */}
          <g transform="translate(0,8)">
            {/* top */}
            <g transform="translate(0,-28)" >
              <polygon points="0,0 12,8 -12,8" fill="#111" stroke="#ffefff" strokeWidth="0.6" />
              <path d="M -12 8 L 12 8" stroke="#ffd2d2" strokeWidth="1.2" opacity="0.9" />
            </g>
            {/* right */}
            <g transform="translate(48,0) rotate(90)">
              <polygon points="0,0 12,8 -12,8" fill="#111" stroke="#ffefff" strokeWidth="0.6" />
              <path d="M -12 8 L 12 8" stroke="#ffd2d2" strokeWidth="1.2" opacity="0.9" />
            </g>
            {/* bottom */}
            <g transform="translate(0,44) rotate(180)">
              <polygon points="0,0 12,8 -12,8" fill="#111" stroke="#ffefff" strokeWidth="0.6" />
              <path d="M -12 8 L 12 8" stroke="#ffd2d2" strokeWidth="1.2" opacity="0.9" />
            </g>
            {/* left */}
            <g transform="translate(-48,0) rotate(-90)">
              <polygon points="0,0 12,8 -12,8" fill="#111" stroke="#ffefff" strokeWidth="0.6" />
              <path d="M -12 8 L 12 8" stroke="#ffd2d2" strokeWidth="1.2" opacity="0.9" />
            </g>
          </g>

          {/* directional pulse overlays (simulate one-way conduction) */}
          <g>
            <path d="M -10 -24 L 0 -16" stroke="#6bf0ff" strokeWidth="8" strokeLinecap="round" strokeOpacity="0.0" className="rectPulseTop" />
            <path d="M 10 40 L 0 32" stroke="#6bf0ff" strokeWidth="8" strokeLinecap="round" strokeOpacity="0.0" className="rectPulseBottom" />
          </g>

          <text x="0" y="46" fontSize="11" fill="#ffd24a" textAnchor="middle">RECTIFIER</text>
        </g>

        {/* wire to filter (cap) */}
        <path d="M 60 30 H 120" stroke="#6bf0ff" strokeWidth="3.6" strokeLinecap="round" />
      </g>

      {/* --- Filter Capacitor (cylindrical) --- */}
      <g transform="translate(690,96)">
        {/* base panel */}
        <rect x="-6" y="-8" width="116" height="104" rx="12" fill="#070708" stroke="#111" />
        {/* cylinder */}
        <g transform="translate(12,8)">
          <rect x="0" y="0" width="36" height="72" rx="10" fill="#06060a" stroke="#111" />
          <rect x="-2" y="-2" width="40" height="4" rx="6" fill="#00eaff" opacity="0.06" />
          <rect x="-2" y="70" width="40" height="4" rx="6" fill="#ffb84a" opacity="0.06" />
          <text x="18" y="96" textAnchor="middle" fontSize="10" fill="#ffd24a">FILTER</text>

          {/* charging halo */}
          <ellipse cx="18" cy="36" rx="46" ry="36" fill="url(#dcGrad)" opacity="0.04" filter="url(#neon)" id="capHalo" />
        </g>

        {/* wire to regulator */}
        <path d="M 120 56 H 180" stroke="#ffb84a" strokeWidth="4" strokeLinecap="round" />
      </g>

      {/* --- Voltage Regulator Block --- */}
      <g transform="translate(820,92)">
        <rect x="0" y="0" width="110" height="80" rx="12" fill="#070708" stroke="#111" />
        <rect x="12" y="12" width="86" height="56" rx="8" fill="#0b0b0d" stroke="#222" />
        <text x="55" y="24" fontSize="11" fill="#9ee6ff" textAnchor="middle">REGULATOR</text>
        <text x="55" y="44" fontSize="12" fill="#ffd24a" fontWeight="700" textAnchor="middle">+12V</text>

        {/* smoothing nodes */}
        <circle cx="18" cy="60" r="4" fill="#6bf0ff" />
        <circle cx="92" cy="60" r="4" fill="#ffb84a" />
      </g>

      {/* --- DC output rails to the right --- */}
      <g transform="translate(940,122)">
        <path d="M -100 0 H 40" stroke="url(#dcGrad)" strokeWidth="6" strokeLinecap="round" />
        <text x="-120" y="6" fontSize="11" fill="#ffd24a" textAnchor="end">DC OUT</text>
      </g>

      {/* --- Animated energy particles traveling the whole flow path --- */}
      {Array.from({ length: 18 }).map((_, i) => {
        const delay = (i / 18) * 2.6;
        return (
          <circle
            key={`pf-${i}`}
            r="3.2"
            fill="#8affff"
            style={{
              offsetPath: "path('M 40 150 H 120 C 160 150 160 150 200 150 H 260 C 300 150 300 150 340 150 H 420 C 460 150 460 150 500 150 H 620 C 660 150 660 150 700 150 H 920')",
              animationName: "flowFull",
              animationDuration: "4.2s",
              animationTimingFunction: "linear",
              animationDelay: `-${delay}s`,
              animationIterationCount: "infinite",
              transformOrigin: "0 0",
              filter: "url(#softBlur)",
              opacity: 0.95,
            }}
          />
        );
      })}

      {/* small DC stable particles near output */}
      {Array.from({ length: 8 }).map((_, j) => {
        const d = (j / 8) * 2.0 + 0.2;
        return (
          <circle
            key={`dc-${j}`}
            r="3.6"
            fill="#ffd24a"
            style={{
              offsetPath: "path('M 820 150 H 920')",
              animationName: "flowDC",
              animationDuration: "2.6s",
              animationTimingFunction: "linear",
              animationDelay: `-${d}s`,
              animationIterationCount: "infinite",
              transformOrigin: "0 0",
              filter: "url(#neon)",
              opacity: 0.95,
            }}
          />
        );
      })}

      {/* Labels (educational) */}
      <g>
        <text x="40" y="24" fontSize="12" fill="#9ee6ff">AC Source →</text>
        <text x="360" y="24" fontSize="12" fill="#ffd24a">Transformer</text>
        <text x="580" y="24" fontSize="12" fill="#ffb84a">Rectifier</text>
        <text x="690" y="24" fontSize="12" fill="#ff9a4a">Filter</text>
        <text x="820" y="24" fontSize="12" fill="#ffd24a">Regulator</text>
        <text x="940" y="24" fontSize="12" fill="#ffd24a">DC Output</text>
      </g>

      {/* --- Keyframe and CSS animations --- */}
      <style>{`
        /* AC waveform 'sweep' */
        @keyframes acWaveMove {
          0% { stroke-dashoffset: 0; transform: translateX(0); }
          100% { stroke-dashoffset: -240; transform: translateX(-4px); }
        }

        /* transformer flux pulsing */
        @keyframes fluxPulse {
          0% { opacity: 0.06; transform: scale(0.98); }
          50% { opacity: 0.16; transform: scale(1.02); }
          100% { opacity: 0.06; transform: scale(0.98); }
        }

        /* rectifier diode conduction pulse (top/bottom) */
        @keyframes rectPulse {
          0% { stroke-opacity: 0; transform: scaleX(1); }
          25% { stroke-opacity: 0.85; transform: scaleX(1.02); }
          50% { stroke-opacity: 0; transform: scaleX(1); }
          100% { stroke-opacity: 0; transform: scaleX(1); }
        }

        .rectPulseTop { animation: rectPulse 0.8s ease-in-out 0s infinite; }
        .rectPulseBottom { animation: rectPulse 0.8s ease-in-out 0.4s infinite; }

        /* main flow along the circuit: particles change look when inside certain x ranges (simulated via keyframes) */
        @keyframes flowFull {
          0% { offset-distance: 0%; opacity: 0.95; transform: scale(0.9); fill: #00f0ff; filter: blur(0px); }
          20% { offset-distance: 18%; opacity: 0.95; transform: scale(1.0); fill: #00f0ff; }
          32% { offset-distance: 28%; opacity: 0.95; transform: scale(1.0); filter: drop-shadow(0 0 6px rgba(0,240,255,0.6)); }
          /* travel through rectifier region - become pulsed/bright */
          38% { offset-distance: 36%; fill: #9b6bff; transform: scale(1.1); filter: drop-shadow(0 0 10px rgba(155,107,255,0.7)); }
          50% { offset-distance: 52%; fill: #ffd24a; transform: scale(0.9); opacity: 0.85; filter: blur(1px); }
          /* cap region - charging halo, slightly slower / brighter */
          60% { offset-distance: 66%; fill: #ffb84a; transform: scale(1.1); opacity: 1; filter: drop-shadow(0 0 10px rgba(255,184,74,0.6)); }
          /* regulator region - stabilize to amber DC */
          78% { offset-distance: 82%; fill: #ff9a4a; transform: scale(1.0); opacity: 0.98; filter: none; }
          100% { offset-distance: 100%; fill: #ffb84a; transform: scale(1.0); opacity: 0.98; }
        }

        @keyframes flowDC {
          0% { offset-distance: 0%; opacity: 0.9; transform: scale(1); }
          100% { offset-distance: 100%; opacity: 0.9; transform: scale(1); }
        }

        /* capacitor halo animation */
        @keyframes capPulse {
          0% { opacity: 0.02; transform: scale(0.96); }
          40% { opacity: 0.10; transform: scale(1.06); }
          70% { opacity: 0.14; transform: scale(1.12); }
          100% { opacity: 0.02; transform: scale(0.96); }
        }

        /* apply to cap halo */
        #capHalo { animation: capPulse 4s ease-in-out infinite; }

        /* rectifier pulses slightly out of phase to indicate conduction alternation */
        .rectPulseTop { stroke: url(#acGrad); stroke-opacity: 0.0; }
        .rectPulseBottom { stroke: url(#acGrad); stroke-opacity: 0.0; }

        /* helper: subtle label glow */
        text { font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; fill-opacity: 0.95; }

        /* small performance note: offset-path requires browser support; modern Chromium/Firefox support is evolving.
           This SVG gracefully degrades to static layout if offset-path is unsupported. */
      `}</style>
    </svg>
  </>
)}
{visual?.symbol === "current_source" && (
  <>
    {/* ==============================
        Current Source — Futuristic Circuit Flow Visualization
        - Dark/holographic aesthetic
        - Glowing conductor with flowing particles
        - Waveform overlay (sine) whose amplitude & freq driven by CSS vars
        - Battery (left) and load (right) icons, ammeter label
        - Use CSS variables to control --amp, --freq, --dir (1 or -1)
        Usage: wrap this block in a parent that sets style={{ '--amp': amp, '--freq': freq, '--dir': dir }}
        Default values provided inline below for standalone testing
       ============================== */}

    <g
      transform="translate(60,120)"
      // To control interactively from parent, set inline style on the parent container:
      // style={{ '--amp': 1.0, '--freq': 1.0, '--dir': 1 }}
      style={{
        // Defaults (override from parent container if desired)
        "--amp": 1,
        "--freq": 1,
        "--dir": 1, // 1 => left->right, -1 => right->left
      }}
      aria-hidden="true"
    >
      <defs>
        {/* conductor shimmer gradient */}
        <linearGradient id="wireShimmer" x1="0" x2="1">
          <stop offset="0%" stopColor="#060606" />
          <stop offset="40%" stopColor="#0b0b0b" />
          <stop offset="100%" stopColor="#060606" />
        </linearGradient>

        {/* neon gradient for particle trail */}
        <linearGradient id="particleGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#00f6ff" stopOpacity="1" />
          <stop offset="50%" stopColor="#ffd24a" stopOpacity="1" />
          <stop offset="100%" stopColor="#ff7a2d" stopOpacity="1" />
        </linearGradient>

        {/* neon blur filter */}
        <filter id="neon" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feColorMatrix in="b" type="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 0 0 18 -7" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* faint inner reflection */}
        <linearGradient id="wireReflect" x1="0" x2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
        </linearGradient>

        {/* waveform gradient */}
        <linearGradient id="waveGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#9b5cff" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#00eaff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ff7a2d" stopOpacity="0.9" />
        </linearGradient>

        {/* path of conductor (single smooth loop / long horizontal trace) */}
        <path id="conductorPath" d="M 24 80 C 120 14 360 14 456 80" fill="none" stroke="transparent" />

        {/* mirrored conductor after for reflection */}
        <path id="conductorPathBack" d="M 24 86 C 120 152 360 152 456 86" fill="none" stroke="transparent" />

        {/* small battery icon */}
        <symbol id="batterySymbol" viewBox="0 0 24 24">
          <rect x="2" y="6" width="14" height="12" rx="2" fill="#070707" stroke="#333" strokeWidth="0.8" />
          <rect x="16" y="9" width="2" height="6" rx="0.4" fill="#ffb84a" />
          <rect x="4" y="8" width="10" height="8" rx="0.6" fill="#111" />
        </symbol>

        {/* load/resistor-like block */}
        <symbol id="loadSymbol" viewBox="0 0 28 24">
          <rect x="0" y="6" width="28" height="12" rx="3" fill="#0b0b0b" stroke="#222" strokeWidth="0.8" />
          <path d="M4 12 h4 l4 -8 l4 16 l4 -8 h4" fill="none" stroke="#ffb84a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>

      </defs>

      {/* Background subtle vignette rectangle (dark gradient) */}
      <rect x="0" y="0" width="480" height="180" rx="12" fill="url(#bgGrad)" opacity="0.01" />

      {/* Conductor main glow */}
      <g transform="translate(0,0)">
        {/* base thick matte wire */}
        <path d="M 24 80 C 120 14 360 14 456 80" stroke="url(#wireShimmer)" strokeWidth="12" strokeLinecap="round" fill="none" opacity="0.98" />
        {/* reflective shimmer */}
        <path d="M 24 80 C 120 14 360 14 456 80" stroke="url(#wireReflect)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.85" />

        {/* neon top highlight */}
        <path d="M 24 80 C 120 14 360 14 456 80"
          stroke="#00f6ff"
          strokeWidth="2.2"
          strokeLinecap="round"
          style={{ filter: "url(#neon)", mixBlendMode: "screen", opacity: 0.9 }}
        />

        {/* animated gauge shimmer that pulses with amplitude */}
        <path d="M 24 80 C 120 14 360 14 456 80"
          stroke="#ffffff"
          strokeWidth="0.6"
          strokeLinecap="round"
          opacity="0.12"
          style={{
            strokeDasharray: 60,
            strokeDashoffset: 0,
            animation: "conductorPulse calc(2.6s / var(--freq)) ease-in-out infinite",
            transformOrigin: "center"
          }}
        />
      </g>

      {/* Battery on left and load on right */}
      <g transform="translate(-6,22) scale(0.1)">
        <use href="#batterySymbol" x="8" y="2" />
        <text x="24" y="24" fontSize="9" fill="#9AA" >EMF</text>
      </g>
      <g transform="translate(432,22) scale(0.1)">
        <use href="#loadSymbol" x="0" y="6" />
        <text x="10" y="24" fontSize="9" fill="#9AA" >Load</text>
      </g>

      {/* Ammeter overlay (center) */}
      <g transform="translate(232,36)">
        <circle cx="0" cy="0" r="16" fill="#080808" stroke="#222" strokeWidth="1.2" />
        <path d="M -8 6 A 10 10 0 0 1 8 6" stroke="#00eaff" strokeWidth="1.8" fill="none" strokeLinecap="round" style={{ filter: "url(#neon)" }} />
        <text x="0" y="4" fontSize="8" fill="#ffd24a" textAnchor="middle">A</text>
      </g>

      {/* Waveform overlay that follows conductor - uses stroke path with offset to align to conductor */}
      <g transform="translate(0,0)" >
        {/* Draw a sin-like path along conductor using many small segments mapped to conductor projection.
            For simplicity we render a path that roughly overlays conductor. */}
        <path
          id="sineOverlay"
          d="M 24 80 C 120 14 200 60 240 32 C 280 4 360 14 456 80"
          fill="none"
          stroke="url(#waveGrad)"
          strokeWidth="2.2"
          strokeLinecap="round"
          style={{
            filter: "url(#neon)",
            mixBlendMode: "screen",
            opacity: 0.95,
            strokeDasharray: 600,
            strokeDashoffset: 600,
            animation: "waveTravel calc(4s / var(--freq)) linear infinite",
            // animate amplitude via strokeWidth slightly with --amp
            transition: "stroke-width 300ms linear",
            strokeWidth: `calc(1.4px + (var(--amp) * 1.6px))`
          }}
        />
      </g>

      {/* PARTICLES: flowing along the conductor - density scales with --amp */}
      {/* We'll create two particle groups: main flow and spice flickers */}
      <g className="particles" transform="translate(0,0)" style={{ pointerEvents: "none" }}>
        {/* main flow (cyan->amber->orange) */}
        {Array.from({ length: 18 }).map((_, i) => {
          // stagger delays and size; in JSX inside a map we can use inline style with CSS animation referencing vars
          const stagger = (i / 18) * 1.6;
          return (
            <circle
              key={`p-${i}`}
              r={2 + (i % 3) * 0.6}
              fill="url(#particleGrad)"
              style={{
                offsetPath: "path('M 24 80 C 120 14 360 14 456 80')",
                animationName: "particleFlow",
                animationDuration: `calc(3.6s / (max(0.4, var(--amp))))`, // faster when amp increases
                animationTimingFunction: "linear",
                animationDelay: `-${stagger}s`,
                animationIterationCount: "infinite",
                transformOrigin: "0 0",
                opacity: 0.96,
                filter: "url(#neon)"
              }}
            />
          );
        })}

        {/* flicker / scattering particles that show energy loss or reverse flow */}
        {Array.from({ length: 10 }).map((_, i) => {
          const d = (i / 10) * 2.4;
          return (
            <circle
              key={`f-${i}`}
              r={1 + ((i % 2) * 0.6)}
              fill="#ff7a2d"
              style={{
                offsetPath: "path('M 280 60 q 12 8 28 0 q -4 -6 -18 -10')",
                animationName: "flicker",
                animationDuration: "2.6s",
                animationTimingFunction: "ease-in-out",
                animationDelay: `-${d}s`,
                animationIterationCount: "infinite",
                transformOrigin: "0 0",
                opacity: 0,
                filter: "url(#neon)"
              }}
            />
          );
        })}
      </g>

      {/* Controls overlay labels (non-interactive visuals) */}
      <g transform="translate(14,8)">
        <text x="0" y="8" fontSize="10" fill="#9aa">Current (I) — flow of charge</text>
        <text x="0" y="20" fontSize="9" fill="#7fb">A = C/s</text>
      </g>

      {/* Styling / Animations */}
      <style>{`
        /* Utility to use var(--amp) safely in calc (provide fallback) */
        :root { --amp: 1; --freq: 1; --dir: 1; }

        /* particle main flow: moves from left->right by default.
           If parent sets --dir: -1, we flip direction by reversing the path via transform scaleX(-1) on a parent wrapper.
           For simplicity, we respect direction by modulating animation-direction via CSS var in JS (parent can override style) */
        @keyframes particleFlow {
          0% { offset-distance: 0%; opacity: 0; transform: scale(0.6); }
          8% { opacity: 1; transform: scale(1.04); }
          92% { opacity: 1; transform: scale(1.0); }
          100% { offset-distance: 100%; opacity: 0; transform: scale(0.6); }
        }

        /* small flicker particles */
        @keyframes flicker {
          0% { offset-distance: 0%; opacity: 0; transform: scale(0.6); }
          30% { opacity: 1; transform: translateY(-2px) scale(1.1); }
          70% { opacity: 0.6; transform: translateY(1px) scale(0.9); }
          100% { offset-distance: 100%; opacity: 0; transform: scale(0.6); }
        }

        /* conductor subtle pulse when amp increases */
        @keyframes conductorPulse {
          0% { opacity: 0.12; transform: scaleX(1); }
          50% { opacity: calc(0.12 + (min(1, var(--amp)) * 0.12)); transform: scaleX(1.002); }
          100% { opacity: 0.12; transform: scaleX(1); }
        }

        /* waveform traveling along conductor */
        @keyframes waveTravel {
          0% { stroke-dashoffset: 600; opacity: 0.45; }
          50% { opacity: calc(0.45 + (min(1, var(--amp)) * 0.35)); }
          100% { stroke-dashoffset: 0; opacity: 0.45; }
        }

        /* subtle glow dynamics on the neon stroke (pulsing with amp) */
        @keyframes neonGlow {
          0% { filter: drop-shadow(0 0 6px rgba(0,246,255,0.42)); opacity: 0.85; }
          50% { filter: drop-shadow(0 0 calc(8px * var(--amp)) rgba(0,246,255, calc(0.4 * var(--amp)))); opacity: 1; }
          100% { filter: drop-shadow(0 0 6px rgba(0,246,255,0.42)); opacity: 0.85; }
        }

        /* sine -> amplitude visual effect on stroke width via CSS transitions was set inline */

        /* small responsive tweak */
        @media (max-width: 480px) {
          svg { height: 160px !important; }
        }
      `}</style>
    </g>
  </>
)}
{visual?.symbol === "energy_core" && (
  <>
    {/* ================================
        Energy Core Visualizer (Futuristic / Holographic)
        - Central energy node with input streams, storage rings, output lines
        - Animated waveforms, particles, pulsing core, rotating rings
        - Filters: glow, blur, turbulence for shimmer/heat-haze
        - Drop into your SVG where you render symbols (keeps groups scoped)
       ================================= */}
    <g className="energyCoreGroup" transform="translate(94,120)" aria-label="Energy Core Visualizer">
      <defs>
        {/* color gradients */}
        <radialGradient id="coreGrad" cx="50%" cy="40%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="25%" stopColor="#00faff" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#007bff" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#00162a" stopOpacity="0.05" />
        </radialGradient>

        <linearGradient id="inputGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#007bff" />
          <stop offset="100%" stopColor="#00faff" />
        </linearGradient>

        <linearGradient id="outputGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#ffb84a" />
          <stop offset="100%" stopColor="#ff8800" />
        </linearGradient>

        <linearGradient id="ringGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#8e44ff" />
          <stop offset="60%" stopColor="#ff44c7" />
        </linearGradient>

        {/* glow filter */}
        <filter id="glowSoft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* stronger bloom for core center */}
        <filter id="coreBloom" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="12" result="b" />
          <feColorMatrix in="b" type="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 0 0 0.9 0" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* turbulence for shimmer */}
        <filter id="shimmer" x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence baseFrequency="0.01 0.02" numOctaves="2" result="noise" seed="3" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* particle path for left input stream */}
        <path id="inPathLeft" d="M 0 90 Q 70 60 130 70" fill="none" stroke="transparent" />
        <path id="inPathTop" d="M 180 0 Q 200 40 210 72" fill="none" stroke="transparent" />
        <path id="outPath" d="M 300 84 Q 360 92 420 84" fill="none" stroke="transparent" />

        {/* small spark symbol for readout */}
        <symbol id="spark" viewBox="-4 -4 8 8">
          <path d="M0 -3 L1 0 L3 1 L0 1 L-1 3 L-1 0 L-3 -1 L-1 -1 Z" fill="#ffcc00" />
        </symbol>
      </defs>

      {/* Background subtle panel */}
      <rect x="-10" y="-8" width="460" height="220" rx="14" fill="url(#panelGrad)" opacity="0.02" />

      {/* Input Streams */}
      <g className="inputs" aria-hidden="false">
        {/* left cyan stream band */}
        <path d="M 0 90 Q 70 60 130 72" stroke="url(#inputGrad)" strokeWidth="8" strokeLinecap="round" opacity="0.95" style={{ filter: 'url(#glowSoft)' }} />
        <path d="M 0 90 Q 70 60 130 72" stroke="#00faff" strokeWidth="2" strokeLinecap="round" opacity="0.9" style={{ mixBlendMode: 'screen' }} />

        {/* top stream */}
        <path d="M 180 0 Q 200 40 210 72" stroke="url(#inputGrad)" strokeWidth="6" strokeLinecap="round" opacity="0.88" style={{ filter: 'url(#glowSoft)' }} />

        {/* particles along inPathLeft */}
        {Array.from({ length: 10 }).map((_, i) => {
          const delay = (i / 10) * 2;
          const size = 1.6 + (i % 3) * 0.6;
          return (
            <circle
              key={`inL-${i}`}
              r={size}
              fill="#00faff"
              style={{
                offsetPath: "path('M 0 90 Q 70 60 130 72')",
                animationName: 'streamInL',
                animationDuration: '3s',
                animationTimingFunction: 'linear',
                animationDelay: `-${delay}s`,
                animationIterationCount: 'infinite',
                transformOrigin: '0 0',
                filter: 'url(#glowSoft)'
              }}
            />
          );
        })}

        {/* particles along inPathTop */}
        {Array.from({ length: 6 }).map((_, i) => {
          const delay = (i / 6) * 2.4;
          const size = 1.4 + (i % 2) * 0.6;
          return (
            <circle
              key={`inT-${i}`}
              r={size}
              fill="#00eaff"
              style={{
                offsetPath: "path('M 180 0 Q 200 40 210 72')",
                animationName: 'streamInT',
                animationDuration: '3.2s',
                animationTimingFunction: 'linear',
                animationDelay: `-${delay}s`,
                animationIterationCount: 'infinite',
                transformOrigin: '0 0',
                filter: 'url(#glowSoft)'
              }}
            />
          );
        })}
      </g>

      {/* Central Energy Core Node */}
      <g className="core" transform="translate(180,80)" role="img" aria-label="Energy Core (storage node)">
        <title>Energy Core — accumulation and release of electrical energy</title>

        {/* outer halo rings (orbiting storage) */}
        <g className="rings" style={{ transformOrigin: '180px 80px' }}>
          <circle cx="0" cy="0" r="72" fill="none" stroke="url(#ringGrad)" strokeWidth="1.8" opacity="0.16" style={{ filter: 'url(#glowSoft)', animation: 'ringRotateSlow 16s linear infinite' }} />
          <circle cx="0" cy="0" r="52" fill="none" stroke="url(#ringGrad)" strokeWidth="1.6" opacity="0.18" style={{ filter: 'url(#glowSoft)', animation: 'ringRotateRev 12s linear infinite' }} />
          <circle cx="0" cy="0" r="32" fill="none" stroke="url(#ringGrad)" strokeWidth="2.2" opacity="0.22" style={{ filter: 'url(#glowSoft)', animation: 'ringRotateSlow 8s linear infinite' }} />
        </g>

        {/* fractal energy traces (subtle) */}
        <g opacity="0.12" style={{ filter: 'url(#shimmer)' }}>
          <path d="M -48 -20 C -24 -40 24 -40 48 -20" stroke="#8e44ff" strokeWidth="1.2" fill="none" />
          <path d="M -56 12 C -28 32 28 32 56 12" stroke="#ff44c7" strokeWidth="1.2" fill="none" />
        </g>

        {/* inner pulsating core (hexagon-like) */}
        <g className="coreBody" style={{ filter: 'url(#coreBloom)' }}>
          {/* subtle rotating polygonal ring */}
          <g transform="rotate(0)">
            <polygon points="-18,-32 18,-32 36,0 18,32 -18,32 -36,0"
              fill="none" stroke="url(#coreGrad)" strokeWidth="1.6" opacity="0.95" style={{ filter: 'url(#glowSoft)', animation: 'polySpin 10s linear infinite' }} />
          </g>

          {/* main filled core */}
          <circle cx="0" cy="0" r="18" fill="url(#coreGrad)" opacity="1" />

          {/* inner waveform ripple (represents internal oscillation/energy) */}
          <g>
            <path d="M -16 0 C -8 -8 8 -8 16 0 C 8 8 -8 8 -16 0 Z" fill="#ffffff" opacity="0.06" style={{ animation: 'corePulse 3s ease-in-out infinite' }} />
          </g>

          {/* micro-particles around core */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const rx = Math.cos(angle) * (24 + (i % 3) * 2);
            const ry = Math.sin(angle) * (24 + (i % 3) * 2);
            return <circle key={`cpart-${i}`} cx={rx} cy={ry} r={0.9 + (i % 2) * 0.8} fill={i % 2 ? '#00faff' : '#ff44c7'} opacity="0.9" style={{ filter: 'url(#glowSoft)', transformOrigin: '0 0', animation: `orbit${i % 3} ${6 + (i % 4)}s linear infinite` }} />;
          })}

          {/* clickable pulse ring (can be wired to onClick) */}
          <circle cx="0" cy="0" r="28" fill="none" stroke="#00faff" strokeWidth="1.2" opacity="0.08" style={{ animation: 'coreBeat 3s ease-in-out infinite' }} />
        </g>
      </g>

      {/* Output Flow (to the right) */}
      <g className="outputs" aria-hidden="false">
        <path d="M 300 84 Q 360 92 420 84" stroke="url(#outputGrad)" strokeWidth="8" strokeLinecap="round" opacity="0.95" style={{ filter: 'url(#glowSoft)' }} />
        <path d="M 300 84 Q 360 92 420 84" stroke="#ffb84a" strokeWidth="2" strokeLinecap="round" opacity="0.9" style={{ mixBlendMode: 'screen' }} />

        {/* output particles */}
        {Array.from({ length: 10 }).map((_, i) => {
          const delay = (i / 10) * 2;
          const size = 1.6 + (i % 3) * 0.7;
          return (
            <circle
              key={`out-${i}`}
              r={size}
              fill="#ffb84a"
              style={{
                offsetPath: "path('M 300 84 Q 360 92 420 84')",
                animationName: 'streamOut',
                animationDuration: '3.4s',
                animationTimingFunction: 'linear',
                animationDelay: `-${delay}s`,
                animationIterationCount: 'infinite',
                transformOrigin: '0 0',
                filter: 'url(#glowSoft)'
              }}
            />
          );
        })}
      </g>

      {/* Measurement nodes (small flickering nodes around) */}
      <g className="measures" transform="translate(0,0)">
        {[
          { x: 120, y: 58, label: 'V' },
          { x: 160, y: 34, label: 'I' },
          { x: 260, y: 100, label: 'E' }
        ].map((m, idx) => (
          <g key={idx} transform={`translate(${m.x}, ${m.y})`} aria-hidden="false">
            <circle cx="0" cy="0" r="6" fill="#001a2a" stroke={idx === 2 ? '#ff44c7' : idx === 1 ? '#00faff' : '#00bfff'} strokeWidth="1.6" style={{ filter: 'url(#glowSoft)' }} />
            <circle cx="0" cy="0" r="2.2" fill={idx === 2 ? '#ff44c7' : idx === 1 ? '#00faff' : '#00bfff'} opacity="0.95" style={{ animation: `nodeFlick ${2.2 + idx * 0.6}s ease-in-out ${idx * 0.12}s infinite` }} />
            <text x="10" y="4" fontSize="9" fill="#9aa">{m.label}</text>
          </g>
        ))}
      </g>

      {/* Readout Panel (right-bottom) */}
      <g transform="translate(320,108)" className="readouts" aria-hidden="false">
        <rect x="0" y="0" width="120" height="84" rx="8" fill="#070708" stroke="#111" />
        <text x="8" y="16" fontSize="10" fill="#9aa">Energy Core</text>
        <text x="8" y="34" fontSize="14" fill="#00faff" fontWeight="700">Capacity: <tspan fill="#ffd24a">78%</tspan></text>
        <text x="8" y="54" fontSize="12" fill="#9aa">Power Out: <tspan fill="#ffb84a">3.2 kW</tspan></text>
        <g transform="translate(8,62)">
          <rect x="0" y="0" width="104" height="6" rx="3" fill="#0b0b0b" />
          <rect x="0" y="0" width="82" height="6" rx="3" fill="url(#ringGrad)" style={{ filter: 'url(#glowSoft)', transition: 'width 300ms linear' }} />
        </g>
      </g>

      {/* Inline CSS animations controlling all motion */}
      <style>{`
        /* Input streams */
        @keyframes streamInL {
          0% { offset-distance: 0%; opacity: 0; transform: scale(0.8); }
          8% { opacity: 1; }
          45% { offset-distance: 45%; opacity: 0.95; transform: scale(1.0); }
          85% { offset-distance: 100%; opacity: 0.15; transform: scale(0.6); }
          100% { offset-distance: 100%; opacity: 0; }
        }
        @keyframes streamInT {
          0% { offset-distance: 0%; opacity: 0; transform: scale(0.8); }
          10% { opacity: 1; }
          50% { offset-distance: 50%; opacity: 0.95; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        @keyframes streamOut {
          0% { offset-distance: 0%; opacity: 0; transform: scale(0.9); }
          12% { opacity: 1; }
          60% { offset-distance: 60%; opacity: 0.95; }
          100% { offset-distance: 100%; opacity: 0; }
        }

        /* Core micro-orbits */
        @keyframes orbit0 { from { transform: rotate(0deg) translateX(0) rotate(0deg); } to { transform: rotate(360deg) translateX(0) rotate(-360deg); } }
        @keyframes orbit1 { from { transform: rotate(0deg) translateX(0) rotate(0deg); } to { transform: rotate(-360deg) translateX(0) rotate(360deg); } }
        @keyframes orbit2 { from { transform: rotate(0deg) translateX(0) rotate(0deg); } to { transform: rotate(360deg) translateX(0) rotate(-360deg); } }

        /* rings rotation */
        @keyframes ringRotateSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ringRotateRev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes polySpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* core heartbeat */
        @keyframes corePulse {
          0% { transform: scale(0.96); opacity: 0.86; }
          30% { transform: scale(1.06); opacity: 1; }
          60% { transform: scale(0.98); opacity: 0.94; }
          100% { transform: scale(0.96); opacity: 0.86; }
        }

        @keyframes coreBeat {
          0% { stroke-width: 1.2; opacity: 0.06; transform: scale(0.96); }
          40% { stroke-width: 2.2; opacity: 0.18; transform: scale(1.08); }
          80% { stroke-width: 1.6; opacity: 0.10; transform: scale(1.02); }
          100% { stroke-width: 1.2; opacity: 0.06; transform: scale(0.96); }
        }

        /* small node flicker */
        @keyframes nodeFlick {
          0% { opacity: 0.4; transform: scale(0.86); }
          50% { opacity: 1; transform: scale(1.06); }
          100% { opacity: 0.4; transform: scale(0.86); }
        }

        /* orbit micro particles (assign each a different speed via inline style) */
        .orbit0 { animation: orbit0 8s linear infinite; transform-origin: 0 0; }
        .orbit1 { animation: orbit1 10s linear infinite; transform-origin: 0 0; }
        .orbit2 { animation: orbit2 6s linear infinite; transform-origin: 0 0; }

        /* output & stream animation may have slight stagger */
        @keyframes streamOut { 0% { offset-distance: 0%; opacity: 0 } 10% { opacity: 1 } 70% { offset-distance: 70% } 100% { offset-distance: 100%; opacity: 0 } }

        /* core ring spin & shimmer applied inline */
        /* small responsiveness */
        @media (max-width: 640px) {
          .energyCoreGroup { transform-origin: 0 0; transform: scale(0.9); }
        }
      `}</style>
    </g>
  </>
)}

{visual?.symbol === "ac_source" && (
  <>
    {/*
      AC Source — Futuristic Animated Schematic
      - Dark neon theme
      - Animated sine symbol, bidirectional particle flow,
        load element that brightens with instantaneous amplitude,
        and a mini oscilloscope.
      - Self-contained SVG block + inline CSS keyframes (plug into your React SVG area).
    */}

    <g transform="translate(108,78)" className="acSourceGroup" aria-label="AC Source Visualization">
      <defs>
        {/* color ramps */}
        <linearGradient id="gradCyan" x1="0" x2="1">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="100%" stopColor="#00bfff" />
        </linearGradient>

        <linearGradient id="gradMagenta" x1="0" x2="1">
          <stop offset="0%" stopColor="#ff66ff" />
          <stop offset="100%" stopColor="#ff00ff" />
        </linearGradient>

        <linearGradient id="gradPower" x1="0" x2="1">
          <stop offset="0%" stopColor="#ffcc00" />
          <stop offset="100%" stopColor="#ff8800" />
        </linearGradient>

        {/* soft neon glow filter */}
        <filter id="neon" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="6" result="blur1" />
          <feColorMatrix type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 1 0" result="col" />
          <feMerge>
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* subtle depth / inner shadow */}
        <filter id="depth" x="-40%" y="-40%" width="180%" height="180%">
          <feOffset dx="0" dy="6" in="SourceAlpha" result="off" />
          <feGaussianBlur in="off" stdDeviation="8" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* noise for holographic shimmer (optional subtle) */}
        <filter id="holoNoise">
          <feTurbulence baseFrequency="0.012" numOctaves="2" stitchTiles="stitch" result="turb" />
          <feColorMatrix type="saturate" values="0" />
          <feBlend in="SourceGraphic" in2="turb" mode="overlay" />
        </filter>

        {/* path for current flow (semi-circular / curved) */}
        <path id="circuitPath" d="M 120 66 Q 180 16 260 66 T 400 66" fill="none" stroke="transparent" />

        {/* small path left-to-right (for positive half-cycle) */}
        <path id="flowPathPos" d="M 120 66 Q 180 16 260 66 T 400 66" fill="none" stroke="transparent" />

        {/* small path right-to-left (for negative half-cycle) - same path used reversed by offset-distance */}
        <path id="flowPathNeg" d="M 400 66 Q 340 116 260 66 T 120 66" fill="none" stroke="transparent" />

        {/* oscilloscope mini path */}
        <path id="oscPath" d="M 6 40 Q 22 6 40 40 T 74 40 T 108 40" fill="none" stroke="transparent" />
      </defs>

      {/* panel background */}
      <rect x="0" y="0" width="460" height="180" rx="12"
        fill="url(#panelGradient)" style={{ fill: 'rgba(2,2,2,0.88)' }} />

      {/* left: AC source circle with animated sine inside */}
      <g transform="translate(28,26)" className="acSourceSymbol" aria-hidden="false">
        <title>AC Source — alternating potential</title>
        <g filter="url(#neon)">
          <circle cx="46" cy="46" r="40" fill="#050507" stroke="#0b3440" strokeWidth="1.6" />
          {/* inner animated sine wave path */}
          <g transform="translate(14,46)">
            <rect x="-14" y="-12" width="60" height="24" rx="8" fill="rgba(3,6,8,0.25)" />
            <path
              d="M -12 0 Q -6 -10 0 0 T 12 0 T 24 0"
              fill="none"
              stroke="url(#gradCyan)"
              strokeWidth="2.6"
              strokeLinecap="round"
              style={{
                filter: 'url(#neon)',
                strokeDasharray: 80,
                strokeDashoffset: 80,
                animation: 'sineDraw 2s linear infinite'
              }}
            />
          </g>

          {/* polarity indicator (small plus/minus that alternate color) */}
          <circle cx="46" cy="16" r="4" fill="#00f0ff" opacity="0.9" style={{ animation: 'polarityPulse 2s linear infinite' }} />
        </g>

        <text x="46" y="106" fontSize="11" textAnchor="middle" fill="#9fbfd9">AC Source</text>
      </g>

      {/* central connection wires (metallic base) */}
      <g transform="translate(0,0)" filter="url(#depth)">
        <path d="M 100 66 Q 140 36 180 66" stroke="#2a2e33" strokeWidth="10" strokeLinecap="round" />
        <path d="M 300 66 Q 340 96 380 66" stroke="#2a2e33" strokeWidth="10" strokeLinecap="round" />
        {/* glowing overlay (current highlight) */}
        <path d="M 120 66 Q 180 16 260 66 T 400 66" stroke="url(#gradCyan)" strokeWidth="2.2" strokeLinecap="round"
          style={{ filter: 'url(#neon)', mixBlendMode: 'screen', opacity: 0.85 }} />
      </g>

      {/* load on the right (filament lamp + bracket) */}
      <g transform="translate(300,18)" className="loadGroup" aria-hidden="false">
        <title>Load — glows with power</title>
        <g filter="url(#neon)">
          <rect x="6" y="14" width="72" height="72" rx="10" fill="#060607" stroke="#171717" strokeWidth="1.2" />
          {/* filament bulb glass */}
          <ellipse cx="42" cy="42" rx="24" ry="20" fill="#050506" stroke="#222" strokeWidth="1" />
          {/* filament path (will glow according to instantaneous |V*I|) */}
          <path d="M 30 38 q 6 -12 24 0" stroke="url(#gradPower)" strokeWidth="2.6" strokeLinecap="round"
            style={{ filter: 'url(#neon)', strokeDasharray: 40, strokeDashoffset: 40, animation: 'filamentPulse 2s linear infinite' }} />
          {/* warmth halo */}
          <circle cx="42" cy="42" r="30" fill="url(#gradPower)" opacity="0.06" style={{ filter: 'url(#neon)', animation: 'haloPulse 2s linear infinite' }} />
        </g>
        <text x="42" y="100" fontSize="10" textAnchor="middle" fill="#ffdca0">Load</text>
      </g>

      {/* bidirectional flow particles:
         - Positive half-cycle group: particles move left->right, color cyan
         - Negative half-cycle group: particles move right->left, color magenta
         Each group is visible for half the loop and invisible otherwise (via keyframes),
         creating the perception of direction reversal synchronized with waveform.
      */}

      {/* POSITIVE half-cycle: left->right */}
      <g className="flowGroupPos" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => {
          const delay = (i / 12) * 2;
          return (
            <circle
              key={`p-${i}`}
              r={2 + (i % 3) * 0.4}
              fill="#00f0ff"
              style={{
                offsetPath: "path('M 120 66 Q 180 16 260 66 T 400 66')",
                animationName: 'posFlow',
                animationDuration: '2s',
                animationTimingFunction: 'linear',
                animationDelay: `-${delay}s`,
                animationIterationCount: 'infinite',
                transformOrigin: '0 0',
                filter: 'url(#neon)'
              }}
            />
          );
        })}
      </g>

      {/* NEGATIVE half-cycle: right->left */}
      <g className="flowGroupNeg" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => {
          const delay = (i / 12) * 2;
          return (
            <circle
              key={`n-${i}`}
              r={2 + ((i + 1) % 3) * 0.4}
              fill="#ff66ff"
              style={{
                offsetPath: "path('M 400 66 Q 340 116 260 66 T 120 66')",
                animationName: 'negFlow',
                animationDuration: '2s',
                animationTimingFunction: 'linear',
                animationDelay: `-${delay}s`,
                animationIterationCount: 'infinite',
                transformOrigin: '0 0',
                filter: 'url(#neon)'
              }}
            />
          );
        })}
      </g>

   

      {/* central power readout (animated P display) */}
      <g transform="translate(200,124)">
        <rect x="0" y="0" width="120" height="46" rx="6" fill="#050506" stroke="#111" />
        <text x="8" y="16" fontSize="10" fill="#9aa">Power (instant)</text>
        <text x="8" y="36" fontSize="16" fill="#ffcc66" fontWeight="700" className="powerValue">28 W</text>
      </g>

      {/* small schematic wires + arrows for polarity */}
      <g transform="translate(120,44)">
        <text x="0" y="-18" fontSize="10" fill="#9aa">Circuit</text>
      </g>

      {/* inline styles & animations */}
      <style>{`
        /* loop duration = 2s (visual 1Hz feel) */
        :root { --loop: 2s; }

        /* draw sine internal to AC circle */
        @keyframes sineDraw {
          0% { stroke-dashoffset: 80; opacity: 0.6; transform: translateY(0); }
          25% { stroke-dashoffset: 40; opacity: 1; transform: translateY(-1px); }
          50% { stroke-dashoffset: 10; opacity: 1; transform: translateY(0); }
          75% { stroke-dashoffset: 40; opacity: 0.95; transform: translateY(1px); }
          100% { stroke-dashoffset: 80; opacity: 0.6; transform: translateY(0); }
        }

        /* polarity pulsing dot (top of AC symbol) */
        @keyframes polarityPulse {
          0% { fill: #00f0ff; transform: scale(1); opacity: 0.9; }
          50% { fill: #ff66ff; transform: scale(1.15); opacity: 1; }
          100% { fill: #00f0ff; transform: scale(1); opacity: 0.9; }
        }

        /* filament / load pulse correlated with waveform amplitude */
        @keyframes filamentPulse {
          0% { stroke-dashoffset: 40; opacity: 0.4; transform: scale(0.98); }
          25% { stroke-dashoffset: 20; opacity: 0.8; transform: scale(1.02); }
          50% { stroke-dashoffset: 0; opacity: 1; transform: scale(1.08); }
          75% { stroke-dashoffset: 20; opacity: 0.8; transform: scale(1.02); }
          100% { stroke-dashoffset: 40; opacity: 0.4; transform: scale(0.98); }
        }

        /* halo pulse around load to express instantaneous P */
        @keyframes haloPulse {
          0% { opacity: 0.04; transform: scale(0.96); }
          50% { opacity: 0.28; transform: scale(1.12); }
          100% { opacity: 0.04; transform: scale(0.96); }
        }

        /* POSITIVE flow: particles traverse left->right ONLY during first half of loop;
           they are invisible during second half (negative half-cycle) */
        @keyframes posFlow {
          0%   { offset-distance: 0%; opacity: 0; transform: scale(0.9); }
          6%   { opacity: 1; }
          50%  { offset-distance: 100%; opacity: 1; transform: scale(1.1); }
          51%  { opacity: 0; offset-distance: 100%; transform: scale(1); }
          100% { opacity: 0; offset-distance: 100%; }
        }

        /* NEGATIVE flow: particles traverse right->left during second half only */
        @keyframes negFlow {
          0%   { opacity: 0; offset-distance: 0%; transform: scale(0.9); }
          50%  { opacity: 0; offset-distance: 0%; }
          51%  { opacity: 1; offset-distance: 0%; transform: scale(1); }
          100% { offset-distance: 100%; opacity: 1; transform: scale(1.05); }
        }

        /* mini oscilloscope draw */
        @keyframes oscDraw {
          0% { stroke-dashoffset: 260; opacity: 0.6; }
          25% { stroke-dashoffset: 160; opacity: 1; }
          50% { stroke-dashoffset: 80; opacity: 1; }
          75% { stroke-dashoffset: 40; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0.6; }
        }

        /* show filament and halo pulses synced */
        .loadGroup path { animation: filamentPulse var(--loop) linear infinite; }
        .loadGroup circle { animation: haloPulse var(--loop) linear infinite; }

        /* particle animations reference the same base loop */
        .flowGroupPos circle { animation-duration: var(--loop); }
        .flowGroupNeg circle { animation-duration: var(--loop); }

        /* tailor animation names to duration and repeat */
        circle[style*="posFlow"] { animation-name: posFlow; animation-iteration-count: infinite; animation-timing-function: linear; }
        circle[style*="negFlow"] { animation-name: negFlow; animation-iteration-count: infinite; animation-timing-function: linear; }

        /* small responsiveness */
        @media (max-width: 640px) {
          .acSourceGroup { transform-origin: 0 0; transform: scale(0.88); }
        }
      `}</style>
    </g>
  </>
)}


{visual?.symbol === "dc_source" && (() => {
  // Small helpers (inline)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, d=2) => (Math.round((v||0) * (10**d)) / (10**d)).toFixed(d);

  // Visual inputs (use visual props if provided)
  const V = visual?.V ?? 12; // volts
  const amp = Math.max(0, visual?.amp ?? visual?.I ?? 1.0); // current magnitude
  const running = visual?.running ?? true;
  const maxAmp = visual?.maxAmp ?? 10; // for mapping needle / intensity

  // Map amplitude -> intensity (0.05 .. 1.0)
  const intensity = clamp(amp / (maxAmp || 10), 0.05, 1.0);
  // Needle angle mapping: 0A -> -60deg, maxAmp -> +60deg
  const needleAngle = -60 + ( (amp / (maxAmp || 10)) * 120 );

  // Establish SVG layout
  const W = 1100;
  const H = 380;
  const pathId = "dcFlowPath";
  const flowCount = clamp(Math.round(6 + amp * 3), 4, 28);

  // Use Framer Motion components only if available
  const MotionDiv = (typeof window !== "undefined" && typeof require === "function") ? (typeof require("framer-motion").motion !== "undefined" ? require("framer-motion").motion.div : "div") : "div";
  // If framer-motion not available, fallback to plain div (we will still render fine).
  const Motion = (typeof window !== "undefined" && typeof require === "function" && require("framer-motion")) ? require("framer-motion").motion : { div: "div", svg: "svg" };

  return (
    <div className="relative w-full rounded-xl p-4 bg-gradient-to-b from-[#050505] to-[#07080a] border border-zinc-800 overflow-hidden">
      {/* HUD header like previous power_meter */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
            {/* simple icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="18" rx="3" fill="black" /><path d="M6 8h12M6 12h8" stroke="#000" strokeWidth="1.4"/></svg>
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">DC Source Visualizer</div>
            <div className="text-xs text-zinc-400">Steady unidirectional flow • battery & load • ammeter</div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full text-zinc-300 text-xs">V: <span className="text-[#ffd24a] ml-1">{V} V</span></div>
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full text-zinc-300 text-xs">I: <span className="text-[#00ffbf] ml-1">{round(amp,2)} A</span></div>
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full text-zinc-300 text-xs">Mode: <span className="text-[#ffd24a] ml-1">DC</span></div>
        </div>
      </div>

      {/* SVG visual */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full h-[340px]">
        <defs>
          {/* Neon + glow */}
          <radialGradient id="cellGlow" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#fff7d1" stopOpacity={0.9 * intensity} />
            <stop offset="60%" stopColor="#ffb84a" stopOpacity={0.6 * intensity} />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="dcLineGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffb84a" />
            <stop offset="50%" stopColor="#ffd24a" />
            <stop offset="100%" stopColor="#fff7d1" />
          </linearGradient>

          <filter id="neonBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          <filter id="microSpark" x="-100%" y="-100%" width="300%" height="300%">
            <feTurbulence baseFrequency="0.02" numOctaves="1" stitchTiles="stitch" result="t1" />
            <feDiffuseLighting in="t1" lightingColor="#fff" surfaceScale="1">
              <feDistantLight azimuth="45" elevation="50"/>
            </feDiffuseLighting>
            <feGaussianBlur stdDeviation="0.6"/>
          </filter>

          {/* small dot shape for particles */}
          <circle id="particle" cx="0" cy="0" r="3" fill="#fff7d1" />
        </defs>

        {/* background subtle grid */}
        <rect x="0" y="0" width={W} height={H} fill="url(#bgGrad)"></rect>
        <g opacity="0.04" stroke="#0b1a22">
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={i} x1={0} y1={i * (H/12)} x2={W} y2={i * (H/12)} />
          ))}
        </g>

        {/* layout: battery left, path middle, load right */}
        {/* Battery (DC Source) - multi-cell */}
        <g transform="translate(120, 70)" aria-label="Battery (DC Source)">
          {/* stack of three cells */}
          { [0,1,2].map((i) => {
            const y = i * 36;
            return (
              <g key={i} transform={`translate(0, ${y})`}>
                <rect x="-12" y="-6" width="96" height="28" rx="6" fill="#060606" stroke="#222" />
                <rect x="-8" y="-4" width="88" height="20" rx="4" fill="url(#cellGlow)" opacity={0.9} />
                {/* small terminal marks */}
                <rect x="86" y="2" width="8" height="4" fill="#ff7300" rx="1" />
                <rect x="-18" y="2" width="8" height="4" fill="#00c2ff" rx="1" />
              </g>
            );
          })}
          {/* plus and minus labels */}
          <text x="48" y="120" fontSize="12" fill="#ffb84a" textAnchor="middle">+</text>
          <text x="-24" y="120" fontSize="12" fill="#9ee6ff" textAnchor="middle">−</text>
          {/* battery title */}
          <text x="40" y="-18" fontSize="12" fill="#ffd24a">DC Battery</text>
        </g>

        {/* connection nodes left */}
        <g transform="translate(220, 160)">
          <circle r="4.5" fill="#fff7d1" opacity="0.95" filter="url(#neonBlur)"></circle>
        </g>

        {/* path from battery + terminal to load: single-direction path left->right */}
        <path id={pathId} d={`M 240 160 L 880 160`} stroke="url(#dcLineGrad)" strokeWidth="8" strokeLinecap="round" filter="url(#neonBlur)"></path>

        {/* connection nodes right */}
        <g transform="translate(880, 160)">
          <circle r="4.5" fill="#fff7d1" opacity="0.95" filter="url(#neonBlur)"></circle>
        </g>

        {/* Flow particles traveling along path from left->right (positive -> negative) */}
        {Array.from({ length: flowCount }).map((_, i) => {
          // stagger starts to make steady flow
          const delay = (i / flowCount) * 1.2;
          // particle color steady golden; slight white core
          return (
            <g key={`p-${i}`}>
              <circle r={3 + (i % 3) * 0.4} fill="#fff7d1" opacity={0.95}>
                <animateMotion
                  dur={`${2.4 + (flowCount/20)}s`}
                  repeatCount="indefinite"
                  begin={`${running ? -delay : 10000}s`}
                  rotate="0"
                >
                  <mpath xlinkHref={`#${pathId}`} />
                </animateMotion>
                <animate attributeName="opacity" values={`${0.5 + intensity*0.4};0.95;${0.5 + intensity*0.4}`} dur="2s" repeatCount="indefinite" begin={`${-delay}s`} />
              </circle>
            </g>
          );
        })}

        {/* Load (bulb/resistor) on the right */}
        <g transform="translate(920, 160)" aria-label="Load element">
          {/* bulb base */}
          <rect x="-18" y="22" width="36" height="10" rx="3" fill="#0b0b0b" stroke="#111" />
          {/* bulb glass */}
          <ellipse cx="0" cy="0" rx="26" ry="32" fill="#0b0b0b" stroke="#222" />
          {/* inner glow — intensity maps to amp */}
          <ellipse cx="0" cy="0" rx={`${12 + intensity * 18}`} ry={`${12 + intensity * 18}`} fill="#fff7d1" opacity={0.15 + intensity*0.6} filter="url(#neonBlur)"></ellipse>
          <ellipse cx="0" cy="0" rx="9" ry="9" fill="#fff7d1" opacity={0.35 + intensity*0.5}></ellipse>

          {/* filament lines */}
          <path d="M -6 6 C -3 2, 3 2, 6 6" stroke="#4b2b00" strokeWidth="2.2" strokeLinecap="round" />
          <text x="0" y="64" fontSize="11" fill="#ffd24a" textAnchor="middle">Load</text>

          {/* heat shimmer (small translate) */}
          <rect x="-28" y="-36" width="56" height="32" fill="none">
            <animate attributeName="opacity" values="0.02;0.08;0.02" dur="2.6s" repeatCount="indefinite" begin="0s" />
          </rect>
        </g>

        {/* Ammeter (small dial above path) */}
        <g transform="translate(560,100)" aria-label="Ammeter">
          <circle r="28" fill="#070808" stroke="#1b1b1b" />
          <circle r="22" fill="#060606" stroke="#111" />
          {/* needle pivot */}
          <g transform={`rotate(${needleAngle})`} style={{ transformOrigin: "0px 0px" }}>
            <line x1="0" y1="0" x2="18" y2="0" stroke="#ffb84a" strokeWidth="2.6" strokeLinecap="round" >
              {/* subtle motion using animateTransform if framer not present */}
              <animateTransform attributeName="transform" type="rotate"
                from={needleAngle} to={needleAngle} dur="0.25s" repeatCount="1" begin="0s" />
            </line>
          </g>
          <circle r="3" fill="#ffd24a" />
          <text x="0" y="44" fontSize="10" fill="#9ee6ff" textAnchor="middle">Ammeter</text>
          <text x="0" y="56" fontSize="10" fill="#fff7d1" textAnchor="middle">{round(amp,2)} A</text>
        </g>

        {/* Micro sparks along connections (occasional) */}
        <g opacity={0.9}>
          <circle cx="240" cy="160" r="1.6" fill="#fff7d1">
            <animate attributeName="r" values="1.2;3.8;1.2" dur="3.6s" repeatCount="indefinite" begin="0s" />
            <animate attributeName="opacity" values="0.2;0.9;0.2" dur="3.6s" repeatCount="indefinite" begin="0s" />
          </circle>
          <circle cx="880" cy="160" r="1.6" fill="#fff7d1">
            <animate attributeName="r" values="1.2;3.8;1.2" dur="3.6s" repeatCount="indefinite" begin="1.2s" />
            <animate attributeName="opacity" values="0.2;0.9;0.2" dur="3.6s" repeatCount="indefinite" begin="1.2s" />
          </circle>
        </g>

        {/* Flat DC waveform panel (bottom-left) — brightness maps to intensity */}
        <g transform="translate(80, 260)">
          <rect x="0" y="0" width="340" height="50" rx="8" fill="#060606" stroke="#111" />
          {/* steady horizontal line */}
          <line x1="12" y1="25" x2="328" y2="25" stroke="#ffb84a" strokeWidth={2.6} strokeLinecap="round" opacity={0.6 + (intensity*0.35)} />
          <text x="170" y="43" fontSize="11" fill="#ffd24a" textAnchor="middle">DC Voltage (flat)</text>
        </g>

        {/* Labeling: + and - near terminals */}
        <text x="92" y="64" fontSize="14" fill="#ff8a3c">+</text>
        <text x="940" y="64" fontSize="14" fill="#00c2ff">−</text>

        {/* small HUD info (bottom-right) */}
        <g transform={`translate(${W - 300}, ${H - 70})`}>
          <rect x="0" y="0" width="280" height="56" rx="8" fill="#060606" stroke="#111" />
          <text x="12" y="18" fontSize="12" fill="#ffd24a">DC Source</text>
          <text x="12" y="36" fontSize="11" fill="#fff7d1">V: <tspan fill="#ffd24a">{V} V</tspan> • I: <tspan fill="#00ffbf">{round(amp,2)} A</tspan></text>
        </g>
      </svg>

      {/* footer microcopy */}
      <div className="mt-2 text-xs text-zinc-400">Visualization: steady DC flow • intensity mapped to current (amp)</div>
    </div>
  );
})()}
{visual?.symbol === "dc_source" && (() => {
  const amp = Math.max(0.1, visual?.waveform?.amp ?? visual?.amp ?? 1.0);
  const running = visual?.running ?? true;
  const V = visual?.V ?? 12;
  const I = visual?.I ?? amp;
  const P_nominal = (V * I).toFixed(2);

  const particleCount = Math.min(36, 10 + Math.round(amp * 10));
  const transitSec = 4.5 / Math.max(0.2, amp);
  const glow = Math.min(3.0, 0.4 + amp * 0.9);
  const wirePath = "M 260 160 H 360 Q 400 160 440 120 H 560 Q 600 160 740 160";

  return (
    <>
      <g className="dcSourceViz" transform="translate(10,100)">
        <defs>
          {/* --- Glows & Filters --- */}
          <filter id="neonGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={3 * glow} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="softAura" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={2.2 * glow} result="g" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0.6 1 0 0 0
                      0 0.6 1 0 0
                      0 0 0 1 0"
            />
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* --- Gradients --- */}
          <linearGradient id="wireGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffb84a" />
            <stop offset="50%" stopColor="#fff7d1" />
            <stop offset="100%" stopColor="#00c2ff" />
          </linearGradient>

          <radialGradient id="sparkGrad">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="40%" stopColor="#ffd24a" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background plate */}
        <rect x="0" y="0" width="1000" height="320" fill="#050505" />

        {/* Grid lines */}
        <g opacity="0.05">
          {Array.from({ length: 10 }).map((_, i) => (
            <line
              key={i}
              x1="0"
              y1={i * 32}
              x2="1000"
              y2={i * 32}
              stroke="#111"
              strokeWidth="1"
            />
          ))}
        </g>

        {/* === Circuit schematic === */}
        {/* Positive Battery Terminal */}
        <g transform="translate(180,160)">
          <rect
            x="-60"
            y="-30"
            width="50"
            height="60"
            rx="6"
            fill="#0b0b0b"
            stroke="#ff7300"
            strokeWidth="1.6"
            filter="url(#neonGlow)"
          />
          <rect x="-60" y="-24" width="50" height="12" fill="#ff7300" opacity="0.25" />
          <rect x="-60" y="-6" width="50" height="12" fill="#ffb84a" opacity="0.3" />
          <rect x="-60" y="12" width="50" height="12" fill="#fff7d1" opacity="0.3" />
          <text x="-32" y="-40" fill="#ffb84a" fontSize="12" fontWeight="700">
            +
          </text>
          <text x="-36" y="64" fill="#ffdca3" fontSize="10">
            Positive
          </text>
        </g>

        {/* Negative Terminal */}
        <g transform="translate(780,160)">
          <rect
            x="8"
            y="-30"
            width="50"
            height="60"
            rx="6"
            fill="#0b0b0b"
            stroke="#00c2ff"
            strokeWidth="1.6"
            filter="url(#neonGlow)"
          />
          <rect x="8" y="-24" width="50" height="12" fill="#00c2ff" opacity="0.2" />
          <rect x="8" y="-6" width="50" height="12" fill="#00eaff" opacity="0.3" />
          <rect x="8" y="12" width="50" height="12" fill="#9ee6ff" opacity="0.25" />
          <text x="70" y="-40" fill="#9ee6ff" fontSize="12" fontWeight="700">
            −
          </text>
          <text x="28" y="64" fill="#9ee6ff" fontSize="10">
            Negative
          </text>
        </g>

        {/* Switch */}
        <g transform="translate(320,140)">
          <line x1="0" y1="0" x2="40" y2="0" stroke="#ffd24a" strokeWidth="2" />
          <line
            x1="40"
            y1="0"
            x2="60"
            y2="-12"
            stroke="#ffd24a"
            strokeWidth="2"
            filter="url(#neonGlow)"
          />
          <circle cx="0" cy="0" r="4" fill="#ff7300" />
          <circle cx="60" cy="-12" r="4" fill="#ffb84a" />
          <text x="10" y="24" fill="#ffdca3" fontSize="10">
            Switch
          </text>
        </g>

        {/* Wire Path */}
        <path
          d={wirePath}
          stroke="url(#wireGrad)"
          strokeWidth="5"
          strokeLinecap="round"
          filter="url(#softAura)"
        />

        {/* Flow Arrows */}
        {[0, 120, 240, 360].map((offset, idx) => (
          <g
            key={idx}
            transform={`translate(${260 + offset},160)`}
            style={{ opacity: 0.9 }}
          >
            <path
              d="M -8 -6 L 6 0 L -8 6 Z"
              fill="#fff7d1"
              filter="url(#neonGlow)"
              style={{
                animation: `arrowPulse ${2 + idx * 0.2}s ease-in-out infinite`,
              }}
            />
          </g>
        ))}

        {/* Flow Particles */}
        {Array.from({ length: particleCount }).map((_, i) => {
          const delay = (i / particleCount) * transitSec;
          const size = 2 + (i % 3) * 0.6;
          return (
            <circle
              key={i}
              r={size}
              fill="#fff7d1"
              style={{
                offsetPath: `path('${wirePath}')`,
                animationName: "dcParticleFlow",
                animationDuration: `${transitSec}s`,
                animationTimingFunction: "linear",
                animationDelay: `-${delay}s`,
                animationIterationCount: "infinite",
                filter: "url(#neonGlow)",
              }}
            />
          );
        })}

        {/* Load / Bulb */}
        <g transform="translate(560,100)">
          <ellipse cx="0" cy="60" rx="28" ry="20" fill="#070707" stroke="#222" />
          <ellipse
            cx="0"
            cy="60"
            rx="18"
            ry="12"
            fill="#fff7d1"
            opacity={0.25 + amp * 0.5}
            filter="url(#neonGlow)"
          />
          <path
            d="M -8 58 q 8 -14 16 0"
            stroke="#fff9d9"
            strokeWidth="2"
            strokeLinecap="round"
            opacity={0.5 + amp * 0.5}
          />
          <text
            x="0"
            y="96"
            textAnchor="middle"
            fill="#ffdca3"
            fontSize="10"
          >
            Load (Bulb)
          </text>
        </g>

        {/* Ammeter */}
        <g transform="translate(420,60)">
          <rect x="-40" y="-24" width="80" height="48" rx="8" fill="#0b0b0b" />
          <text x="0" y="-8" textAnchor="middle" fill="#9ee6ff" fontSize="9">
            Ammeter
          </text>
          <circle cx="0" cy="10" r="18" fill="#070707" stroke="#333" />
          <line
            x1="0"
            y1="10"
            x2={10 + amp * 8}
            y2="10"
            stroke="#ffb84a"
            strokeWidth="2"
            strokeLinecap="round"
            filter="url(#neonGlow)"
            transform={`rotate(${amp * 15} 0 10)`}
          />
          <text x="0" y="42" fill="#ffdca3" textAnchor="middle" fontSize="11">
            {amp.toFixed(2)} A
          </text>
        </g>

        {/* Flat Waveform */}
        <g transform="translate(120,240)">
          <rect x="0" y="0" width="240" height="36" rx="6" fill="#0b0b0b" />
          <line
            x1="8"
            y1="18"
            x2="232"
            y2="18"
            stroke="#ffb84a"
            strokeWidth="3"
            filter="url(#neonGlow)"
          />
          <circle
            r="4"
            fill="#fff7d1"
            style={{
              offsetPath: "path('M 8 18 H 232')",
              animation: "flatFlow 1.6s linear infinite",
            }}
          />
          <text
            x="250"
            y="22"
            fill="#9ee6ff"
            fontSize="10"
            textAnchor="start"
          >
            DC — steady voltage
          </text>
        </g>

        {/* Footer Info */}
        <text x="20" y="30" fill="#9aa" fontSize="11">
          Voltage: <tspan fill="#ffd24a">{V} V</tspan>
        </text>
        <text x="20" y="52" fill="#9aa" fontSize="11">
          Power: <tspan fill="#fff7d1">{P_nominal} W</tspan>
        </text>
      </g>

      <style>{`
        @keyframes dcParticleFlow {
          0% { offset-distance: 0%; opacity: 1; transform: scale(1); }
          90% { offset-distance: 90%; opacity: 0.9; }
          100% { offset-distance: 100%; opacity: 0; }
        }

        @keyframes flatFlow {
          0% { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }

        @keyframes arrowPulse {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 0.8; }
        }

       
          .dcSourceViz { transform: scale(0.75); 
        
      `}</style>
    </>
  );
})()}
{visual?.symbol === "transistor" && (() => {
  const freq = visual?.waveform?.freq ?? 4.0;
  const amp = visual?.waveform?.amp ?? 1.0;
  const running = visual?.running ?? true;
  const svgW = 900, svgH = 480;

  const particleCount = 24;
  const loopSec = 2.5;
  const β = 100; // transistor gain
  const Ib = 0.02 * amp; // Base current (A)
  const Ic = Ib * β; // Collector current (A)
  const Vce = 12 - (Ic * 0.1); // Approx collector voltage

  return (
    <>
      <g className="transistorViz" transform="translate(0,0)">
        {/* Background */}
        <rect x="0" y="0" width={svgW} height={svgH} fill="url(#bgGrad)" />

        <defs>
          {/* Background gradient */}
          <linearGradient id="bgGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#050505" />
            <stop offset="100%" stopColor="#0b0b0b" />
          </linearGradient>

          {/* Glow Filters */}
          <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="softAura" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="g" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0.8 1 0 0 0
                      0 0.7 1 0 0
                      0 0 0 1 0"
            />
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Gradients */}
          <linearGradient id="basePulse" x1="0" x2="1">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="100%" stopColor="#00aaff" />
          </linearGradient>
          <linearGradient id="collectorFlow" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffb84a" />
            <stop offset="100%" stopColor="#ff5e00" />
          </linearGradient>
          <linearGradient id="resistorGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff73e0" />
            <stop offset="100%" stopColor="#ffb84a" />
          </linearGradient>
          <radialGradient id="emitterGlow">
            <stop offset="0%" stopColor="#ff3300" stopOpacity="1" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* --- Circuit Layout --- */}
        {/* Collector Resistor + Vcc */}
        <g transform="translate(600,100)">
          <line x1="0" y1="0" x2="0" y2="40" stroke="url(#resistorGrad)" strokeWidth="4" filter="url(#neonGlow)" />
          <rect x="-10" y="40" width="20" height="40" rx="4" fill="#0b0b0b" stroke="#ff73e0" strokeWidth="1.6" />
          <line x1="0" y1="80" x2="0" y2="120" stroke="#ffb84a" strokeWidth="3" filter="url(#softAura)" />
          <text x="20" y="20" fill="#ffb84a" fontSize="11">Rc</text>
          <text x="-6" y="-10" fill="#ffb84a" fontSize="10">+Vcc</text>
        </g>

        {/* Transistor Symbol (NPN) */}
        <g transform="translate(520,220)">
          {/* Collector, Base, Emitter lines */}
          <line x1="80" y1="-100" x2="0" y2="-40" stroke="url(#collectorFlow)" strokeWidth="4" filter="url(#softAura)" />
          <line x1="-100" y1="0" x2="0" y2="-40" stroke="url(#basePulse)" strokeWidth="3" filter="url(#softAura)" />
          <line x1="0" y1="-40" x2="40" y2="80" stroke="#ffae42" strokeWidth="3" filter="url(#neonGlow)" />

          {/* Transistor body */}
          <circle cx="0" cy="-40" r="16" fill="#050505" stroke="#00f0ff" strokeWidth="1.5" filter="url(#softAura)" />
          <path d="M0 -30 L8 -10" stroke="#ffae42" strokeWidth="2" markerEnd="url(#arrowHead)" />

          {/* Labels */}
          <text x="-110" y="4" fill="#00f0ff" fontSize="11">Base</text>
          <text x="86" y="-96" fill="#ffb84a" fontSize="11">Collector</text>
          <text x="44" y="96" fill="#ff5733" fontSize="11">Emitter</text>
        </g>

        {/* Collector Path to Load */}
        <path
          d="M 600 220 L 600 140"
          stroke="url(#collectorFlow)"
          strokeWidth="4"
          strokeLinecap="round"
          filter="url(#softAura)"
        />

        {/* Emitter to Ground */}
        <g transform="translate(560,360)">
          <line x1="0" y1="0" x2="0" y2="30" stroke="#ff3300" strokeWidth="3" filter="url(#neonGlow)" />
          {[0, 6, 12].map((y, i) => (
            <line key={i} x1="-12 + i" y1={30 + y} x2="12" y2={30 + y} stroke="#ff3300" strokeWidth="1.5" opacity={1 - i * 0.2} />
          ))}
          <circle cx="0" cy="0" r="8" fill="url(#emitterGlow)" />
          <text x="16" y="12" fill="#ff6347" fontSize="10">GND</text>
        </g>

        {/* Base Input Path */}
        <path
          d="M 220 220 H 420"
          stroke="url(#basePulse)"
          strokeWidth="3"
          strokeLinecap="round"
          filter="url(#softAura)"
        />

        {/* Base Input Pulse Waveform */}
        <g transform="translate(200,180)">
          <rect x="0" y="0" width="100" height="40" fill="#0a0a0a" stroke="#00f0ff" strokeWidth="0.8" rx="4" />
          <path
            d="M 4 20 L 20 4 L 36 36 L 52 4 L 68 36 L 84 4 L 96 20"
            fill="none"
            stroke="url(#basePulse)"
            strokeWidth="2"
            filter="url(#softAura)"
            style={{
              strokeDasharray: 180,
              strokeDashoffset: 180,
              animation: `pulseWave ${loopSec}s ease-in-out infinite`,
            }}
          />
          <text x="40" y="56" fill="#00f0ff" fontSize="10" textAnchor="middle">Base Input</text>
        </g>

        {/* Collector Output Waveform */}
        <g transform="translate(680,60)">
          <rect x="0" y="0" width="140" height="60" fill="#0a0a0a" stroke="#ffb84a" strokeWidth="0.8" rx="4" />
          <path
            d="M 6 30 L 22 10 L 38 50 L 54 10 L 70 50 L 86 10 L 102 50 L 120 30"
            fill="none"
            stroke="url(#collectorFlow)"
            strokeWidth="2"
            filter="url(#neonGlow)"
            style={{
              strokeDasharray: 260,
              strokeDashoffset: 260,
              animation: `pulseWave ${loopSec / 1.4}s ease-in-out infinite`,
            }}
          />
          <text x="70" y="72" fill="#ffb84a" fontSize="10" textAnchor="middle">Amplified Output</text>
        </g>

        {/* Floating Particle Flows */}
        {Array.from({ length: particleCount }).map((_, i) => {
          const delay = (i / particleCount) * loopSec;
          const size = 2 + (i % 3) * 0.8;
          return (
            <circle
              key={i}
              r={size}
              fill="#ffb84a"
              style={{
                offsetPath: "path('M 600 100 L 600 300')",
                animationName: "transistorFlow",
                animationDuration: `${loopSec}s`,
                animationDelay: `-${delay}s`,
                animationIterationCount: "infinite",
                filter: "url(#neonGlow)",
              }}
            />
          );
        })}

        {/* Readouts */}
        <g transform="translate(40,360)">
          <rect x="0" y="0" width="200" height="90" rx="8" fill="#0a0a0a" stroke="#111" />
          <text x="12" y="20" fill="#00f0ff" fontSize="11">Ib = {(Ib*1000).toFixed(1)} mA</text>
          <text x="12" y="40" fill="#ffb84a" fontSize="11">Ic = {(Ic*1000).toFixed(1)} mA</text>
          <text x="12" y="60" fill="#ffd24a" fontSize="11">β = {β}</text>
          <text x="12" y="80" fill="#ff6347" fontSize="11">Vce = {Vce.toFixed(2)} V</text>
        </g>
      </g>

      {/* --- Animations --- */}
      <style>{`
        @keyframes pulseWave {
          0% { stroke-dashoffset: 180; opacity: 0.6; }
          50% { stroke-dashoffset: 60; opacity: 1; }
          100% { stroke-dashoffset: 180; opacity: 0.6; }
        }

        @keyframes transistorFlow {
          0% { offset-distance: 0%; opacity: 1; transform: scale(1); }
          80% { offset-distance: 90%; opacity: 0.8; transform: scale(0.9); }
          100% { offset-distance: 100%; opacity: 0; transform: scale(0.8); }
        }

       
          .transistorViz { transform: scale(0.8); 
        }
      `}</style>
    </>
  );
})()}
{visual?.symbol === "led" && (() => {
  const amp = Math.max(0.2, visual?.waveform?.amp ?? 1.0);
  const freq = visual?.waveform?.freq ?? 1.5;
  const running = visual?.running ?? true;
  const svgW = 1000;
  const svgH = 360;
  const P_nominal = (visual?.V ?? 5) * amp;

  const transitSec = 4.5 / Math.max(0.2, amp);
  const particleCount = 24 + Math.round(amp * 10);
  const glow = Math.min(3.5, 0.5 + amp * 1.2);

  // Circuit path: Battery → Resistor → LED → Ground
  const path = "M 220 180 H 420 Q 460 180 480 140 H 580 Q 620 180 760 180 L 840 180";

  return (
    <>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width="100%"
        height="auto"
        className="ledCircuitViz"
      >
        <defs>
          {/* === Filters and Glows === */}
          <filter id="neonGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={2.5 * glow} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="softAura" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={1.6 * glow} result="a" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0.7 1 0 0 0
                      0.4 0.8 1 0 0
                      0 0 0 1 0"
            />
            <feMerge>
              <feMergeNode in="a" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* === Gradients === */}
          <linearGradient id="wireGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#00eaff" />
            <stop offset="60%" stopColor="#00ffd5" />
            <stop offset="100%" stopColor="#00bfff" />
          </linearGradient>

          <linearGradient id="resistorGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffaa33" />
            <stop offset="100%" stopColor="#ffcc66" />
          </linearGradient>

          <radialGradient id="ledGlow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#fff7d1" stopOpacity="1" />
            <stop offset="30%" stopColor="#ffee88" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffaa00" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="sparkGrad">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="40%" stopColor="#ffd24a" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background */}
        <rect
          x="0"
          y="0"
          width={svgW}
          height={svgH}
          fill="url(#bgGrad)"
          style={{ fill: "#050505" }}
        />

        {/* Grid overlay */}
        <g opacity="0.04">
          {Array.from({ length: 12 }).map((_, i) => (
            <line
              key={i}
              x1="0"
              y1={i * 30}
              x2={svgW}
              y2={i * 30}
              stroke="#0c0c0c"
            />
          ))}
        </g>

        {/* === Battery Source === */}
        <g transform="translate(180,180)">
          <rect
            x="-60"
            y="-30"
            width="50"
            height="60"
            rx="6"
            fill="#0b0b0b"
            stroke="#ff7300"
            strokeWidth="1.6"
            filter="url(#neonGlow)"
          />
          <rect x="-60" y="-20" width="50" height="12" fill="#ff7300" opacity="0.2" />
          <rect x="-60" y="0" width="50" height="12" fill="#ffb84a" opacity="0.25" />
          <rect x="-60" y="20" width="50" height="12" fill="#fff7d1" opacity="0.25" />
          <text x="-32" y="-42" fill="#ffb84a" fontSize="12" fontWeight="700">
            +
          </text>
          <text x="-36" y="64" fill="#ffdca3" fontSize="10">
            Battery
          </text>
        </g>

        {/* === Wire path with glowing current === */}
        <path
          d={path}
          stroke="url(#wireGrad)"
          strokeWidth="5"
          strokeLinecap="round"
          filter="url(#softAura)"
          style={{ opacity: 0.9 }}
        />

        {/* Current flow particles */}
        {Array.from({ length: particleCount }).map((_, i) => {
          const delay = (i / particleCount) * transitSec;
          const size = 1.8 + (i % 3) * 0.8;
          return (
            <circle
              key={i}
              r={size}
              fill="#00eaff"
              style={{
                offsetPath: `path('${path}')`,
                animation: `flow ${transitSec}s linear ${-delay}s infinite`,
                filter: "url(#neonGlow)",
              }}
            />
          );
        })}

        {/* === Resistor === */}
        <g transform="translate(420,160)">
          <rect
            x="0"
            y="-12"
            width="60"
            height="24"
            rx="6"
            fill="#0b0b0b"
            stroke="#ffaa33"
            strokeWidth="1.2"
            filter="url(#neonGlow)"
          />
          <rect
            x="0"
            y="-12"
            width="60"
            height="24"
            rx="6"
            fill="url(#resistorGrad)"
            opacity={0.4 + amp * 0.3}
          />
          <text x="30" y="36" textAnchor="middle" fill="#ffcc66" fontSize="10">
            Resistor
          </text>
        </g>

        {/* === LED === */}
        <g transform="translate(580,120)">
          <circle
            cx="0"
            cy="60"
            r="26"
            fill="#0b0b0b"
            stroke="#ffaa00"
            strokeWidth="1.4"
            filter="url(#neonGlow)"
          />
          {/* LED internal glow */}
          <circle
            cx="0"
            cy="60"
            r="18"
            fill="url(#ledGlow)"
            opacity={0.3 + amp * 0.4}
            filter="url(#neonGlow)"
          />
          <text
            x="0"
            y="100"
            textAnchor="middle"
            fill="#ffd24a"
            fontSize="10"
          >
            LED
          </text>
        </g>

        {/* LED light emission halo */}
        <circle
          cx="580"
          cy="180"
          r="60"
          fill="url(#ledGlow)"
          opacity="0.3"
          style={{
            animation: `ledPulse ${1 / freq}s ease-in-out infinite`,
          }}
        />

        {/* === Ground Symbol === */}
        <g transform="translate(860,180)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="#9ee6ff" strokeWidth="2" />
          <line x1="-10" y1="10" x2="10" y2="10" stroke="#9ee6ff" strokeWidth="2" />
          <line x1="-6" y1="14" x2="6" y2="14" stroke="#9ee6ff" strokeWidth="2" />
          <line x1="-3" y1="18" x2="3" y2="18" stroke="#9ee6ff" strokeWidth="2" />
          <text x="0" y="36" textAnchor="middle" fill="#9ee6ff" fontSize="10">
            Ground
          </text>
        </g>

        {/* === Data readouts === */}
        <text x="40" y="40" fill="#9aa" fontSize="11">
          Voltage: <tspan fill="#ffd24a">{(visual?.V ?? 5)} V</tspan>
        </text>
        <text x="40" y="60" fill="#9aa" fontSize="11">
          Current: <tspan fill="#00eaff">{amp.toFixed(2)} A</tspan>
        </text>
        <text x="40" y="80" fill="#9aa" fontSize="11">
          Power: <tspan fill="#fff7d1">{P_nominal.toFixed(2)} W</tspan>
        </text>

        {/* === CSS Animations === */}
        <style>{`
          @keyframes flow {
            0% { offset-distance: 0%; opacity: 1; }
            90% { offset-distance: 90%; opacity: 0.8; }
            100% { offset-distance: 100%; opacity: 0; }
          }

          @keyframes ledPulse {
            0% { opacity: 0.2; transform: scale(0.98); }
            50% { opacity: 0.9; transform: scale(1.06); }
            100% { opacity: 0.2; transform: scale(0.98); }
          }

          .ledCircuitViz {
            background: radial-gradient(circle at 50% 50%, #0a0a0a, #050505);
          }

          @media (max-width: 640px) {
            .ledCircuitViz { transform: scale(0.9); transform-origin: top left; }
          }
        `}</style>
      </svg>
    </>
  );
})()}
{visual?.symbol === "scr" && (() => {
  const amp = visual?.waveform?.amp ?? 0.8;
  const freq = visual?.waveform?.freq ?? 3.0;
  const running = visual?.running ?? true;

  const flowDuration = 3 / freq;
  const particleCount = 22;
  const glow = Math.min(3.0, 0.4 + amp * 1.1);

  const wirePath = "M 180 160 H 300 Q 340 120 380 160 H 480 Q 520 200 560 160 H 720";

  return (
    <>
      <g className="scrViz" transform="translate(0,0)">
        <defs>
          {/* === Filters and Glows === */}
          <filter id="neonGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={3 * glow} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="softAura" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={1.5 * glow} result="a" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0.7 1 0 0 0
                      0 0.8 1 0 0
                      0 0 0 1 0"
            />
            <feMerge>
              <feMergeNode in="a" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* === Gradients === */}
          <linearGradient id="acGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="100%" stopColor="#00aaff" />
          </linearGradient>

          <linearGradient id="scrGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff7300" />
            <stop offset="100%" stopColor="#ffb84a" />
          </linearGradient>

          <linearGradient id="gateGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff6aff" />
            <stop offset="100%" stopColor="#ff00ff" />
          </linearGradient>

          <linearGradient id="loadGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#00ffbf" />
            <stop offset="100%" stopColor="#00bfa5" />
          </linearGradient>

          <radialGradient id="sparkGrad">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#ffd24a" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* === Background === */}
        <rect width="1000" height="320" fill="#050505" />
        <g opacity="0.05">
          {Array.from({ length: 10 }).map((_, i) => (
            <line key={i} x1="0" y1={i * 32} x2="1000" y2={i * 32} stroke="#111" />
          ))}
        </g>

        {/* === AC Source === */}
        <g transform="translate(100,160)">
          <circle r="28" fill="#0a0a0a" stroke="#00aaff" strokeWidth="2" filter="url(#neonGlow)" />
          <path
            d="M -16 0 Q -8 -10 0 0 Q 8 10 16 0"
            fill="none"
            stroke="url(#acGrad)"
            strokeWidth="2.6"
            strokeLinecap="round"
            style={{
              strokeDasharray: 50,
              strokeDashoffset: 50,
              animation: `acWave ${flowDuration}s ease-in-out infinite`,
              filter: "url(#neonGlow)",
            }}
          />
          <text x="0" y="48" fill="#00f0ff" fontSize="10" textAnchor="middle">
            AC IN
          </text>
        </g>

        {/* === SCR Device === */}
        <g transform="translate(460,160)" aria-label="SCR Body">
          {/* SCR body */}
          <polygon
            points="-20,-40 20,0 -20,40"
            fill="#0b0b0b"
            stroke="url(#scrGrad)"
            strokeWidth="2"
            filter="url(#neonGlow)"
          />
          {/* conduction arrow */}
          <path
            d="M -12 -24 L 12 0 L -12 24"
            fill="none"
            stroke="#ffb84a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* conduction glow pulse */}
          <circle
            cx="0"
            cy="0"
            r="36"
            fill="none"
            stroke="#ffb84a"
            strokeWidth="2"
            opacity="0.2"
            style={{
              animation: "scrPulse 2.4s ease-in-out infinite",
              filter: "url(#softAura)",
            }}
          />
          {/* labels */}
          <text x="-50" y="-50" fill="#ffb84a" fontSize="10">
            Anode
          </text>
          <text x="42" y="48" fill="#ffb84a" fontSize="10">
            Cathode
          </text>
        </g>

        {/* === Gate Trigger === */}
        <g transform="translate(460,160)">
          <path
            d="M -20 0 L -60 -40"
            stroke="url(#gateGrad)"
            strokeWidth="2"
            strokeLinecap="round"
            style={{
              filter: "url(#neonGlow)",
              strokeDasharray: 80,
              strokeDashoffset: 80,
              animation: `gatePulse ${flowDuration * 1.5}s linear infinite`,
            }}
          />
          <circle cx="-60" cy="-40" r="6" fill="#ff6aff" filter="url(#neonGlow)" />
          <text x="-84" y="-46" fill="#ff6aff" fontSize="10">
            Gate
          </text>
        </g>

        {/* === Load (Resistor/Lamp) === */}
        <g transform="translate(720,140)">
          <rect x="-28" y="0" width="56" height="40" rx="8" fill="#0b0b0b" stroke="#00ffbf" strokeWidth="1.8" />
          <line
            x1="-22"
            y1="20"
            x2="22"
            y2="20"
            stroke="url(#loadGrad)"
            strokeWidth="4"
            filter="url(#neonGlow)"
            opacity="0.8"
          />
          <circle
            cx="0"
            cy="20"
            r="24"
            fill="none"
            stroke="#00ffbf"
            strokeWidth="2"
            style={{
              filter: "url(#neonGlow)",
              animation: "loadRipple 3s ease-in-out infinite",
              opacity: 0.3 + amp * 0.5,
            }}
          />
          <text x="0" y="64" textAnchor="middle" fill="#00ffbf" fontSize="10">
            Load
          </text>
        </g>

        {/* === Conduction Path === */}
        <path
          d={wirePath}
          stroke="#303030"
          strokeWidth="8"
          strokeLinecap="round"
          opacity="0.4"
        />
        <path
          d={wirePath}
          stroke="url(#scrGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          style={{
            filter: "url(#softAura)",
            strokeDasharray: 300,
            strokeDashoffset: 300,
            animation: `scrFlow ${flowDuration}s linear infinite`,
          }}
        />

        {/* === Flowing Particles === */}
        {Array.from({ length: particleCount }).map((_, i) => {
          const delay = (i / particleCount) * flowDuration;
          const size = 2 + (i % 3) * 0.6;
          return (
            <circle
              key={i}
              r={size}
              fill="#ffb84a"
              style={{
                offsetPath: `path('${wirePath}')`,
                animation: `flowDot ${flowDuration}s linear infinite`,
                animationDelay: `-${delay}s`,
                filter: "url(#neonGlow)",
              }}
            />
          );
        })}

        {/* === Labels === */}
        <text x="100" y="100" fill="#00f0ff" fontSize="11">
          AC Input
        </text>
        <text x="420" y="80" fill="#ffb84a" fontSize="11">
          SCR (Controlled Device)
        </text>
        <text x="700" y="110" fill="#00ffbf" fontSize="11">
          Load Output
        </text>
      </g>

      <style>{`
        @keyframes acWave {
          0% { stroke-dashoffset: 50; opacity: 0.6; }
          50% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: -50; opacity: 0.6; }
        }

        @keyframes gatePulse {
          0%, 80% { stroke-dashoffset: 80; opacity: 0.4; }
          85% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 80; opacity: 0.4; }
        }

        @keyframes scrFlow {
          0% { stroke-dashoffset: 300; opacity: 0.3; }
          40% { stroke-dashoffset: 200; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0.3; }
        }

        @keyframes scrPulse {
          0% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
          100% { opacity: 0.15; transform: scale(1); }
        }

        @keyframes loadRipple {
          0% { transform: scale(0.96); opacity: 0.3; }
          50% { transform: scale(1.06); opacity: 0.9; }
          100% { transform: scale(0.96); opacity: 0.3; }
        }

        @keyframes flowDot {
          0% { offset-distance: 0%; opacity: 0.9; }
          95% { offset-distance: 95%; opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }

        .scrViz text {
          font-family: 'Orbitron', sans-serif;
          letter-spacing: 0.5px;
        }

       
          .scrViz { transform: scale(0.85);
        }
      `}</style>
    </>
  );
})()}
{visual?.symbol === "bjt" && (() => {
  // === Config ===
  const freq = 3; // Hz of input signal animation
  const amp = visual?.amp ?? 1.2;
  const beta = visual?.gain ?? 100;
  const Ibase = 0.02 * amp;
  const Icollector = Ibase * beta;
  const running = visual?.running ?? true;

  const transitSec = 4 / Math.max(0.4, amp);
  const svgW = 1000;
  const svgH = 400;
  const glow = 2.4 + amp * 0.5;

  return (
    <>
      <g className="bjtAmpViz" transform="translate(0,0)">
        <defs>
          {/* === Filters and Gradients === */}
          <filter id="neonGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={3 * glow} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="baseGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="100%" stopColor="#00aaff" />
          </linearGradient>
          <linearGradient id="collectorGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffb84a" />
            <stop offset="100%" stopColor="#fff7d1" />
          </linearGradient>
          <linearGradient id="emitterGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff00ff" />
            <stop offset="100%" stopColor="#ff66cc" />
          </linearGradient>

          <radialGradient id="nodeGlow">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="40%" stopColor="#ffd24a" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>

          <filter id="softAura" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={glow * 0.6} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background */}
        <rect x="0" y="0" width={svgW} height={svgH} fill="#050505" />

        {/* Power rails */}
        <line x1="800" y1="60" x2="800" y2="350" stroke="#00bfff" strokeWidth="2" opacity="0.3" />
        <line x1="180" y1="350" x2="820" y2="350" stroke="#00bfff" strokeWidth="1" opacity="0.2" />

        <text x="820" y="65" fill="#00eaff" fontSize="12">+Vcc</text>
        <text x="820" y="365" fill="#00eaff" fontSize="12">GND</text>

        {/* === Transistor symbol === */}
        <g transform="translate(500,200)">
          {/* Transistor body */}
          <circle cx="0" cy="0" r="26" fill="#080808" stroke="#555" strokeWidth="1.4" />
          {/* Base arrow (signal input) */}
          <path
            d="M -40 0 L -10 0"
            stroke="url(#baseGrad)"
            strokeWidth="2.6"
            strokeLinecap="round"
            filter="url(#softAura)"
          />
          {/* Collector line (upward) */}
          <path
            d="M 0 -26 L 0 -70"
            stroke="url(#collectorGrad)"
            strokeWidth="3"
            filter="url(#softAura)"
          />
          {/* Emitter line (downward) */}
          <path
            d="M 0 26 L 0 70"
            stroke="url(#emitterGrad)"
            strokeWidth="2.4"
            filter="url(#softAura)"
          />
          {/* NPN arrow */}
          <path
            d="M -4 20 L 8 32"
            stroke="#ff66cc"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
            filter="url(#softAura)"
          />
          <text x="-56" y="4" fill="#00eaff" fontSize="11">B</text>
          <text x="6" y="-78" fill="#ffb84a" fontSize="11">C</text>
          <text x="6" y="88" fill="#ff00ff" fontSize="11">E</text>
        </g>

        {/* === Input AC source === */}
        <g transform="translate(380,200)">
          <circle cx="0" cy="0" r="18" fill="#060606" stroke="#00f0ff" strokeWidth="1.6" />
          <path
            d="M -10 0 Q -5 -6 0 0 Q 5 6 10 0"
            stroke="#00eaff"
            strokeWidth="2"
            fill="none"
            filter="url(#softAura)"
            style={{
              animation: `acWave ${2 / freq}s linear infinite`,
            }}
          />
          <text x="-16" y="30" fill="#00eaff" fontSize="10">Input</text>
        </g>

        {/* Base connection line */}
        <path d="M 398 200 H 460" stroke="url(#baseGrad)" strokeWidth="2" filter="url(#softAura)" />

        {/* === Collector Load === */}
        <g transform="translate(500,130)">
          <rect x="-8" y="-40" width="16" height="40" rx="3" fill="#0b0b0b" stroke="#ffb84a" />
          <rect
            x="-8"
            y="-40"
            width="16"
            height="40"
            rx="3"
            fill="#ffb84a"
            opacity={0.3 + Math.min(0.6, Ibase * beta * 0.02)}
            filter="url(#neonGlow)"
          />
          <text x="20" y="-10" fill="#ffb84a" fontSize="10">Rc</text>
        </g>

        {/* Load Output Indicator (LED) */}
        <g transform="translate(500,70)">
          <circle
            cx="0"
            cy="-20"
            r="8"
            fill="#ffb84a"
            opacity={0.2 + Math.min(0.8, Ibase * beta * 0.05)}
            filter="url(#neonGlow)"
          />
          <text x="20" y="-16" fill="#ffcc00" fontSize="10">
            Output
          </text>
        </g>

        {/* Emitter connection to ground */}
        <path
          d="M 500 270 L 500 350"
          stroke="url(#emitterGrad)"
          strokeWidth="2.4"
          filter="url(#softAura)"
        />

        {/* === Particle Animations === */}
        {/* Base current particles */}
        {Array.from({ length: 10 }).map((_, i) => {
          const delay = (i / 10) * transitSec;
          return (
            <circle
              key={"b" + i}
              r="2"
              fill="#00eaff"
              style={{
                offsetPath: "path('M 380 200 H 500')",
                animation: `flowBase ${transitSec}s linear infinite`,
                animationDelay: `-${delay}s`,
                filter: "url(#neonGlow)",
              }}
            />
          );
        })}

        {/* Collector current particles (amplified) */}
        {Array.from({ length: 14 }).map((_, i) => {
          const delay = (i / 14) * (transitSec / 1.4);
          return (
            <circle
              key={"c" + i}
              r="3"
              fill="#ffb84a"
              style={{
                offsetPath: "path('M 500 130 L 500 70')",
                animation: `flowCollector ${transitSec / 1.8}s linear infinite`,
                animationDelay: `-${delay}s`,
                filter: "url(#neonGlow)",
              }}
            />
          );
        })}

        {/* Emitter flow return */}
        {Array.from({ length: 8 }).map((_, i) => {
          const delay = (i / 8) * transitSec;
          return (
            <circle
              key={"e" + i}
              r="2"
              fill="#ff00ff"
              style={{
                offsetPath: "path('M 500 270 L 500 350')",
                animation: `flowEmitter ${transitSec}s linear infinite`,
                animationDelay: `-${delay}s`,
                filter: "url(#neonGlow)",
              }}
            />
          );
        })}

        {/* === Live metrics panel === */}
        <g transform="translate(650,100)">
          <rect x="0" y="0" width="180" height="80" rx="8" fill="#0b0b0b" stroke="#111" />
          <text x="12" y="20" fill="#9ee6ff" fontSize="11">I₍base₎ = {(Ibase * 1000).toFixed(1)} mA</text>
          <text x="12" y="38" fill="#ffcc00" fontSize="11">I₍collector₎ = {(Icollector * 1000).toFixed(1)} mA</text>
          <text x="12" y="58" fill="#fff7d1" fontSize="11">β = {beta.toFixed(0)}</text>
        </g>
      </g>

      {/* === Animations === */}
      <style>{`
        @keyframes flowBase {
          0% { offset-distance: 0%; opacity: 1; }
          100% { offset-distance: 100%; opacity: 1; }
        }
        @keyframes flowCollector {
          0% { offset-distance: 0%; opacity: 1; }
          100% { offset-distance: 100%; opacity: 1; }
        }
        @keyframes flowEmitter {
          0% { offset-distance: 0%; opacity: 1; }
          100% { offset-distance: 100%; opacity: 1; }
        }
        @keyframes acWave {
          0% { transform: scaleY(1); opacity: 0.9; }
          50% { transform: scaleY(1.4); opacity: 1; }
          100% { transform: scaleY(1); opacity: 0.9; }
        }
       
          .bjtAmpViz { transform: scale(0.75); 
        }
      `}</style>
    </>
  );
})()}
{visual?.symbol === "opamp" && (() => {
  const amp = visual?.gain ?? 10; // amplification factor
  const freq = visual?.waveform?.freq ?? 1.2; // Hz visual frequency
  const phaseShift = visual?.waveform?.phase ?? Math.PI / 2;
  const running = visual?.running ?? true;

  const loopSec = 6 / freq;
  const glow = 2.4;
  const svgW = 1000, svgH = 480;

  return (
    <>
      <g className="opampViz" transform="translate(0,0)">
        <defs>
          {/* === Filters & Glows === */}
          <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={glow} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={1.5 * glow} result="g" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0.4 1 0 0 0
                      0 0.8 1 0 0
                      0 0 0 1 0"
            />
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* === Gradients === */}
          <linearGradient id="inputCyan" x1="0" x2="1">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="100%" stopColor="#00c2ff" />
          </linearGradient>

          <linearGradient id="outputAmber" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffb84a" />
            <stop offset="100%" stopColor="#ffd24a" />
          </linearGradient>

          <linearGradient id="feedbackMag" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff00ff" />
            <stop offset="100%" stopColor="#ff66ff" />
          </linearGradient>

          <radialGradient id="nodeGlow">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="50%" stopColor="#ffd24a" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* === Background === */}
        <rect width={svgW} height={svgH} fill="url(#bgGrad)" fillOpacity="0.95" />
        <rect width={svgW} height={svgH} fill="#050505" />

        {/* Grid */}
        <g opacity="0.04">
          {Array.from({ length: 14 }).map((_, i) => (
            <line key={i} x1="0" y1={i * 32} x2={svgW} y2={i * 32} stroke="#111" />
          ))}
        </g>

        {/* === Power Rails === */}
        <g>
          <line x1="480" y1="80" x2="480" y2="120" stroke="#ffb84a" strokeWidth="2" />
          <line x1="480" y1="360" x2="480" y2="400" stroke="#00c2ff" strokeWidth="2" />
          <text x="500" y="100" fill="#ffd24a" fontSize="12">V+</text>
          <text x="500" y="380" fill="#00eaff" fontSize="12">V−</text>
        </g>

        {/* === Op-Amp Triangle === */}
        <g transform="translate(480,240)">
          <polygon
            points="0,-80 0,80 160,0"
            fill="#0b0b0b"
            stroke="#666"
            strokeWidth="1.2"
            filter="url(#softGlow)"
          />
          <text x="-18" y="-48" fill="#00eaff" fontSize="12" fontWeight="700">+</text>
          <text x="-18" y="64" fill="#ff4d6d" fontSize="12" fontWeight="700">−</text>
          <text x="170" y="8" fill="#ffd24a" fontSize="12">Vout</text>
        </g>

        {/* === Input Wires === */}
        <g>
          {/* Non-inverting input (+) */}
          <path
            d="M 220 160 H 480"
            stroke="url(#inputCyan)"
            strokeWidth="3"
            strokeLinecap="round"
            filter="url(#neonGlow)"
          />
          {/* Inverting input (−) */}
          <path
            d="M 220 320 H 480"
            stroke="#ff4d6d"
            strokeWidth="3"
            strokeLinecap="round"
            filter="url(#neonGlow)"
          />
        </g>

        {/* === Feedback Path === */}
        <path
          d="M 640 240 H 720 V 320 H 480"
          stroke="url(#feedbackMag)"
          strokeWidth="2.8"
          strokeLinecap="round"
          fill="none"
          filter="url(#neonGlow)"
          style={{
            strokeDasharray: 320,
            strokeDashoffset: 320,
            animation: running ? `feedbackFlow ${loopSec}s linear infinite` : "none",
          }}
        />

        {/* === Output Path === */}
        <path
          d="M 640 240 H 860"
          stroke="url(#outputAmber)"
          strokeWidth="3"
          strokeLinecap="round"
          filter="url(#softGlow)"
        />

        {/* === Input Waveforms (Animated) === */}
        <motion.path
          d="M 220 160 C 260 130 300 190 340 160 C 380 130 420 190 460 160"
          stroke="url(#inputCyan)"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
          animate={{
            pathLength: [0, 1, 0],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: loopSec / 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <motion.path
          d="M 220 320 C 260 350 300 290 340 320 C 380 350 420 290 460 320"
          stroke="#ff4d6d"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          animate={{
            pathLength: [0, 1, 0],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: loopSec / 1.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* === Output Waveform (Amplified) === */}
        <motion.path
          d="M 640 240 C 700 160 760 320 820 240"
          stroke="url(#outputAmber)"
          strokeWidth="2.8"
          fill="none"
          strokeLinecap="round"
          animate={{
            pathLength: [0, 1, 0],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: loopSec,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* === Node Glows === */}
        {[{ x: 220, y: 160 }, { x: 220, y: 320 }, { x: 480, y: 160 },
          { x: 480, y: 320 }, { x: 640, y: 240 }, { x: 860, y: 240 }].map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="5"
            fill="url(#nodeGlow)"
            style={{
              animation: `nodePulse ${1.6 + i * 0.3}s ease-in-out infinite`,
              filter: "url(#neonGlow)",
            }}
          />
        ))}

        {/* === Labels === */}
        <text x="200" y="144" fill="#00f0ff" fontSize="11">V<sub>+</sub></text>
        <text x="200" y="336" fill="#ff4d6d" fontSize="11">V<sub>−</sub></text>
        <text x="840" y="224" fill="#ffd24a" fontSize="11">Amplified Output</text>

      </g>

      {/* === Animations === */}
      <style>{`
        @keyframes feedbackFlow {
          0% { stroke-dashoffset: 320; opacity: 0.6; }
          50% { stroke-dashoffset: 160; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0.6; }
        }

        @keyframes nodePulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.3); opacity: 1; }
        }

        
          .opampViz { transform: scale(0.65); 
        }
      `}</style>
    </>
  );
})()}


{visual?.symbol === "bridge_rectifier" && (() => {
  const freq = visual?.waveform?.freq ?? 2.0;
  const amp = visual?.waveform?.amp ?? 1.0;
  const phase = visual?.waveform?.phase ?? 0;
  const running = visual?.running ?? true;
  const loopSec = Math.max(0.4, 4 / freq); // seconds per loop (safe lower bound)
  const glow = 2.6;
  const svgW = 1000, svgH = 520;

  // convenience for particle counts
  const particleCount = 12;

  return (
    <>
      <g className="bridgeRectifierViz" transform="translate(0,0)">
        <defs>
          {/* FILTERS */}
          <filter id="neonOrange" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={glow} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="cyanGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={glow * 1.4} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="softBloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="gb"/>
            <feMerge>
              <feMergeNode in="gb"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* GRADIENTS */}
          <radialGradient id="diodeOn">
            <stop offset="0%" stopColor="#ffd9a3" stopOpacity="1" />
            <stop offset="50%" stopColor="#ff8a2d" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#6b1200" stopOpacity="0.0" />
          </radialGradient>

          <radialGradient id="diodeOff">
            <stop offset="0%" stopColor="#333" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.0" />
          </radialGradient>

          <linearGradient id="acWaveGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff7a2d" />
            <stop offset="100%" stopColor="#ffbb73" />
          </linearGradient>

          <linearGradient id="dcWaveGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#00ffee" />
            <stop offset="100%" stopColor="#00b8ff" />
          </linearGradient>

          <linearGradient id="pathGlow" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffaa33" />
            <stop offset="100%" stopColor="#ff6600" />
          </linearGradient>

          {/* PATHS WITH IDS for offset-path particles */}
          <path id="acToRectPath" d="M 320 260 H 420" fill="none" />
          <path id="rectToDcPath" d="M 540 260 H 860" fill="none" />
        </defs>

        {/* BACKGROUND */}
        <rect width={svgW} height={svgH} fill="#0a0a0a" />
        {/* faint blueprint/oscilloscope grid */}
        <g opacity="0.06">
          {Array.from({ length: Math.ceil(svgW / 30) }).map((_, i) => (
            <line key={`v-${i}`} x1={i * 30} y1="0" x2={i * 30} y2={svgH} stroke="#111" />
          ))}
          {Array.from({ length: Math.ceil(svgH / 30) }).map((_, i) => (
            <line key={`h-${i}`} x1="0" y1={i * 30} x2={svgW} y2={i * 30} stroke="#111" />
          ))}
        </g>

        {/* OSCILLOSCOPE SCAN LINE */}
        <rect x="60" y="120" width="240" height="180" rx="6" fill="#00000022" stroke="#0000" />
        <motion.rect
          x="60" y="120" width="240" height="4"
          fill="#ffb86b33"
          animate={{ x: [60, 300] }}
          transition={{ duration: loopSec * 2, repeat: Infinity, ease: "linear" }}
          style={{ mixBlendMode: "screen", opacity: 0.25 }}
        />

        {/* LABELS */}
        <text x="160" y="60" fill="#ffb86b" fontSize="14" fontWeight="600" opacity="0.95">AC Input</text>
        <text x="480" y="60" fill="#ffaa33" fontSize="14" fontWeight="700" opacity="0.95">Bridge Rectifier</text>
        <text x="860" y="60" fill="#00eaff" fontSize="14" fontWeight="700" opacity="0.95">DC Output</text>

        {/* AC INPUT SINE (smooth, subtle breathing amplitude via animate) */}
        <motion.path
          d="M 80 260 C 120 160 160 360 200 260 C 240 160 280 360 320 260"
          stroke="url(#acWaveGrad)"
          strokeWidth="3.6"
          fill="none"
          strokeLinecap="round"
          filter="url(#neonOrange)"
          animate={{
            // animate stroke opacity and slight vertical breathing for realism
            opacity: [0.45, 1, 0.45],
            d: [
              "M 80 260 C 120 160 160 360 200 260 C 240 160 280 360 320 260",
              "M 80 260 C 120 150 160 370 200 260 C 240 150 280 370 320 260",
              "M 80 260 C 120 160 160 360 200 260 C 240 160 280 360 320 260"
            ]
          }}
          transition={{ duration: loopSec * 1.1, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* RECTIFIER CORE: diamond of diodes */}
        <g transform="translate(480,260)">
          {/* pulsing rings behind rectifier */}
          <motion.circle
            cx="0" cy="0" r="88" fill="none" stroke="#ff8a3c22" strokeWidth="2"
            animate={{ scale: [1, 1.03, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: loopSec * 1.5, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: 'url(#softBloom)' }}
          />
          <motion.circle
            cx="0" cy="0" r="60" fill="none" stroke="#ffaa3315" strokeWidth="1"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: loopSec * 3.5, repeat: Infinity, ease: "linear" }}
          />

          {/* Diodes: D1 (top), D2 (right), D3 (bottom), D4 (left) */}
          {[
            { id: "D1", x: 0, y: -60, rot: 45, pair: 0 },  // top
            { id: "D2", x: 60, y: 0, rot: -45, pair: 1 },  // right
            { id: "D3", x: 0, y: 60, rot: 225, pair: 0 },  // bottom
            { id: "D4", x: -60, y: 0, rot: 135, pair: 1 }  // left
          ].map((d, i) => {
            // pair 0 and pair 1 alternate conduction each half-cycle
            const pairOffset = d.pair === 0 ? 0 : loopSec / 2;
            return (
              <g key={d.id} transform={`translate(${d.x},${d.y}) rotate(${d.rot})`}>
                {/* diode body */}
                <polygon
                  points="0,-14 26,0 0,14"
                  fill="url(#diodeOff)"
                  stroke="#333"
                  strokeWidth="1.2"
                  style={{
                    // animate conduction with CSS animation; we set duration via loopSec and offset pairOffset
                    animationName: running ? 'diodeConduct' : 'none',
                    animationDuration: `${loopSec}s`,
                    animationTimingFunction: 'linear',
                    animationIterationCount: 'infinite',
                    animationDelay: `${pairOffset}s`,
                    transformOrigin: 'center'
                  }}
                />
                {/* diode stripe */}
                <rect x="26" y="-5" width="6" height="10" fill="#222" rx="1" />
                {/* glowing conduction overlay (separate element so we can animate fill independently) */}
                <polygon
                  points="0,-14 26,0 0,14"
                  fill="url(#diodeOn)"
                  stroke="#ff9a3b"
                  strokeWidth="1.2"
                  style={{
                    mixBlendMode: 'screen',
                    opacity: 0,
                    animationName: running ? 'diodeGlow' : 'none',
                    animationDuration: `${loopSec}s`,
                    animationTimingFunction: 'linear',
                    animationIterationCount: 'infinite',
                    animationDelay: `${pairOffset}s`
                  }}
                />
                {/* small spark at diode tip when conduction begins */}
                <circle
                  cx="30" cy="0" r="2.8"
                  fill="#ffd76b"
                  style={{
                    opacity: 0,
                    filter: 'url(#neonOrange)',
                    animationName: running ? 'diodeSpark' : 'none',
                    animationDuration: `${loopSec}s`,
                    animationTimingFunction: 'linear',
                    animationIterationCount: 'infinite',
                    animationDelay: `${pairOffset}s`
                  }}
                />
              </g>
            );
          })}
        </g>

        {/* AC input path (visual arrow glow) */}
        <motion.path
          d="M 320 260 H 420"
          stroke="url(#pathGlow)"
          strokeWidth="4"
          strokeLinecap="round"
          filter="url(#neonOrange)"
          style={{
            strokeDasharray: 80,
            strokeDashoffset: 80,
            animation: running ? `flowPath ${loopSec}s linear infinite` : 'none'
          }}
        />

        {/* rectifier -> DC path */}
        <motion.path
          d="M 540 260 H 860"
          stroke="url(#dcWaveGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          filter="url(#cyanGlow)"
          style={{
            strokeDasharray: 160,
            strokeDashoffset: 160,
            animation: running ? `flowPathDC ${loopSec}s linear infinite` : 'none'
          }}
        />

        {/* DC rectified waveform (smoothed look) */}
        <motion.path
          d="M 700 260 C 740 210 780 260 820 210 C 860 260 900 260 940 260"
          stroke="url(#dcWaveGrad)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          filter="url(#cyanGlow)"
          animate={{
            opacity: [0.5, 1, 0.5],
            d: [
              "M 700 260 C 740 210 780 260 820 210 C 860 260 900 260 940 260",
              "M 700 260 C 740 200 780 260 820 200 C 860 260 900 260 940 260",
              "M 700 260 C 740 210 780 260 820 210 C 860 260 900 260 940 260",
            ]
          }}
          transition={{ duration: loopSec * 1.0, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* tiny node glows */}
        {[{ x: 320, y: 260 }, { x: 420, y: 260 }, { x: 540, y: 260 }, { x: 860, y: 260 }].map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="6"
            fill="#ffb86b"
            style={{
              opacity: 0.6,
              filter: 'url(#neonOrange)',
              animation: `nodePulse ${loopSec}s ease-in-out ${i * 0.08}s infinite`
            }}
          />
        ))}

        {/* Load / smoothing capacitor */}
        <g transform="translate(900,260)">
          <rect x="0" y="-26" width="10" height="52" rx="2" fill="#00ffee" filter="url(#cyanGlow)" />
          <rect x="18" y="-26" width="10" height="52" rx="2" fill="#00d4ff" filter="url(#cyanGlow)" />
          <text x="-10" y="68" fill="#00eaff" fontSize="11">Load / Filter</text>
        </g>

        {/* PARTICLES moving along AC→Rect path */}
        {Array.from({ length: particleCount }).map((_, i) => {
          const delay = (i / particleCount) * (loopSec * 0.9);
          return (
            <circle
              key={`p-ac-${i}`}
              r="3"
              fill="#ffb86b"
              style={{
                offsetPath: `path('M 320 260 H 420')`,
                animationName: running ? 'particleMove' : 'none',
                animationDuration: `${loopSec * 0.9}s`,
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
                animationDelay: `${-delay}s`,
                filter: 'url(#neonOrange)',
                mixBlendMode: 'screen'
              }}
            />
          );
        })}

        {/* PARTICLES moving along rect->DC */}
        {Array.from({ length: Math.max(8, particleCount * 1.2) }).map((_, i) => {
          const delay = (i / (particleCount * 1.2)) * (loopSec * 0.9);
          return (
            <circle
              key={`p-dc-${i}`}
              r="2.6"
              fill="#00ffee"
              style={{
                offsetPath: `path('M 540 260 H 860')`,
                animationName: running ? 'particleMove' : 'none',
                animationDuration: `${loopSec * 0.9}s`,
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
                animationDelay: `${-delay}s`,
                filter: 'url(#cyanGlow)',
                mixBlendMode: 'screen'
              }}
            />
          );
        })}
      </g>

      {/* ANIMATIONS */}
      <style>{`
        @keyframes diodeConduct {
          /* base polygon (diode body) toggles fill opacity to simulate conduction */
          0% { opacity: 1; transform: translateY(0); }
          49% { opacity: 1; transform: translateY(0); }
          50% { opacity: 0.28; transform: translateY(0); }
          100% { opacity: 0.28; transform: translateY(0); }
        }
        @keyframes diodeGlow {
          0% { opacity: 0; transform: scale(0.98); }
          10% { opacity: 1; transform: scale(1.02); }
          40% { opacity: 0.9; transform: scale(1.0); }
          60% { opacity: 0.0; transform: scale(0.98); }
          100% { opacity: 0; transform: scale(0.98); }
        }
        @keyframes diodeSpark {
          0% { opacity: 0; transform: scale(0.6) translateX(0); }
          8% { opacity: 1; transform: scale(1.2) translateX(1px); }
          20% { opacity: 0.4; transform: scale(0.7) translateX(2px); }
          100% { opacity: 0; transform: scale(0.6) translateX(4px); }
        }

        @keyframes flowPath {
          0% { stroke-dashoffset: 80; opacity: 0.6; }
          50% { stroke-dashoffset: 40; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0.6; }
        }

        @keyframes flowPathDC {
          0% { stroke-dashoffset: 160; opacity: 0.8; }
          50% { stroke-dashoffset: 80; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0.8; }
        }

        @keyframes nodePulse {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.35); opacity: 1; }
          100% { transform: scale(1); opacity: 0.6; }
        }

        @keyframes particleMove {
          0% { offset-distance: 0%; opacity: 0.9; transform: scale(1); }
          80% { opacity: 1; transform: scale(1.1); }
          100% { offset-distance: 100%; opacity: 0; transform: scale(0.8); }
        }

        /* alternate conduction: pair 0 (D1+D3) active first half, pair 1 (D2+D4) second half.
           diodeGlow/diodeSpark animations use animationDelay inlined to stagger */
        .bridgeRectifierViz { transform-origin: 0 0; transform: scale(0.72); }

      
          .bridgeRectifierViz { transform: scale(0.7); 
        }
      `}</style>
    </>
  );
})()}
{visual?.symbol === "transformer" && (() => {
  const freq = visual?.waveform?.freq ?? 2.0; // Hz AC input
  const amp = visual?.waveform?.amp ?? 1.0;
  const running = visual?.running ?? true;
  const loopSec = 4 / freq;
  const glow = 2.6;
  const svgW = 1000, svgH = 520;

  const particleCount = 12;

  return (
    <>
      <g className="transformerViz" transform="translate(0,0)">
        <defs>
          {/* GLOW FILTERS */}
          <filter id="neonGlowCyan" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={glow} result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="neonGlowPurple" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={glow * 1.2} result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* GRADIENTS */}
          <linearGradient id="primaryWireGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#00ffee"/>
            <stop offset="100%" stopColor="#0099ff"/>
          </linearGradient>

          <linearGradient id="secondaryWireGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff77ff"/>
            <stop offset="100%" stopColor="#ff33aa"/>
          </linearGradient>

          <linearGradient id="acWaveGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#00ffff"/>
            <stop offset="100%" stopColor="#00b8ff"/>
          </linearGradient>

          <linearGradient id="dcWaveGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffcc66"/>
            <stop offset="100%" stopColor="#ffaa33"/>
          </linearGradient>

          {/* PATHS FOR PARTICLE OFFSET */}
          <path id="primaryPath" d="M 120 260 H 380" fill="none"/>
          <path id="secondaryPath" d="M 620 260 H 880" fill="none"/>
        </defs>

        {/* BACKGROUND */}
        <rect width={svgW} height={svgH} fill="#0a0a0a" />
        {/* Grid overlay */}
        <g opacity="0.05">
          {Array.from({ length: Math.ceil(svgW / 30) }).map((_, i) => (
            <line key={`v-${i}`} x1={i*30} y1="0" x2={i*30} y2={svgH} stroke="#111"/>
          ))}
          {Array.from({ length: Math.ceil(svgH / 30) }).map((_, i) => (
            <line key={`h-${i}`} x1="0" y1={i*30} x2={svgW} y2={i*30} stroke="#111"/>
          ))}
        </g>

        {/* LABELS */}
        <text x="160" y="60" fill="#00eaff" fontSize="14" fontWeight="600" opacity="0.95">AC Input</text>
        <text x="500" y="60" fill="#ff77ff" fontSize="14" fontWeight="700" opacity="0.95">Transformer</text>
        <text x="800" y="60" fill="#ffbb33" fontSize="14" fontWeight="600" opacity="0.95">AC Output</text>

        {/* PRIMARY WINDINGS */}
        <g transform="translate(380,260)">
          {/* coil representation */}
          {Array.from({ length: 8 }).map((_, i) => (
            <ellipse key={`pri-${i}`} cx={0} cy={i*6-21} rx={18} ry={5} fill="url(#primaryWireGrad)" stroke="#00eaff" strokeWidth="1.2" filter="url(#neonGlowCyan)"/>
          ))}
          {/* magnetic aura */}
          <motion.circle
            cx="0" cy="0" r="60" fill="none" stroke="#00ffee33" strokeWidth="3"
            animate={{ scale: [1,1.05,1], opacity:[0.4,0.8,0.4] }}
            transition={{ duration: loopSec*2, repeat: Infinity, ease:"easeInOut" }}
            style={{ filter:'url(#neonGlowCyan)' }}
          />
        </g>

        {/* SECONDARY WINDINGS */}
        <g transform="translate(620,260)">
          {Array.from({ length: 8 }).map((_, i) => (
            <ellipse key={`sec-${i}`} cx={0} cy={i*6-21} rx={18} ry={5} fill="url(#secondaryWireGrad)" stroke="#ff66ff" strokeWidth="1.2" filter="url(#neonGlowPurple)"/>
          ))}
          {/* magnetic aura */}
          <motion.circle
            cx="0" cy="0" r="60" fill="none" stroke="#ff77ff22" strokeWidth="3"
            animate={{ scale: [1,1.04,1], opacity:[0.3,0.7,0.3] }}
            transition={{ duration: loopSec*2.2, repeat: Infinity, ease:"easeInOut" }}
            style={{ filter:'url(#neonGlowPurple)' }}
          />
        </g>

        {/* AC INPUT WAVEFORM */}
        <motion.path
          d="M 80 260 C 120 180 160 340 200 260 C 240 180 280 340 320 260"
          stroke="url(#acWaveGrad)" strokeWidth="3" fill="none" strokeLinecap="round"
          filter="url(#neonGlowCyan)"
          animate={{ pathLength:[0,1,0], opacity:[0.4,1,0.4] }}
          transition={{ duration: loopSec*1.2, repeat: Infinity, ease:"easeInOut" }}
        />

        {/* OUTPUT AC WAVEFORM */}
        <motion.path
          d="M 680 260 C 720 200 760 320 800 260 C 840 200 880 320 920 260"
          stroke="url(#dcWaveGrad)" strokeWidth="3" fill="none" strokeLinecap="round"
          filter="url(#neonGlowPurple)"
          animate={{ pathLength:[0,1,0], opacity:[0.4,1,0.4] }}
          transition={{ duration: loopSec*1.2, repeat: Infinity, ease:"easeInOut" }}
        />

        {/* PRIMARY PATH PARTICLES */}
        {Array.from({ length: particleCount }).map((_, i) => {
          const delay = (i/particleCount) * loopSec;
          return (
            <circle key={`p-pri-${i}`} r="3" fill="#00ffee"
              style={{
                offsetPath: "path('M 120 260 H 380')",
                animationName: running ? 'particleMove' : 'none',
                animationDuration: `${loopSec}s`,
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
                animationDelay: `-${delay}s`,
                filter:'url(#neonGlowCyan)', mixBlendMode:'screen'
              }}
            />
          );
        })}

        {/* SECONDARY PATH PARTICLES */}
        {Array.from({ length: particleCount }).map((_, i) => {
          const delay = (i/particleCount) * loopSec;
          return (
            <circle key={`p-sec-${i}`} r="2.6" fill="#ff77ff"
              style={{
                offsetPath: "path('M 620 260 H 880')",
                animationName: running ? 'particleMove' : 'none',
                animationDuration: `${loopSec}s`,
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
                animationDelay: `-${delay}s`,
                filter:'url(#neonGlowPurple)', mixBlendMode:'screen'
              }}
            />
          );
        })}
      </g>

      <style>{`
        @keyframes particleMove {
          0% { offset-distance:0%; opacity:0.8; transform:scale(1); }
          80% { opacity:1; transform:scale(1.1); }
          100% { offset-distance:100%; opacity:0; transform:scale(0.8); }
        }
        .transformerViz { transform-origin:0 0; transform: scale(0.72); }
        @media (max-width:640px){ .transformerViz{ transform: scale(0.5); } }
      `}</style>
    </>
  );
})()}



{visual?.symbol === "rl_circuit" && (() => {
  const freq = visual?.waveform?.freq ?? 2.0;
  const amp = visual?.waveform?.amp ?? 1.0;
  const running = visual?.running ?? true;
  const loopSec = 4 / freq;
  const glow = 2.5;
  const svgW = 1000, svgH = 520;
  const particleCount = 12;

  return (
    <>
      <g className="rlCircuitViz" transform="translate(0,0)">
        <defs>
          {/* Filters for glows */}
          <filter id="neonOrange" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={glow} result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="neonCyan" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={glow*1.2} result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="neonPurple" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={glow*1.2} result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Gradients */}
          <linearGradient id="acWaveGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff7a2d"/>
            <stop offset="100%" stopColor="#ffb86b"/>
          </linearGradient>
          <linearGradient id="wireGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#00ffee"/>
            <stop offset="100%" stopColor="#00c4ff"/>
          </linearGradient>
          <linearGradient id="resistorGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#00ffee"/>
            <stop offset="100%" stopColor="#0099ff"/>
          </linearGradient>
          <linearGradient id="inductorGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff77ff"/>
            <stop offset="100%" stopColor="#ff33aa"/>
          </linearGradient>
        </defs>

        {/* Background */}
        <rect width={svgW} height={svgH} fill="#0a0a0a" />
        <g opacity="0.05">
          {Array.from({ length: Math.ceil(svgW/30) }).map((_, i) => (
            <line key={`v-${i}`} x1={i*30} y1="0" x2={i*30} y2={svgH} stroke="#111"/>
          ))}
          {Array.from({ length: Math.ceil(svgH/30) }).map((_, i) => (
            <line key={`h-${i}`} x1="0" y1={i*30} x2={svgW} y2={i*30} stroke="#111"/>
          ))}
        </g>

        {/* Labels */}
        <text x="120" y="60" fill="#ffb86b" fontSize="14" fontWeight="600">AC Input</text>
        <text x="440" y="60" fill="#00eaff" fontSize="14" fontWeight="600">Resistor (R)</text>
        <text x="660" y="60" fill="#ff77ff" fontSize="14" fontWeight="600">Inductor (L)</text>
        <text x="900" y="60" fill="#00ffee" fontSize="14" fontWeight="600">Output AC</text>

        {/* AC Input Wave */}
        <motion.path
          d="M 80 260 C 120 180 160 340 200 260 C 240 180 280 340 320 260"
          stroke="url(#acWaveGrad)" strokeWidth="3" fill="none" strokeLinecap="round"
          filter="url(#neonOrange)"
          animate={{ pathLength:[0,1,0], opacity:[0.4,1,0.4] }}
          transition={{ duration: loopSec*1.2, repeat: Infinity, ease:"easeInOut" }}
        />

        {/* Wires */}
        <line x1="320" y1="260" x2="400" y2="260" stroke="url(#wireGrad)" strokeWidth="3" filter="url(#neonCyan)"/>
        <line x1="560" y1="260" x2="640" y2="260" stroke="url(#wireGrad)" strokeWidth="3" filter="url(#neonCyan)"/>
        <line x1="760" y1="260" x2="840" y2="260" stroke="url(#wireGrad)" strokeWidth="3" filter="url(#neonCyan)"/>

        {/* Resistor */}
        <g transform="translate(400,260)">
          <rect x="-20" y="-10" width="40" height="20" fill="url(#resistorGrad)" stroke="#00eaff" strokeWidth="1.2" filter="url(#neonCyan)"/>
        </g>

        {/* Inductor */}
        <g transform="translate(640,260)">
          {Array.from({ length: 6 }).map((_, i) => (
            <ellipse key={`coil-${i}`} cx={i*12-30} cy="0" rx="8" ry="10" fill="url(#inductorGrad)" stroke="#ff66ff" strokeWidth="1.2" filter="url(#neonPurple)"/>
          ))}
          {/* Magnetic aura */}
          <motion.circle
            cx="0" cy="0" r="20" fill="none" stroke="#ff77ff33" strokeWidth="2"
            animate={{ scale:[1,1.1,1], opacity:[0.3,0.7,0.3] }}
            transition={{ duration: loopSec*2, repeat: Infinity, ease:"easeInOut" }}
            style={{ filter:'url(#neonPurple)' }}
          />
        </g>

        {/* Output AC Wave */}
        <motion.path
          d="M 840 260 C 880 200 920 320 960 260"
          stroke="url(#wireGrad)" strokeWidth="3" fill="none" strokeLinecap="round"
          filter="url(#neonCyan)"
          animate={{ pathLength:[0,1,0], opacity:[0.4,1,0.4] }}
          transition={{ duration: loopSec*1.2, repeat: Infinity, ease:"easeInOut" }}
        />

        {/* Particles along wires */}
        {Array.from({ length: particleCount }).map((_, i) => {
          const delay = (i/particleCount)*loopSec;
          return (
            <circle key={`particle-${i}`} r="3" fill="#00ffee"
              style={{
                offsetPath:"path('M 320 260 H 400')",
                animationName: running?'particleMove':'none',
                animationDuration:`${loopSec}s`,
                animationTimingFunction:'linear',
                animationIterationCount:'infinite',
                animationDelay:`-${delay}s`,
                filter:'url(#neonCyan)', mixBlendMode:'screen'
              }}
            />
          );
        })}
        {Array.from({ length: particleCount }).map((_, i) => {
          const delay = (i/particleCount)*loopSec;
          return (
            <circle key={`particle2-${i}`} r="3" fill="#ff77ff"
              style={{
                offsetPath:"path('M 560 260 H 640')",
                animationName: running?'particleMove':'none',
                animationDuration:`${loopSec}s`,
                animationTimingFunction:'linear',
                animationIterationCount:'infinite',
                animationDelay:`-${delay}s`,
                filter:'url(#neonPurple)', mixBlendMode:'screen'
              }}
            />
          );
        })}
      </g>

      <style>{`
        @keyframes particleMove {
          0% { offset-distance:0%; opacity:0.8; transform:scale(1); }
          80% { opacity:1; transform:scale(1.1); }
          100% { offset-distance:100%; opacity:0; transform:scale(0.8); }
        }
        .rlCircuitViz { transform-origin:0 0; transform: scale(0.72); }
        @media (max-width:640px){ .rlCircuitViz{ transform: scale(0.5); } }
      `}</style>
    </>
  );
})()}



{visual?.symbol === "diode" && (() => {
  const amp = visual?.waveform?.amp ?? 0.9;
  const freq = visual?.waveform?.freq ?? 2.4;
  const running = visual?.running ?? true;
  const svgW = 1000, svgH = 340;

  const wirePath = "M 220 180 H 400 Q 440 180 480 140 L 540 180 H 740";
  const particleCount = 24;
  const transitSec = 3.5 / Math.max(0.3, amp);

  return (
    <>
      <g className="diodeViz" transform="translate(0,0)">
        <defs>
          {/* === Glow Filters === */}
          <filter id="neonGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="softAura" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="glow" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0.7 1 0 0 0
                      0 0.9 1 0 0
                      0 0 0 1 0"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* === Gradients === */}
          <linearGradient id="acLine" x1="0" x2="1">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="100%" stopColor="#00aaff" />
          </linearGradient>
          <linearGradient id="forwardFlow" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffb84a" />
            <stop offset="100%" stopColor="#ffd24a" />
          </linearGradient>
          <linearGradient id="blockedFlow" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff0066" />
            <stop offset="100%" stopColor="#ff3366" />
          </linearGradient>
          <radialGradient id="sparkGrad">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="50%" stopColor="#ffd24a" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* === Background === */}
        <rect x="0" y="0" width={svgW} height={svgH} fill="url(#bgGrad)" />
        <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#040404" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </linearGradient>

        {/* Subtle grid */}
        <g opacity="0.06">
          {Array.from({ length: 10 }).map((_, i) => (
            <line
              key={i}
              x1="0"
              y1={i * 32}
              x2={svgW}
              y2={i * 32}
              stroke="#0f1a1a"
            />
          ))}
        </g>

        {/* === AC Source === */}
        <g transform="translate(160,180)">
          <circle r="36" fill="#000" stroke="#00f0ff" strokeWidth="2" filter="url(#softAura)" />
          <path
            d="M -20 0 Q -10 -18 0 0 T 20 0"
            stroke="url(#acLine)"
            strokeWidth="2.5"
            fill="none"
            filter="url(#neonGlow)"
            style={{
              strokeDasharray: 80,
              strokeDashoffset: 80,
              animation: `acWave ${3 / freq}s linear infinite`,
            }}
          />
          <text
            x="0"
            y="56"
            fill="#00f0ff"
            fontSize="11"
            textAnchor="middle"
          >
            AC Source
          </text>
        </g>

        {/* === Wire Path === */}
        <path
          d={wirePath}
          stroke="url(#acLine)"
          strokeWidth="5"
          strokeLinecap="round"
          filter="url(#softAura)"
        />

        {/* === Diode Symbol === */}
        <g transform="translate(520,180)" className="diodeSymbol">
          <polygon
            points="-30,-20 0,0 -30,20"
            fill="url(#forwardFlow)"
            stroke="#ffb84a"
            strokeWidth="2"
            filter="url(#neonGlow)"
          />
          <rect
            x="0"
            y="-20"
            width="4"
            height="40"
            fill="#ffb84a"
            filter="url(#neonGlow)"
          />
          <text
            x="-14"
            y="50"
            fill="#ffd24a"
            fontSize="11"
            textAnchor="middle"
          >
            Diode
          </text>
        </g>

        {/* === Current Flow (Particles + Directional Arrows) === */}
        {Array.from({ length: particleCount }).map((_, i) => {
          const delay = (i / particleCount) * transitSec;
          const size = 2 + (i % 3) * 0.8;
          return (
            <circle
              key={i}
              r={size}
              fill="#ffb84a"
              style={{
                offsetPath: `path('${wirePath}')`,
                animationName: "forwardFlow",
                animationDuration: `${transitSec}s`,
                animationTimingFunction: "linear",
                animationDelay: `-${delay}s`,
                animationIterationCount: "infinite",
                filter: "url(#neonGlow)",
              }}
            />
          );
        })}

        {/* === Output (Rectified waveform) === */}
        <g transform="translate(760,120)">
          <rect x="0" y="0" width="220" height="100" rx="10" fill="#070707" stroke="#222" />
          {/* rectified waveform */}
          <path
            d="M10 70 Q 30 10 50 70 Q 70 10 90 70 Q 110 10 130 70"
            stroke="#ffd24a"
            strokeWidth="2"
            fill="none"
            filter="url(#neonGlow)"
            style={{
              strokeDasharray: 240,
              strokeDashoffset: 240,
              animation: `rectifiedWave ${3 / freq}s linear infinite`,
            }}
          />
          <text x="20" y="92" fill="#ffd24a" fontSize="10">
            Rectified Output
          </text>
        </g>

        {/* === Spark pulses at diode junction === */}
        <circle cx="540" cy="180" r="3" fill="url(#sparkGrad)">
          <animate
            attributeName="r"
            values="2;6;2"
            dur="2.8s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.4;0.9;0.4"
            dur="2.8s"
            repeatCount="indefinite"
          />
        </circle>

        {/* === Tooltip on hover === */}
        <g className="hoverInfo" transform="translate(400,60)">
          <rect x="0" y="0" width="320" height="36" rx="8" fill="#0b0b0b" stroke="#111" />
          <text x="12" y="24" fill="#9ee6ff" fontSize="12">
            Diode allows current only in one direction — converting AC to pulsating DC.
          </text>
        </g>
      </g>

      <style>{`
        @keyframes acWave {
          0% { stroke-dashoffset: 80; }
          100% { stroke-dashoffset: 0; }
        }

        @keyframes forwardFlow {
          0% { offset-distance: 0%; opacity: 0.9; }
          90% { offset-distance: 90%; opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }

        @keyframes rectifiedWave {
          0% { stroke-dashoffset: 240; opacity: 0.6; }
          50% { stroke-dashoffset: 120; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0.6; }
        }

        .diodeSymbol:hover polygon {
          fill: #ff3366;
          transition: fill 0.4s ease-in-out;
        }

        .diodeSymbol:hover ~ .hoverInfo text {
          fill: #ff80ff;
        }

      
       .diodeViz { transform: scale(0.6); transform-origin: top left; }
        
      `}</style>
    </>
  );
})()}

{visual?.symbol === "power_meter" && (() => {
  // local defaults (will be overridden if visual provides values)
  const V_base = (visual?.voltage?.amp ?? visual?.V ?? 1.0); // RMS-ish
  const I_base = (visual?.current?.amp ?? visual?.I ?? 0.6);
  // waveform & timing (can be adjusted via visual props)
  const freq = visual?.waveform?.freq ?? 1.6; // Hz for illustrative animation
  const loopSec = 6; // full loop time (rise/steady/decay phases mapped into this)
  // instantaneous animation uses CSS keyframes/time; actual numeric readout is simulated with a CSS-driven counter (SVG text + stroke-dash trick)
  // compute a nominal power for initial readout:
  const P_nominal = Math.max(0, V_base * I_base);

  return (
    <>
      <g className="powerMeterGroup" transform="translate(108,88)">
        <defs>
          {/* neon glows, gradients, filters */}
          <linearGradient id="vGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#00bfff" />
            <stop offset="100%" stopColor="#00eaff" />
          </linearGradient>

          <linearGradient id="iGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff9f43" />
            <stop offset="100%" stopColor="#ffcc00" />
          </linearGradient>

          <linearGradient id="pGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffcc00" />
            <stop offset="100%" stopColor="#ff8800" />
          </linearGradient>

          <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="depthShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feOffset dx="0" dy="6" />
            <feGaussianBlur stdDeviation="8" result="o" />
            <feMerge>
              <feMergeNode in="o" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <radialGradient id="hubGlow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#ffecb3" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#ffb84a" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ff7a2d" stopOpacity="0.08" />
          </radialGradient>

          {/* path used for moving particles along the circuit */}
          <path id="currentPath" d="M 120 48 Q 170 10 240 48 T 360 48" fill="none" stroke="transparent" />

          {/* a stylized battery / voltage source on the left */}
          <radialGradient id="batteryGrad" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#001f2f" />
            <stop offset="70%" stopColor="#021a2a" />
          </radialGradient>

        </defs>

        {/* panel background (dark sci-fi plate) */}
        <rect x="0" y="0" width="440" height="200" rx="14"
          fill="url(#batteryGrad)"
          style={{ fill: 'url(#batteryGrad)' }} />

        {/* left: Voltage Source */}
        <g className="voltageGroup" transform="translate(20,28)" aria-label="Voltage Source (V)">
          <title>Voltage Source (V) — pulsating potential</title>
          <g filter="url(#softGlow)">
            <rect x="0" y="0" width="92" height="96" rx="10" fill="#060607" stroke="#0b1b2b" strokeWidth="1.5" />
            {/* battery terminals / decorative */}
            <rect x="12" y="12" width="68" height="20" rx="6" fill="url(#vGrad)" opacity="0.16" />
            <text x="46" y="56" fontSize="12" fill="#00eaff" textAnchor="middle" style={{ fontWeight: 700 }}>V</text>
            {/* animated sine-squared pulses (visual only) */}
            <g transform="translate(12,72)">
              <rect x="0" y="-6" width="68" height="12" rx="6" fill="#020406" />
              <path d="M2 0 Q 18 -10 34 0 T 66 0" fill="none" stroke="url(#vGrad)" strokeWidth="3" strokeLinecap="round"
                style={{ filter: 'url(#softGlow)', opacity: 0.95, strokeDasharray: 140, strokeDashoffset: 140, animation: `vWave ${loopSec / 2}s ease-in-out infinite` }} />
            </g>
          </g>

          {/* small label */}
          <text x="46" y="104" fontSize="10" fill="#9aa" textAnchor="middle">Voltage Source</text>
        </g>

        {/* right-ish: Resistive load / device that shows glow depending on P */}
        <g className="loadDevice" transform="translate(320,36)" aria-label="Load (Device) — consumes power">
          <title>Load (P) — device brightness responds to instantaneous power</title>
          {/* bulb-like device */}
          <g filter="url(#softGlow)">
            <ellipse cx="52" cy="44" rx="36" ry="28" fill="#070707" stroke="#222" strokeWidth="1.6" />
            <ellipse cx="52" cy="44" rx="24" ry="18" fill="url(#hubGlow)" opacity="0.35" className="deviceGlow" />
            <rect x="40" y="66" width="24" height="10" rx="3" fill="#0b0b0b" />
            {/* filament or indicator */}
            <path d="M 38 44 q 8 -12 28 0" stroke="#ffcc00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'url(#softGlow)', opacity: 0.9 }} />
          </g>

          {/* dynamic label and small readout */}
          <text x="52" y="100" fontSize="10" fill="#ffd24a" textAnchor="middle">Device</text>

          {/* power glow ring (animated intensity) */}
          <circle cx="52" cy="44" r="44" fill="none" stroke="url(#pGrad)" strokeWidth="2.2"
            style={{ filter: 'url(#softGlow)', opacity: 0.18, animation: `pPulse ${loopSec}s linear infinite` }} />
        </g>

        {/* central circuit path with moving electrons */}
        <g transform="translate(0,0)" className="circuitGroup" aria-hidden="false">
          {/* metallic connector baseline */}
          <path d="M 100 48 Q 140 20 200 48 T 300 48" stroke="#202226" strokeWidth="8" strokeLinecap="round" />

          {/* glowing overlay of current path */}
          <path d="M 120 48 Q 170 10 240 48 T 360 48" stroke="#ff9f43" strokeWidth="3.2" strokeLinecap="round"
            style={{ stroke: 'url(#iGrad)', filter: 'url(#softGlow)', mixBlendMode: 'screen', opacity: 0.95 }} />

          {/* arrow indicators along path */}
          {[0, 80, 160, 240].map((x, idx) => (
            <g key={idx} transform={`translate(${108 + x}, 44)`} style={{ opacity: 0.9, filter: 'url(#softGlow)' }}>
              <path d="M -8 -6 L 6 0 L -8 6 Z" fill="#ff9f43" style={{ transformOrigin: 'center', animation: `arrowPulse ${loopSec / 2}s ease-in-out ${idx * 0.15}s infinite` }} />
            </g>
          ))}

          {/* moving electron particles — use offset-path along #currentPath */}
          {Array.from({ length: 14 }).map((_, i) => {
            const delay = (i / 14) * loopSec;
            const size = 2 + (i % 3) * 0.8;
            return (
              <circle
                key={i}
                r={size}
                fill="#00eaff"
                style={{
                  offsetPath: "path('M 120 48 Q 170 10 240 48 T 360 48')",
                  animationName: 'elecFlow',
                  animationDuration: `${loopSec}s`,
                  animationTimingFunction: 'linear',
                  animationDelay: `-${delay}s`,
                  animationIterationCount: 'infinite',
                  transformOrigin: '0 0',
                  filter: 'url(#softGlow)'
                }}
              />
            );
          })}
        </g>

        {/* digital power meter / gauge (center-bottom) */}
        <g transform="translate(120,118)" className="powerMeter" aria-label="Power Meter (P = VI)">
          <title>Power (P = V × I) — live wattage</title>

          {/* rectangular readout */}
          <rect x="0" y="0" width="200" height="66" rx="8" fill="#050505" stroke="#111" />

          {/* animated gauge bar background */}
          <rect x="12" y="42" width="176" height="8" rx="4" fill="#0b0b0b" opacity="0.6" />
          <rect x="12" y="42" width={`${Math.min(176, (P_nominal / (V_base * Math.max(I_base, 0.01))) * 176)}`} height="8" rx="4" fill="url(#pGrad)" style={{ filter: 'url(#softGlow)', transition: 'width 300ms linear' }} />

          {/* numeric readout (animated visually) */}
          <text x="14" y="18" fontSize="12" fill="#9aa">P = V × I</text>
          <text x="14" y="40" fontSize="18" fill="#ffcc00" fontWeight="700" className="powerValue" style={{ filter: 'url(#softGlow)' }}>
            {/* show a dynamic-looking value; a real implementation should bind to state and update per-frame */}
            {P_nominal.toFixed(2)} W
          </text>

          {/* small instantaneous spark/glyph */}
          <g transform="translate(168,10)">
            <path d="M4 0 L8 10 L0 6 L10 6 Z" fill="#ffcc00" style={{ filter: 'url(#softGlow)', opacity: 0.95, transformOrigin: 'center', animation: `sparkPulse ${loopSec / 3}s ease-in-out infinite` }} />
          </g>
        </g>

        {/* instantaneous power waveform overlay (right of meter) */}
        <g transform="translate(330,120)">
          <rect x="0" y="0" width="96" height="66" rx="6" fill="#070707" stroke="#111" />
          <path
            d="M6 50 C 18 10 30 40 42 20 C 54 4 66 40 88 28"
            fill="none"
            stroke="#ffcc00"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ filter: 'url(#softGlow)', strokeDasharray: 220, strokeDashoffset: 220, animation: `pWave ${loopSec / 1.2}s linear infinite` }}
          />
        </g>

        {/* hover labels (appear on hover of groups via CSS) */}
        <g className="hoverLabels" transform="translate(12,170)">
          <text className="labelV" x="0" y="0" fontSize="10" fill="#00bfff" style={{ opacity: 0 }}>Voltage Source (V) — potential difference</text>
          <text className="labelI" x="160" y="0" fontSize="10" fill="#ff9f43" style={{ opacity: 0 }}>Current (I) — flow of electrons</text>
          <text className="labelP" x="320" y="0" fontSize="10" fill="#ffcc00" style={{ opacity: 0 }}>Power (P) = V × I — energy rate</text>
        </g>
      </g>

      {/* CSS animations & hover interactions */}
      <style>{`
        /* core loop timing */
        @keyframes vWave {
          0% { stroke-dashoffset: 140; opacity: 0.6; transform: translateY(0); }
          25% { stroke-dashoffset: 90; opacity: 1; transform: translateY(-2px); }
          50% { stroke-dashoffset: 40; opacity: 1; transform: translateY(0); }
          75% { stroke-dashoffset: 10; opacity: 0.9; transform: translateY(2px); }
          100% { stroke-dashoffset: 140; opacity: 0.6; transform: translateY(0); }
        }

        @keyframes elecFlow {
          0% { offset-distance: 0%; opacity: 0.95; transform: scale(1); }
          35% { offset-distance: 35%; opacity: 1; transform: scale(1.1); }
          65% { offset-distance: 65%; opacity: 0.9; transform: scale(0.95); }
          90% { offset-distance: 90%; opacity: 0.7; transform: scale(0.85); }
          100% { offset-distance: 100%; opacity: 0; transform: scale(0.7); }
        }

        @keyframes arrowPulse {
          0% { transform: translateY(0) scale(1); opacity: 0.9; }
          50% { transform: translateY(-3px) scale(1.08); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 0.9; }
        }

        @keyframes pPulse {
          0% { opacity: 0.14; transform: scale(0.96); }
          35% { opacity: 0.36; transform: scale(1.06); }
          60% { opacity: 0.9; transform: scale(1.12); }
          100% { opacity: 0.14; transform: scale(0.96); }
        }

        @keyframes pWave {
          0% { stroke-dashoffset: 220; opacity: 0.6; }
          30% { stroke-dashoffset: 120; opacity: 1; }
          60% { stroke-dashoffset: 40; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0.6; }
        }

        @keyframes sparkPulse {
          0% { transform: scale(0.8); opacity: 0.5; filter: blur(0); }
          50% { transform: scale(1.1); opacity: 1; filter: blur(0.6px); }
          100% { transform: scale(0.8); opacity: 0.5; filter: blur(0); }
        }

        /* Hover interactions: show labels when hovering the sub-groups */
        .voltageGroup:hover ~ .powerMeterGroup .labelV,
        .voltageGroup:hover ~ .powerMeterGroup .labelI,
        .voltageGroup:hover ~ .powerMeterGroup .labelP { opacity: 1; transition: opacity 240ms ease-in-out; }

        /* More direct: show labels on group hover (fallback if sibling selector doesn't work in some contexts) */
        .powerMeterGroup .voltageGroup:hover ~ .hoverLabels text { opacity: 1; transform: translateY(-6px); }

        /* subtle responsiveness */
        @media (max-width: 640px) {
          .powerMeterGroup { transform-origin: 0 0; transform: scale(0.86); }
        }
      `}</style>
    </>
  );
})()}



              </g>

              {/* waveform (right) */}
              
            </svg>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}

/* ======================
   Main GlossaryPage component
====================== */
export default function GlossaryPage() {
  const [terms, setTerms] = useState(SAMPLE_TERMS);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [tagFilter, setTagFilter] = useState("");
  const [userType, setUserType] = useState("student"); // student | instructor | professional
  const [selectedId, setSelectedId] = useState(terms[0]?.id ?? null);
  const [running, setRunning] = useState(true);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState(() => new Set());

  // simplified categories (derive from data)
  const categories = useMemo(() => ["All", ...Array.from(new Set(terms.map((t) => t.category)))], [terms]);

  const selectedTerm = useMemo(() => terms.find((t) => t.id === selectedId) ?? terms[0], [terms, selectedId]);

  // filtered list
  const filtered = useMemo(() => {
    return terms.filter((t) => {
      if (showOnlyFavorites && !favorites.has(t.id)) return false;
      if (category !== "All" && t.category !== category) return false;
      if (tagFilter && !t.tags.some((tg) => tg.includes(tagFilter))) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.short.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
    });
  }, [terms, query, category, tagFilter, showOnlyFavorites, favorites]);

  // analytics / derived numbers
  const stats = useMemo(() => {
    return {
      total: terms.length,
      shown: filtered.length,
      favorites: favorites.size,
    };
  }, [terms, filtered, favorites]);

  // toggle favorite
  const toggleFavorite = (id) => {
    setFavorites((s) => {
      const m = new Set(s);
      if (m.has(id)) m.delete(id);
      else m.add(id);
      return m;
    });
  };

  // on visualizer knob change (we could store these changes if desired)
  const onVisualizerChange = (payload) => {
    // optional: we could set transient UI state or use it to compute derived quantities
    // For now just debug notify occasionally
    // toast.debug(JSON.stringify(payload));
  };

  // add new term (example)
  const addSampleTerm = () => {
    const id = `T${Math.floor(Math.random() * 9999)}`;
    const newTerm = {
      id,
      name: `NewTerm ${id}`,
      short: "Short description",
      definition: "Auto-generated sample term. Edit to add real definition.",
      category: "Circuit",
      tags: ["sample"],
      complexity: 2,
      visual: { symbol: "resistor", waveform: { type: "sine", amp: 0.5, freq: 1.2, phase: 0 } },
    };
    setTerms((s) => [newTerm, ...s]);
    setSelectedId(id);
    toast.success("Sample term added");
  };

  // error guard
  useEffect(() => {
    if (!selectedTerm) {
      toast.error("No term selected — resetting to first available.");
      if (terms.length) setSelectedId(terms[0].id);
    }
  }, [selectedTerm, terms]);

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.15)_1px,transparent_1px)] bg-[length:20px_20px] text-white">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 py-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow">
                <Zap className="w-5 h-5 text-black" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-200">BEEE Glossary</div>
                <div className="text-xs text-zinc-400">Searchable • Interactive • Live visualizer</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2">
                <div className="text-xs text-zinc-400">User</div>
                <Select value={userType} onValueChange={(v) => setUserType(v)}>
                  <SelectTrigger className="w-36 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                    <SelectValue placeholder="User Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="instructor">Instructor</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => toast.success("Help is on the way")}>
                Help
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16" /> {/* spacing for header */}

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column: search / list */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-black" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Glossary</div>
                        <div className="text-xs text-zinc-400">Search terms, filter, and open live visualizer</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Total: <span className="text-[#ff9a4a] ml-1">{stats.total}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Shown: <span className="text-[#ffd24a] ml-1">{stats.shown}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by name, short desc, or id..."
                        className="bg-zinc-900/60 border border-zinc-800 text-white pl-10"
                      />
                      <div className="absolute left-3 top-2.5 text-zinc-400">
                        <Search className="w-4 h-4" />
                      </div>
                    </div>

                    <Button variant="outline" className="px-3 py-2" onClick={() => { setQuery(""); setTagFilter(""); setCategory("All"); setShowOnlyFavorites(false); toast("Filters cleared"); }}>
                      Clear
                    </Button>
                  </div>

                  <div className="flex gap-2 items-center">
                    <Select value={category} onValueChange={(v) => setCategory(v)}>
                      <SelectTrigger className="w-44 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                        {categories.map((c) => (
                          <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Tag filter" className="bg-zinc-900/60 border border-zinc-800 text-white" />

                    <Tooltip content="Favorites only">
                      <button className={`p-2 rounded-md border ${showOnlyFavorites ? "bg-orange-600/20 border-orange-500" : "border-zinc-800"}`} onClick={() => setShowOnlyFavorites((s) => !s)} aria-pressed={showOnlyFavorites}>
                        <Users className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  </div>

                  <div className="max-h-[48vh] overflow-y-auto space-y-2">
                    {filtered.map((t) => {
                      const active = t.id === selectedId;
                      return (
                        <motion.div key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                          <div
                            className={`p-3 rounded-lg border ${active ? "border-orange-500 bg-black/60" : "border-zinc-800 bg-black/30"} flex items-start gap-3 cursor-pointer`}
                            onClick={() => setSelectedId(t.id)}
                          >
                            <div className="w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
                              <IconForSymbol symbol={t.visual?.symbol} className="w-5 h-5" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-white truncate">{t.name}</div>
                                <div className="text-xs text-zinc-400">{t.id}</div>
                                <div className="ml-auto flex items-center gap-2">
                                  <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">{t.category}</Badge>
                                  <button onClick={(e) => { e.stopPropagation(); toggleFavorite(t.id); }}>
                                    <span className={`text-xs px-2 py-0.5 rounded ${favorites.has(t.id) ? "bg-orange-500 text-black" : "bg-zinc-900 text-zinc-300"}`}>{favorites.has(t.id) ? "★" : "☆"}</span>
                                  </button>
                                </div>
                              </div>
                              <div className="text-xs text-zinc-400 mt-1 truncate">{t.short}</div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}

                    {filtered.length === 0 && <div className="text-xs text-zinc-500 p-4">No matching terms. Try clearing filters or adding a sample term.</div>}
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={addSampleTerm}><PlusIcon /> Add Term</Button>
                    <Button variant="ghost" className="border border-zinc-800" onClick={() => { setTerms(SAMPLE_TERMS); toast("Reset terms"); }}>Reset</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right column: visualizer + details */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <TermVisualizer visual={selectedTerm?.visual ?? { symbol: "resistor", waveform: { type: "sine", amp: 0.6, freq: 1 } }} running={running} onChange={onVisualizerChange} />
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-4 md:col-span-2">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                    <IconForSymbol symbol={selectedTerm?.visual?.symbol} className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-lg font-semibold text-[#ffd24a]">{selectedTerm?.name ?? "—"}</div>
                    <div className="text-xs text-zinc-400 mt-1">{selectedTerm?.short ?? "—"}</div>

                    <Separator className="my-3 border-zinc-800" />

                    <div className="text-sm text-zinc-200 leading-relaxed">
                      {/* cater explanation to user type */}
                      {(() => {
                        if (!selectedTerm) return "Select a term to view definition.";
                        if (userType === "student") {
                          return (
                            <>
                              <div className="mb-2">{selectedTerm.definition}</div>
                              <div className="text-xs text-zinc-400">Example: conceptual explanation and everyday analogies for students.</div>
                            </>
                          );
                        } else if (userType === "instructor") {
                          return (
                            <>
                              <div className="mb-2">{selectedTerm.definition}</div>
                              <div className="text-xs text-zinc-400">Instructor notes: include teaching points, common pitfalls, demonstration ideas.</div>
                            </>
                          );
                        } else {
                          return (
                            <>
                              <div className="mb-2">{selectedTerm.definition}</div>
                              <div className="text-xs text-zinc-400">Professional details: formulae, units, typical component values, and real-world applications.</div>
                            </>
                          );
                        }
                      })()}
                    </div>

                    <div className="mt-4 flex gap-2 items-center">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-1 rounded-full">Tags: {selectedTerm?.tags.join(", ")}</Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-1 rounded-full">Complexity: {selectedTerm?.complexity}</Badge>
                      <div className="ml-auto text-xs text-zinc-400">ID: {selectedTerm?.id}</div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-4">
                <div className="text-sm text-zinc-400 mb-2">Quick Tools</div>
                <div className="flex flex-col gap-2">
                  <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => { navigator.clipboard?.writeText(selectedTerm?.definition ?? ""); toast.success("Copied definition"); }}>
                    Copy Definition
                  </Button>
                  <Button variant="ghost" className="border border-zinc-800" onClick={() => toast("Open deep-dive (coming soon)")}>Deep Dive</Button>
                  <Button variant="outline" className="border border-zinc-800" onClick={() => toast("Share link (placeholder)")}>Share</Button>
                  <div className="text-xs text-zinc-500 mt-2">Visualizer status: {running ? "Live" : "Paused"}</div>
                  <div className="flex gap-2 mt-2">
                    <Button variant="ghost" className="flex-1 border border-zinc-800" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" />Run</Button>
                    <Button variant="ghost" className="flex-1 border border-zinc-800" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" />Pause</Button>
                  </div>
                </div>
              </Card>
            </div>

            {/* footer summary */}
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <div>Showing <span className="text-white">{stats.shown}</span> of <span className="text-white">{stats.total}</span> terms • Favorites <span className="text-white">{stats.favorites}</span></div>
              <div>Tip: switch <span className="text-white">User</span> to change explanation detail</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* Small inline helper icon for add button (keeps imports explicit) */
function PlusIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
