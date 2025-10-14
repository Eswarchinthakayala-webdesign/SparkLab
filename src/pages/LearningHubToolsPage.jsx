// LearningHubToolsPage.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import { Activity, BookOpen, Play, Zap, FileText, Layers, Search, Sparkles, Bookmark, Video, Settings } from "lucide-react";
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

/* ================= Learning Hub Tools Data (features 31-40) ================ */
const learningTools = [
  { id: "formula-sheet", title: "Formula Sheet (PDF)", desc: "Downloadable consolidated formulas for BEEE. Quick reference PDFs.", icon: FileText, category: "Resources" },
  { id: "theorem-tutorials", title: "Theorem Tutorials", desc: "Step-by-step visual tutorials for Superposition, MPT, Thevenin, Norton.", icon: BookOpen, category: "Tutorials" },
  { id: "short-notes", title: "Short Notes & Diagrams", desc: "Bite-sized theory with posters and quick diagrams for last-minute revision.", icon: Bookmark, category: "Notes" },
  { id: "animated-explainers", title: "Animated Explainers", desc: "Step-by-step animated concept explainers (SVG & WebGL) for core topics.", icon: Sparkles, category: "Visuals" },
  { id: "cheat-codes", title: "Cheat Codes", desc: "Exam day hacks, formula mnemonics and time-saving tips for tests.", icon: Zap, category: "Study Hacks" },
  { id: "glossary", title: "Glossary of BEEE Terms", desc: "Searchable, interactive glossary with quick jump links and examples.", icon: Search, category: "Reference" },
  { id: "concept-maps", title: "Concept Maps", desc: "Interactive concept maps that show links between topics and prerequisites.", icon: Layers, category: "Visuals" },
  { id: "video-integration", title: "Video Tutorials Integration", desc: "Embed YouTube or self-made videos with timestamps & notes.", icon: Video, category: "Media" },
  { id: "step-solvers", title: "Step-by-step Solvers", desc: "Show working for circuit problems — calculators that show full solution steps.", icon: Settings, category: "Tools" },
  { id: "flashcards", title: "Interactive Flashcards", desc: "Spaced repetition flashcards for memory practice (active recall).", icon: Play, category: "Practice" },
];
const LH_CATEGORIES = ["All", ...new Set(learningTools.map((t) => t.category))];

