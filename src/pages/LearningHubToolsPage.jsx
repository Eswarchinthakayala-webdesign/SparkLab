// LearningHubToolsPage.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import { BookOpen, FileText, Video, Zap, Search, Layers, Cpu, Sparkles, Terminal, Play } from "lucide-react";
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
import Footer from "../components/landing/Footer";
import { useNavigate } from "react-router-dom";

/* ===================== Learning Hub Items (31-40) ===================== */
const hubItems = [
  { id: "formula-sheet", title: "Formula Sheet (PDF)", desc: "Downloadable consolidated formula sheet for quick revision.", icon: FileText, category: "Reference", tags: ["PDF","Download"] },
  { id: "theorem-tutorials", title: "Theorem Tutorials", desc: "Step-by-step tutorials: Superposition, Maximum Power Transfer, Thevenin, Norton.", icon: BookOpen, category: "Theory", tags: ["Theorem","Tutorial"] },
  { id: "short-notes", title: "Short Notes & Diagrams", desc: "Bite-sized theory cards and quick diagrams for exam prep.", icon: Layers, category: "Reference", tags: ["Notes","Diagrams"] },
  { id: "animated-explainers", title: "Animated Concept Explainers", desc: "Step-by-step visual explanations — ideal for visual learners.", icon: Sparkles, category: "Visual", tags: ["Animation","Explainer"] },
  { id: "cheat-codes", title: "Quick 'Cheat Codes'", desc: "Last-minute study hacks and memory mnemonics for exams.", icon: Zap, category: "Study Tips", tags: ["Hacks","Exam"] },
  { id: "glossary", title: "Glossary of BEEE Terms", desc: "Searchable glossary — definitions, cross-links and examples.", icon: Terminal, category: "Reference", tags: ["Glossary","Search"] },
  { id: "concept-maps", title: "Concept Maps", desc: "Visual maps linking related topics to speed conceptual learning.", icon: Play, category: "Visual", tags: ["Maps","Visual"] },
  { id: "video-tutorials", title: "Video Tutorials Integration", desc: "Embedded YouTube/videos & built-in player with timestamps.", icon: Video, category: "Media", tags: ["Video","YouTube"] },
  { id: "step-by-step-solvers", title: "Step-by-step Solvers", desc: "Detailed worked solutions for circuit problems with intermediate steps.", icon: Cpu, category: "Tools", tags: ["Solver","Circuits"] },
  { id: "flashcards", title: "Interactive Flashcards", desc: "Spaced-repetition style flashcards to reinforce memory.", icon: Search, category: "Practice", tags: ["Flashcards","SRS"] },
];

const categories = ["All", ...new Set(hubItems.map((i) => i.category))];

/* ====================== highlightText helper (reuse) ====================== */
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
    typeof p === "string" ? (
      <span key={i}>{p}</span>
    ) : (
      <mark key={p.key + "-" + i} className="bg-transparent text-[#7af2ff] font-semibold">
        {p.match}
      </mark>
    )
  );
}

