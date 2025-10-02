// src/pages/ResistanceCalculator.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Activity,
  CircuitBoard,
  Plus,
  Minus,
  Trash2,
  Play,
  Pause,
  Download,
  Gauge,
  Settings,
  FlashlightIcon,
  Battery,
  Scissors,
  CopyPlus,
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
  Tooltip,
} from "@/components/ui/tooltip";

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
   Utilities (careful arithmetic)
   ============================ */
const toNum = (v) => {
  if (v === "" || v == null) return NaN;
  const n = Number(v);
  return Number.isNaN(n) ? NaN : n;
};
const rnd = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const factor = 10 ** p;
  return Math.round(v * factor) / factor;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================
   Simulation / history hook
   ============================ */
function usePowerHistory({ running, timestep = 120, computeTotalPower }) {
  const [history, setHistory] = useState(() => {
    const h = [];
    for (let i = 0; i < 120; i++) h.push({ t: i, P: 0 });
    return h;
  });

  const lastTimeRef = useRef(performance.now());
  const rafRef = useRef(null);
  const tRef = useRef(0);

  useEffect(() => {
    let alive = true;
    lastTimeRef.current = performance.now();
    const step = (ts) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(step);
      if (!running) {
        lastTimeRef.current = ts;
        return;
      }
      const dt = ts - lastTimeRef.current;
      if (dt < timestep) return;
      lastTimeRef.current = ts;
      tRef.current += dt;
      const tSeconds = tRef.current / 1000;

      const P = computeTotalPower ? computeTotalPower(tSeconds) : 0;

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, P });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeTotalPower]);

  return { history, setHistory };
}

/* ============================
   Circuit Visualizer (responsive + animated)
   ============================ */
