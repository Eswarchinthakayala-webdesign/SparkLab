// src/pages/ExperimentsPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Activity,
  CircuitBoard,
  Play,
  Pause,
  Layers,
  Gauge,
  Download,
  Settings,
  Menu,
  X,
  Lightbulb,
  CheckCircle2,
  Zap as Flash,

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
   Experiment metadata
   ============================ */
const EXPERIMENTS = [
  { id: "transformer_ocsc", group: "Transformers", label: "Transformer Open/Short Circuit Test" },
  { id: "transformer_load", group: "Transformers", label: "Transformer Load Test & Efficiency" },
  { id: "rlc_resonance", group: "Circuits", label: "RLC Resonance / Frequency Response" },
  { id: "wheatstone", group: "Measurements", label: "Wheatstone Bridge (Resistance)" },
  { id: "maxwell", group: "Measurements", label: "Maxwell Bridge (Inductance)" },
  { id: "dc_motor_load", group: "Motors", label: "DC Shunt Motor - Load Test / Speed Control" },
  { id: "induction_locked", group: "Motors", label: "Induction Motor - No-load & Blocked Rotor" },
  { id: "synchronous_vcurve", group: "Motors", label: "Synchronous Motor V-Curve" },
  { id: "synchronization", group: "Machines", label: "Alternator Synchronization" },
  { id: "wien_freq", group: "Measurements", label: "Wien Bridge - Frequency Measurement" },
  // add other items from your list as needed...
];

/* ============================
   Simulation Hook
   - Modular: handles multiple experiment types.
   - Returns: history, meters, derived, status
   ============================ */
 function useExperimentSim({ experimentId, params = {}, running = true, timestep = 60 }) {
  // === State Setup ===
  const historyRef = useRef(
    Array.from({ length: 240 }, (_, i) => ({
      t: i,
      V: 0,
      I: 0,
      P: 0,
      extra: {},
    }))
  );
  const [history, setHistory] = useState(historyRef.current);
  const lastRef = useRef(performance.now());
  const tRef = useRef(0);
  const rafRef = useRef(null);

  const stateRef = useRef({
    motorSpeed: params.initSpeed ?? 0,
    motorInertia: 0.08,
    transformParams: {},
    rlcPhase: 0,
    phaseDrift: 0,
  });

  // === Core Step Function ===
  const stepFn = useCallback(
    (dtMs) => {
      const dt = dtMs / 1000;
      const ex = experimentId;
      const p = params;

      let V = 0,
        I = 0,
        P = 0,
        extra = {};

      // ======================================================
      // 1. Synchronization (Alternator-Busbar)
      // ======================================================
      if (ex === "synchronization") {
        const freqBus = toNum(p.freqBus) || 50;
        let freqAlt = toNum(p.freqAlt) || 49.5;
        let phaseOffset = toNum(p.phaseOffset) || 0;
        const Vbus = toNum(p.Vbus) || 230;
        const Valt = toNum(p.Valt) || 230;

        const freqDiff = freqBus - freqAlt;
        freqAlt += freqDiff * dt * 0.2;

        stateRef.current.phaseDrift += (freqAlt - freqBus) * 360 * dt;
        phaseOffset = (p.phaseOffset + stateRef.current.phaseDrift) % 360;

        const wBus = 2 * Math.PI * freqBus;
        const wAlt = 2 * Math.PI * freqAlt;
        const t = tRef.current / 1000;
        const vBus = Vbus * Math.sin(wBus * t);
        const vAlt = Valt * Math.sin(wAlt * t + (phaseOffset * Math.PI) / 180);
        const ΔV = vAlt - vBus;

        const synced = Math.abs(freqDiff) < 0.05 && Math.abs(phaseOffset) < 5;
        I = synced ? Math.abs(ΔV / 10) : 0;
        V = ΔV;
        P = V * I;

        extra = {
          freqBus: round(freqBus, 4),
          freqAlt: round(freqAlt, 4),
          phaseOffset: round(phaseOffset, 4),
          synced,
          ΔV: round(ΔV, 4),
        };
      }
      // ======================================================
// 7. Maxwell Bridge – Inductance Measurement
// ======================================================

// ======================================================
// Transformer Load Test & Efficiency
// ======================================================
else if (ex === "transformer_load") {
  // Parameters
  const Vp = clamp(toNum(p.Vp) || 230, 10, 1000);      // Primary voltage (V)
  const Np = clamp(toNum(p.Np) || 1000, 10, 5000);     // Primary turns
  const Ns = clamp(toNum(p.Ns) || 500, 10, 5000);      // Secondary turns
  const Pcore = clamp(toNum(p.Pcore) || 20, 0.1, 100); // Core loss (W)
  const Pcu = clamp(toNum(p.Pcu) || 10, 0.1, 100);     // Copper loss (W)
  const load = clamp(toNum(p.load) || 0.8, 0, 1.2);    // Load fraction (0–1)
  const pf = clamp(toNum(p.pf) || 0.9, 0, 1);          // Power factor

  // Derived values
  const turnsRatio = Np / Ns;
  const Vs = Vp / turnsRatio;
  const I2 = (load * 10); // assume rated secondary current = 10A
  const I1 = (I2 / turnsRatio) * pf;
  const outputPower = Vs * I2 * pf;
  const totalLoss = Pcore + Pcu * load * load;
  const efficiency = (outputPower / (outputPower + totalLoss)) * 100;

  // Simulate small voltage waveform for visualization
  const t = tRef.current / 1000;
  const Vin = Vp * Math.sin(2 * Math.PI * 50 * t);
  const Vout = Vs * Math.sin(2 * Math.PI * 50 * t);

  extra = {
    turnsRatio: round(turnsRatio, 3),
    Vs: round(Vs, 2),
    I1: round(I1, 3),
    I2: round(I2, 3),
    outputPower: round(outputPower, 2),
    totalLoss: round(totalLoss, 2),
    efficiency: round(efficiency, 2),
    Vin: round(Vin, 2),
    Vout: round(Vout, 2),
    pf,
    note: "Efficiency improves near full load",
  };

  V = Vin;
  I = I1;
  P = outputPower;
}

else if (ex === "maxwell") {
  // Parameters
  const R1 = clamp(toNum(p.R1) || 1000, 1, 1e6);  // known resistance
  const R2 = clamp(toNum(p.R2) || 1000, 1, 1e6);  // ratio arm
  const R3 = clamp(toNum(p.R3) || 500, 1, 1e6);   // known resistor
  const C4 = clamp((toNum(p.C4) || 0.1) * 1e-6, 1e-12, 1); // known capacitor (F)
  const Vs = clamp(toNum(p.Vs) || 5, 0.1, 100);   // excitation voltage
  const f = clamp(toNum(p.freq) || 1000, 0.1, 1e6); // frequency (Hz)
  const w = 2 * Math.PI * f;

  // Maxwell’s Bridge balanced conditions:
  // Lx = R2 * R3 * C4
  // Rx = (R2 / R1) * R3
  const Lx = R2 * R3 * C4;
  const Rx = (R2 / R1) * R3;

  // Simulate alternating excitation signal
  const t = tRef.current / 1000;
  const Vin = Vs * Math.sin(w * t);

  // Simulate small balance offset
  const balanceError = Math.sin(t * 1.5) * 0.05;
  const Vout = Vin * balanceError;

  // Compute power loss in Rx branch
  const Ii = Vin / (R1 + Rx);
  const Pi = Vin * I;
  V = Vin;
  I = Ii;
  P = Pi;
  extra = {
    Lx: round(Lx, 6),
    Rx: round(Rx, 3),
    Vin: round(Vin, 4),
    Vout: round(Vout, 4),
    balanceError: round(balanceError, 4),
    f,
    note: "Balanced when Vout ≈ 0",
  };

 
}


      // ======================================================
      // 2. Induction Motor – No-Load & Blocked Rotor
      // ======================================================
      else if (ex === "induction_locked") {
        const Vph = toNum(p.Vs) || 230;
        const f = toNum(p.freq) || 50;
        const R1 = toNum(p.R1) || 1.2;
        const X1 = toNum(p.X1) || 2.3;
        const R2 = toNum(p.R2) || 1.4;
        const X2 = toNum(p.X2) || 2.1;
        const mode = p.testMode || "no_load";

        let slip = 0,
          cosPhi = 0.4,
          torque = 0;

        if (mode === "no_load") {
          cosPhi = 0.35;
          I = (Vph / Math.sqrt((R1 + R2) ** 2 + (X1 + X2) ** 2)) * 0.1;
          P = 3 * Vph * I * cosPhi;
          slip = 0.02;
          torque = (P * (1 - slip)) / (2 * Math.PI * f);
        } else {
          cosPhi = 0.5;
          I = Vph / Math.sqrt((R1 + R2) ** 2 + (X1 + X2) ** 2);
          P = 3 * Vph * I * cosPhi;
          slip = 1.0;
          torque = (3 * I ** 2 * R2) / (2 * Math.PI * f);
        }

        V = Vph;
        extra = {
          slip: round(slip, 3),
          torque: round(torque, 3),
          mode,
        };
      }
      // ======================================================
// 6. Wien Bridge - Frequency Measurement
// ======================================================
// ======================================================
// Transformer Open & Short Circuit Test
// ======================================================
else if (ex === "transformer_ocsc") {
  // Parameters
  const Vp = clamp(toNum(p.Vp) || 230, 10, 1000);       // Rated primary voltage
  const Np = clamp(toNum(p.Np) || 1000, 10, 5000);      // Primary turns
  const Ns = clamp(toNum(p.Ns) || 500, 10, 5000);       // Secondary turns
  const Po = clamp(toNum(p.Po) || 20, 0.1, 500);        // Open-circuit (core) loss (W)
  const Io = clamp(toNum(p.Io) || 0.5, 0.01, 10);       // Open-circuit current (A)
  const Vsc = clamp(toNum(p.Vsc) || 40, 1, 500);        // Short-circuit voltage (V)
  const Isc = clamp(toNum(p.Isc) || 10, 0.1, 100);      // Short-circuit current (A)
  const Psc = clamp(toNum(p.Psc) || 100, 0.1, 1000);    // Short-circuit (copper) loss (W)
  const mode = p.mode || "oc"; // "oc" or "sc"

  // Derived
  const turnsRatio = Np / Ns;

  // For open-circuit test
  const Rc = (Vp * Vp) / Po; // Core-loss resistance
  const Xm = (Vp * Vp) / (Math.sqrt((Vp * Io)**2 - Po**2)); // Magnetizing reactance (approx)

  // For short-circuit test
  const Req = Psc / (Isc * Isc); // Equivalent resistance
  const Zeq = Vsc / Isc;         // Equivalent impedance
  const Xeq = Math.sqrt(Zeq * Zeq - Req * Req); // Equivalent reactance

  // For display waveform
  const t = tRef.current / 1000;
  const w = 2 * Math.PI * 50;
  const Vin = Vp * Math.sin(w * t);
  const Iin = mode === "oc" ? Io * Math.sin(w * t - Math.PI / 6) : Isc * Math.sin(w * t - Math.PI / 4);

  const loss = mode === "oc" ? Po : Psc;
  const efficiency = mode === "oc" ? 0 : (Vsc * Isc - Psc) / (Vsc * Isc) * 100;

  extra = {
    mode,
    turnsRatio: round(turnsRatio, 3),
    Rc: round(Rc, 2),
    Xm: round(Xm, 2),
    Req: round(Req, 2),
    Xeq: round(Xeq, 2),
    Vin: round(Vin, 3),
    Iin: round(Iin, 3),
    loss: round(loss, 2),
    efficiency: round(efficiency, 2),
    note: mode === "oc"
      ? "Open-Circuit Test: Core loss & magnetizing branch parameters"
      : "Short-Circuit Test: Copper loss & equivalent impedance",
  };

  V = Vin;
  I = Iin;
  P = loss;
}

else if (ex === "wien_freq") {
  // Parameters
  const R1 = clamp(toNum(p.R1) || 10000, 1, 1e7); // ohms
  const R2 = clamp(toNum(p.R2) || 10000, 1, 1e7); // ohms
  const C1 = clamp((toNum(p.C1) || 0.1) * 1e-6, 1e-12, 1); // farads
  const C2 = clamp((toNum(p.C2) || 0.1) * 1e-6, 1e-12, 1); // farads
  const Vs = clamp(toNum(p.Vs) || 10, 0.1, 100); // source voltage

  // Wien Bridge frequency formula:
  const f0 = 1 / (2 * Math.PI * Math.sqrt(R1 * R2 * C1 * C2));

  // Simulate small deviations from resonance
  const t = tRef.current / 1000;
  const Vin = Vs * Math.sin(2 * Math.PI * f0 * t);
  const balanceError = Math.sin(t * 2) * 0.05;
  const Vout = Vin * balanceError;

  // Effective readings
  V = Vs;
  I = Vout / (R1 + R2);
  P = V * I;
  extra = {
    f0: round(f0, 2),
    Vin: round(Vin, 3),
    Vout: round(Vout, 4),
    balanceError: round(balanceError, 4),
    note: "Balanced when Vout ≈ 0",
  };
}


      // ======================================================
      // 3. RLC Resonance
      // ======================================================
      else if (ex === "rlc_resonance") {
        const R = clamp(toNum(p.R) || 10, 1e-6, 1e6);
        const L = clamp((toNum(p.L) || 10) * 1e-3, 1e-9, 10);
        const C = clamp((toNum(p.C) || 0.01) * 1e-6, 1e-12, 10);
        const f = clamp(toNum(p.freq) || 50, 0.1, 1e6);
        const w = 2 * Math.PI * f;
        const Xl = w * L;
        const Xc = 1 / (w * C);
        const Zmag = Math.sqrt(R ** 2 + (Xl - Xc) ** 2);
        const Vs = toNum(p.Vs) || 10;
        const Ipeak = Vs / Zmag;
        const V_R = Ipeak * R;
        const V_L = Ipeak * Xl;
        const V_C = Ipeak * Xc;
        V = Vs;
        I = Ipeak;
        P = Vs * I * (R / Zmag);
        extra = { Xl: round(Xl), Xc: round(Xc), Z: round(Zmag), V_R, V_L, V_C };
      }

      // ======================================================
      // 4. Transformer Tests
      // ======================================================
      else if (ex === "transformer_oc_sc" || ex === "transformer_load") {
        const Vp = toNum(p.Vp) || 230;
        const Nratio = clamp(toNum(p.Nratio) || 1, 0.01, 100);
        const coreLoss = clamp(toNum(p.coreLoss) || 10, 0, 1e4);
        const copperR = clamp(toNum(p.copperR) || 1, 1e-3, 1e4);

        if (ex === "transformer_oc_sc") {
          V = Vp;
          I = 0.01;
          P = coreLoss;
          extra = { coreLoss, copperR, Nratio };
        } else {
          const loadP = clamp(toNum(p.loadP) || 100, 0, 1e6);
          const effGuess = 0.95 - Math.min(0.2, loadP / 1e5);
          P = loadP;
          I = (loadP / Vp) / Math.max(1e-6, effGuess);
          V = Vp * (1 - (copperR * I) / (Math.abs(Vp) + 1e-6));
          extra = { efficiency: round(effGuess, 4), loadP: round(loadP) };
        }
      }

      // ======================================================
      // 5. Wheatstone Bridge
      // ======================================================
      else if (ex === "wheatstone") {
        const R1 = clamp(toNum(p.R1) || 1000, 1e-3, 1e9);
        const R2 = clamp(toNum(p.R2) || 1000, 1e-3, 1e9);
        const R3 = clamp(toNum(p.R3) || 1000, 1e-3, 1e9);
        const Rx = clamp(toNum(p.Rx) || 400, 1e-3, 1e9);
        const Vs = clamp(toNum(p.Vs_bridge) || 5, 0.1, 100);
        const Rx_calc = (R2 * R3) / R1;
        const denom = (R1 + R2) * (R3 + Rx);
        const Ig = denom > 0 ? Vs * Math.abs(R1 * Rx - R2 * R3) / denom : 0;
        I = Ig;
        P = Vs * Ig;
        V = Vs;
        extra = { Rx_calc: round(Rx_calc), galvI: round(Ig, 9) };
      }

      // ======================================================
      // 6. Synchronous Motor V-Curve
      // ======================================================
      else if (ex === "synchronous_vcurve") {
        const Vs = clamp(toNum(p.Vs) || 415, 0.1, 10000);
        const Ra = clamp(toNum(p.Ra) || 0.2, 1e-6, 10);
        const Xs = clamp(toNum(p.Xs) || 6, 0.1, 100);
        const If = clamp(toNum(p.If) || 1, 0.01, 10);
        const Pload = clamp(toNum(p.Pload) || 5000, 0, 1e6);

        const Ef = If * (Vs * 0.9);
        const δ = Math.asin(clamp(Pload / (3 * Vs * Ef / Xs), -1, 1));
        const Ia = Math.sqrt(
          ((Vs * Math.sin(δ)) ** 2 + (Vs * Math.cos(δ) - Ef) ** 2) /
            (Ra ** 2 + Xs ** 2)
        );
        const pf = Math.cos(Math.atan2(Vs * Math.sin(δ), Vs * Math.cos(δ) - Ef));
        const Pinput = 3 * Vs * Ia * pf;
        const lagging = Ef < Vs * Math.cos(δ);
        const leading = Ef > Vs * Math.cos(δ);
        const region = lagging ? "Lagging" : leading ? "Leading" : "Unity";

        V = Vs;
        I = Ia;
        P = Pinput;
        extra = {
          If: round(If),
          Ia: round(Ia),
          pf: round(pf),
          region,
          δdeg: round((δ * 180) / Math.PI, 2),
        };
      }

      // ======================================================
      // 7. DC Motor Load Test
      // ======================================================
      else if (ex === "dc_motor_load") {
        const Va = clamp(toNum(p.Va) || 220, 0, 1000);
        const Ra = clamp(toNum(p.Ra) || 1.2, 1e-3, 1e4);
        const Kt = clamp(toNum(p.Kt) || 0.12, 1e-6, 10);
        const J = clamp(toNum(p.J) || stateRef.current.motorInertia, 1e-4, 10);
        const B = clamp(toNum(p.B) || 0.01, 0, 5);
        const loadTorque = clamp(toNum(p.loadT) || 0, 0, 1e3);

        const w = stateRef.current.motorSpeed;
        const Kb = Kt;
        const Ia = (Va - Kb * w) / Math.max(Ra, 1e-6);
        const torque = Kt * Math.max(0, Ia);
        const dw = (torque - loadTorque - B * w) / J;
        stateRef.current.motorSpeed += dw * dt;
        stateRef.current.motorSpeed = Math.max(0, stateRef.current.motorSpeed);

        const speed_rpm = stateRef.current.motorSpeed * (60 / (2 * Math.PI));
        V = Va;
        I = Math.max(0, Ia);
        P = V * I;
        extra = { torque: round(torque), speed_rpm: round(speed_rpm), Ia: round(Ia) };
      }

      // ======================================================
      // 8. Default Fallback
      // ======================================================
      else {
        V = toNum(p.Vs) || 10;
        I = toNum(p.load) || 0.1;
        P = V * I;
        extra = { note: "Generic simulation model" };
      }

      return { V: round(V, 6), I: round(I, 9), P: round(P, 8), extra };
    },
    [experimentId, params]
  );

  // === Main Loop ===
  useEffect(() => {
    let alive = true;
    lastRef.current = performance.now();

    const step = (ts) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(step);
      const now = ts;
      const dt = now - lastRef.current;
      if (dt < timestep) return;
      lastRef.current = now;
      if (!running) return;

      tRef.current += dt;
      const result = stepFn(dt);
      if (!result || !isFinite(result.V) || !isFinite(result.I)) return;

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, V: result.V, I: result.I, P: result.P, extra: result.extra });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stepFn, running, timestep]);

  // === Compute Latest Reading ===
  const latest = history.length ? history[history.length - 1] : { V: 0, I: 0, P: 0, extra: {} };

  const meters = useMemo(() => {
    const V = latest?.V ?? 0;
    const I = latest?.I ?? 0;
    const P = latest?.P ?? 0;
    const extra = latest?.extra ?? {};
    return { V, I, P, extra };
  }, [latest]);

  return { history, meters, latest };
}

 function TransformerLoadAnimated({
  meters = {},
  width = 900,
  height = 420,
  autoCycle = true,
}) {
  const { Vs = 230, turnsRatio = 1, efficiency: effProp = 88, pf = 0.8, Vout = 230 } = meters;

  // internal animated state: load percent 0..100
  const [load, setLoad] = useState(Math.max(0, Math.min(100, meters.loadPercent ?? 30)));
  const rafRef = useRef(null);
  const tRef = useRef(0);

  useEffect(() => {
    if (!autoCycle) return; // don't animate load if disabled
    let last = performance.now();
    function step(now) {
      const dt = (now - last) / 1000;
      last = now;
      tRef.current += dt;
      // cycle period 10s
      const period = 10;
      const phase = (tRef.current % period) / period; // 0..1
      // ease in-out triangle wave 0..1..0
      const val = phase < 0.5 ? (phase * 2) : (2 - phase * 2);
      setLoad(Math.round(val * 100));
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoCycle]);

  // derived simulated meter values
  const primaryVoltage = Vs;
  const secondaryVoltage = Vout;
  const loadCurrent = (secondaryVoltage === 0) ? 0 : (load / 100) * (secondaryVoltage / Math.max(1, 10)); // scaled demo
  const inputPower = (secondaryVoltage * loadCurrent * pf) / Math.max(1, 1); // simplified
  const outputPower = inputPower * (effProp / 100);
  const efficiency = effProp + (load - 50) * 0.05; // slight dynamic change

  // visual helpers
  const normalColor = '#ff9a4a'; // orange
  const hotColor = '#ffd24a';
  const wireColor = '#cbd5ff';
  const dangerColor = '#ef4444';

  // pulse animation speed depends on load (more load => faster pulses)
  const pulseSpeed = 0.6 + (load / 100) * 2.2; // seconds per cycle inverse used in css
  const pulseCount = 10;

  // needle angle helper
  const needleAngle = (val, min, max, start = -65, end = 65) => {
    const clamped = Math.max(min, Math.min(max, val));
    const norm = (clamped - min) / (max - min || 1);
    return start + (end - start) * norm;
  };

  return (
    <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Transformer Load Test Animation">
        <defs>
          <filter id="glow-sm" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="coilGradLoad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffd24a" />
            <stop offset="60%" stopColor="#ff7a2d" />
            <stop offset="100%" stopColor="#ffd24a" />
          </linearGradient>

          <linearGradient id="wireGradLoad" x1="0" x2="1">
            <stop offset="0%" stopColor="#dbe7ff" />
            <stop offset="100%" stopColor="#c6d4ff" />
          </linearGradient>

          <g id="lamp">
            <circle cx="0" cy="0" r="10" fill="#222" stroke="#444" strokeWidth="1" />
            <path d="M-4 -6 L4 -6" stroke="#ffecb3" strokeWidth="1.8" strokeLinecap="round" />
          </g>

          <circle id="pulseDot1" r="3" fill="#fff" />
        </defs>

        <style>{`
          .label { font-family: Inter, Roboto, Arial; fill: rgba(255,255,255,0.9); }
          .muted { fill: rgba(255,255,255,0.6); font-size:12px }
          .coil { stroke: url(#coilGradLoad); stroke-width:6; fill:none; filter: url(#glow-sm); }
          .coil.dim { opacity: 0.18; filter: none; }
          .wire { stroke: url(#wireGradLoad); stroke-width:4; stroke-linecap:round; }
          .wire-dash { stroke-linecap:round; stroke-width:6; stroke: ${normalColor}; stroke-dasharray: 18 28; filter: url(#glow-sm); animation: dashmove ${1/pulseSpeed}s linear infinite; }

          @keyframes dashmove { to { stroke-dashoffset: -240; } }

          .gauge-bg { fill: #0b1220; stroke: rgba(255,255,255,0.04); }
          .needle { fill: ${hotColor}; }
          .load-text { font-weight:700; font-size:20px; fill: ${hotColor}; }

        `}</style>

        {/* Title */}
        <text x="30" y="30" fill="#ffd24a" fontSize="16" fontWeight="700">Transformer Load Test & Efficiency — Animated</text>

        {/* Transformer group */}
        <g transform="translate(90,60)">
          {/* Core */}
          <rect x="40" y="40" width="140" height="220" rx="6" fill="#0e1116" stroke="#222" />

          {/* Primary coil (left) */}
          <g transform="translate(20,80)">
            {[...Array(12)].map((_, i) => (
              <path key={i} className={`coil ${load > 5 ? 'hot' : 'dim'}`} d={`M0 ${i*6} Q 8 ${-6 + i*6} 16 ${i*6} T32 ${i*6} T48 ${i*6}`} />
            ))}
            <text x="-6" y="78" className="label" fontSize="11">Primary</text>
          </g>

          {/* Secondary coil (right) */}
          <g transform="translate(160,80)">
            {[...Array(12)].map((_, i) => (
              <path key={i} className={`coil ${load > 1 ? 'hot' : 'dim'}`} d={`M0 ${i*6} Q 8 ${-6 + i*6} 16 ${i*6} T32 ${i*6} T48 ${i*6}`} />
            ))}
            <text x="0" y="78" className="label" fontSize="11">Secondary</text>
          </g>

          {/* connection wires */}
          <path className="wire" d="M0 160 L20 160" />
          <path className="wire" d="M340 160 L380 160" />
        </g>

        {/* Supply & primary meters (left) */}
        <g transform="translate(30,120)">
          <rect x="0" y="-38" width="80" height="76" rx="6" fill="#071024" stroke="#1a2333" />
          <text x="40" y="-14" className="label" fontSize="11" textAnchor="middle">AC Supply</text>

          {/* wire to primary */}
          <path className="wire" d="M80 0 L150 0 L180 0" />
          <path className="wire-dash" d="M80 0 L150 0 L180 0" />

          {/* voltmeter near primary */}
          <g transform="translate(200,-40)">
            <rect x="0" y="0" width="90" height="90" rx="8" className="gauge-bg" />
            <text x="45" y="14" textAnchor="middle" className="label" fontSize="11">Vp</text>
            <g transform="translate(45,62)">
              <circle r="34" fill="#0b1220" stroke="#19202b" strokeWidth="2" />
              {[...Array(9)].map((_, i) => {
                const a = -65 + (i * 130) / 8;
                const x1 = 34 * Math.cos((a * Math.PI) / 180);
                const y1 = 34 * Math.sin((a * Math.PI) / 180);
                const x2 = 28 * Math.cos((a * Math.PI) / 180);
                const y2 = 28 * Math.sin((a * Math.PI) / 180);
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.06)" />;
              })}
              <rect x="-1.8" y="-2" width="3.6" height="36" rx="1" className="needle" transform={`rotate(${needleAngle(primaryVoltage, 0, 300)})`} transform-origin="0 0" />
              <text x="0" y="54" textAnchor="middle" className="label" fontSize="11">{Math.round(primaryVoltage)} V</text>
            </g>
          </g>

          {/* Ammeter primary */}
          <g transform="translate(310,-40)">
            <rect x="0" y="0" width="90" height="90" rx="8" className="gauge-bg" />
            <text x="45" y="14" textAnchor="middle" className="label" fontSize="11">Ip</text>
            <g transform="translate(45,62)">
              <circle r="34" fill="#0b1220" stroke="#19202b" strokeWidth="2" />
              <rect x="-1.8" y="-2" width="3.6" height="36" rx="1" className="needle" transform={`rotate(${needleAngle(loadCurrent, 0, 20)})`} transform-origin="0 0" fill={load > 70 ? dangerColor : hotColor} />
              <text x="0" y="54" textAnchor="middle" className="label" fontSize="11">{loadCurrent.toFixed(2)} A</text>
            </g>
          </g>
        </g>

        {/* Secondary meters & load (right) */}
        <g transform="translate(520,120)">
          {/* Voltmeter secondary */}
          <g transform="translate(0,0)">
            <rect x="0" y="0" width="90" height="90" rx="8" className="gauge-bg" />
            <text x="45" y="14" textAnchor="middle" className="label" fontSize="11">Vs</text>
            <g transform="translate(45,62)">
              <circle r="34" fill="#0b1220" stroke="#19202b" strokeWidth="2" />
              <rect x="-1.8" y="-2" width="3.6" height="36" rx="1" className="needle" transform={`rotate(${needleAngle(secondaryVoltage, 0, 300)})`} transform-origin="0 0" />
              <text x="0" y="54" textAnchor="middle" className="label" fontSize="11">{Math.round(secondaryVoltage)} V</text>
            </g>
          </g>

          {/* Ammeter secondary */}
          <g transform="translate(110,0)">
            <rect x="0" y="0" width="90" height="90" rx="8" className="gauge-bg" />
            <text x="45" y="14" textAnchor="middle" className="label" fontSize="11">Is</text>
            <g transform="translate(45,62)">
              <circle r="34" fill="#0b1220" stroke="#19202b" strokeWidth="2" />
              <rect x="-1.8" y="-2" width="3.6" height="36" rx="1" className="needle" transform={`rotate(${needleAngle(loadCurrent, 0, 30)})`} transform-origin="0 0" fill={load > 70 ? dangerColor : hotColor} />
              <text x="0" y="54" textAnchor="middle" className="label" fontSize="11">{loadCurrent.toFixed(2)} A</text>
            </g>
          </g>

          {/* Load (lamps/resistor) */}
          <g transform="translate(40,120)">
            {/* three lamps in parallel for visual load */}
            {[0,1,2].map((i) => (
              <g key={i} transform={`translate(${i*36},0)`}> 
                <use href="#lamp" />
                {/* lamp glow changes with load */}
                <circle cx="0" cy="0" r={6 + (load/100)*4} fill={load > 5 ? '#ffd98a' : '#222'} opacity={0.6} filter={load > 5 ? 'url(#glow-sm)' : 'none'} />
              </g>
            ))}

            <text x="-10" y="36" className="muted">Load: <tspan className="load-text">{load}%</tspan></text>
          </g>

          {/* Wattmeter */}
          <g transform="translate(0,170)">
            <rect x="0" y="0" width="220" height="70" rx="8" className="gauge-bg" />
            <text x="12" y="18" className="label" fontSize="12">Wattmeter</text>
            <text x="12" y="38" className="label" fontSize="13">Input: {inputPower.toFixed(1)} W</text>
            <text x="12" y="56" className="label" fontSize="13">Output: {outputPower.toFixed(1)} W</text>
          </g>
        </g>

        {/* Animated wire pulses across primary->secondary->load */}
        <g>
          {/* big path across transformer */}
          <path id="flowPath" d="M210 200 L310 200 L420 200 L540 200" strokeOpacity="0" fill="none" />

          {[...Array(pulseCount)].map((_, i) => {
            const dur = (1 / (0.4 + (load/100)*2)) * (0.9 + (i%3)*0.12);
            return (
              <g key={i}>
                <use href="#pulseDot1">
                  <animateMotion dur={`${dur}s`} repeatCount="indefinite" path="M210 200 L310 200 L420 200 L540 200" begin={`${(i*0.12).toFixed(2)}s`} />
                </use>
              </g>
            );
          })}

          {/* dashed moving overlay to show direction */}
          <path className="wire-dash" d="M210 200 L310 200 L420 200 L540 200" />
        </g>

        {/* Efficiency gauge */}
        <g transform="translate(320,320)">
          <rect x="-8" y="-8" width="220" height="90" rx="8" className="gauge-bg" />
          <text x="0" y="10" className="label" fontSize="12">Efficiency</text>
          <g transform="translate(110,58)">
            <circle r="34" fill="#0b1220" stroke="#19202b" strokeWidth="2" />
            {[...Array(9)].map((_, i) => {
              const a = -65 + (i * 130) / 8;
              const x1 = 34 * Math.cos((a * Math.PI) / 180);
              const y1 = 34 * Math.sin((a * Math.PI) / 180);
              const x2 = 28 * Math.cos((a * Math.PI) / 180);
              const y2 = 28 * Math.sin((a * Math.PI) / 180);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.06)" />;
            })}
            <rect x="-2" y="-2" width="4" height="36" rx="1" className="needle" transform={`rotate(${needleAngle(efficiency, 0, 100)})`} transform-origin="0 0" />
            <text x="0" y="54" textAnchor="middle" className="label" fontSize="12">{Math.round(efficiency)}%</text>
          </g>

          {/* additional text metrics */}
          <text x="12" y="36" className="label" fontSize="12">PF: {pf.toFixed(2)}</text>
          <text x="120" y="36" className="label" fontSize="12">Turns ratio: {turnsRatio}</text>
        </g>

      </svg>
    </div>
  );
}

