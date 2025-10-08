// src/pages/MeshNodalAnalysisPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Activity,
  Cpu,
  Terminal,
  Play,
  Pause,
  Plus,
  Trash2,
  Layers,
  Gauge,
  Download,
  Settings,
  Menu,
  X,
  Lightbulb,
  ArrowRight,
  Plug,
  ZapOff,
  MapPin,
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
   Linear algebra: Gaussian elimination with partial pivoting
   - Solves Ax = b
   ============================ */
function solveLinearSystem(A, b) {
  // A: array of arrays (n x n), b: array (n)
  const n = A.length;
  // create augmented matrix
  const M = new Array(n);
  for (let i = 0; i < n; i++) {
    M[i] = new Array(n + 1);
    for (let j = 0; j < n; j++) M[i][j] = Number(A[i][j]) || 0;
    M[i][n] = Number(b[i]) || 0;
  }

  const EPS = 1e-12;

  for (let k = 0; k < n; k++) {
    // partial pivot
    let maxRow = k;
    let maxVal = Math.abs(M[k][k]);
    for (let r = k + 1; r < n; r++) {
      const val = Math.abs(M[r][k]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = r;
      }
    }
    if (maxVal < EPS) {
      // singular or nearly singular
      return null;
    }
    if (maxRow !== k) {
      const tmp = M[k];
      M[k] = M[maxRow];
      M[maxRow] = tmp;
    }

    // elimination
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      M[i][k] = 0;
      for (let j = k + 1; j <= n; j++) {
        M[i][j] -= f * M[k][j];
      }
    }
  }

  // back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
    if (!Number.isFinite(x[i])) return null;
  }
  return x;
}

/* ============================
   MNA (Modified Nodal Analysis) solver
   - nodes: array of node ids (strings or numbers). One node must be '0' or 'GND' representing reference.
   - branches: array of branch objects:
       { id, from, to, type: 'R'|'V'|'I', value: number, name? }
     type semantics:
       R: value in ohms
       V: voltage source (positive from 'from' node to 'to' node) in volts
       I: current source (current from 'from' node to 'to' node) in amps
   - returns null on failure, or an object:
       { success: true, nodeVoltages: {nodeId: V}, branchCurrents: {branchId: I}, voltageSourceCurrents: {vsrcIndex: I}, raw: {A,b,x} }
   ============================ */
