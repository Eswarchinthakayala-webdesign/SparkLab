"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import {
  Zap,
  Activity,
  Cpu,
  Edit3,
  Percent,
  Repeat,
  Archive,
  Sliders,
  Thermometer,
  Radio,
  SquareFunction,
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

/* ====================== Lab Tools Data ====================== */
const labTools = [
  { id: "virtual-experiments", title: "Virtual Experiments", desc: "Open/Short, resonance, and more — interactive sims.", icon: Activity, category: "Virtual Labs" },
  { id: "lab-report-gen", title: "Lab Report Auto-Generator", desc: "Generate PDF reports with graphs & export-ready formatting.", icon: Edit3, category: "Reporting" },
  { id: "error-calculator", title: "Error Calculator", desc: "% difference between practical & theoretical values.", icon: Percent, category: "Analysis" },
  { id: "unit-converter", title: "Measurement Unit Converter", desc: "Convert V, A, W, Hz, dB and more instantly.", icon: Sliders, category: "Tools" },
  { id: "resistor-identifier", title: "Resistor Color Code Identifier", desc: "Visual band input → numeric value & tolerance.", icon: Cpu, category: "Components" },
  { id: "cap-ind-code", title: "Capacitor & Inductor Code Reader", desc: "Decode markings and estimated tolerances.", icon: Archive, category: "Components" },
  { id: "diode-transistor-tester", title: "Diode & Transistor Tester", desc: "Simulated VI curves for common semiconductors.", icon: Radio, category: "Simulation" },
  { id: "dmm-simulator", title: "Digital Multimeter Simulator", desc: "Measure V, I, R virtually with selectable ranges.", icon: Zap, category: "Simulation" },
  { id: "oscilloscope-lab", title: "Oscilloscope Virtual Lab", desc: "Multi-channel oscilloscope with trigger & math ops.", icon: SquareFunction, category: "Virtual Labs" },
  { id: "calibration-sim", title: "Instrument Calibration Simulator", desc: "Practice calibration workflows for common devices.", icon: Thermometer, category: "Calibration" },
];
const categories = ["All", ...new Set(labTools.map((t) => t.category))];

/* ====================== Highlight helper (reuse) ====================== */
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

