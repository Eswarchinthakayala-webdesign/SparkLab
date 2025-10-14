// src/pages/FormulaSheetPage.jsx
"use client";

import React, { useMemo, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import {
  BookOpen, Search, Download, Layers, Zap, Play, Pause, Edit3, FileText,
} from "lucide-react";
import { Toaster, toast } from "sonner";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import jsPDF from "jspdf";
import { saveAs } from "file-saver";

/* ============================
   Formula Dataset (sample)
   ============================ */
const FORMULAS = [
  {
    id: "ohm",
    category: "Resistor",
    title: "Ohm's Law",
    formula: "V = I × R",
    inputs: [
      { key: "I", label: "Current", unit: "A", default: 2 },
      { key: "R", label: "Resistance", unit: "Ω", default: 100 },
    ],
    compute: ({ I, R }) => ({ V: Number(I) * Number(R), V_unit: "V" }),
    description: "Basic voltage–current–resistance relation.",
  },
  {
    id: "energy_cap",
    category: "Capacitor",
    title: "Energy in Capacitor",
    formula: "E = ½ C V²",
    inputs: [
      { key: "C", label: "Capacitance", unit: "μF", default: 10 },
      { key: "V", label: "Voltage", unit: "V", default: 12 },
    ],
    compute: ({ C, V }) => {
      const c = Number(C) * 1e-6;
      const e = 0.5 * c * Number(V) * Number(V);
      return { E: e, E_unit: "J" };
    },
    description: "Energy stored in capacitor (in Joules).",
  },
];

const round = (v, p = 6) => (Number.isFinite(v) ? Math.round(v * 10 ** p) / 10 ** p : v);

/* ============================
   Main Page Component
   ============================ */
export default function FormulaSheetPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState(FORMULAS[0].id);
  const [inputsState, setInputsState] = useState(() => {
    const base = {};
    FORMULAS.forEach(f => {
      base[f.id] = {};
      f.inputs.forEach(inp => (base[f.id][inp.key] = inp.default));
    });
    return base;
  });
  const [loadingPdf, setLoadingPdf] = useState(false);

  const categories = useMemo(() => ["All", ...new Set(FORMULAS.map(f => f.category))], []);
  const visible = useMemo(() => {
    return FORMULAS.filter(f => {
      const matchCategory = category === "All" || f.category === category;
      const q = query.trim().toLowerCase();
      const matchQuery = !q || f.title.toLowerCase().includes(q);
      return matchCategory && matchQuery;
    });
  }, [category, query]);

  const currentFormula = FORMULAS.find(f => f.id === selected);
  const computed = currentFormula.compute(inputsState[currentFormula.id]);

  const updateInput = (fid, key, val) => {
    setInputsState(s => ({ ...s, [fid]: { ...s[fid], [key]: val } }));
  };

  /* ✅ Fixed PDF Generation */
  const downloadPdf = async () => {
    const payload = {
      title: "Formula Sheet - SparkLab",
      generatedAt: new Date().toISOString(),
      formulas: visible.map(f => ({
        id: f.id,
        title: f.title,
        category: f.category,
        formula: f.formula,
        inputs: inputsState[f.id],
        computed: f.compute(inputsState[f.id]),
      })),
    };

    try {
      setLoadingPdf(true);
      toast.loading("Generating PDF...");

      const resp = await axios.post(
        `/api/generate-pdf`, // ✅ local relative path works on Vercel
        payload,
        { responseType: "blob" }
      );

      toast.dismiss();
      const blob = new Blob([resp.data], { type: "application/pdf" });
      saveAs(blob, "FormulaSheet.pdf");
      toast.success("PDF downloaded successfully!");
    } catch (err) {
      toast.dismiss();
      toast.error("Failed to generate PDF");
      console.error(err);
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05060a] text-white">
      <Toaster position="top-center" richColors />
      <header className="fixed top-0 w-full z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 py-2">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
              <BookOpen className="text-black w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-200">SparkLab</div>
              <div className="text-xs text-zinc-400">Formula Sheet</div>
            </div>
          </motion.div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Search formulas..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="bg-zinc-900/70 border border-zinc-800 text-white w-56"
            />
            <Button
              disabled={loadingPdf}
              onClick={downloadPdf}
              className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black"
            >
              <Download className="w-4 h-4 mr-2" /> Export PDF
            </Button>
          </div>
        </div>
      </header>

      <div className="h-16" />

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formula list */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="bg-black/70 border border-zinc-800 p-3 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-[#ffd24a] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#ffd24a]" /> Formulas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[65vh] overflow-y-auto">
              {visible.map(f => (
                <motion.button
                  key={f.id}
                  onClick={() => setSelected(f.id)}
                  whileHover={{ scale: 1.02 }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selected === f.id ? "border-orange-500 bg-zinc-900/40" : "border-zinc-800"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium">{f.title}</div>
                      <div className="text-xs text-zinc-400">{f.formula}</div>
                    </div>
                    <Badge className="bg-black/70 border border-zinc-700 text-orange-300">{f.category}</Badge>
                  </div>
                </motion.button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Formula details */}
        <div className="lg:col-span-8">
          <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-4">
            <CardHeader>
              <CardTitle className="text-[#ffd24a] flex items-center gap-3">
                <Zap className="w-5 h-5 text-[#ffd24a]" /> {currentFormula.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentFormula.inputs.map(inp => (
                  <div key={inp.key} className="flex items-center gap-2">
                    <label className="w-28 text-xs text-zinc-400">{inp.label}</label>
                    <Input
                      value={inputsState[currentFormula.id][inp.key]}
                      onChange={e => updateInput(currentFormula.id, inp.key, e.target.value)}
                      type="number"
                      className="bg-zinc-900/60 border border-zinc-800 text-white"
                    />
                    <div className="text-xs text-zinc-400">{inp.unit}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {Object.keys(computed)
                  .filter(k => !k.endsWith("_unit"))
                  .map(k => (
                    <div key={k} className="bg-zinc-900/40 p-3 rounded-md border border-zinc-800">
                      <div className="text-xs text-zinc-400">{k}</div>
                      <div className="text-lg font-semibold text-[#ffd24a]">
                        {round(computed[k], 9)} {computed[k + "_unit"]}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
