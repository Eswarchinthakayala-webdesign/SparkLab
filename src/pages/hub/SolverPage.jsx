// src/pages/SolverPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Cpu,
  Activity,
  Play,
  Pause,
  Plus,
  Trash2,
  Layers,
  Gauge,
  Download,
  Settings,
  Menu,
  X,
  Lightbulb,
  Bolt, Battery, Radio, ListChecks,
  RotateCcw,
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
import { toPng } from "html-to-image";  

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
   Step solver helpers
   - Build readable step-by-step explanation arrays
   ============================ */

function formatOhm(v) {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e6) return `${round(v / 1e6, 3)} MΩ`;
  if (v >= 1e3) return `${round(v / 1e3, 3)} kΩ`;
  return `${round(v, 6)} Ω`;
}

// For display of capacitance/inductance
function fmtC(vMicro) {
  if (!Number.isFinite(vMicro)) return "—";
  return `${round(vMicro, 6)} μF`;
}
function fmtL(vMilli) {
  if (!Number.isFinite(vMilli)) return "—";
  return `${round(vMilli, 6)} mH`;
}

/* ============================
   Simulation Hook (useSolverSim)
   - Supports: resistor network step voltage -> transient for RC/RL
   - history: array of {t, V, I, P, E}
   ============================ */
function useSolverSim({
  running,
  timestep = 60,
  problemType = "resistors",
  Vsup = 5,
  seriesResistance = 1,
  // components = array of component groups [{ type: 'series'|'parallel', values: [num,...] }]
  components = [{ type: "series", values: [1000, 2000] }],
  compUnit = "ohm", // 'ohm' | 'uF' | 'mH'
}) {
  const historyRef = useRef(Array.from({ length: 240 }, (_, i) => ({ t: i, P: 0, V: 0, I: 0, E: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  const computeEquivalent = useCallback(
    (componentsLocal) => {
      // For resistor networks: groups represent branches in parallel, each group has series components
      if (!componentsLocal || componentsLocal.length === 0) return { total: NaN, groupValues: [] };

      if (compUnit === "ohm") {
        // For resistors: treat each group as series group, groups in parallel
        const groupVals = componentsLocal.map((g) => {
          const vals = g.values.map((v) => (Number.isFinite(v) && v > 0 ? Number(v) : NaN));
          const Rseries = vals.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
          return { Rseries, vals };
        });
        // combine groups in parallel
        let denom = 0;
        groupVals.forEach((g) => {
          if (Number.isFinite(g.Rseries) && g.Rseries > 0) denom += 1 / g.Rseries;
        });
        const Rtotal = denom > 0 ? 1 / denom : NaN;
        return { total: Rtotal, groupValues: groupVals };
      } else if (compUnit === "uF") {
        // Capacitors: groups are branches (series/parallel as specified)
        // We'll compute each group equivalent then combine as parallel branches
        const groupReq = componentsLocal.map((g) => {
          const vals = g.values.map((v) => (Number.isFinite(v) && v > 0 ? v * 1e-6 : NaN));
          if (g.type === "series") {
            let denom = 0;
            vals.forEach((c) => {
              if (Number.isFinite(c) && c > 0) denom += 1 / c;
            });
            const Ceq = denom > 0 ? 1 / denom : 0;
            return { Ceq, vals };
          } else {
            const Ceq = vals.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
            return { Ceq, vals };
          }
        });
        // groups in parallel => sum up Ceq
        const totalC = groupReq.reduce((a, b) => a + (Number.isFinite(b.Ceq) ? b.Ceq : 0), 0);
        return { total: totalC, groupValues: groupReq };
      } else {
        // inductors mH
        const groupReq = componentsLocal.map((g) => {
          const vals = g.values.map((v) => (Number.isFinite(v) && v > 0 ? v * 1e-3 : NaN));
          if (g.type === "series") {
            const Leq = vals.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
            return { Leq, vals };
          } else {
            let denom = 0;
            vals.forEach((L) => {
              if (Number.isFinite(L) && L > 0) denom += 1 / L;
            });
            const Leq = denom > 0 ? 1 / denom : 0;
            return { Leq, vals };
          }
        });
        // groups combined as parallel -> resulting total via reciprocals
        let denom = 0;
        groupReq.forEach((g) => {
          const val = Number.isFinite(g.Leq) ? g.Leq : 0;
          if (val > 0) denom += 1 / val;
        });
        const totalL = denom > 0 ? 1 / denom : NaN;
        return { total: totalL, groupValues: groupReq };
      }
    },
    [compUnit]
  );

  const computeInstant = useCallback(
    (tSeconds, totalReq) => {
      const R = Math.max(1e-6, seriesResistance);
      if (!Number.isFinite(totalReq) || totalReq <= 0) {
        return { Vt: 0, It: 0, Pt: 0, energy: 0 };
      }

      if (compUnit === "uF") {
        // RC charging: V(t) = Vsup (1 - e^-t/(R*C)), I = C dV/dt
        const C = totalReq;
        const tau = clamp(R * C, 1e-9, 1e6);
        const Vt = Vsup * (1 - Math.exp(-tSeconds / tau));
        const dVdt = (Vsup / tau) * Math.exp(-tSeconds / tau);
        const It = C * dVdt;
        const Pt = Vt * It;
        const energy = 0.5 * C * Vt * Vt;
        return { Vt, It, Pt, energy, tau };
      } else if (compUnit === "mH") {
        const L = totalReq;
        const tauL = clamp(L / R, 1e-9, 1e6);
        const Iinf = Vsup / R;
        const It = Iinf * (1 - Math.exp(-tSeconds / tauL));
        const dIdt = (Iinf / tauL) * Math.exp(-tSeconds / tauL);
        const Vl = L * dIdt;
        const Pt = Vl * It;
        const energy = 0.5 * L * It * It;
        return { Vt: Vl, It, Pt, energy, tau: tauL };
      } else {
        // resistors: steady DC divider current I = V / R
        const It = Vsup / totalReq;
        const Pt = Vsup * It;
        return { Vt: Vsup, It, Pt, energy: 0, tau: 0 };
      }
    },
    [Vsup, seriesResistance, compUnit]
  );

  const eq = useMemo(() => computeEquivalent(components), [components, computeEquivalent]);

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
      const tSeconds = tRef.current / 1000;
      const totalReq = eq.total;
      const { Vt, It, Pt, energy } = computeInstant(tSeconds, totalReq);
      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, P: Pt, V: Vt, I: It, E: energy });
        if (next.length > 900) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeInstant, eq.total]);

  return { history, eq };
}

