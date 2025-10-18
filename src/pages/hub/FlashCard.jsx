// src/pages/FlashCardPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Book,
  Zap,
  Brain,
  Check,
  X,
  Plus,
  Layers,
  Play,
  Pause,
  Settings,
  Menu,
  Trash2,
  CircleDashed,
  Zap as Lightning,
  Activity,
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
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================
   Memory Simulation Hook
   - Models per-card memory strength (0..1)
   - Exponential decay over time, bump on correct, drop on wrong
   - Provides history for plotting + aggregated stats
   ============================ */
function useMemorySim({ running = true, timestep = 800, decks = [], reviewInterval = 60000 }) {
  // decks: [{ id, title, cards: [{ id, front, back, strength (0..1) }] }]
  const [stateDecks, setStateDecks] = useState(() =>
    decks.map((d, i) => ({
      ...d,
      cards: d.cards.map((c, j) => ({ ...c, strength: c.strength ?? 0.25, lastReviewed: Date.now() })),
    }))
  );

  // history for plot: array of { t, avgStrength, studiedCount }
  const historyRef = useRef([]);
  const lastRef = useRef(performance.now());
  const tRef = useRef(0);
  const rafRef = useRef(null);

  // update card strength setter
  const updateCardStrength = (deckId, cardId, newPropsFn) =>
    setStateDecks((prev) =>
      prev.map((d) =>
        d.id === deckId
          ? { ...d, cards: d.cards.map((c) => (c.id === cardId ? { ...c, ...newPropsFn(c) } : c)) }
          : d
      )
    );

  // batch update entire deck (useful for adding card)
  const setDecks = (fn) => setStateDecks(fn);

  // compute aggregated metrics
  const metrics = useMemo(() => {
    const allCards = stateDecks.flatMap((d) => d.cards.map((c) => ({ ...c, deckId: d.id })));
    const avgStrength = allCards.length ? allCards.reduce((a, b) => a + (b.strength || 0), 0) / allCards.length : 0;
    const total = allCards.length;
    const needingReview = allCards.filter((c) => {
      // due if lastReviewed older than reviewInterval scaled by strength (we assume stronger -> longer interval)
      const interval = reviewInterval * (1 + (1 - (c.strength || 0)) * 4); // stronger -> bigger interval
      return Date.now() - (c.lastReviewed || 0) > interval;
    }).length;
    return { avgStrength, total, needingReview };
  }, [stateDecks, reviewInterval]);

  // history update loop
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

      // decay strengths a little for all cards depending on dt (exponential decay)
      setStateDecks((prev) =>
        prev.map((d) => ({
          ...d,
          cards: d.cards.map((c) => {
            const decayRate = 0.0006; // tuned: small per-ms decay
            const elapsed = dt;
            const decayed = c.strength * Math.exp(-decayRate * elapsed);
            return { ...c, strength: clamp(decayed, 0, 1) };
          }),
        }))
      );

      // append aggregated history snapshot
      const allCards = stateDecks.flatMap((d) => d.cards);
      const avgStrength = allCards.length ? allCards.reduce((a, b) => a + (b.strength || 0), 0) / allCards.length : 0;
      const studiedCount = allCards.length;
      historyRef.current.push({ t: historyRef.current.length ? historyRef.current.length : 0, avg: avgStrength, n: studiedCount, ts: now });
      if (historyRef.current.length > 720) historyRef.current.shift();
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // intentionally omitting stateDecks to avoid creating many callbacks; metric snapshots use last known state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, timestep]);

  // expose history (live copy)
  const getHistory = () => historyRef.current.slice();

  // actions: answerCard(deckId, cardId, correct)
  const answerCard = (deckId, cardId, correct) => {
    // correct -> bump strength multiplicatively; wrong -> reduce strength
    setStateDecks((prev) =>
      prev.map((d) =>
        d.id === deckId
          ? {
              ...d,
              cards: d.cards.map((c) => {
                if (c.id !== cardId) return c;
                const now = Date.now();
                let s = c.strength ?? 0.25;
                if (correct) {
                  // spaced repetition-style boost: bigger boost when weak (so learning progresses)
                  const boost = 0.18 + (1 - s) * 0.42; // tuned
                  s = clamp(s + boost * (1 - s), 0, 1);
                } else {
                  // wrong: drop and reset a bit
                  const drop = 0.28 + s * 0.4;
                  s = clamp(s * (1 - drop), 0, 1);
                }
                return { ...c, strength: s, lastReviewed: now };
              }),
            }
          : d
      )
    );
  };

  // add card to deck
  const addCardToDeck = (deckId, card) => {
    setStateDecks((prev) => prev.map((d) => (d.id === deckId ? { ...d, cards: [{ ...card, id: `${Date.now()}`, strength: 0.18, lastReviewed: Date.now() }, ...d.cards] } : d)));
  };

  // remove card
  const removeCard = (deckId, cardId) =>
    setStateDecks((prev) => prev.map((d) => (d.id === deckId ? { ...d, cards: d.cards.filter((c) => c.id !== cardId) } : d)));

  return {
    decks: stateDecks,
    metrics,
    getHistory,
    answerCard,
    updateCardStrength,
    addCardToDeck,
    removeCard,
    setDecks,
    setRunning: () => {},
  };
}

