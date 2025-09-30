// src/components/USPStrip.jsx
import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function USPStrip() {
  return (
    <motion.section
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="w-full bg-black/50 backdrop-blur-md border-y border-zinc-800"
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-2">
        <Sparkles className="w-5 h-5 text-orange-400 animate-pulse" />
        <p className="text-sm md:text-base font-medium text-zinc-200">
          <span className="text-orange-400 font-bold">70+ Features</span> ·{" "}
          <span className="text-yellow-400 font-semibold">1 Ecosystem</span> ·
          <span className="text-orange-300"> Infinite Learning ⚡</span>
        </p>
      </div>
    </motion.section>
  );
}
