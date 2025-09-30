// src/components/FeaturesOverview.jsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  Zap,
  Cpu,
  BookOpen,
  Gamepad2,
  Users,
  Sparkles,
  Globe,
  SparkleIcon,
  Activity,
} from "lucide-react";

const featureCategories = [
  {
    icon: <Zap className="w-8 h-8 text-orange-400" />,
    title: "Core Tools",
    desc: "Ohm’s Law, Power, 3-Phase, Resonance & 10+ calculators for instant solutions.",
    details: [
      "Voltage & current calculators",
      "3-phase circuit analyzer",
      "Resonance & filter calculators",
      "Instant computation with graph output",
    ],
  },
  {
    icon: <Cpu className="w-8 h-8 text-orange-400" />,
    title: "Simulations",
    desc: "Interactive waveform studio, phasors, circuit playground, and logic gates.",
    details: [
      "Live waveform visualization",
      "Phasor diagram animation",
      "Logic gate simulator",
      "Circuit playground with drag-and-drop",
    ],
  },
  {
    icon: <BookOpen className="w-8 h-8 text-orange-400" />,
    title: "Study Hub",
    desc: "Formula sheets, notes, solvers, flashcards & step-by-step tutorials.",
    details: [
      "Quick formula reference",
      "Interactive flashcards",
      "Problem-solving tutorials",
      "Stepwise guidance",
    ],
  },
  {
    icon: <Gamepad2 className="w-8 h-8 text-orange-400" />,
    title: "Gamification",
    desc: "Quizzes, puzzles, leaderboards & circuit debugging games to boost learning.",
    details: [
      "Timed quizzes",
      "Circuit debugging games",
      "Leaderboard competitions",
      "Achievements & badges",
    ],
  },
  {
    icon: <Users className="w-8 h-8 text-orange-400" />,
    title: "Collaboration",
    desc: "Share notes, circuits, and join group study rooms or forums easily.",
    details: [
      "Share circuits & notes",
      "Group study rooms",
      "Live chat with peers",
      "Discussion forums",
    ],
  },
  {
    icon: <Sparkles className="w-8 h-8 text-orange-400" />,
    title: "Real-Life Apps",
    desc: "Energy analyzers, solar, UPS, inverters, carbon footprint calculators & more.",
    details: [
      "Solar & renewable calculators",
      "UPS & inverter simulation",
      "Carbon footprint analysis",
      "Energy consumption charts",
    ],
  },
  {
    icon: <Globe className="w-8 h-8 text-orange-400" />,
    title: "Global Labs",
    desc: "Connect with labs and students worldwide for collaborative experiments.",
    details: [
      "Live international lab sessions",
      "Remote experiment access",
      "Share and analyze results",
      "Global leaderboard & competitions",
    ],
  },
  {
    icon: <SparkleIcon className="w-8 h-8 text-orange-400" />,
    title: "Power Analysis",
    desc: "Real-time AC/DC load analysis with energy optimization insights.",
    details: [
      "Voltage/current monitoring",
      "Load balancing simulations",
      "Power factor visualization",
      "Energy optimization tools",
    ],
  },
  
  
];

