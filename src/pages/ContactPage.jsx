"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import { ShaderMaterial } from "three";
import { motion, useScroll, useTransform } from "framer-motion";
import { sendForm } from "@emailjs/browser";
import { Toaster, toast } from "sonner";

import Navbar from "../components/landing/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Phone,
  MapPin,
  Send,
  Linkedin,
  Github,
  Twitter,
  Sparkles,
  Zap,
} from "lucide-react";

/* ============================
   Utility: safe browser check
   ============================ */
const isBrowser = typeof window !== "undefined";

/* ============================
   Advanced Three.js Scene
   - Emissive shader core
   - Animated particles (vertex offset)
   - Field lines (tube-like using line segments)
   - Postprocessing bloom
   - Responsive & pausable on tab hidden
   ============================ */
function EnergyCoreCanvas({ className = "" }) {
  const mountRef = useRef(null);
  const composerRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!isBrowser) return;
    const container = mountRef.current;
    if (!container) return;

    // Basic renderer, scene, camera
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.02);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0.8, 4.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(ambient);
    const keyLight = new THREE.PointLight(0xff9a4a, 1.6, 30);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0xff7a2f, 0.9, 30);
    rimLight.position.set(-3, -2, 3);
    scene.add(rimLight);

    // Shader: emissive animated core
    const coreGeo = new THREE.IcosahedronGeometry(1.1, 4);
    const coreMaterial = new ShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
        u_glow: { value: 1.0 },
        u_colorA: { value: new THREE.Color(0xff8a3d) },
        u_colorB: { value: new THREE.Color(0xffd38a) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        void main(){
          vNormal = normalize(normalMatrix * normal);
          vPos = (modelMatrix * vec4(position,1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform float u_time;
        uniform vec3 u_colorA;
        uniform vec3 u_colorB;
        varying vec3 vNormal;
        varying vec3 vPos;
        void main(){
          float n = 0.5 + 0.5 * sin(u_time * 2.0 + length(vPos)*3.0);
          vec3 c = mix(u_colorA, u_colorB, n);
          float rim = pow(1.0 - dot(normalize(vNormal), vec3(0.0,0.0,1.0)), 2.0);
          vec3 col = c + rim * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: false,
    });
    const core = new THREE.Mesh(coreGeo, coreMaterial);
    core.position.set(0, 0.05, 0);
    scene.add(core);

    // Particle cloud (moderate count to balance visuals & perf)
    const PARTICLE_COUNT = Math.min(3000, Math.max(800, Math.floor((container.clientWidth * container.clientHeight) / 10000)));
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const speeds = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const r = 1.2 + Math.random() * 1.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      positions[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
      positions[i * 3 + 1] = Math.sin(phi) * r * 0.6;
      positions[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
      speeds[i] = 0.2 + Math.random() * 0.9;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    const particleMat = new THREE.PointsMaterial({
      color: 0xffcc88,
      size: 0.035,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    particles.frustumCulled = false;
    scene.add(particles);

    // Field lines: a few circular/spiral lines for structure
    const linesGroup = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffb87a, transparent: true, opacity: 0.65, linewidth: 2 });
    for (let L = 0; L < 5; L++) {
      const segments = 200;
      const radius = 1.2 + L * 0.18;
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const x = Math.cos(t) * radius;
        const y = Math.sin(t * 2 + L) * 0.12 * (1 + L * 0.15);
        const z = Math.sin(t) * radius * 0.75;
        pts.push(new THREE.Vector3(x, y, z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, lineMat);
      line.rotation.x = Math.PI * 0.18 * (L % 2 === 0 ? 1 : -1);
      linesGroup.add(line);
    }
    scene.add(linesGroup);

    // Post-processing bloom
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.9, 0.6, 0.1);
    bloomPass.strength = 0.9;
    bloomPass.radius = 0.8;
    bloomPass.threshold = 0.05;
    composer.addPass(bloomPass);
    composerRef.current = composer;

    // Animation loop
    const clock = new THREE.Clock();
    let paused = false;
    const onVisibilityChange = () => {
      paused = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      if (paused) return;

      const t = clock.getElapsedTime();
      core.rotation.y = 0.15 * t;
      core.material.uniforms.u_time.value = t;

      // particles orbital motion
      const posAttr = particleGeo.getAttribute("position");
      const speedAttr = particleGeo.getAttribute("aSpeed");
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ix = i * 3;
        // simple orbital drift with slight radial oscillation
        const sx = posAttr.array[ix];
        const sy = posAttr.array[ix + 1];
        const sz = posAttr.array[ix + 2];
        const s = speedAttr.array[i];
        const ang = Math.atan2(sz, sx) + 0.0008 * s * (1 + 0.5 * Math.sin(t * 0.6 + i));
        const r = Math.sqrt(sx * sx + sz * sz);
        const nr = 1.05 + 0.9 * Math.sin(t * 0.2 + i * 0.01) * 0.25 + r * 0.002;
        posAttr.array[ix] = Math.cos(ang) * nr;
        posAttr.array[ix + 2] = Math.sin(ang) * nr;
        posAttr.array[ix + 1] = sy * (0.98 + 0.02 * Math.sin(t * 0.3 + i));
      }
      posAttr.needsUpdate = true;

      // slow rotation of field lines
      linesGroup.rotation.y = 0.08 * t;

      // camera subtle breathing
      camera.position.z = 4.5 + Math.sin(t * 0.22) * 0.12;

      // render using composer (bloom) for glow
      composer.render();
    };
    animate();

    // Resize handling
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", handleResize);

      // dispose geometries/materials
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose && m.dispose());
          else obj.material.dispose && obj.material.dispose();
        }
      });

      if (composer) composer.dispose && composer.dispose();
      renderer.dispose && renderer.dispose();
      if (container && renderer.domElement) container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className={`w-full h-[420px] md:h-[520px] lg:h-[560px] rounded-2xl overflow-hidden ${""}`} />;
}

