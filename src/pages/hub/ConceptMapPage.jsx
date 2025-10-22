// src/pages/ConceptMapPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Map,
  Layers,
  Plus,
  Trash2,
  Play,
  Pause,
  Settings,
  Download,
  Menu,
  X,
  Link as NodeIcon,
  Link as LinkIcon,
  Search,
  Eye,
  Edit3,
  Gauge,
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
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 4) => {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const uid = (prefix = "") => `${prefix}${Math.random().toString(36).slice(2, 9)}`;

/* ============================
   Force simulation hook
   - provides realtime node positions & link particles
   ============================ */
function useForceSim({
  running,
  width = 1000,
  height = 640,
  nodes: initialNodes = [],
  links: initialLinks = [],
  params = { charge: -1200, linkStrength: 0.08, damping: 0.85, particleSpeed: 1.6 },
}) {
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const rafRef = useRef(null);
  const lastRef = useRef(performance.now());
  const tRef = useRef(0);

  // history for metrics (nodes/links/avgDegree)
  const historyRef = useRef([]);
  const [metricsHistory, setMetricsHistory] = useState([]);

  // initialize internal state
  useEffect(() => {
    // deep copy initial nodes/links into mutable arrays
    nodesRef.current = initialNodes.map((n, i) => ({
      id: n.id ?? uid("n_"),
      label: n.label ?? `Node ${i + 1}`,
      type: n.type ?? "topic",
      x: n.x ?? (width / 2) + (Math.random() - 0.5) * 240,
      y: n.y ?? (height / 2) + (Math.random() - 0.5) * 160,
      vx: 0,
      vy: 0,
      fx: null, // fixed by drag
      fy: null,
      r: n.r ?? 28,
    }));
    linksRef.current = initialLinks.map((l) => ({
      id: l.id ?? uid("l_"),
      source: l.source,
      target: l.target,
      strength: l.strength ?? 1,
      particles: Array.from({ length: Math.max(1, Math.min(8, Math.round((l.strength || 1) * 3))) }).map((_, idx) => ({
        t: Math.random(), // 0..1 along link
        speed: (params.particleSpeed * (0.6 + Math.random() * 0.8)) / (1 + Math.abs(l.strength || 1) * 0.6),
      })),
    }));
    // seed history
    historyRef.current = Array.from({ length: 140 }, (_, i) => ({ t: i, nodes: nodesRef.current.length, links: linksRef.current.length, avgDegree: 0 }));
    setMetricsHistory(historyRef.current.slice());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // helper accesses
  const getNodes = useCallback(() => nodesRef.current, []);
  const getLinks = useCallback(() => linksRef.current, []);

  // simple degree compute
  const computeAvgDegree = useCallback(() => {
    const deg = {};
    linksRef.current.forEach((l) => {
      deg[l.source] = (deg[l.source] || 0) + 1;
      deg[l.target] = (deg[l.target] || 0) + 1;
    });
    const nodes = nodesRef.current.length || 1;
    const totalDeg = Object.values(deg).reduce((a, b) => a + b, 0);
    return totalDeg / nodes;
  }, []);

  // simulation step
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
      const dt = (ts - lastRef.current) / 1000; // seconds
      lastRef.current = ts;
      tRef.current += dt;

      const nodes = nodesRef.current;
      const links = linksRef.current;
      const { charge, linkStrength, damping } = params;

      // apply repulsive forces (naive O(n^2) but fine for small maps)
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (a.fx !== null || a.fy !== null) {
          // fixed nodes remain but we still zero velocities
          a.vx = 0;
          a.vy = 0;
          continue;
        }
        let fx = 0;
        let fy = 0;
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist2 = dx * dx + dy * dy;
          let dist = Math.sqrt(Math.max(1e-4, dist2));
          const force = (charge) / (dist2 + 1000); // softened repulsion
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
        a.vx += fx * dt;
        a.vy += fy * dt;
      }

      // apply spring forces for links
      for (let k = 0; k < links.length; k++) {
        const L = links[k];
        const s = nodes.find((n) => n.id === L.source);
        const tN = nodes.find((n) => n.id === L.target);
        if (!s || !tN) continue;
        const dx = tN.x - s.x;
        const dy = tN.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        // desired distance scaled by node sizes
        const desired = 140 - Math.min(80, (s.r + tN.r) * 0.6) ;
        const kSpring = linkStrength * (L.strength || 1) * 0.8;
        const force = kSpring * (dist - desired);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (s.fx === null) { s.vx += fx * dt; s.vy += fy * dt; }
        if (tN.fx === null) { tN.vx -= fx * dt; tN.vy -= fy * dt; }
      }

      // integrate velocities & apply damping & bounds
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.fx !== null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; continue; }
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx * (dt * 60); // scale to frame rate
        n.y += n.vy * (dt * 60);
        // bounds friction
        const pad = 40;
        n.x = clamp(n.x, pad, width - pad);
        n.y = clamp(n.y, pad, height - pad);
      }

      // advance particles along each link (particles have t from 0..1)
      links.forEach((L) => {
        L.particles.forEach((p) => {
          p.t += p.speed * dt;
          if (p.t > 1) p.t = p.t - Math.floor(p.t);
        });
      });

      // push metrics history
      const avgDegree = computeAvgDegree();
      historyRef.current.push({ t: historyRef.current.length, nodes: nodes.length, links: links.length, avgDegree });
      if (historyRef.current.length > 200) historyRef.current.shift();
      setMetricsHistory(historyRef.current.slice());

      // small throttle: expose snapshot via state change by copying arrays (cheap)
      // We'll not set state every frame to reduce rerenders; instead the consumer can call getNodes/getLinks
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, params, width, height, computeAvgDegree]);

  // public API: functions to mutate nodes/links safely
  const addNode = useCallback((node) => {
    const n = { id: node.id ?? uid("n_"), label: node.label ?? "New node", type: node.type ?? "topic", x: node.x ?? (width/2), y: node.y ?? (height/2), vx: 0, vy: 0, fx: null, fy: null, r: node.r ?? 26 };
    nodesRef.current.push(n);
    toast.success("Node added");
    return n;
  }, [height, width]);

  const removeNode = useCallback((id) => {
    // remove node and incident links
    nodesRef.current = nodesRef.current.filter((n) => n.id !== id);
    linksRef.current = linksRef.current.filter((l) => l.source !== id && l.target !== id);
    toast("Node removed");
  }, []);

  const addLink = useCallback((sourceId, targetId, strength = 1) => {
    if (sourceId === targetId) { toast.error("Cannot link to self"); return null; }
    const exists = linksRef.current.some((l) => (l.source === sourceId && l.target === targetId) || (l.source === targetId && l.target === sourceId));
    if (exists) { toast.error("Link already exists"); return null; }
    const l = { id: uid("l_"), source: sourceId, target: targetId, strength, particles: Array.from({ length: Math.max(1, Math.min(8, Math.round(2 + strength * 2))) }).map(() => ({ t: Math.random(), speed: 0.8 + Math.random() })) };
    linksRef.current.push(l);
    toast.success("Link created");
    return l;
  }, []);

  const removeLink = useCallback((linkId) => {
    linksRef.current = linksRef.current.filter((l) => l.id !== linkId);
    toast("Link removed");
  }, []);

  const setNodeFixed = useCallback((id, fx, fy) => {
    const n = nodesRef.current.find((x) => x.id === id);
    if (!n) return;
    n.fx = fx;
    n.fy = fy;
  }, []);

  // return snapshotters and mutators
  return {
    getNodes,
    getLinks,
    addNode,
    removeNode,
    addLink,
    removeLink,
    setNodeFixed,
    metricsHistory,
  };
}

