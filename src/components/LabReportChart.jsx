import React from "react";
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
import { motion } from "framer-motion";
import { Zap, Activity } from "lucide-react";

/**
 * LabReportChart — Enhanced dark-theme oscilloscope-style visualizer
 * props: data = [{t, V, I}], height = 300
 */
export default function LabReportChart({ data = [], height = 300, id = "lab-chart" }) {
  const hasData = data && data.length > 0;

  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative w-full"
      style={{ height }}
    >
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0c0c0c] via-[#0a0a0a] to-[#050505] rounded-xl" />

      {/* Glow border effect */}
      <div className="absolute inset-0 border border-zinc-800 rounded-xl shadow-[0_0_25px_-8px_#ffb34740]" />

      {/* Chart container */}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.06)"
            vertical={false}
          />
          <XAxis
            dataKey="t"
            tick={{ fill: "#bdbdbd", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#222" }}
            label={{ value: "Time (t)", position: "insideBottomRight", offset: -3, fill: "#777", fontSize: 10 }}
          />
          <YAxis
            tick={{ fill: "#bdbdbd", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#222" }}
            label={{ value: "Value", angle: -90, position: "insideLeft", fill: "#777", fontSize: 10 }}
          />
          <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff",borderRadius:"10px" }} />
          <Legend
            wrapperStyle={{
              color: "#aaa",
              fontSize: "12px",
              paddingTop: "10px",
            }}
            iconType="circle"
          />
          <Line
            type="monotone"
            dataKey="V"
            stroke="url(#gradVoltage)"
            strokeWidth={2.5}
            name="Voltage (V)"
            dot={false}
            activeDot={{
              r: 5,
              stroke: "#ffd24a",
              strokeWidth: 2,
              fill: "#0b0b0b",
            }}
          />
          <Line
            type="monotone"
            dataKey="I"
            stroke="url(#gradCurrent)"
            strokeWidth={2.5}
            name="Current (A)"
            dot={false}
            activeDot={{
              r: 5,
              stroke: "#00ffbf",
              strokeWidth: 2,
              fill: "#0b0b0b",
            }}
          />

          {/* Gradient defs */}
          <defs>
            <linearGradient id="gradVoltage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffd24a" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#ffb84a" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00ffbf" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#00bfa5" stopOpacity={0.3} />
            </linearGradient>
          </defs>
        </LineChart>
      </ResponsiveContainer>

      {/* Overlay when no data */}
      {!hasData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
          <Activity className="w-6 h-6 text-[#ffb347] mb-2" />
          <p className="text-sm text-zinc-400">No data available</p>
        </div>
      )}
    </motion.div>
  );
}
