// src/components/SimulationPreviewSection.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import {
  Cpu,
  Activity,
  Zap,
  Radio,
  BatteryCharging,
  Play,
  Pause,
  Maximize2,
} from "lucide-react";

// shadcn Select (mobile dropdown)
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

/**
 * SimulationPreviewSection.jsx
 *
 * Features:
 *  - Responsive split layout (left: heading & controls, right: demo)
 *  - 5 demos: Oscilloscope, Circuit Flow, Spectrum, Logic Analyzer, Power Meter
 *  - Fullscreen modal to open "Live Run"
 *  - Framer-motion animations + SVG visuals (orange/black/dark theme)
 *
 * Notes:
 *  - Assumes shadcn components (Card, Tabs, Button, Dialog, Select) exist under "@/components/ui/*"
 *  - TailwindCSS styling used heavily (adjust to your theme tokens if needed)
 *
 */

/* --------------------------
   Utility: prefers-reduced-motion hook
--------------------------- */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const handler = () => setReduced(mql.matches);
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

/* --------------------------
   Oscilloscope Demo
   - Animated SVG path with small noise/jitter
   - Fixed: use a dedicated pathRef and only run RAF while playing (and not reduced)
--------------------------- */
function OscilloscopeDemo({ playing = true }) {
  const reduced = usePrefersReducedMotion();
  const svgRef = useRef(null);
  const pathRef = useRef(null);

  // generate dynamic points for path
  const pathPoints = useMemo(() => {
    const points = [];
    const width = 500;
    const mid = 100;
    for (let x = 0; x <= width; x += 10) {
      points.push([x, mid]);
    }
    return points;
  }, []);

  useEffect(() => {
    let raf;
    if (!pathRef.current) return;
    const pathEl = pathRef.current;
    let t = 0;

    function draw() {
      t += 0.02;
      const d = pathPoints
        .map(([x, mid], i) => {
          const theta = t * 2 + i * 0.14;
          const amp = 40;
          const y = mid + Math.sin(theta) * amp * (0.7 + 0.3 * Math.sin(t * 0.8 + i * 0.04));
          return `${i === 0 ? "M" : "L"} ${x} ${y.toFixed(2)}`;
        })
        .join(" ");
      // update path only when playing & not reduced
      if (!reduced) {
        pathEl.setAttribute("d", d);
      } else {
        // reduced motion: keep baseline
        pathEl.setAttribute("d", "M 0 100 L 500 100");
      }
      raf = requestAnimationFrame(draw);
    }

    // Start RAF only when playing && not reduced; otherwise set baseline and do not continuously animate
    if (playing && !reduced) {
      raf = requestAnimationFrame(draw);
    } else {
      // set baseline and do not start RAF loop
      pathEl.setAttribute("d", "M 0 100 L 500 100");
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [playing, pathPoints, reduced]);

  return (
    <div className="relative h-64 md:h-72 lg:h-80 bg-black rounded-lg border border-zinc-800 overflow-hidden">
      <svg
        ref={svgRef}
        viewBox="0 0 500 200"
        preserveAspectRatio="none"
        className="w-full h-full"
        aria-hidden
      >
        {/* glowing backdrop */}
        <defs>
          <linearGradient id="glow" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff7a18" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ffb07a" stopOpacity="0.05" />
          </linearGradient>
          <filter id="blur">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feBlend in="SourceGraphic" in2="b" />
          </filter>
        </defs>

        <rect x="0" y="0" width="500" height="200" fill="url(#glow)" opacity="0.03" />

        <path
          d={"M 0 100 L 500 100"}
          fill="none"
          stroke="#262626"
          strokeWidth="1"
          strokeOpacity="0.25"
        />

        {/* waveform (main) - use a dedicated ref so we update the right path */}
        <path
          ref={pathRef}
          d={"M 0 100 L 500 100"}
          className="waveform"
          stroke="#22c55e"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 6px 10px rgba(34,197,94,0.08))" }}
        />

        {/* overlay grid */}
        <g stroke="#111827" strokeOpacity="0.12">
          {Array.from({ length: 10 }).map((_, i) => (
            <line key={i} x1={(i * 500) / 10} y1="0" x2={(i * 500) / 10} y2="200" />
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <line key={"h" + i} x1="0" y1={(i * 200) / 4} x2="500" y2={(i * 200) / 4} />
          ))}
        </g>
      </svg>

      {/* small labels */}
      <div className="absolute bottom-2 left-3 text-xs text-zinc-400">Time/Div: 2ms • Volt/Div: 5V • CH1</div>
    </div>
  );
}

/* --------------------------
   Spectrum Analyzer Demo
   - Animated bars with staggered spring motion
   - Fixed: respect `playing` and `reduced` props so bars freeze when paused
--------------------------- */
function SpectrumDemo({ intensity = 0.7, playing = true }) {
  const reduced = usePrefersReducedMotion();

  // generate initial heights
  const bars = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    id: i,
    base: 20 + Math.round(Math.random() * 80),
  })), []);

  return (
    <div className="relative h-64 md:h-72 lg:h-80 bg-black rounded-lg border border-zinc-800 overflow-hidden px-3 py-3">
      <div className="absolute inset-0 flex items-end gap-2 px-4">
        {bars.map((b, i) => {
          // dynamic target when playing; baseline when paused/reduced
          const targetHeight = playing && !reduced ? [b.base, b.base + Math.random() * 100 * intensity, b.base] : b.base;
          return (
            <motion.div
              key={b.id}
              className="w-2 rounded-t-sm bg-gradient-to-t from-orange-600 to-orange-400"
              initial={{ height: b.base }}
              animate={reduced ? { height: b.base } : { height: targetHeight }}
              transition={{
                repeat: playing && !reduced ? Infinity : 0,
                repeatType: "mirror",
                duration: 0.8 + Math.random() * 1.2,
                ease: "easeInOut",
                delay: i * 0.02,
              }}
              style={{ alignSelf: "flex-end" }}
            />
          );
        })}
      </div>

      <div className="absolute bottom-2 left-3 text-xs text-zinc-400">Frequency Spectrum</div>
    </div>
  );
}

