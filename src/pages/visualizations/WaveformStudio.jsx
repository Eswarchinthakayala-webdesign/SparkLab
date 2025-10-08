// src/pages/visualizations/WaveformStudio.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  Square,
  Activity,
  Zap,
  CircleDot,
  Cpu,
  Gauge,
  Plug,
  Bolt,
  Waves,
  SignalHigh,
  FerrisWheel,
  Torus,
  CircuitBoard,
} from "lucide-react";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import Footer from "@/components/landing/Footer"; // adjust path if needed

// ------------------------ Theme variables (used inline / in-class) ------------------------
const THEME = {
  bg: "#05060a",
  cardBg: "#000",
  border: "rgba(255,255,255,0.06)",
  accent: "#ff7a2d",
  accent2: "#ffd24a",
  secondary: "#0b0b0b",
  subtle: "rgba(255,255,255,0.035)",
};

// ------------------------ Utility: basic waveforms ------------------------
function sineSample(phase) {
  return Math.sin(phase);
}
function squareSample(phase) {
  return Math.sign(Math.sin(phase));
}
function triangleSample(phase) {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}
function sawSample(phase) {
  const t = phase % (2 * Math.PI);
  // shift and normalize
  return ((t / Math.PI) - 1) * -1;
}

// additive harmonics (kept simple, limited)
function withHarmonics(baseFunc, phase, harmonics) {
  let out = baseFunc(phase);
  for (let h = 2; h <= Math.max(0, Math.min(12, harmonics)); h++) {
    out += (1 / h) * baseFunc(phase * h);
  }
  // conservative normalization factor
  const norm = 1 + (Math.min(12, Math.max(0, harmonics)) * 0.4);
  return out / norm;
}

