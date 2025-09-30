// src/components/StudentImpactStatsSection.jsx
"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { motion, useInView } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Clock, BookOpen } from "lucide-react";

/* ---------- sample stats data ---------- */
const stats = [
  {
    icon: TrendingUp,
    label: "Average Grade Improvement",
    value: 32,
    suffix: "%",
  },
  {
    icon: Clock,
    label: "Study Time Saved",
    value: 120,
    suffix: " hrs/yr",
  },
  {
    icon: BookOpen,
    label: "Concept Mastery Speed",
    value: 2.5,
    suffix: "x faster",
  },
];

/* ---------- animated count-up hook ---------- */
function useCountUp(target, duration = 2, decimals = 1) {
  const [value, setValue] = React.useState(0);

  useEffect(() => {
    let startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = (timestamp - startTime) / (duration * 1000);
      const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      const current = Math.min(target, +(target * eased).toFixed(decimals));
      setValue(current);
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }, [target, duration, decimals]);

  return value;
}

/* ---------- subtle animated sparks background ---------- */
function SparksBackground({ count = 18 }) {
  const sparks = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 3 + Math.random() * 6,
      delay: Math.random() * 5,
      duration: 3 + Math.random() * 5,
      opacity: 0.05 + Math.random() * 0.1,
    }));
  }, [count]);

  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none -z-10">
      {sparks.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.5, x: "-50%", y: "-50%" }}
          animate={{ opacity: [0, s.opacity, 0], scale: [0.8, 1.1, 0.9] }}
          transition={{
            repeat: Infinity,
            repeatType: "loop",
            delay: s.delay,
            duration: s.duration,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            borderRadius: "999px",
            background: "linear-gradient(180deg, rgba(255,138,43,0.9), rgba(255,202,148,0.6))",
            filter: "blur(8px)",
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}

/* ---------- main component ---------- */
export default function StudentImpactStatsSection() {
  return (
    <section className="relative py-20 px-6 bg-gradient-to-b from-black via-zinc-900 to-black text-white overflow-hidden">
      <SparksBackground />

      <div className="max-w-7xl mx-auto text-center relative z-10">
        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-extrabold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-orange-300 to-yellow-400"
        >
          Student Impact with SparkLab
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          viewport={{ once: true }}
          className="text-zinc-400 max-w-2xl mx-auto mb-12 text-sm md:text-base"
        >
          Real results from real learners — SparkLab boosts academic performance, reduces stress,
          and makes studying faster and smarter with gamified, interactive learning tools.
        </motion.p>

        {/* Stats Grid */}
        <div className="grid gap-8 md:grid-cols-3">
          {stats.map((s, i) => {
            const Icon = s.icon;
            const count = useCountUp(s.value, 2, 1);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.2, duration: 0.6 }}
                viewport={{ once: true }}
                className="bg-zinc-900/70 border border-zinc-700 rounded-2xl p-8 shadow-lg hover:shadow-orange-500/30 transition-all duration-300 hover:scale-105"
              >
                <motion.div
                  className="flex justify-center mb-4 p-4 rounded-full bg-gradient-to-br from-orange-600/20 to-transparent w-16 h-16 mx-auto"
                  whileHover={{ scale: 1.15, rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  <Icon className="w-8 h-8 text-orange-400" />
                </motion.div>
                <div className="text-4xl font-extrabold text-orange-400">{count}{s.suffix}</div>
                <p className="text-zinc-400 mt-3">{s.label}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
