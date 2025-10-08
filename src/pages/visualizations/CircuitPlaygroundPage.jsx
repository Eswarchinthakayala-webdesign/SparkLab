// src/pages/visualizations/CircuitPlaygroundV2.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  MiniMap,
  Controls as RFControls,
  Background as RFBackground,
  useNodesState,
  useEdgesState,
  Handle,
} from "reactflow";
import "reactflow/dist/style.css";
import { motion } from "framer-motion";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import {
  Activity,
  Play,
  Pause,
  Plus,
  Trash2,
  Zap,
  Gauge,
  Battery,
  Omega,
  Cable,
  RotateCcw,
  DownloadCloud,
} from "lucide-react";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Footer from "@/components/landing/Footer";

// ---------------- THEME ----------------
const THEME = {
  bg: "#05060a",
  cardBg: "rgba(6,6,8,0.44)",
  border: "rgba(255,255,255,0.06)",
  accent: "#ff7a2d",
  accent2: "#ffd24a",
  alt: "#3a8aff",
  subtle: "rgba(255,255,255,0.04)",
  text: "rgba(255,255,255,0.95)",
};

// ---------------- complex helpers (small lib) ----------------
function cAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}
function cSub(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}
function cMul(a, b) {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}
function cDiv(a, b) {
  const denom = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / denom, (a[1] * b[0] - a[0] * b[1]) / denom];
}
function cAbs(a) {
  return Math.hypot(a[0], a[1]);
}
function cConj(a) {
  return [a[0], -a[1]];
}
const toComplex = (r) => [r, 0];

// ---------------- UI component catalog ----------------
const COMPONENT_CATALOG = [
  { type: "resistor", label: "Resistor (Ω)", defaultValue: 100, color: THEME.accent, icon: <Omega className="w-4 h-4" /> },
  { type: "capacitor", label: "Capacitor (F)", defaultValue: 1e-6, color: THEME.alt, icon: <Cable className="w-4 h-4" /> },
  { type: "inductor", label: "Inductor (H)", defaultValue: 1e-3, color: "#7cd389", icon: <Cable className="w-4 h-4" /> },
  { type: "voltage", label: "Voltage Source (V)", defaultValue: 5, color: THEME.accent2, icon: <Battery className="w-4 h-4" /> },
  { type: "ammeter", label: "Ammeter", defaultValue: 0, color: "#e3e3e3", icon: <Gauge className="w-4 h-4" /> },
  { type: "voltmeter", label: "Voltmeter", defaultValue: 0, color: "#e3e3e3", icon: <Zap className="w-4 h-4" /> },
];

// ---------------- default node factory ----------------
const makeNode = (type, position = { x: 50, y: 50 }) => {
  const id = `${type}_${Math.random().toString(36).slice(2, 8)}`;
  const catalog = COMPONENT_CATALOG.find((c) => c.type === type) || { label: type, defaultValue: 1, color: THEME.accent };
  return {
    id,
    type: "componentNode",
    position,
    data: {
      id,
      type,
      label: catalog.label || type,
      value: catalog.defaultValue,
      color: catalog.color,
      icon: catalog.icon || null,
    },
  };
};

