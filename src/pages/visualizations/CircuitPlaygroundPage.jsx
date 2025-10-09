// CircuitPlayground.jsx
// A single-file desktop-only circuit playground with draggable components, wire-connections,
// simple MNA phasor solver (R, L, C, AC sources), live charts (Recharts) and 3D phasor view (Plotly).
//
// Dependencies:
//   react, uuid, recharts, react-plotly.js, plotly.js, lucide-react
//
// Paste into your React app as src/components/CircuitPlayground.jsx and import where needed.

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { v4 as uuidv4 } from "uuid";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import Plot from "react-plotly.js";
import {
  Play,
  Pause,
  Trash2,
  Zap,
  Battery,
  Minus,
  GitPullRequest,
  ArrowRightCircle,
  Circle,
  Move,
  Settings,
  Cpu as DesktopComputer,
  Shield,
  Download,
  Menu,
  X,
  Upload,
  Cpu,
  Grid,
  Gauge,
  Waves as Waveform,
  Activity,
  Settings2,
  Info
} from "lucide-react";
import { motion } from "framer-motion";
import { Toaster, toast } from "sonner";
import { toPng } from "html-to-image";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
/* ===========================
   Theme & Small helpers
   =========================== */
const ORANGE = "#ff8b2d";
const BG = "#070707";
const CARD = "#0b0b0b";
const BORDER = "#2b2b2b";
const TEXT = "#f3f3f3";
const MUTED = "#bdbdbd";

const GRID_SIZE = 12;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap = (v, g = GRID_SIZE) => Math.round(v / g) * g;
const fmt = (v, d = 3) => (v == null ? 0 : Number.parseFloat(v).toFixed(d));

/* ===========================
   Complex arithmetic (small library)
   Represents complex numbers as objects { re, im }
   =========================== */
const C = {
  add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  mul: (a, b) => ({
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  }),
  div: (a, b) => {
    const denom = b.re * b.re + b.im * b.im;
    return {
      re: (a.re * b.re + a.im * b.im) / denom,
      im: (a.im * b.re - a.re * b.im) / denom,
    };
  },
  scale: (a, s) => ({ re: a.re * s, im: a.im * s }),
  conj: (a) => ({ re: a.re, im: -a.im }),
  abs: (a) => Math.hypot(a.re, a.im),
  zero: () => ({ re: 0, im: 0 }),
  fromPolar: (mag, angleRad) => ({ re: mag * Math.cos(angleRad), im: mag * Math.sin(angleRad) }),
};

/* ===========================
   Simple Gaussian elimination for complex linear systems
   A is n x n array of complex; b is length n complex vector
   Returns x vector complex
   =========================== */
function solveComplexLinear(A_in, b_in) {
  // Make deep copies
  const n = A_in.length;
  const A = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => ({ re: A_in[i][j].re, im: A_in[i][j].im }))
  );
  const b = b_in.map((v) => ({ re: v.re, im: v.im }));

  const eps = 1e-12;

  for (let k = 0; k < n; k++) {
    // pivot: find row with max magnitude in column k
    let piv = k;
    let maxMag = C.abs(A[k][k]);
    for (let r = k + 1; r < n; r++) {
      const mag = C.abs(A[r][k]);
      if (mag > maxMag) {
        maxMag = mag;
        piv = r;
      }
    }
    if (piv !== k) {
      [A[k], A[piv]] = [A[piv], A[k]];
      [b[k], b[piv]] = [b[piv], b[k]];
    }
    // singular check
    const diagMag = C.abs(A[k][k]);
    if (diagMag < eps) {
      // singular or ill-conditioned -> return zeros
      return Array.from({ length: n }, () => C.zero());
    }
    // normalize row k
    const invDiag = C.div({ re: 1, im: 0 }, A[k][k]);
    for (let j = k; j < n; j++) {
      A[k][j] = C.mul(A[k][j], invDiag);
    }
    b[k] = C.mul(b[k], invDiag);

    // eliminate rows below and above
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const factor = A[i][k];
      if (Math.abs(factor.re) < 1e-15 && Math.abs(factor.im) < 1e-15) continue;
      for (let j = k; j < n; j++) {
        A[i][j] = C.sub(A[i][j], C.mul(factor, A[k][j]));
      }
      b[i] = C.sub(b[i], C.mul(factor, b[k]));
    }
  }

  return b;
}

/* ===========================
   Simple union-find for nets
   =========================== */
function UnionFind() {
  const parent = {};
  function find(a) {
    if (!(a in parent)) parent[a] = a;
    if (parent[a] === a) return a;
    parent[a] = find(parent[a]);
    return parent[a];
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    parent[rb] = ra;
  }
  return { find, union, parent };
}

/* ===========================
   Component palette
   Each palette item becomes a node with two pins ("left","right") unless stated.
   =========================== */
const PALETTE = [
  { id: "voltage", label: "AC Voltage Source", color: ORANGE, width: 160, height: 56, icon: <Battery size={18} /> },
  { id: "current", label: "AC Current Source", color: "#ffb86b", width: 160, height: 56, icon: <Zap size={18} /> },
  { id: "resistor", label: "Resistor (Ω)", color: ORANGE, width: 120, height: 48, icon: <Minus size={16} /> },
  { id: "inductor", label: "Inductor (mH)", color: "#ffb86b", width: 120, height: 48, icon: <GitPullRequest size={16} /> },
  { id: "capacitor", label: "Capacitor (μF)", color: "#ffd28a", width: 120, height: 48, icon: <ArrowRightCircle size={16} /> },
  { id: "ammeter", label: "Ammeter", color: "#ffd1a7", width: 130, height: 52, icon: <Circle size={16} /> },
  { id: "voltmeter", label: "Voltmeter", color: "#ffd1a7", width: 130, height: 52, icon: <Circle size={16} /> },
];

/* ===========================
   Default parameters per component type
   =========================== */
const DEFAULT_PARAMS = {
  resistor: { R: 1000 },
  inductor: { L: 0.01 }, // H
  capacitor: { C: 1e-6 }, // F
  voltage: { Vrms: 12, phase: 0, freq: 50 }, // Vrms
  current: { Irms: 0.05, phase: 0, freq: 50 }, // Irms
  voltmeter: { Rin: 1e7 },
  ammeter: { Rin: 0.01 },
};

/* ===========================
   Utility: build nets from nodes and wires
   nodes: array of node objects { id, x, y, width, height, meta: { type } }
   wires: array of wires { id, from: { node, side }, to: { node, side } }
   Returns:
     nets: array of net objects with keys: id (root string), pins: [{ nodeId, side }]
     pinToNet map: key `${node}:${side}` => netIndex
   =========================== */
