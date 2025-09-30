// src/components/ComparisonTable.jsx
import React from "react";
import { motion } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";

/**
 * ==========================================================
 * ComparisonTable.jsx
 * - Desktop → Futuristic glowing table (orange/dark/black)
 * - Mobile → Vertical comparison cards
 * - Framer Motion animations
 * - ShadCN UI for Card + Table
 * ==========================================================
 */

export default function ComparisonTable() {
  const comparisons = [
    {
      feature: "Interactive Simulations",
      spark: true,
      traditional: false,
      desc: "Hands-on experiments with real-world accuracy.",
    },
    {
      feature: "70+ Integrated Tools",
      spark: true,
      traditional: false,
      desc: "One unified platform for calculations, circuits & more.",
    },
    {
      feature: "Lab Report Auto-Generator",
      spark: true,
      traditional: false,
      desc: "Instant professional reports, no manual typing.",
    },
    {
      feature: "Gamification & Quizzes",
      spark: true,
      traditional: false,
      desc: "Keep learning fun with quizzes, rewards & progress tracking.",
    },
    {
      feature: "Collaboration & Sharing",
      spark: true,
      traditional: false,
      desc: "Real-time teamwork with notes, circuits, and forums.",
    },
    {
      feature: "Static Notes & Textbooks",
      spark: false,
      traditional: true,
      desc: "One-way resources with no interactivity.",
    },
  ];

  return (
    <section className="relative py-20 px-6  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-10 left-20 w-72 h-72 bg-orange-500/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-orange-600/15 rounded-full blur-[160px]" />
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-4xl md:text-5xl font-extrabold text-center bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent"
        >
          SparkLab vs Traditional
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          viewport={{ once: true }}
          className="text-zinc-400 text-center max-w-2xl mx-auto mt-6 mb-16 text-lg"
        >
          A futuristic leap beyond textbooks and static study tools.
        </motion.p>

        {/* === Desktop Table === */}
        <div className="hidden md:block">
          <Card className="border border-orange-500/20 bg-zinc-950/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-orange-500/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-zinc-900 to-black">
                  <TableHead className="px-6 py-5 text-left text-zinc-300 font-semibold text-lg">
                    Feature
                  </TableHead>
                  <TableHead className="px-6 py-5 text-center text-orange-400 font-semibold text-lg">
                    SparkLab
                  </TableHead>
                  <TableHead className="px-6 py-5 text-center text-zinc-400 font-semibold text-lg">
                    Traditional
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {comparisons.map((row, i) => (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    whileHover={{
                      scale: 1.01,
                      backgroundColor: "rgba(255,140,0,0.05)",
                    }}
                    transition={{ delay: i * 0.1, duration: 0.5 }}
                    viewport={{ once: true }}
                    className="border-t border-zinc-800 transition-all duration-300"
                  >
                    <TableCell className="px-6 py-6 align-top">
                      <div className="flex flex-col gap-1">
                        <span className="text-white font-medium text-base group-hover:text-orange-400 transition-colors">
                          {row.feature}
                        </span>
                        <span className="text-sm text-zinc-500">{row.desc}</span>
                      </div>
                    </TableCell>

                    <TableCell className="px-6 py-6 text-center">
                      {row.spark ? (
                        <motion.div
                          whileHover={{ scale: 1.2, rotate: 6 }}
                          transition={{ type: "spring", stiffness: 200 }}
                        >
                          <CheckCircle2 className="w-7 h-7 text-orange-400 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                        </motion.div>
                      ) : (
                        <XCircle className="w-7 h-7 text-red-500/70" />
                      )}
                    </TableCell>

                    <TableCell className="px-6 py-6 text-center">
                      {row.traditional ? (
                        <motion.div
                          whileHover={{ scale: 1.2, rotate: -6 }}
                          transition={{ type: "spring", stiffness: 200 }}
                        >
                          <CheckCircle2 className="w-7 h-7 text-orange-300/80" />
                        </motion.div>
                      ) : (
                        <XCircle className="w-7 h-7 text-red-500/70" />
                      )}
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* === Mobile Cards === */}
        <div className="md:hidden grid grid-cols-1 gap-6">
          {comparisons.map((row, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              viewport={{ once: true }}
            >
              <Card className="border border-orange-500/20 bg-zinc-950/80 backdrop-blur-md rounded-2xl shadow-md shadow-orange-500/10 p-6">
                <h3 className="text-lg font-semibold text-orange-400 mb-2">
                  {row.feature}
                </h3>
                <p className="text-sm text-zinc-400 mb-4">{row.desc}</p>

                <div className="flex justify-between items-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-zinc-500">SparkLab</span>
                    {row.spark ? (
                      <CheckCircle2 className="w-7 h-7 text-orange-400 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                    ) : (
                      <XCircle className="w-7 h-7 text-red-500/70" />
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-zinc-500">Traditional</span>
                    {row.traditional ? (
                      <CheckCircle2 className="w-7 h-7 text-orange-300/80" />
                    ) : (
                      <XCircle className="w-7 h-7 text-red-500/70" />
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
