import React from "react";
import { motion } from "framer-motion";
import {
  Calculator,
  Database,
  Award,
  Activity,
  BarChart3,
} from "lucide-react";
import LabReportChart from "./LabReportChart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/**
 * Enhanced Visualizer — futuristic, interactive, and professional.
 */
export default function LabReportVisualizer({
  chartData = [],
  calculations = "",
  observationsCount = 0,
  analysisSummary = "",
}) {
  const calcLine = String(calculations).split("\n")[0] || "—";

  const statCards = [
    {
      label: "Calculation",
      value: calcLine,
      color: "text-[#ffb84a]",
      icon: Calculator,
    },
    {
      label: "Data Points",
      value: observationsCount,
      color: "text-[#00ffbf]",
      icon: Database,
    },
    {
      label: "Result",
      value: "Auto",
      color: "text-[#ffd24a]",
      icon: Award,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card className="bg-[#080808]/90 border border-zinc-800 backdrop-blur-xl rounded-2xl shadow-lg shadow-orange-500/10 overflow-hidden">
        <CardHeader className="pb-2 flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-[#ffd24a] text-lg font-semibold">
            <BarChart3 className="w-5 h-5 text-[#ffb347]" />
            Visualizer
          </CardTitle>
          <div className="text-xs text-zinc-500 flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-[#ffb347]" /> Live Analysis
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="rounded-xl overflow-hidden bg-[#0b0b0c]/60 border border-zinc-800 p-3">
            <LabReportChart data={chartData} />
          </div>

          {/* Metrics Grid */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {statCards.map(({ label, value, color, icon: Icon }, i) => (
              <motion.div
                key={label}
                whileHover={{ scale: 1.03 }}
                className="relative group p-4 bg-gradient-to-br from-[#0b0b0c] to-[#121212] border border-zinc-800/60 rounded-xl text-center transition-all hover:border-[#ffb347]/40 hover:shadow-[0_0_20px_-6px_#ffb34760]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#ffb34708] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                <div className="flex justify-center mb-2">
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div className="text-xs text-zinc-400">{label}</div>
                <div className={`text-lg font-semibold mt-1 ${color}`}>
                  {value}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Optional Smart Summary Section */}
          {analysisSummary && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-5 bg-[#0c0c0c]/70 border border-zinc-800 rounded-xl p-3"
            >
              <div className="text-xs text-zinc-500 mb-1">AI Insight</div>
              <div className="text-sm text-zinc-300 leading-relaxed">
                {analysisSummary}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