function solveMNA(nodes, branches) {
  // Map node ids to indices (exclude reference '0' or 'GND' from unknown voltages)
  const refCandidates = new Set(["0", 0, "GND", "gnd", "Gnd"]);
  let refNode = null;
  const nodeIds = Array.from(new Set(nodes.map(String)));
  for (const nid of nodeIds) {
    if (refCandidates.has(nid)) {
      refNode = String(nid);
      break;
    }
  }
  if (refNode == null) {
    // if no '0' node provided, pick the first as reference
    refNode = nodeIds[0];
  }
  const nonRefNodes = nodeIds.filter((n) => n !== refNode);
  const N = nonRefNodes.length;

  // Identify voltage sources
  const vsrcs = branches.filter((b) => b.type === "V");
  const M = vsrcs.length;

  // We'll build matrices:
  // | G  B | [V_nodes]   = [I_inj]
  // | B^T 0| [I_vs  ]     [E_vs ]
  // G is N x N, B is N x M
  const G = Array.from({ length: N }, () => Array(N).fill(0)); // conductance
  const B = Array.from({ length: N }, () => Array(M).fill(0));
  const Iinj = Array(N).fill(0); // injected currents into each node from current sources (positive into node)
  const E = Array(M).fill(0); // voltage source voltages (Vpos - Vneg)

  // helper to get node index
  const nodeIndex = (nid) => {
    const s = String(nid);
    if (s === refNode) return -1;
    return nonRefNodes.indexOf(s);
  };

  // Build G and B and Iinj
  for (let bi = 0; bi < branches.length; bi++) {
    const br = branches[bi];
    const a = nodeIndex(br.from);
    const b = nodeIndex(br.to);

    if (br.type === "R") {
      const R = Number(br.value);
      if (!Number.isFinite(R) || R <= 0) continue;
      const g = 1 / R;
      if (a >= 0) G[a][a] += g;
      if (b >= 0) G[b][b] += g;
      if (a >= 0 && b >= 0) {
        G[a][b] -= g;
        G[b][a] -= g;
      }
    } else if (br.type === "I") {
      // current from "from" -> "to" of magnitude value
      const I = Number(br.value) || 0;
      // into 'from' it's -I (it leaves 'from'), into 'to' it's +I (it enters 'to')
      if (a >= 0) Iinj[a] -= I;
      if (b >= 0) Iinj[b] += I;
      // if branch connected to reference node, handle accordingly (nodeIndex returns -1)
    } else if (br.type === "V") {
      // voltage source with value = Vpos - Vneg (from->to)
      // record into B and E later once we know index in vsrcs
      // find which vsrc index this is (by reference equality using filter above)
    }
  }

  // Fill B and E
  for (let k = 0; k < M; k++) {
    const br = vsrcs[k];
    const a = nodeIndex(br.from);
    const b = nodeIndex(br.to);
    if (a >= 0) B[a][k] = 1;
    if (b >= 0) B[b][k] = -1;
    E[k] = Number(br.value) || 0;
  }

  // Build augmented A and right-hand side
  const size = N + M;
  if (size === 0) {
    return { success: true, nodeVoltages: { [refNode]: 0 }, branchCurrents: {}, raw: {} };
  }

  // A: size x size, bVec: size
  const A = Array.from({ length: size }, () => Array(size).fill(0));
  const bVec = Array(size).fill(0);

  // top-left: G
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) A[i][j] = G[i][j];
  }

  // top-right: B
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < M; k++) A[i][N + k] = B[i][k];
  }
  // bottom-left: B^T
  for (let k = 0; k < M; k++) {
    for (let i = 0; i < N; i++) A[N + k][i] = B[i][k];
  }
  // bottom-right: zeros (already zeroed)

  // right-hand side
  for (let i = 0; i < N; i++) bVec[i] = Iinj[i];
  for (let k = 0; k < M; k++) bVec[N + k] = E[k];

  // Solve A x = b
  const x = solveLinearSystem(A, bVec);
  if (!x) {
    return null;
  }

  // Extract node voltages (including reference = 0)
  const nodeVoltages = {};
  nodeVoltages[refNode] = 0;
  for (let i = 0; i < N; i++) {
    nodeVoltages[nonRefNodes[i]] = x[i];
  }

  // voltage source currents
  const vsrcCurrents = {};
  for (let k = 0; k < M; k++) {
    vsrcCurrents[k] = x[N + k]; // positive current flowing from + node (from) to - node (to)
  }

  // compute branch currents for all branches
  const branchCurrents = {};
  for (let bi = 0; bi < branches.length; bi++) {
    const br = branches[bi];
    const Va = nodeVoltages[String(br.from)] ?? 0;
    const Vb = nodeVoltages[String(br.to)] ?? 0;
    if (br.type === "R") {
      const R = Number(br.value);
      const I = (Va - Vb) / R; // from->to current
      branchCurrents[br.id] = I;
    } else if (br.type === "I") {
      // For an independent current source, we return value as the branch current (direction from -> to)
      branchCurrents[br.id] = Number(br.value) || 0;
    } else if (br.type === "V") {
      // Find index of this voltage source in vsrcs
      const idx = vsrcs.indexOf(br);
      if (idx >= 0) {
        branchCurrents[br.id] = vsrcCurrents[idx];
      } else {
        // fallback: compute using node voltages (Va - Vb) / small R? But we should have idx
        branchCurrents[br.id] = 0;
      }
    }
  }

  return { success: true, nodeVoltages, branchCurrents, voltageSourceCurrents: vsrcCurrents, raw: { A, b: bVec, x } };
}

/* ============================
   Simple cycle basis finder (fundamental cycles)
   - Build adjacency list and spanning tree,
   - For each non-tree edge create a fundamental cycle.
   - Works well for planar-ish circuits; if current sources present we fallback to MNA.
   ============================ */
