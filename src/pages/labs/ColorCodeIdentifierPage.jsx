// src/pages/ColorCodeIdentifierPage.jsx
"use client";

import React, { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Circle,
  Play,
  Pause,
  Download,
  Settings,
  Wifi,
  ZapOff,
  Gauge,
  Zap as Lightning,
  Star,
  Clipboard,
  X,
  Menu
} from "lucide-react";
import { Toaster, toast } from "sonner";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
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
   Color code tables
   ============================ */
// Standard 0-9 colors (digit, multiplier, readable hex, label)
const COLOR_CODES = [
  { name: "black", hex: "#000000", digit: 0, multiplier: 1, multiplierExp: 0, tol: null, tcr: null },
  { name: "brown", hex: "#7a4b2d", digit: 1, multiplier: 10, multiplierExp: 1, tol: "±1%", tcr: "100 ppm/K" },
  { name: "red", hex: "#d9534f", digit: 2, multiplier: 100, multiplierExp: 2, tol: "±2%", tcr: "50 ppm/K" },
  { name: "orange", hex: "#ff7a2d", digit: 3, multiplier: 1000, multiplierExp: 3, tol: null, tcr: "15 ppm/K" },
  { name: "yellow", hex: "#ffd24a", digit: 4, multiplier: 10000, multiplierExp: 4, tol: null, tcr: "25 ppm/K" },
  { name: "green", hex: "#00b36a", digit: 5, multiplier: 100000, multiplierExp: 5, tol: "±0.5%", tcr: null },
  { name: "blue", hex: "#2b7cff", digit: 6, multiplier: 1000000, multiplierExp: 6, tol: "±0.25%", tcr: null },
  { name: "violet", hex: "#a66cff", digit: 7, multiplier: 10000000, multiplierExp: 7, tol: "±0.1%", tcr: null },
  { name: "grey", hex: "#9aa0a6", digit: 8, multiplier: 100000000, multiplierExp: 8, tol: "±0.05%", tcr: null },
  { name: "white", hex: "#ffffff", digit: 9, multiplier: 1000000000, multiplierExp: 9, tol: null, tcr: null },
];

// tolerance extra colors
const TOLERANCE_COLORS = [
  { name: "silver", hex: "#b9b9c3", tol: "±10%" },
  { name: "gold", hex: "#ffd24a", tol: "±5%" },
  { name: "brown", hex: "#7a4b2d", tol: "±1%" },
  { name: "red", hex: "#d9534f", tol: "±2%" },
  { name: "green", hex: "#00b36a", tol: "±0.5%" },
  { name: "blue", hex: "#2b7cff", tol: "±0.25%" },
  { name: "violet", hex: "#a66cff", tol: "±0.1%" },
  { name: "grey", hex: "#9aa0a6", tol: "±0.05%" },
];

// temp coeff colors (typical)
const TCR_COLORS = [
  { name: "brown", hex: "#7a4b2d", tcr: "100 ppm/K" },
  { name: "red", hex: "#d9534f", tcr: "50 ppm/K" },
  { name: "orange", hex: "#ff7a2d", tcr: "15 ppm/K" },
  { name: "yellow", hex: "#ffd24a", tcr: "25 ppm/K" },
];

/* ============================
   Helpers
   ============================ */
