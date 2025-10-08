"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Cable,
  Play,
  Pause,
  Settings,
  Download,
  Menu,
  X,
  Activity,
  Gauge,
  Lightbulb,
  ArrowUp,
  ArrowDown,
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
import {Slider } from "@/components/ui/slider"
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

const c = {
  add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a, b) => {
    const denom = b.re * b.re + b.im * b.im || 1e-12;
    return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom };
  },
  scale: (a, s) => ({ re: a.re * s, im: a.im * s }),
  mag: (a) => Math.hypot(a.re, a.im),
  angle: (a) => Math.atan2(a.im, a.re),
  j: (x) => ({ re: 0, im: x }),
  fromPolar: (mag, ang) => ({ re: mag * Math.cos(ang), im: mag * Math.sin(ang) }),
  zero: () => ({ re: 0, im: 0 }),
};

const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function useTransformerSim({
  running,
  timestep = 40,
  Np = 100,
  Ns = 200,
  Vp_rms = 230,
  freq = 50,
  Rp = 0.5,
  Rs = 0.5,
  Llp_mH = 0.1,
  Lls_mH = 0.1,
  Lm_H = 0.05,
  Rload = 50,
  coupling = 0.98,
  mode = "step-up",
  tap = 0.5,
}) {
  const historyRef = useRef(Array.from({ length: 300 }, (_, i) => ({ t: i, vp: 0, vs: 0, ip: 0, is: 0 })));
  const [history, setHistory] = useState(historyRef.current);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);
  const w = useMemo(() => 2 * Math.PI * freq, [freq]);
  const n = useMemo(() => Ns / Math.max(1, Np), [Ns, Np]);
  const a = useMemo(() => Np / Math.max(1, Ns), [Np, Ns]);
  const Rp_val = Math.max(0, Number(Rp) || 0);
  const Rs_val = Math.max(0, Number(Rs) || 0);
  const Llp = (Number(Llp_mH) || 0) * 1e-3;
  const Lls = (Number(Lls_mH) || 0) * 1e-3;
  const Lm = Number(Lm_H) || 0.05;
  const Rload_val = Math.max(0.0001, Number(Rload) || 0.0001);
  const k = clamp(Number(coupling) || 0, 0, 1);
  const modeSafe = ["step-up", "step-down", "auto"].includes(mode) ? mode : "step-up";
  const tapSafe = clamp(Number(tap) || 0.5, 0, 1);
  const Zp_series = useMemo(() => ({ re: Rp_val, im: w * Llp }), [Rp_val, w, Llp]);
  const Zs_series = useMemo(() => ({ re: Rs_val + Rload_val, im: w * Lls }), [Rs_val, Rload_val, w, Lls]);
  const Zm = useMemo(() => ({ re: 0, im: w * Lm }), [w, Lm]);

  const Z_ref = useMemo(() => {
    if (modeSafe === "auto") {
      const effectiveNs = Np * Math.max(0.001, tapSafe);
      const factor = (Np / Math.max(1, effectiveNs)) ** 2;
      return { re: Zs_series.re * factor, im: Zs_series.im * factor };
    } else {
      const factor = (Np / Math.max(1, Ns)) ** 2;
      return { re: Zs_series.re * factor, im: Zs_series.im * factor };
    }
  }, [Np, Ns, Zs_series, modeSafe, tapSafe]);

  const Zp_total = useMemo(() => c.add(Zp_series, Z_ref), [Zp_series, Z_ref]);
  const Vp_phasor = useMemo(() => ({ re: Number(Vp_rms) || 0, im: 0 }), [Vp_rms]);

  const Ip_ref_phasor = useMemo(() => {
    if (Zp_total.re === 0 && Zp_total.im === 0) return c.zero();
    return c.div(Vp_phasor, Zp_total);
  }, [Vp_phasor, Zp_total]);

  const Im_phasor = useMemo(() => {
    if (!Lm || w === 0) return c.zero();
    return c.div(Vp_phasor, Zm);
  }, [Vp_phasor, Zm, Lm, w]);

  const Ip_total_phasor = useMemo(() => c.add(Ip_ref_phasor, Im_phasor), [Ip_ref_phasor, Im_phasor]);

  const Is_phasor = useMemo(() => {
    if (modeSafe === "auto") {
      const factor = Math.max(0.001, tapSafe);
      return c.scale(Ip_ref_phasor, factor);
    } else {
      const factor = (Np / Math.max(1, Ns));
      return c.scale(Ip_ref_phasor, factor);
    }
  }, [Ip_ref_phasor, Np, Ns, modeSafe, tapSafe]);

  const Vs_phasor = useMemo(() => c.mul(Is_phasor, Zs_series), [Is_phasor, Zs_series]);

  const Ip_mag = useMemo(() => c.mag(Ip_total_phasor), [Ip_total_phasor]);
  const Ip_ang = useMemo(() => c.angle(Ip_total_phasor), [Ip_total_phasor]);
  const Is_mag = useMemo(() => c.mag(Is_phasor), [Is_phasor]);
  const Is_ang = useMemo(() => c.angle(Is_phasor), [Is_phasor]);
  const Vp_mag = useMemo(() => c.mag(Vp_phasor), [Vp_phasor]);
  const Vs_mag = useMemo(() => c.mag(Vs_phasor), [Vs_phasor]);
  const Vs_ang = useMemo(() => c.angle(Vs_phasor), [Vs_phasor]);
  const Vp_ang = 0;

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
      const tSec = tRef.current / 1000;
      const theta = w * tSec;
      const v_p_inst = Math.SQRT2 * Vp_mag * Math.sin(theta + Vp_ang);
      const v_s_inst = Math.SQRT2 * Vs_mag * Math.sin(theta + Vs_ang);
      const i_p_inst = Math.SQRT2 * Ip_mag * Math.sin(theta + Ip_ang);
      const i_s_inst = Math.SQRT2 * Is_mag * Math.sin(theta + Is_ang);

      setHistory((h) => {
        const next = h.slice();
        next.push({ t: tSec, vp: v_p_inst, vs: v_s_inst, ip: i_p_inst, is: i_s_inst });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    running,
    timestep,
    w,
    Vp_mag,
    Vs_mag,
    Ip_mag,
    Is_mag,
    Vp_ang,
    Vs_ang,
    Ip_ang,
    Is_ang,
  ]);

  return {
    history,
    meta: {
      n,
      a,
      Vp_rms,
      Vs_rms: Vs_mag,
      Ip_rms: Ip_mag,
      Is_rms: Is_mag,
      Ip_phasor: Ip_total_phasor,
      Is_phasor,
      Zp_total,
      Zs_series,
      Lm,
      k,
      mode: modeSafe,
      tap: tapSafe,
    },
  };
}

 function TransformerSVG({
  history = [],
  meta = {},
  running = true,
  Np = 120,
  Ns = 12,
  mode = "step-up",
  tap = 0.5,
}) {
  // ---- helpers ----
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, digits = 3) => {
    if (v == null || Number.isNaN(v)) return 0;
    const p = Math.pow(10, digits);
    return Math.round(v * p) / p;
  };

  // ---- read latest samples ----
  const latest = history.length ? history[history.length - 1] : { vp: 0, vs: 0, ip: 0, is: 0 };
  const ip = latest.ip || 0;
  const is_ = latest.is || 0;
  const absIp = Math.abs(ip);
  const absIs = Math.abs(is_);

  // ---- visual counts and speed scaling ----
  const dotCountP = Math.max(4, Math.min(40, Math.round(4 + absIp * 14)));
  const dotCountS = Math.max(4, Math.min(40, Math.round(4 + absIs * 14)));
  const baseSpeedP = clamp(0.9 + (absIp > 0 ? 1 / (absIp + 0.02) : 1.8), 0.2, 4.0);
  const baseSpeedS = clamp(0.9 + (absIs > 0 ? 1 / (absIs + 0.02) : 1.8), 0.2, 4.0);

  // ---- SVG layout ----
  const width = 980;
  const height = 360;
  const coreX = width / 2;
  const coreY = height / 2;
  const coilOffset = 160;
  const coilHeight = 160;
  const coilWidth = 76;

  const leftWireStartX = coreX - coilOffset - coilWidth - 16;
  const leftWireEndX = 80;
  const leftWireY = coreY;
  const leftDistance = leftWireEndX - leftWireStartX; // positive distance to translate dots to the left end

  const rightWireStartX = coreX + coilOffset + coilWidth + 16;
  const rightWireEndX = width - 80;
  const rightWireY = coreY;
  const rightDistance = rightWireEndX - rightWireStartX; // positive distance to translate dots to the right end

  // Visual mapping for turns -> how many drawn loops
  const visualTurnsFor = (turns) => Math.max(6, Math.min(28, Math.round(turns / 6)));

  function coilPaths(turnsCount, side = "left") {
    const turns = visualTurnsFor(turnsCount);
    const spacing = coilHeight / (turns + 1);
    const parts = [];
    for (let i = 0; i < turns; i++) {
      const y = 8 + (i + 1) * spacing;
      const startX = side === "left" ? 12 : coilWidth - 12;
      const endX = side === "left" ? coilWidth - 12 : 12;
      const dir = side === "left" ? 1 : -1;
      const cx1 = startX + dir * 10;
      const cx2 = endX - dir * 10;
      const d = `M ${startX} ${y} C ${cx1} ${y - 10}, ${cx2} ${y + 10}, ${endX} ${y}`;
      parts.push(d);
    }
    return parts;
  }

  const pCoilPaths = useMemo(() => coilPaths(Np, "left"), [Np]);
  const sCoilPaths = useMemo(() => coilPaths(Ns, "right"), [Ns]);

  const primaryDots = Array.from({ length: dotCountP });
  const secondaryDots = Array.from({ length: dotCountS });

  // ---- style variations by mode ----
  const stepUpStyle = {
    fluxIntensity: 1.05,
    primaryGlow: "rgba(255,160,80,0.16)",
    secondaryGlow: "rgba(80,200,255,0.10)",
    primaryColor: "#ffb86b",
    secondaryColor: "#9ee6ff",
    speedFactor: 0.92,
  };
  const stepDownStyle = {
    fluxIntensity: 0.85,
    primaryGlow: "rgba(255,140,100,0.10)",
    secondaryGlow: "rgba(80,200,255,0.06)",
    primaryColor: "#ffd27a",
    secondaryColor: "#9ae6d6",
    speedFactor: 1.12,
  };
  const autoStyle = {
    fluxIntensity: 1.2,
    primaryGlow: "rgba(255,200,120,0.18)",
    secondaryGlow: "rgba(120,255,200,0.14)",
    primaryColor: "#ffd24a",
    secondaryColor: "#9ee6ff",
    speedFactor: 0.85,
  };

  const styleMap = mode === "step-down" ? stepDownStyle : mode === "auto" ? autoStyle : stepUpStyle;

  // ---- dynamic intensities for visual feedback (non-physical but useful) ----
  // Scale currents for visuals - small currents still visible; clamp to sane range
  const pEnergy = clamp(Math.sqrt(absIp) * 0.9, 0.02, 2.8);
  const sEnergy = clamp(Math.sqrt(absIs) * 0.9, 0.02, 2.8);

  const speedP = Math.max(0.22, baseSpeedP * styleMap.speedFactor * clamp(1 / (1 + pEnergy * 0.12), 0.6, 1.2));
  const speedS = Math.max(0.22, baseSpeedS * styleMap.speedFactor * clamp(1 / (1 + sEnergy * 0.12), 0.6, 1.2));

  // ---- coil appearance derived from current magnitudes ----
  const coilGlowWidthP = clamp(2 + pEnergy * 3.5, 2, 8);
  const coilGlowWidthS = clamp(2 + sEnergy * 3.5, 2, 8);

  // core flux opacity for ellipse
  const coreFluxOpacity = clamp(0.14 * styleMap.fluxIntensity * (1 + (pEnergy + sEnergy) / 3), 0.02, 0.7);

  // animation durations derived
  const animDurationP = Math.max(0.22, speedP * (mode === "step-down" ? 1.05 : mode === "auto" ? 0.88 : 0.78));
  const animDurationS = Math.max(0.22, speedS * (mode === "step-down" ? 1.15 : mode === "auto" ? 0.88 : 0.78));

  // colors depending on direction of current
  const pDotColor = ip >= 0 ? styleMap.primaryColor : "#ff6a9a";
  const sDotColor = is_ >= 0 ? styleMap.secondaryColor : "#9ee6ff";

  // ---- accessible label for mode ----
  const modeLabel = mode === "auto" ? `Autotransformer (${Math.round(tap * 100)}% tap)` : mode === "step-down" ? "Step-down" : "Step-up";

  // Set CSS variables on the svg via style map so keyframes can use them
  const svgVars = {
    ["--leftDistance"]: `${leftDistance}px`,
    ["--rightDistance"]: `${rightDistance}px`,
    ["--primaryGlow"]: styleMap.primaryGlow,
    ["--secondaryGlow"]: styleMap.secondaryGlow,
    ["--coreFluxOpacity"]: `${coreFluxOpacity}`,
  };

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              background: "linear-gradient(135deg,#ff7a2d,#ffd24a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#000",
              fontWeight: 700,
            }}
          >
            TX
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#ffd24a" }}>Transformer Visualizer</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>Interactive • Real-time • {modeLabel}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ background: "#0b0b0b", border: "1px solid #222", color: "#d1d5db", padding: "6px 10px", borderRadius: 999 }}>
            Np: <span style={{ color: "#ffd24a", marginLeft: 6 }}>{Np}</span>
          </div>
          <div style={{ background: "#0b0b0b", border: "1px solid #222", color: "#d1d5db", padding: "6px 10px", borderRadius: 999 }}>
            Ns:{" "}
            <span style={{ color: "#ffd24a", marginLeft: 6 }}>
              {mode === "auto" ? `${Math.round(Np * tap)} (tap)` : Ns}
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, width: "100%", overflowX: "auto" }}>
        <svg
  viewBox={`0 0 ${width} ${height}`}
  preserveAspectRatio="xMidYMid meet"
  className="w-full h-64"
  role="img"
  aria-label="Transformer visualizer"
  style={{
    "--flow-distance-p": `${leftDistance}px`,
    "--flow-distance-s": `${rightDistance}px`,
  }}
        >
          <defs>
            <linearGradient id="coreGrad" x1="0%" x2="100%">
              <stop offset="0%" stopColor="#050505" />
              <stop offset="30%" stopColor="#111111" />
              <stop offset="70%" stopColor="#0a0a0a" />
            </linearGradient>

            <radialGradient id="fluxGrad" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#ff9a3b" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#ff7a2d" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ff7a2d" stopOpacity="0" />
            </radialGradient>

            <linearGradient id="coilGlowP" x1="0" x2="1">
              <stop offset="0%" stopColor={styleMap.primaryColor} stopOpacity="0.98" />
              <stop offset="100%" stopColor={styleMap.primaryColor} stopOpacity="0.55" />
            </linearGradient>

            <linearGradient id="coilGlowS" x1="0" x2="1">
              <stop offset="0%" stopColor={styleMap.secondaryColor} stopOpacity="0.98" />
              <stop offset="100%" stopColor={styleMap.secondaryColor} stopOpacity="0.55" />
            </linearGradient>

            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Laminated core stack */}
          <g transform={`translate(${coreX - 80}, ${coreY - 110})`}>
            {Array.from({ length: 8 }).map((_, i) => {
              const inset = i * 2.5;
              const w = 160 - inset * 2;
              const h = 220 - inset * 2;
              const opacity = 0.06 + (i % 2) * 0.02;
              return (
                <rect
                  key={`lam-${i}`}
                  x={inset}
                  y={inset}
                  rx={8}
                  width={w}
                  height={h}
                  fill={i % 2 === 0 ? "#070707" : "#0b0b0b"}
                  stroke="#111"
                  opacity={opacity}
                />
              );
            })}
            <rect x={10} y={12} width={140} height={196} rx={10} fill="url(#coreGrad)" stroke="#181818" />
          </g>

          {/* dynamic flux halo */}
          <g filter="url(#softGlow)">
            <ellipse cx={coreX} cy={coreY} rx={140} ry={70} fill="url(#fluxGrad)" opacity={coreFluxOpacity} />
          </g>

          {/* LEFT coil (primary) */}
          {mode !== "auto" && (
            <g transform={`translate(${coreX - coilOffset - coilWidth}, ${coreY - coilHeight / 2})`} aria-hidden>
              <rect x="-12" y="-8" width={coilWidth + 24} height={coilHeight + 16} rx="10" fill="#050505" stroke="#181818" />
              <text x={coilWidth / 2 - 12} y={-18} fontSize="12" fill="#ffd24a">{`${Np} turns`}</text>
              <g
                stroke="url(#coilGlowP)"
                strokeWidth={coilGlowWidthP}
                strokeLinecap="round"
                fill="none"
                style={{
                  filter: `drop-shadow(0 8px 18px ${styleMap.primaryGlow})`,
                }}
              >
                {pCoilPaths.map((d, i) => (
                  <path key={`p-turn-${i}`} d={d} opacity={0.98 - (i % 3) * 0.02} />
                ))}
              </g>
              {/* small label showing primary current magnitude */}
              <text x={-18} y={coilHeight + 18} fontSize="11" fill="#9ca3af">
                Ip: <tspan fill="#00ffbf">{round(meta.Ip_rms ?? ip, 6)} A</tspan>
              </text>
            </g>
          )}

          {/* RIGHT coil (secondary) */}
          {mode !== "auto" && (
            <g transform={`translate(${coreX + coilOffset - coilWidth / 2}, ${coreY - coilHeight / 2})`} aria-hidden>
              <rect x="-12" y="-8" width={coilWidth + 24} height={coilHeight + 16} rx="10" fill="#050505" stroke="#181818" />
              <text x={coilWidth / 2 - 10} y={-18} fontSize="12" fill="#ffd24a">{`${Ns} turns`}</text>
              <g
                stroke="url(#coilGlowS)"
                strokeWidth={coilGlowWidthS}
                strokeLinecap="round"
                fill="none"
                style={{
                  filter: `drop-shadow(0 8px 18px ${styleMap.secondaryGlow})`,
                }}
              >
                {sCoilPaths.map((d, i) => (
                  <path key={`s-turn-${i}`} d={d} opacity={0.98 - (i % 3) * 0.02} />
                ))}
              </g>
              <text x={-6} y={coilHeight + 18} fontSize="11" fill="#9ca3af">
                Is: <tspan fill="#9ee6ff">{round(meta.Is_rms ?? is_, 6)} A</tspan>
              </text>
            </g>
          )}

          {/* AUTOTRANSFORMER single coil block */}
          {mode === "auto" && (
            <g transform={`translate(${coreX - coilWidth / 2}, ${coreY - coilHeight / 2})`} aria-hidden>
              <rect x={-16} y={-8} width={coilWidth + 32} height={coilHeight + 16} rx="12" fill="#050505" stroke="#181818" />
              <text x={0} y={-18} fontSize="12" fill="#ffd24a">{`Autotransformer ${Math.round(tap * 100)}% tap`}</text>
              <g stroke="url(#coilGlowP)" strokeWidth={Math.max(3, coilGlowWidthP - 1)} strokeLinecap="round" fill="none" style={{ filter: `drop-shadow(0 8px 18px ${styleMap.primaryGlow})` }}>
                {Array.from({ length: 18 }).map((_, i) => {
                  const turns = 18;
                  const spacing = coilHeight / (turns + 1);
                  const y = 8 + (i ) * spacing;
                  const startX = 1;
                  const endX = coilWidth -4;
                  const cx1 = startX + 2;
                  const cx2 = endX - 2;
                  return <path key={`auto-turn-${i}`} d={`M ${startX} ${y} C ${cx1} ${y - 8}, ${cx2} ${y + 8}, ${endX} ${y}`} opacity={0.97 - (i % 4) * 0.02} />;
                })}
              </g>

              {/* tap line & knob */}
              <line x1={-12} y1={coilHeight / 2} x2={coilWidth + 44} y2={coilHeight / 2} stroke="#333" strokeWidth={3} strokeLinecap="round" opacity={0.6} />
              <circle cx={-12 + (coilWidth + 56) * clamp(tap, 0, 1)} cy={coilHeight / 2} r={6} fill="#ffd24a" stroke="#222" strokeWidth={1.2} />
            </g>
          )}

          {/* connection wires */}
          <path d={`M ${leftWireStartX} ${leftWireY} H ${leftWireEndX}`} stroke="#262626" strokeWidth="3.5" strokeLinecap="round" />
          <path d={`M ${rightWireStartX} ${rightWireY} H ${rightWireEndX}`} stroke="#262626" strokeWidth="3.5" strokeLinecap="round" />

          {/* moving dots (primary side) */}
      <g aria-hidden>
  {primaryDots.map((_, idx) => {
    const delay = -((idx / primaryDots.length) * animDurationP * 0.96);
    const anim = `${running ? (mode === "auto" ? "primaryFlowAuto" : "primaryFlow") : "pausedFlow"} ${animDurationP}s linear infinite`;
    const animDirection = ip >= 0 ? "normal" : "reverse";
    const style = {
      animation: anim,
      animationDelay: `${delay}s`,
      animationDirection: animDirection,
      willChange: "transform, opacity",
    };
    return (
      <circle
        key={`p-dot-${idx}`}
        cx={leftWireStartX}
        cy={leftWireY}
        r={3.4}
        fill={pDotColor}
        style={style}
      />
    );
  })}
