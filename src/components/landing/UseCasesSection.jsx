// src/components/UseCasesSection.jsx
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Users,
  University,
  CheckCircle2,
} from "lucide-react";

/**
 * ======================================================
 * Futuristic UseCasesSection
 * - Theme: Black + Dark + Orange
 * - Framer Motion Animations
 * - ShadCN UI Cards
 * - Lucide React Icons (modern set)
 * ======================================================
 */

export default function UseCasesSection() {
  const useCases = [
    {
      icon: <GraduationCap className="w-12 h-12 text-orange-500 drop-shadow-[0_0_12px_rgba(249,115,22,0.8)]" />,
      title: "For Students",
      benefits: [
        "Interactive tools that make concepts crystal clear",
        "Gamified quizzes with progress streaks",
        "Collaborate with peers in real-time labs",
      ],
    },
    {
      icon: <Users className="w-12 h-12 text-orange-500 drop-shadow-[0_0_12px_rgba(249,115,22,0.8)]" />,
      title: "For Teachers",
      benefits: [
        "Assign tasks & monitor performance instantly",
        "Virtual labs simplify session planning",
        "Access ready-made modern resources",
      ],
    },
    {
      icon: <University className="w-12 h-12 text-orange-500 drop-shadow-[0_0_12px_rgba(249,115,22,0.8)]" />,
      title: "For Institutions",
      benefits: [
        "Standardized practical learning across batches",
        "Boost engagement & measurable results",
        "Promote innovation with modern teaching",
      ],
    },
  ];

  return (
    <section className="relative py-20 px-6 bg-black text-white overflow-hidden">
      {/* Background Glow Effects */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-orange-600/20 rounded-full blur-[160px]" />
        <div className="absolute bottom-0 right-0 w-[32rem] h-[32rem] bg-orange-500/10 rounded-full blur-[180px]" />
      </div>

      <div className="max-w-6xl mx-auto text-center">
        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-4xl md:text-5xl font-extrabold mb-6 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 bg-clip-text text-transparent"
        >
           Who Can Benefit from SparkLab?
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          viewport={{ once: true }}
          className="text-zinc-400 max-w-2xl mx-auto mb-16 text-lg"
        >
          SparkLab isn’t just for learners — it’s a futuristic ecosystem for
          students, educators, and institutions alike.
        </motion.p>

        {/* Use Cases Grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((uc, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15, duration: 0.7 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.05, y: -6 }}
            >
              <Card className="h-full border border-zinc-800 bg-gradient-to-b from-zinc-950/80 to-zinc-900/50 rounded-2xl shadow-xl hover:shadow-orange-500/30 transition-all duration-300 group">
                <CardContent className="p-8 flex flex-col items-center text-center">
                  {/* Icon */}
                  <motion.div
                    whileHover={{ rotate: 10, scale: 1.15 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className="mb-6"
                  >
                    {uc.icon}
                  </motion.div>

                  {/* Title */}
                  <h3 className="text-xl font-semibold text-white mb-4 group-hover:text-orange-400 transition-colors">
                    {uc.title}
                  </h3>

                  {/* Benefits */}
                  <ul className="space-y-3 text-sm text-zinc-400">
                    {uc.benefits.map((b, j) => (
                      <li
                        key={j}
                        className="flex items-center gap-2 text-left"
                      >
                        <CheckCircle2 className="w-5 h-5 text-orange-400 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
