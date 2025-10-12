// src/components/LabReportChart.jsx
import React from "react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as ReTooltip, Legend } from "recharts";

/**
 * LabReportChart
 * props: data = [{t, V, I}], height = 300
 */
export default function LabReportChart({ data = [], height = 300, id = "lab-chart" }) {
  return (
    <div id={id} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid stroke="#111" strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fill: "#bdbdbd" }} />
          <YAxis tick={{ fill: "#bdbdbd" }} />
          <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff" }} />
          <Legend wrapperStyle={{ color: "#aaa" }} />
          <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} name="Voltage (V)" />
          <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} name="Current (A)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