/* --------------------------
   Circuit Flow Demo
   - SVG schematic with animated pulses traveling along paths
   - Fixed: make pulses conditional on `playing` so they stop when paused
--------------------------- */
function CircuitFlowDemo({ compact = false, playing = true }) {
  // We will create simple wires and animate small orange circles along them using SMIL while playing,
  // and render static markers when paused.
  return (
    <div className={`relative ${compact ? "h-56" : "h-72 md:h-80 lg:h-88"} bg-gradient-to-br from-black to-zinc-900 rounded-lg border border-zinc-800 overflow-hidden p-4`}>
      {/* decorative grid background */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-orange-900/5 to-transparent pointer-events-none" />

      {/* simple schematic using SVG */}
      <svg viewBox="0 0 600 320" preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        <defs>
          <linearGradient id="wire" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff8a2b" stopOpacity="1" />
            <stop offset="100%" stopColor="#ffd7b2" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* components */}
        <g stroke="none" fill="none">
          {/* battery */}
          <rect x="36" y="40" width="52" height="120" rx="6" fill="#0b0b0b" stroke="#ff7a18" strokeOpacity="0.15" />
          <text x="44" y="100" fill="#ff7a18" fontSize="12">BAT</text>

          {/* resistor */}
          <rect x="200" y="120" width="40" height="24" fill="#111827" stroke="#ff8a2b" strokeOpacity="0.12" rx="4" />
          <text x="210" y="136" fill="#ffb07a" fontSize="11">R</text>

          {/* LED */}
          <circle cx="460" cy="160" r="18" fill="#000" stroke="#ff8a2b" strokeWidth="2" />
          <circle cx="460" cy="160" r="6" fill="#ffb07a" />
        </g>

        {/* wires (animated pulses travel along path using strokeDashoffset animation) */}
        <g stroke="url(#wire)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          {/* left to resistor */}
          <path id="p1" d="M 88 100 L 190 132" strokeDasharray="8 8" />
          {/* resistor to LED */}
          <path id="p2" d="M 240 132 L 420 160" strokeDasharray="8 8" />
          {/* LED to battery return */}
          <path id="p3" d="M 460 178 L 120 180 L 120 220 L 36 220" strokeDasharray="8 8" />
        </g>

        {/* animated pulses: when playing use SMIL animateMotion; when paused show static markers */}
        <g>
          {playing ? (
            <>
              <circle r="6" fill="#ffb07a">
                <animateMotion dur="1.6s" repeatCount="indefinite" path="M 88 100 L 190 132" />
              </circle>
              <circle r="5" fill="#ffc88a" >
                <animateMotion dur="1.1s" repeatCount="indefinite" path="M 240 132 L 420 160" begin="0.2s" />
              </circle>
              <circle r="4" fill="#ffdcb0">
                <animateMotion dur="2.2s" repeatCount="indefinite" path="M 460 178 L 120 180 L 120 220 L 36 220" begin="0.4s" />
              </circle>
            </>
          ) : (
            // paused — place static markers at start points
            <>
              <circle cx="88" cy="100" r="4.5" fill="#ffb07a" opacity="0.9" />
              <circle cx="240" cy="132" r="4" fill="#ffc88a" opacity="0.85" />
              <circle cx="460" cy="178" r="3.5" fill="#ffdcb0" opacity="0.8" />
            </>
          )}
        </g>
      </svg>

      <div className="absolute bottom-3 left-4 text-xs text-orange-300">Circuit Current Flow</div>
    </div>
  );
}