/* ============================
   Visualizer SVG Component
   - Animated flow dots, per-component highlights, clickable components
   ============================ */
function SolverVisualizer({
  compUnit,
  components = [],
  Vsup = 5,
  history = [],
  running,
  manualI,
  onComponentClick = () => {},
}) {
  const latest = history.length ? history[history.length - 1] : { P: 0, V: 0, I: 0, E: 0 };
  const ItSim = latest.I || 0;
  const ItUsed = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : ItSim;
  const absI = Math.abs(ItUsed);
  const dotCount = clamp(Math.round(3 + absI * 6), 3, 24);
  const speed = clamp(1.0 / (absI + 0.01), 0.2, 3.2);
  const groupCount = Math.max(1, components.length);
  const spacing = Math.max(110, Math.min(260, Math.floor(520 / Math.max(1, Math.min(groupCount, 6)))));
  const startX = 160;
  const svgWidth = Math.max(980, startX + spacing * groupCount + 220);
  const busStart = 100;
  const busEnd = svgWidth - 120;

  const formatGroup = (g) => {
    if (!g) return "--";
    if (compUnit === "uF") {
      // compute Ceq for display (μF)
      if (g.type === "series") {
        let denom = 0;
        g.values.forEach((v) => {
          if (Number.isFinite(v) && v > 0) denom += 1 / (v * 1e-6);
        });
        const Ceq = denom > 0 ? 1 / denom : 0;
        return `${round(Ceq * 1e6, 4)} μF`;
      } else {
        const Ceq = g.values.reduce((a, b) => a + (Number.isFinite(b) ? b * 1e-6 : 0), 0);
        return `${round(Ceq * 1e6, 4)} μF`;
      }
    } else if (compUnit === "mH") {
      if (g.type === "series") {
        const Leq = g.values.reduce((a, b) => a + (Number.isFinite(b) ? b * 1e-3 : 0), 0);
        return `${round(Leq * 1e3, 4)} mH`;
      } else {
        let denom = 0;
        g.values.forEach((v) => {
          if (Number.isFinite(v) && v > 0) denom += 1 / (v * 1e-3);
        });
        const Leq = denom > 0 ? 1 / denom : 0;
        return `${round(Leq * 1e3, 4)} mH`;
      }
    } else {
      // resistors - group is series sum
      const R = g.values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      return formatOhm(R);
    }
  };

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/10 border border-zinc-800 overflow-hidden">
      <div className="flex items-start flex-wrap justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Solver Visualizer</div>
            <div className="text-xs text-zinc-400">Real-time animation • interactive • click components to edit</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V<sub>sup</sub>: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I: <span className="text-[#00ffbf] ml-1">{round(ItUsed, 9)} A</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">P: <span className="text-[#ff9a4a] ml-1">{round(latest.P, 6)} W</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} 340`} preserveAspectRatio="xMidYMid meet" className="w-full h-72">
          {/* supply */}
          <g transform={`translate(${busStart - 64},180)`}>
            <rect x="-26" y="-40" width="52" height="80" rx="10" fill="#060606" stroke="#222" />
            <text x="-44" y="-52" fontSize="12" fill="#ffd24a">{Vsup}V</text>
          </g>

          {/* bus */}
          <path d={`M ${busStart} 180 H ${busEnd}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* groups */}
          {components.map((g, i) => {
            const x = startX + i * spacing;
            const label = g.type ? g.type.toUpperCase() : "GROUP";
            const groupStr = formatGroup(g);

            return (
              <g key={`grp-${i}`}>
                <path d={`M ${x} 180 V 68`} stroke="#111" strokeWidth="6" strokeLinecap="round" />
                {/* stack components */}
                {g.values.map((v, idx) => {
                  const y = 88 + idx * 46;
                  const fill = compUnit === "uF" ? "#ffb86b" : compUnit === "mH" ? "#ff6a9a" : "#ffd24a";
                  const labelText = compUnit === "uF" ? `${v} μF` : compUnit === "mH" ? `${v} mH` : `${round(v,3)} Ω`;
                  return (
                    <g
                      key={`cmp-${i}-${idx}`}
                      transform={`translate(${x},${y})`}
                      className="component-block cursor-pointer"
                      onClick={() => onComponentClick(i, idx)}
                    >
                      <rect x="-32" y="-12" width="64" height="24" rx="8" fill="#0b0b0b" stroke="#222" />
                      <rect x="-26" y="-8" width="52" height="16" rx="6" fill={fill} opacity={0.95} />
                      <text x="-18" y="-18" fontSize="10" fill="#ffd24a">{labelText}</text>
                    </g>
                  );
                })}

                {/* label */}
                <g transform={`translate(${x}, 54)`}>
                  <rect x="-54" y="-22" width="108" height="40" rx="10" fill="#060606" stroke="#222" />
                  <text x="-46" y="-4" fontSize="11" fill="#ff9a4a">{label}</text>
                  <text x="-46" y="14" fontSize="11" fill="#fff">{groupStr}</text>
                </g>

                {/* animated dots */}
                {Array.from({ length: dotCount }).map((_, di) => {
                  const pathStr = `M ${x} 68 V 180 H ${x + 28}`;
                  const delay = (di / dotCount) * speed;
                  const style = {
                    offsetPath: `path('${pathStr}')`,
                    animationName: compUnit === "uF" ? "flowCap" : compUnit === "mH" ? "flowInd" : "flowRes",
                    animationDuration: `${speed}s`,
                    animationTimingFunction: "linear",
                    animationDelay: `${-delay}s`,
                    animationIterationCount: "infinite",
                    animationPlayState: running ? "running" : "paused",
                    transformOrigin: "0 0",
                  };
                  const dotColor = compUnit === "uF" ? "#ffd24a" : compUnit === "mH" ? "#ff6a9a" : "#00ffbf";
                  return <circle key={`dot-${i}-${di}`} r="4" fill={dotColor} style={style} />;
                })}
              </g>
            );
          })}

          {/* Readouts */}
          <g transform={`translate(${svgWidth - 200},40)`}>
            <rect x="-90" y="-36" width="180" height="150" rx="12" fill="#060606" stroke="#222" />
            <text x="-78" y="-12" fontSize="12" fill="#ffb57a">Readouts</text>
            <text x="-78" y="8" fontSize="12" fill="#fff">V: <tspan fill="#ffd24a">{round(latest.V,6)}</tspan></text>
            <text x="-78" y="30" fontSize="12" fill="#fff">I: <tspan fill="#00ffbf">{round(latest.I,9)}</tspan></text>
            <text x="-78" y="52" fontSize="12" fill="#fff">P: <tspan fill="#ff9a4a">{round(latest.P,8)}</tspan></text>
            <text x="-78" y="74" fontSize="12" fill="#fff">E: <tspan fill="#9ee6ff">{round(latest.E,8)}</tspan></text>
          </g>

          <style>{`
            @keyframes flowCap {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-1px,-1px) scale(0.98); }
              45% { opacity: 0.92; transform: translate(0,0) scale(1.03); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(4px,4px) scale(0.9); }
            }
            @keyframes flowInd {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(-6px,6px) scale(0.82); }
            }
            @keyframes flowRes {
              0% { offset-distance: 0%; opacity: 0.95; transform: scale(1); }
              45% { opacity: 0.9; transform: scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: scale(0.9); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) { text { font-size: 9px; } }
          `}</style>
        </svg>
      </div>
    </div>
  );
}

/* ============================
   Oscilloscope Component (V, I, P)
   ============================ */
function SolverOscilloscope({ history = [], running }) {
  const data = history.slice(-480).map((d, idx) => ({
    t: idx,
    V: round(d.V, 6),
    I: round(d.I, 9),
    P: round(d.P, 8),
  }));

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/10 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — V, I, P</div>
        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "#888" }} />
            <YAxis tick={{ fill: "#888" }} />
            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
            <Legend wrapperStyle={{ color: "#aaa" }} />
            <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Voltage (V)" />
            <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Current (A)" />
            <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Power (W)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Step-by-step Solver Panel
   - Render an array of human-readable steps
   ============================ */
function SolverSteps({ problemType, components, compUnit, seriesResistance, Vsup, eq }) {
  // Build steps based on problemType and eq
  const steps = [];

  if (compUnit === "ohm") {
    steps.push("Problem: Equivalent resistance for resistor network.");
    steps.push("Assumptions: Each group is a series chain; groups are parallel branches.");
    components.forEach((g, i) => {
      const Rseries = g.values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      steps.push(`Group ${i + 1}: Series sum R = ${g.values.map((v) => `${round(v, 3)}Ω`).join(" + ")} = ${formatOhm(Rseries)}.`);
    });
    const groupRs = components.map((g) => g.values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0));
    // parallel combine
    const denomStr = groupRs.map((r) => `1/${formatOhm(r)}`).join(" + ");
    steps.push(`Total parallel combine: 1/R_total = ${groupRs.map((r) => `1/${round(r,3)}`).join(" + ")}.`);
    steps.push(`R_total = ${formatOhm(eq.total)}.`);
    steps.push(`Steady-state current: I = Vsup / R_total = ${round(Vsup, 3)} / ${round(eq.total, 6)} = ${round(eq.total ? Vsup / eq.total : NaN, 9)} A.`);
  } else if (compUnit === "uF") {
    steps.push("Problem: RC charging transient for equivalent C.");
    steps.push("Step 1: For each group compute Ceq (series -> 1/Ceq = Σ 1/Ci ; parallel -> Ceq = Σ Ci).");
    components.forEach((g, i) => {
      if (g.type === "series") {
        steps.push(`Group ${i + 1} (series): 1/Ceq = ${g.values.map((v) => `1/${v}μF`).join(" + ")} => compute Ceq.`);
      } else {
        steps.push(`Group ${i + 1} (parallel): Ceq = ${g.values.map((v) => `${v}μF`).join(" + ")}.`);
      }
    });
    steps.push(`Total equivalent Capacitance: C_total = ${eq.total ? `${round(eq.total * 1e6, 6)} μF` : "—"}.`);
    // tau
    const R = Number(seriesResistance);
    const C = eq.total || NaN;
    const tau = Number.isFinite(R) && Number.isFinite(C) ? R * C : NaN;
    steps.push(`Time constant τ = R × C = ${R} × ${C ? round(C, 9) : "—"} = ${Number.isFinite(tau) ? round(tau, 6) + " s" : "—"}.`);
    steps.push("Transient formulas:");
    steps.push("  V(t) = Vsup × (1 − e^(−t/τ))");
    steps.push("  I(t) = C × (dV/dt) = (Vsup/τ) × e^(−t/τ) × C -> simplifies to I(t) = (Vsup/R) × e^(−t/τ)");
    steps.push(`At t = 0: V(0) = 0, I(0) = Vsup / R = ${round(Vsup / R, 9)} A`);
    steps.push(`As t → ∞: V(∞) = Vsup (${Vsup} V), I(∞) = 0 A`);
  } else {
    // mH
    steps.push("Problem: RL charging transient (inductor) for equivalent L.");
    components.forEach((g, i) => {
      if (g.type === "series") {
        steps.push(`Group ${i + 1} (series): Leq = ${g.values.map((v) => `${v} mH`).join(" + ")}.`);
      } else {
        steps.push(`Group ${i + 1} (parallel): 1/Leq = ${g.values.map((v) => `1/${v}`).join(" + ")} -> compute Leq.`);
      }
    });
    steps.push(`Total equivalent L: L_total = ${eq.total ? `${round(eq.total * 1e3,6)} mH` : "—"}.`);
    const R = Number(seriesResistance);
    const L = eq.total || NaN;
    const tau = Number.isFinite(L) && Number.isFinite(R) ? L / R : NaN;
    steps.push(`Time constant τ = L / R = ${Number.isFinite(tau) ? round(tau,6) + " s" : "—"}.`);
    steps.push("Transient formulas:");
    steps.push("  I(t) = (Vsup / R) × (1 − e^(−t/τ))");
    steps.push("  V_L(t) = L × dI/dt");
    steps.push(`At t = 0: I(0) = 0 A, At ∞: I(∞) = Vsup/R = ${round(Vsup / R, 9)} A`);
  }

  return (
    <div className="rounded-xl p-3 bg-black/70 border border-zinc-800 overflow-auto max-h-[420px]">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-[#ffd24a]">Step-by-step Solution</div>
        <div className="text-xs text-zinc-400">Auto-updates with inputs</div>
      </div>

      <ol className="list-decimal list-inside text-sm text-zinc-200 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="text-sm leading-relaxed">
            <code className="text-xs text-zinc-300 bg-zinc-900/30 px-2 py-1 rounded-md">{s}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ============================
   Main Solver Page Component
   ============================ */
export default function SolverPage() {
  // UI state
  const [problemType, setProblemType] = useState("resistors"); // 'resistors' | 'rc' | 'rl'
  const [compUnit, setCompUnit] = useState("ohm"); // ohm | uF | mH
  const [Vsup, setVsup] = useState("5");
  const [seriesResistance, setSeriesResistance] = useState("1000"); // ohm used for RC/RL dynamics
  const [running, setRunning] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [manualCurrent, setManualCurrent] = useState("");

  // components: default two groups with sample values
  const [components, setComponents] = useState([
    { type: "series", values: [1000, 2000] },
    { type: "series", values: [3000] },
  ]);

  // update compUnit based on problemType auto
  useEffect(() => {
    if (problemType === "resistors") setCompUnit("ohm");
    if (problemType === "rc") setCompUnit("uF");
    if (problemType === "rl") setCompUnit("mH");
  }, [problemType]);

  // simulation hook
  const { history, eq } = useSolverSim({
    running,
    timestep: 60,
    problemType,
    Vsup: Number.isFinite(Number(Vsup)) ? Number(Vsup) : 0,
    seriesResistance: Number.isFinite(Number(seriesResistance)) ? Number(seriesResistance) : 1,
    components,
    compUnit,
  });

  // helpers for mutating component groups
  const addGroup = () => setComponents((s) => [...s, { type: "series", values: compUnit === "ohm" ? [1000] : compUnit === "uF" ? [10] : [10] }]);
  const removeGroup = (gi) => setComponents((s) => s.filter((_, i) => i !== gi));
  const addComponent = (gi) => setComponents((s) => s.map((g, i) => (i === gi ? { ...g, values: [...g.values, compUnit === "ohm" ? 1000 : compUnit === "uF" ? 10 : 10] } : g)));
  const removeComponent = (gi, ri) => setComponents((s) => s.map((g, i) => (i === gi ? { ...g, values: g.values.filter((_, idx) => idx !== ri) } : g)));
  const updateValue = (gi, ri, v) =>
    setComponents((s) =>
      s.map((g, i) =>
        i === gi ? { ...g, values: g.values.map((val, idx) => (idx === ri ? (Number.isFinite(Number(v)) ? Number(v) : 0) : val)) } : g
      )
    );
  const changeGroupType = (gi, type) => setComponents((s) => s.map((g, i) => (i === gi ? { ...g, type } : g)));

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setProblemType("resistors");
    setVsup("5");
    setSeriesResistance("1000");
    setComponents([{ type: "series", values: [1000, 2000] }, { type: "series", values: [3000] }]);
    setManualCurrent("");
    toast("Reset to defaults");
  };

  const exportCSV = () => {
    const rows = [["t", "V", "I", "P", "E"], ...history.map((d) => [d.t, round(d.V, 9), round(d.I, 9), round(d.P, 9), round(d.E, 9)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `solver-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  const onComponentClick = (gi, ri) => {
    toast(`Edit component: Group ${gi + 1} Component ${ri + 1}`);
    // Optionally focus input — simplified: we open mobile panel to edit or show prompt
    const current = components[gi].values[ri];
    const val = prompt(`Enter new value for component (current ${current}):`);
    if (val === null) return;
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Invalid value");
      return;
    }
    updateValue(gi, ri, num);
  };

  // readable eq string
  const eqDisplay = useMemo(() => {
    if (!eq || !Number.isFinite(eq.total)) return "--";
    if (compUnit === "ohm") return formatOhm(eq.total);
    if (compUnit === "uF") return `${round(eq.total * 1e6, 6)} μF`;
    return `${round(eq.total * 1e3, 6)} mH`;
  }, [eq, compUnit]);

  // I simulation last
  const Isim = history.length ? history[history.length - 1].I : 0;
  const Iused = Number.isFinite(Number(manualCurrent)) && manualCurrent !== "" ? Number(manualCurrent) : Isim;
  
  