const round = (v, p = 4) => {
  if (!Number.isFinite(v)) return "--";
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

function formatOhms(val) {
  if (!Number.isFinite(val) || val === 0) return "0 Ω";
  const abs = Math.abs(val);
  if (abs >= 1e6) return `${round(val / 1e6, 3)} MΩ`;
  if (abs >= 1e3) return `${round(val / 1e3, 3)} kΩ`;
  if (abs >= 1) return `${round(val, 3)} Ω`;
  // milliohms
  return `${round(val * 1e3, 3)} mΩ`;
}

/* ============================
   Core logic: compute resistance from selected bands
   - supports 4,5,6 band variants
   ============================ */
function computeResistanceFromBands({ bandCount, digits, multiplierColor, toleranceColor, tcrColor }) {
  // digits: array of numbers (digit indices into COLOR_CODES)
  // multiplierColor: color object from COLOR_CODES or custom multiplier with exp
  // toleranceColor: maybe from TOLERANCE_COLORS; tcrColor from TCR_COLORS
  if (!digits || digits.length < 2) return { R: NaN, display: "--" };

  // Construct numeric mantissa:
  // 4-band: digits[0], digits[1] => (d1 d2) * multiplier
  // 5-band: digits[0], digits[1], digits[2] => (d1 d2 d3) * multiplier
  // 6-band: same as 5 + TCR
  const digitsValue = digits.reduce((acc, d) => (Number.isFinite(d) ? acc * 10 + d : acc * 10), 0);
  const multiplier = multiplierColor && Number.isFinite(multiplierColor.multiplier) ? multiplierColor.multiplier : 1;

  const R = digitsValue * multiplier;
  // tolerance string
  const tol = toleranceColor ? toleranceColor.tol || toleranceColor.tolerance || "--" : "--";
  const tcr = tcrColor ? tcrColor.tcr || "--" : null;

  return { R, tol, tcr, digitsValue };
}

/* ============================
   Visual components: ColorSwatch + ResistorSVG
   ============================ */
function ColorSwatch({ sw, onClick, selected = false, small = false, ariaLabel }) {
  return (
    <button
      title={sw.name || ariaLabel}
      onClick={onClick}
      className={`flex items-center justify-center rounded-md border ${small ? "w-8 h-8" : "w-10 h-10"} 
        ${selected ? "ring-2 ring-orange-400/60" : "ring-1 ring-zinc-800/40"}
        focus:outline-none transition-transform hover:scale-105`}
      aria-label={ariaLabel}
      style={{ background: sw.hex, boxShadow: selected ? "0 6px 18px rgba(255,122,45,0.12)" : "none" }}
    >
      {/* put a subtle icon for very dark colors to remain visible */}
      <div className="text-xs text-black/80" style={{ fontWeight: 600 }}>
        {(sw.hex === "#000000" || sw.hex === "#2b7cff") ? "" : ""}
      </div>
    </button>
  );
}

function ResistorSVG({ bandColors = [], current = 0 }) {
  // bandColors: array of hex strings for bands (positions left-to-right)
  // current: used to scale animated dots
  const dotCount = Math.max(3, Math.min(18, Math.round(3 + Math.abs(current) * 12)));
  const speed = Math.max(0.6, Math.min(4, 1.6 / (Math.abs(current) + 0.01)));

  const width = 780;
  const height = 160;
  const bodyX = 70;
  const bodyY = 60;
  const bodyW = 640;
  const bodyH = 40;

  // compute band positions across the body
  const bandPositions = (() => {
    const left = bodyX + 80;
    const right = bodyX + bodyW - 80;
    const count = Math.max(1, bandColors.length);
    const spacing = (right - left) / (count + 1);
    return bandColors.map((c, i) => left + spacing * (i + 1));
  })();

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44">
      {/* wires */}
      <line x1="10" y1={bodyY + bodyH / 2} x2={bodyX - 10} y2={bodyY + bodyH / 2} stroke="#111" strokeWidth="6" strokeLinecap="round" />
      <line x1={bodyX + bodyW + 10} y1={bodyY + bodyH / 2} x2={width - 10} y2={bodyY + bodyH / 2} stroke="#111" strokeWidth="6" strokeLinecap="round" />

      {/* resistor body */}
      <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx="10" fill="#0b0b0b" stroke="#222" strokeWidth="1" />
      <rect x={bodyX + 6} y={bodyY + 6} width={bodyW - 12} height={bodyH - 12} rx="8" fill="#101010" />

      {/* metallic sheen */}
      <defs>
        <linearGradient id="sheen" x1="0" x2="1">
          <stop offset="0" stopColor="#000000" stopOpacity="0.2" />
          <stop offset="1" stopColor="#ffd24a" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <rect x={bodyX + 6} y={bodyY + 6} width={bodyW - 12} height={bodyH - 12} rx="8" fill="url(#sheen)" />

      {/* bands */}
      {bandColors.map((hex, i) => {
        const x = bandPositions[i] - 8;
        return (
          <g key={`band-${i}`}>
            <rect x={x} y={bodyY - 2} width={16} height={bodyH + 4} rx="2" fill={hex} stroke="#111" strokeWidth="1" />
          </g>
        );
      })}

      {/* animated current dots along main wire into resistor and out */}
      {Array.from({ length: dotCount }).map((_, di) => {
        const delay = (di / dotCount) * speed;
        const styleLeft = {
          offsetPath: `path('M 10 ${bodyY + bodyH / 2} H ${bodyX - 10} V ${bodyY + bodyH / 2}')`,
          animationName: "flowLeft",
          animationDuration: `${speed}s`,
          animationTimingFunction: "linear",
          animationDelay: `${-delay}s`,
          animationIterationCount: "infinite",
          animationPlayState: "running",
        };
        const styleRight = {
          offsetPath: `path('M ${bodyX + bodyW + 10} ${bodyY + bodyH / 2} H ${width - 10} V ${bodyY + bodyH / 2}')`,
          animationName: "flowRight",
          animationDuration: `${speed}s`,
          animationTimingFunction: "linear",
          animationDelay: `${-delay - 0.2}s`,
          animationIterationCount: "infinite",
          animationPlayState: "running",
        };

        const dotColor = Math.abs(current) >= 0 && current >= 0 ? "#ffd24a" : "#ff7a6a";

        return (
          <g key={`dotpair-${di}`}>
            <circle r="4" fill={dotColor} style={styleLeft} />
            <circle r="3.2" fill={dotColor} style={styleRight} />
          </g>
        );
      })}

      <style>{`
        @keyframes flowLeft {
          0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
          40% { opacity: 0.9; transform: translate(0,0) scale(1.03); }
          100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
        }
        @keyframes flowRight {
          0% { offset-distance: 0%; opacity: 0.95; transform: translate(2px,-2px) scale(0.95); }
          40% { opacity: 0.9; transform: translate(0,0) scale(1.03); }
          100% { offset-distance: 100%; opacity: 0; transform: translate(-6px,6px) scale(0.8); }
        }
      `}</style>
    </svg>
  );
}

