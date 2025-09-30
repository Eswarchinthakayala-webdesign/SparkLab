// src/pages/AboutPage.jsx
"use client";

import React, { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import * as THREE from "three";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  Users,
  Lightbulb,
  Globe,
  Target,
  Award,
} from "lucide-react";
import Navbar from "../components/landing/Navbar";

/* -----------------------
   SparkCircuit - circuit-like 3D animation
   - concentric node rings + connecting traces
   - glowing nodes, pulsing, subtle rotation
   - responsive sizing and proper cleanup
   ----------------------- */
function SparkCircuit({ className = "" }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Scene, camera, renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.02);

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0.4, 6);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambient);

    const key = new THREE.PointLight(0xffa76b, 1.2, 25);
    key.position.set(6, 6, 6);
    scene.add(key);

    const rim = new THREE.PointLight(0xff7a2f, 0.6, 25);
    rim.position.set(-6, -4, 4);
    scene.add(rim);

    // Groups
    const root = new THREE.Group();
    scene.add(root);

    // Node & trace storage
    const nodes = [];
    const traces = [];

    // Create concentric rings of nodes
    const ringCount = 3;
    let totalNodeCount = 0;
    for (let r = 0; r < ringCount; r++) {
      const radius = 0.9 + r * 0.9; // spacing
      const nodesOnRing = 6 + r * 4;
      for (let i = 0; i < nodesOnRing; i++) {
        const theta = (i / nodesOnRing) * Math.PI * 2;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius * 0.95;
        const y = (Math.random() - 0.5) * 0.18; // slight vertical jitter

        // core sphere (glowing)
        const coreGeo = new THREE.SphereGeometry(0.08 - r * 0.01, 16, 16);
        const coreMat = new THREE.MeshStandardMaterial({
          color: 0xff8a3d,
          emissive: 0xff8a3d,
          emissiveIntensity: 0.8,
          metalness: 0.2,
          roughness: 0.2,
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.set(x, y, z);

        // outer glow (transparent layer)
        const glowGeo = new THREE.SphereGeometry(0.18 - r * 0.02, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0xffa76b,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.copy(core.position);

        const nodeGroup = new THREE.Group();
        nodeGroup.add(glow);
        nodeGroup.add(core);

        root.add(nodeGroup);

        nodes.push({
          group: nodeGroup,
          core,
          glow,
          basePosition: new THREE.Vector3(x, y, z),
          ring: r,
          index: totalNodeCount,
        });
        totalNodeCount++;
      }
    }

    // Build trace line segments (connect neighbors and inner ring)
    const segments = [];
    // helper to get nodes by ring
    const ringNodes = [];
    let cursor = 0;
    for (let r = 0; r < ringCount; r++) {
      const count = 6 + r * 4;
      const arr = nodes.slice(cursor, cursor + count);
      ringNodes.push(arr);
      cursor += count;
    }

    // connect within same ring neighbors
    for (let r = 0; r < ringCount; r++) {
      const arr = ringNodes[r];
      const count = arr.length;
      for (let i = 0; i < count; i++) {
        const a = arr[i].basePosition;
        const b = arr[(i + 1) % count].basePosition;
        segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }

    // connect ring to inner ring nodes (radial traces)
    for (let r = 1; r < ringCount; r++) {
      const outer = ringNodes[r];
      const inner = ringNodes[r - 1];
      for (let i = 0; i < outer.length; i++) {
        const a = outer[i].basePosition;
        const nearestIdx = Math.floor((i / outer.length) * inner.length);
        const b = inner[nearestIdx].basePosition;
        segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }

    const traceGeometry = new THREE.BufferGeometry();
    traceGeometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
    const traceMaterial = new THREE.LineBasicMaterial({
      color: 0xffb88a,
      transparent: true,
      opacity: 0.9,
    });
    const traceLines = new THREE.LineSegments(traceGeometry, traceMaterial);
    root.add(traceLines);
    traces.push(traceLines);

    // subtle base plane (circuit board feeling)
    const planeGeo = new THREE.CircleGeometry(3.6, 64);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.02,
    });
    const basePlane = new THREE.Mesh(planeGeo, planeMat);
    basePlane.rotation.x = -Math.PI / 2;
    basePlane.position.y = -0.9;
    root.add(basePlane);

    // camera dolly variables
    let time = 0;
    let frameId;

    // Animation loop
    const animate = () => {
      frameId = requestAnimationFrame(animate);

      time += 0.016;

      // rotate root slowly and add small oscillation
      root.rotation.y += 0.0035;
      root.rotation.x = Math.sin(time * 0.1) * 0.02;

      // pulse nodes: scale core & glow
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const pulse = 1 + 0.12 * Math.sin(time * 2 + i * 0.6);
        const ringDim = 1 - n.ring * 0.08;
        n.core.scale.setScalar(pulse * ringDim);
        n.glow.scale.setScalar(pulse * (1.6 - n.ring * 0.08));
        // slight vertical float
        n.group.position.y = Math.sin(time * 1.2 + i * 0.3) * 0.02;
      }

      // subtle trace shimmer: modulate opacity
      const pos = traceMaterial;
      pos.opacity = 0.65 + Math.sin(time * 0.8) * 0.12;

      // gentle camera bob for depth
      camera.position.z = 5.6 + Math.sin(time * 0.18) * 0.12;

      renderer.render(scene, camera);
    };

    animate();

    // Responsive resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // If container resizes (e.g., tailwind breakpoints), ensure update
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    // Cleanup
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      ro.disconnect();

      // dispose geometry & materials
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose && obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose && m.dispose());
          } else {
            obj.material.dispose && obj.material.dispose();
          }
        }
        if (obj.texture) obj.texture.dispose && obj.texture.dispose();
      });

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Make container responsive in height
  return (
    <div
      ref={mountRef}
      className={`w-full h-64 sm:h-80 md:h-[420px] lg:h-[520px] ${className}`}
      aria-hidden
    />
  );
}

