// src/pages/CheatCodesPage.jsx
"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  BookOpen,
  Timer,
  CheckCircle2,
  FileText,
  Zap,
  Clock,
  X,
  Printer,
  Focus,
  Shuffle,
  Coffee,
  Sun,
  Moon,
  Layers,
  ListChecks,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

// default 12 cheat codes -----------------------------
const defaultHacks = [
  { id: 1, title: "Active Recall Sprint", oneLiner: "Quiz yourself on core facts for 10 mins; write answers, then check.", time: 10, tag: "Practice" },
  { id: 2, title: "Formula Flash", oneLiner: "Cover formulas and recite from memory; build a one-page formula sheet.", time: 15, tag: "Memory" },
  { id: 3, title: "Teach-Back (2 min)", oneLiner: "Explain a concept aloud in 2 minutes as if teaching a friend.", time: 8, tag: "Understanding" },
  { id: 4, title: "Past Paper Drill", oneLiner: "Solve one past exam question under timed conditions.", time: 25, tag: "Practice" },
  { id: 5, title: "Error Log", oneLiner: "List mistakes from practice and write the correction — repeat once.", time: 10, tag: "Reflection" },
  { id: 6, title: "One-Page Summary", oneLiner: "Reduce a topic to a single page: headings, bullets, examples.", time: 25, tag: "Synthesis" },
  { id: 7, title: "Pomodoro Deep Sprint", oneLiner: "25 / 5 focus cycle with a strict sub-topic goal.", time: 25, tag: "Focus" },
  { id: 8, title: "Mind Map Blitz", oneLiner: "Draw a mind map linking key ideas and equations.", time: 12, tag: "Structure" },
  { id: 9, title: "Quick Interleaving", oneLiner: "Mix 3 small topics and practice each for 7 min.", time: 21, tag: "Retention" },
  { id: 10, title: "Mnemonic Craft", oneLiner: "Make a mnemonic for one hard-to-remember list.", time: 7, tag: "Memory" },
  { id: 11, title: "Sleep-Prep Review", oneLiner: "10 min light review before sleep (no screens).", time: 10, tag: "Consolidation" },
  { id: 12, title: "Light Walk Break", oneLiner: "10 min walk while recalling spaced-rep cards.", time: 10, tag: "Recovery" },
];

// color map for tags ---------------------------------
const tagColor = {
  Practice: "bg-orange-500/20 text-orange-300",
  Memory: "bg-yellow-500/20 text-yellow-300",
  Understanding: "bg-emerald-500/20 text-emerald-300",
  Reflection: "bg-blue-500/20 text-blue-300",
  Synthesis: "bg-purple-500/20 text-purple-300",
  Focus: "bg-red-500/20 text-red-300",
  Structure: "bg-pink-500/20 text-pink-300",
  Retention: "bg-indigo-500/20 text-indigo-300",
  Consolidation: "bg-teal-500/20 text-teal-300",
  Recovery: "bg-cyan-500/20 text-cyan-300",
};

// small timer util -----------------------------------
function usePomodoro(focusMinutes = 25, breakMinutes = 5) {
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(focusMinutes * 60);
  const [phase, setPhase] = useState("focus");
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          const nextPhase = phase === "focus" ? "break" : "focus";
          toast(nextPhase === "focus" ? "Focus phase started 🧠" : "Break time ☕");
          setPhase(nextPhase);
          return (nextPhase === "focus" ? focusMinutes : breakMinutes) * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, phase]);
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  return { running, phase, mins, secs, toggle: () => setRunning(!running), reset: () => setSecondsLeft(focusMinutes * 60) };
}

