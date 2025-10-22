// src/pages/NotesPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  FileText,
  Zap,
  Menu,
  X,
  Plus,
  Trash2,
  Edit2,
  Search,
  Layers,
  Gauge,
  Download,
  Settings,
  CircuitBoard,
  Play,
  Pause,
  User,
  Tag,
  Sparkles,
  ListPlus,
  GraduationCap,
  FlaskConical,
  FileQuestion,
  Eye,
  PenTool,
  Wand2,

} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";

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
   Utilities (same style as calculator)
   ============================ */
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = (prefix = "") => `${prefix}${Math.random().toString(36).slice(2, 9)}`;

/* ============================
   Simulation hook (re-uses logic from calculator)
   Takes a note's diagram (groups) and preset values (Vsup, Rs)
   ============================ */
 function useNoteSim({
  running,
  compType = "capacitor",
  groups = [],
  Vsup = 12,
  seriesResistance = 10,
  manualI = 0,
  timestep = 80,
}) {
  // --- Simulation state ---
  const historyRef = useRef(
    Array.from({ length: 160 }, (_, i) => ({ t: i, P: 0, V: 0, I: 0, E: 0 }))
  );
  const [history, setHistory] = useState(historyRef.current);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // --- Equivalent component computation ---
  const computeEquivalent = useCallback(
    (groupsLocal) => {
      // fallback if user hasn't created groups yet
      if (!groupsLocal || groupsLocal.length === 0) {
        console.warn("⚠️ No groups found — using default single component");
        const val = compType === "capacitor" ? 100e-6 : 10e-3; // 100μF or 10mH
        return { totalReq: val, groupReqs: [{ Req: val, vals: [val] }] };
      }

      const toSI = (val) =>
        compType === "capacitor" ? val * 1e-6 : val * 1e-3;

      const groupReqs = groupsLocal.map((g) => {
        const vals = g.values.map((v) =>
          Number.isFinite(v) && v > 0 ? toSI(v) : NaN
        );

        if (compType === "capacitor") {
          if (g.type === "series") {
            let denom = 0;
            vals.forEach((c) => {
              if (Number.isFinite(c) && c > 0) denom += 1 / c;
            });
            const Ceq = denom > 0 ? 1 / denom : 0;
            return { Req: Ceq, vals };
          } else {
            const Ceq = vals.reduce(
              (a, b) => a + (Number.isFinite(b) ? b : 0),
              0
            );
            return { Req: Ceq, vals };
          }
        } else {
          if (g.type === "series") {
            const Leq = vals.reduce(
              (a, b) => a + (Number.isFinite(b) ? b : 0),
              0
            );
            return { Req: Leq, vals };
          } else {
            let denom = 0;
            vals.forEach((L) => {
              if (Number.isFinite(L) && L > 0) denom += 1 / L;
            });
            const Leq = denom > 0 ? 1 / denom : 0;
            return { Req: Leq, vals };
          }
        }
      });

      let totalReq = 0;
      if (compType === "capacitor") {
        totalReq = groupReqs.reduce(
          (a, b) => a + (Number.isFinite(b.Req) ? b.Req : 0),
          0
        );
      } else {
        let denom = 0;
        groupReqs.forEach((g) => {
          if (Number.isFinite(g.Req) && g.Req > 0) denom += 1 / g.Req;
        });
        totalReq = denom > 0 ? 1 / denom : 0;
      }

      return { totalReq, groupReqs };
    },
    [compType]
  );

  // --- Instantaneous physics computation ---
  const computeInstant = useCallback(
    (tSeconds, totalReq) => {
      const R = Math.max(1e-6, seriesResistance);

      if (!Number.isFinite(totalReq) || totalReq <= 0)
        return { Vt: 0, It: 0, Pt: 0, energy: 0 };

      if (manualI > 0) {
        // manual override current mode
        const It = manualI;
        const Vt = It * R;
        const Pt = Vt * It;
        const energy = Pt * tSeconds;
        return { Vt, It, Pt, energy };
      }

      if (compType === "capacitor") {
        const C = totalReq;
        const tau = clamp(R * C, 1e-6, 1e6);
        const Vt = Vsup * (1 - Math.exp(-tSeconds / tau));
        const dVdt = (Vsup / tau) * Math.exp(-tSeconds / tau);
        const It = C * dVdt;
        const Pt = Vt * It;
        const energy = 0.5 * C * Vt * Vt;
        return { Vt, It, Pt, energy };
      } else {
        const L = totalReq;
        const tauL = clamp(L / R, 1e-6, 1e6);
        const Iinf = Vsup / R;
        const It = Iinf * (1 - Math.exp(-tSeconds / tauL));
        const dIdt = (Iinf / tauL) * Math.exp(-tSeconds / tauL);
        const Vl = L * dIdt;
        const Pt = Vl * It;
        const energy = 0.5 * L * It * It;
        return { Vt: Vl, It, Pt, energy };
      }
    },
    [compType, Vsup, seriesResistance, manualI]
  );

  // --- Equivalent cached ---
  const eq = useMemo(() => computeEquivalent(groups), [groups, computeEquivalent]);

  // --- Simulation loop ---
  useEffect(() => {
    let alive = true;
    lastRef.current = performance.now();

    // reset time on restart
    if (!running) tRef.current = 0;

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

      const totalReq = eq.totalReq;
      const { Vt, It, Pt, energy } = computeInstant(tSeconds, totalReq);

      // debugging logs (optional)
      // console.log({ tSeconds, totalReq, Vt, It, Pt, energy });

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, P: Pt, V: Vt, I: It, E: energy });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeInstant, eq.totalReq]);

  return { history, eq };
}