/* ============================
   Contact Page (UI)
   - high-end layout, glass panels, gradients, micro-interactions
   ============================ */
export default function ContactPage() {
  const formRef = useRef(null);
  const [sending, setSending] = useState(false);

  // Framer scroll parallax for canvas block
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start end", "end start"] });
  const yParallax = useTransform(scrollYProgress, [0, 1], [40, -40]);

  // EmailJS submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formRef.current) return;

    const timeInput = formRef.current.querySelector("input[name='time']");
    if (timeInput) timeInput.value = new Date().toLocaleString();

    setSending(true);
    try {
      const SERVICE_ID = "service_zg7m0zm";
      const TEMPLATE_ID = "template_1s6xemj";
      const PUBLIC_KEY = "FJiOnRTzVe8gmg_5b";
      await sendForm(SERVICE_ID, TEMPLATE_ID, formRef.current, PUBLIC_KEY);
      toast.success("Message sent; thank you. We will reply soon.");
      formRef.current.reset();
    } catch (err) {
      console.error(err);
      toast.error("Unable to send message. Please try again later.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px] text-white">
      <Toaster position="top-right" />
      <Navbar />

    <header className="relative overflow-hidden pt-24 pb-16 ">
      {/* Glowing gradient orbs for background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-orange-500/10 blur-[160px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-yellow-400/10 blur-[160px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-start space-y-6"
        >
          {/* Badge */}
          <Badge
            variant="outline"
            className="px-3 py-1 border border-[#ff7a2d]/40 text-[#ffb84a] bg-[#ff7a2d]/5 hover:bg-[#ff7a2d]/10 transition-colors flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-[#ffb84a]" />
            Connect & Collaborate
          </Badge>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight text-white max-w-3xl tracking-tight"
          >
            Connect with{" "}
            <span className="relative inline-block">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#ff7a2d] via-[#ffb84a] to-[#ff7a2d] animate-gradient-x">
                SparkLab
              </span>
              {/* underline glow effect */}
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.4, duration: 0.8 }}
                className="absolute bottom-0 left-0 w-full h-[3px] bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] origin-left rounded-full"
              />
            </span>
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl"
          >
            Tell us about our project, collaboration idea, or any question —
            our team specializes in educational simulations, integrations, and
            research partnerships.
          </motion.p>

          {/* Subtle icon + energy pulse */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.6, ease: "easeOut" }}
            className="flex items-center gap-2 bg-orange-700/50 border border-orange-600 p-2 rounded-2xl text-[#ffb84a]/90 mt-2"
          >
            <Zap className="w-4 h-4 animate-pulse text-[#ff7a2d]" />
            <span className="text-sm tracking-wide">Energy through innovation</span>
          </motion.div>
        </motion.div>
      </div>
    </header>



      {/* MAIN GRID */}
      <main ref={containerRef} className="max-w-7xl mx-auto px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

    <div className="lg:col-span-5 space-y-8">
      {/* Contact Form */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7 }}
      >
        <Card className="bg-black/60 border border-zinc-800 rounded-3xl p-6 backdrop-blur-md shadow-[0_10px_50px_rgba(255,120,40,0.05)] hover:shadow-[0_10px_60px_rgba(255,120,40,0.1)] transition-all duration-300">
          <CardContent className="p-0">
            <div className="px-1 pb-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    Send us a message
                  </h3>
                  <p className="text-zinc-400 text-sm mt-1">
                    We usually reply within 24 hours.
                  </p>
                </div>
                <Badge className="bg-gradient-to-r from-orange-500/10 to-yellow-400/10 border border-orange-500/40 text-[#ffb84a] px-3 py-1 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Contact
                </Badge>
              </div>

              {/* Form */}
              <form
                ref={formRef}
                onSubmit={handleSubmit}
                className="mt-6 space-y-4"
              >
                <div>
                  <Label className="text-zinc-300">Full Name</Label>
                  <Input
                    name="name"
                    placeholder="Your full name"
                    required
                    className="mt-2 bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-500 focus:ring-2 focus:ring-[#ff7a2d] focus:border-[#ff7a2d] rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-zinc-300">Email</Label>
                  <Input
                    type="email"
                    name="email"
                    placeholder="you@company.com"
                    required
                    className="mt-2 bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-500 focus:ring-2 focus:ring-[#ff7a2d] focus:border-[#ff7a2d] rounded-xl"
                  />
                </div>

                <input type="hidden" name="time" />

                <div>
                  <Label className="text-zinc-300">Message</Label>
                  <Textarea
                    name="message"
                    placeholder="Tell us about your project..."
                    required
                    className="mt-2 bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-500 focus:ring-2 focus:ring-[#ff7a2d] focus:border-[#ff7a2d] min-h-[140px] rounded-xl"
                  />
                </div>

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={sending}
                    className="flex-1 bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black font-semibold py-3 rounded-xl shadow-lg hover:shadow-[0_0_20px_rgba(255,122,45,0.5)] hover:scale-[1.02] transition-all"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {sending ? "Sending..." : "Send message"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() =>
                      formRef.current && formRef.current.reset()
                    }
                    className="border border-zinc-700 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 cursor-pointer bg-black rounded-xl"
                  >
                    Reset
                  </Button>
                </div>
              </form>

              {/* Quick Tips */}
              <div className="mt-8 grid grid-cols-1 gap-3 text-sm text-zinc-400">
                <div className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/70">
                  Use a corporate or institutional email for collaboration
                  requests.
                </div>
                <div className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/70">
                  Include a short project summary and timeline for faster
                  response.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Contact Info Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.6 }}
        className="grid grid-cols-1  gap-4"
      >
        {[
          {
            icon: <Mail className="text-[#ffb84a] w-6 h-6" />,
            title: "Email",
            info: "contactsparklabsbeee@gmail.com",
          },
          {
            icon: <Phone className="text-[#ffb84a] w-6 h-6" />,
            title: "Phone",
            info: "+91 76749 40870",
          },
          {
            icon: <MapPin className="text-[#ffb84a] w-6 h-6" />,
            title: "Location",
            info: "Chennai, India",
          },
          {
            icon: <Github className="text-[#ffb84a] w-6 h-6" />,
            title: "Code",
            info: "https://github.com/Eswarchinthakayala-webdesign/SparkLab",
          },
        ].map((c, i) => (
          <motion.div
            key={i}
            whileHover={{ scale: 1.03, y: -3 }}
            transition={{ type: "spring", stiffness: 250 }}
            className="bg-gradient-to-br from-zinc-900/70 to-black/70 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3 hover:border-[#ff7a2d]/40 hover:shadow-[0_0_20px_rgba(255,120,40,0.2)] transition-all"
          >
            {c.icon}
            <div>
              <div className="text-sm text-zinc-300 font-semibold">
                {c.title}
              </div>
              <div className="text-zinc-400 text-sm">{c.info}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>


          {/* Right column: Canvas & social (col-span 7) */}
          <div className="lg:col-span-7 flex flex-col bg-black border border-zinc-600/50 backdrop-blur p-5 rounded-2xl gap-6">
            <motion.div style={{ translateY: yParallax }} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
              <Card className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden backdrop-blur-lg shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
                <CardContent className="p-0">
                  <div className="relative">
                    <EnergyCoreCanvas className="rounded-2xl" />
                    
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.6 }} className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-white">Follow SparkLab</h4>
                <p className="text-zinc-400 text-sm mt-1">Open-source, research, and integrations.</p>
              </div>
              <div className="flex items-center gap-3">
                <a href="https://x.com/VIRATPHILE06?s=09" target="_blank" rel="noreferrer" className="p-2 bg-zinc-900/40 border border-zinc-800 text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 rounded-lg hover:scale-105 transition">
                  <Twitter className="w-5 h-5 text-zinc-100" />
                </a>
                <a href="https://github.com/Eswarchinthakayala-webdesign" target="_blank" rel="noreferrer" className="p-2 bg-zinc-900/40 border border-zinc-800 rounded-lg text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 hover:scale-105 transition">
                  <Github className="w-5 h-5 text-zinc-100" />
                </a>
                <a href="https://www.linkedin.com/in/eswar-chinthakayala-536a91341?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app" target="_blank" rel="noreferrer" className="p-2 bg-zinc-900/40 border border-zinc-800 rounded-lg text-orange-400 hover:bg-orange-900/50 hover:border-orange-700 hover:text-orange-500 hover:scale-105 transition">
                  <Linkedin className="w-5 h-5 text-zinc-100" />
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-zinc-800 bg-black/60">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-zinc-400 text-sm">© {new Date().getFullYear()} SparkLab. All rights reserved.</div>
          <div className="text-zinc-400 text-sm">Built for educational research & integrations.</div>
        </div>
      </footer>
    </div>
  );
}