/* ============================
   Visualizer component
   - Generic that adapts per experiment
   ============================ */
 function TransformerOCSCAnimated({
  mode = "oc",
  meters = {},
  width = 800,
  height = 420,
}) {
  const isOC = mode === "oc";
  const [t, setT] = useState(0); // animation time
  const rafRef = useRef(null);

  // Simulated meter values (smoothly oscillating) -- small demo model
  const [volt, setVolt] = useState(isOC ? 230 : 50);
  const [amp, setAmp] = useState(isOC ? 0.05 : 8);

  useEffect(() => {
    // animate a time counter and meter smoothing
    let last = performance.now();

    function loop(now) {
      const dt = (now - last) / 1000;
      last = now;
      setT((p) => p + dt);

      // target values depend on mode
      const targetVolt = isOC ? 230 : 70; // primary applied voltage in volts
      const targetAmp = isOC ? 0.02 : 10; // low current for OC, high for SC

      // smooth approach
      setVolt((v) => v + (targetVolt - v) * Math.min(1, dt * 2));
      setAmp((a) => a + (targetAmp - a) * Math.min(1, dt * 2.5));

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isOC]);

  // helper to convert a meter value to a needle rotation
  const needleAngle = (val, min, max, start = -60, end = 60) => {
    const clamped = Math.max(min, Math.min(max, val));
    const norm = (clamped - min) / (max - min);
    return start + (end - start) * norm;
  };

  // dynamic colors and glow intensity
  const normalColor = "#22c55e"; // green
  const shortColor = "#ef4444"; // red
  const ocColor = "#4de1ff"; // cyan for open-circuit hot coils
  const activeColor = isOC ? ocColor : normalColor;
  const danger = !isOC; // in this demo treat short-circuit as danger

  // visual parameters for current-flow animation
  const pulseSpeed = isOC ? 0.9 : 2.2; // faster pulses for short-circuit
  const pulseCount = 8;

  // generate moving-dot positions along a simplified wire path using simple parametric paths
  // We'll implement the dots using stroke-dashoffset animation (CSS) on dedicated strokes.

  return (
    <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Transformer Open/Short Circuit Animated Diagram"
      >
        <defs>
          {/* Glow filters */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="coilGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffd24a" />
            <stop offset="50%" stopColor="#ff7a2d" />
            <stop offset="100%" stopColor="#ffd24a" />
          </linearGradient>

          <linearGradient id="wireGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#bfc7ff" />
            <stop offset="100%" stopColor="#ccd6ff" />
          </linearGradient>

          {/* stroke for animated current pulses */}
          <path id="wirePath1" d="M180 220 L280 220 L320 220" />
          <path id="wirePath2" d="M320 220 L420 220 L520 220" />

          {/* small circle shape used as animated particle (for animateMotion fallback) */}
          <circle id="pulseDot" r="3" fill="#fff" />
        </defs>

        <style>{`
          .meter-face { fill: #0b1020; stroke: rgba(255,255,255,0.06); }
          .meter-tick { stroke: rgba(255,255,255,0.08); }
          .label { fill: rgba(255,255,255,0.85); font-family: Inter, Roboto, Arial; }

          /* animated stroke to simulate flowing current */
          .flow {
            stroke-width: 3;
            stroke-linecap: round;
            fill: none;
            stroke: url(#wireGrad);
            opacity: 0.95;
          }

          /* dashed flow overlay that moves to give impression of moving charges */
          .flow-dash {
            stroke-width: 6;
            stroke-linecap: round;
            fill: none;
            stroke: ${danger ? shortColor : normalColor};
            stroke-dasharray: 20 30;
            animation: dashmove ${1 / pulseSpeed}s linear infinite;
            filter: url(#glow);
          }

          @keyframes dashmove {
            to { stroke-dashoffset: -200; }
          }

          /* coil glow when energized */
          .coil {
            stroke-width: 6;
            stroke-linejoin: round;
            fill: none;
            stroke: url(#coilGrad);
            transition: stroke-opacity 0.25s ease;
            filter: url(#glow);
          }

          .coil.dim { opacity: 0.15; filter: none; }
          .coil.hot { opacity: 1; }

          /* needle transform origin center at the meter center */
          .needle { transform-origin: 0 0; }

        `}</style>

        {/* Title */}
        <text x="30" y="30" fill="#ffd24a" fontSize="16" fontWeight="700">Transformer {isOC ? "Open-Circuit" : "Short-Circuit"} Test — Animated</text>

        {/* Transformer body */}
        <g transform="translate(60,70)">
          {/* core */}
          <rect x="20" y="40" width="120" height="200" rx="6" fill="#10131a" stroke="#222428" strokeWidth="1" />

          {/* primary coil (left) - drawn as many turns using path arcs */}
          <g transform="translate(45,60)">
            {/* coil turns as paths for visual accuracy */}
            <path
              className={`coil ${isOC ? "hot" : "dim"}`}
              d="M0 0 Q 6 -8 12 0 T24 0 T36 0 T48 0 T60 0 T72 0"
            />
            <path className={`coil ${isOC ? "hot" : "dim"}`} d="M0 12 Q 6 4 12 12 T24 12 T36 12 T48 12 T60 12 T72 12" />
            <text x="-10" y="40" className="label" fontSize="12">Primary</text>
          </g>

          {/* secondary coil (right) */}
          <g transform="translate(120,60)">
            <path className={`coil ${!isOC ? "hot" : "dim"}`} d="M0 0 Q 6 -8 12 0 T24 0 T36 0 T48 0 T60 0 T72 0" />
            <path className={`coil ${!isOC ? "hot" : "dim"}`} d="M0 12 Q 6 4 12 12 T24 12 T36 12 T48 12 T60 12 T72 12" />
            <text x="-6" y="40" className="label" fontSize="12">Secondary</text>
          </g>

          {/* interconnect wires (simplified) */}
          <path d="M33 120 L20 120" stroke="#ccd6ff" strokeWidth="3" strokeLinecap="round" />
          <path d="M210 120 L260 120" stroke="#ccd6ff" strokeWidth="3" strokeLinecap="round" />
        </g>

        {/* Wires to meters and supply (centered horizontally) */}
        <g>
          {/* Left supply and ammeter for primary */}
          <g transform="translate(20,150)">
            {/* AC supply symbol */}
            <rect x="0" y="-28" width="60" height="56" rx="6" fill="#071024" stroke="#1a2333" />
            <text x="30" y="6" textAnchor="middle" className="label" fontSize="10">AC</text>

            {/* outgoing wire */}
            <path className="flow" d="M60 0 L120 0 L150 0" />
            <path className="flow-dash" d="M60 0 L120 0 L150 0" />
          </g>

          {/* Right meters group (volt & watt) */}
          <g transform="translate(520,120)">
            {/* Volt meter */}
            <g transform="translate(0,0)">
              <rect x="0" y="0" width="100" height="100" rx="10" className="meter-face" />
              <text x="50" y="14" textAnchor="middle" className="label" fontSize="11">Voltmeter</text>

              {/* ticks (simple) */}
              <g transform="translate(50,70)">
                <circle r="34" fill="#0b1220" stroke="#19202b" strokeWidth="2" />
                {[...Array(9)].map((_, i) => {
                  const a = -60 + (i * 120) / 8;
                  const x1 = 34 * Math.cos((a * Math.PI) / 180);
                  const y1 = 34 * Math.sin((a * Math.PI) / 180);
                  const x2 = 30 * Math.cos((a * Math.PI) / 180);
                  const y2 = 30 * Math.sin((a * Math.PI) / 180);
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="meter-tick" />;
                })}

                {/* needle */}
                <g transform={`translate(0,0)`}> 
                  <rect x="-1.5" y="-2" width="3" height="36" rx="1" fill="#ffd24a" transform={`rotate(${needleAngle(volt, 0, 300)})`} transform-origin="0 0" />
                  <circle r="4" fill="#111" stroke="#ffd24a" strokeWidth="1.5" />
                </g>

                <text x="0" y="54" textAnchor="middle" className="label" fontSize="11">{Math.round(volt)} V</text>
              </g>
            </g>

            {/* Small spacer */}
            <g transform="translate(0,120)">
              {/* Ammeter (for short-circuit side) */}
              <rect x="0" y="0" width="100" height="100" rx="10" className="meter-face" />
              <text x="50" y="14" textAnchor="middle" className="label" fontSize="11">Ammeter</text>

              <g transform="translate(50,70)">
                <circle r="34" fill="#0b1220" stroke="#19202b" strokeWidth="2" />
                {[...Array(9)].map((_, i) => {
                  const a = -60 + (i * 120) / 8;
                  const x1 = 34 * Math.cos((a * Math.PI) / 180);
                  const y1 = 34 * Math.sin((a * Math.PI) / 180);
                  const x2 = 30 * Math.cos((a * Math.PI) / 180);
                  const y2 = 30 * Math.sin((a * Math.PI) / 180);
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="meter-tick" />;
                })}

                <g>
                  <rect x="-1.5" y="-2" width="3" height="36" rx="1" fill={danger ? shortColor : "#4de1ff"} transform={`rotate(${needleAngle(amp, 0, 15)})`} transform-origin="0 0" />
                  <circle r="4" fill="#111" stroke={danger ? shortColor : "#4de1ff"} strokeWidth="1.5" />
                </g>

                <text x="0" y="54" textAnchor="middle" className="label" fontSize="11">{amp.toFixed(2)} A</text>
              </g>
            </g>
          </g>
        </g>

        {/* Bottom text showing parameters */}
        <g transform="translate(30,320)">
          <text x="0" y="0" className="label" fontSize="12">{isOC ? `Rc = ${meters.Rc ?? "—"} Ω, Xm = ${meters.Xm ?? "—"} Ω` : `Req = ${meters.Req ?? "—"} Ω, Xeq = ${meters.Xeq ?? "—"} Ω`}</text>
          <text x="0" y="18" className="label" fontSize="12">Loss = {meters.loss ?? "—"} W</text>
          {!isOC && <text x="0" y="36" className="label" fontSize="12">Efficiency = {meters.efficiency ?? "—"}%</text>}
        </g>

        {/* Large connecting wire and animated flow across transformer secondary (center) */}
        <g transform="translate(60,70)">
          {/* main wire from left supply to primary */}
          <path className="flow" d="M0 170 L40 170 L40 130" />
          <path className="flow-dash" d="M0 170 L40 170 L40 130" />

          {/* wire from primary to secondary (through the center) */}
          <path className="flow" d="M100 170 L170 170 L210 170" />
          <path className="flow-dash" d="M100 170 L170 170 L210 170" />

          {/* secondary outgoing wires */}
          <path className="flow" d="M240 170 L320 170 L380 170" />
          <path className="flow-dash" d="M240 170 L320 170 L380 170" />

          {/* if short-circuit, draw a red shorting link on secondary */}
          { !isOC && (
            <g>
              <path d="M320 170 L360 170" stroke={shortColor} strokeWidth="6" strokeLinecap="round" filter="url(#glow)" />
              <circle cx="360" cy="170" r="6" fill={shortColor} filter="url(#glow)" />
            </g>
          )}
        </g>

        {/* Floating animated pulse dots using animateMotion along a path - duplicated for visual density */}
        {[...Array(pulseCount)].map((_, i) => {
          const offset = (i / pulseCount) * 2 * Math.PI;
          const dur = (1 / pulseSpeed) * (0.8 + (i % 3) * 0.2);
          // place dots along the long path across transformer secondary to meters
          return (
            <g key={i}>
              <use href="#pulseDot">
                <animateMotion
                  dur={`${dur}s`}
                  repeatCount="indefinite"
                  path="M60 170 L120 170 L180 170 L240 170 L320 170 L420 170"
                  keyPoints="0;1"
                  keyTimes="0;1"
                />
              </use>
            </g>
          );
        })}

      </svg>
    </div>
  );
}

// ======================================================
// RLC Resonance — Animated Simulation
// ======================================================

 function RLCResonanceAnimated({
  meters = {},
  width = 900,
  height = 420,
  autoSweep = true,
}) {
  const { R = 10, L = 0.02, C = 1e-6, Vs = 1 } = meters;
  const [freq, setFreq] = useState(50); // Hz
  const [t, setT] = useState(0);
  const rafRef = useRef(null);
  const oscRef = useRef([]); // store points for frequency response

  useEffect(() => {
    let last = performance.now();
    let sweepDir = 1;
    function loop(now) {
      const dt = (now - last) / 1000;
      last = now;
      setT((p) => p + dt);

      if (autoSweep) {
        // Sweep triangular between 5 Hz and 500 Hz (adjustable)
        const minF = 5;
        const maxF = 500;
        const speed = 30; // Hz per second baseline
        let next = freq + sweepDir * speed * dt;
        if (next > maxF) { next = maxF; sweepDir = -1; }
        if (next < minF) { next = minF; sweepDir = 1; }
        setFreq(next);
      }

      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSweep, freq]);

  // Electrical calculations (series RLC)
  // Angular frequency
  const w = 2 * Math.PI * Math.max(1e-6, freq);
  const ZR = R;
  const ZL = { re: 0, im: w * L };
  const ZC = { re: 0, im: -1 / (w * C) };
  // Add complex impedances
  const Ztot = {
    re: ZR + ZL.re + ZC.re,
    im: ZL.im + ZC.im,
  };
  const Zmag = Math.sqrt(Ztot.re * Ztot.re + Ztot.im * Ztot.im);
  const I = Vs / Zmag; // magnitude of current (A) for supply amplitude Vs

  // phasor voltages across elements (magnitudes)
  const Vr = Math.abs(I * ZR);
  const Vl = Math.abs(I * ZL.im);
  const Vc = Math.abs(I * Math.abs(ZC.im));

  // track for response plot (store recent samples)
  useEffect(() => {
    // push a sample (freq, I) and keep last 200
    oscRef.current.push([freq, I]);
    if (oscRef.current.length > 240) oscRef.current.shift();
  }, [freq, I]);

  // helpers for visual mapping
  const map = (v, a, b, c, d) => c + ((v - a) * (d - c)) / (b - a || 1);

  // convert oscRef points to svg polyline coordinates
  const plotW = 250, plotH = 120;
  const fmin = 5, fmax = 500;
  const Imax = Math.max(0.001, ...oscRef.current.map((p) => p[1]));
  const polyline = oscRef.current.map(([f, i]) => {
    const x = map(f, fmin, fmax, 0, plotW);
    const y = map(i, 0, Imax * 1.2, plotH, 0);
    return `${x},${y}`;
  }).join(" ");

  // visual phasor angles (simple approximation): angle of total Z
  const phasorAngle = Math.atan2(Ztot.im, Ztot.re) * (180 / Math.PI); // degrees
  // Vr in-phase with current (0deg), Vl leads by 90, Vc lags by 90

  // pulse animation speed dependent on frequency
  const pulsePeriod = Math.max(0.08, 1 / Math.max(8, freq / 6));

  return (
    <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="RLC Resonance Animated Diagram">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="wireGradRLC" x1="0" x2="1">
            <stop offset="0%" stopColor="#cfe2ff" />
            <stop offset="100%" stopColor="#bfcfff" />
          </linearGradient>

          <circle id="dot" r="3.2" fill="#ffd24a" />
        </defs>

        <style>{`
          .label{ font-family: Inter, Roboto, Arial; fill: rgba(255,255,255,0.9); }
          .muted{ fill: rgba(255,255,255,0.6); font-size:12px }
          .wire{ stroke: url(#wireGradRLC); stroke-width:4; stroke-linecap:round; }
          .wave{ fill:none; stroke:#ff6a9a; stroke-width:2; stroke-linecap:round; }
          .phasor-vl{ stroke:#3aa0ff; stroke-width:4; filter:url(#glow); }
          .phasor-vc{ stroke:#ffd24a; stroke-width:4; filter:url(#glow); }
          .phasor-vr{ stroke:#ff6a9a; stroke-width:4; filter:url(#glow); }
          .resistor{ fill:#0b0b0b; stroke:#222; }
          .coil{ fill:none; stroke:#dfb36a; stroke-width:4; filter:url(#glow); }
          .cap-plate{ fill:#e6e6e6; }

          .pulsePath { stroke-dasharray: 1 18; stroke-linecap: round; stroke-width:6; stroke: #ffd24a; animation: dash ${pulsePeriod}s linear infinite; filter: url(#glow); }
          @keyframes dash { to { stroke-dashoffset: -240; } }

        `}</style>

        {/* Title */}
        <text x="30" y="28" fill="#ffd24a" fontSize="16" fontWeight="700">RLC Resonance — Frequency Response</text>

        {/* Circuit drawing */}
        <g transform="translate(40,70)">
          {/* Source */}
          <g>
            <rect x="0" y="18" width="48" height="48" rx="8" fill="#071024" stroke="#1a2333" />
            <text x="24" y="48" textAnchor="middle" className="label">Vs</text>
            <text x="24" y="64" textAnchor="middle" className="muted">{Vs} V</text>
          </g>

          {/* wire to R */}
          <path className="wire" d="M48 44 H120" />

          {/* Resistor (zigzag) */}
          <g transform="translate(120,26)">
            <rect x="0" y="0" width="72" height="36" rx="6" className="resistor" />
            <text x="36" y="22" textAnchor="middle" className="label">R</text>
          </g>
          <path className="wire" d="M192 44 H260" />

          {/* Inductor (coil) */}
          <g transform="translate(260,16)">
            <rect x="0" y="0" width="64" height="56" rx="6" fill="#0b0b0b" stroke="#222" />
            {/* coil turns */}
            <g transform="translate(6,18)">
              {[0,1,2,3,4].map((i) => (
                <path key={i} className="coil" d={`M${i*12} 6 q6 -12 12 0`} />
              ))}
            </g>
            <text x="32" y="44" textAnchor="middle" className="label" fontSize="11">L</text>
          </g>

          <path className="wire" d="M324 44 H392" />

          {/* Capacitor plates */}
          <g transform="translate(392,16)">
            <rect x="0" y="0" width="64" height="56" rx="6" fill="#0b0b0b" stroke="#222" />
            <g transform="translate(16,16)">
              <rect className="cap-plate" x="0" y="2" width="6" height="32" />
              <rect className="cap-plate" x="20" y="2" width="6" height="32" />
            </g>
            <text x="32" y="44" textAnchor="middle" className="label" fontSize="11">C</text>
          </g>

          <path className="wire" d="M456 44 H620" />
          <path className="wire" d="M620 44 H660" />

          {/* closing wire back to source (bottom) */}
          <path className="wire" d="M660 44 L660 120 L0 120 L0 72" />

          {/* animated pulses moving along the top path */}
          <g>
            <path id="topPath" d="M48 44 H120 H192 H260 H324 H392 H456 H620" fill="none" strokeOpacity="0" />
            {[0,1,2,3,4].map((i) => (
              <use key={i} href="#dot">
                <animateMotion dur={`${Math.max(0.6, 6/Math.max(1,freq))}s`} repeatCount="indefinite" begin={`${i*0.12}s`} path="M48 44 H120 H192 H260 H324 H392 H456 H620" />
              </use>
            ))}

            {/* pulsing overlay to show direction */}
            <path className="pulsePath" d="M48 44 H120 H192 H260 H324 H392 H456 H620" />
          </g>

          {/* Phasors display near circuit: arrows showing magnitude & phase */}
          <g transform="translate(80,170)">
            <text className="muted" x="0" y="0">Phasors (Vr, Vl, Vc) — angle: {Math.round(phasorAngle)}°</text>

            {/* Vr (in phase with I) */}
            <g transform="translate(40,30)">
              <line x1="0" y1="0" x2={map(Vr,0,Math.max(Vl,Vc,Vr||1),0,80)} y2="0" className="phasor-vr" />
              <text x="88" y="4" className="label" fontSize="11">Vr</text>
            </g>

            {/* Vl (leads by 90) */}
            <g transform="translate(40,70)">
              <line x1="0" y1="0" x2={map(Vl,0,Math.max(Vl,Vc,Vr||1),0,80)} y2="0" className="phasor-vl" transform={`rotate(${90})`} />
              <text x="88" y="4" className="label" fontSize="11">Vl</text>
            </g>

            {/* Vc (lags by 90) */}
            <g transform="translate(40,110)">
              <line x1="0" y1="0" x2={map(Vc,0,Math.max(Vl,Vc,Vr||1),0,80)} y2="0" className="phasor-vc" transform={`rotate(${-90})`} />
              <text x="88" y="4" className="label" fontSize="11">Vc</text>
            </g>
          </g>

          {/* Current gauge */}
          <g transform="translate(520,170)">
            <rect x="-8" y="-8" width="180" height="120" rx="8" fill="#071024" stroke="#19202b" />
            <text x="12" y="6" className="label">Current magnitude |I|</text>
            <g transform="translate(90,70)">
              <circle r="42" fill="#0b1220" stroke="#19202b" strokeWidth="2" />
              {[...Array(9)].map((_, i) => {
                const a = -65 + (i * 130) / 8;
                const x1 = 42 * Math.cos((a * Math.PI) / 180);
                const y1 = 42 * Math.sin((a * Math.PI) / 180);
                const x2 = 34 * Math.cos((a * Math.PI) / 180);
                const y2 = 34 * Math.sin((a * Math.PI) / 180);
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.06)" />;
              })}
              <rect x="-2" y="-2" width="4" height="48" rx="1" fill="#ff6a9a" transform={`rotate(${map(I,0,Math.max(I,0.001)*1.6,-65,65)})`} transform-origin="0 0" />
              <text x="0" y="64" textAnchor="middle" className="label">{I.toFixed(3)} A</text>
            </g>
          </g>

          {/* Frequency control and display */}
          <g transform="translate(520,40)">
            <text className="muted" x="0" y="0">Frequency</text>
            <text className="label" x="0" y="18" fontSize="18">{Math.round(freq)} Hz</text>
            {/* visual slider (read-only) */}
            <rect x="0" y="28" width="220" height="8" rx="4" fill="#0b1220" />
            <rect x={map(freq,5,500,0,220)-6} y="22" width="12" height="20" rx="3" fill="#ffd24a" />
          </g>

          {/* Resonance plot (oscilloscope-like) */}
          <g transform="translate(80,260)">
            <rect x="0" y="0" width={plotW+8} height={plotH+8} rx="6" fill="#071024" stroke="#19202b" />
            <text x="6" y="14" className="muted">I vs f (resonance)</text>
            <g transform="translate(4,24)">
              <polyline points={polyline} fill="none" stroke="#ffd24a" strokeWidth="2" />
              {/* axes */}
              <line x1="0" y1={plotH} x2={plotW} y2={plotH} stroke="rgba(255,255,255,0.06)" />
            </g>
          </g>

        </g>

      </svg>
    </div>
  );
}

   
function ExperimentVisualizer({ experimentId, params,meters, history = [], running }) {
    console.log(history)
  const latest = history.length ? history[history.length - 1] : { V: 0, I: 0, P: 0, extra: {} };
  const absI = Math.abs(latest.I || 0);
  const dotCount = clamp(Math.round(3 + absI * 6), 2, 24);
  const speed = clamp(1.6 / (absI + 0.01), 0.2, 4.5);

  // layout
  const svgW = 980;
  const svgH = 420;
  const safeNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};


  // Render per experiment custom content
  const renderMain = () => {
 if (experimentId === "rlc_resonance") {
  const { R = 10, L = 0.02, C = 1e-6, Vs = 1, autoSweep = true } = meters.extra ?? {};

  return (
    <foreignObject x="0" y="0" width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: "100%", height: "100%" }}>
        <RLCResonanceAnimated
          meters={{ R, L, C, Vs }}
          width={900}
          height={420}
          autoSweep={autoSweep}
        />
      </div>
    </foreignObject>
  );
}
// ======================================================
// Transformer Load Test & Efficiency – Animated Simulation
// ======================================================
else if (experimentId === "transformer_load") {
  const {
    Vs = 230,
    turnsRatio = 2,
    efficiency = 95,
    pf = 0.85,
    Vout = 115,
    loadPercent = 50,
  } = meters.extra ?? {};

  return (
    <foreignObject x="0" y="0" width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: "100%", height: "100%" }}>
        <TransformerLoadAnimated
          Vs={Vs}
          turnsRatio={turnsRatio}
          efficiency={efficiency}
          pf={pf}
          Vout={Vout}
          loadPercent={loadPercent}
          width={850}
          height={460}
        />
      </div>
    </foreignObject>
  );
}

