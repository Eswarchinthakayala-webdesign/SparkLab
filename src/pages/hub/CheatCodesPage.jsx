// src/pages/CheatCodePage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Zap,
  Play,
  Pause,
  Plus,
  Trash2,
  Edit2,
  Download,
  Settings,
  Menu,
  X,
  Users,
  ZapOff,
  Cpu,
  ListPlus,
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
import { Textarea } from "@/components/ui/textarea"; // if available
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
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const id = (n = 6) => Math.random().toString(36).slice(2, 2 + n);

/* ============================
   Study simulator hook
   - Simulates attention/memory curves based on session intensity,
     user type, and selected cheat effectiveness.
   - Produces history for chart & latest metrics for visualizer.
   ============================ */
function useStudySim({
  running,
  timestep = 120,
  intensity = 0.7, // 0..1
  userType = "regular", // novice | regular | pro
  cheatEffectiveness = 0.6, // 0..1 how strong current cheat is
}) {
  const historyRef = useRef(Array.from({ length: 200 }, (_, i) => ({ t: i, attention: 0, retention: 0, focus: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  const userFactor = useMemo(() => {
    // novice learns slower, pro learns faster
    switch (userType) {
      case "novice":
        return 0.75;
      case "pro":
        return 1.25;
      default:
        return 1.0;
    }
  }, [userType]);

  const computeInstant = useCallback(
    (tSeconds) => {
      // attention: oscillatory with intensity-driven amplitude and small decay
      const baseAttention = 0.2 + intensity * 0.7; // 0.2..0.9
      const attention = clamp(baseAttention + 0.15 * Math.sin(tSeconds * 2.0) * (0.8 + cheatEffectiveness), 0, 1);

      // retention: increases slowly with session time, boosted by cheatEffectiveness and userFactor
      const retention = clamp(0.15 + (1 - Math.exp(-tSeconds * 0.08 * userFactor)) * (0.6 * cheatEffectiveness + 0.4), 0, 1);

      // focus: product-ish of attention and retention with small noise
      const focus = clamp(attention * (0.5 + retention * 0.5) + 0.05 * Math.sin(tSeconds * 3.7), 0, 1);

      return { attention, retention, focus };
    },
    [cheatEffectiveness, intensity, userFactor]
  );

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
      const tSeconds = tRef.current / 1000;

      const inst = computeInstant(tSeconds);

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, attention: inst.attention, retention: inst.retention, focus: inst.focus });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, computeInstant, timestep]);

  const latest = history.length ? history[history.length - 1] : { attention: 0, retention: 0, focus: 0 };

  return { history, latest };
}

/* ============================
   Visualizer: StudyFlowSVG
   - visualizes study flow as animated "packets" travelling
     through "brain network" nodes, with glow and gauges.
   - parameters react to latest metrics passed in.
   ============================ */
