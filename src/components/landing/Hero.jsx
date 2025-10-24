// src/components/HeroEnhanced.jsx
import React, { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, Play, GitBranch } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Hero Section (SVG Flow Animation Version)
 * - Pure SVG flowing path animation (electric sine waves)
 * - No gradients or orbs
 * - Fully responsive and futuristic
 * - Parallax motion + Framer Motion entry animations
 */

export default function HeroEnhanced() {
  const navigate = useNavigate?.() || (() => {});
  const heroRef = useRef(null);

  // Parallax Motion
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const flowX = useTransform(mouseX, (v) => `${v * 15}px`);
  const flowY = useTransform(mouseY, (v) => `${v * 10}px`);

  useEffect(() => {
    const handleMove = (e) => {
      const rect = heroRef.current?.getBoundingClientRect();
      const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
      const nx = (e.clientX - cx) / (rect ? rect.width / 2 : window.innerWidth / 2);
      const ny = (e.clientY - cy) / (rect ? rect.height / 2 : window.innerHeight / 2);
      mouseX.set(nx);
      mouseY.set(ny);
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [mouseX, mouseY]);

  // Fade in animation
  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
  };

  return (
    <section
      ref={heroRef}
      className="relative flex flex-col items-center justify-center text-center overflow-hidden 
                   bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] min-h-screen px-6 sm:px-10 md:px-14"
      aria-labelledby="hero-heading"
    >
      {/* === BACKGROUND: PURE SVG FLOW ANIMATION === */}
      <motion.svg
        style={{ translateX: flowX, translateY: flowY }}
        className="absolute inset-0 w-full h-full opacity-30"
        viewBox="0 0 1440 800"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        aria-hidden
      >
        {/* Multiple flow paths */}
        {[...Array(6)].map((_, i) => (
          <motion.path
            key={i}
            d={`M0,${300 + i * 60} 
                C360,${260 + i * 50} 
                720,${340 - i * 30} 
                1080,${300 + i * 40} 
                S1440,${320 + i * 30} 1440,300`}
            fill="none"
            stroke="#ffaa33"
            strokeWidth={1.2 + i * 0.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{
              strokeDashoffset: [0, -2000],
              opacity: [0.6, 0.9, 0.6],
            }}
            transition={{
              duration: 8 + i * 1.2,
              repeat: Infinity,
              ease: "linear",
            }}
            strokeDasharray="14 12"
          />
        ))}
        {/* Light trailing lines */}
        {[...Array(3)].map((_, i) => (
          <motion.path
            key={`trail-${i}`}
            d={`M0,${400 + i * 50} 
                C240,${360 + i * 30} 
                720,${460 - i * 40} 
                1080,${400 + i * 20} 
                S1440,${440 + i * 10} 1440,400`}
            fill="none"
            stroke="#ffaa33"
            strokeWidth="0.7"
            opacity="0.3"
            animate={{
              strokeDashoffset: [0, -1800],
            }}
            transition={{
              duration: 10 + i,
              repeat: Infinity,
              ease: "linear",
            }}
            strokeDasharray="10 14"
          />
        ))}
      </motion.svg>

      {/* === HERO CONTENT === */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        className="relative z-10 max-w-4xl mx-auto py-24 sm:py-32"
      >
        {/* Tagline */}
        <motion.div variants={fadeUp} className="flex justify-center items-center gap-3 mb-5 flex-wrap">
          <Badge className="bg-orange-600/10 text-orange-300 border border-orange-500/20 px-3 py-1 text-sm inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> New · 70+ Tools
          </Badge>
          <p className="text-zinc-400 text-xs sm:text-sm">Trusted by 10k+ learners worldwide</p>
        </motion.div>

        {/* Title */}
        <motion.h1
          variants={fadeUp}
          id="hero-heading"
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-transparent 
                     bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400 leading-tight"
        >
          SparkLab
        </motion.h1>
        <motion.p
          variants={fadeUp}
          className="mt-3 text-zinc-300 text-base sm:text-lg md:text-xl"
        >
          Experience real-time circuit simulation and interactive visualization. Learn BEEE concepts the smart, modern way.
        </motion.p>

        {/* Buttons */}
        <motion.div
          variants={fadeUp}
          className="mt-8 flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Button
            className="bg-gradient-to-r from-orange-500 to-yellow-400 cursor-pointer text-black rounded-2xl px-6 py-3 text-lg font-medium hover:scale-[1.04] transition-transform"
            onClick={() => navigate("/topics")}
          >
            <Zap className="w-4 h-4 mr-2" /> Get Started
          </Button>

          <Button
            variant="outline"
            className="border-orange-600 text-orange-300 cursor-pointer hover:text-orange-400 rounded-2xl px-6 py-3 text-lg flex items-center gap-2 hover:bg-orange-500/10 transition"
            onClick={() => navigate("/features")}
          >
            <Play className="w-4 h-4" /> Explore Features
          </Button>
        </motion.div>

        {/* Feature Highlights */}
        <motion.div
          variants={fadeUp}
          className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto"
        >
          {[
            { icon: <GitBranch className="w-5 h-5" />, title: "Interactive Labs", desc: "Run live simulations in-browser." },
            { icon: <Sparkles className="w-5 h-5" />, title: "Gamified Learning", desc: "Challenge yourself with circuit puzzles." },
            { icon: <Zap className="w-5 h-5" />, title: "Tool Suite", desc: "70+ engineering tools for every need." },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl p-5 bg-zinc-900/40 border border-orange-500/10 hover:border-orange-400/40 transition-all"
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="p-3 rounded-md bg-orange-500/10 text-orange-300">{f.icon}</div>
                <div className="font-semibold text-sm sm:text-base">{f.title}</div>
                <div className="text-zinc-400 text-xs sm:text-sm">{f.desc}</div>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
