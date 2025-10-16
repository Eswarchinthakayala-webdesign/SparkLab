// src/pages/BatteryUPSDesignerPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Battery, Zap, Play, Pause, Download, Settings, Menu, X, Layers, Trash2, Plus, Plug, Cpu, Sun, CloudRain, ZapOff, Heart,
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
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================
   Battery / UPS Simulation Hook
   - Simulates State of Charge (SOC), battery voltage (approx),
     charge/discharge currents, inverter losses, and builds a history.
   - Parameters:
     running, timestep, battery config (Vnom, Ah, strings, parallels),
     loadW (AC load), chargerA, inverterEff, batteryType, upsMode
   ============================ */
function useBatterySim({
  running,
  timestep = 120,
  Vnom = 48,
  Ah = 100,
  series = 16, // series cells (for nominal pack voltage)
  parallels = 1,
  loadW = 300,
  chargerA = 10,
  inverterEff = 0.92,
  batteryType = "li-ion",
  upsMode = "offline",
}) {
  // history buffer (pre-populate to avoid empty chart)
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, Vdc: 0, Ibat: 0, Pout: 0, SOC: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // Internal battery model params
  const capacityAh = Math.max(0.001, Ah * parallels); // effective capacity in Ah
  const capacityWh = (Vnom * capacityAh); // approximate Wh stored
  // simple internal resistance approximate (ohms) - chemistry dependent
  const RintBase = batteryType === "li-ion" ? 0.015 : 0.035; // rough per string internal resistance
  const Rint = RintBase / Math.max(1, parallels); // parallel reduces internal resistance
  const chargeEff = batteryType === "li-ion" ? 0.96 : 0.9; // coulombic efficiency

  // helper: convert SOC -> approximate open-circuit voltage (linearized)
  const socToVoltage = useCallback((soc) => {
    // approximate: Vnom * (0.95 .. 1.05) depending on SOC (for display)
    // Li-ion has flatter curve; lead-acid steeper.
    const base = Vnom;
    const slack = batteryType === "li-ion" ? 0.12 : 0.25; // relative variation
    const v = base * (1 - slack / 2 + slack * (soc / 100));
    return clamp(v, base * 0.6, base * 1.05);
  }, [Vnom, batteryType]);

  // initial SOC guess from last history item (or default 80%)
  const initialSOCRef = useRef(80);
  const socRef = useRef(initialSOCRef.current); // SOC percentage (0-100)
  const vdcRef = useRef(socToVoltage(socRef.current)); // DC bus voltage approx

  const computeInstant = useCallback((tSeconds) => {
    // Determine AC load (Pout) and inverter behavior
    const Pout = Math.max(0, loadW); // AC load demand (W)
    let Pbat = 0; // power leaving battery (positive when discharging)
    let Ibat = 0;

    // If charger present and grid available (upsMode offline/line-interactive: charger only when grid present)
    // For simplicity we assume charger always available when chargerA > 0; UPS modes affect whether inverter supplies load on grid fail.
    // We'll simulate a continuous situation where loadW draws power and charger can supply battery if chargerA > 0 (i.e., grid/shore power).
    // Decide net power from battery: load + inverter losses - charger power

    // Inverter draws DC power = Pout / inverterEff (when supplying)
    const Pdc_required = Pout > 0 ? (Pout / Math.max(0.01, inverterEff)) : 0;

    // Charger provides Pcharge = Vdc * chargerA (but limited)
    const Vdc = vdcRef.current;
    const Pcharge_available = Math.max(0, chargerA) * Math.max(0.0, Vdc) * chargeEff;

    // Net DC: positive => battery discharging; negative => battery charging
    const netDC = Pdc_required - Pcharge_available;

    // Current from battery: I = netDC / Vdc
    const IbatInstant = Vdc > 0 ? netDC / Vdc : 0;

    // But account for internal resistance drop for small correction of Vdc (simple)
    const Vdrop = IbatInstant * Rint;
    const Vbus = clamp(Vdc - Vdrop, Math.max(0.5 * Vnom, 10), 1.2 * Vnom);

    // Recompute currents with corrected voltage
    const IbatCorrected = Vbus > 0 ? netDC / Vbus : 0;

    // SOC update estimate (Ah change over dt)
    // When discharging, SOC drops by Ibat * dt (A * seconds -> Ah)
    // dt in seconds currently passed will be provided by outer loop
    // We'll return instantaneous I, Pout, Vbus for outer update to perform SOC integration

    return { Vbus, Ibat: IbatCorrected, Pout, netDC };
  }, [loadW, chargerA, inverterEff, Vnom, Rint, chargeEff, socToVoltage]);

  // main RAF loop: integrate SOC and push history
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
      const dtms = ts - lastRef.current;
      if (dtms < timestep) return;
      lastRef.current = ts;
      tRef.current += dtms;
      const dtSec = dtms / 1000;

      // compute instant values
      const { Vbus, Ibat, Pout, netDC } = computeInstant(tRef.current / 1000);

      // integrate SOC: Ah change = Ibat (A) * dtSec / 3600 (Ah)
      // Ibat positive means battery supplying (discharging), negative -> charging
      const deltaAh = (Ibat * dtSec) / 3600;
      const deltaSocPct = (deltaAh / capacityAh) * 100 * -1; // discharging reduces SOC (I positive -> SOC down)
      socRef.current = clamp(socRef.current + deltaSocPct, 0, 100);

      // update vdcRef from the new SOC
      vdcRef.current = socToVoltage(socRef.current);

      // Calculate Pbat (positive = leaving battery)
      const Pbat = (Ibat * vdcRef.current);

      // Append to history
      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, Vdc: round(vdcRef.current, 4), Ibat: round(Ibat, 6), Pbat: round(Pbat, 4), Pout: round(Pout, 2), SOC: round(socRef.current, 4) });
        if (next.length > 1440) next.shift(); // keep a minute+ of data at ~120ms steps
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => { alive = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [running, timestep, computeInstant, capacityAh, socToVoltage]);

  return {
    history,
    params: { capacityAh, capacityWh, Rint, Vnom, Ah, series, parallels, batteryType, upsMode, inverterEff },
    soc: () => socRef.current,
  };
}

