// src/components/Header.jsx
import React from "react";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";

export default function Header({ title = "EnergyEngine", subtitle = "Real-time Energy Saving Engine" }) {
  return (
    <header className="fixed w-full top-0 z-50 backdrop-blur-lg bg-black/70 border-b border-zinc-800 shadow-lg py-2">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }} className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <div className="w-11 h-11 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md">
              <Zap className="w-6 h-6 text-black" />
            </div>
            <div>
              <div className="text-sm sm:text-base md:text-lg font-semibold text-zinc-200">{title}</div>
              <div className="text-xs text-zinc-400 -mt-0.5">{subtitle}</div>
            </div>
          </motion.div>

          
        </div>
      </div>
    </header>
  );
}
