// src/pages/DocumentationPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Code,
  Play,
  Pause,
  Sparkles,
  Settings,
  Download,
  Search,
  User,
  Users,
  Zap,
  Layout,
  FileText,
  Terminal,
  Gauge,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/atom-one-dark.css"; // optional syntax theme

import { Toaster, toast } from "sonner";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
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
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================
   Toy "Execution" Engine for Tutorials
   - drives visualizer / oscilloscope traces to feel "real-time"
   ============================ */
function useTutorialRunner({ running, speed = 500, steps = [] }) {
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState([]);
  const tRef = useRef(null);

  useEffect(() => {
    if (!running) {
      if (tRef.current) {
        clearInterval(tRef.current);
        tRef.current = null;
      }
      return () => {
        if (tRef.current) clearInterval(tRef.current);
      };
    }
    if (!tRef.current) {
      tRef.current = setInterval(() => {
        setIndex((i) => {
          const nxt = Math.min(i + 1, steps.length - 1);
          setLog((l) => {
            const entry = { t: Date.now(), step: nxt, msg: steps[nxt]?.title || `Step ${nxt}` };
            const next = [...l, entry].slice(-200);
            return next;
          });
          return nxt;
        });
      }, speed);
    }
    return () => {
      if (tRef.current) {
        clearInterval(tRef.current);
        tRef.current = null;
      }
    };
  }, [running, speed, steps]);

  const reset = useCallback(() => {
    setIndex(0);
    setLog([]);
  }, []);

  const stepForward = useCallback(() => {
    setIndex((i) => Math.min(i + 1, steps.length - 1));
    setLog((l) => [...l, { t: Date.now(), step: Math.min(index + 1, steps.length - 1), msg: "Step forward" }].slice(-200));
  }, [index, steps.length]);

  const stepBack = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
    setLog((l) => [...l, { t: Date.now(), step: Math.max(index - 1, 0), msg: "Step back" }].slice(-200));
  }, [index]);

  return { index, log, reset, stepForward, stepBack, setIndex };
}

/* ============================
   Visualizer: shows a futuristic "doc flow" and reacts to step index, role, activity
   - uses SVG animation and small dots (based on earlier pattern)
   ============================ */
