// src/pages/visualizations/PhasorDiagramPage.jsx
"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Play,
  Pause,
  Plus,
  Trash2,
  Zap,
  Gauge,
  Cpu,
  CircleDot,
  RotateCcw,
  ArrowRightCircle,
  SquareActivity,
  Disc3,
} from "lucide-react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import Footer from "@/components/landing/Footer";
import {Slider } from "@/components/ui/slider"
// ---------------- theme ----------------
const THEME = {
  bg: "#05060a",
  cardBg: "#000",
  border: "rgba(255,255,255,0.06)",
  accent: "#ff7a2d",
  accent2: "#ffd24a",
  alt: "#3a8aff",
  subtle: "rgba(255,255,255,0.04)",
};

// ---------------- helpers ----------------
const deg2rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function computeResultant(phasors) {
  // phasors: [{mag, angleDeg}]
  let x = 0,
    y = 0;
  phasors.forEach((p) => {
    const a = deg2rad(p.angle);
    x += p.mag * Math.cos(a);
    y += p.mag * Math.sin(a);
  });
  const mag = Math.sqrt(x * x + y * y);
  const angle = Math.atan2(y, x) * (180 / Math.PI);
  return { x, y, mag, angle };
}

// Create time-domain array for Recharts (projection onto real axis)
// sampleCount ~ 200 to be performant and readable on mobile and desktop
function buildWaveformData(phasors, frequency, sampleCount = 240, sampleSpan = 1 / 50) {
  // sampleSpan (seconds) covers maybe a few cycles: set sampleSpan inversely to frequency
  const data = [];
  const dt = (1 / Math.max(0.1, frequency)) / (sampleCount / 6); // around 6 cycles covered across points
  const now = 0;
  for (let i = 0; i < sampleCount; i++) {
    const t = now + i * dt;
    const row = { t: i };
    phasors.forEach((p) => {
      const val = p.mag * Math.cos(2 * Math.PI * frequency * t + deg2rad(p.angle));
      row[p.id] = parseFloat(val.toFixed(4));
    });
    // also add resultant projection
    const rx = phasors.reduce((acc, p) => acc + p.mag * Math.cos(2 * Math.PI * frequency * t + deg2rad(p.angle)), 0);
    row.resultant = parseFloat(rx.toFixed(4));
    data.push(row);
  }
  return data;
}

