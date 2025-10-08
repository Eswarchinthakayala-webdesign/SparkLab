// src/pages/VisualizationToolsPage.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import {
  Activity,
  Cpu,
  Square,
  CircuitBoard,
  GitBranch,
  Binary,
  Calculator,
  Lightbulb,
  Disc,
  Gauge,
  Search,
  Menu,
  X,
  Smile,
  Play,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import Footer from "../components/landing/Footer";

/* ====================== Tools Data ====================== */
const tools = [
  {
    id: "waveform-studio",
    title: "Waveform Studio",
    desc: "Generate and visualize sine, square, triangular, and sawtooth signals with harmonics.",
    icon: Square,
    category: "Signal Processing",
  },
  {
    id: "phasor-diagram",
    title: "Phasor Diagram Animator",
    desc: "Animated rotating phasors for AC circuit understanding.",
    icon: Activity,
    category: "AC Analysis",
  },
  {
    id: "circuit-playground",
    title: "Circuit Playground",
    desc: "Drag & drop components to build and simulate circuits visually.",
    icon: CircuitBoard,
    category: "Circuit Simulation",
  },
  {
    id: "logic-gate-simulator",
    title: "Logic Gate Simulator",
    desc: "Simulate logic gates, truth tables, adders, and multiplexers interactively.",
    icon: Binary,
    category: "Digital Logic",
  },
  {
    id: "kmap-solver",
    title: "Karnaugh Map Solver & Visualizer",
    desc: "Minimize Boolean expressions and visualize step-by-step K-map reductions.",
    icon: Calculator,
    category: "Digital Logic",
  },
  {
    id: "mesh-nodal-solver",
    title: "Mesh & Nodal Analysis Auto-Solver",
    desc: "Automated KCL/KVL visual solver with node labeling and voltage results.",
    icon: GitBranch,
    category: "Circuit Analysis",
  },
  {
    id: "motor-generator-demo",
    title: "3D Motor/Generator Demo",
    desc: "Interactive 3D animation explaining electromagnetic induction visually.",
    icon: Lightbulb,
    category: "Electro-Mechanical",
  },
  {
    id: "transformer-animation",
    title: "Transformer Animation",
    desc: "Interactive visualization of flux, winding, and EMF generation.",
    icon: Cpu,
    category: "Electro-Mechanical",
  },
  {
    id: "rlc-response",
    title: "RLC Frequency Response Visualizer",
    desc: "Explore Bode plots and resonance for RLC circuits.",
    icon: Disc,
    category: "AC Analysis",
  },
  {
    id: "oscilloscope-simulator",
    title: "Oscilloscope Simulator",
    desc: "Virtual oscilloscope for signal visualization and measurements.",
    icon: Gauge,
    category: "Measurement Tools",
  },
];

const categories = ["All", ...new Set(tools.map((t) => t.category))];

