// src/pages/CodeReaderPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Activity,
  CircuitBoard,
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
  Code,
  FileText,
  CloudUpload,
  ZapOff,
} from "lucide-react";
import { Toaster, toast } from "sonner";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
   Utilities (same as before, improved)
   ============================ */
const toNum = (v) => {
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
};
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================
   Parser for "code" input
   Accepts:
   - JSON array of groups: [{type:'series', values:[10,20]}]
   - CSV: groupType,values... (one line per group)
   - Simple netlist-like lines:
       CAP series 10 20
       L PAR 5
       group series 10,20
   - simple component list, e.g.: "C: 10uF, 20uF" (units optional)
   Returns: { compType: 'capacitor'|'inductor'|'mixed', groups: [{type, values}] }
   ============================ */
function parseCodeToGroups(text) {
  if (!text || !text.trim()) return { compType: "capacitor", groups: [] };

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Try JSON first
  try {
    const maybe = JSON.parse(text);
    if (Array.isArray(maybe)) {
      // normalize objects
      const groups = maybe.map((g) => {
        if (!g) return { type: "series", values: [] };
        const type = g.type === "parallel" ? "parallel" : "series";
        const vals =
          Array.isArray(g.values) && g.values.length
            ? g.values.map((v) => parseUnitNumber(v))
            : [];
        return { type, values: vals.filter((n) => Number.isFinite(n)) };
      });
      // try detect compType based on units in values if they were strings (fallback)
      const compType = detectCompTypeFromText(text) || "capacitor";
      return { compType, groups };
    }
  } catch (e) {
    // not JSON — continue
  }

  // CSV or simple lines
  const groups = [];
  let detectedType = null;

  for (const raw of lines) {
    // common separators: comma, space, colon
    // formats:
    // - "series,10,20"
    // - "series 10 20"
    // - "C series 10uF 20uF"
    // - "CAP series 10 20"
    // - "parallel: 10,20"
    let s = raw.replace(/\s*,\s*/g, " ").replace(/\s*:\s*/g, " ").replace(/\t+/g, " ");
    const parts = s.split(/\s+/).filter(Boolean);
    if (!parts.length) continue;

    // detect explicit type tokens
    let type = null;
    let remaining = [];

    // tokens that indicate capacitor vs inductor
    const capTokens = ["c", "cap", "capacitance", "capacitor", "uf", "µf", "uf,"];
    const indTokens = ["l", "ind", "inductor", "mh", "h", "mH"];

    // If first token is 'series' or 'parallel'
    if (parts[0].toLowerCase() === "series" || parts[0].toLowerCase() === "s") {
      type = "series";
      remaining = parts.slice(1);
    } else if (parts[0].toLowerCase() === "parallel" || parts[0].toLowerCase() === "p") {
      type = "parallel";
      remaining = parts.slice(1);
    } else {
      // If first token is CAP or L or C1 etc
      const firstLower = parts[0].toLowerCase();
      if (firstLower.match(/^[cl]/) || capTokens.includes(firstLower) || indTokens.includes(firstLower)) {
        // Example: "C series 10 20" or "C 10 20" or "CAP series 10uF 20uF"
        if (parts.length > 1 && (parts[1].toLowerCase() === "series" || parts[1].toLowerCase() === "parallel")) {
          type = parts[1].toLowerCase() === "parallel" ? "parallel" : "series";
          remaining = parts.slice(2);
        } else {
          // assume series by default if not provided
          type = "series";
          remaining = parts.slice(1);
        }
      } else {
        // fallback: if line begins with "group" or "g", treat next as type
        if (parts[0].toLowerCase() === "group" && parts[1]) {
          type = parts[1].toLowerCase() === "parallel" ? "parallel" : "series";
          remaining = parts.slice(2);
        } else {
          // nothing explicit: assume series and treat all tokens as numbers
          type = "series";
          remaining = parts;
        }
      }
    }

    // Parse remaining tokens into numbers with unit support
    const values = remaining
      .map((tok) => parseUnitNumber(tok))
      .filter((n) => Number.isFinite(n));

    // detect compType from tokens like "uf" or "mh"
    for (const tok of parts) {
      const tl = tok.toLowerCase();
      if (tl.includes("uf") || tl.includes("µf") || tl.includes("pf") || tl.includes("nf")) detectedType = detectedType || "capacitor";
      if (tl.includes("mh") || tl.includes("h") || tl.includes("uh") || tl.includes("μh")) detectedType = detectedType || "inductor";
      if (tl.startsWith("c")) detectedType = detectedType || "capacitor";
      if (tl.startsWith("l")) detectedType = detectedType || "inductor";
    }

    groups.push({ type: type === "parallel" ? "parallel" : "series", values });
  }

  const compType = detectedType || detectCompTypeFromText(text) || "capacitor";
  return { compType, groups };
}

