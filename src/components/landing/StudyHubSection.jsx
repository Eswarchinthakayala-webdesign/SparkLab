// src/components/StudyHubSection.jsx
import React from "react";
import { motion } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileText,
  Calculator,
  NotebookPen,
  Sparkles,
  GraduationCap,
  ArrowRight,
} from "lucide-react";

export default function StudyHubSection() {
  const items = [
    {
      icon: <FileText className="w-12 h-12 text-orange-400" />,
      title: "Formula Sheets",
      desc: "Exam-ready BEEE formula sheets — concise, clean, and downloadable.",
      action: "View PDFs",
    },
    {
      icon: <Calculator className="w-12 h-12 text-orange-400" />,
      title: "Step-by-Step Solvers",
      desc: "Interactive circuit problem solvers with detailed steps and logic flow.",
      action: "Try Solver",
    },
    {
      icon: <NotebookPen className="w-12 h-12 text-orange-400" />,
      title: "Quick Notes",
      desc: "Organize your personal notes, diagrams, and shortcuts in one place.",
      action: "Open Notes",
    },
  ];

  return (
    <section className="relative py-28 px-6 bg-black text-white overflow-hidden">
      {/* Three.js Animated Background */}
      <div className="absolute inset-0 -z-10">
        <Canvas camera={{ position: [0, 0, 1] }}>
          <Float speed={1.5} rotationIntensity={1} floatIntensity={2}>
            <Stars radius={60} depth={90} count={2500} factor={4} fade />
          </Float>
        </Canvas>
        <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-900/70 to-black" />
      </div>

      <div className="max-w-6xl mx-auto text-center">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="flex items-center justify-center gap-3 mb-6"
        >
          <GraduationCap className="w-10 h-10 text-orange-500" />
          <h2 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
            Study Hub
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          viewport={{ once: true }}
          className="text-zinc-400 max-w-2xl mx-auto mb-16 text-lg"
        >
          All your <span className="text-orange-400">formulas</span>,{" "}
          <span className="text-orange-400">solvers</span>, and{" "}
          <span className="text-orange-400">notes</span> brought together in one
          sleek, interactive hub.
        </motion.p>

        {/* Cards Grid */}
        <div className="grid gap-10 md:grid-cols-3">
          {items.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -8 }}
              transition={{ delay: i * 0.2, duration: 0.6, type: "spring" }}
              viewport={{ once: true }}
              className="relative"
            >
              {/* Glow Effect */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl opacity-20 blur-lg group-hover:opacity-30 transition duration-300"></div>

              <Card className="relative group h-full bg-zinc-900/80 border border-zinc-800 hover:border-orange-500/60 rounded-2xl shadow-lg hover:shadow-orange-500/20 transition-all duration-300 overflow-hidden">
                <CardContent className="p-8 flex flex-col items-center text-center relative z-10">
                  {/* Floating Sparkle */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.3 + 0.2, duration: 0.5 }}
                    viewport={{ once: true }}
                    className="absolute top-5 right-5 text-orange-400 opacity-60 group-hover:opacity-100 transition"
                  >
                    <Sparkles className="w-5 h-5" />
                  </motion.div>

                  <div className="mb-6 transform group-hover:scale-110 transition duration-300">
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-3 text-orange-100">{item.title}</h3>
                  <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                    {item.desc}
                  </p>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white text-sm font-medium px-6 py-2.5 rounded-lg shadow-md hover:shadow-orange-500/30 transition"
                  >
                    {item.action}
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