/* ============================
   Visualizer SVG for Battery / UPS
   - Shows battery pack (strings & parallels), DC bus, inverter, AC load
   - Animated flow dots indicate charge (greenish) or discharge (orange)
   ============================ */
 function BatteryVisualizerSVG({
  history = [],
  params = {},
  running = true,
}) {
  // helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, d = 2) => (Math.round((v ?? 0) * 10 ** d) / 10 ** d).toFixed(d);

  const latest =
    history.length > 0
      ? history[history.length - 1]
      : {
          Vdc: params.Vnom || 48,
          Ibat: 0,
          Pbat: 0,
          Pout: 0,
          SOC: params.SOC ?? 50,
        };

  const Vdc = latest.Vdc ?? params.Vnom ?? 48;
  const Ibat = latest.Ibat ?? 0;
  const Pbat = latest.Pbat ?? 0;
  const SOC = clamp(latest.SOC ?? params.SOC ?? 50, 0, 100);

  const isDischarging = Pbat > 0; // Pbat>0 => power out (discharging)
  const flowColor =
    isDischarging ? "#ffb86b" : Math.abs(Pbat) > 0 ? "#00ffbf" : "#9ee6ff";
  const solarColor = "#7cff95";
  const gridColor = "#ffd24a";
  const loadColor = isDischarging ? "#ff8a4b" : "#9ee6ff";

  // motion controls
  const absP = Math.abs(Pbat) || 0.001;
  const speed = clamp(1.8 / (Math.sqrt(absP) * 0.08 + 0.06), 0.75, 5);
  const glowIntensity = clamp(Math.abs(Pbat) / (params.capacityW || 1000) , 0.05, 1);

  // sizes
  const svgW = 1200;
  const svgH = 540;
  const centerX = svgW / 2;
  const centerY = svgH / 2 - 20;

  // battery core geometry
  const coreW = 220;
  const coreH = 340;
  const coreX = centerX - coreW / 2;
  const coreY = centerY - coreH / 2;

  // percentage ring circle
  const ringR = Math.max(coreW, coreH) * 0.7;
  const ringCX = centerX;
  const ringCY = centerY;
  const ringCirc = 2 * Math.PI * ringR;
  const socDash = (100 - SOC) / 100 * ringCirc; // stroke-dashoffset

  // motion path ids (used by animateMotion/ mpath)
  const pathPackToInverter = "pathPackInverter";
  const pathInverterToLoad = "pathInverterLoad";
  const pathSolarToPack = "pathSolarPack";
  const pathGridToPack = "pathGridPack";

  // build a small list of pulse counts (keeps DOM modest)
  const pulseCount = clamp(Math.round(6 + Math.sqrt(absP) * 0.2), 5, 18);

  const hud = useMemo(() => {
    return {
      packLabel: `${params.Vnom || 48} V • ${round(params.capacityAh || 0, 0)} Ah`,
      socLabel: `${round(SOC, 1)}%`,
      status: isDischarging ? "Discharging" : "Charging",
      input: isDischarging ? "Grid" : "Solar",
      backup: `${round(params.backupH || 0, 1)} h`,
    };
  }, [params, SOC, isDischarging]);

  // pause control for SMIL (simple approach: huge dur if paused)
  const animDur = `${speed}s`;
  const animBegin = running ? "0s" : "10000s"; // if not running delay far into future
  const animRepeat = "indefinite";
  
 
  // inverter block position (right of the battery)
const inverterX = centerX + coreW * 0.9;
const inverterY = centerY - 40;

  return (
    <div className="w-full rounded-xl p-4 bg-gradient-to-b from-black/40 to-zinc-900/10 border border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              background: "linear-gradient(135deg,#ff7a2d, #ffd24a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#000",
              fontWeight: 700
            }}>B</div>
            <div>
              <div style={{ color: "#ffd24a", fontSize: 18, fontWeight: 700 }}>
                Battery & UPS Visualizer
              </div>
              <div style={{ color: "#9aa0a6", fontSize: 12 }}>
                Cinematic energy core — visual simulation only
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{
            background: "#0b0b0c", border: "1px solid #222", padding: "6px 10px", borderRadius: 8, color: "#ccc", fontSize: 12
          }}>
            Pack: <span style={{ color: "#ffd24a", marginLeft: 6 }}>{hud.packLabel}</span>
          </div>
          <div style={{
            background: "#0b0b0c", border: "1px solid #222", padding: "6px 10px", borderRadius: 8, color: "#ccc", fontSize: 12
          }}>
            SOC: <span style={{ color: "#00ffbf", marginLeft: 6 }}>{hud.socLabel}</span>
          </div>
          <div style={{
            background: "#0b0b0c", border: "1px solid #222", padding: "6px 10px", borderRadius: 8, color: "#ccc", fontSize: 12
          }}>
            Status: <span style={{ color: "#ffd24a", marginLeft: 6 }}>{hud.status}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          width="100%"
          height={svgH * 0.8}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Futuristic battery core visualizer"
        >
          <defs>
            {/* gradients */}
            <linearGradient id="coreGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0fffbf" stopOpacity="0.10" />
              <stop offset="40%" stopColor="#00a7ff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#1a2bff" stopOpacity="0.06" />
            </linearGradient>

            <linearGradient id="coreInner" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#002b2b" />
              <stop offset="40%" stopColor="#003f3f" />
              <stop offset="100%" stopColor="#007a7a" />
            </linearGradient>

            <linearGradient id="plasmaGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#002" stopOpacity="0" />
              <stop offset="30%" stopColor="#003a3a" stopOpacity="0.6" />
              <stop offset="90%" stopColor="#00ffbf" stopOpacity="0.95" />
            </linearGradient>

            <linearGradient id="ringGlow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00ffbf" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#3ee0ff" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#ffd24a" stopOpacity="0.2" />
            </linearGradient>

            <radialGradient id="panelGlow" cx="50%" cy="20%" r="60%">
              <stop offset="0%" stopColor="#7cff95" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#004" stopOpacity="0" />
            </radialGradient>

            {/* soft blur for glow */}
            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="tinySpark" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.2" result="b" />
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>

            {/* circular clip for inner plasma */}
            <clipPath id="coreClip">
              <rect x={coreX + 18} y={coreY + 32} width={coreW - 36} height={coreH - 64} rx={22} />
            </clipPath>

            {/* path definitions for pulses */}
            <path id={pathPackToInverter} d={`
              M ${coreX + coreW/2} ${coreY + coreH}
              C ${coreX + coreW/2 + 40} ${coreY + coreH - 40}, ${centerX - 40} ${centerY + 20}, ${centerX} ${centerY}
              S ${inverterX ?? (svgW - 220)} ${centerY - 20}, ${inverterX ? inverterX + 120 : svgW - 140} ${centerY}
            `} fill="none" stroke="none" />
            <path id={pathInverterToLoad} d={`
              M ${inverterX ? inverterX + 150 : svgW - 120} ${centerY}
              C ${inverterX ? inverterX + 200 : svgW - 80} ${centerY - 40}, ${svgW - 120} ${centerY - 80}, ${svgW - 80} ${centerY - 140}
            `} fill="none" stroke="none" />

            <path id={pathSolarToPack} d={`
              M ${120} ${120}
              C ${220} ${120}, ${coreX + 40} ${coreY + 30}, ${coreX + coreW/2} ${coreY + coreH}
            `} fill="none" stroke="none" />

            <path id={pathGridToPack} d={`
              M ${svgW - 120} ${80}
              C ${svgW - 240} ${140}, ${coreX + coreW + 60} ${coreY + 20}, ${coreX + coreW/2} ${coreY + coreH}
            `} fill="none" stroke="none" />

            {/* subtle blueprint behind core */}
            <g id="blueprint">
              <rect x={centerX - 260} y={centerY - 260} width="520" height="520" rx="14" fill="none" stroke="#073" strokeOpacity="0.02" strokeWidth="1" />
              <circle cx={centerX} cy={centerY} r={220} stroke="#0ff" strokeOpacity="0.03" fill="none" />
            </g>
          </defs>

          {/* BACKGROUND: grid + parallax particles */}
          <g opacity="0.45" transform={`translate(0,${running ? -8 : 0})`}>
            {/* grid lines */}
            <g stroke="#0b0f13" strokeWidth="1">
              {Array.from({ length: 40 }).map((_, i) => (
                <line key={`g-${i}`} x1={i * (svgW/40)} y1="0" x2={i * (svgW/40)} y2={svgH} />
              ))}
            </g>
          </g>

          {/* blueprint faint rotate */}
          <g transform={`translate(${centerX}, ${centerY})`} opacity="0.055">
            <g transform="translate(-0,-0)">
              <use href="#blueprint" />
              <g>
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="50s" repeatCount="indefinite" begin={animBegin} />
              </g>
            </g>
          </g>

          {/* ambient floating particles */}
          <g opacity="0.9">
            {Array.from({ length: 28 }).map((_, i) => {
              const px = Math.random() * svgW;
              const py = Math.random() * svgH;
              const size = 1 + Math.random() * 2.2;
              const delay = (i % 7) * 0.8;
              return (
                <circle key={`p-${i}`} cx={px} cy={py} r={size} fill="#7ef0ff" fillOpacity={0.06}
                  >
                  <animateTransform attributeName="transform" type="translate" values={`0 0; 0 -6; 0 0`} dur={`${6 + (i % 5)}s`} repeatCount="indefinite" begin={`${delay}s`} />
                </circle>
              );
            })}
          </g>

          {/* ---------- SOLAR PANEL (left top) ---------- */}
          <g transform={`translate(40, 72)`}>
            <rect x="0" y="-6" width="120" height="72" rx="8" fill="#07101a" stroke="#0f2430" />
            <g transform="translate(8,4)">
              <rect width="104" height="56" rx="6" fill="#031f2f" />
              {/* panel strips */}
              {Array.from({ length: 6 }).map((_, i) => (
                <rect key={`sp-${i}`} x={i * 16} y="0" width="10" height="56" rx="2" fill="#042a3a">
                  <animate attributeName="fill" values="#042a3a;#0b4a2f;#042a3a" dur="4s" repeatCount="indefinite" begin={`${(i*0.15)}s`} />
                </rect>
              ))}
            </g>
            {/* tiny glow */}
            <circle cx="60" cy="36" r="36" fill="url(#panelGlow)" opacity="0.14" />
            <text x="60" y="66" fontSize="11" fill="#9ee6ff" textAnchor="middle">Solar</text>
          </g>

          {/* ---------- GRID TOWER (right top) ---------- */}
          <g transform={`translate(${svgW - 160}, 60)`}>
            <rect x="0" y="0" width="64" height="24" rx="6" fill="#060606" stroke="#222" />
            <polygon points="20,24 32,0 44,24" fill={gridColor} opacity="0.06" />
            <rect x="12" y="30" width="40" height="72" rx="6" fill="#07101a" stroke="#122" />
            <animateTransform attributeName="transform" type="translate" values="0 0; 0 3; 0 0" dur="6s" repeatCount="indefinite" begin={animBegin} />
            <text x="32" y="112" fontSize="11" fill="#ffd24a" textAnchor="middle">Grid</text>
          </g>

          {/* ---------- LOAD (top-right) ---------- */}
          <g transform={`translate(${svgW - 130}, ${centerY - 160})`}>
            <rect x="-8" y="-8" width="80" height="48" rx="6" fill="#060606" stroke="#222" />
            <g transform="translate(6,2)">
              <rect width="60" height="32" rx="4" fill="#041520" stroke="#123" />
              <rect x="6" y="6" width="20" height="6" rx="1" fill="#000" />
              <rect x="6" y="14" width="14" height="6" rx="1" fill="#000" />
              <circle cx="50" cy="16" r="6" fill={loadColor} opacity="0.14" />
            </g>
            <text x="32" y="46" fontSize="11" fill="#ffd24a" textAnchor="middle">Load</text>
          </g>

          {/* ---------- Battery Core (3D glass-like) ---------- */}
          <g transform={`translate(${coreX}, ${coreY})`}>

            {/* outer soft shadow */}
            <ellipse cx={coreW/2} cy={coreH+10} rx={coreW*0.7} ry={28} fill="#000" opacity="0.35" />

            {/* glass shell - left */}
            <g filter="url(#softGlow)">
              <rect x="0" y="0" width={coreW} height={coreH} rx={28} fill="url(#coreGrad)" stroke="#0c2" strokeOpacity="0.04" />
            </g>

            {/* inner frame - gives 3D edge */}
            <rect x={8} y={12} width={coreW - 16} height={coreH - 24} rx={22} fill="none" stroke="#0b2b2b" strokeWidth="1.2" />

            {/* internal plasma (animated as rising rectangle clipped) */}
            <g clipPath="url(#coreClip)">
              {/* background deep layer */}
              <rect x={coreX * 0 + 18} y={coreY*0 + 32} width={coreW - 36} height={coreH - 64} fill="url(#coreInner)" rx={18} />
              {/* animated rising plasma group */}
              <g transform={`translate(0,0)`}>
                <rect
                  x={coreX * 0 + 18}
                  y={coreY * 0 + (coreH - 64) - (SOC/100) * (coreH - 64)}
                  width={coreW - 36}
                  height={(SOC / 100) * (coreH - 64)}
                  rx={18}
                  fill="url(#plasmaGrad)"
                  opacity={0.95}
                />
                {/* subtle moving highlights inside plasma */}
                <g opacity="0.5" mixBlendMode="screen">
                  <rect x={coreX * 0 + 18} y={coreY * 0 + 32 - 40 + (SOC/100) * 20} width={coreW - 36} height={(SOC / 100) * (coreH - 64) + 40} rx={18}
                    fill="url(#plasmaGrad)">
                    <animateTransform attributeName="transform" type="translate" values="0 0; 0 -18; 0 0" dur="6s" repeatCount={animRepeat} begin={animBegin} />
                    <animate attributeName="opacity" values="0.9;0.6;0.9" dur="4s" repeatCount={animRepeat} begin={animBegin} />
                  </rect>
                </g>
              </g>

              {/* tiny floating particles inside plasma for realism */}
              {Array.from({ length: 12 }).map((_, ii) => {
                const px = 18 + Math.random() * (coreW - 36);
                const pyMax = coreH - 64;
                const yPos = coreY * 0 + 32 + Math.random() * pyMax;
                const r = 1 + Math.random() * 2;
                return (
                  <circle key={`pl-${ii}`} cx={px} cy={yPos} r={r} fill="#9ee6ff" opacity={0.18}>
                    <animateTransform attributeName="transform" type="translate" values="0 0; 0 -8; 0 0" dur={`${6 + Math.random()*6}s`} repeatCount={animRepeat} begin={animBegin} />
                    <animate attributeName="opacity" values="0.05;0.20;0.05" dur={`${4 + Math.random()*3}s`} repeatCount={animRepeat} begin={animBegin} />
                  </circle>
                );
              })}
            </g>

            {/* inner circuits overlay */}
            <g opacity="0.12" stroke="#0ff" strokeWidth="1">
              <path d={`M ${coreW*0.2} ${coreH*0.2} L ${coreW*0.8} ${coreH*0.2} L ${coreW*0.8} ${coreH*0.8}`} />
            </g>

            {/* spinning outer holographic ring */}
            <g transform={`translate(${coreW/2}, ${coreH/2})`} >
              <g style={{ filter: "url(#softGlow)" }}>
                <circle r={ringR} cx="0" cy="0" fill="none" stroke="url(#ringGlow)" strokeWidth="6" strokeOpacity="0.18" />
                <g>
                  <circle r={ringR * 0.88} fill="none" stroke="url(#ringGlow)" strokeWidth="1.5" strokeOpacity="0.25" strokeDasharray="8 12" />
                  <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="22s" repeatCount={animRepeat} begin={animBegin} />
                </g>
              </g>
            </g>

            {/* percentage ring (foreground) */}
            <g transform={`translate(${ringCX}, ${ringCY})`}>
              <circle r={ringR} fill="none" stroke="#0a0a0a" strokeWidth="8" opacity="0.18" />
              <circle r={ringR} fill="none" stroke="url(#ringGlow)" strokeWidth="8"
                strokeDasharray={ringCirc}
                strokeDashoffset={socDash}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 800ms ease-out" }} />
              <text x="0" y={-6} fontSize="22" fill="#e8fff7" textAnchor="middle" fontWeight="700">{round(SOC, 1)}%</text>
              <text x="0" y={18} fontSize="11" fill="#99ffd8" textAnchor="middle">State of Charge</text>
            </g>

            {/* outer glass reflection */}
            <rect x={6} y={6} width={coreW-12} height={coreH-12} rx={26} fill="none" stroke="rgba(255,255,255,0.03)" />

            {/* subtle sparks (occasional) */}
            {Array.from({ length: 6 }).map((_, si) => {
              const sx = 18 + Math.random() * (coreW - 36);
              const sy = coreH * 0.2 + Math.random() * (coreH * 0.6);
              const dur = 2 + Math.random() * 3;
              return (
                <line key={`spark-${si}`} x1={sx} y1={sy} x2={sx+6} y2={sy-4} stroke="#9ee6ff" strokeWidth="1.2" strokeLinecap="round" filter="url(#tinySpark)" opacity="0.06">
                  <animate attributeName="opacity" values="0.06;0.5;0.06" dur={`${dur}s`} repeatCount={animRepeat} begin={`${(si*0.6)}s`} />
                  <animateTransform attributeName="transform" type="translate" values="0 0; 0 -6; 0 0" dur={`${dur}s`} repeatCount={animRepeat} begin={`${si*0.6}s`} />
                </line>
              );
            })}

          </g>

          {/* ---------- Energy Paths (flow) ---------- */}
          {/* pack -> inverter path (pulses follow this path) */}
          <path id="visualPath1" d={`
            M ${coreX + coreW/2} ${coreY + coreH}
            C ${coreX + coreW/2 + 40} ${coreY + coreH - 40}, ${centerX - 80} ${centerY + 30}, ${centerX - 10} ${centerY}
            S ${inverterX ?? svgW - 220} ${centerY - 20}, ${inverterX ? inverterX + 120 : svgW - 140} ${centerY}
          `} fill="none" stroke="none" />

          <path id="visualPath2" d={`
            M ${inverterX ? inverterX + 150 : svgW - 120} ${centerY}
            C ${inverterX ? inverterX + 200 : svgW - 80} ${centerY - 40}, ${svgW - 120} ${centerY - 80}, ${svgW - 80} ${centerY - 140}
          `} fill="none" stroke="none" />

          {/* Pulses along path1 */}
          {Array.from({ length: pulseCount }).map((_, pi) => {
            const beginOffset = (pi / pulseCount) * (speed * 0.9);
            const color = isDischarging ? flowColor : (flowColor === "#00ffbf" ? solarColor : flowColor);
            return (
              <g key={`pulse-${pi}`}>
                <circle r={6} fill={color} opacity="0.9">
                  <animate attributeName="r" values="1;6;1" dur={animDur} repeatCount={animRepeat} begin={animBegin} />
                  <animate attributeName="opacity" values="0.95;0.4;0" dur={animDur} repeatCount={animRepeat} begin={`${-beginOffset}s`} />
                  <animateMotion dur={animDur} repeatCount={animRepeat} begin={`${-beginOffset}s`} rotate="auto">
                    <mpath xlinkHref="#visualPath1" />
                  </animateMotion>
                </circle>
              </g>
            );
          })}

          {/* Pulses along path2 (towards load) */}
          {Array.from({ length: Math.round(pulseCount/2) }).map((_, pi) => {
            const beginOffset = (pi / (pulseCount/2)) * (speed * 1.1);
            return (
              <g key={`pulse2-${pi}`}>
                <circle r={5} fill={loadColor} opacity="0.75">
                  <animate attributeName="opacity" values="0.95;0.4;0" dur={`${speed*1.2}s`} repeatCount={animRepeat} begin={`${-beginOffset}s`} />
                  <animateTransform attributeName="transform" type="scale" values="0.9;1.06;0.8" dur={`${speed*1.2}s`} repeatCount={animRepeat} begin={`${-beginOffset}s`} />
                  <animateMotion dur={`${speed*1.2}s`} repeatCount={animRepeat} begin={`${-beginOffset}s`} rotate="auto">
                    <mpath xlinkHref="#visualPath2" />
                  </animateMotion>
                </circle>
              </g>
            );
          })}

          {/* Solar pulses into pack (when charging) */}
          {Array.from({ length: 6 }).map((_, si) => {
            const beginSec = (si*0.4);
            return (
              <circle key={`solar-${si}`} r={4} fill={solarColor} opacity={isDischarging ? 0.02 : 0.75}>
                <animate attributeName="opacity" values={isDischarging ? "0.02;0.02" : "0.95;0.25;0.05"} dur="3.2s" repeatCount={animRepeat} begin={`${animBegin}`} />
                <animateMotion dur="4s" repeatCount={animRepeat} begin={`${-beginSec}s`} rotate="auto">
                  <mpath xlinkHref="#pathSolarToPack" />
                </animateMotion>
              </circle>
            );
          })}

          {/* Grid pulses into pack (if grid active) */}
          {Array.from({ length: 5 }).map((_, gi) => {
            const beginSec = (gi*0.6);
            return (
              <circle key={`grid-${gi}`} r={4} fill={gridColor} opacity={isDischarging ? 0.45 : 0.12}>
                <animate attributeName="opacity" values={isDischarging ? "0.55;0.15;0.02" : "0.12;0.02"} dur="4.5s" repeatCount={animRepeat} begin={`${animBegin}`} />
                <animateMotion dur="5s" repeatCount={animRepeat} begin={`${-beginSec}s`} rotate="auto">
                  <mpath xlinkHref="#pathGridToPack" />
                </animateMotion>
              </circle>
            );
          })}

          {/* HUD overlays (floating panels) */}
          <g transform={`translate(${centerX + 260}, ${centerY - 140})`}>
            <rect x="-14" y="-18" width="220" height="120" rx="10" fill="#060606" stroke="#183" opacity="0.9" />
            <text x="0" y="-2" fontSize="12" fill="#ffd24a">System Status</text>
            <text x="0" y="18" fontSize="11" fill="#99ffd8">Input: <tspan fill="#fff">{hud.input}</tspan></text>
            <text x="0" y="36" fontSize="11" fill="#99ffd8">Backup: <tspan fill="#fff">{hud.backup}</tspan></text>
            <text x="0" y="54" fontSize="11" fill="#99ffd8">Capacity: <tspan fill="#fff">{hud.packLabel}</tspan></text>

            <g transform="translate(150,8)">
              <circle r="12" fill="#0a0a0a" stroke="#123" />
              <circle r="7" fill={isDischarging ? "#ff8a4b" : "#00ffbf"} opacity="0.9">
                <animate attributeName="r" values="6;9;6" dur="1.2s" repeatCount={animRepeat} begin={animBegin} />
              </circle>
            </g>
          </g>

          {/* bottom HUD small panels */}
          <g transform={`translate(${40}, ${svgH - 120})`}>
            <rect x="0" y="0" width="180" height="64" rx="8" fill="#060606" stroke="#222" />
            <text x="10" y="18" fontSize="12" fill="#ffd24a">Battery Capacity</text>
            <text x="10" y="36" fontSize="12" fill="#99ffd8">{hud.packLabel}</text>
          </g>

          <g transform={`translate(${svgW - 260}, ${svgH - 120})`}>
            <rect x="0" y="0" width="220" height="64" rx="8" fill="#060606" stroke="#222" />
            <text x="10" y="18" fontSize="12" fill="#ffd24a">Live Readouts</text>
            <text x="10" y="36" fontSize="11" fill="#fff">V: <tspan fill="#ffd24a">{Vdc} V</tspan>  I: <tspan fill="#00ffbf">{round(Ibat,3)} A</tspan></text>
            <text x="10" y="50" fontSize="11" fill="#fff">P: <tspan fill="#ff9a4a">{round(Pbat,2)} W</tspan> SOC: <tspan fill="#00ffbf">{round(SOC,1)}%</tspan></text>
          </g>

          {/* tiny animated waveform behind right side */}
          <g transform={`translate(${svgW - 380}, ${centerY + 40})`} opacity="0.12">
            <path d={`M0 20 Q 30 0 60 20 T 180 20`} stroke="#0ff" strokeWidth="1.4" fill="none">
              <animateTransform attributeName="transform" type="translate" values="0 0; 10 0; 0 0" dur="6s" repeatCount={animRepeat} begin={animBegin} />
            </path>
          </g>

          {/* small legend at bottom center */}
          <g transform={`translate(${centerX - 130}, ${svgH - 46})`} opacity="0.9">
            <rect x="0" y="0" width="260" height="32" rx="6" fill="#070707" stroke="#222" />
            <g transform="translate(10,6)" fill="#fff" fontSize="11">
              <circle cx="6" cy="10" r="5" fill="#00ffbf" /> <text x="18" y="13" fill="#99ffd8">Solar → Charge</text>
              <g transform="translate(110,0)"><circle cx="6" cy="10" r="5" fill="#ffd24a" /><text x="18" y="13" fill="#ffd24a">Grid → Charge</text></g>
              <g transform="translate(210,0)"><circle cx="6" cy="10" r="5" fill="#ff8a4b" /><text x="18" y="13" fill="#ff8a4b">Discharge → Load</text></g>
            </g>
          </g>

          {/* accessibility title */}
          <title>Futuristic battery core: energy flows and HUD</title>

        </svg>
      </div>
    </div>
  );
}