/* ====================== NeuronNetCanvas (Three.js) ====================== */
function NeuronNetCanvas({ className = "" }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // scene + camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030312);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 8);

    // renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    // lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(ambient);
    const key = new THREE.PointLight(0x7af2ff, 0.9, 100);
    key.position.set(6, 6, 6);
    scene.add(key);
    const fill = new THREE.PointLight(0xff7ab6, 0.45, 60);
    fill.position.set(-5, -4, -6);
    scene.add(fill);

    // neuron nodes
    const nodeCount = 26;
    const nodes = [];
    const nodeGeom = new THREE.SphereGeometry(0.12, 12, 12);
    for (let i = 0; i < nodeCount; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.55 + Math.random() * 0.12, 0.8, 0.45),
        metalness: 0.25,
        roughness: 0.18,
        emissive: 0x002b2f,
      });
      const m = new THREE.Mesh(nodeGeom, mat);
      // position nodes roughly in a sphere but slightly flattened to look like a network cloud
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = 2.2 + Math.random() * 1.4;
      m.position.set(Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r * 0.7, Math.sin(phi) * Math.sin(theta) * r);
      m.userData = { idx: i, pulseOffset: Math.random() * 1000, active: false };
      scene.add(m);
      nodes.push(m);
    }

    // edges (lines connecting some nodes randomly)
    const edgesGroup = new THREE.Group();
    scene.add(edgesGroup);
    const maxConnections = 3;
    for (let i = 0; i < nodeCount; i++) {
      const from = nodes[i].position;
      const connections = Math.floor(1 + Math.random() * maxConnections);
      for (let c = 0; c < connections; c++) {
        const j = Math.floor(Math.random() * nodeCount);
        if (j === i) continue;
        const to = nodes[j].position;
        const lineGeom = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
        const lineMat = new THREE.LineBasicMaterial({ linewidth: 1, transparent: true, opacity: 0.12, color: 0x7af2ff });
        const line = new THREE.Line(lineGeom, lineMat);
        edgesGroup.add(line);
      }
    }

    // glow particle cloud
    const pc = 160;
    const ppos = new Float32Array(pc * 3);
    for (let i = 0; i < pc; i++) {
      ppos[i * 3 + 0] = (Math.random() - 0.5) * 12;
      ppos[i * 3 + 1] = (Math.random() - 0.5) * 6;
      ppos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    const pgeom = new THREE.BufferGeometry();
    pgeom.setAttribute("position", new THREE.BufferAttribute(ppos, 3));
    const pmat = new THREE.PointsMaterial({ size: 0.03, transparent: true, opacity: 0.55, color: 0x7af2ff, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(pgeom, pmat);
    scene.add(points);

    // raycaster for interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-10, -10);
    let hovered = null;

    // HTML tooltip
    const tooltip = document.createElement("div");
    tooltip.style.position = "absolute";
    tooltip.style.pointerEvents = "none";
    tooltip.style.padding = "8px 10px";
    tooltip.style.background = "linear-gradient(180deg, rgba(6,6,8,0.9), rgba(6,6,8,0.72))";
    tooltip.style.border = "1px solid rgba(122,242,255,0.08)";
    tooltip.style.color = "#bff8ff";
    tooltip.style.fontSize = "12px";
    tooltip.style.borderRadius = "8px";
    tooltip.style.transform = "translate(-50%, -140%)";
    tooltip.style.opacity = "0";
    tooltip.style.transition = "opacity 140ms ease, transform 140ms ease";
    container.style.position = "relative";
    container.appendChild(tooltip);

    // pointer handlers
    function onPointerMove(e) {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouse.x = (x / rect.width) * 2 - 1;
      mouse.y = -(y / rect.height) * 2 + 1;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      tooltip.style.opacity = "0.95";
    }
    function onPointerLeave() {
      mouse.x = -10;
      mouse.y = -10;
      tooltip.style.opacity = "0";
    }
    function onClick() {
      if (!hovered) return;
      hovered.userData.active = !hovered.userData.active;
    }

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("click", onClick);

    // animation
    let t = 0;
    let raf = null;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      t += 0.0165;

      // pulsate nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const p = 1 + 0.12 * Math.sin(t * 2.0 + n.userData.pulseOffset);
        const active = n.userData.active;
        const scale = active ? THREE.MathUtils.lerp(n.scale.x, p * 1.9, 0.09) : THREE.MathUtils.lerp(n.scale.x, p, 0.08);
        n.scale.setScalar(scale);
        // emissive intensity when active
        const emissiveTarget = active ? 0x2cffff : 0x002b2f;
        // gently lerp color by HSL shift (approx)
        n.material.emissiveIntensity = active ? THREE.MathUtils.lerp(n.material.emissiveIntensity || 0.0, 0.8, 0.08) : THREE.MathUtils.lerp(n.material.emissiveIntensity || 0.0, 0.06, 0.05);
      }

      // rotate cloud slowly
      scene.rotation.y += 0.0012;

      // raycast hover detection
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodes, false);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hovered !== hit) {
          if (hovered) hovered.material.opacity = 1.0;
          hovered = hit;
          hovered.material.opacity = 1.0;
        }
        tooltip.innerHTML = `<strong>Concept Node</strong><div style="font-size:11px;color:#9ff3ff;margin-top:4px">id:${hit.userData.idx} · state:${hit.userData.active ? "selected" : "idle"}</div>`;
      } else {
        if (hovered) hovered.material.opacity = 1.0;
        hovered = null;
        tooltip.innerHTML = "";
      }

      // subtle parallax camera move
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, (mouse.x || 0) * 1.2, 0.06);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, (mouse.y || 0) * 0.8, 0.06);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    // responsive
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    window.addEventListener("resize", handleResize);

    // cleanup
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("click", onClick);
      if (container.contains(tooltip)) container.removeChild(tooltip);
      scene.traverse((o) => {
        try {
          if (o.geometry) o.geometry.dispose && o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose && m.dispose());
            else o.material.dispose && o.material.dispose();
          }
        } catch (e) {}
      });
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={`w-full max-w-full overflow-hidden h-64 sm:h-80 md:h-96 lg:h-[420px] rounded-xl ${className}`}
      aria-hidden
    />
  );
}

