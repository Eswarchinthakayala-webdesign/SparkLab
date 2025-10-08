// src/pages/visualizations/KarnaughMapSolverPage.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { motion } from "framer-motion";
import { Activity, Copy, Play, Pause, Zap, Sliders, Table, Brackets, PanelLeftRightDashed, AudioWaveform, Grip, LocateFixed, Camera } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import Footer from "@/components/landing/Footer";
import { CopyExpressionButtons } from "../../components/CopyExpressionButtons";

/* ---------------- THEME ---------------- */
const THEME = {
  bg: "#05060a",
  cardBg: "#000",
  border: "rgba(255,255,255,0.06)",
  accent: "#ff7a2d",
  accent2: "#ffd24a",
  subtle: "rgba(255,255,255,0.04)",
  glow: "0 0 14px rgba(255,122,45,0.16)",
  text: "text-orange-100",
};

/* ---------------- Utilities ---------------- */
function gray(n) { return n ^ (n >> 1); }
function intToBinStr(n, bits) {
  let s = n.toString(2);
  if (s.length < bits) s = "0".repeat(bits - s.length) + s;
  return s;
}
function countOnes(s) { return s.split("").filter((c) => c === "1").length; }
function combineTerms(a, b) {
  let diff = 0, out = "";
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) out += a[i];
    else { diff++; out += "-"; if (diff > 1) return null; }
  }
  return out;
}
function covers(termPattern, mintermBin) {
  for (let i = 0; i < termPattern.length; i++) {
    if (termPattern[i] === "-") continue;
    if (termPattern[i] !== mintermBin[i]) return false;
  }
  return true;
}

/* ------------------ K-map layout builder ------------------ */
/**
 * Build K-map layout splitting variables roughly half for rows/cols.
 * For 2..5 vars.
 * returns { rows, cols, cells, rowBits, colBits }
 * cells: { r, c, minterm, rowGray, colGray }
 */
function buildKmapCells(vars) {
  // split bits: rowBits = floor(vars/2), colBits = vars - rowBits
  const rowBits = Math.floor(vars / 2);
  const colBits = vars - rowBits;
  const rows = 1 << rowBits;
  const cols = 1 << colBits;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rowGray = gray(r);
      const colGray = gray(c);
      const minterm = (rowGray << colBits) | colGray;
      cells.push({ r, c, minterm, rowGray, colGray });
    }
  }
  return { rows, cols, cells, rowBits, colBits };
}

/* ------------------ Quine-McCluskey Simplifier ------------------ */
/**
 * qmSimplify(minterms, dontCares, numVars)
 * returns { primeImplicants: [patterns], selectedPatterns: [patterns] }
 */
function qmSimplify(minterms, dontCares, numVars) {
  if (!minterms || minterms.length === 0) return { primeImplicants: [], selectedPatterns: [] };

  const allTerms = Array.from(new Set([...(minterms || []), ...(dontCares || [])])).sort((a,b)=>a-b);
  const bits = numVars;
  let groups = {};
  allTerms.forEach((t) => {
    const bin = intToBinStr(t, bits);
    const k = countOnes(bin);
    groups[k] = groups[k] || [];
    groups[k].push({ pattern: bin, covers: [t] });
  });

  const primeImplicants = [];
  while (true) {
    const newGroups = {};
    const usedPatterns = new Set();
    const groupKeys = Object.keys(groups).map(Number).sort((a,b)=>a-b);
    for (let gi = 0; gi < groupKeys.length - 1; gi++) {
      const g1 = groups[groupKeys[gi]] || [];
      const g2 = groups[groupKeys[gi + 1]] || [];
      for (const t1 of g1) {
        for (const t2 of g2) {
          const c = combineTerms(t1.pattern, t2.pattern);
          if (c !== null) {
            usedPatterns.add(t1.pattern); usedPatterns.add(t2.pattern);
            const covers = Array.from(new Set([...(t1.covers||[]), ...(t2.covers||[])]));
            const ones = countOnes(c.replace(/-/g, ""));
            newGroups[ones] = newGroups[ones] || [];
            if (!newGroups[ones].some(x => x.pattern === c)) newGroups[ones].push({ pattern: c, covers });
          }
        }
      }
    }
    Object.values(groups).forEach((grp) => grp.forEach((t) => {
      if (!usedPatterns.has(t.pattern) && !primeImplicants.some(pi => pi.pattern === t.pattern)) {
        primeImplicants.push(t);
      }
    }));
    if (Object.keys(newGroups).length === 0) break;
    groups = newGroups;
  }
  Object.values(groups).forEach((grp) => grp.forEach((t) => {
    if (!primeImplicants.some(pi => pi.pattern === t.pattern)) primeImplicants.push(t);
  }));

  // Build chart for original minterms only
  const chart = {}; minterms.forEach((m)=>(chart[m]=[]));
  primeImplicants.forEach((pi, idx) => {
    minterms.forEach((m) => {
      const bin = intToBinStr(m, bits);
      if (covers(pi.pattern, bin)) chart[m].push(idx);
    });
  });

  const selected = new Set();
  const covered = new Set();
  Object.keys(chart).forEach((mStr) => {
    const arr = chart[mStr];
    if (arr.length === 1) { selected.add(arr[0]); covered.add(Number(mStr)); }
  });

  function piCoversCount(piIdx) {
    const pi = primeImplicants[piIdx];
    let count = 0;
    minterms.forEach((m) => {
      if (!covered.has(m)) {
        const bin = intToBinStr(m, bits);
        if (covers(pi.pattern, bin)) count++;
      }
    });
    return count;
  }

  while (covered.size < minterms.length) {
    let best = -1, bestIdx = -1;
    for (let i = 0; i < primeImplicants.length; i++) {
      if (selected.has(i)) continue;
      const c = piCoversCount(i);
      if (c > best) { best = c; bestIdx = i; }
    }
    if (bestIdx === -1) break;
    selected.add(bestIdx);
    minterms.forEach((m) => {
      const bin = intToBinStr(m, bits);
      if (covers(primeImplicants[bestIdx].pattern, bin)) covered.add(m);
    });
  }

  return { primeImplicants: primeImplicants.map(p => p.pattern), selectedPatterns: Array.from(selected).map(i => primeImplicants[i].pattern) };
}

