"use client";

import React, { useRef, Suspense, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MousePointerClick,
  BookOpenCheck,
  FlaskConical,
  Trophy,
} from "lucide-react";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

/**
 * HowItWorksSection.jsx
 * - Dark + orange theme
 * - Electric/current flow: glowing tube + moving particle "packets" that travel along the curve
 * - Canvas sits behind cards (cards remain fully readable)
 * - Simplified / hidden 3D on small screens for perf & clarity
 */

const StepIcon = ({ children }) => (
  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-600/20 to-orange-500/10 border border-orange-500/30 flex items-center justify-center shadow-[0_10px_30px_rgba(249,115,22,0.25)]">
    {children}
  </div>
);

/* ---------- Three.js Flow Scene ---------- */
function CurrentParticles({ points, particleCount = 28 }) {
  // points: array of Vector3 control points for the curve
  const group = useRef();
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);

  // precompute particle params
  const particles = useMemo(() => {
    const arr = [];
    for (let i = 0; i < particleCount; i++) {
      arr.push({
        u: Math.random(), // initial param along curve [0,1]
        speed: 0.08 + Math.random() * 0.12, // speed multiplier
        scale: 0.02 + Math.random() * 0.04,
        color: new THREE.Color().setHSL(0.05 + Math.random() * 0.06, 0.9, 0.5),
      });
    }
    return arr;
  }, [particleCount]);

  // array of refs for meshes
  const meshRefs = useRef([]);
  meshRefs.current = [];

  const addRef = (r) => {
    if (r) meshRefs.current.push(r);
  };

  useFrame((state, delta) => {
    // animate each particle along the curve
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.u = (p.u + delta * p.speed * 0.12) % 1;
      const pos = curve.getPointAt(p.u);
      const idxRef = meshRefs.current[i];
      if (idxRef) {
        idxRef.position.copy(pos);
        // small bobbing to make it lively
        idxRef.position.y += Math.sin((state.clock.elapsedTime + i) * 2.0) * 0.005;
        idxRef.scale.setScalar(p.scale);
      }
    }

    // group subtle rotation for depth
    if (group.current) group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.12) * 0.06;
  });

  return (
    <group ref={group}>
      {particles.map((p, i) => (
        <mesh key={i} ref={addRef}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshStandardMaterial
            emissive={p.color}
            emissiveIntensity={1.6}
            color="#000000"
            metalness={0.2}
            roughness={0.1}
          />
        </mesh>
      ))}
    </group>
  );
}

