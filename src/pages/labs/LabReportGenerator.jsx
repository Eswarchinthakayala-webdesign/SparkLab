// src/pages/LabReportGenerator.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Toaster, toast } from "sonner";
import axios from "axios";
import { saveAs } from "file-saver";

import {
  Zap,
  Download,
  Upload,
  Play,
  Pause,
  Trash2,
  Plus,
  Settings,
  Database,
  ImageIcon,
} from "lucide-react";

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableRow, TableCell } from "@/components/ui/table"; // optional

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";

/* ===========================
   Templates & Helpers
   =========================== */
const TEMPLATES = {
  "ohms-law": {
    title: "Verification of Ohm's Law",
    objective: "To verify Ohm's law and determine the resistance of a given resistor.",
    apparatus: "Ammeter, Voltmeter, Resistor, Rheostat, Connecting Wires, DC Supply.",
    procedure:
      "1. Connect the circuit as shown.\n2. Vary the voltage and record corresponding current readings.\n3. Plot V vs I and compute slope = R.",
  },
  "kcl-kvl": {
    title: "KCL & KVL Verification",
    objective: "Verify Kirchhoff's Current and Voltage Laws on the given network.",
    apparatus: "Resistors, DC Supply, Ammeter, Voltmeter, Connecting Wires.",
    procedure: "Follow standard nodal and loop measurement procedures.",
  },
  "power-energy": {
    title: "Measurement of Power and Energy",
    objective: "Measure instantaneous power and compute energy consumption over time.",
    apparatus: "Voltmeter, Ammeter, Wattmeter, Stopwatch, Load resistor.",
    procedure: "Record voltage and current vs time and integrate power to get energy.",
  },
  // ... add other templates (diode, zener, rectifier) similarly
};

const defaultObservationRow = (idx) => ({ t: idx + 1, V: 0, I: 0, remark: "" });

/* ===========================
   Interactive circuit editor (simple)
   - user uploads image; can place labels/icons onto the image by clicking.
   - placements stored as relative percentages for persistence.
   =========================== */