/* --------------------------
   Logic Analyzer Demo
   - Animated square waves implemented with divs and framer-motion
   - Fixed: respect `playing` so the interval stops and animations freeze when paused
--------------------------- */
function LogicAnalyzerDemo({ channels = 3, playing = true }) {
  const reduced = usePrefersReducedMotion();
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (reduced || !playing) {
      return;
    }
    const id = setInterval(() => setTime((t) => (t + 1) % 100000), 300);
    return () => clearInterval(id);
  }, [reduced, playing]);

  const channelRows = Array.from({ length: channels }).map((_, i) => {
    const pattern = Array.from({ length: 12 }).map((__, j) => ((i + j) % 2 === 0 ? 1 : 0));
    return { id: i, pattern };
  });

  return (
    <div className="relative h-56 md:h-64 bg-black rounded-lg border border-zinc-800 overflow-hidden p-3">
      <div className="flex flex-col gap-3">
        {channelRows.map((ch) => (
          <div key={ch.id} className="flex items-center gap-3">
            <div className="w-10 text-xs text-zinc-400">CH{ch.id + 1}</div>
            <div className="flex-1 h-9 bg-zinc-900 rounded flex items-center px-2 overflow-hidden">
              {ch.pattern.map((p, idx) => {
                const active = ((idx + Math.floor(time / (2 + ch.id))) % 2) === 0;
                const height = active ? 28 : 12;
                // when paused or reduced, animate to stable small height (12) to mimic pause
                const animateTarget = reduced ? { height: 12 } : (playing ? { height } : { height: 12 });
                return (
                  <motion.div
                    key={idx}
                    animate={animateTarget}
                    transition={{ ease: "easeInOut", duration: 0.16 }}
                    className="w-8 mx-1 bg-gradient-to-b from-orange-500 to-orange-400 rounded"
                    style={{ alignSelf: "flex-end" }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-2 left-3 text-xs text-zinc-400">Logic Analyzer — digital waveforms</div>
    </div>
  );
}

/* --------------------------
   Power Meter Demo
   - Gauge with animated needle using framer-motion
   - Fixed: only fluctuate value while playing
--------------------------- */
function PowerMeterDemo({ value = 0.6, playing = true }) {
  const reduced = usePrefersReducedMotion();
  // We'll keep a local state that fluctuates only when playing
  const [val, setVal] = useState(value);

  useEffect(() => {
    // when reduced or not playing, do not run fluctuations
    if (reduced || !playing) {
      return;
    }
    const id = setInterval(() => setVal((v) => {
      const delta = (Math.random() - 0.5) * 0.06;
      let nv = Math.max(0, Math.min(1, v + delta));
      return nv;
    }), 900);
    return () => clearInterval(id);
  }, [reduced, playing]);

  const rot = (v) => -120 + v * 240;

  return (
    <div className="relative h-64 md:h-72 lg:h-80 bg-black rounded-lg border border-zinc-800 overflow-hidden flex items-center justify-center p-6">
      <svg viewBox="0 0 200 120" className="w-64 h-44">
        <defs>
          <linearGradient id="gauge" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff7a18" />
            <stop offset="100%" stopColor="#ffd7b2" />
          </linearGradient>
        </defs>

        {/* arc background */}
        <path d="M20 90 A80 80 0 0 1 180 90" fill="none" stroke="#0b0b0b" strokeWidth="14" />
        {/* colored arc */}
        <path d="M20 90 A80 80 0 0 1 180 90" fill="none" stroke="url(#gauge)" strokeWidth="10" strokeOpacity="0.6" />

        {/* ticks */}
        {Array.from({ length: 11 }).map((_, i) => {
          const a = -120 + (i / 10) * 240;
          const rad = (a * Math.PI) / 180;
          const x1 = 100 + Math.cos(rad) * 72;
          const y1 = 90 + Math.sin(rad) * 72;
          const x2 = 100 + Math.cos(rad) * 60;
          const y2 = 90 + Math.sin(rad) * 60;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#111827" strokeWidth="2" />;
        })}

        {/* needle pivot */}
        <g transform={`translate(100,90)`}>
          <motion.line
            x1="0"
            y1="0"
            x2="0"
            y2="-52"
            stroke="#ffb07a"
            strokeWidth="3"
            strokeLinecap="round"
            animate={{ rotate: rot(val) }}
            transition={{ type: "spring", stiffness: 120, damping: 18 }}
            style={{ transformOrigin: "0px 0px" }}
          />
          <circle r="6" fill="#0b0b0b" stroke="#ff7a18" strokeWidth="2" />
        </g>

        <text x="100" y="110" textAnchor="middle" fill="#f97316" fontSize="12">Power</text>
      </svg>

      <div className="absolute bottom-3 left-3 text-xs text-zinc-400">Power Meter</div>
    </div>
  );
}

/* --------------------------
   Main Section Layout
--------------------------- */
export default function SimulationPreviewSection() {
  const [activeTab, setActiveTab] = useState("oscilloscope");
  const [playing, setPlaying] = useState(true);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  // responsive decisions (for demonstration we avoid server-only matchMedia)
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // helper to render the active demo
  function renderActiveDemo(key) {
    switch (key) {
      case "oscilloscope":
        return <OscilloscopeDemo playing={playing} />;
      case "spectrum":
        return <SpectrumDemo intensity={playing ? 1 : 0.3} playing={playing} />;
      case "circuit":
        return <CircuitFlowDemo playing={playing} />;
      case "logic":
        return <LogicAnalyzerDemo channels={3} playing={playing} />;
      case "power":
        return <PowerMeterDemo value={0.6} playing={playing} />;
      default:
        return null;
    }
  }

  return (
    <section className="py-12 md:py-20 px-4 md:px-8 lg:px-12 bg-gradient-to-b from-black via-zinc-900 to-black text-white">
      <div className="max-w-7xl mx-auto">
        {/* Split layout: left = header & controls, right = demo */}
        <div className="grid grid-cols-1 gap-8 items-start">
          {/* Left column */}
          <div className="md:col-span-5 lg:col-span-4">
            <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <h2 className="text-3xl md:text-4xl lg:text-5xl text-center font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-orange-600">
                Interactive Lab — Simulations
              </h2>
              <p className="mt-4 text-zinc-400">
                Explore professional instrument demos — oscilloscope, spectrum analyzer, circuit flow, logic analyzer and power meters.
                All demos are responsive and optimized for performance.
              </p>

              <div className="mt-6 space-y-4">
                <Card className="bg-zinc-900/70 border border-zinc-700 rounded-2xl shadow">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-orange-500/20 text-orange-300 border border-orange-600/20">Demo Lab</Badge>
                          <div className="text-sm text-zinc-400">No install • Runs client-side</div>
                        </div>
                        <div className="mt-3 text-sm text-zinc-300">
                          Choose a demo on the right and press play. Open Live Run for a fullscreen experience.
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPlaying((p) => !p)}
                          className="px-3 py-2 rounded-md bg-black/60 border cursor-pointer border-orange-600/20 hover:bg-orange-500/8 transition"
                          aria-pressed={!playing}
                          title={playing ? "Pause" : "Play"}
                        >
                          {playing ? <Pause className="w-4 h-4 text-orange-300" /> : <Play className="w-4 h-4 text-orange-300" />}
                        </button>

                        <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
                          <DialogTrigger asChild>
                            <button className="px-3 py-2 rounded-md bg-orange-600/10 border cursor-pointer border-orange-500/20 hover:scale-105 transition">
                              <Maximize2 className="w-4 h-4 text-orange-300 inline-block mr-2" /> <span className="text-orange-200">Live Run</span>
                            </button>
                          </DialogTrigger>
                          <DialogContent className="p-0 bg-transparent">
                            <div className="w-screen h-screen max-w-full max-h-full">
                              {/* Fullscreen content */}
                              <div className="w-full h-full flex items-center justify-center p-6 bg-black">
                                <div className="w-full max-w-5xl">
                                  <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-semibold text-orange-300">Live Run — {activeTab}</h3>
                                    <DialogClose asChild>
                                      <button className="px-3 py-2 rounded bg-black/60 border border-orange-500/20">Close</button>
                                    </DialogClose>
                                  </div>
                                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
                                    {renderActiveDemo(activeTab)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-6">
                <Tabs defaultValue="oscilloscope" value={activeTab} onValueChange={setActiveTab}>
                  <div className="hidden md:block">
                    <TabsList className="flex gap-2 bg-orange-600/10 border cursor-pointer border-orange-500/20 rounded-xl p-1">
                      <TabsTrigger value="oscilloscope" className="px-3 py-2 gap-2 flex items-center cursor-pointer text-orange-300">
                        <Cpu className="w-4 h-4 text-orange-300" /> Oscilloscope
                      </TabsTrigger>
                      <TabsTrigger value="spectrum" className="px-3 py-2 gap-2 flex items-center cursor-pointer text-orange-300">
                        <Radio className="w-4 h-4 text-orange-300" /> Spectrum
                      </TabsTrigger>
                      <TabsTrigger value="circuit" className="px-3 py-2 gap-2 flex items-center cursor-pointer text-orange-300">
                        <Zap className="w-4 h-4 text-orange-300" /> Circuit
                      </TabsTrigger>
                      <TabsTrigger value="logic" className="px-3 py-2 gap-2 flex items-center cursor-pointer text-orange-300">
                        <Activity className="w-4 h-4 text-orange-300" /> Logic
                      </TabsTrigger>
                      <TabsTrigger value="power" className="px-3 py-2 gap-2 flex items-center cursor-pointer text-orange-300">
                        <BatteryCharging className="w-4 h-4 text-orange-300" /> Power
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* mobile tab - compact controls: use shadcn Select */}
                  <div className="md:hidden mt-4">
                   <Select onValueChange={setActiveTab} value={activeTab}>
  <SelectTrigger className="w-full bg-zinc-900/60 border border-zinc-700 text-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40">
    <SelectValue placeholder="Select demo" />
  </SelectTrigger>
  <SelectContent className="bg-zinc-900/95 border border-zinc-800 rounded-md shadow-lg">
    <SelectItem
      value="oscilloscope"
      className="cursor-pointer px-3 py-2 text-sm text-zinc-300 hover:bg-orange-500/20 hover:text-orange-300 focus:bg-orange-500/20 focus:text-orange-300 data-[state=checked]:bg-orange-600/20 data-[state=checked]:text-orange-300"
    >
      Oscilloscope
    </SelectItem>
    <SelectItem
      value="spectrum"
      className="cursor-pointer px-3 py-2 text-sm text-zinc-300 hover:bg-orange-500/20 hover:text-orange-300 focus:bg-orange-500/20 focus:text-orange-300 data-[state=checked]:bg-orange-600/20 data-[state=checked]:text-orange-300"
    >
      Spectrum
    </SelectItem>
    <SelectItem
      value="circuit"
      className="cursor-pointer px-3 py-2 text-sm text-zinc-300 hover:bg-orange-500/20 hover:text-orange-300 focus:bg-orange-500/20 focus:text-orange-300 data-[state=checked]:bg-orange-600/20 data-[state=checked]:text-orange-300"
    >
      Circuit
    </SelectItem>
    <SelectItem
      value="logic"
      className="cursor-pointer px-3 py-2 text-sm text-zinc-300 hover:bg-orange-500/20 hover:text-orange-300 focus:bg-orange-500/20 focus:text-orange-300 data-[state=checked]:bg-orange-600/20 data-[state=checked]:text-orange-300"
    >
      Logic Analyzer
    </SelectItem>
    <SelectItem
      value="power"
      className="cursor-pointer px-3 py-2 text-sm text-zinc-300 hover:bg-orange-500/20 hover:text-orange-300 focus:bg-orange-500/20 focus:text-orange-300 data-[state=checked]:bg-orange-600/20 data-[state=checked]:text-orange-300"
    >
      Power Meter
    </SelectItem>
  </SelectContent>
</Select>

                  </div>
                </Tabs>
              </div>
            </motion.div>
          </div>

          {/* Right column (demo area) */}
          <div className="md:col-span-7 lg:col-span-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-zinc-400">Active Demo</div>
                <div className="flex items-center gap-3 mt-1">
                  <div className="text-lg font-semibold">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</div>
                  <Badge className="bg-orange-500/20 text-orange-300 border border-orange-500/30">{playing ? "Live" : "Paused"}</Badge>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="px-3 py-2 rounded-md bg-black/60 border border-orange-600/20 hover:bg-orange-500/8 transition"
                >
                  {playing ? <Pause className="w-4 h-4 text-orange-300" /> : <Play className="w-4 h-4 text-orange-300" />}
                </button>
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="px-3 py-2 rounded-md bg-orange-600/10 border border-orange-500/20 hover:scale-105 transition">
                      <Maximize2 className="w-4 h-4 text-orange-300" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="p-0 bg-transparent">
                    <div className="w-screen h-screen max-w-full max-h-full">
                      <div className="w-full h-full flex items-center justify-center p-6 bg-black">
                        <div className="w-full max-w-5xl">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold text-orange-300">Live Run — {activeTab}</h3>
                            <DialogClose asChild>
                              <button className="px-3 py-2 rounded bg-black/60 border border-orange-500/20">Close</button>
                            </DialogClose>
                          </div>
                          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
                            {renderActiveDemo(activeTab)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* demo card */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <Card className="bg-zinc-900/70 border border-zinc-700 rounded-2xl shadow-lg">
                <CardContent className="p-5">
                  <AnimatePresence exitBeforeEnter>
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.35 }}
                    >
                      {renderActiveDemo(activeTab)}
                    </motion.div>
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
