// src/components/BenefitsSection.jsx
import React from "react";
import { motion } from "framer-motion";
import {
  Lightbulb,
  LineChart,
  Users,
  Rocket,
  Laptop,
  Brain,
  Shield,
  Zap,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function BenefitsSection() {
  const benefits = [
    {
      icon: <Lightbulb className="w-10 h-10 text-orange-500" />,
      title: "Concept Clarity",
      desc: "Interactive visualizations and animations make complex BEEE concepts crystal clear.",
      highlights: [
        "Step-by-step breakdowns",
        "Exam-focused clarity",
        "Bridging theory & practice",
        "Interactive animations",
      ],
    },
    {
      icon: <LineChart className="w-10 h-10 text-orange-500" />,
      title: "Practical Focus",
      desc: "Real-world simulations that mimic lab experiments and industry-grade tools.",
      highlights: [
        "Virtual labs & waveforms",
        "Energy calculators",
        "Practical industry tools",
        "Hardware-inspired UI",
      ],
    },
    {
      icon: <Users className="w-10 h-10 text-orange-500" />,
      title: "Collaboration",
      desc: "Work with peers and mentors in real-time through collaborative labs.",
      highlights: [
        "Team-based projects",
        "Circuit sharing",
        "Discussion rooms",
        "Teacher-student sync",
      ],
    },
    {
      icon: <Rocket className="w-10 h-10 text-orange-500" />,
      title: "Future-Ready",
      desc: "Aligns with renewable energy, smart grids, and cutting-edge engineering.",
      highlights: [
        "AI-powered tools",
        "Solar & inverter focus",
        "Sustainable energy",
        "Industry integration",
      ],
    },
    {
      icon: <Laptop className="w-10 h-10 text-orange-500" />,
      title: "Anytime Access",
      desc: "Cloud-based labs and tools accessible across any device, anytime.",
      highlights: [
        "Cross-device ready",
        "24/7 accessibility",
        "Lightweight apps",
        "Cloud save support",
      ],
    },
    {
      icon: <Brain className="w-10 h-10 text-orange-500" />,
      title: "Smart Learning",
      desc: "Gamified quizzes, AI recommendations, and progress dashboards.",
      highlights: [
        "Gamification rewards",
        "Adaptive feedback",
        "AI-powered learning",
        "Tracking progress",
      ],
    },
    {
      icon: <Shield className="w-10 h-10 text-orange-500" />,
      title: "Reliable & Secure",
      desc: "Your notes, circuits, and collaboration are private and encrypted.",
      highlights: [
        "Safe collaboration",
        "Cloud encryption",
        "Privacy-first design",
        "Industry security",
      ],
    },
    {
      icon: <Zap className="w-10 h-10 text-orange-500" />,
      title: "High Performance",
      desc: "Optimized for speed, handling heavy simulations smoothly.",
      highlights: [
        "Fast algorithms",
        "Seamless scaling",
        "Smooth visuals",
        "Reliable uptime",
      ],
    },
  ];

  return (
    <section className="relative py-24 px-6 bg-black text-white overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 rounded-full bg-orange-500/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-40 right-20 w-80 h-80 rounded-full bg-yellow-500/10 blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-[50rem] h-[50rem] rounded-full bg-orange-400/5 blur-[250px] -translate-x-1/2 -translate-y-1/2 animate-[spin_25s_linear_infinite]" />
      </div>

      {/* Section Title */}
      <div className="max-w-6xl mx-auto text-center mb-20">
        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-orange-400 via-yellow-500 to-orange-600 bg-clip-text text-transparent"
        >
          Why Choose SparkLab?
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          viewport={{ once: true }}
          className="text-zinc-400 max-w-3xl mx-auto mt-6 text-base md:text-lg"
        >
          Not just tools, but an entire ecosystem to make electrical engineering
          engaging, interactive, and future-ready.
        </motion.p>
      </div>

      {/* Benefits Grid */}
      <div className="max-w-7xl mx-auto grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-rows-fr">
        {benefits.map((b, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            whileHover={{ y: -10, scale: 1.02 }}
            transition={{ delay: i * 0.1, duration: 0.6, type: "spring" }}
            viewport={{ once: true }}
            className="flex"
          >
            <Card className="relative group flex flex-col justify-between bg-gradient-to-br from-zinc-900 via-black to-zinc-950 border border-zinc-800 hover:border-orange-500/50 transition-all duration-500 rounded-3xl shadow-lg hover:shadow-orange-500/20 w-full">
              {/* Glow on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500 bg-gradient-to-tr from-orange-500/20 via-yellow-500/20 to-orange-500/20 blur-2xl"></div>

              <CardHeader className="relative flex flex-col items-center justify-center pt-8">
                <motion.div
                  whileHover={{ scale: 1.25, rotate: 8 }}
                  transition={{ type: "spring", stiffness: 250 }}
                  className="mb-4"
                >
                  {b.icon}
                </motion.div>
                <CardTitle className="text-lg font-bold text-white tracking-wide">
                  {b.title}
                </CardTitle>
                <Badge className="mt-2 bg-orange-500/10 text-orange-400 border border-orange-500/30">
                  Benefit
                </Badge>
              </CardHeader>

              <CardContent className="relative p-6 text-center flex flex-col gap-4 flex-grow">
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {b.desc}
                </p>
                <div className="mt-4 space-y-2 text-left">
                  {b.highlights.map((point, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -15 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1, duration: 0.4 }}
                      viewport={{ once: true }}
                      className="flex items-center gap-2 text-sm text-zinc-300"
                    >
                      <Sparkles className="w-4 h-4 text-orange-400" />
                      <span>{point}</span>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* CTA Section */}
      <div className="max-w-4xl mx-auto text-center mt-20">
        <motion.h3
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-2xl md:text-3xl font-bold text-white"
        >
          A Learning Companion Built for the Future
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          viewport={{ once: true }}
          className="text-zinc-400 mt-4"
        >
          From fundamental circuits to industry-grade simulations, SparkLab
          prepares you with futuristic, interactive pathways. More than passing
          exams — it’s about building engineers of tomorrow.
        </motion.p>
      </div>
    </section>
  );
}