function CircuitEditor({ imageBase64, onImageChange, placements, setPlacements }) {
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  const handleImageUpload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const data = await f.arrayBuffer();
    const base64 = `data:${f.type};base64,${Buffer.from(data).toString("base64")}`;
    onImageChange(base64);
    toast.success("Circuit image uploaded");
  };

  const handleClickPlace = (ev) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    const newPlace = { id: Date.now(), x, y, type: "meter", label: "A" };
    setPlacements((p) => [...p, newPlace]);
  };

  const startDrag = (id, ev) => {
    ev.preventDefault();
    const onMove = (me) => {
      const rect = imgRef.current.getBoundingClientRect();
      const x = (me.clientX - rect.left) / rect.width;
      const y = (me.clientY - rect.top) / rect.height;
      setPlacements((prev) => prev.map((pl) => (pl.id === id ? { ...pl, x: Math.min(0.98, Math.max(0.02, x)), y: Math.min(0.98, Math.max(0.02, y)) } : pl)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <Card className="bg-black/75 border border-zinc-800 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-[#ffd24a]">Circuit Editor</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 mb-3">
          <label className="flex items-center gap-2 cursor-pointer bg-zinc-900 px-3 py-2 rounded-md border border-zinc-800">
            <Upload className="w-4 h-4 text-[#ffd24a]" /> Upload Circuit
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
          <Button variant="ghost" onClick={() => setPlacements([])} className="border border-zinc-800">Clear Placements</Button>
          <Button onClick={() => toast.info("Click on the image to add a meter/label")}>Place Meter</Button>
        </div>

        <div
          ref={containerRef}
          className="w-full rounded-md bg-[#05060a] border border-zinc-800 p-2 relative overflow-hidden"
          style={{ minHeight: 240 }}
        >
          {!imageBase64 ? (
            <div className="h-48 flex items-center justify-center text-zinc-500">No circuit image. Upload to begin.</div>
          ) : (
            <div className="relative w-full h-full" onClick={handleClickPlace}>
              <img ref={imgRef} src={imageBase64} alt="circuit" className="w-full h-auto max-h-[520px] mx-auto block" style={{ display: "block", margin: "0 auto" }} />
              {/* placements */}
              {placements.map((p) => (
                <div
                  key={p.id}
                  onMouseDown={(e) => startDrag(p.id, e)}
                  style={{
                    position: "absolute",
                    left: `${p.x * 100}%`,
                    top: `${p.y * 100}%`,
                    transform: "translate(-50%,-50%)",
                    cursor: "grab",
                    userSelect: "none",
                  }}
                >
                  <div className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black p-1 rounded-full w-8 h-8 flex items-center justify-center shadow">
                    {p.type === "meter" ? "M" : "L"}
                  </div>
                  <div className="text-xs text-zinc-300 mt-1 text-center">{p.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ===========================
   Observation table + live chart
   =========================== */
function ObservationsEditor({ observations, setObservations, onAddRow, onRemoveRow }) {
  const updateCell = (idx, key, val) => {
    setObservations((o) => o.map((r, i) => (i === idx ? { ...r, [key]: val } : r)));
  };

  const csvExport = () => {
    const rows = [["t", "V", "I", "remark"], ...observations.map((r) => [r.t, r.V, r.I, r.remark])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    saveAs(blob, `observations-${Date.now()}.csv`);
    toast.success("CSV exported");
  };

  return (
    <Card className="bg-black/75 border border-zinc-800 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-[#ffd24a]">Observations</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-zinc-400 text-xs">
                <tr>
                  <th className="text-left">t</th>
                  <th>Voltage (V)</th>
                  <th>Current (A)</th>
                  <th>Remarks</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {observations.map((r, i) => (
                  <tr key={i} className="border-t border-zinc-800">
                    <td className="py-2">{r.t}</td>
                    <td><Input value={r.V} onChange={(e) => updateCell(i, "V", Number(e.target.value))} type="number" /></td>
                    <td><Input value={r.I} onChange={(e) => updateCell(i, "I", Number(e.target.value))} type="number" /></td>
                    <td><Input value={r.remark} onChange={(e) => updateCell(i, "remark", e.target.value)} /></td>
                    <td><Button variant="ghost" onClick={() => onRemoveRow(i)}><Trash2 className="w-4 h-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <Button onClick={onAddRow} className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black"><Plus className="w-4 h-4 mr-2" /> Add Row</Button>
            <Button variant="ghost" onClick={csvExport}>Export CSV</Button>
          </div>

          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={observations}>
                <CartesianGrid stroke="#111" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={{ fill: "#bdbdbd" }} />
                <YAxis tick={{ fill: "#bdbdbd" }} />
                <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff" }} />
                <Legend wrapperStyle={{ color: "#aaa" }} />
                <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={{ r: 3 }} name="Voltage (V)" />
                <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={{ r: 3 }} name="Current (A)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ===========================
   Main page component
   =========================== */
export default function LabReportGenerator() {
  // general metadata
  const [templateKey, setTemplateKey] = useState("ohms-law");
  const [title, setTitle] = useState(TEMPLATES["ohms-law"].title);
  const [objective, setObjective] = useState(TEMPLATES["ohms-law"].objective);
  const [apparatus, setApparatus] = useState(TEMPLATES["ohms-law"].apparatus);
  const [procedure, setProcedure] = useState(TEMPLATES["ohms-law"].procedure);
  const [college, setCollege] = useState("Your College Name");
  const [author, setAuthor] = useState("");
  const [roll, setRoll] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString());

  // observations
  const [observations, setObservations] = useState(Array.from({ length: 10 }).map((_, i) => defaultObservationRow(i)));
  const addObservationRow = () => setObservations((s) => [...s, defaultObservationRow(s.length)]);
  const removeObservationRow = (i) => setObservations((s) => s.filter((_, idx) => idx !== i));

  // circuit editor
  const [circuitImageBase64, setCircuitImageBase64] = useState(null);
  const [placements, setPlacements] = useState([]);

  // visualizer simulation flags
  const [running, setRunning] = useState(true);

  // derived chart SVG: we'll render Recharts to an exported SVG string via ref
  const chartRef = useRef(null);

  // simple auto-calculation: slope = dV/dI for ohm's law using least-squares linear fit (V vs I)
  const calculations = useMemo(() => {
    // compute slope and intercept using least squares
    const pts = observations.filter((r) => Number.isFinite(Number(r.V)) && Number.isFinite(Number(r.I)));
    if (pts.length < 2) return "Not enough points for calculation.";
    const n = pts.length;
    const sumX = pts.reduce((a, b) => a + Number(b.I), 0);
    const sumY = pts.reduce((a, b) => a + Number(b.V), 0);
    const sumXY = pts.reduce((a, b) => a + Number(b.I) * Number(b.V), 0);
    const sumXX = pts.reduce((a, b) => a + Number(b.I) * Number(b.I), 0);
    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-12) return "Points are degenerate; cannot compute slope.";
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const R = slope !== 0 ? slope : NaN;
    return `Slope (R) = ${R.toFixed(6)} Ω\nIntercept = ${intercept.toFixed(6)}\nUsing ${n} points.`;
  }, [observations]);

  // create an SVG string of the chart by rendering Recharts off-screen using a DOM node -> we will extract outerHTML
  const chartContainerRef = useRef(null);
  useEffect(() => {
    // update title when template changes
  }, []);

  // Save/Load project (localStorage)
  const saveProject = () => {
    const payload = { title, objective, apparatus, procedure, college, author, roll, date, observations, placements, circuitImageBase64, templateKey };
    localStorage.setItem("lab_project", JSON.stringify(payload));
    toast.success("Project saved locally");
  };
  const loadProject = () => {
    const raw = localStorage.getItem("lab_project");
    if (!raw) {
      toast.error("No saved project");
      return;
    }
    const p = JSON.parse(raw);
    setTitle(p.title || "");
    setObjective(p.objective || "");
    setApparatus(p.apparatus || "");
    setProcedure(p.procedure || "");
    setCollege(p.college || "");
    setAuthor(p.author || "");
    setRoll(p.roll || "");
    setDate(p.date || new Date().toLocaleDateString());
    setObservations(p.observations || []);
    setPlacements(p.placements || []);
    setCircuitImageBase64(p.circuitImageBase64 || null);
    toast.success("Project loaded");
  };

  // generate chartSVG: we render the Recharts chart in a hidden container and read its SVG
  const getChartSVG = async () => {
    // Recharts renders SVG inside the DOM. We'll snapshot the chart container innerHTML.
    // In some setups Recharts might render canvas; for LineChart it renders SVG.
    const el = document.querySelector("#lab-chart svg");
    if (!el) {
      return null;
    }
    // ensure icons/foreign objects are removed: we simply serialize the SVG node
    const svg = el.outerHTML;
    return svg;
  };

  // Generate PDF by posting payload to backend
  const generatePDF = async () => {
    try {
      toast.loading("Preparing chart & images...");
      const chartSVG = await getChartSVG();
      toast.dismiss();

      // minimal validation
      if (!author || !college) {
        toast.error("Please enter student and college info.");
        return;
      }

      const payload = {
        title,
        author,
        college,
        roll,
        date,
        template: templateKey,
        objective,
        apparatus,
        procedure,
        observations,
        circuitImageBase64,
        chartSVG,
        calculations,
        conclusion: "Auto-generated conclusion placeholder.",
        result: "Auto-generated result placeholder.",
      };

      toast.loading("Generating PDF on server...");
      const resp = await axios.post("http://localhost:4000/api/generate-report", payload, { responseType: "blob", headers: { "Content-Type": "application/json" } });
      toast.dismiss();
      const blob = new Blob([resp.data], { type: "application/pdf" });
      saveAs(blob, `${(title || "lab-report").replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF generated and downloaded");
    } catch (err) {
      console.error(err);
      toast.error("PDF generation failed. Check server is running.");
    }
  };

  // when template changes, populate fields
  useEffect(() => {
    const t = TEMPLATES[templateKey];
    if (t) {
      setTitle(t.title);
      setObjective(t.objective);
      setApparatus(t.apparatus);
      setProcedure(t.procedure);
    }
  }, [templateKey]);

  // small live animation toggles and keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === " ") {
        setRunning((r) => !r);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-[#05060a] bg-[radial-gradient(circle,_rgba(255,122,28,0.14)_1px,transparent_1px)] bg-[length:18px_18px] text-white p-6">
      <Toaster position="top-center" richColors />

      {/* header */}
      <header className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow">
              <Zap className="w-6 h-6 text-black" />
            </div>
            <div>
              <div className="text-lg font-semibold">BEEE — Lab Report Generator</div>
              <div className="text-xs text-zinc-400">Export professional PDFs with charts, circuit diagrams & calculations</div>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <Badge className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1">Theme: Orange / Dark</Badge>
            <Button onClick={saveProject} className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black"><Database className="w-4 h-4 mr-2" /> Save</Button>
            <Button variant="ghost" onClick={loadProject}>Load</Button>
            <Button onClick={generatePDF} className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black"><Download className="w-4 h-4 mr-2" /> Generate PDF</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* left column: controls */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="bg-black/75 border border-zinc-800 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-[#ffd24a]">Report Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400">Select Template</label>
                  <Select value={templateKey} onValueChange={(v) => setTemplateKey(v)}>
                    <SelectTrigger className="w-full bg-zinc-900 border border-zinc-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ohms-law">Verification of Ohm's Law</SelectItem>
                      <SelectItem value="kcl-kvl">KCL & KVL</SelectItem>
                      <SelectItem value="power-energy">Power & Energy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-zinc-400">Title</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>

                <div>
                  <label className="text-xs text-zinc-400">College</label>
                  <Input value={college} onChange={(e) => setCollege(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-zinc-400">Student</label>
                    <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400">Roll</label>
                    <Input value={roll} onChange={(e) => setRoll(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-zinc-400">Date</label>
                  <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" />
                </div>

                <div>
                  <label className="text-xs text-zinc-400">Objective</label>
                  <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={3} />
                </div>

                <div>
                  <label className="text-xs text-zinc-400">Apparatus</label>
                  <Textarea value={apparatus} onChange={(e) => setApparatus(e.target.value)} rows={2} />
                </div>

                <div>
                  <label className="text-xs text-zinc-400">Procedure</label>
                  <Textarea value={procedure} onChange={(e) => setProcedure(e.target.value)} rows={4} />
                </div>

                <div className="flex gap-2">
                  <Button onClick={() => { setObservations(Array.from({ length: 10 }).map((_, i) => defaultObservationRow(i))); toast.success("Default observations inserted"); }} variant="ghost">Insert default table</Button>
                  <Button onClick={() => { setObservations([]); toast.success("Cleared observations"); }} variant="destructive">Clear table</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <CircuitEditor
            imageBase64={circuitImageBase64}
            onImageChange={(b64) => setCircuitImageBase64(b64)}
            placements={placements}
            setPlacements={setPlacements}
          />
        </div>

        {/* right column: visualizer & observations */}
        <div className="lg:col-span-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ObservationsEditor observations={observations} setObservations={setObservations} onAddRow={addObservationRow} onRemoveRow={removeObservationRow} />

            <Card className="bg-black/75 border border-zinc-800 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-[#ffd24a]">Visualizer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm text-zinc-300">Real-time circuit visualizer</div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setRunning((r) => !r)}>{running ? <><Pause/> Pause</> : <><Play/> Run</>}</Button>
                    <Button onClick={() => toast.success("Oscilloscope snapshot saved")}>Snapshot</Button>
                  </div>
                </div>

                {/* simple oscilloscope: where V and I create waveforms animated (using observations as samples) */}
                <div className="rounded-md p-2 bg-[#060606] border border-zinc-800">
                  <div id="lab-chart" style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={observations}>
                        <CartesianGrid stroke="#111" strokeDasharray="3 3" />
                        <XAxis dataKey="t" tick={{ fill: "#bdbdbd" }} />
                        <YAxis tick={{ fill: "#bdbdbd" }} />
                        <ReTooltip contentStyle={{ background: "#0b0b0b", border: "1px solid #222", color: "#fff" }} />
                        <Legend wrapperStyle={{ color: "#aaa" }} />
                        <Line type="monotone" dataKey="V" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} name="Voltage (V)" />
                        <Line type="monotone" dataKey="I" stroke="#00ffbf" strokeWidth={2} dot={false} isAnimationActive={false} name="Current (A)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* small summary cards */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-md text-center">
                    <div className="text-xs text-zinc-400">Calculated R</div>
                    <div className="text-lg text-[#ff9a4a] font-semibold">{calculations.split("\n")[0]?.replace("Slope (R) = ", "") || "—"}</div>
                  </div>
                  <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-md text-center">
                    <div className="text-xs text-zinc-400">Points</div>
                    <div className="text-lg text-[#00ffbf] font-semibold">{observations.length}</div>
                  </div>
                  <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-md text-center">
                    <div className="text-xs text-zinc-400">Result</div>
                    <div className="text-lg text-[#ffd24a] font-semibold">Auto</div>
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>

          <Card className="bg-black/75 border border-zinc-800 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-[#ffd24a]">Calculations & Conclusion</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Textarea value={calculations} readOnly rows={8} />
                <Textarea placeholder="Write your conclusion..." rows={8} />
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
}