function FlowPath({ points }) {
  // Draws a narrow glowing tube along the CatmullRom curve
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  // create tube geometry
  const tubeRef = useRef();
  const segments = 160;
  const radius = 0.03;

  // dynamic subtle pulse
  useFrame((state) => {
    if (tubeRef.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.03;
      tubeRef.current.scale.set(s, s, s);
    }
  });

  return (
    <mesh ref={tubeRef}>
      <tubeGeometry args={[curve, 256, radius, 10, false]} />
      <meshBasicMaterial
        attach="material"
        color="#ff8a2b"
        transparent
        opacity={0.18}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function ThreeFlowBackground({ className = "w-full h-full" }) {
  // Control points chosen to visually map left-to-right across canvas.
  // These are in world coordinates relative to the camera.
  const points = useMemo(
    () => [
      new THREE.Vector3(-1.8, 0.6, 0),
      new THREE.Vector3(-0.6, 0.2, -0.2),
      new THREE.Vector3(0.5, -0.05, 0.05),
      new THREE.Vector3(1.6, -0.2, 0.1),
    ],
    []
  );

  return (
    <Canvas
      className={className}
      camera={{ position: [0, 0, 4.8], fov: 48 }}
      style={{ position: "absolute", inset: 0 }}
    >
      <ambientLight intensity={0.8} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color={"#ffb07a"} />
      <directionalLight position={[-5, -3, 0]} intensity={0.2} />

      <Suspense fallback={null}>
        <FlowPath points={points} />
        <CurrentParticles points={points} particleCount={30} />
      </Suspense>

      {/* subtle controls (non-interactive since canvas sits under UI) */}
      <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
    </Canvas>
  );
}

/* ---------- Main Section Component ---------- */
export default function HowItWorksSection() {
  const steps = [
    {
      icon: <MousePointerClick className="w-6 h-6 text-orange-400" />,
      title: "Sign Up & Explore",
      desc: "Create your free SparkLab account and unlock all the tools in one ecosystem.",
    },
    {
      icon: <BookOpenCheck className="w-6 h-6 text-orange-400" />,
      title: "Learn & Practice",
      desc: "Access tutorials, labs, and simulations tailored to your learning path.",
    },
    {
      icon: <FlaskConical className="w-6 h-6 text-orange-400" />,
      title: "Experiment & Apply",
      desc: "Run virtual experiments and apply concepts with real-world projects.",
    },
    {
      icon: <Trophy className="w-6 h-6 text-orange-400" />,
      title: "Track & Achieve",
      desc: "Monitor your progress, earn badges, and level up your skills.",
    },
  ];

  return (
    <section className="relative py-16 px-4 sm:px-6 lg:px-8 bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white overflow-hidden">
      {/* Background Canvas - visible on md+ only for performance */}
      <div className="absolute inset-0 pointer-events-none -z-10 hidden md:block">
        {/* container keeps the canvas aligned with content area */}
        <div className="max-w-7xl mx-auto h-full">
          <div className="relative h-[360px]">
            <ThreeFlowBackground />
          </div>
        </div>
      </div>

      {/* Mobile fallback: subtle 2D animated gradient bar to indicate flow */}
      <div className="md:hidden absolute inset-x-6 top-6 pointer-events-none -z-10">
        <div className="h-2 rounded-full bg-gradient-to-r from-orange-500 via-orange-400 to-orange-200 opacity-25 animate-pulse" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-orange-300 via-orange-400 to-orange-500"
          >
            How It Works — SparkLab Flow
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.6 }}
            className="text-zinc-400 max-w-2xl mx-auto mt-4"
          >
            A powerful 4-step journey — glowing current flows between stages. Cards sit
            on top so content remains crystal clear.
          </motion.p>
        </div>

        {/* Cards Grid - cards sit above the canvas */}
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.03 }}
              transition={{
                delay: 0.06 * i,
                duration: 0.45,
                type: "spring",
                stiffness: 140,
              }}
              className="relative"
            >
              <Card className="bg-gradient-to-br from-zinc-900/70 to-black/60 border border-orange-600/10 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] hover:shadow-[0_12px_60px_rgba(249,115,22,0.08)] transition-all duration-300 overflow-visible">
                <CardContent className="p-5 flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <div>
                      <StepIcon>{step.icon}</StepIcon>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold leading-tight text-white">
                        {`${i + 1}. ${step.title}`}
                      </h3>
                      <p className="text-zinc-400 text-sm mt-1">{step.desc}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <button
                      className="px-3 py-2 rounded-md bg-orange-400 border border-orange-500/20 text-sm hover:scale-105 hover:bg-orange-500 cursor-pointer text-white transition-transform"
                      aria-label={`Learn more about ${step.title}`}
                    >
                      Learn more
                    </button>

                    <Badge className="bg-black/60 text-orange-300 border border-orange-600/20">
                      {i === steps.length - 1 ? "Goal" : `Step ${i + 1}`}
                    </Badge>
                  </div>

                  {/* small progress line for visual continuity */}
                  <motion.div
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    transition={{ delay: 0.12 + i * 0.04, duration: 0.5 }}
                    className="origin-left h-1 rounded-full bg-gradient-to-r from-orange-400 to-orange-600 mt-3"
                    style={{ height: 6, opacity: 0.95 }}
                  />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* mobile microflow indicator */}
        <div className="mt-6 md:hidden flex items-center justify-center gap-3">
          <div className="h-1 w-3/4 rounded-full bg-gradient-to-r from-orange-400 to-orange-600 animate-pulse opacity-60" />
        </div>
      </div>
    </section>
  );
}