/*
  Improvements made:
  - Dynamic spacing so resistors never overlap right-side readouts.
  - Replaced CSS offset-path dots with SVG <animateMotion>/<mpath> for reliability.
  - Added Req and totalCurrent props to display right-side readouts for all modes.
  - Implemented a simple 'series-parallel' topology: r0 in series with a parallel bank of r1..rn.
  - Better cap of dot counts & speeds to avoid extreme numbers.
*/
function VisualizerSVG({
  configType,
  resistors,
  Vsup,
  currents,
  voltages,
  powers,
  totalPower,
  running,
  Req,
  totalCurrent,
}) {
  // viewbox dims
  const vbW = 800;
  const vbH = configType === "parallel" ? 260 : 240;

  // Reserve right-side readout area so the wiring never overlaps it
  const readoutWidth = 220;
  const leftMargin = 90; // battery + left wiring start
  const rightLimit = vbW - readoutWidth - 20; // allow some padding

  const safeResCount = Math.max(1, resistors.length);
  // spacing across available width (cap min spacing to avoid cramping visuals)
  const available = Math.max(120, rightLimit - leftMargin);
  const spacing = Math.max(70, Math.min(available / (safeResCount + 1), 140));

  // helper for dot counts and speed
  const maxCurrent = Math.max(...currents.map((v) => Math.abs(v) || 0), 1e-6);
  const currentScale = (c) => clamp(Math.abs(c) / Math.max(1e-6, maxCurrent), 0.05, 1.5);

  // build series positions (used by series mode)
  const seriesPositions = [];
  for (let i = 0; i < resistors.length; i++) {
    const x = leftMargin + spacing * (i + 1);
    seriesPositions.push({ x, y: 120 });
  }

  // helper to produce path id
  const uid = (prefix, idx) => `${prefix}-${idx}`;

  return (
    <div className="w-full max-w-full rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm sm:text-lg font-semibold text-[#ffd24a]">Circuit Visualizer</div>
            <div className="text-xs text-zinc-400">Interactive, live • voltmeter • ammeter • power</div>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <div className="text-xs text-zinc-400">Supply</div>
          <div className="text-sm font-semibold text-zinc-200">{Vsup} V</div>
        </div>
      </div>

      {/* SVG area */}
      <div className="mt-3 w-full max-w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-44 sm:h-56 md:h-64"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* common defs for hidden paths (used by animateMotion via mpath) */}
          <defs>
            <style>
              {`
                .wire { stroke: #111; stroke-width: 6; stroke-linecap: round; fill: none; }
                .res-box { fill: #0b0b0b; stroke: #222; }
                .res-fill { fill: #ff7a2d; opacity: 0.9; }
                .txt-small { font-size: 11px; fill: #ffd24a; }
                .val { font-size: 11px; fill: #fff; }
              `}
            </style>
          </defs>

          {/* battery (left) */}
          <g transform="translate(40,120)">
            <rect x="-3" y="-36" width="44" height="72" rx="6" fill="#E65100" stroke="#222" />
            <text x="-42" y="-46" fontSize="11" fill="#ffb57a">{Vsup} V</text>
          </g>

          {configType === "series" && (
            <>
              {/* start horizontal wire from battery to first resistor area */}
              <path d={`M ${leftMargin - 10} 120 H ${leftMargin + 10}`} className="wire" />

              {/* resistor groups spaced dynamically */}
              {resistors.map((r, idx) => {
                const pos = seriesPositions[idx];
                const prevX = idx === 0 ? leftMargin + 10 : seriesPositions[idx - 1].x + 30;
                const nextX = pos.x;
                const segId = uid("seg", idx);

                // compute visual metrics for animation
                const c = currents[idx] || 0;
                const speed = clamp(1.0 + 1.5 / Math.max(0.05, currentScale(c)), 0.8, 4.5);
                const dots = clamp(Math.round(2 + Math.abs(c) * 8), 2, 12);

                // create path for wiring segment (center line) used for animateMotion
                const pathD = `M ${prevX} 120 H ${nextX}`;

                return (
                  <g key={idx}>
                    {/* wiring path segment (invisible, used by mpath) */}
                    <path id={segId} d={pathD} className="wire" fill="none" stroke="transparent" />

                    {/* visible incoming wire to resistor - slightly shorter for the box */}
                    <path d={`M ${prevX} 120 H ${nextX - 30}`} className="wire" />

                    {/* resistor box */}
                    <g transform={`translate(${nextX},${80})`}>
                      <rect x="-30" y="-12" width="60" height="24" rx="6" className="res-box" />
                      <rect x="-22" y="-8" width="44" height="16" rx="4" className="res-fill" />
                      <text x="-10" y="-18" fontSize="11" fill="#ffd24a">{round(r, 3)} Ω</text>
                      <text x="-10" y="36" fontSize="11" fill="#fff">{Number.isFinite(voltages[idx]) ? `${round(voltages[idx], 6)} V` : "-- V"}</text>
                      <text x="-10" y="48" fontSize="11" fill="#fff">{Number.isFinite(currents[idx]) ? `${round(currents[idx], 9)} A` : "-- A"}</text>
                    </g>

                    {/* outgoing wire from resistor to next segment */}
                    <path d={`M ${nextX + 30} 120 H ${nextX + (idx === resistors.length - 1 ? 70 : spacing - 10 + nextX - nextX)}`} fill="#E65100" className="wire" />

                    {/* animated dots moving along the segment path */}
                    {Array.from({ length: dots }).map((_, i) => {
                      const begin = `${(i * speed) / dots}s`;
                      return (
                        <circle key={`dot-s-${idx}-${i}`} r={4} fill="#ff9a4a">
                          <animateMotion
                            dur={`${speed}s`}
                            repeatCount="indefinite"
                            begin={begin}
                          >
                            <mpath xlinkHref={`#${segId}`} />
                          </animateMotion>
                        </circle>
                      );
                    })}
                  </g>
                );
              })}

              {/* final wire to right and return to battery (loop) */}
              <path d={`M ${seriesPositions[resistors.length - 1].x + 70} 120 H ${vbW - readoutWidth - 40}`} className="wire" />
              {/* return wire (down/up loop) */}
              <path d={`M ${vbW - readoutWidth - 40} 120 H ${vbW - readoutWidth - 40} V 80 H ${leftMargin + 20} V 120`} className="wire" fill="none" />

              {/* readouts on the right */}
              <g transform={`translate(${vbW - readoutWidth - 20},24)`}>
                <rect x="-10" y="-20" width="220" height="60" rx="8" fill="#060606" stroke="#222" />
                <text x="-1" y="-4" fill="#ffb57a" fontSize="12">Total R</text>
                <text x="-1" y="18" fill="#ff9a4a" fontSize="18" fontWeight="700">{Number.isFinite(Req) && Req !== Infinity ? `${round(Req, 6)} Ω` : "-- Ω"}</text>
              </g>

              <g transform={`translate(${vbW - readoutWidth - 20},100)`}>
                <rect x="-10" y="-20" width="220" height="60" rx="8" fill="#060606" stroke="#222" />
                <text x="-1" y="-4" fill="#ffb57a" fontSize="12">Total Power</text>
                <text x="-1" y="18" fill="#ff9a4a" fontSize="18" fontWeight="700">{Number.isFinite(totalPower) ? `${round(totalPower, 6)} W` : "-- W"}</text>
              </g>
            </>
          )}

          {configType === "parallel" && (
            <>
              {/* top and bottom bus */}
              <path d={`M ${leftMargin + 30} 40 H ${vbW - readoutWidth - 40}`} className="wire" />
              <path d={`M ${leftMargin + 30} 200 H ${vbW - readoutWidth - 40}`} className="wire" />

              {/* branches spaced evenly between left and right bus extents */}
              {resistors.map((r, idx) => {
                const branchX = leftMargin + spacing * (idx + 1);
                const topY = 40;
                const bottomY = 200;
                const branchId = uid("branch", idx);

                const c = currents[idx] || 0;
                const speed = clamp(1.0 + 1.5 / Math.max(0.05, currentScale(c)), 0.8, 4.5);
                const dots = clamp(Math.round(2 + Math.abs(c) * 8), 2, 16);

                // vertical branch path used by mpath
                const branchPath = `M ${branchX} ${topY} V ${bottomY}`;

                return (
                  <g key={idx}>
                    {/* mpath path (invisible) */}
                    <path id={branchId} d={branchPath} className="wire" stroke="transparent" />

                    {/* vertical visible branch */}
                    <path d={branchPath} className="wire" />

                    {/* resistor box in the middle of branch */}
                    <g transform={`translate(${branchX},${(topY + bottomY) / 2 - 12})`}>
                      <rect x="-30" y="-10" width="60" height="24" rx="6" className="res-box" />
                      <rect x="-22" y="-6" width="44" height="16" rx="4" className="res-fill" />
                      <text x="-12" y="-14" fontSize="11" fill="#ffd24a">{round(r, 3)} Ω</text>
                      <text x="-12" y="24" fontSize="11" fill="#fff">{Number.isFinite(voltages[idx]) ? `${round(voltages[idx], 6)} V` : "-- V"}</text>
                      <text x="-12" y="36" fontSize="11" fill="#fff">{Number.isFinite(currents[idx]) ? `${round(currents[idx], 9)} A` : "-- A"}</text>
                    </g>

                    {/* animated dots along branch */}
                    {Array.from({ length: dots }).map((_, i) => {
                      const begin = `${(i * speed) / dots}s`;
                      return (
                        <circle key={`dot-p-${idx}-${i}`} r={4} fill="#00ffbf">
                          <animateMotion dur={`${speed}s`} repeatCount="indefinite" begin={begin}>
                            <mpath xlinkHref={`#${branchId}`} />
                          </animateMotion>
                        </circle>
                      );
                    })}
                  </g>
                );
              })}

              {/* right readouts */}
              <g transform={`translate(${vbW - readoutWidth - 20},40)`}>
                <rect x="-10" y="-20" width="220" height="60" rx="8" fill="#060606" stroke="#222" />
                <text x="-1" y="-4" fill="#ffb57a" fontSize="12">Req</text>
                <text x="-1" y="18" fill="#ff9a4a" fontSize="18" fontWeight="700">{Number.isFinite(Req) && Req !== Infinity ? `${round(Req,6)} Ω` : "-- Ω"}</text>
              </g>

              <g transform={`translate(${vbW - readoutWidth - 20},120)`}>
                <rect x="-10" y="-20" width="220" height="60" rx="8" fill="#060606" stroke="#222" />
                <text x="-1" y="-4" fill="#ffb57a" fontSize="12">Total Power</text>
                <text x="-1" y="18" fill="#ff9a4a" fontSize="18" fontWeight="700">{Number.isFinite(totalPower) ? `${round(totalPower,6)} W` : "-- W"}</text>
              </g>
            </>
          )}

          {configType === "series-parallel" && (
            <>
              {/* layout for series-parallel:
                  - r0 is series left
                  - r1..rn are a parallel bank on the right node
              */}
              {(() => {
                if (resistors.length < 2) {
                  return (
                    <text x={leftMargin} y={vbH / 2} fill="#ff7a2d" fontSize="12">Need at least 2 resistors for series-parallel</text>
                  );
                }

                // r0 position
                const r0X = leftMargin + spacing * 1;
                const r0Y = 120;
                // parallel bank occupies rest of area
                const bankStartX = r0X + 80;
                const bankEndX = vbW - readoutWidth - 60;
                const bankWidth = Math.max(120, bankEndX - bankStartX);
                const branchSpacing = bankWidth / Math.max(1, resistors.length - 1);

                // path for series resistor r0
                const segId0 = uid("sp-seg", 0);
                const seg0Path = `M ${leftMargin + 10} ${r0Y} H ${r0X}`;

                // draw series incoming
                return (
                  <g>
                    {/* series incoming wire */}
                    <path id={segId0} d={seg0Path} className="wire" stroke="transparent" />
                    <path d={seg0Path} className="wire" />

                    {/* r0 box */}
                    <g transform={`translate(${r0X},${80})`}>
                      <rect x="-30" y="-12" width="60" height="24" rx="6" className="res-box" />
                      <rect x="-22" y="-8" width="44" height="16" rx="4" className="res-fill" />
                      <text x="-10" y="-18" fontSize="11" fill="#ffd24a">{round(resistors[0], 3)} Ω</text>
                      <text x="-10" y="36" fontSize="11" fill="#fff">{Number.isFinite(voltages[0]) ? `${round(voltages[0],6)} V` : "-- V"}</text>
                      <text x="-10" y="48" fontSize="11" fill="#fff">{Number.isFinite(currents[0]) ? `${round(currents[0],9)} A` : "-- A"}</text>
                    </g>

                    {/* wire from r0 to the parallel node */}
                    <path d={`M ${r0X + 30} ${r0Y} H ${bankStartX - 10}`} className="wire" />

                    {/* node where branches join (horizontal bus) */}
                    <path d={`M ${bankStartX - 10} ${r0Y} H ${bankEndX + 10}`} className="wire" />

                    {/* parallel branches (r1..rn) */}
                    {resistors.slice(1).map((r, idx) => {
                      const branchX = bankStartX + branchSpacing * idx;
                      const topY = 60;
                      const bottomY = 180;
                      const branchId = uid("sp-branch", idx + 1);

                      const c = currents[idx + 1] || 0;
                      const speed = clamp(1.0 + 1.5 / Math.max(0.05, currentScale(c)), 0.8, 4.5);
                      const dots = clamp(Math.round(2 + Math.abs(c) * 8), 2, 14);

                      const branchPath = `M ${branchX} ${topY} V ${bottomY}`;

                      return (
                        <g key={`sp-${idx}`}>
                          {/* vertical branch */}
                          <path id={branchId} d={branchPath} className="wire" stroke="transparent" />
                          <path d={branchPath} className="wire" />

                          {/* resistor box in middle */}
                          <g transform={`translate(${branchX},${(topY + bottomY) / 2 - 12})`}>
                            <rect x="-30" y="-10" width="60" height="24" rx="6" className="res-box" />
                            <rect x="-22" y="-6" width="44" height="16" rx="4" className="res-fill" />
                            <text x="-12" y="-14" fontSize="11" fill="#ffd24a">{round(r, 3)} Ω</text>
                            <text x="-12" y="24" fontSize="11" fill="#fff">{Number.isFinite(voltages[idx + 1]) ? `${round(voltages[idx + 1],6)} V` : "-- V"}</text>
                            <text x="-12" y="36" fontSize="11" fill="#fff">{Number.isFinite(currents[idx + 1]) ? `${round(currents[idx + 1],9)} A` : "-- A"}</text>
                          </g>

                          {/* animate dots on branch */}
                          {Array.from({ length: dots }).map((_, i) => {
                            const begin = `${(i * speed) / dots}s`;
                            return (
                              <circle key={`dot-sp-${idx}-${i}`} r={4} fill="#00ffbf">
                                <animateMotion dur={`${speed}s`} repeatCount="indefinite" begin={begin}>
                                  <mpath xlinkHref={`#${branchId}`} />
                                </animateMotion>
                              </circle>
                            );
                          })}
                        </g>
                      );
                    })}

                    {/* return wires from bottom bus back to battery (loop) */}
                    <path d={`M ${bankEndX + 10} ${r0Y} H ${bankEndX + 10} V ${vbH - 20} H ${leftMargin + 20} V ${r0Y}`} className="wire" />
                    {/* animate flow along r0 as well (small number of dots) */}
                    {(() => {
                      const c0 = currents[0] || 0;
                      const speed0 = clamp(1.0 + 1.5 / Math.max(0.05, currentScale(c0)), 0.8, 4.5);
                      const dots0 = clamp(Math.round(2 + Math.abs(c0) * 6), 2, 8);
                      return Array.from({ length: dots0 }).map((_, i) => {
                        const begin = `${(i * speed0) / dots0}s`;
                        return (
                          <circle key={`dot-sp-r0-${i}`} r={4} fill="#ff9a4a">
                            <animateMotion dur={`${speed0}s`} repeatCount="indefinite" begin={begin}>
                              <mpath xlinkHref={`#${segId0}`} />
                            </animateMotion>
                          </circle>
                        );
                      });
                    })()}
                  </g>
                );
              })()}
              {/* right readouts */}
              <g transform={`translate(${vbW - readoutWidth - 20},24)`}>
                <rect x="-10" y="-20" width="220" height="60" rx="8" fill="#060606" stroke="#222" />
                <text x="-1" y="-4" fill="#ffb57a" fontSize="12">Req</text>
                <text x="-1" y="18" fill="#ff9a4a" fontSize="18" fontWeight="700">{Number.isFinite(Req) && Req !== Infinity ? `${round(Req,6)} Ω` : "-- Ω"}</text>
              </g>

              <g transform={`translate(${vbW - readoutWidth - 20},100)`}>
                <rect x="-10" y="-20" width="220" height="60" rx="8" fill="#060606" stroke="#222" />
                <text x="-1" y="-4" fill="#ffb57a" fontSize="12">Total Power</text>
                <text x="-1" y="18" fill="#ff9a4a" fontSize="18" fontWeight="700">{Number.isFinite(totalPower) ? `${round(totalPower,6)} W` : "-- W"}</text>
              </g>
            </>
          )}
        </svg>

        {/* small bottom meters (responsive) */}
        <div className="mt-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full sm:w-auto">
           <div className="flex gap-3 flex-wrap">
  {/* Equivalent R */}
  <div className="bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 px-3 py-2 rounded-xl shadow-sm flex flex-col items-center min-w-[120px]">
    <div className="text-[10px] font-medium text-orange-400 uppercase tracking-wide">
      Equivalent R
    </div>
    <div className="text-lg font-semibold text-[#ff9a4a]">
      {Number.isFinite(Req) && Req !== Infinity ? `${rnd(Req,6)} Ω` : "—"}
    </div>
  </div>

  {/* Total I */}
  <div className="bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 px-3 py-2 rounded-xl shadow-sm flex flex-col items-center min-w-[120px]">
    <div className="text-[10px] font-medium text-cyan-400 uppercase tracking-wide">
      Total I
    </div>
    <div className="text-lg font-semibold text-[#00ffbf]">
      {Number.isFinite(totalCurrent) ? rnd(totalCurrent,9) : "—"} A
    </div>
  </div>

  {/* Total P */}
  <div className="bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 px-3 py-2 rounded-xl shadow-sm flex flex-col items-center min-w-[120px]">
    <div className="text-[10px] font-medium text-orange-500 uppercase tracking-wide">
      Total P
    </div>
    <div className="text-lg font-semibold text-[#ff7a2d]">
      {Number.isFinite(totalPower) ? rnd(totalPower,6) : "—"} W
    </div>
  </div>
</div>

          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================
   Oscilloscope (Power)
   ============================ */
function PowerOscilloscope({ history, running }) {
  const data = history.slice(-240);
  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/20 border border-zinc-800 w-full max-w-full overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — Total Power</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-36 sm:h-44 md:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" hide />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222" }} />
            <Line type="monotone" dataKey="P" stroke="#ff7a2d" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Page
   ============================ */