else if (experimentId === "maxwell") {
  const Lx = meters.extra?.Lx ?? 0;       // in H
  const Rx = meters.extra?.Rx ?? 0;       // in ohms
  const Vout = meters.extra?.Vout ?? 0;   // measured detector voltage (V)
  const balanced = Math.abs(Vout) < 0.001;

  // balanceFactor = 1 when perfectly balanced, 0 when very unbalanced (used for brightness/damping)
  const balanceFactor = Math.max(0, 1 - Math.min(1, Math.abs(Vout) / 0.05));

  // Needle main static angle (degrees). Scaled from Vout: larger Vout = larger deflection
  const needleBaseAngle = Math.max(-35, Math.min(35, -Vout * 600));

  // Small oscillation amplitude (deg) that decays with balanceFactor
  const smallOsc = Math.max(0.5, (1 - balanceFactor) * 8);

  const glowColor = balanced ? "#22c55e" : "#ff9a4a";
  const accentOrange = "#ff9a4a";
  const accentBlue = "#46b3ff";

  // Convert Lx to mH for display
  const Lx_mH = (Lx * 1e3).toFixed(3);
  const Rx_display = Rx.toFixed(2);

  return (
    <svg width="760" height="420" viewBox="0 0 760 420" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Glow filter */}
        <filter id="maxwell-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Gradients */}
        <linearGradient id="coilGrad" x1="0" x2="1">
          <stop offset="0" stopColor="#b76b00" />
          <stop offset="0.6" stopColor="#ffb86b" />
          <stop offset="1" stopColor="#b76b00" />
        </linearGradient>

        <linearGradient id="metal" x1="0" x2="1">
          <stop offset="0" stopColor="#bfc7d6" />
          <stop offset="1" stopColor="#6b7280" />
        </linearGradient>

        {/* Arrow marker for current direction */}
        <marker id="dot-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={accentBlue} />
        </marker>

        {/* Wire stroke style */}
        <style>
          {`
            .wire { stroke: #222; stroke-width: 3; fill: none; }
            .wire-bright { stroke-width: 6; stroke-linecap: round; filter: url(#maxwell-glow); }
            .label { font-family: Inter, Arial, sans-serif; fill: #cbd5e1; font-size: 12px; }
            .title { font-family: Inter, Arial, sans-serif; fill: #ffd24a; font-size: 18px; font-weight: 700; }
            .readout { font-family: Inter, Arial, sans-serif; fill: #a3e635; font-size: 13px; }
          `}
        </style>
      </defs>

      {/* Background panel */}
      <rect x="0" y="0" width="760" height="420" fill="#0b0b0d" rx="8" />

      {/* Title */}
      <text x="24" y="34" className="title">Maxwell Bridge — Inductance Measurement</text>
      <text x="24" y="54" className="label">AC Source on left diagonal · Galvanometer on right diagonal</text>

      {/* Layout coordinates:
          Bridge diamond corners:
            top (350,70), left (120,200), right (580,200), bottom (350,330)
      */}
      {/* Bridge wires (paths) */}
      <path id="wireTop" className="wire" d="M350 70 L350 70" />

      {/* left diagonal: source from top-left to bottom-right? we'll place AC source at left-mid */}
      {/* Source circle (AC) */}
      <g transform="translate(40,180)">
        <circle cx="0" cy="0" r="34" fill="#111" stroke="#282828" strokeWidth="2" />
        <text x="-10" y="6" fill={accentOrange} fontSize="14" fontWeight="700">AC</text>
        {/* tiny animated waveform inside the source */}
        <path d="M-22 12 Q -11 -8 0 6 T 22 -4" stroke={accentBlue} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Bridge nodes */}
      {/* Top node */}
      <circle cx="350" cy="70" r="6" fill="#111" stroke="#444" />
      {/* Left node */}
      <circle cx="120" cy="200" r="6" fill="#111" stroke="#444" />
      {/* Right node */}
      <circle cx="580" cy="200" r="6" fill="#111" stroke="#444" />
      {/* Bottom node */}
      <circle cx="350" cy="330" r="6" fill="#111" stroke="#444" />

      {/* Wires between nodes (four arms) */}
      {/* Top -> Left (R1 arm) */}
      <path id="armR1" className="wire" d="M350 70 L220 140 L120 200" stroke={accentOrange} />
      {/* Top -> Right (R3 arm: resistor) */}
      <path id="armR3" className="wire" d="M350 70 L480 140 L580 200" stroke={accentBlue} />
      {/* Left -> Bottom (R2 arm) */}
      <path id="armR2" className="wire" d="M120 200 L220 260 L350 330" stroke={accentOrange} />
      {/* Right -> Bottom (Lx+Rx arm) */}
      <path id="armLx" className="wire" d="M580 200 L480 260 L350 330" stroke={accentBlue} />

      {/* Small bright overlay showing relative current (brightness scales with balanceFactor inverse) */}
      <path
        d="M350 70 L220 140 L120 200"
        className="wire-bright"
        stroke={accentOrange}
        style={{ opacity: 1 - balanceFactor, mixBlendMode: "screen" }}
      />
      <path
        d="M350 70 L480 140 L580 200"
        className="wire-bright"
        stroke={accentBlue}
        style={{ opacity: 1 - balanceFactor, mixBlendMode: "screen" }}
      />
      <path
        d="M120 200 L220 260 L350 330"
        className="wire-bright"
        stroke={accentOrange}
        style={{ opacity: 1 - balanceFactor, mixBlendMode: "screen" }}
      />
      <path
        d="M580 200 L480 260 L350 330"
        className="wire-bright"
        stroke={accentBlue}
        style={{ opacity: 1 - balanceFactor, mixBlendMode: "screen" }}
      />

      {/* Component visuals along arms */}
      {/* R1 visual (top-left) */}
      <g transform="translate(240,140) rotate(-30)">
        <rect x="-26" y="-8" width="52" height="16" rx="3" fill={accentOrange} />
        <text x="-34" y="-14" className="label">R1</text>
      </g>

      {/* R2 visual (left-bottom) */}
      <g transform="translate(200,250) rotate(20)">
        <rect x="-26" y="-8" width="52" height="16" rx="3" fill={accentOrange} />
        <text x="-36" y="-14" className="label">R2</text>
      </g>

      {/* R3 visual (top-right) — we'll render as a metallic resistor */}
      <g transform="translate(460,140) rotate(30)">
        <rect x="-26" y="-8" width="52" height="16" rx="3" fill={accentBlue} />
        <text x="-34" y="-14" className="label">C4</text>
      </g>

      {/* Capacitor (C4) — draw metallic plates near the R3 arm end */}
      <g transform="translate(530,160)">
        <rect x="-6" y="-20" width="12" height="40" fill="url(#metal)" rx="2" stroke="#2b2b2b" />
        <rect x="18" y="-20" width="12" height="40" fill="url(#metal)" rx="2" stroke="#2b2b2b" />
        <text x="-12" y="34" className="label">C4</text>
      </g>

      {/* Inductor coil (Lx) with Rx series — realistic coil drawing */}
      <g transform="translate(640,200)">
        {/* coil */}
        <g transform="translate(-120,-20) scale(1.0)">
          {/* draw several arcs to simulate coil */}
          {Array.from({ length: 7 }).map((_, i) => {
            const cx = -70 + i * 12;
            const cy = 0;
            const r = 10;
            const d = `M ${cx - 10} ${cy} q 6 -18 20 0`;
            return <path key={i} d={d} stroke="url(#coilGrad)" strokeWidth="6" fill="none" strokeLinecap="round" />;
          })}
          {/* label */}
          <text x="-38" y="34" className="label">Lₓ</text>
        </g>

        {/* series Rx box */}
        <rect x="-30" y="18" width="60" height="14" rx="3" fill="#111" stroke="#333" />
        <text x="-6" y="30" className="label">Rₓ</text>
      </g>

      {/* Galvanometer (Detector) on right diagonal */}
      <g transform="translate(420,200)">
        <g>
          <circle cx="60" cy="0" r="44" fill="#101113" stroke="#2b2b2b" strokeWidth="2" />
          <text x="36" y="6" fill={glowColor} fontSize="11" fontWeight="700">G</text>

          {/* scale ticks */}
          <g transform="translate(60,0)">
            {[-35, -25, -15, -5, 0, 5, 15, 25, 35].map((a, i) => {
              const rad = (a * Math.PI) / 180;
              const x1 = Math.cos(rad) * -28;
              const y1 = Math.sin(rad) * -28;
              const x2 = Math.cos(rad) * -34;
              const y2 = Math.sin(rad) * -34;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2f3136" strokeWidth={a % 10 === 0 ? 2 : 1} />;
            })}
          </g>

          {/* needle group: rotate center at (60,0) */}
          <g transform={`translate(60,0)`}>
            {/* animate a small oscillation whose amplitude is smallOsc and whose presence decays with balanceFactor */}
            <g
              transform={`rotate(${needleBaseAngle})`}
            >
              {/* additive oscillation */}
              <animateTransform
                attributeName="transform"
                type="rotate"
                values={`${needleBaseAngle - smallOsc}; ${needleBaseAngle + smallOsc}; ${needleBaseAngle - smallOsc}`}
                dur="0.9s"
                repeatCount={balanced ? "1" : "indefinite"}
                begin="0s"
                additive="replace"
              />
              <line x1="0" y1="0" x2="36" y2="0" stroke={glowColor} strokeWidth="3" strokeLinecap="round" />
              <circle cx="0" cy="0" r="3" fill="#111" stroke="#444" />
            </g>
          </g>

          {/* detector label */}
          <text x="16" y="68" className="label">Null Detector</text>
        </g>
      </g>

      {/* Animated moving dots (current) along each arm */}
      {/* Using small circles that follow arm paths with animateMotion.
          Dur is 0.9s; offset using begin attr to get splitting visual. Opacity scales with imbalance. */}
      <g style={{ opacity: 1 }}>
        {/* R1 arm current */}
        <circle r="4" fill={accentOrange} filter="url(#maxwell-glow)" style={{ opacity: 0.9 - balanceFactor * 0.6 }}>
          <animateMotion dur="0.9s" repeatCount="indefinite" path="M350 70 L220 140 L120 200" begin="0s" />
        </circle>

        {/* R3 arm current */}
        <circle r="4" fill={accentBlue} filter="url(#maxwell-glow)" style={{ opacity: 0.9 - balanceFactor * 0.6 }}>
          <animateMotion dur="0.9s" repeatCount="indefinite" path="M350 70 L480 140 L580 200" begin="0.15s" />
        </circle>

        {/* R2 arm current (bottom-left) */}
        <circle r="4" fill={accentOrange} filter="url(#maxwell-glow)" style={{ opacity: 0.9 - balanceFactor * 0.6 }}>
          <animateMotion dur="0.9s" repeatCount="indefinite" path="M120 200 L220 260 L350 330" begin="0.3s" />
        </circle>

        {/* Lx arm current (bottom-right) */}
        <circle r="4" fill={accentBlue} filter="url(#maxwell-glow)" style={{ opacity: 0.9 - balanceFactor * 0.6 }}>
          <animateMotion dur="0.9s" repeatCount="indefinite" path="M580 200 L480 260 L350 330" begin="0.45s" />
        </circle>
      </g>

      {/* Output indicator arrow (Vout) */}
      <g>
        <line x1="280" y1="200" x2="320" y2="200" stroke={glowColor} strokeWidth={3} markerEnd="url(#dot-arrow)" style={{ opacity: 0.9 - balanceFactor * 0.6 }} />
        <text x="238" y="190" className="label">Vout</text>
      </g>

      {/* Readouts */}
      <g transform="translate(24,300)">
        <text x="0" y="0" className="label">Lₓ:</text>
        <text x="44" y="0" className="readout">{Lx_mH} mH</text>

        <text x="0" y="22" className="label">Rₓ:</text>
        <text x="44" y="22" className="readout">{Rx_display} Ω</text>

        <text x="0" y="44" className="label">Bridge:</text>
        <text x="68" y="44" style={{ fill: balanced ? "#22c55e" : "#ff9a4a", fontSize: 13, fontWeight: 600 }}>
          {balanced ? "Balanced" : "Unbalanced"}
        </text>

        <text x="0" y="66" className="label">Vout (detector):</text>
        <text x="120" y="66" className="readout">{Vout.toFixed(4)} V</text>
      </g>

      {/* Legend / small UI hints */}
      <g transform="translate(520,300)">
        <rect x="-8" y="-28" width="220" height="86" rx="8" fill="#08080a" stroke="#1f2937" />
        <text x="6" y="-6" className="label">Visual cues</text>
        <g transform="translate(6,6)">
          <rect x="0" y="6" width="18" height="8" rx="2" fill={accentOrange} />
          <text x="28" y="12" className="label">Resistive arms (R1 / R2)</text>

          <rect x="0" y="26" width="18" height="8" rx="2" fill={accentBlue} />
          <text x="28" y="32" className="label">Reactive arm (Lₓ + Rₓ / C₄)</text>

          <circle cx="8" cy="50" r="6" fill={glowColor} filter="url(#maxwell-glow)" />
          <text x="28" y="54" className="label">Detector brightness → imbalance</text>
        </g>
      </g>
    </svg>
  );
}

