// src/pages/LoadBalancePage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Server,
  Cpu,
  Play,
  Pause,
  Plus,
  Trash2,
  Layers,
  Gauge,
  Download,
  Settings,
  Zap,
  Activity,
  Menu,
  X,
  Zap as Lightning,
  Shuffle,

  Repeat,
  BarChart3,
  ZapOff,
  Eye,
  EyeOff,
  BrushCleaning,
  BadgePlus,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { toPng } from "html-to-image";  

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
  AreaChart,
  Area,
} from "recharts";

/* ============================
   Utilities
   ============================ */
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nowMs = () => performance.now();

/* ============================
   Load balancer simulation hook
   - Simulates incoming request flow and dispatching to servers.
   - Supports algorithms: round-robin, least-connections, weighted, least-latency.
   - Produces history for charts and server util states for visualizer.
   ============================ */
function useLoadBalancerSim({
  running,
  timestep = 80,
  serverConfig = [
    { id: "srv-1", weight: 1, capacity: 100, healthy: true },
    { id: "srv-2", weight: 1, capacity: 100, healthy: true },
    { id: "srv-3", weight: 1, capacity: 100, healthy: true },
  ],
  algorithm = "round-robin",
  incomingRPS = 40, // requests per second baseline
  burst = false,
  manualDispatchRate = null, // if set, override dispatch decisions (debug)
}) {
  // internal history: records last N seconds of metrics (requests/sec, avg latency)
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, rps: 0, avgLatency: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  // server internal state
  const serversRef = useRef(serverConfig.map((s, idx) => ({
    ...s,
    activeConns: 0,
    servedTotal: 0,
    queue: 0,
    avgLatency: 0,
    lastServedAt: 0,
  })));
  const [servers, setServers] = useState(serversRef.current);

  // dispatcher state for round-robin pointer & weighted distribution
  const rrIndexRef = useRef(0);
  const lastRef = useRef(nowMs());
  const tRef = useRef(0);
  const rafRef = useRef(null);

  // helper: apply serverConfig updates to internal server state (preserve counters where possible)
  const syncServerConfig = useCallback((cfg) => {
    const map = new Map(cfg.map((s) => [s.id, s]));
    serversRef.current = cfg.map((s) => {
      const prev = serversRef.current.find((ps) => ps.id === s.id);
      return {
        id: s.id,
        weight: s.weight ?? 1,
        capacity: s.capacity ?? 100,
        healthy: s.healthy ?? true,
        activeConns: prev ? prev.activeConns : 0,
        servedTotal: prev ? prev.servedTotal : 0,
        queue: prev ? prev.queue : 0,
        avgLatency: prev ? prev.avgLatency : 0,
        lastServedAt: prev ? prev.lastServedAt : 0,
      };
    });
    setServers(serversRef.current.slice());
  }, []);

  useEffect(() => syncServerConfig(serverConfig), [serverConfig, syncServerConfig]);

  // algorithm implementations
  const chooseServer = useCallback((alg, serversList, rrState) => {
    const activeServers = serversList.filter((s) => s.healthy);
    if (activeServers.length === 0) return null;
    if (alg === "round-robin") {
      rrState.current = (rrState.current ?? 0) % activeServers.length;
      const pick = activeServers[rrState.current];
      rrState.current = (rrState.current + 1) % activeServers.length;
      return pick;
    } else if (alg === "least-connections") {
      return activeServers.reduce((a, b) => (a.activeConns <= b.activeConns ? a : b));
    } else if (alg === "weighted") {
      // build weighted array
      const arr = [];
      activeServers.forEach((s) => {
        const w = Math.max(1, Math.round(s.weight));
        for (let i = 0; i < w; i++) arr.push(s);
      });
      const idx = Math.floor(Math.random() * arr.length);
      return arr[idx];
    } else if (alg === "least-latency") {
      return activeServers.reduce((a, b) => (a.avgLatency <= b.avgLatency ? a : b));
    }
    return activeServers[0];
  }, []);

  // latency model: inversely proportional to (capacity - activeConns) with some randomness
  const sampleLatencyForServer = (srv) => {
    const util = clamp((srv.activeConns) / Math.max(1, srv.capacity), 0, 1);
    const base = 20 + util * 180; // 20ms at low util, up to ~200ms high util
    // add random noise and effect of queue
    const noise = (Math.random() - 0.5) * 12;
    const qPen = srv.queue > 0 ? Math.log2(1 + srv.queue) * 6 : 0;
    return Math.max(2, base + noise + qPen);
  };

  // main RAF loop
  useEffect(() => {
    let alive = true;
    lastRef.current = nowMs();

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
      const secondsElapsed = tRef.current / 1000;

      // incoming requests for this tick: convert incomingRPS to per-tick requests
      // apply burst: bursts increase RPS randomly
      let effectiveRPS = incomingRPS;
      if (burst && Math.random() < 0.08) {
        effectiveRPS *= 2 + Math.random() * 3; // burst 2x-5x occasionally
      }

      // per-step requests (continuous)
      const reqThisTickFloat = (effectiveRPS * dt) / 1000;
      // we'll dispatch integer requests but maintain fractional remainder
      const remainderKey = "_r_lb_rem";
      serversRef.current._rLB = serversRef.current._rLB ?? 0;
      serversRef.current._rLB += reqThisTickFloat;
      const toDispatch = Math.floor(serversRef.current._rLB);
      serversRef.current._rLB -= toDispatch;

      const serversLocal = serversRef.current.map((s) => ({ ...s })); // shallow copy for mutations

      // dispatch loop
      let dispatched = 0;
      for (let i = 0; i < toDispatch; i++) {
        const serverPicked = manualDispatchRate ? serversLocal.find((s) => s.id === manualDispatchRate) : chooseServer(algorithm, serversLocal, rrIndexRef);
        if (!serverPicked) break;
        // if server capacity is full, push to queue or mark drop
        if (serverPicked.activeConns >= serverPicked.capacity) {
          serverPicked.queue = (serverPicked.queue || 0) + 1;
        } else {
          serverPicked.activeConns += 1;
          serverPicked.servedTotal = (serverPicked.servedTotal || 0) + 1;
          serverPicked.lastServedAt = secondsElapsed;
        }
        dispatched++;
      }

      // service completion: each server completes some fraction of activeConns per tick
      serversLocal.forEach((s) => {
        // service rate: a server serves between 5% - 25% of activeConns each tick depending on capacity & randomness
        const baseService = Math.max(1, Math.round((s.capacity / 100) * (0.04 + Math.random() * 0.18) * (dt / 80)));
        const completed = Math.min(s.activeConns, baseService);
        s.activeConns = Math.max(0, s.activeConns - completed);

        // process queued requests: if capacity freed, move from queue -> active
        if (s.queue > 0) {
          const canTake = Math.max(0, s.capacity - s.activeConns);
          const moved = Math.min(canTake, s.queue);
          s.queue -= moved;
          s.activeConns += moved;
          s.servedTotal += moved;
        }

        // update avg latency (EWMA)
        const sampled = sampleLatencyForServer(s);
        s.avgLatency = s.avgLatency ? s.avgLatency * 0.86 + sampled * 0.14 : sampled;
      });

      // record aggregated metrics
      const totalActive = serversLocal.reduce((a, b) => a + b.activeConns, 0);
      const totalQueue = serversLocal.reduce((a, b) => a + (b.queue || 0), 0);
      const totalServed = serversLocal.reduce((a, b) => a + (b.servedTotal || 0), 0);
      const avgLatency = serversLocal.length ? serversLocal.reduce((a, b) => a + b.avgLatency, 0) / serversLocal.length : 0;

      // create history entry every tick (we use 1 index per tick)
      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        // convert dispatched to observed rps (approx)
        next.push({ t: lastT + 1, rps: dispatched, avgLatency: round(avgLatency, 2), active: totalActive, queue: totalQueue });
        if (next.length > 720) next.shift();
        return next;
      });

      // commit server state (for UI)
      serversRef.current = serversLocal;
      setServers(serversLocal);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, incomingRPS, chooseServer, algorithm, burst, manualDispatchRate]);

  return { history, servers, syncServerConfig };
}

