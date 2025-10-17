// src/components/ProEnergyVisualizer.jsx
import React, { useMemo, useState } from "react";
import { CircuitBoard, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function ProEnergyVisualizer({ appliances = [], efficiencyFactor = 1.0, totals = {} }) {
  const totalWatts = totals?.watts ?? 0;
  const abs = Math.max(0.001, totalWatts / 1000);
  const dotCount = Math.min(32, Math.max(4, Math.round(abs * 8)));
  const speed = Math.max(0.4, Math.min(3.2, 1.2 / (abs + 0.01)));

  const enabledAppliances = appliances.filter(a => a.enabled);
  const svgWidth = Math.max(900, 240 + enabledAppliances.length * 180);
  const startX = 140;
  const spacing = Math.max(120, Math.floor((svgWidth - startX - 160) / Math.max(1, enabledAppliances.length)));

  const formatPower = w => `${Math.round(w)} W`;

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/60 to-zinc-900/30 border border-zinc-800 overflow-hidden shadow-xl">
      <div className="flex items-start md:items-center md:flex-row flex-col justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-md bg-gradient-to-tr from-[#ff7a2d]/70 to-[#ffd24a]/60 text-black flex items-center justify-center shadow-lg">
            <CircuitBoard className="w-6 h-6 animate-pulse text-[#ffd24a]" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a] tracking-wide">
              Energy Circuit Pro Visualizer
            </div>
            <div className="text-xs text-zinc-400">
              Real-time energy flow • reactive modules • efficiency:{" "}
              <span className="text-white">{Math.round(efficiencyFactor * 100)}%</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">
            Total: <span className="text-[#ff9a4a] ml-1">{formatPower(totalWatts)}</span>
          </Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">
            Monthly: <span className="text-[#9ee6ff] ml-1">{Math.round((totalWatts/1000)*24*30)} kWh</span>
          </Badge>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} 300`} className="w-full h-64">
          {/* Bus */}
          <path d={`M 40 150 H ${svgWidth - 40}`} stroke="#111" strokeWidth="10" strokeLinecap="round" />

          {enabledAppliances.map((a, i) => {
            const x = startX + i * spacing;
            const wattsEach = (Number(a.baseWatts) || 0) * (Number(a.quantity) || 1) * efficiencyFactor;
            const color = wattsEach > 1000 ? "#ff6a6a" : wattsEach > 200 ? "#ffd24a" : "#9ee6ff";
            const r = 4 + Math.min(6, Math.round(wattsEach / 400));

            return (
              <g key={a.id}>
                {/* Branch to appliance */}
                <path d={`M ${x} 150 V 70`} stroke="#111" strokeWidth="6" strokeLinecap="round" />

                {/* Appliance Module */}
                <g transform={`translate(${x}, 50)`}>
                  <rect x="-50" y="-25" width="100" height="50" rx="12" fill="#080808" stroke="#222" strokeWidth="2" />
                  <rect x="-46" y="-21" width="92" height="42" rx="10" fill={color} opacity={0.85} />
                  <text x="-40" y="-2" fontSize="11" fill="#111" className="font-semibold">{a.name}</text>
                  <text x="-40" y="14" fontSize="10" fill="#fff">{Math.round(wattsEach)} W</text>

                  {/* Tooltip */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <circle cx="30" cy="0" r="8" fill="#ffb84a" className="cursor-pointer animate-pulse" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-black/90 text-orange-100 border border-orange-600 rounded-lg p-2 text-xs">
                      {a.name} <br /> Base: {a.baseWatts} W × {a.quantity} <br />
                      Effective: {Math.round(wattsEach)} W
                    </TooltipContent>
                  </Tooltip>
                </g>

                {/* Animated flow dots */}
                {Array.from({ length: dotCount }).map((_, di) => {
                  const pathStr = `M ${x} 50 V 150 H ${x + 24}`;
                  const delay = (di / Math.max(1, dotCount)) * speed;
                  const style = {
                    offsetPath: `path('${pathStr}')`,
                    animationName: "flowPro",
                    animationDuration: `${speed}s`,
                    animationTimingFunction: "linear",
                    animationDelay: `${-delay}s`,
                    animationIterationCount: "infinite",
                    animationPlayState: "running",
                    transformOrigin: "0 0",
                  };
                  return <circle key={`dot-${i}-${di}`} r={r} fill={color} style={style} />;
                })}
              </g>
            );
          })}

          {/* Readout Panel */}
          <g transform={`translate(${svgWidth - 240}, 40)`}>
            <rect x="-20" y="-20" width="220" height="140" rx="12" fill="#060606" stroke="#222" />
            <text x="0" y="0" fontSize="12" fill="#ffb57a">Live Readouts</text>
            <text x="0" y="28" fontSize="12" fill="#fff">Power: <tspan fill="#ff9a4a">{Math.round(totalWatts)} W</tspan></text>
            <text x="0" y="50" fontSize="12" fill="#fff">kW: <tspan fill="#00ffbf">{(totalWatts/1000).toFixed(3)} kW</tspan></text>
            <text x="0" y="72" fontSize="12" fill="#fff">Monthly kWh: <tspan fill="#9ee6ff">{Math.round((totalWatts/1000)*24*30)} kWh</tspan></text>
          </g>

          <style>{`
            @keyframes flowPro {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.9); }
              45% { opacity: 0.85; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) { text { font-size: 9px; } }
          `}</style>
        </svg>
      </div>
    </div>
  );
}