else if (experimentId === "synchronous_vcurve") {
  // Parameters (fall back to sensible defaults)
  const Vs = Number(params.Vs) || 230; // Supply voltage
  const Ra = Number(params.Ra) || 1.2; // Armature resistance
  const Xs = Number(params.Xs) || 12; // Synchronous reactance
  const If = Math.max(0, Number(params.If) || 3); // Field current (A)
  const Pload = Number(params.Pload) || 500; // Load power (W)

  // --- Physical-ish model for visuals (simple, explanatory) ---
  const If_opt = 3; // excitation at which Ia is minimum (center of V)
  const Ia_min = 5; // lowest armature current (A) at optimal excitation
  const Ia_slope = 3.5; // how fast Ia rises when away from If_opt
  // compute instantaneous armature current magnitude (simple V-curve)
  const Ia = Ia_min + Ia_slope * Math.abs(If - If_opt);

  // phase shift for leading/lagging current (visual phasor)
  const phiDeg = If < If_opt ? 25 : If > If_opt ? -25 : 0;
  const phi = (phiDeg * Math.PI) / 180;

  // time for animation
  const t = (performance.now() || 0) / 1000; // seconds

  // rotor rotation angle (deg)
  const rotorSpeedRpm = 60; // arbitrary smooth speed
  const rotorAngle = (t * rotorSpeedRpm * 360 / 60) % 360;

  // glow intensities (bigger glow if Ia larger)
  const glowStrength = Math.min(1.8, 0.6 + Ia / 20);

  // V-curve polyline coordinates (If axis 0..6, Ia computed)
  const vCurvePoints = [];
  for (let i = 0; i <= 60; i++) {
    // map i to If range 0..6 A (fine resolution)
    const if_val = (i / 60) * 6;
    const ia_val = Ia_min + Ia_slope * Math.abs(if_val - If_opt);
    // chart box: width 240, height 120, origin at (40,30)
    const x = 40 + (if_val / 6) * 220;
    const y = 30 + (1 - (ia_val - Ia_min) / (Ia_min + Ia_slope * 3.2)) * 100;
    vCurvePoints.push(`${x},${y}`);
  }
  const vCurvePath = vCurvePoints.join(" ");

  // compute current marker position on V-curve for *actual* If
  const markerX = 40 + (If / 6) * 220;
  const markerY = 30 + (1 - (Ia - Ia_min) / (Ia_min + Ia_slope * 3.2)) * 100;

  // generate moving dots along stator (loop) and rotor (circle)
  const statorDots = Array.from({ length: 8 }, (_, k) => {
    // param u along the loop 0..1, offset by index
    const u = ((t * 0.15) + k * 0.125) % 1;
    // parametric loop (rounded rectangle-ish) for stator wiring
    const cx = 120 + 160 * Math.cos(u * Math.PI * 2);
    const cy = 120 + 60 * Math.sin(u * Math.PI * 2) * 0.9;
    return { x: cx, y: cy, alpha: 0.6 + 0.4 * Math.sin(t * 6 + k) };
  });

  const rotorDots = Array.from({ length: 6 }, (_, k) => {
    const u = ((t * 0.7) + k * 0.17) % 1;
    const r = 40;
    const cx = 420 + r * Math.cos((u * 2 * Math.PI) + rotorAngle * Math.PI / 180);
    const cy = 120 + r * Math.sin((u * 2 * Math.PI) + rotorAngle * Math.PI / 180);
    return { x: cx, y: cy, alpha: 0.7 + 0.3 * Math.cos(t * 4 + k) };
  });

  // small helper to format numeric label
  const fmt = (v, d = 1) => Number(v).toFixed(d);

  return (
    <g transform="translate(8,8)" fontFamily="Inter, Arial, sans-serif">
      {/* overall background panel */}
      <rect x="0" y="0" width="980" height="420" rx="12" fill="#040405" stroke="#111" strokeWidth="1.2" />

      {/* Title */}
      <text x="20" y="28" fontSize="16" fill="#ffd24a" fontWeight="700">Synchronous Motor — Realistic V-Curve Lab Simulation</text>
      <text x="22" y="46" fontSize="11" fill="#9aa2ad">Three-phase stator, rotor with DC field via slip rings, dynamic meters and V-curve trace</text>

      {/* ===========================
          Left: Motor Schematic + Flux
         =========================== */}
      <g transform="translate(30,60)">
        {/* stator frame */}
        <rect x="10" y="10" width="240" height="200" rx="8" fill="#060607" stroke="#20242b" strokeWidth="1.5" />
        <text x="80" y="24" fill="#9aa2ad" fontSize="11">Stator (Armature) Windings</text>

        {/* stator winding representation (multiple loops) */}
        <g>
          {[...Array(5)].map((_, i) => {
            const y = 50 + i * 28;
            return (
              <path
                key={i}
                d={`M30 ${y} C60 ${y-18}, 190 ${y-18}, 220 ${y}`}
                fill="none"
                stroke="#15304a"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.95"
              />
            );
          })}
        </g>

        {/* moving current dots on stator paths (approx positions) */}
        {statorDots.map((d, i) => (
          <circle key={`s${i}`} cx={d.x - 60} cy={d.y - 40} r={Math.max(1.8, 2.2 + (Ia / 20))} fill="#00d6b6" opacity={Math.max(0.25, d.alpha)} />
        ))}

        {/* stator ammeter */}
        <g transform="translate(100,180)">
          <circle r="24" cx="0" cy="0" fill="#060607" stroke="#222" strokeWidth="2" />
          <text x="-12" y="6" fill="#ffd24a" fontSize="12">Ia</text>
          <line x1="0" y1="0" x2={20 * Math.cos((-90 + (Ia * 6)) * Math.PI / 180)} y2={20 * Math.sin((-90 + (Ia * 6)) * Math.PI / 180)} stroke="#ff7a2d" strokeWidth="2.6" strokeLinecap="round" />
          <text x="36" y="6" fill="#9aa2ad" fontSize="10">{fmt(Ia,2)} A</text>
        </g>

        {/* connection to AC supply (three-phase dots) */}
        <g transform="translate(10,30)">
          <text x="0" y="-6" fill="#9aa2ad" fontSize="10">AC Supply</text>
          {[0,1,2].map((p, i) => (
            <g key={i} transform={`translate(${15 + i * 10}, 0)`}>
              <circle r="3.5" fill={["#ff7a2d","#ffd24a","#00d6b6"][i]} stroke="#000" />
            </g>
          ))}
        </g>
      </g>

      {/* ===========================
          Center: Rotor, Field Rheostat, Flux
         =========================== */}
      <g transform="translate(20,60)">
        {/* rotor housing */}
        <g transform={`translate(420,120)`}>
          <circle r="72" fill="#070708" stroke="#222" strokeWidth="2" />
          {/* rotor (rotating) */}
          <g transform={`rotate(${rotorAngle})`}>
            <g>
              <circle r="40" fill="url(#metalGrad)" stroke="#394047" strokeWidth="1.6" />
              {/* field winding representation */}
              <path d="M-28,-6 L-8,-18 L8,-18 L28,-6" fill="none" stroke="#1f3c77" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M-28,6 L-8,18 L8,18 L28,6" fill="none" stroke="#1f3c77" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {/* brushes/slip rings */}
              <circle cx="-46" cy="0" r="6" fill="#2b2b2b" stroke="#111" />
              <circle cx="46" cy="0" r="6" fill="#2b2b2b" stroke="#111" />
            </g>
          </g>

          {/* rotor moving dots (represent current flow) */}
          {rotorDots.map((d, i) => (
            <circle key={`r${i}`} cx={d.x - 420} cy={d.y - 120} r={2.8 + (Ia / 24)} fill="#ffb072" opacity={Math.max(0.2, d.alpha)} />
          ))}

          {/* rotating flux lines (soft glowing) */}
          {[0,1,2,3].map((s, i) => {
            const ang = rotorAngle * (1 + i * 0.06);
            return (
              <ellipse
                key={`flux${i}`}
                cx="0"
                cy="0"
                rx={60 + i * 6}
                ry={32 + i * 3}
                transform={`rotate(${ang})`}
                fill="none"
                stroke="#2a9cff"
                strokeWidth={0.8 + i*0.4}
                opacity={0.06 + i * 0.03 * glowStrength}
                strokeDasharray="6 8"
              />
            );
          })}

          {/* labels */}
          <text x="-60" y="98" fill="#9aa2ad" fontSize="11">Rotor (Field winding)</text>
          <text x="36" y="-40" fill="#ffd24a" fontSize="10">Field current If = {fmt(If,2)} A</text>
        </g>

        {/* Field rheostat and DC source (visual) */}
        <g transform="translate(340,40)">
          <rect x="-28" y="-18" width="56" height="36" rx="6" fill="#060607" stroke="#222" strokeWidth="1.2" />
          <text x="-24" y="-4" fontSize="10" fill="#9aa2ad">Field Rheostat</text>
          <rect x="-22" y="6" width="44" height="6" rx="3" fill="#0b1620" stroke="#112" />
          {/* slider pos based on If */}
          <rect x={-22 + Math.min(1, If/6) * 44 - 4} y="2" width="8" height="12" rx="2" fill="#ff7a2d" />
          <text x="-48" y="28" fill="#9aa2ad" fontSize="10">DC Excitation</text>
          <circle cx="0" cy="44" r="8" fill="#00d6b6" />
        </g>
      </g>

      {/* ===========================
          Right: Dynamic V-Curve Panel & Meters
         =========================== */}
      <g transform="translate(610,60)">
        <rect x="0" y="0" width="380" height="240" rx="10" fill="#060607" stroke="#222" strokeWidth="1.5" />
        <text x="16" y="18" fill="#ffd24a" fontSize="13">Real-time V-Curve (Armature current Ia vs Field current If)</text>
        <text x="18" y="34" fill="#9aa2ad" fontSize="10">Marker: current operating point</text>

        {/* axes */}
        <line x1="36" y1="30" x2="36" y2="170" stroke="#333" strokeWidth="1.2" />
        <line x1="36" y1="170" x2="280" y2="170" stroke="#333" strokeWidth="1.2" />
        <text x="16" y="26" fill="#9aa2ad" fontSize="9">Ia</text>
        <text x="282" y="186" fill="#9aa2ad" fontSize="9">If (A)</text>

        {/* V-curve path */}
        <polyline points={vCurvePath} fill="none" stroke="#00d6b6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />

        {/* subtle baseline grid */}
        {[0,1,2,3,4].map((g,i) => (
          <line key={i} x1="36" x2="280" y1={50 + i * 30} y2={50 + i * 30} stroke="#0c1114" strokeWidth="1" />
        ))}

        {/* dynamic operating marker (pulses with Ia) */}
        <g transform={`translate(${markerX},${markerY})`}>
          <circle r={6 + Math.min(6, Ia / 3)} fill="#ff7a2d" opacity={0.95} filter="url(#softGlowOrange)" />
          <circle r={3} fill="#fff" opacity="0.9" />
        </g>

        {/* textual readouts */}
        <text x="36" y="196" fill="#9aa2ad" fontSize="11">If (Field) : <tspan fill="#ffd24a">{fmt(If,2)} A</tspan></text>
        <text x="36" y="212" fill="#9aa2ad" fontSize="11">Ia (Armature): <tspan fill="#ffd24a">{fmt(Ia,2)} A</tspan></text>

        {/* small digital phasor meter */}
        <g transform="translate(200,-40)">
          <rect x="-44" y="-18" width="96" height="44" rx="8" fill="#050607" stroke="#222" />
          <text x="-36" y="-2" fill="#9aa2ad" fontSize="9">Phasor</text>
          {/* phasor lines */}
          <line x1="0" y1="8" x2={30 * Math.cos(t)} y2={8 - 30 * Math.sin(t)} stroke="#ffd24a" strokeWidth="3" strokeLinecap="round" />
          <line x1="0" y1="8" x2={30 * Math.cos(t + phi)} y2={8 - 30 * Math.sin(t + phi)} stroke="#00d6b6" strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>

      {/* ===========================
          Bottom: Larger Waveform (Voltage & Current)
         =========================== */}
      <g transform="translate(30,290)">
        <rect x="0" y="0" width="920" height="110" rx="8" fill="#060607" stroke="#222" strokeWidth="1.2" />
        <text x="12" y="16" fill="#ffd24a" fontSize="12">Voltage & Current Waveforms (synthetic)</text>

        {/* synthetic wave points */}
        {Array.from({ length: 280 }).map((_, i) => {
          const x = 12 + i * 3;
          // voltage waveform
          const v = 46 + 28 * Math.sin((i / 28) * Math.PI * 2 + t * 2);
          // current waveform lags/leads by phi and amplitude scales with Ia
          const iWave = 46 + (16 + Ia * 1.5) * Math.sin((i / 28) * Math.PI * 2 + t * 2 + phi);
          return (
            <g key={i}>
              <rect x={x} y={v} width="2" height="1.6" fill="#ffd24a" opacity="0.95" />
              <rect x={x} y={iWave} width="2" height="1.6" fill="#00d6b6" opacity="0.9" />
            </g>
          );
        })}

        {/* legend */}
        <rect x="780" y="12" width="124" height="32" rx="6" fill="#050607" stroke="#111" />
        <circle cx="792" cy="24" r="5" fill="#ffd24a" />
        <text x="804" y="28" fill="#9aa2ad" fontSize="10">Voltage (V)</text>
        <circle cx="892" cy="24" r="5" fill="#00d6b6" />
        <text x="904" y="28" fill="#9aa2ad" fontSize="10">Current (Ia)</text>
      </g>

      {/* ===========================
          SVG defs and filters for glow / metal gradient
         =========================== */}
      <defs>
        <radialGradient id="metalGrad" cx="50%" cy="40%">
          <stop offset="0%" stopColor="#2f3940" />
          <stop offset="60%" stopColor="#1a2227" />
          <stop offset="100%" stopColor="#0a0d0f" />
        </radialGradient>

        <filter id="softGlowOrange" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={4 * glowStrength} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="softGlowBlue" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={3 * glowStrength} result="blurB" />
          <feMerge>
            <feMergeNode in="blurB" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="strongOuter" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation={6 * glowStrength} result="outer" />
          <feMerge>
            <feMergeNode in="outer" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </g>
  );
}

 else if (experimentId === "induction_locked") {
  // input / fallback values
  const V = Number(params.Vs) || 230;
  const f = Number(params.freq) || 50;
  const testMode = params.testMode || "no_load"; // "no_load" or "blocked_rotor"
  const torque = meters.extra?.torque || 0;
  const slip = meters.extra?.slip ?? 0;
  const I = meters.I ?? 0;
  const P = meters.P ?? 0;

  // rotor motion - no-load runs near synchronous (1 - slip), blocked rotor locked
  const rotorSpeed = testMode === "no_load" ? (1 - slip) * 360 : 0; // degrees/sec approx
  const nowSec = performance.now() / 1000;
  const rotorAngle = (nowSec * rotorSpeed) % 360;

  // magnetics pulsing factor (0..1) increases for blocked rotor (stronger currents)
  const currentIntensity = Math.min(1, (I / Math.max(1, (testMode === "no_load" ? 5 : 50))) + (testMode === "blocked_rotor" ? 0.6 : 0.0));

  // meter needle angles (visual mapping)
  const ampNeedleAngle = -60 + Math.min(120, I * 5); // clamp
  const wattNeedleAngle = -60 + Math.min(120, (P / Math.max(1, V * I)) * 120);

  // helper for phase coil positions
  const coilPositions = [
    { angle: -90, color: "#ff7a2d", id: "A" }, // phase A - orange
    { angle: 30, color: "#4ac7ff", id: "B" }, // phase B - cyan
    { angle: 150, color: "#8be04a", id: "C" }, // phase C - greenish
  ];

  return (
    <g transform="translate(40,20)">
      {/* Embedded SVG styles for glow + animations */}
      <style>{`
        .bg-rect { fill: #000; }
        .panel { fill: #000; stroke: #222; }
        .metal-grad { filter: url(#); }
        .glow { filter: url(#softGlow); }
        .field-arc { stroke-width: 2.2; stroke-linecap: round; fill: none; opacity: 0.9; }
        .coil-wire { stroke-linecap: round; stroke-width: 10; stroke-opacity: 0.95; }
        .moving-dot { fill: white; opacity: 0.95; }
        .meter-face { fill: #060607; stroke: #2b2b2b; }
        .label { fill: #cfcfcf; font-size:12px; font-family:Inter, system-ui, sans-serif; }
        /* pulsing stroke-dasharray animation for magnetic arcs */
        @keyframes pulseArc {
          0% { stroke-opacity: 0.45; stroke-width: 1.6; }
          50% { stroke-opacity: 1.0; stroke-width: 3.2; }
          100% { stroke-opacity: 0.45; stroke-width: 1.6; }
        }
        .arcPulse { animation: pulseArc ${1000 / f}ms linear infinite; transform-origin: center; }
        /* small flicker for meter needle */
        @keyframes needleFlick {
          0% { transform: rotate(0deg); }
          50% { transform: rotate(0.6deg); }
          100% { transform: rotate(0deg); }
        }
        .needle { transform-origin: center; animation: needleFlick 540ms ease-in-out infinite; }
      `}</style>

      {/* defs: gradients and filters */}
      <defs>
        <radialGradient id="bodyGlow" cx="40%" cy="30%">
          <stop offset="0%" stopColor="#222" />
          <stop offset="100%" stopColor="#070707" />
        </radialGradient>

        <linearGradient id="metalL" x1="0" x2="1">
          <stop offset="0%" stopColor="#1a1a1a" />
          <stop offset="50%" stopColor="#2a2a2a" />
          <stop offset="100%" stopColor="#111" />
        </linearGradient>

        <filter id="metalGloss" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feSpecularLighting in="b" specularConstant="0.6" specularExponent="12" lightingColor="#ffffff" surfaceScale="1">
            <fePointLight x="-100" y="-200" z="300" />
          </feSpecularLighting>
          <feComposite operator="over" in2="SourceGraphic" />
        </filter>

        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* small dashed path for animation motion along coil */}
        <path id="coilPathA" d="M-80,-10 C-40,-50 40,-50 80,-10" fill="none" />
        <path id="coilPathB" d="M80,10 C40,50 -40,50 -80,10" fill="none" />
      </defs>

      {/* Background and header */}
      <rect className="bg-rect" x="-10" y="-10" width="980" height="420" rx="12" />
      <text x="12" y="12" fill="#ffd24a" fontSize="16" fontWeight="700">Induction Motor — {testMode === "no_load" ? "No-Load Test" : "Blocked Rotor Test"}</text>
      <text x="12" y="30" fill="#9aa0a6" fontSize="11">Three-phase squirrel-cage motor visualization · V: {V}V · f: {f}Hz</text>

      {/* Motor assembly group */}
      <g transform="translate(220,220)">
        {/* motor housing (3D-ish) */}
        <g className="metal-grad" transform="translate(0,0)">
          <ellipse cx="0" cy="6" rx="220" ry="36" fill="url(#metalL)" opacity="0.47" />
          <rect x="-200" y="-100" width="400" height="200" rx="20" fill="url(#bodyGlow)" stroke="#1b1b1b" strokeWidth="1.5" />
          <rect x="-190" y="-92" width="380" height="184" rx="18" fill="url(#metalL)" stroke="#121212" strokeWidth="0.6" />
        </g>

        {/* stator - three coil groups around rotor */}
        <g transform="translate(0,0)">
          {coilPositions.map((phase, idx) => {
            // compute coil transform (radial placement)
            const theta = (phase.angle * Math.PI) / 180;
            const cx = Math.cos(theta) * 110;
            const cy = Math.sin(theta) * 50;
            const rotate = phase.angle + 90;
            return (
              <g key={phase.id} transform={`translate(${cx}, ${cy}) rotate(${rotate})`} >
                {/* coil wire arc */}
                <path
                  d="M -70,0 C -40,-30 40,-30 70,0"
                  className="coil-wire"
                  stroke={phase.color}
                  strokeWidth={testMode === "blocked_rotor" ? 12 : 8}
                  strokeOpacity={0.7 + 0.2 * currentIntensity}
                  fill="none"
                  filter="url(#softGlow)"
                />
                {/* terminal connector */}
                <circle cx={-82} cy={0} r={4} fill="#ffd24a" />
                <text x={-92} y={-10} className="label" fontSize="11">{phase.id}</text>

                {/* moving current dots along the coil path */}
                <g>
                  {/* animateMotion uses the path coordinates relative to this group; duplicate paths for motion */}
                  <path id={`motionPath${phase.id}`} d="M -70,0 C -40,-30 40,-30 70,0" fill="none" opacity="0" />
                  {/* multiple dots to indicate flow */}
                  {[0, 0.33, 0.66].map((off, i) => (
                    <circle
                      key={i}
                      r={3 + (i === 1 ? 1 : 0)}
                      className="moving-dot"
                      style={{ opacity: 0.85 * currentIntensity }}
                      >
                      <animateMotion
                        dur={`${(1 / f) * (testMode === "blocked_rotor" ? 0.8 : 1.8)}s`}
                        repeatCount="indefinite"
                        begin={`${i * (1 / (3 * f))}s`}
                        calcMode="linear"
                        keyPoints="0;1"
                        keyTimes="0;1"
                      >
                        <mpath xlinkHref={`#motionPath${phase.id}`} />
                      </animateMotion>
                    </circle>
                  ))}
                </g>
              </g>
            );
          })}
        </g>

        {/* rotor - cage */}
        <g transform={`rotate(${rotorAngle})`} >
          {/* rotor body */}
          <g>
            <ellipse cx="0" cy="0" rx="72" ry="70" fill="#0b0b0b" stroke="#2b2b2b" strokeWidth="2" />
            {/* cage bars */}
            {Array.from({ length: 14 }).map((_, i) => {
              const a = (i * 360) / 14;
              const x1 = Math.cos((a * Math.PI) / 180) * 72 * 0.86;
              const y1 = Math.sin((a * Math.PI) / 180) * 70 * 0.86;
              const x2 = Math.cos((a * Math.PI) / 180) * 36;
              const y2 = Math.sin((a * Math.PI) / 180) * 36;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#ffb77a"
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={testMode === "blocked_rotor" ? 1.0 : 0.85}
                />
              );
            })}
            <circle r="6" fill="#fff" />
          </g>
        </g>

        {/* magnetic field arcs around rotor (three-phase resultant rotating field) */}
        <g>
          {[0, 120, 240].map((phaseAngle, idx) => {
            const phaseColor = idx === 0 ? "#ff7a2d" : idx === 1 ? "#4ac7ff" : "#8be04a";
            // time-varying offset to simulate rotation of magnetic wave
            const rot = ((nowSec * f * 360) / 2) % 360 * (testMode === "blocked_rotor" ? 0.25 : 1);
            return (
              <g key={idx} transform={`rotate(${rot})`}>
                <path
                  d="M -120,-60 C -50,-120 50,-120 120,-60"
                  className="field-arc arcPulse glow"
                  stroke={phaseColor}
                  strokeOpacity={0.25 + 0.6 * currentIntensity}
                  style={{ animationDuration: `${1200 / f}ms` }}
                  transform={`rotate(${phaseAngle}) scale(${1.0 + 0.14 * currentIntensity})`}
                />
              </g>
            );
          })}
        </g>

        {/* rotor label */}
        <text x="-28" y="110" fill="#bdbdbd" fontSize="12">Rotor (Squirrel-cage)</text>
      </g>

      {/* Left: Instruments cluster */}
      <g transform="translate(500,70)">
        <rect className="panel" x="0" y="0" width="180" height="210" rx="8" />
        <text x="12" y="20" className="label" fontSize="12">Instruments</text>

        {/* Ammeter (visual needle) */}
        <g transform="translate(40,90)">
          <circle className="meter-face" r="34" />
          <text x="-10" y="48" className="label" fontSize="10">A</text>
          {/* needle calculated above */}
          <g transform={`rotate(${ampNeedleAngle})`} className="needle">
            <rect x="-2" y="-28" width="4" height="28" rx="2" />
            <circle r="3" cx="0" cy="0" fill="#fff" />
          </g>
          <text x="-8" y="65" className="label">{I.toFixed(2)} A</text>
        </g>

        {/* Wattmeter */}
        <g transform="translate(130,90)">
          <circle className="meter-face" r="34" />
          <text x="-10" y="48" className="label" fontSize="10">W</text>
          <g transform={`rotate(${wattNeedleAngle})`} className="needle">
            <rect x="-2" y="-28" width="4" height="28" rx="2" />
            <circle r="3" cx="0" cy="0" fill="#fff" />
          </g>
          <text x="-18" y="65" className="label">{P.toFixed(0)} W</text>
        </g>

        {/* small readouts */}
        <text x="12" y="180" className="label" fontSize="11">Slip: {slip.toFixed(3)}</text>
        <text x="12" y="200" className="label" fontSize="11">Torque: {torque.toFixed(2)} N·m</text>
      </g>

      {/* Right: Connections / Terminal block + indicators */}
      <g transform="translate(740,70)">
        <rect className="panel" x="0" y="0" width="200" height="300" rx="8" />
        <text x="12" y="20" className="label">Connections & Status</text>

        {/* three-phase terminal block */}
        <g transform="translate(24,48)">
          <text x="0" y="-6" className="label">Stator Terminals</text>
          {["A", "B", "C"].map((t, i) => (
            <g key={t} transform={`translate(0, ${i * 28})`}>
              <rect x="0" y="0" width="140" height="18" rx="6" fill="#0b0b0b" stroke="#1a1a1a" />
              <circle cx="12" cy="9" r="5" fill={i === 0 ? "#ff7a2d" : i === 1 ? "#4ac7ff" : "#8be04a"} className="glow" />
              <text x="28" y="13" className="label">{t} — Terminal</text>
            </g>
          ))}
        </g>

        {/* test mode indicator */}
        <g transform="translate(14,170)">
          <text x="0" y="0" className="label">Test Condition</text>
          <rect x="0" y="8" width="170" height="50" rx="6" fill={testMode === "no_load" ? "#0e1110" : "#120a0a"} stroke="#222" />
          <text x="10" y="32" fill={testMode === "no_load" ? "#ffd24a" : "#ff6a6a"} fontWeight="700">
            {testMode === "no_load" ? "NO-LOAD" : "BLOCKED ROTOR"}
          </text>
          <text x="10" y="52" className="label" fontSize="11">Vol: {V} V · Freq: {f} Hz</text>
        </g>

        {/* simple animated current bar */}
        <g transform="translate(16,250)">
          <text x="0" y="0" className="label">Current (relative)</text>
          <rect x="0" y="6" width="160" height="14" rx="6" fill="#0b0b0b" stroke="#1a1a1a" />
          <rect x="2" y="8" width={Math.max(6, Math.min(156, currentIntensity * 156))} height="10" rx="5" fill="#ff7a2d" opacity={0.9} />
        </g>
      </g>

      {/* bottom: subtle caption and legend */}
      <g transform="translate(12,360)">
        <text className="label">Legend:</text>
        <g transform="translate(64, -8)">
          <rect x="0" y="0" width="12" height="8" fill="#ff7a2d" /> <text x="18" y="8" className="label">Phase A</text>
        </g>
        <g transform="translate(160, -8)">
          <rect x="0" y="0" width="12" height="8" fill="#4ac7ff" /> <text x="18" y="8" className="label">Phase B</text>
        </g>
        <g transform="translate(260, -8)">
          <rect x="0" y="0" width="12" height="8" fill="#8be04a" /> <text x="18" y="8" className="label">Phase C</text>
        </g>
        <text x="420" y="8" className="label">Glowing arcs = rotating magnetic field · Dots = current flow</text>
      </g>
    </g>
  );
}