/* ============================
   Visualizer SVG for Memory
   - Neural-like nodes, animated pulses scaled by strength
   ============================ */
function MemoryVisualizer({ decks = [], activeDeckId = null, running = true, history = [], onSelectCard }) {
  // Build nodes from active deck or aggregated
  const activeDeck = decks.find((d) => d.id === activeDeckId) || decks[0];
  const cards = activeDeck ? activeDeck.cards : [];
  const nodeCount = Math.max(3, Math.min(12, cards.length || 6));
  const width = 980;
  const height = 340;
  const centerX = width / 2;
  const centerY = height / 2;

  // map card strengths to node radii and pulse speed
  const totalStrength = cards.reduce((a, b) => a + (b.strength || 0), 0) || 1;
  const nodes = (cards.slice(0, nodeCount)).map((c, i) => {
    const angle = (i / nodeCount) * Math.PI * 2;
    const radius = 90 + (i % 3) * 30;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius * 0.9;
    const s = clamp(c.strength ?? 0.2, 0, 1);
    const pulseSpeed = clamp(1.6 - s * 1.2, 0.4, 2.4); // smaller -> faster for weak? we set faster for weaker to indicate urgency
    const size = 8 + s * 18;
    return { id: c.id, x, y, size, s, pulseSpeed, label: c.front || "Card" };
  });

  // connecting lines
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      // connection intensity based on average strength
      const strength = (nodes[i].s + nodes[j].s) / 2;
      links.push({ source: nodes[i], target: nodes[j], intensity: strength });
    }
  }

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Memory Circuit</div>
            <div className="text-xs text-zinc-400">Live recall strength • spaced repetition visualizer</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Deck: <span className="text-[#ffd24a] ml-1">{activeDeck?.title ?? "—"}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Cards: <span className="text-[#00ffbf] ml-1">{cards.length}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">History: <span className="text-[#ff9a4a] ml-1">{history.length}</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* background grid */}
          <defs>
            <radialGradient id="nodeGrad" cx="50%" cy="30%">
              <stop offset="0%" stopColor="#ffd24a" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#ff7a2d" stopOpacity="0.12" />
            </radialGradient>
          </defs>

          {/* Links */}
          {links.map((l, idx) => {
            const strokeW = 0.6 + (1 - l.intensity) * 2.4; // weak links appear thicker and brighter to show attention need
            const opacity = 0.12 + (1 - l.intensity) * 0.6;
            const dash = 2 + Math.round((1 - l.intensity) * 4);
            return <line key={`link-${idx}`} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y} stroke="#111" strokeWidth={strokeW} strokeLinecap="round" strokeDasharray={`${dash} ${dash}`} opacity={opacity} />;
          })}

          {/* Nodes with animated pulses */}
          {nodes.map((n, i) => {
            const pulseId = `pulse-${n.id}`;
            // pulse color depends on strength
            const color = n.s > 0.66 ? "#00ffbf" : n.s > 0.33 ? "#ffd24a" : "#ff6a9a";
            const animDur = n.pulseSpeed;
            const ringSize = 18 + n.s * 22;
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} className="cursor-pointer" onClick={() => onSelectCard && onSelectCard(n.id)}>
                <circle r={ringSize} fill="none" stroke={color} strokeWidth="1" opacity="0.06" />
                <circle r={ringSize + 6} fill="none" stroke={color} strokeWidth="0.6" opacity="0.04" />
                <circle r={n.size} fill={color} stroke="#060606" strokeWidth="1.4" />
                <text x={n.size + 8} y={3} fontSize="11" fill="#ffd24a" className="truncate" style={{ pointerEvents: "none" }}>
                  {n.label.length > 18 ? `${n.label.slice(0, 18)}…` : n.label}
                </text>

                {/* moving particle along small orbit to denote activity */}
                <circle r="4" fill={color} style={{
                  offsetPath: `path('M ${-ringSize - 6} 0 A ${ringSize + 6} ${ringSize + 6} 0 1 0 ${ringSize + 6} 0')`,
                  animationName: "orbit",
                  animationDuration: `${animDur}s`,
                  animationTimingFunction: "linear",
                  animationIterationCount: "infinite",
                  animationPlayState: running ? "running" : "paused",
                }} />
              </g>
            );
          })}

          {/* readout panel */}
          <g transform={`translate(${width - 220},24)`}>
            <rect x="-8" y="-12" width="220" height="120" rx="8" fill="#060606" stroke="#222" />
            <text x="0" y="6" fontSize="12" fill="#ffb57a">Neural Readout</text>
            <text x="0" y="28" fontSize="12" fill="#fff">Avg strength: <tspan fill="#ffd24a">{round(cards.reduce((a,b)=>a+(b.strength||0),0)/Math.max(1,cards.length),3)}</tspan></text>
            <text x="0" y="50" fontSize="12" fill="#fff">Studied: <tspan fill="#00ffbf">{cards.length}</tspan></text>
            <text x="0" y="72" fontSize="12" fill="#fff">Active nodes: <tspan fill="#ff9a4a">{nodes.length}</tspan></text>
            <text x="0" y="94" fontSize="11" fill="#9ee6ff">Click node to jump to card</text>
          </g>

          <style>{`
            @keyframes orbit {
              0% { offset-distance: 0%; opacity: 0.9; transform: translate(-2px,-1px) scale(0.95); }
              50% { opacity: 1; transform: translate(0,0) scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(2px,1px) scale(0.9); }
            }
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
   Oscilloscope-like Chart for avg strength history
   ============================ */
function StrengthOscilloscope({ history = [], running = true }) {
  const data = history.slice(-360).map((d, idx) => ({ t: idx, avg: round(d.avg, 6), n: d.n }));
  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Recall Oscilloscope — Avg Strength</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-40 sm:h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis domain={[0, 1]} tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="avg" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Avg Strength" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   FlashCardPage component (main)
   ============================ */
export default function FlashCardPage() {
  // sample initial decks - replace with your persisted decks as needed
  const initialDecks = useMemo(
    () => [
      {
        id: "deck1",
        title: "Fundamentals",
        cards: [
          { id: "c1", front: "What is a React Hook?", back: "A function that lets you use React state and lifecycle features from function components.", strength: 0.28 },
          { id: "c2", front: "What does useEffect do?", back: "Performs side-effects in function components. Runs after render.", strength: 0.44 },
          { id: "c3", front: "JS: difference between == and ===?", back: "== does type coercion; === is strict equality.", strength: 0.62 },
          { id: "c4", front: "What is closure?", back: "Function that captures variables from its lexical scope.", strength: 0.35 },
        ],
      },
      {
        id: "deck2",
        title: "Electronics Quick",
        cards: [
          { id: "e1", front: "Ohm's Law?", back: "V = I × R", strength: 0.51 },
          { id: "e2", front: "Capacitor unit?", back: "Farad (F); often use μF", strength: 0.2 },
        ],
      },
    ],
    []
  );

  // local UI state
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState(initialDecks[0].id);
  const [studyMode, setStudyMode] = useState("learn"); // learn, review, quiz
  const [selectedUser, setSelectedUser] = useState("User A");
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);

  // add card form
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");

  // memory simulation hook
  const {
    decks,
    metrics,
    getHistory,
    answerCard,
    addCardToDeck,
    removeCard,
    setDecks,
  } = useMemorySim({ running, decks: initialDecks });

  // derive active deck and card
  const activeDeck = decks.find((d) => d.id === selectedDeckId) || decks[0] || { id: "empty", title: "No Deck", cards: [] };
  useEffect(() => {
    // clamp current index to deck size
    setCurrentCardIndex((idx) => Math.max(0, Math.min((activeDeck.cards.length || 1) - 1, idx)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeckId, activeDeck.cards.length]);

  const currentCard = activeDeck.cards[currentCardIndex] || null;

  const history = getHistory();

  /* ---------------------------
     Actions
     --------------------------- */
  const flipCard = () => setShowBack((s) => !s);

  const markAnswer = (correct) => {
    if (!currentCard) return toast.error("No card available");
    answerCard(activeDeck.id, currentCard.id, correct);
    toast.success(correct ? "Marked correct — strength updated" : "Marked incorrect — strength decreased");
    setShowBack(false);
    // move to next card, but keep in-range
    setCurrentCardIndex((i) => {
      const nxt = Math.min(activeDeck.cards.length - 1, i + 1);
      return nxt;
    });
  };

  const prevCard = () => setCurrentCardIndex((i) => Math.max(0, i - 1));
  const nextCard = () => setCurrentCardIndex((i) => Math.min(activeDeck.cards.length - 1, i + 1));
  const skipCard = () => {
    setCurrentCardIndex((i) => Math.min(activeDeck.cards.length - 1, i + 1));
    setShowBack(false);
  };

  const handleAddCard = () => {
    if (!newFront.trim() || !newBack.trim()) {
      toast.error("Front and back cannot be empty");
      return;
    }
    addCardToDeck(activeDeck.id, { front: newFront.trim(), back: newBack.trim() });
    setNewFront("");
    setNewBack("");
    toast.success("Card added");
  };

  const deleteCard = (cardId) => {
    removeCard(activeDeck.id, cardId);
    toast("Card removed");
    setCurrentCardIndex((i) => Math.max(0, i - 1));
  };

  const onSelectCardNode = (cardId) => {
    const idx = activeDeck.cards.findIndex((c) => c.id === cardId);
    if (idx >= 0) {
      setCurrentCardIndex(idx);
      setShowBack(false);
      toast(`Jumped to card ${idx + 1}`);
    }
  };

  /* ---------------------------
     Small helpers for UI
     --------------------------- */
  const studyModeLabel = (m) => {
    if (m === "learn") return "Learn";
    if (m === "review") return "Review";
    if (m === "quiz") return "Quiz";
    return m;
  };

  return (
    <div className="min-h-screen bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.36 }}
              className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab — Flashcards</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Interactive memory practice • realtime visualizer</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-44">
                <Select value={selectedDeckId} onValueChange={(v) => setSelectedDeckId(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Select deck" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    {decks.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-36">
                <Select value={studyMode} onValueChange={(v) => setStudyMode(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="learn" className="text-white hover:bg-orange-500/20">Learn</SelectItem>
                    <SelectItem value="review" className="text-white hover:bg-orange-500/20">Review</SelectItem>
                    <SelectItem value="quiz" className="text-white hover:bg-orange-500/20">Quiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200"
                  onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={() => { setRunning((r) => { const nxt = !r; toast(nxt ? "Visualizer resumed" : "Visualizer paused"); return nxt; }); }}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={() => {
                  // reset all strengths to baseline
                  setDecks((prev) => prev.map((d) => ({ ...d, cards: d.cards.map((c) => ({ ...c, strength: 0.18, lastReviewed: Date.now() })) })));
                  toast("Reset memory strengths");
                }}>
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</Button>
            </div>
          </div>

          {/* Mobile panel */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="flex-1">
                  <Select value={selectedDeckId} onValueChange={(v) => setSelectedDeckId(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Deck" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      {decks.map((d) => (
                        <SelectItem key={d.id} value={d.id} className="text-white hover:bg-orange-500/20">{d.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-32">
                  <Select value={studyMode} onValueChange={(v) => setStudyMode(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm">
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="learn">Learn</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="quiz">Quiz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={() => { setRunning((r) => !r); }}>{running ? "Pause" : "Play"}</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16" />

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: controls / add card / deck list */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden w-full max-w-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Book className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Study Controls</div>
                        <div className="text-xs text-zinc-400">Modes • Deck • User • Add cards</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-400">Select User</label>
                    <Input value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} type="text" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    <div className="text-xs text-zinc-500 mt-1">Choose a profile (affects scheduling heuristics)</div>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Quick Stats</label>
                    <div className="mt-2 flex gap-2">
                      <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 flex-1">
                        <div className="text-xs text-zinc-400">Deck</div>
                        <div className="text-lg font-semibold text-[#ff9a4a]">{activeDeck.title}</div>
                        <div className="text-xs text-zinc-400 mt-1">Cards: {activeDeck.cards.length}</div>
                      </div>
                      <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 w-32">
                        <div className="text-xs text-zinc-400">Avg Strength</div>
                        <div className="text-lg font-semibold text-[#00ffbf]">{round(metrics.avgStrength, 3)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Add card */}
                  <div className="border border-zinc-800 rounded-lg p-3">
                    <div className="text-sm font-medium text-zinc-300 mb-2">Add Card</div>
                    <Input value={newFront} onChange={(e) => setNewFront(e.target.value)} placeholder="Front (question)" className="bg-zinc-900/60 mb-2" />
                    <Input value={newBack} onChange={(e) => setNewBack(e.target.value)} placeholder="Back (answer)" className="bg-zinc-900/60 mb-2" />
                    <div className="flex gap-2">
                      <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={handleAddCard}><Plus className="w-4 h-4 mr-2" /> Add</Button>
                      <Button variant="ghost" className="flex-1 border border-zinc-800" onClick={() => { setNewFront(""); setNewBack(""); }}>Clear</Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 justify-between mt-2">
                    <div className="flex gap-2">
                      <Button className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => { setRunning(true); toast("Visualizer running"); }}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black" onClick={() => { setRunning(false); toast("Visualizer paused"); }}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={() => {
                        // export deck as JSON
                        const payload = JSON.stringify(activeDeck, null, 2);
                        const blob = new Blob([payload], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${activeDeck.title.replace(/\s+/g, "_")}-${Date.now()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success("Deck exported");
                      }}><Layers className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right: Visual + Cards */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated memory circuit • realtime strength • oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{studyModeLabel(studyMode)}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Deck: <span className="text-[#ffd24a] ml-1">{activeDeck.title}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Avg: <span className="text-[#00ffbf] ml-1">{round(metrics.avgStrength, 3)}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden space-y-4">
                  <MemoryVisualizer decks={decks} activeDeckId={activeDeck.id} running={running} history={history} onSelectCard={onSelectCardNode} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StrengthOscilloscope history={history} running={running} />

                    {/* Card viewer */}
                    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-sm font-medium text-orange-400">Flashcard</div>
                          <div className="text-xs text-zinc-400">{activeDeck.title} • {currentCard ? `${currentCardIndex + 1}/${activeDeck.cards.length}` : "No cards"}</div>
                        </div>
                        <div className="text-xs text-zinc-400">{currentCard ? `strength: ${round(currentCard.strength, 3)}` : ""}</div>
                      </div>

                      {!currentCard ? (
                        <div className="h-40 flex items-center justify-center text-zinc-400">No cards in deck. Add some to begin.</div>
                      ) : (
                        <div>
                          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                            <div className="rounded-lg p-6 bg-black/60 border border-zinc-800 min-h-[120px]">
                              <div className="text-sm text-zinc-400 mb-2">Front</div>
                              <div className="text-lg font-semibold text-white">{currentCard.front}</div>

                              {showBack && (
                                <div className="mt-4">
                                  <div className="text-sm text-zinc-400 mb-2">Back</div>
                                  <div className="text-md text-zinc-100">{currentCard.back}</div>
                                </div>
                              )}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 items-center">
                              <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={flipCard}><Lightning className="w-4 h-4 mr-2" /> {showBack ? "Hide" : "Reveal"}</Button>

                              <Button className="flex-1 bg-green-600/80 hover:bg-green-600" onClick={() => markAnswer(true)}><Check className="w-4 h-4 mr-2" /> Correct</Button>

                              <Button className="flex-1 bg-red-600/80 hover:bg-red-600" onClick={() => markAnswer(false)}><X className="w-4 h-4 mr-2" /> Incorrect</Button>
                            </div>

                            <div className="mt-3 flex items-center gap-2 justify-between">
                              <div className="flex gap-2">
                                <Button variant="ghost" className="border border-zinc-800" onClick={prevCard}>Prev</Button>
                                <Button variant="ghost" className="border border-zinc-800" onClick={skipCard}>Skip</Button>
                                <Button variant="ghost" className="border border-zinc-800" onClick={nextCard}>Next</Button>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button variant="destructive" className="border border-zinc-800" onClick={() => currentCard && deleteCard(currentCard.id)}><Trash2 className="w-4 h-4" /></Button>
                              </div>
                            </div>
                          </motion.div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </main>

      {/* mobile sticky controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-zinc-300 text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2" onClick={() => {
              const payload = JSON.stringify(activeDeck, null, 2);
              const blob = new Blob([payload], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${activeDeck.title.replace(/\s+/g, "_")}-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success("Deck exported");
            }}><Layers className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
