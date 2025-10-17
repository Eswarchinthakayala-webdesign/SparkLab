"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Lightbulb,
  Leaf,
  TriangleAlert,
  Earth,
  Rocket,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function safeParseJson(input) {
  if (!input) return null;
  try {
    // Clean and parse
    const clean =
      typeof input === "string"
        ? input.replace(/```json/i, "").replace(/```/g, "").trim()
        : input;
    const parsed = typeof clean === "string" ? JSON.parse(clean) : clean;
    // Always return an array
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    console.error("Failed to parse JSON:", err);
    return null;
  }
}

function EnergyTipCard({ tip }) {
  const {
    title,
    description,
    estimated_kwh_saved,
    estimated_percent,
    applied_example,
  } = tip;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card
        className="bg-gradient-to-br from-black/80 to-zinc-900/80 border border-zinc-800/80 
        hover:border-[#ffb84a]/40 hover:shadow-[0_0_15px_rgba(255,184,74,0.25)] 
        text-zinc-100 transition-all duration-300 group rounded-xl backdrop-blur-md"
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-[#ffb84a] group-hover:text-[#ffd24a]" />
            <CardTitle className="text-base font-semibold text-[#ffd24a]">
              {title || "Untitled Tip"}
            </CardTitle>
          </div>
          <Badge className="bg-[#ff7a2d]/20 text-[#ffb84a] border-[#ff7a2d]/40 rounded-full">
            <Zap className="w-3 h-3 mr-1" /> Energy Tip
          </Badge>
        </CardHeader>

        <CardContent className="space-y-3">
          <CardDescription className="text-sm text-zinc-300 leading-relaxed">
            {description || "No description provided."}
          </CardDescription>

          <div className="flex flex-wrap items-center gap-2 text-xs mt-2">
            {estimated_kwh_saved !== undefined && (
              <Badge className="bg-zinc-900 border border-zinc-700 text-[#00ffbf] px-3 py-1 rounded-full">
                <Rocket/> Est. Saved: {estimated_kwh_saved} kWh
              </Badge>
            )}
            {estimated_percent !== undefined && (
              <Badge className="bg-zinc-900 border border-zinc-700 text-[#ffb84a] px-3 py-1 rounded-full">
                <Earth/> Efficiency: {estimated_percent}%
              </Badge>
            )}
          </div>

          {applied_example && (
            <div className="mt-3 flex items-start gap-2 text-xs text-zinc-400 italic">
              <Leaf className="w-3.5 h-3.5 text-[#ffb84a] shrink-0 mt-0.5" />
              <span>Example: {applied_example}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function EnergyTipCardFromJson({ recommendations }) {
  const tips = useMemo(() => safeParseJson(recommendations), [recommendations]);

  if (!tips || tips.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-black/80 to-zinc-900/80 border border-zinc-800/70 p-4 rounded-xl text-zinc-400 text-sm flex items-center gap-2">
        <TriangleAlert className="w-4 h-4 text-[#ffb84a]" />
        <span>Click on Generate Tips for Recommendation</span>
      </Card>
    );
  }

  return (
    <motion.div
      className="grid  gap-5 mt-6"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.1 } },
      }}
    >
      {tips.map((tip, idx) => (
        <EnergyTipCard key={idx} tip={tip} />
      ))}
    </motion.div>
  );
}