export default function FeaturesOverview() {
  const [activeIndex, setActiveIndex] = useState(null);

  return (
    <section className="py-28 px-6 bg-black text-white relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 -left-20 w-96 h-96 rounded-full bg-orange-500/10 blur-3xl animate-[pulse_6s_infinite]" />
        <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-yellow-400/10 blur-3xl animate-[pulse_7s_infinite]" />
        <div className="absolute top-10 right-20 w-60 h-60 rounded-full bg-orange-400/5 blur-2xl animate-[pulse_8s_infinite]" />
      </div>

      {/* Section Header */}
      <div className="max-w-7xl mx-auto text-center mb-16">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-3xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-500"
        >
           SparkLab’s  Ecosystem
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          viewport={{ once: true }}
          className="text-zinc-400 max-w-3xl mx-auto text-sm md:text-base"
        >
          Discover 70+ interactive features across multiple domains — immersive labs, real-time
          simulations, gamified learning, and global collaboration.
        </motion.p>
      </div>

      {/* Features Grid */}
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-w-7xl mx-auto">
        {featureCategories.map((f, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.6 }}
            viewport={{ once: true }}
          >
            <Card
              className="relative bg-black/70 border border-orange-500/20 rounded-3xl shadow-2xl overflow-hidden cursor-pointer group hover:scale-105 hover:shadow-[0_0_40px_rgba(255,165,0,0.5)] transition-transform duration-500"
              onClick={() => setActiveIndex(activeIndex === i ? null : i)}
            >
              <CardContent className="p-6 flex flex-col items-center text-center relative">
                {/* Glow animation */}
                <motion.div
                  className="absolute -top-1 -left-1 w-full h-full rounded-3xl pointer-events-none"
                  animate={{ rotate: [0, 45, 0] }}
                  transition={{ repeat: Infinity, duration: 5, ease: "linear" }}
                >
                  <div className="w-full h-full bg-gradient-to-tr from-orange-400/20 to-yellow-400/10 blur-xl" />
                </motion.div>

                {/* Icon + Title */}
                <div className="z-10 flex flex-col items-center">
                  {f.icon}
                  <h3 className="text-xl font-semibold mt-4 text-white">{f.title}</h3>
                </div>

                {/* Animated details */}
                <AnimatePresence>
                  {activeIndex === i && (
                    <motion.div
                      key="detail"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      transition={{ duration: 0.4 }}
                      className="mt-4 text-zinc-300 text-sm text-left space-y-1"
                    >
                      {f.details.map((d, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Zap className="w-3 h-3 text-orange-400" />
                          <span>{d}</span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Description for desktop */}
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="text-zinc-400 mt-3 hidden md:block text-sm"
                >
                  {f.desc}
                </motion.p>

                {/* Glow Overlay */}
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-orange-400/10 to-yellow-400/5 opacity-20 blur-2xl pointer-events-none rounded-3xl" />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Extra futuristic section with stats and particle accents */}
      <div className="max-w-7xl mx-auto mt-24 text-center relative">
        {/* Animated diagonal lines */}
        <motion.div
          className="absolute w-[200%] h-[200%] top-[-50%] left-[-50%] pointer-events-none"
          animate={{ rotate: [0, 45, 0] }}
          transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
        >
          <div className="w-full h-full bg-gradient-to-tr from-orange-500/5 to-yellow-400/5 blur-2xl" />
        </motion.div>

        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-2xl md:text-4xl font-bold text-orange-400 mb-4"
        >
          Featured Highlights
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          viewport={{ once: true }}
          className="text-zinc-400 max-w-3xl mx-auto mb-12 text-sm md:text-base"
        >
          A showcase of interactive simulations, collaborative labs, AI-powered tools, and
          gamified learning features — all in one futuristic platform.
        </motion.p>

        {/* Stats cards */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Active Users", value: "25,000+" },
            { title: "Tools", value: "70+" },
            { title: "Labs", value: "300+" },
            { title: "Simulations", value: "120+" },
          ].map((stat, i) => (
            <motion.div
              key={i}
              className="bg-black/70 border border-orange-500/20 rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-center hover:scale-105 hover:shadow-[0_0_40px_rgba(255,165,0,0.5)] transition-transform duration-500"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h4 className="text-xl font-semibold text-white">{stat.title}</h4>
              <p className="text-orange-400 text-2xl font-bold mt-2">{stat.value}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Particle accents */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute bg-orange-500/20 rounded-full w-2 h-2"
            initial={{ x: Math.random() * 2000 - 1000, y: Math.random() * 1000 - 500 }}
            animate={{
              x: [0, Math.random() * 50 - 25, 0],
              y: [0, Math.random() * 50 - 25, 0],
            }}
            transition={{ repeat: Infinity, duration: 5 + Math.random() * 5, ease: "easeInOut" }}
          />
        ))}
      </div>
    </section>
  );
}