/* ---------------- Grouping (greedy rectangles) ---------------- */
/**
 * getCellMatrix(vars, cellsState) -> {rows, cols, mat, cells}
 * findGroups(vars, cellsState) -> groups array with: { r0, c0, h, w, cells: [{r,c}], minterms: [..] }
 */
function getCellMatrix(vars, cellsState) {
  const { rows, cols, cells } = buildKmapCells(vars);
  const mat = Array.from({ length: rows }, () => Array(cols).fill(0));
  cells.forEach((cell) => { const c = cellsState[cell.minterm] ?? 0; mat[cell.r][cell.c] = c; });
  return { rows, cols, mat, cells };
}
function findGroups(vars, cellsState) {
  const { rows, cols, mat, cells } = getCellMatrix(vars, cellsState);
  const R = rows, C = cols;
  const groups = [];
  const heights = [];
  for (let h = R; h >= 1; h /= 2) heights.push(h);
  const widths = [];
  for (let w = C; w >= 1; w /= 2) widths.push(w);
  const candidates = [];
  heights.forEach((h)=>widths.forEach((w)=>{ candidates.push({h,w,area:h*w}); }));
  candidates.sort((a,b)=>b.area-a.area);
  const covered = Array.from({ length: R }, ()=>Array(C).fill(false));
  for (const cand of candidates) {
    const h = cand.h, w = cand.w;
    for (let r0 = 0; r0 < R; r0++) {
      for (let c0 = 0; c0 < C; c0++) {
        let ok = true, atLeastOneOne = false;
        const included = [];
        for (let dr = 0; dr < h; dr++) {
          for (let dc = 0; dc < w; dc++) {
            const rr = (r0 + dr) % R;
            const cc = (c0 + dc) % C;
            const val = mat[rr][cc];
            if (!(val === 1 || val === -1)) { ok = false; break; }
            if (val === 1) atLeastOneOne = true;
            included.push({ r: rr, c: cc });
          }
          if (!ok) break;
        }
        if (!ok || !atLeastOneOne) continue;
        let addsNew = false;
        included.forEach((ic) => { if (!covered[ic.r][ic.c]) addsNew = true; });
        if (!addsNew) continue;
        // mark covered and create minterm list
        const minterms = included.map(ic => {
          const found = cells.find(cc => cc.r === ic.r && cc.c === ic.c);
          return found ? found.minterm : null;
        }).filter(Boolean);
        included.forEach((ic) => (covered[ic.r][ic.c] = true));
        groups.push({ r0, c0, h, w, cells: included, minterms });
      }
    }
  }
  return groups;
}

/* ---------------- Convert pattern -> readable SOP/POS ---------------- */
function patternToSOPterm(pat, varNames) {
  const parts = [];
  for (let i=0;i<pat.length;i++) {
    const ch = pat[i];
    if (ch === '-') continue;
    const v = varNames[i];
    if (ch === '1') parts.push(v);
    else parts.push(v + "'");
  }
  if (parts.length === 0) return "1";
  return parts.join("");
}
function patternToPOSclause(pat, varNames) {
  const parts = [];
  for (let i=0;i<pat.length;i++) {
    const ch = pat[i];
    if (ch === '-') continue;
    const v = varNames[i];
    if (ch === '0') parts.push(v);     // 0 -> variable
    else parts.push(v + "'");          // 1 -> variable'
  }
  if (parts.length === 0) return "(1)";
  return "(" + parts.join(" + ") + ")";
}