/* ====================== BeeLabs Three.js Canvas ====================== */
function BeeLabsCanvas({ className = "" }) {
  const mountRef = React.useRef(null);

  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ---- three.js base ----------------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030206); // very dark

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 3.8, 7.6);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    container.appendChild(renderer.domElement);

    // ---- lighting ---------------------------------------------------------
    const ambient = new THREE.AmbientLight(0xfff2e8, 0.14);
    scene.add(ambient);

    // warm key & cool fill for contrast (orange + teal)
    const key = new THREE.PointLight(0xff9a3a, 1.15, 70, 2);
    key.position.set(6, 10, 6);
    scene.add(key);

    const fill = new THREE.PointLight(0x3bd0ff, 0.35, 60, 2);
    fill.position.set(-7, 3, -5);
    scene.add(fill);

    // small rim light to create a harder silhouette
    const rim = new THREE.DirectionalLight(0xffa94d, 0.12);
    rim.position.set(-10, 6, 8);
    scene.add(rim);

    // ---- honeycomb (hex) creation ----------------------------------------
    const hexGroup = new THREE.Group();
    scene.add(hexGroup);

    const hexRadius = 0.55;
    const hexHeight = 0.12;
    const hexGeom = new THREE.CylinderGeometry(hexRadius, hexRadius, hexHeight, 6, 1, false);
    // Slight bevel for better speculars (use a second, smaller cylinder to fake bevel)
    const hexBevelGeom = new THREE.CylinderGeometry(hexRadius * 0.86, hexRadius * 0.86, hexHeight + 0.001, 6);

    const hexes = [];
    const R = 3; // grid radius
    const sqrt3 = Math.sqrt(3);

    // Materials:
    // base dark metal material
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x07070b,
      metalness: 0.28,
      roughness: 0.15,
      emissive: 0x000000,
      envMapIntensity: 0.12,
    });

    // thin emissive "glow" layer (a slightly larger, translucent mesh)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffb66a,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // small inner "nectar" disc — MeshBasic so it glows independently
    const nectarGeom = new THREE.CircleGeometry(0.14, 20);
    const nectarMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });

    // Create hex tiles in axial coords
    for (let q = -R; q <= R; q++) {
      for (let r = -R; r <= R; r++) {
        const s = -q - r;
        if (Math.abs(s) > R) continue;
        const x = hexRadius * (sqrt3 * q + (sqrt3 / 2) * r) * 1.08;
        const z = hexRadius * ((3 / 2) * r) * 1.04;

        // main hex
        const hex = new THREE.Mesh(hexGeom, baseMat.clone());
        hex.position.set(x, -0.06, z);
        hex.rotation.y = Math.PI / 6;
        hex.receiveShadow = false;
        hex.castShadow = false;
        hex.userData = { q, r, active: false, pulse: Math.random() * 0.8 };

        // glow shell (slightly larger)
        const glow = new THREE.Mesh(hexBevelGeom, glowMat.clone());
        glow.scale.set(1.02, 1.02, 1.02);
        glow.position.copy(hex.position);
        glow.rotation.copy(hex.rotation);

        // small nectar disc that lights up
        const nectar = new THREE.Mesh(nectarGeom, nectarMat.clone());
        nectar.rotation.x = -Math.PI / 2;
        nectar.position.set(x, -0.02, z);

        hexGroup.add(hex);
        hexGroup.add(glow);
        scene.add(nectar);

        // attach references
        hex.userData.glow = glow;
        hex.userData.nectar = nectar;
        hexes.push(hex);
      }
    }

    // ---- bees (animated agents) ------------------------------------------
    const bees = [];
    const beeBodyGeom = new THREE.SphereGeometry(0.085, 12, 12);
    const wingGeom = new THREE.PlaneGeometry(0.18, 0.06);

    for (let i = 0; i < 8; i++) {
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xffd24a,
        metalness: 0.3,
        roughness: 0.28,
        emissive: 0x000000,
      });
      const body = new THREE.Mesh(beeBodyGeom, bodyMat);

      // bright core (emissive mesh inside body to create a subtle glow)
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending }));
      core.position.set(0.02, 0, 0);

      const wingMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      const leftWing = new THREE.Mesh(wingGeom, wingMat.clone());
      const rightWing = new THREE.Mesh(wingGeom, wingMat.clone());
      leftWing.rotation.x = Math.PI / 2;
      rightWing.rotation.x = Math.PI / 2;
      leftWing.position.set(-0.02, 0.02, 0.05);
      rightWing.position.set(-0.02, 0.02, -0.05);

      const g = new THREE.Group();
      g.add(body, core, leftWing, rightWing);
      g.position.set((Math.random() - 0.5) * 2.6, 0.7 + Math.random() * 0.6, (Math.random() - 0.5) * 2.6);

      g.userData = {
        angle: Math.random() * Math.PI * 2,
        radius: 1.2 + Math.random() * 2.2,
        speed: 0.45 + Math.random() * 0.8,
        vertAmp: 0.18 + Math.random() * 0.22,
        offset: Math.random() * 1000,
      };

      scene.add(g);
      bees.push({ group: g, leftWing, rightWing, body });
    }

    // ---- particle swarm (additive glow points) ----------------------------
    const particleCount = 120;
    const ptPositions = new Float32Array(particleCount * 3);
    const ptColors = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      ptPositions[i * 3 + 0] = (Math.random() - 0.5) * 14;
      ptPositions[i * 3 + 1] = Math.random() * 2.6 + 0.1;
      ptPositions[i * 3 + 2] = (Math.random() - 0.5) * 14;
      // subtle color variation (towards orange)
      const c = 0.9 + Math.random() * 0.2;
      ptColors[i * 3 + 0] = 1.0;
      ptColors[i * 3 + 1] = 0.75 * c;
      ptColors[i * 3 + 2] = 0.4 * c;
    }
    const ptsGeom = new THREE.BufferGeometry();
    ptsGeom.setAttribute("position", new THREE.BufferAttribute(ptPositions, 3));
    ptsGeom.setAttribute("color", new THREE.BufferAttribute(ptColors, 3));
    const ptsMat = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const swarm = new THREE.Points(ptsGeom, ptsMat);
    scene.add(swarm);

    // ---- base plane subtle reflection ------------------------------------
    const baseGeo = new THREE.CircleGeometry(12, 64);
    // const baseMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.025 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.35;
    scene.add(base);

    // ---- raycaster for interactions --------------------------------------
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-1, -1);
    let hoveredHex = null;

    // tooltip overlay (HTML) appended to container for crisp readable labels
    const tooltip = document.createElement("div");
    tooltip.style.position = "absolute";
    tooltip.style.pointerEvents = "none";
    tooltip.style.padding = "6px 8px";
    tooltip.style.background = "linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.35))";
    tooltip.style.border = "1px solid rgba(255,138,61,0.12)";
    tooltip.style.color = "#ffdba3";
    tooltip.style.fontSize = "12px";
    tooltip.style.borderRadius = "8px";
    tooltip.style.transform = "translate(-50%, -140%)";
    tooltip.style.transition = "opacity 160ms ease, transform 160ms ease";
    tooltip.style.opacity = "0";
    tooltip.style.zIndex = "10";
    container.style.position = "relative";
    container.appendChild(tooltip);

    // state toggles
    let paused = false;
    let globalSwarmSpeed = 1.0;

    // store active hexes (clicked) to pulse more strongly
    const activeHexes = new Set();

    // ---- interaction handlers --------------------------------------------
    function onPointerMove(e) {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouse.x = (x / rect.width) * 2 - 1;
      mouse.y = -(y / rect.height) * 2 + 1;

      // move tooltip toward pointer
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      tooltip.style.opacity = "0.95";
    }

    function onPointerLeave() {
      mouse.x = -1;
      mouse.y = -1;
      tooltip.style.opacity = "0";
    }

    function onClick(e) {
      // on click toggle 'active' for hovered hex
      if (!hoveredHex) return;
      const id = `${hoveredHex.userData.q},${hoveredHex.userData.r}`;
      if (activeHexes.has(id)) activeHexes.delete(id);
      else activeHexes.add(id);
      hoveredHex.userData.active = activeHexes.has(id);
    }

    function onDoubleClick() {
      // toggle animation pause
      paused = !paused;
    }

    function onWheel(e) {
      // subtle zoom by wheel
      const delta = Math.sign(e.deltaY || e.detail || e.wheelDelta);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + delta * 0.25, 5.0, 12.0);
    }

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("click", onClick);
    container.addEventListener("dblclick", onDoubleClick);
    container.addEventListener("wheel", onWheel, { passive: true });

    // ---- animation loop --------------------------------------------------
    let frameId;
    let t = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (!paused) t += 0.0165 * globalSwarmSpeed;

      // subtle rotational float for hex group
      hexGroup.rotation.y = Math.sin(t * 0.055) * 0.035;
      hexGroup.rotation.x = Math.sin(t * 0.012) * 0.008;

      // update particles (float upward/loop)
      const posAttr = ptsGeom.getAttribute("position");
      for (let i = 0; i < particleCount; i++) {
        let yv = posAttr.array[i * 3 + 1];
        yv += Math.sin((t * 0.8 + i) * 0.07) * 0.002 + 0.0005;
        if (yv > 3.6) yv = 0.12 + Math.random() * 0.35;
        posAttr.array[i * 3 + 1] = yv;
      }
      posAttr.needsUpdate = true;

      // bees motion
      for (let i = 0; i < bees.length; i++) {
        const b = bees[i];
        const ud = b.group.userData;
        ud.angle += (0.003 + i * 0.0009) * ud.speed * (paused ? 0.2 : 1.0);
        const a = ud.angle + Math.sin(t * 0.18 + ud.offset) * 0.35;
        const r = ud.radius + Math.sin(t * 0.26 + i) * 0.12;
        b.group.position.x = Math.cos(a) * r;
        b.group.position.z = Math.sin(a) * r * 0.9;
        b.group.position.y = 0.6 + Math.sin(t * 2.2 * ud.speed + i * 0.7) * ud.vertAmp;

        // wings flap faster when near active hexes
        const distanceToCenter = Math.hypot(b.group.position.x, b.group.position.z);
        const flapSpeed = 30 + Math.max(0, (1.8 - distanceToCenter) * 40);
        b.leftWing.rotation.z = Math.sin(t * flapSpeed + i) * 0.95;
        b.rightWing.rotation.z = -Math.sin(t * flapSpeed + i) * 0.95;
      }

      // hex pulsing & nectar intensity
      for (let i = 0; i < hexes.length; i++) {
        const h = hexes[i];
        const dot = h.userData.nectar;
        const glow = h.userData.glow;
        // base breathing
        const basePulse = 1 + 0.06 * Math.sin(t * 1.5 + i * 0.2 + h.userData.pulse);
        h.scale.setScalar(basePulse);

        // active hex stronger pulse
        const id = `${h.userData.q},${h.userData.r}`;
        const isActive = activeHexes.has(id) || h.userData.active;
        const activeMult = isActive ? 1.8 : 1.0;
        // glow opacity varies with a sine and activity state
        const glowOpacity = Math.min(0.88, (0.04 + Math.max(0, Math.sin(t * 1.6 + i * 0.22)) * 0.9) * activeMult);
        glow.material.opacity = THREE.MathUtils.lerp(glow.material.opacity, glowOpacity * 0.9, 0.12);

        // nectar flicker (brighter when active)
        const nectarOpacityTarget = isActive ? 0.95 : Math.min(0.6, 0.1 + Math.abs(Math.sin(t * 1.6 + i * 0.35)) * 0.55);
        dot.material.opacity = THREE.MathUtils.lerp(dot.material.opacity, nectarOpacityTarget, 0.08);

        // tint: slightly warm when active
        const hue = isActive ? 0.10 : 0.12;
        dot.material.color.setHSL(hue, 0.92, 0.38 + Math.min(0.25, glowOpacity * 0.18));
      }

      // ---- raycast hover detection ---------------------------------------
      if (mouse.x !== -1) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(hexes, false);
        if (intersects.length > 0) {
          const hit = intersects[0].object;
          if (hoveredHex !== hit) {
            // restore previous
            if (hoveredHex) {
              hoveredHex.userData.glow.material.opacity = hoveredHex.userData.active ? 0.9 : 0.0;
              hoveredHex.userData.nectar.material.opacity = hoveredHex.userData.active ? 0.85 : 0.0;
            }
            hoveredHex = hit;
            // amplify current hover
            hoveredHex.userData.glow.material.opacity = 0.98;
            hoveredHex.userData.nectar.material.opacity = 0.99;
          }
          // position tooltip content
          tooltip.innerHTML = `<strong>Beee Node</strong><div style="font-size:11px;color:#ffefd6;margin-top:4px">q:${hit.userData.q} r:${hit.userData.r} · ${activeHexes.has(`${hit.userData.q},${hit.userData.r}`) ? "active" : "idle"}</div>`;
        } else {
          if (hoveredHex) {
            hoveredHex.userData.glow.material.opacity = hoveredHex.userData.active ? 0.9 : 0.0;
            hoveredHex.userData.nectar.material.opacity = hoveredHex.userData.active ? 0.85 : 0.0;
            hoveredHex = null;
          }
          tooltip.innerHTML = "";
        }
      }

      // subtle camera float & pointer parallax
      // make camera subtly follow mouse for parallax
      const camTargetX = (mouse.x || 0) * 0.9;
      const camTargetY = 3.8 + (mouse.y || 0) * 0.9;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, camTargetX * 1.6, 0.04);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, camTargetY, 0.04);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, 7.0 + Math.sin(t * 0.085) * 0.12, 0.02);
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

    // keyboard shortcuts
    function onKey(e) {
      if (e.key === "p") paused = !paused; // press 'p' to pause
      if (e.key === "+" || e.key === "=") globalSwarmSpeed = Math.min(2.6, globalSwarmSpeed + 0.12);
      if (e.key === "-") globalSwarmSpeed = Math.max(0.2, globalSwarmSpeed - 0.12);
    }
    window.addEventListener("keydown", onKey);

    // ---- cleanup ---------------------------------------------------------
    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("click", onClick);
      container.removeEventListener("dblclick", onDoubleClick);
      container.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);

      // remove tooltip
      if (container.contains(tooltip)) container.removeChild(tooltip);

      // dispose geometries / materials
      scene.traverse((o) => {
        try {
          if (o.geometry) o.geometry.dispose && o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose && m.dispose());
            else o.material.dispose && o.material.dispose();
          }
        } catch (err) {
          // ignore disposal errors
        }
      });

      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={`w-full max-w-full overflow-hidden h-64 sm:h-80 md:h-96 lg:h-[420px] ${className}`}
      aria-hidden
    />
  );
}


