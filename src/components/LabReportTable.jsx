"use client";
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  PlusCircle,
  Download,
  Table2,
  Info,
} from "lucide-react";
import { saveAs } from "file-saver";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";

const defaultRow = (i) => ({
  id: String(Date.now()) + "-" + i,
  t: i + 1,
  V: "",
  I: "",
  remark: "",
});

export default function LabReportTable({ observations, setObservations }) {
  const [isMobile, setIsMobile] = useState(false);
  const [activeRow, setActiveRow] = useState(null);

  // Responsive checker
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const update = (id, key, value) =>
    setObservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: value } : r))
    );

  const addRow = () => setObservations((prev) => [...prev, defaultRow(prev.length)]);
  const removeRow = (id) => setObservations((prev) => prev.filter((r) => r.id !== id));

  const exportCSV = () => {
    const rows = [["t", "V", "I", "remark"], ...observations.map((r) => [r.t, r.V, r.I, r.remark])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    saveAs(blob, `observations-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`);
  };

  if (!observations) return null;

  return (
    <Card className="bg-gradient-to-br from-[#0a0a0a] via-[#111] to-[#050505] border border-zinc-800/80 rounded-2xl shadow-lg shadow-black/40 backdrop-blur-md">
      <CardHeader className="border-b border-zinc-800/60 pb-3 flex justify-between flex-col items-start">
        <CardTitle className="text-lg flex items-center gap-2 text-[#ffd24a] font-semibold tracking-wide">
          <Table2 className="w-5 h-5 text-[#ff9a3c]" />
          Observation Table
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={exportCSV}
            className="border hover:text-[#ff7a2d] cursor-pointer border-[#ff9a3c]/30 hover:bg-[#ff9a3c]/10 text-[#ffb84a] flex items-center gap-1"
          >
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button
            onClick={addRow}
            className="cursor-pointer  bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black hover:shadow-[0_0_10px_#ffb84a]/50 transition-all"
          >
            <PlusCircle className="w-4 h-4 mr-1" /> Add Row
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-3 overflow-auto h-[400px]">
        {!isMobile ? (
          <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-[#0e0e0e]/80 text-zinc-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3 text-left">t</th>
                  <th className="p-3">V (Volt)</th>
                  <th className="p-3">I (Amp)</th>
                  <th className="p-3">Remark</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((r, i) => (
                  <motion.tr
                    key={r.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-zinc-800 hover:bg-[#141414] transition-colors cursor-pointer"
                    onClick={() => setActiveRow(activeRow === r.id ? null : r.id)}
                  >
                    <td className="p-3 text-zinc-400">{r.t}</td>
                    <td className="p-2">
                      <Input
                        value={r.V}
                        onChange={(e) => update(r.id, "V", e.target.value)}
                        inputMode="decimal"
                        className="bg-[#0b0b0c] border border-zinc-800/80 text-white focus:border-[#ff9a3c]/70 focus:ring-1 focus:ring-[#ff9a3c]/50 rounded-lg"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={r.I}
                        onChange={(e) => update(r.id, "I", e.target.value)}
                        inputMode="decimal"
                        className="bg-[#0b0b0c] border border-zinc-800/80 text-white focus:border-[#ff9a3c]/70 focus:ring-1 focus:ring-[#ff9a3c]/50 rounded-lg"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={r.remark}
                        onChange={(e) => update(r.id, "remark", e.target.value)}
                        className="bg-[#0b0b0c] border border-zinc-800/80 text-white focus:border-[#ff9a3c]/70 focus:ring-1 focus:ring-[#ff9a3c]/50 rounded-lg"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        variant="ghost"
                        onClick={() => removeRow(r.id)}
                        className="border border-zinc-800 cursor-pointer hover:text-white hover:bg-red-600/20 hover:border-red-500/50 text-red-400 transition-all duration-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // ================= Mobile Card View =================
          <div className="space-y-3">
            <AnimatePresence>
              {observations.map((r) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-[#0b0b0c] border border-zinc-800/80 rounded-xl p-3 shadow-inner shadow-black/30"
                >
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-sm font-medium text-[#ffd24a]">
                      Row {r.t}
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => removeRow(r.id)}
                      className="hover:bg-red-600/20 text-red-400 border border-transparent hover:border-red-500/50 transition-all duration-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={r.V}
                      onChange={(e) => update(r.id, "V", e.target.value)}
                      inputMode="decimal"
                      placeholder="Voltage (V)"
                      className="bg-[#111] border border-zinc-800 text-white focus:border-[#ff9a3c]/70 focus:ring-1 focus:ring-[#ff9a3c]/50 rounded-lg"
                    />
                    <Input
                      value={r.I}
                      onChange={(e) => update(r.id, "I", e.target.value)}
                      inputMode="decimal"
                      placeholder="Current (A)"
                      className="bg-[#111] border border-zinc-800 text-white focus:border-[#ff9a3c]/70 focus:ring-1 focus:ring-[#ff9a3c]/50 rounded-lg"
                    />
                    <Input
                      value={r.remark}
                      onChange={(e) => update(r.id, "remark", e.target.value)}
                      placeholder="Remark"
                      className="col-span-2 bg-[#111] border border-zinc-800 text-white focus:border-[#ff9a3c]/70 focus:ring-1 focus:ring-[#ff9a3c]/50 rounded-lg"
                    />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Row Details Popup */}
        <AnimatePresence>
          {activeRow && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 bg-[#0c0c0c] border border-[#ff9a3c]/20 p-4 rounded-xl text-sm text-zinc-300 shadow-md shadow-black/30"
            >
              <div className="flex items-center gap-2 text-[#ffb84a] mb-1">
                <Info className="w-4 h-4" /> Row Details
              </div>
              {(() => {
                const row = observations.find((r) => r.id === activeRow);
                return (
                  row && (
                    <div className="space-y-1">
                      <div>
                        <span className="text-zinc-500">t:</span> {row.t}
                      </div>
                      <div>
                        <span className="text-zinc-500">Voltage (V):</span>{" "}
                        {row.V || "—"}
                      </div>
                      <div>
                        <span className="text-zinc-500">Current (I):</span>{" "}
                        {row.I || "—"}
                      </div>
                      <div>
                        <span className="text-zinc-500">Remark:</span>{" "}
                        {row.remark || "—"}
                      </div>
                    </div>
                  )
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