function buildNets(nodes, wires) {
  const uf = UnionFind();
  // All pins (side left/right) are named like `${nodeId}:left`
  // Initially each pin is independent; then union pins that are connected by wires
  nodes.forEach((n) => {
    const left = `${n.id}:left`;
    const right = `${n.id}:right`;
    uf.find(left);
    uf.find(right);
  });
  wires.forEach((w) => {
    const a = `${w.from.node}:${w.from.side}`;
    const b = `${w.to.node}:${w.to.side}`;
    uf.union(a, b);
  });

  // group pins by root
  const groups = {};
  Object.keys(uf.parent).forEach((pin) => {
    const root = uf.find(pin);
    if (!groups[root]) groups[root] = [];
    const [nodeId, side] = pin.split(":");
    groups[root].push({ nodeId, side, pin });
  });

  const roots = Object.keys(groups);
  const nets = roots.map((r, idx) => ({ id: r, pins: groups[r] }));
  // map pins -> net index
  const pinToNet = {};
  nets.forEach((net, i) => {
    net.pins.forEach((p) => {
      pinToNet[`${p.nodeId}:${p.side}`] = i;
    });
  });

  // There might be nodes with no wires; ensure their pins remain separate nets
  nodes.forEach((n) => {
    const leftKey = `${n.id}:left`;
    const rightKey = `${n.id}:right`;
    if (!(leftKey in pinToNet)) {
      const idx = nets.length;
      nets.push({ id: leftKey, pins: [{ nodeId: n.id, side: "left", pin: leftKey }] });
      pinToNet[leftKey] = idx;
    }
    if (!(rightKey in pinToNet)) {
      const idx = nets.length;
      nets.push({ id: rightKey, pins: [{ nodeId: n.id, side: "right", pin: rightKey }] });
      pinToNet[rightKey] = idx;
    }
  });

  return { nets, pinToNet };
}

/* ===========================
   Build MNA matrices and solve phasor circuit
   Supports:
     - resistor (R)
     - inductor (L)
     - capacitor (C)
     - AC voltage source (Vrms, phase, freq)
     - AC current source (Irms,phase,freq)
   Returns:
     { netVoltages: Array of complex per net index (RMS phasor), componentCurrents: map compId->complex current (A phasor) }
   =========================== */