function computeFundamentalCycles(nodes, branches) {
  // nodes: array of node ids (strings), branches: same as before
  const nodeList = Array.from(new Set(nodes.map(String)));
  const adj = {};
  nodeList.forEach((n) => (adj[n] = []));
  branches.forEach((b) => {
    const u = String(b.from);
    const v = String(b.to);
    adj[u].push({ to: v, id: b.id });
    adj[v].push({ to: u, id: b.id });
  });

  // simple DFS to build spanning tree and parents
  const parent = {};
  const parentEdge = {};
  const visited = new Set();
  const stack = [nodeList[0]];
  visited.add(nodeList[0]);
  parent[nodeList[0]] = null;
  parentEdge[nodeList[0]] = null;

  while (stack.length) {
    const cur = stack.pop();
    for (const e of adj[cur]) {
      if (!visited.has(e.to)) {
        visited.add(e.to);
        parent[e.to] = cur;
        parentEdge[e.to] = e.id;
        stack.push(e.to);
      }
    }
  }

  // non-tree edges
  const treeEdges = new Set(Object.values(parentEdge).filter(Boolean));
  const cycles = [];
  for (const br of branches) {
    if (treeEdges.has(br.id)) continue;
    // br is non-tree edge connecting u - v
    const u = String(br.from);
    const v = String(br.to);
    // build path u->...->root and v->...->root, then find LCA and compose cycle
    const pathU = [];
    let cur = u;
    while (cur !== null) {
      pathU.push(cur);
      cur = parent[cur] ?? null;
    }
    const pathV = [];
    cur = v;
    while (cur !== null) {
      pathV.push(cur);
      cur = parent[cur] ?? null;
    }
    // find LCA
    let i = pathU.length - 1;
    let j = pathV.length - 1;
    while (i >= 0 && j >= 0 && pathU[i] === pathV[j]) {
      i--;
      j--;
    }
    const pathBetween = [...pathU.slice(0, i + 1), ...pathV.slice(0, j + 1).reverse()];
    // cycle is pathBetween plus the non-tree edge br connecting ends
    // collect node pairs into cycle edges
    const cycleNodes = pathBetween;
    cycles.push({ nodes: cycleNodes, viaEdge: br.id, edges: null });
  }

  // We return cycles as node lists (this is enough to build mesh equations when planar)
  return cycles;
}

/* ============================
   Simulation hook for mesh/nodal page
   - Performs solve on-demand (when inputs change) and produces history for plots & animations.
   - Smoothly interpolates between states.
   ============================ */
