import React, { useState, useEffect, useRef } from "react";

export default function FuturisticCapacitor({ running = true }) {
  const [time, setTime] = useState(0);
  const rafRef = useRef(null);
  const particleCount = 20;

  // Update animation time
  useEffect(() => {
    let t = 0;
    const step = () => {
      t += 16;
      if (running) setTime((t / 1000) % 10);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  // Generate particle positions along curved paths toward plates
  const particles = Array.from({ length: particleCount }).map((_, i) => {
    const phase = (i / particleCount) * Math.PI * 2;
    const progress = (time + i * 0.15) % 2;
    const x = 50 + Math.sin(progress * Math.PI) * 30; // horizontal offset
    const y = 50 + Math.cos(progress * Math.PI) * 20; // vertical arc
    return { x, y };
  });

  // Voltage waveform
  const makeWavePath = (w, h) => {
    const points = 50;
    const mid = h / 2;
    let d = `M0 ${mid}`;
    for (let i = 0; i <= points; i++) {
      const t = i / points * 5;
      const v = 1 - Math.exp(-t); // V = V0(1 - e^-t/RC)
      const y = mid - v * mid * 0.8;
      const x = (i / points) * w;
      d += ` L${x} ${y}`;
    }
    return d;
  };

  return (
    <div className="w-full max-w-xl mx-auto p-4 bg-gradient-to-b from-[#0a0a0a] to-[#1a1a1a] rounded-xl border border-zinc-800 shadow-lg">
      <svg viewBox="0 0 200 120" className="w-full h-60">
        {/* Capacitor Plates */}
        <rect x="40" y="30" width="6" height="60" fill="#00eaff" rx="2" className="filter drop-shadow-[0_0_10px_#00eaff]" />
        <rect x="154" y="30" width="6" height="60" fill="#ffd24a" rx="2" className="filter drop-shadow-[0_0_12px_#ffd24a]" />

        {/* Charge Particles */}
        {particles.map((p, i) => (
          <circle
            key={i}
            cx={p.x + 50}
            cy={p.y}
            r={2 + Math.sin(time + i) * 1}
            fill={i % 2 === 0 ? "#00eaff" : "#ffd24a"}
            className="animate-pulse"
          />
        ))}

        {/* Pulsating Electric Field */}
        <circle
          cx="73"
          cy="60"
          r={15 + Math.sin(time * 3) * 3}
          fill="none"
          stroke="#00eaff"
          strokeWidth="1.2"
          className="opacity-40"
        />
        <circle
          cx="157"
          cy="60"
          r={15 + Math.sin(time * 3 + Math.PI) * 3}
          fill="none"
          stroke="#ffd24a"
          strokeWidth="1.2"
          className="opacity-40"
        />

        {/* Holographic Ripple on Full Charge */}
        <circle
          cx="100"
          cy="60"
          r={20 + Math.sin(time * 4) * 5}
          fill="none"
          stroke="#ff7a2d"
          strokeWidth="1.2"
          className="opacity-20"
        />

        {/* Voltage Waveform */}
        <g transform="translate(20, 100)">
          <rect x="0" y="-20" width="160" height="20" fill="#0a0a0a" stroke="#222" rx="4" />
          <path
            d={makeWavePath(160, 20)}
            fill="none"
            stroke="#ff7a2d"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="filter drop-shadow-[0_0_4px_#ff7a2d]"
          />
        </g>

        {/* Capacitor Label */}
        <text x="90" y="25" fontSize="12" fill="#ffd24a">C</text>
      </svg>

      <div className="mt-2 text-center text-sm text-zinc-400">
        <span className="text-[#00eaff]">Left Plate:</span> Negative (Blue) &nbsp; | &nbsp;
        <span className="text-[#ffd24a]">Right Plate:</span> Positive (Amber)
      </div>
    </div>
  );
}
