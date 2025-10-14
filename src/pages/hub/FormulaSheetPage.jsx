"use client";

import React, { useState, useMemo } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Layers,
  FileText,
  Play,
  Pause,
  Download,
  Cpu,
  Brain,
  Menu,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import { saveAs } from "file-saver";
import FormulaVisualizer from "../../components/FormulaVisualizer";
import { FORMULAS } from "../../data/formulas";
import { generateTextWithGemini } from "../../../hooks/aiUtils";

const round = (v, p = 6) =>
  Number.isFinite(v) ? Math.round(v * 10 ** p) / 10 ** p : v;

export default function FormulaSheetPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState(FORMULAS[0].id);
  const [menuOpen, setMenuOpen] = useState(false);

  const [inputsState, setInputsState] = useState(() => {
    const base = {};
    FORMULAS.forEach((f) => {
      base[f.id] = {};
      f.inputs.forEach((inp) => (base[f.id][inp.key] = inp.default));
    });
    return base;
  });

  const [visualImage, setVisualImage] = useState(null);
  const [aiSummary, setAiSummary] = useState("");
  const [aiDetail, setAiDetail] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  // 🔹 Filter logic
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(FORMULAS.map((f) => f.category)))],
    []
  );

  const visible = useMemo(() => {
    return FORMULAS.filter((f) => {
      const matchesCategory = category === "All" || f.category === category;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q || f.title.toLowerCase().includes(q) || f.formula.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  const currentFormula = FORMULAS.find((f) => f.id === selected) || FORMULAS[0];

  const computed = useMemo(() => {
    try {
      const inputs = inputsState[currentFormula.id] || {};
      return currentFormula.compute(inputs);
    } catch {
      return {};
    }
  }, [inputsState, currentFormula]);

  const updateInput = (fid, key, val) => {
    setInputsState((s) => ({ ...s, [fid]: { ...s[fid], [key]: val } }));
  };

  // 🔹 AI Text Generation
  const generateAIText = async () => {
    if (!GEMINI_API_KEY) {
      toast.error("Missing Gemini API Key");
      return;
    }
    try {
      setLoadingAI(true);
      toast.loading("Generating AI insights...");

      const inputs = inputsState[currentFormula.id];
      const inputText = Object.entries(inputs)
        .map(([k, v]) => `${k} = ${v}`)
        .join(", ");
      const prompt = `Explain this electrical formula:
      Title: ${currentFormula.title}
      Formula: ${currentFormula.formula}
      Inputs: ${inputText}
      Computed: ${JSON.stringify(computed, null, 2)}.`;

      const summaryPrompt = `Summarize ${currentFormula.title} in 2 lines.`;

      const [detail, summary] = await Promise.all([
        generateTextWithGemini(prompt, GEMINI_API_KEY),
        generateTextWithGemini(summaryPrompt, GEMINI_API_KEY),
      ]);

      setAiSummary(summary);
      setAiDetail(detail);
      toast.dismiss();
      toast.success("AI insights ready!");
    } catch (err) {
      toast.dismiss();
      toast.error("Failed to fetch AI text");
      console.error(err);
    } finally {
      setLoadingAI(false);
    }
  };

  // 🔹 PDF Generation
  const downloadPdf = async () => {
    const payload = {
      title: "Formula Report - SparkLab",
      generatedAt: new Date().toISOString(),
      formula: currentFormula.title,
      category: currentFormula.category,
      inputs: inputsState[currentFormula.id],
      computed,
      aiSummary,
      aiDetail,
      visualImage,
    };

    try {
      setLoadingPdf(true);
      toast.loading("Generating PDF...");
      const resp = await axios.post(`/api/generate-pdf`, payload, {
        responseType: "blob",
      });

      const blob = new Blob([resp.data], { type: "application/pdf" });
      saveAs(blob, "FormulaSheet.pdf");
      toast.dismiss();
      toast.success("PDF downloaded!");
    } catch (err) {
      toast.dismiss();
      toast.error("Failed to generate PDF");
      console.error(err);
    } finally {
      setLoadingPdf(false);
    }
  };

  // 🔹 Responsive Header Menu
  const toggleMenu = () => setMenuOpen((v) => !v);

  return (
    <div className="min-h-screen bg-[#05060a] text-white flex flex-col">
      <Toaster position="top-center" richColors />

      {/* HEADER */}
      <header className="fixed top-0 w-full z-50 backdrop-blur-lg bg-black/80 border-b border-zinc-800 py-3">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-11 h-11 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow">
              <BookOpen className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-200">SparkLab</div>
              <div className="text-xs text-zinc-400">Formula Sheet • AI Enhanced</div>
            </div>
          </motion.div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-3">
            <Select value={category} onValueChange={(v) => setCategory(v)}>
              <SelectTrigger className="w-40 bg-black/80 border border-zinc-800 text-white text-sm">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border border-zinc-800">
                {categories.map((c) => (
                  <SelectItem key={c} value={c} className="text-white">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-zinc-900/60 border border-zinc-800 text-white w-56"
            />
            <Button
              className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black"
              onClick={downloadPdf}
              disabled={loadingPdf}
            >
              <Download className="w-4 h-4 mr-2" /> Export PDF
            </Button>
          </div>

          {/* Mobile Menu Icon */}
          <button
            onClick={toggleMenu}
            className="md:hidden text-zinc-300 hover:text-white transition"
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden px-4 mt-2 pb-3 space-y-3 bg-black/80 border-t border-zinc-800"
            >
              <Select value={category} onValueChange={(v) => setCategory(v)}>
                <SelectTrigger className="w-full bg-black/80 border border-zinc-800 text-white text-sm">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border border-zinc-800">
                  {categories.map((c) => (
                    <SelectItem key={c} value={c} className="text-white">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="bg-zinc-900/60 border border-zinc-800 text-white w-full"
              />
              <Button
                className="w-full bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black"
                onClick={downloadPdf}
                disabled={loadingPdf}
              >
                <Download className="w-4 h-4 mr-2" /> Export PDF
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* HEADER SPACER */}
      <div className="h-[4.5rem]" />

      {/* MAIN */}
      <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        {/* LEFT */}
        <div className="lg:col-span-4 space-y-5">
          <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-3">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center">
                    <Layers className="w-4 h-4 text-black" />
                  </div>
                  <div className="text-sm font-semibold text-[#ffd24a]">
                    Formulas
                  </div>
                </div>
                <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300">
                  {visible.length}
                </Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 max-h-[60vh] overflow-y-auto">
              {visible.map((f) => (
                <motion.button
                  key={f.id}
                  onClick={() => setSelected(f.id)}
                  whileHover={{ scale: 1.02 }}
                  className={`w-full text-left p-3 rounded-md border flex justify-between items-center transition-all ${
                    selected === f.id
                      ? "border-orange-500 bg-zinc-900/40"
                      : "border-zinc-800 hover:bg-zinc-900/20"
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{f.title}</div>
                    <div className="text-xs text-zinc-400">{f.formula}</div>
                  </div>
                  <Badge className="bg-black/80 border border-zinc-700 text-orange-300">
                    {f.category}
                  </Badge>
                </motion.button>
              ))}
            </CardContent>
          </Card>

          {/* INPUTS */}
          <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-3">
            <CardHeader>
              <CardTitle className="text-sm text-[#ffd24a]">
                Inputs & Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentFormula.inputs.map((inp) => (
                <div key={inp.key} className="flex items-center gap-2">
                  <label className="text-xs w-28 text-zinc-400">
                    {inp.label}
                  </label>
                  <Input
                    value={inputsState[currentFormula.id][inp.key]}
                    onChange={(e) =>
                      updateInput(currentFormula.id, inp.key, e.target.value)
                    }
                    type="number"
                    className="bg-zinc-900/60 border border-zinc-800 text-white"
                  />
                  <div className="text-xs text-zinc-400 w-14 text-right">
                    {inp.unit}
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]"
                  onClick={() => toast.success("Snapshot saved")}
                >
                  <Play className="w-4 h-4 mr-2" /> Snapshot
                </Button>
                <Button
                  className="flex-1 border border-zinc-800"
                  variant="ghost"
                  onClick={() => {
                    const base = {};
                    currentFormula.inputs.forEach((i) => (base[i.key] = i.default));
                    setInputsState((s) => ({
                      ...s,
                      [currentFormula.id]: base,
                    }));
                    toast("Inputs reset");
                  }}
                >
                  <Pause className="w-4 h-4 mr-2" /> Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-8 space-y-5">
          <Card className="bg-black/70 border border-zinc-800 rounded-2xl p-4">
            <CardHeader>
              <CardTitle className="text-lg text-[#ffd24a] flex items-center gap-3">
                <Cpu className="w-5 h-5 text-[#ffd24a]" /> {currentFormula.title}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Visualization */}
              <FormulaVisualizer
                formula={currentFormula}
                computed={computed}
                onImageReady={setVisualImage}
              />

              <Separator />

              {/* AI Actions */}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={generateAIText}
                  className="flex-1 bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a]"
                  disabled={loadingAI}
                >
                  <Brain className="w-4 h-4 mr-2" /> Generate AI Insights
                </Button>
                <Button
                  onClick={downloadPdf}
                  disabled={loadingPdf}
                  className="flex-1 border border-zinc-800"
                  variant="ghost"
                >
                  <FileText className="w-4 h-4 mr-2" /> Export Report
                </Button>
              </div>

              {/* AI Output */}
              {(aiSummary || aiDetail) && (
                <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-lg">
                  <div className="text-xs text-zinc-400 mb-2">AI Insights</div>
                  <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    <strong>Summary:</strong> {aiSummary}
                    <br />
                    <strong>Details:</strong> {aiDetail}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