/* ---------------- React Page Component ---------------- */
export default function KarnaughMapSolverPage() {
  /* ---------- State & Refs ---------- */
  const [vars, setVars] = useState(4);
  const [cellsState, setCellsState] = useState(() => {
    const init = {}; for (let i=0;i<(1<<4);i++) init[i]=0; return init;
  });
  const [mintermInput, setMintermInput] = useState("");
  const [dontCareInput, setDontCareInput] = useState("");
  const [running, setRunning] = useState(true);
  const [overlayMode, setOverlayMode] = useState("both"); // 'sop' | 'pos' | 'both' | 'none'

  // measurement refs
  const mapContainerRef = useRef(null);
  const cellRefs = useRef({}); // minterm -> DOM element
  const [cellRectMap, setCellRectMap] = useState({}); // minterm -> DOMRect

  // ensure cleared on var change
  useEffect(()=> { cellRefs.current = {}; }, [vars]);

  /* ---------- Layout measurement ---------- */
  useLayoutEffect(()=> {
    function measure() {
      const map = {};
      const cont = mapContainerRef.current;
      if (!cont) return;
      const contRect = cont.getBoundingClientRect();
      Object.keys(cellRefs.current).forEach(k => {
        const el = cellRefs.current[k];
        if (el && el.getBoundingClientRect) {
          const r = el.getBoundingClientRect();
          // store rect relative to container
          map[k] = {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height
          };
        }
      });
      setCellRectMap(map);
    }
    measure();
    const ro = new ResizeObserver(() => measure());
    if (mapContainerRef.current) ro.observe(mapContainerRef.current);
    window.addEventListener("resize", measure);
    return ()=> { try { ro.disconnect(); } catch(e){}; window.removeEventListener("resize", measure); };
  }, [vars, cellsState]);

  /* ---------- Helpers: toggle, parse, apply ---------- */
  function toggleCell(minterm) {
    setCellsState((s) => {
      const next = { ...s };
      const cur = s[minterm];
      let n;
      if (cur === 0) n = 1;
      else if (cur === 1) n = -1;
      else n = 0;
      next[minterm] = n;
      return next;
    });
  }
  function parseList(str) {
    if (!str || !str.trim()) return [];
    const toks = str.split(/[,\s]+/).map(t=>t.trim()).filter(Boolean);
    const ints = [];
    toks.forEach((tk) => {
      if (tk.includes("-")) {
        const [a,b] = tk.split("-").map(x=>Number(x));
        if (!isNaN(a) && !isNaN(b)) {
          for (let i=Math.min(a,b);i<=Math.max(a,b);i++) ints.push(i);
        }
      } else {
        const v = Number(tk);
        if (!isNaN(v)) ints.push(v);
      }
    });
    const max = (1<<vars)-1;
    return Array.from(new Set(ints)).filter(x=>x>=0 && x<=max).sort((a,b)=>a-b);
  }
  function applyInputs() {
    const mins = parseList(mintermInput);
    const dcs = parseList(dontCareInput);
    const next = {};
    const max = 1<<vars;
    for (let i=0;i<max;i++) next[i]=0;
    mins.forEach(m => next[m] = 1);
    dcs.forEach(m => { if (next[m] !== 1) next[m] = -1; });
    setCellsState(next);
  }
  function clearAll() {
    const max = 1<<vars;
    const next = {}; for (let i=0;i<max;i++) next[i]=0;
    setCellsState(next); setMintermInput(""); setDontCareInput("");
  }

  /* ---------- K-map layout & derived data ---------- */
  const { rows, cols, cells, rowBits, colBits } = useMemo(()=>buildKmapCells(vars), [vars]);

  const minterms = useMemo(()=>Object.keys(cellsState).filter(k=>cellsState[k]===1).map(Number), [cellsState]);
  const dontCares = useMemo(()=>Object.keys(cellsState).filter(k=>cellsState[k]===-1).map(Number), [cellsState]);
  const maxterms = useMemo(()=> {
    const mx = []; const max = 1<<vars;
    for (let i=0;i<max;i++) {
      if (!minterms.includes(i) && !dontCares.includes(i)) mx.push(i);
    }
    return mx;
  }, [vars, minterms, dontCares]);

  /* ---------- Simplification (SOP & POS) ---------- */
  const sopResult = useMemo(()=> {
    if (minterms.length === 0) return { primeImplicants: [], patterns: [], expression: "0", varNames: (vars===2?["A","B"]: vars===3?["A","B","C"] : vars===4?["A","B","C","D"] : ["A","B","C","D","E"]) };
    const { primeImplicants, selectedPatterns } = qmSimplify(minterms, dontCares, vars);
    const varNames = (vars===2?["A","B"]: vars===3?["A","B","C"] : vars===4?["A","B","C","D"] : ["A","B","C","D","E"]);
    const exprTerms = (selectedPatterns || []).map(pat => patternToSOPterm(pat, varNames));
    const expression = exprTerms.length === 0 ? "0" : exprTerms.join(" + ");
    return { primeImplicants: primeImplicants || [], patterns: selectedPatterns || [], expression, varNames };
  }, [minterms, dontCares, vars]);

  const posResult = useMemo(()=> {
    if (maxterms.length === 0) return { primeImplicants: [], patterns: [], expression: "1", varNames: (vars===2?["A","B"]: vars===3?["A","B","C"] : vars===4?["A","B","C","D"] : ["A","B","C","D","E"]) };
    const { primeImplicants, selectedPatterns } = qmSimplify(maxterms, dontCares, vars);
    const varNames = (vars===2?["A","B"]: vars===3?["A","B","C"] : vars===4?["A","B","C","D"] : ["A","B","C","D","E"]);
    const clauses = (selectedPatterns || []).map(pat => patternToPOSclause(pat, varNames));
    const expression = clauses.length === 0 ? "1" : clauses.join(" * ");
    return { primeImplicants: primeImplicants || [], patterns: selectedPatterns || [], expression, varNames };
  }, [maxterms, dontCares, vars]);

  /* ---------- Grouping ---------- */
  const groups = useMemo(()=> {
    const g = findGroups(vars, cellsState);
    // groups already include minterms property from findGroups
    return g;
  }, [vars, cellsState]);

  /* ---------- Coverage arrays for SOP / POS (for visual grids) ---------- */
  function patternCoveredMinterms(pattern) {
    const res = [];
    const max = 1 << vars;
    for (let i=0;i<max;i++) if (covers(pattern, intToBinStr(i, vars))) res.push(i);
    return res;
  }
  const sopTermCoverage = useMemo(()=> {
    const arr = [];
    (sopResult.patterns || []).forEach(p => {
      arr.push({ pattern: p, minterms: patternCoveredMinterms(p) });
    });
    return arr;
  }, [sopResult, vars]);

  const posTermCoverage = useMemo(()=> {
    const arr = [];
    (posResult.patterns || []).forEach(p => {
      arr.push({ pattern: p, minterms: patternCoveredMinterms(p) });
    });
    return arr;
  }, [posResult, vars]);

  /* ---------- Waveform & truth table ---------- */
  const waveform = useMemo(()=> {
    const samples = [];
    const max = 1<<vars;
    for (let t=0;t<max;t++) {
      let out = 0;
      for (const pat of (sopResult.patterns||[])) {
        if (covers(pat, intToBinStr(t, vars))) { out = 1; break; }
      }
      for (let k=0;k<6;k++) samples.push({ t: t + k/6, v: out });
    }
    return samples;
  }, [sopResult, vars]);

  const truthTable = useMemo(()=> {
    const rowsOut = [];
    const max = 1<<vars;
    for (let i=0;i<max;i++) {
      const inbits = [];
      for (let b=vars-1;b>=0;b--) inbits.push((i>>b)&1);
      const out = minterms.includes(i) ? 1 : (dontCares.includes(i) ? "X" : 0);
      rowsOut.push({ in: inbits, out, i });
    }
    return rowsOut;
  }, [vars, minterms, dontCares]);

  /* ---------- Label helpers ---------- */
  function colLabelString(colIndex, colBits) { const g = gray(colIndex); return intToBinStr(g, colBits); }
  function rowLabelString(rowIndex, rowBits) { const g = gray(rowIndex); return intToBinStr(g, rowBits); }

  /* ---------- computeGroupBox using cellRectMap (single source of truth) ---------- */
  function computeGroupBox(group) {
    if (!group || !group.minterms || group.minterms.length === 0) return null;
    if (!mapContainerRef.current) return null;
    const contRect = mapContainerRef.current.getBoundingClientRect();
    const rects = group.minterms.map(m => cellRectMap[m]).filter(Boolean);
    if (!rects.length) return null;
    const left = Math.min(...rects.map(r=>r.left));
    const top = Math.min(...rects.map(r=>r.top));
    const right = Math.max(...rects.map(r=>r.right));
    const bottom = Math.max(...rects.map(r=>r.bottom));
    return {
      left: left - contRect.left,
      top: top - contRect.top,
      width: right - left,
      height: bottom - top
    };
  }

  /* ---------- UI helpers ---------- */
  const headClass = `${THEME.text} font-semibold`;

  /* ---------- Render ---------- */
  return (
    <div className="min-h-screen  bg-[#05060a]
                 bg-[radial-gradient(circle,_rgba(255,122,28,0.25)_1px,transparent_1px)]
                 bg-[length:20px_20px]">
      <header className="fixed inset-x-0 top-0 z-40 backdrop-blur-md" style={{ background: "rgba(0,0,0,0.35)", borderBottom: `1px solid ${THEME.border}` }}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`, color: "black" }}>
                <Zap />
              </div>
              <div>
                <div className="text-sm  font-semibold text-zinc-200">SparkLab</div>
                <div className="text-xs  text-zinc-400 -mt-0.5 truncate">Karnaugh Map Solver</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button className="cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-orange-900" onClick={()=>setRunning(r=>!r)}>
                {running ? <><Pause className="w-4 h-4 " /> <span className="hidden sm:inline"> Pause </span></> : <><Play className="w-4 h-4" /> <span className="hidden sm:inline"> Run</span></>}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-28 pb-12 max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column: controls */}
<div className="lg:col-span-3 space-y-5">
  {/* Inputs & Settings */}
  <motion.div
    whileHover={{ scale: 1.01 }}
    transition={{ type: "spring", stiffness: 200 }}
  >
    <Card
      className="border border-zinc-800 shadow-md"
      style={{ background: THEME.cardBg }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-orange-400 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-orange-400" />
            Inputs & Settings
          </CardTitle>
          <Badge className="bg-orange-500/20 text-orange-300 border border-orange-700/50">
            Configure
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Variables */}
        <div>
          <Badge className="bg-orange-500/20 text-orange-300 border border-orange-700/50 mb-1">
            Variables
          </Badge>
          <Select onValueChange={(v) => setVars(Number(v))} value={String(vars)}>
            <SelectTrigger className="mt-2 cursor-pointer bg-zinc-900/60 border-zinc-700 text-orange-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900/90 border-zinc-800">
              <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="2">2 variables (A,B)</SelectItem>
              <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="3">3 variables (A,B,C)</SelectItem>
              <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="4">4 variables (A,B,C,D)</SelectItem>
              <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="5">5 variables (A,B,C,D,E)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Minterms */}
        <div>
          <Badge className="bg-orange-500/20 text-orange-300 border border-orange-700/50 mb-1">
            Minterms
          </Badge>
          <Input
            value={mintermInput}
            onChange={(e) => setMintermInput(e.target.value)}
            placeholder="e.g. 1,3,5-7"
            className="bg-zinc-900/60 border-zinc-800 text-orange-100"
          />
        </div>

        {/* Don't Cares */}
        <div>
          <Badge className="bg-orange-500/20 text-orange-300 border border-orange-700/50 mb-1">
            Don’t Cares
          </Badge>
          <Input
            value={dontCareInput}
            onChange={(e) => setDontCareInput(e.target.value)}
            placeholder="e.g. 2,6"
            className="bg-zinc-900/60 border-zinc-800 text-orange-100"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button className="bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-orange-900 hover:scale-105 transition-transform">
            Apply
          </Button>
          <Button
            variant="outline"
            onClick={clearAll}
            className="border border-zinc-700 text-orange-100 hover:bg-zinc-800/60"
          >
            Clear
          </Button>
        </div>

        <div className="text-xs text-zinc-400">
          Tip: Click map cells to toggle <span className="text-orange-300 font-medium">0 → 1 → X → 0</span>
        </div>
      </CardContent>
    </Card>
  </motion.div>

  {/* Truth Table */}
  <motion.div whileHover={{ scale: 1.01 }}>
    <Card
      className="border border-zinc-800 shadow-md"
      style={{ background: THEME.cardBg }}
    >
      <CardHeader className="pb-2 flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-orange-400">
          <Table className="w-5 h-5" /> Truth Table
        </CardTitle>
        <Badge className="bg-orange-500/20 text-orange-300 border border-orange-700/50">
          Preview
        </Badge>
      </CardHeader>

<CardContent>
  <div className="text-sm max-h-64 overflow-auto rounded-xl border border-zinc-800/80 bg-gradient-to-b from-[#0d0d0d]/90 to-[#111]/90 backdrop-blur-sm shadow-inner shadow-black/40">
    <table className="w-full table-fixed text-center text-sm text-zinc-300">
      <thead
        className="text-xs sticky top-0 bg-gradient-to-r from-zinc-950/95 to-zinc-900/95 backdrop-blur-md border-b border-zinc-800/70 shadow-sm shadow-black/40"
      >
        <tr>
          {Array.from({ length: vars }).map((_, i) => (
            <th
              key={i}
              className="p-2 font-semibold text-orange-400 uppercase tracking-wider border-r border-zinc-800/50 last:border-none"
            >
              {`V${vars - 1 - i}`}
            </th>
          ))}
          <th className="p-2 font-semibold text-orange-400 uppercase tracking-wider">OUT</th>
        </tr>
      </thead>
      <tbody>
        {truthTable.map((r, idx) => (
          <tr
            key={idx}
            className={`transition-colors cursor-pointer duration-200 ${
              idx % 2 === 0
                ? "bg-zinc-900/60"
                : "bg-zinc-950/40"
            } hover:bg-orange-500/10`}
          >
            {r.in.map((b, ii) => (
              <td
                key={ii}
                className="p-2 text-zinc-200 border-r border-zinc-800/40 last:border-none"
              >
                {b}
              </td>
            ))}
            <td
              className={`p-2 font-mono font-semibold ${
                r.out === 1
                  ? "text-orange-400"
                  : "text-zinc-500"
              }`}
            >
              {r.out}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</CardContent>

    </Card>
  </motion.div>

  {/* Minterms & Maxterms */}
  <motion.div whileHover={{ scale: 1.01 }}>
    <Card
      className="border border-zinc-800 shadow-md"
      style={{ background: THEME.cardBg }}
    >
      <CardHeader className="pb-2 flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-orange-400">
          <Brackets className="w-5 h-5" /> Minterms & Maxterms
        </CardTitle>
        <Badge className="bg-orange-500/20 text-orange-300 border border-orange-700/50">
          Logic
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="text-xs text-orange-200 mb-1">Minterms (1s)</div>
          <div className="font-mono text-sm text-orange-100">
            {minterms.length ? minterms.join(", ") : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-orange-200 mb-1">Maxterms (0s)</div>
          <div className="font-mono text-sm text-orange-100">
            {maxterms.length ? maxterms.join(", ") : "—"}
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Button
            className="cursor-pointer bg-gradient-to-r from-[#ff7a2d] to-[#ffd24a] text-orange-900 hover:scale-105 transition-transform"
            onClick={() =>
              navigator.clipboard?.writeText(minterms.join(",") || "")
            }
          >
            <Copy className="w-4 h-4 mr-2" /> Copy Minterms
          </Button>
          <Button
            variant="outline"
            className="border border-zinc-700 text-black cursor-pointer"
            onClick={() =>
              navigator.clipboard?.writeText(maxterms.join(",") || "")
            }
          >
            Copy Maxterms
          </Button>
        </div>
      </CardContent>
    </Card>
  </motion.div>
</div>


{/* ==================== CENTER: K-Map + SOP/POS Visualization ==================== */}
<div className=" lg:col-span-6 space-y-6 w-full">
  {/* MAIN K-MAP PANEL */}
  <div
    className="rounded-2xl p-4 overflow-hidden"
    style={{
      background: THEME.cardBg,
      border: `1px solid ${THEME.border}`,
    }}
  >
    {/* Header */}
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <motion.h3
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-lg font-semibold text-orange-400 flex items-center gap-2"
        >
          <LocateFixed/>

          Karnaugh Map
          <Badge
            variant="secondary"
            className="bg-gradient-to-r from-orange-500/20 to-amber-400/20 border border-orange-500/40 text-orange-300 text-xs"
          >
            {vars} vars
          </Badge>
        </motion.h3>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-xs text-zinc-400 mt-1 leading-relaxed"
        >
          Tap or click cells to toggle <span className="text-orange-300 font-medium">0 → 1 → X</span>.
          Groups and overlays update <span className="text-orange-200 font-medium">live</span>.
        </motion.p>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <div className="text-xs text-zinc-300 whitespace-nowrap">Overlay</div>
        <Select value={overlayMode} onValueChange={setOverlayMode}>
          <SelectTrigger
            className="w-full sm:w-36  bg-zinc-900/70 border border-zinc-800 text-orange-100 text-sm 
                       hover:border-orange-500/40 cursor-pointer focus:ring-1 focus:ring-orange-500/50 
                       transition-all rounded-md"
          >
            <SelectValue placeholder="Overlay Mode" />
          </SelectTrigger>
          <SelectContent
            className="bg-zinc-950/95 border border-zinc-800 text-orange-100 backdrop-blur-sm
                       shadow-lg shadow-black/40 rounded-lg"
          >
            <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="both">Both</SelectItem>
            <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="sop">SOP only</SelectItem>
            <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="pos">POS only</SelectItem>
            <SelectItem className="text-white hover:bg-orange-500/20 
                 data-[highlighted]:text-orange-200 cursor-pointer 
                 data-[highlighted]:bg-orange-500/30 rounded-md" value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    {/* Main K-Map grid */}
    <div className="mt-4 w-full overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 rounded-lg">
      <div
        ref={mapContainerRef}
        className="inline-block relative rounded-lg p-3 min-w-[320px] sm:min-w-[480px] md:min-w-[600px] lg:min-w-[680px] xl:min-w-[740px]"
        style={{
          width: "100%",
          maxWidth:
            vars <= 3 ? "420px" : vars === 4 ? "580px" : "900px",
        }}
      >
        {/* Dynamic Grid */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `minmax(36px, 1fr) repeat(${cols}, minmax(40px, 1fr))`,
            gap: 6,
          }}
        >
          {/* Empty corner */}
          <div className="h-10" />
          {/* Column labels */}
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-10 flex items-center justify-center text-[10px] sm:text-xs text-orange-200 font-mono"
            >
              {colLabelString(c, colBits)}
            </div>
          ))}

          {/* Row labels and cells */}
          {Array.from({ length: rows }).map((_, r) => (
            <React.Fragment key={r}>
              <div className="h-12 flex items-center justify-center text-[10px] sm:text-xs text-orange-200 font-mono">
                {rowLabelString(r, rowBits)}
              </div>

              {Array.from({ length: cols }).map((_, c) => {
                const cell = cells.find((cc) => cc.r === r && cc.c === c);
                const minterm = cell?.minterm;
                const val = cellsState[minterm] ?? 0;
                const isOne = val === 1;
                const isX = val === -1;
                const inGroup = groups.some((gp) =>
                  gp.minterms?.includes(minterm)
                );
                const sopIndex = sopTermCoverage.findIndex((s) =>
                  s.minterms.includes(minterm)
                );
                const posIndex = posTermCoverage.findIndex((p) =>
                  p.minterms.includes(minterm)
                );

                return (
                  <div
                    key={c}
                    ref={(el) => {
                      if (minterm !== undefined)
                        cellRefs.current[minterm] = el;
                    }}
                    onClick={() => toggleCell(minterm)}
                    className="relative rounded-md flex flex-col items-center justify-center 
                               cursor-pointer select-none transition-transform hover:scale-[1.05] active:scale-[0.95]"
                    style={{
                      minHeight:
                        vars <= 3
                          ? 56
                          : vars === 4
                          ? 48
                          : 44,
                      border: `1px solid ${THEME.border}`,
                      background: isOne
                        ? "linear-gradient(180deg, rgba(255,122,45,0.07), rgba(255,210,74,0.02))"
                        : isX
                        ? "rgba(255,255,255,0.02)"
                        : "#0b0b0b",
                      boxShadow: isOne
                        ? "inset 0 0 8px rgba(255,122,45,0.06)"
                        : "none",
                      color: isOne
                        ? "white"
                        : isX
                        ? "rgba(255,255,255,0.8)"
                        : "rgba(255,255,255,0.75)",
                      padding: 6,
                      borderRadius: 8,
                    }}
                  >
                    <div className="text-[11px] font-mono absolute top-2 left-2 text-zinc-300">
                      m{minterm}
                    </div>
                    <div className="text-lg sm:text-xl font-semibold">
                      {isOne ? "1" : isX ? "X" : "0"}
                    </div>

                    {inGroup && (
                      <div
                        className="absolute left-2 bottom-2 w-2 h-2 rounded-sm"
                        style={{ background: THEME.accent2 }}
                      />
                    )}

                    {(overlayMode === "sop" || overlayMode === "both") &&
                      sopIndex >= 0 && (
                        <div
                          className="absolute inset-0 rounded-md pointer-events-none"
                          style={{
                            background:
                              "linear-gradient(180deg, rgba(255,122,45,0.12), rgba(255,122,45,0.04))",
                          }}
                        />
                      )}
                    {(overlayMode === "pos" || overlayMode === "both") &&
                      posIndex >= 0 && (
                        <div
                          className="absolute inset-0 rounded-md pointer-events-none"
                          style={{
                            background:
                              "linear-gradient(180deg, rgba(255,210,74,0.08), rgba(255,210,74,0.03))",
                          }}
                        />
                      )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Group rectangles */}
        <div className="absolute inset-0 pointer-events-none">
          {groups.map((g, i) => {
            const box = computeGroupBox(g);
            if (!box) return null;
            const label = g.minterms?.join(", ");
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.22 }}
                transition={{ duration: 0.2 }}
                style={{
                  position: "absolute",
                  left: box.left - 8,
                  top: box.top - 8,
                  width: box.width + 16,
                  height: box.height + 16,
                  borderRadius: 10,
                  border: `2px solid rgba(255,210,74,0.45)`,
                  background:
                    "linear-gradient(180deg, rgba(255,210,74,0.06), transparent)",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -18,
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "3px 8px",
                    background: "rgba(0,0,0,0.6)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "#ffd24a",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  {label}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  </div>

  {/* ========== SOP GRID ========== */}
  <div
    className="rounded-2xl p-4 text-white/40"
    style={{
      background: THEME.cardBg,
      border: `1px solid ${THEME.border}`,
    }}
  >
    <div className="flex  items-center justify-between flex-wrap gap-2">
      <div>
        <h4 className="text-sm font-semibold text-orange-200 flex items-center gap-2">
          <Camera/>
          SOP Visualization
        </h4>
        <p className="text-xs text-zinc-400">
          Highlights cells covered by simplified SOP terms.
        </p>
      </div>
      <div className="bg-black/70 border border-orange-500 text-orange-100 px-2 py-1 rounded-full text-xs">
  Terms: {sopTermCoverage.length}
</div>
    </div>

    <div className="mt-4 w-full overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 rounded-lg">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `minmax(28px,1fr) repeat(${cols}, minmax(36px,1fr))`,
          gap: 6,
        }}
      >
        <div className="h-8" />
        {Array.from({ length: cols }).map((_, c) => (
          <div
            key={c}
            className="h-8 flex items-center justify-center text-xs text-orange-200"
          >
            {colLabelString(c, colBits)}
          </div>
        ))}

        {Array.from({ length: rows }).map((_, r) => (
          <React.Fragment key={r}>
            <div className="h-10 flex items-center justify-center text-xs text-orange-200">
              {rowLabelString(r, rowBits)}
            </div>
            {Array.from({ length: cols }).map((_, c) => {
              const cell = cells.find((cc) => cc.r === r && cc.c === c);
              const m = cell?.minterm;
              const covered = sopTermCoverage.some((t) =>
                t.minterms.includes(m)
              );
              const val = cellsState[m] ?? 0;
              return (
                <div
                  key={c}
                  className={`rounded-md flex items-center justify-center font-semibold text-xs ${
                    covered ? "bg-orange-700/30" : "bg-black/20"
                  }`}
                  style={{
                    minHeight: 36,
                    border: covered
                      ? `1px solid rgba(255,122,45,0.5)`
                      : `1px solid rgba(255,255,255,0.04)`,
                  }}
                >
                  {val === -1 ? "X" : val}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>

    <div className="mt-3 text-xs text-zinc-300">
      Simplified SOP:{" "}
      <span className="font-mono text-orange-200">
        {sopResult.expression}
      </span>
    </div>
  </div>

  {/* ========== POS GRID ========== */}
  <div
    className="rounded-2xl p-4 text-white/40"
    style={{
      background: THEME.cardBg,
      border: `1px solid ${THEME.border}`,
    }}
  >
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div>
        <h4 className="text-sm font-semibold text-yellow-200 flex items-center gap-2">
          <Camera/>
          POS Visualization
        </h4>
        <p className="text-xs text-zinc-400">
          Highlights cells covered by simplified POS terms (zeros).
        </p>
      </div>
      <div className="bg-black/70 border border-orange-500 text-orange-100 px-2 py-1 rounded-full text-xs">
  Terms: {posTermCoverage.length}
</div>
    </div>

    <div className="mt-4 w-full overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 rounded-lg">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `minmax(28px,1fr) repeat(${cols}, minmax(36px,1fr))`,
          gap: 6,
        }}
      >
        <div className="h-8" />
        {Array.from({ length: cols }).map((_, c) => (
          <div
            key={c}
            className="h-8 flex items-center justify-center text-xs text-yellow-200"
          >
            {colLabelString(c, colBits)}
          </div>
        ))}

        {Array.from({ length: rows }).map((_, r) => (
          <React.Fragment key={r}>
            <div className="h-10 flex items-center justify-center text-xs text-yellow-200">
              {rowLabelString(r, rowBits)}
            </div>
            {Array.from({ length: cols }).map((_, c) => {
              const cell = cells.find((cc) => cc.r === r && cc.c === c);
              const m = cell?.minterm;
              const covered = posTermCoverage.some((t) =>
                t.minterms.includes(m)
              );
              const val = cellsState[m] ?? 0;
              return (
                <div
                  key={c}
                  className={`rounded-md flex items-center justify-center font-semibold text-xs ${
                    covered ? "bg-yellow-700/25" : "bg-black/20"
                  }`}
                  style={{
                    minHeight: 36,
                    border: covered
                      ? `1px dashed rgba(255,210,74,0.5)`
                      : `1px solid rgba(255,255,255,0.04)`,
                  }}
                >
                  {val === -1 ? "X" : val}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>

    <div className="mt-3 text-xs text-zinc-300">
      Simplified POS:{" "}
      <span className="font-mono text-yellow-200">
        {posResult.expression}
      </span>
    </div>
  </div>
</div>


          {/* Right: results and waveform */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-5">
              <Card className="w-full" style={{ background: THEME.cardBg, border: `1px solid ${THEME.border}`, boxShadow: "0 0 12px rgba(255,122,45,0.05)" }}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base sm:text-lg text-orange-400 flex items-center gap-2"><Grip/> Result & Simplification</CardTitle>
                </CardHeader>
                <CardContent className="text-sm sm:text-base space-y-4">
                  <div>
                    <div className="text-xs sm:text-sm text-orange-200 mb-2">Prime Implicants (SOP)</div>
                    <div className="space-y-2">
                      {(sopResult.primeImplicants || []).length === 0 ? (
                        <div className="text-orange-300 text-sm">No prime implicants</div>
                      ) : (
                        (sopResult.primeImplicants || []).map((p, i) => (
                          <div key={i} className="flex flex-wrap items-center justify-between bg-black/20 p-2 rounded border border-zinc-800 hover:border-[#ff7a2d]/60 transition-all">
                            <div className="font-mono text-xs text-orange-100 break-all">{p}</div>
                            {sopResult.patterns.includes(p) ? (
                              <Badge className="bg-[rgba(255,122,45,0.12)] border-[#ff7a2d] text-xs">Used</Badge>
                            ) : (
                              <Badge className="bg-zinc-800 text-xs">PI</Badge>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs sm:text-sm text-orange-200 mb-1">Simplified SOP</div>
                    <div className="p-3 rounded bg-black/40 font-semibold text-orange-100 break-words">{sopResult.expression || "0"}</div>
                  </div>

                  <div>
                    <div className="text-xs sm:text-sm text-orange-200 mb-1">Simplified POS</div>
                    <div className="p-3 rounded bg-black/40 font-semibold text-orange-100 break-words">{posResult.expression || "1"}</div>
                  </div>

                  <CopyExpressionButtons sopResult={sopResult} posResult={posResult} />

                </CardContent>
              </Card>

              <Card className="w-full" style={{ background: THEME.cardBg, border: `1px solid ${THEME.border}`, boxShadow: "0 0 12px rgba(255,210,74,0.05)" }}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 sm:text-lg text-orange-400"><AudioWaveform/> Waveform & Legend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs sm:text-sm text-orange-200 mb-2"> Waveform (SOP)</div>
                  <div className="h-36 sm:h-40 md:h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={waveform}>
                        <CartesianGrid stroke={THEME.subtle} />
                        <XAxis dataKey="t" hide />
                        <YAxis domain={[0, 1]} />
                        <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #333",color:"#fff",borderRadius:"10px" }} />
                        <Line isAnimationActive={false} type="stepAfter" dataKey="v" stroke={THEME.accent} dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-4 text-xs sm:text-sm text-orange-200">Overlays</div>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ background: THEME.accent }} /> SOP</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm border-2" style={{ borderColor: THEME.accent2 }} /> POS</div>
                  </div>

                
                </CardContent>
              </Card>

            <Card
  className="w-full"
  style={{
    background: THEME.cardBg,
    border: `1px solid ${THEME.border}`,
    boxShadow: "0 0 12px rgba(255,165,0,0.08)",
  }}
>
  <CardHeader className="pb-2">
    <CardTitle className="text-base sm:text-lg text-orange-400 flex items-center gap-2">
     <PanelLeftRightDashed/>
      Guidance
    </CardTitle>
  </CardHeader>

  <CardContent className="text-sm sm:text-base text-gray-200 space-y-2 leading-relaxed">
    <p>
      • Tap or click on K-map cells to toggle{" "}
      <span className="font-semibold text-orange-100">0 → 1 → X → 0</span>.
    </p>
    <p>
      • Enter minterms as comma-separated or range values (e.g.{" "}
      <code className="bg-zinc-800 px-1 rounded">1,3,5-7</code>).
    </p>
    <p>
      • Quine–McCluskey simplification supports up to{" "}
      <span className="text-orange-100 font-semibold">5 variables</span>.
    </p>
    <p>
      • Toggle overlays to view SOP and POS term coverage directly on the grid.
    </p>
  </CardContent>
</Card>

            </div>
          </div>
        </div>

        {/* SOP/POS detail panels */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
    <Card
  style={{
    background: "linear-gradient(180deg, rgba(10,10,10,0.95) 0%, rgba(15,15,15,0.9) 100%)",
    border: "1px solid rgba(255,180,80,0.15)",
    boxShadow: "0 0 10px rgba(255,180,80,0.08)",
  }}
  className="transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10"
>
  <CardHeader>
    <CardTitle className="flex items-center gap-2 text-orange-400 text-base sm:text-lg">
      SOP — Terms & Covered Minterms
    </CardTitle>
  </CardHeader>

  <CardContent>
    <div className="space-y-3">
      {(!sopResult.patterns || sopResult.patterns.length === 0) ? (
        <div className="text-orange-300 text-sm italic tracking-wide">
          No terms (function = 0)
        </div>
      ) : (
        sopResult.patterns.map((pat, idx) => {
          const coverage = sopTermCoverage?.find((x) => x.pattern === pat);
          const coveredMinterms = Array.isArray(coverage?.minterms)
            ? coverage.minterms.join(", ")
            : "";

          return (
            <div
              key={idx}
              className="p-3 rounded-lg border border-zinc-800/80 bg-gradient-to-br from-zinc-950/70 to-zinc-900/70
                         hover:from-zinc-900/60 hover:to-zinc-800/60 transition-colors duration-200 shadow-inner shadow-black/40"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="font-mono text-xs text-orange-300 tracking-tight">
                    {pat}
                  </div>
                  <div className="text-sm mt-1 font-semibold text-orange-100">
                    {patternToSOPterm(pat, sopResult.varNames)}
                  </div>
                </div>

                <div className="text-sm font-mono text-zinc-300 bg-black/40 border border-zinc-800/70 rounded-md px-3 py-1">
                  <span className="text-orange-400 font-semibold">covers:</span>{" "}
                  <span className="text-orange-200">{coveredMinterms || "—"}</span>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  </CardContent>
</Card>


         <Card
  style={{
    background: "linear-gradient(180deg, rgba(10,10,10,0.95) 0%, rgba(15,15,15,0.9) 100%)",
    border: "1px solid rgba(255,180,80,0.15)",
    boxShadow: "0 0 10px rgba(255,180,80,0.08)",
  }}
  className="transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10"
>
  <CardHeader>
    <CardTitle className="flex items-center gap-2 text-orange-400 text-base sm:text-lg">
      POS — Clauses & Covered Maxterms
    </CardTitle>
  </CardHeader>

  <CardContent>
    <div className="space-y-3">
      {(!posResult.patterns || posResult.patterns.length === 0) ? (
        <div className="text-orange-300 text-sm italic tracking-wide">
          No POS clauses (function = 1)
        </div>
      ) : (
        posResult.patterns.map((pat, idx) => {
          const coverage = posTermCoverage?.find((x) => x.pattern === pat);
          const coveredMinterms = Array.isArray(coverage?.minterms)
            ? coverage.minterms.join(", ")
            : "";

          return (
            <div
              key={idx}
              className="p-3 rounded-lg border border-zinc-800/80 bg-gradient-to-br from-zinc-950/70 to-zinc-900/70
                         hover:from-zinc-900/60 hover:to-zinc-800/60 transition-colors duration-200 shadow-inner shadow-black/40"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="font-mono text-xs text-orange-300 tracking-tight">
                    {pat}
                  </div>
                  <div className="text-sm mt-1 font-semibold text-orange-100">
                    {patternToPOSclause(pat, posResult.varNames)}
                  </div>
                </div>

                <div className="text-sm font-mono text-zinc-300 bg-black/40 border border-zinc-800/70 rounded-md px-3 py-1">
                  <span className="text-orange-400 font-semibold">covers:</span>{" "}
                  <span className="text-orange-200">{coveredMinterms || "—"}</span>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  </CardContent>
</Card>

        </div>
      </main>

      <Footer />
    </div>
  );
}