/* ============================
   Visualizer SVG for Load Balancer
   - Shows a load balancer box, server racks, animated request packets
   - Server rectangles show utilization and health
   - Animated packet dots show dispatch velocity and density according to RPS
   ============================ */
function LoadBalancerVisualizer({ servers = [], history = [], running, incomingRPS = 0, algorithm = "round-robin" }) {
  // latest metrics
  const latest = history.length ? history[history.length - 1] : { rps: 0, avgLatency: 0 };
  const rps = latest.rps || 0;
  const avgLatency = latest.avgLatency || 0;

  // server layout
  const serverCount = Math.max(1, servers.length);
  const widthPer = Math.max(120, Math.min(260, Math.floor(900 / Math.max(1, Math.min(serverCount, 6)))));
  const svgWidth = Math.max(900, widthPer * serverCount + 240);
  const svgHeight = 420;

  // animated packet parameters
  const dotCount = clamp(Math.round(2 + rps * 0.6), 3, 120);
  const speed = clamp(0.9 + (40 / (rps + 8)), 0.28, 3.5);

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start md:flex-row flex-col justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Smart Load Balancer</div>
            <div className="text-xs text-zinc-400">Realtime distribution • algorithm: <span className="text-white font-semibold ml-1">{algorithm}</span></div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">RPS: <span className="text-[#ffd24a] ml-1">{Math.round(incomingRPS)}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Dispatch (last): <span className="text-[#00ffbf] ml-1">{rps}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Avg Latency: <span className="text-[#ff9a4a] ml-1">{avgLatency} ms</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* Load balancer box at left */}
          <g transform={`translate(60, ${svgHeight / 2 - 60})`}>
            <rect x="0" y="0" width="160" height="120" rx="14" fill="#060606" stroke="#222" />
            <text x="16" y="28" fontSize="14" fill="#ffd24a">Load Balancer</text>
            <text x="16" y="48" fontSize="11" fill="#aaa">Policy: <tspan fill="#fff">{algorithm}</tspan></text>

            {/* small port lines */}
            <path d="M 160 20 H 260" stroke="#111" strokeWidth="6" strokeLinecap="round" />
            <path d="M 160 60 H 260" stroke="#111" strokeWidth="6" strokeLinecap="round" />
            <path d="M 160 100 H 260" stroke="#111" strokeWidth="6" strokeLinecap="round" />
          </g>

          {/* servers on the right; spaced */}
          {servers.map((s, i) => {
            const x = 300 + i * widthPer;
            const y = svgHeight / 2 - 72;
            const util = clamp((s.activeConns || 0) / Math.max(1, s.capacity), 0, 1);
            const height = 120;
            const fillBarHeight = Math.round(util * (height - 12));
            const barY = y + (height - 6 - fillBarHeight);

            const healthFill = s.healthy ? "#00ffbf" : "#ff6a6a";
            const serverLabel = s.id || `srv-${i + 1}`;

            // target path from LB to server
            const pathStr = `M ${220} ${svgHeight/2} C ${240} ${svgHeight/2} ${x-40} ${y+24} ${x} ${y+24}`;

            return (
              <g key={s.id}>
                {/* connector */}
                <path d={pathStr} stroke="#111" strokeWidth="4" fill="none" strokeLinecap="round" />

                {/* server rectangle */}
                <g transform={`translate(${x},${y})`}>
                  <rect x="-60" y="0" width="120" height={height} rx="10" fill="#060606" stroke="#222" />
                  <text x="-52" y="18" fontSize="12" fill="#ffd24a">{serverLabel}</text>
                  <text x="-52" y="36" fontSize="11" fill="#aaa">w: {s.weight} • cap: {s.capacity}</text>

                  {/* utilization bar */}
                  <rect x="-44" y="48" width="40" height={height - 56} rx="6" fill="#0b0b0b" stroke="#222" />
                  <rect x="-44" y={barY - y} width="40" height={fillBarHeight} rx="6" fill={healthFill} opacity={0.95} />

                  {/* small stats */}
                  <text x="12" y={height - 28} fontSize="11" fill="#fff">cls: <tspan fill="#00ffbf">{s.activeConns}</tspan></text>
                  <text x="12" y={height - 10} fontSize="11" fill="#fff">q: <tspan fill="#ff9a4a">{s.queue || 0}</tspan></text>

                  {/* health badge */}
                  <rect x="10" y="-6" width="44" height="18" rx="8" fill={s.healthy ? "#062915" : "#3a0b0b"} stroke="#222" />
                  <text x="16" y="6" fontSize="11" fill={s.healthy ? "#9ee6ff" : "#ffd2d2"}>{s.healthy ? "UP" : "DOWN"}</text>
                </g>

                {/* animated packets traveling along the path */}
                {Array.from({ length: Math.min(12, Math.max(3, Math.round(dotCount / Math.max(1, servers.length)))) }).map((_, di) => {
                  const delay = (di / Math.max(1, Math.min(12, dotCount))) * speed;
                  const style = {
                    offsetPath: `path('${pathStr}')`,
                    animationName: "packetFlow",
                    animationDuration: `${Math.max(0.6, speed)}s`,
                    animationTimingFunction: "linear",
                    animationDelay: `${-delay}s`,
                    animationIterationCount: "infinite",
                    animationPlayState: running ? "running" : "paused",
                    transformOrigin: "0 0",
                  };
                  const color = s.healthy ? "#ffd24a" : "#ff6a6a";
                  return <circle key={`pkt-${i}-${di}`} r="4" fill={color} style={style} />;
                })}
              </g>
            );
          })}

          {/* readout panel */}
          <g transform={`translate(${svgWidth - 200},24)`}>
            <rect x="-16" y="-8" width="180" height="120" rx="10" fill="#060606" stroke="#222" />
            <text x="-6" y="12" fontSize="12" fill="#ffb57a">Readouts</text>
            <text x="-6" y="36" fontSize="12" fill="#fff">Incoming RPS: <tspan fill="#ffd24a">{Math.round(incomingRPS)}</tspan></text>
            <text x="-6" y="56" fontSize="12" fill="#fff">Dispatch Rate: <tspan fill="#00ffbf">{Math.round(latest.rps || 0)}</tspan></text>
            <text x="-6" y="76" fontSize="12" fill="#fff">Avg Latency: <tspan fill="#ff9a4a">{latest.avgLatency} ms</tspan></text>
            <text x="-6" y="96" fontSize="12" fill="#fff">Servers: <tspan fill="#ffd24a">{servers.length}</tspan></text>
          </g>

          <style>{`
            @keyframes packetFlow {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.9); }
              35% { opacity: 1; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) {
              text { font-size: 10px; }
            }
          `}</style>
        </svg>
      </div>
    </div>
  );
}