function useCircuitSim({ nodes, branches, method = "nodal", running = true, timestep = 80 }) {
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, timestamp: Date.now(), nodes: {}, branchCurrents: {} })));
  const [history, setHistory] = useState(historyRef.current);
  const stateRef = useRef({ nodes: {}, branchCurrents: {} }); // latest solved
  const lastRef = useRef(performance.now());
  const tRef = useRef(0);
  const rafRef = useRef(null);

  // compute once per branches/nodes/method change
  const computeNow = useCallback(() => {
    // For now we try MNA; if method === 'mesh' we'll try to extract mesh currents
    // First build node list and branches normalized
    const nodeIds = Array.from(new Set(nodes.map(String)));
    const normBranches = branches.map((b) => ({ ...b }));

    // If method mesh and there are only resistors + voltage sources, attempt cycle basis => mesh solve
    const hasCurrentSources = normBranches.some((b) => b.type === "I");
    let result = null;
    if (method === "mesh" && !hasCurrentSources) {
      // attempt cycles
      const cycles = computeFundamentalCycles(nodeIds, normBranches);
      // if cycles are empty fallback to nodal
      if (!cycles || cycles.length === 0) {
        // fallback
        result = solveMNA(nodeIds, normBranches);
        if (!result) return null;
        return { mna: result, mesh: null, cycles };
      } else {
        // We'll still solve via MNA to get node voltages and branch currents (robust),
        // then decompose branch currents into mesh currents using least squares mapping.
        const mnaRes = solveMNA(nodeIds, normBranches);
        if (!mnaRes) return null;
        // Build branch->mesh incidence: each branch is on a subset of cycles
        // We'll build matrix C (B x K) where B branches, K meshes; branchCurrents = C * meshCurrents
        // To keep it simple, detect orientation: for each cycle, create signed +1 if branch direction aligns with mesh assumed orientation.
        const branchIndex = {};
        normBranches.forEach((b, i) => (branchIndex[b.id] = i));
        const K = cycles.length;
        const B = normBranches.length;
        const C = Array.from({ length: B }, () => Array(K).fill(0));
        // create node->index map for quick
        const nmap = {};
        nodeIds.forEach((n, i) => (nmap[n] = i));
        // For each cycle, walk node list and mark edges in that cycle
        for (let k = 0; k < K; k++) {
          const cyc = cycles[k];
          const cycNodes = cyc.nodes;
          for (let i = 0; i < cycNodes.length - 1; i++) {
            const a = cycNodes[i];
            const b = cycNodes[i + 1];
            // find branch between a and b
            const br = normBranches.find((br) => (String(br.from) === String(a) && String(br.to) === String(b)) || (String(br.from) === String(b) && String(br.to) === String(a)));
            if (br) {
              const bi = branchIndex[br.id];
              // sign: +1 if branch.from == a (mesh goes a->b), else -1
              const sign = String(br.from) === String(a) ? 1 : -1;
              C[bi][k] = sign;
            }
          }
          // also the closing edge between last and first if not included
          if (cycNodes.length >= 2) {
            const a = cycNodes[cycNodes.length - 1];
            const b = cycNodes[0];
            const br = normBranches.find((br) => (String(br.from) === String(a) && String(br.to) === String(b)) || (String(br.from) === String(b) && String(br.to) === String(a)));
            if (br) {
              const bi = branchIndex[br.id];
              const sign = String(br.from) === String(a) ? 1 : -1;
              C[bi][k] = sign;
            }
          }
        }

        // build system to find mesh currents 'm' minimizing || C m - i_branch ||; we can solve via least-squares:
        // m = (C^T C)^-1 C^T i_branch
        const i_branch = normBranches.map((br) => mnaRes.branchCurrents[br.id] || 0);
        // compute CtC (KxK) and CtI (K)
        const CtC = Array.from({ length: K }, () => Array(K).fill(0));
        const CtI = Array(K).fill(0);
        for (let p = 0; p < K; p++) {
          for (let q = 0; q < K; q++) {
            let s = 0;
            for (let bIdx = 0; bIdx < B; bIdx++) s += C[bIdx][p] * C[bIdx][q];
            CtC[p][q] = s;
          }
          let s2 = 0;
          for (let bIdx = 0; bIdx < B; bIdx++) s2 += C[bIdx][p] * i_branch[bIdx];
          CtI[p] = s2;
        }
        // solve CtC * m = CtI
        const m = solveLinearSystem(CtC, CtI);
        // If solve fails, fallback to MNA only
        return { mna: mnaRes, mesh: m ? { meshCurrents: m, C } : null, cycles, raw: { CtC, CtI } };
      }
    } else {
      const mnaRes = solveMNA(nodeIds, normBranches);
      if (!mnaRes) return null;
      return { mna: mnaRes, mesh: null, cycles: null };
    }
  }, [nodes, branches, method]);

  // compute once and keep previous state
  const lastComputedRef = useRef(null);
  useEffect(() => {
    const res = computeNow();
    if (res) {
      lastComputedRef.current = res;
      stateRef.current = {
        nodes: res.mna ? res.mna.nodeVoltages : {},
        branchCurrents: res.mna ? res.mna.branchCurrents : {},
        mesh: res.mesh ? res.mesh : null,
        cycles: res.cycles ?? null,
      };
    }
  }, [computeNow]);

  // rAF loop to push history and allow smoothing in UI
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
      const now = Date.now();
      const cur = stateRef.current;
      setHistory((h) => {
        const next = h.slice();
        next.push({ t: next.length ? next[next.length - 1].t + 1 : 0, timestamp: now, nodes: cur.nodes, branchCurrents: cur.branchCurrents, mesh: cur.mesh });
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

  return { history, latestState: stateRef.current, rawLast: lastComputedRef.current };
}

/* ============================
   Visualizer SVG for circuits
   - auto-layout nodes in circle, draw branches with stroke scaled by current,
   - animated dots per branch, arrowheads show direction,
   - clickable nodes/branches for quick selection
   ============================ */
function CircuitVisualizerSVG({ nodes = [], branches = [], latest = {}, running = true }) {
  // nodePositions: simple circular layout
  const N = Math.max(1, nodes.length);
  const radius = 160;
  const centerX = 420;
  const centerY = 140;
  const nodeIndex = {};
  nodes.forEach((n, i) => (nodeIndex[String(n)] = i));
  const nodePos = {};
  nodes.forEach((n, i) => {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    nodePos[String(n)] = { x, y };
  });

  // branch currents & node voltages
  const branchCurrents = latest.branchCurrents || {};
  const nodeVoltages = latest.nodes || {};

  // compute global max current for scaling
  const absCurrents = Object.values(branchCurrents).map((v) => Math.abs(v || 0));
  const maxI = Math.max(1e-6, ...absCurrents, 0.000001);

  // svg dims
  const width = 920;
  const height = 300;

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-orange-400">Mesh & Nodal Visualizer</div>
            <div className="text-xs text-zinc-400">Live solver • animated currents • branch readouts</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Nodes: <span className="text-orange-400 ml-1">{nodes.length}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Branches: <span className="text-orange-400 ml-1">{branches.length}</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-72">
          {/* draw branches */}
          {branches.map((br, idx) => {
            const a = nodePos[String(br.from)];
            const b = nodePos[String(br.to)];
            if (!a || !b) return null;
            // compute midpoints for labels and curved path control
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const norm = { x: dx / dist, y: dy / dist };
            // small offset for curvature based on index to avoid overlaps
            const curveFactor = 40 * ((idx % 2 === 0) ? 1 : -1) * (1 + ((idx % 3) / 3));
            const cx = midX - norm.y * curveFactor;
            const cy = midY + norm.x * curveFactor;

            const pathD = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;

            const I = Number(branchCurrents[br.id]) || 0;
            const absI = Math.abs(I);
            const strokeW = clamp(1 + (absI / maxI) * 8, 1.2, 10);
            const dotCount = clamp(Math.round(2 + absI * 8), 2, 24);
            const speed = clamp(1.2 / (absI + 0.02), 0.25, 4); // seconds per cycle
            const color = I >= 0 ? "#7afcff" : "#ff6a9a";

            // arrow direction pick based on sign: arrow points from 'from' -> 'to' if I>=0 else reversed
            const arrowRotation = Math.atan2(dy, dx) * (180 / Math.PI);

            return (
              <g key={`branch-${br.id}`}>
                <path d={pathD} stroke="#111" strokeWidth={strokeW} strokeLinecap="round" fill="none" />
                {/* animated dots */}
                {Array.from({ length: dotCount }).map((_, di) => {
                  const delay = (di / dotCount) * speed;
                  const style = {
                    offsetPath: `path('${pathD}')`,
                    animationName: "branchFlow",
                    animationDuration: `${speed}s`,
                    animationTimingFunction: "linear",
                    animationDelay: `${-delay}s`,
                    animationIterationCount: "infinite",
                    animationPlayState: running ? "running" : "paused",
                    transformOrigin: "0 0",
                  };
                  return <circle key={`dot-${br.id}-${di}`} r="3.5" fill={color} style={style} />;
                })}

                {/* arrow marker (small triangle) near midpoint */}
                <g transform={`translate(${cx},${cy}) rotate(${arrowRotation})`}>
                  <path d={`M -8 -4 L 8 0 L -8 4 Z`} fill={color} opacity="0.85" />
                </g>

                {/* branch label */}
                <g transform={`translate(${midX}, ${midY - 8})`}>
                  <rect x="-8" y="-18" width="160" height="40" rx="6" fill="#060606" stroke="#222" />
                  <text x="1" y="-2" fontSize="11" fill="#7afcff">{br.name || br.id} • {br.type}</text>
                  <text x="1" y="12" fontSize="11" fill="#fff">I: <tspan fill={color}>{round(I, 6)} A</tspan> · V: <tspan fill="#ffd24a">{round((nodeVoltages[String(br.from)] ?? 0) - (nodeVoltages[String(br.to)] ?? 0), 6)} V</tspan></text>
                </g>
              </g>
            );
          })}

          {/* draw nodes (circles) */}
          {nodes.map((n) => {
            const p = nodePos[String(n)];
            const V = nodeVoltages[String(n)] ?? 0;
            return (
              <g key={`node-${n}`} transform={`translate(${p.x},${p.y})`}>
                <circle r="16" fill="#060606" stroke="#222" strokeWidth="2" />
                <text x="-8" y="4" fontSize="12" fill="#fff">{String(n)}</text>
                <text x="-8" y="20" fontSize="10" fill="#9ee6ff">{round(V, 4)} V</text>
              </g>
            );
          })}

          {/* legend / readouts */}
          <g transform={`translate(${width - 200}, 12)`}>
            <rect x="-12" y="-10" width="220" height="120" rx="10" fill="#060606" stroke="#222" />
            <text x="0" y="8" fontSize="12" fill="#7afcff">Readouts</text>
            <text x="0" y="30" fontSize="11" fill="#fff">Nodes: <tspan fill="#7afcff">{nodes.length}</tspan></text>
            <text x="0" y="48" fontSize="11" fill="#fff">Branches: <tspan fill="#7afcff">{branches.length}</tspan></text>
            <text x="0" y="66" fontSize="11" fill="#fff">Max |I|: <tspan fill="#ffd24a">{round(Math.max(...(Object.values(branchCurrents).map(Math.abs) || [0])), 6)} A</tspan></text>
          </g>

          <style>{`
            @keyframes branchFlow {
              0% { offset-distance: 0%; opacity: 1; transform: translate(-2px,-2px) scale(0.9); }
              45% { opacity: 0.95; transform: translate(0,0) scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(4px,4px) scale(0.8); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) { text { font-size: 9px; } }
          `}</style>
        </svg>
      </div>
    </div>
  );
}