function StudyFlowSVG({ latest = { attention: 0, retention: 0, focus: 0 }, running, subject = "Any", cheatName = "—" }) {
  const { attention = 0, retention = 0, focus = 0 } = latest;
  const intensity = clamp(attention * 1.2 + retention * 0.8, 0, 1);
  const dotCount = clamp(Math.round(3 + intensity * 14), 3, 20);
  const speed = clamp(1.6 / (0.15 + intensity), 0.4, 3.2);

  // colors
  const accent = "#ffd24a";
  const green = "#00ffbf";
  const pink = "#ff6a9a";

  const svgWidth = 980;
  const svgHeight = 360;

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start md:items-center md:flex-row flex-col justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">CheatFlow Visualizer</div>
            <div className="text-xs text-zinc-400">Real-time study flow • subject: <span className="text-white font-semibold">{subject}</span></div>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Cheat: <span className="text-[#ffd24a] ml-1">{cheatName}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Focus: <span className="text-[#00ffbf] ml-1">{Math.round(focus * 100)}%</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* network nodes */}
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* curved paths connecting nodes */}
          <g stroke="#111" strokeWidth="4" fill="none" opacity="0.8">
            <path d="M80 220 C 220 110, 420 110, 560 220" stroke="#111" />
            <path d="M120 120 C 260 240, 420 240, 660 120" stroke="#111" />
          </g>

          {/* nodes */}
          {[
            { x: 90, y: 220, label: "Recall" },
            { x: 280, y: 135, label: "Encoding" },
            { x: 470, y: 220, label: "Storage" },
            { x: 660, y: 135, label: "Retrieval" },
          ].map((n, i) => {
            const glowOpacity = 0.25 + (i % 2 ? retention : attention) * 0.7;
            const fill = i % 2 ? "#0a0a0a" : "#0a0a0a";
            const accentDot = i % 2 ? "#ffd24a" : "#ff9a4a";
            return (
              <g key={i} transform={`translate(${n.x},${n.y})`} filter={glowOpacity > 0.02 ? "url(#glow)" : ""}>
                <circle r={28} fill={fill} stroke="#222" strokeWidth="2" />
                <circle r={12} fill={accentDot} opacity={0.85} />
                <text x="-8" y="50" fontSize="11" fill="#aaa">{n.label}</text>
              </g>
            );
          })}

          {/* animated packets flowing along path */}
          {Array.from({ length: dotCount }).map((_, di) => {
            const pathStr = "M 90 220 C 220 110, 420 110, 560 220";
            const delay = (di / dotCount) * speed;
            const style = {
              offsetPath: `path('${pathStr}')`,
              animationName: "studyFlow",
              animationDuration: `${speed}s`,
              animationTimingFunction: "cubic-bezier(.35,.2,.2,1)",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
              transformOrigin: "0 0",
            };
            const color = di % 3 === 0 ? accent : di % 3 === 1 ? green : pink;
            const baseScale = 0.8 + focus * 0.8;
            return <circle key={`p-${di}`} r={6 * baseScale} fill={color} style={style} />;
          })}

          {/* readout panel */}
          <g transform={`translate(${svgWidth - 200},30)`}>
            <rect x="-90" y="-18" width="180" height="120" rx="10" fill="#060606" stroke="#222" />
            <text x="-78" y="-0" fontSize="12" fill="#ffb57a">Metrics</text>
            <text x="-78" y="18" fontSize="12" fill="#fff">Attention: <tspan fill="#ffd24a">{Math.round(attention * 100)}%</tspan></text>
            <text x="-78" y="38" fontSize="12" fill="#fff">Retention: <tspan fill="#00ffbf">{Math.round(retention * 100)}%</tspan></text>
            <text x="-78" y="58" fontSize="12" fill="#fff">Focus: <tspan fill="#ff9a4a">{Math.round(focus * 100)}%</tspan></text>
          </g>

          <style>{`
            @keyframes studyFlow {
              0% { offset-distance: 0%; opacity: .95; transform: scale(.88); }
              40% { opacity: .9; transform: scale(1.02); }
              100% { offset-distance: 100%; opacity: 0; transform: scale(.7); }
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
   Oscilloscope — Study metrics
   - Plots attention, retention, focus history.
   ============================ */
function StudyOscilloscope({ history = [], running }) {
  const data = history.slice(-360).map((d, idx) => ({ t: idx, A: round(d.attention, 3), R: round(d.retention, 3), F: round(d.focus, 3) }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Session Oscilloscope — Attention, Retention, Focus</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} domain={[0, 1]} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="A" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Attention" />
            <Line type="monotone" dataKey="R" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Retention" />
            <Line type="monotone" dataKey="F" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Focus" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main CheatCodePage component
   ============================ */
export default function CheatCodePage() {
  // UI state
  const [running, setRunning] = useState(false);
  const [subject, setSubject] = useState("Electrical Engg");
  const [userType, setUserType] = useState("regular"); // novice / regular / pro
  const [sessionIntensity, setSessionIntensity] = useState(0.7); // 0..1 slider
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");

  // cheat codes store (in-memory). Schema: { id, title, subject, category, content, effectiveness }
  const [cheats, setCheats] = useState(() => {
    // seed with a few realistic cheats
    return [
      {
        id: id(),
        title: "Nodal Analysis Steps",
        subject: "Electrical Engg",
        category: "Formulas",
        content: "1) Identify nodes 2) Choose reference 3) Apply KCL at nodes 4) Solve simultaneous equations",
        effectiveness: 0.7,
      },
      {
        id: id(),
        title: "QR Mnemonic (Signals)",
        subject: "Electrical Engg",
        category: "Mnemonics",
        content: "Q → Quality factors, R → Resistive damping — remember to check damping before bandwidth calculations",
        effectiveness: 0.55,
      },
      {
        id: id(),
        title: "Integration Trick",
        subject: "Math",
        category: "Shortcuts",
        content: "Use substitution x = tan(θ) for integrals containing √(1+x^2)",
        effectiveness: 0.6,
      },
    ];
  });

  const [editing, setEditing] = useState(null); // cheat id for edit
  const [form, setForm] = useState({ title: "", category: "Formulas", content: "", subject: subject, effectiveness: 0.6 });

  const selectedCheat = useMemo(() => {
    // pick best matching cheat according to subject + category + query
    const filtered = cheats.filter((c) => (categoryFilter === "all" ? true : c.category === categoryFilter) && (subject ? c.subject === subject : true) && (query ? (c.title + c.content).toLowerCase().includes(query.toLowerCase()) : true));
    // score by effectiveness and a tiny bit of subject-match
    filtered.sort((a, b) => (b.effectiveness || 0) - (a.effectiveness || 0));
    return filtered.length ? filtered[0] : null;
  }, [cheats, categoryFilter, subject, query]);

  // cheatEffectiveness used by visualizer
  const cheatEffectiveness = selectedCheat ? clamp(selectedCheat.effectiveness, 0, 1) : 0.25;

  // simulation hook
  const { history, latest } = useStudySim({
    running,
    timestep: 100,
    intensity: sessionIntensity,
    userType,
    cheatEffectiveness,
  });

  /* -------------------------
     CRUD for cheats
     ------------------------- */
  const startAdd = () => {
    setEditing(null);
    setForm({ title: "", category: "Formulas", content: "", subject, effectiveness: 0.6 });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const startEdit = (c) => {
    setEditing(c.id);
    setForm({ title: c.title, category: c.category, content: c.content, subject: c.subject, effectiveness: c.effectiveness });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const saveForm = () => {
    // validation
    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.content.trim()) return toast.error("Content is required");
    if (!form.subject.trim()) return toast.error("Subject is required");
    if (!Number.isFinite(Number(form.effectiveness)) || Number(form.effectiveness) < 0 || Number(form.effectiveness) > 1)
      return toast.error("Effectiveness must be between 0 and 1");

    if (editing) {
      setCheats((s) => s.map((c) => (c.id === editing ? { ...c, ...form } : c)));
      toast.success("Cheat updated");
      setEditing(null);
    } else {
      const newC = { id: id(), ...form };
      setCheats((s) => [newC, ...s]);
      toast.success("Cheat added");
    }
    setForm({ title: "", category: "Formulas", content: "", subject, effectiveness: 0.6 });
  };

  const removeCheat = (cid) => {
    setCheats((s) => s.filter((c) => c.id !== cid));
    toast.success("Removed");
  };

  const exportCSV = () => {
    const rows = [["id", "title", "subject", "category", "content", "effectiveness"], ...cheats.map((c) => [c.id, `"${(c.title || "").replace(/"/g, '""')}"`, c.subject, c.category, `"${(c.content || "").replace(/"/g, '""')}"`, c.effectiveness])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cheatcodes-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  /* -------------------------
     Filtering + counts
     ------------------------- */
  const subjects = useMemo(() => {
    const setS = new Set(cheats.map((c) => c.subject));
    setS.add("Electrical Engg");
    setS.add("Math");
    setS.add("Physics");
    return Array.from(setS);
  }, [cheats]);

  const categories = ["all", "Formulas", "Mnemonics", "Shortcuts", "Tips"];

  /* -------------------------
     UI helpers
     ------------------------- */
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Session started" : "Session paused");
      return nxt;
    });
  };

  return (
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-2 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md hover:scale-105 transition-transform duration-300">
                <BookOpen className="w-5 h-5 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Cheat Codes • Quick study hacks</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-44">
                <Select value={subject} onValueChange={(v) => setSubject(v)}>
                  <SelectTrigger className="w-full cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Subject" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    {subjects.map((s) => (
                      <SelectItem key={s} value={s} className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black px-3 py-1 rounded-lg shadow-md hover:scale-105" onClick={() => { startAdd(); toast("Add a new cheat"); }}>
                  <Plus className="w-4 h-4 mr-2" /> New Cheat
                </Button>

                <Button variant="ghost" className="border border-zinc-700 cursor-pointer text-orange-400 hover:bg-black hover:text-orange-500
 p-2 rounded-lg" onClick={toggleRunning} title={running ? "Pause Session" : "Start Session"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>

                <Button variant="ghost" className="border cursor-pointer text-orange-400 hover:bg-black hover:text-orange-500
  border-zinc-700  p-2 rounded-lg" onClick={exportCSV} title="Export CSV">
                  <Download className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* mobile menu placeholder */}
            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg text-orange-400 hover:bg-black hover:text-orange-500
" onClick={() => { toast("Use the page controls below"); }}>
                <Menu className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16"></div>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Controls + Cheat list */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden w-full max-w-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Quick Cheats</div>
                        <div className="text-xs text-zinc-400">Study hacks tailored to your subject</div>
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
                      <label className="text-xs text-zinc-400">Subject</label>
                      <Select value={subject} onValueChange={(v) => setSubject(v)}>
                        <SelectTrigger className="w-full cursor-pointer bg-zinc-900/60 border border-zinc-800 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                          {subjects.map((s) => <SelectItem  key={s} value={s}    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">User Type</label>
                      <Select value={userType} onValueChange={(v) => setUserType(v)}>
                        <SelectTrigger className="w-full cursor-pointer bg-zinc-900/60 border border-zinc-800 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                          <SelectItem value="novice"    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Novice</SelectItem>
                          <SelectItem value="regular"    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Regular</SelectItem>
                          <SelectItem value="pro"    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Session intensity</label>
                      <input type="range" min="0" max="1" step="0.05" value={sessionIntensity} onChange={(e) => setSessionIntensity(Number(e.target.value))} className="w-full" />
                      <div className="text-xs text-zinc-500 mt-1">Intensity: <span className="text-white font-semibold">{Math.round(sessionIntensity * 100)}%</span></div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Search / Filter</label>
                      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search cheat titles or content" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Category</label>
                      <div className="flex gap-2 flex-wrap mt-2">
                        {categories.map((c) => (
                          <Button key={c} variant={c === categoryFilter ? "default" : "ghost"} className={`px-3 cursor-pointer py-1 ${c === categoryFilter ? "bg-zinc-900/80 border border-orange-500 text-orange-300" : "border border-zinc-800 text-orange-400/80 hover:bg-black hover:text-orange-500/80 bg-black"}`} onClick={() => setCategoryFilter(c)}>
                            {c === "all" ? "All" : c}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* cheat list */}
                  <div className="space-y-2">
                    {cheats.filter((c) => (categoryFilter === "all" ? true : c.category === categoryFilter) && (subject ? c.subject === subject : true) && (query ? (c.title + c.content).toLowerCase().includes(query.toLowerCase()) : true)).map((c) => (
                      <div key={c.id} className="rounded-lg bg-zinc-900/30 border border-zinc-800 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-white">{c.title}</div>
                            <div className="text-xs text-zinc-400 mt-1">{c.category} • <span className="text-zinc-300">{c.subject}</span></div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" className="p-2 text-orange-400 cursor-pointer border border-zinc-600/30 hover:bg-black hover:text-orange-500" onClick={() => startEdit(c)}><Edit2 className="w-4 h-4" /></Button>
                            <Button variant="ghost" className="p-2 cursor-pointer border border-zinc-600/30 bg-red-500 text-black hover:bg-red-600" onClick={() => removeCheat(c.id)}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>
                        <div className="text-xs text-zinc-300 mt-2">{c.content}</div>
                        <div className="mt-2 text-xs text-zinc-400">Effectiveness: <span className="text-[#ffd24a] font-semibold">{Math.round((c.effectiveness || 0) * 100)}%</span></div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Add/Edit form */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[#ffd24a]">{editing ? "Edit Cheat" : "Create Cheat"}</div>
                        <div className="text-xs text-zinc-400">Add a quick study hack</div>
                      </div>
                    </div>
                    <div className="text-xs text-zinc-400">Pro Tip: set effectiveness 0..1</div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    <Input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} placeholder="Short title (e.g., 'Nodal Steps')" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={form.category} onValueChange={(v) => setForm((s) => ({ ...s, category: v }))}>
                        <SelectTrigger className="w-full cursor-pointer bg-zinc-900/60 border border-zinc-800 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                          <SelectItem      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="Formulas">Formulas</SelectItem>
                          <SelectItem      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="Mnemonics">Mnemonics</SelectItem>
                          <SelectItem      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="Shortcuts">Shortcuts</SelectItem>
                          <SelectItem      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="Tips">Tips</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={form.subject} onValueChange={(v) => setForm((s) => ({ ...s, subject: v }))}>
                        <SelectTrigger className="w-full cursor-pointer bg-zinc-900/60 border border-zinc-800 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                          {subjects.map((s) => <SelectItem      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <Textarea value={form.content} onChange={(e) => setForm((s) => ({ ...s, content: e.target.value }))} placeholder="Describe the cheat / steps / mnemonic" className="bg-zinc-900/60 border border-zinc-800 text-white" />

                    <div>
                      <label className="text-xs text-zinc-400">Effectiveness (0..1)</label>
                      <input type="number" min="0" max="1" step="0.01" value={form.effectiveness} onChange={(e) => setForm((s) => ({ ...s, effectiveness: clamp(Number(e.target.value), 0, 1) }))} className="w-full bg-zinc-900/60 border border-zinc-800 text-white p-2 rounded-md" />
                    </div>

                    <div className="flex gap-2">
                      <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={saveForm}><ListPlus className="w-4 h-4 " /> {editing ? "Save" : "Add"}</Button>
                      <Button variant="ghost" className="flex-1 border text-orange-400 hover:bg-black hover:text-orange-500 border-zinc-800 cursor-pointer" onClick={() => { setForm({ title: "", category: "Formulas", content: "", subject, effectiveness: 0.6 }); setEditing(null); }}>Cancel</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right: Visual + Oscilloscope + Summary */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Cheat Visualizer</div>
                        <div className="text-xs text-zinc-400">Choose a cheat → watch the session adapt in realtime</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Subject: <span className="text-[#ffd24a] ml-1">{subject}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Selected: <span className="text-[#ffd24a] ml-1">{selectedCheat ? selectedCheat.title : "—"}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">User: <span className="text-[#ffd24a] ml-1">{userType}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <StudyFlowSVG latest={latest} running={running} subject={subject} cheatName={selectedCheat ? selectedCheat.title : "—"} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <StudyOscilloscope history={history} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Users className="w-5 h-5" /> Session Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Selected Cheat</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{selectedCheat ? selectedCheat.title : "—"}</div>
                      <div className="text-xs text-zinc-400 mt-1">{selectedCheat ? `${Math.round((selectedCheat.effectiveness || 0) * 100)}% effective` : ""}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Live Focus</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{Math.round(latest.focus * 100)}%</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Retention Estimate</div>
                      <div className="text-lg font-semibold text-[#9ee6ff]">{Math.round(latest.retention * 100)}%</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><ZapOff /></span>
                    <span>
                      Tip: Choose cheats with higher <span className="text-white font-semibold">effectiveness</span> for better retention. Edit cheats to reflect your own concise phrasing.
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => { setRunning(true); toast.success("Session resumed"); }}><Play className="w-4 h-4 mr-2" /> Start</Button>
                    <Button variant="outline" className="border-zinc-700 text-orange-400 bg-black cursor-pointer hover:bg-black hover:text-orange-500" onClick={() => { setRunning(false); toast("Session paused"); }}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    <Button variant="ghost" className="border border-zinc-800 text-orange-400 cursor-pointer hover:bg-black hover:text-orange-500" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export</Button>
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
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm" onClick={() => { setRunning(true); toast.success("Session resumed"); }}><Play className="w-4 h-4 mr-2" /> Start</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-orange-400 bg-black cursor-pointer hover:bg-black hover:text-orange-500 text-sm" onClick={() => { setRunning(false); toast("Session paused"); }}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-orange-400 hover:bg-black hover:text-orange-500 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
