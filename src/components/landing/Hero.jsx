// src/components/Hero.jsx
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, GitBranch, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";

const container = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const float = {
  animate: {
    y: [0, -12, 0],
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" },
  },
};

// Animated Counter
const Counter = ({ value, duration = 2000, className }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const increment = value / (duration / 16);
    const handle = setInterval(() => {
      start += increment;
      if (start >= value) {
        setCount(value);
        clearInterval(handle);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(handle);
  }, [value, duration]);
  return <span className={className}>{count.toLocaleString()}</span>;
};

export default function Hero() {
  const navigate=useNavigate()
  return (
    <section className="relative  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -left-40 top-32 w-[28rem] h-[28rem] rounded-full bg-orange-500/10 blur-3xl animate-[pulse_6s_infinite]" />
        <div className="absolute right-20 bottom-32 w-[24rem] h-[24rem] rounded-full bg-yellow-400/8 blur-3xl animate-[pulse_7s_infinite]" />
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
          {/* LEFT PANEL */}
          <motion.div
            className="md:col-span-7 lg:col-span-6"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={container}
          >
            {/* Badges */}
            <motion.div variants={fadeUp} className="flex items-center gap-3 mb-6 flex-wrap">
              <Badge className="bg-orange-600/10 text-orange-300 border border-orange-500/20 px-3 py-1">
                <Sparkles className="w-4 h-4 mr-1 inline" /> New · 70+ Tools
              </Badge>
              <span className="text-zinc-400 text-sm">Trusted by thousands of students & labs</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={fadeUp}
              className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight"
            >
              <span className="block bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-500">
                SparkLab
              </span>
              <span className="block mt-2 text-zinc-300 text-lg md:text-xl font-medium">
                Interactive simulations, labs, quizzes & study tools for BEEE students.
              </span>
            </motion.h1>

            {/* Description */}
            <motion.p variants={fadeUp} className="mt-6 text-zinc-400 max-w-xl text-base md:text-lg">
              Build circuits, visualize waveforms, solve quizzes, and collaborate in real-time.
              SparkLab merges classroom theory with hands-on engineering intuition.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div variants={fadeUp} className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
              <Button
                className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-black rounded-2xl px-6 py-3 text-lg shadow-lg transition-transform hover:scale-105"
                onClick={()=>navigate("/topics")}
              >
                <Zap className="w-4 h-4 mr-2" /> Get Started
              </Button>
              <Button
                variant="outline"
                className="border-orange-600 text-orange-300 rounded-2xl px-6 py-3 flex items-center gap-2 transition-transform hover:scale-105"
                 onClick={()=>navigate("/features")}
              >
                <Play className="w-4 h-4" /> Explore Features
              </Button>
            </motion.div>

            {/* Features */}
            <motion.ul
              variants={fadeUp}
              className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl"
            >
              <li className="flex items-start gap-3">
                <div className="p-3 rounded-md bg-orange-500/15 text-orange-400">
                  <GitBranch className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Interactive Labs</div>
                  <div className="text-zinc-400 text-sm">Run circuits live in the browser.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="p-3 rounded-md bg-orange-500/15 text-orange-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Gamified Quizzes</div>
                  <div className="text-zinc-400 text-sm">Learn faster with interactive games.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="p-3 rounded-md bg-orange-500/15 text-orange-400">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Tool Suite</div>
                  <div className="text-zinc-400 text-sm">70+ calculators & simulators.</div>
                </div>
              </li>
            </motion.ul>

            {/* Animated Stats */}
            <motion.div variants={fadeUp} className="mt-10 flex flex-wrap gap-6 items-center">
              <div className="bg-zinc-900/30 border border-orange-500/20 rounded-lg px-6 py-4 text-center">
                <div className="text-sm text-zinc-400">Active Users</div>
                <div className="text-2xl sm:text-3xl font-bold text-orange-400">
                  <Counter value={25000} />
                </div>
              </div>
              <div className="bg-zinc-900/30 border border-orange-500/20 rounded-lg px-6 py-4 text-center">
                <div className="text-sm text-zinc-400">Tools</div>
                <div className="text-2xl sm:text-3xl font-bold text-yellow-400">
                  <Counter value={70} />
                </div>
              </div>
              <div className="bg-zinc-900/30 border border-orange-500/20 rounded-lg px-6 py-4 text-center">
                <div className="text-sm text-zinc-400">Labs</div>
                <div className="text-2xl sm:text-3xl font-bold text-orange-400">
                  <Counter value={300} />
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* RIGHT PANEL */}
          <motion.div
            className="md:col-span-5 lg:col-span-6 flex justify-center md:justify-end"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <motion.div className="relative w-full max-w-lg" variants={float} animate="animate">
              {/* Glass Card */}
              <Card className="bg-gradient-to-br from-black/70 to-zinc-900/60 border border-orange-500/20 shadow-2xl rounded-3xl overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative">
                    <img
                      src="/img/img2.png"
                      alt="Device mockup"
                      className="w-full h-auto object-cover block rounded-t-3xl"
                    />
                    <div className="absolute -top-8 -left-8 w-28 h-28 rounded-full bg-orange-500/15 blur-3xl animate-[pulse_6s_infinite]" />
                    <div className="absolute -bottom-12 -right-12 w-32 h-32 rounded-full bg-yellow-400/10 blur-3xl animate-[pulse_7s_infinite]" />
                  </div>

                  {/* Lower Panel */}
                  <div className="p-6 flex flex-col sm:flex-row items-start gap-4">
                    <div className="flex-1">
                      <div className="text-white font-semibold text-lg">Live Circuit Playground</div>
                      <div className="text-zinc-400 text-sm mt-1">
                        Launch, edit & visualize circuits in real-time — powered by WebSim.
                      </div>
                    </div>
                    <div className="self-center">
                      <Button
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600 text-black rounded-xl px-5 py-2 shadow-md transition-transform hover:scale-105"
                      >
                        Open
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Floating Badge */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="absolute -top-5 right-8"
              >
                <Badge className="bg-orange-500 text-black px-3 py-1 rounded-full shadow-lg text-sm">
                  Live
                </Badge>
              </motion.div>

              {/* subtle reflection */}
              <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/2 mix-blend-overlay opacity-5" />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
