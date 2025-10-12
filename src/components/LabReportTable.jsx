// src/components/LabReportTable.jsx
// Observations table UI; supports mobile stacked view and CSV export.

import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { saveAs } from "file-saver";

const defaultRow = (i) => ({ id: String(Date.now()) + "-" + i, t: i + 1, V: "", I: "", remark: "" });

export default function LabReportTable({ observations, setObservations }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 720);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const update = (id, key, value) => {
    setObservations((s) => s.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };
  const addRow = () => setObservations((s) => [...s, defaultRow(s.length)]);
  const removeRow = (id) => setObservations((s) => s.filter((r) => r.id !== id));

  const exportCSV = () => {
    const rows = [["t", "V", "I", "remark"], ...observations.map((r) => [r.t, r.V, r.I, r.remark])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    saveAs(blob, `observations-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`);
  };

  if (!observations) return null;

  return (
    <div className="bg-[#070707] border border-zinc-800 rounded-md p-3">
      {!isMobile ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="text-zinc-400 text-xs">
              <tr>
                <th className="p-2 text-left">t</th>
                <th className="p-2">V (V)</th>
                <th className="p-2">I (A)</th>
                <th className="p-2">Remark</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {observations.map((r, i) => (
                <tr key={r.id || i} className="border-t border-zinc-800">
                  <td className="p-2 align-middle">{r.t}</td>
                  <td className="p-2">
                    <Input value={r.V} onChange={(e) => update(r.id, "V", e.target.value)} inputMode="decimal" className="bg-[#0b0b0c] border border-zinc-800 text-white" />
                  </td>
                  <td className="p-2">
                    <Input value={r.I} onChange={(e) => update(r.id, "I", e.target.value)} inputMode="decimal" className="bg-[#0b0b0c] border border-zinc-800 text-white" />
                  </td>
                  <td className="p-2">
                    <Input value={r.remark} onChange={(e) => update(r.id, "remark", e.target.value)} className="bg-[#0b0b0c] border border-zinc-800 text-white" />
                  </td>
                  <td className="p-2">
                    <Button variant="ghost" onClick={() => removeRow(r.id)} className="border border-zinc-800">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {observations.map((r) => (
            <div key={r.id} className="bg-[#060606] border border-zinc-800 rounded-md p-3">
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-medium">Row {r.t}</div>
                <Button variant="ghost" onClick={() => removeRow(r.id)} className="border border-zinc-800"><Trash2 className="w-4 h-4" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={r.V} onChange={(e) => update(r.id, "V", e.target.value)} inputMode="decimal" placeholder="Voltage (V)" className="bg-[#0b0b0c] border border-zinc-800 text-white" />
                <Input value={r.I} onChange={(e) => update(r.id, "I", e.target.value)} inputMode="decimal" placeholder="Current (A)" className="bg-[#0b0b0c] border border-zinc-800 text-white" />
                <Input value={r.remark} onChange={(e) => update(r.id, "remark", e.target.value)} placeholder="Remark" className="col-span-2 bg-[#0b0b0c] border border-zinc-800 text-white" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Button onClick={addRow} className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">
          <Plus className="w-4 h-4 mr-2" /> Add
        </Button>
        <Button variant="ghost" onClick={exportCSV} className="border border-zinc-800">Export CSV</Button>
      </div>
    </div>
  );
}
