// src/pages/visualizations/LogicGateSimulatorPage.jsx
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import {
  Cpu,
  Activity,
  Play,
  Pause,
  Zap,
  Gauge,
  Download,
  Shuffle,
  Sparkles,
  Terminal,
  FlashlightIcon as Lightning,
  Menu,X,
  CircuitBoard,
  Save,

} from "lucide-react";
import { toast } from "sonner";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

/* shadcn/ui-ish components -- adjust imports to your project layout */
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import Footer from "../../components/landing/Footer";

/* ----------------------------- THEME ----------------------------------- */
const THEME = {
  bg: "#05060a",
  cardBg: "rgba(8,8,10,0.65)",
  border: "rgba(255,255,255,0.06)",
  accent: "#ff7a2d", // bright orange
  accent2: "#ffd24a", // yellow
  accent3: "#3a8aff", // blue
  neutral: "#111216",
  glow: "0 0 14px rgba(255,122,45,0.12)",
};

/* -------------------------- GATE LIST --------------------------------- */
const GATES = [
  "AND",
  "OR",
  "NOT",
  "NAND",
  "NOR",
  "XOR",
  "XNOR",
  "Half Adder",
  "Full Adder",
  "2x1 MUX",
];

/* ----------------------- UTILITY: computeLogic ------------------------- */
/**
 * computeLogic - compute raw gate result
 * returns either a number 0/1 or an object for adders
 */
function computeLogicRaw(gate, inputs) {
  const [A = 0, B = 0, S = 0] = inputs.map((x) => Number(x));
  switch (gate) {
    case "AND":
      return A & B;
    case "OR":
      return A | B;
    case "NOT":
      // NOT uses only A
      return A ? 0 : 1;
    case "NAND":
      return (A & B) ? 0 : 1;
    case "NOR":
      return (A | B) ? 0 : 1;
    case "XOR":
      return A ^ B;
    case "XNOR":
      return (A ^ B) ? 0 : 1;
    case "Half Adder":
      return { sum: A ^ B, carry: A & B };
    case "Full Adder":
      return { sum: A ^ B ^ S, carry: (A & B) | (B & S) | (A & S) };
    case "2x1 MUX":
      return S ? B : A;
    default:
      return 0;
  }
}

/**
 * normalizeOutput - always convert raw result to a consistent object
 * shape: { value: 0|1, sum?:0|1, carry?:0|1, meta?:{} }
 */
function normalizeOutput(raw) {
  if (raw == null) return { value: 0 };
  if (typeof raw === "object") {
    return {
      value: Number(raw.sum ?? raw.value ?? 0),
      sum: typeof raw.sum !== "undefined" ? Number(raw.sum) : undefined,
      carry: typeof raw.carry !== "undefined" ? Number(raw.carry) : undefined,
      meta: raw.meta ?? {},
    };
  }
  return { value: Number(raw) };
}

/**
 * isOutputActive - boolean helper, treats any active bit as true
 */
function isOutputActive(out) {
  if (!out) return false;
  if (typeof out === "object") {
    return Boolean(out.value) || Boolean(out.sum) || Boolean(out.carry);
  }
  return Boolean(out);
}

/* -------------------- Truth table generator (memoized) ----------------- */
function makeTruthTable(gate) {
  const rows = [];
  if (gate === "NOT") {
    for (let A = 0; A <= 1; A++) rows.push([A, A ? 0 : 1]);
  } else if (gate === "Half Adder") {
    for (let A = 0; A <= 1; A++)
      for (let B = 0; B <= 1; B++)
        rows.push([A, B, A ^ B, A & B]);
  } else if (gate === "Full Adder") {
    for (let A = 0; A <= 1; A++)
      for (let B = 0; B <= 1; B++)
        for (let C = 0; C <= 1; C++)
          rows.push([A, B, C, A ^ B ^ C, (A & B) | (B & C) | (A & C)]);
  } else if (gate === "2x1 MUX") {
    for (let S = 0; S <= 1; S++)
      for (let A = 0; A <= 1; A++)
        for (let B = 0; B <= 1; B++)
          rows.push([A, B, S, S ? B : A]);
  } else {
    for (let A = 0; A <= 1; A++)
      for (let B = 0; B <= 1; B++) {
        const res = computeLogicRaw(gate, [A, B]);
        rows.push([A, B, typeof res === "object" ? normalizeOutput(res).value : res]);
      }
  }
  return rows;
}

/* --------------------- waveform helper (step expansion) --------------- */
function waveformFromBits(bits, samplesPerBit = 16) {
  const data = [];
  for (let i = 0; i < bits.length * samplesPerBit; i++) {
    const t = i / samplesPerBit;
    const v = bits[Math.floor(i / samplesPerBit)];
    data.push({ t, v });
  }
  return data;
}

/* --------------------- Reducer & initial state ------------------------ */
const initialState = {
  gate: "AND",
  inputs: [0, 0, 0], // A, B, S
  output: normalizeOutput(0),
  running: true,
  modeRealtime: true,
  sampleMs: 220,
  propagationDelayMs: 80, // model an optional small gate delay
  trace: [], // optional: recent sampled data for export
  speed: 1.0, // multiplier
};

