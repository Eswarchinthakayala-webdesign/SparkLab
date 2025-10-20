import React from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { FlaskConical, ChevronDown } from "lucide-react";

/**
 * LabReportData – SparkLab Edition
 * Fully professional, animated, theme-consistent experiment selector.
 * Uses shadcn Select, dark neon gradients, and real-time motion effects.
 */

export default function LabReportData({
  experiments = [],
  selectedTitleID,
  onSelect,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <Card className="relative bg-gradient-to-br from-[#0a0a0a] via-[#0c0c0c] to-[#111] border border-zinc-800/80 shadow-[0_0_20px_rgba(255,180,60,0.05)] text-white overflow-hidden rounded-2xl backdrop-blur-sm">
        {/* Subtle animated background glow */}
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#ff7a2d20_0%,transparent_60%)] opacity-70"
          animate={{
            backgroundPosition: ["0% 0%", "100% 100%"],
          }}
          transition={{
            repeat: Infinity,
            duration: 10,
            ease: "linear",
          }}
        />

        <CardHeader className="relative z-10 flex items-center gap-2 border-b border-zinc-800/60 pb-3">
          <FlaskConical className="w-5 h-5 text-[#ffb84a]" />
          <CardTitle className="text-[#ffd24a] font-semibold tracking-wide">
            Select Experiment
          </CardTitle>
        </CardHeader>

        <CardContent className="relative z-10 pt-4">
          {experiments.length === 0 ? (
            <div className="text-zinc-400 text-sm italic text-center py-4">
              No experiments defined yet
            </div>
          ) : (
            <>
              <p className="text-zinc-400 text-xs mb-2">
                Choose the experiment you want to generate a report for:
              </p>

              <Select
                onValueChange={(value) => onSelect(value)}
                value={selectedTitleID}
              >
                <SelectTrigger
                  className="w-full  bg-[#0f0f0f] border border-zinc-800/70 text-white rounded-lg focus:ring-2 focus:ring-[#ffb84a]/50 
                  hover:border-[#ffb84a]/40 transition-all duration-200 cursor-pointer flex items-center justify-between px-3 py-2 text-sm"
                >
                  <SelectValue placeholder="Select an experiment" />
                 
                </SelectTrigger>

                <SelectContent
                  className="bg-[#0b0b0c] border border-zinc-800 text-white shadow-xl rounded-lg 
                  backdrop-blur-md overflow-hidden mt-1 animate-in fade-in-50 slide-in-from-top-1 duration-200"
                >
                  {experiments.map((exp, index) => (
                    <motion.div
                      key={exp.titleID}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <SelectItem
                        value={exp.titleID}
                        className={`text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md
                          ${
                            selectedTitleID === exp.titleID
                              ? "bg-gradient-to-r from-[#ff7a2d]/10 to-[#ffd24a]/10 text-[#ffd24a]"
                              : "text-zinc-300"
                          }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-gray-300 truncate sm:w-[310px] w-[350px]">{exp.title}</span>
                          <span className="text-[11px] text-zinc-500 font-light">
                            {exp.titleID}
                          </span>
                        </div>
                      </SelectItem>
                    </motion.div>
                  ))}
                </SelectContent>
              </Select>

              {/* Animated highlight bar */}
              <motion.div
                className="mt-5 h-[2px] bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] rounded-full"
                layoutId="highlight-bar"
              />

              {/* Subtle watermark text */}
              <motion.div
                className="absolute bottom-2 right-4 text-[9px] tracking-widest text-zinc-700 uppercase"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                transition={{ delay: 1.2 }}
              >
                SPARKLAB INTERFACE
              </motion.div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
