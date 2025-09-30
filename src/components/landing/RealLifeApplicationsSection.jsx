// src/components/RealLifeApplicationsSection.jsx
"use client";

import React, { Suspense, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  Gauge,
  Sun,
  Battery,
  Zap,
  Lamp,
  Thermometer,
} from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Float,
  Html,
  Environment,
  Sparkles,
} from "@react-three/drei";

// ----------------------------------------------------
// 3D Demo Components (simulate real devices)
// ----------------------------------------------------

// Floating energy meter with rotating needle
function EnergyMeterDemo() {
  const needleRef = useRef();
  useFrame(({ clock }) => {
    if (needleRef.current) {
      needleRef.current.rotation.z = Math.sin(clock.getElapsedTime() * 2) * 0.5;
    }
  });
  return (
    <group>
      {/* Base meter */}
      <mesh>
        <cylinderGeometry args={[1, 1, 0.2, 32]} />
        <meshStandardMaterial color="#1e1e1e" />
      </mesh>
      {/* Needle */}
      <mesh ref={needleRef} position={[0, 0.15, 0]}>
        <boxGeometry args={[0.05, 0.05, 1]} />
        <meshStandardMaterial color="#FF8A2B" />
      </mesh>
    </group>
  );
}

// Solar panel demo with light rotation
function SolarPanelDemo() {
  const panelRef = useRef();
  useFrame(({ clock }) => {
    if (panelRef.current) {
      panelRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.6) * 0.2;
    }
  });
  return (
    <group ref={panelRef} scale={0.8}>
      <mesh>
        <boxGeometry args={[2, 0.1, 1]} />
        <meshStandardMaterial color="#2c2c2c" />
      </mesh>
      {/* Sunlight effect */}
      <mesh position={[0, 0.15, 0]}>
        <planeGeometry args={[2, 1]} />
        <meshStandardMaterial color="#FFD47F" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

// Battery pack with charging animation
function BatteryDemo() {
  const chargeRef = useRef();
  useFrame(({ clock }) => {
    if (chargeRef.current) {
      chargeRef.current.scale.y =
        0.3 + Math.abs(Math.sin(clock.getElapsedTime() * 2)) * 0.7;
    }
  });
  return (
    <group>
      {/* Battery body */}
      <mesh>
        <boxGeometry args={[1, 2, 0.5]} />
        <meshStandardMaterial color="#1e1e1e" />
      </mesh>
      {/* Charge bar */}
      <mesh ref={chargeRef} position={[0, -0.5, 0.26]}>
        <boxGeometry args={[0.8, 1, 0.05]} />
        <meshStandardMaterial color="#FF8A2B" />
      </mesh>
    </group>
  );
}

// ----------------------------------------------------
// Reusable Card Component
// ----------------------------------------------------
function RealLifeCard({ icon: Icon, title, desc, DemoComponent }) {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="h-full"
    >
      <Card className="h-full bg-zinc-900/70 border border-zinc-700 rounded-2xl shadow-[0_8px_25px_rgba(255,138,43,0.12)] hover:shadow-orange-500/30 transition-all duration-300 overflow-hidden">
        <CardContent className="flex flex-col items-center text-center gap-4 p-4 sm:p-6">
          {/* Icon */}
          <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-zinc-800/40 rounded-lg border border-zinc-700">
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-orange-400" />
          </div>

          {/* Title */}
          <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white">
            {title}
          </h3>

          {/* Description */}
          <p className="text-zinc-400 text-xs sm:text-sm md:text-base leading-relaxed">
            {desc}
          </p>

          {/* 3D Canvas Demo */}
          <div className="w-full h-40 sm:h-48 md:h-56 lg:h-72 mt-4 rounded-xl overflow-hidden border border-zinc-700/40 shadow-[0_6px_20px_rgba(255,138,43,0.1)]">
            <Canvas camera={{ position: [0, 1.5, 5], fov: 35 }}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 5, 5]} intensity={1} />
              <Suspense fallback={<Html>Loading...</Html>}>
                <Float
                  speed={1.2}
                  rotationIntensity={0.5}
                  floatIntensity={0.3}
                  floatingRange={[0.05, 0.1]}
                >
                  <DemoComponent />
                </Float>
              </Suspense>
              <Sparkles
                size={5}
                scale={[5, 5, 5]}
                position={[0, 0, 0]}
                speed={0.4}
                count={15}
                color="#FF8A2B"
              />
              <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.8} />
              <Environment preset="city" />
            </Canvas>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ----------------------------------------------------
// Main Section Component
// ----------------------------------------------------
export default function RealLifeApplicationsSection() {
  const items = useMemo(
    () => [
      {
        icon: Gauge,
        title: "Energy Analyzer",
        desc: "Calculate kWh usage and electricity costs for real appliances and devices.",
        DemoComponent: EnergyMeterDemo,
      },
      {
        icon: Sun,
        title: "Solar Estimator",
        desc: "Find the ideal solar panel setup to power your home or project efficiently.",
        DemoComponent: SolarPanelDemo,
      },
      {
        icon: Battery,
        title: "UPS & Battery Designer",
        desc: "Design custom UPS backup systems and predict runtime with ease.",
        DemoComponent: BatteryDemo,
      },
      {
        icon: Zap,
        title: "Power Flow Simulator",
        desc: "Simulate AC/DC power flow across circuits with interactive visualization.",
        DemoComponent: EnergyMeterDemo,
      },
      {
        icon: Lamp,
        title: "Lightning Safety Analyzer",
        desc: "Predict lightning impact and analyze electrical safety measures.",
        DemoComponent: SolarPanelDemo,
      },
      {
        icon: Thermometer,
        title: "Temperature Monitoring",
        desc: "Monitor thermal profiles of batteries and components in real time.",
        DemoComponent: BatteryDemo,
      },
    ],
    []
  );

  return (
    <section className="py-16 sm:py-20 md:py-24 px-4 sm:px-6 lg:px-8  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white overflow-hidden">
      <div className="max-w-7xl  mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 sm:mb-16"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400">
            Real-Life Applications
          </h2>
          <p className="mt-3 sm:mt-4 text-zinc-400 max-w-2xl sm:max-w-3xl mx-auto text-xs sm:text-sm md:text-base">
            Go beyond theory — explore how SparkLab connects electrical concepts to real-world
            use cases in energy, sustainability, and automation. Interactive 3D demos let you
            visualize and experiment with devices in real time.
          </p>
        </motion.div>

        {/* Cards Grid */}
        <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <RealLifeCard
              key={index}
              icon={item.icon}
              title={item.title}
              desc={item.desc}
              DemoComponent={item.DemoComponent}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
