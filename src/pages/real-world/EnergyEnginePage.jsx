// src/pages/EnergyEnginePage.jsx
"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import Header from "@/components/Header";
import EnergyControls from "@/components/EnergyControls";
import EnergyVisualizer from "@/components/EnergyVisualizer";
import Oscilloscope from "@/components/Oscilloscope";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Toaster, toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import useGemini from "../../../hooks/useGeminii";
import useEnergySim from "../../../hooks/useEnergySim";
import { exportElementToPdf } from "../../../utils/exportPdf";
import { Bug, ChevronDown, Lightbulb, Sparkles  } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import EnergyTipCardFromJson from "../../components/EnergyTipCardFromJson";
export default function EnergyEnginePage() {
  // default appliances (household)
  const defaultAppliances = [
    { id: "led", name: "LED bulb", baseWatts: 10, quantity: 6, enabled: true },
    { id: "fridge", name: "Fridge", baseWatts: 120, quantity: 1, enabled: true },
    { id: "tv", name: "TV", baseWatts: 80, quantity: 1, enabled: true },
    { id: "ac", name: "AC", baseWatts: 1500, quantity: 0, enabled: false },
  ];

  const [appliances, setAppliances] = useState(defaultAppliances);
  const [userProfile, setUserProfile] = useState("household");
  const [efficiencyFactor, setEfficiencyFactor] = useState(1.0);
  const [recommendations, setRecommendations] = useState("");
  const [lastRaw, setLastRaw] = useState(null);

  // gemini hook
  const { generateText, loading: geminiLoading, error: geminiError } = useGemini({ model: "gemini-2.0-flash-exp" });

  // simulation hook
  const { history, totals, pushTick } = useEnergySim({ appliances, efficiencyFactor, timestepMs: 800 });

  // recompute presets when profile changes (small convenience)
  useEffect(() => {
    if (userProfile === "household") {
      setAppliances((s) => s.length ? s : defaultAppliances);
    }
  }, [userProfile]);

  const containerRef = useRef(null);

  const generateRecommendations = async () => {
    try {
      const prompt = buildPrompt({ appliances, efficiencyFactor, totals, userProfile });
      const { text, raw } = await generateText(prompt, { temperature: 0.2, maxTokens: 512 });
      setRecommendations(text);
      setLastRaw(raw);
      toast.success("Recommendations generated");
    } catch (err) {
      toast.error(String(err));
    }
  };
  console.log(recommendations)
  const onExportPDF = async () => {
    try {
      await exportElementToPdf(containerRef.current, `energy-report-${Date.now()}.pdf`);
      toast.success("PDF exported");
    } catch (err) {
      toast.error(String(err));
    }
  };

  // helper: builds a concise prompt for Gemini
  const buildPrompt = ({ appliances, efficiencyFactor, totals, userProfile }) => {
    const lines = appliances.map((a) => `${a.quantity}× ${a.name} @ ${a.baseWatts}W ${a.enabled ? "(on)" : "(off)"} `);
    const context = `Profile: ${userProfile}\nEfficiencyFactor: ${efficiencyFactor}\nTotals: ${Math.round(totals.watts)} W, monthly_kWh: ${Math.round(totals.monthlyKWh)}\nAppliances:\n - ${lines.join("\n - ")}`;
    return `You are an energy saving assistant. Given the following context, produce 6 concise, actionable energy-saving tips prioritized by estimated monthly kWh savings and final estimated % reduction if applied. Use an explicit "estimated_kwh_saved" and "estimated_percent" for each tip. Output as JSON array of objects with keys: title, description, estimated_kwh_saved, estimated_percent, applied_example. Context:\n${context}`;
  };

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white overflow-x-hidden">
      <Toaster position="top-center" richColors />
      <Header title="SparkLab" subtitle="Energy Saving Engine" />
      <div className="h-16" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" ref={containerRef}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4">
            <EnergyControls
              appliances={appliances}
              setAppliances={setAppliances}
              userProfile={userProfile}
              setUserProfile={setUserProfile}
              efficiencyFactor={efficiencyFactor}
              setEfficiencyFactor={setEfficiencyFactor}
              onGenerateRecommendations={generateRecommendations}
              onExportPDF={onExportPDF}
              geminiLoading={geminiLoading}
            />
          </div>

          <div className="lg:col-span-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl w-full max-w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-[#ffd24a]">Interactive Visualizer</CardTitle>
                </CardHeader>
                <CardContent>
                  <EnergyVisualizer appliances={appliances} efficiencyFactor={efficiencyFactor} totals={totals} history={history} />
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Oscilloscope history={history} />
              <Card className="bg-black/70 border border-zinc-800 rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-[#ffd24a]">Recommendations</CardTitle>
                </CardHeader>
                    <Card className="bg-gradient-to-b from-zinc-950 via-zinc-900 to-black border border-zinc-800/80 rounded-2xl shadow-lg shadow-black/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-[#ff7a2d]" />
          <CardTitle className="text-[#ffd24a] text-lg font-semibold tracking-wide">
            SparkLab Insights
          </CardTitle>
        </div>
       
      </CardHeader>

      <CardContent className="space-y-5 text-sm">
        {/* --- Recommendations Section --- */}
       
<motion.div
      className="space-y-2"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Lightbulb className="w-4 h-4 text-[#ffb84a]" />
          SparkLab-generated tips (dynamic & prioritized):
        </div>
        
      </div>
          
       <EnergyTipCardFromJson recommendations={recommendations} />;
    </motion.div>

        {/* --- Debug Section --- */}
        <motion.div
          className="space-y-2"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Bug className="w-4 h-4 text-[#ff7a2d]" />
            Raw response (debug)
          </div>

          <details className="group bg-zinc-900/40 border border-zinc-800/60 p-3 rounded-lg text-xs transition-all duration-300 hover:border-[#ff7a2d]/50">
            <summary className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-[#ffb84a] select-none">
              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-[#ff7a2d]" />
              Show raw data
            </summary>
            <pre className="mt-2 text-[11px] leading-relaxed text-orange-200 whitespace-pre-wrap">
              {JSON.stringify(lastRaw, null, 2) || "—"}
            </pre>
          </details>
        </motion.div>
      </CardContent>
    </Card>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