/* ============================
   Oscilloscope mini (sparkline) - simple simulated waveform for vibe
   ============================ */
function MiniScope({ amplitude = 1, running = true }) {
  const [data, setData] = useState(Array.from({ length: 80 }, (_, i) => ({ t: i, y: Math.sin(i / 6) * amplitude })));

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setData((d) => {
        const lastPhase = (d.length ? d[d.length - 1].t : 0) + 1;
        const next = d.slice(1);
        next.push({ t: lastPhase, y: Math.sin(lastPhase / 6) * amplitude * (0.6 + Math.random() * 0.8) });
        return next;
      });
    }, 80);
    return () => clearInterval(id);
  }, [amplitude, running]);

  return (
    <div className="w-full h-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#0b0b0b" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis hide domain={[-amplitude * 1.4, amplitude * 1.4]} />
          <Line type="monotone" dataKey="y" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================
   Main Page
   ============================ */
export default function ColorCodeIdentifierPage() {
  // UI state
  const [bandCount, setBandCount] = useState("4"); // "4" | "5" | "6"
  // digits hold the indices (digit value) for color codes 0-9 (index to COLOR_CODES)
  // For 4-band: digits[0], digits[1]; multiplier; tolerance
  // For 5/6-band: digits[0..2], multiplier, tolerance, (tcr)
  const [digits, setDigits] = useState([1, 0, 0]); // default 100 ohm (brown-black-black)
  const [multiplier, setMultiplier] = useState(COLOR_CODES[0]); // default black (x1)
  const [tolerance, setTolerance] = useState({ name: "gold", hex: "#ffd24a", tol: "±5%" });
  const [tcr, setTcr] = useState(null);

  const [Vsup, setVsup] = useState("5"); // user can enter voltage
  const [manualCurrent, setManualCurrent] = useState(""); // if set, overrides computed current

  const [runningScope, setRunningScope] = useState(true);

  // When bandCount changes, ensure digits array length is appropriate
  useEffect(() => {
    if (bandCount === "4") {
      setDigits((d) => [d[0] ?? 1, d[1] ?? 0, 0]); // we'll ignore the 3rd digit
    } else {
      setDigits((d) => {
        // ensure length 3 for 5/6 band
        if (d.length < 3) return [d[0] ?? 1, d[1] ?? 0, d[2] ?? 0];
        return d;
      });
    }
  }, [bandCount]);

  // compute resistance
  const { R, tol, tcr: tcrFromCompute } = useMemo(() => {
    const dvals = bandCount === "4" ? [digits[0], digits[1]] : [digits[0], digits[1], digits[2]];
    const res = computeResistanceFromBands({
      bandCount: Number(bandCount),
      digits: dvals,
      multiplierColor: multiplier,
      toleranceColor: tolerance,
      tcrColor: tcr,
    });
    return res;
  }, [digits, multiplier, tolerance, tcr, bandCount]);

  // effective current: user provided manualCurrent overrides computed I
  const Rval = Number.isFinite(Number(R)) ? Number(R) : NaN;
  const Vnum = Number.isFinite(Number(Vsup)) ? Number(Vsup) : NaN;
  const Icomputed = Number.isFinite(Rval) && Rval > 0 && Number.isFinite(Vnum) ? Vnum / Rval : 0;
  const Iused = Number.isFinite(Number(manualCurrent)) && manualCurrent !== "" ? Number(manualCurrent) : Icomputed;
  const Pused = Number.isFinite(Iused) && Number.isFinite(Vnum) ? Vnum * Iused : 0;

  // digits -> hex array for drawing bands
  const bandHexes = useMemo(() => {
    const digitsToHex = (dArr) => dArr.map((d) => {
      const c = COLOR_CODES.find((c) => c.digit === d);
      return c ? c.hex : "#000000";
    });

    if (bandCount === "4") {
      // 4-band layout: band0 band1 multiplier tolerance
      return [
        COLOR_CODES[digits[0]]?.hex,
        COLOR_CODES[digits[1]]?.hex,
        multiplier?.hex ?? "#000",
        tolerance?.hex ?? "#ffd24a"
      ];
    } else if (bandCount === "5") {
      return [
        COLOR_CODES[digits[0]]?.hex,
        COLOR_CODES[digits[1]]?.hex,
        COLOR_CODES[digits[2]]?.hex,
        multiplier?.hex ?? "#000",
        tolerance?.hex ?? "#ffd24a"
      ];
    } else {
      // 6-band: add tcr at end
      return [
        COLOR_CODES[digits[0]]?.hex,
        COLOR_CODES[digits[1]]?.hex,
        COLOR_CODES[digits[2]]?.hex,
        multiplier?.hex ?? "#000",
        tolerance?.hex ?? "#ffd24a",
        tcr?.hex ?? "#7a4b2d"
      ];
    }
  }, [bandCount, digits, multiplier, tolerance, tcr]);

  const copyToClipboard = () => {
    const txt = `Resistance: ${formatOhms(Rval)} • Tolerance: ${tol || "--"} • V=${Vnum} V • I=${round(Iused, 6)} A • P=${round(Pused, 6)} W`;
    navigator.clipboard?.writeText(txt).then(() => toast.success("Copied readout to clipboard"));
  };

  const exportPNG = () => {
    // quick fake export: create a text blob and download (real screenshot needs dom-to-image)
    const txt = `Resistor ${formatOhms(Rval)} ${tol || ""} (bands: ${bandHexes.join(",")})`;
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resistor-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported quick snapshot");
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen pb-20 bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.12)_1px,transparent_1px)] bg-[length:18px_18px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />
      {/* Header */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2 sm:py-0">
  <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
    {/* Top row */}
    <div className="flex items-center justify-between h-12 sm:h-14 md:h-16">
      
      {/* Logo + Title */}
      <motion.div
        initial={{ y: -6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.36 }}
        className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md transform transition-transform duration-300 hover:scale-105">
          <Zap className="w-5 h-5 text-black" />
        </div>
        <div className="truncate">
          <div className="text-sm font-semibold text-zinc-200 truncate">SparkLab</div>
          <div className="text-xs text-zinc-400 -mt-0.5 truncate">Resistor Color Code Identifier</div>
        </div>
      </motion.div>

      {/* Desktop Controls */}
      <div className="hidden md:flex items-center gap-4">
        
        {/* Mode Badge */}
        <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">
          Mode
        </Badge>

        {/* Band Count Selector */}
        <div className="w-36">
          <Select value={bandCount} onValueChange={(v) => setBandCount(v)}>
            <SelectTrigger
              className="w-full bg-black/80 border cursor-pointer border-zinc-800 
                         text-white text-sm rounded-md shadow-sm 
                         hover:border-orange-500 focus:ring-2 focus:ring-orange-500"
            >
              <SelectValue placeholder="Band Count" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
              <SelectItem
                value="4"
                className="text-white hover:bg-orange-500/20 
                           data-[highlighted]:text-orange-200 cursor-pointer 
                           data-[highlighted]:bg-orange-500/30 rounded-md"
              >
                4-Band (common)
              </SelectItem>
              <SelectItem
                value="5"
                className="text-white hover:bg-orange-500/20 
                           data-[highlighted]:text-orange-200 cursor-pointer 
                           data-[highlighted]:bg-orange-500/30 rounded-md"
              >
                5-Band (precision)
              </SelectItem>
              <SelectItem
                value="6"
                className="text-white hover:bg-orange-500/20 
                           data-[highlighted]:text-orange-200 cursor-pointer 
                           data-[highlighted]:bg-orange-500/30 rounded-md"
              >
                6-Band (TCR)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-semibold text-sm px-3 py-1 rounded-lg shadow-md hover:scale-105 transition-transform duration-200"
            onClick={() => toast.success('Saved preset')}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 hover:text-orange-400 transition-colors duration-200"
            onClick={() => {
              setDigits([1, 0, 0]);
              setMultiplier(COLOR_CODES[0]);
              setTolerance({ name: 'gold', hex: '#ffd24a', tol: '±5%' });
              setTcr(null);
              toast('Reset bands');
            }}
            title="Reset Bands"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Mobile Menu Toggle */}
      <div className="md:hidden">
        <Button
          variant="ghost"
          className="border cursor-pointer border-zinc-800 p-2 rounded-lg"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>
    </div>

    {/* Mobile Slide-down Panel */}
    <div
      className={`md:hidden transition-all duration-300 overflow-hidden ${
        mobileOpen ? 'max-h-60 py-3' : 'max-h-0'
      }`}
    >
      <div className="flex flex-col gap-3">
        
        {/* Mobile Band Selector */}
        <div className="w-full">
          <Select value={bandCount} onValueChange={(v) => setBandCount(v)}>
            <SelectTrigger
              className="w-full bg-black/80 border cursor-pointer border-zinc-800 
                         text-white text-sm rounded-md shadow-sm 
                         hover:border-orange-500 focus:ring-2 focus:ring-orange-500"
            >
              <SelectValue placeholder="Band Count" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md shadow-lg">
              <SelectItem
                value="4"
                className="text-white hover:bg-orange-500/20 
                           data-[highlighted]:text-orange-200 cursor-pointer 
                           data-[highlighted]:bg-orange-500/30 rounded-md"
              >
                4-Band (common)
              </SelectItem>
              <SelectItem
                value="5"
                className="text-white hover:bg-orange-500/20 
                           data-[highlighted]:text-orange-200 cursor-pointer 
                           data-[highlighted]:bg-orange-500/30 rounded-md"
              >
                5-Band (precision)
              </SelectItem>
              <SelectItem
                value="6"
                className="text-white hover:bg-orange-500/20 
                           data-[highlighted]:text-orange-200 cursor-pointer 
                           data-[highlighted]:bg-orange-500/30 rounded-md"
              >
                6-Band (TCR)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mobile Action Buttons */}
        <div className="flex flex-row gap-2">
          <Button
            className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-xs py-2 rounded-md"
            onClick={() => toast.success('Saved preset')}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            className="flex-1 border cursor-pointer border-zinc-800 text-xs py-2 rounded-md"
            onClick={() => {
              setDigits([1, 0, 0]);
              setMultiplier(COLOR_CODES[0]);
              setTolerance({ name: 'gold', hex: '#ffd24a', tol: '±5%' });
              setTcr(null);
              toast('Reset bands');
            }}
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  </div>
</header>


      <div className="h-16"></div>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left controls */}
          <div className="lg:col-span-4 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                        <Lightning className="w-5 h-5 text-black" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Resistor Code</div>
                        <div className="text-xs text-zinc-400">Pick bands visually • see real-time values</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Bands: <span className="ml-2 text-[#ffd24a]">{bandCount}</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Band selectors visually arranged */}
                  <div>
                    <label className="text-xs text-zinc-400">Select band colors (click swatch)</label>
                    <div className="mt-3 grid grid-cols-6 gap-2 items-center">
                      {/* digits swatches */}
                      <div className="col-span-6 flex flex-wrap gap-2">
                        {COLOR_CODES.map((c) => (
                          <div key={`sw-${c.name}`} className="flex items-center gap-2">
                            <ColorSwatch sw={c} onClick={() => {
                              // if selecting some digit slot — by default we'll set the first digit slot that is null or currently first one
                              // show a tiny UI below to choose which digit to set
                              // For simplicity, open a small prompt style: choose slot via toast actions? We'll allow toggle via click to cycle focus.
                              // Simpler: clicking swatch will open a small selector to choose target slot using window.prompt — but better: choose first unfilled or cycle slot.
                              // We'll implement a small cycle: clicking sets next digit index rotating.
                              setDigits((prev) => {
                                // find index to set: first digit that is less than 10 and not yet selected? We'll rotate: set first slot that's different.
                                const next = prev.slice();
                                // prefer editing the earliest non-zero or first slot
                                let idxToChange = 0;
                                if (bandCount === "4") idxToChange = (next[0] === undefined || next[0] === null) ? 0 : (next[1] === undefined ? 1 : 0);
                                else idxToChange = (next.findIndex((v) => v === undefined || v === null) !== -1) ? next.findIndex((v) => v === undefined || v === null) : 0;
                                // we'll set the currently focused slot in a small round-robin: rotate focus index stored in temp state? for simplicity we set the first digit slot if none
                                // Implement a small heuristic: set the first digit slot which differs from clicked color
                                for (let j = 0; j < (bandCount === "4" ? 2 : 3); j++) {
                                  if (next[j] !== c.digit) { idxToChange = j; break; }
                                }
                                next[idxToChange] = c.digit;
                                return next;
                              });
                            }} selected={false} small />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* explicit digit slot pickers (clear UX): */}
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <div className="flex gap-2 items-center">
                        <div className="text-xs text-zinc-400 w-28">Band 1</div>
                        <Select value={String(digits[0] ?? 1)} onValueChange={(v) => setDigits((s) => { const n = s.slice(); n[0] = Number(v); return n; })}>
                          <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm">
                            <SelectValue placeholder="Band 1" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900  border border-zinc-800">
                            {COLOR_CODES.map((c) => <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" key={`d0-${c.name}`} value={String(c.digit)}>{c.name.toUpperCase()}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2 items-center">
                        <div className="text-xs text-zinc-400 w-28">Band 2</div>
                        <Select value={String(digits[1] ?? 0)} onValueChange={(v) => setDigits((s) => { const n = s.slice(); n[1] = Number(v); return n; })}>
                          <SelectTrigger className="w-full bg-black/80 cursor-pointer border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                            <SelectValue placeholder="Band 2" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800">
                            {COLOR_CODES.map((c) => <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" key={`d1-${c.name}`} value={String(c.digit)}>{c.name.toUpperCase()}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      {bandCount !== "4" && (
                        <div className="flex gap-2 items-center">
                          <div className="text-xs text-zinc-400 w-28">Band 3</div>
                          <Select value={String(digits[2] ?? 0)} onValueChange={(v) => setDigits((s) => { const n = s.slice(); n[2] = Number(v); return n; })}>
                            <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm">
                              <SelectValue placeholder="Band 3" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border border-zinc-800">
                              {COLOR_CODES.map((c) => <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" key={`d2-${c.name}`} value={String(c.digit)}>{c.name.toUpperCase()}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* multiplier */}
                      <div className="flex gap-2 items-center">
                        <div className="text-xs text-zinc-400 w-28">Multiplier</div>
                        <Select value={String(multiplier?.digit ?? 0)} onValueChange={(v) => {
                          const found = COLOR_CODES.find((c) => String(c.digit) === String(v));
                          if (found) setMultiplier(found);
                        }}>
                          <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm">
                            <SelectValue placeholder="Multiplier" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800">
                            {COLOR_CODES.map((c) => <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" key={`mul-${c.name}`} value={String(c.digit)}>{c.name.toUpperCase()} (x{c.multiplierExp ?? 0})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* tolerance */}
                      <div className="flex gap-2 items-center">
                        <div className="text-xs text-zinc-400 w-28">Tolerance</div>
                        <Select value={tolerance?.name ?? "gold"} onValueChange={(v) => {
                          const found = TOLERANCE_COLORS.find((t) => t.name === v) ?? TOLERANCE_COLORS[1];
                          setTolerance(found);
                        }}>
                          <SelectTrigger className="w-full bg-black/80 border cursor-pointer border-zinc-800 text-white text-sm rounded-md shadow-sm">
                            <SelectValue placeholder="Tolerance" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800">
                            {TOLERANCE_COLORS.map((c) => <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" key={`tol-${c.name}`} value={c.name}>{`${c.name.toUpperCase()} ${c.tol}`}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      {bandCount === "6" && (
                        <div className="flex gap-2 items-center">
                          <div className="text-xs text-zinc-400 w-28">Temp. Coeff.</div>
                          <Select value={tcr?.name ?? "brown"} onValueChange={(v) => {
                            const found = TCR_COLORS.find((t) => t.name === v) ?? TCR_COLORS[0];
                            setTcr(found);
                          }}>
                            <SelectTrigger className="w-full bg-black/80 cursor-pointer border border-zinc-800 text-white text-sm rounded-md shadow-sm">
                              <SelectValue placeholder="TCR" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border border-zinc-800">
                              {TCR_COLORS.map((c) => <SelectItem  className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" key={`tcr-${c.name}`} value={c.name}>{`${c.name.toUpperCase()} ${c.tcr}`}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Voltage / manual current */}
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-xs text-zinc-400">Supply Voltage (V)</label>
                      <Input type="number" value={Vsup} onChange={(e) => setVsup(e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400">Manual Current (A) — optional</label>
                      <Input value={manualCurrent} onChange={(e) => setManualCurrent(e.target.value)} placeholder="Leave empty to use V/R" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      <div className="text-xs text-zinc-500 mt-1">If set, this overrides computed current for visualizer and P.</div>
                    </div>
                  </div>

                  {/* buttons */}
                  <div className="flex gap-2 mt-2">
                    <Button className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => { copyToClipboard(); }}>
                      <Download className="w-4 h-4 mr-2" /> Copy Readout
                    </Button>
                    <Button variant="ghost" className="border cursor-pointer border-zinc-800 text-zinc-300" onClick={() => exportPNG()}>
                      Export
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right: Visual + readouts */}
          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex sm:items-center sm:flex-row flex-col gap-4 items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                        <Gauge className="w-5 h-5 text-black" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Interactive Visualizer</div>
                        <div className="text-xs text-zinc-400">Live resistor • animated current • meters & scope</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">R: <span className="text-[#ff9a4a] ml-1">{formatOhms(Rval)}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Tol: <span className="text-[#ffd24a] ml-1">{tol || "--"}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">I: <span className="text-[#00ffbf] ml-1">{round(Iused, 9)} A</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="w-full">
                    <ResistorSVG bandColors={bandHexes} current={Iused} />
                  </div>

                  {/* readouts + scope */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Resistance</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{formatOhms(Rval)}</div>
                      <div className="text-xs text-zinc-400 mt-1">Computed from selected colors</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Current</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{round(Iused, 9)} A</div>
                      <div className="text-xs text-zinc-400 mt-1">I = V / R (or manual override)</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Power</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{round(Pused, 6)} W</div>
                      <div className="text-xs text-zinc-400 mt-1">P = V × I</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-zinc-400 mb-2 flex items-center justify-between">
                      <span>Oscilloscope (simulated)</span>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" className="p-1 border cursor-pointer border-zinc-800" onClick={() => setRunningScope((s) => !s)}>
                          {runningScope ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                    <MiniScope amplitude={Math.min(3, Math.max(0.2, Math.abs(Iused) * 8))} running={runningScope} />
                  </div>

                  <div className="mt-4 bg-black/70 border border-orange-500/20 px-3 py-2 rounded-md text-xs text-zinc-300 flex items-center gap-3">
                    <div className="text-[#ffd24a]">Tip</div>
                    <div>Click color swatches to quickly set digit color; use the dropdowns for precise selection. Use manual current to visualize overload conditions.</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Summary / band legend */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-b from-black/80 via-zinc-950/80 to-zinc-900/60 border border-zinc-800 rounded-2xl shadow-[0_0_25px_-8px_rgba(255,122,45,0.25)] backdrop-blur-md transition-all duration-300">
  <CardHeader className="border-b border-zinc-800/70 pb-3">
    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#ffd24a] tracking-wide">
      <span className="inline-block w-1.5 h-5 bg-gradient-to-b from-[#ff7a2d] to-[#ffd24a] rounded-full shadow-[0_0_10px_#ff7a2d]" />
      Band Legend
    </CardTitle>
  </CardHeader>

  <CardContent className="pt-4">
    <div className="grid grid-cols-2 gap-3">
      {COLOR_CODES.map((c) => (
        <div
          key={`leg-${c.name}`}
          className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-[#ff7a2d]/60 hover:shadow-[0_0_10px_rgba(255,122,45,0.4)] transition-all duration-300 group"
        >
          <div
            style={{ background: c.hex }}
            className="w-8 h-8 rounded-lg border border-zinc-800 group-hover:scale-110 transition-transform duration-300"
          />
          <div className="flex flex-col">
            <div className="text-sm font-semibold text-orange-200 tracking-wide">
              {c.name.toUpperCase()}
            </div>
            <div className="text-xs text-zinc-400 font-mono">
              digit: <span className="text-orange-300">{c.digit}</span> • mult:{" "}
              <span className="text-orange-300">10<sup>{c.multiplierExp}</sup></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </CardContent>
</Card>


<Card className="bg-gradient-to-b from-black/80 via-zinc-950/90 to-zinc-900/60 border border-zinc-800/70 rounded-2xl shadow-[0_0_25px_-8px_rgba(255,122,45,0.25)] backdrop-blur-md transition-all duration-300">
  <CardHeader className="border-b border-zinc-800/70 pb-3">
    <CardTitle className="flex items-center gap-2 text-[#ffd24a] tracking-wide font-semibold">
      <Gauge className="w-5 h-5 text-[#ff7a2d]" />
      Summary
    </CardTitle>
  </CardHeader>

  <CardContent className="pt-4">
    <div className="space-y-3">
      <Badge className="bg-black/40 border border-[#ff7a2d]/40 text-xs text-[#ffd24a] tracking-wide px-2 py-1 rounded-md w-fit">
        Computed Values
      </Badge>

      <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1">
        <div className="text-sm text-zinc-300 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-[#ff9a4a]" />
          Resistance
        </div>
        <div className="font-semibold text-[#ff9a4a] text-sm">{formatOhms(Rval)}</div>
      </div>

      <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1">
        <div className="text-sm text-zinc-300 flex items-center gap-2">
          <Star className="w-4 h-4 text-[#ffd24a]" />
          Tolerance
        </div>
        <div className="font-semibold text-[#ffd24a] text-sm">{tol || "--"}</div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-300 flex items-center gap-2">
          <Clipboard className="w-4 h-4 text-[#9ee6ff]" />
          Temp. Coeff.
        </div>
        <div className="font-semibold text-[#9ee6ff] text-sm">{tcr?.tcr ?? tcrFromCompute ?? "--"}</div>
      </div>

      <div className="pt-4 flex gap-3">
       

        <Button
          variant="outline"
          className="flex items-center text-black gap-2 border cursor-pointer w-full border-zinc-700 hover:border-[#ff7a2d]/60 hover:text-[#ffd24a] transition-all duration-300"
          onClick={() => {
            navigator.clipboard?.writeText(`${formatOhms(Rval)} ${tol || ""}`);
            toast.success("Copied resistance");
          }}
        >
          <Clipboard className="w-4 h-4" />
          Copy
        </Button>
      </div>
    </div>
  </CardContent>
</Card>
            </div>

          </div>
        </div>
      </main>

      {/* mobile sticky */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden" role="region" aria-label="Mobile controls">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm" onClick={() => copyToClipboard()}>Copy</Button>
          <Button variant="ghost" className="border border-zinc-800 text-zinc-300 p-2 cursor-pointer" onClick={() => exportPNG()}>Export</Button>
        </div>
      </div>
    </div>
  );
}