// detect component type heuristically from text (look for units)
function detectCompTypeFromText(text) {
  const t = String(text).toLowerCase();
  if (t.includes("uf") || t.includes("µf") || t.includes("pf") || t.includes("nf")) return "capacitor";
  if (t.includes("mh") || t.includes("uh") || t.includes("μh") || t.includes("h ")) return "inductor";
  // fallback: if many lines start with 'C' or 'L', check that
  const lines = t.split(/\r?\n/).map((l) => l.trim());
  let cCount = 0,
    lCount = 0;
  for (const l of lines) {
    if (/^\s*c/i.test(l)) cCount++;
    if (/^\s*l/i.test(l)) lCount++;
  }
  if (cCount > lCount) return "capacitor";
  if (lCount > cCount) return "inductor";
  return null;
}

/* parse numbers with units:
   supports: "10" -> 10
             "10u" or "10uF" or "10uf" -> 10 (units preserved by caller)
   We choose to return numeric raw values in user units (μF for capacitors, mH for inductors).
   Heuristics:
     - if token contains 'p' or 'pf' -> convert pF to μF (1e-6 * 1e-9? actually pF->μF: pF*1e-6)
       We'll convert everything to the user-friendly base:
         For capacitors: return μF
         For inductors: return mH
*/
function parseUnitNumber(tok) {
  if (tok == null) return NaN;
  const t = String(tok).trim().toLowerCase();
  if (t === "") return NaN;

  // straightforward numeric
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return Number(t);

  // patterns: number + unit
  const m = t.match(/^([+-]?\d*\.?\d+)\s*([a-zµμ]+)$/i);
  if (!m) {
    // try to strip trailing comma/semicolon
    const cleaned = t.replace(/[,;]+$/, "");
    const m2 = cleaned.match(/^([+-]?\d*\.?\d+)\s*([a-zµμ]+)$/i);
    if (!m2) return NaN;
    const v2 = Number(m2[1]);
    const u2 = m2[2];
    return unitToDisplay(v2, u2);
  }
  const val = Number(m[1]);
  const unit = m[2];

  return unitToDisplay(val, unit);
}

function unitToDisplay(value, unit) {
  const u = unit.toLowerCase();
  // capacitive units -> convert to μF
  if (u === "pf" || u === "p" || u === "p.f") return value * 1e-6; // pF -> μF: 1 pF = 1e-6 μF
  if (u === "nf" || u === "n") return value * 1e-3; // nF -> μF
  if (u === "uf" || u === "μf" || u === "µf" || u === "u") return value; // already μF
  if (u === "f") return value * 1e6; // farads -> μF

  // inductive units -> convert to mH
  if (u === "uh" || u === "μh" || u === "µh") return value * 1e3; // μH -> mH
  if (u === "mh" || u === "m") return value; // mH
  if (u === "h") return value * 1e3; // H -> mH

  // if unit unknown, attempt numeric parse
  const n = Number(String(value));
  return Number.isFinite(n) ? n : NaN;
}

