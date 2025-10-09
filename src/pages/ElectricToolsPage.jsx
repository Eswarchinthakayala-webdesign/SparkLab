// src/pages/ElectricToolsPage.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import {
  Zap,
  Activity,
  Sigma,
  Waves,
  CircuitBoard,
  Battery,
  Radio,
  BarChart,
  Gauge,
  SquareFunction,
  Search,
  Menu,
  X,
  Smile,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import Footer from "../components/landing/Footer";

/* ====================== Tools Data ====================== */
const tools = [
  { id: "ohms-law", title: "Ohm’s Law Calculator", desc: "Calculate Voltage, Current, or Resistance instantly.", icon: Zap, category: "Basics" },
  { id: "power", title: "Power Calculator", desc: "Compute P = VI, I²R, or V²/R for circuits.", icon: Activity, category: "Basics" },
  { id: "resistance", title: "Series/Parallel Resistance", desc: "Find equivalent resistance in networks.", icon: Sigma, category: "Circuits" },
  { id: "capacitance-inductance", title: "Capacitance & Inductance", desc: "Calculate series/parallel values easily.", icon: Waves, category: "Circuits" },
  { id: "impedance", title: "Impedance Calculator", desc: "Solve RLC impedance in AC circuits.", icon: CircuitBoard, category: "AC Analysis" },
  { id: "transformer", title: "Transformer Calculator", desc: "Turns ratio, efficiency, and losses.", icon: Battery, category: "Machines" },
  { id: "three-phase", title: "3-Phase Power Calculator", desc: "kW, kVA, and kVAR computations.", icon: Radio, category: "AC Analysis" },
  { id: "resonance", title: "Resonance Frequency Calculator", desc: "LC and RLC resonance frequency finder.", icon: BarChart, category: "AC Analysis" },
  { id: "power-factor", title: "Power Factor Calculator", desc: "PF and correction tool for circuits.", icon: Gauge, category: "Power" },
  { id: "thevenin-norton", title: "Thevenin/Norton Equivalent", desc: "Find equivalent circuits step-by-step.", icon: SquareFunction, category: "Circuits" },
];
const categories = ["All", ...new Set(tools.map((t) => t.category))];

/* ====================== Highlight search helper ====================== */
function highlightText(text = "", query = "") {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts = [];
  let lastIndex = 0;
  while (true) {
    const idx = lower.indexOf(q, lastIndex);
    if (idx === -1) {
      parts.push(text.slice(lastIndex));
      break;
    }
    if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
    parts.push({ match: text.slice(idx, idx + q.length), key: idx });
    lastIndex = idx + q.length;
  }
  return parts.map((p, i) =>
    typeof p === "string" ? <span key={i}>{p}</span> : <mark key={p.key + "-" + i} className="bg-transparent text-orange-300 font-semibold">{p.match}</mark>
  );
}

