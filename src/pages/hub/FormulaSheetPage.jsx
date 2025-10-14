// src/pages/FormulaSheetPage.jsx
"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import {
  BookOpen, Search, Download, Layers, Zap, Cpu, Play, Pause, Edit3, FileText,
} from "lucide-react";
import { Toaster, toast } from "sonner";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { Toggle } from "@/components/ui/toggle"; // if available
import { Separator } from "@/components/ui/separator";

import jsPDF from "jspdf";

/* ============================
   Sample formulas dataset
   Each formula includes:
   - id, category, title, formula (latex-like string), inputs: [{key,label,unit,default}]
   - compute: function(inputs) -> outputs {key: value}
   ============================ */
const FORMULAS = [
  {
    id: "qcv",
    category: "Capacitor",
    title: "Charge on a capacitor",
    formula: "Q = C × V",
    inputs: [
      { key: "C", label: "Capacitance", unit: "μF", default: 10 },
      { key: "V", label: "Voltage", unit: "V", default: 12 },
    ],
    compute: ({ C, V }) => {
      const c = Number(C) * 1e-6;
      const q = c * Number(V);
      return { Q: q, Q_unit: "C" };
    },
    description: "Charge stored on a capacitor (Coulombs).",
  },
  {
    id: "ec",
    category: "Capacitor",
    title: "Energy stored in capacitor",
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
    description: "Energy stored in the capacitor (joules).",
  },
  {
    id: "i_rl",
    category: "Inductor",
    title: "Inductor transient current (step)",
    formula: "i(t) = I₀ (1 - e^{-t/τ})",
    inputs: [
      { key: "L", label: "Inductance", unit: "mH", default: 10 },
      { key: "R", label: "Series Resistance", unit: "Ω", default: 10 },
      { key: "V", label: "Supply Voltage", unit: "V", default: 12 },
      { key: "t", label: "Time", unit: "ms", default: 10 },
    ],
    compute: ({ L, R, V, t }) => {
      const Lh = Number(L) * 1e-3;
      const Rn = Number(R) || 1e-6;
      const tau = Lh / Rn;
      const tsec = Number(t) / 1000;
      const i_inf = Number(V) / Rn;
      const i = i_inf * (1 - Math.exp(-tsec / tau));
      return { i, i_unit: "A", tau, tau_unit: "s" };
    },
    description: "Transient current through inductor when step voltage is applied.",
  },
  {
    id: "ohm",
    category: "Resistor",
    title: "Ohm's Law",
    formula: "V = I × R",
    inputs: [
      { key: "I", label: "Current", unit: "A", default: 0.5 },
      { key: "R", label: "Resistance", unit: "Ω", default: 100 },
    ],
    compute: ({ I, R }) => {
      const v = Number(I) * Number(R);
      return { V: v, V_unit: "V" };
    },
    description: "Basic relation between voltage, current and resistance.",
  },
  // add more formulas as needed...
];

/* ============================
   Helper functions
   ============================ */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, p = 6) => (Number.isFinite(v) ? Math.round(v * 10 ** p) / 10 ** p : v);

/* ============================
   Small dynamic SVG visualizer component
   - shows simple circuit and overlays computed values
   - updates live with inputs
   ============================ */
