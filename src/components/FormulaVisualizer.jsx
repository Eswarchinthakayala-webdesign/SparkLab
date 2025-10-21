// src/pages/FormulaVisualizer.jsx
import React, { useRef, useEffect } from "react";
import { toPng } from "html-to-image";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  BarChart2,
  Zap,
  Sigma,
  Info,
  Calculator,
} from "lucide-react";

export default function FormulaVisualizer({ formula, computed = {}, onImageReady }) {
  const svgRef = useRef();
  const round = (v, p = 6) =>
    Number.isFinite(v) ? Math.round(v * 10 ** p) / 10 ** p : v;

  // Capture for PDF generation
  const handleCapture = async () => {
    if (!svgRef.current) return;
    try {
      const img = await toPng(svgRef.current);
      onImageReady && onImageReady(img);
    } catch (err) {
      console.error("Image capture failed:", err);
    }
  };

  useEffect(() => {
    handleCapture();
  }, [formula, computed]);

  // Extract formula data
  const title =
    typeof formula === "object" ? formula?.title || "Formula Visualizer" : formula;
  const expression =
    typeof formula === "object" ? formula?.formula || "" : "";
  const description =
    typeof formula === "object" ? formula?.description || "" : "";

  // Prepare chart data
  const computedPoints = Object.keys(computed)
    .filter((k) => !k.endsWith("_unit"))
    .map((k, i) => ({
      name: k,
      value: computed[k],
      index: i + 1,
    }));

  // Add origin (0, 0) at start for clarity
  const chartData = [{ name: "0", value: 0 }, ...computedPoints];

  // Result List
  const results = computedPoints.map((d) => ({
    key: d.name,
    value: round(d.value, 6),
    unit: computed[`${d.name}_unit`] || "",
  }));

  return (
    <div className="flex flex-col gap-6 text-zinc-200">
      {/* Header Section */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-[#ffb84a]">
          <Zap className="w-5 h-5" />
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        {expression && (
          <Badge
            variant="outline"
            className="border-[#ff7a2d] text-[#ff7a2d] bg-black/40 px-3 py-1 text-sm"
          >
            {expression}
          </Badge>
        )}
      </div>

      {/* Description */}
      <Card className="bg-gradient-to-b from-zinc-950 to-zinc-900/60 border border-zinc-800">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 text-[#ffb84a]">
            <Info className="w-4 h-4" />
            <CardTitle className="text-sm font-semibold">Description</CardTitle>
          </div>
          <CardDescription className="text-zinc-400 text-sm mt-1">
            {description || "No description available for this formula."}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Chart Visualization */}
      <Card
        ref={svgRef}
        className="bg-gradient-to-b from-black/60 to-zinc-900/40 border border-zinc-800 shadow-inner"
      >
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 text-[#ff9a4a]">
            <BarChart2 className="w-4 h-4" />
            <CardTitle className="text-sm font-semibold">
              Computed Parameter Visualization
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff7a2d" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#ff7a2d" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#222" strokeDasharray="4 4" />
              <XAxis
                dataKey="name"
                stroke="#aaa"
                tick={{ fill: "#aaa", fontSize: 12 }}
                label={{
                  value: "Parameter",
                  position: "insideBottom",
                  offset: -2,
                  fill: "#888",
                  fontSize: 11,
                }}
              />
              <YAxis
                stroke="#aaa"
                tick={{ fill: "#aaa", fontSize: 12 }}
                label={{
                  value: "Value",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#888",
                  fontSize: 11,
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0b0b0b",
                  border: "1px solid #333",
                  borderRadius: "8px",
                  color: "#ffb84a",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#ff7a2d"
                strokeWidth={2.5}
                strokeDasharray="5 3"
                fill="url(#colorVal)"
                activeDot={{ r: 6, fill: "#ffb84a", stroke: "#000", strokeWidth: 1 }}
                dot={{ r: 3, fill: "#ffb84a" }}
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Computed Results */}
      <Card className="bg-gradient-to-b from-black/60 to-zinc-900/40 border border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-3 text-[#00ffbf]">
          <Calculator className="w-4 h-4" />
          <h3 className="text-sm font-semibold">Computed Results</h3>
        </div>
        <Separator className="mb-3 bg-zinc-700/40" />
        <div className="flex flex-wrap gap-3">
          {results.length === 0 ? (
            <p className="text-xs text-zinc-500">No computed results available.</p>
          ) : (
            results.map((res) => (
              <Badge
                key={res.key}
                className="bg-zinc-900 border border-zinc-800 text-zinc-200 px-3 py-2 text-sm flex items-center gap-1 shadow-sm hover:bg-zinc-800/70"
              >
                <Sigma className="w-3.5 h-3.5 text-[#ffd24a]" />
                <span className="font-semibold text-[#ffd24a]">{res.key}:</span>
                <span className="text-white ml-1">
                  {res.value} {res.unit}
                </span>
              </Badge>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