/* ====================== Magnetic Hover Hook (reused) ====================== */
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
              <div className="text-xs text-zinc-400">Lab tool</div>
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
export default function LabSupportPage() {
  const navigate = useNavigate();
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
    return labTools.filter((t) => {
      const target = (t.title + " " + t.desc + " " + t.category).toLowerCase();
      const matchesSearch = !q || target.includes(q);
      const matchesCategory = activeCategory === "All" || t.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory]);

  const openTool = (id) => {
    if (typeof navigate === "function") navigate(`/topics/labs/${id}`);
    else window.location.href = `/topics/labs/${id}`;
  };

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)] bg-[length:20px_20px] text-white relative overflow-x-hidden">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/40 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4 min-w-0">
              <button className="lg:hidden cursor-pointer p-2 rounded-md hover:bg-zinc-900/50 transition" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
                <Sliders className="w-6 h-6 text-[#ff9a4a]" />
              </button>
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex items-center gap-3 cursor-pointer select-none" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ minWidth: 0 }}>
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">
                  <Activity className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <div className="text-sm text-zinc-300 leading-none truncate">SparkLab</div>
                  <div className="text-xs text-zinc-400 mt-0.5 truncate">Lab Engine</div>
                </div>
              </motion.div>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:block w-64">
                <div className="relative">
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lab tools..." className="pl-3 bg-zinc-900/60 border border-zinc-800 text-white placeholder-zinc-500" aria-label="Search labs" />
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
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm text-zinc-300">SparkLab</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Lab Engine</div>
                  </div>
                </div>
                <button className="p-2 rounded-md cursor-pointer hover:bg-zinc-800/50" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                  <Sliders className="w-5 h-5 text-zinc-300" />
                </button>
              </div>

              <nav className="space-y-3 max-h-[60vh] overflow-auto pr-2">
                {labTools.map((t) => (
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
                <Button className="w-full bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-black cursor-pointer" onClick={() => navigate("/")}> <Zap/> SparkLab</Button>
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
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#ff7a2d] via-[#ffd24a] to-[#ff9a4a]">Lab & Practical Support</span>
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.6 }} className="text-zinc-400 max-w-2xl">
              Interactive virtual lab tools for teaching and practicing electronics — simulations, converters, report generation and more.
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
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black" onClick={() => { setActiveCategory("Virtual Labs"); setSearch(""); setSelectValue("Virtual Labs"); }}>Virtual Labs</Button>
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer border-zinc-800 text-black" onClick={() => { setActiveCategory("Components"); setSearch(""); setSelectValue("Components"); }}>Components</Button>
                <Button size="sm" className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer border-zinc-800 text-black" onClick={() => { setActiveCategory("Simulation"); setSearch(""); setSelectValue("Simulation"); }}>Simulation</Button>
              </div>
            </div>

            <div className="mt-6 md:flex items-center gap-4 flex-wrap">
              <div className="relative w-full max-w-lg">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lab tools..." className="pl-3 bg-zinc-900/60 border border-zinc-800 text-white w-full" />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 w-full max-w-full overflow-hidden">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="rounded-2xl overflow-hidden border border-[#ff8a3d]/20 bg-gradient-to-b from-zinc-900/60 to-black p-1 w-full max-w-full">
              <div className="rounded-xl overflow-hidden bg-black/40 w-full max-w-full">
                <BeeLabsCanvas />
                <div className="p-4 flex items-center justify-between flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-300 font-semibold truncate">Beee Labs — Live Preview</div>
                    <div className="text-xs text-zinc-400 truncate">Futuristic honeycomb visualization — WebGL</div>
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
              <Activity className="w-5 h-5 text-[#ff9a4a]" />
              <div className="text-sm text-zinc-200">Need a custom lab tool? Reach out — we build tailored virtual labs for courses and institutions.</div>
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
