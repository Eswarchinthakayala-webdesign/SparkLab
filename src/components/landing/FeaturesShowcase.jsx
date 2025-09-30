// src/components/FeaturesShowcase.jsx
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  Zap,
  Cpu,
  FlaskConical,
  BookOpen,
  Leaf,
  Gamepad2,
  Users,
} from "lucide-react";

const categories = {
  tools: {
    icon: <Zap className="w-5 h-5 mr-2 text-black" />,
    title: "Core Tools",
    features: [
      "Ohm’s Law Calculator",
      "Power & Energy Calculator",
      "Series/Parallel R & C",
      "3-Phase Power Analyzer",
      "Thevenin/Norton Solver",
      "Power Factor Correction",
    ],
  },
  simulations: {
    icon: <Cpu className="w-5 h-5 mr-2 text-black" />,
    title: "Simulations",
    features: [
      "Waveform Studio",
      "Phasor Diagram Animator",
      "Circuit Playground",
      "Logic Gate Simulator",
      "K-Map Visualizer",
      "RLC Frequency Response",
    ],
  },
  labs: {
    icon: <FlaskConical className="w-5 h-5 mr-2 text-black" />,
    title: "Lab Support",
    features: [
      "Virtual Experiments",
      "Lab Report Generator",
      "Resistor Color Code",
      "Capacitor & Inductor Code",
      "Digital Multimeter Sim",
      "Instrument Calibration",
    ],
  },
  learning: {
    icon: <BookOpen className="w-5 h-5 mr-2 text-black" />,
    title: "Learning Hub",
    features: [
      "Formula Sheet (PDF)",
      "Theorem Tutorials",
      "Concept Maps",
      "Flashcards",
      "Step-by-step Solvers",
      "Animated Concept Explainers",
    ],
  },
  apps: {
    icon: <Leaf className="w-5 h-5 mr-2 text-black" />,
    title: "Real-Life Apps",
    features: [
      "Appliance Energy Analyzer",
      "Electricity Bill Estimator",
      "Solar Panel Estimator",
      "UPS/Backup Designer",
      "Carbon Footprint Calculator",
      "Smart Load Balancer",
    ],
  },
  games: {
    icon: <Gamepad2 className="w-5 h-5 mr-2 text-black" />,
    title: "Gamification",
    features: [
      "Quiz Arena",
      "Timed Mock Tests",
      "Leaderboards & Badges",
      "Circuit Puzzle Game",
      "Formula Memory Game",
      "Circuit Debugging Simulator",
    ],
  },
  collab: {
    icon: <Users className="w-5 h-5 mr-2 text-black" />,
    title: "Collaboration",
    features: [
      "Notes Hub",
      "Circuit Sharing",
      "Discussion Forum",
      "Group Study Rooms",
      "Teacher Mode",
      "Doubt Corner + Chatbot",
    ],
  },
};

export default function FeaturesShowcase() {
  return (
    <section className="py-24 px-4 md:px-6  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 -left-20 w-96 h-96 rounded-full bg-orange-500/10 blur-3xl animate-[pulse_6s_infinite]" />
        <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-yellow-400/10 blur-3xl animate-[pulse_7s_infinite]" />
        <div className="absolute top-10 right-20 w-60 h-60 rounded-full bg-orange-400/5 blur-2xl animate-[pulse_8s_infinite]" />
      </div>

      {/* Header */}
      <div className="max-w-7xl mx-auto text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-3xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-500"
        >
           SparkLab Detailed Features Showcase
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          viewport={{ once: true }}
          className="text-zinc-400 text-center max-w-3xl mx-auto mb-12 text-sm md:text-base"
        >
          Explore 70+ powerful tools, simulations, labs, gamification, real-world applications, and collaborative features in an interactive, futuristic layout.
        </motion.p>

        {/* Tabs */}
        <Tabs defaultValue="tools" className="w-full">
          {/* Scrollable Tabs List for Mobile */}
          <div className="overflow-x-auto">
            <TabsList className="flex flex-nowrap gap-2 min-w-max bg-orange-400/70 border border-zinc-700   mb-12">
              {Object.entries(categories).map(([key, cat]) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="flex items-center px-4 py-2 cursor-pointer text-sm md:text-base font-semibold transition-all duration-300 hover:bg-orange-500/20 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-400 data-[state=active]:to-yellow-400 data-[state=active]:text-black whitespace-nowrap"
                >
                  {cat.icon}
                  {cat.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Tabs Content */}
          {Object.entries(categories).map(([key, cat]) => (
            <TabsContent key={key} value={key} className="mt-6">
              <motion.div
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                variants={{
                  hidden: { opacity: 0 },
                  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
                }}
                className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"
              >
                {cat.features.map((f, i) => (
                  <motion.div
                    key={i}
                    variants={{
                      hidden: { opacity: 0, y: 30 },
                      show: { opacity: 1, y: 0 },
                    }}
                  >
                    <Card className="relative bg-black/80 border border-zinc-700 rounded-3xl shadow-2xl overflow-hidden cursor-pointer group hover:scale-105 hover:shadow-[0_0_50px_rgba(255,165,0,0.5)] transition-transform duration-500">
                      <CardContent className="p-6 text-center relative">
                        {/* Animated diagonal light */}
                        <motion.div
                          className="absolute inset-0 w-full h-full rounded-3xl pointer-events-none"
                          animate={{ rotate: [0, 45, 0] }}
                          transition={{ repeat: Infinity, duration: 5, ease: "linear" }}
                        >
                          <div className="w-full h-full bg-gradient-to-tr from-orange-400/10 to-yellow-400/5 blur-xl" />
                        </motion.div>

                        <p className="text-sm md:text-base text-orange-300 relative z-10">{f}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
