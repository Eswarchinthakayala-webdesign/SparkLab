// src/components/LabReportSections.jsx
// Improved version: includes live loading, better prompts, and smoother UX.

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import useGemini from "../../hooks/useGemini";


export default function LabReportSections({
  title,
  description,
  setDescription,
  procedure,
  setProcedure,
  conclusion,
  setConclusion,
  observations = [],
}) {
  const { generateText, loading, error } = useGemini();
  const [activeField, setActiveField] = useState(null); // "description" | "procedure" | "conclusion" | null
  const [genError, setGenError] = useState(null);

  const generateFor = async (field) => {
    setActiveField(field);
    setGenError(null);

    // Build a more field-specific prompt
    const baseContext = observations
      .map((o) => `t=${o.t}, V=${o.V}, I=${o.I}, remark=${o.remark}`)
      .join("\n");

    let prompt = "";
    if (field === "description") {
      prompt = `You are a helpful lab assistant. Write a clear, concise *description* for the experiment titled "${title}". 
Use the following readings as context:
${baseContext}

Focus on the purpose of the experiment, relevant theory, and what is being verified.`;
    } else if (field === "procedure") {
      prompt = `You are a lab assistant. Write a step-by-step *procedure* for the experiment "${title}" based on the following data:
${baseContext}

Keep it short, clear, and in bullet points suitable for an undergraduate lab report.`;
    } else if (field === "conclusion") {
      prompt = `You are a lab assistant. Write a brief *conclusion* for the experiment "${title}".
Base it on these readings:
${baseContext}

Summarize what was verified, mention relationship or constants found, and state whether the aim was achieved.`;
    }

    try {
      const resp = await generateText(prompt, { maxTokens: 400, temperature: 0.3 });
      const text = resp?.text?.trim?.() ?? "";

      // Simulate streaming text appearance
      await simulateTyping(field, text);
    } catch (e) {
      console.error("Gemini generation failed", e);
      setGenError(e.message || "Failed to generate text");
    } finally {
      setActiveField(null);
    }
  };

  // Typing animation for nicer UX
  const simulateTyping = async (field, text) => {
    let setter = null;
    let currentText = "";
    if (field === "description") setter = setDescription;
    if (field === "procedure") setter = setProcedure;
    if (field === "conclusion") setter = setConclusion;

    if (!setter) return;
    setter("");

    for (let i = 0; i < text.length; i++) {
      currentText += text[i];
      setter(currentText);
      await new Promise((r) => setTimeout(r, 8)); // adjust typing speed
    }
  };

  const SectionBlock = ({ label, field, value, setter }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-400">{label}</div>
        <div className="flex items-center gap-2">
          {activeField === field && (
            <div className="flex items-center text-xs text-zinc-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Generating...
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={loading || activeField !== null}
            onClick={() => generateFor(field)}
            className="border border-zinc-800 hover:border-[#ffd24a]/40"
          >
            <Sparkles className="w-4 h-4 mr-1 text-[#ffd24a]" />
            Auto
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => setter(e.target.value)}
        rows={field === "procedure" ? 5 : 4}
        placeholder={`Write ${label.toLowerCase()} here... or click Auto`}
        className="bg-[#0b0b0c] border border-zinc-800 text-white min-h-[100px]"
      />
    </div>
  );

  return (
    <Card className="bg-[#070707] border border-zinc-800 text-white">
      <CardHeader>
        <CardTitle className="text-[#ffd24a] flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#ffd24a]" /> AI-Assisted Report Sections
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          <SectionBlock
            label="Description"
            field="description"
            value={description}
            setter={setDescription}
          />
          <SectionBlock
            label="Procedure"
            field="procedure"
            value={procedure}
            setter={setProcedure}
          />
          <SectionBlock
            label="Conclusion"
            field="conclusion"
            value={conclusion}
            setter={setConclusion}
          />

          {(genError || error) && (
            <div className="text-red-400 text-sm mt-2">
              ⚠️ {genError || error}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