/* ====================== Three.js Canvas ====================== */
function CircuitHeroCanvas({ className = "" }) {
  const mountRef = useRef(null);
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050406);
    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0.8, 6);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.16);
    scene.add(ambient);
    const p1 = new THREE.PointLight(0xff8a3d, 0.9, 40);
    p1.position.set(6, 6, 6);
    scene.add(p1);
    const p2 = new THREE.PointLight(0x3a8aff, 0.6, 40);
    p2.position.set(-6, -4, 6);
    scene.add(p2);

    const group = new THREE.Group();
    scene.add(group);

    const nodeList = [];
    const ringCount = 3;
    for (let r = 0; r < ringCount; r++) {
      const radius = 0.9 + r * 0.95;
      const count = 6 + r * 5;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const x = Math.cos(ang) * radius;
        const z = Math.sin(ang) * radius * 0.95;
        const y = (Math.random() - 0.5) * 0.06 * (r + 1);

        const boxGeo = new THREE.BoxGeometry(0.18, 0.08, 0.12);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.6, roughness: 0.2 });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(x, y, z);

        const planeGeo = new THREE.PlaneGeometry(0.28, 0.18);
        const emissiveColor = new THREE.Color().setHSL(0.08 + r * 0.06, 0.95, 0.5);
        const planeMat = new THREE.MeshBasicMaterial({ color: emissiveColor, transparent: true, opacity: 0.9 });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.position.set(x, y + 0.06, z + 0.01);
        plane.rotation.y = Math.PI / 6 + (r * 0.06);

        const haloGeo = new THREE.CircleGeometry(0.36, 24);
        const haloMat = new THREE.MeshBasicMaterial({ color: emissiveColor, transparent: true, opacity: 0.08, depthWrite: false });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(x, -0.85, z * 0.98);

        const ng = new THREE.Group();
        ng.add(box, plane, halo);
        group.add(ng);

        nodeList.push({ group: ng, box, plane, halo, base: new THREE.Vector3(x, y, z), ring: r, idx: i });
      }
    }

    const segments = [];
    const ringNodes = [];
    let cursor = 0;
    for (let r = 0; r < ringCount; r++) {
      const count = 6 + r * 5;
      ringNodes.push(nodeList.slice(cursor, cursor + count));
      cursor += count;
    }
    for (let r = 0; r < ringCount; r++) {
      const arr = ringNodes[r];
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i].base;
        const b = arr[(i + 1) % arr.length].base;
        segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    for (let r = 1; r < ringCount; r++) {
      const outer = ringNodes[r];
      const inner = ringNodes[r - 1];
      for (let i = 0; i < outer.length; i++) {
        const a = outer[i].base;
        const b = inner[Math.floor((i / outer.length) * inner.length)].base;
        segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const traceGeom = new THREE.BufferGeometry();
    traceGeom.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
    const traceMat = new THREE.LineBasicMaterial({ color: 0xffb88a, transparent: true, opacity: 0.68 });
    const traceLines = new THREE.LineSegments(traceGeom, traceMat);
    group.add(traceLines);

    const planeGeo = new THREE.CircleGeometry(3.6, 64);
    const planeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.02 });
    const base = new THREE.Mesh(planeGeo, planeMat);
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.88;
    group.add(base);

    let frameId;
    let t = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      t += 0.0165;
      group.rotation.y += 0.0045;
      group.rotation.x = Math.sin(t * 0.08) * 0.02;
      for (let i = 0; i < nodeList.length; i++) {
        const n = nodeList[i];
        const dim = 1 - n.ring * 0.1;
        n.box.scale.setScalar(1 * dim * (1 + 0.02 * Math.sin(t * 2 + i)));
        n.plane.scale.setScalar(1 * (1 + 0.03 * Math.sin(t * 1.6 + i * 0.7)));
        n.group.position.y = n.base.y + Math.sin(t * 1.2 + i * 0.26) * 0.03 * (n.ring + 1);
      }
      traceMat.opacity = 0.55 + Math.sin(t * 0.9) * 0.08;
      camera.position.z = 5.6 + Math.sin(t * 0.12) * 0.08;
      renderer.render(scene, camera);
    };
    animate();

    const handle = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handle);
    const ro = new ResizeObserver(handle);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      window.removeEventListener("resize", handle);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose && o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose && m.dispose());
          else o.material.dispose && o.material.dispose();
        }
      });
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className={`w-full max-w-full overflow-hidden h-64 sm:h-80 md:h-96 lg:h-[420px] ${className}`} aria-hidden />;
}