const snapshotPNG = async () => {
    const node = document.querySelector(".snapshot");
    if (!node) {
      toast.error("Snapshot target not found");
      return;
    }

    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#000",
        quality: 1,
      });
      const link = document.createElement("a");
      link.download = `snapshot-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Snapshot saved!");
    } catch (error) {
      console.error("Snapshot failed:", error);
      toast.error("Failed to capture snapshot");
    }
 
}
  /* ============================
     UI
     ============================ */
  return (
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-11 h-11 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
                <Zap className="w-6 h-6 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm font-semibold text-zinc-200">SparkLab </div>
                <div className="text-xs text-zinc-400 -mt-0.5">Step-by-step circuit solver</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-44">
                <Select value={problemType} onValueChange={(v) => setProblemType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Problem type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="resistors"      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Resistor Network</SelectItem>
                    <SelectItem value="rc"      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">RC Transient</SelectItem>
                    <SelectItem value="rl"      className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">RL Transient</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-1 cursor-pointer rounded-lg shadow-md" onClick={snapshotPNG}>Snapshot</Button>
                <Button variant="ghost" className="border border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer p-2 rounded-lg" onClick={toggleRunning} title={running ? "Pause" : "Play"}>{running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}</Button>
                <Button variant="ghost" className="border border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer p-2 rounded-lg" onClick={resetDefaults} title="Reset"><Settings className="w-5 h-5" /></Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</Button>
            </div>
          </div>

          {/* mobile panel */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex gap-2">
              <Select value={problemType} onValueChange={(v) => setProblemType(v)}>
                <SelectTrigger className="w-full cursor-pointer focus:border-orange-400 bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                  <SelectItem value="resistors"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Resistor Network</SelectItem>
                  <SelectItem value="rc"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">RC Transient</SelectItem>
                  <SelectItem value="rl"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">RL Transient</SelectItem>
                </SelectContent>
              </Select>
              <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black" onClick={snapshotPNG}>Snapshot</Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16"></div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls column */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  <Card className="bg-black/60 backdrop-blur-xl border border-zinc-800/60 shadow-lg rounded-2xl overflow-hidden w-full transition-all duration-300 hover:shadow-orange-500/10">
    <CardHeader>
      <CardTitle className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
            <Activity className="w-5 h-5 text-black" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#ffd24a]">
              Solver:{" "}
              {problemType === "resistors"
                ? "Resistors"
                : problemType === "rc"
                ? "RC Transient"
                : "RL Transient"}
            </h2>
            <p className="text-xs text-zinc-400">
              Interactive step-by-step & real-time visualizer
            </p>
          </div>
        </div>

        <Badge
          className="px-3 py-1 text-xs font-medium text-orange-300 border border-orange-500/60 rounded-full
          bg-black/50 backdrop-blur-md shadow-md"
        >
          Mode
        </Badge>
      </CardTitle>
    </CardHeader>

    <CardContent className="space-y-6">
      {/* Inputs */}
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
          <Input
            value={Vsup}
            onChange={(e) => setVsup(e.target.value)}
            type="number"
            className="bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-600 focus:ring-1 focus:ring-orange-400"
          />
        </div>

        <div>
          <label className="text-xs text-zinc-400">
            Series Resistance (Ω) — used for dynamics
          </label>
          <Input
            value={seriesResistance}
            onChange={(e) => setSeriesResistance(e.target.value)}
            type="number"
            className="bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-600 focus:ring-1 focus:ring-orange-400"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs text-zinc-400">Manual Current (A)</label>
          <Input
            value={manualCurrent}
            onChange={(e) => setManualCurrent(e.target.value)}
            placeholder="Leave empty to use simulated I"
            type="text"
            className="bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-600 focus:ring-1 focus:ring-orange-400"
          />
          <p className="text-xs text-zinc-500 mt-1">
            If set, oscilloscope uses this current for power computations.
          </p>
        </div>
      </div>

      {/* Group editor */}
      <div className="space-y-4">
        {components.map((g, gi) => (
          <motion.div
            key={gi}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-md rounded-xl p-4 shadow-sm"
          >
            <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Badge
                  className="bg-gradient-to-tr from-[#ff7a2d]/80 to-[#ffd24a]/70 text-black font-semibold border border-orange-400/60 shadow-sm backdrop-blur-md"
                >
                  {g.type.toUpperCase()}
                </Badge>
                <p className="text-xs text-zinc-400">
                  {compUnit === "ohm"
                    ? "Ω per component"
                    : compUnit === "uF"
                    ? "μF per component"
                    : "mH per component"}
                </p>
              </div>

              <Select
                value={g.type}
                onValueChange={(v) => changeGroupType(gi, v)}
              >
                <SelectTrigger className="w-32 cursor-pointer bg-black/70 border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                  <SelectItem
                    value="series"
                   className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md"
                  >
                    Series
                  </SelectItem>
                  <SelectItem
                    value="parallel"
                    className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md"
                  >
                    Parallel
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              {g.values.map((val, ri) => (
                <div key={ri} className="flex items-center gap-2">
                  <Input
                    value={val}
                    onChange={(e) => updateValue(gi, ri, e.target.value)}
                    type="number"
                    className="bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-600 focus:ring-1 focus:ring-orange-400"
                  />
                  <Button
                    variant="ghost"
                    onClick={() => removeComponent(gi, ri)}
                    className="p-1 border border-zinc-800 bg-red-500 text-black hover:bg-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => addComponent(gi)}
                className="flex-1 border border-zinc-800 cursor-pointer text-orange-400 hover:bg-black hover:text-orange-500"
              >
                <Plus className="w-4 h-4 mr-2" /> Add Component
              </Button>
              <Button
                variant="ghost"
                className="flex-1 border border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer"
                onClick={() => removeGroup(gi)}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Remove Group
              </Button>
            </div>
          </motion.div>
        ))}

        <div className="flex flex-wrap gap-3">
          <Button
            className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-semibold cursor-pointer"
            onClick={addGroup}
          >
            <Layers className="w-4 h-4 mr-2" /> Add Group
          </Button>
          <Button
            variant="ghost"
            className="flex-1 border border-zinc-800 text-zinc-300 hover:bg-black/80 hover:text-orange-400 cursor-pointer"
            onClick={() => {
              setComponents([{ type: "series", values: [1000, 2000] }]);
              toast("Reset groups");
            }}
          >
            <RotateCcw className="w-4 h-4 mr-2" /> Reset Groups
          </Button>
        </div>
      </div>

      {/* Display Section */}
      <div className="bg-black/70 border border-orange-500/30 text-white px-4 py-2 rounded-full shadow-inner flex flex-wrap gap-3 items-center justify-between text-xs">
        <span>
          Equivalent:{" "}
          <span className="text-[#ff9a4a] font-semibold">{eqDisplay}</span>
        </span>
        <span>•</span>
        <span>
          I<sub>sim</sub>:{" "}
          <span className="text-[#00ffbf] font-semibold">
            {round(Isim, 9)} A
          </span>
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <div className="flex flex-wrap gap-2">
          <Button
            className="px-4 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-semibold cursor-pointer"
            onClick={() => setRunning(true)}
          >
            <Play className="w-4 h-4 mr-2" /> Run
          </Button>
          <Button
            variant="outline"
            className="px-4 py-2 border-zinc-700 cursor-pointer text-orange-400 hover:bg-black hover:text-orange-500"
            onClick={() => setRunning(false)}
          >
            <Pause className="w-4 h-4 mr-2" /> Pause
          </Button>
        </div>

        <Button
          variant="ghost"
          className="border border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500
 cursor-pointer"
          onClick={exportCSV}
        >
          <Download className="w-4 h-4" />
        </Button>
      </div>
    </CardContent>
  </Card>
</motion.div>

          </div>

          {/* Visual + oscilloscope + steps */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border snapshot border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated flow • meters • oscilloscope • step-by-step</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{problemType}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vsup: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">R<sub>s</sub>: <span className="text-[#ffd24a] ml-1">{seriesResistance} Ω</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden space-y-4">
                  <SolverVisualizer compUnit={compUnit} components={components} Vsup={Number(Vsup)} history={history} running={running} manualI={manualCurrent} onComponentClick={onComponentClick} />
                </CardContent>
                </Card>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-5">
                    <SolverOscilloscope history={history} running={running} />
                    <div className="rounded-xl p-3 bg-black/70 border border-zinc-800 overflow-hidden">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold text-[#ffd24a]">Inspector & Summary</div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                          <div className="text-xs text-zinc-400">Equivalent</div>
                          <div className="text-lg font-semibold text-[#ff9a4a]">{eqDisplay}</div>
                        </div>

                        <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                          <div className="text-xs text-zinc-400">I<sub>sim</sub> (last)</div>
                          <div className="text-lg font-semibold text-[#00ffbf]">{round(Isim, 9)} A</div>
                        </div>

                        <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                          <div className="text-xs text-zinc-400">I<sub>used</sub></div>
                          <div className="text-lg font-semibold text-[#ffd24a]">{round(Iused, 9)} A</div>
                        </div>

                        <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                          <div className="text-xs text-zinc-400">Last Power</div>
                          <div className="text-lg font-semibold text-[#ff9a4a]">{round(history.length ? history[history.length - 1].P : 0, 8)} W</div>
                        </div>
                      </div>

                      <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm flex items-start gap-2">
                        <span className="text-orange-400"><Lightbulb /></span>
                        <span>Tip: Click a component on the visualizer to edit its value quickly.</span>
                      </div>
                    </div>
                  </div>
                
              
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36 }}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-8">
                  <SolverSteps problemType={problemType} components={components} compUnit={compUnit} seriesResistance={seriesResistance} Vsup={Number(Vsup)} eq={eq} />
                </div>

              </div>
            </motion.div>
          </div>
        </div>
      </main>

      {/* mobile sticky */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