/* ============================
   ConceptMap SVG Visualizer
   - interactive, draggable nodes
   - animated particles along links
   - selection, add-link mode, node controls
   ============================ */
function ConceptMapSVG({
  width = 1000,
  height = 640,
  simApi,
  theme = { accent: "#ff7a2d", accent2: "#ffd24a", bg: "#05060a" },
  running,
  selectedNodeId,
  onSelectNode,
  onUpdateNodeLabel,
  onDeleteNode,
  onDeleteLink,
  layout = "force",
}) {
  const svgRef = useRef(null);
  const [, forceRerender] = useState(0); // manual rerender when needed
  const pointerDragging = useRef(null); // { id, offsetX, offsetY }
  const lastSnapshotRef = useRef({ nodes: [], links: [] });

  // snapshot function to pull positions from sim and rerender
  const snapshot = useCallback(() => {
    const nodes = simApi.getNodes().map((n) => ({ ...n }));
    const links = simApi.getLinks().map((l) => ({ ...l }));
    lastSnapshotRef.current = { nodes, links };
    forceRerender((s) => s + 1);
  }, [simApi]);

  // poll for updates at about 30 fps
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      snapshot();
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [snapshot]);

  // pointer handlers for drag
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onPointerDown = (e) => {
      const target = e.target;
      if (target.dataset && target.dataset.nodeId) {
        const id = target.dataset.nodeId;
        const nodes = lastSnapshotRef.current.nodes;
        const node = nodes.find((n) => n.id === id);
        if (!node) return;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const ctm = svg.getScreenCTM().inverse();
        const local = pt.matrixTransform(ctm);
        pointerDragging.current = { id, offsetX: local.x - node.x, offsetY: local.y - node.y };
        simApi.setNodeFixed(id, node.x, node.y);
      }
    };
    const onPointerMove = (e) => {
      if (!pointerDragging.current) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const ctm = svg.getScreenCTM().inverse();
      const local = pt.matrixTransform(ctm);
      const { id, offsetX, offsetY } = pointerDragging.current;
      simApi.setNodeFixed(id, local.x - offsetX, local.y - offsetY);
      snapshot();
    };
    const onPointerUp = (e) => {
      if (!pointerDragging.current) return;
      const id = pointerDragging.current.id;
      // release fixed status (allow physics) but keep position as last
      simApi.setNodeFixed(id, null, null);
      pointerDragging.current = null;
    };
    svg.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      svg.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [simApi, snapshot]);

  const { nodes, links } = lastSnapshotRef.current;

  // color mapping by node type
  const typeColor = (t) => {
    if (t === "topic") return theme.accent;
    if (t === "subtopic") return theme.accent2;
    if (t === "example") return "#00ffbf";
    return "#999";
  };

  // draw particle along edge (linear interpolation)
  const particlePosOnLink = (L, p) => {
    const s = nodes.find((n) => n.id === L.source);
    const t = nodes.find((n) => n.id === L.target);
    if (!s || !t) return { x: 0, y: 0 };
    const x = s.x + (t.x - s.x) * p;
    const y = s.y + (t.y - s.y) * p;
    return { x, y };
  };

  // SVG render
  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start flex-wrap justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Map className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Concept Map</div>
            <div className="text-xs text-zinc-400">Interactive • realtime • force & layout modes</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Nodes: <span className="text-[#ffd24a] ml-1">{nodes ? nodes.length : 0}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Links: <span className="text-[#00ffbf] ml-1">{links ? links.length : 0}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">{running ? "Live" : "Paused"}</Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-auto">
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-[420px]">
          {/* background grid subtle */}
          <defs>
            <linearGradient id="nodeGlow" x1="0" x2="1">
              <stop offset="0%" stopColor={theme.accent} stopOpacity="0.18" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="0" y="0" width={width} height={height} fill="transparent" />

          {/* links */}
          {links &&
            links.map((L) => {
              const s = nodes.find((n) => n.id === L.source);
              const t = nodes.find((n) => n.id === L.target);
              if (!s || !t) return null;
              const dx = t.x - s.x;
              const dy = t.y - s.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              // line path coordinates
              const pathD = `M ${s.x} ${s.y} L ${t.x} ${t.y}`;
              return (
                <g key={L.id} className="link-group">
                  <path d={pathD} stroke="#111" strokeWidth={Math.max(1, 1 + (L.strength || 1) * 0.8)} strokeLinecap="round" />
                  <path d={pathD} stroke={theme.accent2} strokeWidth={Math.max(1, 0.7 + (L.strength || 1) * 0.5)} strokeLinecap="round" strokeOpacity={0.12} />
                  {/* particles drawn by mapping p.t */}
                  {L.particles.map((p, i) => {
                    const pos = particlePosOnLink(L, p.t);
                    const alpha = 0.9 - i * 0.08;
                    return <circle key={`${L.id}-p-${i}`} cx={pos.x} cy={pos.y} r={3} fill={theme.accent} opacity={alpha} />;
                  })}
                </g>
              );
            })}

          {/* nodes */}
          {nodes &&
            nodes.map((n) => {
              const isSelected = selectedNodeId === n.id;
              const fill = typeColor(n.type);
              return (
                <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: "grab" }}>
                  <circle
                    data-node-id={n.id}
                    r={isSelected ? n.r + 6 : n.r}
                    fill={fill}
                    stroke="#0b0b0b"
                    strokeWidth={isSelected ? 3 : 1.5}
                    filter={isSelected ? "url(#glow)" : undefined}
                   
                    onDoubleClick={() => onSelectNode(n)}
                  />
                  <text
                    data-node-id={n.id}
                    x={0}
                    y={6}
                    fontSize={12}
                    textAnchor="middle"
                    fill={isSelected ? "#000" : "#fff"}
                    style={{ pointerEvents: "none", fontWeight: 600 }}
                  >
                    {n.label}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>
    </div>
  );
}