else if (experimentId === "synchronization") {
  const freqBus = toNum(params.freqBus) || 50;
  const freqAlt = toNum(params.freqAlt) || 49.5;
  const deltaF = freqAlt - freqBus;
  const t = (performance.now() / 1000) % 1000;
  const phaseDiff = (t * deltaF * 360) % 360;
  const synced = Math.abs(phaseDiff) < 5;

  // Lamp brightness calculation
  const lampBrightness = (offset) => {
    const val = 0.5 + 0.5 * Math.cos(((phaseDiff + offset) * Math.PI) / 180);
    return Math.min(1, Math.max(0, val));
  };

  const lampColor = (offset) => {
    const intensity = lampBrightness(offset);
    return synced
      ? "#00ffbf"
      : `rgba(255, 212, 74, ${0.3 + 0.7 * intensity})`;
  };

  // Phasor angles
  const angleBus = (t * freqBus * 360) % 360;
  const angleAlt = (t * freqAlt * 360) % 360;

  // Helper for rotor flux animation
  const rotorFlux = (radius, step) => {
    const arrows = [];
    for (let i = 0; i < 8; i++) {
      const angle = ((i * 360) / 8 + t * step * 60) % 360;
      arrows.push(
        <line
          key={i}
          x1={0}
          y1={0}
          x2={radius * Math.cos((Math.PI / 180) * angle)}
          y2={radius * Math.sin((Math.PI / 180) * angle)}
          stroke="#00bfff"
          strokeWidth="1"
          strokeLinecap="round"
        />
      );
    }
    return arrows;
  };

  // Animated waveform points
  const waveformPoints = Array.from({ length: 200 }, (_, i) => {
    const x = 10 + i * 4;
    const yBus = 60 - 40 * Math.sin((2 * Math.PI * freqBus * (i / 200)));
    const yAlt = 60 - 40 * Math.sin(
      (2 * Math.PI * freqAlt * (i / 200)) + (phaseDiff * Math.PI / 180)
    );
    return { x, yBus, yAlt };
  });

  return (
    <g transform="translate(20,20)">
      {/* Background */}
      <rect width="1200" height="600" fill="#0b0b0c" rx="10" />

      {/* Title */}
      <text x="20" y="20" fontSize="18" fill="#ffd24a" fontWeight="bold">
        Alternator Synchronization Experiment
      </text>

      {/* Bus Alternator */}
      <g transform="translate(120,150)">
        {/* Stator */}
        <circle r="55" fill="#111" stroke="#444" strokeWidth="4" strokeDasharray="6 6" />
        {/* Rotor */}
        <g transform={`rotate(${angleBus})`}>
          <line x1="0" y1="0" x2="45" y2="0" stroke="#00bfff" strokeWidth="4" strokeLinecap="round"/>
          <circle r="45" fill="none" stroke="#00bfff" strokeWidth="1" strokeDasharray="4 4"/>
          {rotorFlux(45, freqBus)}
        </g>
        <text x="-45" y="90" fill="#aaa" fontSize="12">Bus Alternator</text>
      </g>

      {/* Incoming Alternator */}
      <g transform="translate(350,140)">
        <circle r="55" fill="#111" stroke="#444" strokeWidth="4" strokeDasharray="6 6" />
        <g transform={`rotate(${angleAlt})`}>
          <line x1="0" y1="0" x2="45" y2="0" stroke="#ff7a2d" strokeWidth="4" strokeLinecap="round"/>
          <circle r="45" fill="none" stroke="#ff7a2d" strokeWidth="1" strokeDasharray="4 4"/>
          {rotorFlux(45, freqAlt)}
        </g>
        <text x="-45" y="90" fill="#aaa" fontSize="12">Incoming Alternator</text>
      </g>

      {/* Circuit breaker / Connection */}
      <g transform="translate(180,260)">
        <rect x="0" y="0" width="260" height="6" rx="3" fill={synced ? "#00ffbf" : "#222"} />
        <rect x="120" y="-8" width="20" height="22" rx="4" fill={synced ? "#00ffbf" : "#444"} stroke="#000" strokeWidth="1"/>
        <text x="70" y="40" fill={synced ? "#00ffbf" : "#999"} fontSize="12" textAnchor="middle">
          {synced ? "Breaker Closed — Synchronized" : "Open Circuit"}
        </text>
      </g>

      {/* Animated current flow */}
      <g transform="translate(190,260)">
        <line
          x1="0" y1="3" x2="260" y2="3"
          stroke="#ff7a2d" strokeWidth="2" strokeLinecap="round"
          strokeDasharray="5 5" strokeDashoffset={-t*100}
        />
        <line
          x1="0" y1="9" x2="260" y2="9"
          stroke="#00bfff" strokeWidth="2" strokeLinecap="round"
          strokeDasharray="5 5" strokeDashoffset={t*80}
        />
      </g>

      {/* Synchroscope */}
      <g transform="translate(600,150)">
        <circle r="65" fill="#060606" stroke="#333" strokeWidth="2" />
        <line x1="0" y1="0" x2={55 * Math.cos((Math.PI / 180) * phaseDiff)}
                      y2={55 * Math.sin((Math.PI / 180) * phaseDiff)}
                      stroke={synced ? "#00ffbf" : "#ff7a2d"}
                      strokeWidth="4" strokeLinecap="round"/>
        <circle r="4" fill="#fff"/>
        <text x="-22" y="95" fill="#aaa" fontSize="11">Synchroscope</text>
        <text x="-10" y="-70" fill="#aaa" fontSize="10">FAST</text>
        <text x="-10" y="82" fill="#aaa" fontSize="10">SLOW</text>
      </g>

      {/* Synchronizing Lamps */}
      <g transform="translate(740,130)">
        {["L1", "L2", "L3"].map((lamp, i) => (
          <g key={lamp} transform={`translate(${i*70},0)`}>
            <circle r="18" fill={lampColor(i*120)} stroke="#333" strokeWidth="2" filter="url(#glow)"/>
            <text x="-8" y="40" fill="#aaa" fontSize="10">{lamp}</text>
          </g>
        ))}
        <text x="0" y="-40" fill="#ffd24a" fontSize="12">Synchronizing Lamps</text>
      </g>

      {/* Mini oscilloscope waveform */}
      <g transform="translate(100,300)">
        <rect width="820" height="120" rx="10" fill="#060606" stroke="#222" strokeWidth="2"/>
        <text x="10" y="14" fill="#ffd24a" fontSize="11">Phase Difference Waveforms</text>
        {waveformPoints.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.yBus} r="1" fill="#00bfff"/>
            <circle cx={p.x} cy={p.yAlt} r="1" fill="#ff7a2d"/>
          </g>
        ))}
      </g>

      {/* Sync Status */}
      <g transform="translate(980,380)">
        <rect width="140" height="40" rx="8" fill={synced ? "#00ffbf" : "#111"} stroke="#333"/>
        <text x="70" y="24" fill={synced ? "#000" : "#888"} fontSize="12" textAnchor="middle">
          {synced ? "SYNCHRONIZED" : "WAITING"}
        </text>
      </g>

      {/* Glow Filter */}
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
    </g>
  );
}

 else if (experimentId === "dc_motor_load") {
  // --- parameters (with sensible defaults) ---
  const Va = safeNum(params.Va, 220);                 // supply voltage (V)
  const Ra = Math.max(1e-6, safeNum(params.Ra, 1.2)); // armature resistance (Ω)
  const Kt = safeNum(params.Kt, 0.12);                // torque constant / back-EMF constant (Nm/A and V/(rad/s))
  const fieldR = Math.max(1e-6, safeNum(params.fieldR, 50)); // field rheostat (Ω) - larger => weaker field
  const loadT = safeNum(params.loadT, 0);             // external load torque (N·m)
  const inertia = safeNum(params.inertia, 0.02);      // simple rotor inertia (kg·m^2)
  const damping = safeNum(params.damping, 0.02);      // viscous damping
  const maxRPM = safeNum(params.maxRPM, 4000);

  // --- time for animation ---
  const t = performance.now() / 1000; // seconds

  // --- derived: simulate simple steady-state + dynamic visually plausible behavior ---
  // field current (shunt field): If fieldR increases, field flux reduces => motor speeds up for given Va.
  // We compute a simple flux factor: higher fieldR => lower flux. Keep normalized 0.2..1.8 range for visual behavior.
  const nominalFieldR = 50;
  const fluxFactor = clamp(nominalFieldR / fieldR, 0.25, 2.0); // >1 means strong flux, <1 weaker flux

  // crude dynamic speed model: angular acceleration = (Kt*Ia - loadT - damping*omega)/inertia
  // approximate Ia from (Va - Ke*omega)/Ra where Ke == Kt (for simplicity). We'll iterate a few micro-steps to produce a smoother animation value.
  // Start with a guessed omega based on previous time slice using a simple low-pass behavior:
  // We cannot store state between renders here, so create a pseudo-dynamic by integrating over a short simulated time window using t as seed.
  // This gives a smooth, deterministic animation that reacts to params and t.
  const seed = (t % 10); // keep the integration window small and cyclic
  let omega = 0; // rad/s initial guess
  const dt = 0.02; // simulation time step
  const steps = Math.min(120, Math.max(8, Math.floor(0.6 / dt))); // simulate ~0.6s forward in small steps
  for (let i = 0; i < steps; i++) {
    // electrical: back emf = Ke * omega
    const backEmf = Kt * omega;
    // armature current (A)
    const Ia = Math.max(0, (Va - backEmf) / Ra);
    // electromagnetic torque (Nm), modulated by fluxFactor
    const Te = Kt * Ia * fluxFactor;
    // simple acceleration
    const alpha = (Te - loadT - damping * omega) / Math.max(1e-6, inertia);
    // integrate angular velocity
    omega += alpha * dt;
    // clamp a bit to keep stable
    omega = clamp(omega, -2000, (maxRPM * 2 * Math.PI) / 60 + 2000);
  }

  // convert to RPM for displays
  const speed_rpm = clamp((omega * 60) / (2 * Math.PI), 0, maxRPM);

  // compute armature current for display (steady estimate from computed omega)
  const Ia_display = Math.max(0, (Va - Kt * omega) / Ra);
  // field current (shunt field across supply through rheostat)
  const If_display = Va / fieldR;

  // torque (electromagnetic)
  const Te_display = Kt * Ia_display * fluxFactor;

  // needle angles for meters (visual mapping)
  const voltAngle = -90 + clamp((Va / 300), 0, 1) * 180; // assume 0..300V gauge
  const ampAngle = -90 + clamp(Ia_display / 50, 0, 1) * 180; // assume 0..50A gauge
  const speedAngle = -90 + (speed_rpm / maxRPM) * 180;

  // rotor rotation (visual), rotate smoothly with time and speed (deg)
  const rotorAngle = ((t * (speed_rpm / 60)) * 360) % 360;

  // current "glow" intensity mapping (brighter -> higher current)
  const armatureGlow = clamp(Ia_display / 50, 0.06, 1.0);
  const fieldGlow = clamp(If_display / 5, 0.02, 1.0);

  // moving glowing dots along wires: produce coordinates for armature path and field path
  // Define simple paths (in local coords) to map dots onto. We'll compute points along straight/arc segments.
  const armPath = {
    start: { x: 30, y: 40 },
    mid: { x: 140, y: 40 },
    end: { x: 200, y: 110 } // into armature coil area
  };

  const fieldPath = {
    start: { x: -40, y: 30 },
    coilTop: { x: 40, y: -40 },
    coilBottom: { x: 40, y: 60 }
  };

  // produce arrays of dot positions for animation; number & speed scale with current
  const armDotsCount = 12;
  const fieldDotsCount = 10;
  const armDots = Array.from({ length: armDotsCount }).map((_, idx) => {
    // phase offset per dot
    const phase = (idx / armDotsCount) * 2 * Math.PI;
    // progress along path 0..1 oscillates with time and increases with Ia_display
    const progress = ( (t * (0.8 + 4.0 * armatureGlow)) + phase ) % 1;
    // map to piecewise straight path: start->mid->end
    if (progress < 0.6) {
      const u = progress / 0.6;
      const x = armPath.start.x + (armPath.mid.x - armPath.start.x) * u;
      const y = armPath.start.y + (armPath.mid.y - armPath.start.y) * u;
      return { x, y, r: 2.2 + 2.5 * armatureGlow, opacity: 0.6 + 0.4 * armatureGlow };
    } else {
      const u = (progress - 0.6) / 0.4;
      const x = armPath.mid.x + (armPath.end.x - armPath.mid.x) * u;
      const y = armPath.mid.y + (armPath.end.y - armPath.mid.y) * u;
      return { x, y, r: 2.2 + 2.5 * armatureGlow, opacity: 0.6 + 0.4 * armatureGlow };
    }
  });

  const fieldDots = Array.from({ length: fieldDotsCount }).map((_, idx) => {
    const phase = (idx / fieldDotsCount) * 2 * Math.PI;
    const progress = ( (t * (0.4 + 2.0 * fieldGlow)) + phase ) % 1;
    // we map 0..1 to path: start -> coilTop (arc) -> coilBottom -> start
    if (progress < 0.33) {
      const u = progress / 0.33;
      const x = fieldPath.start.x + (fieldPath.coilTop.x - fieldPath.start.x) * u;
      const y = fieldPath.start.y + (fieldPath.coilTop.y - fieldPath.start.y) * u;
      return { x, y, r: 1.8 + 2.0 * fieldGlow, opacity: 0.4 + 0.5 * fieldGlow };
    } else if (progress < 0.66) {
      const u = (progress - 0.33) / 0.33;
      const x = fieldPath.coilTop.x + (fieldPath.coilBottom.x - fieldPath.coilTop.x) * u;
      const y = fieldPath.coilTop.y + (fieldPath.coilBottom.y - fieldPath.coilTop.y) * u;
      return { x, y, r: 1.8 + 2.0 * fieldGlow, opacity: 0.4 + 0.5 * fieldGlow };
    } else {
      const u = (progress - 0.66) / 0.34;
      const x = fieldPath.coilBottom.x + (fieldPath.start.x - fieldPath.coilBottom.x) * u;
      const y = fieldPath.coilBottom.y + (fieldPath.start.y - fieldPath.coilBottom.y) * u;
      return { x, y, r: 1.8 + 2.0 * fieldGlow, opacity: 0.4 + 0.5 * fieldGlow };
    }
  });

  // torque-speed curve for small inset (visual only)
  const curvePoints = Array.from({ length: 11 }, (_, i) => {
    const s = i / 10;
    const rpm = s * maxRPM;
    const tq = Math.max(0, Te_display * (1 - s) - loadT * s * 0.2);
    return { x: 40 + i * 18, y: 220 - tq * 8, rpm, tq };
  });

  // Draw the composite SVG
  return (
    <g transform="translate(8,10)" fontFamily="Inter, system-ui, sans-serif">
      {/* Header */}
      <text x="0" y="0" fill="#ffd24a" fontSize="15" fontWeight="700">DC Shunt Motor — Load Test & Speed Control</text>
      <text x="0" y="18" fill="#9aa0a6" fontSize="11">Separate field & armature circuits • rheostat control • dynamometer load</text>

      {/* --- Motor + Rotor assembly --- */}
      <g transform="translate(220,120)">
        {/* Motor casing */}
        <rect x="-150" y="-94" width="300" height="188" rx="14" fill="#070707" stroke="#1c1c1c" strokeWidth="1.5" />
        {/* Field winding (left) */}
        <g transform="translate(-70,0)">
          <rect x="-72" y="-56" width="96" height="112" rx="10" fill="#0b0b0b" stroke="#222" />
          <g transform="translate(-24,0)">
            {/* stylized coil */}
            {Array.from({ length: 7 }).map((_, i) => (
              <rect key={i} x={-12 + i * 6} y={-40 + i * 2} width="36" height="6" rx="3" fill="#121212" stroke="#262626" />
            ))}
          </g>
          <text x="-72" y="70" fill="#9aa0a6" fontSize="11">Field Winding</text>
          <text x="-72" y="82" fill="#666" fontSize="10">If: {If_display.toFixed(2)} A</text>

          {/* field connection lines */}
          <path d="M -18 -8 L 8 -8 L 20 -8" stroke="#0d0d0d" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M -18 8 L 8 8 L 20 8" stroke="#0d0d0d" strokeWidth="4" strokeLinecap="round" fill="none" />

          {/* field rheostat representation (slider knob) */}
          <g transform="translate(36,-8)">
            <rect x="0" y="-18" width="90" height="36" rx="8" fill="#050505" stroke="#222" />
            {/* slider position: map fieldR (resistance) to slider position */}
            {(() => {
              const pos = clamp(1 - (clamp(fieldR, 5, 200) - 5) / (195), 0, 1); // 0..1
              const x = 10 + pos * 70;
              return (
                <>
                  <rect x="6" y="-10" width="78" height="20" rx="6" fill="#0b0b0b" stroke="#1f1f1f" />
                  <circle cx={x} cy="0" r="8" fill="#ff7a2d" stroke="#332" strokeWidth="1.2" />
                  <text x="0" y="32" fill="#9aa0a6" fontSize="10">Field Rheostat (adjust to vary flux)</text>
                </>
              );
            })()}
          </g>

          {/* animated field current dots */}
          <g transform="translate(30,0)">
            {fieldDots.map((d, i) => (
              <circle key={i} cx={d.x - 8} cy={d.y - 12} r={d.r} fill="#00ffbf" opacity={d.opacity} style={{ filter: `blur(${0.6 * fieldGlow}px)` }} />
            ))}
          </g>
        </g>

        {/* Armature + rotor (center) */}
        <g transform="translate(90,0)">
          {/* armature housing */}
          <rect x="-84" y="-64" width="170" height="128" rx="10" fill="#080808" stroke="#222" />
          {/* rotor (rotating) */}
          <g transform={`rotate(${rotorAngle})`}>
            <ellipse cx="0" cy="0" rx="56" ry="56" fill="#0b0b0b" stroke="#2a2a2a" />
            {/* rotor bars */}
            {Array.from({ length: 10 }).map((_, i) => {
              const ang = (i / 10) * Math.PI * 2;
              const x = Math.cos(ang) * 46;
              const y = Math.sin(ang) * 46;
              return <rect key={i} x={x - 4} y={y - 8} width="8" height="16" rx="3" transform={`rotate(${(ang * 180) / Math.PI}, ${x}, ${y})`} fill="#ff7a2d" opacity="0.95" />;
            })}
            <circle cx="0" cy="0" r="6" fill="#fff" />
          </g>

          {/* armature label */}
          <text x="-34" y="84" fill="#9aa0a6" fontSize="11">Armature</text>
          <text x="-34" y="96" fill="#666" fontSize="10">Ia: {Ia_display.toFixed(2)} A</text>

          {/* animated armature current dots along armPath */}
          <g transform="translate(-10,0)">
            {armDots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#ffd24a" opacity={d.opacity} style={{ filter: `blur(${0.6 * armatureGlow}px)` }} />
            ))}
          </g>

          {/* shaft to dynamometer (right) */}
          <g transform="translate(120,0)">
            {/* shaft */}
            <rect x="-6" y="-10" width="80" height="20" rx="8" fill="#111" />
            {/* coupling */}
            <circle cx="74" cy="0" r="18" fill="#0b0b0b" stroke="#222" />
            {/* dynamometer icon (brake drum) */}
            <g transform="translate(120,0)">
              <rect x="-46" y="-36" width="92" height="72" rx="8" fill="#0a0a0a" stroke="#222" />
              <circle cx="0" cy="0" r="24" fill="#111" stroke="#222" />
              <rect x="-4" y="-26" width="8" height="18" rx="2" fill="#ff7a2d" transform={`rotate(${(loadT * 18) % 360})`} />
              <text x="-42" y="44" fill="#9aa0a6" fontSize="10">Dynamometer / Brake</text>
              <text x="-42" y="56" fill="#666" fontSize="9">Load: {loadT.toFixed(2)} N·m</text>
            </g>
          </g>
        </g>
      </g>

      {/* --- Meters cluster (speedometer + voltmeter + ammeter) --- */}
      <g transform="translate(520,110)">
        {/* speedometer */}
        <g transform="translate(0,0)">
          <circle r="78" fill="#050505" stroke="#111" strokeWidth="2" />
          {/* ticks */}
          {Array.from({ length: 9 }).map((_, i) => {
            const ang = -90 + (i / 8) * 180;
            const x1 = 64 * Math.cos((Math.PI / 180) * ang);
            const y1 = 64 * Math.sin((Math.PI / 180) * ang);
            const x2 = 72 * Math.cos((Math.PI / 180) * ang);
            const y2 = 72 * Math.sin((Math.PI / 180) * ang);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#222" strokeWidth="2" />;
          })}
          <line x1="0" y1="0" x2={64 * Math.cos((Math.PI / 180) * speedAngle)} y2={64 * Math.sin((Math.PI / 180) * speedAngle)} stroke="#00ffbf" strokeWidth="4" strokeLinecap="round" />
          <circle r="5" fill="#fff" />
          <text x="-22" y="86" fill="#9aa0a6" fontSize="11">Speed (RPM)</text>
          <text x="-12" y="-36" fill="#ffd24a" fontSize="13" fontWeight="700">{Math.round(speed_rpm)} RPM</text>
        </g>

        {/* Voltmeter */}
        <g transform="translate(-70,160)">
          <rect x="-48" y="-36" width="96" height="72" rx="8" fill="#050505" stroke="#111" />
          <text x="-30" y="-6" fill="#ffd24a" fontSize="11">V</text>
          {/* needle */}
          <g transform={`translate(0,6)`}>
            <line x1="-28" y1="18" x2="28" y2="18" stroke="#222" strokeWidth="3" />
            <line x1="0" y1="18" x2={20 * Math.cos((Math.PI / 180) * voltAngle)} y2={18 + 20 * Math.sin((Math.PI / 180) * voltAngle)} stroke="#ff7a2d" strokeWidth="3" strokeLinecap="round" />
            <text x="-28" y="46" fill="#9aa0a6" fontSize="10">{Va.toFixed(1)} V</text>
          </g>
        </g>

        {/* Ammeter */}
        <g transform="translate(90,160)">
          <rect x="-48" y="-36" width="96" height="72" rx="8" fill="#050505" stroke="#111" />
          <text x="-26" y="-6" fill="#00ffbf" fontSize="11">A</text>
          {/* needle */}
          <g transform={`translate(0,6)`}>
            <line x1="-28" y1="18" x2="28" y2="18" stroke="#222" strokeWidth="3" />
            <line x1="0" y1="18" x2={20 * Math.cos((Math.PI / 180) * ampAngle)} y2={18 + 20 * Math.sin((Math.PI / 180) * ampAngle)} stroke="#00ffbf" strokeWidth="3" strokeLinecap="round" />
            <text x="-28" y="46" fill="#9aa0a6" fontSize="10">{Ia_display.toFixed(2)} A</text>
          </g>
        </g>
      </g>

    

      {/* --- labels / legend --- */}
      <g transform="translate(8,430)">
        <text x="0" y="0" fill="#9aa0a6" fontSize="11">Legend:</text>
        <g transform="translate(0,8)">
          <rect x="0" y="6" width="10" height="6" rx="2" fill="#ffd24a" /><text x="16" y="12" fill="#9aa0a6" fontSize="10">Armature current (Ia)</text>
          <rect x="0" y="26" width="10" height="6" rx="2" fill="#00ffbf" /><text x="16" y="32" fill="#9aa0a6" fontSize="10">Field current (If)</text>
          <rect x="0" y="46" width="10" height="6" rx="2" fill="#ff7a2d" /><text x="16" y="52" fill="#9aa0a6" fontSize="10">Rotor / magnetic elements</text>
        </g>
      </g>

      {/* subtle vignette/background highlights for modern look */}
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* tiny footer status */}
      <text x="12" y="516" fill="#5a5f64" fontSize="10">
        Speed adapts to load & field rheostat. FieldR: {fieldR.toFixed(1)} Ω — Flux factor: {fluxFactor.toFixed(2)}
      </text>
    </g>
  );
}