function simReducer(state, action) {
  switch (action.type) {
    case "SET_GATE":
      // Reset input S to 0 for safety? We'll keep inputs but it's fine
      return { ...state, gate: action.gate, output: normalizeOutput(computeLogicRaw(action.gate, state.inputs)) };
    case "TOGGLE_INPUT": {
      const nextInputs = [...state.inputs];
      nextInputs[action.index] = nextInputs[action.index] ? 0 : 1;
      const raw = computeLogicRaw(state.gate, nextInputs);
      return { ...state, inputs: nextInputs, output: normalizeOutput(raw) };
    }
    case "SET_INPUTS":
      return { ...state, inputs: action.inputs, output: normalizeOutput(computeLogicRaw(state.gate, action.inputs)) };
    case "SET_RUNNING":
      return { ...state, running: action.running };
    case "SET_MODE":
      return { ...state, modeRealtime: action.mode };
    case "TICK": {
      // recompute output (useful for stepping)
      const raw = computeLogicRaw(state.gate, state.inputs);
      return { ...state, output: normalizeOutput(raw) };
    }
    case "SET_SAMPLE_MS":
      return { ...state, sampleMs: action.ms };
    case "SET_SPEED":
      return { ...state, speed: action.speed };
    case "SET_PROP_DELAY":
      return { ...state, propagationDelayMs: action.ms };
    default:
      return state;
  }
}

/* ---------------- Real-time oscilloscope component ------------------- */
function RealtimeOscilloscope({ sampleFn, running, sampleMs = 220, maxPoints = 500 }) {
  const [data, setData] = useState([]);
  const runningRef = useRef(running);
  const timerRef = useRef(null);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    if (!running) return;
    let mounted = true;
    const tick = async () => {
      if (!mounted) return;
      const sample = sampleFn();
      setData((prev) => {
        const next = [...prev, sample];
        if (next.length > maxPoints) next.splice(0, next.length - maxPoints);
        return next;
      });
      timerRef.current = setTimeout(tick, sampleMs);
    };
    tick();
    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [running, sampleFn, sampleMs, maxPoints]);

  return (
    <div className="w-full h-48 bg-transparent">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.06} />
          <XAxis dataKey="t" tick={false} />
          <YAxis domain={[0, 1]} tickCount={2} />
          <Tooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff",borderRadius:"10px" }} />
          <Legend />
          <Line
            type="stepAfter"
            dataKey="a"
            name="A"
            dot={false}
            isAnimationActive={false}
            stroke={THEME.accent3}
            strokeWidth={2}
          />
          <Line
            type="stepAfter"
            dataKey="b"
            name="B"
            dot={false}
            isAnimationActive={false}
            stroke={THEME.accent}
            strokeWidth={2}
          />
          <Line
            type="stepAfter"
            dataKey="out"
            name="OUT"
            dot={false}
            isAnimationActive={false}
            stroke={THEME.accent2}
            strokeWidth={2}
          />
          <Line
            type="stepAfter"
            dataKey="carry"
            name="CARRY"
            dot={false}
            isAnimationActive={false}
            stroke="#9b5cff"
            strokeWidth={1.8}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ----------------- CircuitSVG: dynamic layout + pulse animation ------- */
/**
 * CircuitSVG renders a gate-specific schematic using SVG primitives.
 * It exposes named wires/paths so we can animate pulses along them.
 *
 * The implementation below supports:
 *  - AND/OR/XOR/NAND/NOR/XNOR
 *  - NOT
 *  - Half Adder / Full Adder (sum & carry shown)
 *  - 2x1 MUX
 *
 * For each wire we compute `pathRef.getTotalLength()` and animate a small circle
 * that travels along the path when signal is active or when there is a rising edge.
 */