/* ====================== magnetic hover hook (reuse) ====================== */
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

/* ====================== HubCard ====================== */
function HubCard({ item, idx, query, onOpen }) {
  const Icon = item.icon;
  const refMag = useMagnetic();
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * 0.04 }}>
      <div ref={refMag} className="relative rounded-2xl p-[1px] bg-gradient-to-r from-[#00e5ff] to-[#7af2ff] hover:from-[#00e5ff] hover:to-[#7af2ff] transition w-full">
        <Card className="bg-gradient-to-b from-black/80 to-zinc-900/60 rounded-2xl overflow-hidden border border-zinc-800 shadow-[0_6px_40px_rgba(122,242,255,0.03)] w-full">
          <CardHeader className="flex flex-col items-center text-center p-6">
            <motion.div whileHover={{ scale: 1.06 }} className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#00e5ff] to-[#7af2ff] flex items-center justify-center text-black mb-4 shadow-[0_8px_30px_rgba(122,242,255,0.06)]">
              <Icon className="w-7 h-7" />
            </motion.div>
            <CardTitle className="text-lg font-semibold text-white">{highlightText(item.title, query)}</CardTitle>
            <div className="text-xs text-zinc-400 mt-2 truncate">{highlightText(item.desc, query)}</div>
          </CardHeader>

          <CardContent className="p-6 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300">{item.category}</Badge>
              <div className="text-xs text-zinc-400">{item.tags.join(" · ")}</div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => onOpen(item.id)} className="cursor-pointer bg-gradient-to-r from-[#00e5ff] to-[#7af2ff] text-black">Open</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

