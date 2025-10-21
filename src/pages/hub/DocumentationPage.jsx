"use client";

/**
 * DocumentationPage.jsx
 *
 * Full, self-contained revision of your DocumentationPage with:
 * - Interactive, futuristic SVG animation representing tutorial steps
 * - Editable tutorials/steps via shadcn Dialog
 * - Checklist per-step that syncs with SVG visualizer
 * - LocalStorage persistence
 * - Improved useTutorialRunner (robust intervals)
 * - Lazy-loaded ReactMarkdown preview
 * - Accessibility & responsiveness
 *
 * NOTE: You asked to keep Gemini API logic in the client. That is implemented below,
 * however storing or bundling API keys in client code is insecure. Consider moving to a server
 * endpoint in production.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  FastForward,
  Rewind,
  Plus,
  Trash2,
  Edit2,
  Download,
  Check,
  X,
  Save,
  Menu,
  Settings,
  FolderOpen,
  FileText,
  Sparkles,
  BookOpen,
  RotateCcw,
  Info,
  Lightbulb,
  ListPlus,
  CheckCircle2,
  Clock,
  Calendar,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { cn } from "@/lib/utils"; 
import { GoogleGenerativeAI } from "@google/generative-ai";
// Shadcn-style components (assumes these exist in your project)
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import remarkGfm from "remark-gfm";
import ReactMarkdown from "react-markdown";

import "highlight.js/styles/atom-one-dark.css";

// -----------------------------
// Utilities
// -----------------------------
const LS_KEY = "docs_page_v1_tutorials";
const LS_UI_KEY = "docs_page_v1_ui";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = (prefix = "") =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const round = (v, p = 2) =>
  Math.round((v + Number.EPSILON) * 10 ** p) / 10 ** p;

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveToLocalStorage(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {}
}
function loadUIFromLocal() {
  try {
    const raw = localStorage.getItem(LS_UI_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveUIToLocal(data) {
  try {
    localStorage.setItem(LS_UI_KEY, JSON.stringify(data));
  } catch {}
}

// -----------------------------
// useTutorialRunner - robust runner
// -----------------------------
function useTutorialRunner({ steps = [], intervalMs = 700, autoStopAtEnd = true }) {
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const stepsRef = useRef(steps);
  const tRef = useRef(null);

  // keep ref updated for closures
  useEffect(() => {
    stepsRef.current = steps;
    // clamp index if steps shorter
    setIndex((i) => Math.min(i, Math.max(0, steps?.length - 1 || 0)));
  }, [steps]);

  useEffect(() => {
    // cleanup if unmount
    return () => {
      if (tRef.current) {
        clearInterval(tRef.current);
        tRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // if running start interval
    if (!running) {
      if (tRef.current) {
        clearInterval(tRef.current);
        tRef.current = null;
      }
      return;
    }
    if (!stepsRef.current || stepsRef.current.length === 0) {
      setRunning(false);
      return;
    }
    // clear previous
    if (tRef.current) {
      clearInterval(tRef.current);
      tRef.current = null;
    }
    tRef.current = setInterval(() => {
      setIndex((i) => {
        const next = Math.min(i + 1, stepsRef.current.length - 1);
        setLog((l) =>
          [...l, { t: Date.now(), step: next, msg: stepsRef.current[next]?.title || `Step ${next + 1}` }].slice(-200)
        );
        if (autoStopAtEnd && next >= stepsRef.current.length - 1) {
          // reached end; stop
          if (tRef.current) {
            clearInterval(tRef.current);
            tRef.current = null;
          }
          setRunning(false);
        }
        return next;
      });
    }, Math.max(50, intervalMs));
    return () => {
      if (tRef.current) {
        clearInterval(tRef.current);
        tRef.current = null;
      }
    };
  }, [running, intervalMs, autoStopAtEnd]);

  const play = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const toggle = useCallback(() => setRunning((r) => !r), []);
  const reset = useCallback(() => {
    setIndex(0);
    setLog([]);
    setRunning(false);
    if (tRef.current) {
      clearInterval(tRef.current);
      tRef.current = null;
    }
  }, []);
  const stepForward = useCallback(() => {
    setIndex((i) => {
      const nxt = Math.min(i + 1, stepsRef.current.length - 1);
      setLog((l) => [...l, { t: Date.now(), step: nxt, msg: "manual forward" }].slice(-200));
      return nxt;
    });
  }, []);
  const stepBack = useCallback(() => {
    setIndex((i) => {
      const nxt = Math.max(i - 1, 0);
      setLog((l) => [...l, { t: Date.now(), step: Math.max(i - 1, 0), msg: "manual back" }].slice(-200));
      return Math.max(i - 1, 0);
    });
  }, []);
  return {
    index,
    running,
    play,
    pause,
    toggle,
    reset,
    stepBack,
    stepForward,
    setIndex,
    setRunning,
    log,
    setLog,
  };
}

// -----------------------------
// Default sample initial data
// -----------------------------
const SAMPLE_TUTORIALS = [
  {
    id: "sample-1",
    title: "How to Bake a Futuristic Pie",
    body: "Step by step guide to bake the futuristic pie.\n\n- Preheat the oven\n- Mix ingredients\n- Bake for 20 minutes",
    steps: [
      { id: "s1", title: "Preheat the oven to 220°C", checked: false },
      { id: "s2", title: "Mix the cosmic flour & synth-sugar", checked: false },
      { id: "s3", title: "Add quantum eggs and stir", checked: false },
      { id: "s4", title: "Bake for 20 minutes", checked: false },
    ],
    createdAt: Date.now(),
  },
];

// -----------------------------
// DocVisualizer - futuristic SVG
// -----------------------------
function DocVisualizer({
  steps,
  currentIndex,
  width = 1000,
  height = 220,
  accent = "#ff7a18",
  bg = "#071025",
  checkedColor = "#00d4a8",
  runnerActive = false,
  speed = 700,
  onNodeClick,
}) {
  // responsive: derive viewBox from width/height
  const paddingX = 40;
  const paddingY = 30;
  const availableWidth = Math.max(320, width) - paddingX * 2;
  const centerY = height / 2;
  const nodeCount = Math.max(1, steps.length);
  const gap = availableWidth / Math.max(1, nodeCount - 1);

  // compute positions for nodes
  const nodes = steps.map((s, i) => {
    const x = paddingX + gap * i;
    return {
      ...s,
      index: i,
      x,
      y: centerY,
    };
  });

  // runner animation progress - smooth motion
  // compute position based on currentIndex plus micro animation offset when running
  const [progressOffset, setProgressOffset] = React.useState(0);
  useEffect(() => {
    let raf = null;
    let start = performance.now();
    const loop = (t) => {
      const delta = t - start;
      // create a gentle breathing based on speed
      setProgressOffset(Math.sin(delta / Math.max(100, speed)) * 0.6);
      raf = requestAnimationFrame(loop);
    };
    if (runnerActive) {
      raf = requestAnimationFrame(loop);
    } else {
      setProgressOffset(0);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [runnerActive, speed, currentIndex]);

  // compute runner x
  const runnerX = (() => {
    if (nodeCount === 1) return nodes[0].x;
    const idx = clamp(currentIndex, 0, nodes.length - 1);
    const nextIdx = clamp(idx + 1, 0, nodes.length - 1);
    const base = nodes[idx].x;
    const next = nodes[nextIdx].x;
    // progressOffset varies [-.6, .6] - normalize to [0,1] then use to offset between nodes
    const t = 0.5 + progressOffset / 2;
    return base + (next - base) * t;
  })();

  // accessible label describing progress
  const ariaLabel = `Diagram showing ${nodeCount} steps. Current step ${currentIndex + 1} of ${nodeCount}.`;

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${Math.max(320, width)} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
        className="w-full h-auto"
      >
        {/* background subtle gradient */}
        <defs>
          <linearGradient id="bgGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#020617" stopOpacity="1" />
            <stop offset="100%" stopColor="#051226" stopOpacity="1" />
          </linearGradient>

          <linearGradient id="pathGrad" x1="0" x2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
            <stop offset="100%" stopColor="#1e90ff" stopOpacity="0.95" />
          </linearGradient>

          <radialGradient id="nodeGlow" cx="50%" cy="40%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
            <stop offset="60%" stopColor={accent} stopOpacity="0.25" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          <filter id="softBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        {/* background */}
        <rect x="0" y="0" width="100%" height="100%" fill="url(#bgGrad)" rx="12" />

        {/* path */}
        <g transform="translate(0,6)">
          <path
            d={(() => {
              // build a smooth path through nodes using quadratic curves
              if (nodes.length === 1) {
                const n = nodes[0];
                return `M ${n.x - 40} ${n.y} H ${n.x + 40}`;
              }
              let d = `M ${nodes[0].x} ${nodes[0].y}`;
              for (let i = 1; i < nodes.length; i++) {
                const prev = nodes[i - 1];
                const cur = nodes[i];
                const midX = (prev.x + cur.x) / 2;
                d += ` Q ${prev.x + (cur.x - prev.x) / 4} ${prev.y - 36}, ${midX} ${cur.y}`;
                d += ` T ${cur.x} ${cur.y}`;
              }
              return d;
            })()}
            stroke="url(#pathGrad)"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.6))" }}
          />
        </g>

        {/* moving particles along path (subtle) */}
        <g opacity="0.22">
          {nodes.map((n, i) => (
            <circle
              key={`spark-${i}`}
              cx={n.x}
              cy={n.y - 4}
              r={2 + ((i % 3) / 2)}
              fill={i <= currentIndex ? accent : "#2b3946"}
            />
          ))}
        </g>

        {/* nodes */}
        <g>
          {nodes.map((n, i) => {
            const active = i === currentIndex;
            const checked = !!n.checked;
            return (
              <g
                key={n.id || n.index}
                tabIndex={0}
                role="button"
                aria-pressed={active}
                onClick={() => onNodeClick && onNodeClick(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onNodeClick && onNodeClick(i);
                  }
                }}
                transform={`translate(${n.x}, ${n.y})`}
                style={{ cursor: "pointer" }}
              >
                {/* glow for checked */}
                {checked && (
                  <circle r={18} fill="url(#nodeGlow)" opacity={0.95} />
                )}

                {/* ring */}
                <circle
                  r={active ? 12 : 10}
                  fill={checked ? checkedColor : "#0b1220"}
                  stroke={active ? accent : "#24303b"}
                  strokeWidth={active ? 3 : 1.5}
                />

                {/* inner check icon */}
                <g transform="translate(-6,-6)" aria-hidden>
                  {checked ? (
                    <text fontSize="12" fill="#001217" fontFamily="ui-sans-serif,system-ui">
                      ✓
                    </text>
                  ) : null}
                </g>

                {/* label */}
                <foreignObject x={-110} y={18} width={220} height={48}>
                  <div
                    xmlns="http://www.w3.org/1999/xhtml"
                    className={`select-none text-xs leading-tight text-zinc-200 text-center`}
                    style={{
                      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system",
                      color: active ? "#fff" : "#9aa6b2",
                    }}
                  >
                    <strong style={{ display: "block", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {n.title}
                    </strong>
                    <span style={{ display: "block", fontSize: 10, opacity: 0.8 }}>
                      {checked ? "Done" : `Step ${i + 1}`}
                    </span>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </g>

        {/* runner */}
        <g transform={`translate(${runnerX}, ${centerY - 32})`} aria-hidden>
          <motion.g
            initial={{ scale: 0.92, y: -6, opacity: 0.9 }}
            animate={runnerActive ? { scale: [0.95, 1.05, 0.95], y: [-6, -10, -6] } : { scale: 1, y: -6 }}
            transition={{ repeat: runnerActive ? Infinity : 0, duration: Math.max(0.4, speed / 1200) }}
          >
            {/* stylized futuristic pod */}
            <rect x={-28} y={-16} rx="10" ry="10" width="56" height="32" fill="#0b1220" stroke="#0b83ff" strokeWidth="1" />
            <rect x={-22} y={-12} rx="6" ry="6" width="44" height="24" fill="url(#pathGrad)" opacity="0.9" />
            <circle cx={18} cy={0} r={6} fill="#001217" stroke="#00ffd4" strokeWidth="1" />
            <rect x={-32} y={8} width="64" height="4" rx="2" fill="#071226" opacity={0.8} />
          </motion.g>
        </g>
      </svg>
    </div>
  );
}

// -----------------------------
// StepEditorDialog (Shadcn-style)
// -----------------------------

function StepEditorDialog({ open, onOpenChange, step, onSave, onDelete, totalSteps }) {
  const [title, setTitle] = useState(step?.title || "");

  useEffect(() => {
    setTitle(step?.title || "");
  }, [step]);

  const handleDelete = () => {
    if (totalSteps <= 1) {
      toast.error("A tutorial must contain at least one step.");
      return;
    }
    onDelete?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-full md:w-96 overflow-auto bg-black/80 border border-zinc-800 rounded-xl backdrop-blur-md">
        <DialogHeader>
          <DialogTitle className="text-orange-400">Edit Step</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Modify the step title and save changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <Label className="text-zinc-300">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-zinc-900/50 border border-zinc-700 text-white placeholder-zinc-400"
            placeholder="Step title..."
          />
        </div>

        <DialogFooter className="flex flex-col sm:flex-row justify-between gap-2 mt-4">
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex items-center cursor-pointer gap-2 text-sm bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black hover:scale-105 transition-transform"
              onClick={handleDelete}
            >
              <Trash2 size={16} /> Delete
            </Button>
          </div>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="text-black cursor-pointer border-zinc-700 hover:border-orange-500 hover:text-orange-400">
                Cancel
              </Button>
            </DialogClose>
            <Button
              className="flex items-center cursor-pointer gap-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black hover:scale-105 transition-transform"
              onClick={() => { onSave({ ...step, title: title.trim() || "New Step" }); onOpenChange(false); }}
            >
              <Save size={14} /> Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




function TutorialEditorDialog({ open, onOpenChange, tutorial, onSave }) {
  const [title, setTitle] = useState(tutorial?.title || "");
  const [body, setBody] = useState(tutorial?.body || "");
  const [localSteps, setLocalSteps] = useState(tutorial?.steps || []);

  useEffect(() => {
    setTitle(tutorial?.title || "");
    setBody(tutorial?.body || "");
    setLocalSteps((tutorial?.steps || []).map((s) => ({ ...s })));
  }, [tutorial]);

  const addStep = () => {
    setLocalSteps((s) => [...s, { id: uid("st-"), title: "New step", checked: false }]);
  };

  const updateStep = (idx, update) => {
    setLocalSteps((s) => s.map((st, i) => (i === idx ? { ...st, ...update } : st)));
  };

 const deleteStep = (idx) => {
  if (localSteps.length <= 1) {
    toast.error("A tutorial must contain at least one step.");
    return;
  }
  setLocalSteps((s) => s.filter((_, i) => i !== idx));
};

  const moveStep = (from, to) => {
    setLocalSteps((s) => {
      const arr = [...s];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto bg-zinc-950/80 border border-zinc-800 backdrop-blur-lg rounded-2xl p-4 shadow-lg">
        <DialogHeader>
          <DialogTitle className="text-orange-400">Edit Tutorial</DialogTitle>
          <DialogDescription className="text-zinc-300">
            Edit the tutorial title, body, and steps. Scroll for long tutorials.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Left: Title & Body */}
          <div className="space-y-3">
            <Label className="text-zinc-200">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-zinc-900/40 border border-zinc-800 text-zinc-100 placeholder-zinc-400"
            />

            <Label className="text-zinc-200">Body (Markdown)</Label>
            <Textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="bg-zinc-900/40 border border-zinc-800 text-zinc-100 placeholder-zinc-400"
            />
          </div>

          {/* Right: Steps */}
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Label className="mb-0 text-zinc-200">Steps</Label>
                <Badge className="bg-orange-500/20 text-orange-300 border border-orange-400/30">{localSteps.length}</Badge>
              </div>
              <Button size="sm" onClick={addStep} className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black shadow-sm hover:scale-105 transition-transform">
                <Plus size={14} /> Add Step
              </Button>
            </div>

            <div className="flex-1 overflow-auto space-y-2 p-2 bg-zinc-900/30 rounded scrollbar-thin scrollbar-thumb-orange-600 scrollbar-track-zinc-800">
              {localSteps.map((st, i) => (
                <div key={st.id} className="flex items-center gap-2 p-2 bg-zinc-900/50 border border-zinc-800 rounded">
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-orange-400 cursor-pointer hover:bg-black hover:text-orange-300"
                      onClick={() => moveStep(i, Math.max(0, i - 1))}
                      aria-label="Move up"
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-orange-400 cursor-pointer hover:bg-black hover:text-orange-300"
                      onClick={() => moveStep(i, Math.min(localSteps.length - 1, i + 1))}
                      aria-label="Move down"
                    >
                      <ArrowDown size={14} />
                    </Button>
                  </div>

                  <div className="flex-1">
                    <Input
                      value={st.title}
                      onChange={(e) => updateStep(i, { title: e.target.value })}
                      className="bg-zinc-900/40 border border-zinc-800 text-zinc-100"
                    />
                  </div>

                  <Button variant="ghost" size="sm" onClick={() => deleteStep(i)} className="text-red-400 cursor-pointer hover:bg-black hover:text-red-500">
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between mt-4">
          <Button className='cursor-pointer hover:bg-black text-orange-300 border border-zinc-500/50 hover:text-orange-500' variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>

          <div className="flex gap-2">
            <DialogClose asChild>
              <Button className="cursor-pointer" variant="outline">Close</Button>
            </DialogClose>
            <Button
              onClick={() => {
                onSave({
                  ...tutorial,
                  title: title.trim() || "Untitled tutorial",
                  body: body || "",
                  steps: localSteps.map((s) => ({ ...s })),
                });
                onOpenChange(false);
              }}
              className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black hover:scale-105 transition-transform"
            >
              <Save size={14} /> Save Tutorial
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



// -----------------------------
// Main Component
// -----------------------------
export default function DocumentationPage() {
  // load tutorials from localStorage or default
  const saved = useMemo(() => loadFromLocalStorage(), []);
  const [tutorials, setTutorials] = useState(saved?.length ? saved : SAMPLE_TUTORIALS);
  const uiSaved = useMemo(() => loadUIFromLocal(), []);
  const [selectedId, setSelectedId] = useState(() => {
    if (uiSaved?.selectedId) return uiSaved.selectedId;
    return tutorials?.[0]?.id || null;
  });

  // UI state persisted
  const [speed, setSpeed] = useState(() => uiSaved?.speed ?? 700);
  const [autoStopAtEnd, setAutoStopAtEnd] = useState(() => uiSaved?.autoStop ?? true);

  // selected tutorial derivative
  const selectedTutorial = useMemo(() => tutorials.find((t) => t.id === selectedId) || tutorials[0] || null, [tutorials, selectedId]);

  // editor local body and sync
  const [editorValue, setEditorValue] = useState(selectedTutorial?.body || "");
  useEffect(() => {
    setEditorValue(selectedTutorial?.body || "");
  }, [selectedTutorial?.id]);

  // runner hook
  const { index: currentIndex, running, play, pause, toggle, reset, stepBack, stepForward, setIndex, setRunning, log } = useTutorialRunner({
    steps: selectedTutorial?.steps || [],
    intervalMs: speed,
    autoStopAtEnd,
  });

  // dialog states
  const [editorDialogOpen, setEditorDialogOpen] = useState(false);
  const [stepEditorOpen, setStepEditorOpen] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState(null);

  // save tutorials to local storage on change
  useEffect(() => {
    saveToLocalStorage(tutorials);
  }, [tutorials]);

  // save UI prefs
  useEffect(() => {
    saveUIToLocal({ speed, selectedId, autoStop: autoStopAtEnd });
  }, [speed, selectedId, autoStopAtEnd]);

  // create new tutorial
  function createNewTutorial() {
    const id = uid("tut-");
    const newTut = {
      id,
      title: "Untitled Tutorial",
      body: "Write tutorial markdown here...",
      steps: [{ id: uid("s-"), title: "First step", checked: false }],
      createdAt: Date.now(),
    };
    setTutorials((s) => [newTut, ...s]);
    setSelectedId(id);
    setEditorDialogOpen(true);
    toast.success("New tutorial created");
  }

  // update tutorial
  function updateTutorial(updated) {
    setTutorials((list) => list.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    toast.success("Tutorial saved");
  }

function deleteTutorial(id) {
  if (tutorials.length <= 1) {
    toast.error("At least one tutorial must remain.");
    return;
  }

  const next = tutorials.filter((t) => t.id !== id);
  setTutorials(next);

  if (selectedId === id) {
    setSelectedId(next?.[0]?.id || null);
  }

  toast.success("Deleted tutorial");
}


  // step check toggle
  function toggleStepChecked(idx) {
    if (!selectedTutorial) return;
    const t = { ...selectedTutorial };
    t.steps = t.steps.map((s, i) => (i === idx ? { ...s, checked: !s.checked } : s));
    updateTutorial(t);
  }

  // edit step
  function openEditStep(idx) {
    setEditingStepIndex(idx);
    setStepEditorOpen(true);
  }
  function saveStepEdits(updatedStep) {
    if (!selectedTutorial) return;
    const t = { ...selectedTutorial };
    t.steps = t.steps.map((s) => (s.id === updatedStep.id ? updatedStep : s));
    updateTutorial(t);
    setEditingStepIndex(null);
  }
  function deleteStepFromTut(stepId) {
    if (!selectedTutorial) return;
    const t = { ...selectedTutorial };
    t.steps = t.steps.filter((s) => s.id !== stepId);
    updateTutorial(t);
    setEditingStepIndex(null);
  }

  // handle node click in SVG
  function handleNodeClick(i) {
    setIndex(i);
    setRunning(false);
  }

  // export current tutorial
  function exportTutorial(tut) {
    const blob = new Blob([JSON.stringify(tut, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(tut.title || "tutorial").replace(/\s+/g, "-").replace(/[^\w\-]/g, "")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast.success("Exported tutorial");
  }

  // import tutorial file
  async function importTutorialFile(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.id) parsed.id = uid("tut-");
      if (!parsed.steps) parsed.steps = parsed.steps || [];
      setTutorials((s) => [parsed, ...s]);
      setSelectedId(parsed.id);
      toast.success("Imported tutorial");
    } catch (e) {
      toast.error("Failed to import");
    }
  }

  // save editor content to tutorial body
  function saveEditorToTutorial() {
    if (!selectedTutorial) return;
    updateTutorial({ ...selectedTutorial, body: editorValue });
  }

  // Gemini generation logic (retained in client per user request)
  // WARNING: Keeping API keys in the client is insecure. Only do this for prototypes.
 const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-2.0-flash-exp"; // or gemini-1.5-pro
 // user insisted no backend; leave empty by default

  async function generateWithGemini(prompt) {
     if (!GEMINI_API_KEY) {
    toast.error("Missing Gemini API key in .env (VITE_GEMINI_API_KEY).");
    return;
  }

  try {
    toast("Generating with Gemini...", { icon: <Play size={14} /> });

    // Initialize Gemini client
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    // Generate text
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const content = response.text().trim();

    if (!content) {
      toast.error("Empty response from Gemini.");
      return;
    }

    // Integrate generated content
    if (!selectedTutorial) {
      createNewTutorial();
      return;
    }

    updateTutorial({
      ...selectedTutorial,
      body: `${selectedTutorial.body}\n\n${content}`,
    });

    toast.success("✅ AI content added to tutorial!");
  } catch (err) {
    console.error(err);
    toast.error("Gemini generation failed. Check your API key or network.");
  }
  }

  // compute stats
  const wordCount = useMemo(() => {
    if (!editorValue) return 0;
    return editorValue.trim().split(/\s+/).filter(Boolean).length;
  }, [editorValue]);

  // responsive container width measurement
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(900);
  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width || 900;
      setContainerWidth(Math.max(320, Math.round(w)));
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // handle editing step dialog actions
  const currentEditingStep = selectedTutorial && editingStepIndex != null ? selectedTutorial.steps?.[editingStepIndex] : null;
  function onSaveStepFromDialog(step) {
    // step contains id/title/checked
    if (!selectedTutorial) return;
    const t = { ...selectedTutorial, steps: selectedTutorial.steps.map((s) => (s.id === step.id ? { ...s, ...step } : s)) };
    updateTutorial(t);
  }
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen p-4 md:p-6   bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-zinc-200 " ref={containerRef}>

      <Toaster richColors />

      {/* Header */}
    <header className="fixed w-full left-0 top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2 sm:py-0">
      <div className="max-w-8xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Top Row */}
        <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
          {/* Logo + Title */}
          <motion.div
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.36 }}
            className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
              <Sparkles className="w-5 h-5 text-black" />
            </div>
            <div className="truncate">
              <div className="text-sm font-semibold text-zinc-200 truncate">
                Documentation Studio
              </div>
              <div className="text-xs text-zinc-400 -mt-0.5 truncate">
                Interactive step-by-step visual tutorial builder
              </div>
            </div>
          </motion.div>

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center gap-4">
            {/* Speed Input */}
            <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 rounded-md px-3 py-1.5 backdrop-blur-sm">
              <Label className="text-xs text-zinc-400">Speed</Label>
              <Input
                value={speed}
                onChange={(e) =>
                  setSpeed(clamp(Number(e.target.value || 700), 50, 5000))
                }
                className="w-20 bg-black/40 border-zinc-800 text-zinc-200 text-sm"
                type="number"
                min={50}
                max={5000}
              />
            </div>

            {/* Action Buttons */}
            <Button
              className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1.5 rounded-lg shadow-md hover:scale-105 transition-transform duration-200"
              onClick={() => setEditorDialogOpen(true)}
            >
              <Edit2 className="w-4 h-4 mr-1" /> Edit
            </Button>

            <Button
              variant="ghost"
              className="border cursor-pointer border-zinc-700  text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200"
              onClick={createNewTutorial}
            >
              <Plus className="w-5 h-5" />
            </Button>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => exportTutorial(selectedTutorial)}
                disabled={!selectedTutorial}
                className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200"
              >
                <Download className="w-5 h-5" />
              </Button>

              <input
                id="import-file"
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importTutorialFile(f);
                  e.currentTarget.value = "";
                }}
              />
         
            </div>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              className="border cursor-pointer text-orange-400 hover:bg-black hover:text-orange-500 border-zinc-800 p-2 rounded-lg"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Slide-down Menu */}
        <div
          className={`md:hidden transition-all duration-300 overflow-hidden ${
            mobileOpen ? "max-h-60 py-3" : "max-h-0"
          }`}
        >
          <div className="flex flex-col gap-2 mb-3">
            {/* Speed */}
            <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 rounded-md px-3 py-2 backdrop-blur-sm">
              <Label className="text-xs text-zinc-400">Speed</Label>
              <Input
                value={speed}
                onChange={(e) =>
                  setSpeed(clamp(Number(e.target.value || 700), 50, 5000))
                }
                className="w-24 bg-black/40 border-zinc-800 text-zinc-200 text-sm"
                type="number"
                min={50}
                max={5000}
              />
            </div>

            {/* Mobile Buttons */}
            <div className="flex flex-row gap-2">
              <Button
                className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md"
                onClick={() => setEditorDialogOpen(true)}
              >
                <Edit2 className="w-4 h-4 mr-1" /> Edit
              </Button>
              <Button
                variant="ghost"
                className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-orange-400"
                onClick={createNewTutorial}
              >
                New
              </Button>
              <Button
                variant="ghost"
                className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-orange-400"
                onClick={() => exportTutorial(selectedTutorial)}
              >
                Export
              </Button>
             
            </div>
          </div>
        </div>
      </div>
    </header>
 
      <main className="grid mt-20 grid-cols-1 md:grid-cols-12 gap-4 overflow-hidden">
        {/* Left column: tutorials list */}
        <aside className="md:col-span-3 space-y-3">
<Card className="p-3 bg-black/60 border border-zinc-800 rounded-xl shadow-lg backdrop-blur-md">
  <CardHeader className="pb-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-orange-400" />
        <h3 className="text-sm font-semibold text-zinc-100 tracking-wide">
          Tutorials
        </h3>
      </div>
      <Badge
        variant="outline"
        className="border-orange-500 text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 transition-colors duration-200"
      >
        {tutorials.length}
      </Badge>
    </div>
  </CardHeader>

  <CardContent className="p-1">
    <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
      {tutorials.length === 0 ? (
        <div className="text-center py-6 text-sm text-zinc-500">
          No tutorials yet. <span className="text-orange-400">Create one!</span>
        </div>
      ) : (
        tutorials.map((t) => (
          <motion.div
            key={t.id}
            whileHover={{ scale: 1.00, backgroundColor: "rgba(255, 154, 74, 0.05)" }}
            transition={{ duration: 0.2 }}
            className={`p-3 rounded-lg border transition-all duration-300 cursor-pointer ${
              t.id === selectedId
                ? "border-orange-500/70 bg-orange-500/10 shadow-md"
                : "border-zinc-800 hover:border-orange-400/30"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              {/* Tutorial Info */}
              <div
                className=" text-left truncate"
                onClick={() => setSelectedId(t.id)}
              >
                <div
                  className={`font-medium  truncate ${
                    t.id === selectedId
                      ? "text-orange-300"
                      : "text-zinc-100 hover:text-orange-400"
                  }`}
                >
                  {t.title}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {t.steps?.length || 0} steps •{" "}
                  {round((t.body || "").split(/\s+/).length / 200, 1)} min read
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-zinc-400 cursor-pointer hover:text-orange-400 hover:bg-orange-500/10 p-1.5"
                  onClick={() => {
                    setSelectedId(t.id);
                    setEditorDialogOpen(true);
                  }}
                  title="Edit Tutorial"
                >
                  <Edit2 size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-zinc-400 cursor-pointer hover:text-orange-400 hover:bg-orange-500/10 p-1.5"
                  onClick={() => exportTutorial(t)}
                  title="Export Tutorial"
                >
                  <Download size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-zinc-400 cursor-pointer hover:text-red-400 hover:bg-red-500/10 p-1.5"
                  onClick={() => deleteTutorial(t.id)}
                  title="Delete Tutorial"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
  </CardContent>
</Card>


<Card className="p-3 bg-black/60 border border-zinc-800 rounded-xl shadow-lg backdrop-blur-md">
  <CardHeader className="pb-2">
    <div className="flex items-center gap-2">
      <Settings className="w-4 h-4 text-orange-400" />
      <h3 className="text-sm font-semibold text-zinc-100 tracking-wide">
        Controls
      </h3>
    </div>
  </CardHeader>

  <CardContent>
    {/* Action Buttons */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Button
        onClick={toggle}
        aria-pressed={running}
        className={`flex items-center cursor-pointer hover:bg-black justify-center gap-2 text-sm font-medium py-2 rounded-md transition-all duration-300 ${
          running
            ? "bg-orange-500 text-black hover:bg-orange-400 shadow-lg shadow-orange-500/30"
            : "bg-zinc-900/60 text-zinc-200 hover:text-orange-400 hover:border-orange-400/30 border border-zinc-800"
        }`}
      >
        {running ? (
          <>
            <Pause size={16} className="text-black" /> Pause
          </>
        ) : (
          <>
            <Play size={16} className="text-orange-400" /> Play
          </>
        )}
      </Button>

      <Button
        onClick={reset}
        className="flex items-center cursor-pointer hover:bg-black justify-center gap-2 bg-zinc-900/60 text-zinc-300 hover:text-orange-400 hover:border-orange-400/30 border border-zinc-800 rounded-md transition-all duration-300"
      >
        <RotateCcw size={16} className="text-orange-400" /> Reset
      </Button>

      <Button
        onClick={stepBack}
        className="flex items-center cursor-pointer hover:bg-black justify-center gap-2 bg-zinc-900/60 text-zinc-300 hover:text-orange-400 hover:border-orange-400/30 border border-zinc-800 rounded-md transition-all duration-300"
      >
        <Rewind size={16} className="text-orange-400" /> Back
      </Button>

      <Button
        onClick={stepForward}
        className="flex items-center cursor-pointer hover:bg-black justify-center gap-2 bg-zinc-900/60 text-zinc-300 hover:text-orange-400 hover:border-orange-400/30 border border-zinc-800 rounded-md transition-all duration-300"
      >
        <FastForward size={16} className="text-orange-400" /> Next
      </Button>
    </div>

    {/* Runner Options */}
    <div className="mt-4">
      <Label className="text-xs uppercase tracking-wide text-zinc-400">
        Runner Settings
      </Label>
      <div className="flex items-center gap-2 mt-2 text-xs sm:text-sm">
        <Checkbox
          checked={autoStopAtEnd}
          onCheckedChange={(v) => setAutoStopAtEnd(Boolean(v))}
          className="data-[state=checked]:bg-orange-500 cursor-pointer data-[state=checked]:border-orange-400"
        />
        <span className="text-zinc-300">Stop at last step</span>
      </div>
    </div>
  </CardContent>
</Card>


         <Card className="p-4 bg-black/60 border border-zinc-800 rounded-2xl shadow-md backdrop-blur-md transition-all duration-300 hover:border-orange-400/40">
  <CardHeader className="flex items-center justify-between pb-2">
    <div className="flex items-center gap-2">
      <Info className="w-4 h-4 text-orange-400" />
      <h3 className="text-sm font-semibold text-zinc-200">Info</h3>
    </div>
    <Badge
      variant="outline"
      className="text-[10px] border-orange-400/40 bg-zinc-900/40 text-orange-300 rounded-md px-2 py-0.5"
    >
      Live Data
    </Badge>
  </CardHeader>

  <CardContent className="text-sm text-zinc-400 space-y-2">
    <div className="flex items-center justify-between">
      <span>Words</span>
      <Badge className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs font-semibold px-2 py-0.5 rounded-md">
        {wordCount}
      </Badge>
    </div>

    <div className="flex items-center justify-between">
      <span>Current Step</span>
      <Badge className="bg-zinc-900 border border-zinc-700 text-orange-400 text-xs font-semibold px-2 py-0.5 rounded-md">
        {selectedTutorial
          ? Math.min(currentIndex + 1, selectedTutorial.steps.length)
          : 0}
      </Badge>
    </div>

    <div className="mt-3 text-xs text-zinc-500 leading-relaxed flex items-start gap-2">
      <Lightbulb className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
      <span>
        Tip: Click a node on the visualizer to jump to that step. Toggle the checklist to mark completion.
      </span>
    </div>
  </CardContent>
</Card>

        </aside>

        {/* Main editor & visualizer */}
        <section className="md:col-span-6 space-y-3">
<Card className="bg-black/60 border border-zinc-800 rounded-2xl shadow-md backdrop-blur-md transition-all duration-300 hover:border-orange-400/40">
  <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
    {/* Title & Stats */}
    <div>
      <h2 className="text-lg font-semibold text-[#ffd24a] tracking-tight">
        {selectedTutorial?.title || "Select or create a tutorial"}
      </h2>
      <div className="text-xs text-zinc-400 flex items-center gap-2 mt-1">
        <Badge
          variant="outline"
          className="text-[10px] border-orange-400/40 bg-zinc-900/40 text-orange-300 rounded-md px-2 py-0.5"
        >
          {selectedTutorial?.steps?.length || 0} Steps
        </Badge>
        <Badge
          variant="outline"
          className="text-[10px] border-orange-400/40 bg-zinc-900/40 text-orange-300 rounded-md px-2 py-0.5"
        >
          {round(wordCount / 250, 1)} Min Read
        </Badge>
      </div>
    </div>

    {/* Actions */}
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={saveEditorToTutorial}
        className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg shadow-md hover:scale-105 transition-transform duration-200"
      >
        <Save size={14} className="mr-1" /> Save
      </Button>
      <Button
        onClick={() => generateWithGemini(editorValue)}
        className="bg-zinc-900/70 border cursor-pointer border-orange-500/30 text-orange-300 hover:text-white hover:bg-orange-500/20 transition-all duration-200 text-xs sm:text-sm"
      >
        <Sparkles size={14} className="mr-1" /> Generate
      </Button>
      <Button
        variant="outline"
        onClick={() => setEditorDialogOpen(true)}
        className="text-black cursor-pointer hover:bg-black border-zinc-700 hover:border-orange-400 hover:text-orange-300 text-xs sm:text-sm"
      >
        <Edit2 size={14} className="mr-1" /> Edit
      </Button>
    </div>
  </CardHeader>

  <CardContent className="pt-4">
    <div className="grid grid-cols-1  gap-5">
      {/* Left: Editor */}
      <div>
        <Label className="text-xs uppercase tracking-wide text-zinc-400">
          Editor (Markdown)
        </Label>
        <Textarea
          value={editorValue}
          onChange={(e) => setEditorValue(e.target.value)}
          rows={12}
          className="bg-zinc-900/50 border max-h-100 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 mt-2 rounded-md focus-visible:ring-1 focus-visible:ring-orange-500 resize-y"
        />

        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            size="sm"
            onClick={saveEditorToTutorial}
            className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black hover:scale-105 transition-transform duration-200"
          >
            <Save size={12} className="mr-1" /> Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-zinc-300 cursor-pointer hover:bg-black border border-zinc-500/50 hover:text-orange-400"
            onClick={() => {
              setEditorValue(selectedTutorial?.body || "");
              toast("Reverted");
            }}
          >
            <RotateCcw size={12} className="mr-1" /> Revert
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-700 text-zinc-950 cursor-pointer hover:bg-black hover:border-orange-400 hover:text-orange-300"
            onClick={() => setEditorValue((v) => `${v}\n\n- New bullet`)}
          >
            <ListPlus size={12} className="mr-1" /> Add Bullet
          </Button>
        </div>
      </div>

      {/* Right: Markdown Preview */}
      <div>
        <Label className="text-xs uppercase tracking-wide text-zinc-400">
          Preview
        </Label>
        <div className="mt-2 p-4 bg-zinc-900/30 border border-zinc-800 rounded-lg text-sm max-h-[320px] overflow-auto leading-relaxed">
<div className="mt-2 p-4 bg-zinc-950/40 border border-zinc-800 rounded-xl text-sm leading-relaxed max-h-[320px] overflow-auto font-inter
  scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-zinc-900 transition-all duration-300 hover:border-orange-400/30">
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h1: ({ node, ...props }) => (
        <h1 className="text-xl font-bold text-[#ff9a4a] mt-3 mb-2 border-b border-zinc-800 pb-1" {...props} />
      ),
      h2: ({ node, ...props }) => (
        <h2 className="text-lg font-semibold text-orange-400 mt-3 mb-1" {...props} />
      ),
      h3: ({ node, ...props }) => (
        <h3 className="text-md font-semibold text-orange-300 mt-2 mb-1" {...props} />
      ),
      p: ({ node, ...props }) => (
        <p className="text-zinc-300 mb-2" {...props} />
      ),
      strong: ({ node, ...props }) => (
        <strong className="text-orange-300 font-semibold" {...props} />
      ),
      em: ({ node, ...props }) => (
        <em className="text-orange-400/80 italic" {...props} />
      ),
      a: ({ node, ...props }) => (
        <a
          className="text-orange-400 hover:text-orange-300 underline decoration-dotted transition-colors duration-200"
          target="_blank"
          rel="noopener noreferrer"
          {...props}
        />
      ),
      ul: ({ node, ...props }) => (
        <ul className="list-disc list-inside text-zinc-300 space-y-1 ml-4" {...props} />
      ),
      ol: ({ node, ...props }) => (
        <ol className="list-decimal list-inside text-zinc-300 space-y-1 ml-4" {...props} />
      ),
      blockquote: ({ node, ...props }) => (
        <blockquote
          className="border-l-2 border-orange-500/40 pl-3 italic text-zinc-400 bg-zinc-900/40 rounded-md py-1"
          {...props}
        />
      ),
      code: ({ inline, className, children, ...props }) =>
        inline ? (
          <code
            className="bg-zinc-900/70 border border-orange-500/20 text-orange-300 rounded-md px-1.5 py-0.5 text-xs"
            {...props}
          >
            {children}
          </code>
        ) : (
          <pre
            className="bg-zinc-900/80 border border-orange-400/30 rounded-lg p-3 overflow-x-auto mt-2 mb-3 text-xs text-orange-300 font-mono"
            {...props}
          >
            <code>{children}</code>
          </pre>
        ),
      hr: () => <hr className="my-3 border-zinc-800" />,
      table: ({ node, ...props }) => (
        <div className="overflow-x-auto mt-2 mb-3">
          <table className="w-full border border-zinc-800 rounded-md text-zinc-300 text-sm" {...props} />
        </div>
      ),
      th: ({ node, ...props }) => (
        <th className="bg-zinc-900 text-orange-300 border border-zinc-800 px-2 py-1 text-left font-semibold" {...props} />
      ),
      td: ({ node, ...props }) => (
        <td className="border border-zinc-800 px-2 py-1" {...props} />
      ),
    }}
  >
    {editorValue || "Nothing to preview yet."}
  </ReactMarkdown>
</div>

        </div>
      </div>
    </div>
  </CardContent>
</Card>


          {/* visualizer card */}
<Card className="bg-zinc-950/40 border border-zinc-800 backdrop-blur-xl shadow-lg hover:border-orange-500/30 transition-all duration-300">
  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div className="flex items-center gap-2">
      <CheckCircle2 className="w-4 h-4 text-orange-400" />
      <h3 className="text-sm sm:text-base font-semibold text-zinc-100">
        Interactive Visualizer
      </h3>
    </div>

    <div className="flex items-center gap-2">
      <Badge
        variant="secondary"
        className="bg-orange-500/20 text-orange-300 border border-orange-400/30"
      >
        {selectedTutorial?.steps?.length || 0} steps
      </Badge>
      <Button
        variant="outline"
        size="sm"
        className="border-orange-500/30 cursor-pointer hover:text-orange-500 hover:bg-orange-500/20 text-orange-600"
        onClick={() => {
          setIndex(0);
          setRunning(true);
        }}
      >
        <Play size={12} className="mr-1" /> Play from start
      </Button>
    </div>
  </CardHeader>

  <CardContent>
    <div className="w-full border border-zinc-800 bg-zinc-900/30 rounded-lg p-2 transition-all duration-300 hover:border-orange-500/30">
      <DocVisualizer
        steps={selectedTutorial?.steps || []}
        currentIndex={currentIndex}
        width={containerWidth - 40}
        height={220}
        accent="#ff9a4a"
        checkedColor="#6ef0c5"
        runnerActive={running}
        speed={speed}
        onNodeClick={(i) => handleNodeClick(i)}
      />
    </div>

    {/* Checklist Section */}
    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-2">
      {(selectedTutorial?.steps || []).map((st, i) => (
        <motion.div
          key={st.id}
          whileHover={{ scale: 1.01, backgroundColor: "rgba(255, 154, 74, 0.08)" }}
          className="flex items-start gap-2 p-3 rounded-lg bg-zinc-900/40 border border-zinc-800 hover:border-orange-500/30 transition-all duration-300"
        >
          <Checkbox
            checked={!!st.checked}
            onCheckedChange={() => toggleStepChecked(i)}
            aria-label={`Mark step ${i + 1} done`}
            className="data-[state=checked]:bg-orange-500 cursor-pointer data-[state=checked]:border-orange-400"
          />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm text-zinc-100">
                {st.title}
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="hover:bg-orange-500/20 cursor-pointer text-zinc-400 hover:text-orange-300"
                  onClick={() => {
                    setSelectedId(selectedTutorial.id);
                    openEditStep(i);
                  }}
                >
                  <Edit2 size={14} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="hover:bg-red-500/20 cursor-pointer text-zinc-400 hover:text-red-400"
                  onClick={() => {
                   if ((selectedTutorial.steps || []).length <= 1) {
                  toast.error("A tutorial must contain at least one step.");
                } else {
                  const t = { ...selectedTutorial };
                  t.steps = t.steps.filter((_, idx) => idx !== i);
                  updateTutorial(t);
                  toast.success("Step deleted");
                }

                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              Step {i + 1}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  </CardContent>

  <CardFooter className="flex flex-wrap justify-between text-xs text-zinc-400 mt-3">
    <div className="flex items-center gap-1">
      <Play size={12} className="text-orange-400" />
      <span>Ticking steps updates the visualizer instantly.</span>
    </div>
    <div className="hidden sm:block">
      Click nodes to jump between tutorial steps.
    </div>
  </CardFooter>
</Card>

        </section>

        {/* Right column: logs + metadata */}
        <aside className="md:col-span-3 space-y-3">
         <Card className="bg-zinc-950/40 border border-zinc-800 backdrop-blur-xl shadow-md rounded-2xl">
  <CardHeader className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Clock className="w-4 h-4 text-orange-400" />
      <h3 className="text-sm sm:text-base font-semibold text-zinc-100">Activity Log</h3>
    </div>
    <Badge className="bg-orange-500/20 text-orange-300 border border-orange-400/30">
      {log.length} entries
    </Badge>
  </CardHeader>

  <CardContent className="max-h-[40vh] overflow-auto space-y-2">
    {log.slice().reverse().map((l, idx) => (
      <motion.div
        key={l.t + "-" + idx}
        whileHover={{ scale: 1.02, backgroundColor: "rgba(255,154,74,0.1)" }}
        className="flex items-center gap-2 p-2 rounded-lg cursor-pointer bg-zinc-900/30 border border-zinc-800 transition-all duration-200"
      >
        <div className="flex-shrink-0 text-xs text-zinc-400 w-20 sm:w-24">
          {new Date(l.t).toLocaleTimeString()}
        </div>
        <div className="text-sm text-zinc-100 break-words">{l.msg}</div>
      </motion.div>
    ))}
    {!log.length && (
      <div className="text-xs text-zinc-500 italic text-center py-2">
        No activity yet
      </div>
    )}
  </CardContent>
</Card>

         <Card className="bg-zinc-950/40 border border-zinc-800 backdrop-blur-xl shadow-md rounded-2xl p-3">
  <CardHeader className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <FileText className="w-4 h-4 text-orange-400" />
      <h3 className="text-sm sm:text-base font-semibold text-zinc-100">Metadata</h3>
    </div>
    <Badge className="bg-orange-500/20 text-orange-300 border border-orange-400/30">
      {selectedTutorial?.steps?.length || 0} steps
    </Badge>
  </CardHeader>

  <CardContent className="space-y-2 text-sm text-zinc-300">
    <div className="flex items-center gap-2">
      <span className="font-medium text-zinc-100">Title:</span>
      <span>{selectedTutorial?.title || "—"}</span>
    </div>

    <div className="flex items-center gap-2">
      <ListPlus className="w-4 h-4 text-orange-400" />
      <span>Steps:</span>
      <strong>{selectedTutorial?.steps?.length || 0}</strong>
    </div>

    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-orange-400" />
      <span>Created:</span>
      <strong>{selectedTutorial ? new Date(selectedTutorial.createdAt).toLocaleDateString() : "—"}</strong>
    </div>

    <div className="flex items-center gap-2">
      <span className="font-medium text-zinc-100">Word count:</span>
      <strong>{wordCount}</strong>
    </div>
  </CardContent>
</Card>
        </aside>
      </main>

      {/* Modals */}
      <TutorialEditorDialog
        open={editorDialogOpen}
        onOpenChange={setEditorDialogOpen}
        tutorial={selectedTutorial || { id: uid("temp"), title: "", body: "", steps: [] }}
        onSave={(t) => updateTutorial(t)}
      />

      <StepEditorDialog
        open={stepEditorOpen}
        onOpenChange={setStepEditorOpen}
        step={currentEditingStep}
        onSave={(newStep) => { onSaveStepFromDialog(newStep); }}
        onDelete={() => { deleteStepFromTut(currentEditingStep.id); }}
      />
    </div>
  );
}
