// src/pages/UnitMeasurementPage.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Calculator,
  Play,
  Pause,
  RefreshCcw,
  Settings,
  Gauge,
  HelpCircle,
  Download,
  RotateCw,
  ServerCog,
  BrushCleaning,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Code2,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
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

/* ===========================
   Utility helpers
   =========================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 6) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  const f = 10 ** p;
  return Math.round(n * f) / f;
};
const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/* ===========================
   Formula registry
   - Each entry: { id, label, inputs: [{key,label,unit,parser}], compute: fn }
   - compute(inputs) -> { value, details: {...} }
   =========================== */

const FORMULAS = [
  {
    id: "ohm_I",
    label: "I = V / R (Ohm's law)",
    inputs: [
      { key: "V", label: "Voltage (V)", unit: "V" },
      { key: "R", label: "Resistance (Ω)", unit: "Ω" },
    ],
    compute: ({ V, R }) => {
      const v = safeNum(V);
      const r = safeNum(R);
      if (!Number.isFinite(v) || !Number.isFinite(r) || r === 0) {
        return { error: r === 0 ? "R must be non-zero" : "Invalid input" };
      }
      const I = v / r;
      return { value: I, unit: "A", details: { I } };
    },
  },

  {
    id: "ohm_V",
    label: "V = I × R",
    inputs: [
      { key: "I", label: "Current (A)", unit: "A" },
      { key: "R", label: "Resistance (Ω)", unit: "Ω" },
    ],
    compute: ({ I, R }) => {
      const i = safeNum(I);
      const r = safeNum(R);
      if (!Number.isFinite(i) || !Number.isFinite(r)) return { error: "Invalid input" };
      const V = i * r;
      return { value: V, unit: "V", details: { V } };
    },
  },

  {
    id: "ohm_R_from_rho",
    label: "R = ρ × (L / A)",
    inputs: [
      { key: "rho", label: "Resistivity (ρ, Ω·m)", unit: "Ω·m" },
      { key: "L", label: "Length (m)", unit: "m" },
      { key: "A", label: "Area (m²)", unit: "m²" },
    ],
    compute: ({ rho, L, A }) => {
      const rhos = safeNum(rho);
      const l = safeNum(L);
      const a = safeNum(A);
      if (!(Number.isFinite(rhos) && Number.isFinite(l) && Number.isFinite(a)) || a <= 0) {
        return { error: "Invalid inputs (A must be >0)" };
      }
      const R = rhos * (l / a);
      return { value: R, unit: "Ω", details: { R } };
    },
  },

  {
    id: "AC_power_P",
    label: "P = V × I × cosθ (Real power)",
    inputs: [
      { key: "V", label: "Voltage (RMS V)", unit: "V" },
      { key: "I", label: "Current (RMS A)", unit: "A" },
      { key: "cosθ", label: "Power factor (cosθ)", unit: "" },
    ],
    compute: ({ V, I, cosθ }) => {
      const v = safeNum(V);
      const i = safeNum(I);
      const pf = safeNum(cosθ);
      if (!(Number.isFinite(v) && Number.isFinite(i) && Number.isFinite(pf))) return { error: "Invalid input" };
      const P = v * i * pf;
      return { value: P, unit: "W", details: { P } };
    },
  },

  {
    id: "energy_W",
    label: "W = P × t (Energy)",
    inputs: [
      { key: "P", label: "Power (W)", unit: "W" },
      { key: "t", label: "Time (s)", unit: "s" },
    ],
    compute: ({ P, t }) => {
      const p = safeNum(P);
      const tt = safeNum(t);
      if (!(Number.isFinite(p) && Number.isFinite(tt))) return { error: "Invalid input" };
      const W = p * tt;
      const kWh = (p * (tt / 3600)) / 1000; // p in W, t in s
      return { value: W, unit: "J", details: { W, kWh } };
    },
  },

  {
    id: "reactive_Q",
    label: "Q = V × I × sinθ (Reactive power)",
    inputs: [
      { key: "V", label: "Voltage (RMS V)", unit: "V" },
      { key: "I", label: "Current (RMS A)", unit: "A" },
      { key: "sinθ", label: "sinθ", unit: "" },
    ],
    compute: ({ V, I, sinθ }) => {
      const v = safeNum(V);
      const i = safeNum(I);
      const s = safeNum(sinθ);
      if (!(Number.isFinite(v) && Number.isFinite(i) && Number.isFinite(s))) return { error: "Invalid input" };
      const Q = v * i * s;
      return { value: Q, unit: "VAR", details: { Q } };
    },
  },

  {
    id: "apparent_S",
    label: "S = sqrt(P² + Q²) (Apparent power)",
    inputs: [
      { key: "P", label: "Real power (W)", unit: "W" },
      { key: "Q", label: "Reactive power (VAR)", unit: "VAR" },
    ],
    compute: ({ P, Q }) => {
      const p = safeNum(P);
      const q = safeNum(Q);
      if (!(Number.isFinite(p) && Number.isFinite(q))) return { error: "Invalid input" };
      const S = Math.sqrt(p * p + q * q);
      return { value: S, unit: "VA", details: { S } };
    },
  },

  {
    id: "pf_cos",
    label: "pf = cosθ",
    inputs: [{ key: "theta_deg", label: "Angle θ (deg)", unit: "deg" }],
    compute: ({ theta_deg }) => {
      const td = safeNum(theta_deg);
      if (!Number.isFinite(td)) return { error: "Invalid input" };
      const rad = (td * Math.PI) / 180;
      const pf = Math.cos(rad);
      return { value: pf, unit: "", details: { pf } };
    },
  },

  {
    id: "impedance_Z",
    label: "Z = sqrt(R² + X²)",
    inputs: [
      { key: "R", label: "Resistance (Ω)", unit: "Ω" },
      { key: "X", label: "Reactance (Ω)", unit: "Ω" },
    ],
    compute: ({ R, X }) => {
      const r = safeNum(R);
      const x = safeNum(X);
      if (!(Number.isFinite(r) && Number.isFinite(x))) return { error: "Invalid input" };
      const Z = Math.sqrt(r * r + x * x);
      return { value: Z, unit: "Ω", details: { Z } };
    },
  },

  {
    id: "XL",
    label: "X_L = 2πfL",
    inputs: [
      { key: "f", label: "Frequency (Hz)", unit: "Hz" },
      { key: "L", label: "Inductance (H)", unit: "H" },
    ],
    compute: ({ f, L }) => {
      const ff = safeNum(f);
      const Lh = safeNum(L);
      if (!(Number.isFinite(ff) && Number.isFinite(Lh))) return { error: "Invalid input" };
      const XL = 2 * Math.PI * ff * Lh;
      return { value: XL, unit: "Ω", details: { XL } };
    },
  },

  {
    id: "XC",
    label: "X_C = 1 / (2πfC)",
    inputs: [
      { key: "f", label: "Frequency (Hz)", unit: "Hz" },
      { key: "C", label: "Capacitance (F)", unit: "F" },
    ],
    compute: ({ f, C }) => {
      const ff = safeNum(f);
      const c = safeNum(C);
      if (!(Number.isFinite(ff) && Number.isFinite(c)) || c === 0) return { error: "Invalid input (C>0)" };
      const XC = 1 / (2 * Math.PI * ff * c);
      return { value: XC, unit: "Ω", details: { XC } };
    },
  },

  {
    id: "EMF",
    label: "E = N × (dΦ/dt)",
    inputs: [
      { key: "N", label: "Turns (N)", unit: "" },
      { key: "dPhi_dt", label: "dΦ/dt (Wb/s)", unit: "Wb/s" },
    ],
    compute: ({ N, dPhi_dt }) => {
      const n = safeNum(N);
      const d = safeNum(dPhi_dt);
      if (!(Number.isFinite(n) && Number.isFinite(d))) return { error: "Invalid input" };
      const E = n * d;
      return { value: E, unit: "V", details: { E } };
    },
  },

  {
    id: "flux_Phi",
    label: "Φ = B × A",
    inputs: [
      { key: "B", label: "Flux density (T)", unit: "T" },
      { key: "A", label: "Area (m²)", unit: "m²" },
    ],
    compute: ({ B, A }) => {
      const b = safeNum(B);
      const a = safeNum(A);
      if (!(Number.isFinite(b) && Number.isFinite(a))) return { error: "Invalid input" };
      const Phi = b * a;
      return { value: Phi, unit: "Wb", details: { Phi } };
    },
  },

  {
    id: "B_from_Phi",
    label: "B = Φ / A",
    inputs: [
      { key: "Phi", label: "Flux (Wb)", unit: "Wb" },
      { key: "A", label: "Area (m²)", unit: "m²" },
    ],
    compute: ({ Phi, A }) => {
      const p = safeNum(Phi);
      const a = safeNum(A);
      if (!(Number.isFinite(p) && Number.isFinite(a)) || a === 0) return { error: "Invalid input (A>0)" };
      const B = p / a;
      return { value: B, unit: "T", details: { B } };
    },
  },

  {
    id: "H_NIl",
    label: "H = N × I / l",
    inputs: [
      { key: "N", label: "Turns (N)", unit: "" },
      { key: "I", label: "Current (A)", unit: "A" },
      { key: "l", label: "Length (m)", unit: "m" },
    ],
    compute: ({ N, I, l }) => {
      const n = safeNum(N);
      const i = safeNum(I);
      const ll = safeNum(l);
      if (!(Number.isFinite(n) && Number.isFinite(i) && Number.isFinite(ll)) || ll === 0) return { error: "Invalid input (l>0)" };
      const H = (n * i) / ll;
      return { value: H, unit: "A/m", details: { H } };
    },
  },

  {
    id: "C_plate",
    label: "C = ε × (A / d)",
    inputs: [
      { key: "epsilon", label: "Permittivity (F/m)", unit: "F/m" },
      { key: "A", label: "Area (m²)", unit: "m²" },
      { key: "d", label: "Separation (m)", unit: "m" },
    ],
    compute: ({ epsilon, A, d }) => {
      const e = safeNum(epsilon);
      const a = safeNum(A);
      const dd = safeNum(d);
      if (!(Number.isFinite(e) && Number.isFinite(a) && Number.isFinite(dd)) || dd === 0) return { error: "Invalid input (d>0)" };
      const C = e * (a / dd);
      return { value: C, unit: "F", details: { C } };
    },
  },

  {
    id: "L_from_NPhi_I",
    label: "L = NΦ / I",
    inputs: [
      { key: "N", label: "Turns (N)", unit: "" },
      { key: "Phi", label: "Flux (Wb)", unit: "Wb" },
      { key: "I", label: "Current (A)", unit: "A" },
    ],
    compute: ({ N, Phi, I }) => {
      const n = safeNum(N);
      const p = safeNum(Phi);
      const i = safeNum(I);
      if (!(Number.isFinite(n) && Number.isFinite(p) && Number.isFinite(i)) || i === 0) return { error: "Invalid input (I ≠ 0)" };
      const L = (n * p) / i;
      return { value: L, unit: "H", details: { L } };
    },
  },

  {
    id: "efficiency",
    label: "η = (Output / Input) × 100",
    inputs: [
      { key: "output", label: "Output power (W)", unit: "W" },
      { key: "input", label: "Input power (W)", unit: "W" },
    ],
    compute: ({ output, input }) => {
      const o = safeNum(output);
      const inP = safeNum(input);
      if (!(Number.isFinite(o) && Number.isFinite(inP)) || inP === 0) return { error: "Invalid input (input>0)" };
      const eta = (o / inP) * 100;
      return { value: eta, unit: "%", details: { eta } };
    },
  },

  {
    id: "torque_from_power",
    label: "T = (P × 60) / (2πN) (Torque)",
    inputs: [
      { key: "P", label: "Mechanical power (W)", unit: "W" },
      { key: "N", label: "Speed (RPM)", unit: "rpm" },
    ],
    compute: ({ P, N }) => {
      const p = safeNum(P);
      const n = safeNum(N);
      if (!(Number.isFinite(p) && Number.isFinite(n)) || n === 0) return { error: "Invalid input (N>0)" };
      const T = (p * 60) / (2 * Math.PI * n);
      return { value: T, unit: "N·m", details: { T } };
    },
  },

  {
    id: "P_3phi",
    label: "P_3φ = √3 × V_L × I_L × cosθ",
    inputs: [
      { key: "V_L", label: "Line voltage (V)", unit: "V" },
      { key: "I_L", label: "Line current (A)", unit: "A" },
      { key: "cosθ", label: "Power factor (cosθ)", unit: "" },
    ],
    compute: ({ V_L, I_L, cosθ }) => {
      const v = safeNum(V_L);
      const i = safeNum(I_L);
      const pf = safeNum(cosθ);
      if (!(Number.isFinite(v) && Number.isFinite(i) && Number.isFinite(pf))) return { error: "Invalid input" };
      const P3 = Math.sqrt(3) * v * i * pf;
      return { value: P3, unit: "W", details: { P3 } };
    },
  },

  {
    id: "J_current_density",
    label: "J = I / A (Current density)",
    inputs: [
      { key: "I", label: "Current (A)", unit: "A" },
      { key: "A_cross", label: "Cross area (m²)", unit: "m²" },
    ],
    compute: ({ I, A_cross }) => {
      const i = safeNum(I);
      const a = safeNum(A_cross);
      if (!(Number.isFinite(i) && Number.isFinite(a)) || a === 0) return { error: "Invalid input (A>0)" };
      const J = i / a;
      return { value: J, unit: "A/m²", details: { J } };
    },
  },

  {
    id: "sigma",
    label: "σ = 1 / ρ (Conductivity)",
    inputs: [{ key: "rho", label: "Resistivity ρ (Ω·m)", unit: "Ω·m" }],
    compute: ({ rho }) => {
      const r = safeNum(rho);
      if (!(Number.isFinite(r)) || r === 0) return { error: "Invalid input (ρ≠0)" };
      const sigma = 1 / r;
      return { value: sigma, unit: "S/m", details: { sigma } };
    },
  },

  {
    id: "freq_from_period",
    label: "f = 1 / T (Frequency)",
    inputs: [{ key: "T", label: "Period (s)", unit: "s" }],
    compute: ({ T }) => {
      const t = safeNum(T);
      if (!(Number.isFinite(t)) || t === 0) return { error: "Invalid input (T>0)" };
      const f = 1 / t;
      return { value: f, unit: "Hz", details: { f } };
    },
  },

  {
    id: "energy_kwh",
    label: "Energy (kWh) = (P × t) / 1000",
    inputs: [
      { key: "P", label: "Power (W)", unit: "W" },
      { key: "t_h", label: "Time (h)", unit: "h" },
    ],
    compute: ({ P, t_h }) => {
      const p = safeNum(P);
      const th = safeNum(t_h);
      if (!(Number.isFinite(p) && Number.isFinite(th))) return { error: "Invalid input" };
      const kwh = (p * th) / 1000;
      return { value: kwh, unit: "kWh", details: { kwh } };
    },
  },

  {
    id: "power_loss",
    label: "Power Loss = I²R",
    inputs: [
      { key: "I", label: "Current (A)", unit: "A" },
      { key: "R", label: "Resistance (Ω)", unit: "Ω" },
    ],
    compute: ({ I, R }) => {
      const i = safeNum(I);
      const r = safeNum(R);
      if (!(Number.isFinite(i) && Number.isFinite(r))) return { error: "Invalid input" };
      const loss = i * i * r;
      return { value: loss, unit: "W", details: { loss } };
    },
  },

  {
    id: "emf_dc",
    label: "EMF (DC) = V + I × R",
    inputs: [
      { key: "V", label: "Terminal voltage (V)", unit: "V" },
      { key: "I", label: "Current (A)", unit: "A" },
      { key: "R", label: "Internal resistance (Ω)", unit: "Ω" },
    ],
    compute: ({ V, I, R }) => {
      const v = safeNum(V);
      const i = safeNum(I);
      const r = safeNum(R);
      if (!(Number.isFinite(v) && Number.isFinite(i) && Number.isFinite(r))) return { error: "Invalid input" };
      const emf = v + i * r;
      return { value: emf, unit: "V", details: { emf } };
    },
  },

  {
    id: "rms_from_peak_v",
    label: "V_rms = V_m / √2",
    inputs: [{ key: "V_m", label: "Peak voltage (V_m)", unit: "V" }],
    compute: ({ V_m }) => {
      const vm = safeNum(V_m);
      if (!Number.isFinite(vm)) return { error: "Invalid input" };
      const Vrms = vm / Math.sqrt(2);
      return { value: Vrms, unit: "V", details: { Vrms } };
    },
  },

  {
    id: "rms_from_peak_i",
    label: "I_rms = I_m / √2",
    inputs: [{ key: "I_m", label: "Peak current (I_m)", unit: "A" }],
    compute: ({ I_m }) => {
      const im = safeNum(I_m);
      if (!Number.isFinite(im)) return { error: "Invalid input" };
      const Irms = im / Math.sqrt(2);
      return { value: Irms, unit: "A", details: { Irms } };
    },
  },

  {
    id: "impedance_angle",
    label: "θ = atan(X / R)",
    inputs: [
      { key: "X", label: "Reactance (Ω)", unit: "Ω" },
      { key: "R", label: "Resistance (Ω)", unit: "Ω" },
      { key: "inDegrees", label: "Return angle in degrees?", unit: "" },
    ],
    compute: ({ X, R, inDegrees }) => {
      const x = safeNum(X);
      const r = safeNum(R);
      if (!(Number.isFinite(x) && Number.isFinite(r))) return { error: "Invalid input" };
      const theta = Math.atan2(x, r); // radians
      if (inDegrees === "true" || inDegrees === true) {
        return { value: (theta * 180) / Math.PI, unit: "deg", details: { theta_rad: theta } };
      }
      return { value: theta, unit: "rad", details: { theta } };
    },
  },

  // ... You can continue adding more formulas (X_L, X_C alternate forms, σ=1/ρ) if needed
];