</g>


          {/* moving dots (secondary side) */}
<g aria-hidden>
  {secondaryDots.map((_, idx) => {
    const delay = -((idx / secondaryDots.length) * animDurationS * 0.96);
    const animName = mode === "auto" ? "autoFlowSecondary" : "secondaryFlow";
    const anim = `${running ? animName : "pausedFlow"} ${animDurationS}s linear infinite`;
    const animDirection = is_ >= 0 ? "normal" : "reverse";
    const style = {
      animation: anim,
      animationDelay: `${delay}s`,
      animationDirection: animDirection,
      willChange: "transform, opacity",
    };
    return (
      <circle
        key={`s-dot-${idx}`}
        cx={rightWireStartX}
        cy={rightWireY}
        r={3.2}
        fill={sDotColor}
        style={style}
      />
    );
  })}
</g>


          {/* Meters & readouts box */}
          <g transform={`translate(${width - 220}, 40)`}>
            <rect x="7" y="-36" width="200" height="160" rx="8" fill="#060606" stroke="#222" />
            <text x="14" y="-14" fontSize="12" fill="#ffb57a">Meters & Readouts</text>
            <text x="14" y="6" fontSize="12" fill="#fff">Vp (rms): <tspan fill="#ffd24a">{round(meta.Vp_rms ?? latest.vp, 3)} V</tspan></text>
            <text x="14" y="28" fontSize="12" fill="#fff">Vs (rms): <tspan fill="#ffd24a">{round(meta.Vs_rms ?? latest.vs, 3)} V</tspan></text>
            <text x="14" y="50" fontSize="12" fill="#fff">Ip (rms): <tspan fill="#00ffbf">{round(meta.Ip_rms ?? ip, 6)} A</tspan></text>
            <text x="14" y="72" fontSize="12" fill="#fff">Is (rms): <tspan fill="#9ee6ff">{round(meta.Is_rms ?? is_, 6)} A</tspan></text>
          </g>

          {/* flux rings that slowly spin to indicate magnetizing flux */}
          <g>
            {Array.from({ length: 5 }).map((_, i) => {
              const r = 44 + i * 14;
              const dur = 2.8 + i * 0.6;
              const opacity = 0.04 + (i % 2) * 0.02;
              const style = {
                transformOrigin: `${coreX}px ${coreY}px`,
                animation: running ? `fluxSpin ${dur}s linear infinite` : "none",
                stroke: i % 2 === 0 ? "#ff7a2d" : "#ff9a3b",
                strokeWidth: 1.1,
                opacity,
              };
              return <ellipse key={`flux-${i}`} cx={coreX} cy={coreY} rx={r} ry={r * 0.48} fill="none" style={style} />;
            })}
          </g>

          {/* CSS animations embedded */}
          <style>{`
            @keyframes fluxSpin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }

        @keyframes primaryFlow {
  0% { transform: translateX(0); opacity: 0.95; }
  10% { opacity: 1; }
  90% { opacity: 0.7; }
  100% { transform: translateX(var(--flow-distance-p)); opacity: 0; }
}

@keyframes primaryFlowAuto {
  0% { transform: translateX(0); opacity: 0.95; }
  50% { transform: translateX(calc(var(--flow-distance-p) / 2)); opacity: 1; }
  100% { transform: translateX(var(--flow-distance-p)); opacity: 0.6; }
}

@keyframes pausedFlow {
  0%, 100% { transform: translateX(0); opacity: 0.35; }
}
  @keyframes secondaryFlow {
  0% { transform: translateX(0); opacity: 0.95; }
  10% { opacity: 1; }
  90% { opacity: 0.7; }
  100% { transform: translateX(var(--flow-distance-s)); opacity: 0; }
}

@keyframes autoFlowSecondary {
  0% { transform: translateX(0); opacity: 0.95; }
  50% { transform: translateX(calc(var(--flow-distance-s) / 2)); opacity: 1; }
  100% { transform: translateX(var(--flow-distance-s)); opacity: 0.6; }
}




            /* secondaryFlow: rightwards movement from right-start -> right-end */

          `}</style>
        </svg>
      </div>
    </div>
  );
}