/* ============================
   Visualizer SVG for notes
   - uses note.diagram (groups) and preset values
   - interactive: click a component to edit (invokes onEdit callback)
   ============================ */
function NoteVisualizer({
  compType,
  groups = [],
  Vsup,
  history = [],
  running,
  manualI,
  onEditComponent = () => {},
}) {
  const latest = history.length ? history[history.length - 1] : { P: 0, V: 0, I: 0, E: 0 };
  const ItSim = latest.I || 0;
  const ItUsed = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : ItSim;
  const Pt = latest.P || 0;
  const Et = latest.E || 0;

  const absI = Math.abs(ItUsed);
  const dotCount = clamp(Math.round(2 + absI * 8), 2, 18);
  const speed = clamp(1.6 / (absI + 0.01), 0.28, 4.5);

  const groupCount = Math.max(1, groups.length);
  const spacing = Math.max(110, Math.min(240, Math.floor(520 / Math.max(1, Math.min(groupCount, 6)))));
  const startX = 160;
  const svgWidth = Math.max(900, startX + spacing * groupCount + 160);
  const busStart = 100;
  const busEnd = svgWidth - 80;

  const formatGroupReq = (grp) => {
    if (!grp || !grp.values) return "--";
    if (compType === "capacitor") {
      if (grp.type === "series") {
        let denom = 0;
        grp.values.forEach((v) => {
          if (Number.isFinite(v) && v > 0) denom += 1 / (v * 1e-6);
        });
        const CeqF = denom > 0 ? 1 / denom : 0;
        return `${round(CeqF * 1e6, 4)} μF`;
      } else {
        const CeqF = grp.values.reduce((a, b) => a + (Number.isFinite(b) ? b * 1e-6 : 0), 0);
        return `${round(CeqF * 1e6, 4)} μF`;
      }
    } else {
      if (grp.type === "series") {
        const Leq = grp.values.reduce((a, b) => a + (Number.isFinite(b) ? b * 1e-3 : 0), 0);
        return `${round(Leq * 1e3, 4)} mH`;
      } else {
        let denom = 0;
        grp.values.forEach((v) => {
          if (Number.isFinite(v) && v > 0) denom += 1 / (v * 1e-3);
        });
        const Leq = denom > 0 ? 1 / denom : 0;
        return `${round(Leq * 1e3, 4)} mH`;
      }
    }
  };

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start flex-wrap justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">
              {compType === "capacitor" ? "Capacitance" : "Inductance"} Preview
            </div>
            <div className="text-xs text-zinc-400">Diagram generated from note values • interactive</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I: <span className="text-[#00ffbf] ml-1">{round(ItUsed, 9)} A</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">P: <span className="text-[#ff9a4a] ml-1">{round(Pt, 6)} W</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
<svg viewBox={`0 0 ${svgWidth} 340`} className="w-full h-72" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="busGlow" x1="0%" x2="100%">
      <stop offset="0%" stopColor="#00eaff" />
      <stop offset="50%" stopColor="#00ffbf" />
      <stop offset="100%" stopColor="#ffd24a" />
    </linearGradient>

    <radialGradient id="orbGradient">
      <stop offset="0%" stopColor="#ffffff" />
      <stop offset="30%" stopColor="#00ffbf" />
      <stop offset="100%" stopColor="transparent" />
    </radialGradient>

    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <filter id="shadow">
      <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#00ffbf" floodOpacity="0.6" />
    </filter>
  </defs>

  {/* Background pulse aura */}
  <radialGradient id="bgAura" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stopColor="#0f172a" />
    <stop offset="90%" stopColor="#000000" />
  </radialGradient>
  <rect width="100%" height="100%" fill="url(#bgAura)" />

  {/* Power source block */}
  <g transform={`translate(${busStart - 60},160)`}>
    <rect x="-22" y="-36" width="44" height="72" rx="8"
      fill="#070707" stroke="url(#busGlow)" strokeWidth="1.2" filter="url(#softGlow)" />
    <text x="-38" y="-48" fontSize="12" fill="#ffd24a" filter="url(#shadow)">
      {Vsup} V
    </text>
  </g>

  {/* Main bus line */}
  <path d={`M ${busStart} 160 H ${busEnd}`}
    stroke="url(#busGlow)" strokeWidth="5" strokeLinecap="round" filter="url(#softGlow)" />

  {groups.map((g, i) => {
    const x = startX + i * spacing;
    const label = g.type?.toUpperCase() ?? "GROUP";
    const groupReqStr = formatGroupReq(g);

    return (
      <g key={`grp-${i}`}>
        {/* Vertical connection */}
        <path d={`M ${x} 160 V 60`}
          stroke="url(#busGlow)" strokeWidth="3" strokeLinecap="round" opacity="0.7"
          filter="url(#softGlow)" />

        {/* Components */}
        {g.values.map((v, idx) => {
          const y = 80 + idx * 52;
          const subLabel = compType === "capacitor" ? `${v} μF` : `${v} mH`;
          const color = compType === "capacitor" ? "#00ffbf" : "#ff4fa3";
          return (
            <g key={`cmp-${i}-${idx}`} transform={`translate(${x},${y})`}
              className="component-block cursor-pointer hover:scale-[1.08] transition-transform duration-200"
              onClick={() => onEditComponent(i, idx)}>
              <rect x="-28" y="-10" width="56" height="20" rx="6"
                fill="#0a0a0a" stroke={color} strokeWidth="1.3"
                filter="url(#softGlow)" />
              <text x="-22" y="-16" fontSize="10" fill="#9ee6ff">{subLabel}</text>
            </g>
          );
        })}

        {/* Group label */}
        <g transform={`translate(${x}, 40)`}>
          <rect x="-52" y="-22" width="104" height="38" rx="8"
            fill="#060606" stroke="url(#busGlow)" strokeWidth="1.2" filter="url(#softGlow)" />
          <text x="-42" y="-6" fontSize="11" fill="#ff9a4a">{label}</text>
          <text x="-42" y="12" fontSize="11" fill="#ffffff">{groupReqStr}</text>
        </g>

        {/* Energy orbs */}
        {Array.from({ length: dotCount }).map((_, di) => {
          const pathStr = `M ${x} 60 V 160 H ${x + 24}`;
          const delay = (di / dotCount) * speed;
          const style = {
            offsetPath: `path('${pathStr}')`,
            animationName: compType === "capacitor" ? "orbFlowCap" : "orbFlowInd",
            animationDuration: `${speed}s`,
            animationTimingFunction: "linear",
            animationDelay: `${-delay}s`,
            animationIterationCount: "infinite",
            animationPlayState: running ? "running" : "paused",
          };
          return (
            <circle key={`orb-${i}-${di}`} r="5"
              fill="url(#orbGradient)" style={style}
              filter="url(#softGlow)" />
          );
        })}
      </g>
    );
  })}

  {/* Readout panel */}
  <g transform={`translate(${svgWidth - 140},40)`}>
    <rect x="-80" y="-34" width="160" height="140" rx="10"
      fill="#0a0a0a" stroke="url(#busGlow)" strokeWidth="1.2"
      filter="url(#softGlow)" />
    <text x="-70" y="-12" fontSize="12" fill="#00ffbf">Readouts</text>
    <text x="-70" y="8" fontSize="12" fill="#fff">V(t): <tspan fill="#ffd24a">{round(latest.V,6)} V</tspan></text>
    <text x="-70" y="30" fontSize="12" fill="#fff">I(t): <tspan fill="#00ffbf">{round(latest.I,9)} A</tspan></text>
    <text x="-70" y="52" fontSize="12" fill="#fff">P(t): <tspan fill="#ff9a4a">{round(latest.P,8)} W</tspan></text>
    <text x="-70" y="74" fontSize="12" fill="#fff">E: <tspan fill="#9ee6ff">{round(latest.E,8)}</tspan></text>
  </g>

  <style>{`
    @keyframes orbFlowCap {
      0% { offset-distance: 0%; opacity: 1; transform: scale(1.1); }
      50% { opacity: 0.9; transform: scale(0.95); }
      100% { offset-distance: 100%; opacity: 0; transform: scale(1.2); }
    }
    @keyframes orbFlowInd {
      0% { offset-distance: 0%; opacity: 1; transform: scale(1.1); }
      50% { opacity: 0.8; transform: scale(1); }
      100% { offset-distance: 100%; opacity: 0; transform: scale(1.3); }
    }
  `}</style>
</svg>

      </div>
    </div>
  );
}

