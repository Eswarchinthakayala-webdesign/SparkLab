// src/pages/LabReportGenerator.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import axios from "axios";
import { saveAs } from "file-saver";
import { Zap, Download } from "lucide-react";

import LabReportData from "@/components/LabReportData";
import LabReportTable from "@/components/LabReportTable";
import LabReportVisualizer from "@/components/LabReportVisualizer";
import LabReportControl from "@/components/LabReportControl";
import LabReportSections from "@/components/LabReportSections";

import { Button } from "@/components/ui/button";
import * as htmlToImage from "html-to-image";

const defaultRow = (i) => ({
  id: String(Date.now()) + "-" + i,
  t: i + 1,
  V: "",
  I: "",
  remark: "",
});

const DEFAULT_EXPERIMENTS = [
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
      <header className="max-w-6xl mx-auto mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] flex items-center justify-center shadow">
            <Zap className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Lab Report Generator</h1>
            <p className="text-zinc-400 text-xs">
              Export charts, tables & auto text to PDF
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={generatePDF}
            className="bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black"
          >
            <Download className="w-4 h-4 mr-2" /> Generate PDF
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
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