/* -----------------------
   Full About Page
   ----------------------- */
export default function AboutPage() {
  return (
    <div className="relative bg-black text-white min-h-screen overflow-x-hidden">
      <ParticleAccent />
      <Navbar />

      {/* HERO */}
      <header className="relative z-10 px-6 sm:px-8 lg:px-20 pt-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left column - text + features */}
            <motion.div
              className="lg:col-span-6"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Badge className="bg-zinc-900 border border-orange-600 text-orange-300">
                About SparkLab
              </Badge>

              <h1 className="mt-6 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-300">
                  SparkLab — Professional Learning Engine
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base sm:text-lg text-zinc-400">
                SparkLab blends simulations, collaborative workflows, and
                research-grade experiments to make electrical engineering
                learning immersive and measurable.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="/"
                  className="px-6 py-3 rounded-lg bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold shadow-lg hover:scale-[1.02] transition"
                >
                  Get Started
                </a>

                <a
                  href="/features"
                  className="px-5 py-3 rounded-lg border border-zinc-800 text-zinc-200 hover:border-orange-500 transition"
                >
                  Explore Features
                </a>
              </div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                <FeatureCard icon={<Zap size={18} />} title="70+ Tools" />
                <FeatureCard icon={<Lightbulb size={18} />} title="Interactive Sims" />
                <FeatureCard icon={<Users size={18} />} title="Collaboration" />
                <FeatureCard icon={<Globe size={18} />} title="Integration" />
              </div>
            </motion.div>

            {/* Right column - circuit animation */}
            <motion.div
              className="lg:col-span-6  lg:order-2 flex items-center justify-center"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1 }}
            >
              <div className="w-full max-w-[720px] rounded-3xl overflow-hidden border border-orange-700/20 bg-gradient-to-b from-zinc-900/60 to-black p-3">
                <div className="rounded-2xl overflow-hidden bg-black/40">
                  <SparkCircuit />
                </div>
                <div className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Circuit Cluster</h3>
                    <p className="text-sm text-zinc-400">
                      Live circuit-like 3D visualization showcasing SparkLab's engine.
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Badge className="bg-orange-500/10 border border-orange-500 text-orange-300 px-3 py-1 rounded">Live</Badge>
                    <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded">WebGL</Badge>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </header>

      {/* Mission & Vision (equal height) */}
      <section className="relative z-10 px-6 sm:px-8 lg:px-20 py-20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          <EqualCard
            icon={<Target size={20} />}
            title="Our Mission"
            text="Deliver immersive, curriculum-aligned tools that move learners from concept to mastery — with accuracy, real-time feedback, and collaborative experimentation."
            stats={[
              { value: "Interactive", label: "Hands-on Tools" },
              { value: "Validated", label: "Research Models" },
            ]}
          />

          <EqualCard
            icon={<Award size={20} />}
            title="Our Vision"
            text="Be the benchmark platform for electrical engineering — empowering educators and institutions to teach complex systems with clarity and measurable outcomes."
            stats={[
              { value: "Scalable", label: "Institution Ready" },
              { value: "Collaborative", label: "Team & Class Labs" },
            ]}
          />
        </div>
      </section>

            <section className="py-24 px-6 max-w-5xl mx-auto relative">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-4xl font-bold text-center mb-12 text-orange-400"
        >
          Our Journey
        </motion.h2>
        <div className="space-y-12 relative before:absolute before:left-4 md:before:left-1/2 before:top-0 before:bottom-0 before:w-1 before:bg-orange-500/40">
          {[
            { year: "Sep-2025", text: "Idea born to simplify BEEE learning." },
            { year: "Sep-2025", text: "Released 30+ interactive tools & simulations." },
            { year: "Oct-2025", text: "Expanded into 70+ features with collaboration." },
          ].map((milestone, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: i % 2 === 0 ? -60 : 60 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.2, duration: 0.6 }}
              viewport={{ once: true }}
              className={`flex flex-col md:flex-row items-center gap-6 ${
                i % 2 === 0 ? "md:justify-start" : "md:justify-end"
              }`}
            >
              <div className="bg-orange-500 text-black font-bold text-xl px-6 py-3 rounded-xl shadow-lg">
                {milestone.year}
              </div>
              <p className="text-zinc-300 max-w-md">{milestone.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Stats quick row */}
      <section className="relative z-10 px-6 sm:px-8 lg:px-20 pb-24">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
          <StatCard value="70+" label="Interactive Features" delay={0} />
          <StatCard value="10k+" label="Active Learners" delay={0.08} />
          <StatCard value="120+" label="Institutions" delay={0.16} />
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 sm:px-8 lg:px-20 pb-12 text-center text-zinc-500">
        © {new Date().getFullYear()} SparkLab — All rights reserved
      </footer>
    </div>
  );
}

