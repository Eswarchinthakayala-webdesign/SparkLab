"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import { SunMedium, Battery, PlugZap, Wind, Zap, Activity, X, Menu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from "@/components/ui/select";
import Footer from "../components/landing/Footer";
import { useNavigate } from "react-router-dom";

/* ====================== Real World Tools Data (41-50) ====================== */
const realTools = [
  { id: "appliance-analyzer", title: "Appliance Energy Analyzer (kWh & cost)", desc: "Enter appliance wattage & usage hours to estimate monthly kWh & cost.", icon: Battery, category: "Consumption" },
  { id: "bill-estimator", title: "Electricity Bill Estimator", desc: "Estimate bills using local tariff slabs and time-of-use rates.", icon: PlugZap, category: "Billing" },
  { id: "renewable-sim", title: "Renewable Energy Simulator", desc: "Combine solar/wind sources and simulate production & load matching.", icon: Wind, category: "Renewables" },
  { id: "solar-estimator", title: "Solar Panel Estimator", desc: "Calculate panel area & number required for a target daily load.", icon: SunMedium, category: "Design" },
  { id: "battery-designer", title: "Battery / UPS Backup Designer", desc: "Size battery bank for backup duration & inverter losses.", icon: Battery, category: "Storage" },
  { id: "inverter-sizing", title: "Inverter Sizing Tool", desc: "Recommend inverter capacity based on startup & continuous loads.", icon: Zap, category: "Design" },
  { id: "load-balancer", title: "Smart Load Balancer", desc: "Suggest efficient load distribution & scheduling to reduce peak demand.", icon: Activity, category: "Optimization" },
  { id: "carbon-footprint", title: "Carbon Footprint Calculator", desc: "Estimate CO₂ from electricity use & suggest offsets.", icon: PlugZap, category: "Sustainability" },
  { id: "energy-tips", title: "Energy Saving Tips Engine", desc: "Personalized recommendations to cut consumption based on usage patterns.", icon: Zap, category: "Advice" },
  { id: "compare-appliances", title: "Compare Appliances Tool", desc: "Compare energy, cost & lifetime for different appliance types.", icon: Battery, category: "Comparison" },
];
const categories = ["All", ...new Set(realTools.map((t) => t.category))];

/* ====================== Highlight helper (copied/reused) ====================== */
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
      <mark key={p.key + "-" + i} className="bg-transparent text-[#ffd24a] font-semibold">
        {p.match}
      </mark>
    )
  );
}