function FormulaVisualizer({ formula, computed }) {
  // computed contains keys like Q, E, i, V etc.
  // We'll render a small circuit depending on formula.category
  const { category } = formula;
  return (
    <div className="w-full rounded-xl p-3 bg-gradient-to-b from-black/30 to-zinc-900/10 border border-zinc-800">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
          <Zap className="w-5 h-5" />
        </div>
        <div>
          <div className="text-sm font-semibold text-[#ffd24a]">{formula.title}</div>
          <div className="text-xs text-zinc-400">{formula.description}</div>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <div className="flex-1 min-w-0">
          <svg viewBox="0 0 420 140" className="w-full h-36" role="img" aria-label={`${formula.title} visualizer`}>
            {/* simple bus */}
            <rect x="20" y="20" width="380" height="100" rx="10" fill="#060606" stroke="#222" />
            {/* depending on category, draw elements */}
            {category === "Capacitor" && (
              <>
                {/* capacitor symbol center */}
                <line x1="210" y1="40" x2="210" y2="100" stroke="#ffd24a" strokeWidth="4" />
                <rect x="200" y="44" width="20" height="32" rx="3" fill="#ffb86b" />
                {/* labels */}
                <text x="210" y="120" textAnchor="middle" fontSize="12" fill="#fff">Capacitor</text>
                {computed.Q !== undefined && (
                  <text x="210" y="10" textAnchor="middle" fontSize="12" fill="#00ffbf">Q: {round(computed.Q, 9)} {computed.Q_unit}</text>
                )}
                {computed.E !== undefined && (
                  <text x="60" y="12" fontSize="11" fill="#ff9a4a">E: {round(computed.E, 9)} J</text>
                )}
              </>
            )}

            {category === "Inductor" && (
              <>
                {/* inductor coil */}
                <path d="M100 70 q10 -30 20 0 q10 -30 20 0 q10 -30 20 0" stroke="#ff6a9a" strokeWidth="6" fill="none" strokeLinecap="round"/>
                <text x="220" y="12" fontSize="12" fill="#00ffbf">i: {computed.i ? round(computed.i, 6) : "—"} A</text>
                <text x="220" y="30" fontSize="11" fill="#ffd24a">τ: {computed.tau ? round(computed.tau, 6) + " s" : "—"}</text>
              </>
            )}

            {category === "Resistor" && (
              <>
                <rect x="180" y="54" width="60" height="20" rx="6" fill="#222" stroke="#ff7a2d"/>
                <text x="210" y="75" textAnchor="middle" fontSize="12" fill="#ffd24a">R</text>
                {computed.V !== undefined && <text x="210" y="120" textAnchor="middle" fontSize="12" fill="#00ffbf">V: {round(computed.V,6)} V</text>}
              </>
            )}

            {/* animated current dots path */}
            <defs>
              <linearGradient id="g1" x1="0" x2="1">
                <stop offset="0%" stopColor="#ffd24a" />
                <stop offset="100%" stopColor="#ff6a9a" />
              </linearGradient>
            </defs>
            <circle r="4" fill="url(#g1)">
              <animateMotion dur="1.5s" repeatCount="indefinite" path="M20,90 L400,90" />
            </circle>
          </svg>
        </div>

        <div className="w-40 flex flex-col gap-2">
          {Object.keys(computed).map((k) => {
            if (k.endsWith("_unit")) return null;
            return (
              <div key={k} className="bg-zinc-900/40 border border-zinc-800 rounded-md p-2 text-sm">
                <div className="text-xs text-zinc-400">{k}</div>
                <div className="text-lg font-semibold text-[#ffd24a]">{round(computed[k], 9)} {computed[`${k}_unit`] || ""}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================
   Main FormulaSheetPage
   ============================ */
export default function FormulaSheetPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState(FORMULAS[0].id);
  const [inputsState, setInputsState] = useState(() => {
    const base = {};
    FORMULAS.forEach((f) => {
      base[f.id] = {};
      f.inputs.forEach((inp) => {
        base[f.id][inp.key] = inp.default;
      });
    });
    return base;
  });
  const [loadingPdf, setLoadingPdf] = useState(false);

  // search + filter
  const categories = useMemo(() => ["All", ...Array.from(new Set(FORMULAS.map((f) => f.category)))], []);
  const visible = useMemo(() => {
    return FORMULAS.filter((f) => {
      const matchesCategory = category === "All" || f.category === category;
      const q = query.trim().toLowerCase();
      const matchesQuery = !q || f.title.toLowerCase().includes(q) || f.formula.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  const currentFormula = FORMULAS.find((f) => f.id === selected) || FORMULAS[0];

  // compute results for the currently selected formula
  const computed = useMemo(() => {
    try {
      const inputs = inputsState[currentFormula.id] || {};
      return currentFormula.compute(inputs);
    } catch (e) {
      return {};
    }
  }, [inputsState, currentFormula]);

  const updateInput = (fid, key, val) => {
    setInputsState((s) => ({ ...s, [fid]: { ...s[fid], [key]: val } }));
  };

  /* PDF generation: call Vercel serverless or fallback to client-side jsPDF */
  const downloadPdf = async () => {
    const payload = {
      title: "Formula Sheet - SparkLab",
      generatedAt: new Date().toISOString(),
      formulas: visible.map((f) => {
        const vals = inputsState[f.id] || {};
        const comp = (() => {
          try { return f.compute(vals); } catch (e) { return {}; }
        })();
        return { id: f.id, title: f.title, category: f.category, formula: f.formula, inputs: vals, computed: comp };
      }),
    };

    setLoadingPdf(true);
    const base = "https://sparklab-beee.vercel.app"; // ✅ fixed (no trailing slash)

    try {
      // call serverless endpoint
      toast.loading("Generating PDF...");
      const resp = await axios.post(`${base}/api/generate-pdf`, payload, {
        headers: { "Content-Type": "application/json" },
        responseType: "blob",
        timeout: 60000,
      });
       toast.dismiss();
      const blob = new Blob([resp.data], { type: "application/pdf" });
      saveAs(blob, `${title.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF downloaded successfully!");
    } catch (err) {
      console.warn("Server PDF failed, falling back to client-side", err);
      // fallback to client-side jsPDF generation
      try {
        const doc = new jsPDF({ orientation: "portrait" });
        doc.setFontSize(16);
        doc.text("Formula Sheet - SparkLab", 12, 16);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 12, 24);
        let y = 34;
        visible.forEach((f, idx) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.setFontSize(12);
          doc.text(`${f.title} (${f.category})`, 12, y);
          y += 6;
          doc.setFontSize(10);
          doc.text(f.formula, 14, y);
          y += 6;
          const vals = inputsState[f.id] || {};
          Object.keys(vals).forEach((k) => {
            doc.text(`${k}: ${vals[k]}`, 14, y);
            y += 5;
          });
          const comp = (() => {
            try { return f.compute(vals); } catch (e) { return {}; }
          })();
          Object.keys(comp).forEach((ck) => {
            if (ck.endsWith("_unit")) return;
            doc.text(`${ck}: ${round(comp[ck], 9)} ${comp[ck + "_unit"] || ""}`, 14, y);
            y += 5;
          });
          y += 6;
        });
        doc.save(`formulasheet-${Date.now()}.pdf`);
        toast.success("PDF generated (client)");
      } catch (e2) {
        toast.error("Unable to generate PDF");
      }
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05060a] text-white">
      <Toaster position="top-center" richColors />
      {/* Header (professional) */}
      <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 py-2">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between gap-4">
          <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow">
              <BookOpen className="w-6 h-6 text-black" />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-200">SparkLab</div>
              <div className="text-xs text-zinc-400">Formula Sheet • Interactive</div>
            </div>
          </motion.div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-sm text-zinc-400">Select category</div>
            <div className="w-40">
              <Select value={category} onValueChange={(v) => setCategory(v)}>
                <SelectTrigger className="w-full bg-black/80 border border-zinc-800 rounded-md text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border border-zinc-800">
                  {categories.map((c) => (
                    <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Input placeholder="Search formulas..." value={query} onChange={(e) => setQuery(e.target.value)} className="bg-zinc-900/60 border border-zinc-800 text-white w-64" />
              <Button className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => downloadPdf()}>
                <Download className="w-4 h-4 mr-2" /> Export PDF
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="h-16" /> {/* spacer for fixed header */}

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* left: list of formulas */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-3">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center"><Layers className="w-4 h-4 text-black" /></div>
                  <div className="text-sm font-semibold text-[#ffd24a]">Formulas</div>
                </div>
                <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300">{visible.length}</Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 max-h-[60vh] overflow-y-auto">
              {visible.map((f) => (
                <motion.button
                  key={f.id}
                  onClick={() => setSelected(f.id)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`w-full text-left p-3 rounded-md border ${selected === f.id ? "border-orange-500 bg-zinc-900/40" : "border-zinc-800"} flex items-center justify-between`}
                >
                  <div>
                    <div className="text-sm font-medium">{f.title}</div>
                    <div className="text-xs text-zinc-400">{f.formula}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge className="bg-black/80 border border-zinc-700 text-orange-300">{f.category}</Badge>
                    <div className="text-xs text-zinc-400">{f.inputs.map((i) => `${i.key}=${i.default}`).join(", ")}</div>
                  </div>
                </motion.button>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-3">
            <CardHeader>
              <CardTitle className="text-sm text-[#ffd24a]">Selected Formula Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-zinc-400">{currentFormula.formula}</div>
              <div className="grid grid-cols-1 gap-2">
                {currentFormula.inputs.map((inp) => (
                  <div key={inp.key} className="flex items-center gap-2">
                    <label className="text-xs w-28 text-zinc-400">{inp.label}</label>
                    <Input value={inputsState[currentFormula.id][inp.key]} onChange={(e) => updateInput(currentFormula.id, inp.key, e.target.value)} type="number" className="bg-zinc-900/60 border border-zinc-800 text-white" />
                    <div className="text-xs text-zinc-400 w-14 text-right">{inp.unit}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => toast.success("Snapshot saved")}>
                  <Play className="w-4 h-4 mr-2" /> Snapshot
                </Button>
                <Button className="flex-1 variant-ghost border border-zinc-800" onClick={() => {
                  // reset inputs for this formula
                  const base = {};
                  currentFormula.inputs.forEach((i) => base[i.key] = i.default);
                  setInputsState((s) => ({ ...s, [currentFormula.id]: base }));
                  toast("Reset inputs");
                }}>
                  <Pause className="w-4 h-4 mr-2" /> Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* right: visualizer & details */}
        <div className="lg:col-span-8 space-y-4">
          <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-4">
            <CardHeader className="flex items-center justify-between pb-2">
              <CardTitle className="text-lg text-[#ffd24a] flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center"><Zap className="w-5 h-5 text-black" /></div>
                {currentFormula.title}
              </CardTitle>
              <div className="text-xs text-zinc-400">{currentFormula.formula}</div>
            </CardHeader>

            <CardContent className="space-y-4">
              <FormulaVisualizer formula={currentFormula} computed={computed} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl p-3 bg-zinc-900/30 border border-zinc-800">
                  <div className="text-xs text-zinc-400">Computed Values</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {Object.keys(computed).map((k) => {
                      if (k.endsWith("_unit")) return null;
                      return (
                        <div key={k} className="p-2 bg-black/40 rounded-md border border-zinc-800">
                          <div className="text-xs text-zinc-400">{k}</div>
                          <div className="text-lg font-semibold text-[#ffd24a]">{round(computed[k], 9)} {computed[k + "_unit"] || ""}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl p-3 bg-zinc-900/30 border border-zinc-800">
                  <div className="text-xs text-zinc-400">Actions</div>
                  <div className="mt-2 flex gap-2">
                    <Button className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]" onClick={() => downloadPdf()}>
                      <FileText className="w-4 h-4 mr-2" /> Export visible
                    </Button>
                    <Button variant="ghost" className="border border-zinc-800" onClick={() => toast("Coming soon: share link")}>
                      <Edit3 className="w-4 h-4 mr-2" /> Share
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="text-xs text-zinc-400">Quick reference & tips</div>
              <div className="mt-2 text-sm">
                <ul className="list-disc pl-4 text-zinc-300">
                  <li>All units displayed are SI or common engineering units (μF, mH, Ω).</li>
                  <li>Values update in real-time and the visualizer animates particle flow to illustrate current/energy.</li>
                  <li>Export uses a serverless endpoint by default; client-side fallback available.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