function DocVisualizer({ role = "learner", steps = [], stepIndex = 0, running = false }) {
  // appearance parameters
  const roleColors = {
    learner: { accent: "#00ffbf", glow: "#003f2b" },
    author: { accent: "#ffd24a", glow: "#3f2a00" },
    reviewer: { accent: "#ff6a9a", glow: "#3f0a14" },
  };
  const { accent, glow } = roleColors[role] || roleColors.learner;

  // dynamic metrics for oscilloscope + dots
  const progress = steps.length ? stepIndex / (steps.length - 1 || 1) : 0;
  const activity = running ? clamp((progress * 8) + Math.random() * 2, 0.5, 9) : 0.12;
  const dotCount = Math.max(6, Math.round(6 + activity * 2));
  const speed = clamp(2.2 / (activity + 0.01), 0.25, 5);

  const svgWidth = 1000;
  const svgHeight = 260;
  const startX = 80;
  const endX = svgWidth - 90;
  const centerY = svgHeight / 2;

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div style={{ background: `linear-gradient(135deg, ${accent}, #ff7a2d)` }} className="w-11 h-11 rounded-md flex items-center justify-center shadow-md">
            <BookOpen className="w-5 h-5 text-black" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Documentation Visualizer</div>
            <div className="text-xs text-zinc-400">Live tutorial flow — role: <span className="text-white font-semibold">{role}</span></div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Steps: <span className="text-[#ffd24a] ml-1">{steps.length}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Progress: <span className="text-[#00ffbf] ml-1">{Math.round(progress * 100)}%</span></Badge>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-56">
          {/* main bus */}
          <path d={`M ${startX} ${centerY} H ${endX}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* nodes for each step */}
          {steps.map((s, i) => {
            const x = startX + ((endX - startX) * (i / Math.max(1, steps.length - 1)));
            const y = centerY;
            // highlight current step
            const isActive = i === stepIndex;
            const r = isActive ? 18 : 12;
            const fill = isActive ? accent : "#0b0b0b";

            return (
              <g key={`step-${i}`} transform={`translate(${x}, ${y})`} aria-hidden>
                <circle r={r} fill={fill} stroke="#222" strokeWidth="2" />
                <text x="0" y="36" fontSize="10" fill="#ffd24a" textAnchor="middle">{s.title}</text>
                {isActive && (
                  <g transform="translate(0,-36)">
                    <rect x="-60" y="-28" width="120" height="28" rx="8" fill="#050506" stroke="#222" />
                    <text x="0" y="-10" fontSize="11" fill="#fff" textAnchor="middle">{s.sub || "Active step"}</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* moving dots along bus to show activity */}
          {Array.from({ length: dotCount }).map((_, di) => {
            const pathStr = `M ${startX} ${centerY} H ${endX}`;
            const delay = (di / dotCount) * speed;
            const style = {
              offsetPath: `path('${pathStr}')`,
              animationName: "docFlow",
              animationDuration: `${speed}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
            };
            return <circle key={`dot-${di}`} r="4" fill={accent} style={style} />;
          })}

          {/* readout */}
          <g transform={`translate(${svgWidth - 220}, 30)`}>
            <rect x="-12" y="-14" width="200" height="100" rx="8" fill="#060606" stroke="#222" />
            <text x="0" y="6" fontSize="12" fill="#ffb57a">Live Readout</text>
            <text x="0" y="28" fontSize="12" fill="#fff">Step: <tspan fill="#ffd24a">{stepIndex + 1}/{steps.length}</tspan></text>
            <text x="0" y="46" fontSize="12" fill="#fff">Activity: <tspan fill="#00ffbf">{round(activity,2)}</tspan></text>
          </g>

          <style>{`
            @keyframes docFlow {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.95; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
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
   Oscilloscope for Documentation Activity
   - shows recent "activity" from logs as a single series
   ============================ */
function ActivityOscilloscope({ log = [], running }) {
  const data = useMemo(() => {
    const clipped = log.slice(-360);
    return clipped.map((l, i) => {
      // activity magnitude: base on index spread and randomness
      const val = 0.2 + ((l.step || 0) % 10) * 0.4 + (Math.abs(Math.sin(i)) * 0.6);
      return { t: i, a: round(val, 3) };
    });
  }, [log]);

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Activity Oscilloscope</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} domain={[0, 'dataMax + 1']} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="a" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Activity" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main DocumentationPage
   - Left: tutorials list + generator
   - Center: author/editor + code viewer & live preview
   - Right: visualizer + oscilloscope + summary
   ============================ */
export default function DocumentationPage() {
  // UI state
  const [role, setRole] = useState("learner"); // learner | author | reviewer
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [selectedTutorial, setSelectedTutorial] = useState(null);
  const [tutorials, setTutorials] = useState(() => [
    {
      id: "tut-1",
      title: "Getting Started — SparkLab",
      sub: "Intro + environment",
      body: `# Getting Started

Welcome to SparkLab docs. This tutorial covers setting up the environment, running a sample simulation and reading outputs.

1. Open the run panel.
2. Set Vsup and R.
3. Click Run to see the Visualizer animate.
`,
      steps: [
        { title: "Intro", sub: "Overview & prerequisites" },
        { title: "Environment", sub: "Install dependencies" },
        { title: "Run", sub: "Execute sample" },
        { title: "Analyze", sub: "Read outputs" },
      ],
    },
    {
      id: "tut-2",
      title: "Advanced: Multi-group circuits",
      sub: "Series & Parallel",
      body: `# Multi-group circuits

This tutorial shows series/parallel concepts and hands-on examples.`,
      steps: [
        { title: "Theory", sub: "Series vs Parallel" },
        { title: "Configure", sub: "Add groups" },
        { title: "Simulate", sub: "Step-by-step" },
      ],
    },
  ]);

  // selection defaults
  useEffect(() => {
    if (!selectedTutorial && tutorials.length) setSelectedTutorial(tutorials[0]);
  }, [tutorials, selectedTutorial]);

  // runner hook using steps from selected tutorial
  const steps = selectedTutorial?.steps || [];
  const { index: stepIndex, log, reset, stepForward, stepBack, setIndex } = useTutorialRunner({
    running,
    speed,
    steps,
  });

  // editor state
  const [editorValue, setEditorValue] = useState(selectedTutorial?.body || "");
  useEffect(() => {
    setEditorValue(selectedTutorial?.body || "");
  }, [selectedTutorial?.id]);

  // Gemini generation state
  const [generating, setGenerating] = useState(false);

  // Save / update tutorial locally
  const saveTutorial = () => {
    if (!selectedTutorial) return;
    setTutorials((t) => t.map((x) => (x.id === selectedTutorial.id ? { ...x, body: editorValue } : x)));
    toast.success("Saved tutorial locally");
  };

  const exportTutorial = () => {
    const payload = {
      id: selectedTutorial?.id || `tutorial-${Date.now()}`,
      title: selectedTutorial?.title || "exported-tutorial",
      body: editorValue,
    };
    const blob = new Blob([payload.body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${payload.title.replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported tutorial");
  };

  /* ============================
     Gemini-like generation
     - IMPORTANT: This code expects a server endpoint that proxies requests to Gemini (or similar)
     - Do NOT expose API keys in client code. Put your GEMINI API KEY on a server env var and have /api/generate-doc call the model.
     - Example server: an API route that reads process.env.GEMINI_API_KEY and does:
         fetch("https://api.gemini.example/v1/generate", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type":"application/json"}, body: JSON.stringify({prompt}) })
     ============================ */
// Frontend-only Gemini integration
const GEMINI_API_KEY =
  import.meta.env.VITE_GEMINI_API_KEY ||
  process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
  "";

const generateWithGemini = async ({ prompt, targetTutorialId = null }) => {
  try {
    if (!GEMINI_API_KEY) {
      toast.error("Missing Gemini API key in .env file");
      console.error("Missing Gemini API key");
      return false;
    }

    setGenerating(true);

    // Gemini endpoint for free API key
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=" +
      GEMINI_API_KEY;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(txt || `Generation failed: ${resp.status}`);
    }

    const data = await resp.json();

    // Extract text safely
    const content =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.output_text ||
      "";

    if (!content) throw new Error("No content returned from Gemini API");

    // Merge into selected tutorial or create new
    if (targetTutorialId && tutorials.some((t) => t.id === targetTutorialId)) {
      setTutorials((t) =>
        t.map((x) =>
          x.id === targetTutorialId ? { ...x, body: content } : x
        )
      );
      if (selectedTutorial?.id === targetTutorialId) setEditorValue(content);
      toast.success("✨ Generated content inserted into tutorial");
    } else {
      const newTut = {
        id: `tut-gen-${Date.now()}`,
        title: `Generated: ${prompt.slice(0, 30)}...`,
        sub: "Auto-generated",
        body: content,
        steps: [{ title: "Generated", sub: "Auto" }],
      };
      setTutorials((t) => [newTut, ...t]);
      setSelectedTutorial(newTut);
      setEditorValue(content);
      toast.success("✨ Generated new tutorial");
    }

    setGenerating(false);
    return true;
  } catch (err) {
    setGenerating(false);
    console.error("Generate error:", err);
    toast.error(`Generation failed: ${err?.message || "Unknown error"}`);
    return false;
  }
};

// Quick generate helper (uses above)
const quickGenerate = async (type = "summary") => {
  const basePrompt =
    type === "summary"
      ? `Create a clear, step-by-step tutorial for "${
          selectedTutorial?.title || "New Topic"
        }". Use headings, short code snippets, and 4–6 steps.`
      : `Create a concise runnable example demonstrating "${
          selectedTutorial?.title || "New Topic"
        }" with code and explanation.`;

  await generateWithGemini({
    prompt: basePrompt,
    targetTutorialId: selectedTutorial?.id,
  });
};


  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.22)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* HEADER */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-6 h-6 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab Docs</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Documentation • Interactive Tutorials</div>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-40">
                <Select value={role} onValueChange={(v) => setRole(v)}>
                  <SelectTrigger className="w-full bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                    <SelectItem value="learner">Learner</SelectItem>
                    <SelectItem value="author">Author</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-1 rounded-md shadow" onClick={() => { toast("Tutorial snapshot saved"); }}>
                Snapshot
              </Button>

              <Button variant="ghost" className="border border-zinc-700 text-zinc-300 p-2 rounded-md" onClick={() => { setRunning((r) => !r); }}>
                {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border border-zinc-800 p-2 rounded-md" onClick={() => toast("Open menu")}>
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16" />

      {/* MAIN */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Tutorial list + generator */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-[#ffd24a]">Tutorials</div>
                      <div className="text-xs text-zinc-400">Manage & generate docs</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Local</Badge>
                  </div>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2">
                  {tutorials.map((t) => (
                    <motion.div key={t.id} whileHover={{ scale: 1.01 }} className={`p-2 rounded-md cursor-pointer ${selectedTutorial?.id === t.id ? "bg-zinc-900/40 border border-zinc-800" : "hover:bg-zinc-900/20"}`} onClick={() => { setSelectedTutorial(t); }}>
                      <div className="flex items-center justify-between">
                        <div className="truncate">
                          <div className="text-sm font-medium text-white truncate">{t.title}</div>
                          <div className="text-xs text-zinc-400 truncate">{t.sub}</div>
                        </div>
                        <div className="ml-2 text-xs text-zinc-400">{t.steps?.length || 0} steps</div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => {
                    const newTut = { id: `tut-${Date.now()}`, title: "Untitled Tutorial", sub: "New", body: "# New Tutorial\n", steps: [{ title: "Start", sub: "Intro" }] };
                    setTutorials((s) => [newTut, ...s]);
                    setSelectedTutorial(newTut);
                    setEditorValue(newTut.body);
                    toast.success("Created new tutorial");
                  }}>
                    <Sparkles className="w-4 h-4 mr-2" /> New
                  </Button>

                  <Button variant="ghost" className="border border-zinc-800" onClick={() => {
                    // quick generate summary into selected tutorial
                    if (!selectedTutorial) { toast.error("Select a tutorial first"); return; }
                    quickGenerate("summary");
                  }}>
                    Generate
                  </Button>
                </div>

                <div className="mt-2 text-xs text-zinc-400">
                  Tip: Use "Generate" to create a first draft with your Gemini server proxy. The app will insert generated markdown.
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[#ffd24a]">
                  <Terminal className="w-5 h-5" /> Tools
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => exportTutorial()}><Download className="w-4 h-4 mr-2" /> Export</Button>
                    <Button variant="ghost" className="border border-zinc-800" onClick={() => { saveTutorial(); }}><Code className="w-4 h-4 mr-2" /> Save</Button>
                  </div>

                  <div className="mt-2">
                    <label className="text-xs text-zinc-400">Run speed (ms)</label>
                    <Input type="number" value={speed} onChange={(e) => setSpeed(Number(e.target.value || 500))} className="bg-zinc-900/40 border border-zinc-800" />
                    <div className="text-xs text-zinc-500 mt-1">Lower = faster</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Center: editor & preview */}
          <div className="lg:col-span-6 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Code className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">{selectedTutorial?.title || "Select a tutorial"}</div>
                        <div className="text-xs text-zinc-400">{selectedTutorial?.sub || "—"}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{role}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-400">Markdown Editor</label>
                      <Textarea value={editorValue} onChange={(e) => setEditorValue(e.target.value)} rows={12} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="mt-2 flex gap-2">
                        <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => saveTutorial()}>
                          Save
                        </Button>
                        <Button variant="outline" onClick={() => { setEditorValue(selectedTutorial?.body || ""); toast("Reverted editor"); }}>
                          Revert
                        </Button>
                        <Button variant="ghost" className="border border-zinc-800" onClick={() => {
                          if (!selectedTutorial) { toast.error("Select a tutorial"); return; }
                          // quick generate code example
                          quickGenerate("example");
                        }}>
                          Auto Example
                        </Button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Live Preview</label>
                      <div className="mt-2 p-3 rounded-lg bg-black/60 border border-zinc-800 min-h-[200px]">
                        {/* Minimal markdown -> html rendering for preview (simple) */}
                       <div className="prose prose-invert max-w-none text-sm text-orange-300">
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeHighlight]}
    components={{
      h1: ({ node, ...props }) => (
        <h1 className="text-[#ffd24a] text-2xl font-bold mt-4 mb-2" {...props} />
      ),
      h2: ({ node, ...props }) => (
        <h2 className="text-[#ff9a4a] text-xl font-semibold mt-3 mb-1" {...props} />
      ),
      p: ({ node, ...props }) => <p className="text-orange-200 leading-relaxed mb-2" {...props} />,
      code: ({ inline, className, children, ...props }) => {
        return inline ? (
          <code className="bg-zinc-900 text-[#ffd24a] px-1 py-0.5 rounded" {...props}>
            {children}
          </code>
        ) : (
          <pre className="bg-black/80 text-[#ffd24a] p-3 rounded-md overflow-x-auto border border-zinc-800 mt-2 mb-3">
            <code className={className} {...props}>
              {children}
            </code>
          </pre>
        );
      },
      li: ({ node, ...props }) => (
        <li className="list-disc ml-5 mb-1 text-orange-200" {...props} />
      ),
      a: ({ node, ...props }) => (
        <a
          className="text-[#00ffbf] underline hover:text-[#ffd24a] transition-colors"
          target="_blank"
          rel="noopener noreferrer"
          {...props}
        />
      ),
    }}
  >
    {editorValue || "Start writing markdown here..."}
  </ReactMarkdown>
</div>

                      </div>

                      <div className="mt-3 flex gap-2 justify-between items-center">
                        <div className="flex gap-2">
                          <Button className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                          <Button variant="outline" className="px-3 py-2" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                          <Button variant="ghost" className="border border-zinc-800" onClick={() => reset()}><Settings className="w-4 h-4 mr-2" /> Reset</Button>
                        </div>

                        <div>
                          <Button variant="ghost" className="border border-zinc-800" onClick={() => setIndex(0)}>Jump to Start</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Inline console / logs */}
            <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[#ffd24a]">
                  <Layout className="w-5 h-5" /> Execution Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-48 overflow-y-auto bg-zinc-900/40 border border-zinc-800 rounded p-2 text-xs">
                  {log.length === 0 ? (
                    <div className="text-zinc-500">No activity. Run the tutorial to see live output.</div>
                  ) : (
                    log.slice().reverse().map((l, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 py-1 border-b border-zinc-800 last:border-b-0">
                        <div>
                          <div className="text-sm text-white">{l.msg}</div>
                          <div className="text-xs text-zinc-500">{new Date(l.t).toLocaleTimeString()}</div>
                        </div>
                        <div className="text-xs text-zinc-400">step {l.step + 1}</div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Visualizer + oscilloscope + summary */}
          <div className="lg:col-span-3 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <DocVisualizer role={role} steps={steps} stepIndex={stepIndex} running={running} />
            </motion.div>

            <ActivityOscilloscope log={log} running={running} />

            <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[#ffd24a]">
                  <Gauge className="w-5 h-5" /> Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                    <div className="text-xs text-zinc-400">Selected</div>
                    <div className="text-lg font-semibold text-[#ff9a4a]">{selectedTutorial?.title || "—"}</div>
                  </div>
                  <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                    <div className="text-xs text-zinc-400">Steps</div>
                    <div className="text-lg font-semibold text-[#00ffbf]">{steps.length}</div>
                  </div>
                  <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                    <div className="text-xs text-zinc-400">Role</div>
                    <div className="text-lg font-semibold text-[#ffd24a]">{role}</div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-zinc-400">
                  Pro tip: Use auto-generate to get a structured draft — then refine inside the editor. Never expose your API key in client code; always proxy server-side.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