// ---------------- React Flow node component ----------------
function ComponentNode({ data }) {
  // data: {id, type, label, value, color, icon}
  // We'll render visible handle markers left (terminal a) and right (terminal b).
  // Each terminal has TWO hidden handles (one source and one target) with IDs like "a-source","a-target".
  // When users connect, we normalize handles to 'a' or 'b' on edge creation.
  return (
    <div
      style={{
        minWidth: 170,
        borderRadius: 12,
        overflow: "hidden",
        border: `1px solid ${THEME.border}`,
        background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
        padding: 8,
        color: THEME.text,
      }}
    >
      {/* left handles (terminal a) */}
      <Handle
        id={`a-target`}
        type="target"
        position="left"
        style={{ background: "transparent", left: -8 }}
      />
      <Handle
        id={`a-source`}
        type="source"
        position="left"
        style={{ background: "transparent", left: -8 }}
      />

      {/* right handles (terminal b) */}
      <Handle
        id={`b-target`}
        type="target"
        position="right"
        style={{ background: "transparent", right: -8 }}
      />
      <Handle
        id={`b-source`}
        type="source"
        position="right"
        style={{ background: "transparent", right: -8 }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: data.color, display: "flex", alignItems: "center", justifyContent: "center", color: "black" }}>
          {data.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: THEME.text, fontWeight: 700 }}>{data.type.toUpperCase()}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{data.id}</div>
        </div>
      </div>

      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{typeof data.value === "number" ? `${data.value}` : data.value}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{data.label}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
        {/* visual small ports */}
        <div style={{ width: 12, height: 12, borderRadius: 6, background: "rgba(255,255,255,0.06)" }} />
        <div style={{ width: 12, height: 12, borderRadius: 6, background: "rgba(255,255,255,0.06)" }} />
      </div>
    </div>
  );
}

// Register custom node types for React Flow mapping
const nodeTypes = {
  componentNode: ComponentNode,
};

// ---------------- Utility: union-find to compute nets ----------------
function unionFindInit() {
  return { parent: {} };
}
function ufFind(uf, x) {
  if (!(x in uf.parent)) uf.parent[x] = x;
  if (uf.parent[x] !== x) uf.parent[x] = ufFind(uf, uf.parent[x]);
  return uf.parent[x];
}
function ufUnion(uf, a, b) {
  const ra = ufFind(uf, a);
  const rb = ufFind(uf, b);
  if (ra !== rb) uf.parent[ra] = rb;
}

// ---------------- Build nets from nodes & edges ----------------
// Each node has two default handles: "a" and "b" (terminal 0 and 1)
function buildNetsFromReactFlow(nodes, edges) {
  const uf = unionFindInit();
  nodes.forEach((n) => {
    ufFind(uf, `${n.id}:a`);
    ufFind(uf, `${n.id}:b`);
  });

  edges.forEach((e) => {
    // Normalize handles: if edge stored with '-source' or '-target', split to base terminal id
    const srcHandle = e.sourceHandle ? e.sourceHandle.split("-")[0] : "a";
    const tgtHandle = e.targetHandle ? e.targetHandle.split("-")[0] : "a";
    const src = `${e.source}:${srcHandle}`;
    const dst = `${e.target}:${tgtHandle}`;
    ufFind(uf, src);
    ufFind(uf, dst);
    ufUnion(uf, src, dst);
  });

  // group terminals by root to nets
  const netMap = {};
  Object.keys(uf.parent).forEach((term) => {
    const root = ufFind(uf, term);
    netMap[root] = netMap[root] || [];
    netMap[root].push(term);
  });

  // map each terminal to a net index 0..N-1
  const roots = Object.keys(netMap);
  const terminalToNet = {};
  roots.forEach((r, idx) => {
    netMap[r].forEach((t) => (terminalToNet[t] = idx));
  });

  return { terminalToNet, netCount: roots.length, netGroups: netMap };
}