// ======================================================
// Transformer Open/Short Circuit Test – Animated Version
// ======================================================
else if (experimentId === "transformer_ocsc") {
  const { mode, Rc, Xm, Req, Xeq, loss, efficiency } = meters.extra ?? {};

  return (
    <foreignObject x="0" y="0" width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: "100%", height: "100%" }}>
        <TransformerOCSCAnimated
          mode={mode || "oc"} // "oc" for open-circuit or "sc" for short-circuit
          meters={{ Rc, Xm, Req, Xeq, loss, efficiency }}
          width={800}
          height={420}
        />
      </div>
    </foreignObject>
  );
}


else if (experimentId === "wheatstone") {
  const Vs = safeNum(params.Vs_bridge, 5);
  const R1 = Math.max(1e-6, safeNum(params.R1, 1000));
  const R2 = Math.max(1e-6, safeNum(params.R2, 1000));
  const R3 = Math.max(1e-6, safeNum(params.R3, 1000));
  const Rx = Math.max(1e-6, safeNum(params.Rx, 400));

  // Calculated Rx (balance): Rx_calc = (R2 * R3) / R1
  const Rx_calc = (R2 * R3) / R1;
  // small galvanometer current estimate (difference from balance)
  const galvI = Math.abs((R1 * Rx) - (R2 * R3)) / ((R1 + R2) * (R3 + Rx)) * Vs;
  const t = performance.now() / 1000;
  const flowIntensity = clamp(galvI * 50, 0.05, 1.0);

  // lamp-like pointer for null (0 => balanced)
  const balanced = Math.abs(Rx - Rx_calc) / (Rx_calc + 1e-9) < 0.005;

  return (
    <g transform="translate(20,18)">
      <text x="0" y="0" fill="#ffd24a" fontSize="14" fontWeight="600">Wheatstone Bridge — Interactive</text>

      {/* Bridge Circuit */}
      <g transform="translate(60,40)" stroke="#222" fill="none" strokeWidth="3">
        {/* Top left R1 */}
        <g transform="translate(0,0)">
          <rect x="-48" y="-28" width="96" height="32" rx="6" fill="#070707" stroke="#333" />
          <text x="0" y="-6" fill="#ffd24a" fontSize="11" textAnchor="middle">R1</text>
          <text x="0" y="14" fill="#aaa" fontSize="10" textAnchor="middle">{round(R1,2)} Ω</text>
        </g>

        {/* Top right R2 */}
        <g transform="translate(220,0)">
          <rect x="-48" y="-28" width="96" height="32" rx="6" fill="#070707" stroke="#333" />
          <text x="0" y="-6" fill="#ffd24a" fontSize="11" textAnchor="middle">R2</text>
          <text x="0" y="14" fill="#aaa" fontSize="10" textAnchor="middle">{round(R2,2)} Ω</text>
        </g>

        {/* Bottom left R3 */}
        <g transform="translate(0,140)">
          <rect x="-48" y="-28" width="96" height="32" rx="6" fill="#070707" stroke="#333" />
          <text x="0" y="-6" fill="#ffd24a" fontSize="11" textAnchor="middle">R3</text>
          <text x="0" y="14" fill="#aaa" fontSize="10" textAnchor="middle">{round(R3,2)} Ω</text>
        </g>

        {/* Bottom right Rx */}
        <g transform="translate(220,140)">
          <rect x="-48" y="-28" width="96" height="32" rx="6" fill="#070707" stroke="#333" />
          <text x="0" y="-6" fill="#ffd24a" fontSize="11" textAnchor="middle">Rx</text>
          <text x="0" y="14" fill="#aaa" fontSize="10" textAnchor="middle">{round(Rx,2)} Ω</text>
        </g>

        {/* Wires */}
        <path d="M -48 0 H -100 V 156 H -48" stroke="#111" strokeWidth="6" />
        <path d="M 48 0 H 220" stroke="#111" strokeWidth="6" />
        <path d="M -48 12 H 48" stroke="#111" strokeWidth="6" />
        <path d="M -48 156 H 48" stroke="#111" strokeWidth="6" />
        <path d="M 268 12 H 334 V 156 H 268" stroke="#111" strokeWidth="6" />
        <path d="M 48 156 H 268" stroke="#111" strokeWidth="6" />

        {/* Galvanometer in the middle (bridge detector) */}
        <g transform="translate(132,78)">
          <rect x="-38" y="-26" width="76" height="52" rx="8" fill="#060606" stroke="#222" />
          <text x="0" y="-2" fill="#ffd24a" fontSize="11" textAnchor="middle">Galvanometer</text>
          {/* needle */}
          <line
            x1="0" y1="0"
            x2={40 * Math.cos((galvI > 0 ? 1 : -1) * (Math.PI/9) * Math.sin(t * 4))}
            y2={-40 * Math.sin((galvI > 0 ? 1 : -1) * (Math.PI/9) * Math.sin(t * 4))}
            stroke={balanced ? "#00ffbf" : "#ffb86b"}
            strokeWidth={3}
            strokeLinecap="round"
            style={{ transition: "stroke 220ms" }}
          />
          {/* small numeric readout */}
          <text x="0" y="40" fill={balanced ? "#00ffbf" : "#aaa"} fontSize="10" textAnchor="middle">
            I_g = {round(galvI,6)} A
          </text>
        </g>

        {/* Excitation source on left */}
        <g transform="translate(-132,76)">
          <rect x="-28" y="-20" width="56" height="40" rx="8" fill="#060606" stroke="#222" />
          <text x="0" y="6" fill="#ffd24a" fontSize="11" textAnchor="middle">Vs</text>
          <text x="0" y="22" fill="#aaa" fontSize="10" textAnchor="middle">{Vs} V</text>
        </g>

        {/* Animated current flow dots along top path */}
        {(() => {
          // path top: from -48,0 -> 48 -> 220
          const pathLength = 320;
          const baseSpeed = clamp(flowIntensity * 40, 6, 90);
          const dots = Array.from({ length: 12 }, (_, i) => {
            const phase = (t * baseSpeed + i * (pathLength / 12)) % pathLength;
            // map phase to x,y along top horizontal segments and the straight connectors
            let x = -48 + (phase <= 96 ? phase : Math.min(96 + (phase - 96), 316));
            let y = phase <= 96 ? 0 : (phase < 196 ? 0 + ((phase - 96) / 100) * 148 : 148);
            // clamp
            return <circle key={`dot-top-${i}`} cx={x + 132} cy={y + 0} r="3" fill="#ffd24a" opacity={0.85} />;
          });
          return <g>{dots}</g>;
        })()}

      </g>

      {/* Right panel: computed Rx and balance status */}
      <g transform="translate(420,36)">
        <rect width="300" height="160" rx="12" fill="#060606" stroke="#222" />
        <text x="18" y="22" fill="#ffd24a" fontSize="13">Balance & Calculations</text>

        <div dangerouslySetInnerHTML={{__html: ''}} /> {/* spacer for alignment in SVG */}

        <text x="18" y="52" fill="#aaa" fontSize="11">Calculated Rx (balance):</text>
        <text x="18" y="72" fill="#00ffbf" fontSize="16">{round(Rx_calc,4)} Ω</text>

        <text x="18" y="96" fill="#aaa" fontSize="11">Measured Rx (input):</text>
        <text x="18" y="116" fill={balanced ? "#00ffbf" : "#ff9a4a"} fontSize="16">{round(Rx,4)} Ω</text>

        <text x="18" y="140" fill={balanced ? "#00ffbf" : "#aaa"} fontSize="12">
          {balanced ? "Balanced — Galvanometer near zero" : "Unbalanced — adjust potentiometer"}
        </text>
      </g>

      {/* glow filter */}
      <defs>
        <filter id="glowWX">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </g>
  );
}
else if (experimentId === "wien_freq") {
  const R1 = Number(params.R1 ?? 10000); // ohms
  const R2 = Number(params.R2 ?? 10000); // ohms
  const width = 760
  const height = 360
  // allow user to pass C in microfarads (common) or as fractional farads. We'll accept values like 0.1 (uF?) - caller should be consistent.
  // To be safe, assume user passed μF if value > 1e-3; convert to F.
  function normalizeC(input) {
    const c = Number(input ?? 0.0000001);
    if (c > 1e-3) return c * 1e-6; // treat as microfarads -> convert to farads
    return c; // already small, treat as farads
  }
  const C1 = normalizeC(params.C1 ?? 0.1);
  const C2 = normalizeC(params.C2 ?? 0.1);

  // computed resonant frequency (for ideal Wien with R1=R2=R and C1=C2=C):
  const f0_calc = 1 / (2 * Math.PI * R1 * C1);

  // Refs / animation state
  const rafRef = useRef(null);
  const startRef = useRef(performance.now());
  const [t, setT] = useState(0); // seconds since start
  const [freq, setFreq] = useState(1000); // current sweep frequency (Hz)
  const [voutMag, setVoutMag] = useState(0);
  const [balance, setBalance] = useState(false);

  // Sweep parameters
  const fStart = 50; // Hz
  const fEnd = 5000; // Hz
  const sweepPeriod = 10; // seconds to sweep from start->end->start

  // helper: complex arithmetic
  function Complex(re, im = 0) {
    return { re, im };
  }
  function cAdd(a, b) {
    return Complex(a.re + b.re, a.im + b.im);
  }
  function cSub(a, b) {
    return Complex(a.re - b.re, a.im - b.im);
  }
  function cMul(a, b) {
    return Complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  }
  function cDiv(a, b) {
    const denom = b.re * b.re + b.im * b.im || 1e-12;
    return Complex((a.re * b.re + a.im * b.im) / denom, (a.im * b.re - a.re * b.im) / denom);
  }
  function cAbs(a) {
    return Math.hypot(a.re, a.im);
  }
  function j() {
    return Complex(0, 1);
  }

  // Compute phasor node voltages for given frequency (Hz)
  function computeVoutPhasor(fHz, Vsource = 1 /* 1V phasor amplitude */) {
    const w = 2 * Math.PI * fHz;
    // impedances:
    // series branch: R1 + 1/(jωC1)
    const Zc1 = Complex(0, -1 / (w * C1 || 1e-12)); // 1/(jωC) = -j/(ωC)
    const Zs = cAdd(Complex(R1, 0), Zc1);

    // other branch we approximate as R2 in series with C2 (to create frequency dependence)
    // Zc2 = 1/(jωC2)
    const Zc2 = Complex(0, -1 / (w * C2 || 1e-12));
    const Zr2 = Complex(R2, 0);
    const Zp = cAdd(Zr2, Zc2);

    // Node voltages:
    // V1 at divider across series branch: V * Zc1 / (R1 + Zc1)
    const V1 = cMul(Complex(Vsource, 0), cDiv(Zc1, Zs));
    // V2 at divider across the other branch: V * Zr2 / (R2 + Zc2)
    const V2 = cMul(Complex(Vsource, 0), cDiv(Zr2, Zp));

    // Vout phasor = V1 - V2 (bridge diagonal)
    const VoutPh = cSub(V1, V2);

    // Return phasor plus some debug returns
    return { VoutPh, V1, V2, Vsource: Complex(Vsource, 0) };
  }

  // animation loop
  useEffect(() => {
    startRef.current = performance.now();
    let last = performance.now();

    function step(now) {
      const elapsed = (now - startRef.current) / 1000; // seconds
      setT(elapsed);

      // build a triangular sweep between fStart and fEnd
      const phase = (elapsed % sweepPeriod) / sweepPeriod; // [0,1)
      let s = phase <= 0.5 ? phase * 2 : (1 - phase) * 2; // triangular 0->1->0
      const fNow = fStart + s * (fEnd - fStart);
      setFreq(fNow);

      // compute phasor Vout at this frequency
      const { VoutPh } = computeVoutPhasor(fNow);

      const mag = cAbs(VoutPh);
      setVoutMag(mag);

      // balance threshold — small magnitude relative to source amplitude
      const isBalanced = mag < 0.02; // threshold (tune as needed)
      setBalance(isBalanced);

      // queue next frame
      rafRef.current = requestAnimationFrame(step);
      last = now;
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [R1, R2, C1, C2]);

  // needle angle: proportional to instantaneous detector voltage (use phasor + time to compute instantaneous)
  function needleAngle(nowT, detFreq = freq) {
    // compute phasor once
    const { VoutPh } = computeVoutPhasor(detFreq);
    const mag = cAbs(VoutPh);
    // phase
    const phase = Math.atan2(VoutPh.im, VoutPh.re);
    // instantaneous value: mag * sin(ωt + phase)
    const omega = 2 * Math.PI * detFreq;
    const inst = mag * Math.sin(omega * nowT + phase);
    const maxAngle = 40; // degrees left/right max
    // clamp
    return inst * maxAngle;
  }

  // moving-dot helper: linear interpolation between two points
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // coordinates for visual elements (simple schematic)
  const coords = {
    source: { x: 90, y: 180 },
    topNode: { x: 220, y: 90 }, // between R1 and C1 top
    midNode: { x: 360, y: 150 }, // center bridge node
    bottomNode: { x: 220, y: 220 }, // between R2 and C2 bottom
    detectorX: 480,
    detectorY: 150,
    groundY: 280,
  };

  // dynamic positions for some moving dots (progress along path)
  const idx = (t % 1) * 1; // use fractional part for repetitive motion (we'll use different phases)
  const motionProgress = (t % 2) / 2; // 0..1 repeating every 2s

  // pick three progress values for different wires
  const pTop = (motionProgress + 0.0) % 1;
  const pBottom = (motionProgress + 0.33) % 1;
  const pOut = (motionProgress + 0.66) % 1;

  // path positions (simple straight segments)
  function pathPoint(pathId, p) {
    if (pathId === "top") {
      // from source -> topNode -> midNode
      if (p < 0.5) {
        const t2 = p / 0.5;
        return {
          x: lerp(coords.source.x + 40, coords.topNode.x, t2),
          y: lerp(coords.source.y, coords.topNode.y, t2),
        };
      } else {
        const t2 = (p - 0.5) / 0.5;
        return {
          x: lerp(coords.topNode.x, coords.midNode.x, t2),
          y: lerp(coords.topNode.y, coords.midNode.y, t2),
        };
      }
    } else if (pathId === "bottom") {
      // source -> bottomNode -> midNode
      if (p < 0.5) {
        const t2 = p / 0.5;
        return {
          x: lerp(coords.source.x + 40, coords.bottomNode.x, t2),
          y: lerp(coords.source.y, coords.bottomNode.y, t2),
        };
      } else {
        const t2 = (p - 0.5) / 0.5;
        return {
          x: lerp(coords.bottomNode.x, coords.midNode.x, t2),
          y: lerp(coords.bottomNode.y, coords.midNode.y, t2),
        };
      }
    } else {
      // output path: midNode -> detector
      return {
        x: lerp(coords.midNode.x, coords.detectorX - 30, p),
        y: lerp(coords.midNode.y, coords.detectorY, p),
      };
    }
  }

  // colors
  const bg = "#0b1020";
  const wireColor = "#234E9B"; // blue-ish for voltage
  const currentColor = "#ff7a2d"; // orange for current flow highlights
  const balanceColor = "#22c55e";
  const glowColor = balance ? balanceColor : "#ff9a4a";

  // Viz size and scale
  const svgWidth = width;
  const svgHeight = height;

  // Make small helper for formatted frequency and Vout
  const fDisplay = freq < 1000 ? `${freq.toFixed(1)} Hz` : `${(freq / 1000).toFixed(2)} kHz`;
  const f0Display = f0_calc >= 1 ? `${f0_calc.toFixed(2)} Hz` : `${(f0_calc * 1000).toFixed(2)} mHz`;
  const voutDisplay = voutMag.toFixed(3);

  // Inline styles for subtle animations via CSS (kept minimal)
  const textStyle = { fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' };

  // Render SVG
  return (
    <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ background: bg, borderRadius: 8 }}>
      <defs>
        <linearGradient id="wireGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="1" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.8" />
        </linearGradient>

        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <marker id="arrowSmall" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={glowColor} />
        </marker>
      </defs>

      {/* Header */}
      <g transform="translate(20,20)">
        <text x="0" y="0" fill="#ffd24a" fontSize="18" fontWeight="700" style={textStyle}>
          Wien Bridge Frequency Measurement
        </text>
        <text x="0" y="22" fill="#94a3b8" fontSize="11" style={textStyle}>
          Animated frequency sweep · balanced when Vout ≈ 0 · f₀ = 1 / (2π R C)
        </text>
      </g>

      {/* Circuit group */}
      <g transform="translate(0,40)">
        {/* Source */}
        <g transform={`translate(${coords.source.x}, ${coords.source.y - 10})`}>
          <circle cx="0" cy="0" r="20" fill="#0f1724" stroke="#334155" strokeWidth="2" />
          <text x="-8" y="4" fill="#ff9a4a" fontSize="12" fontWeight="700">Vs</text>
          {/* little sinusoid inside */}
          <path d="M-12,6 q4,-12 8,0 q4,12 8,0" fill="none" stroke="#3b82f6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* top wire: source -> R1 -> C1 -> center */}
        <g>
          {/* wire from source to top resistor */}
          <path id="topWire" d={`M${coords.source.x + 20},${coords.source.y} L${coords.topNode.x - 40},${coords.topNode.y}`} stroke={wireColor} strokeWidth="3" strokeLinecap="round" />
          {/* R1 visual */}
          <g transform={`translate(${coords.topNode.x - 40}, ${coords.topNode.y - 8})`}>
            <rect x="0" y="0" width="48" height="18" rx="4" fill="#0f1724" stroke="#374151" />
            <text x="24" y="13" textAnchor="middle" fill="#f1f5f9" fontSize="10">R1: {R1}Ω</text>
          </g>

          {/* C1 visual: two plates */}
          <g transform={`translate(${coords.topNode.x + 4}, ${coords.topNode.y - 20})`}>
            <rect x="0" y="8" width="4" height="24" fill="#ffd24a" rx="1" />
            <rect x="12" y="8" width="4" height="24" fill="#ffd24a" rx="1" />
            <text x="22" y="24" fill="#9ca3af" fontSize="10">C1</text>
          </g>

          {/* wire to mid */}
          <path d={`M${coords.topNode.x + 22},${coords.topNode.y} L${coords.midNode.x - 20},${coords.midNode.y}`} stroke={wireColor} strokeWidth="3" strokeLinecap="round" />
        </g>

        {/* bottom wire: source -> R2 -> C2 -> center */}
        <g>
          <path id="bottomWire" d={`M${coords.source.x + 20},${coords.source.y} L${coords.bottomNode.x - 40},${coords.bottomNode.y}`} stroke={wireColor} strokeWidth="3" strokeLinecap="round" />
          {/* R2 visual */}
          <g transform={`translate(${coords.bottomNode.x - 40}, ${coords.bottomNode.y - 8})`}>
            <rect x="0" y="0" width="48" height="18" rx="4" fill="#0f1724" stroke="#374151" />
            <text x="24" y="13" textAnchor="middle" fill="#f1f5f9" fontSize="10">R2: {R2}Ω</text>
          </g>

          {/* C2 visual */}
          <g transform={`translate(${coords.bottomNode.x + 4}, ${coords.bottomNode.y - 8})`}>
            <rect x="0" y="8" width="4" height="24" fill="#ffd24a" rx="1" />
            <rect x="12" y="8" width="4" height="24" fill="#ffd24a" rx="1" />
            <text x="22" y="24" fill="#9ca3af" fontSize="10">C2</text>
          </g>

          {/* wire to mid */}
          <path d={`M${coords.bottomNode.x + 22},${coords.bottomNode.y} L${coords.midNode.x - 20},${coords.midNode.y}`} stroke={wireColor} strokeWidth="3" strokeLinecap="round" />
        </g>

        {/* center node */}
        <g transform={`translate(${coords.midNode.x}, ${coords.midNode.y})`}>
          <circle cx="0" cy="0" r="8" fill="#0b1220" stroke="#475569" strokeWidth="2" />
        </g>

        {/* detector / galvanometer */}
        <g transform={`translate(${coords.detectorX}, ${coords.detectorY})`}>
          {/* meter body */}
          <rect x="-36" y="-34" width="72" height="68" rx="8" fill="#071427" stroke="#334155" strokeWidth="2" />
          <circle cx="0" cy="0" r="26" fill="#071427" stroke="#334155" strokeWidth="2" />
          {/* gauge marks */}
          <g transform="translate(0,0)">
            {Array.from({ length: 9 }).map((_, i) => {
              const ang = -40 + (i * 10);
              const rad = (ang * Math.PI) / 180;
              const x1 = Math.cos(rad) * 20;
              const y1 = Math.sin(rad) * 20;
              const x2 = Math.cos(rad) * 26;
              const y2 = Math.sin(rad) * 26;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#475569" strokeWidth={i % 2 === 0 ? 2 : 1} />;
            })}
            {/* center marker */}
            <circle cx="0" cy="0" r="3" fill={balance ? balanceColor : "#ff9a4a"} filter="url(#softGlow)" />
          </g>

          {/* needle */}
          <g transform={`rotate(${needleAngle(t, freq)})`}>
            <rect x="-2" y="-22" width="4" height="40" rx="2" fill="#ff7a2d" />
            <polygon points="0,-26 -6,-18 6,-18" fill="#ff7a2d" />
          </g>

          {/* label */}
          <text x="0" y="48" textAnchor="middle" fill="#94a3b8" fontSize="12">Galvanometer</text>
        </g>

        {/* Output arrow + Vout label */}
        <g>
          <line x1={coords.midNode.x + 10} y1={coords.midNode.y} x2={coords.detectorX - 40} y2={coords.detectorY} stroke={voutMag < 0.02 ? balanceColor : currentColor} strokeWidth="4" markerEnd="url(#arrowSmall)" />
          <text x={coords.midNode.x + 30} y={coords.midNode.y - 16} fill="#94a3b8" fontSize="12">Vout</text>
        </g>

        {/* moving dots representing AC flow / current */}
        <g>
          {/* top flow dot */}
          {(() => {
            const p = pathPoint("top", pTop);
            return <circle cx={p.x} cy={p.y} r="4" fill={currentColor} opacity={0.95} filter="url(#softGlow)" />;
          })()}
          {/* bottom flow dot */}
          {(() => {
            const p = pathPoint("bottom", pBottom);
            return <circle cx={p.x} cy={p.y} r="3.5" fill={currentColor} opacity={0.9} />;
          })()}
          {/* output flow dot */}
          {(() => {
            const p = pathPoint("out", pOut);
            return <circle cx={p.x} cy={p.y} r="4.5" fill={wireColor} opacity={0.95} />;
          })()}
        </g>

        {/* textual info panel */}
        <g transform={`translate(${20}, ${coords.groundY - 10})`}>
          <text x="0" y="0" fill="#60a5fa" fontSize="12">Sweep: {fDisplay}</text>
          <text x="160" y="0" fill="#94a3b8" fontSize="12">Calculated f₀: <tspan fill={balance ? balanceColor : "#ffd24a"} fontWeight="700">{f0Display}</tspan></text>
          <text x="360" y="0" fill={balance ? balanceColor : "#ff9a4a"} fontSize="12">Vout (mag): {voutDisplay}</text>
          <text x="520" y="0" fill={balance ? balanceColor : "#94a3b8"} fontSize="12">{balance ? "Bridge Balanced" : "Unbalanced"}</text>
        </g>

        {/* subtle glow on detector when balance */}
        <g>
          <circle cx={coords.detectorX} cy={coords.detectorY} r={balance ? 34 : 0} fill={balance ? `${balanceColor}33` : "transparent"} />
        </g>
      </g>
    </svg>
  );
  
}

else {
      // general placeholder schematic
      return (
        <g transform="translate(40,40)">
          <text x="0" y="-6" fontSize="13" fill="#ffd24a">Experiment Visual</text>
          <rect x="0" y="8" width="720" height="160" rx="12" fill="#060606" stroke="#222" />
          <text x="12" y="40" fontSize="12" fill="#fff">Interactive diagram & meters appear here for the selected experiment.</text>
        </g>
      );
    }
  };

  // animated flow dots (generic)
  const flowDots = Array.from({ length: dotCount }).map((_, di) => {
    const pathStr = `M 120 32 V 160 H ${820}`;
    const delay = (di / dotCount) * speed;
    const style = {
      offsetPath: `path('${pathStr}')`,
      animationName: "expFlow",
      animationDuration: `${speed}s`,
      animationTimingFunction: "linear",
      animationDelay: `${-delay}s`,
      animationIterationCount: "infinite",
      animationPlayState: running ? "running" : "paused",
      transformOrigin: "0 0",
    };
    const dotColor = "#ffd24a";
    return <circle key={`ed-${di}`} r="4.5" fill={dotColor} style={style} />;
  });

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/10 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">{EXPERIMENTS.find(e=>e.id===experimentId)?.label ?? "Experiment"}</div>
            <div className="text-xs text-zinc-400">Interactive • animated • meters • oscilloscope</div>
          </div>
        </div>

      
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* background bus */}
          <path d={`M 80 160 H ${svgW - 80}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />
          {renderMain()}

          

          {/* flow dots */}
          {flowDots}

          <style>{`
            @keyframes expFlow {
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
   Oscilloscope component
   ============================ */
function ExperimentOscilloscope({experimentId, history = [], running }) {

const getExperimentData = (experimentId, history) => {
  const sliceLen = 360; // last 360 samples
  const roundVal = (v, dec = 2) => {
    const num = Number(v);
    if (isNaN(num) || v == null) return 0;
    return Number(num.toFixed(dec));
  };

  switch (experimentId) {
    case "synchronization":
      return history.slice(-sliceLen).map((d, idx) => ({
        t: idx,
        Δf: roundVal(d?.extra?.freqAlt - d?.extra?.freqBus, 1),
        phase: roundVal(d?.extra?.phaseOffset, 1),
      }));

    case "dc_motor_load":
      return history.slice(-sliceLen).map((d, idx) => ({
        t: idx,
        Ia: roundVal(d?.extra?.Ia, 4),
        Vt: roundVal(d?.extra?.speed_rpm, 2),
        Te: roundVal(d?.extra?.torque, 3), // torque
      }));

    case "synchronous_vcurve":
      return history.slice(-sliceLen).map((d, idx) => ({
        t: idx,
        If: roundVal(d?.extra?.If, 3),
        I: roundVal(d?.extra?.pf, 3),
        pf: roundVal(d?.extra?.δdeg, 3),
      }));
    case "transformer_load":
      return history.slice(-360).map((d, idx) => ({
        t: idx,
        efficiency: roundVal(d?.extra?.efficiency, 2),
        outputPower: roundVal(d?.extra?.outputPower, 2),
        Vs: roundVal(d?.extra?.Vs, 2),
      }));  
    case "maxwell":
      return history.slice(-360).map((d, idx) => ({
        t: idx,
        Lx: roundVal(d?.extra?.Lx, 6),
        Rx: roundVal(d?.extra?.Rx, 3),
        Vout: roundVal(d?.extra?.Vout, 4),
      }));
  
    case "transformer_ocsc":
      return history.slice(-360).map((d, idx) => ({
        t: idx,
        Rc: roundVal(d?.extra?.Rc, 2),
        Xm: roundVal(d?.extra?.Xm, 2),
        Req: roundVal(d?.extra?.Req, 2),
        Xeq: roundVal(d?.extra?.Xeq, 2),
        loss: roundVal(d?.extra?.loss, 2),
        efficiency: roundVal(d?.extra?.efficiency, 2),
      }));
    case "transformer_oc_sc":
      return history.slice(-sliceLen).map((d, idx) => ({
        t: idx,
        Vp: roundVal(d.Vp, 2),
        Ip: roundVal(d.Ip, 4),
        P: roundVal(d.P, 2),
      }));

    case "wheatstone":
      return history.slice(-sliceLen).map((d, idx) => ({
        t: idx,
        Rx_calc: roundVal(d?.extra?.Rx_calc, 2),
        galvI: roundVal(d?.extra?.galvI, 4),
      }));

    // 🧠 New Experiment: Induction Motor – No-load & Blocked Rotor Test
    case "induction_locked":
      return history.slice(-sliceLen).map((d, idx) => ({
        t: idx,
        I: roundVal(d?.I, 3),
        P: roundVal(d?.P, 2),
        torque: roundVal(d?.extra?.torque, 3),
        slip: roundVal(d?.extra?.slip, 3),
      }));
    case "wien_freq":
      return history.slice(-360).map((d, idx) => ({
        t: idx,
        Vout: roundVal(d?.extra?.Vout, 4),
        f0: roundVal(d?.extra?.f0, 2),
        balanceError: roundVal(d?.extra?.balanceError, 4),
      }));
  

    default:
      // Generic Voltage/Current/Power
      return history.slice(-sliceLen).map((d, idx) => ({
        t: idx,
        V: roundVal(d.V, 6),
        I: roundVal(d.I, 9),
        P: roundVal(d.P, 8),
      }));
  }
};

// Choose line keys/colors/names per experiment
const getLineConfigs = (experimentId) => {
  switch (experimentId) {
    case "synchronization":
      return [
        { key: "Δf", color: "#ff9a4a", name: "Freq Difference (Hz)" },
        { key: "phase", color: "#ffd24a", name: "Phase Offset (°)" },
      ];
    case "transformer_load":
      return [
        { key: "efficiency", color: "#22c55e", name: "Efficiency (%)" },
        { key: "outputPower", color: "#4de1ff", name: "Output Power (W)" },
        { key: "Vs", color: "#ffdd2d", name: "Secondary Voltage (V)" },
      ];  
    case "wien_freq":
      return [
        { key: "Vout", color: "#ff9a4a", name: "Output Voltage (Vout)" },
        { key: "f0", color: "#facc15", name: "Frequency (Hz)" },
        { key: "balanceError", color: "#22c55e", name: "Balance Error" },
      ];
    case "maxwell":
      return [
        { key: "Lx", color: "#ffd24a", name: "Inductance (H)" },
        { key: "Rx", color: "#00ffbf", name: "Resistance (Ω)" },
        { key: "Vout", color: "#ff9a4a", name: "Bridge Output (Vout)" },
      ];
    case "transformer_ocsc":
      return [
        { key: "Rc", color: "#4de1ff", name: "Rc / Req (Ω)" },
        { key: "Xm", color: "#ffdd2d", name: "Xm / Xeq (Ω)" },
        { key: "loss", color: "#ff9a4a", name: "Loss (W)" },
        { key: "efficiency", color: "#22c55e", name: "Efficiency (%)" },
      ];

    case "synchronous_vcurve":
      return [
        { key: "If", color: "#facc15", name: "Field Current (If)" },
        { key: "I", color: "#22c55e", name: "Power Factor" },
        { key: "pf", color: "#3b82f6", name: "δdeg" },
      ];

    case "dc_motor_load":
      return [
        { key: "Ia", color: "#00ffbf", name: "Armature Current (A)" },
        { key: "Vt", color: "#ffd24a", name: "Speed (RPM)" },
        { key: "Te", color: "#ff9a4a", name: "Torque (N·m)" },
      ];

    case "wheatstone":
      return [
        { key: "Rx_calc", color: "#00ffbf", name: "Rx (Ω, Balanced)" },
        { key: "galvI", color: "#ffd24a", name: "Galvanometer Current (A)" },
      ];

    case "transformer_oc_sc":
      return [
        { key: "Vp", color: "#ffd24a", name: "Primary Voltage (V)" },
        { key: "Ip", color: "#00ffbf", name: "Primary Current (A)" },
        { key: "P", color: "#ff9a4a", name: "Power (W)" },
      ];

    // ⚙️ Induction Motor (No-load & Blocked Rotor)
    case "induction_locked":
      return [
        { key: "I", color: "#22c55e", name: "Stator Current (A)" },
        { key: "P", color: "#ff9a4a", name: "Input Power (W)" },
        { key: "torque", color: "#3b82f6", name: "Torque (N·m)" },
        { key: "slip", color: "#facc15", name: "Slip (pu)" },
      ];

    default:
      return [
        { key: "V", color: "#ffd24a", name: "Voltage (V)" },
        { key: "I", color: "#00ffbf", name: "Current (A)" },
        { key: "P", color: "#ff9a4a", name: "Power (W)" },
      ];
  }
};


const oscilloscopeData = getExperimentData(experimentId, history);
const lineConfigs = getLineConfigs(experimentId);
  const data = history.slice(-360).map((d, idx) => ({
    t: idx,
    V: round(d.V, 6),
    I: round(d.I, 9),
    P: round(d.P, 8),
  }));

  return (
<div className="rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/10 border border-zinc-800 overflow-hidden">
  <div className="flex items-center justify-between mb-2">
    <div className="text-sm font-medium text-orange-400">
      Oscilloscope — {lineConfigs.map(l => l.name).join(", ")}
    </div>
    <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
  </div>

  <div className="h-44 sm:h-56">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={oscilloscopeData}>
        <CartesianGrid stroke="#111" strokeDasharray="3 3" />
        <XAxis dataKey="t" tick={{ fill: "#888" }} />
        <YAxis tick={{ fill: "#888" }} />
        <ReTooltip
          contentStyle={{
            background: "#0b0b0b",
            border: "1px solid #222",
            color: "#fff",
            borderRadius: "10px",
          }}
        />
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
</div>

  );
}

/* ============================
   Main Page
   ============================ */
export default function ExperimentsPage() {
  const [experimentId, setExperimentId] = useState("rlc_resonance");
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // experiment params (a generic object keyed by experimentId)
  const [params, setParams] = useState({
    // defaults for RLC
    R: 10,
    L: 10,
    C: 10,
    freq: 50,
    Vs: 10,
    // transformer
    Vp: 230,
    Nratio: 1,
    coreLoss: 15,
    loadP: 200,
    // wheatstone
    R1: 1000,
    R2: 1000,
    R3: 1000,
    Rx: 400,
    Vs_bridge: 5,
    // motor
    Va: 220,
    Ra: 1.2,
    Kt: 0.12,
    loadT: 0,
    //synchronization
    freqBus: 50,
    freqAlt: 490,
    phaseOffset: 0,
    Vbus: 230,
    Valt: 230,
    synced: false,
    // --- NEW: Synchronous Motor V-Curve Defaults ---
Xs: 6,
If: 1,
Pload: 5000,
pf:0

  });

  // simulation hook
  const { history, meters } = useExperimentSim({
    experimentId,
    params,
    running,
    timestep: 80,
  });

  const latest = history.length ? history[history.length - 1] : { V: 0, I: 0, P: 0, extra: {} };

  // helpers to update params safely
  const updateParam = (k, v) => setParams((s) => ({ ...s, [k]: v }));

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

const resetDefaults = () => {
  setParams({
    // RLC
    R: 10,
    L: 10,
    C: 10,
    freq: 50,
    Vs: 10,

    // Transformer
    Vp: 230,
    Nratio: 1,
    coreLoss: 15,
    loadP: 200,

    // Bridge
    R1: 1000,
    R2: 1000,
    R3: 1000,
    Rx: 400,
    Vs_bridge: 5,

    // DC Motor
    Va: 220,
    Ra: 1.2,
    Kt: 0.12,
    loadT: 0,

    // Synchronization
    freqBus: 50,
    freqAlt: 490,
    phaseOffset: 0,
    Vbus: 230,
    Valt: 230,
    synced: false,
  });

  toast.success("All parameters reset to defaults");
};



  const exportCSV = () => {
    const rows = [
      ["t", "V", "I", "P", "extra"],
      ...history.map((d) => [d.t, d.V, d.I, d.P, JSON.stringify(d.extra)]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `experiment-${experimentId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  // grouped select items rendering
  const groups = useMemo(() => {
    const g = {};
    EXPERIMENTS.forEach((e) => {
      if (!g[e.group]) g[e.group] = [];
      g[e.group].push(e);
    });
    return g;
  }, []);

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)] bg-[length:18px_18px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />
      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-6 h-6 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Virtual Experiments & Visualizer</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-96">
                <Select value={experimentId} onValueChange={(v) => setExperimentId(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Select experiment" />
                  </SelectTrigger>

                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    {Object.keys(groups).map((g) => (
                      <div key={g} className="px-2 py-2">
                        <div className="text-xs text-zinc-500 font-semibold">{g}</div>
                        {groups[g].map((it) => (
                          <SelectItem key={it.id} value={it.id} className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">
                            {it.label}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={() => toast.success("Experiment snapshot saved")}>
                  Snapshot
                </Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning} title={running ? "Pause" : "Run"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg" onClick={resetDefaults} title="Reset parameters">
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</Button>
            </div>
          </div>

          {/* Mobile panel */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-72 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex gap-2">
                <Select value={experimentId} onValueChange={(v) => setExperimentId(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Experiment" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    {Object.keys(groups).map((g) => (
                      <div key={g} className="px-2 py-2">
                        <div className="text-xs text-zinc-500 font-semibold">{g}</div>
                        {groups[g].map((it) => (
                          <SelectItem key={it.id} value={it.id} className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">
                            {it.label}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Controls</div>
                        <div className="text-xs text-zinc-400">Parameters • presets • run controls</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* render controls per experiment */}
                  {experimentId === "transformer_ocsc" && (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="space-y-4"
  >
    <div className="flex items-center gap-2 mb-3">
      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffdd2d] flex items-center justify-center shadow-md">
        <Activity className="w-5 h-5 text-black" />
      </div>
      <h2 className="text-lg font-semibold text-[#ffdd2d] tracking-wide">
        Transformer Open/Short Circuit Test
      </h2>
    </div>

    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "Primary Voltage (Vp)", key: "Vp" },
        { label: "Primary Turns (Np)", key: "Np" },
        { label: "Secondary Turns (Ns)", key: "Ns" },
        { label: "Open-Circuit Loss (Po)", key: "Po" },
        { label: "Open-Circuit Current (Io)", key: "Io" },
        { label: "Short-Circuit Voltage (Vsc)", key: "Vsc" },
        { label: "Short-Circuit Current (Isc)", key: "Isc" },
        { label: "Short-Circuit Loss (Psc)", key: "Psc" },
      ].map(({ label, key }) => (
        <div key={key}>
          <label className="text-xs text-zinc-400">{label}</label>
          <Input
            type="number"
            value={params[key]}
            onChange={(e) => updateParam(key, e.target.value)}
            className="bg-zinc-900/60 border border-zinc-800 text-white"
          />
        </div>
      ))}

      {/* Mode Toggle */}
      <div className="col-span-2 flex items-center gap-2 mt-2">
        <label className="text-xs text-zinc-400">Mode:</label>
        <select
          value={params.mode || "oc"}
          onChange={(e) => updateParam("mode", e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 text-white rounded px-2 py-1 text-sm"
        >
          <option value="oc">Open-Circuit</option>
          <option value="sc">Short-Circuit</option>
        </select>
      </div>
    </div>
  </motion.div>
)}

                  {experimentId === "rlc_resonance" && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-zinc-400">Source Voltage (Vs)</label>
                        <Input value={params.Vs} type="number" onChange={(e)=>updateParam("Vs", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Resistance (Ω)</label>
                        <Input value={params.R} type="number" onChange={(e)=>updateParam("R", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Inductance (mH)</label>
                        <Input value={params.L} type="number" onChange={(e)=>updateParam("L", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Capacitance (μF)</label>
                        <Input value={params.C} type="number" onChange={(e)=>updateParam("C", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Frequency (Hz)</label>
                        <Input value={params.freq} type="number" onChange={(e)=>updateParam("freq", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>
                  )}
                  {experimentId === "synchronization" && (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="space-y-5"
  >
    <div className="flex items-center gap-2 mb-2">
      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
        <Zap className="w-4 h-4 text-black" />
      </div>
      <div>
        <div className="text-sm font-semibold text-[#ffd24a]">
          Alternator Synchronization Controls
        </div>
        <div className="text-xs text-zinc-500">
          Adjust parameters & observe live sync behavior
        </div>
      </div>
    </div>

    {/* Frequencies */}
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-zinc-400">Busbar Frequency (Hz)</label>
        <Input
          type="number"
          value={params.freqBus || 50}
          onChange={(e) => updateParam("freqBus", e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 text-white focus:border-orange-500"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400">Incoming Alt. Frequency (Hz)</label>
        <Input
          type="number"
          value={params.freqAlt || 49.5}
          onChange={(e) => updateParam("freqAlt", e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 text-white focus:border-orange-500"
        />
      </div>
    </div>

    {/* Voltages */}
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-zinc-400">Busbar Voltage (V)</label>
        <Input
          type="number"
          value={params.Vbus || 230}
          onChange={(e) => updateParam("Vbus", e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 text-white focus:border-orange-500"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400">Incoming Alt. Voltage (V)</label>
        <Input
          type="number"
          value={params.Valt || 230}
          onChange={(e) => updateParam("Valt", e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 text-white focus:border-orange-500"
        />
      </div>
    </div>

    {/* Phase Control */}
    <div>
      <label className="text-xs text-zinc-400">Manual Phase Offset (°)</label>
      <Input
        type="number"
        value={params.phaseOffset || 0}
        onChange={(e) => updateParam("phaseOffset", e.target.value)}
        className="bg-zinc-900/60 border border-zinc-800 text-white focus:border-orange-500"
      />
    </div>

    {/* Derived readings */}
    <div className="flex flex-wrap gap-2 mt-2">
      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">
        Δf = {(params.freqAlt - params.freqBus || 0).toFixed(2)} Hz
      </Badge>
      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">
        Phase Offset = {(params.phaseOffset || 0)}°
      </Badge>
    </div>

    {/* Action Buttons */}
    <div className="flex gap-2 mt-4">
      <Button
        className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-semibold hover:scale-105 transition-transform duration-200"
        onClick={() => {
          updateParam("freqAlt", params.freqBus || 50);
          toast.success("Auto-Sync: Frequencies matched");
        }}
      >
        <CheckCircle2 className="w-4 h-4 mr-2" /> Auto Sync
      </Button>

      <Button
        variant="outline"
        className="flex-1 border border-zinc-700 text-zinc-300 hover:text-orange-400"
        onClick={() => {
          const synced = Math.abs((params.freqAlt || 0) - (params.freqBus || 0)) < 0.1;
          toast(synced ? "Breaker Closed Successfully!" : "Cannot Close — Out of Phase");
        }}
      >
        <Flash className="w-4 h-4 mr-2" /> Close Breaker
      </Button>
    </div>

    {/* Status */}
    <div className="rounded-md bg-black/70 border border-zinc-800 p-3 flex items-center gap-3 mt-3">
      <Gauge className="w-5 h-5 text-orange-400" />
      <div className="text-xs sm:text-sm text-zinc-300">
        Adjust both alternator frequencies to synchronize. Lamps will flicker slower as frequencies match.
      </div>
    </div>
  </motion.div>
)}
{experimentId === "synchronous_vcurve" && (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="bg-gradient-to-br from-zinc-950 via-black/70 to-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md space-y-5"
  >
    {/* Header */}
    <div className="flex items-center gap-2 mb-3">
      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
        <Settings className="w-5 h-5 text-black" />
      </div>
      <h2 className="text-lg font-semibold text-[#ffd24a] tracking-wide">
        Synchronous Motor Parameters
      </h2>
    </div>

    {/* Input fields */}
    <div className="space-y-3">
      {[
        { label: "Supply Voltage (V)", key: "Vs", icon: <Zap className="w-4 h-4 text-[#ff9a4a]" /> },
        { label: "Armature Resistance (Ω)", key: "Ra", icon: <Activity className="w-4 h-4 text-[#ff9a4a]" /> },
        { label: "Synchronous Reactance (Ω)", key: "Xs", icon: <Gauge className="w-4 h-4 text-[#ff9a4a]" /> },
        { label: "Field Current If (A)", key: "If", icon: <Zap className="w-4 h-4 text-[#ffd24a]" /> },
        { label: "Mechanical Load (W)", key: "Pload", icon: <Activity className="w-4 h-4 text-[#ffd24a]" /> },
      ].map(({ label, key, icon }) => (
        <div key={key} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            {icon}
            <span>{label}</span>
          </div>
          <Input
            type="number"
            value={params[key]}
            onChange={(e) => updateParam(key, e.target.value)}
            className="w-28 bg-zinc-900/60 border border-zinc-800 text-white rounded-md focus:ring-1 focus:ring-[#ff9a4a] transition-all duration-200"
          />
        </div>
      ))}
    </div>

    {/* Measurement badges */}
    <div className="flex flex-wrap gap-2 justify-center mt-5 pt-3 border-t border-zinc-800">
      <Badge
        variant="outline"
        className="bg-black/70 border border-zinc-800 text-[#ffd24a] hover:border-[#ff9a4a]"
      >
        Ia: {meters.Ia} A
      </Badge>

    </div>
  </motion.div>)}
  {experimentId === "maxwell" && (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="space-y-4"
  >
    <div className="flex items-center gap-2 mb-3">
      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
        <Activity className="w-5 h-5 text-black" />
      </div>
      <h2 className="text-lg font-semibold text-[#ffd24a] tracking-wide">
        Maxwell Bridge – Inductance Measurement
      </h2>
    </div>

    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "R₁ (Ω)", key: "R1" },
        { label: "R₂ (Ω)", key: "R2" },
        { label: "R₃ (Ω)", key: "R3" },
        { label: "C₄ (μF)", key: "C4" },
        { label: "Supply Voltage (V)", key: "Vs" },
        { label: "Frequency (Hz)", key: "freq" },
      ].map(({ label, key }) => (
        <div key={key}>
          <label className="text-xs text-zinc-400">{label}</label>
          <Input
            type="number"
            value={params[key]}
            onChange={(e) => updateParam(key, e.target.value)}
            className="bg-zinc-900/60 border border-zinc-800 text-white"
          />
        </div>
      ))}
    </div>
  </motion.div>
)}
{experimentId === "transformer_load" && (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="space-y-4"
  >
    <div className="flex items-center gap-2 mb-3">
      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#4de1ff] to-[#ffdd2d] flex items-center justify-center shadow-md">
        <Zap className="w-5 h-5 text-black" />
      </div>
      <h2 className="text-lg font-semibold text-[#ffdd2d] tracking-wide">
        Transformer Load Test & Efficiency
      </h2>
    </div>

    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "Primary Voltage (Vp)", key: "Vp" },
        { label: "Primary Turns (Np)", key: "Np" },
        { label: "Secondary Turns (Ns)", key: "Ns" },
        { label: "Core Loss (W)", key: "Pcore" },
        { label: "Copper Loss (W)", key: "Pcu" },
        { label: "Load Fraction (0–1)", key: "load" },
        { label: "Power Factor (0–1)", key: "pf" },
      ].map(({ label, key }) => (
        <div key={key}>
          <label className="text-xs text-zinc-400">{label}</label>
          <Input
            type="number"
            value={params[key]}
            onChange={(e) => updateParam(key, e.target.value)}
            className="bg-zinc-900/60 border border-zinc-800 text-white"
          />
        </div>
      ))}
    </div>
  </motion.div>
)}



{experimentId === "induction_locked" && (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="space-y-4"
  >
    <div className="flex items-center gap-2 mb-3">
      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
        <Zap className="w-5 h-5 text-black" />
      </div>
      <h2 className="text-lg font-semibold text-[#ffd24a] tracking-wide">
        Induction Motor – No-load / Blocked Rotor Test
      </h2>
    </div>

    {/* Inputs */}
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
        <Input
          type="number"
          value={params.Vs || 230}
          onChange={(e) => updateParam("Vs", e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 text-white"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400">Frequency (Hz)</label>
        <Input
          type="number"
          value={params.freq || 50}
          onChange={(e) => updateParam("freq", e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 text-white"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400">R₁ (Ω)</label>
        <Input
          type="number"
          value={params.R1 || 1.2}
          onChange={(e) => updateParam("R1", e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 text-white"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400">R₂ (Ω)</label>
        <Input
          type="number"
          value={params.R2 || 1.4}
          onChange={(e) => updateParam("R2", e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 text-white"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400">X₁ (Ω)</label>
        <Input
          type="number"
          value={params.X1 || 2.3}
          onChange={(e) => updateParam("X1", e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 text-white"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400">X₂ (Ω)</label>
        <Input
          type="number"
          value={params.X2 || 2.1}
          onChange={(e) => updateParam("X2", e.target.value)}
          className="bg-zinc-900/60 border border-zinc-800 text-white"
        />
      </div>
    </div>

    {/* Mode Selector */}
    <div>
      <label className="text-xs text-zinc-400">Select Test Mode</label>
      <Select
        value={params.testMode || "no_load"}
        onValueChange={(value) => updateParam("testMode", value)}
      >
        <SelectTrigger className="bg-zinc-900/60 border border-zinc-800 text-white">
          <SelectValue placeholder="Choose Test" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="no_load">No-load Test</SelectItem>
          <SelectItem value="blocked">Blocked Rotor Test</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </motion.div>
)}


                  {experimentId === "wheatstone" && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-zinc-400">Excitation Voltage (Vs)</label>
                        <Input value={params.Vs_bridge} type="number" onChange={(e)=>updateParam("Vs_bridge", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={params.R1} onChange={(e)=>updateParam("R1", e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <Input value={params.R2} onChange={(e)=>updateParam("R2", e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <Input value={params.R3} onChange={(e)=>updateParam("R3", e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        <Input value={params.Rx} onChange={(e)=>updateParam("Rx", e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>
                  )}

                  {experimentId === "dc_motor_load" && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-zinc-400">Armature Voltage (V)</label>
                        <Input value={params.Va} type="number" onChange={(e)=>updateParam("Va", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Armature Resistance (Ω)</label>
                        <Input value={params.Ra} type="number" onChange={(e)=>updateParam("Ra", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Torque Constant Kt</label>
                        <Input value={params.Kt} type="number" onChange={(e)=>updateParam("Kt", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Load Torque (N·m)</label>
                        <Input value={params.loadT} type="number" onChange={(e)=>updateParam("loadT", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>
                  )}
                  {experimentId === "wien_freq" && (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="space-y-4"
  >
    <div className="flex items-center gap-2 mb-3">
      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
        <Activity className="w-5 h-5 text-black" />
      </div>
      <h2 className="text-lg font-semibold text-[#ffd24a] tracking-wide">
        Wien Bridge – Frequency Measurement
      </h2>
    </div>

    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "R₁ (Ω)", key: "R1" },
        { label: "R₂ (Ω)", key: "R2" },
        { label: "C₁ (μF)", key: "C1" },
        { label: "C₂ (μF)", key: "C2" },
        { label: "Input Voltage (V)", key: "Vs" },
      ].map(({ label, key }) => (
        <div key={key}>
          <label className="text-xs text-zinc-400">{label}</label>
          <Input
            type="number"
            value={params[key]}
            onChange={(e) => updateParam(key, e.target.value)}
            className="bg-zinc-900/60 border border-zinc-800 text-white"
          />
        </div>
      ))}
    </div>
  </motion.div>
)}


                  {experimentId === "transformer_load" && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-zinc-400">Primary Voltage (Vp)</label>
                        <Input value={params.Vp} type="number" onChange={(e)=>updateParam("Vp", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Turns Ratio (Np/Ns)</label>
                        <Input value={params.Nratio} type="number" onChange={(e)=>updateParam("Nratio", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Core Loss (W)</label>
                        <Input value={params.coreLoss} type="number" onChange={(e)=>updateParam("coreLoss", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Load Power (W)</label>
                        <Input value={params.loadP} type="number" onChange={(e)=>updateParam("loadP", e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex gap-2">
                    <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                    <Button variant="outline" className="flex-1 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                    <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={() => toast("Saved preset (not implemented)")}>Save Preset</Button>
                    <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={() => toast("Help: See lab manual in docs")}>Help</Button>
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
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated flow • meters • oscilloscope</div>
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <ExperimentVisualizer experimentId={experimentId} params={params} meters={meters} history={history} running={running} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <ExperimentOscilloscope experimentId={experimentId} history={history} running={running} />
              </div>

             <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
  <CardHeader>
    <CardTitle className="flex text-[#ffd24a] items-center gap-2">
      <Gauge className="w-5 h-5" /> Summary
    </CardTitle>
  </CardHeader>

  <CardContent>
    {(() => {
      switch (experimentId) {
        // ⚡ Alternator Synchronization
        case "synchronization":
          return (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Busbar Frequency</div>
                <div className="text-lg font-semibold text-[#ff9a4a]">
                  {params.freqBus || 50} Hz
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Incoming Frequency</div>
                <div className="text-lg font-semibold text-[#00ffbf]">
                  {params.freqAlt || 49.5} Hz
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Phase Difference</div>
                <div className="text-lg font-semibold text-[#ffd24a]">
                 {(((Number(params.freqAlt) || 0) - (Number(params.freqBus) || 0))).toFixed(1)}°

                </div>
              </div>

              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Voltage (Busbar)</div>
                <div className="text-lg font-semibold text-[#ff9a4a]">
                  {params.Vbus || 230} V
                </div>
              </div>

              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Voltage (Incoming)</div>
                <div className="text-lg font-semibold text-[#ff9a4a]">
                  {params.Valt || 230} V
                </div>
              </div>

              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 col-span-2 flex flex-col justify-center">
                <div className="text-xs text-zinc-400">Status</div>
                <div
                  className={`text-sm font-semibold ${
                    Math.abs(params.freqAlt - params.freqBus) < 0.1
                      ? "text-[#00ffbf]"
                      : "text-[#ff4a4a]"
                  }`}
                >
                  {Math.abs(params.freqAlt - params.freqBus) < 0.1
                    ? "✔️ Synchronized"
                    : "⚠️ Out of Sync"}
                </div>
              </div>
            </motion.div>
          );
        case "transformer_ocsc":
          const isOC = meters.extra.mode === "oc";
          return (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">
                  {isOC ? "Rc (Ω)" : "Req (Ω)"}
                </div>
                <div className="text-lg font-semibold text-[#4de1ff]">
                  {isOC ? meters.extra.Rc : meters.extra.Req}
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">
                  {isOC ? "Xm (Ω)" : "Xeq (Ω)"}
                </div>
                <div className="text-lg font-semibold text-[#ffdd2d]">
                  {isOC ? meters.extra.Xm : meters.extra.Xeq}
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">
                  {isOC ? "Core Loss (W)" : "Copper Loss (W)"}
                </div>
                <div className="text-lg font-semibold text-[#ff9a4a]">
                  {meters.extra.loss}
                </div>
              </div>
            </motion.div>
          );
  
        case "transformer_load":
          return (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Secondary Voltage (Vₛ)</div>
                <div className="text-lg font-semibold text-[#ffdd2d]">
                  {meters.extra.Vs}
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Efficiency (η%)</div>
                <div className="text-lg font-semibold text-[#22c55e]">
                  {meters.extra.efficiency}
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Output Power (W)</div>
                <div className="text-lg font-semibold text-[#4de1ff]">
                  {meters.extra.outputPower}
                </div>
              </div>
            </motion.div>
          );
  
        case "maxwell":
          return (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Inductance (Lₓ)</div>
                <div className="text-lg font-semibold text-[#ffd24a]">
                  {(meters.extra.Lx * 1e3).toFixed(3)} mH
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Resistance (Rₓ)</div>
                <div className="text-lg font-semibold text-[#00ffbf]">
                  {meters.extra.Rx} Ω
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Balance Error</div>
                <div className="text-lg font-semibold text-[#ff9a4a]">
                  {meters.extra.balanceError}
                </div>
              </div>
            </motion.div>
          );
  

        // ⚙️ DC Shunt Motor Load Test
        case "dc_motor_load":
          return (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Armature Current</div>
                <div className="text-lg font-semibold truncate text-[#00ffbf]">
                  {meters?.extra?.Ia || 1.2} A
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Speed(Rms)</div>
                <div className="text-lg truncate font-semibold text-[#ff9a4a]">
                  {meters?.extra?.speed_rpm || 220} Rms
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Torque</div>
                <div className="text-lg font-semibold truncate text-[#ffd24a]">
                  {meters?.extra?.torque}
                </div>
              </div>
            </motion.div>
          );



          case "induction_locked":
            return (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-3"
              >
                <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                  <div className="text-xs text-zinc-400">Voltage</div>
                  <div className="text-lg font-semibold text-[#ff9a4a] truncate">{meters.V} V</div>
                </div>
                <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                  <div className="text-xs text-zinc-400">Current</div>
                  <div className="text-lg font-semibold text-[#00ffbf] truncate">{meters.I} A</div>
                </div>
                <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                  <div className="text-xs text-zinc-400">Power</div>
                  <div className="text-lg font-semibold text-[#ffd24a] truncate">{meters.P} W</div>
                </div>

                <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 col-span-2">
                  <div className="text-xs text-zinc-400">Slip</div>
                  <div className="text-lg font-semibold text-[#ff9a4a] truncate">{meters.extra.slip}</div>
                </div>

                <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                  <div className="text-xs text-zinc-400">Torque</div>
                  <div className="text-lg font-semibold text-[#00ffbf] truncate">{meters.extra.torque} N·m</div>
                </div>
              </motion.div>
            );

        
        // ⚡ Transformer Tests
        case "synchronous_vcurve":
          return (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Armature Current</div>
                <div className="text-lg font-semibold truncate text-[#ff9a4a]">
                  {meters?.extra?.Ia || 1} A
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Field Current If (A)</div>
                <div className="text-lg font-semibold text-[#ffd24a]">
                  {params.If || 0.5} 
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Mechanical Load</div>
                <div className="text-lg font-semibold text-[#00ffbf]">
                  {params.Pload }
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Synchronous Reactance</div>
                <div className="text-lg font-semibold text-[#00ffbf]">
                  {params.Xs }
                </div>
              </div>
            </motion.div>
          );
        // ⚡ Transformer Tests
        case "transformer_oc_sc":
          return (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Input Voltage</div>
                <div className="text-lg font-semibold text-[#ff9a4a]">
                  {params.Vp || 230} V
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Core Loss</div>
                <div className="text-lg font-semibold text-[#ffd24a]">
                  {params.coreLoss || 15} W
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Efficiency</div>
                <div className="text-lg font-semibold text-[#00ffbf]">
                  {meters.efficiency || 96.2}%
                </div>
              </div>
            </motion.div>
          );
        case "wien_freq":
          return (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Calculated Frequency</div>
                <div className="text-lg font-semibold text-[#ffd24a]">
                  {meters.extra.f0} Hz
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Vout (Bridge Output)</div>
                <div className="text-lg font-semibold text-[#00ffbf]">
                  {meters.extra.Vout} V
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Balance Error</div>
                <div className="text-lg font-semibold text-[#ff9a4a]">
                  {meters.extra.balanceError}
                </div>
              </div>
            </motion.div>
          );

        // ⚡ Default Fallback
        default:
          return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Voltage</div>
                <div className="text-lg font-semibold text-[#ff9a4a]">
                  {meters.V || 0} V
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Current</div>
                <div className="text-lg font-semibold text-[#00ffbf]">
                  {meters.I || 0} A
                </div>
              </div>
              <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                <div className="text-xs text-zinc-400">Power</div>
                <div className="text-lg font-semibold text-[#ffd24a]">
                  {meters.P || 0} W
                </div>
              </div>
            </div>
          );
      }
    })()}

    <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
      <Lightbulb className="w-4 h-4 text-orange-400" />
      <span>
        Tip: Adjust experiment parameters on the left to observe real-time simulation results and performance metrics.
      </span>
    </div>
  </CardContent>
</Card>

            </div>
          </div>
        </div>
      </main>

      {/* mobile controls sticky */}
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