/* ============================
   Oscilloscope used in NotesPage (small variant)
   ============================ */
function SmallOscilloscope({ history = [], manualI = "", running = true, height = 160 }) {
  const data = history.slice(-240).map((d, idx) => {
    const I_sim = d.I || 0;
    const I_manual = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : null;
    const I_used = I_manual !== null ? I_manual : I_sim;
    const V = d.V || 0;
    const P_used = V * I_used;
    return {
      t: idx,
      V: round(V, 6),
      I_used: round(I_used, 9),
      P: round(P_used, 8),
    };
  });

  return (
    <div className="rounded-xl p-2 bg-gradient-to-b from-black/30 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff",borderRadius:"10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="V" />
            <Line type="monotone" dataKey="I_used" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="I" />
            <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="P" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   NotesPage - main component
   ============================ */
export default function NotesPage() {
  // header & UI state
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [selectedUserView, setSelectedUserView] = useState("student"); // or "instructor", "research"
  const [compType, setCompType] = useState("capacitor");
  const [running, setRunning] = useState(true);

  // notes store (in-memory with localStorage persistence)
  const initial = () => {
    try {
      const raw = localStorage.getItem("notes_v1");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    // Example starter notes
    return [
      {
        id: uid("n_"),
        title: "Series & Parallel Capacitors — Key idea",
        body: "Series: 1/Ceq = Σ 1/Ci. Parallel: Ceq = Σ Ci. Time constant τ = R*C for an RC step.",
        tags: ["capacitor", "theory", "quick"],
        compType: "capacitor",
        preset: { Vsup: 12, Rs: 10, manualI: "" },
        diagram: {
          groups: [
            { type: "series", values: [10, 10] },
            { type: "parallel", values: [20] },
          ],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: uid("n_"),
        title: "Inductor step response (bite-sized)",
        body: "Inductor current: I(t) = (V/R) * (1 - exp(-tL/R)). Energy stored 0.5 L I^2.",
        tags: ["inductor", "theory", "bite-sized"],
        compType: "inductor",
        preset: { Vsup: 5, Rs: 8, manualI: "" },
        diagram: { groups: [{ type: "series", values: [50] }] },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
  };

  const [notes, setNotes] = useState(initial);

  useEffect(() => {
    localStorage.setItem("notes_v1", JSON.stringify(notes));
  }, [notes]);

  // selection & editor
  const [activeNoteId, setActiveNoteId] = useState(notes[0]?.id ?? null);
  const activeNote = useMemo(() => notes.find((n) => n.id === activeNoteId) ?? null, [notes, activeNoteId]);

  // simulation for active note (driven by note values)
  const simInputs = {
    running,
    compType: activeNote?.compType ?? compType,
    groups: activeNote?.diagram?.groups ?? [],
    Vsup: activeNote?.preset?.Vsup ?? 12,
    seriesResistance: activeNote?.preset?.Rs ?? 10,
    manualI:activeNote?.preset?. manualI??0,
    timestep: 80,
  };
  const { history, eq } = useNoteSim(simInputs);

  // mutators
  const addNote = () => {
    const n = {
      id: uid("n_"),
      title: "New Short Note",
      body: "Write a bite-sized theory here...",
      tags: ["quick"],
      compType,
      preset: { Vsup: 12, Rs: 10, manualI: "" },
      diagram: { groups: [{ type: "series", values: [10] }] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNotes((s) => [n, ...s]);
    setActiveNoteId(n.id);
    toast.success("Created new note");
  };

  const deleteNote = (id) => {
    setNotes((s) => s.filter((x) => x.id !== id));
    if (activeNoteId === id) setActiveNoteId(notes[0]?.id ?? null);
    toast("Deleted note");
  };

  const updateNote = (id, patch) => {
    setNotes((s) => s.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
  };

  // editing inside visualizer: edit a component value by indices
  const onEditComponent = (gi, ri) => {
    if (!activeNote) return;
    const val = prompt("Enter new value for component (number, e.g., 10)");
    if (val === null) return;
    const vnum = Number(val);
    if (!Number.isFinite(vnum) || vnum <= 0) return toast.error("Invalid value");
    const newGroups = activeNote.diagram.groups.map((g, i) => (i === gi ? { ...g, values: g.values.map((vv, idx) => (idx === ri ? vnum : vv)) } : g));
    updateNote(activeNote.id, { diagram: { groups: newGroups } });
    toast.success("Component updated");
  };

  const addGroup = () => {
    if (!activeNote) return;
    const newGroups = [...activeNote.diagram.groups, { type: "series", values: [10] }];
    updateNote(activeNote.id, { diagram: { groups: newGroups } });
  };

  const removeGroup = (gi) => {
    if (!activeNote) return;
    const newGroups = activeNote.diagram.groups.filter((_, i) => i !== gi);
    updateNote(activeNote.id, { diagram: { groups: newGroups } });
  };

  const addComponentToGroup = (gi) => {
    if (!activeNote) return;
    const newGroups = activeNote.diagram.groups.map((g, i) => (i === gi ? { ...g, values: [...g.values, 10] } : g));
    updateNote(activeNote.id, { diagram: { groups: newGroups } });
  };

  const removeComponentFromGroup = (gi, ri) => {
    if (!activeNote) return;
    const newGroups = activeNote.diagram.groups.map((g, i) => (i === gi ? { ...g, values: g.values.filter((_, idx) => idx !== ri) } : g));
    updateNote(activeNote.id, { diagram: { groups: newGroups } });
  };

  // quick CSV export for active note simulation history
  const exportNoteCSV = () => {
    if (!activeNote) return toast.error("Select a note");
    const rows = [
      ["t", "V_sim", "I_sim", "P_sim", "E_sim"],
      ...history.map((d) => [d.t, round(d.V, 9), round(d.I, 9), round(d.P, 9), round(d.E, 9)]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `note-${activeNote.id}-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  // Filtering & search
  const visibleNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (filterTag && !n.tags.includes(filterTag)) return false;
      if (!q) return true;
      return (n.title + " " + n.body + " " + (n.tags || []).join(" ")).toLowerCase().includes(q);
    });
  }, [notes, search, filterTag]);

  // UI: tag list for quick filter
  const allTags = useMemo(() => {
    const s = new Set();
    notes.forEach((n) => (n.tags || []).forEach((t) => s.add(t)));
    return Array.from(s);
  }, [notes]);

  // small responsive behavior
  useEffect(() => {
    if (!activeNoteId && notes.length) setActiveNoteId(notes[0].id);
  }, [notes, activeNoteId]);

  // header actions
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetActivePreset = () => {
    if (!activeNote) return;
    updateNote(activeNote.id, { preset: { Vsup: 12, Rs: 10, manualI: "" } });
    toast("Reset preset for this note");
  };

  // editing fields handlers
  const onActiveFieldChange = (patch) => {
    if (!activeNote) return;
    updateNote(activeNote.id, patch);
  };

  /* ============================
     Render
     ============================ */
  return (
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
<header className="fixed top-0 w-full z-50 backdrop-blur-xl bg-gradient-to-b from-black/80 to-zinc-950/80 border-b border-zinc-800 shadow-lg">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex items-center justify-between h-16">
      {/* Logo + Title */}
      <motion.div
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-3 cursor-pointer group"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-orange-500 to-yellow-400 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
          <Zap className="w-6 h-6 text-black" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">SparkLab</h1>
          <p className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">
            Notes • Diagrams • Tutorials
          </p>
        </div>
      </motion.div>

      {/* Desktop Actions */}
      <div className="hidden md:flex items-center gap-3">
        <Select value={selectedUserView} onValueChange={(v) => setSelectedUserView(v)}>
          <SelectTrigger className="w-48 cursor-pointer bg-zinc-900/70 border border-zinc-800 text-zinc-200 text-sm rounded-md shadow-md hover:border-orange-500 transition-colors">
            <SelectValue placeholder="Select Mode" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-950 border border-zinc-800 rounded-md shadow-lg">
            <SelectItem value="student"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">
              <GraduationCap className="inline w-4 h-4 mr-2 text-orange-400" /> Student View
            </SelectItem>
            <SelectItem value="instructor"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">
              <User className="inline w-4 h-4 mr-2 text-orange-400" /> Instructor View
            </SelectItem>
            <SelectItem value="research"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">
              <FlaskConical className="inline w-4 h-4 mr-2 text-orange-400" /> Researcher View
            </SelectItem>
          </SelectContent>
        </Select>

        <Button
          className="bg-gradient-to-tr from-orange-500 to-yellow-400 text-black cursor-pointer font-medium px-3 py-2 rounded-lg hover:opacity-90 hover:scale-[1.03] transition-all duration-200"
          onClick={addNote}
        >
          <Plus className="w-4 h-4 mr-2" /> New
        </Button>

        <Button
          variant="ghost"
          className="border border-zinc-800 cursor-pointer text-zinc-300 p-2 rounded-lg hover:border-orange-500 hover:text-orange-400 transition-all duration-200"
          onClick={() => setMobileOpen((s) => !s)}
        >
          <Settings className="w-5 h-5" />
        </Button>
      </div>

      {/* Mobile Toggle */}
      <div className="md:hidden">
        <Button
          variant="ghost"
          className="border text-orange-500 cursor-pointer hover:bg-black hover:text-orange-500  border-zinc-800 p-2 rounded-lg hover:border-orange-500 transition-all duration-200"
          onClick={() => setMobileOpen((s) => !s)}
        >
          {mobileOpen ? (
            <X className="w-5 h-5 text-orange-400" />
          ) : (
            <Menu className="w-5 h-5 " />
          )}
        </Button>
      </div>
    </div>

    {/* Mobile Dropdown Menu */}
    <motion.div
      initial={false}
      animate={mobileOpen ? "open" : "closed"}
      variants={{
        open: { opacity: 1, height: "auto", transition: { duration: 0.35 } },
        closed: { opacity: 0, height: 0, transition: { duration: 0.25 } },
      }}
      className="md:hidden overflow-hidden"
    >
      <div className="mt-3 space-y-3 pb-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 shadow-lg">
          <Label className="text-xs text-zinc-500 uppercase tracking-wide">
            Mode
          </Label>
          <Select value={selectedUserView} onValueChange={(v) => setSelectedUserView(v)}>
            <SelectTrigger className="w-full cursor-pointer bg-zinc-950/80 border border-zinc-800 text-zinc-300 text-sm mt-1">
              <SelectValue placeholder="Viewer" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-950 border border-zinc-800">
              <SelectItem value="student"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Student</SelectItem>
              <SelectItem value="instructor"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Instructor</SelectItem>
              <SelectItem value="research"  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Researcher</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            className="flex-1 bg-gradient-to-tr from-orange-500 to-yellow-400 text-black cursor-pointer font-semibold hover:scale-[1.02] transition-all"
            onClick={addNote}
          >
            <Plus className="w-4 h-4 mr-1" /> New Note
          </Button>
          <Button
            variant="outline"
            className="flex-1 border border-orange-500 text-orange-400 hover:bg-orange-500/10 cursor-pointer hover:text-orange-500 transition-all"
            onClick={() => setSelectedUserView("student")}
          >
            <User className="w-4 h-4 mr-1" /> View
          </Button>
        </div>
      </div>
    </motion.div>
  </div>
</header>


      <div className="h-16"></div>

      {/* Main - two columns */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: notes list */}
   <div
  className="lg:col-span-4 space-y-4"
>
  <Card className="bg-gradient-to-b from-black/80 to-zinc-950/80 backdrop-blur-xl border border-zinc-800/70 rounded-2xl overflow-hidden shadow-lg shadow-orange-500/10">
    <CardHeader>
      <CardTitle className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md shadow-orange-400/30">
            <BookOpen className="w-5 h-5 text-black" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a] tracking-wide">
              Short Notes
            </div>
            <div className="text-xs text-zinc-400">Bite-sized theory & diagrams</div>
          </div>
        </div>

        <Badge
          className="bg-gradient-to-r from-[#ff7a2d]/30 to-[#ffd24a]/30 border border-orange-500/40 text-orange-300
                     backdrop-blur-md rounded-full px-4 py-1 shadow-inner"
        >
          <Zap className="w-3 h-3 mr-1 text-orange-400" /> Active
        </Badge>
      </CardTitle>
    </CardHeader>

    <CardContent className="space-y-4">
      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-3 py-2 w-full focus-within:border-orange-400/40 transition-colors">
          <Search className="w-4 h-4 text-zinc-400" />
          <Input
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-0 focus:ring-0 text-orange-100 text-sm placeholder:text-zinc-500"
          />
        </div>
      </div>

      {/* Tags Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        <button
          onClick={() => setFilterTag("")}
          className={`px-4 py-1.5 cursor-pointer rounded-full text-xs transition-all ${
            filterTag === ""
              ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-medium shadow-md shadow-orange-500/30"
              : "bg-zinc-900/40 text-zinc-300 border border-zinc-800 hover:border-orange-400/40"
          }`}
        >
          All
        </button>

        {allTags.map((t) => (
          <button
            key={t}
            onClick={() => setFilterTag(t)}
            className={`px-4 py-1.5 cursor-pointer rounded-full text-xs transition-all backdrop-blur-md ${
              filterTag === t
                ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-medium shadow-md shadow-orange-500/30"
                : "bg-black/50 border border-zinc-800/60 text-zinc-300 hover:text-orange-400 hover:border-orange-400/40"
            }`}
          >
            #{t}
          </button>
        ))}
      </div>

      {/* Notes List */}
      <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        {visibleNotes.map((n, index) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => setActiveNoteId(n.id)}
            className={`group p-4 rounded-xl cursor-pointer transition-all ${
              n.id === activeNoteId
                ? "bg-gradient-to-tr from-[#1f1200] to-[#2b1600] border border-orange-500/50 shadow-md shadow-orange-400/20"
                : "bg-zinc-900/40 border border-zinc-800 hover:border-orange-400/40"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white truncate">
                    {n.title}
                  </div>
                  <div className="text-xs text-zinc-500 ml-2">
                    {new Date(n.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-xs text-zinc-400 mt-1 line-clamp-3">
                  {n.body}
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {(n.tags || []).map((t) => (
                    <Badge
                      key={t}
                      className="bg-gradient-to-r from-zinc-900/70 to-black/60 border border-zinc-800/80 text-zinc-300 text-[11px] backdrop-blur-md rounded-full px-2 py-0.5 hover:border-orange-400/30"
                    >
                      <Tag className="w-3 h-3 mr-1 text-orange-400/80" /> {t}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 items-center ml-2">
                <Button
                  variant="ghost"
                  className="p-1 border cursor-pointer border-zinc-800 text-orange-400 hover:bg-black hover:text-orange-500 hover:border-orange-500 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveNoteId(n.id);
                    toast("Opened");
                  }}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  className="p-1 border cursor-pointer border-zinc-800 text-red-400 hover:bg-red-600/20 hover:text-red-500 hover:border-red-500 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNote(n.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        ))}

        {visibleNotes.length === 0 && (
          <div className="text-zinc-500 text-sm text-center py-4">
            <FileQuestion className="w-5 h-5 inline-block mr-1 text-zinc-500" /> 
            No notes yet — create one!
          </div>
        )}
      </div>
    </CardContent>
  </Card>
</div>


          {/* Right: editor + visualizer */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
     <Card className="bg-gradient-to-b from-black/80 to-zinc-950/80 border border-zinc-800/70 backdrop-blur-xl rounded-2xl overflow-hidden shadow-lg shadow-orange-500/10">
  <CardHeader className="pb-4 border-b border-zinc-800/50">
    <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md shadow-orange-400/30">
          <FileText className="w-5 h-5 text-black" />
        </div>
        <div>
          <div className="text-lg font-semibold text-[#ffd24a] leading-tight">
            {activeNote?.title ?? "Select a Note"}
          </div>
          <div className="text-xs text-zinc-400">
            Edit note text, tags, and diagram details
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge className="bg-black/60 border border-orange-500/50 text-orange-300 backdrop-blur-md px-3 py-1 rounded-full shadow-inner">
          <Eye className="w-3.5 h-3.5 mr-1 text-orange-400" />
          {selectedUserView}
        </Badge>
        <Button
          className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-medium cursor-pointer hover:shadow-lg hover:shadow-orange-400/30 transition-all"
          onClick={() => exportNoteCSV()}
        >
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>
    </CardTitle>
  </CardHeader>

  <CardContent className="space-y-6 pt-4">
    {/* Fields Section */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left - Text Fields */}
      <div className="lg:col-span-2 space-y-3">
        <Input
          value={activeNote?.title ?? ""}
          onChange={(e) => onActiveFieldChange({ title: e.target.value })}
          placeholder="Note title"
          className="bg-zinc-900/60 border border-zinc-800 text-white focus:ring-0 focus:border-orange-500/50 rounded-md"
        />

        <Textarea
          value={activeNote?.body ?? ""}
          onChange={(e) => onActiveFieldChange({ body: e.target.value })}
          placeholder="Write theory or notes here..."
          className="bg-zinc-900/60 border border-zinc-800 text-white h-28 focus:ring-0 focus:border-orange-500/50 rounded-md"
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={(activeNote?.tags || []).join(", ")}
            onChange={(e) => {
              const tags = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              onActiveFieldChange({ tags });
            }}
            placeholder="Tags (comma separated)"
            className="bg-zinc-900/60 border border-zinc-800 text-white flex-1"
          />

          <Select
            value={activeNote?.compType ?? compType}
            onValueChange={(v) => onActiveFieldChange({ compType: v })}
          >
            <SelectTrigger className="w-full sm:w-44 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm cursor-pointer">
              <SelectValue placeholder="Component" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
              <SelectItem
                value="capacitor"
                className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 data-[highlighted]:bg-orange-500/30 rounded-md cursor-pointer"
              >
                Capacitor (μF)
              </SelectItem>
              <SelectItem
                value="inductor"
                className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 data-[highlighted]:bg-orange-500/30 rounded-md cursor-pointer"
              >
                Inductor (mH)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Right - Presets & Controls */}
      <div className="space-y-3">
        <div className="text-xs text-zinc-400 uppercase tracking-wide">
          Preset Values
        </div>
        <Input
          value={activeNote?.preset?.Vsup ?? ""}
          onChange={(e) =>
            onActiveFieldChange({
              preset: { ...(activeNote?.preset ?? {}), Vsup: e.target.value },
            })
          }
          type="number"
          placeholder="Vsup (V)"
          className="bg-zinc-900/60 border border-zinc-800 text-white"
        />
        <Input
          value={activeNote?.preset?.Rs ?? ""}
          onChange={(e) =>
            onActiveFieldChange({
              preset: { ...(activeNote?.preset ?? {}), Rs: e.target.value },
            })
          }
          type="number"
          placeholder="Series R (Ω)"
          className="bg-zinc-900/60 border border-zinc-800 text-white"
        />
        <Input
          value={activeNote?.preset?.manualI ?? ""}
          onChange={(e) =>
            onActiveFieldChange({
              preset: {
                ...(activeNote?.preset ?? {}),
                manualI: e.target.value,
              },
            })
          }
          placeholder="Manual I (A)"
          className="bg-zinc-900/60 border border-zinc-800 text-white"
        />

        {/* Simulation Buttons */}
        <div className="flex gap-2 mt-3">
          <Button
            className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-medium hover:shadow-md hover:shadow-orange-500/30 cursor-pointer"
            onClick={() => {
              setRunning(true);
              toast.success("Simulation running");
            }}
          >
            <Play className="w-4 h-4 mr-2" />
            Run
          </Button>
          <Button
            variant="ghost"
            className="flex-1 border border-zinc-800 text-orange-400 hover:bg-black hover:text-orange-500 cursor-pointer"
            onClick={() => {
              setRunning(false);
              toast("Paused");
            }}
          >
            <Pause className="w-4 h-4 mr-2" />
            Pause
          </Button>
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            onClick={() => resetActivePreset()}
            className="flex-1 border border-zinc-700 hover:border-orange-400/50 cursor-pointer text-zinc-300 hover:text-orange-400"
          >
            Reset
          </Button>
          <Button
            variant="outline"
            onClick={() => exportNoteCSV()}
            className="flex-1 border border-zinc-700 text-orange-400 bg-black hover:text-orange-500 hover:border-orange-400 cursor-pointer"
          >
            Export CSV
          </Button>
        </div>
      </div>
    </div>

    {/* Diagram Section */}
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-300 font-medium flex items-center gap-2">
          <PenTool className="w-4 h-4 text-orange-400" /> Diagram Builder
        </div>
        <Button
          variant="ghost"
          onClick={() => addGroup()}
          className="border border-orange-500/40 hover:text-orange-500 text-orange-300 hover:bg-orange-500/20 cursor-pointer px-3 py-1.5 rounded-md"
        >
          <Plus className="w-4 h-4 mr-1" /> Add Group
        </Button>
      </div>

      <div className="space-y-3">
        {(activeNote?.diagram?.groups || []).map((g, gi) => (
          <div
            key={gi}
            className="border border-zinc-800/70 rounded-xl p-3 bg-zinc-900/40 backdrop-blur-md shadow-sm shadow-orange-500/10"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-black/70 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">
                  {g.type.toUpperCase()}
                </Badge>
                <span className="text-xs text-zinc-400">
                  {activeNote?.compType === "capacitor"
                    ? "μF per component"
                    : "mH per component"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={g.type}
                  onValueChange={(v) => {
                    const ng = activeNote.diagram.groups.map((gg, i) =>
                      i === gi ? { ...gg, type: v } : gg
                    );
                    onActiveFieldChange({ diagram: { groups: ng } });
                  }}
                >
                  <SelectTrigger className="w-32 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm cursor-pointer">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem
                      value="series"
                      className="text-white hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 data-[highlighted]:text-orange-200 rounded-md"
                    >
                      Series
                    </SelectItem>
                    <SelectItem
                      value="parallel"
                      className="text-white hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 data-[highlighted]:text-orange-200 rounded-md"
                    >
                      Parallel
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  className="border border-zinc-800 text-red-400 hover:bg-red-600/20 hover:text-red-500 cursor-pointer"
                  onClick={() => removeGroup(gi)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {g.values.map((val, ri) => (
                <div key={ri} className="flex items-center gap-2">
                  <Input
                    value={val}
                    onChange={(e) => {
                      const vv = Number(e.target.value);
                      const ng = activeNote.diagram.groups.map((gg, i) =>
                        i === gi
                          ? {
                              ...gg,
                              values: gg.values.map((v, idx) =>
                                idx === ri
                                  ? Number.isFinite(vv)
                                    ? vv
                                    : v
                                  : v
                              ),
                            }
                          : gg
                      );
                      onActiveFieldChange({ diagram: { groups: ng } });
                    }}
                    type="number"
                    className="bg-zinc-900/60 border border-zinc-800 text-white"
                  />
                  <Button
                    variant="ghost"
                    onClick={() => removeComponentFromGroup(gi, ri)}
                    className="p-1 border border-zinc-800 text-red-400 hover:bg-red-600/20 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                onClick={() => addComponentToGroup(gi)}
                className="flex-1 border border-zinc-800 text-orange-400 hover:bg-black hover:text-orange-500 cursor-pointer bg-black"
              >
                <ListPlus className="w-4 h-4 mr-2" /> Add
              </Button>
              <Button
                variant="ghost"
                className="flex-1 border border-zinc-800 text-white bg-gradient-to-tr from-[#ff7a2d]/80 to-[#ffd24a]/80 hover:from-[#ff7a2d] hover:to-[#ffd24a] transition-all cursor-pointer"
                onClick={() => {
                  const ng = activeNote.diagram.groups.map((gg, i) =>
                    i === gi
                      ? {
                          ...gg,
                          values: gg.values.map((v) =>
                            Math.max(1, Math.round(v))
                          ),
                        }
                      : gg
                  );
                  onActiveFieldChange({ diagram: { groups: ng } });
                }}
              >
                <Wand2 className="w-4 h-4 mr-2" /> Normalize
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  </CardContent>
</Card>

            </motion.div>

            {/* Visualizer + right-side summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center"><CircuitBoard className="w-5 h-5" /></div>
                        <div>
                          <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                          <div className="text-xs text-zinc-400">Live flow • meters • oscilloscope</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Preset: <span className="text-[#ffd24a] ml-1">{activeNote?.preset?.Vsup ?? 12} V</span></Badge>
                        <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">R: <span className="text-[#ffd24a] ml-1">{activeNote?.preset?.Rs ?? 10} Ω</span></Badge>
                      </div>
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <NoteVisualizer
                      compType={activeNote?.compType ?? "capacitor"}
                      groups={activeNote?.diagram?.groups ?? []}
                      Vsup={Number(activeNote?.preset?.Vsup ?? 12)}
                      history={history}
                      running={running}
                      manualI={activeNote?.preset?.manualI ?? ""}
                      onEditComponent={onEditComponent}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-1 space-y-4">
                <SmallOscilloscope history={history} manualI={activeNote?.preset?.manualI ?? ""} running={running} height={180} />
                <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-[#ffd24a] flex items-center gap-2"><Gauge className="w-5 h-5" /> Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
                        <div className="text-xs text-zinc-400">Equivalent</div>
                        <div className="text-lg font-semibold text-[#ff9a4a] truncate">{activeNote?.compType === "capacitor" ? (eq && Number.isFinite(eq.totalReq) ? `${round(eq.totalReq * 1e6, 6)} μF` : "--") : (eq && Number.isFinite(eq.totalReq) ? `${round(eq.totalReq * 1e3, 6)} mH` : "--")}</div>
                        <div className="text-xs text-zinc-400 mt-1">Ceq / Leq</div>
                      </div>

                      <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
                        <div className="text-xs text-zinc-400">Last Power (sim)</div>
                        <div className="text-lg font-semibold text-[#ff9a4a] truncate">{round(history.length ? history[history.length - 1].P : 0, 8)} W</div>
                      </div>

                      <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800">
                        <div className="text-xs text-zinc-400">Stored Energy</div>
                        <div className="text-lg font-semibold text-[#9ee6ff] truncate">{round(history.length ? history[history.length - 1].E : 0, 8)} J</div>
                      </div>

                    

                    </div>

                    <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                      <span className="text-orange-400"><Sparkles/></span>
                      <span>
                        Tip: Click a component in the visualizer to edit its value. Values update the oscilloscope in real-time.
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* mobile sticky controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-orange-400 hover:bg-black hover:text-orange-500
 cursor-pointer bg-black text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-orange-400 cursor-pointer hover:bg-black hover:text-orange-500
 p-2" onClick={() => exportNoteCSV()}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
