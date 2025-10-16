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
function BatteryVisualizerSVG({ history = [], params = {}, running = true }) {
  const latest = history.length ? history[history.length - 1] : { Vdc: params.Vnom || 48, Ibat: 0, Pbat: 0, Pout: 0, SOC: 0 };
  const Vdc = latest.Vdc || params.Vnom || 48;
  const Ibat = latest.Ibat || 0;
  const Pbat = latest.Pbat || 0;
  const SOC = latest.SOC || 0;

  const absP = Math.abs(Pbat);
  const dotCount = clamp(Math.round(3 + Math.sqrt(absP) * 0.12), 3, 28);
  const speed = clamp(2.2 / (Math.sqrt(absP) * 0.12 + 0.08), 0.25, 3.5);

  // layout
  const svgW = 980;
  const svgH = 320;

  // battery pack layout: columns = series strings, rows = parallels (display limited to 6 x 6)
  const series = Math.max(1, Math.min(12, params.series || 12));
  const parallels = Math.max(1, Math.min(8, params.parallels || 1));
  const packStartX = 140;
  const packStartY = 64;
  const cellW = 46;
  const cellH = 28;
  const spacingX = 12;
  const spacingY = 10;

  // color mapping: charging (Pbat < 0) -> cyan/green, discharging -> orange
  const isDischarging = Pbat > 0;
  const dotColor = isDischarging ? "#ffb86b" : "#00ffbf";
  const packColor = isDischarging ? "#ff8a3c" : "#00d6a6";

  // inverter icon pos
  const inverterX = svgW - 280;
  const inverterY = svgH / 2 - 34;

  // readout panel data strings
  const packLabel = `${params.Vnom || 48} V • ${round(params.capacityAh || 0, 2)} Ah`;
  const socLabel = `${round(SOC, 2)}%`;

  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-start md:flex-row flex-col justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <Battery className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Battery & UPS Visualizer</div>
            <div className="text-xs text-zinc-400">Real-time • SOC • Power flow • Inverter</div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Pack: <span className="text-[#ffd24a] ml-1">{packLabel}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Vdc: <span className="text-[#ffd24a] ml-1">{Vdc} V</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">SOC: <span className="text-[#00ffbf] ml-1">{socLabel}</span></Badge>
        </div>
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-64">
          {/* DC bus */}
          <path d={`M 40 ${svgH/2} H ${svgW - 40}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* battery pack group */}
          <g transform={`translate(${packStartX}, ${packStartY})`}>
            <text x={-20} y={-8} fontSize="12" fill="#ffb57a">Battery Pack</text>

            {Array.from({ length: series }).map((_, sx) => {
              const colX = sx * (cellW + spacingX);
              return (
                <g key={`col-${sx}`} transform={`translate(${colX},0)`}>
                  {Array.from({ length: parallels }).map((_, py) => {
                    const rowY = py * (cellH + spacingY);
                    // small battery cell rects
                    const cellFill = "#0a0a0a";
                    const accent = packColor;
                    return (
                      <g key={`cell-${sx}-${py}`} transform={`translate(0, ${rowY})`}>
                        <rect x={0} y={0} width={cellW} height={cellH} rx="6" fill={cellFill} stroke="#222" />
                        <rect x={4} y={4} width={cellW - 8} height={cellH - 8} rx="4" fill={accent} opacity={0.95} />
                        <text x={4} y={cellH + 12} fontSize="9" fill="#aaa">{`${round((params.Vnom / series), 2)} V`}</text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>

          {/* vertical feed from pack to bus */}
          <path d={`M ${packStartX + (series*(cellW+spacingX))/2 - 10} ${packStartY + parallels*(cellH+spacingY) - 6} V ${svgH/2}`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

          {/* inverter / charger box */}
          <g transform={`translate(${inverterX}, ${inverterY})`}>
            <rect x="-12" y="-12" width="220" height="108" rx="12" fill="#060606" stroke="#222" />
            <text x="8" y="-2" fontSize="12" fill="#ffd24a">Inverter / Charger</text>
            <g transform={`translate(8,18)`}>
              <rect x="0" y="6" width="64" height="36" rx="6" fill="#0a0a0a" stroke="#222" />
              <text x="6" y="30" fontSize="10" fill="#00ffbf">DC → AC</text>

              <rect x="84" y="6" width="64" height="36" rx="6" fill="#0a0a0a" stroke="#222" />
              <text x="90" y="30" fontSize="10" fill="#ffd24a">AC Load</text>

              <rect x="152" y="6" width="48" height="36" rx="6" fill="#0a0a0a" stroke="#222" />
              <text x="156" y="30" fontSize="10" fill="#9ee6ff">Charger</text>
            </g>
          </g>

          {/* animated power flow dots */}
          {/* if discharging: dots travel from pack -> inverter -> load; if charging: reversed */}
          {Array.from({ length: dotCount }).map((_, di) => {
            const progress = (di / dotCount);
            // path: from pack mid -> bus -> inverter -> load (a multi-segment path)
            // simple path string
            const startX = packStartX + (series*(cellW+spacingX))/2;
            const pathStr = isDischarging
              ? `M ${startX} ${packStartY + parallels*(cellH+spacingY)} L ${svgW/2} ${svgH/2} L ${inverterX+140} ${inverterY+40}`
              : `M ${inverterX+140} ${inverterY+40} L ${svgW/2} ${svgH/2} L ${startX} ${packStartY + parallels*(cellH+spacingY)}`;

            const delay = (di / dotCount) * speed;
            const style = {
              offsetPath: `path('${pathStr}')`,
              animationName: isDischarging ? "flowDis" : "flowChg",
              animationDuration: `${speed}s`,
              animationTimingFunction: "linear",
              animationDelay: `${-delay}s`,
              animationIterationCount: "infinite",
              animationPlayState: running ? "running" : "paused",
              transformOrigin: "0 0",
            };
            return <circle key={`pdot-${di}`} r="5" fill={dotColor} style={style} />;
          })}

          {/* readout */}
          <g transform={`translate(${svgW - 180}, 24)`}>
            <rect x="-80" y="-22" width="160" height="120" rx="10" fill="#060606" stroke="#222" />
            <text x="-70" y="-4" fontSize="12" fill="#ffb57a">Readouts</text>
            <text x="-70" y="18" fontSize="12" fill="#fff">Vdc: <tspan fill="#ffd24a">{Vdc} V</tspan></text>
            <text x="-70" y="38" fontSize="12" fill="#fff">Ibat: <tspan fill="#00ffbf">{round(Ibat, 6)} A</tspan></text>
            <text x="-70" y="58" fontSize="12" fill="#fff">Pbat: <tspan fill="#ff9a4a">{round(Pbat, 4)} W</tspan></text>
            <text x="-70" y="78" fontSize="12" fill="#fff">Pout: <tspan fill="#ffd24a">{round(latest.Pout || 0, 2)} W</tspan></text>
            <text x="-70" y="98" fontSize="12" fill="#fff">SOC: <tspan fill="#00ffbf">{round(latest.SOC || 0, 2)}%</tspan></text>
          </g>

          <style>{`
            @keyframes flowDis {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              40% { opacity: 0.9; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }
            @keyframes flowChg {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(2px,-2px) scale(0.95); }
              40% { opacity: 0.9; transform: translate(0,0) scale(1.06); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(-6px,6px) scale(0.82); }
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
