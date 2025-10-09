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
  Waves as WaveSquare,
  Waves,
  Monitor,
  Activity,
  Menu,
  Radio,
  Wrench,
  Ticket,
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
  const bufferRef = useRef(new Float32Array(bufferSize));
  const buffer2Ref = useRef(new Float32Array(bufferSize));
  const writeIdxRef = useRef(0);
  const t0Ref = useRef(performance.now());
  const lastTickRef = useRef(performance.now());
  const rafRef = useRef(null);

  // keep metaTick as state for UI and as a ref for stable reads
  const [metaTick, setMetaTick] = useState(0);
  const metaTickRef = useRef(metaTick);

  const samplePeriodMs = 1000 / samplingHz; // ms between samples

  // generate 1 sample for a channel
  const genSampleForChannel = useCallback((ch, tSeconds) => {
    const { type, amp = 1, freq = 1, phaseDeg = 0, offset = 0, noise = 0 } = ch || {};
    const phaseRad = (phaseDeg * Math.PI) / 180;
    const omega = 2 * Math.PI * (freq || 0);
    let val = 0;
    if (!ch?.enabled) return 0;
    if (type === "sine") {
      val = amp * Math.sin(omega * tSeconds + phaseRad);
    } else if (type === "square") {
      val = amp * (Math.sign(Math.sin(omega * tSeconds + phaseRad)) || 1);
    } else if (type === "triangle") {
      const period = 1 / (freq || 1);
      const phaseShift = ((phaseDeg / 360) * period) || 0;
      const x = ((tSeconds + phaseShift) % period) / period;
      val = amp * (4 * Math.abs(x - 0.5) - 1);
    } else if (type === "saw") {
      const x = ((tSeconds * freq) % 1 + 1) % 1;
      val = amp * (2 * x - 1);
    } else if (type === "noise") {
      val = amp * (Math.random() * 2 - 1);
    } else {
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
      if (dt < samplePeriodMs * 0.5) return;
      const toProduce = Math.max(1, Math.floor(dt / samplePeriodMs));
      for (let s = 0; s < toProduce; s++) {
        const elapsed = (ts - t0Ref.current) / 1000 - (toProduce - 1 - s) * (samplePeriodMs / 1000);
        const i = writeIdxRef.current % bufferRef.current.length;
        const ch0 = channels[0] || {};
        const ch1 = channels[1] || {};
        bufferRef.current[i] = genSampleForChannel(ch0, elapsed);
        buffer2Ref.current[i] = genSampleForChannel(ch1, elapsed);
        writeIdxRef.current = (writeIdxRef.current + 1) % bufferRef.current.length;
      }
      lastTickRef.current = ts;

      // update tick (both ref and state)
      metaTickRef.current = metaTickRef.current + 1;
      // batch update: set ref synchronously, then state (state triggers render but readBuffer remains stable)
      setMetaTick(metaTickRef.current);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [channels, samplePeriodMs, running, genSampleForChannel]);

  // stable readBuffer that does NOT change identity on every animation tick
  const readBuffer = useCallback(
    (n = 1024) => {
      const len = bufferRef.current.length;
      const out = new Float32Array(n);
      const out2 = new Float32Array(n);
      const w = writeIdxRef.current;
      for (let i = 0; i < n; i++) {
        const idx = (w - n + i + len) % len;
        out[i] = bufferRef.current[idx];
        out2[i] = buffer2Ref.current[idx];
      }
      return { ch1: out, ch2: out2, metaTick: metaTickRef.current };
    },
    [] // intentionally stable
  );

  return { readBuffer, metaTick };
}

/* ============================
   Oscilloscope canvas
   ============================ */
function OscilloscopeCanvas({
  width = 900,
  height = 360,
  getSamples,
  timePerDiv = 0.001,
  voltsPerDiv = 1,
  samplingHz = 44100,
  running,
  trigger,
  onMeasurements,
  chColors = ["#ffd24a", "#00ffbf"],
}) {
  const canvasRef = useRef(null);
  const offRef = useRef(null);
  const lastMeasureRef = useRef(0);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const drawFrame = useCallback(
    (ts) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");

      if (!offRef.current) offRef.current = document.createElement("canvas");
      const off = offRef.current;
      off.width = width * dpr;
      off.height = height * dpr;
      const octx = off.getContext("2d");
      octx.scale(dpr, dpr);

      octx.fillStyle = "#05060a";
      octx.fillRect(0, 0, width, height);

      const divsX = 10, divsY = 8;
      const gx = width / divsX, gy = height / divsY;
      for (let i = 0; i <= divsX; i++) {
        octx.beginPath();
        octx.moveTo(i * gx + 0.5, 0);
        octx.lineTo(i * gx + 0.5, height);
        octx.strokeStyle = i % 5 === 0 ? "rgba(255,154,74,0.15)" : "rgba(255,154,74,0.05)";
        octx.lineWidth = i % 5 === 0 ? 1.5 : 1;
        octx.stroke();
      }
      for (let j = 0; j <= divsY; j++) {
        octx.beginPath();
        octx.moveTo(0, j * gy + 0.5);
        octx.lineTo(width, j * gy + 0.5);
        octx.strokeStyle = j % 4 === 0 ? "rgba(255,154,74,0.12)" : "rgba(255,154,74,0.04)";
        octx.lineWidth = j % 4 === 0 ? 1.4 : 0.8;
        octx.stroke();
      }

      const shownSamples = Math.floor(timePerDiv * divsX * samplingHz);
      const { ch1 = [], ch2 = [] } = getSamples(Math.max(512, Math.min(8192, shownSamples)));

      if (!ch1 || ch1.length === 0) {
        // commit background and exit
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(off, 0, 0, width * dpr, height * dpr, 0, 0, width, height);
        return;
      }

      const pxPerSample = width / ch1.length;
      const pxPerVolt = (gy / voltsPerDiv);
      const midY = height / 2;

      const drawTrace = (arr, color, lw = 2) => {
        octx.beginPath();
        for (let i = 0; i < arr.length; i++) {
          const x = i * pxPerSample;
          const y = midY - arr[i] * pxPerVolt;
          i === 0 ? octx.moveTo(x, y) : octx.lineTo(x, y);
        }
        octx.strokeStyle = color;
        octx.lineWidth = lw;
        octx.lineCap = "round";
        octx.stroke();
      };

      drawTrace(ch1, chColors[0]);
      drawTrace(ch2, chColors[1], 1.3);

      if (trigger?.enabled) {
        const trigX = width * 0.15;
        octx.setLineDash([6, 6]);
        octx.strokeStyle = "rgba(255,255,255,0.08)";
        octx.beginPath();
        octx.moveTo(trigX, 0);
        octx.lineTo(trigX, height);
        octx.stroke();
        octx.setLineDash([]);
        const vPx = midY - trigger.level * pxPerVolt;
        octx.strokeStyle = "rgba(255,154,74,0.7)";
        octx.beginPath();
        octx.moveTo(0, vPx);
        octx.lineTo(width, vPx);
        octx.stroke();
      }

      // measurements (throttled)
      if (onMeasurements && ts - lastMeasureRef.current > 200) {
        lastMeasureRef.current = ts;
        let min = Infinity, max = -Infinity, sum = 0, sumSq = 0, zc = 0;
        for (let i = 0; i < ch1.length; i++) {
          const v = ch1[i];
          if (v < min) min = v;
          if (v > max) max = v;
          sum += v;
          sumSq += v * v;
          if (i > 0 && ch1[i - 1] <= 0 && v > 0) zc++;
        }
        const vpp = max - min;
        const vrms = Math.sqrt(sumSq / ch1.length);
        const vavg = sum / ch1.length;
        const freq = (zc / (ch1.length / samplingHz)) || 0;
        onMeasurements({ vpp, vrms, vavg, freq });
      }

      octx.fillStyle = "rgba(255,255,255,0.07)";
      octx.font = "12px Inter, sans-serif";
      octx.fillText(`${(timePerDiv * divsX * 1000).toFixed(1)} ms span`, 8, 16);
      octx.fillText(`${voltsPerDiv} V/div`, width - 90, 16);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, 0, 0, width * dpr, height * dpr, 0, 0, width, height);
    },
    [width, height, getSamples, timePerDiv, voltsPerDiv, samplingHz, trigger, chColors, onMeasurements, dpr]
  );

  useEffect(() => {
    let alive = true;
    let raf;
    const loop = (ts) => {
      if (!alive) return;
      drawFrame(ts);
      raf = requestAnimationFrame(loop);
    };
    if (running) raf = requestAnimationFrame(loop);
    else drawFrame(performance.now());
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [drawFrame, running]);

  return (
    <div className="w-full bg-gradient-to-b from-black/40 to-zinc-900/10 border border-zinc-800 rounded-xl p-2">
      <canvas ref={canvasRef} width={width * dpr} height={height * dpr}
        style={{ width: `${width}px`, height: `${height}px`, borderRadius: "8px", display: "block" }} />
    </div>
  );
}