/* ============================
   Oscilloscope: plot node voltages + one selected branch current
   - user can pick a branch to display current
   ============================ */
function CircuitOscilloscope({ history = [], selectedBranchId = null, nodes = [] }) {
  const points = history.slice(-360).map((h, idx) => {
    const t = idx;
    const datum = { t };
    // map top 3 node voltages to V1, V2, V3 for plotting (pick up to 3 nodes)
    for (let i = 0; i < Math.min(3, nodes.length); i++) {
      const n = String(nodes[i]);
      datum[`V${i + 1}`] = round(h.nodes[n] ?? 0, 6);
    }
    if (selectedBranchId) {
      datum["I"] = round(h.branchCurrents[selectedBranchId] ?? 0, 9);
    }
    return datum;
  });

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-300">Oscilloscope — Node Voltages & Branch Current</div>
        <div className="text-xs text-zinc-400">Live</div>
      </div>
      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            {nodes.slice(0, 3).map((n, i) => (
              <Line key={`V${i}`} type="monotone" dataKey={`V${i + 1}`} stroke={i === 0 ? "#7afcff" : i === 1 ? "#ffd24a" : "#00ffbf"} strokeWidth={2} dot={false} isAnimationActive={false} name={`V(${n})`} />
            ))}
            {selectedBranchId && <Line type="monotone" dataKey="I" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name={`I(${selectedBranchId})`} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page Component: Mesh & Nodal Auto-Solver Page
   ============================ */
export default function MeshNodalAnalysisPage() {
  // UI state
  const [method, setMethod] = useState("nodal"); // "nodal" or "mesh"
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Circuit model state
  // nodes stored as simple array of IDs (string/number). 0 is recommended as ground.
  const [nodes, setNodes] = useState(["0", "1", "2"]);
  // branches: start with a sample circuit (two resistors and a voltage source)
  const [branches, setBranches] = useState([
    { id: "R1", from: "1", to: "0", type: "R", value: 100, name: "R1" },
    { id: "R2", from: "2", to: "0", type: "R", value: 200, name: "R2" },
    { id: "V1", from: "1", to: "2", type: "V", value: 10, name: "V1" }, // 10 V from 1 -> 2
  ]);

  // selection
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id ?? null);

  // simulation hook
  const { history, latestState } = useCircuitSim({ nodes, branches, method, running, timestep: 80 });

  // helpers to mutate nodes/branches
  const addNode = () => {
    // pick next integer string
    const used = new Set(nodes.map(String));
    let i = 0;
    while (used.has(String(i))) i++;
    setNodes((s) => [...s, String(i)]);
    toast.success(`Added node ${i}`);
  };

  const removeNode = (nid) => {
    // remove node and any branches that reference it
    setNodes((s) => s.filter((x) => String(x) !== String(nid)));
    setBranches((b) => b.filter((br) => String(br.from) !== String(nid) && String(br.to) !== String(nid)));
    toast(`Removed node ${nid}`);
  };

  const addBranch = () => {
    // create new resistor between first two nodes by default
    const idBase = `R${branches.length + 1}`;
    const from = nodes[0] ?? "0";
    const to = nodes[1] ?? (nodes[0] === "0" ? "1" : "0");
    const newBr = { id: idBase, from: String(from), to: String(to), type: "R", value: 100, name: idBase };
    setBranches((s) => [...s, newBr]);
    setSelectedBranchId(newBr.id);
    toast.success(`Added branch ${idBase}`);
  };

  const updateBranch = (bid, patch) => {
    setBranches((s) => s.map((b) => (b.id === bid ? { ...b, ...patch } : b)));
  };

  const removeBranch = (bid) => {
    setBranches((s) => s.filter((b) => b.id !== bid));
    toast(`Removed ${bid}`);
  };

  // export CSV of history
  const exportCSV = () => {
    const rows = [];
    // header
    const header = ["t", "timestamp"];
    // node voltages as columns
    nodes.forEach((n) => header.push(`V(${n})`));
    // branch currents
    branches.forEach((br) => header.push(`I(${br.id})`));
    rows.push(header.join(","));
    history.forEach((h) => {
      const row = [h.t, h.timestamp];
      nodes.forEach((n) => row.push(round(h.nodes[String(n)] ?? 0, 9)));
      branches.forEach((br) => row.push(round(h.branchCurrents[br.id] ?? 0, 9)));
      rows.push(row.join(","));
    });
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mesh-nodal-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  // snapshot (copy SVG as PNG): simple user feedback for now
  const snapshot = () => {
    toast.success("Snapshot saved (use future implementation for SVG->PNG)");
  };

  // reset
  const resetDefaults = () => {
    setMethod("nodal");
    setRunning(true);
    setNodes(["0", "1", "2"]);
    setBranches([
      { id: "R1", from: "1", to: "0", type: "R", value: 100, name: "R1" },
      { id: "R2", from: "2", to: "0", type: "R", value: 200, name: "R2" },
      { id: "V1", from: "1", to: "2", type: "V", value: 10, name: "V1" },
    ]);
    toast.success("Reset to sample circuit");
  };

  // friendly summaries
  const nodeVoltagesSummary = latestState?.nodes ?? {};
  const branchCurrentsSummary = latestState?.branchCurrents ?? {};

  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2 sm:py-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-5 h-5 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm  font-semibold text-zinc-200">SparkLab</div>
                <div className="text-xs  text-zinc-400 -mt-0.5 truncate">Mesh & Nodal Auto-Solver</div>
              </div>
            </motion.div>

            {/* Desktop Controls */}
            <div className="hidden md:flex items-center gap-4">
              <div className="w-36">
                <Select value={method} onValueChange={(v) => setMethod(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-400 focus:ring-2 focus:ring-orange-400">
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="nodal" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Nodal (MNA)</SelectItem>
                    <SelectItem value="mesh" className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Mesh (cycle decomposition)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={snapshot} title="Save Snapshot">
                  Snapshot
                </Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={() => setRunning((r) => !r)} aria-label="Play / Pause" title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={resetDefaults} aria-label="Reset" title="Reset Defaults">
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Mobile Menu Toggle */}
            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Slide-down Panel */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-64 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="w-36">
                  <Select value={method} onValueChange={(v) => setMethod(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-400 focus:ring-2 focus:ring-orange-400">
                      <SelectValue placeholder="Method" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="nodal"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Nodal</SelectItem>
                      <SelectItem value="mesh"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Mesh</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={snapshot}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Run"}</Button>
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
                        <div className="text-lg font-semibold text-orange-400">Solver</div>
                        <div className="text-xs text-zinc-400">Modified Nodal Analysis & Mesh Decomposition</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-400 text-orange-200 px-3 py-1 rounded-full shadow-sm">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Node list editor */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-zinc-300">Nodes</div>
                      <div className="flex gap-2">
                        <Button  onClick={addNode} className="px-2 py-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black/70">Add Node</Button>
                        <Button variant="ghost" className="bg-white cursor-pointer" onClick={() => { setNodes(["0", "1", "2"]); toast("Reset nodes"); }}>Reset</Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {nodes.map((n) => (
                        <div key={`node-${n}`} className="flex items-center gap-2">
                          <div className="bg-zinc-900/40 px-2 py-1 rounded-md min-w-[48px] text-center text-orange-400">{String(n)}</div>
                          <div className="text-xs text-zinc-400">V: <span className="text-orange-200 ml-2">{round(nodeVoltagesSummary[String(n)] ?? 0, 6)} V</span></div>
                          <div className="ml-auto flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => removeNode(n)} className="border border-zinc-800 bg-red-500 cursor-pointer hover:bg-red-600 px-2 py-1"><Trash2/></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Branch editor */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-zinc-300">Branches</div>
                      <div className="flex gap-2">
                        <Button onClick={addBranch} className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer">Add Branch</Button>
                        <Button className="bg-white cursor-pointer" variant="ghost" onClick={() => { setBranches([{ id: "R1", from: "1", to: "0", type: "R", value: 100, name: "R1" }]); toast("Reset branches"); }}>Reset</Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {branches.map((br) => (
                        <div key={br.id} className={`border ${selectedBranchId === br.id ? "border-orange-500" : "border-zinc-800"} rounded-lg p-3`}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                              <Plug className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-white">{br.name || br.id}</div>
                              <div className="text-xs text-zinc-400">From {br.from} → To {br.to}</div>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                              <Button variant="ghost" onClick={() => setSelectedBranchId(br.id)} className="p-1 border border-zinc-800 bg-white cursor-pointer rounded-md">{selectedBranchId === br.id ? "Selected" : "Select"}</Button>
                              <Button variant="ghost" onClick={() => removeBranch(br.id)} className="p-1 border bg-red-500 cursor-pointer hover:bg-red-600 border-zinc-800 rounded-md"><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="text-xs text-zinc-400">From</label>
                              <Select value={String(br.from)} onValueChange={(v) => updateBranch(br.id, { from: v })}>
                                <SelectTrigger className="w-full bg-zinc-900/40 cursor-pointer border border-zinc-800 rounded-md text-white text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border  border-zinc-800 rounded-md">
                                  {nodes.map((n) => <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" key={`from-${br.id}-${n}`} value={String(n)}>{String(n)}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400">To</label>
                              <Select value={String(br.to)} onValueChange={(v) => updateBranch(br.id, { to: v })}>
                                <SelectTrigger className="w-full cursor-pointer bg-zinc-900/40 border border-zinc-800 rounded-md text-white text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                                  {nodes.map((n) => <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" key={`to-${br.id}-${n}`} value={String(n)}>{String(n)}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400">Type</label>
                              <Select value={br.type} onValueChange={(v) => updateBranch(br.id, { type: v })}>
                                <SelectTrigger className="w-full cursor-pointer bg-zinc-900/40 border border-zinc-800 rounded-md text-white text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                                  <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="R">Resistor (Ω)</SelectItem>
                                  <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="V">Voltage source (V)</SelectItem>
                                  <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="I">Current source (A)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                           <div className="sm:col-span-2 space-y-2">
  <label className="text-xs text-zinc-400">Value</label>
  <div className="flex items-center justify-start flex-col gap-3">
    <Input
      type="number"
      value={String(br.value)}
      onChange={(e) => updateBranch(br.id, { value: Number(e.target.value) })}
      className="bg-zinc-900/40 border border-zinc-800 text-white w-full"
    />
    <Slider
      value={[br.value]}
      min={0}
      max={100}
      step={1}
      onValueChange={(v) => updateBranch(br.id, { value: v[0] })}
      className="w-full cursor-pointer"
    />
  </div>
  <div className="text-[10px] text-orange-300">Adjust branch value dynamically</div>
</div>

                            <div>
                              <label className="text-xs text-zinc-400">Name</label>
                              <Input value={br.name || br.id} onChange={(e) => updateBranch(br.id, { name: e.target.value })} className="bg-zinc-900/40 border border-zinc-800 text-white" />
                            </div>
                          </div>

                          <div className="mt-2 text-xs text-zinc-400">I (last): <span className="text-orange-200">{round(branchCurrentsSummary[br.id] ?? 0, 6)} A</span></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 justify-between">
                    <div className="flex gap-2">
                      <Button className="px-3 cursor-pointer py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => setRunning(true)}><Play className="w-4 h-4" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4" /> Pause</Button>
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
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-orange-400">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated currents • meters • real-time solver</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Method: <span className="text-orange-400 ml-1">{method}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Nodes: <span className="text-orange-400 ml-1">{nodes.length}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Branches: <span className="text-orange-400 ml-1">{branches.length}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <CircuitVisualizerSVG nodes={nodes} branches={branches} latest={latestState} running={running} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <CircuitOscilloscope history={history} selectedBranchId={selectedBranchId} nodes={nodes} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-orange-300 items-center gap-2">
                    <Gauge className="w-5 h-5 " /> Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Nodes (sample)</div>
                      <div className="text-lg font-semibold text-orange-400">{nodes.slice(0, 3).map((n) => `${n}:${round(nodeVoltagesSummary[String(n)] ?? 0, 3)}V`).join(" • ")}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Selected Branch</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{selectedBranchId ?? "—"}</div>
                      <div className="text-xs text-zinc-400 mt-1">I: <span className="text-orange-200">{round(branchCurrentsSummary[selectedBranchId] ?? 0, 6)} A</span></div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Solver</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{method === "nodal" ? "MNA (robust)" : "Mesh (decomposition)"}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Branches count</div>
                      <div className="text-lg font-semibold text-orange-400">{branches.length}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Nodes count</div>
                      <div className="text-lg font-semibold text-orange-400">{nodes.length}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Last compute</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{history.length ? new Date(history[history.length - 1].timestamp).toLocaleTimeString() : "—"}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-200 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb /></span>
                    <span>Tip: Use <span className="text-white font-semibold">Nodal (MNA)</span> for general circuits. Mesh works well on planar resistor+voltage circuits — otherwise the page automatically falls back to MNA.</span>
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
            <Button className="px-3 cursor-pointer py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 cursor-pointer py-2 border-zinc-700 text-black text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-200 cursor-pointer p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