/* ================= NeuronGridCanvas: Three.js for LearningHub ============= */
function NeuronGridCanvas({ className = "" }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // scene + camera + renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040407);

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 2.6, 6.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    container.appendChild(renderer.domElement);

    // lights
    const amb = new THREE.AmbientLight(0xfff6ea, 0.08);
    scene.add(amb);
    const warm = new THREE.PointLight(0xff8f3a, 0.9, 60, 2);
    warm.position.set(6, 6, 5);
    scene.add(warm);
    const cool = new THREE.PointLight(0x35caff, 0.28, 60, 2);
    cool.position.set(-6, 2, -4);
    scene.add(cool);

    // node geometry + materials
    const nodeGeom = new THREE.SphereGeometry(0.06, 12, 12);
    const nodeMat = new THREE.MeshStandardMaterial({ color: 0xffb86b, metalness: 0.18, roughness: 0.2 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });

    // lines for connections
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.18 });

    // create nodes arranged loosely like a concept map
    const nodes = [];
    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);
    const N = 22;
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 8;
      const z = (Math.random() - 0.5) * 5;
      const y = (Math.random() - 0.2) * 1.8;
      const node = new THREE.Mesh(nodeGeom, nodeMat.clone());
      node.position.set(x, y, z);
      node.userData = { basePos: node.position.clone(), id: i, pulse: Math.random() * Math.PI * 2, active: false };
      // add a faint glow shell
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), glowMat.clone());
      shell.position.copy(node.position);
      shell.scale.setScalar(1.0);
      node.userData.shell = shell;
      nodeGroup.add(node);
      scene.add(shell);
      nodes.push(node);
    }

    // connect some nodes randomly with lines to simulate concept links
    const connections = [];
    for (let i = 0; i < N; i++) {
      const targets = new Set();
      const count = 2 + Math.floor(Math.random() * 3);
      while (targets.size < count) {
        const t = Math.floor(Math.random() * N);
        if (t !== i) targets.add(t);
      }
      targets.forEach((t) => {
        // avoid duplicate lines by ordering pair
        const a = Math.min(i, t), b = Math.max(i, t);
        const key = `${a}-${b}`;
        if (connections.find((c) => c.key === key)) return;
        const pA = nodes[a].position;
        const pB = nodes[b].position;
        const geom = new THREE.BufferGeometry().setFromPoints([pA, pB]);
        const line = new THREE.Line(geom, lineMaterial.clone());
        line.userData = { a, b, key };
        connections.push({ key, line });
        scene.add(line);
      });
    }

    // particle points (soft sparks)
    const particleCount = 80;
    const ptsPos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      ptsPos[i * 3 + 0] = (Math.random() - 0.5) * 12;
      ptsPos[i * 3 + 1] = Math.random() * 3.0 - 0.2;
      ptsPos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    const ptsGeom = new THREE.BufferGeometry();
    ptsGeom.setAttribute("position", new THREE.BufferAttribute(ptsPos, 3));
    const ptsMat = new THREE.PointsMaterial({ size: 0.03, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, color: 0xffcfa0, depthWrite: false });
    const sparks = new THREE.Points(ptsGeom, ptsMat);
    scene.add(sparks);

    // base plate
    const baseGeo = new THREE.CircleGeometry(10, 64);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.45, metalness: 0.05, envMapIntensity: 0.06 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.rotation.x = -Math.PI / 2;
    base.position.y = -1.0;
    scene.add(base);

    // raycaster + tooltip
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-1, -1);
    let hovered = null;
    const tooltip = document.createElement("div");
    tooltip.style.position = "absolute";
    tooltip.style.pointerEvents = "none";
    tooltip.style.padding = "8px 10px";
    tooltip.style.background = "linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.35))";
    tooltip.style.border = "1px solid rgba(255,138,61,0.12)";
    tooltip.style.color = "#ffdba3";
    tooltip.style.fontSize = "12px";
    tooltip.style.borderRadius = "8px";
    tooltip.style.opacity = "0";
    tooltip.style.transform = "translate(-50%, -140%)";
    container.style.position = "relative";
    container.appendChild(tooltip);

    // interactions
    function onPointerMove(e) {
      const r = container.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      mouse.x = (x / r.width) * 2 - 1;
      mouse.y = -(y / r.height) * 2 + 1;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      tooltip.style.opacity = "0.95";
    }
    function onLeave() {
      mouse.x = -1;
      mouse.y = -1;
      tooltip.style.opacity = "0";
    }
    function onClick() {
      if (!hovered) return;
      hovered.userData.active = !hovered.userData.active;
    }
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onLeave);
    container.addEventListener("click", onClick);

    // animation
    let rafId;
    let time = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      time += 0.016 * 1.0;

      // nodes subtle float + pulse
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const p = n.userData.basePos;
        const pulse = 0.02 * Math.sin(time * 2.0 + n.userData.pulse);
        n.position.x = p.x + Math.sin(time * 0.4 + i) * 0.06;
        n.position.y = p.y + Math.cos(time * 0.6 + i * 0.5) * 0.06 + pulse;
        n.position.z = p.z + Math.cos(time * 0.35 + i) * 0.06;
        // shell follows node
        if (n.userData.shell) {
          const shell = n.userData.shell;
          shell.position.copy(n.position);
          // shell opacity reacts to active state
          const targetOp = n.userData.active ? 0.9 : 0.08 + Math.abs(Math.sin(time * 1.9 + i)) * 0.12;
          shell.material.opacity = THREE.MathUtils.lerp(shell.material.opacity, targetOp, 0.06);
        }
      }

      // animate connection line opacity slightly
      connections.forEach((c) => {
        c.line.material.opacity = 0.08 + Math.abs(Math.sin(time * 0.8 + (c.line.userData.a + c.line.userData.b))) * 0.06;
      });

      // sparks float
      const posAttr = ptsGeom.getAttribute("position");
      for (let i = 0; i < particleCount; i++) {
        let y = posAttr.array[i * 3 + 1];
        y += Math.sin(time * 0.6 + i) * 0.0015 + 0.001;
        if (y > 3.8) y = -0.2 + Math.random() * 0.6;
        posAttr.array[i * 3 + 1] = y;
      }
      posAttr.needsUpdate = true;

      // hover detection
      if (mouse.x !== -1) {
        ray.setFromCamera(mouse, camera);
        const ints = ray.intersectObjects(nodes, false);
        if (ints.length > 0) {
          const hit = ints[0].object;
          if (hovered !== hit) {
            hovered = hit;
          }
          tooltip.innerHTML = `<strong>Concept Node</strong><div style="font-size:11px;color:#ffefd6;margin-top:4px">id:${hit.userData.id} · ${hit.userData.active ? "selected" : "idle"}</div>`;
        } else {
          hovered = null;
          tooltip.innerHTML = "";
        }
      }

      // camera slow parallax
      const camTargetX = (mouse.x || 0) * 0.6;
      const camTargetY = 2.6 + (mouse.y || 0) * 0.6;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, camTargetX * 1.2, 0.04);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, camTargetY, 0.04);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, 6.2 + Math.sin(time * 0.08) * 0.06, 0.03);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    // responsiveness
    const handleResize = () => {
      if (!container) return;
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
      cancelAnimationFrame(rafId);
      ro.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onLeave);
      container.removeEventListener("click", onClick);
      if (container.contains(tooltip)) container.removeChild(tooltip);
      scene.traverse((o) => {
        try {
          if (o.geometry) o.geometry.dispose && o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose && m.dispose());
            else o.material.dispose && o.material.dispose();
          }
        } catch (err) {}
      });
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className={`w-full h-64 sm:h-80 md:h-96 lg:h-[420px] rounded-xl overflow-hidden ${className}`} aria-hidden />;
}

