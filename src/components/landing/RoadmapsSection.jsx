// src/components/RoadmapsSection.jsx
import React, { useRef, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere, Line } from "@react-three/drei";
import { Zap, Cpu, BookOpen, Microscope, Trophy } from "lucide-react";

// Roadmap data
const roadmapSteps = [
  { icon: <Zap className="w-8 h-8 text-orange-500" />, title: "1. Fundamentals", desc: "Master Ohm’s Law, basic circuits, and electrical units." },
  { icon: <Cpu className="w-8 h-8 text-orange-500" />, title: "2. Circuit Analysis", desc: "Learn Thevenin, Norton, Mesh/Nodal, and RLC circuits." },
  { icon: <BookOpen className="w-8 h-8 text-orange-500" />, title: "3. Labs & Practicals", desc: "Perform experiments, calibration, and virtual labs." },
  { icon: <Microscope className="w-8 h-8 text-orange-500" />, title: "4. Real Applications", desc: "Explore power systems, renewable energy, and smart devices." },
  { icon: <Trophy className="w-8 h-8 text-orange-500" />, title: "5. Mastery", desc: "Apply knowledge in projects, competitions, and research." },
];

// ----------------------------------------------------
// Flowing orb along roadmap path
// ----------------------------------------------------
function FlowOrb({ pathPoints, speed = 0.5 }) {
  const ref = useRef();
  const tRef = useRef(0);

  useFrame((state, delta) => {
    tRef.current += delta * speed;
    const t = tRef.current % 1; // loop from 0 to 1

    const totalPoints = pathPoints.length;
    const idxFloat = t * (totalPoints - 1);
    const idx = Math.floor(idxFloat);
    const nextIdx = (idx + 1) % totalPoints;
    const lerpT = idxFloat - idx;

    const current = pathPoints[idx];
    const next = pathPoints[nextIdx];

    ref.current.position.x = current[0] + (next[0] - current[0]) * lerpT;
    ref.current.position.y = current[1] + (next[1] - current[1]) * lerpT;
    ref.current.position.z = 0;
  });

  return (
    <Sphere ref={ref} args={[0.12, 16, 16]}>
      <meshStandardMaterial color="orange" emissive="orange" emissiveIntensity={0.8} />
    </Sphere>
  );
}

// ----------------------------------------------------
// Animated line connecting cards
// ----------------------------------------------------
function FlowLine({ pathPoints }) {
  const tRef = useRef(0);
  const [visiblePoints, setVisiblePoints] = useState([
    [pathPoints[0][0], pathPoints[0][1], 0],
    [pathPoints[1][0], pathPoints[1][1], 0],
  ]);

  useFrame((state, delta) => {
    tRef.current += delta * 0.5;
    const t = tRef.current % 1;
    const count = Math.max(2, Math.floor(pathPoints.length * t));
    setVisiblePoints(pathPoints.slice(0, count).map(p => [p[0], p[1], 0]));
  });

  return <Line points={visiblePoints} color="orange" lineWidth={2} />;
}

// ----------------------------------------------------
// Main Section
// ----------------------------------------------------
export default function RoadmapsSection() {
  const spacing = 3;
  const pathPoints = useMemo(() => {
    return roadmapSteps.map((_, i) => [i * spacing - ((roadmapSteps.length - 1) * spacing) / 2, 0]);
  }, []);

  return (
    <section className="py-16 sm:py-20 md:py-24 px-4 sm:px-6 lg:px-8  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white relative overflow-hidden">
      {/* Three.js Canvas */}
      <div className="absolute inset-0 -z-10">
        <Canvas camera={{ position: [0, 0, 6] }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} />
          <FlowLine pathPoints={pathPoints} />
          <FlowOrb pathPoints={pathPoints} speed={0.3} />
        </Canvas>
      </div>

      <div className="max-w-6xl mx-auto text-center relative z-10">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-3xl sm:text-4xl md:text-5xl text-orange-400 font-bold mb-6"
        >
          Roadmaps for BEEE Mastery
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          viewport={{ once: true }}
          className="text-zinc-400 max-w-2xl mx-auto mb-12 text-sm sm:text-base"
        >
          Follow a clear, structured journey — from beginner to pro — with SparkLab’s step-by-step roadmaps.
        </motion.p>

        <div className="flex flex-col md:flex-row md:justify-between md:space-x-6 space-y-8 md:space-y-0">
          {roadmapSteps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.15, duration: 0.6 }}
              viewport={{ once: true }}
              className="relative flex-1 bg-zinc-900/70 border border-zinc-700 rounded-2xl p-6 shadow-lg hover:shadow-orange-500/30 hover:scale-105 transition-all duration-300"
            >
              <div className="flex justify-center mb-4">{step.icon}</div>
              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-zinc-400 text-sm sm:text-base">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