function TransformerOscilloscope({ history = [], running }) {
  const data = history.slice(-400).map((d, idx) => ({
    t: idx,
    Vp: round(d.vp, 3),
    Vs: round(d.vs, 3),
    Ip: round(d.ip, 6),
    Is: round(d.is, 6),
  }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — Vp, Vs, Ip, Is</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="Vp" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Vp (V)" />
            <Line type="monotone" dataKey="Vs" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Vs (V)" />
            <Line type="monotone" dataKey="Ip" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Ip (A)" />
            <Line type="monotone" dataKey="Is" stroke="#9ee6ff" strokeWidth={2} dot={false} isAnimationActive={false} name="Is (A)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function InteractiveTransformerPage() {
  const [Np, setNp] = useState(100);
  const [Ns, setNs] = useState(200);
  const [Vp_rms, setVp_rms] = useState("230");
  const [freq, setFreq] = useState("50");
  const [Rp, setRp] = useState("0.5");
  const [Rs, setRs] = useState("0.5");
  const [Llp_mH, setLlp_mH] = useState("0.1");
  const [Lls_mH, setLls_mH] = useState("0.1");
  const [Lm_H, setLm_H] = useState("0.05");
  const [Rload, setRload] = useState("50");
  const [coupling, setCoupling] = useState("0.98");
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [transformerType, setTransformerType] = useState("step-up");
  const [tap, setTap] = useState(0.5);

  const { history, meta } = useTransformerSim({
    running,
    timestep: 40,
    Np,
    Ns,
    Vp_rms: Number.isFinite(Number(Vp_rms)) ? Number(Vp_rms) : 230,
    freq: Number.isFinite(Number(freq)) ? Number(freq) : 50,
    Rp: Number.isFinite(Number(Rp)) ? Number(Rp) : 0.5,
    Rs: Number.isFinite(Number(Rs)) ? Number(Rs) : 0.5,
    Llp_mH,
    Lls_mH,
    Lm_H,
    Rload,
    coupling,
    mode: transformerType,
    tap,
  });

  const turnsRatio = useMemo(() => (Ns / Math.max(1, Np)), [Np, Ns]);
  const Vs_rms = meta.Vs_rms;
  const Ip_rms = meta.Ip_rms;
  const Is_rms = meta.Is_rms;

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };
  const setRpDefault = () => {
    setRp("0.5");
    setRs("0.5");
    setLlp_mH("0.1");
    setLls_mH("0.1");
    setLm_H("0.05");
  };

  const resetDefaults = () => {
    setNp(100);
    setNs(200);
    setVp_rms("230");
    setFreq("50");
    setRpDefault();
    setRload("50");
    setCoupling("0.98");
    setTap(0.5);
    setTransformerType("step-up");
    toast("Reset to defaults");
  };

  useEffect(() => {
    setRpDefault();
  }, []);

  const exportCSV = () => {
    const rows = [["t (s)", "Vp (V)", "Vs (V)", "Ip (A)", "Is (A)"], ...history.map((d) => [d.t, round(d.vp, 6), round(d.vs, 6), round(d.ip, 9), round(d.is, 9)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transformer-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const setNpSafe = (v) => setNp(Math.max(1, Math.round(Number(v) || 1)));
  const setNsSafe = (v) => setNs(Math.max(1, Math.round(Number(v) || 1)));

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2 sm:py-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-5 h-5  text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm  font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs  text-zinc-400 -mt-0.5 truncate">Transformer Lab </div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-36">
                <Select value={transformerType} onValueChange={(v) => setTransformerType(v)}>
                  <SelectTrigger className="w-full text-orange-100 bg-black/80 border cursor-pointer border-zinc-800  text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue className="text-orange-300" placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="step-up"    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" >Step-up</SelectItem>
                    <SelectItem value="step-down"    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Step-down</SelectItem>
                    <SelectItem value="auto"    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Autotransformer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning} title={running ? "Pause" : "Play"}>{running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={resetDefaults}><Settings className="w-5 h-5" /></Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</Button>
            </div>
          </div>

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-64 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={resetDefaults}>Reset</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16"></div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden w-full max-w-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center"><Activity className="w-5 h-5" /></div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Transformer Controls</div>
                        <div className="text-xs text-zinc-400">Turn ratio, frequency, winding & load params</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">

<div className="space-y-2">
  <label className="text-xs text-zinc-400">Primary Turns (Np)</label>
  
  <div className="flex items-center flex-col-reverse gap-3">
    {/* Slider */}
    <Slider
      value={[Np]}
      onValueChange={(v) => setNpSafe(v[0])}
      min={10}
      max={1000}
      step={1}
      className="flex-1 cursor-pointer"
    />
    
    {/* Number Input */}
    <Input
      type="number"
      value={Np}
      onChange={(e) => setNpSafe(Number(e.target.value))}
      className=" bg-zinc-900/60 border border-zinc-800 text-white w-full text-sm"
    />
  </div>

  <div className="text-[10px] text-zinc-500">
    Range: <span className="text-orange-300">10 – 1000 turns</span>
  </div>
</div>


{/* Transformer Parameters */}
<div className="grid gap-5 sm:gap-6">
  
  {/* Secondary Turns */}
  <div className="space-y-2">
    <label className="text-xs text-zinc-400">Secondary Turns (Ns)</label>
    <div className="flex items-center flex-col-reverse gap-3">
      <Slider
        value={[Ns]}
        onValueChange={(v) => setNsSafe(v[0])}
        min={10}
        max={1000}
        step={1}
        className="flex-1 cursor-pointer"
      />
      <Input
        type="number"
        value={Ns}
        onChange={(e) => setNsSafe(Number(e.target.value))}
        className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
      />
    </div>
  </div>

  {/* Supply Voltage */}
  <div className="space-y-2">
    <label className="text-xs text-zinc-400">Supply Voltage V<sub>p</sub> (RMS)</label>
    <div className="flex items-center flex-col-reverse gap-3">
      <Slider
        value={[Vp_rms]}
        onValueChange={(v) => setVp_rms(v[0])}
        min={1}
        max={500}
        step={1}
        className="flex-1 cursor-pointer"
      />
      <Input
        type="number"
        value={Vp_rms}
        onChange={(e) => setVp_rms(Number(e.target.value))}
        className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
      />
    </div>
  </div>

  {/* Frequency */}
  <div className="space-y-2">
    <label className="text-xs text-zinc-400">Frequency (Hz)</label>
    <div className="flex items-center flex-col-reverse gap-3">
      <Slider
        value={[freq]}
        onValueChange={(v) => setFreq(v[0])}
        min={10}
        max={200}
        step={1}
        className="flex-1 cursor-pointer"
      />
      <Input
        type="number"
        value={freq}
        onChange={(e) => setFreq(Number(e.target.value))}
        className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
      />
    </div>
  </div>

  {/* Primary Resistance */}
  <div className="space-y-2">
    <label className="text-xs text-zinc-400">Primary winding R<sub>p</sub> (Ω)</label>
    <div className="flex items-center flex-col-reverse gap-3">
      <Slider
        value={[Rp]}
        onValueChange={(v) => setRp(v[0])}
        min={0}
        max={100}
        step={0.1}
        className="flex-1 cursor-pointer"
      />
      <Input
        type="number"
        value={Rp}
        onChange={(e) => setRp(Number(e.target.value))}
        className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
      />
    </div>
  </div>

  {/* Secondary + Load Resistance */}
  <div className="space-y-2">
    <label className="text-xs text-zinc-400">Secondary R<sub>s</sub> (Ω) + Load (Ω)</label>
    <div className="grid grid-cols-2 gap-2">
      <div className="flex items-center flex-col-reverse gap-2">
        <Slider
          value={[Rs]}
          onValueChange={(v) => setRs(v[0])}
          min={0}
          max={50}
          step={0.1}
          className="flex-1 cursor-pointer"
        />
        <Input
          type="number"
          value={Rs}
          onChange={(e) => setRs(Number(e.target.value))}
          className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
        />
      </div>
      <div className="flex items-center flex-col-reverse gap-2">
        <Slider
          value={[Rload]}
          onValueChange={(v) => setRload(v[0])}
          min={1}
          max={1000}
          step={1}
          className="flex-1 cursor-pointer"
        />
        <Input
          type="number"
          value={Rload}
          onChange={(e) => setRload(Number(e.target.value))}
          className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
        />
      </div>
    </div>
  </div>

  {/* Leakage Inductances */}
  <div className="space-y-2">
    <label className="text-xs text-zinc-400">Leakage Inductances L<sub>lp</sub>, L<sub>ls</sub> (mH)</label>
    <div className="grid grid-cols-2 gap-2">
      <div className="flex items-center flex-col-reverse gap-2">
        <Slider
          value={[Llp_mH]}
          onValueChange={(v) => setLlp_mH(v[0])}
          min={0}
          max={50}
          step={0.1}
          className="flex-1 cursor-pointer"
        />
        <Input
          type="number"
          value={Llp_mH}
          onChange={(e) => setLlp_mH(Number(e.target.value))}
          className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
        />
      </div>
      <div className="flex items-center flex-col-reverse gap-2">
        <Slider
          value={[Lls_mH]}
          onValueChange={(v) => setLls_mH(v[0])}
          min={0}
          max={50}
          step={0.1}
          className="flex-1 cursor-pointer"
        />
        <Input
          type="number"
          value={Lls_mH}
          onChange={(e) => setLls_mH(Number(e.target.value))}
          className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
        />
      </div>
    </div>
  </div>

  {/* Magnetizing Inductance */}
  <div className="space-y-2">
    <label className="text-xs text-zinc-400">Magnetizing L (H)</label>
    <div className="flex items-center flex-col-reverse gap-3">
      <Slider
        value={[Lm_H]}
        onValueChange={(v) => setLm_H(v[0])}
        min={0.001}
        max={0.2}
        step={0.001}
        className="flex-1 cursor-pointer"
      />
      <Input
        type="number"
        value={Lm_H}
        onChange={(e) => setLm_H(Number(e.target.value))}
        className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
      />
    </div>
    <div className="text-xs text-zinc-500 mt-1">High Lm → smaller magnetizing current (typical: 0.01–0.1 H)</div>
  </div>

  {/* Coupling Coefficient */}
  <div className="space-y-2">
    <label className="text-xs text-zinc-400">Coupling coefficient (k)</label>
    <div className="flex items-center flex-col-reverse gap-3">
      <Slider
        value={[coupling]}
        onValueChange={(v) => setCoupling(v[0])}
        min={0}
        max={1}
        step={0.01}
        className="flex-1 cursor-pointer"
      />
      <Input
        type="number"
        value={coupling}
        onChange={(e) => setCoupling(Number(e.target.value))}
        className="w-full bg-zinc-900/60 border border-zinc-800 text-white text-sm"
      />
    </div>
    <div className="text-xs text-zinc-500 mt-1">k in [0,1] — 0.9–0.99 for good core coupling</div>
  </div>

</div>

                    <div>
                      <label className="text-xs text-zinc-400">Transformer Type</label>
                      <Select value={transformerType} onValueChange={(v) => setTransformerType(v)}>
                        <SelectTrigger className="w-full cursor-pointer text-white bg-zinc-900/60 border border-zinc-800 rounded-md">
                          <SelectValue placeholder="Mode" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                          <SelectItem    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="step-up">Step-up</SelectItem>
                          <SelectItem    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="step-down">Step-down</SelectItem>
                          <SelectItem    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="auto">Autotransformer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {transformerType === "auto" && (
                      <div>
                        <label className="text-xs text-zinc-400">Autotransformer tap (0.0–1.0)</label>
                        <div className="flex items-center gap-2">
                          <input type="range" min="0" max="1" step="0.01" value={tap} onChange={(e) => setTap(Number(e.target.value))} className="w-full" />
                          <div className="text-xs text-zinc-300 w-12 text-right">{(tap * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 justify-between mt-2">
                    <div className="flex gap-2">
                      <Button className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                      <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center"><Cable className="w-5 h-5" /></div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Transformer</div>
                        <div className="text-xs text-zinc-400">Animated flux, winding flow, meters & oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Ratio: <span className="text-[#ffd24a] ml-1">{round(turnsRatio, 3)}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vp: <span className="text-[#ffd24a] ml-1">{round(meta.Vp_rms, 3)} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vs (rms): <span className="text-[#ffd24a] ml-1">{round(Vs_rms, 3)} V</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <TransformerSVG history={history} meta={meta} running={running} Np={Np} Ns={Ns} mode={transformerType} tap={tap} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <TransformerOscilloscope history={history} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Gauge className="w-5 h-5 " /> Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Turns ratio (Ns/Np)</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(turnsRatio, 3)}</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Vs (rms)</div>
                      <div className="text-lg font-semibold text-[#ffd24a] truncate">{round(Vs_rms, 4)} V</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Ip (rms)</div>
                      <div className="text-lg font-semibold text-[#00ffbf] truncate">{round(Ip_rms, 6)} A</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Is (rms)</div>
                      <div className="text-lg font-semibold text-[#9ee6ff] truncate">{round(Is_rms, 6)} A</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Load</div>
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{Rload} Ω</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Coupling</div>
                      <div className="text-lg font-semibold text-[#ffd24a] truncate">{coupling}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb /></span>
                    <span>
                      Tip: change turns ratio or load to see Vs, Ip and Is change in real time. Use Autotransformer tap to emulate single-winding tapped behaviour.
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-zinc-300 text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
