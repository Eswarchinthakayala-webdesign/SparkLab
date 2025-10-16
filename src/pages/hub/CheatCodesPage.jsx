// src/pages/CheatCode.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Edit3,
  Eye,
  Play,
  Pause,
  Zap,
  RefreshCw,
  StopCircle,
  Download,
  Save,
  Trash2,
  Code,
  Activity,
  Cpu,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { Toaster, toast } from "sonner";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

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

/* ===========================
   Utilities
   =========================== */
const localKey = "cheatcode_notes_v1";
const round = (v, p = 4) => {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

/* ===========================
   Mock & API generation helpers
   =========================== */
/**
 * IMPORTANT:
 * - Don't embed real Gemini or other secret API keys into frontend code.
 * - Use a backend proxy endpoint (e.g., /api/generate) that holds the secret.
 *
 * This function calls your backend proxy to generate text. The backend should:
 * - accept POST { prompt, style, format } and
 * - call the Gemini or other LLM with your secret key, returning text
 */
async function generateNoteFromAPI({ prompt, format = "readme", type = "summary", abortSignal }) {
  // Example: POST /api/generate -> your server proxies to Gemini/LLM
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, format, type }),
    signal: abortSignal,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Generation failed: ${txt || res.status}`);
  }
  const data = await res.json();
  // backend should return { text: "..." }
  return data.text;
}

/**
 * Frontend-only mock generator (for testing without API).
 * Returns a README-like markdown quickly.
 */
function mockGenerateNote({ topic, type = "summary", length = "short" }) {
  const now = new Date().toLocaleString();
  const base = `# ${topic}\n\n> Generated: ${now}\n\n`;
  if (type === "mnemonic") {
    return (
      base +
      `## Mnemonic\n\n- **Mnemonic**: *${topic
        .split(" ")
        .map((w) => w[0])
        .join("")}* — remember first letters.\n\n## How to use\n\n1. Read once.\n2. Rehearse aloud.\n3. Use flashcards.\n\n---\n\n*Auto-generated (mock)*`
    );
  }
  if (type === "formula") {
    return (
      base +
      `## Formula Sheet\n\n- **Core formula**: \\(F = ma\\)\n- **Derived**: ...\n\n## Quick Steps\n\n1. Identify variables.\n2. Units.\n3. Example: ...\n\n---\n\n*Auto-generated (mock)*`
    );
  }

  // default summary
  const sample = `
## Quick Summary
- Key idea 1
- Key idea 2
- Key idea 3

## Important Definitions
- **Term A** — short definition
- **Term B** — short definition

## Exam Tips
1. Practice previous papers.
2. Make one-page cheatsheets.
3. Use mnemonics.

---

*Auto-generated (mock, ${length})*
`;
  return base + sample;
}

/* ===========================
   Visualizer: cheat visualizer
   - Uses "note metadata" to drive live animation and readings
   - Not static: animations & meter readings scale with note values
   =========================== */