/* ====================== Futuristic Energy Canvas (Three.js) ====================== */
function EnergyCanvas({ className = "" }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Scene + camera + renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030206);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 2.6, 6.4);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    container.appendChild(renderer.domElement);

    // Lights (warm orange key, cool rim)
    const ambient = new THREE.AmbientLight(0xfff2e8, 0.12);
    scene.add(ambient);
    const key = new THREE.PointLight(0xff9a3a, 1.2, 80, 2);
    key.position.set(6, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x3bd0ff, 0.18);
    rim.position.set(-6, 4, -6);
    scene.add(rim);

    // Materials
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x08080b, metalness: 0.3, roughness: 0.12 });
    const orangeEmissive = new THREE.MeshBasicMaterial({ color: 0xffb66a, transparent: true, blending: THREE.AdditiveBlending });
    const blueEmissive = new THREE.MeshBasicMaterial({ color: 0x3bd0ff, transparent: true, blending: THREE.AdditiveBlending });

    // Ground plate
    const plateGeo = new THREE.CircleGeometry(10, 64);
    const plate = new THREE.Mesh(plateGeo, darkMetal);
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = -0.6;
    scene.add(plate);

    // Central 'energy hub' orb (battery-like) -------------------------------------------------
    const hubGroup = new THREE.Group();
    hubGroup.position.set(0, 0.4, 0);
    scene.add(hubGroup);

    const coreGeo = new THREE.SphereGeometry(0.55, 32, 24);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x111115, metalness: 0.6, roughness: 0.15 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    hubGroup.add(core);

    const ringGeo = new THREE.TorusGeometry(0.95, 0.06, 16, 80);
    const ring = new THREE.Mesh(ringGeo, orangeEmissive.clone());
    ring.rotation.x = Math.PI / 2;
    ring.material.opacity = 0.0;
    hubGroup.add(ring);

    // floating solar plate (rotating blades representing solar) ---------------------------------
    const solarGroup = new THREE.Group();
    solarGroup.position.set(-2.0, 0.45, -1.2);
    scene.add(solarGroup);

    const panelGeo = new THREE.BoxGeometry(1.6, 0.08, 1.0);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x0b2540, metalness: 0.2, roughness: 0.25 });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.rotation.x = -0.18;
    panel.position.y = 0.05;
    solarGroup.add(panel);

    // small wind turbine stylized blades --------------------------------------------------------
    const windGroup = new THREE.Group();
    windGroup.position.set(2.2, 0.45, 1.0);
    scene.add(windGroup);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 12), darkMetal);
    mast.position.y = 0.05;
    windGroup.add(mast);

    const bladeGeo = new THREE.BoxGeometry(0.02, 0.5, 0.08);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x0c2736, metalness: 0.15, roughness: 0.2 });
    const blades = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(bladeGeo, bladeMat.clone());
      b.position.y = 0.5;
      b.rotation.z = (i * Math.PI * 2) / 3;
      blades.add(b);
    }
    blades.position.y = 0.95;
    windGroup.add(blades);

    // energy flow arcs (curved lines with glowing material) ------------------------------------
    const arcGroup = new THREE.Group();
    scene.add(arcGroup);

    const arcMaterial = new THREE.LineBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.0 });

    function createArc(radius, height, phase) {
      const points = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const x = Math.cos(a + phase) * radius;
        const z = Math.sin(a + phase) * radius;
        const y = Math.sin((i / 40) * Math.PI) * height;
        points.push(new THREE.Vector3(x, y + 0.15, z));
      }
      const g = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(g, arcMaterial.clone());
      line.userData = { radius, height, phase };
      arcGroup.add(line);
    }

    createArc(1.6, 0.8, 0);
    createArc(2.4, 0.9, Math.PI / 3);
    createArc(3.2, 0.6, Math.PI / 7);

    // small info sprites (HTML labels) ---------------------------------------------------------
    const label = document.createElement("div");
    label.style.position = "absolute";
    label.style.padding = "6px 10px";
    label.style.borderRadius = "10px";
    label.style.background = "linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.3))";
    label.style.border = "1px solid rgba(255,138,61,0.08)";
    label.style.color = "#ffdba3";
    label.style.fontSize = "12px";
    label.style.pointerEvents = "none";
    label.style.opacity = "0";
    container.style.position = "relative";
    container.appendChild(label);

    // particles to indicate flow ---------------------------------------------------------------
    const flowCount = 60;
    const flowPos = new Float32Array(flowCount * 3);
    for (let i = 0; i < flowCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.random() * 2.2;
      flowPos[i * 3 + 0] = Math.cos(ang) * r;
      flowPos[i * 3 + 1] = Math.random() * 0.9 + 0.2;
      flowPos[i * 3 + 2] = Math.sin(ang) * r;
    }
    const flowGeom = new THREE.BufferGeometry();
    flowGeom.setAttribute("position", new THREE.BufferAttribute(flowPos, 3));
    const flowMat = new THREE.PointsMaterial({ size: 0.04, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const flowPts = new THREE.Points(flowGeom, flowMat);
    scene.add(flowPts);

    // raycaster + mouse for hover --------------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-1, -1);

    function onPointerMove(e) {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouse.x = (x / rect.width) * 2 - 1;
      mouse.y = -(y / rect.height) * 2 + 1;
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
      label.style.opacity = "1";
    }

    function onPointerLeave() {
      mouse.x = -1;
      mouse.y = -1;
      label.style.opacity = "0";
    }

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);

    // animation loop ---------------------------------------------------------------------------
    let frameId;
    let t = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      t += 0.017;

      // hub pulse
      core.scale.setScalar(1 + 0.03 * Math.sin(t * 2.8));
      ring.material.opacity = THREE.MathUtils.lerp(ring.material.opacity, 0.35 + 0.45 * Math.abs(Math.sin(t * 1.4)), 0.06);

      // solar gentle bob + slight rotation
      solarGroup.rotation.y = Math.sin(t * 0.34) * 0.12;
      solarGroup.position.y = 0.45 + Math.sin(t * 0.8) * 0.06;

      // wind blades spin
      blades.rotation.y += 0.12 + Math.sin(t * 0.9) * 0.02;

      // arcs glow dance
      arcGroup.children.forEach((line, i) => {
        const phase = t * (0.2 + i * 0.06) + line.userData.phase * 0.6;
        line.material.opacity = 0.1 + 0.6 * (0.5 + 0.5 * Math.sin(phase));
      });

      // flow particles orbit slowly
      const posAttr = flowGeom.getAttribute("position");
      for (let i = 0; i < flowCount; i++) {
        let x = posAttr.array[i * 3 + 0];
        let z = posAttr.array[i * 3 + 2];
        const ang = Math.atan2(z, x);
        const r = Math.hypot(x, z);
        const na = ang + 0.003 + 0.001 * Math.sin(t * 2 + i);
        const nr = r + Math.sin(t * 0.2 + i) * 0.001;
        posAttr.array[i * 3 + 0] = Math.cos(na) * nr;
        posAttr.array[i * 3 + 2] = Math.sin(na) * nr;
      }
      posAttr.needsUpdate = true;

      // hover detection: simple intersection with hub
      if (mouse.x !== -1) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(core, false);
        if (intersects.length > 0) {
          label.innerHTML = `<strong>Energy Hub</strong><div style=\"font-size:11px;color:#ffefd6;margin-top:4px\">Stable - output: 3.2kW</div>`;
        } else {
          label.innerHTML = `<strong>Energy Network</strong><div style=\"font-size:11px;color:#ffefd6;margin-top:4px\">Solar • Wind • Storage</div>`;
        }
      }

      // camera subtle parallax
      const camTargetX = (mouse.x || 0) * 0.6;
      const camTargetY = 2.6 + (mouse.y || 0) * 0.4;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, camTargetX, 0.04);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, camTargetY, 0.04);
      camera.lookAt(0, 0.2, 0);

      renderer.render(scene, camera);
    };

    animate();

    // resize handler
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
      cancelAnimationFrame(frameId);
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      if (container.contains(label)) container.removeChild(label);
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

  return <div ref={mountRef} className={`w-full max-w-full overflow-hidden h-64 sm:h-80 md:h-96 lg:h-[420px] ${className}`} aria-hidden />;
}