/* ==================== Magnetic Hook (reuse) ============================== */
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

/* ==================== Tool Card for LearningHub ========================== */
function LHCard({ tool, idx, search, onOpen }) {
  const Icon = tool.icon;
  const refMag = useMagnetic();
  return (
    <motion.div key={tool.id} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * 0.04 }}>
      <div ref={refMag} className="relative rounded-2xl p-[1px] bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] hover:from-[#ff7a2d] hover:to-[#ffd24a] transition w-full">
        <Card className="bg-gradient-to-b from-black/80 to-zinc-900/60 rounded-2xl overflow-hidden border border-zinc-800 shadow-[0_8px_40px_rgba(255,110,40,0.04)] w-full">
          <CardHeader className="flex flex-col items-center text-center p-5">
            <motion.div whileHover={{ scale: 1.06 }} className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center text-black mb-3 shadow-[0_6px_18px_rgba(255,138,61,0.09)]">
              <Icon className="w-6 h-6" />
            </motion.div>
            <CardTitle className="text-base font-semibold text-white">{tool.title}</CardTitle>
            <div className="text-xs text-zinc-400 mt-2 text-center">{tool.desc}</div>
          </CardHeader>
          <CardContent className="p-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300">{tool.category}</Badge>
              <div className="text-xs text-zinc-400">Learning Hub</div>
            </div>
            <div className="flex items-center gap-2">
              <Button className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => onOpen(tool.id)}>Open</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

