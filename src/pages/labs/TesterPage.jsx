// src/pages/TesterPage.jsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Gpu as  Circuits,
  Play,
  Pause,
  Zap,
  Cpu,
  Download,
  Settings,
  Menu,
  X,
  Search,
  Cpu as CpuChip,
  BatteryCharging,
  Grid,
  Usb,
  Thermometer,
  Eye,
  CircuitBoard,
  History,
  Clock,
  Network,
  Omega as Resistance,
  Lightbulb
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
const round = (v, p = 6) => {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/* ============================
   Device Simulation Hook
   - Produces history of { t, Vd, Id, Vc, Ic, Vgs, Ids, deviceState... }
   - Supports Diode, BJT (NPN families), MOSFET (n-ch) families
   ============================ */
function useTesterSim({
  running,
  timestep = 60,
  device = "diode",
  Vsup = 5,
  seriesR = 1000,
  mode = "fixed", // "fixed" or "sweep"
  sweep = { from: 0, to: 5, steps: 120, axis: "voltage" }, // simple sweep config
  control = {}, // device-specific params: for diode => {Is, n}, for bjt => {IbList}, for mosfet => {VgsList}
}) {
  const historyRef = useRef(Array.from({ length: 360 }, (_, i) => ({ t: i, V: 0, I: 0 })));
  const [history, setHistory] = useState(historyRef.current);

  const tRef = useRef(0);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(null);

  // simulation internal index for sweep
  const sweepIdxRef = useRef(0);
  const sweepDirRef = useRef(1);

  // basic diode model: Shockley diode equation
  const diodeIV = useCallback((Vd, { Is = 1e-12, n = 1 }) => {
    // Id = Is * (exp(Vd / (n*Vt)) - 1)
    const k = 1.380649e-23;
    const q = 1.602176634e-19;
    const T = 300; // K
    const Vt = (k * T) / q; // ~25.85 mV
    const expo = Math.exp(clamp(Vd / (n * Vt), -40, 40)); // clamp exponent for stability
    const Id = Is * (expo - 1);
    return { Id, Vd };
  }, []);

  // small transistor family generator (BJT NPN) - approximate exponential collector current for given base current & Vce saturation
  const bjtFamily = useCallback((Vce, Ib, { beta = 100, Vce_sat = 0.08 }) => {
    // simplification: Ic = beta * Ib * (1 - exp(-Vce / 0.02)) + knee
    const knee = 1e-12;
    const Ic_sat = beta * Ib;
    const Ic = clamp(Ic_sat * (1 - Math.exp(-Vce / 0.02)) + knee, 0, Ic_sat * 1.2);
    // Vc drop across resistor will be handled outside
    return { Ic, Vce };
  }, []);

  // MOSFET approximate Id-Vds families (triode + saturation simplified)
  const mosfetFamily = useCallback((Vds, Vgs, { k = 2e-3, Vth = 2.5 }) => {
    // k in A/V^2 for device sizing
    if (Vgs <= Vth) return { Id: 1e-12, Vds }; // cut-off
    const Vov = Vgs - Vth;
    const Vds_sat = Vov;
    if (Vds < Vds_sat) {
      // triode region: Id = k*( (Vgs-Vth)*Vds - Vds^2/2 )
      const Id = k * (Vov * Vds - 0.5 * Vds * Vds);
      return { Id: Math.max(Id, 0), Vds };
    } else {
      // saturation: Id = 0.5*k*(Vgs-Vth)^2
      const Id = 0.5 * k * Vov * Vov;
      return { Id: Math.max(Id, 0), Vds };
    }
  }, []);

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

      // compute target drive value (sweep or fixed)
      let driveV = typeof Vsup === "number" ? Vsup : Number(Vsup) || 0;
      if (mode === "sweep") {
        const { from, to, steps } = sweep;
        const idx = sweepIdxRef.current % Math.max(1, steps);
        const frac = idx / Math.max(1, steps - 1);
        driveV = from + (to - from) * frac;
        // advance sweep index slowly (one step per few frames)
        if ((tRef.current / timestep) % 2 < 1) {
          sweepIdxRef.current += sweepDirRef.current;
          if (sweepIdxRef.current >= steps - 1 || sweepIdxRef.current <= 0) {
            sweepDirRef.current *= -1;
          }
        }
      }

      // compute the device instantaneous IV depending on device type
      let Vnode = driveV;
      let I = 0;
      let extra = {};
      if (device === "diode") {
        // circuit: Vsup -> seriesR -> diode -> 0
        // solve approx: for given Vsup and R and diode model, iterate to find Vd s.t. Id = (Vsup - Vd)/R => Id = Is*(exp(Vd/Vt)-1)
        const { Is = 1e-12, n = 1 } = control || {};
        // simple Newton/iteration on Vd
        let Vd = Math.max(0, Math.min(Vnode, 0.8)); // start guess
        for (let i = 0; i < 24; ++i) {
          const { Id } = diodeIV(Vd, { Is, n });
          const f = Id - (Vnode - Vd) / Math.max(1e-9, seriesR);
          // derivative approx: dId/dVd = Is/(n*Vt)*exp(...)
          const kConst = 1.380649e-23;
          const q = 1.602176634e-19;
          const Vt = (kConst * 300) / q;
          const dIddV = Is * Math.exp(clamp(Vd / (n * Vt), -40, 40)) / (n * Vt);
          const df = dIddV + 1 / Math.max(1e-9, seriesR); // f' = dId/dVd + 1/R
          const dV = -f / df;
          Vd += clamp(dV, -0.1, 0.1);
          if (Math.abs(dV) < 1e-9) break;
        }
        const { Id } = diodeIV(Vd, control || {});
        I = Id;
        extra = { Vd, Id };
      } else if (device === "bjt") {
        // we model collector current via family curves for a set of base currents
        // circuit: Vsup -> Rc (seriesR) -> collector -> transistor -> emitter(0)
        // for simplicity, we assume base drive from control.Ib (or list) to generate family
        const IbList = control?.IbList?.length ? control.IbList : [1e-6, 5e-6, 1e-5];
        // choose an index based on sweepIdx (for display many curves) or use first if fixed
        const idx = Math.floor(((sweepIdxRef.current % Math.max(1, IbList.length)) / Math.max(1, IbList.length)) * IbList.length);
        const Ib = IbList[Math.min(idx, IbList.length - 1)];
        // compute Vce drop across R: Vc = Vsup - Ic*Rc => but Ic depends on Vce, so iterate on Vce
        let Vce = Math.max(0, Math.min(Vnode, Vnode));
        for (let i = 0; i < 24; ++i) {
          const { Ic } = bjtFamily(Vce, Ib, control || {});
          const Vc = Math.max(0, Vnode - Ic * seriesR);
          const newVce = Vc; // assuming emitter at 0
          const dV = newVce - Vce;
          Vce = Vce + clamp(dV, -0.1, 0.1);
          if (Math.abs(dV) < 1e-6) break;
        }
        const { Ic } = bjtFamily(Vce, Ib, control || {});
        I = Ic;
        extra = { Vce, Ic, IbList };
      } else if (device === "mosfet") {
        // circuit: Vsup -> Rd (seriesR) -> drain -> mosfet drain-source -> source(0)
        // control provides Vgs list; pick index based on sweep
        const VgsList = control?.VgsList?.length ? control.VgsList : [2.5, 3.5, 4.5];
        const idx = Math.floor(((sweepIdxRef.current % Math.max(1, VgsList.length)) / Math.max(1, VgsList.length)) * VgsList.length);
        const Vgs = VgsList[Math.min(idx, VgsList.length - 1)];
        // iterate on Vds to satisfy circuit: Id = f(Vds, Vgs); Vd = Vsup - Id*Rd => Vds = Vd
        let Vds = Math.max(0, Math.min(Vnode, Vnode));
        for (let i = 0; i < 24; ++i) {
          const { Id } = mosfetFamily(Vds, Vgs, control || {});
          const Vd = Math.max(0, Vnode - Id * seriesR);
          const newVds = Vd;
          const dV = newVds - Vds;
          Vds = Vds + clamp(dV, -0.2, 0.2);
          if (Math.abs(dV) < 1e-6) break;
        }
        const { Id } = mosfetFamily(Vds, Vgs, control || {});
        I = Id;
        extra = { Vds, Id, VgsList };
      }

      // push to history
      setHistory((h) => {
        const next = h.slice();
        const lastT = next.length ? next[next.length - 1].t : 0;
        const sample = {
          t: lastT + 1,
          V: round(typeof driveV === "number" ? driveV : Number(driveV), 6),
          I: round(I, 9),
          device,
          ts: Date.now(),
          extra,
        };
        next.push(sample);
        if (next.length > 1440) next.shift(); // keep a bounded buffer
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, timestep, device, Vsup, seriesR, mode, sweep, control, diodeIV, bjtFamily, mosfetFamily]);

  const families = useMemo(() => {
    // for display: produce arrays for multi-curve plots (e.g., different Ib or Vgs)
    if (device === "bjt") {
      return control?.IbList || [1e-6, 5e-6, 1e-5];
    } else if (device === "mosfet") {
      return control?.VgsList || [2.5, 3.5, 4.5];
    }
    return [];
  }, [device, control]);

  return { history, families };
}

/* ============================
   Visualizer SVG for Tester
   - Shows supply, series resistor, DUT symbol (diode, transistor, mosfet)
   - Animated current carriers (dots) whose density/speed depends on I
   ============================ */

// If you have global clamp/round utilities, they will be used; otherwise local fallbacks are provided.
const _clamp = typeof clamp === "function" ? clamp : (v, a, b) => Math.max(a, Math.min(b, v));
const _round = typeof round === "function" ? round : (v, p = 3) => {
  if (!Number.isFinite(v)) return v;
  const m = Math.pow(10, p);
  return Math.round(v * m) / m;
};

 function TesterVisualizerSVG({ device = "diode", Vsup = 5, seriesR = 1000, history = [], running = true }) {

  const _clamp = typeof clamp === "function" ? clamp : (v, a, b) => Math.max(a, Math.min(b, v));
  const _round = typeof round === "function" ? round : (v, p = 3) => {
  if (!Number.isFinite(v)) return v;
  const m = Math.pow(10, p);
  return Math.round(v * m) / m;
  };
  const latest = history.length ? history[history.length - 1] : { I: 0, V: 0, extra: {} };
  const I = latest.I ?? 0;
  const absI = Math.abs(I);
  // particle count scales with current magnitude (bounded)
  const dotCount = _clamp(Math.round(4 + absI * 12000), 4, 40);
  // speed slower for larger currents to make flow feel substantial
  const speed = _clamp(1.2 / (_clamp(absI, 1e-9, 1) + 0.02), 0.08, 4.5);

  const svgW = 980;
  const svgH = 280;
  const leftX = 110;
  const midX = svgW / 2;
  const rightX = svgW - 120;

  const carrierColor = absI > 1e-9 ? (I >= 0 ? "#ffd24a" : "#ff6a9a") : "#6b6b6b";
  const deviceLabel = device === "diode" ? "Diode (DUT)" : device === "bjt" ? "BJT NPN (DUT)" : "MOSFET N (DUT)";

  // Simple IV generators for paths (visual-only)
  function ivPointsDiode(w = 200, h = 120, steps = 120) {
    // V from -1 to +1.2 * Vsup (visual scale)
    const Vmin = -1;
    const Vmax = Math.max(1.2 * Vsup, 3);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const V = Vmin + (Vmax - Vmin) * t;
      // approximate diode exponential + series resistor effect ignored for shape
      const Is = 1e-6;
      const n = 1.8;
      const Ith = Is * (Math.exp(Math.max(0, V) / (n * 0.025)) - 1); // crude
      const y = h - Math.min(h, Math.log10(1 + Math.abs(Ith)) * (h / 3) + (V < 0 ? (0.5 * Math.abs(V)) : 0));
      const x = t * w;
      pts.push([x, y]);
    }
    return pts;
  }

  function ivPointsBJT(w = 200, h = 120, steps = 100) {
    // generate family curves for Ib = [1uA, 5uA, 20uA, 80uA]
    const IbSet = [1e-6, 5e-6, 2e-5, 8e-5];
    const fam = IbSet.map((Ib) => {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const Vce = t * (Vsup || 10);
        // simple transistor model: Ic = beta * Ib * (1 - exp(-Vce/Ve))
        const beta = 100 * (1 + Math.log10(1 + Ib * 1e6) * 0.2);
        const Ve = 0.6;
        const Ic = Math.max(0, beta * Ib * (1 - Math.exp(-Vce / Ve)));
        const x = t * w;
        const y = h - Math.min(h, Math.log10(1 + Ic) * (h / 0.9));
        pts.push([x, y]);
      }
      return { Ib, pts };
    });
    return fam;
  }

  function ivPointsMosfet(w = 220, h = 120, steps = 120) {
    // Vgs levels
    const VgsSet = [1, 2, 3, 4, 5].filter((v) => v <= Math.max(5, Vsup));
    const fam = VgsSet.map((Vgs) => {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const Vds = t * (Vsup || 10);
        // simple square-law model Id = k*(Vgs - Vth)^2 * for Vds > Vgs-Vth else linear
        const Vth = 1.2;
        const k = 0.02 * (1 + 0.15 * Vgs);
        let Id = 0;
        if (Vgs > Vth) {
          const Vov = Vgs - Vth;
          if (Vds < Vov) {
            Id = k * (2 * Vov * Vds - Vds * Vds);
          } else {
            Id = k * Vov * Vov;
          }
        } else {
          Id = 1e-9;
        }
        const x = t * w;
        const y = h - Math.min(h, Math.log10(1 + Id) * (h / 0.6));
        pts.push([x, y]);
      }
      return { Vgs, pts };
    });
    return fam;
  }

  // convert points to SVG path string with nice smoothing
  function pathFromPoints(pts) {
    if (!pts || pts.length === 0) return "";
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${_round(p[0], 2)} ${_round(p[1], 2)}`).join(" ");
    return d;
  }

  // choose IV data per device for the little plot
  let plotOverlay = null;
  if (device === "diode") {
    const pts = ivPointsDiode(260, 120, 160);
    plotOverlay = (
      <g transform={`translate(${midX - 500}, ${svgH - 90})`} aria-hidden="false">
        <rect x="-10" y="-12" width="280" height="144" rx="10" fill="#060607" stroke="#111" />
        <text x="8" y="10" fill="#ffd24a" fontSize="12">I–V: Diode (approx.)</text>
        <g transform="translate(10,28)">
          <path d={pathFromPoints(pts)} stroke="#ffb84a" strokeWidth="2.2" fill="none" filter="url(#glow)" />
          <text x="6" y="116" fontSize="10" fill="#9aa">V</text>
          <text x="250" y="6" fontSize="10" fill="#9aa">I (log)</text>
        </g>
      </g>
    );
  } else if (device === "bjt") {
    const fam = ivPointsBJT(260, 120, 160);
    plotOverlay = (
      <g transform={`translate(${midX - 500}, ${svgH - 90})`} >
        <rect x="-10" y="-12" width="280" height="144" rx="10" fill="#060607" stroke="#111" />
        <text x="8" y="10" fill="#ffd24a" fontSize="12">Ic – Vce Families (Ib stepping)</text>
        <g transform="translate(10,28)">
          {fam.map((f, idx) => (
            <path key={idx} d={pathFromPoints(f.pts)} stroke={`rgba(255, ${140 + idx * 20}, 120, ${0.95 - idx * 0.12})`} strokeWidth={1.8 + idx * 0.2} fill="none" filter="url(#glow)" />
          ))}
          <text x="6" y="116" fontSize="10" fill="#9aa">VCE</text>
          <text x="240" y="6" fontSize="10" fill="#9aa">IC (log)</text>
        </g>
      </g>
    );
  } else {
    const fam = ivPointsMosfet(260, 120, 160);
    plotOverlay = (
      <g transform={`translate(${midX-500}, ${svgH -90})`} >
        <rect x="-10" y="-12" width="280" height="144" rx="10" fill="#060607" stroke="#111" />
        <text x="8" y="10" fill="#ffd24a" fontSize="12">Id – Vds Families (Vgs sweep)</text>
        <g transform="translate(10,28)">
          {fam.map((f, idx) => (
            <path key={idx} d={pathFromPoints(f.pts)} stroke={`rgba(${140 + idx * 18}, 120, 255, ${0.92 - idx * 0.12})`} strokeWidth={1.6} fill="none" filter="url(#glow)" />
          ))}
          <text x="6" y="116" fontSize="10" fill="#9aa">VDS</text>
          <text x="240" y="6" fontSize="10" fill="#9aa">ID (log)</text>
        </g>
      </g>
    );
  }

  // carrier path for particles: smoother bezier along circuit
  const particlePath = `M ${leftX} ${svgH / 2} C ${midX - 80} ${svgH / 2 - 50}, ${midX + 80} ${svgH / 2 - 50}, ${midX + 120} ${svgH / 2} T ${rightX} ${svgH / 2}`;

  // helper to format current prettily
  const formatCurrent = (val) => {
    if (!Number.isFinite(val)) return "—";
    if (Math.abs(val) >= 1) return `${_round(val, 3)} A`;
    if (Math.abs(val) >= 1e-3) return `${_round(val * 1e3, 3)} mA`;
    if (Math.abs(val) >= 1e-6) return `${_round(val * 1e6, 3)} µA`;
    return `${_round(val * 1e9, 3)} nA`;
  };

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/50 to-zinc-900/10 border border-zinc-800 overflow-hidden">
      <div className="flex items-start flex-wrap justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Activity/>
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Tester Visualizer</div>
            <div className="text-xs text-zinc-400">IV families • Animated carriers • Futuristic circuit HUD</div>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <div className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-xs">V<sub>sup</sub>: <span className="text-[#ffd24a] ml-1">{Vsup} V</span></div>
          <div className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-xs">R<sub>s</sub>: <span className="text-[#ffd24a] ml-1">{seriesR} Ω</span></div>
          <div className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-xs">I: <span className="text-[#00ffbf] ml-1">{formatCurrent(I)}</span></div>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-72">
          <defs>
            <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <linearGradient id="lineGrad" x1="0" x2="1">
              <stop offset="0%" stopColor="#ffd24a" />
              <stop offset="50%" stopColor="#ff7a2d" />
              <stop offset="100%" stopColor="#ff6a9a" />
            </linearGradient>
            <linearGradient id="wireGrad" x1="0" x2="1">
              <stop offset="0%" stopColor="#00eaff" />
              <stop offset="100%" stopColor="#8f6fff" />
            </linearGradient>
            <radialGradient id="nodeGrad" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#fff" stopOpacity="1"/>
              <stop offset="40%" stopColor="#ffd24a" stopOpacity="0.9"/>
              <stop offset="100%" stopColor="#000" stopOpacity="0"/>
            </radialGradient>
          </defs>

          {/* background HUD grid */}
          <rect x="0" y="0" width={svgW} height={svgH} fill="url(#bg)" style={{ fill: "#050507" }} />
          <g opacity="0.06">
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={i} x1="0" y1={i * 24 + 8} x2={svgW} y2={i * 24 + 8} stroke="#0f1113" strokeWidth="1" />
            ))}
          </g>

          {/* SUPPLY block */}
          <g transform={`translate(${leftX - 60}, ${svgH / 2})`} aria-label="Supply">
            <rect x="-28" y="-36" width="56" height="72" rx="10" fill="#060607" stroke="#111" />
            <text x="-36" y="-48" fontSize="12" fill="#ffd24a">{Vsup}V</text>
            <text x="-36" y="54" fontSize="10" fill="#9aa">SUPPLY</text>
          </g>

          {/* supply -> Rs wire */}
          <path d={`M ${leftX} ${svgH/2} H ${midX - 80}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* Rs stylized: glass/resistor capsule */}
          <g transform={`translate(${midX - 80}, ${svgH/2})`} aria-label="Series resistor">
            <rect x="-14" y="-22" width="28" height="44" rx="8" fill="#0b0b0b" stroke="#222" />
            <text x="40" y="6" fontSize="11" fill="#ff9a4a">R<sub>s</sub> {seriesR}Ω</text>
            {/* zig-zag hint */}
            <path d="M -40 -0 L -28 -6 L -18 6 L -8 -6 L 2 6 L 12 -6 L 22 0" stroke="#2b2b2b" strokeWidth="2" fill="none" transform="translate(-6,-10) scale(1.05)" />
          </g>

          {/* wire to device */}
          <path d={`M ${midX - 60} ${svgH/2} C ${midX - 20} ${svgH/2 - 36}, ${midX + 20} ${svgH/2 - 36}, ${midX + 60} ${svgH/2}`} stroke="#111" strokeWidth="4" fill="none" />

          {/* Device region */}
          <g transform={`translate(${midX + 60}, ${svgH/2})`} aria-label="Device area">
            <rect x="-86" y="-64" width="172" height="128" rx="12" fill="#060607" stroke="#111" />
            <text x="-70" y="-44" fontSize="12" fill="#ffd24a">{deviceLabel}</text>

            {/* Device symbols: stylized and neon */}
            {device === "diode" && (
              <g transform="translate(0,4)">
                <polygon points="-28,-18 8,0 -28,18" fill="#0a0a0a" stroke="#222" />
                <rect x="8" y="-18" width="8" height="36" rx="2" fill="url(#lineGrad)" filter="url(#glow)" />
                <text x="-60" y="42" fontSize="10" fill="#9aa">DUT: Diode (anode → cat.)</text>
              </g>
            )}

            {device === "bjt" && (
              <g transform="translate(0,4)">
                {/* collector at top, emitter bottom, base left */}
                <path d="M 18 -28 L 18 28" stroke="#ffd24a" strokeWidth="3" />
                <path d="M -18 -4 L 18 -4 L 10 12" fill="url(#lineGrad)" opacity="0.95" stroke="#222" strokeWidth="0.6" />
                <circle cx="-28" cy="-4" r="6" fill="#0f0f0f" stroke="#222" />
                <text x="-60" y="42" fontSize="10" fill="#9aa">NPN: C (top) B (left) E (bottom)</text>
              </g>
            )}

            {device === "mosfet" && (
              <g transform="translate(0,4)">
                <rect x="-36" y="-24" width="22" height="48" rx="4" fill="#0a0a0a" stroke="#222" />
                <rect x="-8" y="-28" width="44" height="8" rx="3" fill="url(#wireGrad)" filter="url(#glow)" />
                <path d="M 16 -8 L 36 -16" stroke="#ffd24a" strokeWidth="2" />
                <text x="-60" y="42" fontSize="10" fill="#9aa">MOSFET: gate(top) drain(right) source(bottom)</text>
              </g>
            )}
          </g>

          {/* wire to right ground/load */}
          <path d={`M ${midX + 140} ${svgH/2} H ${rightX}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* ground symbol */}
          <g transform={`translate(${rightX}, ${svgH/2})`} aria-label="Ground">
            <path d="M 0 10 L -12 10" stroke="#222" strokeWidth="4" />
            <path d="M -8 18 L 8 18" stroke="#222" strokeWidth="4" />
            <text x="-40" y="40" fontSize="10" fill="#9aa">GND</text>
          </g>

          {/* carrier particles flowing along particlePath */}
          {Array.from({ length: dotCount }).map((_, idx) => {
            const delay = (idx / dotCount) * speed;
            const size = 2.5 + (idx % 3) * 0.9;
            return (
              <circle
                key={idx}
                r={size}
                fill={carrierColor}
                style={{
                  offsetPath: `path('${particlePath}')`,
                  animationName: 'flowParticles',
                  animationDuration: `${speed}s`,
                  animationTimingFunction: 'linear',
                  animationDelay: `-${delay}s`,
                  animationIterationCount: 'infinite',
                  animationPlayState: running ? 'running' : 'paused',
                  filter: 'url(#glow)'
                }}
              />
            );
          })}

          {/* little node glows */}
          <circle cx={leftX} cy={svgH / 2} r="5" fill="url(#nodeGrad)" />
          <circle cx={midX} cy={svgH / 2} r="5" fill="url(#nodeGrad)" />
          <circle cx={rightX} cy={svgH / 2} r="5" fill="url(#nodeGrad)" />

          {/* readouts panel */}
          <g transform={`translate(${svgW - 240}, 20)`}>
            <rect x="-8" y="-10" width="220" height="120" rx="10" fill="#060607" stroke="#111" />
            <text x="6" y="6" fontSize="12" fill="#ffb57a">Readouts</text>
            <text x="6" y="30" fontSize="12" fill="#fff">Vdrive: <tspan fill="#ffd24a">{_round(latest.V ?? 0, 6)} V</tspan></text>
            <text x="6" y="52" fontSize="12" fill="#fff">I: <tspan fill="#00ffbf">{formatCurrent(I)}</tspan></text>
            {device === "diode" && latest.extra?.Vd !== undefined && <text x="6" y="74" fontSize="12" fill="#fff">Vd: <tspan fill="#ff9a4a">{_round(latest.extra.Vd, 6)} V</tspan></text>}
            {device === "bjt" && latest.extra?.Vce !== undefined && <text x="6" y="74" fontSize="12" fill="#fff">Vce: <tspan fill="#ff9a4a">{_round(latest.extra.Vce, 6)} V</tspan></text>}
            {device === "mosfet" && latest.extra?.Vds !== undefined && <text x="6" y="74" fontSize="12" fill="#fff">Vds: <tspan fill="#ff9a4a">{_round(latest.extra.Vds, 6)} V</tspan></text>}
          </g>

          {/* little animated legend for conduction */}
          <g transform={`translate(${midX - 40}, ${svgH/2 - 110})`}>
            <rect x="-120" y="-18" width="240" height="36" rx="8" fill="#060607" stroke="#111" />
            <text x="-108" y="6" fontSize="11" fill="#9aa">Mode: <tspan fill="#ffd24a">{device.toUpperCase()}</tspan></text>
            <text x="40" y="6" fontSize="11" fill="#9aa">Status: <tspan fill={absI > 1e-9 ? "#00ffbf" : "#9aa"}>{absI > 1e-9 ? "Conducting" : "Idle"}</tspan></text>
          </g>

          {/* overlayed I–V plot (per device) */}
          {plotOverlay}

          {/* CSS animations */}
          <style>{`
            @keyframes flowParticles {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.92); }
              40% { opacity: 0.9; transform: translate(0,0) scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }

            /* tiny breathing glow for node */
            @keyframes nodePulse {
              0% { opacity: 0.45; transform: scale(1); }
              50% { opacity: 0.9; transform: scale(1.12); }
              100% { opacity: 0.45; transform: scale(1); }
            }

            circle[fill="url(#nodeGrad)"] { animation: nodePulse 2.8s ease-in-out infinite; }

          `}</style>
        </svg>
      </div>
    </div>
  );
}


/* ============================
   Oscilloscope Component
   - plots V (drive) and I (device) over time (last N points)
   ============================ */
function TesterOscilloscope({ history = [], running }) {
  const data = history.slice(-720).map((d, idx) => {
    return {
      t: idx,
      V: d.V || 0,
      I: d.I || 0,
    };
  });

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-orange-400">Oscilloscope — Voltage & Current</div>
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
            <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Current (A)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================
   Main Tester Page
   ============================ */
export default function TesterPage() {
  // UI state
  const [device, setDevice] = useState("diode"); // diode | bjt | mosfet
  const [Vsup, setVsup] = useState("5");
  const [seriesR, setSeriesR] = useState("1000");
  const [running, setRunning] = useState(true);
  const [mode, setMode] = useState("fixed"); // fixed | sweep
  const [sweepFrom, setSweepFrom] = useState("0");
  const [sweepTo, setSweepTo] = useState("5");
  const [sweepSteps, setSweepSteps] = useState("120");
  const [mobileOpen, setMobileOpen] = useState(false);

  // device-specific controls
  const [diodeIs, setDiodeIs] = useState("1e-12");
  const [diodeN, setDiodeN] = useState("1");
  const [bjtIbList, setBjtIbList] = useState("1e-6,5e-6,1e-5");
  const [mosVgsList, setMosVgsList] = useState("2.5,3.5,4.5");

  // simulate
  const control = useMemo(() => {
    if (device === "diode") {
      return { Is: toNum(diodeIs) || 1e-12, n: toNum(diodeN) || 1 };
    } else if (device === "bjt") {
      const list = (bjtIbList || "")
        .split(",")
        .map((s) => toNum(s))
        .filter((x) => Number.isFinite(x) && x > 0);
      return { IbList: list.length ? list : [1e-6, 5e-6, 1e-5], beta: 100 };
    } else if (device === "mosfet") {
      const list = (mosVgsList || "")
        .split(",")
        .map((s) => toNum(s))
        .filter((x) => Number.isFinite(x));
      return { VgsList: list.length ? list : [2.5, 3.5, 4.5], Vth: 2.5, k: 2e-3 };
    }
    return {};
  }, [device, diodeIs, diodeN, bjtIbList, mosVgsList]);

  const sweep = useMemo(
    () => ({
      from: toNum(sweepFrom) || 0,
      to: toNum(sweepTo) || 5,
      steps: Math.max(2, Math.floor(Math.abs(toNum(sweepSteps) || 120))),
    }),
    [sweepFrom, sweepTo, sweepSteps]
  );

  const { history, families } = useTesterSim({
    running,
    timestep: 60,
    device,
    Vsup: Number.isFinite(Number(Vsup)) ? Number(Vsup) : 0,
    seriesR: Number.isFinite(Number(seriesR)) ? Number(seriesR) : 1000,
    mode,
    sweep,
    control,
  });

  const latest = history.length ? history[history.length - 1] : { V: 0, I: 0, extra: {} };

  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Simulation resumed" : "Simulation paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setDevice("diode");
    setVsup("5");
    setSeriesR("1000");
    setDiodeIs("1e-12");
    setDiodeN("1");
    setBjtIbList("1e-6,5e-6,1e-5");
    setMosVgsList("2.5,3.5,4.5");
    setMode("fixed");
    setSweepFrom("0");
    setSweepTo("5");
    setSweepSteps("120");
    toast("Reset to defaults");
  };

  const exportCSV = () => {
    const rows = [
      ["t", "Vdrive", "I", "device", "extraJSON"],
      ...history.map((d) => [d.t, d.V, d.I, d.device || device, JSON.stringify(d.extra || {})]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tester-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  return (
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.18)_1px,transparent_1px)] bg-[length:22px_22px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

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
                <div className="text-xs sm:text-sm md:text-sm text-zinc-400 -mt-0.5 truncate">Diode & Transistor Tester</div>
              </div>
            </motion.div>

            <div className="hidden md:flex items-center gap-4">
              <div className="w-40">
                <Select value={device} onValueChange={(v) => setDevice(v)}>
                  <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 focus:border-orange-400 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                    <SelectValue placeholder="Device" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                    <SelectItem value="diode"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Diode</SelectItem>
                    <SelectItem value="bjt"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">BJT (NPN)</SelectItem>
                    <SelectItem value="mosfet"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">MOSFET (n-channel)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200" onClick={() => toast.success("Snapshot saved")} title="Save Snapshot">Snapshot</Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400" onClick={toggleRunning} aria-label="Play / Pause" title={running ? "Pause" : "Play"}>
                  {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400" onClick={resetDefaults} aria-label="Reset" title="Reset Defaults">
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="md:hidden flex">
              <Button variant="ghost" className="border   text-orange-400 cursor-pointer border-zinc-800 p-2 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile slide-down */}
          <div className={`md:hidden transition-all duration-300 overflow-hidden ${mobileOpen ? "max-h-60 py-3" : "max-h-0"}`}>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-row gap-2">
                <div className="w-28">
                  <Select value={device} onValueChange={(v) => setDevice(v)}>
                    <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-orange-100 focus:border-orange-400 text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-2 focus:ring-orange-500">
                      <SelectValue placeholder="Device" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
                      <SelectItem value="diode"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">Diode</SelectItem>
                      <SelectItem value="bjt"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">BJT (NPN)</SelectItem>
                      <SelectItem value="mosfet"       className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md">MOSFET (n-channel)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md" onClick={() => toast.success("Snapshot saved")}>Snapshot</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer text-xs py-2 rounded-md" onClick={toggleRunning}>{running ? "Pause" : "Play"}</Button>
                <Button variant="ghost" className="flex-1 border cursor-pointer text-xs py-2 rounded-md" onClick={resetDefaults}>Reset</Button>
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
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Tester Controls</div>
                        <div className="text-xs text-zinc-400">Select device, bias & simulation mode</div>
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
                      <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
                      <Input value={Vsup} onChange={(e) => setVsup(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Series Resistance (Ω)</label>
                      <Input value={seriesR} onChange={(e) => setSeriesR(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Simulation Mode</label>
                      <div className="flex gap-2 mt-2">
                        <Button variant={mode === "fixed" ? undefined : "ghost"} className={`flex-1 ${mode === "fixed" ? "cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" : "cursor-pointer border border-zinc-800 text-zinc-300"}`} onClick={() => setMode("fixed")}>Fixed</Button>
                        <Button variant={mode === "sweep" ? undefined : "ghost"} className={`flex-1 ${mode === "sweep" ? "cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" : "cursor-pointer border border-zinc-800 text-zinc-300"}`} onClick={() => setMode("sweep")}>Sweep</Button>
                      </div>
                    </div>

                    {mode === "sweep" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-zinc-400">From (V)</label>
                          <Input value={sweepFrom} onChange={(e) => setSweepFrom(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400">To (V)</label>
                          <Input value={sweepTo} onChange={(e) => setSweepTo(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400">Steps</label>
                          <Input value={sweepSteps} onChange={(e) => setSweepSteps(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                        </div>
                        <div className="text-xs text-zinc-500 flex items-center">Sweep axis: Voltage</div>
                      </div>
                    )}
                  </div>

                  {/* device-specific editors */}
                  <div className="space-y-3">
                    {device === "diode" && (
                      <div className="border border-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Diode</Badge>
                            <div className="text-xs text-zinc-400">Shockley parameters</div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-zinc-400">Saturation current Is (A)</label>
                            <Input value={diodeIs} onChange={(e) => setDiodeIs(e.target.value)} type="text" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400">Ideality factor n</label>
                            <Input value={diodeN} onChange={(e) => setDiodeN(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                          </div>
                        </div>
                      </div>
                    )}

                    {device === "bjt" && (
                      <div className="border border-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">BJT</Badge>
                            <div className="text-xs text-zinc-400">Base drive list (A) comma-separated</div>
                          </div>
                        </div>
                        <div>
                          <Input value={bjtIbList} onChange={(e) => setBjtIbList(e.target.value)} type="text" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                          <div className="text-xs text-zinc-500 mt-1">Example: 1e-6,5e-6,1e-5</div>
                        </div>
                      </div>
                    )}

                    {device === "mosfet" && (
                      <div className="border border-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">MOSFET</Badge>
                            <div className="text-xs text-zinc-400">Vgs list (V) comma-separated</div>
                          </div>
                        </div>
                        <div>
                          <Input value={mosVgsList} onChange={(e) => setMosVgsList(e.target.value)} type="text" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                          <div className="text-xs text-zinc-500 mt-1">Example: 2.5,3.5,4.5</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1  bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
                    <Button variant="outline" className="flex-1 border-zinc-700 text-black cursor-pointer" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div className="text-xs text-zinc-400">Latest I: <span className="text-[#00ffbf] ml-1">{latest ? (Number.isFinite(latest.I) ? latest.I.toExponential(3) : "—") : "—"}</span></div>
                    <div className="flex gap-2">
                      <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300 p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Visual + Oscilloscope */}
          <div className="lg:col-span-8 space-y-6">
  {/* === INTERACTIVE TESTER PANEL === */}
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.32 }}
  >
    <Card className="bg-gradient-to-br from-black/80 via-zinc-900/60 to-black/80 border border-zinc-800 rounded-2xl w-full shadow-md hover:shadow-lg hover:shadow-[#ff7a2d]/10 transition-all duration-300">
      <CardHeader>
        <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-wrap">
          {/* Left section */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center shadow-inner">
              <CircuitBoard className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-[#ffd24a]">
                Interactive Tester
              </div>
              <div className="text-xs text-zinc-400">
                Real-time IV Curves • Oscilloscope • Dynamic Families
              </div>
            </div>
          </div>

          {/* Device status badges */}
          <div className="flex items-center flex-wrap gap-2">
            <Badge className="bg-black/70 border border-[#ff7a2d]/40 text-[#ffd24a] px-3 py-1 rounded-full text-xs flex items-center gap-1">
              <Cpu className="w-3 h-3" /> Device:
              <span className="text-white font-medium ml-1">{device}</span>
            </Badge>
            <Badge className="bg-black/70 border border-[#ff7a2d]/40 text-[#ffd24a] px-3 py-1 rounded-full text-xs flex items-center gap-1">
              <Activity className="w-3 h-3" /> Mode:
              <span className="text-white font-medium ml-1">{mode}</span>
            </Badge>
            <Badge className="bg-black/70 border border-[#ff7a2d]/40 text-[#ffd24a] px-3 py-1 rounded-full text-xs flex items-center gap-1">
              <History className="w-3 h-3" /> History:
              <span className="text-white font-medium ml-1">{history.length}</span>
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-4">
        <TesterVisualizerSVG
          device={device}
          Vsup={Number(Vsup)}
          seriesR={Number(seriesR)}
          history={history}
          running={running}
        />
      </CardContent>
    </Card>
  </motion.div>

  {/* === OSCILLOSCOPE SECTION === */}
  <div className="grid grid-cols-1 gap-4">
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl overflow-hidden border border-zinc-800 bg-black/70"
    >
      <TesterOscilloscope history={history} running={running} />
    </motion.div>
  </div>

  {/* === SUMMARY PANEL === */}
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
  >
    <Card className="bg-gradient-to-br from-black/80 via-zinc-900/60 to-black/80 border border-zinc-800 rounded-2xl shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[#ffd24a]">
          <Cpu className="w-5 h-5" />
          Summary
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Drive Voltage */}
          <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 hover:border-[#ff7a2d]/40 transition-all">
            <div className="text-xs text-zinc-400 flex items-center gap-1">
              <BatteryCharging className="w-3 h-3 text-[#ff7a2d]" /> Drive Voltage
            </div>
            <div className="text-lg font-semibold text-[#ff9a4a] mt-1">
              {round(latest.V, 6)} V
            </div>
            <div className="text-xs text-zinc-500">
              Applied to series resistor & DUT
            </div>
          </div>

          {/* Measured Current */}
          <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 hover:border-[#00ffbf]/40 transition-all">
            <div className="text-xs text-zinc-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-[#00ffbf]" /> Measured Current
            </div>
            <div className="text-lg font-semibold text-[#00ffbf] mt-1">
              {latest.I ? latest.I.toExponential(3) : "—"}
            </div>
          </div>

          {/* Last Sample Time */}
          <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 hover:border-[#9ee6ff]/40 transition-all">
            <div className="text-xs text-zinc-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#9ee6ff]" /> Last Sample Time
            </div>
            <div className="text-lg font-semibold text-[#9ee6ff] mt-1">
              {latest.ts ? new Date(latest.ts).toLocaleTimeString() : "—"}
            </div>
          </div>

          {/* Families */}
          <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 hover:border-[#ffd24a]/40 transition-all">
            <div className="text-xs text-zinc-400 flex items-center gap-1">
              <Network className="w-3 h-3 text-[#ffd24a]" /> Families
            </div>
            <div className="text-lg font-semibold text-[#ffd24a] mt-1">
              {families ? families.length : 0}
            </div>
          </div>

          {/* Series Resistance */}
          <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 hover:border-[#ff7a2d]/40 transition-all">
            <div className="text-xs text-zinc-400 flex items-center gap-1">
              <Resistance className="w-3 h-3 text-[#ff7a2d]" /> Series Resistance
            </div>
            <div className="text-lg font-semibold text-[#ff9a4a] mt-1">
              {seriesR} Ω
            </div>
          </div>

          {/* Device Parameters */}
          <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800 hover:border-[#ffd24a]/40 transition-all">
            <div className="text-xs text-zinc-400 flex items-center gap-1">
              <Settings className="w-3 h-3 text-[#ffd24a]" /> Device Parameters
            </div>
            <div className="text-xs text-zinc-300 mt-1 break-words">
              {device === "diode"
                ? `Is=${diodeIs}, n=${diodeN}`
                : device === "bjt"
                ? `IbList=${bjtIbList}`
                : `VgsList=${mosVgsList}`}
            </div>
          </div>
        </div>

        {/* Tip Box */}
        <div className="mt-4 text-xs sm:text-sm bg-black/70 border border-orange-500/30 text-orange-300 px-3 py-2 rounded-md shadow-sm backdrop-blur-sm flex flex-row items-start gap-2">
          <Lightbulb className="w-4 h-4 text-[#ffd24a] flex-shrink-0" />
          <span>
            Tip: Use <span className="text-white font-semibold">Sweep</span> mode to visualize IV families.
            Adjust parameters to observe different device behaviors.
          </span>
        </div>
      </CardContent>
    </Card>
  </motion.div>
</div>

        </div>
      </main>

      {/* mobile sticky controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Run</Button>
            <Button variant="outline" className="px-3 py-2 border-zinc-700 text-black cursor-pointer text-sm" onClick={() => setRunning(false)}><Pause className="w-4 h-4 mr-2" /> Pause</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="border border-zinc-800 text-zinc-300 cursor-pointer p-2" onClick={exportCSV}><Download className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