/* ====================== Small helpers ====================== */
function highlightText(text = "", query = "") {
  if (!query) return text;
  const q = query.toLowerCase();
  return text.split(new RegExp(`(${q})`, "gi")).map((part, i) =>
    part.toLowerCase() === q ? (
      <mark key={i} className="bg-transparent text-orange-300 font-semibold">{part}</mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/* ====================== Tiny SVG animated preview (very lightweight) ====================== */
function TinyWavePreview({ variant = "sine" }) {
  // simple animated SVG path; CSS animate stroke-dashoffset for motion
  const id = `tinywave-${variant}-${Math.random().toString(36).slice(2, 8)}`;
  const path = {
    sine: "M0 12 Q25 0 50 12 T100 12 T150 12",
    square: "M0 12 L25 12 L25 0 L50 0 L50 12 L75 12 L75 0 L100 0",
    triangle: "M0 12 L25 0 L50 12 L75 0 L100 12",
    saw: "M0 12 L25 0 L50 12 L75 0 L100 12",
  }[variant] || "M0 12 Q25 0 50 12 T100 12";
  return (
    <svg width="120" height="24" viewBox="0 0 120 24" className="block">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="1">
          <stop offset="0%" stopColor="#ff7a2d" />
          <stop offset="100%" stopColor="#ffd24a" />
        </linearGradient>
      </defs>
      <path d={path} fill="transparent" stroke={`url(#${id}-g)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-[dash_1.8s_linear_infinite]" />
      <style>{`.animate-[dash_1.8s_linear_infinite]{ stroke-dasharray: 40; stroke-dashoffset: 0; animation: dash 1.8s linear infinite } @keyframes dash{ to { stroke-dashoffset: -80 } }`}</style>
    </svg>
  );
}

/* ====================== HERO: unique 3D animation with pointer parallax ====================== */
function HeroCanvas({ className = "" }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);
    scene.fog = new THREE.FogExp2(0x05060a, 0.04);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 1.5, 6);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    // lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.2);
    const keyLight = new THREE.PointLight(0xff7a2d, 1.0, 20);
    keyLight.position.set(4, 4, 6);
    const fillLight = new THREE.PointLight(0x3a8aff, 0.8, 25);
    fillLight.position.set(-4, -3, 5);
    scene.add(ambient, keyLight, fillLight);

    // group root
    const root = new THREE.Group();
    scene.add(root);

    // === 1. WAVE GRID ===
    const gridGeo = new THREE.PlaneGeometry(10, 10, 80, 80);
    const gridMat = new THREE.MeshStandardMaterial({
      color: 0x141414,
      emissive: 0x1a1a1a,
      metalness: 0.6,
      roughness: 0.8,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -1.5;
    root.add(grid);

    // === 2. ENERGY CORE (ring) ===
    const ringGeo = new THREE.TorusGeometry(1.2, 0.05, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff9a3d,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    root.add(ring);

    // === 3. FLOATING NODES ===
    const nodeGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const nodeMat = new THREE.MeshBasicMaterial({
      color: 0xff9a3d,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const nodes = [];
    for (let i = 0; i < 12; i++) {
      const n = new THREE.Mesh(nodeGeo, nodeMat.clone());
      const angle = (i / 12) * Math.PI * 2;
      n.position.set(Math.cos(angle) * 1.6, Math.sin(angle) * 0.3, Math.sin(angle) * 1.6);
      root.add(n);
      nodes.push(n);
    }

    // === 4. PARTICLE FIELD ===
    const count = 100;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.06,
      transparent: true,
      opacity: 0.6,
      color: 0xffd24a,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(pGeo, pMat);
    root.add(particles);

    // === Animation state ===
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    container.addEventListener("pointermove", (e) => {
      const rect = container.getBoundingClientRect();
      pointer.x = (e.clientX - rect.left) / rect.width - 0.5;
      pointer.y = (e.clientY - rect.top) / rect.height - 0.5;
    });

    let t = 0;
    const animate = () => {
      requestAnimationFrame(animate);
      t += 0.02;

      // Animate grid as dynamic waveform
      const pos = grid.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const wave = Math.sin(x * 0.8 + t) * 0.15 + Math.cos(y * 0.8 + t * 0.7) * 0.15;
        pos.setZ(i, wave);
      }
      pos.needsUpdate = true;

      // ring rotation pulse
      ring.rotation.z += 0.01;
      ring.material.opacity = 0.5 + 0.3 * Math.sin(t * 1.2);

      // orbiting nodes
      nodes.forEach((n, i) => {
        const angle = t * 0.8 + (i / nodes.length) * Math.PI * 2;
        const r = 1.6 + 0.1 * Math.sin(t + i);
        n.position.x = Math.cos(angle) * r;
        n.position.z = Math.sin(angle) * r;
        n.position.y = Math.sin(t * 1.2 + i) * 0.5;
        n.material.opacity = 0.6 + 0.4 * Math.sin(t * 1.5 + i);
      });

      // slight particle motion
      particles.rotation.y += 0.0015;
      particles.rotation.x = Math.sin(t * 0.2) * 0.2;

      // subtle camera parallax
      pointer.tx += (pointer.x * 2 - pointer.tx) * 0.05;
      pointer.ty += (pointer.y * 1 - pointer.ty) * 0.05;
      camera.position.x = pointer.tx;
      camera.position.y = 1.5 + pointer.ty;
      camera.lookAt(0, 0, 0);

      root.rotation.y += 0.001;
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      container.innerHTML = "";
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose?.();
      });
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={`w-full h-64 sm:h-80 md:h-96 lg:h-[420px] ${className}`}
      aria-hidden
    />
  );
}


/* ====================== Magnetic (optimized) ====================== */
function useMagnetic() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let tx = 0, ty = 0;
    const handle = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) / (r.width / 2);
      const y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      tx = y * -6;
      ty = x * 6;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const apply = () => {
      raf = 0;
      el.style.willChange = "transform";
      el.style.transform = `perspective(900px) rotateX(${tx.toFixed(2)}deg) rotateY(${ty.toFixed(2)}deg) scale(1.02)`;
    };
    const leave = () => {
      el.style.transition = "transform 420ms cubic-bezier(.2,.9,.3,1)";
      el.style.transform = "";
      setTimeout(() => (el.style.transition = ""), 420);
    };
    el.addEventListener("pointermove", handle, { passive: true });
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", handle);
      el.removeEventListener("pointerleave", leave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}

/* ====================== ToolCard (enhanced) ====================== */
function ToolCard({ tool, idx, search, onOpen }) {
  const Icon = tool.icon;
  const refMag = useMagnetic();

  // keyboard activation
  const onKey = (e) => {
    if (e.key === "Enter" || e.key === " ") onOpen(tool.id);
  };

  // tiny preview variant selection for visual variety
  const variants = ["sine", "square", "triangle", "saw"];
  const variant = variants[idx % variants.length];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * 0.035, duration: 0.52 }}>
      <div ref={refMag} tabIndex={0} onKeyDown={onKey} aria-label={`Tool ${tool.title}`} className="relative rounded-2xl p-[1px] bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] hover:shadow-[0_12px_50px_rgba(255,138,61,0.06)]">
        <Card className="bg-gradient-to-b from-black/80 to-zinc-900/60 rounded-2xl overflow-hidden border border-zinc-800 shadow-lg">
          <CardHeader className="p-5 flex gap-4 items-center">
            <div className="flex-shrink-0 w-14 h-14 rounded-full bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black shadow-[0_6px_18px_rgba(255,122,29,0.12)]">
              <Icon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold text-white">{highlightText(tool.title, search)}</CardTitle>
              <div className="text-xs text-zinc-400 truncate mt-1">{highlightText(tool.desc, search)}</div>
            </div>
            <div className="ml-auto hidden md:block">
              <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300">Preview</Badge>
            </div>
          </CardHeader>

          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex-1">
              <TinyWavePreview variant={variant} />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => onOpen(tool.id)} aria-label={`Open ${tool.title}`} className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer">
                <Play className="w-4 h-4" /> Open
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

/* ====================== Page component ====================== */
export default function VisualizationToolsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchRef = useRef(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectValue, setSelectValue] = useState("All");
  // keyboard shortcut: Ctrl/Cmd+K to focus search
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus && searchRef.current.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filteredTools = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    return tools.filter((t) => {
      const target = (t.title + " " + t.desc + " " + t.category).toLowerCase();
      const matchesSearch = !q || target.includes(q);
      const matchesCategory = (activeCategory === "All" || t.category === activeCategory) && (selectValue === "All" || t.category === selectValue);
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory, selectValue]);

  const openTool = (id) => {
    // navigate to tool route (client router)
    if (typeof navigate === "function") navigate(`/visualizations/${id}`);
    else window.location.href = `/visualizations/${id}`;
  };

  return (
    <div className="min-h-screen bg-[#05060a] text-white relative overflow-x-hidden bg-[radial-gradient(circle,_rgba(255,122,28,0.12)_1px,transparent_1px)] bg-[length:20px_20px]">
      {/* header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/40 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button className="lg:hidden p-2 rounded-md hover:bg-zinc-900/50" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                <Menu className="w-6 h-6 text-[#ff9a4a]" />
              </button>
              <div onClick={() => navigate("/")} className="flex items-center gap-3 cursor-pointer select-none">
                <div className="w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
                  <Activity className="w-5 h-5" />
                </div>
                <div className="block">
                  <div className="text-sm text-zinc-300">SparkLab</div>
                  <div className="text-xs text-zinc-400 -mt-0.5">Visual Engine</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search visual tools..." className="pl-9 bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-500" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* mobile sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.aside initial={{ x: -320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -320, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 28 }} className="fixed inset-y-0 left-0 z-50 w-80 bg-gradient-to-b from-black/95 to-zinc-900 border-r border-zinc-800 p-6 lg:hidden">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm text-zinc-300">SparkLab</div>
                    <div className="text-xs text-zinc-400 -mt-0.5">Visual Engine</div>
                  </div>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-md hover:bg-zinc-800/50"><X className="w-5 h-5 text-zinc-300" /></button>
              </div>

              <nav className="space-y-3 max-h-[60vh] overflow-auto pr-2">
                {tools.map((t) => (
                  <button key={t.id} onClick={() => { setSidebarOpen(false); openTool(t.id); }} className="flex items-center gap-3 w-full text-left p-3 rounded-lg hover:bg-zinc-900/40 transition">
                    <t.icon className="w-5 h-5 text-[#ff9a4a]" />
                    <div>
                      <div className="text-sm text-zinc-200">{t.title}</div>
                      <div className="text-xs text-zinc-400 truncate max-w-[200px]">{t.desc}</div>
                    </div>
                  </button>
                ))}
              </nav>

              <div className="mt-6">
                <Button className="w-full bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => navigate("/")}>Home</Button>
              </div>
            </motion.aside>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.45 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
          </>
        )}
      </AnimatePresence>

      {/* main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-12">
          <div className="lg:col-span-7 space-y-6">
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a]">Visualization & Simulation</span> Tools
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.6 }} className="text-zinc-400 text-base sm:text-lg leading-relaxed">
              Interactive simulations, signal analyzers and visual circuit tools — learn, test and prototype with live visuals.
            </motion.p>

        
                       <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center flex-wrap">
  {/* Category Select Dropdown */}
  <div className="w-full sm:w-auto max-w-full">
    <Select
      value={selectValue}
      onValueChange={(val) => {
        setSelectValue(val);
        setActiveCategory(val);
      }}
    >
      <SelectTrigger className="w-full sm:w-72 bg-zinc-900/60 border border-zinc-800 text-white hover:border-[#ff9a4a]/60 transition">
        <SelectValue placeholder="Filter by category (All)" />
      </SelectTrigger>
      <SelectContent className="bg-zinc-900 border border-zinc-800 text-white shadow-lg shadow-orange-500/10">
        <SelectGroup>
          <SelectLabel className="text-zinc-400">Categories</SelectLabel>
          {categories.map((c) => (
            <SelectItem
              key={c}
              value={c}
              className="text-white hover:bg-[#ff7a2d]/20 focus:bg-[#ff7a2d]/25 focus:text-[#ffd24a]"
            >
              {c}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>

  {/* Quick Category Buttons */}
  <motion.div
    className="flex gap-2 flex-wrap"
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <Button
      size="sm"
      variant="outline"
      className={`cursor-pointer border border-[#ff9a4a]/40 bg-gradient-to-r from-[#ff7a2d]/90 to-[#ffd24a]/90 text-black font-medium hover:scale-105 transition-all duration-300 ${
        activeCategory === "Signal Processing"
          ? "shadow-[0_0_12px_rgba(255,138,61,0.5)]"
          : ""
      }`}
      onClick={() => {
        setActiveCategory("Signal Processing");
        setSearch("");
        setSelectValue("Signal Processing");
      }}
    >
      Waveform
    </Button>

    <Button
      size="sm"
      variant="outline"
      className={`cursor-pointer border border-[#ff9a4a]/40 bg-gradient-to-r from-[#ff7a2d]/90 to-[#ffd24a]/90 text-black font-medium hover:scale-105 transition-all duration-300 ${
        activeCategory === "Digital Logic"
          ? "shadow-[0_0_12px_rgba(255,138,61,0.5)]"
          : ""
      }`}
      onClick={() => {
        setActiveCategory("Digital Logic");
        setSearch("");
        setSelectValue("Digital Logic");
      }}
    >
      Logic Gates
    </Button>

    <Button
      size="sm"
      variant="outline"
      className={`cursor-pointer border border-[#ff9a4a]/40 bg-gradient-to-r from-[#ff7a2d]/90 to-[#ffd24a]/90 text-black font-medium hover:scale-105 transition-all duration-300 ${
        activeCategory === "Electro-Mechanical"
          ? "shadow-[0_0_12px_rgba(255,138,61,0.5)]"
          : ""
      }`}
      onClick={() => {
        setActiveCategory("Electro-Mechanical");
        setSearch("");
        setSelectValue("Electro-Mechanical");
      }}
    >
      Motors & Transformers
    </Button>
  </motion.div>
</div>

             <div className="mt-6 md:flex items-center gap-4 flex-wrap">
                          <div className="relative w-full max-w-lg">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools..." className="pl-9 bg-zinc-900/60 border border-zinc-800 text-white w-full" />
                          </div>
                        </div>
          </div>
        
          <div className="lg:col-span-5">
            <div className="rounded-2xl overflow-hidden border border-[#ff8a3d]/12 bg-gradient-to-b from-zinc-900/60 to-black p-1">
              <div className="rounded-xl overflow-hidden bg-black/40">
                <HeroCanvas />
                <div className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-zinc-300 font-semibold">Live Preview</div>
                    <div className="text-xs text-zinc-400">Interactive ribbon & particle field</div>
                  </div>
                  <div className="flex gap-2 items-center">
                                       <Badge className="bg-[#ff7a2d]/12 border border-[#ff7a2d]/20 text-[#ff9a4a]">Live</Badge>
                    <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300">WebGL</Badge>
                   
                  </div>
                </div>
              </div>
            </div>
            
          </div>
          
        </section>

        {/* Mobile search already added earlier — below we render the grid */}
        <div className="sm:hidden relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search visual tools..." className="pl-9 bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-500" />
        </div>

        {/* Tools grid */}
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredTools.map((t, i) => (
              <ToolCard key={t.id} tool={t} idx={i} search={search} onOpen={(id) => openTool(id)} />
            ))}

            {filteredTools.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col-span-full flex flex-col items-center text-center text-zinc-500 py-20">
                <Smile className="w-12 h-12 mb-4 text-zinc-600" />
                <div className="text-lg font-semibold">No matching tools</div>
                <div className="mt-2 text-sm text-zinc-400">Try different keywords or clear the search.</div>
                <div className="mt-4">
                  <Button onClick={() => setSearch("")} className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black">Clear Search</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* CTA / Footer callout */}
        <div className="mt-10 text-center">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-[#ff7a2d]/8 to-[#ffd24a]/6 px-6 py-3 rounded-full border border-[#ff7a2d]/10">
              <Smile className="w-5 h-5 text-[#ff9a4a]" />
              <div className="text-sm text-zinc-200">Want a custom visualization or a full solver integrated? Reach out and we'll build it.</div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-4">
              <Button className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => window.location.href = "/contact"}>Contact Sales</Button>
              <Button variant="outline" className="border-zinc-700 text-white" onClick={() => window.location.href = "/docs"}>View Docs</Button>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