/* ====================== Magnetic Hover ====================== */
function useMagnetic() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleMove = (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const rx = (y / rect.height) * -6;
      const ry = (x / rect.width) * 6;
      el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0) scale(1.02)`;
    };
    const handleLeave = () => {
      el.style.transform = "";
      el.style.transition = "transform 0.45s cubic-bezier(.2,.9,.3,1)";
      setTimeout(() => (el.style.transition = ""), 450);
    };
    el.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseleave", handleLeave);
    return () => {
      el.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseleave", handleLeave);
    };
  }, []);
  return ref;
}

/* ====================== ToolCard ====================== */
function ToolCard({ tool, idx, search, onOpen }) {
  const Icon = tool.icon;
  const refMag = useMagnetic();

  return (
    <motion.div key={tool.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * 0.04 }}>
      <div ref={refMag} className="relative rounded-2xl p-[1px] bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] hover:from-[#ff7a2d] hover:to-[#ffd24a] transition w-full">
        <Card className="bg-gradient-to-b from-black/80 to-zinc-900/60 rounded-2xl overflow-hidden border border-zinc-800 shadow-[0_6px_30px_rgba(255,138,61,0.04)] w-full">
          <CardHeader className="flex flex-col items-center text-center p-6">
            <motion.div whileHover={{ scale: 1.06 }} className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black mb-4 shadow-[0_6px_20px_rgba(255,138,61,0.12)]">
              <Icon className="w-7 h-7" />
            </motion.div>
            <CardTitle className="text-lg font-semibold text-white">{highlightText(tool.title, search)}</CardTitle>
            <div className="text-xs text-zinc-400 mt-2">{highlightText(tool.desc, search)}</div>
          </CardHeader>
          <CardContent className="p-6 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300">{tool.category}</Badge>
              <div className="text-xs text-zinc-400">Pro tool</div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => onOpen(tool.id)} className="cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black">Open</Button>
            
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

/* ====================== Main Page ====================== */
export default function ElectricToolsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectValue, setSelectValue] = useState("All");
  const searchRef = useRef(null);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024 && sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sidebarOpen]);

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
    if (typeof navigate === "function") navigate(`/topics/tools/${id}`);
    else window.location.href = `/topics/tools/${id}`;
  };

  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white relative overflow-x-hidden">
  
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/40 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4 min-w-0">
              {/* Mobile menu */}
              <button
                className="lg:hidden p-2 rounded-md hover:bg-zinc-900/50 transition"
                aria-label="Open menu"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-6 h-6 text-[#ff9a4a]" />
              </button>

              {/* Logo */}
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                style={{ minWidth: 0 }}
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">
                  <CircuitBoard className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <div className="text-sm text-zinc-300 leading-none truncate">SparkLab</div>
                  <div className="text-xs text-zinc-400 -mt-0.5 truncate">Engine</div>
                </div>
              </motion.div>
            </div>

            

            {/* Right area */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="hidden sm:block w-64">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                    <Input
                      ref={searchRef}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Quick search (Ctrl/Cmd + K)"
                      className="pl-9 bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-500"
                      aria-label="Search tools"
                    />
                  </div>
                </div>
                <Button variant="default" className="hidden sm:inline-flex bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => window.location.href = "/signup"}>
                  Get Started
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar (AnimatePresence) */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.aside
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-80 max-w-full bg-gradient-to-b from-black/95 to-zinc-900 border-r border-zinc-800 p-6 lg:hidden"
              aria-label="Mobile menu"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">
                    <CircuitBoard className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm text-zinc-300">SparkLab</div>
                    <div className="text-xs text-zinc-400 -mt-0.5">Engine</div>
                  </div>
                </div>
                <button className="p-2 rounded-md hover:bg-zinc-800/50" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                  <X className="w-5 h-5 text-zinc-300" />
                </button>
              </div>

              <nav className="space-y-3 max-h-[60vh] overflow-auto pr-2">
                {/* quick nav: show tool names for fast access */}
                {tools.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSidebarOpen(false);
                      openTool(t.id);
                    }}
                    className="flex items-center gap-3 w-full text-left p-3 rounded-lg hover:bg-zinc-900/40 transition"
                  >
                    <t.icon className="w-5 h-5 text-[#ff9a4a]" />
                    <div className="flex flex-col items-start">
                      <span className="text-sm text-zinc-200">{t.title}</span>
                      <span className="text-xs text-zinc-400 truncate max-w-[200px]">{t.desc}</span>
                    </div>
                  </button>
                ))}
              </nav>

              <div className="mt-6">
                <Button className="w-full bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer"
                 onClick={()=>navigate("/")}
                >  <CircuitBoard className="w-5 h-5" /> SparkLab</Button>
               
              </div>
            </motion.aside>

            {/* backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.45 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          </>
        )}
      </AnimatePresence>

      {/* Page Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-25 overflow-x-hidden">
        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-10">
          <div className="lg:col-span-7 space-y-6">
            <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#ff7a2d] via-[#ffd24a] to-[#ff9a4a]">Core Electrical Tools</span>
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.6 }} className="text-zinc-400 max-w-2xl">
              Professional, reliable calculators & solvers to learn, teach, and prototype electrical engineering concepts faster.
            </motion.p>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
              <div className="w-full sm:w-auto max-w-full">
                <Select
                  value={selectValue}
                  onValueChange={(val) => {
                    setSelectValue(val);
                    setActiveCategory(val);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-72 bg-zinc-900/60 border border-zinc-800 text-white">
                    <SelectValue placeholder="Filter by category (All)" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800">
                    <SelectGroup>
                      <SelectLabel className="text-zinc-400">Categories</SelectLabel>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black" onClick={() => { setActiveCategory("Basics"); setSearch(""); setSelectValue("Basics"); }}>Ohm’s Law</Button>
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer border-zinc-800 text-black" onClick={() => { setActiveCategory("Circuits"); setSearch(""); setSelectValue("Circuits"); }}>Series / Parallel</Button>
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer border-zinc-800 text-black" onClick={() => { setActiveCategory("AC Analysis"); setSearch(""); setSelectValue("AC Analysis"); }}>Impedance</Button>
              </div>
            </div>

            <div className="mt-6 md:flex items-center gap-4 flex-wrap">
              <div className="relative w-full max-w-lg">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools..." className="pl-9 bg-zinc-900/60 border border-zinc-800 text-white w-full" />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 w-full max-w-full overflow-hidden">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="rounded-2xl overflow-hidden border border-[#ff8a3d]/20 bg-gradient-to-b from-zinc-900/60 to-black p-1 w-full max-w-full">
              <div className="rounded-xl overflow-hidden bg-black/40 w-full max-w-full">
                <CircuitHeroCanvas />
                <div className="p-4 flex items-center justify-between flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-300 font-semibold truncate">Live Tools Preview</div>
                    <div className="text-xs text-zinc-400 truncate">Interactive visualization of SparkLab engine</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-2 sm:mt-0">
                    <Badge className="bg-[#ff7a2d]/12 border border-[#ff7a2d] text-[#ff9a4a] px-3 py-1 rounded">Live</Badge>
                    <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded">WebGL</Badge>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Tools Grid */}
        <section>
          {filteredTools.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">No tools found. Try another search or select a different category.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredTools.map((tool, idx) => (
                <ToolCard key={tool.id} tool={tool} idx={idx} search={search} onOpen={openTool} />
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="mt-12 text-center">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-[#ff7a2d]/8 to-[#ffd24a]/6 px-6  rounded-full border border-[#ff7a2d]/10 flex-wrap justify-center">
              <Smile className="w-5 h-5 text-[#ff9a4a]" />
              <div className="text-sm text-zinc-200">Need a custom tool? Reach out — we build tailored calculators for courses and labs.</div>
            </div>
            <div className="mt-6 flex items-center justify-center gap-4">
              <Button className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer">Contact Sales</Button>
              <Button variant="outline" className="border-zinc-700 text-black cursor-pointer">View Integrations</Button>
            </div>
          </motion.div>
        </div>
      </main>
      <Footer/>
    </div>
  );
}

/* ======================
   End of file
   ====================== */