/* ===========================
   Waveform generators
   - create sample points for oscilloscope using formula params
   =========================== */

function generateWaveform({ type = "sine", amp = 1, freq = 1, phase = 0, offset = 0, sampleCount = 500, duration = 1 }) {
  // duration in seconds, sampleCount points → dt = duration / sampleCount
  const result = [];
  const dt = duration / sampleCount;
  for (let i = 0; i < sampleCount; i++) {
    const t = i * dt;
    const omega = 2 * Math.PI * freq;
    let val = 0;
    switch (type) {
      case "sine":
        val = amp * Math.sin(omega * t + phase) + offset;
        break;
      case "rectified":
        val = Math.abs(amp * Math.sin(omega * t + phase)) + offset;
        break;
      case "sine_damped":
        val = amp * Math.exp(-t * 1.2) * Math.sin(omega * t + phase) + offset;
        break;
      case "exp_charge":
        // exponential charge (0..1)
        val = amp * (1 - Math.exp(-t * freq)) + offset;
        break;
      case "exp_rise":
        val = amp * (1 - Math.exp(-t * freq)) + offset;
        break;
      case "custom":
        val = amp * Math.sin(omega * t + phase) + offset;
        break;
      default:
        val = amp * Math.sin(omega * t + phase) + offset;
    }
    result.push({ t, value: val });
  }
  return result;
}

