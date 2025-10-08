// src/pages/OscilloscopeSimulatorPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Play,
  Pause,
  Settings,
  Download,

  Waves as
  
  WaveSquare,

  Monitor,

  Activity,

  Menu,
 
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
import { Slider } from "@/components/ui/slider";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid } from "recharts";

/* ============================
   Helpers
   ============================ */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const nowMs = () => performance.now();

/* ============================
   Signal generator - produces samples for channel(s)
   - Supports sine, square, triangle, saw, noise
   - Each channel has amplitude (Vpk), frequency (Hz), phase (deg), offset (V), noise (%)
   - Sampling rate in Hz (samples per second)
   ============================ */
function useSignalGenerator({ channels, samplingHz, running, bufferSize = 4096 }) {
  // channels: [{ id, enabled, type, amp, freq, phaseDeg, offset, noise }]
  const bufferRef = useRef(new Float32Array(bufferSize)); // we'll use circular buffer for primary trace (channel 0)
  const buffer2Ref = useRef(new Float32Array(bufferSize)); // channel 2 if needed
  const writeIdxRef = useRef(0);
  const t0Ref = useRef(performance.now());
  const lastTickRef = useRef(performance.now());
  const rafRef = useRef(null);
  const [metaTick, setMetaTick] = useState(0); // lightweight trigger to inform UI about new data

  const samplePeriodMs = 1000 / samplingHz; // ms between samples

  // generate 1 sample for a channel
  const genSampleForChannel = useCallback((ch, tSeconds) => {
    const { type, amp = 1, freq = 1, phaseDeg = 0, offset = 0, noise = 0 } = ch;
    const phaseRad = (phaseDeg * Math.PI) / 180;
    const omega = 2 * Math.PI * (freq || 0);
    let val = 0;
    if (!ch.enabled) return 0;
    if (type === "sine") {
      val = amp * Math.sin(omega * tSeconds + phaseRad);
    } else if (type === "square") {
      val = amp * (Math.sign(Math.sin(omega * tSeconds + phaseRad)) || 1);
    } else if (type === "triangle") {
      // triangle wave formula (normalized)
      const period = 1 / (freq || 1);
      const phaseShift = ((phaseDeg / 360) * period) || 0;
      const x = ((tSeconds + phaseShift) % period) / period;
      val = amp * (4 * Math.abs(x - 0.5) - 1); // range [-1,1]
    } else if (type === "saw") {
      const period = 1 / (freq || 1);
      const x = ((tSeconds * freq) % 1 + 1) % 1;
      val = amp * (2 * x - 1);
    } else if (type === "noise") {
      val = amp * (Math.random() * 2 - 1);
    } else {
      // default: sine
      val = amp * Math.sin(omega * tSeconds + phaseRad);
    }
    if (noise && noise > 0) {
      const noiseAmp = amp * (noise / 100);
      val += (Math.random() * 2 - 1) * noiseAmp;
    }
    return val + (offset || 0);
  }, []);

  useEffect(() => {
    let alive = true;
    t0Ref.current = performance.now();
    lastTickRef.current = performance.now();

    const step = (ts) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(step);
      if (!running) {
        lastTickRef.current = ts;
        return;
      }
      const dt = ts - lastTickRef.current;
      // produce as many samples as needed to catch up
      if (dt < samplePeriodMs * 0.5) return; // throttle small dt
      // number of samples to produce
      const toProduce = Math.max(1, Math.floor(dt / samplePeriodMs));
      for (let s = 0; s < toProduce; s++) {
        const elapsed = (ts - t0Ref.current) / 1000 - (toProduce - 1 - s) * (samplePeriodMs / 1000);
        const i = writeIdxRef.current % bufferRef.current.length;
        // channel 0 and channel 1
        const ch0 = channels[0] || {};
        const ch1 = channels[1] || {};
        bufferRef.current[i] = genSampleForChannel(ch0, elapsed);
        buffer2Ref.current[i] = genSampleForChannel(ch1, elapsed);
        writeIdxRef.current = (writeIdxRef.current + 1) % bufferRef.current.length;
      }
      lastTickRef.current = ts;
      // nudge UI (cheap)
      setMetaTick((t) => t + 1);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [channels, samplePeriodMs, running, genSampleForChannel]);

  // API to read snapshot of last N samples (newest last)
  const readBuffer = useCallback(
    (n = 1024) => {
      const len = bufferRef.current.length;
      const out = new Float32Array(n);
      const out2 = new Float32Array(n);
      const w = writeIdxRef.current;
      // read last n samples
      for (let i = 0; i < n; i++) {
        const idx = (w - n + i + len) % len;
        out[i] = bufferRef.current[idx];
        out2[i] = buffer2Ref.current[idx];
      }
      return { ch1: out, ch2: out2, metaTick };
    },
    [metaTick]
  );

  return { readBuffer, metaTick };
}

/* ============================
   Oscilloscope canvas
   - draws grid, trace from buffer, trigger, cursors, labels
   - interactive cursors: click+drag to set horizontal cursors (time) and vertical (voltage)
   ============================ */
function OscilloscopeCanvas({
  width = 900,
  height = 360,
  getSamples,
  timePerDiv = 0.001, // sec per division
  voltsPerDiv = 1, // V per vertical division
  samplingHz = 44100,
  running,
  trigger,
  onMeasurements,
  chColors = ["#ffd24a", "#00ffbf"],
}) {
  const canvasRef = useRef(null);
  const offRef = useRef(null);
  const mouseStateRef = useRef({ dragging: false, draggingCursor: null, lastX: 0, lastY: 0 });
  const cursorRef = useRef({
    // positions in canvas coords (px)
    x1: width * 0.25,
    x2: width * 0.75,
    y1: height * 0.33,
    y2: height * 0.66,
    show: false,
  });

  const drawFrame = useCallback(
    (ts) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      // double buffer to avoid flicker
      if (!offRef.current) offRef.current = document.createElement("canvas");
      const off = offRef.current;
      off.width = canvas.width;
      off.height = canvas.height;
      const octx = off.getContext("2d");

      // high-DPI handling
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      if (off.width !== canvas.width || off.height !== canvas.height) {
        off.width = canvas.width;
        off.height = canvas.height;
      }

      // draw background
      octx.fillStyle = "#05060a";
      octx.fillRect(0, 0, off.width, off.height);

      // draw grid (10 divisions horizontally, 8 vertically)
      const divsX = 10;
      const divsY = 8;
      const gx = off.width / divsX;
      const gy = off.height / divsY;
      // faint background cells
      for (let i = 0; i <= divsX; i++) {
        octx.beginPath();
        octx.moveTo(Math.round(i * gx) + 0.5, 0);
        octx.lineTo(Math.round(i * gx) + 0.5, off.height);
        octx.strokeStyle = i % 5 === 0 ? "rgba(255,154,74,0.12)" : "rgba(255,154,74,0.06)";
        octx.lineWidth = i % 5 === 0 ? 1.6 * dpr : 1 * dpr;
        octx.stroke();
      }
      for (let j = 0; j <= divsY; j++) {
        octx.beginPath();
        octx.moveTo(0, Math.round(j * gy) + 0.5);
        octx.lineTo(off.width, Math.round(j * gy) + 0.5);
        octx.strokeStyle = j % 4 === 0 ? "rgba(255,154,74,0.12)" : "rgba(255,154,74,0.04)";
        octx.lineWidth = j % 4 === 0 ? 1.6 * dpr : 0.7 * dpr;
        octx.stroke();
      }

      // get samples (n samples)
      const shownSamples = Math.floor((timePerDiv * divsX) * samplingHz); // time span * sampling
      const { ch1, ch2 } = getSamples(Math.max(256, Math.min(8192, shownSamples)));

      // map sample -> pixel
      const len = ch1.length;
      const pxPerSample = off.width / len;

      // vertical scale: voltsPerDiv -> pixels per volt
      const vscale = (gy * (divsY / 8)) / (voltsPerDiv * divsY / divsY); // simplifies to px per volt relative to grid
      // better: map voltsPerDiv to gy pixels: 1 division = gy px, voltsPerDiv covers 1 division
      const pxPerVolt = gy / voltsPerDiv;

      // center vertical midline
      const midY = off.height / 2;

      // draw channel traces
      const drawTrace = (arr, color, widthPx = 2 * dpr) => {
        octx.beginPath();
        for (let i = 0; i < len; i++) {
          const s = arr[i] || 0;
          const x = Math.round(i * pxPerSample) + 0.5;
          const y = Math.round(midY - s * pxPerVolt) + 0.5;
          if (i === 0) octx.moveTo(x, y);
          else octx.lineTo(x, y);
        }
        octx.strokeStyle = color;
        octx.lineWidth = widthPx;
        octx.lineJoin = "round";
        octx.lineCap = "round";
        octx.stroke();
      };

      drawTrace(ch1, chColors[0]);
      drawTrace(ch2, chColors[1], 1.2 * dpr);

      // apply trigger marker
      if (trigger && trigger.enabled) {
        const trigX = off.width * 0.15; // draw a vertical indicator at left part
        octx.beginPath();
        octx.moveTo(trigX + 0.5, 0);
        octx.lineTo(trigX + 0.5, off.height);
        octx.setLineDash([4 * dpr, 6 * dpr]);
        octx.strokeStyle = "rgba(255,255,255,0.06)";
        octx.lineWidth = 1 * dpr;
        octx.stroke();
        octx.setLineDash([]);
        // trigger level line
        const vPx = midY - trigger.level * pxPerVolt;
        octx.beginPath();
        octx.moveTo(0, vPx);
        octx.lineTo(off.width, vPx);
        octx.strokeStyle = "rgba(255,154,74,0.6)";
        octx.lineWidth = 1 * dpr;
        octx.stroke();
      }

      // draw grid overlay labels
      octx.font = `${12 * dpr}px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto`;
      octx.fillStyle = "rgba(255,255,255,0.07)";
      octx.fillText(`${(timePerDiv * divsX * 1000).toFixed(1)} ms span`, 8 * dpr, 14 * dpr);
      octx.fillText(`${voltsPerDiv} V/div`, off.width - 90 * dpr, 14 * dpr);

      // arrows/legend
      octx.fillStyle = chColors[0];
      octx.fillRect(8 * dpr, off.height - 26 * dpr, 8 * dpr, 8 * dpr);
      octx.fillStyle = "#fff";
      octx.fillText("CH1", 22 * dpr, off.height - 18 * dpr);
      octx.fillStyle = chColors[1];
      octx.fillRect(70 * dpr, off.height - 26 * dpr, 8 * dpr, 8 * dpr);
      octx.fillStyle = "#fff";
      octx.fillText("CH2", 86 * dpr, off.height - 18 * dpr);

      // draw off -> canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, 0, 0);

      // measurements: compute from ch1
      if (onMeasurements) {
        // compute Vpp, Vrms, Vavg, freq via zero crossings
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        let sumSq = 0;
        let sum = 0;
        for (let i = 0; i < len; i++) {
          const v = ch1[i] || 0;
          if (v < min) min = v;
          if (v > max) max = v;
          sumSq += v * v;
          sum += v;
        }
        const vpp = max - min;
        const vrms = Math.sqrt(sumSq / len);
        const vavg = sum / len;
        // estimate freq by detecting zero-crossings (simple)
        let zc = 0;
        for (let i = 1; i < len; i++) {
          if (ch1[i - 1] <= 0 && ch1[i] > 0) zc++;
        }
        const freq = (zc / ((len / samplingHz) || 1)) || 0;

        onMeasurements({ vpp, vrms, vavg, freq });
      }

      // flush
      return true;
    },
    [getSamples, height, width, timePerDiv, voltsPerDiv, samplingHz, onMeasurements, chColors, trigger]
  );

  // animation loop
  useEffect(() => {
    let alive = true;
    let raf = 0;
    const loop = (ts) => {
      if (!alive) return;
      drawFrame(ts);
      raf = requestAnimationFrame(loop);
    };
    if (running) raf = requestAnimationFrame(loop);
    else {
      // still draw one frame to show paused state
      drawFrame(nowMs());
    }
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [drawFrame, running]);

  // canvas refs to DOM
  return (
    <div className="w-full bg-gradient-to-b from-black/40 to-zinc-900/10 border border-zinc-800 rounded-xl p-2">
      <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px`, display: "block", borderRadius: 10 }} />
    </div>
  );
}

/* ============================
   Simple FFT (DFT) utility for small N (not optimized FFT)
   - Used for a quick frequency spectrum preview
   ============================ */
function computeSpectrum(arr, samplingHz) {
  const N = arr.length;
  const half = Math.floor(N / 2);
  const re = new Float32Array(half);
  const im = new Float32Array(half);
  const mag = new Float32Array(half);
  for (let k = 0; k < half; k++) {
    let r = 0,
      i = 0;
    const twopi_k = (-2 * Math.PI * k) / N;
    for (let n = 0; n < N; n++) {
      const phi = twopi_k * n;
      r += arr[n] * Math.cos(phi);
      i += arr[n] * Math.sin(phi);
    }
    re[k] = r;
    im[k] = i;
    mag[k] = Math.sqrt(r * r + i * i);
  }
  // map to frequency bins
  const result = [];
  for (let k = 0; k < half; k++) {
    result.push({ f: (k * samplingHz) / N, mag: mag[k] });
  }
  return result;
}

/* ============================
   Circuit visualizer SVG
   - simple resistor load with animated dots based on instantaneous current
   - calculates ammeter and voltmeter reading from instantaneous sample (I = V/R for resistive load)
   ============================ */
function CircuitVisualizerSVG({ chSample = 0, Vsup = 1, R = 10, running = true }) {
  // chSample: instantaneous voltage amplitude (V)
  const Iinstant = R > 1e-9 ? chSample / R : 0;
  const absI = Math.abs(Iinstant);
  const dotCount = clamp(Math.round(3 + absI * 15), 3, 28);
  const speed = clamp(1.5 / (absI + 0.02), 0.2, 3.2);

  return (
    <div className="w-full rounded-xl p-3 bg-black/70 border border-zinc-800">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#ffd24a]">Circuit Visualizer</div>
            <div className="text-xs text-zinc-400">Resistive load • Live meter readings</div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">R: <span className="text-[#ffd24a] ml-1">{R} Ω</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V: <span className="text-[#ffd24a] ml-1">{round(chSample, 4)} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I: <span className="text-[#00ffbf] ml-1">{round(Iinstant, 6)} A</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-hidden">
        <svg viewBox="0 0 900 160" preserveAspectRatio="xMidYMid meet" className="w-full h-36">
          {/* battery */}
          <g transform="translate(60,80)">
            <rect x="-20" y="-28" width="40" height="56" rx="6" fill="#060606" stroke="#222" />
            <text x="-40" y="-40" fontSize="12" fill="#ffd24a">{round(Vsup,2)} V</text>
          </g>

          {/* wire to resistor */}
          <path d="M 120 80 H 340" stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* resistor */}
          <g transform="translate(420,80)">
            <rect x="-36" y="-18" width="72" height="36" rx="6" fill="#0b0b0b" stroke="#222" />
            <text x="-30" y="-26" fontSize="12" fill="#ffb57a">R</text>
            <text x="-30" y="34" fontSize="12" fill="#fff">{R} Ω</text>
          </g>

          <path d="M 480 80 H 700" stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* ground */}
          <g transform="translate(740,80)">
            <path d="M -12 20 H 12" stroke="#333" strokeWidth="4" />
            <path d="M -8 26 H 8" stroke="#222" strokeWidth="3" />
            <path d="M -4 32 H 4" stroke="#111" strokeWidth="2" />
          </g>

          {/* animated dots along path from battery -> resistor -> ground */}
          {Array.from({ length: dotCount }).map((_, i) => {
            // build a simple path across the coordinates
            const total = dotCount;
            const t = (i / total);
            const offset = (running ? (performance.now() / 1000) : 0) * (1 / speed);
            const pos = ((t + offset) % 1);
            // parameterize path segments: [0..0.33]=wire1, [0.33..0.66]=resistor region (curvy), [0.66..1]=wire2
            let cx = 0, cy = 80;
            if (pos < 0.33) {
              const p = pos / 0.33;
              cx = 120 + (340 - 120) * p;
            } else if (pos < 0.66) {
              const p = (pos - 0.33) / 0.33;
              // across resistor (curvy)
              cx = 340 + (480 - 340) * p;
              cy = 80 + Math.sin(p * Math.PI) * 6;
            } else {
              const p = (pos - 0.66) / 0.34;
              cx = 480 + (700 - 480) * p;
            }
            const color = Iinstant >= 0 ? "#ffd24a" : "#ff6a9a";
            return <circle key={i} cx={cx} cy={cy} r={4} fill={color} opacity={0.9} />;
          })}

          {/* meters */}
          <g transform="translate(200,18)">
            <rect x="-60" y="-14" width="120" height="28" rx="8" fill="#060606" stroke="#222" />
            <text x="-50" y="6" fontSize="11" fill="#9ee6ff">Voltmeter: <tspan fill="#ffd24a">{round(chSample,4)} V</tspan></text>
          </g>
          <g transform="translate(520,18)">
            <rect x="-60" y="-14" width="120" height="28" rx="8" fill="#060606" stroke="#222" />
            <text x="-50" y="6" fontSize="11" fill="#9ee6ff">Ammeter: <tspan fill="#00ffbf">{round(Iinstant,6)} A</tspan></text>
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ============================
   Main Oscilloscope Page
   ============================ */
export default function OscilloscopeSimulatorPage() {
  /* ----- UI state ----- */
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // sampling and display
  const [samplingHz, setSamplingHz] = useState(22050);
  const [timePerDiv, setTimePerDiv] = useState(0.002); // seconds per division
  const [voltsPerDiv, setVoltsPerDiv] = useState(1);

  // trigger
  const [trigger, setTrigger] = useState({ enabled: true, mode: "rising", level: 0.0, type: "auto" });

  // channels config
  const [channels, setChannels] = useState([
    { id: "ch1", enabled: true, name: "CH1", type: "sine", amp: 2, freq: 1000, phaseDeg: 0, offset: 0, noise: 0 },
    { id: "ch2", enabled: true, name: "CH2", type: "square", amp: 1, freq: 500, phaseDeg: 0, offset: 0, noise: 0 },
  ]);

  /* ----- signal generator hook ----- */
  const { readBuffer, metaTick } = useSignalGenerator({ channels, samplingHz, running, bufferSize: 16384 });

  // function passed to canvas to get latest N samples
  const getSamples = useCallback(
    (n = 1024) => {
      const { ch1, ch2 } = readBuffer(n);
      // return typed arrays; convert to normal arrays when necessary
      return { ch1: Array.from(ch1), ch2: Array.from(ch2) };
    },
    [readBuffer, metaTick]
  );

  /* ----- scope measurements ----- */
  const [measurements, setMeasurements] = useState({ vpp: 0, vrms: 0, vavg: 0, freq: 0 });

  const handleMeasurements = useCallback((m) => {
    setMeasurements((s) => ({ ...s, ...m }));
  }, []);

  /* ----- FFT data (computed from last chunk) ----- */
  const [spectrum, setSpectrum] = useState([]);

  useEffect(() => {
    // compute small FFT snapshot periodically
    const id = setInterval(() => {
      const { ch1 } = readBuffer(1024);
      if (!ch1) return;
      const spec = computeSpectrum(Array.from(ch1), samplingHz).slice(0, 128);
      setSpectrum(spec.map((s) => ({ f: Math.round(s.f), mag: s.mag })));
    }, 600);
    return () => clearInterval(id);
  }, [readBuffer, samplingHz, metaTick]);

  /* ----- actions ----- */
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Oscilloscope running" : "Oscilloscope paused");
      return nxt;
    });
  };

  const exportCSV = () => {
    // export recent samples (CH1 and CH2)
    const { ch1, ch2 } = readBuffer(1024);
    const rows = [["idx", "ch1", "ch2"]];
    for (let i = 0; i < ch1.length; i++) rows.push([i, round(ch1[i], 9), round(ch2[i], 9)]);
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `osc-snap-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const snapshotPNG = () => {
    // capture canvas (assumes a canvas with selector)
    const canvas = document.querySelector("canvas");
    if (canvas) {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `osc-snapshot-${Date.now()}.png`;
      a.click();
      toast.success("Snapshot saved");
    } else toast.error("Canvas not found");
  };

  /* ----- channel mutators ----- */
  const updateChannel = (idx, patch) => setChannels((s) => s.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  /* ----- UI layout ----- */
  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.32 }} className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md hover:scale-105 transform transition">
                <Zap className="w-6 h-6 text-black" />
              </div>
              <div className="truncate">
                <div className="text-base font-semibold text-zinc-200">SparkLab</div>
                <div className="text-xs text-zinc-400 -mt-0.5">Oscilloscope Simulator</div>
              </div>
            </motion.div>

            {/* desktop controls */}
            <div className="hidden md:flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Select value={String(timePerDiv)} onValueChange={(v) => setTimePerDiv(Number(v))}>
                  <SelectTrigger className="w-36 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                    <SelectValue placeholder="Time/div" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value={String(0.0005)}>0.5 ms/div</SelectItem>
                    <SelectItem value={String(0.001)}>1 ms/div</SelectItem>
                    <SelectItem value={String(0.002)}>2 ms/div</SelectItem>
                    <SelectItem value={String(0.005)}>5 ms/div</SelectItem>
                    <SelectItem value={String(0.01)}>10 ms/div</SelectItem>
                    <SelectItem value={String(0.02)}>20 ms/div</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={String(voltsPerDiv)} onValueChange={(v) => setVoltsPerDiv(Number(v))}>
                  <SelectTrigger className="w-28 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                    <SelectValue placeholder="V/div" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value={String(0.1)}>0.1 V/div</SelectItem>
                    <SelectItem value={String(0.5)}>0.5 V/div</SelectItem>
                    <SelectItem value={String(1)}>1 V/div</SelectItem>
                    <SelectItem value={String(2)}>2 V/div</SelectItem>
                    <SelectItem value={String(5)}>5 V/div</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-1 rounded-md" onClick={snapshotPNG}><Monitor className="w-4 h-4 mr-2" /> Snapshot</Button>
                <Button variant="ghost" className="border border-zinc-700 text-zinc-300 p-2 rounded-md" onClick={toggleRunning}>{running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</Button>
                <Button variant="ghost" className="border border-zinc-700 text-zinc-300 p-2 rounded-md" onClick={() => { setChannels([{ id: "ch1", enabled: true, name: "CH1", type: "sine", amp: 2, freq: 1000, phaseDeg: 0, offset: 0, noise: 0 }, { id: "ch2", enabled: true, name: "CH2", type: "square", amp: 1, freq: 500, phaseDeg: 0, offset: 0, noise: 0 }]); toast("Reset channels"); }}><Settings className="w-5 h-5" /></Button>
              </div>
            </div>

            {/* mobile toggle */}
            <div className="md:hidden">
              <Button variant="ghost" className="border border-zinc-800 p-2 rounded-md" onClick={() => setMobileOpen((s) => !s)}>
                <Menu className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* mobile expand */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex gap-2">
              <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black py-2" onClick={snapshotPNG}>Snapshot</Button>
              <Button variant="ghost" className="border border-zinc-800 flex-1 py-2" onClick={toggleRunning}>{running ? "Pause" : "Run"}</Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16" />

      {/* main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* left controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Scope Controls</div>
                        <div className="text-xs text-zinc-400">Timebase • Probe • Trigger • Channels</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* timebase & vertical scale */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">Time/div</label>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={timePerDiv} onChange={(e) => setTimePerDiv(Number(e.target.value || 0.001))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500">s/div</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">Volts/div</label>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={voltsPerDiv} onChange={(e) => setVoltsPerDiv(Number(e.target.value || 1))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500">V/div</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">Sampling rate (Hz)</label>
                    <Input type="number" value={samplingHz} onChange={(e) => setSamplingHz(Number(e.target.value || 22050))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                  </div>

                  {/* trigger */}
                  <div className="space-y-2 border-t border-zinc-800 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-zinc-400">Trigger</div>
                      <div className="text-xs text-zinc-300">{trigger.type.toUpperCase()}</div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Button variant={trigger.enabled ? "default" : "outline"} className="col-span-1" onClick={() => setTrigger((t) => ({ ...t, enabled: !t.enabled }))}>
                        {trigger.enabled ? "On" : "Off"}
                      </Button>
                      <Button variant={trigger.mode === "rising" ? "default" : "outline"} className="col-span-1" onClick={() => setTrigger((t) => ({ ...t, mode: "rising" }))}>
                        Rising
                      </Button>
                      <Button variant={trigger.mode === "falling" ? "default" : "outline"} className="col-span-1" onClick={() => setTrigger((t) => ({ ...t, mode: "falling" }))}>
                        Falling
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <Input type="number" value={trigger.level} onChange={(e) => setTrigger((t) => ({ ...t, level: Number(e.target.value || 0) }))} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <Select value={trigger.type} onValueChange={(v) => setTrigger((t) => ({ ...t, type: v }))}>
                        <SelectTrigger className="w-32 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="single">Single</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* export */}
                  <div className="flex gap-2 mt-2">
                    <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={exportCSV}><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
                    <Button variant="ghost" className="border border-zinc-800" onClick={() => { setChannels([{ id: "ch1", enabled: true, name: "CH1", type: "sine", amp: 2, freq: 1000, phaseDeg: 0, offset: 0, noise: 0 }, { id: "ch2", enabled: true, name: "CH2", type: "square", amp: 1, freq: 500, phaseDeg: 0, offset: 0, noise: 0 }]); toast("Reset channels"); }}>Reset</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Channels card */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-[#ffd24a]">Channels</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {channels.map((ch, idx) => (
                    <div key={ch.id} className="border border-zinc-800 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center ${idx === 0 ? "bg-[#ffd24a]" : "bg-[#00ffbf]"} text-black`}>{idx === 0 ? "1" : "2"}</div>
                          <div>
                            <div className="text-sm font-semibold">{ch.name}</div>
                            <div className="text-xs text-zinc-400">{ch.type} • {ch.freq} Hz</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant={ch.enabled ? "default" : "outline"} onClick={() => updateChannel(idx, { enabled: !ch.enabled })}>{ch.enabled ? "On" : "Off"}</Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div>
                          <label className="text-xs text-zinc-400">Type</label>
                          <Select value={ch.type} onValueChange={(v) => updateChannel(idx, { type: v })}>
                            <SelectTrigger className="w-full bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                              <SelectItem value="sine">Sine</SelectItem>
                              <SelectItem value="square">Square</SelectItem>
                              <SelectItem value="triangle">Triangle</SelectItem>
                              <SelectItem value="saw">Saw</SelectItem>
                              <SelectItem value="noise">Noise</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400">Frequency (Hz)</label>
                          <Input type="number" value={ch.freq} onChange={(e) => updateChannel(idx, { freq: Number(e.target.value || 0) })} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400">Amplitude (Vpk)</label>
                          <Input type="number" value={ch.amp} onChange={(e) => updateChannel(idx, { amp: Number(e.target.value || 0) })} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400">Phase (°)</label>
                          <Input type="number" value={ch.phaseDeg} onChange={(e) => updateChannel(idx, { phaseDeg: Number(e.target.value || 0) })} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400">Offset (V)</label>
                          <Input type="number" value={ch.offset} onChange={(e) => updateChannel(idx, { offset: Number(e.target.value || 0) })} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400">Noise (%)</label>
                          <Input type="number" value={ch.noise} onChange={(e) => updateChannel(idx, { noise: Number(e.target.value || 0) })} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* right: scope display + visualizer */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <WaveSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Oscilloscope</div>
                        <div className="text-xs text-zinc-400">Real-time waveform viewer • Trigger • FFT</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Time/span: <span className="text-[#ffd24a] ml-1">{round(timePerDiv * 10 * 1000, 2)} ms</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Sample rate: <span className="text-[#ffd24a] ml-1">{samplingHz} Hz</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full">
                  <OscilloscopeCanvas
                    width={980}
                    height={360}
                    getSamples={(n) => getSamples(n).ch1 ? getSamples(n) : { ch1: [], ch2: [] }}
                    timePerDiv={timePerDiv}
                    voltsPerDiv={voltsPerDiv}
                    samplingHz={samplingHz}
                    running={running}
                    trigger={trigger}
                    onMeasurements={handleMeasurements}
                    chColors={["#ffd24a", "#00ffbf"]}
                  />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-3">
                <div className="text-xs text-zinc-400">Measurements</div>
                <div className="text-2xl font-semibold text-[#ff9a4a]">{round(measurements.vpp, 4)} Vpp</div>
                <div className="text-sm text-zinc-300 mt-2">Vrms: <span className="text-[#00ffbf] font-semibold ml-2">{round(measurements.vrms, 4)} V</span></div>
                <div className="text-sm text-zinc-300 mt-1">Freq: <span className="text-[#ffd24a] font-semibold ml-2">{round(measurements.freq, 3)} Hz</span></div>
              </Card>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-3">
                <div className="text-xs text-zinc-400">FFT</div>
                <div className="h-28 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={spectrum}>
                      <CartesianGrid stroke="#111" />
                      <XAxis dataKey="f" tick={{ fill: "#aaa" }} />
                      <YAxis hide />
                      <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "8px" }} />
                      <Bar dataKey="mag" fill="#ff9a4a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-3">
                <div className="text-xs text-zinc-400">Tools</div>
                <div className="flex gap-2 mt-3">
                  <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={snapshotPNG}><Monitor className="w-4 h-4 mr-2" /> Snapshot</Button>
                  <Button variant="ghost" className="border border-zinc-800" onClick={() => { setRunning(false); toast("Single capture not implemented in sim mode"); }}>Single</Button>
                </div>
                <div className="mt-3 text-xs text-zinc-400">Tip: Use the time/div & sample rate to adjust trace detail. Use FFT for frequency analysis.</div>
              </Card>
            </div>

            {/* circuit visualizer */}
            <div>
              <CircuitVisualizerSVG
                chSample={(() => {
                  // approximate instantaneous sample (read latest)
                  const { ch1 } = readBuffer(1);
                  return ch1 && ch1.length ? ch1[ch1.length - 1] : 0;
                })()}
                Vsup={channels[0]?.amp || 1}
                R={10}
                running={running}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