function solvePhasor(nodes, wires) {
  // Build nets
  const { nets, pinToNet } = buildNets(nodes, wires);
  const nNets = nets.length;
  if (nNets === 0) return { netVoltages: [], componentCurrents: {} };

  // choose reference net (ground) as net index 0
  // (That's arbitrary; voltmeter measures differences so it's fine)
  const groundIndex = 0;

  // map net->unknown index (exclude ground)
  const netToUnknown = {};
  let unknownCount = 0;
  for (let i = 0; i < nNets; i++) {
    if (i === groundIndex) continue;
    netToUnknown[i] = unknownCount++;
  }

  // gather voltage sources
  const voltageSources = [];
  const currentSources = [];
  nodes.forEach((n) => {
    const type = n.meta?.type;
    if (type === "voltage") {
      // nets from left and right pins
      const a = pinToNet[`${n.id}:left`];
      const b = pinToNet[`${n.id}:right`];
      const Vrms = Number(n.params?.Vrms ?? DEFAULT_PARAMS.voltage.Vrms);
      const phase = Number(n.params?.phase ?? DEFAULT_PARAMS.voltage.phase);
      const freq = Number(n.params?.freq ?? DEFAULT_PARAMS.voltage.freq);
      const phasor = C.fromPolar(Vrms, (phase * Math.PI) / 180);
      voltageSources.push({ node: n, a, b, phasor, freq });
    } else if (type === "current") {
      const a = pinToNet[`${n.id}:left`];
      const b = pinToNet[`${n.id}:right`];
      const Irms = Number(n.params?.Irms ?? DEFAULT_PARAMS.current.Irms);
      const phase = Number(n.params?.phase ?? DEFAULT_PARAMS.current.phase);
      const freq = Number(n.params?.freq ?? DEFAULT_PARAMS.current.freq);
      const phasor = C.fromPolar(Irms, (phase * Math.PI) / 180);
      currentSources.push({ node: n, a, b, phasor, freq });
    }
  });

  const nVolt = voltageSources.length;
  const N = unknownCount + nVolt; // MNA matrix size

  // init A and b
  const A = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => C.zero())
  );
  const B = Array.from({ length: N }, () => C.zero());

  const omegaDefault = 2 * Math.PI * 50;

  // Helper to add admittance between nets
  function addAdmittance(aNet, bNet, Y) {
    // if aNet != ground, add to diag
    if (aNet !== groundIndex) {
      const ai = netToUnknown[aNet];
      A[ai][ai] = C.add(A[ai][ai], Y);
    }
    if (bNet !== groundIndex) {
      const bi = netToUnknown[bNet];
      A[bi][bi] = C.add(A[bi][bi], Y);
    }
    if (aNet !== groundIndex && bNet !== groundIndex) {
      const ai = netToUnknown[aNet];
      const bi = netToUnknown[bNet];
      A[ai][bi] = C.sub(A[ai][bi], Y);
      A[bi][ai] = C.sub(A[bi][ai], Y);
    }
  }

  // Stamp passive components and current sources
  nodes.forEach((n) => {
    const type = n.meta?.type;
    const a = pinToNet[`${n.id}:left`];
    const b = pinToNet[`${n.id}:right`];
    if (type === "resistor") {
      const R = Number(n.params?.R ?? DEFAULT_PARAMS.resistor.R);
      const G = { re: 1 / R, im: 0 };
      addAdmittance(a, b, G);
    } else if (type === "inductor") {
      const L = Number(n.params?.L ?? DEFAULT_PARAMS.inductor.L);
      // get freq: choose source frequency if present else default 50Hz
      const f = Number(n.params?.freq ?? 50);
      const omega = 2 * Math.PI * f;
      const Z = { re: 0, im: omega * L }; // jωL
      // admittance Y = 1/Z
      const Y = C.div({ re: 1, im: 0 }, Z);
      addAdmittance(a, b, Y);
    } else if (type === "capacitor") {
      const Cval = Number(n.params?.C ?? DEFAULT_PARAMS.capacitor.C);
      const f = Number(n.params?.freq ?? 50);
      const omega = 2 * Math.PI * f;
      // Zc = 1/(jωC) = -j/(ωC)
      const Z = { re: 0, im: -1 / (omega * Cval) };
      const Y = C.div({ re: 1, im: 0 }, Z);
      addAdmittance(a, b, Y);
    } else if (type === "ammeter" || type === "voltmeter") {
      // treat as resistor with very low (ammeter) or very high (voltmeter) Rin
      const Rin = Number(n.params?.Rin ?? (type === "ammeter" ? DEFAULT_PARAMS.ammeter.Rin : DEFAULT_PARAMS.voltmeter.Rin));
      const G = { re: 1 / Rin, im: 0 };
      addAdmittance(a, b, G);
    } else if (type === "current") {
      // We'll stamp current source into RHS (KCL)
      const Irms = Number(n.params?.Irms ?? DEFAULT_PARAMS.current.Irms);
      const phase = Number(n.params?.phase ?? DEFAULT_PARAMS.current.phase);
      const phasor = C.fromPolar(Irms, (phase * Math.PI) / 180);
      // Current flows from left -> right (left pin positive to right)
      if (a !== groundIndex) {
        const ai = netToUnknown[a];
        B[ai] = C.sub(B[ai], phasor); // leaving left
      }
      if (b !== groundIndex) {
        const bi = netToUnknown[b];
        B[bi] = C.add(B[bi], phasor); // entering right
      }
    }
  });

  // Stamp voltage sources (MNA) - add rows/cols for each voltage source
  // Voltage sources ordered as in voltageSources array
  // For each voltage source k, its extra unknown index is unknownCount + k
  voltageSources.forEach((vs, k) => {
    const a = vs.a;
    const b = vs.b;
    const row = unknownCount + k;
    // For node a, column for current unknown gets +1; For node b gets -1
    if (a !== groundIndex) {
      const ai = netToUnknown[a];
      A[ai][row] = C.add(A[ai][row], { re: 1, im: 0 });
      A[row][ai] = C.add(A[row][ai], { re: 1, im: 0 });
    }
    if (b !== groundIndex) {
      const bi = netToUnknown[b];
      A[bi][row] = C.sub(A[bi][row], { re: 1, im: 0 });
      A[row][bi] = C.sub(A[row][bi], { re: 1, im: 0 });
    }
    // RHS for voltage equation = phasor voltage (we've chosen RMS phasors)
    B[row] = C.add(B[row], vs.phasor);
  });

  // Solve linear system A x = B
  const x = solveComplexLinear(A, B); // complex vector length N

  // Build net voltages
  const netVoltages = Array.from({ length: nNets }, () => C.zero());
  netVoltages[groundIndex] = C.zero();
  for (let i = 0; i < nNets; i++) {
    if (i === groundIndex) continue;
    const ui = netToUnknown[i];
    netVoltages[i] = x[ui];
  }

  // For voltage sources, we could extract currents from x[unknownCount + k]
  const componentCurrents = {};
  // compute currents through each passive component as (Va - Vb)/Z or (Va-Vb)/R
  nodes.forEach((n) => {
    const type = n.meta?.type;
    const a = pinToNet[`${n.id}:left`];
    const b = pinToNet[`${n.id}:right`];
    const Va = netVoltages[a] || C.zero();
    const Vb = netVoltages[b] || C.zero();
    const Vdiff = C.sub(Va, Vb);
    if (type === "resistor") {
      const R = Number(n.params?.R ?? DEFAULT_PARAMS.resistor.R);
      const I = C.scale(Vdiff, 1 / R);
      componentCurrents[n.id] = I;
    } else if (type === "inductor") {
      const L = Number(n.params?.L ?? DEFAULT_PARAMS.inductor.L);
      const f = Number(n.params?.freq ?? 50);
      const omega = 2 * Math.PI * f;
      const Z = { re: 0, im: omega * L };
      const I = C.div(Vdiff, Z);
      componentCurrents[n.id] = I;
    } else if (type === "capacitor") {
      const Cval = Number(n.params?.C ?? DEFAULT_PARAMS.capacitor.C);
      const f = Number(n.params?.freq ?? 50);
      const omega = 2 * Math.PI * f;
      const Z = { re: 0, im: -1 / (omega * Cval) };
      const I = C.div(Vdiff, Z);
      componentCurrents[n.id] = I;
    } else if (type === "voltage") {
      // current through voltage source: unknownCount + sourceIndex
      const idx = voltageSources.findIndex((vs) => vs.node.id === n.id);
      if (idx >= 0) {
        const currentPhasor = x[unknownCount + idx] || C.zero();
        componentCurrents[n.id] = currentPhasor; // current through voltage source (A)
      }
    } else if (type === "current") {
      // current source current is the known phasor; we recorded earlier
      const Irms = Number(n.params?.Irms ?? DEFAULT_PARAMS.current.Irms);
      const phase = Number(n.params?.phase ?? DEFAULT_PARAMS.current.phase);
      componentCurrents[n.id] = C.fromPolar(Irms, (phase * Math.PI) / 180);
    } else if (type === "ammeter" || type === "voltmeter") {
      const Rin = Number(n.params?.Rin ?? (type === "ammeter" ? DEFAULT_PARAMS.ammeter.Rin : DEFAULT_PARAMS.voltmeter.Rin));
      const I = C.scale(Vdiff, 1 / Rin);
      componentCurrents[n.id] = I;
    } else {
      componentCurrents[n.id] = C.zero();
    }
  });

  return { netVoltages, componentCurrents, pinToNet, nets };
}

/* ===========================
   Component Node UI (draggable)
   =========================== */
function NodeCard({ node, onMouseDown, selected, onClick }) {
  const style = {
    position: "absolute",
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    borderRadius: 10,
    background: CARD,
    border: `1px solid ${BORDER}`,
    color: TEXT,
    boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "move",
    userSelect: "none",
    transition: "transform 120ms ease",
    transform: selected ? "scale(1.02)" : "none",
  };
  return (
    <div
      style={style}
      onMouseDown={(e) => onMouseDown(e)}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={node.label}
    >
      <div style={{ textAlign: "center", pointerEvents: "none" }}>
        <div style={{ fontWeight: 700, color: ORANGE }}>{node.label}</div>
        <div style={{ fontSize: 11, color: MUTED }}>{node.meta?.type}</div>
      </div>
    </div>
  );
}

/* ===========================
   Wire path helper (nice cubic)
   =========================== */
function makeWirePath(x1, y1, x2, y2) {
  const dx = Math.max(30, Math.abs(x2 - x1));
  const cx1 = x1 + dx * 0.35;
  const cx2 = x2 - dx * 0.35;
  return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
}