/* ============================
   Metrics mini-oscilloscope (recharts)
   ============================ */
function MetricsOscillo({ metricsHistory = [], running }) {
  const data = metricsHistory.slice(-140).map((d, idx) => ({ t: idx, nodes: d.nodes, links: d.links, avgDegree: round(d.avgDegree, 3) }));
  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Map Metrics</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="nodes" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Nodes" />
            <Line type="monotone" dataKey="links" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Links" />
            <Line type="monotone" dataKey="avgDegree" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Avg Degree" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page Component — Concept Map
   ============================ */
export default function ConceptMapPage() {
  // UI state
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [layout, setLayout] = useState("force"); // force | radial | grid
  const [selectedNode, setSelectedNode] = useState(null);
  const [addMode, setAddMode] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState(null);
  const [mapWidth, setMapWidth] = useState(1100);
  const [mapHeight, setMapHeight] = useState(520);
  const [params, setParams] = useState({ charge: -1200, linkStrength: 0.08, damping: 0.86, particleSpeed: 1.2 });

  // initial nodes/links (seed)
  const initialNodes = useMemo(
    () => [
      { id: "n_root", label: "Main Idea", type: "topic", x: 520, y: 260, r: 36 },
      { id: "n_a", label: "Concept A", type: "subtopic", x: 300, y: 160, r: 28 },
      { id: "n_b", label: "Concept B", type: "subtopic", x: 730, y: 160, r: 28 },
      { id: "n_c", label: "Example C", type: "example", x: 520, y: 420, r: 24 },
    ],
    []
  );
  const initialLinks = useMemo(() => [{ id: "l1", source: "n_root", target: "n_a", strength: 1 }, { id: "l2", source: "n_root", target: "n_b", strength: 1 }, { id: "l3", source: "n_root", target: "n_c", strength: 0.9 }], []);

  // useForceSim provides internal mutable nodes + links and mutators
// run once

  // But because useForceSim is a hook that uses hooks inside, we must call it at top level — to correct: replace above useEffect + ref approach with direct call below:
  // We'll call it directly (React hooks rule). Change to direct:
  // (To avoid confusion, re-call properly:)
  const simApi = useForceSim({
    running,
    width: mapWidth,
    height: mapHeight,
    nodes: initialNodes,
    links: initialLinks,
    params,
  });

  // snapshot getter for UI to display counts (wrapper)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const loop = () => {
      if (!alive) return;
      setTick((t) => t + 1);
      requestAnimationFrame(loop);
    };
    const id = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, []);

  // derived metrics
  const nodes = simApi.getNodes();
  const links = simApi.getLinks();

  const metricsHistory = simApi.metricsHistory;

  // actions
  const addNode = () => {
    try {
      simApi.addNode({ label: "New Node", type: "subtopic", x: mapWidth / 2 + (Math.random() - 0.5) * 160, y: mapHeight / 2 + (Math.random() - 0.5) * 120 });
      // force a quick tick
      setTick((t) => t + 1);
    } catch (err) {
      toast.error("Failed to add node");
    }
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return toast.error("No node selected");
    simApi.removeNode(selectedNode.id);
    setSelectedNode(null);
  };

  const startLinkMode = () => {
    setLinkMode(true);
    setLinkSource(null);
    toast("Link mode: Click node A then node B to create a link");
  };

  // on node select handler passed to svg visualizer
  const handleSelectNode = (n) => {
    setSelectedNode(n);
    if (linkMode) {
      if (!linkSource) {
        setLinkSource(n.id);
        toast("Source selected. Now click target node.");
      } else {
        // attempt to create link
        const created = simApi.addLink(linkSource, n.id, 1);
        if (created) {
          setLinkMode(false);
          setLinkSource(null);
        }
      }
    }
  };

  const exportJSON = () => {
    try {
      const payload = { nodes: simApi.getNodes(), links: simApi.getLinks() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `concept-map-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported JSON");
    } catch (e) {
      toast.error("Export failed");
    }
  };

  const clearMap = () => {
    // remove all nodes then add a root
    const curNodes = simApi.getNodes().slice();
    curNodes.forEach((n) => simApi.removeNode(n.id));
    const root = simApi.addNode({ id: "n_root", label: "Main Idea", type: "topic", x: mapWidth / 2, y: mapHeight / 2, r: 36 });
    setSelectedNode(root);
    toast("Map cleared (root created)");
  };

  // small UI for selected node editing
  const updateSelectedLabel = (v) => {
    if (!selectedNode) return;
    // update label directly on sim nodes
    const n = simApi.getNodes().find((x) => x.id === selectedNode.id);
    if (!n) return;
    n.label = v || "—";
    setSelectedNode({ ...n });
  };

  // toggle running
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  // Theme constant
  const theme = { accent: "#ff7a2d", accent2: "#ffd24a", bg: "#05060a" };

  return (
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
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
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Concept Maps • Realtime Visualizer</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-36">
                <Select value={layout} onValueChange={(v) => setLayout(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Layout" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="force"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Force</SelectItem>
                    <SelectItem value="radial"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Radial</SelectItem>
                    <SelectItem value="grid"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Grid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={addNode}>
                  <Plus className="w-4 h-4 mr-2" /> Add Node
                </Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={() => { exportJSON(); }}>
                  <Download className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border text-orange-400 hover:bg-black hover:text-orange-500 cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile panel */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={addNode}><Plus className="w-4 h-4 mr-2" />Add</Button>
                <Button variant="ghost" className="flex-1 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Run"}</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 text-xs py-2 rounded-md" onClick={exportJSON}><Download className="w-4 h-4" /></Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16"></div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* left controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden w-full max-w-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Controls</div>
                        <div className="text-xs text-zinc-400">Add, link, tune physics & styles</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-400">Layout</label>
                    <Select value={layout} onValueChange={(v) => setLayout(v)}>
                      <SelectTrigger className="w-full cursor-pointer bg-zinc-900/60 border border-zinc-800 text-white text-sm rounded-md">
                        <SelectValue placeholder="Layout" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                        <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="force">Force</SelectItem>
                        <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="radial">Radial</SelectItem>
                        <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="grid">Grid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-xs text-zinc-400">Charge (repulsion)</label>
                      <Input value={params.charge} onChange={(e) => setParams((p) => ({ ...p, charge: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Link Strength</label>
                      <Input value={params.linkStrength} onChange={(e) => setParams((p) => ({ ...p, linkStrength: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Particle Speed</label>
                      <Input value={params.particleSpeed} onChange={(e) => setParams((p) => ({ ...p, particleSpeed: Number(e.target.value) }))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => { addNode(); }}> <Plus className="w-4 h-4 mr-2" /> Add Node</Button>
                    <Button variant="outline" className="flex-1 border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 bg-black cursor-pointer  hover:text-orange-500 " onClick={startLinkMode}><LinkIcon className="w-4 h-4 mr-2" /> Link</Button>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1 border border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer" onClick={() => clearMap()}> Clear</Button>
                    <Button variant="ghost" className="flex-1 border border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer" onClick={() => exportJSON()}> Export</Button>
                  </div>

                  <div className="bg-black/70 border border-orange-500/30 text-white px-3 py-2 rounded-md shadow-sm backdrop-blur-sm text-xs">
                    Tip: Drag nodes to reorganize. Double click node to select & edit label.
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <MetricsOscillo metricsHistory={metricsHistory} running={running} />
            </motion.div>

            {selectedNode && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
                <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-[#ffd24a]">
                      <NodeIcon className="w-5 h-5" /> Selected
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-2">
                      <label className="text-xs text-zinc-400">Label</label>
                      <Input value={selectedNode.label} onChange={(e) => updateSelectedLabel(e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => { toast.success("Saved"); }}> Save</Button>
                      <Button variant="destructive" className="flex-1" onClick={() => { deleteSelectedNode(); }}> <Trash2 className="w-4 h-4 mr-2" /> Delete</Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          {/* visual + right area */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Map className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Concept Map</div>
                        <div className="text-xs text-zinc-400">Drag nodes • add links • realtime physics</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{layout}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Nodes: <span className="text-[#ffd24a] ml-1">{nodes.length}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Links: <span className="text-[#ffd24a] ml-1">{links.length}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <ConceptMapSVG width={mapWidth} height={mapHeight} simApi={simApi} theme={theme} running={running} selectedNodeId={selectedNode ? selectedNode.id : null} onSelectNode={handleSelectNode} onUpdateNodeLabel={() => {}} onDeleteNode={() => {}} onDeleteLink={() => {}} layout={layout} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                {/* Reuse metrics component larger */}
                <MetricsOscillo metricsHistory={metricsHistory} running={running} />
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
                      <div className="text-xs text-zinc-400">Nodes</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{nodes.length}</div>
                      <div className="text-xs text-zinc-400 mt-1">Total concepts</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Links</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{links.length}</div>
                      <div className="text-xs text-zinc-400 mt-1">Connections</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Avg Degree</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{metricsHistory.length ? round(metricsHistory[metricsHistory.length - 1].avgDegree, 2) : "—"}</div>
                      <div className="text-xs text-zinc-400 mt-1">Avg links / node</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Search /></span>
                    <span>
                      Tip: Use <span className="text-white font-semibold">Add</span> then drag nodes. Use <span className="text-white font-semibold">Link</span> to connect topics. Export JSON for saving.
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
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm cursor-pointer" onClick={addNode}><Plus className="w-4 h-4 mr-2" /> Add</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-orange-400 hover:bg-black hover:text-orange-500 cursor-pointer bg-black text-sm" onClick={() => startLinkMode()}><LinkIcon className="w-4 h-4" /></Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-orange-400 hover:bg-black hover:text-orange-500 cursor-pointer p-2" onClick={exportJSON}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