/* ==================== Main LearningHubToolsPage ========================= */
export default function LearningHubToolsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectVal, setSelectVal] = useState("All");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const resizeHandler = () => {
      if (window.innerWidth >= 1024 && sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener("resize", resizeHandler);
    return () => window.removeEventListener("resize", resizeHandler);
  }, [sidebarOpen]);

  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    return learningTools.filter((t) => {
      const target = (t.title + " " + t.desc + " " + t.category).toLowerCase();
      const matchesSearch = !q || target.includes(q);
      const matchesCategory = category === "All" || t.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [query, category]);

  const openTool = (id) => {
    // route to tool or open modal — here we navigate to a route
    if (navigate) navigate(`/learning/${id}`);
    else window.location.href = `/learning/${id}`;
  };

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.22)_1px,transparent_1px)] bg-[length:20px_20px] text-white relative overflow-x-hidden">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/40 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4 min-w-0">
              <button className="lg:hidden cursor-pointer p-2 rounded-md hover:bg-zinc-900/50 transition" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
                <Activity className="w-6 h-6 text-[#ff9a4a]" />
              </button>
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ minWidth: 0 }}>
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">
                  <Activity className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <div className="text-sm text-zinc-300">LearningHub</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Knowledge & Tools</div>
                </div>
              </motion.div>
            </div>

            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:block w-64">
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search learning resources..." className="pl-3 bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-500" aria-label="Search learning hub" />
              </div>
              <Button variant="default" className="hidden sm:inline-flex bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => window.location.href = "/signup"}>Join</Button>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.aside initial={{ x: -300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -300, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="fixed inset-y-0 left-0 z-50 w-80 max-w-full bg-gradient-to-b from-black/95 to-zinc-900 border-r border-zinc-800 p-6 lg:hidden" aria-label="Mobile menu">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm text-zinc-300">LearningHub</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Knowledge & Tools</div>
                  </div>
                </div>
                <button className="p-2 rounded-md cursor-pointer hover:bg-zinc-800/50" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                  <Activity className="w-5 h-5 text-zinc-300" />
                </button>
              </div>

              <nav className="space-y-3 max-h-[60vh] overflow-auto pr-2">
                {learningTools.map((t) => (
                  <button key={t.id} onClick={() => { setSidebarOpen(false); openTool(t.id); }} className="flex cursor-pointer items-center gap-3 w-full text-left p-3 rounded-lg hover:bg-zinc-900/40 transition">
                    <t.icon className="w-5 h-5 text-[#ff9a4a]" />
                    <div className="flex flex-col items-start">
                      <span className="text-sm text-zinc-200">{t.title}</span>
                      <span className="text-xs text-zinc-400 truncate max-w-[200px]">{t.desc}</span>
                    </div>
                  </button>
                ))}
              </nav>

              <div className="mt-6">
                <Button className="w-full bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer" onClick={() => navigate("/")}> <Zap/> LearningHub</Button>
              </div>
            </motion.aside>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.45 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
          </>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-24">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-10">
          <div className="lg:col-span-7 space-y-6">
            <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#ff7a2d] via-[#ffd24a] to-[#ff9a4a]">Learning & Knowledge Hub</span>
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, duration: 0.6 }} className="text-zinc-400 max-w-2xl">
              Bite-sized resources, animated explainers, searchable glossaries, concept maps and step-by-step solvers to master BEEE topics.
            </motion.p>

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
              <div className="w-full sm:w-auto max-w-full">
                <Select value={selectVal} onValueChange={(val) => { setSelectVal(val); setCategory(val); }}>
                  <SelectTrigger className="w-full sm:w-72 bg-zinc-900/60 border border-zinc-800 text-white">
                    <SelectValue placeholder="Filter by category (All)" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-zinc-800">
                    <SelectGroup>
                      <SelectLabel className="text-zinc-400">Categories</SelectLabel>
                      {LH_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black" onClick={() => { setCategory("Visuals"); setQuery(""); setSelectVal("Visuals"); }}>Visuals</Button>
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer border-zinc-800 text-black" onClick={() => { setCategory("Resources"); setQuery(""); setSelectVal("Resources"); }}>Resources</Button>
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer border-zinc-800 text-black" onClick={() => { setCategory("Practice"); setQuery(""); setSelectVal("Practice"); }}>Practice</Button>
              </div>
            </div>

            <div className="mt-6 md:flex items-center gap-4 flex-wrap">
              <div className="relative w-full max-w-lg">
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the hub..." className="pl-3 bg-zinc-900/60 border border-zinc-800 text-white w-full" />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 w-full max-w-full overflow-hidden">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="rounded-2xl overflow-hidden border border-[#ff8a3d]/20 bg-gradient-to-b from-zinc-900/60 to-black p-1 w-full max-w-full">
              <div className="rounded-xl overflow-hidden bg-black/40 w-full max-w-full">
                <NeuronGridCanvas />
                <div className="p-4 flex items-center justify-between flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-300 font-semibold truncate">Neuron Grid — Preview</div>
                    <div className="text-xs text-zinc-400 truncate">Interactive concept map — WebGL</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-2 sm:mt-0">
                    <Badge className="bg-[#ff7a2d]/12 border border-[#ff7a2d] text-[#ff9a4a] px-3 py-1 rounded">Live</Badge>
                    <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded">Concept Map</Badge>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section>
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">No resources found. Try a different search or category.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filtered.map((t, i) => (
                <LHCard key={t.id} tool={t} idx={i} search={query} onOpen={openTool} />
              ))}
            </div>
          )}
        </section>

        <div className="mt-12 text-center">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-[#ff7a2d]/8 to-[#ffd24a]/6 px-6  rounded-full border border-[#ff7a2d]/10 flex-wrap justify-center">
              <Activity className="w-5 h-5 text-[#ff9a4a]" />
              <div className="text-sm text-zinc-200">Want a tailored study pack? We help create course-specific hubs and interactive explainers.</div>
            </div>
            <div className="mt-6 flex items-center justify-center gap-4">
              <Button className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer" onClick={() => window.location.href = "/contact"}>Request a Pack</Button>
              <Button variant="outline" className="border-zinc-700 text-black cursor-pointer" onClick={() => window.location.href = "/integrations"}>View Integrations</Button>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
