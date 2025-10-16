// src/hooks/useEnergySim.js
import { useEffect, useRef, useState } from "react";

/**
 * useEnergySim
 * - appliances: [{ id, name, baseWatts, enabled, quantity }]
 * - efficiencyFactor: number between 0.5 and 1.0 (1.0 = no change, 0.8 = 20% savings)
 * - timestepMs: simulation step for producing history points
 *
 * returns { history, totals: { watts, kW, dailyKWh, monthlyKWh }, pushNow() }
 */
export default function useEnergySim({ appliances = [], efficiencyFactor = 1.0, timestepMs = 600 } = {}) {
  const [history, setHistory] = useState(() => Array.from({ length: 360 }, (_, i) => ({ t: i, watts: 0 })));
  const startRef = useRef(performance.now());
  const rafRef = useRef(null);
  const tRef = useRef(0);

  // compute instantaneous total watts
  const computeTotalWatts = () => {
    let total = 0;
    for (const a of appliances) {
      if (!a.enabled) continue;
      const qty = Number.isFinite(Number(a.quantity)) ? Number(a.quantity) : 1;
      const base = Number.isFinite(Number(a.baseWatts)) ? Number(a.baseWatts) : 0;
      total += base * qty;
    }
    // apply efficiency factor (lower factor reduces consumption)
    total = total * efficiencyFactor;
    return total;
  };

  const pushTick = () => {
    const watts = computeTotalWatts();
    setHistory((h) => {
      const nxt = h.slice();
      const lastT = nxt.length ? nxt[nxt.length - 1].t : 0;
      nxt.push({ t: lastT + 1, watts });
      if (nxt.length > 720) nxt.shift();
      return nxt;
    });
  };

  useEffect(() => {
    let alive = true;
    let last = performance.now();
    const loop = (ts) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(loop);
      const dt = ts - last;
      if (dt < timestepMs) return;
      last = ts;
      pushTick();
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [appliances, efficiencyFactor, timestepMs]);

  // derived totals (most-recent)
  const latest = history.length ? history[history.length - 1].watts : 0;
  const totals = {
    watts: latest,
    kW: latest / 1000,
    dailyKWh: (latest / 1000) * 24, // instantaneous * 24
    monthlyKWh: (latest / 1000) * 24 * 30,
  };

  return { history, totals, pushTick };
}