// ---------------- MNA solver (AC steady-state) ----------------
// (The solver code is preserved from original file with minor safety tweaks)
function solveMNA(nodes, edges, frequency) {
  const { terminalToNet, netCount } = buildNetsFromReactFlow(nodes, edges);

  const comps = nodes.map((n) => {
    const aTerm = `${n.id}:a`;
    const bTerm = `${n.id}:b`;
    const na = terminalToNet[aTerm] !== undefined ? terminalToNet[aTerm] : null;
    const nb = terminalToNet[bTerm] !== undefined ? terminalToNet[bTerm] : null;
    return {
      id: n.id,
      type: n.data.type,
      value: n.data.value,
      na,
      nb,
      label: n.data.label,
    };
  });

  const refNet = 0;
  const netIndexToVar = {};
  let varIdx = 0;
  for (let i = 0; i < netCount; i++) {
    if (i === refNet) continue;
    netIndexToVar[i] = varIdx++;
  }

  const voltageSources = comps.filter((c) => c.type === "voltage");
  const nv = voltageSources.length;
  const nVar = varIdx + nv;

  const A = Array.from({ length: nVar }, () => Array.from({ length: nVar }, () => [0, 0]));
  const b = Array.from({ length: nVar }, () => [0, 0]);

  const omega = 2 * Math.PI * Math.max(0.0001, frequency);

  function aAdd(i, j, c) {
    A[i][j] = cAdd(A[i][j], c);
  }
  function bAdd(i, c) {
    b[i] = cAdd(b[i], c);
  }

  comps.forEach((c) => {
    const { na, nb } = c;
    if (c.type === "voltage") return;

    let Y;
    if (c.type === "resistor") Y = [1 / Math.max(1e-12, c.value), 0];
    else if (c.type === "capacitor") Y = [0, omega * c.value];
    else if (c.type === "inductor") Y = [0, -1 / (omega * c.value)];
    else Y = [1 / Math.max(1e-12, c.value || 1), 0];

    const ia = na === null ? null : na === refNet ? null : netIndexToVar[na];
    const ib = nb === null ? null : nb === refNet ? null : netIndexToVar[nb];

    if (ia !== null) aAdd(ia, ia, Y);
    if (ib !== null) aAdd(ib, ib, Y);
    if (ia !== null && ib !== null) {
      aAdd(ia, ib, [-Y[0], -Y[1]]);
      aAdd(ib, ia, [-Y[0], -Y[1]]);
    }
  });

  voltageSources.forEach((vs, idx) => {
    const srcVar = varIdx + idx;
    const { na, nb } = vs;
    const ia = na === refNet ? null : netIndexToVar[na];
    const ib = nb === refNet ? null : netIndexToVar[nb];

    if (ia !== null) aAdd(ia, srcVar, [1, 0]);
    if (ib !== null) aAdd(ib, srcVar, [-1, 0]);

    if (ia !== null) aAdd(srcVar, ia, [1, 0]);
    if (ib !== null) aAdd(srcVar, ib, [-1, 0]);

    const Vph = [vs.value || 0, 0];
    bAdd(srcVar, Vph);
  });

  // Solve complex linear system by Gaussian elimination (naive)
  const N = nVar;
  const M = A.map((row) => row.map((c) => [c[0], c[1]]));
  const rhs = b.map((c) => [c[0], c[1]]);

  function swapRows(i, j) {
    const tmp = M[i];
    M[i] = M[j];
    M[j] = tmp;
    const t2 = rhs[i];
    rhs[i] = rhs[j];
    rhs[j] = t2;
  }
  function complexAbsSq(z) {
    return z[0] * z[0] + z[1] * z[1];
  }

  for (let k = 0; k < N; k++) {
    let piv = k;
    let pivMag = complexAbsSq(M[k][k]);
    for (let r = k + 1; r < N; r++) {
      const mag = complexAbsSq(M[r][k]);
      if (mag > pivMag) {
        piv = r;
        pivMag = mag;
      }
    }
    if (piv !== k) swapRows(k, piv);

    const pivot = M[k][k];
    if (Math.abs(pivot[0]) < 1e-12 && Math.abs(pivot[1]) < 1e-12) continue;

    for (let col = k; col < N; col++) M[k][col] = cDiv(M[k][col], pivot);
    rhs[k] = cDiv(rhs[k], pivot);

    for (let r = 0; r < N; r++) {
      if (r === k) continue;
      const factor = M[r][k];
      if (Math.abs(factor[0]) < 1e-15 && Math.abs(factor[1]) < 1e-15) continue;
      for (let c = k; c < N; c++) {
        M[r][c] = cSub(M[r][c], cMul(factor, M[k][c]));
      }
      rhs[r] = cSub(rhs[r], cMul(factor, rhs[k]));
    }
  }

  const x = rhs.map((v) => [v[0], v[1]]);

  const nodeVoltages = Array.from({ length: netCount }, () => [0, 0]);
  for (let net = 0; net < netCount; net++) {
    if (net === refNet) nodeVoltages[net] = [0, 0];
    else {
      const vidx = netIndexToVar[net];
      if (vidx !== undefined && vidx < x.length) nodeVoltages[net] = x[vidx];
      else nodeVoltages[net] = [0, 0];
    }
  }

  const vsCurrents = voltageSources.map((vs, idx) => {
    const vidx = varIdx + idx;
    return x[vidx] || [0, 0];
  });

  const branchCurrents = comps.map((c) => {
    const na = c.na;
    const nb = c.nb;
    const Vna = na !== null ? nodeVoltages[na] : [0, 0];
    const Vnb = nb !== null ? nodeVoltages[nb] : [0, 0];
    const Vab = cSub(Vna, Vnb);
    if (c.type === "voltage") {
      return { id: c.id, current: null };
    }
    let Z;
    if (c.type === "resistor") Z = [c.value, 0];
    else if (c.type === "capacitor") Z = [0, -1 / (omega * c.value)];
    else if (c.type === "inductor") Z = [0, omega * c.value];
    else Z = [c.value || 1, 0];
    const I = cDiv(Vab, Z);
    return { id: c.id, current: I };
  });

  return {
    netCount,
    nodeVoltages,
    vsCurrents,
    branchCurrents,
    comps,
    success: true,
  };
}