// ---------------- PhasorCanvas ----------------
// draws multiple phasors and resultant; responsive, uses canvas, animated via RAF
 function PhasorCanvas({
  phasors,
  frequency,
  running,
  showGrid,
  showResultant,
  heightClass = "h-64 md:h-80 lg:h-96",
}) {
  const canvasRef = useRef(null);
  const tRef = useRef(0);
  const rafRef = useRef(null);

  const activePhasors = useMemo(() => phasors.filter((p) => p.visible), [phasors]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dprCap = 2;
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    let last = performance.now();

    // Responsive resize observer
    const resize = () => {
      const wCSS = canvas.clientWidth || 600;
      const hCSS = canvas.clientHeight || 320;
      const w = Math.floor(wCSS * dpr);
      const h = Math.floor(hCSS * dpr);

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    function draw(now) {
      const dt = (now - last) / 1000;
      last = now;
      if (running) tRef.current += dt;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) / 2 * 0.72;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, w, h);

      // Grid & Axes
      if (showGrid) {
        ctx.strokeStyle = THEME.subtle;
        ctx.lineWidth = 1;
        ctx.beginPath();

        const maxR = Math.min(w, h) / 2 * 0.85;
        for (let r = maxR; r > 0; r -= maxR / 4) {
          ctx.moveTo(cx + r, cy);
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
        }

        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.stroke();
      }

      // Draw Phasors
      activePhasors.forEach((p, i) => {
        const theta = 2 * Math.PI * frequency * tRef.current + deg2rad(p.angle);
        const x = cx + scale * p.mag * Math.cos(theta);
        const y = cy - scale * p.mag * Math.sin(theta);

        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 14;
        ctx.shadowColor = p.color;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = `${Math.max(10, w * 0.018)}px system-ui`;
        ctx.fillText(`${p.label}`, cx + 10, cy - 10 - 16 * i);
        ctx.restore();
      });

      // Resultant Vector
      if (showResultant && activePhasors.length > 0) {
        let rx = 0,
          ry = 0;
        activePhasors.forEach((p) => {
          const theta = 2 * Math.PI * frequency * tRef.current + deg2rad(p.angle);
          rx += p.mag * Math.cos(theta);
          ry += p.mag * Math.sin(theta);
        });

        const xR = cx + scale * rx;
        const yR = cy - scale * ry;

        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 4;
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(xR, yR);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = "white";
        ctx.arc(xR, yR, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = `${Math.max(11, w * 0.018)}px system-ui`;
        ctx.fillText("Resultant", cx + 10, cy + 20);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [phasors, frequency, running, showGrid, showResultant]);

  return (
    <div
      className={`w-full ${heightClass} relative flex justify-center items-center rounded-md overflow-hidden border`}
      style={{
        borderColor: THEME.border,
        backgroundColor: THEME.bg,
      }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full max-w-full max-h-full object-contain"
        aria-label="phasor-canvas"
      />
    </div>
  );
}

// ---------------- WaveformChart (Recharts) ----------------
function WaveformChart({ phasors, frequency }) {
  // generate small dataset derived from phasors (recharts expects array)
  const data = useMemo(() => buildWaveformData(phasors.filter((p) => p.visible), frequency, 240), [phasors, frequency]);

  // When no phasors, show empty dataset
  if (!phasors || phasors.length === 0) {
    return (
      <div className="w-full h-36 flex items-center justify-center text-zinc-400">
        No phasors to plot.
      </div>
    );
  }

  // Choose lines to display: each phasor and resultant
  return (
    <div className="w-full h-48 md:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke={THEME.subtle} strokeDasharray="3 3" />
          <XAxis dataKey="t" hide />
          <YAxis domain={["auto", "auto"]} />
          <Tooltip contentStyle={{ background: "#070707", border: "1px solid #222", color: "#fff",borderRadius:"10px" }} />
          <Legend />
          {phasors.filter((p) => p.visible).map((p) => (
            <Line key={p.id} type="monotone" dataKey={p.id} stroke={p.color} dot={false} strokeWidth={2} isAnimationActive={false} />
          ))}
          <Line type="monotone" dataKey="resultant" stroke="#fff" dot={false} strokeWidth={2} strokeDasharray="6 4" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------- CircuitVisualizer (SVG) ----------------
function CircuitVisualizer({ phasors, frequency }) {
  // We will compute instantaneous current magnitude & show animated blobs along a path
  const visible = phasors.filter((p) => p.visible);
  // For demonstration use resultant instantaneous current projection (use first current-labeled phasor or resultant)
  let currentMag = 0;
  if (visible.length > 0) {
    currentMag = visible.reduce((acc, p) => acc + Math.abs(p.mag), 0) / visible.length / 2;
  }

  // generate blobs offsets for animation
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = null;
    let last = performance.now();
    function loop(now) {
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => (prev + dt) % 1);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const blobs = Array.from({ length: 8 }).map((_, i) => {
    return { offset: (t + i / 8) % 1, r: 3 + (i % 3) };
  });

  return (
    <div className="rounded-md p-3 border" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-orange-400">Circuit Visualizer</div>
        <div className="bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded-full 
  shadow-sm hover:border-orange-500/50 transition-all duration-300">Animated current flow</div>
      </div>

      <svg viewBox="0 0 560 160" className="w-full h-36" preserveAspectRatio="xMidYMid meet">
        {/* left battery */}
        <g transform="translate(14,48)">
          <rect x="0" y="0" width="20" height="64" rx="3" fill={THEME.accent} />
          <rect x="30" y="16" width="6" height="32" rx="2" fill={THEME.accent2} />
        </g>

        {/* top wire */}
        <path d="M44 80 H216" stroke="#444" strokeWidth="6" fill="none" />
        {/* resistor */}
        <rect x="216" y="64" width="88" height="32" rx="6" fill="#0b0b0b" stroke="#333" strokeWidth="2" />
        <text x="260" y="84" textAnchor="middle" fill={THEME.accent} fontSize="12">R</text>

        {/* right load */}
        <rect x="318" y="48" width="60" height="64" rx="8" fill="#070707" stroke="#222" strokeWidth="2" />
        <text x="348" y="84" fill="#fff" fontSize="11" textAnchor="middle">Load</text>

        {/* bottom wire back */}
        <path d="M378 80 H520" stroke="#444" strokeWidth="6" fill="none" />
        <path d="M520 80 Q540 80 540 100 Q540 140 360 140" stroke="#444" strokeWidth="6" fill="none" />
        <path d="M360 140 H44" stroke="#444" strokeWidth="6" fill="none" />

        {/* animated blobs across the top path (from left to right) */}
        {blobs.map((b, i) => {
          const x = 44 + (216 - 44) * ((b.offset + 0.0) % 1);
          const y = 80;
          return <circle key={"t" + i} cx={x} cy={y} r={b.r} fill={THEME.accent} opacity={0.45 + (i % 4) * 0.08} />;
        })}

        {/* blobs across the right */}
        {blobs.map((b, i) => {
          const x = 320;
          const y = 70 + 40 * ((b.offset + 0.25) % 1);
          return <circle key={"r" + i} cx={x} cy={y} r={b.r} fill={THEME.accent2} opacity={0.35 + (i % 4) * 0.08} />;
        })}

        {/* voltmeter (left) */}
        <g transform="translate(110,36)">
          <circle cx="0" cy="0" r="18" fill="#070707" stroke="#333" strokeWidth="2" />
          <text x="0" y="6" fill={THEME.accent2} fontSize="11" textAnchor="middle">V</text>
        </g>

        {/* ammeter (right) */}
        <g transform="translate(420,36)">
          <circle cx="0" cy="0" r="18" fill="#070707" stroke="#333" strokeWidth="2" />
          <text x="0" y="6" fill={THEME.accent} fontSize="11" textAnchor="middle">A</text>
        </g>
      </svg>

      <div className="mt-2 text-xs text-zinc-400 grid grid-cols-2 gap-2">
        <div>Estimated current: <span className="font-semibold text-white">{currentMag.toFixed(3)} A</span></div>
        <div className="text-right">f: <span className="font-semibold text-white">{frequency.toFixed(2)} Hz</span></div>
      </div>
    </div>
  );
}

// ---------------- Phasor Controls (add / edit / list) ----------------
function PhasorControls({ phasors, setPhasors }) {
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newMag, setNewMag] = useState(1.0);
  const [newAngle, setNewAngle] = useState(0);
  const [newColor, setNewColor] = useState(THEME.accent);

  function addPhasor() {
    const id = newId.trim() || `P${Math.floor(Math.random() * 9000 + 1000)}`;
    // avoid duplicate ids
    if (phasors.find((p) => p.id === id)) {
      // auto-suffix
      let i = 1;
      let candidate = id + i;
      while (phasors.find((p) => p.id === candidate)) {
        i++;
        candidate = id + i;
      }
      setPhasors([...phasors, { id: candidate, label: newLabel || candidate, mag: clamp(Number(newMag) || 1, 0, 5), angle: clamp(Number(newAngle) || 0, -360, 360), color: newColor, visible: true }]);
    } else {
      setPhasors([...phasors, { id, label: newLabel || id, mag: clamp(Number(newMag) || 1, 0, 5), angle: clamp(Number(newAngle) || 0, -360, 360), color: newColor, visible: true }]);
    }
    setNewId("");
    setNewLabel("");
    setNewMag(1.0);
    setNewAngle(0);
    setNewColor(THEME.accent);
  }

  function removePhasor(id) {
    setPhasors(phasors.filter((p) => p.id !== id));
  }

  function toggleVisibility(id) {
    setPhasors(phasors.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)));
  }

  function updatePhasor(id, updates) {
    setPhasors(phasors.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }

  return (
<Card
  className="rounded-2xl border transition-all duration-300"
  style={{ borderColor: THEME.border, background: THEME.cardBg }}
>
  <CardHeader className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-md flex items-center justify-center shrink-0"
        style={{
          background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`,
          color: "black",
        }}
      >
        <CircleDot className="w-5 h-5" />
      </div>
      <div>
        <CardTitle className="text-base sm:text-lg text-orange-400">
          Phasors
        </CardTitle>
        <p className="text-xs sm:text-sm text-zinc-400">
          Manage multiple phasors in real time
        </p>
      </div>
    </div>
  </CardHeader>

  <CardContent className="p-4 space-y-4">
    {/* Input Grid */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3">
      <Input
        placeholder="id (eg. V, I)"
        value={newId}
        onChange={(e) => setNewId(e.target.value)}
        className="bg-zinc-900/50 text-orange-100 text-sm"
      />
      <Input
        placeholder="label (Voltage)"
        value={newLabel}
        onChange={(e) => setNewLabel(e.target.value)}
        className="bg-zinc-900/50 text-orange-100 text-sm"
      />

      {/* Magnitude Control */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400">Magnitude</label>
        <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
          <Input
            type="number"
            step="0.1"
            min={0}
            max={5}
            value={newMag}
            onChange={(e) => setNewMag(Number(e.target.value) || 0)}
            className="bg-zinc-900/60 border border-zinc-800 text-orange-100 text-sm rounded-md shadow-sm 
                       focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/30 w-full sm:w-28"
          />
          <Slider
            value={[newMag]}
            onValueChange={(v) => setNewMag(v[0])}
            min={0}
            max={5}
            step={0.01}
            className="w-full cursor-pointer"
          />
        </div>
      </div>

      {/* Angle Control */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400">Angle (°)</label>
        <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
          <Input
            type="number"
            step="1"
            min={-180}
            max={180}
            value={newAngle}
            onChange={(e) => setNewAngle(Number(e.target.value) || 0)}
            className="bg-zinc-900/60 border border-zinc-800 text-orange-100 text-sm rounded-md shadow-sm 
                       focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/30 w-full sm:w-28"
          />
          <Slider
            value={[newAngle]}
            onValueChange={(v) => setNewAngle(v[0])}
            min={-180}
            max={180}
            step={1}
            className="w-full cursor-pointer"
          />
        </div>
      </div>
    </div>

    {/* Controls Row */}
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <Select value={newColor} onValueChange={(v) => setNewColor(v)}>
        <SelectTrigger
          className="w-full sm:w-36 bg-black/70 border border-orange-500/30 text-white text-sm rounded-md 
                     shadow-sm cursor-pointer hover:border-orange-500/50 focus:ring-2 
                     focus:ring-orange-500/40 transition-all duration-300"
        >
          <SelectValue placeholder="Color" />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg text-white">
          <SelectItem value={THEME.accent}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500" /> Orange
            </div>
          </SelectItem>
          <SelectItem value={THEME.alt}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" /> Blue
            </div>
          </SelectItem>
          <SelectItem value={THEME.accent2}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-400" /> Yellow
            </div>
          </SelectItem>
          <SelectItem value="#7cd389">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-400" /> Green
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      <Button
        onClick={addPhasor}
        className="flex items-center gap-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm px-3"
      >
        <Plus className="w-4 h-4" /> Add
      </Button>

      <Button
        variant="outline"
        onClick={() => {
          setPhasors([
            { id: "V", label: "Voltage", mag: 1.0, angle: 0, color: THEME.accent, visible: true },
            { id: "I", label: "Current", mag: 0.8, angle: -30, color: THEME.alt, visible: true },
          ]);
        }}
        className="border border-zinc-700 text-sm px-3"
      >
        <RotateCcw className="w-4 h-4" /> Preset
      </Button>
    </div>

    {/* Active Phasors */}
    <div className="mt-3 space-y-2">
      <p className="text-xs sm:text-sm text-zinc-400 font-medium">Active Phasors</p>

      <div className="grid gap-2">
        <AnimatePresence>
          {phasors.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-md border text-sm transition-all"
                style={{ borderColor: THEME.border }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ background: p.color }}
                  />
                  <div>
                    <div className="text-orange-100 font-medium">
                      {p.id} <span className="text-zinc-400 text-xs">({p.label})</span>
                    </div>
                    <div className="text-xs text-zinc-400">
                      mag: {p.mag} • ∠ {p.angle}°
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    onClick={() => toggleVisHelper(p.id)}
                    className={`cursor-pointer ${
                      p.visible
                        ? "bg-[rgba(255,122,45,0.12)] border-[#ff7a2d]"
                        : "bg-zinc-900/40"
                    }`}
                  >
                    {p.visible ? "Shown" : "Hidden"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removePhasorHelper(p.id)}
                    className="p-2 bg-red-500 text-black cursor-pointer hover:bg-red-600 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  </CardContent>
</Card>

  );

  // helper closures to avoid recreating inside render
  function toggleVisHelper(id) {
    setPhasors((prev) => prev.map((pp) => (pp.id === id ? { ...pp, visible: !pp.visible } : pp)));
  }
  function removePhasorHelper(id) {
    setPhasors((prev) => prev.filter((pp) => pp.id !== id));
  }
}

// ---------------- Main Page ----------------
export default function PhasorDiagramPage() {
  // global states
  const [frequency, setFrequency] = useState(50);
  const [running, setRunning] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showResultant, setShowResultant] = useState(true);

  const [phasors, setPhasors] = useState([
    { id: "V", label: "Voltage", mag: 1.0, angle: 0, color: THEME.accent, visible: true },
    { id: "I", label: "Current", mag: 0.8, angle: -30, color: THEME.alt, visible: true },
  ]);

  // compute static analytic values for display
  const currentResultant = useMemo(() => computeResultant(phasors.filter((p) => p.visible)), [phasors]);

  return (
    <div className="min-h-screen   bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px]">
      {/* header */}
      <header className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md bg-black/30 border-b px-2 sm:px-0" style={{ borderColor: THEME.border }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md" style={{ background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`, display: "flex", alignItems: "center", justifyContent: "center", color: "black" }}>
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-zinc-300">SparkLab</div>
                <div className="text-xs text-zinc-400 -mt-0.5">Phasor Animator</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded-full 
  shadow-sm hover:border-orange-500/50 transition-all duration-300">Real-time phasor & circuit visualization</div>
             
            </div>
          </div>
        </div>
      </header>

      {/* main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* left: controls */}
          <div className="lg:col-span-4 space-y-4">
            <PhasorControls phasors={phasors} setPhasors={setPhasors} />

           <Card
  className="rounded-2xl border transition-all duration-300 hover:border-orange-400/40 hover:shadow-[0_0_20px_rgba(255,122,45,0.15)]"
  style={{ borderColor: THEME.border, background: THEME.cardBg }}
>
  <CardHeader className="p-3 sm:p-4 border-b border-zinc-800/60">
    <CardTitle className="flex items-center gap-2 text-sm sm:text-base font-semibold text-orange-400">
      Global Controls
    </CardTitle>
  </CardHeader>

  <CardContent className="p-3 sm:p-4">
    <div className="grid grid-cols-1 gap-4">
      {/* Frequency input */}
    <div className="flex flex-col space-y-2">
  <label className="text-xs sm:text-sm text-zinc-400 flex items-center gap-2">
    Frequency (Hz)
    <span className="text-[10px] text-zinc-500">(adjust smoothly)</span>
  </label>

  <Input
    type="number"
    step="0.1"
    value={frequency}
    onChange={(e) => setFrequency(Number(e.target.value) || 1)}
    className="bg-black/60 border border-zinc-800 text-orange-100 
               focus-visible:ring-2 focus-visible:ring-orange-500/40 
               focus:border-orange-500/50 rounded-md text-sm sm:text-base 
               transition-all duration-300"
  />

  <Slider
    value={[frequency]}
    onValueChange={(v) => setFrequency(v[0])}
    min={1}
    max={1000}
    step={1}
    className="w-full mt-1 cursor-pointer"
  />
</div>


      {/* Play / Reset Buttons */}
      <div className="flex flex-col sm:flex-row gap-2 w-full">
        <Button
          onClick={() => setRunning((r) => !r)}
          className="flex-1 cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black hover:opacity-90 transition-all"
        >
          {running ? (
            <>
              <Pause className="w-4 h-4 mr-2" /> Pause
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" /> Play
            </>
          )}
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            setPhasors([
              { id: "V", label: "Voltage", mag: 1.0, angle: 0, color: THEME.accent, visible: true },
              { id: "I", label: "Current", mag: 0.8, angle: -30, color: THEME.alt, visible: true },
            ]);
            setFrequency(50);
            setRunning(true);
          }}
          className="flex-1 cursor-pointer border border-zinc-700 hover:border-orange-400/40 hover:text-orange-300 transition-all"
        >
          <RotateCcw className="w-4 h-4 mr-2" /> Reset
        </Button>
      </div>

      {/* Toggle badges */}
      <div className="flex flex-wrap gap-2 mt-2">
        <Badge
          onClick={() => setShowGrid((s) => !s)}
          className={`cursor-pointer px-3 py-1 text-xs sm:text-sm transition-all ${
            showGrid
              ? "bg-[rgba(255,122,45,0.15)] border-[#ff7a2d] text-orange-300"
              : "bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:bg-zinc-800/60"
          }`}
        >
          Grid
        </Badge>

        <Badge
          onClick={() => setShowResultant((s) => !s)}
          className={`cursor-pointer px-3 py-1 text-xs sm:text-sm transition-all ${
            showResultant
              ? "bg-[rgba(255,210,74,0.12)] border-[#ffd24a] text-yellow-200"
              : "bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:bg-zinc-800/60"
          }`}
        >
          Resultant
        </Badge>

        <Badge className="px-3 py-1 text-xs sm:text-sm bg-zinc-900/40 border border-zinc-800 text-zinc-300">
          Real-time
        </Badge>
      </div>

      {/* Analytics */}
      <div className="mt-3">
        <div className="text-xs sm:text-sm text-zinc-400 mb-2">
          Quick Analytics
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 text-center sm:text-left">
          <div>
            <div className="text-zinc-400 text-xs sm:text-sm">Resultant Mag</div>
            <div className="font-semibold text-orange-100 text-sm sm:text-base">
              {currentResultant.mag.toFixed(3)}
            </div>
          </div>
          <div>
            <div className="text-zinc-400 text-xs sm:text-sm">Resultant ∠</div>
            <div className="font-semibold text-orange-100 text-sm sm:text-base">
              {currentResultant.angle.toFixed(1)}°
            </div>
          </div>
        </div>
      </div>
    </div>
  </CardContent>
</Card>
          </div>

          {/* right: visualizations */}
          <div className="lg:col-span-8 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="rounded-2xl border p-3" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
                <CardHeader className="p-3 flex items-center justify-between">
                  <CardTitle className="text-sm text-orange-400 flex items-center gap-1"><Disc3/> Phasor Diagram</CardTitle>
                  <div className="bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded-full 
  shadow-sm hover:border-orange-500/50 transition-all duration-300">Rotating vectors</div>
                </CardHeader>
                <CardContent>
                  <PhasorCanvas phasors={phasors} frequency={frequency} running={running} showGrid={showGrid} showResultant={showResultant} />
                </CardContent>
              </Card>

              <Card className="rounded-2xl border p-3" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
                <CardHeader className="p-3 flex items-center justify-between">
                  <CardTitle className="text-sm text-orange-300 flex gap-1 items-center"> <SquareActivity/>Waveform</CardTitle>
                  <div className="bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded-full 
  shadow-sm hover:border-orange-500/50 transition-all duration-300">Projection on real axis</div>
                </CardHeader>
                <CardContent>
                  <WaveformChart phasors={phasors} frequency={frequency} />
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <CircuitVisualizer phasors={phasors} frequency={frequency} />
              </div>

              <Card className="rounded-2xl border p-3" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
                <CardHeader className="p-3 flex items-center justify-between">
                  <CardTitle className="text-sm text-orange-400">Power & Phase Info</CardTitle>
                  <div className="bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded-full 
  shadow-sm hover:border-orange-500/50 transition-all duration-300">Instant & summary</div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="text-xs text-zinc-400">Power Factor (approx)</div>
                    <div className="text-lg font-semibold text-orange-100">{/* if V and I present compute cos(phi) */}{
                      (() => {
                        const v = phasors.find((p) => p.id.toLowerCase() === "v");
                        const i = phasors.find((p) => p.id.toLowerCase() === "i");
                        if (v && i) {
                          const phi = deg2rad(v.angle - i.angle);
                          const pf = Math.cos(phi);
                          return `${pf.toFixed(3)} (${(phi * 180 / Math.PI).toFixed(1)}°)`;
                        }
                        return "N/A";
                      })()
                    }</div>

                    <div className="mt-2 text-xs text-zinc-400">Vector sum</div>
                    <div className="mt-1 text-sm text-orange-100">
                      <div>Magnitude: <span className="font-medium">{currentResultant.mag.toFixed(4)}</span></div>
                      <div>Angle: <span className="font-medium">{currentResultant.angle.toFixed(2)}°</span></div>
                    </div>

        
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