/* -----------------------
   Helper components
   ----------------------- */
function FeatureCard({ icon, title }) {
  return (
    <div className="flex items-start gap-3 bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
      <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-orange-500 to-yellow-400 flex items-center justify-center text-black">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-xs text-zinc-400">Professional-grade</div>
      </div>
    </div>
  );
}

function EqualCard({ icon, title, text, stats }) {
  return (
    <Card className="h-full bg-zinc-900/60 border border-orange-600/20 rounded-2xl">
      <CardContent className="p-6 md:p-8 flex flex-col h-full">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 rounded-full w-12 h-12 bg-gradient-to-tr from-orange-500 to-yellow-400 flex items-center justify-center text-black">
            {icon}
          </div>
          <div>
            <h3 className="text-2xl font-semibold text-orange-300">{title}</h3>
            <p className="mt-3 text-zinc-300">{text}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 mt-auto">
          {stats.map((s, i) => (
            <StatTile key={i} value={s.value} label={s.label} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({ value, label }) {
  return (
    <div className="rounded-lg bg-zinc-900/40 border border-orange-600/10 p-4 text-center">
      <div className="text-2xl font-bold text-orange-300">{value}</div>
      <div className="text-sm text-zinc-300 mt-1">{label}</div>
    </div>
  );
}

function StatCard({ value, label, delay = 0 }) {
  return (
    <motion.div
      className="rounded-2xl p-6 bg-gradient-to-br from-zinc-900/60 to-black border border-orange-600/10 text-center"
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
    >
      <h4 className="text-4xl font-extrabold text-orange-400">{value}</h4>
      <p className="mt-2 text-zinc-300">{label}</p>
    </motion.div>
  );
}

/* -----------------------
   Subtle background accents
   ----------------------- */
function ParticleAccent() {
  return (
    <div aria-hidden className="absolute inset-0 -z-20 pointer-events-none overflow-hidden">
      <div className="hidden lg:block absolute -right-40 -top-36 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-orange-700/10 to-yellow-300/6 blur-3xl" />
      <div className="absolute -left-28 bottom-[-120px] w-[320px] h-[320px] rounded-full bg-gradient-to-tr from-orange-600/6 to-yellow-400/5 blur-2xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(255,122,47,0.03),transparent 10%),radial-gradient(circle_at_90%_80%,rgba(255,182,110,0.02),transparent 10%)]" />
    </div>
  );
}