/* ============================
   Oscilloscope: DC Voltage, Battery Current, Power
   ============================ */
function BatteryOscilloscope({ history = [], running = true }) {
  const data = history.slice(-360).map((d, idx) => {
    return {
      t: idx,
      V: d.Vdc || 0,
      I: d.Ibat || 0,
      P: d.Pbat || 0,
      SOC: d.SOC || 0,
    };
  });

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — DC Bus (V), Battery Current (I), Battery Power (P)</div>
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
            <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Vdc (V)" />
            <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Ibat (A)" />
            <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Pbat (W)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page: Battery / UPS Designer
   ============================ */
export default function BatteryUPSDesignerPage() {
  // UI state
  const [Vnom, setVnom] = useState("48");
  const [Ah, setAh] = useState("100");
  const [series, setSeries] = useState("16");
  const [parallels, setParallels] = useState("1");
  const [batteryType, setBatteryType] = useState("li-ion");
  const [upsMode, setUpsMode] = useState("online");
  const [loadW, setLoadW] = useState("500");
  const [chargerA, setChargerA] = useState("20");
  const [inverterEff, setInverterEff] = useState("0.92");
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [snapshotName, setSnapshotName] = useState("");

  // use simulation hook
  const { history, params, soc } = useBatterySim({
    running,
    timestep: 120,
    Vnom: Number(Vnom) || 48,
    Ah: Number(Ah) || 100,
    series: Number(series) || 16,
    parallels: Number(parallels) || 1,
    loadW: Number(loadW) || 0,
    chargerA: Number(chargerA) || 0,
    inverterEff: Number(inverterEff) || 0.92,
    batteryType,
    upsMode,
  });

  const latest = history.length ? history[history.length - 1] : { Vdc: Number(Vnom), Ibat: 0, Pbat: 0, Pout: 0, SOC: 0 };

  const exportCSV = () => {
    const rows = [
      ["t", "Vdc", "Ibat", "Pbat", "Pout", "SOC"],
      ...history.map((d) => [d.t, d.Vdc, d.Ibat, d.Pbat, d.Pout, d.SOC]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `batteryups-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const snapshot = () => {
    const data = {
      time: Date.now(),
      params,
      latest,
      snapshotName: snapshotName || `snapshot-${Date.now()}`,
    };
    try {
      const key = `battery_snapshot_${Date.now()}`;
      localStorage.setItem(key, JSON.stringify(data));
      toast.success("Snapshot saved to localStorage");
    } catch (e) {
      toast.error("Failed to save snapshot");
    }
  };

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setVnom("48"); setAh("100"); setSeries("16"); setParallels("1"); setBatteryType("li-ion");
    setUpsMode("online"); setLoadW("500"); setChargerA("20"); setInverterEff("0.92");
    toast.success("Reset to defaults");
  };

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Battery & UPS Designer</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-36">
                <Select value={batteryType} onValueChange={(v) => setBatteryType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Battery Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="li-ion"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Li-ion</SelectItem>
                    <SelectItem value="lead-acid"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Lead-Acid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-44">
                <Select value={upsMode} onValueChange={(v) => setUpsMode(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="UPS Mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="offline"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Offline (Standby)</SelectItem>
                    <SelectItem value="line-interactive"      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Line-Interactive</SelectItem>
                    <SelectItem value="online"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Online (Double conversion)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={snapshot}>Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg" onClick={toggleRunning} title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg" onClick={resetDefaults} title="Reset">
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="w-28">
                  <Select value={batteryType} onValueChange={(v) => setBatteryType(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Battery Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="li-ion"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Li-ion</SelectItem>
                      <SelectItem value="lead-acid"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Lead-Acid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={snapshot}>Snapshot</Button>
                <Button variant="ghost" className="flex-1  border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
                <Button variant="ghost" className="flex-1 border  cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={resetDefaults}>Reset</Button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="h-16 sm:h-16"></div>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden w-full max-w-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Designer</div>
                        <div className="text-xs text-zinc-400">Battery sizing • UPS topology • Live visualizer</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-xs text-zinc-400">Nominal Pack Voltage (V)</label>
                      <Input value={Vnom} onChange={(e) => setVnom(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Capacity (Ah) per string</label>
                      <Input value={Ah} onChange={(e) => setAh(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div className="flex gap-2">
                      <div>
                        <label className="text-xs text-zinc-400">Series (cells/strings)</label>
                        <Input value={series} onChange={(e) => setSeries(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400">Parallels</label>
                        <Input value={parallels} onChange={(e) => setParallels(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">AC Load (W)</label>
                      <Input value={loadW} onChange={(e) => setLoadW(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Charger Current (A)</label>
                      <Input value={chargerA} onChange={(e) => setChargerA(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Inverter Efficiency (0.7 - 0.98)</label>
                      <Input value={inverterEff} onChange={(e) => setInverterEff(e.target.value)} type="number" step="0.01" min="0.7" max="0.99" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button className="px-3 cursor-pointer py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                    <Button variant="outline" className="px-3 py-2 border-zinc-700 cursor-pointer text-black" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <Button className="flex-1 cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a]" onClick={snapshot}><Layers className="w-4 h-4 mr-2" /> Save Snapshot</Button>
                    <Button variant="ghost" className="border border-zinc-800 cursor-pointer text-zinc-300" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                  </div>

                  <div className="bg-black/70 border border-orange-500/30 text-white px-3 py-2 rounded-full shadow-sm backdrop-blur-sm text-xs flex items-center gap-4">
                    <div>Estimated Pack Energy: <span className="text-[#ff9a4a] font-semibold">{round((Number(Vnom) || 48) * (Number(Ah) || 0) * (Number(parallels) || 1), 2)} Wh</span></div>
                    <div>Inverter Eff: <span className="text-[#ffd24a] font-semibold">{round(Number(inverterEff) || 0.92, 2)}</span></div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Visual + Oscilloscope */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Battery className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Live Visualizer</div>
                        <div className="text-xs text-zinc-400">Battery • Inverter • AC Load • Power flow</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vnom: <span className="text-[#ffd24a] ml-1">{Vnom} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Load: <span className="text-[#ffd24a] ml-1">{loadW} W</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">SOC: <span className="text-[#00ffbf] ml-1">{round(latest.SOC || 0, 2)}%</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <BatteryVisualizerSVG history={history} params={{ Vnom: Number(Vnom), capacityAh: Number(Ah) * Number(parallels), series: Number(series), parallels: Number(parallels), packLabel: `${Vnom}V/${Ah}Ah` }} running={running} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <BatteryOscilloscope history={history} running={running} />
              </div>

              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex text-[#ffd24a] items-center gap-2">
                    <Heart className="w-5 h-5" /> Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Pack Energy</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round((Number(Vnom) || 48) * (Number(Ah) || 0) * (Number(parallels) || 1), 2)} Wh</div>
                      <div className="text-xs text-zinc-400 mt-1">Nominal Pack</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Battery Current (inst)</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{round(latest.Ibat || 0, 6)} A</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Battery Power (inst)</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(latest.Pbat || 0, 4)} W</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Inverter Eff</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{round(Number(inverterEff) || 0.92, 2)}</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Charger Current</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{chargerA} A</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">UPS Mode</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{upsMode}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Sun /></span>
                    <span>Tip: Adjust charger and load to see charge/discharge flow. Use snapshots to save state for comparison.</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* mobile sticky controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 cursor-pointer border-zinc-700 text-zinc-300 text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