function CircuitSVG({
  gate,
  inputs,
  output,
  onToggleInput,
  propagationDelayMs = 60,
  pulseSpeed = 900,
}) {
  // path refs for each named wire
  const pathRefs = useRef({});
  const pulsePosRefs = useRef({}); // {wireId: {x,y}}
  const rafRefs = useRef({});
  const lastSignalRef = useRef({}); // keep last signal values to detect edges
  const [, forceRender] = useState(0); // simple trick to rerender pulses positions

  /* Helper to register path ref */
  const registerPathRef = (id) => (el) => {
    if (!el) return;
    pathRefs.current[id] = el;
  };

  /* compute a set of wires and their path definitions depending on gate */
  const layout = useMemo(() => {
    // central positions
    const w = 420;
    const h = 220;
    // Node coordinates (A,B,S,Gate center, Out, Carry)
    const Apos = { x: 32, y: 56 };
    const Bpos = { x: 32, y: 150 };
    const Spos = { x: 32, y: 110 };
    const gateCenter = { x: 220, y: 110 };
    const outPos = { x: 380, y: 110 };
    const carryPos = { x: 380, y: 40 };

    // simple helper to produce path matrix
    function wirePath(from, to, via = null) {
      if (!via) {
        // straight-ish bezier
        const midX = (from.x + to.x) / 2;
        return `M ${from.x},${from.y} C ${midX},${from.y} ${midX},${to.y} ${to.x},${to.y}`;
      } else {
        const mid1X = (from.x + via.x) / 2;
        const mid2X = (via.x + to.x) / 2;
        return `M ${from.x},${from.y} C ${mid1X},${from.y} ${mid1X},${via.y} ${via.x},${via.y} C ${mid2X},${via.y} ${mid2X},${to.y} ${to.x},${to.y}`;
      }
    }

    // choose wires depending on gate
    const wires = [];
    // input node positions mapping (dynamically hide for NOT)
    wires.push({ id: "A", from: Apos, to: { x: 120, y: Apos.y } });
    wires.push({ id: "B", from: Bpos, to: { x: 120, y: Bpos.y } });
    wires.push({ id: "S", from: Spos, to: { x: 120, y: Spos.y } });

    // gate input midpoints
    const inAtoGate = { x: 160, y: Apos.y };
    const inBtoGate = { x: 160, y: Bpos.y };
    const inStoGate = { x: 160, y: Spos.y };

    // Gate types mapping to paths connecting to the gate center
    wires.push({
      id: "A-to-gate",
      d: wirePath({ x: 120, y: Apos.y }, { x: gateCenter.x - 36, y: Apos.y }, { x: 160, y: Apos.y }),
      from: { x: 120, y: Apos.y },
      to: { x: gateCenter.x - 36, y: Apos.y },
    });
    wires.push({
      id: "B-to-gate",
      d: wirePath({ x: 120, y: Bpos.y }, { x: gateCenter.x - 36, y: Bpos.y }, { x: 160, y: Bpos.y }),
      from: { x: 120, y: Bpos.y },
      to: { x: gateCenter.x - 36, y: Bpos.y },
    });
    wires.push({
      id: "S-to-gate",
      d: wirePath({ x: 120, y: Spos.y }, { x: gateCenter.x - 36, y: Spos.y }, { x: 160, y: Spos.y }),
      from: { x: 120, y: Spos.y },
      to: { x: gateCenter.x - 36, y: Spos.y },
    });

    // internal gate-to-out wires (vary by gate)
    if (gate === "Half Adder" || gate === "Full Adder") {
      // sum output path
      wires.push({
        id: "sum",
        d: wirePath({ x: gateCenter.x + 28, y: gateCenter.y }, { x: outPos.x - 6, y: outPos.y }),
        from: { x: gateCenter.x + 28, y: gateCenter.y },
        to: { x: outPos.x - 6, y: outPos.y },
      });
      wires.push({
        id: "carry",
        d: wirePath({ x: gateCenter.x + 10, y: gateCenter.y - 36 }, { x: carryPos.x - 6, y: carryPos.y }),
        from: { x: gateCenter.x + 10, y: gateCenter.y - 36 },
        to: { x: carryPos.x - 6, y: carryPos.y },
      });
    } else {
      // single out
      wires.push({
        id: "out",
        d: wirePath({ x: gateCenter.x + 28, y: gateCenter.y }, { x: outPos.x - 6, y: outPos.y }),
        from: { x: gateCenter.x + 28, y: gateCenter.y },
        to: { x: outPos.x - 6, y: outPos.y },
      });
    }

    // mux specific rerouting: show S controlling a switch near gate
    if (gate === "2x1 MUX") {
      // We'll keep A and B into mux and S connected to a small selector node
    }

    return {
      w,
      h,
      Apos,
      Bpos,
      Spos,
      gateCenter,
      outPos,
      carryPos,
      wires,
    };
  }, [gate]);

  /* Pulses controller:
     - For each wire id we keep a pulse object {progress: 0..1, active:boolean}
     - When an input/out signal has a rising edge, spawn a new pulse along relevant wires.
  */
  useEffect(() => {
    // initialize lastSignalRef to current values first time
    lastSignalRef.current = {
      A: inputs[0],
      B: inputs[1],
      S: inputs[2],
      OUT: output.value,
      SUM: output.sum,
      CARRY: output.carry,
    };
    // init pulse positions map
    for (const w of layout.wires) {
      pulsePosRefs.current[w.id] = { x: w.from.x, y: w.from.y, progress: 0, running: false, startTs: 0 };
    }
    // force a render to compute paths
    forceRender((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.wires.map((x) => x.id).join(","), /* run whenever wires change */]);

  /* helper to spawn a pulse on a wire */
  const spawnPulse = useCallback((wireId, durationMs = pulseSpeed) => {
    const path = pathRefs.current[wireId];
    if (!path) return;
    const len = path.getTotalLength();
    const pulse = pulsePosRefs.current[wireId];
    if (!pulse) pulsePosRefs.current[wireId] = {};
    pulse.running = true;
    pulse.startTs = performance.now();
    pulse.duration = durationMs;
    pulse.len = len;
    // start RAF loop if not already
    if (!rafRefs.current[wireId]) {
      const step = (ts) => {
        const p = pulsePosRefs.current[wireId];
        if (!p || !p.running) {
          rafRefs.current[wireId] = null;
          return;
        }
        const elapsed = ts - p.startTs;
        const t = Math.min(1, elapsed / p.duration);
        const point = path.getPointAtLength(p.len * t);
        p.x = point.x;
        p.y = point.y;
        p.progress = t;
        // trigger a re-render at modest frequency (not too high)
        forceRender((n) => n + 1);
        if (t >= 1) {
          p.running = false;
          rafRefs.current[wireId] = null;
          return;
        }
        rafRefs.current[wireId] = requestAnimationFrame(step);
      };
      rafRefs.current[wireId] = requestAnimationFrame(step);
    }
  }, []);

  /* spawn pulses on edges: watch inputs & output changes */
  useEffect(() => {
    // detect rising edges from lastSignalRef
    const last = lastSignalRef.current || {};
    const cur = {
      A: inputs[0],
      B: inputs[1],
      S: inputs[2],
      OUT: output.value,
      SUM: output.sum,
      CARRY: output.carry,
    };

    // if A rises, spawn pulses along A->gate and gate->out
    if (cur.A === 1 && last.A === 0) {
      spawnPulse("A-to-gate");
      if (gate === "NOT") spawnPulse("out");
      else if (gate === "Half Adder" || gate === "Full Adder") {
        spawnPulse("sum");
        spawnPulse("carry");
      } else spawnPulse(gate === "2x1 MUX" ? "out" : "out");
    }

    if (cur.B === 1 && last.B === 0) {
      spawnPulse("B-to-gate");
      if (gate === "Half Adder" || gate === "Full Adder") {
        spawnPulse("sum");
        spawnPulse("carry");
      } else spawnPulse("out");
    }

    if (cur.S === 1 && last.S === 0) {
      spawnPulse("S-to-gate");
      if (gate === "2x1 MUX") spawnPulse("out");
    }

    // output rising
    if (cur.OUT === 1 && last.OUT === 0) {
      if (gate === "Half Adder" || gate === "Full Adder") {
        spawnPulse("sum");
        spawnPulse("carry");
      } else {
        spawnPulse("out");
      }
    }

    lastSignalRef.current = cur;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs[0], inputs[1], inputs[2], output.value, output.sum, output.carry, gate]);

  /* Cleanup RAFs */
  useEffect(() => {
    return () => {
      Object.values(rafRefs.current).forEach((id) => {
        if (id) cancelAnimationFrame(id);
      });
    };
  }, []);

  /* simple gate shape renderers */
  function GateShape({ x, y, label, active }) {
    // we render different gate shapes depending on gate type when called
    const glow = active ? { filter: `drop-shadow(0 0 12px ${THEME.accent})` } : {};
    return (
      <motion.g
        initial={{ scale: 1 }}
        animate={active ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        transition={{ duration: 0.8 }}
        style={glow}
      >
        <rect x={x - 44} y={y - 32} rx={14} ry={14} width={88} height={64} fill={THEME.neutral} stroke={THEME.border} />
        <text x={x} y={y+6} textAnchor="middle" fontSize="14" fontFamily="Inter, Arial" fill="#fff">
          {label}
        </text>
      </motion.g>
    );
  }

  /* Gate-specific rendering helper: returns small JSX group centered at gateCenter */
  function GateRenderer() {
    const active = isOutputActive(output);
    const g = layout.gateCenter;
    const label = gate;
    // We'll render a stylized shape per gate
    switch (gate) {
      case "AND":
        return (
          <g transform={`translate(${g.x},${g.y})`}>
            <motion.path
              d="M -36 -28 L -6 -28 A 30 30 0 0 1 -6 28 L -36 28 Z"
              fill={active ? THEME.accent : "#111"}
              stroke={THEME.border}
              strokeWidth={1}
              initial={{ scale: 1 }}
              animate={active ? { scale: [1, 1.02, 1] } : { scale: 1 }}
              transition={{ duration: 0.65 }}
            />
            <text x="0" y="6" textAnchor="middle" fontSize="12" fill="#fff">{label}</text>
          </g>
        );
      case "OR":
        return (
          <g transform={`translate(${g.x},${g.y})`}>
            <motion.path
              d="M -36 -30 Q -6 -10 8 0 Q -6 10 -36 30 Q -18 0 -36 -30 Z"
              fill={active ? THEME.accent : "#111"}
              stroke={THEME.border}
              strokeWidth={1}
              animate={active ? { scale: [1, 1.02, 1] } : { scale: 1 }}
            />
            <text x="0" y="6" textAnchor="middle" fontSize="12" fill="#fff">{label}</text>
          </g>
        );
      case "NOT":
        return (
          <g transform={`translate(${g.x},${g.y})`}>
            <motion.polygon
              points="-28,-28 22,0 -28,28"
              fill={active ? THEME.accent : "#111"}
              stroke={THEME.border}
              strokeWidth={1}
              animate={active ? { scale: [1, 1.04, 1] } : { scale: 1 }}
            />
            <circle cx="26" cy="0" r="8" fill={active ? THEME.accent2 : "#222"} stroke={THEME.border} />
            <text x="0" y="6" textAnchor="middle" fontSize="12" fill="#fff">{label}</text>
          </g>
        );
      case "XOR":
      case "XNOR":
        return (
          <g transform={`translate(${g.x},${g.y})`}>
            <motion.path
              d="M -36 -30 Q -12 -5 12 0 Q -12 5 -36 30 Q -18 0 -36 -30 Z"
              fill={active ? THEME.accent : "#111"}
              stroke={THEME.border}
              strokeWidth={1}
              animate={active ? { scale: [1, 1.02, 1] } : { scale: 1 }}
            />
            <text x="0" y="6" textAnchor="middle" fontSize="12" fill="#fff">{label}</text>
          </g>
        );
      case "NAND":
      case "NOR":
        // reuse AND/OR but with inversion bubble
        return (
          <g transform={`translate(${g.x},${g.y})`}>
            <rect x={-44} y={-28} rx={12} ry={12} width={88} height={56} fill={active ? THEME.accent : "#111"} stroke={THEME.border} />
            <circle cx={36} cy={0} r="8" fill={active ? THEME.accent2 : "#222"} stroke={THEME.border} />
            <text x="0" y="6" textAnchor="middle" fontSize="12" fill="#fff">{label}</text>
          </g>
        );
      case "Half Adder":
      case "Full Adder":
        return (
          <g transform={`translate(${g.x},${g.y})`}>
            <rect x={-46} y={-40} rx={12} width={92} height={80} fill={THEME.neutral} stroke={THEME.border} />
            <text x="0" y="-6" textAnchor="middle" fontSize="12" fill="#fff">Adder</text>
            <text x="0" y="12" textAnchor="middle" fontSize="10" fill="#cbd5e1">Sum / Carry</text>
          </g>
        );
      case "2x1 MUX":
        return (
          <g transform={`translate(${g.x},${g.y})`}>
            <path d="M -36 -28 L 8 0 L -36 28 L -36 -28 Z" fill={active ? THEME.accent : "#111"} stroke={THEME.border} />
            <rect x={8} y={-14} rx={8} width={40} height={28} fill={THEME.neutral} stroke={THEME.border} />
            <text x="0" y="6" textAnchor="middle" fontSize="12" fill="#fff">MUX</text>
          </g>
        );
      default:
        return <GateShape x={layout.gateCenter.x} y={layout.gateCenter.y} label={gate} active={active} />;
    }
  }

  /* Render: SVG with nodes, wires, pulses */
  return (
    <div className="rounded-xl p-2" style={{ background: THEME.cardBg }}>
      <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width="100%" height="260" preserveAspectRatio="xMidYMid meet">
        {/* background */}
        <rect x="0" y="0" width={layout.w} height={layout.h} rx="12" fill="transparent" />

        {/* Input nodes */}
        {/* A */}
        <g transform={`translate(${layout.Apos.x},${layout.Apos.y})`}>
          <circle r="12" fill={inputs[0] ? THEME.accent : "#111"} stroke={THEME.border} />
          <text x="22" y="-6" fontSize="12" fill="#fff">A</text>
        </g>

        {/* B */}
        <g transform={`translate(${layout.Bpos.x},${layout.Bpos.y})`}>
          <circle r="12" fill={inputs[1] ? THEME.accent : "#111"} stroke={THEME.border} />
          <text x="22" y="-6" fontSize="12" fill="#fff">B</text>
        </g>

        {/* S */}
        <g transform={`translate(${layout.Spos.x},${layout.Spos.y})`}>
          <circle r="10" fill={inputs[2] ? THEME.accent2 : "#111"} stroke={THEME.border} />
          <text x="22" y="-6" fontSize="12" fill="#fff">S</text>
        </g>

        {/* Wires background */}
        {layout.wires.map((w) => (
          <path
            key={w.id + "-bg"}
            d={w.d || `M ${w.from.x},${w.from.y} L ${w.to.x},${w.to.y}`}
            stroke="#17171a"
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
          />
        ))}

        {/* Wires foreground (active highlight if any input or output is active) */}
        {layout.wires.map((w) => {
          const id = w.id;
          // Determine activeness heuristically: if it's sum/carry/out then use output bits; else use corresponding input
          let active = false;
          if (id.startsWith("A")) active = inputs[0];
          else if (id.startsWith("B")) active = inputs[1];
          else if (id.startsWith("S")) active = inputs[2];
          else if (id === "sum") active = output.sum ?? output.value;
          else if (id === "carry") active = output.carry ?? 0;
          else if (id === "out") active = output.value;
          else if (id.includes("gate")) active = isOutputActive(output);
          // dynamic stroke width when active
          return (
            <path
              key={w.id}
              ref={registerPathRef(w.id)}
              d={w.d || `M ${w.from.x},${w.from.y} L ${w.to.x},${w.to.y}`}
              stroke={active ? `url(#grad-${w.id})` : "#1a1a1a"}
              strokeWidth={active ? 5 : 3}
              fill="none"
              strokeLinecap="round"
            />
          );
        })}

        {/* Gate shape */}
        <GateRenderer />

        {/* Output nodes */}
        <g transform={`translate(${layout.outPos.x},${layout.outPos.y})`}>
          <rect x="-18" y="-12" rx="6" width="36" height="24" fill={output.value ? THEME.accent2 : "#111"} stroke={THEME.border} />
          <text x="46" y="6" fontSize="12" fill="#fff">OUT</text>
        </g>

        {/* Carry node (if present) */}
        {(gate === "Half Adder" || gate === "Full Adder") && (
          <g transform={`translate(${layout.carryPos.x},${layout.carryPos.y})`}>
            <rect x="-14" y="-10" rx="6" width="28" height="20" fill={output.carry ? THEME.accent : "#111"} stroke={THEME.border} />
            <text x="-4" y="4" fontSize="12" fill="#fff">C</text>
          </g>
        )}

        {/* Gradient defs for active wires */}
        <defs>
          {layout.wires.map((w) => (
            <linearGradient key={w.id} id={`grad-${w.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={THEME.accent2} />
              <stop offset="100%" stopColor={THEME.accent} />
            </linearGradient>
          ))}
        </defs>

        {/* Pulses as circles moving on paths (one per wire when running) */}
        {layout.wires.map((w) => {
          const p = pulsePosRefs.current[w.id];
          if (!p) return null;
          // if running, show a small circle; else hidden
          return (
            <circle
              key={"pulse-" + w.id}
              cx={p.x || w.from.x}
              cy={p.y || w.from.y}
              r="4"
              fill={THEME.accent2}
              opacity={p.running ? 1 : 0}
            />
          );
        })}
      </svg>

      {/* Controls under the svg: toggles for A/B/S */}
      <div className="flex gap-2 mt-3">
        <Button className="cursor-pointer border border-orange-400/20" size="sm" variant={inputs[0] ? "destructive" : "default"} onClick={() => onToggleInput(0)}>
          A: {inputs[0] ? "1" : "0"}
        </Button>
        {/* hide B for NOT gate */}
        {gate !== "NOT" ? (
          <Button className="cursor-pointer border border-orange-400/20" size="sm" variant={inputs[1] ? "destructive" : "default"} onClick={() => onToggleInput(1)}>
            B: {inputs[1] ? "1" : "0"}
          </Button>
        ) : null}
        {/* S only sensible for MUX and Full Adder */}
        {(gate === "2x1 MUX" || gate === "Full Adder") ? (
          <Button className="cursor-pointer border border-orange-400/20" size="sm" variant={inputs[2] ? "destructive" : "default"} onClick={() => onToggleInput(2)}>
            S: {inputs[2] ? "1" : "0"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------- CSV export util --------------------------- */
function exportTraceCSV(trace) {
  if (!trace || !trace.length) {
    toast("No trace data to export", { type: "error" });
    return;
  }
  const header = Object.keys(trace[0]).join(",");
  const rows = trace.map((r) => Object.values(r).join(",")).join("\n");
  const csv = header + "\n" + rows;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "logic_trace.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------- Main page component ------------------------ */
export default function LogicGateSimulatorPage() {
  const [state, dispatch] = useReducer(simReducer, initialState);
  const { gate, inputs, output, running, modeRealtime, sampleMs, propagationDelayMs, speed } = state;
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = React.useState(false);
 const [mobileOpen, setMobileOpen] = useState(false);
  // Detect scroll for dynamic blur effect
  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 10);
  });
  // sampleFn used by RealtimeOscilloscope: return { t, a, b, out, carry }
  const sampleFn = useCallback(() => {
    const t = Date.now() / 1000;
    const raw = computeLogicRaw(gate, inputs);
    const norm = normalizeOutput(raw);
    return {
      t,
      a: Number(inputs[0]),
      b: Number(inputs[1]),
      out: Number(norm.value),
      carry: Number(norm.carry ?? 0),
    };
  }, [gate, inputs]);

  /* realtime sampling management - we keep an internal trace buffer for CSV/export if desired */
  const traceRef = useRef([]);
  useEffect(() => {
    let timerId = null;
    if (running && modeRealtime) {
      const tick = () => {
        const s = sampleFn();
        traceRef.current.push(s);
        // limit trace size
        if (traceRef.current.length > 2000) traceRef.current.shift();
        timerId = setTimeout(tick, Math.max(40, sampleMs / Math.max(1, speed)));
      };
      tick();
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [running, modeRealtime, sampleFn, sampleMs, speed]);

  /* UI actions */
  const onToggleInput = useCallback((idx) => {
    dispatch({ type: "TOGGLE_INPUT", index: idx });
  }, []);

  const setGate = useCallback((g) => {
    dispatch({ type: "SET_GATE", gate: g });
    toast.success(`Gate set to ${g}`);
  }, []);

  const stepOnce = useCallback(() => {
    dispatch({ type: "TICK" });
  }, []);

  /* truth table memo */
  const truthTable = useMemo(() => makeTruthTable(gate), [gate]);

  /* waveform sample for Recharts preview (short) */
  const [previewBits, setPreviewBits] = useState([inputs[0], inputs[1], output.value, output.carry ?? 0]);
  useEffect(() => {
    setPreviewBits([inputs[0], inputs[1], output.value, output.carry ?? 0]);
  }, [inputs[0], inputs[1], output.value, output.carry]);

  /* CSV export uses traceRef.current */
  const onExportCSV = useCallback(() => {
    exportTraceCSV(traceRef.current);
  }, []);

  /* UI: sampleMs slider */
  function updateSampleMs(val) {
    dispatch({ type: "SET_SAMPLE_MS", ms: val });
  }

  function updateSpeed(val) {
    dispatch({ type: "SET_SPEED", speed: val });
  }

  /* Toggle run/pause */
  const toggleRunning = useCallback(() => {
    dispatch({ type: "SET_RUNNING", running: !running });
  }, [running]);

  /* layout & render */
  return (
    <div className="bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px]">
        <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2 sm:py-0 px-2 sm:px-0">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Top Row */}
        <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
          {/* Left Section (Logo + Title) */}
          <motion.div
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.36 }}
            className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="w-10 h-10  rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
               <Zap className="w-5 h-5 text-black" />
            </div>
            <div className="truncate">
              <div className="text-sm text-zinc-300">SparkLab</div>
               <div className="text-xs text-zinc-400 -mt-0.5">Logic Gate Simulator</div>
            </div>
          </motion.div>

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center gap-3">
            {/* Mode Toggle */}
            <Button
              className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200"
              onClick={() =>
                dispatch({ type: "SET_MODE", mode: !modeRealtime })
              }
              title="Toggle Simulation Mode"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {modeRealtime ? "Realtime" : "Step Mode"}
            </Button>

            {/* Run / Pause */}
            <Button
              variant="ghost"
              className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200"
              onClick={toggleRunning}
              title={running ? "Pause Simulation" : "Run Simulation"}
            >
              {running ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </Button>

            {/* Export Button */}
            <Button
              variant="ghost"
              className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200"
              onClick={() => {
                onExportCSV();
                toast.success("Data exported successfully!");
              }}
              title="Export Data"
            >
              <Download className="w-5 h-5" />
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              className="border cursor-pointer text-white border-zinc-800 p-2 rounded-lg"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Slide-Down Menu */}
        <div
          className={`md:hidden transition-all duration-300 overflow-hidden ${
            mobileOpen ? "max-h-60 py-3" : "max-h-0"
          }`}
        >
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex flex-row gap-2">
              <Button
                className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md font-medium shadow-md"
                onClick={() =>
                  dispatch({ type: "SET_MODE", mode: !modeRealtime })
                }
              >
                {modeRealtime ? "Realtime" : "Step"}
              </Button>

              <Button
                variant="ghost"
                className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md text-zinc-300 hover:text-orange-400"
                onClick={toggleRunning}
              >
                {running ? "Pause" : "Run"}
              </Button>

              <Button
                variant="ghost"
                className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md text-zinc-300 hover:text-orange-400"
                onClick={() => {
                  onExportCSV();
                  toast.success("Data exported!");
                }}
              >
                Export
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28">


        <div className="flex flex-col md:flex-row gap-4">
          {/* Left column: Controls */}
<div className="col-span-3 w-full flex flex-col gap-6 flex-1 md:gap-8">

  {/* Controls Card */}
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
    className="w-full"
  >
    <Card
      style={{ background: THEME.cardBg }}
      className="border border-zinc-800/70 shadow-md hover:shadow-orange-500/10 
                 transition-all duration-300 w-full"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-orange-400 text-base sm:text-lg font-medium">
          <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
          Controls
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 sm:gap-6 text-zinc-200">
        {/* Gate Selector */}
        <div>
          <label className="text-sm text-zinc-400">Gate</label>
          <Select value={gate} onValueChange={(v) => setGate(v)}>
            <SelectTrigger className="bg-zinc-900/60 cursor-pointer border-zinc-800 
              focus:ring-1 focus:ring-orange-500 text-sm mt-1 w-full">
              <SelectValue placeholder="Select gate" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border border-zinc-800 text-zinc-200">
              {GATES.map((g) => (
                <SelectItem
                  key={g}
                  value={g}
                  className="text-white hover:bg-orange-500/20 
                             data-[highlighted]:text-orange-200 cursor-pointer 
                             data-[highlighted]:bg-orange-500/30 rounded-md"
                >
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Realtime Sampling Switch */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-300">Realtime sampling</span>
          <Switch
            checked={modeRealtime}
            onCheckedChange={(v) => dispatch({ type: "SET_MODE", mode: v })}
            className="data-[state=checked]:bg-orange-500"
          />
        </div>

        {/* Sampling */}
        <div>
          <label className="text-sm pb-2 text-zinc-400">Sampling (ms)</label>
          <div className="flex flex-col sm:flex-row sm:items-center pt-3 gap-3">
            <Slider
              min={40}
              max={1000}
              value={[sampleMs]}
              onValueChange={(v) => updateSampleMs(v[0])}
              className="flex-1 cursor-pointer"
            />
            <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/30 w-fit">
              {sampleMs} ms
            </Badge>
          </div>
        </div>

        {/* Speed */}
        <div>
          <label className="text-sm pb-2 text-zinc-400">Speed</label>
          <div className="flex flex-col sm:flex-row sm:items-center pt-3 gap-3">
            <Slider
              min={0.25}
              max={3.0}
              step={0.25}
              value={[speed]}
              onValueChange={(v) => updateSpeed(v[0])}
              className="flex-1 cursor-pointer"
            />
            <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/30 w-fit">
              {speed}x
            </Badge>
          </div>
        </div>

        {/* Propagation Delay */}
        <div>
          <label className="text-sm pb-2 text-zinc-400">Propagation delay (ms)</label>
          <div className="flex flex-col sm:flex-row sm:items-center pt-3 gap-3">
            <Slider
              min={0}
              max={300}
              value={[propagationDelayMs]}
              onValueChange={(v) => dispatch({ type: "SET_PROP_DELAY", ms: v[0] })}
              className="flex-1 cursor-pointer"
            />
            <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/30 w-fit">
              {propagationDelayMs} ms
            </Badge>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => {
              dispatch({ type: "SET_INPUTS", inputs: [0, 0, 0] });
              toast("Inputs reset");
            }}
            className="bg-orange-600/80 cursor-pointer hover:bg-orange-600 text-white transition-all"
          >
            Reset Inputs
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              dispatch({ type: "SET_INPUTS", inputs: [1, 1, 1] });
              toast("All high");
            }}
            className="border cursor-pointer border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition-all"
          >
            All High
          </Button>
        </div>
      </CardContent>
    </Card>
  </motion.div>

  {/* Outputs Card */}
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay: 0.1 }}
    className="w-full"
  >
    <Card
      className="border border-zinc-800/70 shadow-md hover:shadow-orange-500/10 
                 transition-all duration-300 w-full"
      style={{ background: THEME.cardBg }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-orange-400 text-base sm:text-lg font-medium">
          <Gauge className="w-4 h-4 sm:w-5 sm:h-5" />
          Outputs
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 sm:space-y-5">
        {/* Primary Output */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-300">Primary output</span>
            <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/30">
              {output.value ? "1" : "0"}
            </Badge>
          </div>

          <div
            className="h-2 rounded bg-zinc-900 overflow-hidden"
            style={{
              boxShadow: isOutputActive(output) ? THEME.glow : "none",
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: output.value ? "100%" : "0%" }}
              transition={{ duration: 0.4 }}
              className="h-2 rounded"
              style={{
                background: isOutputActive(output)
                  ? THEME.accent2
                  : "#222",
              }}
            />
          </div>
        </div>

        {/* Adder Outputs */}
        {(gate === "Half Adder" || gate === "Full Adder") && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Sum</span>
              <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/30">
                {output.sum ?? 0}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Carry</span>
              <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/30">
                {output.carry ?? 0}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  </motion.div>
</div>


          {/* Middle column: Circuit + visual */}
<div className="col-span-6 space-y-4">
  {/* Circuit Panel */}
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
  >
    <Card
      style={{ background: THEME.cardBg }}
      className="border border-zinc-800/70 shadow-md hover:shadow-orange-500/10 transition-all duration-300"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-orange-400 text-base font-medium">
          <h1 className="flex items-center gap-1"><CircuitBoard className="w-4 h-4 text-orange-400" />
          Circuit</h1>
          <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/30 text-[10px]">
            Simulation
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="relative rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
          <CircuitSVG
            gate={gate}
            inputs={inputs}
            output={output}
            onToggleInput={(i) => onToggleInput(i)}
            propagationDelayMs={propagationDelayMs}
          />
        </div>
      </CardContent>
    </Card>
  </motion.div>

  {/* Waveform & Truth Table */}
  <motion.div
    className="grid grid-cols-1 md:grid-cols-2 gap-4"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.1 }}
  >
    {/* Waveform (Live) */}
    <Card
      style={{ background: THEME.cardBg }}
      className="border border-zinc-800/70 shadow-md hover:shadow-orange-500/10 transition-all duration-300"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-orange-400 text-base font-medium">
         <h1 className="flex items-center gap-1">  <Zap className="w-4 h-4" />
          Waveform 
          </h1>
          <Badge className="bg-green-500/10 text-green-400 border border-green-500/30 text-[10px]">
            Live
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-2">
          <RealtimeOscilloscope
            sampleFn={sampleFn}
            running={running}
            sampleMs={sampleMs}
          />
        </div>
      </CardContent>
    </Card>

    {/* Truth Table */}
    <Card
      style={{ background: THEME.cardBg }}
      className="border border-zinc-800/70 shadow-md hover:shadow-orange-500/10 transition-all duration-300"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-orange-400 text-base font-medium">
         <h1 className="flex items-center gap-1"> <Terminal className="w-4 h-4" />
          Truth Table </h1>
          <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px]">
            Logic Data
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="overflow-auto max-h-52 rounded-lg border border-zinc-800 bg-zinc-900/40">
          <table className="table-auto w-full text-sm border-collapse">
            <thead>
              <tr className="bg-zinc-900/60 border-b border-zinc-800">
                {truthTable[0] &&
                  truthTable[0].map((_, i) => (
                    <th
                      key={i}
                      className="text-left text-xs text-orange-300 font-medium px-2 py-1 uppercase tracking-wider"
                    >
                      {(() => {
                        if (gate === "NOT") return i === 0 ? "A" : "OUT";
                        if (gate === "Half Adder")
                          return ["A", "B", "SUM", "CARRY"][i] ?? `C${i}`;
                        if (gate === "Full Adder")
                          return ["A", "B", "C", "SUM", "CARRY"][i] ?? `C${i}`;
                        if (gate === "2x1 MUX")
                          return ["A", "B", "S", "OUT"][i] ?? `C${i}`;
                        return ["A", "B", "OUT"][i] ?? `C${i}`;
                      })()}
                    </th>
                  ))}
              </tr>
            </thead>

            <tbody>
              {truthTable.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="odd:bg-zinc-900/40 even:bg-zinc-950/40 hover:bg-orange-500/5 transition-all"
                >
                  {row.map((c, ci) => (
                    <td
                      key={ci}
                      className="px-2 py-1 text-xs text-zinc-200 text-center"
                    >
                      {String(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </motion.div>
</div>


          {/* Right column: Controls & debug */}
<motion.div
  className="col-span-3 space-y-4"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4 }}
>
  {/* Quick Actions */}
  <Card
    style={{ background: THEME.cardBg }}
    className="border border-zinc-800/70 shadow-md hover:shadow-orange-500/10 transition-all duration-300"
  >
    <CardHeader>
      <CardTitle className="flex items-center justify-between gap-2 text-orange-400 text-base font-medium">
        <h1 className="flex items-center gap-1"><Shuffle className="w-4 h-4 text-orange-400" />
        Quick Actions </h1>
        <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/30 text-[10px]">
          Controls
        </Badge>
      </CardTitle>
    </CardHeader>

    <CardContent>
      <div className="flex flex-col gap-3">
        {/* Input Presets */}
        <div className="flex flex-wrap gap-2">
          {[
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
            [1, 1, 0],
            [1, 1, 1],
          ].map((vals, idx) => (
            <Button
              key={idx}
              onClick={() => dispatch({ type: "SET_INPUTS", inputs: vals })}
              className="bg-zinc-900/60 border cursor-pointer border-orange-500/20 hover:bg-orange-500/40 text-orange-100 text-xs sm:text-sm px-3 py-1 rounded-md transition-all duration-300"
            >
              {vals.join(" / ")}
            </Button>
          ))}

          <Button
            onClick={() => stepOnce()}
            className="bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 text-orange-300 text-xs sm:text-sm px-3 py-1 rounded-md"
          >
            Step
          </Button>
        </div>

        {/* Sampler Preview */}
        <div className="pt-3">
          <label className="text-xs text-zinc-400 mb-1 block">Sampler (Preview)</label>
          <div className="p-2 rounded-md bg-zinc-900/40 border border-zinc-800">
            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="text-orange-400">A</span>
              <span className="font-mono">{inputs[0]}</span>
              <span className="text-orange-400">B</span>
              <span className="font-mono">{inputs[1]}</span>
              <span className="text-orange-400">OUT</span>
              <span className={`font-mono ${output.value ? "text-green-400" : "text-red-400"}`}>
                {output.value}
              </span>
            </div>
          </div>
        </div>

       
      </div>
    </CardContent>
  </Card>

  {/* Diagnostics */}
  <Card
    style={{ background: THEME.cardBg }}
    className="border border-zinc-800/70 shadow-md hover:shadow-orange-500/10 transition-all duration-300"
  >
    <CardHeader>
      <CardTitle className="flex items-center justify-between gap-2 text-orange-400 text-base font-medium">
    <h1 className="flex items-center gap-1"> <Sparkles className="w-4 h-4 text-orange-400" />
        Diagnostics </h1>
        <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px]">
          Status
        </Badge>
      </CardTitle>
    </CardHeader>

    <CardContent>
      <div className="text-xs sm:text-sm text-zinc-300 space-y-1.5">
        <div className="flex justify-between">
          <span>Gate</span>
          <span className="text-orange-300">{gate}</span>
        </div>
        <div className="flex justify-between">
          <span>Inputs</span>
          <span className="font-mono">{inputs.join(" / ")}</span>
        </div>
        <div className="flex justify-between">
          <span>Output</span>
          <span
            className={`font-mono ${
              output.value ? "text-green-400" : "text-red-400"
            }`}
          >
            {output.value}
          </span>
        </div>

        {(gate === "Half Adder" || gate === "Full Adder") && (
          <>
            <div className="flex justify-between">
              <span>Sum</span>
              <span className="text-orange-300 font-mono">{output.sum ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Carry</span>
              <span className="text-orange-300 font-mono">{output.carry ?? 0}</span>
            </div>
          </>
        )}
      </div>
    </CardContent>
  </Card>
</motion.div>

        </div>

      </div>
      <Footer/>
    </div>
  );
}