/* ====================== Magnetic Hover Hook ====================== */
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

/* ====================== Tool Card ====================== */
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
            <div className="text-xs text-zinc-400 mt-2 truncate">{highlightText(tool.desc, search)}</div>
          </CardHeader>
          <CardContent className="p-6 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300">{tool.category}</Badge>
              <div className="text-xs text-zinc-400">Tool</div>
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
export default function RealWorldApplicationPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectValue, setSelectValue] = useState("All");

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024 && sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sidebarOpen]);

  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    return realTools.filter((t) => {
      const target = (t.title + " " + t.desc + " " + t.category).toLowerCase();
      const matchesSearch = !q || target.includes(q);
      const matchesCategory = activeCategory === "All" || t.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory]);

  const openTool = (id) => {
    window.location.href = `/tools/real-world/${id}`;
  };
  const navigate=useNavigate()
  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.22)_1px,transparent_1px)] bg-[length:20px_20px] text-white relative overflow-x-hidden">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/40 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4 min-w-0">
              <button className="lg:hidden cursor-pointer p-2 rounded-md hover:bg-zinc-900/50 transition" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-6 h-6 text-[#ff9a4a]" />
              </button>
              <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ minWidth: 0 }}>
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">
                  <SunMedium className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <div className="text-sm text-zinc-300 leading-none truncate">SparkLab</div>
                  <div className="text-xs text-zinc-400 mt-0.5 truncate">Real-World Apps</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:block w-64">
                <div className="relative">
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools..." className="pl-3 bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-500" aria-label="Search tools" />
                </div>
              </div>
              <Button variant="default" className="hidden sm:inline-flex bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black" onClick={() => window.location.href = "/signup"}>
                Get Started
              </Button>
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
                  <div className="flex items-center cursor-pointer justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">
                    <SunMedium className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm text-zinc-300">EnergyLab</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Real-World Apps</div>
                  </div>
                </div>
                <button className="p-2 rounded-md cursor-pointer hover:bg-zinc-800/50" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                  <X className="w-5 h-5 text-zinc-300" />
                </button>
              </div>

              <nav className="space-y-3 max-h-[60vh] overflow-auto pr-2">
                {realTools.map((t) => (
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
                <Button className="w-full bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer" onClick={() => window.location.href = "/"}> <Zap/> EnergyLab</Button>
              </div>
            </motion.aside>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.45 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
          </>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-25 overflow-x-hidden">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-10">
          <div className="lg:col-span-7 space-y-6">
            <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#ff7a2d] via-[#ffd24a] to-[#ff9a4a]">Energy & Real-Life Applications</span>
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.6 }} className="text-zinc-400 max-w-2xl">
              Practical tools for households, installers and students — estimate, simulate and optimize energy systems in a single, responsive dashboard.
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
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black" onClick={() => { setActiveCategory("Consumption"); setSearch(""); setSelectValue("Consumption"); }}>Consumption</Button>
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer border-zinc-800 text-black" onClick={() => { setActiveCategory("Design"); setSearch(""); setSelectValue("Design"); }}>Design</Button>
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer border-zinc-800 text-black" onClick={() => { setActiveCategory("Renewables"); setSearch(""); setSelectValue("Renewables"); }}>Renewables</Button>
              </div>
            </div>

            <div className="mt-6 md:flex items-center gap-4 flex-wrap">
              <div className="relative w-full max-w-lg">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools..." className="pl-3 bg-zinc-900/60 border border-zinc-800 text-white w-full" />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 w-full max-w-full overflow-hidden">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="rounded-2xl overflow-hidden border border-[#ff8a3d]/20 bg-gradient-to-b from-zinc-900/60 to-black p-1 w-full max-w-full">
              <div className="rounded-xl overflow-hidden bg-black/40 w-full max-w-full">
                <EnergyCanvas />
                <div className="p-4 flex items-center justify-between flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-300 font-semibold truncate">Energy Network — Live Preview</div>
                    <div className="text-xs text-zinc-400 truncate">Solar • Wind • Storage — WebGL</div>
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

        <section>
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">No tools found. Try another search or select a different category.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filtered.map((tool, idx) => (
                <ToolCard key={tool.id} tool={tool} idx={idx} search={search} onOpen={openTool} />
              ))}
            </div>
          )}
        </section>

        <div className="mt-12 text-center">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-[#ff7a2d]/8 to-[#ffd24a]/6 px-6  rounded-full border border-[#ff7a2d]/10 flex-wrap justify-center">
              <SunMedium className="w-5 h-5 text-[#ff9a4a]" />
              <div className="text-sm text-zinc-200">Want a custom estimator or tool? We can build tailored energy calculators for projects.</div>
            </div>
            <div className="mt-6 flex items-center justify-center gap-4">
              <Button className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer" onClick={()=>navigate("/contact")}>Contact Us</Button>
             
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
