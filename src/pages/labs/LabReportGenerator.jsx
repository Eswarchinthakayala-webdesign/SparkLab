// src/pages/LabReportGenerator.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import axios from "axios";
import { saveAs } from "file-saver";
import { Zap, Download, Menu, X } from "lucide-react";
import LabReportData from "@/components/LabReportData";
import LabReportTable from "@/components/LabReportTable";
import LabReportVisualizer from "@/components/LabReportVisualizer";
import LabReportControl from "@/components/LabReportControl";
import LabReportSections from "@/components/LabReportSections";

import { Button } from "@/components/ui/button";
import * as htmlToImage from "html-to-image";
import { motion } from "framer-motion";

const defaultRow = (i) => ({
  id: String(Date.now()) + "-" + i,
  t: i + 1,
  V: "",
  I: "",
  remark: "",
});

const DEFAULT_EXPERIMENTS = [
  // 1. Ohm’s Law
  {
    titleID: "ohm-01",
    title: "Verification of Ohm's Law",
    defaultData: {
      observations: Array.from({ length: 6 }).map((_, i) => defaultRow(i)),
      objective: "To verify Ohm’s Law by plotting a graph between voltage (V) and current (I).",
      apparatus: "Ammeter, Voltmeter, Resistor, Power Supply, Connecting Wires, Breadboard",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 2. Kirchhoff’s Laws
  {
    titleID: "kirchhoff-01",
    title: "Verification of Kirchhoff's Laws",
    defaultData: {
      observations: Array.from({ length: 4 }).map((_, i) => defaultRow(i)),
      objective: "To verify Kirchhoff’s Current Law (KCL) and Kirchhoff’s Voltage Law (KVL).",
      apparatus: "Resistors, DC Power Supply, Ammeter, Voltmeter, Breadboard, Connecting Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 3. Series and Parallel Resistors
  {
    titleID: "resistor-01",
    title: "Verification of Series and Parallel Resistor Connections",
    defaultData: {
      observations: Array.from({ length: 5 }).map((_, i) => defaultRow(i)),
      objective: "To verify the equivalent resistance for resistors connected in series and parallel.",
      apparatus: "Resistors, DC Power Supply, Ammeter, Voltmeter, Breadboard, Connecting Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 4. Measurement of Power and Power Factor in AC Circuit
  {
    titleID: "acpower-01",
    title: "Measurement of Power and Power Factor in a Single Phase AC Circuit",
    defaultData: {
      observations: Array.from({ length: 6 }).map((_, i) => defaultRow(i)),
      objective: "To measure the power and power factor of a single-phase AC circuit containing inductive load.",
      apparatus: "Single Phase Supply, Wattmeter, Voltmeter, Ammeter, Inductive Load, Connecting Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 5. Verification of Thevenin’s Theorem
  {
    titleID: "thevenin-01",
    title: "Verification of Thevenin’s Theorem",
    defaultData: {
      observations: Array.from({ length: 5 }).map((_, i) => defaultRow(i)),
      objective: "To verify Thevenin’s theorem for a given electrical circuit.",
      apparatus: "Resistors, DC Power Supply, Ammeter, Voltmeter, Breadboard, Connecting Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 6. Verification of Norton’s Theorem
  {
    titleID: "norton-01",
    title: "Verification of Norton’s Theorem",
    defaultData: {
      observations: Array.from({ length: 5 }).map((_, i) => defaultRow(i)),
      objective: "To verify Norton’s theorem for a given electrical network.",
      apparatus: "Resistors, DC Source, Ammeter, Voltmeter, Breadboard, Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 7. Verification of Superposition Theorem
  {
    titleID: "superposition-01",
    title: "Verification of Superposition Theorem",
    defaultData: {
      observations: Array.from({ length: 5 }).map((_, i) => defaultRow(i)),
      objective: "To verify the superposition theorem in a linear circuit with multiple sources.",
      apparatus: "DC Power Supplies, Resistors, Ammeter, Voltmeter, Breadboard, Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 8. Verification of Maximum Power Transfer Theorem
  {
    titleID: "maxpower-01",
    title: "Verification of Maximum Power Transfer Theorem",
    defaultData: {
      observations: Array.from({ length: 5 }).map((_, i) => defaultRow(i)),
      objective: "To verify the condition for maximum power transfer from source to load.",
      apparatus: "DC Source, Resistors, Ammeter, Voltmeter, Breadboard, Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 9. Measurement of Current and Voltage in R-L-C Series Circuit
  {
    titleID: "rlcseries-01",
    title: "Study of R-L-C Series Circuit and Measurement of Power Factor",
    defaultData: {
      observations: Array.from({ length: 6 }).map((_, i) => defaultRow(i)),
      objective: "To study the behavior of R-L-C series circuit and determine its power factor.",
      apparatus: "AC Supply, Resistor, Inductor, Capacitor, Ammeter, Voltmeter, Wattmeter",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 10. Measurement of Energy using Energy Meter
  {
    titleID: "energymeter-01",
    title: "Measurement of Energy using Energy Meter",
    defaultData: {
      observations: Array.from({ length: 4 }).map((_, i) => defaultRow(i)),
      objective: "To measure electrical energy consumption using a single-phase energy meter.",
      apparatus: "Energy Meter, Load, Voltmeter, Ammeter, Connecting Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 11. Verification of Resonance in RLC Series Circuit
  {
    titleID: "resonance-01",
    title: "Verification of Resonance in RLC Series Circuit",
    defaultData: {
      observations: Array.from({ length: 6 }).map((_, i) => defaultRow(i)),
      objective: "To verify resonance condition in an RLC series circuit and determine resonant frequency.",
      apparatus: "AC Source, R, L, C Components, Ammeter, Voltmeter",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 12. Half-Wave Rectifier
  {
    titleID: "rectifier-half-01",
    title: "Study of Half-Wave Rectifier",
    defaultData: {
      observations: Array.from({ length: 5 }).map((_, i) => defaultRow(i)),
      objective: "To study the working of a half-wave rectifier and observe input/output waveforms.",
      apparatus: "Diode, Transformer, Resistor, Oscilloscope, Breadboard, Connecting Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 13. Full-Wave Rectifier
  {
    titleID: "rectifier-full-01",
    title: "Study of Full-Wave Rectifier",
    defaultData: {
      observations: Array.from({ length: 5 }).map((_, i) => defaultRow(i)),
      objective: "To study the working of a full-wave rectifier and observe input/output waveforms.",
      apparatus: "Diodes, Transformer, Resistor, Oscilloscope, Breadboard, Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 14. Bridge Rectifier
  {
    titleID: "rectifier-bridge-01",
    title: "Study of Bridge Rectifier",
    defaultData: {
      observations: Array.from({ length: 5 }).map((_, i) => defaultRow(i)),
      objective: "To construct a bridge rectifier and study its output characteristics.",
      apparatus: "4 Diodes, Transformer, Resistor, Breadboard, CRO, Connecting Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 15. Zener Diode as Voltage Regulator
  {
    titleID: "zener-01",
    title: "Study of Zener Diode as Voltage Regulator",
    defaultData: {
      observations: Array.from({ length: 5 }).map((_, i) => defaultRow(i)),
      objective: "To study the regulation characteristics of a Zener diode voltage regulator.",
      apparatus: "Zener Diode, Resistor, DC Supply, Voltmeter, Ammeter, Breadboard",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 16. Transistor CE Characteristics
  {
    titleID: "transistor-ce-01",
    title: "Study of Transistor CE Characteristics",
    defaultData: {
      observations: Array.from({ length: 6 }).map((_, i) => defaultRow(i)),
      objective: "To study input and output characteristics of an NPN transistor in CE configuration.",
      apparatus: "Transistor, DC Supply, Resistors, Ammeter, Voltmeter, Breadboard",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 17. LED Characteristics
  {
    titleID: "led-01",
    title: "Study of LED Characteristics",
    defaultData: {
      observations: Array.from({ length: 5 }).map((_, i) => defaultRow(i)),
      objective: "To study the forward and reverse characteristics of an LED.",
      apparatus: "LED, Resistor, DC Supply, Ammeter, Voltmeter, Breadboard",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 18. PN Junction Diode Characteristics
  {
    titleID: "pn-junction-01",
    title: "Study of PN Junction Diode Characteristics",
    defaultData: {
      observations: Array.from({ length: 5 }).map((_, i) => defaultRow(i)),
      objective: "To study the V-I characteristics of a PN junction diode in forward and reverse bias.",
      apparatus: "PN Diode, Resistor, DC Source, Ammeter, Voltmeter, Breadboard",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 19. Transformer Open Circuit and Short Circuit Tests
  {
    titleID: "transformer-ocsc-01",
    title: "Transformer Open Circuit and Short Circuit Tests",
    defaultData: {
      observations: Array.from({ length: 6 }).map((_, i) => defaultRow(i)),
      objective: "To perform open circuit and short circuit tests on a single-phase transformer to determine its parameters.",
      apparatus: "Transformer, Ammeter, Voltmeter, Wattmeter, Variac, Connecting Wires",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },

  // 20. Measurement of Three-Phase Power by Two Wattmeter Method
  {
    titleID: "threephase-01",
    title: "Measurement of Three-Phase Power by Two Wattmeter Method",
    defaultData: {
      observations: Array.from({ length: 6 }).map((_, i) => defaultRow(i)),
      objective: "To measure power in a three-phase circuit using two-wattmeter method.",
      apparatus: "Three Phase Supply, Wattmeters, Ammeter, Voltmeter, Inductive Load",
      description: "",
      procedure: "",
      conclusion: "",
    },
  },
];


export default function LabReportGenerator() {
  const [experiments] = useState(DEFAULT_EXPERIMENTS);
  const [selectedTitleID, setSelectedTitleID] = useState(experiments[0]?.titleID ?? null);

  const [title, setTitle] = useState(experiments[0]?.title ?? "Experiment");
  const [author, setAuthor] = useState("");
  const [college, setCollege] = useState("Your College Name");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [objective, setObjective] = useState(experiments[0]?.defaultData?.objective ?? "");
  const [apparatus, setApparatus] = useState(experiments[0]?.defaultData?.apparatus ?? "");
  const [description, setDescription] = useState("");
  const [procedure, setProcedure] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [observations, setObservations] = useState(
    experiments[0]?.defaultData?.observations ?? Array.from({ length: 6 }).map((_, i) => defaultRow(i))
  );

  const [circuitImageBase64, setCircuitImageBase64] = useState(null);
  const chartId = "lab-chart";

  useEffect(() => {
    const exp = experiments.find((e) => e.titleID === selectedTitleID);
    if (exp) {
      setTitle(exp.title ?? title);
      if (exp.defaultData) {
        setObservations(exp.defaultData.observations ?? []);
        setObjective(exp.defaultData.objective ?? "");
        setApparatus(exp.defaultData.apparatus ?? "");
        setDescription(exp.defaultData.description ?? "");
        setProcedure(exp.defaultData.procedure ?? "");
        setConclusion(exp.defaultData.conclusion ?? "");
      }
    }
  }, [selectedTitleID, experiments]);

  const calculations = useMemo(() => {
    const pts = observations
      .map((r) => ({ V: parseFloat(r.V), I: parseFloat(r.I) }))
      .filter((p) => Number.isFinite(p.V) && Number.isFinite(p.I));
    if (pts.length < 2) return { ok: false, reason: "Not enough data points" };

    const n = pts.length;
    const sumX = pts.reduce((a, b) => a + b.I, 0);
    const sumY = pts.reduce((a, b) => a + b.V, 0);
    const sumXY = pts.reduce((a, b) => a + b.I * b.V, 0);
    const sumXX = pts.reduce((a, b) => a + b.I * b.I, 0);
    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-12) return { ok: false, reason: "Invalid points" };

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { ok: true, slope, intercept, n };
  }, [observations]);

  const chartData = observations.map((r) => ({
    t: r.t,
    V: parseFloat(r.V) || 0,
    I: parseFloat(r.I) || 0,
  }));

  const captureChartAsImage = async (id = chartId) => {
    const chartNode = document.getElementById(id);
    if (!chartNode) {
      toast.warning("Chart not found!");
      return null;
    }
    try {
      await new Promise((r) => setTimeout(r, 300));
      const dataUrl = await htmlToImage.toPng(chartNode, {
        backgroundColor: "#05060a",
        pixelRatio: 2,
        quality: 1,
      });
      return dataUrl;
    } catch (err) {
      console.error("chart capture failed", err);
      toast.error("Chart capture failed");
      return null;
    }
  };

  const generatePDF = async () => {
    if (!author || !college) {
      toast.error("Please enter student name and college");
      return;
    }

    const chartImageBase64 = await captureChartAsImage();
    if (!chartImageBase64)
      toast.warning("Chart not captured, will be skipped in PDF.");

    const payload = {
      title,
      titleID: selectedTitleID,
      author,
      college,
      date,
      observations,
      chartImageBase64, // PNG base64
      circuitImageBase64,
      calculations,
      objective,
      apparatus,
      description,
      procedure,
      conclusion,
    };

    const base = "https://sparklab-beee.vercel.app"; // ✅ fixed (no trailing slash)

    try {
      toast.loading("Generating PDF...");
      const resp = await axios.post(`${base}/api/generate-report`, payload, {
        headers: { "Content-Type": "application/json" },
        responseType: "blob",
        timeout: 60000,
      });
      toast.dismiss();
      const blob = new Blob([resp.data], { type: "application/pdf" });
      saveAs(blob, `${title.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF downloaded successfully!");
    } catch (err) {
      console.error("PDF generation error", err);
      toast.error("PDF generation failed. Check server connection.");
    }
  };

  return (
    <div className="min-h-screen bg-[#05060a] p-4 text-white">
      <Toaster position="top-center" />
<header
      className={`fixed top-0 w-full z-50 transition-all px-2 duration-300 ${
        scrolled
          ? "backdrop-blur-md bg-black/70 border-b border-zinc-800 shadow-lg shadow-black/30"
          : "backdrop-blur-sm bg-black/50 border-b border-zinc-900"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Left: Logo and Title */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow-md shadow-[#ff7a2d]/30">
              <Zap className="w-5 h-5 text-black" />
            </div>
            <div className="leading-tight">
              <h1 className="text-sm sm:text-base font-semibold text-white">
               SparkLab
              </h1>
              <p className="text-[11px] sm:text-xs text-zinc-400">
                Lab Report Generator
              </p>
            </div>
          </motion.div>

          {/* Right: Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                onClick={generatePDF}
                className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black text-sm cursor-pointer font-medium px-4 py-2 shadow-lg shadow-[#ff7a2d]/20 hover:from-[#ff9540] hover:to-[#ffe47a] transition-all"
              >
                <Download className="w-4 h-4 mr-2" />
                Generate PDF
              </Button>
            </motion.div>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              className="border border-zinc-800 text-orange-400 hover:text-orange-500 p-2 cursor-pointer hover:bg-zinc-800/50"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div
          className={`md:hidden transition-all duration-300 overflow-hidden ${
            mobileOpen ? "max-h-32 py-3" : "max-h-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Button
              onClick={generatePDF}
              className="w-full bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] cursor-pointer text-black text-sm font-medium py-2 shadow-lg shadow-[#ff7a2d]/20 hover:from-[#ff9540] hover:to-[#ffe47a] transition-all"
            >
              <Download className="w-4 h-4 mr-2" />
              Generate PDF
            </Button>
          </div>
        </div>
      </div>
    </header>

      <main className="max-w-7xl mt-20 mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-4 space-y-4">
          <LabReportData
            experiments={experiments}
            selectedTitleID={selectedTitleID}
            onSelect={setSelectedTitleID}
          />
          <LabReportControl
            title={title}
            setTitle={setTitle}
            author={author}
            setAuthor={setAuthor}
            college={college}
            setCollege={setCollege}
            date={date}
            setDate={setDate}
            circuitImageBase64={circuitImageBase64}
            setCircuitImageBase64={setCircuitImageBase64}
            onGeneratePDF={generatePDF}
          />
        </section>

        <section className="lg:col-span-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LabReportTable
              observations={observations}
              setObservations={setObservations}
            />
            <LabReportVisualizer
              chartData={chartData}
              calculations={
                calculations.ok
                  ? `Slope (R) = ${calculations.slope.toFixed(
                      6
                    )} Ω\nIntercept=${calculations.intercept?.toFixed?.(6) ?? "—"}`
                  : calculations.reason
              }
              observationsCount={
                observations.filter((r) => r.V !== "" || r.I !== "").length
              }
            />
          </div>

          <LabReportSections
            title={title}
            objective={objective}
            setObjective={setObjective}
            apparatus={apparatus}
            setApparatus={setApparatus}
            description={description}
            setDescription={setDescription}
            procedure={procedure}
            setProcedure={setProcedure}
            conclusion={conclusion}
            setConclusion={setConclusion}
            observations={observations}
          />
        </section>
      </main>
    </div>
  );
}
