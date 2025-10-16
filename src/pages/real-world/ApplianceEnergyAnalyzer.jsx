// src/pages/ApplianceEnergyAnalyzer.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Settings,
  Menu,
  X,
  Layers,
  Lightbulb,
  Thermometer,
  Cpu,
  Activity,
  Play,
  Pause,
  Download,
  Zap,
  Clock,
  Gauge,
  DollarSign,
  Plug,
  Home,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { toPng } from "html-to-image";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";

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
  BarChart,
  Bar,
} from "recharts";

/* Optional: If you have react-three-fiber installed, uncomment these lines
   and ensure @react-three/fiber and @react-three/drei are in your deps.
   If you don't want 3D, the <ThreeAppliance/> component will show a static SVG fallback.
*/
// import { Canvas } from "@react-three/fiber";
// import { OrbitControls, softShadows, Stage } from "@react-three/drei";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 6) => (Number.isFinite(v) ? Math.round(v * 10 ** p) / 10 ** p : NaN);

/* ----------------------
   Small Three.js appliance component (fallback friendly)
   ---------------------- */
function ThreeAppliance({ power, color = "#ff7a2d" }) {
  // If @react-three/fiber is not available, show a stylized SVG representing a 3D box
  return (
    <div className="w-full h-52 flex items-center justify-center">
      <svg viewBox="0 0 280 140" className="w-full h-full">
        <defs>
          <linearGradient id="applGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.98" />
            <stop offset="100%" stopColor="#3a2a1f" stopOpacity="0.9" />
          </linearGradient>
          <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* base box */}
        <g transform="translate(20,8)">
          <rect x="20" y="18" width="220" height="90" rx="10" fill="#060606" stroke="#221818" />
          <rect x="24" y="22" width="212" height="82" rx="8" fill="url(#applGrad)" filter="url(#soft)" opacity="0.98" />
          {/* subtle screen */}
          <rect x="44" y="36" width="60" height="30" rx="4" fill="#0b0b0b" opacity="0.5" />
          <rect x="44" y="72" width="180" height="18" rx="3" fill="#0b0b0b" opacity="0.25" />
          {/* small indicator */}
          <circle cx={200} cy={50} r={8} fill="#00ffbf" opacity={clamp(power / 2000, 0.05, 1)} />
        </g>
      </svg>
    </div>
  );
}

/* ----------------------
   SVG Visualizer (organic noise, scanning)
   Colors will respond to user inputs (power)
   ---------------------- */


