// src/components/EnergyVisualizer.jsx
import React, { useMemo } from "react";
import { CircuitBoard } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Dynamic SVG visualizer showing appliances as modules on a bus.
 * - appliances: array with baseWatts, quantity, enabled
 * - efficiencyFactor affects color/speed
 */
export default function EnergyVisualizer({ appliances = [], efficiencyFactor = 1.0, totals = {}, history = [] }) {
  const totalWatts = totals?.watts ?? 0;
  const abs = Math.max(0.001, totalWatts / 1000); // scale factor
  const dotCount = Math.min(24, Math.max(4, Math.round(abs * 6))); // number of animated dots
  const speed = Math.max(0.4, Math.min(3.2, 1.6 / (abs + 0.01))); // seconds per cycle

  const enabledAppliances = appliances.filter((a) => a.enabled);
  const svgWidth = Math.max(900, 240 + enabledAppliances.length * 160);
  const startX = 140;
  const spacing = Math.max(120, Math.floor((svgWidth - startX - 160) / Math.max(1, enabledAppliances.length)));

  const formatPower = (w) => `${Math.round(w)} W`;

  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-black/40 to-zinc-900/20 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center">
            <CircuitBoard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#ffd24a]">Energy Circuit Visualizer</div>
            <div className="text-xs text-zinc-400">Live flow • reactive animation • efficiency factor: <span className="text-white">{Math.round(efficiencyFactor * 100)}%</span></div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Total: <span className="text-[#ff9a4a] ml-1">{formatPower(totalWatts)}</span></Badge>
          <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-full">Monthly: <span className="text-[#9ee6ff] ml-1">{Math.round(totals?.monthlyKWh ?? 0)} kWh</span></Badge>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} 280`} className="w-full h-64">
          {/* bus */}
          <path d={`M 40 120 H ${svgWidth - 40}`} stroke="#111" strokeWidth="8" strokeLinecap="round" />

          {enabledAppliances.map((a, i) => {
            const x = startX + i * spacing;
            const wattsEach = (Number(a.baseWatts) || 0) * (Number(a.quantity) || 1) * efficiencyFactor;
            const color = wattsEach > 1000 ? "#ff6a6a" : wattsEach > 200 ? "#ffd24a" : "#9ee6ff";
            return (
              <g key={a.id}>
                <path d={`M ${x} 120 V 50`} stroke="#111" strokeWidth="6" strokeLinecap="round" />
                <g transform={`translate(${x}, 30)`}> 
                  <rect x="-48" y="-20" width="96" height="44" rx="8" fill="#060606" stroke="#222" />
                  <text x="-40" y="-2" fontSize="11" fill="#ffd24a">{a.name}</text>
                  <text x="-40" y="14" fontSize="11" fill="#fff">{Math.round(wattsEach)} W</text>
                </g>

                {/* animated dots flowing down into bus */}
                {Array.from({ length: Math.max(2, Math.round((wattsEach / 200) + 1)) }).map((_, di) => {
                  const pathStr = `M ${x} 50 V 120 H ${x + 24}`;
                  const delay = (di / Math.max(1, dotCount)) * speed;
                  const style = {
                    offsetPath: `path('${pathStr}')`,
                    animationName: "flowEnergy",
                    animationDuration: `${speed}s`,
                    animationTimingFunction: "linear",
                    animationDelay: `${-delay}s`,
                    animationIterationCount: "infinite",
                    animationPlayState: "running",
                    transformOrigin: "0 0",
                  };
                  const dotColor = color;
                  const r = 4 + Math.min(6, Math.round((wattsEach / 500)));
                  return <circle key={`dot-${i}-${di}`} r={r} fill={dotColor} style={style} />;
                })}
              </g>
            );
          })}

          {/* readout */}
          <g transform={`translate(${svgWidth - 220}, 40)`}>
            <rect x="-20" y="-20" width="200" height="130" rx="10" fill="#060606" stroke="#222" />
            <text x="0" y="0" fontSize="12" fill="#ffb57a">Readouts</text>
            <text x="0" y="26" fontSize="12" fill="#fff">Power: <tspan fill="#ff9a4a">{Math.round(totalWatts)} W</tspan></text>
            <text x="0" y="48" fontSize="12" fill="#fff">kW: <tspan fill="#00ffbf">{(totalWatts/1000).toFixed(3)} kW</tspan></text>
            <text x="0" y="70" fontSize="12" fill="#fff">Monthly kWh: <tspan fill="#9ee6ff">{Math.round((totalWatts/1000)*24*30)} kWh</tspan></text>
          </g>

          <style>{`
            @keyframes flowEnergy {
              0% { offset-distance: 0%; opacity: 0.95; transform: translate(-2px,-2px) scale(0.95); }
              45% { opacity: 0.9; transform: translate(0,0) scale(1.05); }
              100% { offset-distance: 100%; opacity: 0; transform: translate(6px,6px) scale(0.8); }
            }
            circle[style] { will-change: offset-distance, transform, opacity; }
            @media (max-width: 640px) { text{font-size:9px;} }
          `}</style>
        </svg>
      </div>
    </div>
  );
}