function CheatVisualizer({ noteMeta = {}, playing }) {
  // noteMeta: { wordCount, type, difficulty, focus }
  const { wordCount = 0, type = "summary", difficulty = 1, focus = 50 } = noteMeta;

  // derive "electrical" values for visual metaphor
  const normalizedWords = Math.min(1, wordCount / 800); // 0..1 scale
  const intensity = clampNumber(normalizedWords * difficulty * (focus / 50), 0.05, 3.5);
  const current = round(intensity * 0.45, 4); // A
  const voltage = round(2 + intensity * 5, 3); // V (metaphor)
  const power = round(voltage * current, 4);

  // build oscilloscope waveform data — dynamic length
  const points = Array.from({ length: 240 }).map((_, i) => {
    const t = i / 20;
    // sine wave modulated by intensity (higher intensity => faster oscillations & larger amplitude)
    const amp = 0.6 + intensity * 0.9;
    const freq = 0.6 + intensity * 0.8;
    const base = Math.sin(t * freq + i * 0.02) * amp;
    // add small noise depending on difficulty
    const noise = (Math.sin(i * 0.1 * difficulty) * 0.1) * (difficulty / 3);
    return { t: i, val: round(base + noise, 4) };
  });

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Cheat Visualizer</div>
            <div className="text-xs text-zinc-400">Real-time study flow • dynamic meters</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Type: <span className="text-[#ffd24a] ml-1">{type}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Words: <span className="text-[#00ffbf] ml-1">{wordCount}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Focus: <span className="text-[#ff9a4a] ml-1">{focus}%</span></Badge>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Meter boxes */}
        <div className="col-span-1 rounded-md p-3 bg-zinc-900/50 border border-zinc-800">
          <div className="text-xs text-zinc-400">Voltage (V)</div>
          <div className="text-2xl font-semibold text-[#ffd24a]">{voltage} V</div>
          <div className="text-xs text-zinc-500 mt-1">Mental voltage — higher when content dense</div>
        </div>

        <div className="col-span-1 rounded-md p-3 bg-zinc-900/50 border border-zinc-800">
          <div className="text-xs text-zinc-400">Current (A)</div>
          <div className="text-2xl font-semibold text-[#00ffbf]">{current} A</div>
          <div className="text-xs text-zinc-500 mt-1">Flow intensity — reading & rehearsal speed</div>
        </div>

        <div className="col-span-1 rounded-md p-3 bg-zinc-900/50 border border-zinc-800">
          <div className="text-xs text-zinc-400">Power</div>
          <div className="text-2xl font-semibold text-[#ff9a4a]">{power} W</div>
          <div className="text-xs text-zinc-500 mt-1">Interaction of focus & density</div>
        </div>
      </div>

      {/* Oscilloscope */}
      <div className="mt-3 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" hide />
            <YAxis hide />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "8px" }} />
            <Line type="monotone" dataKey="val" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* flow dots (svg) */}
      <div className="mt-3 w-full overflow-hidden">
        <svg viewBox="0 0 900 80" preserveAspectRatio="xMidYMid meet" className="w-full h-20">
          {/* wire */}
          <path d="M 40 40 H 860" stroke="#111" strokeWidth="8" strokeLinecap="round" />
          {/* flow dots */}
          {Array.from({ length: Math.max(3, Math.round(4 + intensity * 6)) }).map((_, i) => {
            const delay = (i / 10) * (playing ? 0.6 : 0);
            const speed = 4 / (1 + intensity);
            const style = {
              offsetPath: `path('M 40 40 H 860')`,
              animationName: "cheatFlow",
              animationDuration: `${speed}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: playing ? "running" : "paused",
            };
            return <circle key={`c-${i}`} r="5" fill="#ffd24a" style={style} />;
          })}
          <style>{`
            @keyframes cheatFlow {
              0% { offset-distance: 0%; opacity: 0.95; transform: scale(0.9); }
              40% { opacity: 0.8; transform: scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: scale(0.8); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
          `}</style>
        </svg>
      </div>
    </div>
  );
}

function clampNumber(v, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}

/* ===========================
   Main component: CheatCode
   =========================== */
export default function CheatCode() {
  // editor state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mode, setMode] = useState("edit"); // edit | preview
  const [format, setFormat] = useState("readme"); // readme or plain
  const [type, setType] = useState("summary"); // summary | mnemonic | formula
  const [length, setLength] = useState("short"); // short | medium | long
  const [difficulty, setDifficulty] = useState(2); // 1..5
  const [focus, setFocus] = useState(60); // 0..100

  const [playing, setPlaying] = useState(true); // visualizer play/pause
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef(null);

  // load saved notes list
  const [notesList, setNotesList] = useState(() => {
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  // derived meta for visualizer
  const noteMeta = useMemo(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    return { wordCount: words, type, difficulty, focus };
  }, [content, type, difficulty, focus]);

  // Save / load helpers
  const saveCurrent = useCallback(() => {
    const note = {
      id: Date.now(),
      title: title || `Untitled - ${new Date().toLocaleDateString()}`,
      content,
      format,
      type,
      difficulty,
      focus,
      savedAt: Date.now(),
    };
    const newList = [note, ...notesList].slice(0, 50);
    setNotesList(newList);
    localStorage.setItem(localKey, JSON.stringify(newList));
    toast.success("Saved to localStorage");
  }, [title, content, format, type, difficulty, focus, notesList]);

  const deleteNote = (id) => {
    const next = notesList.filter((n) => n.id !== id);
    setNotesList(next);
    localStorage.setItem(localKey, JSON.stringify(next));
    toast.success("Deleted note");
  };

  const exportReadme = () => {
    const md = `# ${title || "Cheat Sheet"}\n\n${content}\n`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "cheat-sheet").replace(/\s+/g, "-").toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Downloaded README.md");
  };

  // Generation handling (calls backend proxy or mock)
  const generateNote = async () => {
    // Construct prompt (simple)
    const prompt = `Generate a ${length} ${type} for "${title || "Unnamed Topic"}" formatted as ${format === "readme" ? "a GitHub README (markdown)" : "plain markdown"}. Keep it concise, exam-focused, include tips and exam tricks. Use bullet points, headings, and a short example.`;

    // use AbortController to support Stop
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    toast("Generating note...", { icon: <Sparkles /> });

    try {
      // Prefer backend proxy endpoint that holds secret
      let text = "";
      try {
        text = await generateNoteFromAPI({ prompt, format, type, abortSignal: controller.signal });
      } catch (e) {
        // If API fails (or in dev) fall back to mock (but still warn)
        console.warn("API generate failed:", e);
        toast.error("Remote generation failed — using local mock fallback");
        text = mockGenerateNote({ topic: title || "Topic", type, length });
      }

      // apply result
      setContent((prev) => {
        // if user had something, append clearly; else replace
        if (prev && prev.trim()) {
          return `${prev}\n\n---\n\n${text}`;
        }
        return text;
      });
      setMode("preview");
      toast.success("Generation finished");
    } catch (err) {
      if (err.name === "AbortError") {
        toast("Generation stopped", { icon: <StopCircle /> });
      } else {
        console.error(err);
        toast.error("Generation failed");
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const stopGeneration = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setGenerating(false);
  };

  // mount: sync notesList from localStorage changes (in case multiple tabs)
  useEffect(() => {
    const handler = () => {
      try {
        const raw = localStorage.getItem(localKey);
        const parsed = raw ? JSON.parse(raw) : [];
        setNotesList(parsed);
      } catch (e) {}
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // UX convenience: save on ctrl+s
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveCurrent();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveCurrent]);

  return (
    <div className="min-h-screen  bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.22)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.28 }} className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
                <Zap className="w-6 h-6 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm md:text-lg font-semibold text-zinc-200">SparkLab — Cheat Codes</div>
                <div className="text-xs text-zinc-400 -mt-0.5">Fast study notes • README format • Visualizer</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-3">
              <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-2" onClick={() => { setTitle(""); setContent(""); toast("Cleared editor"); }}>
                <RefreshCw className="w-4 h-4 mr-2" /> New
              </Button>
              <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2" onClick={() => exportReadme()}>
                <Download className="w-4 h-4" />
              </Button>
            </div>

            {/* mobile */}
            <div className="md:hidden">
              <Button variant="ghost" className="border border-zinc-800 p-2" onClick={() => exportReadme()}>
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16" />

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Editor & Controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Cheat Codes Editor</div>
                        <div className="text-xs text-zinc-400">Edit • Preview • Generate</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-400">Title</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Topic / exam chapter" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Format</label>
                    <div className="flex gap-2 items-center">
                      <Select value={format} onValueChange={(v) => setFormat(v)}>
                        <SelectTrigger className="w-36 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                          <SelectValue placeholder="Format" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                          <SelectItem value="readme" className="text-white">README.md</SelectItem>
                          <SelectItem value="plain" className="text-white">Plain Markdown</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={type} onValueChange={(v) => setType(v)}>
                        <SelectTrigger className="w-44 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                          <SelectItem value="summary" className="text-white">Summary</SelectItem>
                          <SelectItem value="mnemonic" className="text-white">Mnemonic</SelectItem>
                          <SelectItem value="formula" className="text-white">Formula Sheet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Length</label>
                    <div className="flex gap-2 items-center">
                      <Select value={length} onValueChange={(v) => setLength(v)}>
                        <SelectTrigger className="w-36 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                          <SelectValue placeholder="Length" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                          <SelectItem value="short" className="text-white">Short</SelectItem>
                          <SelectItem value="medium" className="text-white">Medium</SelectItem>
                          <SelectItem value="long" className="text-white">Long</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex-1">
                        <label className="text-xs text-zinc-400">Difficulty</label>
                        <input type="range" min="1" max="5" value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className="w-full" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Focus level (%)</label>
                    <input type="range" min="10" max="100" value={focus} onChange={(e) => setFocus(Number(e.target.value))} className="w-full" />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Editor</label>
                    <div className="flex gap-2 mb-2">
                      <Button variant={mode === "edit" ? undefined : "ghost"} onClick={() => setMode("edit")} className="flex-1 text-sm"><Edit3 className="w-4 h-4 mr-2" /> Edit</Button>
                      <Button variant={mode === "preview" ? undefined : "ghost"} onClick={() => setMode("preview")} className="flex-1 text-sm"><Eye className="w-4 h-4 mr-2" /> Preview</Button>
                    </div>

                    {mode === "edit" ? (
                      <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} className="bg-zinc-900/60 border border-zinc-800 text-white" placeholder="Write or generate cheat notes in markdown..." />
                    ) : (
                      <div className="rounded-md p-3 bg-zinc-900/60 border border-zinc-800 max-h-64 overflow-auto">
                        {content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                            {content}
                          </ReactMarkdown>
                        ) : (
                          <div className="text-zinc-500 text-sm">No content yet. Generate or type to preview.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-2">
                    <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={generateNote} disabled={generating}>
                      {generating ? <span className="flex items-center"><Sparkles className="w-4 h-4 mr-2 animate-pulse" /> Generating...</span> : <span className="flex items-center"><Play className="w-4 h-4 mr-2" /> Generate</span>}
                    </Button>
                    <Button variant="ghost" className="border border-zinc-800" onClick={stopGeneration} disabled={!generating}><StopCircle className="w-4 h-4 mr-2" /> Stop</Button>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <Button onClick={saveCurrent} className="flex-1 bg-zinc-800/60 border border-zinc-700"><Save className="w-4 h-4 mr-2" /> Save</Button>
                    <Button variant="ghost" className="border border-zinc-800" onClick={exportReadme}><Download className="w-4 h-4 mr-2" /> Export .md</Button>
                    <Button variant="destructive" className="border border-red-600" onClick={() => { setTitle(""); setContent(""); toast("Cleared"); }}><Trash2 className="w-4 h-4 mr-2" /> Clear</Button>
                  </div>

                </CardContent>
              </Card>
            </motion.div>

            {/* Saved notes list */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-[#ffd24a] flex items-center gap-2"><GitBranch className="w-4 h-4" /> Saved Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-auto">
                    {notesList.length === 0 && <div className="text-xs text-zinc-500">No saved notes yet.</div>}
                    {notesList.map((n) => (
                      <div key={n.id} className="p-2 rounded-md bg-zinc-900/30 border border-zinc-800 flex items-start gap-2">
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{n.title}</div>
                          <div className="text-xs text-zinc-400">{new Date(n.savedAt).toLocaleString()}</div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" className="p-1" onClick={() => { setTitle(n.title); setContent(n.content); setMode("preview"); toast("Loaded note"); }}><Eye className="w-4 h-4" /></Button>
                          <Button variant="ghost" className="p-1" onClick={() => { navigator.clipboard.writeText(n.content); toast.success("Copied content"); }}><Code className="w-4 h-4" /></Button>
                          <Button variant="ghost" className="p-1" onClick={() => deleteNote(n.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right: Visualizer + Preview + Oscilloscope */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Preview + Visualizer</div>
                        <div className="text-xs text-zinc-400">Live preview • README preview • dynamic visualizer</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Words: <span className="text-[#ffd24a] ml-1">{noteMeta.wordCount}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Type: <span className="text-[#ffd24a] ml-1">{type}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      {/* Preview panel */}
                      <div className="rounded-md p-3 bg-zinc-900/30 border border-zinc-800 max-h-[52vh] overflow-auto">
                        {content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                            {content}
                          </ReactMarkdown>
                        ) : (
                          <div className="text-zinc-500">Preview will appear here — generate or type notes.</div>
                        )}
                      </div>

                      {/* small controls */}
                      <div className="flex gap-2 mt-3">
                        <Button variant="outline" onClick={() => { setPlaying((p) => !p); toast(playing ? "Visualizer paused" : "Visualizer resumed"); }}>
                          {playing ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}{playing ? "Pause Visualizer" : "Play Visualizer"}
                        </Button>
                        <Button variant="ghost" onClick={() => { setContent(""); toast("Preview cleared"); }}><Trash2 className="w-4 h-4 mr-2" /> Clear</Button>
                      </div>
                    </div>

                    <div>
                      {/* Visualizer component */}
                      <CheatVisualizer noteMeta={noteMeta} playing={playing} />
                    </div>
                  </div>

                  {/* Oscilloscope-like time series below */}
                  <div className="mt-4">
                    <div className="text-xs text-zinc-400 mb-2">Study Flow — Oscilloscope-like trace of attention</div>
                    <div className="h-36">
                      {/* Make oscilloscope data derived from content + difficulty */}
                      <StudyOscilloscope content={content} difficulty={difficulty} focus={focus} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ===========================
   StudyOscilloscope component
   - builds time-series from content length and difficulty/focus
   =========================== */
function StudyOscilloscope({ content = "", difficulty = 2, focus = 60 }) {
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const normalized = Math.min(1, words / 600);
  const intensity = clampNumber(normalized * (difficulty / 2) * (focus / 50), 0.05, 2.5);

  // data points
  const data = Array.from({ length: 200 }).map((_, i) => {
    const t = i;
    const base = Math.sin(i * (0.02 + intensity * 0.02)) * (0.6 + intensity * 0.6);
    const drift = Math.sin(i * 0.005) * 0.2;
    return { t, V: round(base + drift, 4) };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid stroke="#111" strokeDasharray="3 3" />
        <XAxis dataKey="t" hide />
        <YAxis hide />
        <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "8px" }} />
        <Legend wrapperStyle={{ color: "#aaa" }} />
        <Line type="monotone" dataKey="V" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