// ----------------------------------------------------
export default function CheatCodesPage() {
  const [filterTime, setFilterTime] = useState("any");
  const [selected, setSelected] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [hacks, setHacks] = useState(defaultHacks);
  const pomo = usePomodoro();

  // filtering
  const visible = hacks.filter((h) => {
    if (filterTime === "10") return h.time <= 10;
    if (filterTime === "30") return h.time <= 30;
    if (filterTime === "60") return h.time >= 30;
    return true;
  });

  // shuffle handler
  const shuffle = () => {
    setHacks((arr) => [...arr].sort(() => Math.random() - 0.5));
    toast("Cheat codes shuffled 🔀");
  };

  // print handler
  const printSheet = () => {
    window.print();
    toast("Printing cheat sheet 🖨");
  };

  return (
    <div className={`min-h-screen ${focusMode ? "bg-black" : "bg-[#05060a]"} text-white transition-colors duration-500`}>
      <Toaster position="top-center" richColors />

      {/* HEADER */}
      <header className="border-b border-zinc-800 bg-black/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ rotate: -12, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black shadow-md"
            >
              <Brain className="w-5 h-5" />
            </motion.div>
            <div>
              <h1 className="text-lg font-semibold text-[#ffd24a]">Quick Cheat Codes</h1>
              <p className="text-xs text-zinc-400">Rapid study hacks for last-minute exam prep</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" className="border border-zinc-700" onClick={printSheet}>
              <Printer className="w-4 h-4 mr-1" /> Print / PDF
            </Button>
            <Switch checked={focusMode} onCheckedChange={setFocusMode} />
            <span className="text-xs text-zinc-400">Focus Mode</span>
          </div>
        </div>
      </header>

      {/* FILTERS */}
      <section className="max-w-7xl mx-auto px-4 mt-4">
        <div className="flex flex-wrap items-center gap-2">
          {["any", "10", "30", "60"].map((t) => (
            <Button
              key={t}
              size="sm"
              variant={filterTime === t ? "default" : "ghost"}
              className={`rounded-full px-3 py-1 text-xs ${filterTime === t ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" : "border border-zinc-700 text-zinc-300"}`}
              onClick={() => setFilterTime(t)}
            >
              {t === "any" ? "All" : `${t} min`}
            </Button>
          ))}
        </div>
      </section>

      {/* GRID */}
      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {visible.map((h) => (
          <motion.article
            key={h.id}
            layout
            whileHover={{ scale: 1.03 }}
            className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-2xl shadow-sm cursor-pointer hover:border-orange-500/40"
            onClick={() => setSelected(h)}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
                <Layers className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold">{h.title}</h3>
                <p className="text-xs text-zinc-400 mt-1">{h.oneLiner}</p>
                <div className="mt-3 flex items-center justify-between">
                  <Badge className="bg-black/30 text-xs">{h.time} min</Badge>
                  <Badge className={`${tagColor[h.tag] || "bg-zinc-700"} text-xs`}>{h.tag}</Badge>
                </div>
              </div>
            </div>
          </motion.article>
        ))}
      </main>

      {/* TOOLBAR */}
      <motion.div
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed bottom-4 right-4 flex gap-3 bg-black/70 border border-zinc-800 rounded-full px-4 py-2 items-center backdrop-blur-md shadow-lg"
      >
        <Button size="icon" variant="ghost" className="border border-zinc-700" onClick={pomo.toggle}>
          <Timer className="w-4 h-4 text-[#ffd24a]" />
        </Button>
        <span className="text-xs text-zinc-400">
          {pomo.phase === "focus" ? "Focus" : "Break"} {pomo.mins}:{String(pomo.secs).padStart(2, "0")}
        </span>
        <Button size="icon" variant="ghost" className="border border-zinc-700" onClick={shuffle}>
          <Shuffle className="w-4 h-4 text-[#ffd24a]" />
        </Button>
      </motion.div>

      {/* DETAIL MODAL */}
      <AnimatePresence>
        {selected && (
          <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
            <DialogContent className="bg-[#0b0b0b] border border-zinc-800 max-w-md text-white">
              <DialogHeader>
                <DialogTitle className="text-[#ffd24a]">{selected.title}</DialogTitle>
                <DialogDescription className="text-zinc-400 text-sm">
                  {selected.oneLiner}
                </DialogDescription>
              </DialogHeader>

              <Card className="bg-black/40 border border-zinc-800 mt-3">
                <CardContent className="space-y-2">
                  <p className="text-xs text-zinc-400">
                    Why it works: engages active recall and reduces passive reading. Use timer discipline and reflect on errors after each cycle.
                  </p>
                  <div className="text-xs text-zinc-400">
                    <div className="mt-2 font-semibold text-zinc-300">Checklist:</div>
                    {["Set timer", "Perform task", "Review mistakes", "Short break"].map((step, i) => (
                      <div key={i} className="flex items-center gap-2 mt-1">
                        <Checkbox id={`c${i}`} />
                        <label htmlFor={`c${i}`} className="text-xs">{step}</label>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <DialogFooter className="mt-3 flex justify-between">
                <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setSelected(null)}>
                  <X className="w-4 h-4 mr-1" /> Close
                </Button>
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => toast.success("Added to Study Plan ✅")}>
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Add to Plan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      {/* PRINT STYLE */}
      <style>{`
        @media print {
          body { background:white !important; color:black !important; }
          header, .fixed, .border, .bg-black\\/60, .bg-zinc-900\\/40 { display:none !important; }
          main { grid-template-columns: 1fr 1fr !important; }
          article { page-break-inside: avoid; border:1px solid #ccc; color:#000; background:#fff; }
        }
      `}</style>
    </div>
  );
}
