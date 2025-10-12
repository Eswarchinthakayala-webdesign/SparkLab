// src/components/LabReportVisualizer.jsx
import React from "react";
import LabReportChart from "./LabReportChart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/**
 * Visualizer: shows chart + small stat cards
 */
export default function LabReportVisualizer({ chartData = [], calculations = "", observationsCount = 0 }) {
  return (
    <Card className="bg-[#070707] border border-zinc-800 text-white">
      <CardHeader>
        <CardTitle className="text-[#ffd24a]">Visualizer</CardTitle>
      </CardHeader>
      <CardContent>
        <LabReportChart data={chartData} />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="p-3 bg-[#0b0b0c] border border-zinc-800 rounded text-center">
            <div className="text-xs text-zinc-400">Calc</div>
            <div className="text-lg text-[#ffb84a] font-semibold">{String(calculations).split("\n")[0] || "—"}</div>
          </div>
          <div className="p-3 bg-[#0b0b0c] border border-zinc-800 rounded text-center">
            <div className="text-xs text-zinc-400">Points</div>
            <div className="text-lg text-[#00ffbf] font-semibold">{observationsCount}</div>
          </div>
          <div className="p-3 bg-[#0b0b0c] border border-zinc-800 rounded text-center">
            <div className="text-xs text-zinc-400">Result</div>
            <div className="text-lg text-[#ffd24a] font-semibold">Auto</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
