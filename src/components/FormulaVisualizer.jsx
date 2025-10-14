// src/pages/FormulaVisualizer.jsx
import React, { useRef } from "react";
import { Zap } from "lucide-react";
import { toPng } from "html-to-image";
import { Card } from "@/components/ui/card";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function FormulaVisualizer({ formula, computed, onImageReady }) {
  const svgRef = useRef();
  const round = (v, p = 6) =>
  Number.isFinite(v) ? Math.round(v * 10 ** p) / 10 ** p : v;
  const handleCapture = async () => {
    if (!svgRef.current) return;
    const img = await toPng(svgRef.current);
    onImageReady(img);
  };

  React.useEffect(() => {
    handleCapture();
  }, [formula, computed]);

  const chartData = Object.keys(computed)
    .filter((k) => !k.endsWith("_unit"))
    .map((k) => ({
      name: k,
      value: computed[k],
    }));

  return (
    <div className="flex flex-col gap-4">
      {/* SVG Visual */}
      <div
        ref={svgRef}
        className="w-full rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/10 border border-zinc-800"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#ffd24a]">{formula.title}</div>
            <div className="text-xs text-zinc-400">{formula.description}</div>
          </div>
        </div>

        {/* simple category-based render */}
        <svg viewBox="0 0 420 140" className="w-full h-36">
          <rect x="20" y="20" width="380" height="100" rx="10" fill="#060606" stroke="#222" />
          {formula.category === "Capacitor" && (
            <>
              <line x1="210" y1="40" x2="210" y2="100" stroke="#ffd24a" strokeWidth="4" />
              <rect x="200" y="44" width="20" height="32" rx="3" fill="#ffb86b" />
              {computed.Q && (
                <text x="210" y="10" textAnchor="middle" fontSize="12" fill="#00ffbf">
                  Q: {round(computed.Q, 9)} {computed.Q_unit}
                </text>
              )}
            </>
          )}
        </svg>
      </div>

      {/* Recharts Visualization */}
      <Card className="bg-black/40 border border-zinc-800 p-4">
        <div className="text-xs text-zinc-400 mb-2">Visualizer Data Chart</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" stroke="#ccc" />
            <YAxis stroke="#ccc" />
            <Tooltip />
            <Bar dataKey="value" fill="#ff7a2d" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