export default function ResistanceCalculatorPage() {
  // UI & inputs
  const [configType, setConfigType] = useState("series"); // 'series' | 'parallel' | 'series-parallel' (optional)
  const [Vsup, setVsup] = useState("12");
  const [running, setRunning] = useState(true);

  // resistors array
  const [resistors, setResistors] = useState([10, 10, 10]); // default three resistors
  const maxResistors = 8;

  const addResistor = () => {
    if (resistors.length >= maxResistors) return toast("Max resistors reached");
    setResistors((r) => [...r, 10]);
  };
  const removeResistor = (i) => {
    setResistors((r) => r.filter((_, idx) => idx !== i));
  };
  const updateResistor = (i, val) => {
    setResistors((r) => r.map((v, idx) => (idx === i ? val : v)));
  };

  // numeric parsed values
  const Vnum = toNum(Vsup);

  // compute equivalent resistance & per-resistor currents/voltages/power
  // handle 'series', 'parallel' and a simple 'series-parallel' topology:
  // series-parallel interpretation: R0 in series with parallel bank of R1..Rn
  const { Req, currents, voltages, powers, totalPower, totalCurrent } = useMemo(() => {
    const nums = resistors.map((v) => toNum(v));
    // guard NaN -> treat as Infinity (open)
    const sanitized = nums.map((v) => (Number.isFinite(v) && v > 0 ? v : Infinity));

    if (configType === "series") {
      // Req is sum of resistances
      const req = sanitized.reduce((a, b) => a + b, 0);
      const totalI = Number.isFinite(Vnum) && Number.isFinite(req) && req !== 0 && req !== Infinity ? Vnum / req : 0;
      const currentsArr = sanitized.map(() => totalI);
      const voltagesArr = sanitized.map((r) => (Number.isFinite(totalI) && Number.isFinite(r) ? totalI * r : NaN));
      const powersArr = voltagesArr.map((V, i) => (Number.isFinite(V) && Number.isFinite(currentsArr[i]) ? V * currentsArr[i] : NaN));
      const totalP = powersArr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      return { Req: req, currents: currentsArr, voltages: voltagesArr, powers: powersArr, totalPower: totalP, totalCurrent: totalI };
    } else if (configType === "parallel") {
      // Req is 1 / sum(1/Ri)
      let denom = 0;
      for (let i = 0; i < sanitized.length; i++) {
        const r = sanitized[i];
        if (r === 0) { denom = Infinity; break; } // short
        if (Number.isFinite(r) && r > 0) denom += 1 / r;
      }
      const req = denom > 0 && Number.isFinite(denom) ? 1 / denom : Infinity;
      const voltagesArr = sanitized.map(() => Vnum);
      const currentsArr = sanitized.map((r) => (Number.isFinite(r) && r !== 0 && Number.isFinite(Vnum) ? Vnum / r : 0));
      const powersArr = currentsArr.map((I, i) => (Number.isFinite(I) && Number.isFinite(voltagesArr[i]) ? I * voltagesArr[i] : NaN));
      const totalP = powersArr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      const totalI = currentsArr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      return { Req: req, currents: currentsArr, voltages: voltagesArr, powers: powersArr, totalPower: totalP, totalCurrent: totalI };
    } else if (configType === "series-parallel") {
      // interpret: r0 in series with parallel bank r1..rn
      const n = sanitized.length;
      if (n === 0) {
        return { Req: 0, currents: [], voltages: [], powers: [], totalPower: 0, totalCurrent: 0 };
      }
      if (n === 1) {
        const req = sanitized[0];
        const totalI = Number.isFinite(Vnum) && Number.isFinite(req) && req !== 0 && req !== Infinity ? Vnum / req : 0;
        const currentsArr = [totalI];
        const voltagesArr = [Number.isFinite(totalI) ? totalI * req : NaN];
        const powersArr = [Number.isFinite(voltagesArr[0]) && Number.isFinite(totalI) ? voltagesArr[0] * totalI : NaN];
        const totalP = powersArr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
        return { Req: req, currents: currentsArr, voltages: voltagesArr, powers: powersArr, totalPower: totalP, totalCurrent: totalI };
      }

      // compute parallel bank equivalent for r1..rn
      let denom = 0;
      for (let i = 1; i < n; i++) {
        const r = sanitized[i];
        if (r === 0) { denom = Infinity; break; } // short in parallel bank
        if (Number.isFinite(r) && r > 0) denom += 1 / r;
      }
      const rParallel = denom > 0 && Number.isFinite(denom) ? 1 / denom : Infinity;
      const r0 = sanitized[0];
      const req = (Number.isFinite(r0) && Number.isFinite(rParallel) && rParallel !== Infinity) ? (r0 + rParallel) : Infinity;

      // currents: first compute total current through whole network, then split currents in parallel bank
      const totalI = Number.isFinite(Vnum) && Number.isFinite(req) && req !== 0 && req !== Infinity ? Vnum / req : 0;

      // Voltage drop across r0
      const V_r0 = Number.isFinite(totalI) ? totalI * r0 : NaN;

      // Voltage available across parallel bank:
      const V_bank = Number.isFinite(Vnum) && Number.isFinite(V_r0) ? (Vnum - V_r0) : NaN;

      const currentsArr = [];
      const voltagesArr = [];
      const powersArr = [];

      // r0
      currentsArr[0] = totalI;
      voltagesArr[0] = Number.isFinite(totalI) ? totalI * r0 : NaN;
      powersArr[0] = Number.isFinite(currentsArr[0]) && Number.isFinite(voltagesArr[0]) ? currentsArr[0] * voltagesArr[0] : NaN;

      // parallel branch resistors
      let totalP = Number.isFinite(powersArr[0]) ? powersArr[0] : 0;
      let totalIcalc = Number.isFinite(currentsArr[0]) ? currentsArr[0] : 0;
      for (let i = 1; i < n; i++) {
        const r = sanitized[i];
        const Vi = Number.isFinite(V_bank) && Number.isFinite(r) && r !== Infinity ? V_bank : NaN;
        const Ii = Number.isFinite(Vi) && Number.isFinite(r) && r !== 0 ? Vi / r : 0;
        const Pi = Number.isFinite(Ii) && Number.isFinite(Vi) ? Ii * Vi : NaN;
        currentsArr[i] = Ii;
        voltagesArr[i] = Vi;
        powersArr[i] = Pi;
        totalP += Number.isFinite(Pi) ? Pi : 0;
        totalIcalc += Number.isFinite(Ii) ? Ii : 0;
      }

      return { Req: req, currents: currentsArr, voltages: voltagesArr, powers: powersArr, totalPower: totalP, totalCurrent: totalIcalc };
    } else {
      // fallback to series
      const req = sanitized.reduce((a, b) => a + b, 0);
      const totalI = Number.isFinite(Vnum) && Number.isFinite(req) && req !== 0 && req !== Infinity ? Vnum / req : 0;
      const currentsArr = sanitized.map(() => totalI);
      const voltagesArr = sanitized.map((r) => (Number.isFinite(totalI) ? totalI * r : NaN));
      const powersArr = voltagesArr.map((V, i) => (Number.isFinite(V) && Number.isFinite(currentsArr[i]) ? V * currentsArr[i] : NaN));
      const totalP = powersArr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      return { Req: req, currents: currentsArr, voltages: voltagesArr, powers: powersArr, totalPower: totalP, totalCurrent: totalI };
    }
  }, [resistors, Vsup, configType]);

  // history hook for oscilloscope; computeTotalPower uses tiny fluctuation to make waveform lively
  const computeTotalPower = useCallback((tSeconds) => {
    // create a gentle sinusoidal ripple for AC-like visuals if Vsup > 0
    const ripple = Math.sin(tSeconds * 2 * Math.PI * 0.8) * 0.02; // 0.02 relative ripple
    const v = Number.isFinite(Vnum) ? Vnum * (1 + ripple) : 0;
    // re-calc quickly for P = V^2 / Req (if finite)
    const req = Number.isFinite(Req) && Req !== 0 && Req !== Infinity ? Req : Infinity;
    if (!Number.isFinite(req) || req === 0 || req === Infinity) return 0;
    const P = (v * v) / req;
    return rnd(P, 6);
  }, [Req, Vnum]);

  const { history } = usePowerHistory({ running, timestep: 120, computeTotalPower });

  // visualizer needs arrays of currents/voltages/powers and totalPower
  const currentsSafe = currents.map((c) => (Number.isFinite(c) ? c : 0));
  const voltagesSafe = voltages.map((v) => (Number.isFinite(v) ? v : 0));
  const powersSafe = powers.map((p) => (Number.isFinite(p) ? p : 0));

  // actions
  const toggleRunning = () => {
    setRunning((r) => {
      const next = !r;
      toast(next ? "Simulation started" : "Simulation paused");
      return next;
    });
  };

  const resetDefaults = () => {
    setConfigType("series");
    setVsup("12");
    setResistors([10, 10, 10]);
    toast("Reset defaults");
  };

  const exportCSV = () => {
    const rows = [["index", "R(Ω)", "V(V)", "I(A)", "P(W)"], ...resistors.map((r, i) => [i + 1, r, round(voltagesSafe[i], 6), round(currentsSafe[i], 9), round(powersSafe[i], 9)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resistors-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const presets = [
    { id: "3s-10", label: "3×10Ω Series (12V)", config: "series", V: 12, Rs: [10, 10, 10] },
    { id: "3p-10", label: "3×10Ω Parallel (12V)", config: "parallel", V: 12, Rs: [10, 10, 10] },
    { id: "mix-sm", label: "2×5Ω Series (24V)", config: "series", V: 24, Rs: [5, 5] },
    { id: "sp-3", label: "1Ω series + 2||3Ω (12V)", config: "series-parallel", V: 12, Rs: [1, 2, 3] },
  ];

  // responsive layout guard classes used below to prevent overflow (max-w-full)
  return (
    <div className="min-h-screen bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white">
      <Toaster position="top-right" richColors />

      {/* header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-black/40 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 min-w-0">
              <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <div className="text-sm text-zinc-300 leading-none truncate">SparkLab</div>
                  <div className="text-xs text-zinc-400 -mt-0.5 truncate">Resistance Lab — Realtime</div>
                </div>
              </motion.div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-3">
                <div className="text-xs text-zinc-400">Mode</div>
               <Select value={configType} onValueChange={(v) => setConfigType(v)}>
  <SelectTrigger className="w-40 bg-black/80 border border-zinc-800 text-white cursor-pointer hover:border-orange-500 focus:ring-2 focus:ring-orange-500 rounded-md shadow-sm">
    <SelectValue placeholder="Select config" />
  </SelectTrigger>

  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
    <SelectItem
      value="series"
      className="text-white hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 data-[highlighted]:text-orange-100 cursor-pointer rounded-md"
    >
      Series
    </SelectItem>
    <SelectItem
      value="parallel"
      className="text-white hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 data-[highlighted]:text-orange-100 cursor-pointer rounded-md"
    >
      Parallel
    </SelectItem>
    <SelectItem
      value="series-parallel"
      className="text-white hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 data-[highlighted]:text-orange-100 cursor-pointer rounded-md"
    >
      Series-Parallel
    </SelectItem>
  </SelectContent>
</Select>

              </div>

              <div className="flex items-center gap-2">
                <Button className="hidden sm:inline-flex bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer" onClick={() => toast("Run analysis")}>Analyze</Button>
                <Button variant="ghost" className="border border-zinc-800 cursor-pointer text-zinc-300 p-2" onClick={toggleRunning} aria-label="Start / Pause">
                  {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" className="border border-zinc-800  cursor-pointer p-2" onClick={resetDefaults} title="Reset">
                  <RefreshIconFallback className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* main layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* left controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center  justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Resistance Calculator</div>
                        <div className="text-xs text-zinc-400">Series • Parallel • Live visualizer</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                     <Badge className="bg-orange-500/30 backdrop-blur-sm border border-orange-400 text-white px-3 py-1 rounded-full shadow-sm">
  Mode
</Badge>

                      <Select value={configType} onValueChange={(v) => setConfigType(v)}>
  <SelectTrigger className="w-36 bg-black/80 border border-zinc-800 text-white cursor-pointer hover:border-orange-500 focus:ring-2 focus:ring-orange-500 rounded-md shadow-sm">
    <SelectValue placeholder="Select config" />
  </SelectTrigger>

  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
    <SelectItem
      value="series"
      className="text-white hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 data-[highlighted]:text-orange-100 cursor-pointer rounded-md"
    >
      Series
    </SelectItem>
    <SelectItem
      value="parallel"
      className="text-white hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 data-[highlighted]:text-orange-100 cursor-pointer rounded-md"
    >
      Parallel
    </SelectItem>
    <SelectItem
      value="series-parallel"
      className="text-white hover:bg-orange-500/20 data-[highlighted]:bg-orange-500/30 data-[highlighted]:text-orange-100 cursor-pointer rounded-md"
    >
      Series-Parallel
    </SelectItem>
  </SelectContent>
</Select>

                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
                      <div className="text-xs text-zinc-400">Equivalent R: <span className="text-[#ff9a4a] ml-2">{Number.isFinite(Req) && Req !== Infinity ? `${rnd(Req,6)} Ω` : "—"}</span></div>
                    </div>
                    <Input value={Vsup} onChange={(e) => setVsup(e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" type="number" />
                  </div>

                  {/* resistor list */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-zinc-400">Resistors</div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" className="p-1 cursor-pointer border border-zinc-800 text-zinc-300" onClick={() => { setResistors([10, 10, 10]); toast("Default set"); }}>
                          <Scissors className="w-4 h-4" />
                        </Button>
                        <Button className="px-2 py-1 cursor-pointer bg-zinc-900/60 border hover:bg-orange-400 hover:text-black border-zinc-800 text-zinc-200 text-sm" onClick={addResistor}>
                          <CopyPlus className="w-4 h-4" /> Add
                        </Button>
                      </div>
                    </div>

                    <div className="max-h-[300px] overflow-auto space-y-2 pr-2">
                      {resistors.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-10 h-10 p-4  rounded-md bg-orange-500 border border-zinc-800 flex items-center justify-center text-xs text-zinc-200">
                            R{i + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Input value={String(r)} onChange={(e) => updateResistor(i, toNum(e.target.value) || 0)} type="number" className="bg-zinc-900/60 border w-[100px] border-zinc-800 text-orange-100" />
                              <div className="min-w-[96px] text-xs text-zinc-400">
                                V: <span className="text-white">{Number.isFinite(voltages[i]) ? rnd(voltages[i],6) : "—"}</span>
                              </div>
                              <div className="min-w-[120px] text-xs text-zinc-400">
                                I: <span className="text-white">{Number.isFinite(currents[i]) ? rnd(currents[i],9) : "—"}</span>
                              </div>

                              <div className="flex gap-1">
                                <Button variant="ghost" className="p-1 border border-zinc-800 bg-red-500 cursor-pointer hover:bg-red-600 hover:text-black " onClick={() => removeResistor(i)}><Trash2 className="w-4 h-4" /></Button>
                              </div>
                            </div>
                            <div className="text-xs text-zinc-500 mt-1">
                              P: <span className="text-[#ff7a2d]">{Number.isFinite(powers[i]) ? rnd(powers[i],6) : "—"} W</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* actions */}
                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer" onClick={() => { setRunning(true); toast.success("Running"); }}>
                        <Play className="w-4 h-4 mr-2" /> Run
                      </Button>
                      <Button variant="outline" className="px-3 py-2 text-black border-zinc-700 cursor-pointer" onClick={() => { setRunning(false); toast("Paused"); }}>
                        <Pause className="w-4 h-4 mr-2" /> Pause
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                    </div>
                  </div>

                  {/* presets */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    {presets.map((p) => (
                      <button key={p.id} onClick={() => { setConfigType(p.config); setVsup(String(p.V)); setResistors(p.Rs); toast(`${p.label} applied`); }} className="px-3 cursor-pointer hover:bg-zinc-600 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-200">
                        {p.label}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* right: visual + oscilloscope */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div className="w-full max-w-full" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <CircuitBoard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Circuit Visualizer</div>
                        <div className="text-xs text-zinc-400">Realtime flow • meters • waveform</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{configType}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V<sub>sup</sub>: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Req: <span className="text-[#ff9a4a] ml-1">{Number.isFinite(Req) && Req !== Infinity ? `${rnd(Req,6)} Ω` : "—"}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <VisualizerSVG
                    configType={configType}
                    resistors={resistors}
                    Vsup={Number.isFinite(Vnum) ? Vnum : 0}
                    currents={currentsSafe}
                    voltages={voltagesSafe}
                    powers={powersSafe}
                    totalPower={Number.isFinite(totalPower) ? totalPower : 0}
                    running={running}
                    Req={Req}
                    totalCurrent={totalCurrent}
                  />
                </CardContent>
              </Card>
            </motion.div>

            {/* oscilloscope + history */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <motion.div className="w-full max-w-full" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay: 0.06 }}>
                <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center  text-[#ff7a2d] gap-2"><Activity className="w-5 h-5 " /> Oscilloscope</div>
                     <div className="bg-orange-500/30 backdrop-blur-sm border border-orange-400 text-white text-xs px-2 py-1 rounded-full shadow-sm inline-block">
  Total power waveform
</div>

                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PowerOscilloscope history={history} running={running} />
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div className="w-full max-w-full" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay: 0.08 }}>
                <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center text-[#ffd24a] gap-2"><Gauge className="w-5 h-5   " /> Summary</div>
                     <div className="bg-orange-500/30 backdrop-blur-sm border border-orange-400 text-white text-xs px-2 py-1 rounded-full shadow-sm hover:shadow-lg hover:shadow-orange-500/50 transition-all duration-300 inline-block">
  Quick metrics
</div>

                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                        <div className="text-xs text-zinc-400">Equivalent R</div>
                        <div className="text-lg font-semibold text-[#ff9a4a]">{Number.isFinite(Req) && Req !== Infinity ? `${rnd(Req,6)} Ω` : "—"}</div>
                      </div>

                      <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                        <div className="text-xs text-zinc-400">Total Current</div>
                        <div className="text-lg font-semibold text-[#00ffbf]">{Number.isFinite(totalCurrent) ? rnd(totalCurrent,9) : "—"} A</div>
                      </div>

                      <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                        <div className="text-xs text-zinc-400">Total Power</div>
                        <div className="text-lg font-semibold text-[#ff7a2d]">{Number.isFinite(totalPower) ? rnd(totalPower,6) : "—"} W</div>
                      </div>
                    </div>

                    <div className="mt-4 text-xs text-zinc-400">
                      Tip: Toggle <span className="text-white">Pause</span> to inspect static readings. Export CSV to share results.
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>

        </div>
      </main>

      {/* sticky mobile controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-black/80 to-zinc-900/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2  cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 cursor-pointer text-black border-zinc-700  text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border cursor-pointer  border-white/20 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>

      {/* desktop quick controls */}
      <div className="hidden lg:flex fixed bottom-6 right-6 z-60 flex-col gap-2 p-2 bg-black/70 border border-zinc-800 rounded-lg shadow-lg">
        <Button className="px-3 py-2 cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => setRunning(true)} aria-label="Run">
          <Play className="w-4 h-4" />
        </Button>
        <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)} aria-label="Pause">
          <Pause className="w-4 h-4" />
        </Button>
        <Button variant="ghost" className="px-3 py-2 border border-zinc-800 cursor-pointer " onClick={resetDefaults} aria-label="Reset">
          <RefreshIconFallback />
        </Button>
        <Button variant="ghost" className="px-3 py-2 border border-zinc-800 cursor-pointer text-zinc-300" onClick={exportCSV} aria-label="Export CSV">
          <Download className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

/* -----------------------
   Small helpers / fallbacks
   ----------------------- */
function round(v, p = 6) {
  if (!Number.isFinite(v)) return "--";
  const factor = 10 ** p;
  return Math.round(v * factor) / factor;
}

// Replace with a refresh icon from lucide if you prefer; used a mini fallback to avoid extra imports.
function RefreshIconFallback() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-zinc-300"><path d="M21 12a9 9 0 10-3.14 6.36L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