/* ============================
   Simulation hook (improved / compact)
   - Accepts groups in user-units:
       capacitors: values in μF
       inductors: values in mH
   - Uses same step-response formulas but normalizes to SI inside.
   - Returns { history, eq } where eq is { totalReq (SI), groupReqs: [{ Req (SI), vals (raw) }], totalReqDisplay }
   ============================ */
function useComponentSim({
  running,
  timestep = 80,
  compType = "capacitor",
  groups = [{ type: "series", values: [10] }],
  Vsup = 12,
  seriesResistance = 10,
}) {
  const historyRef = useRef(Array.from({ length: 160 }, (_, i) => ({ t: i, P: 0, V: 0, I: 0, E: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // compute equivalent using SI internal representation
  const computeEquivalent = useCallback(
    (groupsLocal) => {
      if (!Array.isArray(groupsLocal) || groupsLocal.length === 0) return { totalReq: 0, groupReqs: [] };

      const toSI = (val) => {
        if (!Number.isFinite(val)) return NaN;
        return compType === "capacitor" ? val * 1e-6 : val * 1e-3;
      };

      const groupReqs = groupsLocal.map((g) => {
        const valsSI = (g.values || []).map((v) => toSI(Number(v)));
        if (compType === "capacitor") {
          if (g.type === "series") {
            let denom = 0;
            valsSI.forEach((c) => {
              if (Number.isFinite(c) && c > 0) denom += 1 / c;
            });
            const Ceq = denom > 0 ? 1 / denom : 0;
            return { Req: Ceq, valsSI, rawVals: g.values || [] };
          } else {
            const Ceq = valsSI.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
            return { Req: Ceq, valsSI, rawVals: g.values || [] };
          }
        } else {
          if (g.type === "series") {
            const Leq = valsSI.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
            return { Req: Leq, valsSI, rawVals: g.values || [] };
          } else {
            let denom = 0;
            valsSI.forEach((L) => {
              if (Number.isFinite(L) && L > 0) denom += 1 / L;
            });
            const Leq = denom > 0 ? 1 / denom : 0;
            return { Req: Leq, valsSI, rawVals: g.values || [] };
          }
        }
      });

      // combine groupReqs (groups as parallel branches)
      let totalReq = 0;
      if (compType === "capacitor") {
        totalReq = groupReqs.reduce((a, b) => a + (Number.isFinite(b.Req) ? b.Req : 0), 0);
      } else {
        let denom = 0;
        groupReqs.forEach((g) => {
          if (Number.isFinite(g.Req) && g.Req > 0) denom += 1 / g.Req;
        });
        totalReq = denom > 0 ? 1 / denom : 0;
      }

      return { totalReq, groupReqs };
    },
    [compType]
  );

  const computeInstant = useCallback(
    (tSeconds, totalReqSI) => {
      const R = Math.max(1e-6, seriesResistance);
      if (!Number.isFinite(totalReqSI) || totalReqSI <= 0) return { Vt: 0, It: 0, Pt: 0, energy: 0 };

      if (compType === "capacitor") {
        const C = totalReqSI;
        const tau = clamp(R * C, 1e-9, 1e9);
        const Vt = Vsup * (1 - Math.exp(-tSeconds / tau));
        const dVdt = (Vsup / tau) * Math.exp(-tSeconds / tau);
        const It = C * dVdt;
        const Pt = Vt * It;
        const energy = 0.5 * C * Vt * Vt;
        return { Vt, It, Pt, energy };
      } else {
        const L = totalReqSI;
        const tauL = clamp(L / R, 1e-9, 1e9);
        const Iinf = Vsup / R;
        const It = Iinf * (1 - Math.exp(-tSeconds / tauL));
        const dIdt = (Iinf / tauL) * Math.exp(-tSeconds / tauL);
        const Vl = L * dIdt;
        const Pt = Vl * It;
        const energy = 0.5 * L * It * It;
        return { Vt: Vl, It, Pt, energy };
      }
    },
    [compType, Vsup, seriesResistance]
  );

  const eq = useMemo(() => computeEquivalent(groups), [groups, computeEquivalent]);

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

      const totalReq = eq.totalReq;
      const { Vt, It, Pt, energy } = computeInstant(tSeconds, totalReq);

      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        next.push({ t: lastT + 1, P: Pt, V: Vt, I: It, E: energy });
        if (next.length > 720) next.shift();
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, computeInstant, eq.totalReq]);

  return { history, eq };
}

/* ============================
   VisualizerSVG (improved)
   - Uses eq.groupReqs for formatting
   - Supports prefers-reduced-motion fallback
   ============================ */
function VisualizerSVG({ compType, eq = { groupReqs: [] }, Vsup, history = [], running, manualI }) {
  const latest = history.length ? history[history.length - 1] : { P: 0, V: 0, I: 0, E: 0 };
  const ItSim = latest.I || 0;
  const ItUsed = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : ItSim;
  const Pt = latest.P || 0;
  const Et = latest.E || 0;

  // dot animation parameters scale with current magnitude (use ItUsed)
  const absI = Math.abs(ItUsed);
  const dotCount = clamp(Math.round(3 + absI * 6), 2, 18);
  const speed = clamp(1.6 / (absI + 0.01), 0.28, 4.5); // seconds per cycle

  const groupCount = Math.max(1, eq.groupReqs.length);
  const spacing = Math.max(110, Math.min(240, Math.floor(520 / Math.max(1, Math.min(groupCount, 6)))));
  const startX = 160;
  const svgWidth = Math.max(900, startX + spacing * groupCount + 160);
  const busStart = 100;
  const busEnd = svgWidth - 80;

  const prefersReduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const formatGroupReq = (grp) => {
    if (!grp) return "--";
    const reqSI = grp.Req;
    if (!Number.isFinite(reqSI) || reqSI === 0) return "--";
    if (compType === "capacitor") {
      return `${round(reqSI * 1e6, 6)} μF`;
    } else {
      return `${round(reqSI * 1e3, 6)} mH`;
    }
  };

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start flex-wrap justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">
              {compType === "capacitor" ? "Capacitance" : "Inductance"} Visualizer
            </div>
            <div className="text-xs text-zinc-400">Live • Interactive • Real-time</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">V<sub>sup</sub>: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I<sub>used</sub>: <span className="text-[#00ffbf] ml-1">{round(ItUsed, 9)} A</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">P (last): <span className="text-[#ff9a4a] ml-1">{round(Pt, 6)} W</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} 320`} preserveAspectRatio="xMidYMid meet" className="w-full h-64" role="img" aria-label="Circuit visualizer">
          {/* supply */}
          <g transform={`translate(${busStart - 60},160)`}>
            <rect x="-22" y="-36" width="44" height="72" rx="6" fill="#060606" stroke="#222" />
            <text x="-36" y="-46" fontSize="12" fill="#ffd24a">{Vsup} V</text>
          </g>

          {/* bus */}
          <path d={`M ${busStart} 160 H ${busEnd}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* groups placement */}
          {eq.groupReqs.map((g, i) => {
            const x = startX + i * spacing;
            const label = g && g.rawVals ? `${g.rawVals.length} comp` : "GROUP";
            const groupReqStr = formatGroupReq(g);

            return (
              <g key={`grp-${i}`}>
                <path d={`M ${x} 160 V 60`} stroke="#111" strokeWidth="6" strokeLinecap="round" />
                {(g.rawVals || []).map((v, idx) => {
                  const y = 80 + idx * 48;
                  const fill = compType === "capacitor" ? "#ffb86b" : "#ff6a9a";
                  const subLabel = compType === "capacitor" ? `${v} μF` : `${v} mH`;
                  return (
                    <g key={`cmp-${i}-${idx}`} transform={`translate(${x},${y})`} className="component-block">
                      <rect x="-28" y="-10" width="56" height="20" rx="6" fill="#0a0a0a" stroke="#222" />
                      <rect x="-22" y="-6" width="44" height="12" rx="4" fill={fill} opacity={0.95} />
                      <text x="-18" y="-16" fontSize="10" fill="#ffd24a">{subLabel}</text>
                    </g>
                  );
                })}

                <g transform={`translate(${x}, 40)`}>
                  <rect x="-48" y="-20" width="96" height="36" rx="8" fill="#060606" stroke="#222" />
                  <text x="-40" y="-6" fontSize="11" fill="#ff9a4a">{g.type ? g.type.toUpperCase() : "GROUP"}</text>
                  <text x="-40" y="12" fontSize="11" fill="#fff">{groupReqStr}</text>
                </g>

                {/* animated dots */}
                {!prefersReduced &&
                  Array.from({ length: dotCount }).map((_, di) => {
                    const pathStr = `M ${x} 60 V 160 H ${x + 24}`;
                    const delay = (di / dotCount) * speed;
                    const style = {
                      offsetPath: `path('${pathStr}')`,
                      animationName: compType === "capacitor" ? "flowCap" : "flowInd",
                      animationDuration: `${speed}s`,
                      animationTimingFunction: "linear",
                      animationDelay: `${-delay}s`,
                      animationIterationCount: "infinite",
                      animationPlayState: running ? "running" : "paused",
                      transformOrigin: "0 0",
                    };
                    const dotColor = absI >= 0 && ItUsed >= 0 ? "#ffd24a" : "#ff6a9a";
                    return <circle key={`dot-${i}-${di}`} r="4" fill={dotColor} style={style} />;
                  })}
              </g>
            );
          })}

          {/* readout */}
          <g transform={`translate(${svgWidth - 140},40)`}>
            <rect x="-80" y="-34" width="160" height="140" rx="10" fill="#060606" stroke="#222" />
            <text x="-70" y="-12" fontSize="12" fill="#ffb57a">Readouts</text>

            <text x="-70" y="8" fontSize="12" fill="#fff">V(t): <tspan fill="#ffd24a">{round(latest.V, 6)} V</tspan></text>
            <text x="-70" y="30" fontSize="12" fill="#fff">I(t): <tspan fill="#00ffbf">{round(ItSim, 9)} A</tspan></text>
            <text x="-70" y="52" fontSize="12" fill="#fff">P(t): <tspan fill="#ff9a4a">{round(latest.P, 8)} W</tspan></text>
            <text x="-70" y="74" fontSize="12" fill="#fff">E: <tspan fill="#9ee6ff">{round(latest.E, 8)}</tspan></text>
          </g>

          <style>{`
            @keyframes flowCap {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }
            @keyframes flowInd {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(-6px,6px) scale(0.82); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) {
              text { font-size: 9px; }
            }
          `}</style>
        </svg>
      </div>
    </div>
  );
}

/* ============================
   MultiOscilloscope (same as before)
   ============================ */
function MultiOscilloscope({ history = [], manualI, running }) {
  const data = history.slice(-360).map((d, idx) => {
    const I_sim = d.I || 0;
    const I_manual = Number.isFinite(Number(manualI)) && manualI !== "" ? Number(manualI) : null;
    const I_used = I_manual !== null ? I_manual : I_sim;
    const V = d.V || 0;
    const P_used = V * I_used;
    return {
      t: idx,
      V: round(V, 6),
      I_sim: round(I_sim, 9),
      I_used: round(I_used, 9),
      P: round(P_used, 8),
    };
  });

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — Voltage (V), Current (I), Power (P)</div>
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
            <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Voltage (V)" />
            <Line type="monotone" dataKey="I_used" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Current (A)" />
            <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="Power (W)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   CodeReaderPage (main)
   - Provides code input, parsing, sample presets, and visualizer
   ============================ */
export default function CodeReaderPage() {
  const [compType, setCompType] = useState("capacitor");
  const [Vsup, setVsup] = useState("12");
  const [running, setRunning] = useState(true);
  const [seriesResistance, setSeriesResistance] = useState("10");
  const [manualCurrent, setManualCurrent] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  // code input
  const [codeInput, setCodeInput] = useState(`// Sample formats:
[
  {"type":"series","values":[10,10]},
  {"type":"parallel","values":[20]}
]
// or simple:
C series 10uF 22uF
L parallel 4mH 10mH
`);
  // parsed groups
  const [groups, setGroups] = useState([{ type: "series", values: [10, 10] }, { type: "parallel", values: [20] }]);
  const [lastParsed, setLastParsed] = useState("");

  // parse on demand
  const onParse = useCallback(() => {
    try {
      const parsed = parseCodeToGroups(codeInput);
      if (!parsed.groups || parsed.groups.length === 0) {
        toast.error("No groups detected in input — try a different format or sample.");
        return;
      }
      setGroups(parsed.groups);
      setCompType(parsed.compType || compType);
      setLastParsed(new Date().toISOString());
      toast.success(`Parsed ${parsed.groups.length} group(s). Detected type: ${parsed.compType}`);
    } catch (e) {
      toast.error("Failed to parse input.");
      console.error(e);
    }
  }, [codeInput, compType]);

  // quick sample presets
  const loadSample = (which) => {
    if (which === "cap_series") {
      setCodeInput("C series 10uF 22uF 47uF");
    } else if (which === "ind_parallel") {
      setCodeInput("L parallel 4mH 10mH 2mH");
    } else if (which === "json") {
      setCodeInput(`[
  {"type":"series","values":[10,22]},
  {"type":"parallel","values":[47]}
]`);
    }
    toast.success("Sample loaded — press Parse");
  };

  const addGroup = () => setGroups((s) => [...s, { type: "series", values: [10] }]);
  const removeGroup = (gi) => setGroups((s) => s.filter((_, i) => i !== gi));
  const addComponent = (gi) => setGroups((s) => s.map((g, i) => (i === gi ? { ...g, values: [...g.values, 10] } : g)));
  const removeComponent = (gi, ri) => setGroups((s) => s.map((g, i) => (i === gi ? { ...g, values: g.values.filter((_, idx) => idx !== ri) } : g)));
  const updateValue = (gi, ri, v) => setGroups((s) => s.map((g, i) => (i === gi ? { ...g, values: g.values.map((val, idx) => (idx === ri ? (Number.isFinite(Number(v)) ? Number(v) : 0) : val)) } : g)));

  // simulation hook
  const { history, eq } = useComponentSim({
    running,
    timestep: 80,
    compType,
    groups,
    Vsup: Number.isFinite(Number(Vsup)) ? Number(Vsup) : 0,
    seriesResistance: Number.isFinite(Number(seriesResistance)) ? Number(seriesResistance) : 10,
  });

  // derived
  const totalEqUser = useMemo(() => {
    if (!eq || !Number.isFinite(eq.totalReq) || eq.totalReq === 0) return "--";
    if (compType === "capacitor") return `${round(eq.totalReq * 1e6, 6)} μF`;
    return `${round(eq.totalReq * 1e3, 6)} mH`;
  }, [eq, compType]);

  const IeqSim = history.length ? history[history.length - 1].I : 0;
  const IeqUsed = Number.isFinite(Number(manualCurrent)) && manualCurrent !== "" ? Number(manualCurrent) : IeqSim;

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetAll = () => {
    setCompType("capacitor");
    setVsup("12");
    setSeriesResistance("10");
    setGroups([{ type: "series", values: [10, 10] }, { type: "parallel", values: [20] }]);
    setManualCurrent("");
    setCodeInput("");
    toast.success("Reset done");
  };

  const exportCSV = () => {
    const rows = [
      ["t", "V_sim", "I_sim", "I_manual", "I_used", "P_used", "E_sim"],
      ...history.map((d, idx) => {
        const V = round(d.V, 9);
        const I_sim = round(d.I, 9);
        const I_manual = Number.isFinite(Number(manualCurrent)) && manualCurrent !== "" ? Number(manualCurrent) : "";
        const I_used = I_manual !== "" ? Number(I_manual) : I_sim;
        const P_used = round(V * I_used, 9);
        const E = round(d.E, 9);
        return [d.t, V, I_sim, I_manual, I_used, P_used, E];
      }),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codereader-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  // snapshot: copy parsed JSON to clipboard
  const snapshot = async () => {
    try {
      const payload = { compType, groups, Vsup, seriesResistance, manualCurrent, timestamp: Date.now() };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast.success("Snapshot copied to clipboard");
    } catch (e) {
      toast.error("Could not copy snapshot");
    }
  };

  useEffect(() => {
    // attempt automatic parse if codeInput changed drastically (but avoid annoying auto parses)
    // noop for now — user must press Parse to confirm
  }, [codeInput]);

  return (
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
            <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.36 }} className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-black" />
              </div>
              <div className="truncate">
                <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Capacitor & Inductor Code Reader</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-28 sm:w-36 md:w-44">
                <Select value={compType} onValueChange={(v) => setCompType(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Component" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="capacitor" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Capacitor (μF)</SelectItem>
                    <SelectItem value="inductor" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Inductor (mH)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={snapshot} title="Copy Snapshot">Snapshot</Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={toggleRunning} aria-label="Play / Pause" title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>

                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200" onClick={resetAll} aria-label="Reset Defaults" title="Reset Defaults">
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="md:hidden">
              <Button variant="ghost" className="border cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</Button>
            </div>
          </div>

          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="w-28 sm:w-36 md:w-44">
                  <Select value={compType} onValueChange={(v) => setCompType(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Component" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="capacitor" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Capacitor (μF)</SelectItem>
                      <SelectItem value="inductor" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Inductor (mH)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={snapshot}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16 sm:h-16" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Code Reader + Controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden w-full max-w-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Code className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Code Reader</div>
                        <div className="text-xs text-zinc-400">Paste netlist / JSON / CSV to auto-detect groups</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-400">Code Input</label>
                    <Textarea value={codeInput} onChange={(e) => setCodeInput(e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white h-36" placeholder="Paste a sample: JSON, CSV, or simple netlist lines (e.g., C series 10uF 22uF)" />
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Button className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={onParse}><FileText className="w-4 h-4 mr-2" /> Parse</Button>
                      <Button variant="ghost" className=" cursor-pointer border border-orange-500/50 text-orange-400 hover:text-orange-500" onClick={() => loadSample("cap_series")}>Load Cap Sample</Button>
                      <Button variant="ghost" className="border cursor-pointer border-orange-500/50 text-orange-400 hover:text-orange-500" onClick={() => loadSample("ind_parallel")}>Load Ind Sample</Button>
                      <Button variant="ghost" className="border cursor-pointer border-orange-500/50 text-orange-400 hover:text-orange-500" onClick={() => loadSample("json")}>Load JSON</Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
                    <Input value={Vsup} onChange={(e) => setVsup(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Series Resistance (Ω)</label>
                    <Input value={seriesResistance} onChange={(e) => setSeriesResistance(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Manual Current Input (A) — optional</label>
                    <Input value={manualCurrent} onChange={(e) => setManualCurrent(e.target.value)} placeholder="Leave empty to use simulated I" type="text" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    <div className="text-xs text-zinc-500 mt-1">If set, this current will be used to compute displayed power and oscilloscope traces.</div>
                  </div>

                  <div className="space-y-3">
                    {groups.map((g, gi) => (
                      <div key={gi} className="border border-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full shadow-sm">{g.type.toUpperCase()}</Badge>
                            <div className="text-xs text-zinc-400">Units: {compType === "capacitor" ? "μF" : "mH"}</div>
                          </div>

                          <Select value={g.type} onValueChange={(v) => setGroups((s) => s.map((gg, i) => (i === gi ? { ...gg, type: v } : gg)))}>
                            <SelectTrigger className="w-32 bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500 rounded-md shadow-sm">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                              <SelectItem value="series" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Series</SelectItem>
                              <SelectItem value="parallel" className="text-white hover:bg-orange-500/20 data-[highlighted]:text-orange-200 cursor-pointer data-[highlighted]:bg-orange-500/30 rounded-md">Parallel</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          {g.values.map((val, ri) => (
                            <div key={ri} className="flex items-center gap-2">
                              <Input value={val} onChange={(e) => updateValue(gi, ri, e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                              <div className="flex gap-1 ml-auto">
                                <Button variant="ghost" onClick={() => removeComponent(gi, ri)} className="p-1 border border-zinc-800 bg-red-500 cursor-pointer text-black hover:bg-red-600"><Trash2 className="w-4 h-4" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex gap-2">
                          <Button variant="outline" onClick={() => addComponent(gi)} className="flex-1 cursor-pointer bg-transparent border border-zinc-800 text-[#ffd24a] "><Plus className="w-4 h-4 mr-2" /> Add</Button>
                          <Button variant="ghost" className="border border-zinc-800 text-zinc-300 cursor-pointer" onClick={() => removeGroup(gi)}>Remove Group</Button>
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2">
                      <Button className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={addGroup}><Layers className="w-4 h-4 mr-2" /> Add Group</Button>
                      <Button variant="ghost" className="border border-zinc-800 text-zinc-300 cursor-pointer" onClick={() => { setGroups([{ type: "series", values: [10, 10] }]); toast("Reset groups"); }}>Reset Groups</Button>
                    </div>
                  </div>

                  <div className="bg-black/70 border border-orange-500/30 text-white px-3 py-2 rounded-full shadow-sm backdrop-blur-sm text-xs flex flex-wrap gap-2 items-center mt-2">
                    <span>Equivalent: <span className="text-[#ff9a4a] font-semibold">{totalEqUser}</span></span>
                    <span>•</span>
                    <span>I<sub>eq</sub>: <span className="text-[#00ffbf] font-semibold">{round(IeqUsed, 9)} A</span></span>
                    <span>•</span>
                    <span className="text-xs text-zinc-400">Last parse: {lastParsed || "—"}</span>
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

          {/* Right: Visual + Oscilloscope */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <CircuitBoard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Animated flow • meters • energy • oscilloscope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-2 sm:mt-0">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Mode: <span className="text-[#ffd24a] ml-1">{compType}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vsup: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">R<sub>s</sub>: <span className="text-[#ffd24a] ml-1">{seriesResistance} Ω</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden">
                  <VisualizerSVG compType={compType} eq={eq} Vsup={Number(Vsup)} history={history} running={running} manualI={manualCurrent} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full max-w-full">
                <MultiOscilloscope history={history} manualI={manualCurrent} running={running} />
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
                      <div className="text-xs text-zinc-400">Equivalent</div>
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{totalEqUser}</div>
                      <div className="text-xs text-zinc-400 mt-1">Ceq / Leq (converted)</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">I<sub>sim</sub> (last)</div>
                      <div className="text-lg font-semibold text-[#00ffbf] truncate">{round(IeqSim, 9)} A</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">I<sub>used</sub></div>
                      <div className="text-lg font-semibold text-[#ffd24a] truncate">{round(IeqUsed, 9)} A</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Last Power (sim)</div>
                      <div className="text-lg font-semibold text-[#ff9a4a] truncate">{round(history.length ? history[history.length - 1].P : 0, 8)} W</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Stored Energy</div>
                      <div className="text-lg font-semibold text-[#9ee6ff] truncate">{round(history.length ? history[history.length - 1].E : 0, 8)} J</div>
                    </div>
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Manual Current</div>
                      <div className="text-lg font-semibold text-[#ffd24a] truncate">{manualCurrent === "" ? "—" : `${manualCurrent} A`}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex items-start gap-2">
                    <span className="text-orange-400"><Lightbulb /></span>
                    <span>Tip: Paste JSON or simple netlist lines and press <span className="text-white font-semibold">Parse</span>. You can override current manually to see power computations instantly.</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile sticky */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border  border-zinc-800 text-zinc-300 p-2 cursor-pointer" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