/* ===========================
   MAIN Component
   =========================== */
export default function CircuitPlayground() {
  // nodes and wires state
  const [nodes, setNodes] = useState(() => {
    // initial demo scene: voltage source -> resistor -> resistor -> ground
    return [
      {
        id: uuidv4(),
        x: 120,
        y: 120,
        width: 160,
        height: 56,
        label: "AC Source",
        meta: { type: "voltage" },
        params: { Vrms: 12, phase: 0, freq: 50 },
      },
      {
        id: uuidv4(),
        x: 360,
        y: 120,
        width: 120,
        height: 48,
        label: "R 1 kΩ",
        meta: { type: "resistor" },
        params: { R: 1000 },
      },
      {
        id: uuidv4(),
        x: 560,
        y: 120,
        width: 120,
        height: 48,
        label: "R 2.2 kΩ",
        meta: { type: "resistor" },
        params: { R: 2200 },
      },
      {
        id: uuidv4(),
        x: 760,
        y: 120,
        width: 130,
        height: 52,
        label: "Voltmeter",
        meta: { type: "voltmeter" },
        params: { Rin: 1e7 },
      },
      {
        id: uuidv4(),
        x: 560,
        y: 240,
        width: 130,
        height: 52,
        label: "Ammeter (in series)",
        meta: { type: "ammeter" },
        params: { Rin: 0.01 },
      },
    ];
  });
  const [wires, setWires] = useState(() => {
    // initial wires to connect the demo nodes left/right pins in sequence
    // We'll connect AC Source.right -> R1.left, R1.right -> R2.left, R2.right -> Voltmeter.left,
    // Voltmeter.right -> AC Source.left to complete loop. Ammeter is connected in series to R2.right -> Amm.left, Amm.right -> Voltmeter.left
    const ids = nodes.map((n) => n.id);
    if (ids.length < 5) return [];
    const [src, r1, r2, volt, amm] = ids;
    return [
      { id: uuidv4(), from: { node: src, side: "right" }, to: { node: r1, side: "left" } },
      { id: uuidv4(), from: { node: r1, side: "right" }, to: { node: r2, side: "left" } },
      { id: uuidv4(), from: { node: r2, side: "right" }, to: { node: amm, side: "left" } },
      { id: uuidv4(), from: { node: amm, side: "right" }, to: { node: volt, side: "left" } },
      { id: uuidv4(), from: { node: volt, side: "right" }, to: { node: src, side: "left" } },
    ];
  });

  const [selectedId, setSelectedId] = useState(null);
  const [pendingPin, setPendingPin] = useState(null); // { node, side } when user clicked first pin to connect
  const [isMobile, setIsMobile] = useState(false);
  const [running, setRunning] = useState(true);
  const [timeMs, setTimeMs] = useState(0);
   const [mobileOpen, setMobileOpen] = useState(false);
  // chart samples
  const [chartData, setChartData] = useState([]);
  const chartRef = useRef([]);

  // phasor solution
  const lastSolution = useRef({ netVoltages: [], componentCurrents: {}, pinToNet: {}, nets: [] });

  // detect mobile/desktop
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Simulation loop: every 60ms compute phasor solution and push sample (instantaneous) for charts
  useEffect(() => {
    let raf = null;
    let t0 = performance.now();
    function step(now) {
      const dt = now - t0;
      t0 = now;
      if (running) {
        setTimeMs((prev) => prev + dt);
      }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  // Recompute phasor solution whenever nodes/wires change or frequency changes
  const recompute = useCallback(() => {
    const sol = solvePhasor(nodes, wires);
    lastSolution.current = sol;
    // sample instantaneous waveform for primary node (choose first net if exists)
    const netVoltages = sol.netVoltages || [];
    if (netVoltages.length === 0) return;
    // choose a representative net (net index 1 if >1 else 0) - pick net connected to first voltage source's positive pin ideally
    // find a node that's a voltage source and use its right pin net as displayed node
    let chosenNetIndex = 0;
    for (let n of nodes) {
      if (n.meta?.type === "voltage") {
        const pinKey = `${n.id}:right`;
        const pinToNet = sol.pinToNet || {};
        if (pinKey in pinToNet) {
          chosenNetIndex = pinToNet[pinKey];
          break;
        }
      }
    }
    // default fallback
    if (typeof chosenNetIndex === "undefined") chosenNetIndex = 0;

    // Build sample points by computing v(t) = Re{V_phasor * e^{j ω t}} over a few samples
    const samples = [];
    const maxSamples = 120; // window
    const nowMs = performance.now();
    const times = Array.from({ length: 80 }, (_, i) => nowMs - (80 - i) * (1000 / 120));
    // For chosen net, attempt to find frequency: if there is at least one voltage source, take its freq else 50Hz
    const freqs = nodes.filter(n => n.meta?.type === "voltage").map(n => Number(n.params?.freq ?? DEFAULT_PARAMS.voltage.freq));
    const freq = freqs.length ? freqs[0] : 50;
    const omega = 2 * Math.PI * freq;

    const Vphasor = netVoltages[chosenNetIndex] || C.zero();
    for (let t of times) {
      const td = (t / 1000) % (1 / freq); // seconds into waveform
      const angle = omega * (t / 1000);
      // v(t) = Re{V * e^{jωt}} where V is RMS phasor; since V is RMS phasor, v(t) amplitude is sqrt(2)*|V|*cos(ωt+φ)
      // But since we want instantaneous value consistent with phasor (RMS), compute instantaneous: v_inst = Re{V * e^{j ω t}} * sqrt(2)
      const complexExp = C.fromPolar(1, angle);
      const vComplex = C.mul(Vphasor, complexExp);
      const vInst = vComplex.re * Math.SQRT2;
      samples.push({ time: t, voltage: vInst });
    }
    // roll buffer
    chartRef.current = chartRef.current.concat(samples).slice(-400);
    // provide chart data reduced
    const chartView = chartRef.current.map((s, i) => ({ name: i, voltage: s.voltage }));
    setChartData(chartView);
  }, [nodes, wires]);

  // recompute whenever nodes/wires change or running toggled
  useEffect(() => {
    recompute();
  }, [nodes, wires, recompute, running]);

  // clocked sampling for chart while running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      recompute();
    }, 120);
    return () => clearInterval(id);
  }, [running, recompute]);

  /* ===========================
     Node dragging & interactions
     =========================== */
  const dragState = useRef(null); // { nodeId, offsetX, offsetY, startX, startY }

  function onNodeMouseDown(e, node) {
    e.stopPropagation();
    dragState.current = {
      nodeId: node.id,
      offsetX: e.clientX - node.x,
      offsetY: e.clientY - node.y,
      startX: node.x,
      startY: node.y,
    };
    setSelectedId(node.id);
  }

  useEffect(() => {
    function onMouseMove(e) {
      if (!dragState.current) return;
      const { nodeId, offsetX, offsetY } = dragState.current;
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, x: snap(e.clientX - offsetX), y: snap(e.clientY - offsetY) } : n)));
    }
    function onMouseUp(e) {
      if (!dragState.current) return;
      const { nodeId, startX, startY } = dragState.current;
      // if dropped into trash area, remove node
      const trash = document.getElementById("trash-area");
      if (trash) {
        const rect = trash.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          // delete node and wires connected
          setNodes((prev) => prev.filter((n) => n.id !== nodeId));
          setWires((prev) => prev.filter((w) => w.from.node !== nodeId && w.to.node !== nodeId));
        }
      }
      dragState.current = null;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  /* ===========================
     Pin click (connect wires)
     =========================== */
  function onPinClick(nodeId, side) {
    if (!pendingPin) {
      setPendingPin({ node: nodeId, side });
      return;
    }
    // if same pin clicked, cancel
    if (pendingPin.node === nodeId && pendingPin.side === side) {
      setPendingPin(null);
      return;
    }
    // add wire
    const wire = { id: uuidv4(), from: pendingPin, to: { node: nodeId, side } };
    setWires((prev) => [...prev, wire]);
    setPendingPin(null);
  }

  /* ===========================
     Add component from palette
     =========================== */
  function addComponent(tpl) {
    const id = uuidv4();
    const node = {
      id,
      x: 120 + Math.floor(Math.random() * 320),
      y: 140 + Math.floor(Math.random() * 240),
      width: tpl.width,
      height: tpl.height,
      label: tpl.label,
      meta: { type: tpl.id },
      params: { ...(DEFAULT_PARAMS[tpl.id] || {}) },
    };
    setNodes((prev) => [...prev, node]);
  }

  /* ===========================
     Remove Selection / Export / Import
     =========================== */
  function removeSelected() {
    if (!selectedId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedId));
    setWires((prev) => prev.filter((w) => w.from.node !== selectedId && w.to.node !== selectedId));
    setSelectedId(null);
  }

  function exportScene() {
    const payload = { nodes, wires };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `circuit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importScene(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        setNodes(data.nodes || []);
        setWires(data.wires || []);
      } catch (err) {
        console.error("Import failed", err);
      }
    };
    reader.readAsText(file);
  }

  /* ===========================
     Inspector UI updates (edit params)
     =========================== */
  function updateNodeParams(nodeId, patch) {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, params: { ...n.params, ...patch } } : n)));
  }

  /* ===========================
     Visual helpers for pin coordinates on screen
     =========================== */
  function pinScreenPos(node, side) {
    // left pin at x = node.x, y = node.y + node.height/2
    const x = side === "left" ? node.x : node.x + node.width;
    const y = node.y + node.height / 2;
    return { x, y };
  }

  /* ===========================
     Derived: solutions and readouts
     =========================== */
  const solution = useMemo(() => solvePhasor(nodes, wires), [nodes, wires]);
  // map component readouts
  const readouts = useMemo(() => {
    const ro = {};
    for (let n of nodes) {
      const type = n.meta?.type;
      if (type === "voltmeter") {
        // determine RMS voltage between its pins
        const pinKeyL = `${n.id}:left`;
        const pinKeyR = `${n.id}:right`;
        const pinToNet = solution.pinToNet || {};
        const netL = pinToNet[pinKeyL];
        const netR = pinToNet[pinKeyR];
        const Vl = (solution.netVoltages && solution.netVoltages[netL]) || C.zero();
        const Vr = (solution.netVoltages && solution.netVoltages[netR]) || C.zero();
        const Vdiff = C.sub(Vl, Vr);
        const Vrms = C.abs(Vdiff);
        ro[n.id] = { Vrms, phasor: Vdiff };
      } else if (type === "ammeter") {
        const I = solution.componentCurrents[n.id] || C.zero();
        const Irms = C.abs(I);
        ro[n.id] = { Irms, phasor: I };
      } else if (type === "voltage") {
        // show the phasor computed current through the voltage source
        const I = solution.componentCurrents[n.id] || C.zero();
        ro[n.id] = { I_rms: C.abs(I), phasor: I };
      } else if (type === "resistor" || type === "inductor" || type === "capacitor") {
        const I = solution.componentCurrents[n.id] || C.zero();
        ro[n.id] = { I_rms: C.abs(I), phasor: I };
      }
    }
    return ro;
  }, [nodes, solution]);

  /* ===========================
     Render
     =========================== */
  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center p-6">
        <DesktopComputer size={36} />
        <h2 style={{ color: ORANGE, marginTop: 12, marginBottom: 6 }}>Desktop Recommended</h2>
        <div style={{ maxWidth: 640, textAlign: "center", color: MUTED }}>
          This interactive Circuit Playground is optimized for desktops and laptops — drag & wire features,
          detailed charts, and 3D visualizations are hidden on small screens.
          Please open this page on a desktop device for full functionality.
        </div>
      </div>
    );
  }
  const node = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${BG}, #0b0b0b)`, color: TEXT, padding: 12 }}>
      {/* Header */}
    <header className="fixed  w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2 sm:py-0">
      <div className=" px-3 sm:px-6 lg:px-8">
        {/* Top Row */}
        <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
          {/* Left Side Logo + Title */}
          <motion.div
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md hover:scale-105 transition-transform duration-300">
              <Zap className="w-5 h-5 text-black" />
            </div>
            <div className="truncate">
              <div className="text-sm font-semibold text-zinc-200 truncate">
                SparkLab
              </div>
              <div className="text-xs text-zinc-400 -mt-0.5 truncate">
               Circuit Playground
              </div>
            </div>
          </motion.div>

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center gap-4">
            {/* Simulation Mode Selector */}
            <div className="w-32">
 
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                className={`font-semibold text-sm px-3 py-1 rounded-lg shadow-md transition-transform duration-200 ${
                  running
                    ? "bg-zinc-900 text-orange-400 border border-orange-500/40"
                    : "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black hover:scale-105"
                }`}
                onClick={() => setRunning((r) => !r)}
                title={running ? "Pause simulation" : "Run simulation"}
              >
                {running ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}{" "}
                {running ? "Pause" : "Run"}
              </Button>

              <Button
                variant="ghost"
                className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors"
                onClick={exportScene}
                title="Export Circuit"
              >
                <Download className="w-4 h-4" />
              </Button>

              <label>
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importScene(f);
                  }}
                />
                <Button
                  variant="ghost"
                  className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors"
                  asChild
                >
                  <div title="Import Circuit">
                    <Upload className="w-4  h-4"/>
                  </div>
                </Button>
              </label>

              <Button
                variant="ghost"
                className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-red-400 transition-colors"
                onClick={removeSelected}
                title="Delete Selected"
              >
                <Trash2 className="w-4 h-4" />
              </Button>

              <Button
                variant="ghost"
                className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              className="border cursor-pointer border-zinc-800 p-2 rounded-lg"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        <div
          className={`md:hidden transition-all duration-300 overflow-hidden ${
            mobileOpen ? "max-h-60 py-3" : "max-h-0"
          }`}
        >
          <div className="flex flex-col gap-2 mb-3">
     

            <div className="flex gap-2 mt-2">
              <Button
                className={`flex-1 text-xs py-2 rounded-md ${
                  running
                    ? "bg-zinc-900 text-orange-400 border border-orange-500/40"
                    : "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black"
                }`}
                onClick={() => setRunning((r) => !r)}
              >
                {running ? "Pause" : "Run"}
              </Button>
              <Button
                variant="ghost"
                className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md"
                onClick={exportScene}
              >
                Export
              </Button>
              <Button
                variant="ghost"
                className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md"
                onClick={removeSelected}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>

      <div className="mt-20 flex gap-2 " >
        {/* Left: palette */}
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-[280px] flex flex-col gap-5 bg-gradient-to-b from-black/40 to-zinc-950/80 p-2 rounded-2xl border border-zinc-900/80 shadow-lg shadow-orange-500/5 backdrop-blur-sm"
    >
      {/* Components Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="bg-gradient-to-b from-zinc-950/90 to-black/80 border border-zinc-800/80 rounded-2xl shadow-inner shadow-black/40 hover:shadow-orange-500/10 transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-400 text-base font-semibold flex items-center gap-2">
              <Cpu className="w-4 h-4 text-orange-500 drop-shadow-[0_0_5px_#ff7b00]" />
              Components
            </CardTitle>
            <p className="text-zinc-400 text-xs font-light mt-1 leading-snug">
              Click to add, drag components on the board, click pins to wire.
            </p>
          </CardHeader>

          <CardContent className="pt-1 grid gap-2">
            {PALETTE.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                
              >
                <Button
                  onClick={() => addComponent(p)}
                  variant="outline"
                  className="flex justify-start p-7 cursor-pointer items-center gap-3 w-full rounded-xl bg-zinc-950/80 border border-zinc-800 hover:border-orange-500/60 hover:bg-black/60 hover:text-orange-400 transition-all duration-200 text-zinc-100"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center  justify-center font-bold text-black text-sm shadow-inner group-hover:scale-110 transition-transform"
                    style={{ background: p.color }}
                  >
                    {p.icon || <Grid size={16} />}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-sm tracking-wide group-hover:text-orange-300 transition-colors">
                      {p.label}
                    </div>
                    <div className="text-[11px] text-zinc-500">{p.id}</div>
                  </div>
                </Button>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* Instruments Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <Card className="bg-gradient-to-b from-zinc-950/90 to-black/80 border border-zinc-800/80 rounded-2xl shadow-inner shadow-black/40 hover:shadow-orange-500/10 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-orange-400 text-base font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-500 drop-shadow-[0_0_5px_#ff7b00]" />
              Instruments
            </CardTitle>
          </CardHeader>

          <CardContent className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Selected</span>
              <span className="font-semibold text-orange-100">
                {selectedId
                  ? nodes.find((n) => n.id === selectedId)?.label
                  : "—"}
              </span>
            </div>

            <Separator className="my-2 bg-zinc-800" />

            <div className="flex justify-between">
              <span className="text-zinc-400">Time</span>
              <span className="font-semibold text-orange-100">
                {(timeMs / 1000).toFixed(2)} s
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-zinc-400">Nodes</span>
              <span className="font-semibold text-orange-100">
                {nodes.length}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-zinc-400">Wires</span>
              <span className="font-semibold text-orange-100">
                {wires.length}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Trash Area */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <Card
          id="trash-area"
          className="bg-gradient-to-r from-[#2b1510]/90 to-[#1a0b08]/90 border-2 border-dashed border-zinc-800 rounded-2xl p-4 text-[#ffbdb4] flex items-center justify-center gap-3 hover:from-[#3a1d15]/90 hover:to-[#1f0f0a]/90 transition-all shadow-inner"
        >
          <Trash2
            size={18}
            className="text-[#ffbdb4] animate-pulse-slow drop-shadow-[0_0_6px_#ff7b00]"
          />
          <span className="text-sm font-medium tracking-wide">
            Drag here to delete
          </span>
        </Card>
      </motion.div>
    </motion.aside>

        {/* Center: canvas */}
    <main className="flex-1 relative">
      {/* Board Grid */}
      <motion.div
        className="relative h-[520px] rounded-xl border border-zinc-800 bg-gradient-to-b from-black/90 to-zinc-950 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Subtle animated grid */}
        <div className="absolute inset-0 opacity-[0.06] bg-[repeating-linear-gradient(90deg,_#ff8c2d1a_0px,_#ff8c2d1a_12px,_transparent_12px,_transparent_24px)] animate-[pulse_8s_ease-in-out_infinite]" />

        {/* SVG wires overlay */}
        <svg
          className="absolute inset-0 pointer-events-none z-50"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
        >
          <defs>
            <filter id="wireGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="wireCore" x1="0" x2="1">
              <stop offset="0%" stopColor="#ffdca8" stopOpacity="1" />
              <stop offset="100%" stopColor="#ffb86b" stopOpacity="1" />
            </linearGradient>
          </defs>

          {wires.map((w) => {
            const fromNode = nodes.find((n) => n.id === w.from.node);
            const toNode = nodes.find((n) => n.id === w.to.node);
            if (!fromNode || !toNode) return null;
            const p1 = pinScreenPos(fromNode, w.from.side);
            const p2 = pinScreenPos(toNode, w.to.side);
            const d = makeWirePath(p1.x, p1.y, p2.x, p2.y);
            return (
              <g key={w.id}>
                <path
                  d={d}
                  stroke={ORANGE}
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.22}
                  style={{ filter: "url(#wireGlow)" }}
                />
                <path
                  d={d}
                  stroke="#1f1f1f"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d={d}
                  stroke="url(#wireCore)"
                  strokeWidth={2.0}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </g>
            );
          })}
        </svg>

        {/* Node elements */}
        {nodes.map((n) => (
          <div key={n.id}>
            {/* Node Card */}
            <motion.div
              onMouseDown={(e) => onNodeMouseDown(e, n)}
              onClick={() => setSelectedId(n.id)}
              className={`absolute cursor-pointer transition-transform ${
                selectedId === n.id ? "scale-105 drop-shadow-[0_0_6px_#ff7b00]" : ""
              }`}
              style={{
                left: n.x,
                top: n.y,
              }}
            >
              <Card className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 shadow-sm hover:border-orange-400/40 transition-all ">
                <div className="text-sm font-semibold text-white">{n.label}</div>
              </Card>
            </motion.div>

            {/* Left Pin */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                onPinClick(n.id, "left");
              }}
              title="Left Pin"
              className={`absolute w-4 h-4 rounded-full border-2 border-zinc-700 grid place-items-center cursor-pointer transition-all ${
                pendingPin?.node === n.id && pendingPin?.side === "left"
                  ? "bg-orange-500"
                  : "bg-zinc-800"
              }`}
              style={{
                left: n.x - 8,
                top: n.y + n.height / 2 - 8,
              }}
            >
              <div className="w-2 h-2 rounded-full bg-orange-200" />
            </div>

            {/* Right Pin */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                onPinClick(n.id, "right");
              }}
              title="Right Pin"
              className={`absolute w-4 h-4 rounded-full border-2 border-zinc-700 grid place-items-center cursor-pointer transition-all ${
                pendingPin?.node === n.id && pendingPin?.side === "right"
                  ? "bg-orange-500"
                  : "bg-zinc-800"
              }`}
              style={{
                left: n.x + n.width-8,
                top: n.y + n.height / 2 - 8,
              }}
            >
              <div className="w-2 h-2 rounded-full bg-cyan-200" />
            </div>
          </div>
        ))}
      </motion.div>

      {/* Bottom Section: Readouts + Charts */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_420px] gap-4">
        {/* Live Readouts */}
        <Card className="bg-zinc-900/90 border border-zinc-800 rounded-xl shadow-md p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-orange-400 font-semibold flex items-center gap-2">
              <Gauge className="w-4 h-4 text-orange-500" />
              Live Readouts
            </h3>
            <span className="text-zinc-500 text-xs">Phasor solver (RMS)</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Component Values */}
            <div>
              <h4 className="text-white font-semibold mb-2">Component Values</h4>
              <div className="space-y-2">
                {nodes.map((n) => (
                  <div
                    key={n.id}
                    className="flex justify-between items-center bg-black/50 border border-zinc-800 rounded-lg p-2.5"
                  >
                    <div>
                      <div className="font-medium text-white">{n.label}</div>
                      <div className="text-zinc-500 text-xs">
                        {n.meta?.type}
                      </div>
                    </div>
                    <div className="text-right text-orange-400 font-semibold text-sm">
                      {n.meta?.type === "resistor" &&
                        `${fmt(
                          n.params?.R ?? DEFAULT_PARAMS.resistor.R,
                          0
                        )} Ω`}
                      {n.meta?.type === "inductor" &&
                        `${(n.params?.L ?? DEFAULT_PARAMS.inductor.L) * 1000} mH`}
                      {n.meta?.type === "capacitor" &&
                        `${(n.params?.C ?? DEFAULT_PARAMS.capacitor.C) * 1e6} µF`}
                      {n.meta?.type === "voltage" &&
                        `${fmt(
                          n.params?.Vrms ?? DEFAULT_PARAMS.voltage.Vrms,
                          2
                        )} V RMS`}
                      {n.meta?.type === "current" &&
                        `${fmt(
                          n.params?.Irms ?? DEFAULT_PARAMS.current.Irms,
                          3
                        )} A RMS`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Meter Values */}
            <div>
              <h4 className="text-white font-semibold mb-2">Meters</h4>
              <div className="space-y-2">
                {nodes
                  .filter((n) => n.meta?.type === "voltmeter")
                  .map((n) => {
                    const Vrms = readouts[n.id]?.Vrms ?? 0;
                    return (
                      <div
                        key={n.id}
                        className="flex justify-between items-center bg-black/50 border border-zinc-800 rounded-lg p-2.5"
                      >
                        <div>
                          <div className="font-medium text-white">
                            {n.label}
                          </div>
                          <div className="text-zinc-500 text-xs">
                            Across pins
                          </div>
                        </div>
                        <div className="text-orange-400 font-bold text-sm">
                          {fmt(Vrms, 3)} V
                        </div>
                      </div>
                    );
                  })}

                {nodes
                  .filter((n) => n.meta?.type === "ammeter")
                  .map((n) => {
                    const Irms = readouts[n.id]?.Irms ?? 0;
                    return (
                      <div
                        key={n.id}
                        className="flex justify-between items-center bg-black/50 border border-zinc-800 rounded-lg p-2.5"
                      >
                        <div>
                          <div className="font-medium text-white">
                            {n.label}
                          </div>
                          <div className="text-zinc-500 text-xs">
                            Series current
                          </div>
                        </div>
                        <div className="text-orange-400 font-bold text-sm">
                          {fmt(Irms, 4)} A
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </Card>

        {/* Right: Waveform + Phasor Chart */}
        <Card className="bg-zinc-900/90 border border-zinc-800 rounded-xl shadow-md p-4 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-orange-400 font-semibold flex items-center gap-2">
              <Waveform className="w-4 h-4 text-orange-500" />
              Waveform (sampled)
            </h3>
            <span className="text-zinc-500 text-xs">
              {nodes.filter((n) => n.meta?.type === "voltage").length
                ? `Source f=${
                    nodes.find((n) => n.meta?.type === "voltage")?.params
                      ?.freq ?? 50
                  } Hz`
                : ""}
            </span>
          </div>

          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#111" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={false} />
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} />
                <Tooltip  contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff",borderRadius:"10px" }}/>
                <Legend />
                <Line
                  type="monotone"
                  dataKey="voltage"
                  stroke={ORANGE}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <Separator className="bg-zinc-800" />

          <h3 className="text-orange-400 font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-orange-500" />
            3D Phasor Trace
          </h3>

          <div className="h-[220px]">
            <Plot
              data={[
                {
                  x: (chartData || []).map((d) => d.voltage * Math.cos(0)),
                  y: (chartData || []).map((d) => 0),
                  z: (chartData || []).map((_, i) => i),
                  mode: "lines",
                  line: { color: ORANGE },
                  type: "scatter3d",
                },
              ]}
              layout={{
                autosize: true,
                margin: { l: 0, r: 0, b: 0, t: 0 },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                scene: {
                  xaxis: { title: "Re", color: "#fff" },
                  yaxis: { title: "Im", color: "#fff" },
                  zaxis: { title: "t", color: "#fff" },
                },
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </Card>
      </div>
    </main>

        {/* Right: inspector */}
    <aside className="w-[360px] flex flex-col gap-4">
      {/* Inspector Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="bg-zinc-950/90 border border-zinc-800 shadow-lg hover:shadow-orange-500/10 transition-all">
          <CardHeader className="pb-2 flex items-center justify-between">
            <CardTitle className="text-orange-400 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-orange-500" />
              Inspector
            </CardTitle>
            <span className="text-xs text-zinc-400 font-light">
              Edit selected component
            </span>
          </CardHeader>

          <CardContent>
            {!selectedId ? (
              <div className="text-zinc-500 text-sm">
                No component selected • Click a node on the board.
              </div>
            ) : (
              node && (
                <div className="mt-2 space-y-4">
                  <div>
                    <div className="font-semibold text-zinc-100">
                      {node.label}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {node.meta?.type}
                    </div>
                  </div>

                  <Separator className="bg-zinc-800" />

                  {/* Dynamic Parameter Controls */}
                  <div className="space-y-4">
                    {node.meta?.type === "resistor" && (
                      <div className="space-y-2">
                        <label className="text-xs text-zinc-400">
                          Resistance (Ω)
                        </label>
                        <Input
                          type="number"
                          value={node.params?.R ?? ""}
                          onChange={(e) =>
                            updateNodeParams(node.id, {
                              R: Number(e.target.value || 0),
                            })
                          }
                          className="bg-zinc-900 border-zinc-800 text-white"
                        />
                        <Slider
                          min={0}
                          max={1000}
                          step={1}
                          value={[node.params?.R ?? 0]}
                          onValueChange={(v) =>
                            updateNodeParams(node.id, { R: v[0] })
                          }
                          className="text-orange-500"
                        />
                      </div>
                    )}

                    {["inductor", "capacitor", "voltage", "current"].map(
                      (type) =>
                        node.meta?.type === type && (
                          <div
                            key={type}
                            className="grid grid-cols-1 gap-3 text-sm"
                          >
                            {Object.entries(node.params ?? {}).map(
                              ([key, val]) => (
                                <div key={key} className="space-y-1.5">
                                  <label className="text-xs text-zinc-400 capitalize">
                                    {key}
                                  </label>
                                  <Input
                                    type="number"
                                    value={val}
                                    onChange={(e) =>
                                      updateNodeParams(node.id, {
                                        [key]: Number(e.target.value || 0),
                                      })
                                    }
                                    className="bg-zinc-900 border-zinc-800 text-white"
                                  />
                                </div>
                              )
                            )}
                          </div>
                        )
                    )}

                    {(node.meta?.type === "ammeter" ||
                      node.meta?.type === "voltmeter") && (
                      <div className="space-y-2">
                        <label className="text-xs text-zinc-400">
                          Input Resistance (Ω)
                        </label>
                        <Input
                          type="number"
                          value={node.params?.Rin ?? 0}
                          onChange={(e) =>
                            updateNodeParams(node.id, {
                              Rin: Number(e.target.value || 0),
                            })
                          }
                          className="bg-zinc-900 border-zinc-800 text-white"
                        />
                      </div>
                    )}

                    {/* Label Edit */}
                    <div className="space-y-2">
                      <label className="text-xs text-zinc-400">Label</label>
                      <Input
                        value={node.label}
                        onChange={(e) =>
                          setNodes((prev) =>
                            prev.map((nn) =>
                              nn.id === node.id
                                ? { ...nn, label: e.target.value }
                                : nn
                            )
                          )
                        }
                        className="bg-zinc-900 border-zinc-800 text-white"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 mt-2">
                      <Button className="bg-orange-500 text-black font-semibold hover:bg-orange-600 transition">
                        Apply
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedId(null)}
                        className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                </div>
              )
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Simulation Details */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <Card className="bg-zinc-950/90 border border-zinc-800 shadow-lg hover:shadow-orange-500/10 transition-all">
          <CardHeader>
            <CardTitle className="text-orange-400 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-orange-500" />
              Simulation Details
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-400 space-y-4">
            <div className="text-xs">
              Phasor nodal solver (AC steady-state). Supports ideal AC sources,
              resistors, inductors, capacitors, and ideal current sources.
            </div>
            <div className="text-xs">
              Note: This is an educational solver for small circuits, limited by
              numerical stability.
            </div>

            <Separator className="bg-zinc-800" />

            <div>
              <div className="font-semibold text-zinc-100 mb-2">
                Net Voltages (RMS)
              </div>
              <div className="grid gap-2">
                {(solution?.nets || []).map((_, i) => {
                  const v =
                    (solution.netVoltages && solution.netVoltages[i]) || C.zero();
                  return (
                    <div
                      key={i}
                      className="flex justify-between bg-zinc-900/60 px-3 py-2 rounded-md border border-zinc-800"
                    >
                      <span className="text-zinc-500 text-xs">Net {i}</span>
                      <span className="text-orange-400 font-semibold text-xs">
                        {fmt(C.abs(v), 3)} V
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="font-semibold text-zinc-100 mb-2">
                Component Currents (RMS)
              </div>
              <div className="grid gap-2">
                {nodes.map((n) => {
                  const I =
                    (solution.componentCurrents &&
                      solution.componentCurrents[n.id]) ||
                    C.zero();
                  return (
                    <div
                      key={n.id}
                      className="flex justify-between bg-zinc-900/60 px-3 py-2 rounded-md border border-zinc-800"
                    >
                      <span className="text-zinc-500 text-xs">{n.label}</span>
                      <span className="text-orange-400 font-semibold text-xs">
                        {fmt(C.abs(I), 4)} A
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </aside>
      </div>

      {/* keyboard shortcuts help */}
      <div className="fixed bottom-4 left-4 flex items-center gap-2 px-3 py-2
        bg-black/80 border border-zinc-800 text-zinc-400 rounded-lg
        backdrop-blur-md shadow-lg shadow-orange-500/10
        hover:shadow-orange-500/20 hover:text-orange-300 transition-all duration-300">
        Tip: Drag nodes, click pins to connect. Delete selected with the Delete key.
      </div>
    </div>
  );
}