/* ============================
   Perf Oscilloscope component (RPS, Avg Latency)
   ============================ */
function RequestOscilloscope({ history = [], running }) {
  const data = history.slice(-240).map((d, idx) => ({
    t: idx,
    rps: d.rps || 0,
    latency: d.avgLatency || 0,
    active: d.active || 0,
  }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — Requests/sec & Avg Latency</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis yAxisId="left" orientation="left" tick={{ fill: "#888" }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line yAxisId="left" type="monotone" dataKey="rps" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="RPS" />
            <Line yAxisId="right" type="monotone" dataKey="latency" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Avg Latency (ms)" />
            <Line yAxisId="left" type="monotone" dataKey="active" stroke="#00ffbf" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Active Conns" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Load Balance Page
   ============================ */
export default function LoadBalancePage() {
  // UI state
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // algorithm selection
  const [algorithm, setAlgorithm] = useState("round-robin");
  const [incomingRPS, setIncomingRPS] = useState(40);
  const [burst, setBurst] = useState(false);
  const [manualServerSelect, setManualServerSelect] = useState(null);

  // server list state — must include id, weight, capacity, healthy
  const [serversCfg, setServersCfg] = useState([
    { id: "srv-1", weight: 2, capacity: 120, healthy: true },
    { id: "srv-2", weight: 1, capacity: 90, healthy: true },
    { id: "srv-3", weight: 1, capacity: 100, healthy: true },
  ]);

  const { history, servers, syncServerConfig } = useLoadBalancerSim({
    running,
    timestep: 80,
    serverConfig: serversCfg,
    algorithm,
    incomingRPS,
    burst,
    manualDispatchRate: manualServerSelect,
  });

  useEffect(() => {
    // whenever server cfg changes, sync to sim
    syncServerConfig(serversCfg);
  }, [serversCfg, syncServerConfig]);

  // handy derived values
  const latest = history.length ? history[history.length - 1] : { rps: 0, avgLatency: 0, active: 0, queue: 0 };
  const totalActive = servers.reduce((a, b) => a + (b.activeConns || 0), 0);
  const totalQueue = servers.reduce((a, b) => a + (b.queue || 0), 0);

  /* ------------------
     Mutators
     ------------------ */
  const addServer = () => {
    setServersCfg((s) => {
      const nxtId = `srv-${s.length + 1}`;
      return [...s, { id: nxtId, weight: 1, capacity: 100, healthy: true }];
    });
    toast.success("Server added");
  };

  const snapshotPNG = async () => {
    const node = document.querySelector(".snapshot");
    if (!node) {
      toast.error("Snapshot target not found");
      return;
    }

    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#000",
        quality: 1,
      });
      const link = document.createElement("a");
      link.download = `snapshot-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Snapshot saved!");
    } catch (error) {
      console.error("Snapshot failed:", error);
      toast.error("Failed to capture snapshot");
    }
 
}

  const removeServer = (id) => {
    setServersCfg((s) => s.filter((sv) => sv.id !== id));
    if (manualServerSelect === id) setManualServerSelect(null);
    toast("Server removed");
  };

  const toggleHealth = (id) => {
    setServersCfg((s) => s.map((sv) => (sv.id === id ? { ...sv, healthy: !sv.healthy } : sv)));
    toast("Server health toggled");
  };

  const updateServer = (id, patch) => {
    setServersCfg((s) => s.map((sv) => (sv.id === id ? { ...sv, ...patch } : sv)));
  };

  const exportCSV = () => {
    const rows = [
      ["t", "rps", "avgLatency", "active", "queue"],
      ...history.map((d) => [d.t, d.rps, d.avgLatency, d.active || 0, d.queue || 0]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loadbalancer-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const snapshot = () => {
    toast.success("Snapshot saved (visual only)");
    // Could implement html2canvas snapshot if desired
  };

  return (
    <div className="min-h-screen pb-20  bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md hover:scale-105 transition-transform">
                <Zap className="w-5 h-5 text-black" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-200">SparkLab</div>
                <div className="text-xs text-zinc-400 -mt-0.5">Smart Load Balancer</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-44">
                <Select value={algorithm} onValueChange={(v) => setAlgorithm(v)}>
                  <SelectTrigger className="w-full cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Algorithm" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="round-robin">Round Robin</SelectItem>
                    <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="least-connections">Least Connections</SelectItem>
                    <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="weighted">Weighted</SelectItem>
                    <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="least-latency">Least Response Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-2" onClick={snapshotPNG}>Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer hover:bg-black hover:text-orange-400 border-zinc-700 text-zinc-300 p-2" onClick={() => setRunning((r) => !r)}>{running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</Button>
                <Button variant="ghost" className="border cursor-pointer hover:bg-black hover:text-orange-400 border-zinc-700 text-zinc-300 p-2" onClick={() => { setIncomingRPS(40); setBurst(false); toast("Defaults restored"); }}><Settings className="w-5 h-5" /></Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer hover:bg-black hover:text-orange-400 border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen((m) => !m)}>{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</Button>
            </div>
          </div>

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={algorithm} onValueChange={(v) => setAlgorithm(v)}>
                    <SelectTrigger className="w-full cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                      <SelectValue placeholder="Algorithm" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="round-robin">Round Robin</SelectItem>
                      <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="least-connections">Least Connections</SelectItem>
                      <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="weighted">Weighted</SelectItem>
                      <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="least-latency">Least Response Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={snapshotPNG}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 cursor-pointer border border-zinc-800" onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Run"}</Button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="h-16 sm:h-16"></div>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center"><Activity className="w-5 h-5" /></div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Controller</div>
                        <div className="text-xs text-zinc-400">Tweak incoming traffic • servers • policy</div>
                      </div>
                    </div>
                    <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Mode</Badge>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-400">Incoming Requests / sec</label>
                    <div className="flex items-center gap-2">
                      <Input value={incomingRPS} onChange={(e) => setIncomingRPS(Number(e.target.value || 0))} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <Button className="hover:bg-black hover:text-orange-400 cursor-pointer bg-black text-white border border-zinc-500/60" variant="outline" onClick={() => setIncomingRPS((s) => Math.max(1, s - 5))}>-5</Button>
                      <Button variant="outline" className="hover:bg-black hover:text-orange-400 cursor-pointer bg-black text-white border border-zinc-500/60" onClick={() => setIncomingRPS((s) => s + 5)}>+5</Button>
                      <Button variant="ghost"  onClick={() => setBurst((b) => !b)} className={`border cursor-pointer hover:bg-black hover:text-orange-500 ${burst ? "border-orange-500 text-orange-300" : "border-zinc-800 text-zinc-300"}`}>{burst ? <Lightning className="w-4 h-4" /> : <Lightning className="w-4 h-4" />}</Button>
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">Burst toggles occasional traffic spikes to test balancing under stress.</div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span>Manual dispatch (optional)</span>
                      <span className="text-zinc-300 text-xs">Select server to force dispatch</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Select value={manualServerSelect} onValueChange={(v) => setManualServerSelect(v)}>
                          <SelectTrigger className="w-full cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                            <SelectValue placeholder="Auto" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                            <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={null}>Auto</SelectItem>
                            {serversCfg.map((s) => <SelectItem       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" key={s.id} value={s.id}>{s.id}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="outline" className="hover:bg-black hover:text-orange-400 cursor-pointer bg-black text-white border border-zinc-500/60" onClick={() => setManualServerSelect(null)}><BrushCleaning/></Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-zinc-400">Servers</div>
                      <div className="text-xs text-zinc-400">{serversCfg.length} managed</div>
                    </div>

                    <div className="space-y-2">
                      {serversCfg.map((sv) => (
                        <div key={sv.id} className="border border-zinc-800 rounded-lg p-2 flex items-center gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-[#ffd24a]">{sv.id}</div>
                              <Badge className={`px-2 py-0.5 rounded-full ${sv.healthy ? " border  bg-sky-600/40 border-sky-500/50 text-[#9ee6ff]" : "bg-red-600/50 border-red-500/50 text-[#ffd2d2]"}`}>{sv.healthy ? "UP" : "DOWN"}</Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Input value={sv.weight} onChange={(e) => updateServer(sv.id, { weight: Math.max(1, Number(e.target.value || 1)) })} type="number" className="w-20 bg-zinc-900/60 border border-zinc-800 text-white" />
                              <Input value={sv.capacity} onChange={(e) => updateServer(sv.id, { capacity: Math.max(10, Number(e.target.value || 10)) })} type="number" className="w-28 bg-zinc-900/60 border border-zinc-800 text-white" />
                              <div className="ml-auto flex gap-1">
                                <Button variant="ghost"  onClick={() => toggleHealth(sv.id)} className="hover:bg-black hover:text-orange-400 cursor-pointer bg-black text-white border border-zinc-500/60">{sv.healthy ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
                                <Button variant="ghost" onClick={() => removeServer(sv.id)} className="p-1 border border-zinc-800 bg-red-600 cursor-pointer hover:bg-red-600 text-black"><Trash2 className="w-4 h-4" /></Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 mt-2">
                      <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={addServer}><BadgePlus className="w-4 h-4 mr-2" /> Add Server</Button>
                      <Button variant="ghost" className="border text-white cursor-pointer border-zinc-800" onClick={() => { setServersCfg([{ id: "srv-1", weight: 2, capacity: 120, healthy: true }]); toast("Reset servers"); }}>Reset</Button>
                    </div>
                  </div>

                  <div className="mt-3 bg-black/70 border border-orange-500/30 text-white px-3 py-2 rounded-full shadow-sm text-xs flex items-start gap-2">
                    <span className="text-orange-400"><Gauge /></span>
                    <div>
                      Tip: Weighted + least-connections gives good distribution for varied backend capacities. Use burst mode to stress test.
                    </div>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <Button className="px-3 py-2 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                    <Button variant="outline" className="px-3 py-2 cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    <Button variant="ghost" className="px-3 py-2 text-white cursor-pointer border border-zinc-700" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Visual + Oscilloscope */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border snapshot border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex md:items-center items-start gap-3 md:flex-row flex-col justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center"><Server className="w-5 h-5" /></div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated request flow • server util • latencies</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Policy: <span className="text-[#ffd24a] ml-1">{algorithm}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Servers: <span className="text-[#ffd24a] ml-1">{servers.length}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Active: <span className="text-[#00ffbf] ml-1">{totalActive}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <LoadBalancerVisualizer servers={servers} history={history} running={running} incomingRPS={incomingRPS} algorithm={algorithm} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full">
              <div>
                <RequestOscilloscope history={history} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[#ffd24a]"><BarChart3 className="w-5 h-5" /> Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Incoming RPS</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{Math.round(incomingRPS)}</div>
                      <div className="text-xs text-zinc-400 mt-1">Configured input</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Dispatch (last)</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{latest.rps}</div>
                      <div className="text-xs text-zinc-400 mt-1">Requests dispatched in last tick</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Avg Latency</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{latest.avgLatency} ms</div>
                      <div className="text-xs text-zinc-400 mt-1">Estimated avg across servers</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Active Conns</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{totalActive}</div>
                      <div className="text-xs text-zinc-400 mt-1">Total active requests</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Queued</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{totalQueue}</div>
                      <div className="text-xs text-zinc-400 mt-1">Requests waiting on overloaded servers</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Manual Dispatch</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{manualServerSelect || "Auto"}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightning /></span>
                    <span>
                      Tip: Toggle servers to DOWN to test failover. Use Weighted + Least Connections for capacity-aware distribution.
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
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 cursor-pointer text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