// ---------------- waveform builder ----------------
function makeWaveformFromNodeVoltage(phComplex, frequency, sampleCount = 240) {
  const omega = 2 * Math.PI * Math.max(0.0001, frequency);
  const data = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = (i / sampleCount) * (1 / frequency) * 2;
    const vt = phComplex[0] * Math.cos(omega * t) - phComplex[1] * Math.sin(omega * t);
    data.push({ t, v: vt });
  }
  return data;
}

// ---------------- SVG overlay for animated wire currents ----------------
function WireFlowOverlay({ edges, branchCurrents, nodes }) {
  const currentsMap = {};
  branchCurrents.forEach((b) => {
    currentsMap[b.id] = b.current;
  });

  return (
    <svg className="pointer-events-none absolute inset-0 w-full h-full">
      {edges.map((e) => {
        const srcNode = nodes.find((n) => n.id === e.source);
        const tgtNode = nodes.find((n) => n.id === e.target);
        if (!srcNode || !tgtNode) return null;
        const sx = srcNode.position.x + 120;
        const sy = srcNode.position.y + 24;
        const tx = tgtNode.position.x + 120;
        const ty = tgtNode.position.y + 24;

        const compId = srcNode.id;
        const c = currentsMap[compId];
        let mag = 0;
        if (c && c.current) mag = Math.min(1.0, cAbs(c.current));
        const stroke = `rgba(255,122,45,${0.12 + 0.6 * Math.min(1, mag)})`;
        const dashOffset = ((Date.now() / 60) % 100) * (0.5 + mag);

        return (
          <g key={e.id}>
            <defs>
              <linearGradient id={`g-${e.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={THEME.accent} stopOpacity="0.9" />
                <stop offset="100%" stopColor={THEME.accent2} stopOpacity="0.85" />
              </linearGradient>
            </defs>
            <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={`url(#g-${e.id})`} strokeWidth={4} strokeLinecap="round" strokeDasharray="8 6" strokeDashoffset={dashOffset} opacity={0.9} />
            <circle cx={(sx + tx) / 2} cy={(sy + ty) / 2} r={4 + mag * 4} fill={THEME.accent2} opacity={0.95} />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------- Modal component (simple inline) ----------------
function Modal({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-50 w-full max-w-md p-4">
        <div style={{ borderRadius: 12, background: THEME.cardBg, border: `1px solid ${THEME.border}`, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>{title}</div>
            <button onClick={onClose} className="text-zinc-400">✕</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------- Main Page ----------------
export default function CircuitPlaygroundV2() {
  // React Flow state hooks
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef(null);
  const [rfInstance, setRfInstance] = useState(null);

  // Simulation & UI state
  const [frequency, setFrequency] = useState(50);
  const [running, setRunning] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [mnaResult, setMnaResult] = useState(null);
  const [showWaveformForNet, setShowWaveformForNet] = useState(null);

  // Modal editable fields
  const [modalOpen, setModalOpen] = useState(false);
  const [modalValue, setModalValue] = useState("");
  const [modalLabel, setModalLabel] = useState("");

  // initial sample circuit
  useEffect(() => {
    if (nodes.length === 0) {
      const n1 = makeNode("voltage", { x: 40, y: 120 });
      const n2 = makeNode("resistor", { x: 320, y: 120 });
      const n3 = makeNode("resistor", { x: 620, y: 120 });
      setNodes([n1, n2, n3]);
      setEdges([
        { id: "e1", source: n1.id, sourceHandle: "a", target: n2.id, targetHandle: "a", animated: true },
        { id: "e2", source: n2.id, sourceHandle: "b", target: n3.id, targetHandle: "a", animated: true },
        { id: "e3", source: n3.id, sourceHandle: "b", target: n1.id, targetHandle: "b", animated: true },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Normalize a handle id such as "a-source" => "a"
  const normalizeHandle = (h) => (h ? h.split("-")[0] : h);

  // React Flow onConnect: enforce port-to-port connections; normalize handles; reject same-node direct self-connection
  const onConnect = useCallback(
    (params) => {
      // must have source and target
      if (!params.source || !params.target) {
        window.alert("Invalid connection (missing source/target).");
        return;
      }
      // reject connecting node -> same node on same terminal
      if (params.source === params.target) {
        // allow connecting different handles on same node? usually no. Block for safety.
        window.alert("Cannot connect a node to itself.");
        return;
      }

      // Normalize handles like "a-source" -> "a"
      const srcHandle = normalizeHandle(params.sourceHandle) || "a";
      const tgtHandle = normalizeHandle(params.targetHandle) || "a";

      // ensure handles exist (only 'a' and 'b' allowed)
      const allowed = ["a", "b"];
      if (!allowed.includes(srcHandle) || !allowed.includes(tgtHandle)) {
        window.alert("Connections must be between valid component ports (a or b).");
        return;
      }

      // create unique id for edge
      const newEdge = {
        ...params,
        id: `e-${Math.random().toString(36).slice(2, 7)}`,
        animated: true,
        style: { stroke: THEME.accent2, strokeWidth: 3 },
        sourceHandle: srcHandle,
        targetHandle: tgtHandle,
      };

      // prevent duplicates (same source/target and handles)
      const exists = edges.some(
        (e) =>
          e.source === newEdge.source &&
          e.target === newEdge.target &&
          (e.sourceHandle === newEdge.sourceHandle || e.targetHandle === newEdge.targetHandle)
      );
      if (exists) {
        // still allow multiple wires between same nodes but different handles? block for now
        window.alert("A similar connection already exists.");
        return;
      }

      setEdges((eds) => addEdge(newEdge, eds));
    },
    [edges, setEdges]
  );

  // Add component from palette
  function addComponent(type) {
    const rect = reactFlowWrapper.current?.getBoundingClientRect();
    const pos = rect ? { x: Math.max(40, rect.width / 2 - 60), y: rect.height / 2 - 40 } : { x: 40, y: 40 };
    const node = makeNode(type, pos);
    setNodes((nds) => nds.concat(node));
  }

  function removeNodeById(nodeId) {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
      setModalOpen(false);
    }
  }

  function resetCanvas() {
    setNodes([]);
    setEdges([]);
    setMnaResult(null);
    setSelectedNodeId(null);
    setModalOpen(false);
  }

  // Update node property
  function updateNodeValue(nodeId, newValue) {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, value: newValue } } : n)));
  }
  function updateNodeLabel(nodeId, newLabel) {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label: newLabel } } : n)));
  }

  // When user clicks a node -> open modal to edit or delete
  function handleNodeClick(evt, node) {
    setSelectedNodeId(node.id);
    setModalValue(String(node.data.value ?? ""));
    setModalLabel(String(node.data.label ?? ""));
    setModalOpen(true);
  }

  // Main simulation runner
  useEffect(() => {
    let tick = null;
    function runOnce() {
      try {
        const result = solveMNA(nodes, edges, frequency);
        setMnaResult(result);
      } catch (err) {
        console.error("Solver error", err);
        setMnaResult(null);
      }
    }
    runOnce();
    if (running) {
      tick = setInterval(runOnce, 450);
    }
    return () => clearInterval(tick);
  }, [nodes, edges, frequency, running]);

  // Build waveform data for selected net or first net
  const waveformData = useMemo(() => {
    if (!mnaResult) return [];
    const netVoltages = mnaResult.nodeVoltages || [];
    const netIndex = showWaveformForNet !== null ? showWaveformForNet : 0;
    const ph = netVoltages[netIndex] || [0, 0];
    const data = [];
    const sampleCount = 240;
    const omega = 2 * Math.PI * Math.max(0.0001, frequency);
    for (let i = 0; i < sampleCount; i++) {
      const t = (i / sampleCount) * (1 / frequency) * 2;
      const v = ph[0] * Math.cos(omega * t) - ph[1] * Math.sin(omega * t);
      data.push({ t: t.toFixed(4), v: parseFloat(v.toFixed(4)) });
    }
    return data;
  }, [mnaResult, showWaveformForNet, frequency]);

  // Utility: export circuit JSON
  function exportCircuit() {
    const payload = { nodes, edges, frequency };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "circuit.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Utility: import (simple file input)
  function importCircuit(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.nodes && parsed.edges) {
          setNodes(parsed.nodes);
          setEdges(parsed.edges);
          if (parsed.frequency) setFrequency(parsed.frequency);
        } else {
          window.alert("Invalid circuit file.");
        }
      } catch (e) {
        console.error("Invalid file", e);
        window.alert("Failed to parse file.");
      }
    };
    reader.readAsText(file);
  }

  // When modal save
  function saveModal() {
    if (!selectedNodeId) return;
    const parsedVal = Number(modalValue);
    if (!Number.isNaN(parsedVal)) updateNodeValue(selectedNodeId, parsedVal);
    updateNodeLabel(selectedNodeId, modalLabel);
    setModalOpen(false);
  }

  // Responsive canvas height style
  const canvasHeight = typeof window !== "undefined" ? Math.max(420, window.innerHeight - 220) : 560;

  return (
    <div style={{ background: THEME.bg, minHeight: "100vh", color: THEME.text }}>
      {/* header */}
      <header className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md bg-black/30 border-b" style={{ borderColor: THEME.border }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div style={{ width: 44, height: 44, borderRadius: 10, background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`, display: "flex", alignItems: "center", justifyContent: "center", color: "black" }}>
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-zinc-300">SparkLab</div>
                <div className="text-xs text-zinc-400 -mt-0.5">Circuit Playground • v2</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden md:block text-xs text-zinc-400">Drag components → connect ports (left ↔ right) → run</div>
              <Button className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => setRunning((r) => !r)}>
                {running ? <><Pause className="w-4 h-4 mr-2" /> Pause</> : <><Play className="w-4 h-4 mr-2" /> Run</>}
              </Button>
              <Button variant="outline" className="border border-zinc-700" onClick={resetCanvas}><RotateCcw className="w-4 h-4 mr-2" /> Reset</Button>
              <Button variant="ghost" className="border border-zinc-700" onClick={exportCircuit}><DownloadCloud className="w-4 h-4 mr-2" /> Export</Button>
            </div>
          </div>
        </div>
      </header>

      {/* main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* palette and controls */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="rounded-2xl border" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
              <CardHeader className="p-4">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: THEME.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "black" }}>
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">Component Library</CardTitle>
                    <div className="text-xs text-zinc-400">Click to add → then connect left/right ports</div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-3 space-y-2">
                {COMPONENT_CATALOG.map((c) => (
                  <motion.div key={c.type} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex items-center justify-between p-2 rounded-md border cursor-pointer" style={{ borderColor: THEME.border }} onClick={() => addComponent(c.type)}>
                    <div className="flex items-center gap-2">
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: c.color, display: "flex", alignItems: "center", justifyContent: "center", color: "black" }}>{c.icon}</div>
                      <div>
                        <div className="text-sm">{c.label}</div>
                        <div className="text-xs text-zinc-400">Default: {c.defaultValue}</div>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-zinc-400" />
                  </motion.div>
                ))}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button onClick={() => setNodes([])} variant="outline" className="border border-zinc-700">Clear Nodes</Button>
                  <Button onClick={() => setEdges([])} variant="outline" className="border border-zinc-700">Clear Wires</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
              <CardHeader className="p-4">
                <CardTitle className="text-sm">Simulation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-zinc-400">AC Frequency (Hz)</div>
                <Input type="number" value={frequency} onChange={(e) => setFrequency(Number(e.target.value) || 1)} className="bg-zinc-900/60 mt-2" />
                <div className="mt-3 text-xs text-zinc-400">Selected Component</div>
                <div className="mt-2">
                  <div className="text-sm">{selectedNodeId ? selectedNodeId : <span className="text-zinc-500">None</span>}</div>
                  {selectedNodeId && (
                    <>
                      <div className="mt-2">
                        <label className="text-xs text-zinc-400">Value</label>
                        <Input type="number" onChange={(e) => updateNodeValue(selectedNodeId, Number(e.target.value) || 0)} className="bg-zinc-900/60 mt-1" />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button className="border border-zinc-700" onClick={() => removeNodeById(selectedNodeId)}><Trash2 className="w-4 h-4 mr-2" />Remove</Button>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border p-3" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
              <CardHeader className="p-3">
                <CardTitle className="text-sm">Measurement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-zinc-400 mb-2">Live Readings</div>
                {mnaResult ? (
                  <>
                    <div className="text-sm">Nets: {mnaResult.netCount}</div>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      {mnaResult.nodeVoltages.map((v, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <div className="text-xs text-zinc-400">Net {idx}</div>
                          <div className="text-sm">{(v[0] || 0).toFixed(3)} + j{(v[1] || 0).toFixed(3)} V</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-zinc-400">Branch currents</div>
                    <div className="mt-1 text-sm">
                      {mnaResult.branchCurrents.map((b) => (
                        <div key={b.id} className="flex justify-between">
                          <div>{b.id}</div>
                          <div>{b.current ? cAbs(b.current).toFixed(4) + " A" : "-"}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-zinc-500">No simulation result yet</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* canvas area */}
          <div className="lg:col-span-6 relative" ref={reactFlowWrapper} style={{ minHeight: canvasHeight }}>
            <div className="absolute inset-0 pointer-events-none z-10">
              {mnaResult && <WireFlowOverlay edges={edges} branchCurrents={mnaResult.branchCurrents} nodes={nodes} />}
            </div>

            <div style={{ width: "100%", height: canvasHeight, borderRadius: 16, overflow: "hidden", border: `1px solid ${THEME.border}` }}>
              <ReactFlowProvider>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onInit={(rf) => setRfInstance(rf)}
                  onNodeClick={handleNodeClick}
                  nodeTypes={nodeTypes}
                  fitView
                  connectionLineStyle={{ stroke: THEME.accent2, strokeWidth: 2 }}
                  connectionLineType="bezier"
                >
                  <MiniMap style={{ background: THEME.cardBg, borderRadius: 8 }} nodeColor={(n) => n.data.color || THEME.accent} />
                  <RFControls />
                  <RFBackground gap={16} size={1} style={{ background: THEME.bg }} />
                </ReactFlow>
              </ReactFlowProvider>
            </div>
          </div>

          {/* right: waveform and details */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="rounded-2xl border p-3" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
              <CardHeader className="p-3 flex items-center justify-between">
                <CardTitle className="text-sm">Oscilloscope</CardTitle>
                <div className="text-xs text-zinc-400">Voltage vs Time</div>
              </CardHeader>
              <CardContent>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={waveformData}>
                      <CartesianGrid stroke={THEME.subtle} strokeDasharray="3 3" />
                      <XAxis dataKey="t" hide />
                      <YAxis domain={["auto", "auto"]} />
                      <Tooltip />
                      <Line isAnimationActive={false} type="monotone" dataKey="v" stroke={THEME.accent} dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button className="border border-zinc-700" onClick={() => setShowWaveformForNet((s) => (s === null ? 0 : null))}>Toggle Net Wave</Button>
                  <Button onClick={() => exportCircuit()} className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black">Export JSON</Button>
                  <input type="file" accept="application/json" onChange={(e) => e.target.files && importCircuit(e.target.files[0])} className="hidden" id="import-file" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border p-3" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
              <CardHeader className="p-3 flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Quick Actions</CardTitle>
                </div>
                <div className="text-xs text-zinc-400">Tools</div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2">
                  <Button onClick={() => setNodes((n) => n.concat(makeNode("resistor", { x: 160 + n.length * 20, y: 180 })))} className="border border-zinc-700">Add Resistor</Button>
                  <Button onClick={() => setNodes((n) => n.concat(makeNode("capacitor", { x: 200 + n.length * 20, y: 220 })))} className="border border-zinc-700">Add Capacitor</Button>
                  <Button onClick={() => setNodes((n) => n.concat(makeNode("inductor", { x: 240 + n.length * 20, y: 260 })))} className="border border-zinc-700">Add Inductor</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border p-3" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
              <CardHeader className="p-3">
                <CardTitle className="text-sm">Netlist Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-zinc-400">Nodes</div>
                <div className="mt-2 text-sm">
                  {nodes.map((n) => (
                    <div key={n.id} className="flex justify-between">
                      <div>{n.id}</div>
                      <div className="text-zinc-400">{n.data.type}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 text-xs text-zinc-400">Wires</div>
                <div className="mt-2 text-sm">
                  {edges.map((e) => (
                    <div key={e.id} className="flex justify-between">
                      <div>{e.id}</div>
                      <div className="text-zinc-400">{e.source}:{e.sourceHandle} → {e.target}:{e.targetHandle}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* modal for node edit / delete */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={selectedNodeId ? `Edit ${selectedNodeId}` : "Edit"}>
        <div>
          <div className="mb-2 text-xs text-zinc-400">Label</div>
          <Input value={modalLabel} onChange={(e) => setModalLabel(e.target.value)} className="mb-3 bg-zinc-900/60" />
          <div className="mb-2 text-xs text-zinc-400">Value</div>
          <Input value={modalValue} onChange={(e) => setModalValue(e.target.value)} type="number" className="mb-4 bg-zinc-900/60" />

          <div className="flex justify-between items-center">
            <div>
              <Button className="border border-zinc-700 mr-2" onClick={() => { saveModal(); }} >Save</Button>
              <Button variant="outline" className="border border-zinc-700" onClick={() => { setModalOpen(false); }}>Cancel</Button>
            </div>
            <div>
              <Button className="bg-red-600" onClick={() => { if (selectedNodeId && confirm("Delete this component?")) removeNodeById(selectedNodeId); }}>Delete</Button>
            </div>
          </div>
        </div>
      </Modal>

      <Footer />
    </div>
  );
}