/* ============================
   Simple FFT (DFT) utility for small N (not optimized FFT)
   ============================ */


/* ============================
   Circuit visualizer SVG
   ============================ */
function CircuitVisualizerSVG({ chSample = 0, Vsup = 1, R = 10, running = true }) {
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
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full w-20 truncate">R: <span className="text-[#ffd24a] ml-1 truncate">{R} Ω</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full w-20 truncate">V: <span className="text-[#ffd24a] ml-1 truncate">{round(chSample, 4)} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full w-20 truncate">I: <span className="text-[#00ffbf] ml-1 truncate">{round(Iinstant, 6)} A</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-hidden">
        <svg viewBox="0 0 900 160" preserveAspectRatio="xMidYMid meet" className="w-full h-36">
          <g transform="translate(60,80)">
            <rect x="-20" y="-28" width="40" height="56" rx="6" fill="#060606" stroke="#222" />
            <text x="-40" y="-40" fontSize="12" fill="#ffd24a">{round(Vsup,2)} V</text>
          </g>

          <path d="M 120 80 H 340" stroke="#111" strokeWidth="6" strokeLinecap="round" />

          <g transform="translate(420,80)">
            <rect x="-36" y="-18" width="72" height="36" rx="6" fill="#0b0b0b" stroke="#222" />
            <text x="-30" y="-26" fontSize="12" fill="#ffb57a">R</text>
            <text x="-30" y="34" fontSize="12" fill="#fff">{R} Ω</text>
          </g>

          <path d="M 480 80 H 700" stroke="#111" strokeWidth="6" strokeLinecap="round" />

          <g transform="translate(740,80)">
            <path d="M -12 20 H 12" stroke="#333" strokeWidth="4" />
            <path d="M -8 26 H 8" stroke="#222" strokeWidth="3" />
            <path d="M -4 32 H 4" stroke="#111" strokeWidth="2" />
          </g>

          {Array.from({ length: dotCount }).map((_, i) => {
            const total = dotCount;
            const t = (i / total);
            const offset = (running ? (performance.now() / 1000) : 0) * (1 / speed);
            const pos = ((t + offset) % 1);
            let cx = 0, cy = 80;
            if (pos < 0.33) {
              const p = pos / 0.33;
              cx = 120 + (340 - 120) * p;
            } else if (pos < 0.66) {
              const p = (pos - 0.33) / 0.33;
              cx = 340 + (480 - 340) * p;
              cy = 80 + Math.sin(p * Math.PI) * 6;
            } else {
              const p = (pos - 0.66) / 0.34;
              cx = 480 + (700 - 480) * p;
            }
            const color = Iinstant >= 0 ? "#ffd24a" : "#ff6a9a";
            return <circle key={i} cx={cx} cy={cy} r={4} fill={color} opacity={0.9} />;
          })}

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

function computeSpectrum(samples, sampleRate) {
  const N = samples.length;
  if (N === 0) return [];
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = samples[i];

  // Naive DFT (replace with FFT library for speed if needed)
  const result = [];
  for (let k = 0; k < N / 2; k++) {
    let sumRe = 0;
    let sumIm = 0;
    for (let n = 0; n < N; n++) {
      const angle = (-2 * Math.PI * k * n) / N;
      sumRe += re[n] * Math.cos(angle);
      sumIm += re[n] * Math.sin(angle);
    }
    const mag = Math.sqrt(sumRe * sumRe + sumIm * sumIm) / N;
    const f = (k * sampleRate) / N;
    result.push({ f, mag });
  }
  return result;
}

/**
 * Stable FFT Chart with controlled rendering
 */
 function StableFFTChart({ readBuffer, samplingHz }) {
  const dataRef = useRef([]); // holds current spectrum data
  const [chartData, setChartData] = useState([]); // state used for rendering
  const lastUpdate = useRef(0);

  // FFT computation loop
  useEffect(() => {
    let alive = true;

    const loop = (t) => {
      if (!alive) return;
      requestAnimationFrame(loop);

      // Throttle UI updates (every ~500ms)
      if (t - lastUpdate.current < 500) return;
      lastUpdate.current = t;

      const { ch1 } = readBuffer(1024);
      if (!ch1 || ch1.length === 0) return;

      const spec = computeSpectrum(Array.from(ch1), samplingHz)
        .slice(-500)
        .map((s) => ({ f: Math.round(s.f), mag: s.mag }));

      dataRef.current = spec;
      setChartData(spec); // controlled React update
    };

    requestAnimationFrame(loop);
    return () => {
      alive = false;
    };
  }, [readBuffer, samplingHz]);

  // Memoized chart render data (prevents unnecessary rerenders)
  const memoData = useMemo(() => chartData.slice(-400), [chartData]);

  return (
    <div style={{ width: "100%", height: 140, overflow: "hidden" }}>
      <BarChart
        width={400}
        height={140}
        data={memoData}
        margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
      >
        <CartesianGrid stroke="#111" />
        <XAxis dataKey="f" tick={{ fill: "#aaa", fontSize: 10 }} />
        <YAxis hide />
        <ReTooltip
          contentStyle={{
            background: "#0b0b0b",
            border: "1px solid #222",
            color: "#fff",
            borderRadius: "8px",
          }}
        />
        <Bar dataKey="mag" fill="#ff9a4a" radius={[2, 2, 0, 0]} />
      </BarChart>
    </div>
  );
}



/* ============================
   Main Oscilloscope Page
   ============================ */
export default function OscilloscopeSimulatorPage() {
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [samplingHz, setSamplingHz] = useState(22050);
  const [timePerDiv, setTimePerDiv] = useState(0.002);
  const [voltsPerDiv, setVoltsPerDiv] = useState(1);

  const [trigger, setTrigger] = useState({ enabled: true, mode: "rising", level: 0.0, type: "auto" });

  const [channels, setChannels] = useState([
    { id: "ch1", enabled: true, name: "CH1", type: "sine", amp: 2, freq: 1000, phaseDeg: 0, offset: 0, noise: 0 },
    { id: "ch2", enabled: true, name: "CH2", type: "square", amp: 1, freq: 500, phaseDeg: 0, offset: 0, noise: 0 },
  ]);

  const { readBuffer, metaTick } = useSignalGenerator({ channels, samplingHz, running, bufferSize: 16384 });

  const getSamples = useCallback(
    (n = 1024) => {
      const { ch1, ch2 } = readBuffer(n);
      return { ch1: Array.from(ch1), ch2: Array.from(ch2) };
    },
    [readBuffer] // stable: readBuffer does not change identity each tick
  );

  const [measurements, setMeasurements] = useState({ vpp: 0, vrms: 0, vavg: 0, freq: 0 });

  const handleMeasurements = useCallback((m) => {
    setMeasurements((s) => ({ ...s, ...m }));
  }, []);

  const [spectrum, setSpectrum] = useState([]);





  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Oscilloscope running" : "Oscilloscope paused");
      return nxt;
    });
  };

  const exportCSV = () => {
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

  const updateChannel = (idx, patch) => setChannels((s) => s.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

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

            <div className="hidden md:flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Select value={String(timePerDiv)} onValueChange={(v) => setTimePerDiv(Number(v))}>
                  <SelectTrigger className="w-36 cursor-pointer hover:border-orange-500 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                    <SelectValue placeholder="Time/div" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={String(0.0005)}>0.5 ms/div</SelectItem>
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={String(0.001)}>1 ms/div</SelectItem>
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={String(0.002)}>2 ms/div</SelectItem>
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={String(0.005)}>5 ms/div</SelectItem>
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={String(0.01)}>10 ms/div</SelectItem>
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={String(0.02)}>20 ms/div</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={String(voltsPerDiv)} onValueChange={(v) => setVoltsPerDiv(Number(v))}>
                  <SelectTrigger className="w-28 cursor-pointer hover:border-orange-500 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                    <SelectValue placeholder="V/div" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={String(0.1)}>0.1 V/div</SelectItem>
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={String(0.5)}>0.5 V/div</SelectItem>
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={String(1)}>1 V/div</SelectItem>
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={String(2)}>2 V/div</SelectItem>
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value={String(5)}>5 V/div</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-1 rounded-md" onClick={snapshotPNG}><Monitor className="w-4 h-4 mr-2" /> Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-md" onClick={toggleRunning}>{running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-md" onClick={() => { setChannels([{ id: "ch1", enabled: true, name: "CH1", type: "sine", amp: 2, freq: 1000, phaseDeg: 0, offset: 0, noise: 0 }, { id: "ch2", enabled: true, name: "CH2", type: "square", amp: 1, freq: 500, phaseDeg: 0, offset: 0, noise: 0 }]); toast("Reset channels"); }}><Settings className="w-5 h-5" /></Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-md" onClick={() => setMobileOpen((s) => !s)}>
                <Menu className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex gap-2">
              <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black py-2" onClick={snapshotPNG}>Snapshot</Button>
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 flex-1 py-2" onClick={toggleRunning}>{running ? "Pause" : "Run"}</Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <div className="lg:col-span-4 space-y-4">
      {/* --- Scope Controls Card --- */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <Card className="bg-gradient-to-b from-black/80 to-zinc-950 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center shadow-md">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-[#ffd24a]">
                    Scope Controls
                  </div>
                  <div className="text-xs text-zinc-400">
                    Timebase • Probe • Trigger • Channels
                  </div>
                </div>
              </div>

              <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm flex items-center gap-1">
                <Settings className="w-3 h-3" /> Mode
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Time/div */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Time/div</label>
              <Slider
                min={0.0001}
                max={0.01}
                step={0.0001}
                value={[timePerDiv]}
                onValueChange={(v) => setTimePerDiv(v[0])}
                className="text-orange-400"
              />
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{timePerDiv.toFixed(4)} s/div</span>
                <span>⏱</span>
              </div>
            </div>

            {/* Volts/div */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Volts/div</label>
              <Slider
                min={0.1}
                max={10}
                step={0.1}
                value={[voltsPerDiv]}
                onValueChange={(v) => setVoltsPerDiv(v[0])}
              />
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{voltsPerDiv.toFixed(1)} V/div</span>
                <Waves className="w-3 h-3 text-orange-400" />
              </div>
            </div>

            {/* Sampling */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Sampling rate (Hz)</label>
              <Slider
                min={1000}
                max={96000}
                step={1000}
                value={[samplingHz]}
                onValueChange={(v) => setSamplingHz(v[0])}
              />
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{samplingHz.toFixed(0)} Hz</span>
                <Radio className="w-3 h-3 text-orange-400" />
              </div>
            </div>

            {/* Trigger Section */}
            <div className="space-y-3 border-t border-zinc-800 pt-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-zinc-400">Trigger</div>
                <Badge className="bg-black/60 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm text-xs">
                  {trigger.type.toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={trigger.enabled ? "default" : "outline"}
                  className={`col-span-1 cursor-pointer ${
                    trigger.enabled
                      ? "bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black"
                      : "border-zinc-700 text-zinc-300"
                  }`}
                  onClick={() =>
                    setTrigger((t) => ({ ...t, enabled: !t.enabled }))
                  }
                >
                  {trigger.enabled ? "On" : "Off"}
                </Button>
                <Button
                  variant="ghost"
                  className={`col-span-1 cursor-pointer ${
                    trigger.mode === "rising"
                      ? "border border-orange-500 text-orange-300"
                      : "border border-zinc-800 text-zinc-400"
                  }`}
                  onClick={() => setTrigger((t) => ({ ...t, mode: "rising" }))}
                >
                  Rising
                </Button>
                <Button
                  variant="ghost"
                  className={`col-span-1 cursor-pointer ${
                    trigger.mode === "falling"
                      ? "border border-orange-500  text-orange-300"
                      : "border border-zinc-800 text-zinc-400"
                  }`}
                  onClick={() => setTrigger((t) => ({ ...t, mode: "falling" }))}
                >
                  Falling
                </Button>
              </div>

              <div className="space-y-2 mt-2">
                <label className="text-xs text-zinc-400">Trigger Level (V)</label>
                <Slider
                  min={-10}
                  max={10}
                  step={0.1}
                  value={[trigger.level]}
                  onValueChange={(v) =>
                    setTrigger((t) => ({ ...t, level: v[0] }))
                  }
                />
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>{trigger.level.toFixed(2)} V</span>
                  <span>⚡</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={trigger.type}
                  onValueChange={(v) =>
                    setTrigger((t) => ({ ...t, type: v }))
                  }
                >
                  <SelectTrigger className="w-32 cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-400 focus:ring-2 focus:ring-orange-400">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="auto">Auto</SelectItem>
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="normal">Normal</SelectItem>
                    <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="single">Single</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <Button
                className="flex-1 cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black"
                onClick={exportCSV}
              >
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </Button>
              <Button
                variant="ghost"
                className="border bg-white cursor-pointer border-zinc-800"
                onClick={() => {
                  setChannels([
                    {
                      id: "ch1",
                      enabled: true,
                      name: "CH1",
                      type: "sine",
                      amp: 2,
                      freq: 1000,
                      phaseDeg: 0,
                      offset: 0,
                      noise: 0,
                    },
                    {
                      id: "ch2",
                      enabled: true,
                      name: "CH2",
                      type: "square",
                      amp: 1,
                      freq: 500,
                      phaseDeg: 0,
                      offset: 0,
                      noise: 0,
                    },
                  ]);
                  toast("Reset channels");
                }}
              >
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* --- Channels Section --- */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <Card className="bg-gradient-to-b from-black/80 to-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg">
          <CardHeader>
            <CardTitle className="text-[#ffd24a] flex items-center gap-2">
              <Waves className="w-5 h-5 text-orange-400" /> Channels
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {channels.map((ch, idx) => (
              <div
                key={ch.id}
                className="border border-zinc-800 rounded-xl p-3 bg-black/40 backdrop-blur-sm hover:border-orange-500/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-md flex items-center justify-center shadow-sm ${
                        idx === 0
                          ? "bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black"
                          : "bg-gradient-to-r from-[#00ffc6] to-[#00bfff] text-black"
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{ch.name}</div>
                      <div className="text-xs text-zinc-400">
                        {ch.type} • {ch.freq} Hz
                      </div>
                    </div>
                  </div>
                  <Button
                    variant={ch.enabled ? "default" : "outline"}
                    className={`cursor-pointer ${
                      ch.enabled
                        ? "bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black"
                        : "border border-zinc-700 text-zinc-300"
                    }`}
                    onClick={() =>
                      updateChannel(idx, { enabled: !ch.enabled })
                    }
                  >
                    {ch.enabled ? "On" : "Off"}
                  </Button>
                </div>

                {/* Channel Parameters */}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {[
                    ["Type", "type", "select"],
                    ["Frequency (Hz)", "freq", "slider", 10, 5000, 10],
                    ["Amplitude (Vpk)", "amp", "slider", 0.1, 10, 0.1],
                    ["Phase (°)", "phaseDeg", "slider", 0, 360, 1],
                    ["Offset (V)", "offset", "slider", -5, 5, 0.1],
                    ["Noise (%)", "noise", "slider", 0, 50, 1],
                  ].map(([label, key, type, min, max, step]) => (
                    <div key={key}>
                      <label className="text-xs text-zinc-400">{label}</label>
                      {type === "select" ? (
                        <Select
                          value={ch[key]}
                          onValueChange={(v) =>
                            updateChannel(idx, { [key]: v })
                          }
                        >
                          <SelectTrigger className="w-full cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-400 focus:ring-2 focus:ring-orange-400">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                            <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="sine">Sine</SelectItem>
                            <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="square">Square</SelectItem>
                            <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="triangle">Triangle</SelectItem>
                            <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="saw">Saw</SelectItem>
                            <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="noise">Noise</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <>
                          <Slider
                            min={min}
                            max={max}
                            step={step}
                            value={[ch[key]]}
                            onValueChange={(v) =>
                              updateChannel(idx, { [key]: v[0] })
                            }
                          />
                          <div className="text-xs text-zinc-500 mt-1">
                            {ch[key]}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </div>

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
                    getSamples={getSamples} // pass stable function directly
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Card className="bg-gradient-to-br from-zinc-950 via-black/80 to-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-md hover:shadow-[0_0_25px_rgba(255,154,74,0.15)] transition-all duration-300">
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="space-y-3"
  >
    {/* Header */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
          <Activity className="w-4 h-4 text-black" />
        </div>
        <span className="text-xs uppercase tracking-wider text-zinc-400">Measurements</span>
      </div>
      <Badge className="bg-black/70 border border-[#ff7a2d]/40 text-[#ffd24a] text-[10px] px-2 py-0.5 rounded-full">
        Live
      </Badge>
    </div>

    {/* Values */}
    <div className="text-3xl font-bold text-[#ff9a4a] tracking-tight flex items-center gap-2">
      <Zap className="w-5 h-5 text-[#ffd24a]" />
      {round(measurements.vpp, 4)} <span className="text-sm text-zinc-400 font-medium">Vpp</span>
    </div>

    <div className="flex flex-col gap-2 text-sm text-zinc-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Waves className="w-4 h-4 text-[#00ffbf]" />
          <span className="text-zinc-400">Vrms</span>
        </div>
        <span className="text-[#00ffbf] font-semibold">{round(measurements.vrms, 4)} V</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Activity className="w-4 h-4 text-[#ffd24a]" />
          <span className="text-zinc-400">Frequency</span>
        </div>
        <span className="text-[#ffd24a] font-semibold">{round(measurements.freq, 3)} Hz</span>
      </div>
    </div>

    {/* Accent Line */}
    <div className="mt-3 h-[2px] bg-gradient-to-r from-[#ff7a2d]/80 via-[#ffd24a]/80 to-transparent rounded-full"></div>
  </motion.div>
</Card>

            
<Card className="bg-gradient-to-br from-zinc-950 via-black/80 to-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-md hover:shadow-[0_0_25px_rgba(255,154,74,0.15)] transition-all duration-300">
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className="space-y-4"
  >
    {/* Header */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
          <Wrench className="w-4 h-4 text-black" />
        </div>
        <span className="text-xs uppercase tracking-wider text-zinc-400">Tools</span>
      </div>
      <Badge className="bg-black/70 border border-[#ff7a2d]/40 text-[#ffd24a] text-[10px] px-2 py-0.5 rounded-full">
        Utility
      </Badge>
    </div>

    {/* Tool Buttons */}
    <div className="flex gap-2 mt-1">
      <Button
        className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-semibold hover:shadow-[0_0_10px_rgba(255,154,74,0.4)] transition-all duration-200"
        onClick={snapshotPNG}
      >
        <Monitor className="w-4 h-4 mr-2" /> Snapshot
      </Button>

      <Button
        variant="ghost"
        className="flex-1 cursor-pointer border border-zinc-800 text-zinc-200 hover:border-[#ff7a2d]/60 hover:text-[#ffd24a] transition-all duration-200"
        onClick={() => {
          setRunning(false);
          toast("Single capture not implemented in sim mode");
        }}
      >
        <Zap className="w-4 h-4 mr-2 text-[#ff9a4a]" /> Single
      </Button>
    </div>  

    {/* Info Tip */}
    <div className="mt-2 text-xs text-zinc-400 leading-relaxed border-t border-zinc-800 pt-3">
      <span className="text-[#ffd24a] font-medium flex items-center gap-1"> <Ticket className="w-4 h-4"/>Tip:</span> Adjust <span className="text-[#ff9a4a] font-semibold">Time/Div</span> 
      and <span className="text-[#ff9a4a] font-semibold">Sample Rate</span> for better waveform detail.  
      Use <span className="text-[#00ffbf] font-semibold">FFT</span> for frequency-domain analysis.
    </div>
  </motion.div>
</Card>
            </div>

            <div>
              <CircuitVisualizerSVG
                chSample={(() => {
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