// ------------------------ Oscilloscope (canvas) ------------------------
function Oscilloscope({
  running,
  waveType,
  frequency,
  amplitude,
  phaseDeg,
  harmonics,
  timeScale = 1,
  showGrid = true,
  className = "",
  classHeight = "h-44 md:h-64 lg:h-72",
}) {
  const canvasRef = useRef(null);
  const tRef = useRef(0);
  const rafRef = useRef(null);

  const baseFunc = useMemo(() => {
    switch (waveType) {
      case "sine":
        return sineSample;
      case "square":
        return squareSample;
      case "triangle":
        return triangleSample;
      case "saw":
        return sawSample;
      default:
        return sineSample;
    }
  }, [waveType]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const dprCap = 2;
    const devicePR = Math.min(dprCap, window.devicePixelRatio || 1);

    let last = performance.now();

    function draw(now) {
      const dt = (now - last) / 1000;
      last = now;
      if (running) tRef.current += dt;

      // set logical size matched to CSS
      const wCSS = Math.max(1, canvas.clientWidth);
      const hCSS = Math.max(1, canvas.clientHeight);
      const w = Math.floor(wCSS * devicePR);
      const h = Math.floor(hCSS * devicePR);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${wCSS}px`;
        canvas.style.height = `${hCSS}px`;
      }

      // set transform for DPR (avoid cumulative scale)
      ctx.setTransform(devicePR, 0, 0, devicePR, 0, 0);

      // clear
      ctx.clearRect(0, 0, wCSS, hCSS);

      // background
      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, wCSS, hCSS);

      // grid
      if (showGrid) {
        ctx.strokeStyle = THEME.subtle;
        ctx.lineWidth = 1;
        const stepX = Math.max(28, Math.floor(wCSS / 12));
        const stepY = Math.max(18, Math.floor(hCSS / 8));
        ctx.beginPath();
        for (let gx = 0; gx < wCSS; gx += stepX) {
          ctx.moveTo(gx + 0.5, 0);
          ctx.lineTo(gx + 0.5, hCSS);
        }
        for (let gy = 0; gy < hCSS; gy += stepY) {
          ctx.moveTo(0, gy + 0.5);
          ctx.lineTo(wCSS, gy + 0.5);
        }
        ctx.stroke();
      }

      // waveform drawing
      ctx.save();
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // glow
      ctx.shadowBlur = 18;
      ctx.shadowColor = THEME.accent;

      // gradient
      const grad = ctx.createLinearGradient(0, 0, wCSS, 0);
      grad.addColorStop(0, THEME.accent);
      grad.addColorStop(0.7, THEME.accent2);
      ctx.strokeStyle = grad;

      ctx.beginPath();
      const midY = hCSS / 2;
      // sample count bounded for perf
      const samples = Math.max(160, Math.min(1200, Math.floor(wCSS / 1.6)));
      const angularFreq = 2 * Math.PI * Math.max(0.0001, frequency);
      const phaseRad = (phaseDeg * Math.PI) / 180;

      for (let i = 0; i < samples; i++) {
        const x = (i / (samples - 1)) * wCSS;
        const tWindow = (i / (samples - 1) - 1) * (0.5 / Math.max(0.01, timeScale));
        const tSample = tRef.current + tWindow;
        const phase = angularFreq * tSample + phaseRad;
        const raw = withHarmonics(baseFunc, phase, harmonics);
        const y = midY - raw * amplitude * (hCSS * 0.38);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // labels (reset shadow to keep text crisp)
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.font = "12px system-ui, -apple-system, 'Segoe UI', Roboto";
      const label = `${waveType.toUpperCase()} • ${frequency.toFixed(2)} Hz • ${amplitude.toFixed(2)} pk`;
      ctx.fillText(label, 10, 18);

      ctx.restore();

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, waveType, frequency, amplitude, phaseDeg, harmonics, timeScale, showGrid]);

  return (
    <div className={`${classHeight} w-full rounded-md overflow-hidden border`} style={{ borderColor: THEME.border }}>
      <canvas ref={canvasRef} className={`w-full h-full ${className}`} aria-label="Oscilloscope canvas" />
    </div>
  );
}

// ------------------------ Wave3D (Three.js) ------------------------
function Wave3D({ waveType, frequency, amplitude, phaseDeg, harmonics, running, className = "" }) {
  const mountRef = useRef(null);
  const threeRef = useRef({ renderer: null, scene: null, camera: null, raf: null, geom: null });

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(THEME.bg);
    scene.fog = new THREE.FogExp2(THEME.bg, 0.04);

    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.set(0, 1.2, 5.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(el.clientWidth, el.clientHeight, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    el.appendChild(renderer.domElement);

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const orange = new THREE.PointLight(0xff7a2d, 1.0, 18);
    orange.position.set(-3, 2, 4);
    const soft = new THREE.PointLight(0xffb86b, 0.9, 22);
    soft.position.set(3, -1, 4);
    scene.add(orange, soft);

    // ribbon data (buffer geometry)
    const samples = 360;
    const positions = new Float32Array(samples * 3);
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 6 - 3;
      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    threeRef.current.geom = geom;

    // material
    const mat = new THREE.LineBasicMaterial({
      vertexColors: false,
      linewidth: 2,
      color: new THREE.Color(THEME.accent),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(geom, mat);
    scene.add(line);

    // spheres moving along
    const sphereGeo = new THREE.SphereGeometry(0.055, 10, 10);
    const spheres = [];
    for (let s = 0; s < 6; s++) {
      const matS = new THREE.MeshBasicMaterial({ color: new THREE.Color(THEME.accent2), transparent: true, opacity: 0.9 });
      const sp = new THREE.Mesh(sphereGeo, matS);
      scene.add(sp);
      spheres.push(sp);
    }

    // base
    const baseGeo = new THREE.CircleGeometry(2.6, 64);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.03 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.rotation.x = -Math.PI / 2;
    base.position.y = -1.1;
    scene.add(base);

    // animation
    let t = 0;
    let rafId = null;

    const baseWaveFunc = (phase) => {
      switch (waveType) {
        case "sine":
          return sineSample(phase);
        case "square":
          return squareSample(phase);
        case "triangle":
          return triangleSample(phase);
        case "saw":
          return sawSample(phase);
        default:
          return sineSample(phase);
      }
    };

    function animate() {
      rafId = requestAnimationFrame(animate);
      if (!running) {
        renderer.render(scene, camera);
        return;
      }
      // advance time
      t += 0.018;
      const posAttr = geom.attributes.position;
      const w = samples;
      const af = 2 * Math.PI * Math.max(0.0001, frequency);

      // smoother frame updates with lerp to previous values (reduces jitter)
      for (let i = 0; i < w; i++) {
        const x = (i / (w - 1)) * 6 - 3;
        const phase = af * (t + (i / w) * 0.05) + (phaseDeg * Math.PI) / 180;
        const val = withHarmonics(baseWaveFunc, phase, harmonics);
        const targetY = val * amplitude * 0.82 + Math.sin(x + t * 0.28) * 0.02;
        const prevY = posAttr.getY(i);
        const newY = prevY * 0.85 + targetY * 0.15;
        posAttr.setY(i, newY);
      }
      posAttr.needsUpdate = true;

      // spheres travel along line
      for (let s = 0; s < spheres.length; s++) {
        const u = ((t * 0.36) + s * 0.14) % 1;
        const idx = Math.floor(u * (w - 1));
        const sx = posAttr.getX(idx);
        const sy = posAttr.getY(idx);
        const sz = posAttr.getZ(idx);
        spheres[s].position.set(sx, sy, sz);
        spheres[s].material.opacity = 0.3 + 0.7 * Math.abs(Math.sin(t * (0.6 + s * 0.07)));
      }

      // camera subtle breathing & responsive z
      camera.position.z = 5.0 + Math.sin(t * 0.22) * 0.12 + (1 - Math.min(2.0, amplitude)) * 0.18;

      renderer.render(scene, camera);
    }
    animate();

    const onResize = () => {
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener("resize", onResize);

    threeRef.current = { renderer, scene, camera, rafId, geom };

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose && m.dispose());
          else o.material.dispose && o.material.dispose();
        }
      });
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  // we allow the animate loop closure to use props via refs/outer scope — keeps perf high
  useEffect(() => {
    // nothing to do; props are captured by closure on mount for perf.
  }, [waveType, frequency, amplitude, phaseDeg, harmonics, running]);

 return (
  <div
    ref={mountRef}
    className={`w-full rounded-md overflow-hidden ${className}`}
    style={{
      minHeight: 240, // ensure visible on small screens
      height: "auto",
      aspectRatio: "16 / 9", // keeps proper canvas ratio
    }}
  />
);

}

// ------------------------ CircuitVisualizer (SVG) ------------------------
function CircuitVisualizer({ amplitude, frequency, phaseDeg, running, className = "" }) {
  const R = 120;
  const Vrms = amplitude / Math.SQRT2;
  const Irms = Vrms / R;
  const vPercent = Math.min(1, Math.abs(Vrms) / 12);
  const iPercent = Math.min(1, Math.abs(Irms) / 0.18);

  const [animT, setAnimT] = useState(0);
  const animRef = useRef(null);

  useEffect(() => {
    function tick(t) {
      setAnimT((t / 600) % 1);
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // needle angles (in degrees) for visual meters (range -60 .. +60)
  const vAngle = (vPercent * 120) - 60;
  const iAngle = (iPercent * 120) - 60;

  const blobs = Array.from({ length: 8 }).map((_, i) => {
    const offset = ((animT + i / 8) % 1);
    return { offset, key: i };
  });

  const VrmsText = Vrms.toFixed(2);
  const IrmsText = Irms.toFixed(3);

  return (
    <div className={`rounded-md p-3 border`} style={{ borderColor: THEME.border, background: THEME.cardBg}}>
      <div className="flex items-center justify-between mb-3 ">
        <div>
          <div className="text-sm font-medium text-orange-400 flex items-center"><CircuitBoard className="w-4 h-4 mr-1"/> Circuit Visualizer</div>
         
        </div>
        <div className="flex gap-3 bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded-full 
  shadow-sm hover:border-orange-500/50 transition-all duration-300">
          <div className="text-xs ">V<sub>rms</sub>: <span className="font-semibold text-white">{VrmsText} V</span></div>
          <div className="text-xs">I<sub>rms</sub>: <span className="font-semibold text-white">{IrmsText} A</span></div>
        </div>
      </div>

      <svg viewBox="0 0 600 160" className="w-full h-40 block" preserveAspectRatio="xMidYMid meet">
        {/* battery */}
        <g transform="translate(16,56)">
          <rect x="0" y="0" width="18" height="48" rx="2" fill={THEME.accent} />
          <rect x="26" y="6" width="6" height="36" rx="1" fill={THEME.accent} />
        </g>

        {/* left wire */}
        <path d="M50 80 H220" stroke="#444" strokeWidth="4" fill="none" />

        {/* resistor */}
        <rect x="220" y="64" width="100" height="32" rx="4" fill={THEME.secondary} stroke="#333" strokeWidth="2" />
        <text x="270" y="84" textAnchor="middle" fill={THEME.accent} fontSize="12">R {R}Ω</text>

        {/* load */}
        <rect x="330" y="48" width="50" height="64" rx="6" fill="#070707" stroke="#333" strokeWidth="2" />
        <text x="355" y="86" fill="#fff" fontSize="11" textAnchor="middle">Load</text>

        {/* voltmeter */}
        <g transform="translate(150,28)">
          <circle cx="0" cy="0" r="20" fill="#070707" stroke="#333" strokeWidth="2" />
          <text x="0" y="6" fill={THEME.accent2} fontSize="12" textAnchor="middle">V</text>

          {/* needle (rotate transform) */}
          <g transform={`translate(0,0)`}>
            <line x1="0" y1="0" x2="0" y2="-14" stroke={THEME.accent2} strokeWidth="2" transform={`rotate(${vAngle})`} style={{ transformOrigin: "0px 0px" }} />
            <circle cx="0" cy="0" r="2" fill={THEME.accent2} />
          </g>

          <rect x="-32" y="-36" width="64" height="10" rx="3" fill="#0b0b0b" />
          <text x="0" y="-28" fill="#fff" fontSize="10" textAnchor="middle">{VrmsText} V</text>
        </g>

        {/* ammeter */}
        <g transform="translate(450,128)">
          <circle cx="0" cy="0" r="20" fill="#070707" stroke="#333" strokeWidth="2" />
          <text x="0" y="6" fill={THEME.accent} fontSize="12" textAnchor="middle">A</text>

          <g transform={`translate(0,0)`}>
            <line x1="0" y1="0" x2="0" y2="-14" stroke={THEME.accent} strokeWidth="2" transform={`rotate(${iAngle})`} style={{ transformOrigin: "0px 0px" }} />
            <circle cx="0" cy="0" r="2" fill={THEME.accent} />
          </g>

          <rect x="-32" y="18" width="64" height="10" rx="3" fill="#0b0b0b" />
          <text x="0" y="28" fill="#fff" fontSize="10" textAnchor="middle">{IrmsText} A</text>
        </g>

        {/* blobs left */}
        {blobs.map((b) => (
          <circle key={"l" + b.key} cx={50 + (170 * b.offset)} cy={80} r={6} fill={THEME.accent} opacity={0.5 + 0.35 * Math.sin((b.offset + animT) * Math.PI * 2)} />
        ))}

        {/* blobs right */}
        {blobs.map((b) => (
          <circle key={"r" + b.key} cx={380 + (170 * b.offset)} cy={80} r={6} fill={THEME.accent2} opacity={0.45 + 0.35 * Math.sin((b.offset + animT + 0.3) * Math.PI * 2)} />
        ))}

        {/* arrows */}
        <path d="M90 74 L96 80 L90 86" fill={THEME.accent} />
        <path d="M520 74 L514 80 L520 86" fill={THEME.accent2} />
      </svg>
    </div>
  );
}

// ------------------------ Controls panel ------------------------
function ControlsPanel({
  waveType,
  setWaveType,
  frequency,
  setFrequency,
  amplitude,
  setAmplitude,
  phase,
  setPhase,
  harmonics,
  setHarmonics,
  running,
  setRunning,
  showOsc,
  setShowOsc,
  show3D,
  setShow3D,
  showCircuit,
  setShowCircuit,
}) {
  // clamp helpers
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  return (
    <Card className="rounded-2xl overflow-hidden border bg-black" style={{ borderColor: THEME.border }}>
      <CardHeader className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl" style={{ background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Square className="w-6 h-6" />
        </div>
        <div>
          <CardTitle className="text-lg text-orange-400">Waveform Studio</CardTitle>
          <div className="text-xs text-zinc-400">Create, visualize, and analyze waveforms in real-time.</div>
        </div>
      </CardHeader>

      <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400">Waveform</label>
            <Select value={waveType} onValueChange={(v) => setWaveType(v)}>
  <SelectTrigger
    className="w-full bg-black/70 border border-orange-500/30 
    text-white text-sm rounded-md shadow-sm cursor-pointer 
    hover:border-orange-500/50 focus:ring-2 focus:ring-orange-500/40 
    transition-all duration-300"
  >
    <SelectValue placeholder="Select Waveform" />
  </SelectTrigger>

  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
    <SelectGroup>
      <SelectLabel className="text-zinc-400">Waveforms</SelectLabel>

      <SelectItem
        value="sine"
        className="text-white hover:bg-orange-500/20 
        data-[highlighted]:text-orange-300 data-[highlighted]:bg-orange-500/30 
        cursor-pointer rounded-sm transition-all duration-200"
      >
        Sine
      </SelectItem>

      <SelectItem
        value="square"
        className="text-white hover:bg-orange-500/20 
        data-[highlighted]:text-orange-300 data-[highlighted]:bg-orange-500/30 
        cursor-pointer rounded-sm transition-all duration-200"
      >
        Square
      </SelectItem>

      <SelectItem
        value="triangle"
        className="text-white hover:bg-orange-500/20 
        data-[highlighted]:text-orange-300 data-[highlighted]:bg-orange-500/30 
        cursor-pointer rounded-sm transition-all duration-200"
      >
        Triangle
      </SelectItem>

      <SelectItem
        value="saw"
        className="text-white hover:bg-orange-500/20 
        data-[highlighted]:text-orange-300 data-[highlighted]:bg-orange-500/30 
        cursor-pointer rounded-sm transition-all duration-200"
      >
        Sawtooth
      </SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>

          </div>

         <div className="flex flex-col w-full gap-2">
  {/* Label */}
  <label className="text-xs text-zinc-400">Frequency (Hz)</label>

  {/* Number Input */}
  <Input
    type="number"
    inputMode="decimal"
    value={frequency}
    min={0.01}
    max={120}
    step={0.01}
    aria-label="frequency-hz"
    onChange={(e) => setFrequency(clamp(Number(e.target.value) || 0, 0.01, 120))}
    className="bg-black/70 border border-orange-500/30 text-white text-sm rounded-md shadow-sm focus:ring-2 focus:ring-orange-500/40 transition-all duration-200"
  />

  {/* Range Slider */}
  <Slider
    value={[frequency]}
    onValueChange={(v) => setFrequency(clamp(v[0], 0.01, 120))}
    min={0.01}
    max={120}
    step={0.01}
    className="w-full h-2 cursor-pointer bg-orange-400 rounded relative overflow-hidden"
  >
    {/* Filled portion */}
    <div
      style={{ width: `${(frequency / 120) * 100}%` }}
      className="absolute top-0 left-0 h-2 bg-orange-500 rounded-full"
    />
  </Slider>
</div>


       <div className="flex flex-col w-full gap-2">
  {/* Label */}
  <label className="text-xs text-zinc-400">Amplitude (peak)</label>

  {/* Number Input */}
  <Input
    type="number"
    inputMode="decimal"
    value={amplitude}
    min={0}
    max={5}
    step={0.01}
    aria-label="amplitude-peak"
    onChange={(e) => setAmplitude(clamp(Number(e.target.value) || 0, 0, 5))}
    className="bg-black/70 border border-orange-500/30 text-white text-sm rounded-md shadow-sm focus:ring-2 focus:ring-orange-500/40 transition-all duration-200"
  />

  {/* Range Slider */}
  <Slider
    value={[amplitude]}
    onValueChange={(v) => setAmplitude(clamp(v[0], 0, 5))}
    min={0}
    max={5}
    step={0.01}
    className="w-full h-2 bg-orange-400 cursor-pointer rounded-full relative overflow-hidden"
  >
    {/* Filled portion */}
    <div
      style={{ width: `${(amplitude / 5) * 100}%` }}
      className="absolute top-0 left-0 h-2 bg-orange-500 rounded-full"
    />
  </Slider>
</div>


        <div className="flex flex-col w-full gap-2">
  {/* Label */}
  <label className="text-xs text-zinc-400">Phase (°)</label>

  {/* Number Input */}
  <Input
    type="number"
    value={phase}
    min={-360}
    max={360}
    aria-label="phase-deg"
    onChange={(e) => setPhase(clamp(Number(e.target.value) || 0, -360, 360))}
    className="bg-black/70 border border-orange-500/30 text-white text-sm rounded-md shadow-sm focus:ring-2 focus:ring-orange-500/40 transition-all duration-200"
  />

  {/* Range Slider */}
  <Slider
    value={[phase]}
    onValueChange={(v) => setPhase(clamp(v[0], -360, 360))}
    min={-360}
    max={360}
    step={1}
    className="w-full h-2 bg-orange-400 cursor-pointer rounded-full relative overflow-hidden"
  >
    {/* Filled portion */}
    <div
      style={{ left: `${((phase + 360) / 720) * 100}%`, width: '2px' }}
      className="absolute top-0 h-2 bg-orange-500"
    />
  </Slider>
</div>

        </div>

        <div className="space-y-3">
          <div className="flex flex-col w-full gap-2">
  {/* Label */}
  <label className="text-xs text-zinc-400">Harmonics (additive)</label>

  {/* Number Input */}
  <Input
    type="number"
    min={0}
    max={12}
    value={harmonics}
    aria-label="harmonics-count"
    onChange={(e) => setHarmonics(clamp(Number(e.target.value) || 0, 0, 12))}
    className="bg-black/70 border border-orange-500/30 text-white text-sm rounded-md shadow-sm focus:ring-2 focus:ring-orange-500/40 transition-all duration-200"
  />

  {/* Range Slider */}
  <Slider
    value={[harmonics]}
    onValueChange={(v) => setHarmonics(clamp(v[0], 0, 12))}
    min={0}
    max={12}
    step={1}
    className="w-full h-2 bg-orange-400 cursor-pointer rounded-full relative overflow-hidden"
  >
    {/* Filled portion */}
    <div
      style={{ width: `${(harmonics / 12) * 100}%` }}
      className="absolute top-0 left-0 h-2 bg-orange-500 rounded-full"
    />
  </Slider>

  {/* Helper text */}
 <div
  className="bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded 
  shadow-sm hover:border-orange-500/50 transition-all duration-300"
>
  Add partials to visualize richer waveforms (educational)
</div>

</div>


          <div className="flex items-center flex-row sm:flex-col  gap-2">
            <Button
              onClick={() => setRunning((r) => !r)}
              className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black sm:w-full cursor-pointer"
              aria-pressed={running}
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
                setFrequency(2);
                setAmplitude(1);
                setPhase(0);
                setHarmonics(0);
              }}
              className="border border-zinc-700 sm:w-full cursor-pointer"
            >
              Reset
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300">Real-time</Badge>
            <Badge
              onClick={() => setShowOsc((s) => !s)}
              className={`cursor-pointer ${showOsc ? "bg-[rgba(255,122,45,0.12)] border-[#ff7a2d]" : "bg-zinc-900/40"}`}
            >
              Oscilloscope
            </Badge>
            <Badge
              onClick={() => setShow3D((s) => !s)}
              className={`cursor-pointer ${show3D ? "bg-[rgba(255,210,74,0.08)] border-[#ffd24a]" : "bg-zinc-900/40"}`}
            >
              3D Visual
            </Badge>
            <Badge
              onClick={() => setShowCircuit((s) => !s)}
              className={`cursor-pointer ${showCircuit ? "bg-[rgba(58,138,255,0.06)] border-[#3a8aff]" : "bg-zinc-900/40"}`}
            >
              Circuit
            </Badge>
          </div>

          <div
  className="bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded 
  shadow-sm hover:border-orange-500/50 transition-all duration-300"
>
  Tip: increase harmonics to morph waveforms visually. Use the circuit panel to see how the waveform behaves across a resistor load.
</div>

        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------ Main Page ------------------------
export default function WaveformStudioPage() {
  // Controls state
  const [waveType, setWaveType] = useState("sine");
  const [frequency, setFrequency] = useState(2.0);
  const [amplitude, setAmplitude] = useState(1.0);
  const [phase, setPhase] = useState(0);
  const [harmonics, setHarmonics] = useState(0);
  const [running, setRunning] = useState(true);
  const [showOsc, setShowOsc] = useState(true);
  const [show3D, setShow3D] = useState(true);
  const [showCircuit, setShowCircuit] = useState(true);

  // prefers-reduced-motion
  const prefersReduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (prefersReduced) {
      setShow3D(false);
    }
  }, [prefersReduced]);

  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px]" >
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
                <div className="text-xs text-zinc-400 -mt-0.5">Waveform Studio</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-xs bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded-full 
  shadow-sm hover:border-orange-500/50 transition-all duration-300">Real-time waveform design & analysis</div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <ControlsPanel
              waveType={waveType}
              setWaveType={setWaveType}
              frequency={frequency}
              setFrequency={setFrequency}
              amplitude={amplitude}
              setAmplitude={setAmplitude}
              phase={phase}
              setPhase={setPhase}
              harmonics={harmonics}
              setHarmonics={setHarmonics}
              running={running}
              setRunning={setRunning}
              showOsc={showOsc}
              setShowOsc={setShowOsc}
              show3D={show3D}
              setShow3D={setShow3D}
              showCircuit={showCircuit}
              setShowCircuit={setShowCircuit}
            />

<div className="mt-6 space-y-4">

<Card
  className="rounded-2xl border transition-all duration-300 hover:border-orange-500/40 hover:shadow-[0_0_20px_rgba(255,122,45,0.2)]"
  style={{ borderColor: THEME.border, background: THEME.cardBg }}
>
  <CardHeader className="p-4 border-b border-zinc-800/60">
    <CardTitle className="flex items-center gap-2 text-sm sm:text-base font-semibold text-orange-400">
      <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-orange-400" />
      Analysis
    </CardTitle>
  </CardHeader>

  <CardContent className="p-4">
    <div className="text-xs sm:text-sm text-zinc-400 mb-4">
      RMS / Peak / Frequency information
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-center">
      {/* Peak Voltage */}
      <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800/70 transition-all duration-300">
        <div className="flex items-center gap-2 text-zinc-300 text-xs sm:text-sm">
          <SignalHigh className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
          <span>Peak</span>
        </div>
        <div className="mt-1 font-semibold text-sm sm:text-base text-orange-100">
          {amplitude.toFixed(2)} V
        </div>
      </div>

      {/* RMS Voltage */}
      <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800/70 transition-all duration-300">
        <div className="flex items-center gap-2 text-zinc-300 text-xs sm:text-sm">
          <Waves className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
          <span>RMS (approx)</span>
        </div>
        <div className="mt-1 font-semibold text-sm sm:text-base text-orange-100">
          {(amplitude / Math.SQRT2).toFixed(2)} V
        </div>
      </div>

      {/* Frequency */}
      <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800/70 transition-all duration-300">
        <div className="flex items-center gap-2 text-zinc-300 text-xs sm:text-sm">
          <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
          <span>Freq</span>
        </div>
        <div className="mt-1 font-semibold text-sm sm:text-base text-orange-100">
          {frequency.toFixed(2)} Hz
        </div>
      </div>
    </div>
  </CardContent>
</Card>

</div>

          </div>

          <div className="lg:col-span-8 space-y-6">
            {/* Visual area */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border p-3" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex text-sm items-center text-orange-400 font-medium">
                  <FerrisWheel className="w-4 h-4 mr-1"/>  Oscilloscope</div>
                  <div
  className="bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded-full 
  shadow-sm hover:border-orange-500/50 transition-all duration-300"
>
 Real-time signal
</div>

                </div>
                {showOsc ? (
                  <Oscilloscope
                    running={running}
                    waveType={waveType}
                    frequency={frequency}
                    amplitude={amplitude}
                    phaseDeg={phase}
                    harmonics={harmonics}
                    timeScale={1}
                    showGrid
                    classHeight="h-44 md:h-64 lg:h-80"
                  />
                ) : (
                  <div className="h-44 md:h-64 lg:h-80 rounded-md flex items-center justify-center border" style={{ borderColor: THEME.border, color: "rgba(255,255,255,0.45)" }}>
                    Oscilloscope hidden
                  </div>
                )}
              </div>

              <div className="rounded-2xl border p-3" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-orange-400 flex items-center font-medium">
                   <Torus className="w-4 h-4 mr-1"/> 3D Visualizer</div>
                  <div className="bg-black/60 border border-orange-500/30 
  text-[#ffd24a] text-[11px] px-3 py-1 rounded-full 
  shadow-sm hover:border-orange-500/50 transition-all duration-300">Futuristic ribbon</div>
                </div>
                {show3D ? (
                  <div className="w-full h-64 md:h-80 lg:h-96 rounded-md overflow-hidden border" style={{ borderColor: THEME.border }}>
                    <Wave3D
                      waveType={waveType}
                      frequency={frequency}
                      amplitude={amplitude}
                      phaseDeg={phase}
                      harmonics={harmonics}
                      running={running}
                    />
                  </div>
                ) : (
                  <div className="h-64 rounded-md flex items-center justify-center border" style={{ borderColor: THEME.border, color: "rgba(255,255,255,0.45)" }}>
                    3D Visual hidden (reduced motion)
                  </div>
                )}
              </div>
            </div>

            {/* Circuit visualizer & controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {showCircuit ? (
                  <CircuitVisualizer amplitude={amplitude} frequency={frequency} phaseDeg={phase} running={running} />
                ) : (
                  <div className="rounded-2xl border p-6 text-zinc-500" style={{ borderColor: THEME.border }}>Circuit view hidden</div>
                )}
              </div>

              <div>
                <Card className="rounded-2xl border p-3" style={{ borderColor: THEME.border, background: THEME.cardBg }}>
                  <CardHeader className="p-3">
                    <CardTitle className="text-sm text-orange-400">Oscilloscope Controls & Measurements</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="text-xs text-zinc-400">Scope timebase & trigger preview</div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-zinc-400">Timebase</label>
                        <Input type="range" min="0.25" max="4" defaultValue={1} className="w-full cursor-pointer" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Trigger (level)</label>
                        <Input type="range" min="-1" max="1" step="0.01" defaultValue={0} className="w-full cursor-pointer" />
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs text-zinc-400">Measurements</div>
                      <div className="mt-2 text-sm text-orange-100">
                        <div>Peak-to-peak: <span className="font-medium">{(amplitude * 2).toFixed(2)} V</span></div>
                        <div>Frequency: <span className="font-medium">{frequency.toFixed(2)} Hz</span></div>
                        <div>Harmonics: <span className="font-medium">{harmonics}</span></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