// SVGVisualizer.jsx
// Single-file React component for a futuristic Appliance Energy Analyzer.
// Uses Tailwind CSS for styling and framer-motion for interactions/animations.
// Props: power (number) - baseline total power in Watts; themeColor (string) - accent color hex.
function SVGVisualizer({ power = 1000, themeColor = "#ff7a2d" }) {
  const [devices, setDevices] = useState(() => [
    { id: "fridge", label: "Fridge", watt: 120, active: true, efficiency: 0.78 },
    { id: "ac", label: "AC", watt: 1400, active: false, efficiency: 0.45 },
    { id: "wash", label: "Washing", watt: 500, active: true, efficiency: 0.6 },
    { id: "oven", label: "Oven", watt: 2000, active: false, efficiency: 0.35 },
    { id: "lights", label: "Lights", watt: 60, active: true, efficiency: 0.9 },
    { id: "fan", label: "Fan", watt: 40, active: false, efficiency: 0.92 },
    { id: "heater", label: "Heater", watt: 1500, active: false, efficiency: 0.4 },
  ]);

  const [expanded, setExpanded] = useState(null);
  const [currency, setCurrency] = useState("INR");
  const [metric, setMetric] = useState("kWh");

  // cost per kWh in INR (simple default) — in production, fetch latest rates.
  const costPerKWh = 12.5;

  // derived totals
  const totals = useMemo(() => {
    const activeDevices = devices.filter((d) => d.active);
    const totalW = activeDevices.reduce((s, d) => s + d.watt, 0);
    const kWh = totalW / 1000; // per hour
    const cost = kWh * costPerKWh;
    return { totalW, kWh, cost, activeCount: activeDevices.length };
  }, [devices]);

  // toggle device
  function toggleDevice(id) {
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, active: !d.active } : d)));
  }

  // small heartbeat to nudge animations
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPulse((p) => (p + 1) % 360), 1200);
    return () => clearInterval(t);
  }, []);

  // helpers for arc gauge
  function arcPath(cx, cy, r, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [`M ${start.x} ${start.y}`, `A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`].join(" ");
  }
  function polarToCartesian(cx, cy, r, angleDeg) {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180.0;
    return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
  }

  // responsive sizing values
  const viewBoxWidth = 1200;
  const viewBoxHeight = 700;

  // small UI helpers
  function efficiencyColor(eff) {
    if (eff >= 0.8) return "#32d583"; // green
    if (eff >= 0.5) return "#ffd166"; // yellow
    return "#ff5c7a"; // red
  }

  return (
    <div className="w-full min-h-screen p-6 bg-black text-white border border-zinc-400/30 flex flex-col gap-6 rounded-2xl">
      <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row gap-6">
        {/* Left: dashboard */}
        <div className="flex-1 backdrop-blur-sm bg-white/3 rounded-2xl p-5 shadow-2xl border border-white/6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-orange-400">Appliance Energy Analyzer</h2>
              <p className="text-sm text-white/70 mt-1">Real-time usage · Interactive visualization · Predictive insights</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-white/80">Mode</div>
              <div className="flex items-center gap-2">
                <button className={`px-3 py-1 rounded-lg  cursor-pointer text-sm ${metric === 'kWh' ? 'bg-orange-400' : 'bg-zinc-500'} `} onClick={() => setMetric('kWh')}>kWh</button>
                <button className={`px-3 py-1 rounded-lg cursor-pointer text-sm ${metric === '₹' ? 'bg-orange-400' : 'bg-zinc-500'}`} onClick={() => setMetric('₹')}>₹</button>
                <button className={`px-3 py-1 rounded-lg cursor-pointer text-sm ${metric === 'CO2' ? 'bg-orange-400' : 'bg-zinc-500'}`} onClick={() => setMetric('CO2')}>CO₂</button>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Big Total Card */}
            <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-gradient-to-br from-white/3 to-white/2 border border-white/5 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-white/70">Total Active Load</div>
                  <div className="flex items-baseline gap-3">
                    <div className="text-3xl font-bold">{Math.round(totals.totalW)} W</div>
                    <div className="text-sm text-white/70">{totals.activeCount} devices active</div>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <div className="text-xs text-white/70">Cost / hr</div>
                  <div className="text-xl font-semibold">₹ {(totals.cost).toFixed(2)}</div>
                  <div className="text-xs text-white/60 mt-1">Est. kWh: {(totals.kWh).toFixed(3)}</div>
                </div>
              </div>

              <div className="mt-4 flex gap-4 items-center">
                {/* Arc gauge */}
                <svg viewBox="0 0 260 120" className="w-[260px] h-[120px]">
                  <defs>
                    <linearGradient id="gaugeGrad" x1="0" x2="1">
                      <stop offset="0%" stopColor="#00ffff" stopOpacity="1" />
                      <stop offset="100%" stopColor={themeColor} stopOpacity="1" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="6" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Base arc */}
                  <path d={arcPath(130, 120, 70, -120, 0)} stroke="#ffffff22" strokeWidth="10" fill="none" strokeLinecap="round" />

                  {/* Dynamic arc based on totals.totalW */}
                  {(() => {
                    const pct = Math.min(1, totals.totalW / (power * 2)); // assume double baseline as max
                    const end = -120 + pct * 120;
                    const d = arcPath(130, 120, 70, -120, end);
                    return <path d={d} stroke="url(#gaugeGrad)" strokeWidth="10" fill="none" strokeLinecap="round" style={{ filter: 'url(#glow)', transition: 'd 600ms ease' }} />;
                  })()}

                  {/* Needle */}
                  {(() => {
                    const pct = Math.min(1, totals.totalW / (power * 2));
                    const angle = -120 + pct * 120;
                    const needle = polarToCartesian(130, 120, 45, angle);
                    return (
                      <g>
                        <line x1={130} y1={120} x2={needle.x} y2={needle.y} stroke="#fff" strokeWidth="2" strokeLinecap="round" style={{ transformOrigin: '130px 120px', transform: `rotate(${0}deg)`, transition: 'all 600ms cubic-bezier(.2,.9,.3,1)' }} />
                        <circle cx={130} cy={120} r={5} fill="#fff" />
                      </g>
                    );
                  })()}

                  {/* Liquid-fill mini meter */}
                  <g transform="translate(10,0)">
                    <rect x="10" y="10" rx="10" width="50" height="80" fill="#ffffff08" />
                    <clipPath id="liquidClip">
                      <rect x="10" y={90 - Math.min(80, (totals.kWh / Math.max(0.001, power / 1000)) * 80)} width="50" height="80" />
                    </clipPath>
                    <rect x="10" y="10" rx="10" width="50" height="80" fill="url(#gaugeGrad)" clipPath="url(#liquidClip)" opacity="0.9">
                      <animate attributeName="y" dur="2s" repeatCount="indefinite" values="10;8;10" />
                    </rect>
                  </g>
                </svg>

                {/* Tiny predictive sparkline */}
                <div className="flex-1">
                  <div className="text-xs text-white/60">Predictive (next hour)</div>
                  <div className="mt-2 h-12 bg-white/5 rounded-lg flex items-center px-3">
                    {/* Simple SVG sparkline */}
                    <svg viewBox="0 0 120 40" className="w-full h-10">
                      <polyline points="0,30 20,24 40,18 60,14 80,16 100,10 120,12" fill="none" stroke={themeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'url(#glow)' }} />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Devices list */}
            <div className="p-4 rounded-xl bg-white/3 border border-white/6 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="text-sm text-white/80">Devices</div>
                <div className="text-xs text-white/60">Tap/click to expand</div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3">
                {devices.map((d) => (
                  <motion.button key={d.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} onClick={() => { setExpanded(expanded === d.id ? null : d.id); }} className={`flex items-center md:flex-col lg:flex-row gap-3 p-2 rounded-lg text-left w-full border ${d.active ? 'border-white/20' : 'border-white/6'} bg-white/2`}>
                    <div className="w-12 h-12 relative flex items-center justify-center">
                      {/* Mini SVG icon with micro animation */}
                      <svg viewBox="0 0 48 48" className="w-12 h-12">
                        <defs>
                          <linearGradient id={`g-${d.id}`} x1="0" x2="1">
                            <stop offset="0%" stopColor="#00ffff" />
                            <stop offset="100%" stopColor={themeColor} />
                          </linearGradient>
                        </defs>
                        {/* switch by id - simplified icons */}
                        {d.id === 'fan' ? (
                          <g transform="translate(24,24)">
                            <circle r="10" fill="#ffffff08" />
                            <g style={{ transformOrigin: '24px 24px' }} className={`${d.active ? 'animate-spin-slow' : ''}`}>
                              <path d="M0,-2 L6,-6 L6,6 Z" fill={`url(#g-${d.id})`} transform="rotate(0)" />
                              <path d="M0,-2 L6,-6 L6,6 Z" fill={`url(#g-${d.id})`} transform="rotate(120)" />
                              <path d="M0,-2 L6,-6 L6,6 Z" fill={`url(#g-${d.id})`} transform="rotate(240)" />
                            </g>
                          </g>
                        ) : d.id === 'wash' ? (
                          <g transform="translate(8,8) scale(1.6)">
                            <rect x="6" y="6" width="28" height="28" rx="6" fill="#ffffff06" />
                            <circle cx="20" cy="20" r="8" fill={`url(#g-${d.id})`} className={d.active ? 'animate-spin-slow' : ''} />
                          </g>
                        ) : d.id === 'lights' ? (
                          <g transform="translate(4,4) scale(1.6)">
                            <path d="M16 4c-3 0-5 3-5 6 0 3 2 4 5 9 3-5 5-6 5-9 0-3-2-6-5-6z" fill={`url(#g-${d.id})`} />
                          </g>
                        ) : d.id === 'fridge' ? (
                          <g transform="translate(6,4) scale(1.6)">
                            <rect x="4" y="4" width="16" height="28" rx="2" fill="#ffffff06" />
                            <rect x="6" y="6" width="6" height="10" rx="1" fill={`url(#g-${d.id})`} />
                          </g>
                        ) : d.id === 'ac' ? (
                          <g transform="translate(4,4) scale(1.6)">
                            <rect x="2" y="6" width="24" height="12" rx="2" fill="#ffffff06" />
                            <g transform="translate(14,12)" className={d.active ? 'animate-spin-slower' : ''}>
                              <circle r="6" fill={`url(#g-${d.id})`} />
                            </g>
                          </g>
                        ) : d.id === 'oven' ? (
                          <g transform="translate(4,4) scale(1.6)">
                            <rect x="2" y="6" width="24" height="20" rx="2" fill="#ffffff06" />
                            <rect x="6" y="10" width="12" height="8" rx="1" fill={`url(#g-${d.id})`} />
                          </g>
                        ) : (
                          <g transform="translate(6,6) scale(1.6)">
                            <rect x="4" y="4" width="20" height="20" rx="3" fill={`url(#g-${d.id})`} />
                          </g>
                        )}
                      </svg>

                      {/* tiny active pulse */}
                      <span className={`absolute -right-1 -top-1 w-3 h-3 rounded-full ${d.active ? 'bg-green-400/90 animate-pulse' : 'bg-white/10'}`} />
                    </div>

                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{d.label}</div>
                      <div className="text-xs text-white/60">{d.watt} W • {Math.round(d.efficiency * 100)}% eff</div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <div className="text-sm">{d.active ? 'On' : 'Off'}</div>
                      <button onClick={(e) => { e.stopPropagation(); toggleDevice(d.id); }} className={`px-2 py-1 cursor-pointer rounded-lg text-xs ${d.active ? 'bg-orange-300' : 'bg-zinc-500'}`}>{d.active ? 'Turn off' : 'Turn on'}</button>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* Energy flow canvas */}
          <div className="mt-6 rounded-xl p-4 bg-white/2 border border-white/6 shadow-inner relative overflow-hidden">
            <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="w-full h-[420px]">
              <defs>
                <linearGradient id="flowGrad" x1="0" x2="1">
                  <stop offset="0%" stopColor="#00ffff" />
                  <stop offset="100%" stopColor={themeColor} />
                </linearGradient>
                <filter id="softGlow">
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Main supply node */}
              <g className="cursor-pointer" transform={`translate(120,120)`}> 
                <circle r="48" fill="#ffffff06" stroke="#fff" strokeWidth="0.6" />
                <circle r="34" fill="url(#flowGrad)" style={{ filter: 'url(#softGlow)' }} />
                <text x="0" y="6" textAnchor="middle" fontSize="12" fill="#001" fontWeight={700}>MAIN</text>
              </g>

              {/* draw appliances as nodes and flow lines */}
              {devices.map((d, i) => {
                const angle = (i / devices.length) * Math.PI * 1.6 - 0.3;
                const r = 320;
                const x = 120 + Math.cos(angle) * r;
                const y = 120 + Math.sin(angle) * r * 0.7;
                const active = d.active;
                const glow = active ? 'url(#softGlow)' : undefined;
                const pathId = `flow-${d.id}`;
                const dashLen = active ? 0 : 8;
                return (
                  <g key={d.id} transform={`translate(${x},${y})`}>
                    {/* flow line */}
                    <path d={`M120,120 L${x},${y}`} stroke={active ? 'url(#flowGrad)' : '#ffffff10'} strokeWidth={active ? 3 : 1.2} fill="none" strokeLinecap="round" style={{ strokeDasharray: active ? '12 8' : '0', strokeDashoffset: pulse, filter: active ? 'url(#softGlow)' : 'none', transition: 'all 400ms ease' }} />

                    {/* appliance card */}
                    <g transform="translate(-60,-40)">
                      <rect x="0" y="0" width="120" height="80" rx="10" fill="#000" fillOpacity={0.15} stroke="#ffffff06" />

                      {/* device icon */}
                      <g transform="translate(12,12)">
                        <svg viewBox="0 0 48 48" width="40" height="40">
                          <defs>
                            <linearGradient id={`nodeGrad-${d.id}`} x1="0" x2="1">
                              <stop offset="0%" stopColor="#00ffff" />
                              <stop offset="100%" stopColor={themeColor} />
                            </linearGradient>
                          </defs>
                          {/* simplified larger icon */}
                          {d.id === 'fan' ? (
                            <g transform="translate(24,24) scale(0.9)">
                              <circle r="12" fill="#ffffff06" />
                              <g className={d.active ? 'animate-spin-slow' : ''}>
                                <path d="M0,-3 L6,-8 L6,8 Z" fill={`url(#nodeGrad-${d.id})`} />
                                <path d="M0,-3 L6,-8 L6,8 Z" fill={`url(#nodeGrad-${d.id})`} transform="rotate(120)" />
                                <path d="M0,-3 L6,-8 L6,8 Z" fill={`url(#nodeGrad-${d.id})`} transform="rotate(240)" />
                              </g>
                            </g>
                          ) : d.id === 'wash' ? (
                            <g transform="translate(16,16) scale(1.6)">
                              <rect x="2" y="2" width="20" height="20" rx="3" fill="#ffffff06" />
                              <circle cx="12" cy="12" r="6" fill={`url(#nodeGrad-${d.id})`} className={d.active ? 'animate-spin-slow' : ''} />
                            </g>
                          ) : d.id === 'fridge' ? (
                            <g transform="translate(8,6) scale(1.2)">
                              <rect x="2" y="2" width="18" height="28" rx="2" fill="#ffffff06" />
                              <rect x="4" y="5" width="6" height="8" rx="1" fill={`url(#nodeGrad-${d.id})`} />
                            </g>
                          ) : d.id === 'ac' ? (
                            <g transform="translate(6,6) scale(1.3)">
                              <rect x="2" y="8" width="22" height="10" rx="2" fill="#ffffff06" />
                              <circle cx="13" cy="13" r="5" fill={`url(#nodeGrad-${d.id})`} className={d.active ? 'animate-spin-slower' : ''} />
                            </g>
                          ) : (
                            <g transform="translate(8,6) scale(1.2)">
                              <rect x="2" y="2" width="18" height="18" rx="3" fill={`url(#nodeGrad-${d.id})`} />
                            </g>
                          )}

                        </svg>
                      </g>

                      <foreignObject x="56" y="8" width="52" height="64">
                        <div xmlns="http://www.w3.org/1999/xhtml" className="w-full h-full flex flex-col justify-center">
                          <div className="text-xs font-semibold">{d.label}</div>
                          <div className="text-[10px] text-white/60">{d.watt} W</div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full" style={{ background: efficiencyColor(d.efficiency) }} />
                            <div className="text-[10px] text-white/60">{Math.round(d.efficiency * 100)}% eff</div>
                          </div>
                        </div>
                      </foreignObject>

                    </g>

                  </g>
                );
              })}

              {/* floating particles */}
              {Array.from({ length: 24 }).map((_, i) => {
                const px = 200 + ((i * 37) % 800);
                const py = 60 + ((i * 73) % 320);
                const a = (i % 5) / 10 + 0.4;
                return <circle key={i} cx={px} cy={py} r={Math.max(1, (i % 3) + 0.6)} fill={i % 2 ? themeColor : '#00ffff'} opacity={0.12} />;
              })}
            </svg>

            {/* small overlay controls */}
            <div className="absolute right-4 top-4 flex gap-2">
              <button className="px-3 py-1 bg-white/6 rounded-lg text-sm">Export</button>
              <button className="px-3 py-1 bg-white/6 rounded-lg text-sm">Snapshot</button>
            </div>
          </div>
        </div>

        {/* Right: detail pane */}
        <div className="w-[360px]  flex-shrink-0">
          <div className="backdrop-blur-sm bg-white/3 rounded-2xl p-4 border border-white/6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-white/70">Quick Insights</div>
                <div className="text-2xl font-bold">₹ {(totals.cost).toFixed(2)}</div>
              </div>
              <div className="text-right text-xs text-white/60">Updated just now</div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="text-white/70">Carbon est.</div>
                <div className="font-semibold">{(totals.kWh * 0.85).toFixed(2)} kg</div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="text-white/70">Peak device</div>
                <div className="font-semibold">{devices.reduce((m, d) => (d.active && d.watt > (m?.watt||0) ? d : m), null)?.label || '—'}</div>
              </div>

              <div className="mt-2">
                <div className="text-xs text-white/70">Legend</div>
                <div className="flex gap-2 mt-1">
                  <div className="w-6 h-2 rounded bg-gradient-to-r from-cyan-400 to-pink-500" />
                  <div className="w-6 h-2 rounded bg-gradient-to-r from-green-400 to-yellow-300" />
                  <div className="w-6 h-2 rounded bg-gradient-to-r from-red-400 to-pink-400" />
                </div>
              </div>

              <div className="mt-3">
                <div className="text-xs text-white/70">Recent Events</div>
                <ul className="mt-2 text-sm text-white/70 space-y-1">
                  <li>Lights turned on — 2m ago</li>
                  <li>Washing started — 10m ago</li>
                  <li>AC scheduled at 19:00 — tomorrow</li>
                </ul>
              </div>

            </div>
          </div>

          {/* expanded device detail panel */}
          <AnimatePresence>
            {expanded && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mt-4 backdrop-blur-sm bg-white/3 rounded-2xl p-4 border border-white/6 shadow-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">{devices.find(d => d.id === expanded)?.label}</div>
                    <div className="text-xs text-white/60">Detailed metrics</div>
                  </div>
                  <div className="text-xs text-white/60">{devices.find(d => d.id === expanded)?.watt} W</div>
                </div>

                <div className="mt-3">
                  <div className="text-xs text-white/70">Usage (last hour)</div>
                  <svg viewBox="0 0 200 60" className="w-full mt-2 h-12">
                    <polyline points="0,40 30,28 60,22 90,18 120,20 150,14 180,16 200,12" fill="none" stroke={themeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>

                  <div className="mt-3 flex items-center justify-between text-sm">
                    <div className="text-white/70">Cost / hr</div>
                    <div className="font-semibold">₹ {(devices.find(d => d.id === expanded)?.watt / 1000 * costPerKWh).toFixed(2)}</div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button className="flex-1 py-2 rounded-lg bg-white/6 cursor-pointer">Schedule</button>
                    <button className="flex-1 py-2 rounded-lg bg-orange-400 cursor-pointer" onClick={() => { setDevices(devices.map(dd => dd.id === expanded ? { ...dd, active: !dd.active } : dd)); }}>{devices.find(d => d.id === expanded)?.active ? 'Turn off' : 'Turn on'}</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      <style>{`
        .animate-spin-slow{animation: spin 3.6s linear infinite}
        .animate-spin-slower{animation: spin 6s linear infinite}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
      `}</style>

    </div>
  );
}

/* ----------------------
   Main page component
   ---------------------- */
export default function ApplianceEnergyAnalyzerPage() {
  // Inputs
  const [applianceName, setApplianceName] = useState("Room Heater");
  const [powerW, setPowerW] = useState("1500"); // watts
  const [quantity, setQuantity] = useState("1");
  const [hoursPerDay, setHoursPerDay] = useState("3");
  const [days, setDays] = useState("30");
  const [tariff, setTariff] = useState("0.12"); // $ per kWh (or currency)
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [unit, setUnit] = useState("kWh"); // display unit
  const [running, setRunning] = useState(true);

  // live reading simulation (power fluctuates around powerW)
  const [livePower, setLivePower] = useState(() => Number(powerW));
  const historyRef = useRef([]);
  const [history, setHistory] = useState([]);

  const snapshotRef = useRef(null);

  // parse numeric inputs helper
  const n = (v, fallback = 0) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  };

  // Derived calculations
  const singleDailyKWh = useMemo(() => {
    // kWh per day for a single appliance
    return (n(powerW, 0) * n(hoursPerDay, 0)) / 1000;
  }, [powerW, hoursPerDay]);

  const totalKWh = useMemo(() => {
    // total kWh over period for all units
    return singleDailyKWh * n(quantity, 1) * n(days, 1);
  }, [singleDailyKWh, quantity, days]);

  const totalCost = useMemo(() => {
    return totalKWh * n(tariff, 0);
  }, [totalKWh, tariff]);

  // Live simulation loop (push power sample every second)
  useEffect(() => {
    let mounted = true;
    let t = 0;
    const targetPower = n(powerW, 0) * n(quantity, 1);

    function step() {
      if (!mounted) return;
      // small random fluctuation around target power (±6%)
      const noise = (Math.random() - 0.5) * 0.12 * targetPower;
      const reading = Math.max(0, targetPower + noise);
      setLivePower(reading);
      // add to history with timestamp t (seconds)
      setHistory((h) => {
        const next = h.slice();
        next.push({ t: Date.now(), P: reading });
        if (next.length > 3600) next.shift(); // keep last 3600 samples (~1 hour at 1s)
        return next;
      });
      t += 1;
    }

    const id = setInterval(() => {
      if (running) step();
      // else: paused state; do not generate new samples
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [powerW, quantity, running]);

  // Chart data for live chart (sample last N)
  const chartData = useMemo(() => {
    const last = history.slice(-120); // last 120 seconds
    // convert to seconds from now for x-axis
    const now = Date.now();
    return last.map((d, idx) => ({
      t: Math.round((d.t - now) / 1000), // negative seconds relative to now
      P: round(d.P, 2),
    }));
  }, [history]);

  // daily breakdown for bar chart (simple partition: total / days)
  const dailyBars = useMemo(() => {
    const d = n(days, 1);
    if (d <= 0) return [];
    const perDay = totalKWh / d;
    return Array.from({ length: Math.min(d, 30) }).map((_, i) => ({ day: `Day ${i + 1}`, kWh: round(perDay, 3) }));
  }, [totalKWh, days]);

  /* ----------------------
     CSV & PNG exports
     ---------------------- */
  const exportCSV = () => {
    const rows = [
      ["timestamp", "power_w"],
      ...history.map((r) => [new Date(r.t).toISOString(), round(r.P, 3)]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appliance-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const snapshotPNG = async () => {
    const node = snapshotRef.current || document.querySelector(".appliance-snapshot");
    if (!node) {
      toast.error("Snapshot area not found");
      return;
    }
    try {
      const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2, backgroundColor: "#000" });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `appliance-snapshot-${Date.now()}.png`;
      link.click();
      toast.success("Snapshot saved");
    } catch (err) {
      console.error(err);
      toast.error("Snapshot failed");
    }
  };

  /* ----------------------
     UI actions
     ---------------------- */
  const toggleRunning = () => {
    setRunning((r) => {
      const nxt = !r;
      toast(nxt ? "Live readings resumed" : "Live readings paused");
      return nxt;
    });
  };

  const resetDefaults = () => {
    setApplianceName("Room Heater");
    setPowerW("1500");
    setQuantity("1");
    setHoursPerDay("3");
    setDays("30");
    setTariff("0.12");
    setCurrencySymbol("$");
    toast("Defaults restored");
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  /* ----------------------
     Small helper displays
     ---------------------- */
  const approximateCurrentA = useMemo(() => {
    // estimate current using P = V * I, assume 230V AC (or add a selector later)
    const Vline = 230;
    return round((n(powerW, 0) / Vline) * n(quantity, 1), 3);
  }, [powerW, quantity]);

  const totalCostDisplay = `${currencySymbol}${round(totalCost, 2)}`;
  const totalKWhDisplay = `${round(totalKWh, 3)} ${unit}`;

  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
           <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2 sm:py-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo / Brand */}
            <motion.div
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.36 }}
              className="flex items-center gap-3 cursor-pointer select-none"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
                <Zap className="w-5 h-5 text-black" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-200 truncate">SparkLab</div>
                <div className="text-xs text-zinc-400 -mt-0.5">Appliance Energy Analyzer</div>
              </div>
            </motion.div>

            {/* Desktop Controls */}
            <div className="hidden md:flex items-center gap-3">
              <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">
                Live:
                <span className="text-[#00ffbf] ml-1">
                  {running ? "ON" : "PAUSED"}
                </span>
              </Badge>

              <Button
                className="cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black px-3 py-1 rounded-lg shadow-md"
                onClick={snapshotPNG}
              >
                <Camera className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Snapshot</span>
              </Button>

              <Button
                variant="ghost"
                className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg"
                onClick={toggleRunning}
              >
                {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>

              <Button
                variant="ghost"
                className="border cursor-pointer border-zinc-700 text-zinc-300 p-2 rounded-lg"
                onClick={resetDefaults}
              >
                <Settings className="w-5 h-5" />
              </Button>
            </div>

            {/* Mobile Menu Button */}
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
        </div>
      </header>

      {/* Mobile Dropdown Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed top-14 left-0 right-0 z-40 bg-black/90 border-b border-zinc-800 shadow-lg md:hidden"
          >
            <div className="p-4 flex flex-col gap-3">
          

              <Button
                className="w-full cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black shadow-md"
                onClick={() => {
                  snapshotPNG();
                  setMobileOpen(false);
                }}
              >
                <Camera className="w-4 h-4 mr-2" /> Snapshot
              </Button>

              <Button
                variant="outline"
                className="w-full cursor-pointer  border border-zinc-700 text-black"
                onClick={() => {
                  toggleRunning();
                  setMobileOpen(false);
                }}
              >
                {running ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" /> Resume
                  </>
                )}
              </Button>

              <Button
                variant="ghost"
                className="w-full cursor-pointer border border-zinc-700 bg-white text-black"
                onClick={() => {
                  resetDefaults();
                  setMobileOpen(false);
                }}
              >
                <Settings className="w-4 h-4 mr-2" /> Reset Defaults
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-16"></div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left controls */}
          <div className="lg:col-span-4 col-span-10 space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Appliance Analyzer</div>
                        <div className="text-xs text-zinc-400">kWh • Cost • Live readings</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-black/80 border border-orange-500 text-orange-300 px-3 py-1 rounded-full">Mode</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-xs text-zinc-400">Appliance Name</label>
                      <Input value={applianceName} onChange={(e) => setApplianceName(e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Power (W) per unit</label>
                      <Input value={powerW} onChange={(e) => setPowerW(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-zinc-400">Quantity</label>
                        <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-zinc-400">Hours / day</label>
                        <Input value={hoursPerDay} onChange={(e) => setHoursPerDay(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-zinc-400">Days</label>
                        <Input value={days} onChange={(e) => setDays(e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-zinc-400">Tariff ({currencySymbol} / kWh)</label>
                        <Input value={tariff} onChange={(e) => setTariff(e.target.value)} type="number" step="0.01" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400">Currency</label>
                      <div className="flex gap-2 mt-1">
                        <Input value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} className="w-20 bg-zinc-900/60 border border-zinc-800 text-white" />
                        <Select value={unit} onValueChange={(v) => setUnit(v)} className="w-32">
                          <SelectTrigger className="w-full cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md">
                            <SelectItem   className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="kWh">kWh</SelectItem>
                            <SelectItem   className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="Wh">Wh</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-black/70 border border-orange-500/30 text-white px-3 py-2 rounded-full shadow-sm backdrop-blur-sm text-xs flex flex-wrap gap-2 items-center">
                    <span>Estimated energy: <span className="text-[#ff9a4a] font-semibold ml-1">{round(singleDailyKWh * n(quantity, 1), 3)} kWh/day</span></span>
                    <span>•</span>
                    <span>Total: <span className="text-[#ffd24a] font-semibold ml-1">{totalKWhDisplay}</span></span>
                    <span>•</span>
                    <span>Cost: <span className="text-[#ff9a4a] font-semibold ml-1">{totalCostDisplay}</span></span>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-2">
                      <Button className="px-3 py-2 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Start</Button>
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

          {/* Right visual + charts */}
          <div className="lg:col-span-8 col-span-10 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[#ffd24a]">Live Visualizer</div>
                        <div className="text-xs text-zinc-400">3D • SVG • Live power</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Appliance: <span className="text-[#ffd24a] ml-1">{applianceName}</span></Badge>
                      <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Live P: <span className="text-[#ff9a4a] ml-1">{round(livePower, 2)} W</span></Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="w-full max-w-full overflow-hidden snapshot appliance-snapshot" ref={snapshotRef}>
                  {/* Top visual row */}
                  <div className="grid grid-cols-1  gap-3 items-stretch">
                   

                    <div className="col-span-1 flex flex-col gap-3">
                      {/* Three / 3D or fallback */}
                      <div className="rounded-xl border border-zinc-800 bg-black/60 p-2">
                        <div className="text-xs text-zinc-400 mb-2">3D Appliance (stylized)</div>
                        <ThreeAppliance power={Number(powerW)} color="#ff7a2d" />
                      </div>

                      {/* quick metrics */}
                      <div className="rounded-xl border border-zinc-800 bg-black/60 p-3">
                        <div className="text-xs text-zinc-400">Instant Power (live)</div>
                        <div className="text-2xl font-semibold text-[#ff9a4a]">{round(livePower, 2)} W</div>
                        <div className="text-xs text-zinc-400 mt-2">Approx. current: <span className="text-[#00ffbf] font-semibold ml-1">{approximateCurrentA} A</span></div>
                        <div className="mt-3 flex gap-2">
                          <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={snapshotPNG}><Camera className="w-4 h-4 mr-2" /> Snapshot</Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Charts */}
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl p-3 bg-black/70 border border-zinc-800">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-orange-400">Live Power (last 2 min)</div>
                        <div className="text-xs text-zinc-400">{running ? "Live" : "Paused"}</div>
                      </div>
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
                            <XAxis dataKey="t" tick={{ fill: "#888" }} tickFormatter={(v) => `${v}s`} />
                            <YAxis tick={{ fill: "#888" }} />
                            <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff", borderRadius: "10px" }} />
                            <Legend wrapperStyle={{ color: "#aaa" }} />
                            <Line type="monotone" dataKey="P" stroke="#ff9a4a" strokeWidth={2} dot={false} isAnimationActive={false} name="P (W)" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-xl p-3 bg-black/70 border border-zinc-800">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-orange-400">Daily kWh breakdown</div>
                        <div className="text-xs text-zinc-400">Estimated</div>
                      </div>
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dailyBars}>
                            <CartesianGrid stroke="#111" strokeDasharray="3 3" />
                            <XAxis dataKey="day" tick={{ fill: "#888" }} />
                            <YAxis tick={{ fill: "#888" }} />
                            <Bar dataKey="kWh" fill="#ffd24a" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* summary */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Estimated Total Energy</div>
                      <div className="text-lg font-semibold text-[#ff9a4a]">{totalKWhDisplay}</div>
                      <div className="text-xs text-zinc-400 mt-1">Over {days} days • {quantity} units</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Estimated Cost</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">{totalCostDisplay}</div>
                      <div className="text-xs text-zinc-400 mt-1">Tariff: {currencySymbol}{n(tariff, 0)} / kWh</div>
                    </div>

                    <div className="rounded-md p-3 bg-zinc-900/40 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Live Snapshot</div>
                      <div className="text-lg font-semibold text-[#00ffbf]">{round(livePower, 2)} W</div>
                      <div className="text-xs text-zinc-400 mt-1">Samples: {history.length}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Extra controls / actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-10">
                <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-[#ffd24a] flex items-center gap-2"><Gauge className="w-5 h-5" /> Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex-1" onClick={snapshotPNG}><Camera className="w-4 h-4 mr-2" /> Snapshot</Button>
                      <Button variant="outline" className="text-white" onClick={exportCSV}><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
                      <Button variant="ghost" className="border border-zinc-800 text-zinc-300" onClick={resetDefaults}><Settings className="w-4 h-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="col-span-10">
                <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-[#ffd24a]">Tips</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-zinc-400 flex gap-2 items-start">
                      <Lightbulb className="text-orange-400 mt-0.5" />
                      <div>
                        Use accurate appliance power or measure with a meter for precise estimates. Tariff rates vary by region — enter your local rate.
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
         <div className="col-span-10 mt-10 appliance-snapshot">
                      {/* SVG visualizer */}
                      <SVGVisualizer power={Number(powerW) * Number(quantity)} themeColor="#ff7a2d" />
                    </div>
      </main>

      {/* mobile sticky controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[92%] sm:w-auto sm:left-auto sm:translate-x-0 sm:bottom-6 sm:right-6 lg:hidden">
        <div className="flex items-center justify-between gap-3 bg-black/80 border border-zinc-800 p-3 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black text-sm" onClick={() => setRunning(true)}><Play className="w-4 h-4 mr-2" /> Start</Button>
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