/* ====================== Main LearningHubToolsPage ====================== */
export default function LearningHubToolsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectValue, setSelectValue] = useState("All");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024 && sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sidebarOpen]);

  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    return hubItems.filter((i) => {
      const target = (i.title + " " + i.desc + " " + i.category + " " + (i.tags || []).join(" ")).toLowerCase();
      const matchesSearch = !q || target.includes(q);
      const matchesCategory = activeCategory === "All" || i.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [query, activeCategory]);

  const openItem = (id) => {
    // navigate to item page or open modal; fallback to simple routing
    if (typeof navigate === "function") navigate(`/hub/${id}`);
    else window.location.href = `/hub/${id}`;
  };

  return (
    <div className="min-h-screen bg-[#020417] bg-[radial-gradient(circle,_rgba(0,234,255,0.08)_1px,transparent_1px)] bg-[length:18px_18px] text-white relative overflow-x-hidden">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/30 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4 min-w-0">
              <button className="lg:hidden cursor-pointer p-2 rounded-md hover:bg-zinc-900/50 transition" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
                <Layers className="w-6 h-6 text-[#7af2ff]" />
              </button>
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ minWidth: 0 }}>
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#00e5ff] to-[#7af2ff] text-black">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <div className="text-sm text-zinc-300 leading-none truncate">LearningHub</div>
                  <div className="text-xs text-zinc-400 mt-0.5 truncate">Knowledge Engine</div>
                </div>
              </motion.div>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:block w-72">
                <div className="relative">
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topics, video timestamps, notes..." className="pl-3 bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-500" aria-label="Search hub" />
                </div>
              </div>

              <Button variant="default" className="hidden sm:inline-flex bg-gradient-to-r from-[#00e5ff] to-[#7af2ff] text-black" onClick={() => window.location.href = "/signup"}>
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.aside initial={{ x: -320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -320, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 28 }} className="fixed inset-y-0 left-0 z-50 w-80 max-w-full bg-gradient-to-b from-black/95 to-zinc-900 border-r border-zinc-800 p-6 lg:hidden">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#00e5ff] to-[#7af2ff] text-black">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm text-zinc-300">LearningHub</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Knowledge Engine</div>
                  </div>
                </div>
                <button className="p-2 rounded-md cursor-pointer hover:bg-zinc-800/50" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                  <Layers className="w-5 h-5 text-zinc-300" />
                </button>
              </div>

              <nav className="space-y-3 max-h-[60vh] overflow-auto pr-2">
                {hubItems.map((t) => (
                  <button key={t.id} onClick={() => { setSidebarOpen(false); openItem(t.id); }} className="flex cursor-pointer items-center gap-3 w-full text-left p-3 rounded-lg hover:bg-zinc-900/40 transition">
                    <t.icon className="w-5 h-5 text-[#7af2ff]" />
                    <div className="flex flex-col items-start">
                      <span className="text-sm text-zinc-200">{t.title}</span>
                      <span className="text-xs text-zinc-400 truncate max-w-[200px]">{t.desc}</span>
                    </div>
                  </button>
                ))}
              </nav>

              <div className="mt-6">
                <Button className="w-full bg-gradient-to-r from-[#00e5ff] to-[#7af2ff] text-black cursor-pointer" onClick={() => navigate("/")}> <Zap/> LearningHub</Button>
              </div>
            </motion.aside>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.45 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
          </>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-24 overflow-x-hidden">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-10">
          <div className="lg:col-span-7 space-y-6">
            <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#00e5ff] via-[#7af2ff] to-[#7ad6ff]">Learning & Knowledge Hub</span>
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.6 }} className="text-zinc-400 max-w-2xl">
              Curated study materials and interactive micro-tools — formula sheets, animated explainers, flashcards and solvers to accelerate BEEE learning.
            </motion.p>

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
              <div className="w-full sm:w-auto max-w-full">
                <Select value={selectValue} onValueChange={(val) => { setSelectValue(val); setActiveCategory(val); }}>
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
                <Button size="sm" className="bg-gradient-to-r from-[#00e5ff] to-[#7af2ff] cursor-pointer text-black" onClick={() => { setActiveCategory("Visual"); setQuery(""); setSelectValue("Visual"); }}>Visual</Button>
                <Button size="sm" className="bg-gradient-to-r from-[#00e5ff] to-[#7af2ff] cursor-pointer border-zinc-800 text-black" onClick={() => { setActiveCategory("Reference"); setQuery(""); setSelectValue("Reference"); }}>Reference</Button>
                <Button size="sm" className="bg-gradient-to-r from-[#00e5ff] to-[#7af2ff] cursor-pointer border-zinc-800 text-black" onClick={() => { setActiveCategory("Tools"); setQuery(""); setSelectValue("Tools"); }}>Tools</Button>
              </div>
            </div>

            <div className="mt-6 md:flex items-center gap-4 flex-wrap">
              <div className="relative w-full max-w-lg">
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search (e.g., 'superposition', 'theorem', 'video 12:23')" className="pl-3 bg-zinc-900/60 border border-zinc-800 text-white w-full" />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 w-full max-w-full overflow-hidden">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="rounded-2xl overflow-hidden border border-[#00e5ff]/16 bg-gradient-to-b from-zinc-900/60 to-black p-1 w-full max-w-full">
              <div className="rounded-xl overflow-hidden bg-black/40 w-full max-w-full">
                <NeuronNetCanvas />
                <div className="p-4 flex items-center justify-between flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-300 font-semibold truncate">NeuronNet — Concept Cloud</div>
                    <div className="text-xs text-zinc-400 truncate">Interactive node cloud representing topics and connections</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-2 sm:mt-0">
                    <Badge className="bg-[#00e5ff]/12 border border-[#00e5ff] text-[#7af2ff] px-3 py-1 rounded">Live</Badge>
                    <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded">WebGL</Badge>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section>
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">No hub items found. Try another search or select a different category.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filtered.map((item, idx) => (
                <HubCard key={item.id} item={item} idx={idx} query={query} onOpen={openItem} />
              ))}
            </div>
          )}
        </section>

        <div className="mt-12 text-center">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-[#00e5ff]/8 to-[#7af2ff]/6 px-6  rounded-full border border-[#00e5ff]/10 flex-wrap justify-center">
              <BookOpen className="w-5 h-5 text-[#7af2ff]" />
              <div className="text-sm text-zinc-200">Want something custom for your course? We can create tailored explainers, interactive solvers and PDFs.</div>
            </div>
            <div className="mt-6 flex items-center justify-center gap-4">
              <Button className="bg-gradient-to-r from-[#00e5ff] to-[#7af2ff] text-black cursor-pointer">Contact Team</Button>
              <Button variant="outline" className="border-zinc-700 text-black cursor-pointer">View Integrations</Button>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