/* ===========================
   Main Component
   =========================== */

export default function UnitMeasurementPage() {
  // page state
  const [selectedFormula, setSelectedFormula] = useState(FORMULAS[0].id);
  const [inputs, setInputs] = useState({});
  const [running, setRunning] = useState(true);
  const [waveParams, setWaveParams] = useState({
    type: "sine",
    amp: 1,
    freq: 1,
    phase: 0,
    duration: 1,
  });
  const [timeBase, setTimeBase] = useState(1); // seconds window for oscilloscope
  const [sampleCount, setSampleCount] = useState(400);
  const [autoScale, setAutoScale] = useState(true);

  // derived: lookup selected formula
  const activeFormula = useMemo(() => FORMULAS.find((f) => f.id === selectedFormula), [selectedFormula]);

  // compute result
  const computeResult = useMemo(() => {
    if (!activeFormula) return { error: "No formula selected" };
    try {
      const result = activeFormula.compute(inputs);
      return result;
    } catch (err) {
      return { error: String(err) };
    }
  }, [activeFormula, inputs]);
 const formula = activeFormula?.id || "generic";
  // oscilloscope data
const waveformData = useMemo(() => {
  const type = waveParams?.type || "sine";
  const freq = parseFloat(waveParams?.freq) || 50;
  const amp = parseFloat(waveParams?.amp) || 1;
  const phase = parseFloat(waveParams?.phase) || 0;
  const duration = parseFloat(timeBase) || 1;
  const dt = duration / sampleCount;
  const ω = 2 * Math.PI * freq;
  const formula = activeFormula?.id || "generic";
  const data = [];

  for (let i = 0; i < sampleCount; i++) {
    const t = i * dt;
    let base;
    switch (type) {
      case "square":
        base = Math.sign(Math.sin(ω * t + phase));
        break;
      case "triangle":
        base = (2 / Math.PI) * Math.asin(Math.sin(ω * t + phase));
        break;
      case "sawtooth":
        base = 2 * (t * freq - Math.floor(t * freq + 0.5));
        break;
      default:
        base = Math.sin(ω * t + phase);
    }

    // Inputs
    const V = Number(inputs.V) || amp;
    const I = Number(inputs.I) || amp * 0.8;
    const R = Number(inputs.R) || 10;
    const L = Number(inputs.L) || 0.1;
    const C = Number(inputs.C) || 0.001;
    const theta = Number(inputs.theta || 0);
    const Phi = Number(inputs.Phi) || 0.002;
    const N = Number(inputs.N) || 100;
    const A = Number(inputs.A) || 0.01;
    const B = Number(inputs.B) || 0.5;
    const rho = Number(inputs.rho) || 1.7e-8;
    const l = Number(inputs.l) || 1;
    const output = Number(inputs.output) || 100;
    const input = Number(inputs.input) || 120;
    const tVal = Number(inputs.t) || duration;
    const P=Number(inputs.P)||1;

    const point = { t: Number(t.toFixed(5)) };

    // ------------------------------------------
    // Physics/Formula-specific waveform logic
    // ------------------------------------------
    switch (formula) {
      case "ohm_I":
        point.V = V * base;
        point.I = point.V / R;
        break;

      case "ohm_V":
        point.I = I * base;
        point.V = point.I * R;
        break;

      case "ohm_R_from_rho":
        point.R = rho * (l / A);
        break;

      case "AC_power_P":
        point.V = V * Math.sin(ω * t);
        point.I = I * Math.sin(ω * t - theta);
        point.P = point.V * point.I;
        break;

      case "reactive_Q":
        point.V = V * Math.sin(ω * t);
        point.I = I * Math.sin(ω * t - theta);
        point.Q = V * I * Math.sin(theta);
        break;

      case "apparent_S":
        const P_ = V * I * Math.cos(theta);
        const Q_ = V * I * Math.sin(theta);
        point.S = Math.sqrt(P_ ** 2 + Q_ ** 2);
        break;

      case "pf_cos":
        point.theta = theta;
        point.pf = Math.cos((theta * Math.PI) / 180);
        break;

      case "impedance_Z":
        const X = ω * L;
        point.R = R;
        point.X = X;
        point.Z = Math.sqrt(R ** 2 + X ** 2);
        point.V = I * point.Z * Math.sin(ω * t);
        point.I = I * Math.sin(ω * t - Math.atan(X / R));
        break;

      case "XL":
        point.XL = 2 * Math.PI * freq * L;
        point.V = V * Math.sin(ω * t);
        point.I = (V / point.XL) * Math.sin(ω * t - Math.PI / 2);
        break;

      case "XC":
        point.XC = 1 / (2 * Math.PI * freq * C);
        point.V = V * Math.sin(ω * t);
        point.I = (V / point.XC) * Math.sin(ω * t + Math.PI / 2);
        break;

      case "EMF":
        point.dΦ_dt = Phi * ω * Math.cos(ω * t);
        point.E = N * point.dΦ_dt;
        break;

      case "flux_Phi":
        point.B = B * Math.sin(ω * t);
        point.Phi = point.B * A;
        break;

      case "B_from_Phi":
        point.Phi = Phi * Math.sin(ω * t);
        point.B = point.Phi / A;
        break;

      case "H_NIl":
        point.I = I * Math.sin(ω * t);
        point.H = (N * point.I) / l;
        break;

      case "C_plate":
        point.V = V * Math.sin(ω * t);
        point.I = ω * C * V * Math.cos(ω * t);
        point.Q = C * point.V;
        break;

      case "L_from_NPhi_I":
        point.I = I * Math.sin(ω * t);
        point.Φ = Phi * Math.sin(ω * t);
        point.L = (N * point.Φ) / point.I;
        point.V = L * (ω * I * Math.cos(ω * t));
        break;

      case "efficiency":
        point.Pout = output * Math.abs(Math.sin(ω * t));
        point.Pin = input;
        point.η = (point.Pout / point.Pin) * 100;
        break;

      case "torque_from_power":
        const N_rpm = Number(inputs.N) || 1000;
        point.T = (P * 60) / (2 * Math.PI * N_rpm);
        break;

      case "P_3phi":
        point.V = V * Math.sin(ω * t);
        point.I = I * Math.sin(ω * t - theta);
        point.P3φ = Math.sqrt(3) * V * I * Math.cos(theta);
        break;

      case "J_current_density":
        point.I = I * Math.sin(ω * t);
        point.J = point.I / (inputs.A_cross || 0.01);
        break;

      case "sigma":
        point.ρ = rho;
        point.σ = 1 / rho;
        break;

      case "freq_from_period":
        const T = Number(inputs.T) || 0.02;
        point.f = 1 / T;
        point.V = V * Math.sin(2 * Math.PI * point.f * t);
        break;

      case "energy_W":
      case "energy_kwh":
        point.P = P * Math.abs(Math.sin(ω * t));
        point.E = P * t;
        break;

      case "power_loss":
        point.I = I * Math.sin(ω * t);
        point.loss = point.I ** 2 * R;
        break;

      case "rms_from_peak_v":
        const Vm = Number(inputs.V_m) || V;
        point.Vrms = Vm / Math.sqrt(2);
        point.V = point.Vrms * Math.sqrt(2) * Math.sin(ω * t);
        break;

      case "rms_from_peak_i":
        const Im = Number(inputs.I_m) || I;
        point.Irms = Im / Math.sqrt(2);
        point.I = point.Irms * Math.sqrt(2) * Math.sin(ω * t);
        break;

      case "impedance_angle":
        const Xang = Number(inputs.X) || ω * L;
        const Rang = Number(inputs.R) || R;
        const angleRad = Math.atan2(Xang, Rang);
        point.theta = (inputs.inDegrees ? (angleRad * 180) / Math.PI : angleRad);
        break;

      default:
        point.V = V * Math.sin(ω * t);
        point.I = I * Math.sin(ω * t - theta);
        point.P = point.V * point.I;
    }

    data.push(
      Object.fromEntries(
        Object.entries(point).map(([k, v]) => [k, Number(v?.toFixed(6))])
      )
    );
  }

  return data;
}, [waveParams, timeBase, sampleCount, inputs, activeFormula]);


  const getLineConfigs = (formulaId) => {
  switch (formulaId) {
    // ⚡ OHM’S LAW
    case "ohm_I":
      return [
        { key: "V", color: "#facc15", name: "Voltage (V)" },
        { key: "I", color: "#22c55e", name: "Current (I = V/R)" },
      ];

    case "ohm_V":
      return [
        { key: "I", color: "#00ffbf", name: "Current (A)" },
        { key: "V", color: "#ffd24a", name: "Voltage (V = I×R)" },
      ];

    case "ohm_R_from_rho":
      return [
        { key: "R", color: "#ff9a4a", name: "Resistance (R = ρ·l/A)" },
      ];

    // ⚙️ POWER & ENERGY
    case "AC_power_P":
      return [
        { key: "V", color: "#facc15", name: "Voltage (V)" },
        { key: "I", color: "#22c55e", name: "Current (A)" },
        { key: "P", color: "#ff9a4a", name: "Active Power (P = V×I×cosθ)" },
      ];

    case "reactive_Q":
      return [
        { key: "V", color: "#facc15", name: "Voltage (V)" },
        { key: "I", color: "#22c55e", name: "Current (A)" },
        { key: "Q", color: "#3b82f6", name: "Reactive Power (Q = V×I×sinθ)" },
      ];

    case "apparent_S":
      return [
        { key: "S", color: "#a855f7", name: "Apparent Power (S = √(P²+Q²))" },
      ];

    case "pf_cos":
      return [
        { key: "pf", color: "#22c55e", name: "Power Factor (cosθ)" },
        { key: "theta", color: "#4de1ff", name: "Phase Angle (°)" },
      ];

    case "energy_W":
      return [
        { key: "P", color: "#ff9a4a", name: "Power (W)" },
        { key: "E", color: "#4de1ff", name: "Energy (J)" },
      ];

    case "energy_kwh":
      return [
        { key: "E", color: "#4de1ff", name: "Energy (kWh)" },
      ];

    case "power_loss":
      return [
        { key: "I", color: "#22c55e", name: "Current (A)" },
        { key: "loss", color: "#ff4d4d", name: "Power Loss (I²R)" },
      ];

    // 🔄 RLC CIRCUITS
    case "impedance_Z":
      return [
        { key: "V", color: "#ffd24a", name: "Voltage (V)" },
        { key: "I", color: "#00ffbf", name: "Current (A)" },
        { key: "Z", color: "#a855f7", name: "Impedance (Ω)" },
      ];

    case "impedance_angle":
      return [
        { key: "theta", color: "#4de1ff", name: "Phase Angle (θ)" },
      ];

    case "XL":
      return [
        { key: "V", color: "#ffd24a", name: "Voltage (V)" },
        { key: "I", color: "#22c55e", name: "Current (A)" },
        { key: "XL", color: "#ff9a4a", name: "Inductive Reactance (Ω)" },
      ];

    case "XC":
      return [
        { key: "V", color: "#ffd24a", name: "Voltage (V)" },
        { key: "I", color: "#00ffbf", name: "Current (A)" },
        { key: "XC", color: "#ff9a4a", name: "Capacitive Reactance (Ω)" },
      ];

    // 🔋 TRANSFORMERS / MACHINES
    case "efficiency":
      return [
        { key: "η", color: "#22c55e", name: "Efficiency (%)" },
        { key: "Pout", color: "#4de1ff", name: "Output Power (W)" },
        { key: "Pin", color: "#ff9a4a", name: "Input Power (W)" },
      ];

    case "torque_from_power":
      return [
        { key: "T", color: "#ff9a4a", name: "Torque (N·m)" },
      ];

    case "P_3phi":
      return [
        { key: "V", color: "#facc15", name: "Line Voltage (V)" },
        { key: "I", color: "#22c55e", name: "Line Current (A)" },
        { key: "P3φ", color: "#ff9a4a", name: "3-Phase Power (W)" },
      ];

    // ⚡ MAGNETIC & ELECTROMAGNETIC
    case "flux_Phi":
      return [
        { key: "B", color: "#22c55e", name: "Flux Density (T)" },
        { key: "Phi", color: "#4de1ff", name: "Flux (Wb)" },
      ];

    case "B_from_Phi":
      return [
        { key: "Phi", color: "#4de1ff", name: "Flux (Wb)" },
        { key: "B", color: "#22c55e", name: "Flux Density (T)" },
      ];

    case "H_NIl":
      return [
        { key: "I", color: "#00ffbf", name: "Current (A)" },
        { key: "H", color: "#ff9a4a", name: "Magnetizing Force (A/m)" },
      ];

    case "EMF":
      return [
        { key: "E", color: "#ffd24a", name: "Induced EMF (V)" },
        { key: "dΦ_dt", color: "#22c55e", name: "Rate of Change (dΦ/dt)" },
      ];

    case "L_from_NPhi_I":
      return [
        { key: "Φ", color: "#4de1ff", name: "Flux (Wb)" },
        { key: "I", color: "#22c55e", name: "Current (A)" },
        { key: "L", color: "#ff9a4a", name: "Inductance (H)" },
      ];

    // ⚙️ CAPACITOR
    case "C_plate":
      return [
        { key: "V", color: "#ffd24a", name: "Voltage (V)" },
        { key: "I", color: "#22c55e", name: "Current (A)" },
        { key: "Q", color: "#4de1ff", name: "Charge (C)" },
      ];

    // 🧮 DC / GENERAL
    case "emf_dc":
      return [
        { key: "V", color: "#ffd24a", name: "Terminal Voltage (V)" },
        { key: "I", color: "#22c55e", name: "Current (A)" },
        { key: "emf", color: "#ff9a4a", name: "Generated EMF (V)" },
      ];

    case "J_current_density":
      return [
        { key: "I", color: "#22c55e", name: "Current (A)" },
        { key: "J", color: "#ff9a4a", name: "Current Density (A/m²)" },
      ];

    case "sigma":
      return [
        { key: "ρ", color: "#ff9a4a", name: "Resistivity (Ω·m)" },
        { key: "σ", color: "#22c55e", name: "Conductivity (S/m)" },
      ];

    // ⚡ FREQUENCY / SIGNAL
    case "freq_from_period":
      return [
        { key: "f", color: "#4de1ff", name: "Frequency (Hz)" },
        { key: "V", color: "#facc15", name: "Generated Waveform (V)" },
      ];

    case "rms_from_peak_v":
      return [
        { key: "V", color: "#facc15", name: "Instantaneous Voltage (V)" },
        { key: "Vrms", color: "#22c55e", name: "RMS Voltage (V)" },
      ];

    case "rms_from_peak_i":
      return [
        { key: "I", color: "#00ffbf", name: "Instantaneous Current (A)" },
        { key: "Irms", color: "#22c55e", name: "RMS Current (A)" },
      ];

    // 🧠 DEFAULT FALLBACK
    default:
      return [
        { key: "V", color: "#ffd24a", name: "Voltage (V)" },
        { key: "I", color: "#22c55e", name: "Current (A)" },
        { key: "P", color: "#ff9a4a", name: "Power (W)" },
      ];
  }
};

const lineConfigs = getLineConfigs(formula);
  

  // live running toggles (auto-refresh not necessary because waveformData re-computes on params change)
  useEffect(() => {
    if (!running) return;
    // small effect to allow setInterval-based dynamic energy accumulation if needed
    // (not required here because we compute waveform from params)
    return () => {};
  }, [running]);

  // handlers
  function onInputChange(key, value) {
    setInputs((s) => ({ ...s, [key]: value }));
  }

  function resetAll() {
    setInputs({});
    setWaveParams({ type: "sine", amp: 1, freq: 1, phase: 0, duration: 1 });
    setTimeBase(1);
    setSampleCount(400);
    toast("Reset");
  }

  // error string
  const errorStr = computeResult && computeResult.error ? computeResult.error : null;

  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur bg-black/60 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow">
              <Zap className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="text-sm font-semibold">SparkLab</div>
              <div className="text-xs text-zinc-400">Unit Measurement</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
           
            <div className="flex items-center gap-2">
              <Button onClick={() => setRunning((r) => !r)} variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300">
                {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <Button onClick={resetAll} variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300">
                <RefreshCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16" />

      {/* Main container */}
      <main className="max-w-7xl mx-auto px-4 py-6 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left controls */}
          <section className="lg:col-span-4 space-y-4">
            <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                      <Calculator className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-lg text-[#ffd24a] font-semibold">Formula Selector</div>
                      <div className="text-xs text-zinc-400">Pick a formula to compute</div>
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400">Select formula</label>
                  <Select value={selectedFormula} onValueChange={(v) => setSelectedFormula(v)}>
                    <SelectTrigger className="w-full cursor-pointer text-orange-400 bg-black/80 border border-zinc-800">
                      <SelectValue placeholder="Select formula" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800">
                      {FORMULAS.map((f) => (
                        <SelectItem  key={f.id} value={f.id} className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dynamic inputs for selected formula */}
                <div className="space-y-2">
                  <div className="text-xs text-zinc-400">Inputs</div>
                  {activeFormula &&
                    activeFormula.inputs.map((inp) => (
                      <div key={inp.key} className="flex items-center gap-2">
                        <div className="w-36 text-xs text-zinc-300">{inp.label}</div>
                        <Input
                          value={inputs[inp.key] ?? ""}
                          onChange={(e) => onInputChange(inp.key, e.target.value)}
                          placeholder={inp.unit || "value"}
                          type="text"
                          className="bg-zinc-900/60 border border-zinc-800 text-white"
                        />
                      </div>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => {
                    // small validation: ensure inputs have numeric values where expected
                    try {
                      const result = activeFormula.compute(inputs);
                      if (result && result.error) toast.error(result.error);
                      else toast.success("Computed — see summary");
                    } catch (err) {
                      toast.error("Computation failed");
                    }
                  }} className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black"><ServerCog/> Compute</Button>

                  <Button variant="outline" className="cursor-pointer" onClick={() => { setInputs({}); toast("Inputs cleared"); }}><BrushCleaning/> Clear</Button>
                </div>

                {/* Waveform controls */}
                <div className="mt-2">
                  <div className="text-xs text-zinc-400">Oscilloscope Controls</div>
                  <div className="grid grid-cols-1 gap-2 mt-2">
                    <div className="flex items-center gap-2">
                      <div className="text-xs w-24 text-zinc-400">Waveform</div>
                      <Select value={waveParams.type} onValueChange={(v) => setWaveParams((s) => ({ ...s, type: v }))}>
                        <SelectTrigger className="w-full cursor-pointer text-orange-100 focus:border-orange-400 bg-black/80 border border-zinc-800">
                          <SelectValue placeholder="type" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800">
                          <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="sine">Sine</SelectItem>
                          <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="rectified">Rectified</SelectItem>
                          <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="sine_damped">Damped Sine</SelectItem>
                          <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="exp_charge">Exponential Charge</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-xs w-24 text-zinc-400">Amplitude</div>
                      <Input className="text-orange-100" value={waveParams.amp} onChange={(e) => setWaveParams((s) => ({ ...s, amp: e.target.value }))} placeholder="amp" />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-xs w-24 text-zinc-400">Freq (Hz)</div>
                      <Input className="text-orange-100" value={waveParams.freq} onChange={(e) => setWaveParams((s) => ({ ...s, freq: e.target.value }))} placeholder="freq" />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-xs w-24 text-zinc-400">Phase (rad)</div>
                      <Input className="text-orange-100" value={waveParams.phase} onChange={(e) => setWaveParams((s) => ({ ...s, phase: e.target.value }))} placeholder="phase" />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-xs w-24 text-zinc-400">Time base (s)</div>
                      <Input className="text-orange-100" value={timeBase} onChange={(e) => setTimeBase(Number(e.target.value || 1))} type="number" />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-xs w-24 text-zinc-400">Samples</div>
                      <Input className="text-orange-100" value={sampleCount} onChange={(e) => setSampleCount(Number(e.target.value || 200))} type="number" />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-xs w-24 text-zinc-400">Auto-scale</div>
                      <Button className="bg-orange-400 text-black cursor-pointer hover:bg-orange-500" variant={autoScale ? "default" : "secondary"} onClick={() => setAutoScale((s) => !s)}>{autoScale ? "On" : "Off"}</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
             <CardFooter className="flex items-center justify-between bg-black/60 border-t border-zinc-800 rounded-b-2xl px-4 py-3">
  <div className="flex items-center gap-2">
    <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-gradient-to-tr from-[#ff7a2d]/20 to-[#ffd24a]/20 text-[#ffd24a] border border-[#ff7a2d]/30 shadow-inner">
      Live Compute
    </span>
   
  </div>

  <div className="flex items-center gap-2">
    <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-zinc-900/80 text-orange-400 border border-orange-600/40 shadow-inner">
      Secure
    </span>
  </div>
</CardFooter>

            </Card>
          </section>

          {/* Right visual + oscilloscope */}
          <section className="lg:col-span-8 space-y-4">
            <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
              <CardHeader>
                <CardTitle className="flex md:items-center items-start md:flex-row flex-col gap-3 justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center"><Gauge className="w-5 h-5" /></div>
                    <div>
                      <div className="text-lg text-[#ffd24a] font-semibold">Realtime Visualizer & Oscilloscope</div>
                      <div className="text-xs text-zinc-400">Waveforms (V, I) and instantaneous power</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Formula: <span className="text-[#ffd24a] ml-1">{activeFormula?.label}</span></Badge>
                    <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">Realtime</span></Badge>
                  </div>
                </CardTitle>
              </CardHeader>

              <CardContent>
                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={waveformData}>
                      <CartesianGrid stroke="#111" strokeDasharray="3 3" />
                      <XAxis dataKey="t" tick={{ fill: "#888" }} />
                      <YAxis tick={{ fill: "#888" }} />
                      <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", borderRadius: 10 }} />
                      <Legend wrapperStyle={{ color: "#aaa" }} />
                        {lineConfigs.map((line) => (
                                <Line
                                  key={line.key}
                                  type="monotone"
                                  dataKey={line.key}
                                  stroke={line.color}
                                  strokeWidth={2}
                                  dot={false}
                                  isAnimationActive={false}
                                  name={line.name}
                                />
                              ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Summary / computed output */}
              <div className="mt-4 grid grid-cols-1 gap-3">
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="rounded-xl p-4 bg-gradient-to-br from-black/70 via-zinc-900/60 to-black/70 border border-zinc-800 shadow-md hover:shadow-lg hover:shadow-[#ff7a2d]/10 transition-all duration-300"
  >
    {/* Header */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black shadow-sm">
          <Activity className="w-4 h-4" />
        </div>
        <span className="text-sm font-medium text-zinc-300">Result</span>
      </div>

      {/* Status Badge */}
      {errorStr ? (
        <Badge
          variant="destructive"
          className="bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] rounded-full px-2 py-0.5 flex items-center gap-1"
        >
          <AlertTriangle className="w-3 h-3" />
          Error
        </Badge>
      ) : (
        <Badge
          className="bg-black/70 border border-[#ff7a2d]/40 text-[#ffd24a] text-[10px] rounded-full px-2 py-0.5 flex items-center gap-1"
        >
          <CheckCircle2 className="w-3 h-3 text-[#ffd24a]" />
          Computed
        </Badge>
      )}
    </div>

    {/* Result Display */}
    <div className="mt-2">
      <div className="text-xl font-semibold text-[#ff9a4a] tracking-tight">
        {errorStr
          ? "Error"
          : computeResult?.value !== undefined
          ? `${computeResult.value} ${computeResult.unit || ""}`
          : "—"}
      </div>

      {/* Error / Info */}
      {errorStr && (
        <div className="mt-2 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1">
          <AlertCircle className="w-3 h-3" />
          {errorStr}
        </div>
      )}

      {/* Formula */}
      <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
        <Code2 className="w-3 h-3 text-[#ff7a2d]" />
        <span>
          Formula:{" "}
          <code className="text-[#ffd24a] font-mono bg-black/40 border border-zinc-800 px-1 py-0.5 rounded">
            {activeFormula?.label || "—"}
          </code>
        </span>
      </div>
    </div>
  </motion.div>
</div>

              </CardContent>

              <CardFooter>
                <div className="flex items-center gap-3">
                  <Button variant="ghost" onClick={() => { /* export CSV of waveform */ 
                    const rows = [["t","V","I","P"], ...waveformData.map(r => [r.t, r.V, r.I, r.P])];
                    const csv = rows.map(r => r.join(",")).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `waveform-${Date.now()}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("CSV exported");
                  }} className="border border-zinc-800 bg-white cursor-pointer">Export CSV</Button>

                  <div className="ml-auto text-xs text-zinc-400">Realtime analytics • powered locally</div>
                </div>
              </CardFooter>
            </Card>

            {/* Extra explanation & safety note */}
            <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
              <CardContent>
                <div className="text-sm text-zinc-300 space-y-2">
                  <p className="text-[#ffd24a] font-semibold">Notes & best practices</p>
                  <ul className="list-disc ml-5 text-xs text-zinc-400">
                    <li>All computations are local and use the selected formula. Ensure units are consistent (SI recommended).</li>
                    <li>For AC formulas use RMS values — toggle wave amplitude to see RMS conversion visually.</li>
                    <li>Symbols may be context-dependent (e.g., <code>T</code> could mean torque or period). Check labels before computing.</li>
                   
                  </ul>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
