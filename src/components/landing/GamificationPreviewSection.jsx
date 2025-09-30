// src/components/GamificationPreviewSection.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trophy, Medal, ListChecks, Target, Sparkles, Star, Award, Clock } from "lucide-react";

/* ---------- helpers ---------- */
function useCountUp(target, durationMs = 900, deps = []) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);
  useEffect(() => {
    if (target == null) return;
    let cancelled = false;
    const start = performance.now();
    function step(now) {
      if (cancelled) return;
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const v = Math.round(target * eased);
      setValue(v);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, deps.concat([target]));
  return value;
}

/* ---------- sparks background ---------- */
function SparksBackground({ count = 20 }) {
  const sparks = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 4 + Math.random() * 8,
        delay: Math.random() * 5,
        duration: 4 + Math.random() * 6,
        opacity: 0.05 + Math.random() * 0.1,
      })),
    [count]
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {sparks.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.6, x: "-50%", y: "-50%" }}
          animate={{ opacity: [0, s.opacity, 0], scale: [0.85, 1.05, 0.9] }}
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
            background:
              "linear-gradient(180deg, rgba(255,138,43,0.95), rgba(255,202,148,0.7))",
            filter: "blur(8px)",
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}

/* ---------- main ---------- */
export default function GamificationPreviewSection() {
  const [timeframe, setTimeframe] = useState("this_week");
  const leaderboardData = useMemo(
    () => ({
      this_week: [
        { name: "Alice", points: 1280, rank: 1 },
        { name: "Rahul", points: 1150, rank: 2 },
        { name: "Sophia", points: 980, rank: 3 },
        { name: "Dev", points: 870, rank: 4 },
        { name: "Mira", points: 760, rank: 5 },
      ],
      all_time: [
        { name: "Alice", points: 50280, rank: 1 },
        { name: "Rahul", points: 44510, rank: 2 },
        { name: "Sophia", points: 39876, rank: 3 },
        { name: "Dev", points: 36540, rank: 4 },
      ],
    }),
    []
  );

  const currentList = leaderboardData[timeframe] || [];

  const top1Count = useCountUp(currentList[0]?.points || 0, 900, [timeframe]);
  const top2Count = useCountUp(currentList[1]?.points || 0, 900, [timeframe]);
  const top3Count = useCountUp(currentList[2]?.points || 0, 900, [timeframe]);

  const achievements = [
    { id: "a1", name: "First Steps", desc: "Complete your first lesson", icon: Star, unlocked: true },
    { id: "a2", name: "Streak 7", desc: "7 day streak", icon: Award, unlocked: false },
    { id: "a3", name: "Quiz Master", desc: "Score 90%+ on 5 quizzes", icon: Medal, unlocked: true },
    { id: "a4", name: "Speed Learner", desc: "Complete a course in record time", icon: Sparkles, unlocked: false },
  ];

  const level = 8;
  const xpCurrent = 650;
  const xpNext = 1000;
  const xpPercent = Math.round((xpCurrent / xpNext) * 100);

  const xpBarVariants = {
    hidden: { width: 0 },
    visible: { width: `${xpPercent}%` },
  };

  const listItemVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.98 },
    show: (i) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { delay: i * 0.08, type: "spring", stiffness: 120 },
    }),
  };

  return (
    <section className="relative py-20 px-4 sm:px-6 lg:px-10 bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white overflow-hidden">
      <SparksBackground />
      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-10">
          <div className="flex items-start sm:items-center gap-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}>
              <Trophy className="w-10 h-10 text-orange-400 drop-shadow-lg" />
            </motion.div>
            <div>
              <h2 className="text-3xl md:text-4xl text-orange-400 font-extrabold tracking-tight">
                Gamification — Leaderboards & Achievements
              </h2>
              <p className="text-zinc-400 mt-1 max-w-lg">
                SparkLab turns learning into a rewarding game — collect XP, unlock achievements, and compete on leaderboards.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="hidden sm:flex  items-center gap-2 text-sm text-orange-300">
              <Clock className="w-4 h-4 text-orange-400" />
              <span>Timeframe</span>
            </div>
            {/* Select styled */}
            <Select value={timeframe} onValueChange={(v) => setTimeframe(v)}>
              <SelectTrigger className="w-full sm:w-44 bg-zinc-900/60 border border-zinc-700 text-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900/95 border border-zinc-800 rounded-md shadow-lg">
                <SelectItem value="this_week" className="cursor-pointer px-3 py-2 text-sm text-zinc-300 hover:bg-orange-500/20 hover:text-orange-300 focus:bg-orange-500/20 focus:text-orange-300 data-[state=checked]:bg-orange-600/20 data-[state=checked]:text-orange-300">
                  This Week
                </SelectItem>
                <SelectItem value="all_time" className="cursor-pointer px-3 py-2 text-sm text-zinc-300 hover:bg-orange-500/20 hover:text-orange-300 focus:bg-orange-500/20 focus:text-orange-300 data-[state=checked]:bg-orange-600/20 data-[state=checked]:text-orange-300">
                  All Time
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Leaderboard */}
          <div className="lg:col-span-7 space-y-6">
            {/* Top 3 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* 1st */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <Card className="bg-gradient-to-br from-zinc-900/70 to-black/40 border border-orange-600/10 rounded-2xl shadow-[0_10px_40px_rgba(255,138,43,0.08)] overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                        <Medal className="w-6 h-6 text-yellow-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-400">Top Learner</div>
                        <div className="flex items-baseline gap-2">
                          <h4 className="text-lg text-orange-200 font-semibold truncate">{currentList[0]?.name || "—"}</h4>
                          <span className="text-xs text-zinc-400">#{currentList[0]?.rank || "-"}</span>
                        </div>
                        <div className="text-sm text-orange-300 mt-1">{top1Count.toLocaleString()} pts</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-zinc-800 rounded-full h-2">
                        <div style={{ width: `${Math.min(100, xpPercent)}%` }} className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-400" />
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        Level {level} • {xpCurrent}/{xpNext} XP
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
              {/* 2nd */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
                <Card className="bg-zinc-900/70 border border-zinc-700 rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700">
                        <Medal className="w-5 h-5 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-400">Runner Up</div>
                        <h4 className="text-md font-semibold text-orange-200 truncate">{currentList[1]?.name || "—"}</h4>
                        <div className="text-sm text-orange-300 mt-1">{top2Count.toLocaleString()} pts</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
              {/* 3rd */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
                <Card className="bg-zinc-900/70 border border-zinc-700 rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700">
                        <Medal className="w-5 h-5 text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-400">Third Place</div>
                        <h4 className="text-md font-semibold text-orange-200 truncate">{currentList[2]?.name || "—"}</h4>
                        <div className="text-sm text-orange-300 mt-1">{top3Count.toLocaleString()} pts</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
            {/* Leaderboard list */}
            <Card className="bg-zinc-900/70 border border-zinc-700 rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-orange-400" />
                    <span className="text-orange-400">Leaderboard</span>
                  </div>
                  <Badge className="bg-orange-500/20 text-orange-300 border border-orange-500/30">
                    {timeframe === "this_week" ? "This week" : "All time"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <motion.ul initial="hidden" animate="show">
                  {currentList.map((u, i) => (
                    <motion.li
                      key={u.name}
                      custom={i}
                      variants={listItemVariants}
                      initial="hidden"
                      animate="show"
                      className="flex items-center justify-between gap-4 px-3 py-3 rounded-xl hover:bg-zinc-800/80 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-md bg-zinc-800 flex items-center justify-center border border-zinc-700">
                          <span className="text-sm text-zinc-300 font-semibold">
                            {u.rank}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-orange-100 truncate">{u.name}</div>
                          <div className="text-xs text-zinc-400 truncate">
                            Learner • {Math.max(1, u.rank)} streak
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-orange-300">
                          {u.points.toLocaleString()}
                        </div>
                        <div className="text-xs text-zinc-400">pts</div>
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>
              </CardContent>
            </Card>
          </div>

          {/* Right: Achievements + XP + Quiz */}
          <div className="lg:col-span-5 space-y-6">
            {/* Achievements */}
            <Card className="bg-zinc-900/70 border border-zinc-700 rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center text-orange-400 gap-2">
                  <Sparkles className="w-5 h-5 text-orange-400" />
                  Achievements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {achievements.map((a) => {
                    const Icon = a.icon;
                    return (
                      <motion.div
                        key={a.id}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.98 }}
                        className={`p-3 rounded-xl flex items-start gap-3 transition ${a.unlocked
                            ? "bg-zinc-800/60 border border-orange-500/10"
                            : "bg-zinc-800/30 border border-zinc-700"
                          }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-md flex items-center justify-center ${a.unlocked
                              ? "bg-orange-500/10 border border-orange-500/20"
                              : "bg-zinc-900/40"
                            }`}
                        >
                          <Icon
                            className={`w-5 h-5 ${a.unlocked ? "text-orange-300" : "text-zinc-400"
                              }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-orange-100 truncate">{a.name}</div>
                            {a.unlocked ? (
                              <Badge className="bg-green-600/10 text-green-300">
                                Unlocked
                              </Badge>
                            ) : (
                              <Badge className="bg-zinc-800 text-zinc-300">
                                Locked
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-zinc-400 mt-1 truncate">
                            {a.desc}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* XP Card */}
            <Card className="bg-zinc-900/70 border border-zinc-700 rounded-2xl">
              <CardHeader>
                <CardTitle className="flex text-orange-400 items-center gap-2">
                  <Target className="w-5 h-5 text-orange-400" />
                  XP & Level
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-zinc-400">Level</div>
                    <div className="text-2xl font-extrabold text-orange-200 mt-1">#{level}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-zinc-400">XP</div>
                    <div className="text-lg font-semibold text-orange-300 mt-1">
                      {xpCurrent}/{xpNext}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                    <motion.div
                      initial="hidden"
                      animate="visible"
                      variants={xpBarVariants}
                      transition={{ duration: 1.1, ease: "easeOut" }}
                      className="h-3 rounded-full bg-gradient-to-r from-orange-500 to-orange-400"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-zinc-400">
                    <span>Progress to next level</span>
                    <span>{xpPercent}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Quiz */}
            <Card className="bg-zinc-900/70 border border-zinc-700 rounded-2xl">
              <CardContent>
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-lg bg-gradient-to-br from-orange-600/10 to-transparent border border-orange-600/10">
                    <ListChecks className="w-6 h-6 text-orange-300" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="text-sm text-zinc-400">
                          Quick Challenge
                        </div>
                        <div className="text-orange-100 font-semibold">
                          Mini Quiz — 3 questions
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-zinc-400">Reward</div>
                        <div className="text-sm font-semibold text-orange-300">
                          +120 XP
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-3">
                      <Button className="bg-orange-600/10 hover:bg-orange-600/30 cursor-pointer border border-orange-500/20 text-orange-300 hover:scale-105">
                        Start
                      </Button>
                      <Button className="bg-zinc-800/60 border border-zinc-700 hover:bg-zinc-700/70">
                        Preview
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
