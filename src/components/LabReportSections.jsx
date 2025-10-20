import React, { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Loader2,
  Square,
  FileText,
  ClipboardList,
  CheckCircle2,
  Eye,
  Pencil,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import useGemini from "../../hooks/useGemini";
import remarkGfm from "remark-gfm";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ReactMarkdown from "react-markdown";

// ===============================
// Memoized Section Component
// ===============================
const SectionBlock = React.memo(function SectionBlock({
  label,
  field,
  value,
  setter,
  Icon,
  isActive,
  loading,
  generateFor,
  stopGeneration,
}) {
 
  const [mode, setMode] = useState("edit");
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[#ff9a3c]" />
          <span className="text-sm text-zinc-300">{label}</span>
        </div>

        <div className="flex items-center gap-2">
          {isActive && (
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="flex items-center text-xs text-zinc-400"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 text-[#ffd24a]" />
              Generating...
            </motion.div>
          )}

          {isActive ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={stopGeneration}
              className="bg-red-500/20  hover:bg-red-500/40 cursor-pointer text-red-300 border border-red-600/40 transition-all duration-300"
            >
              <Square className="w-3.5 h-3.5 mr-1" /> Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={loading || isActive}
              onClick={() => generateFor(field)}
              className="border border-[#ff9a3c]/40 hover:border-[#ffd24a]/60 hover:text-[#ffd24a] cursor-pointer hover:bg-[#ff9a3c]/10 text-[#ffd24a] transition-all duration-300"
            >
              <Sparkles className="w-4 h-4 mr-1 text-[#ffd24a]" />
              Auto Generate
            </Button>
          )}
        </div>
      </div>

     <div className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-2xl shadow-[0_0_30px_rgba(255,154,60,0.15)] overflow-hidden">
      <Tabs defaultValue="edit" onValueChange={setMode}>
        <TabsList className="flex bg-black/60 border-b border-zinc-800">
          <TabsTrigger
            value="edit"
            className={`flex-1 cursor-pointer text-sm font-medium text-zinc-400 hover:text-orange-400 transition ${
              mode === "edit" ? "text-orange-400 border-b-2 border-orange-500" : ""
            }`}
          >
          <Pencil/> Edit
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className={`flex-1 text-sm cursor-pointer font-medium text-zinc-400 hover:text-orange-400 transition ${
              mode === "preview" ? "text-orange-400 border-b-2 border-orange-500" : ""
            }`}
          >
            <Eye/> Preview
          </TabsTrigger>
        </TabsList>

        {/* Edit Mode */}
        <TabsContent value="edit" className="p-4">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={field === "procedure" ? 7 : 5}
            placeholder={`Write ${label.toLowerCase()} here or click "Auto Generate"...`}
            className="bg-[#0a0a0a]/95 border border-zinc-800 text-white placeholder:text-zinc-500 
                       focus:border-[#ff9a3c]/70 focus:ring-1 focus:ring-[#ff9a3c]/50 
                       min-h-[120px] rounded-xl shadow-inner shadow-black/40 w-full"
          />
        </TabsContent>

        {/* Markdown Preview Mode */}
        <TabsContent value="preview" className="p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="prose prose-invert max-w-none text-zinc-100
                      prose-headings:text-orange-400 prose-strong:text-orange-300
                      prose-code:bg-black/50 prose-code:text-orange-400 prose-code:rounded-lg
                      prose-code:px-2 prose-code:py-1 prose-blockquote:border-l-4 prose-blockquote:border-orange-500
                      prose-blockquote:bg-black/40 prose-blockquote:p-3 prose-blockquote:rounded-lg
                      prose-a:text-orange-400 hover:prose-a:text-orange-300"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value || "_Nothing to preview yet..._"}</ReactMarkdown>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
});

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
  const [activeField, setActiveField] = useState(null);
  const [genError, setGenError] = useState(null);
  const [typing, setTyping] = useState(false);
  const stopRef = useRef(false);
 
  // ======================================
  // Improved Prompt Builder
  // ======================================
  const buildPrompt = useCallback(
    (field) => {
      const baseContext = observations
        .map((o, i) => `#${i + 1}: V=${o.V}, I=${o.I}, remark=${o.remark}`)
        .join("\n");

      switch (field) {
        case "description":
          return `You are an expert Electrical Lab Instructor. Write a professional *description* for "${title}".
Include:
• Purpose of the experiment  
• Relevant theory and concept  
• Expected relationships  
• Real-life significance  

Observation Data:
${baseContext || "No observations available."}`;
        case "procedure":
          return `You are an expert instructor. Write a detailed *procedure* for "${title}" with clear step-by-step  generate only the procedure a

Observation context:
${baseContext || "N/A"}`;
        case "conclusion":
          return `Write a reflective *conclusion* for "${title}".
Summarize:
• What was verified  
• The relationship between quantities  
• Key learning outcome  

Observation summary:
${baseContext || "N/A"}`;
        default:
          return "";
      }
    },
    [title, observations]
  );

  // ======================================
  // Generate Function
  // ======================================
  const generateFor = useCallback(
    async (field) => {
      setActiveField(field);
      setTyping(true);
      setGenError(null);
      stopRef.current = false;

      try {
        const prompt = buildPrompt(field);
        const resp = await generateText(prompt, {
          maxTokens: 500,
          temperature: 0.35,
        });

        const text = resp?.text?.trim?.() ?? "";
        await simulateTyping(field, text);
      } catch (e) {
        console.error("Gemini generation failed", e);
        setGenError(e.message || "Failed to generate text");
      } finally {
        setTyping(false);
        setActiveField(null);
      }
    },
    [buildPrompt, generateText]
  );

  const stopGeneration = useCallback(() => {
    stopRef.current = true;
    setTyping(false);
    setActiveField(null);
  }, []);

  // ======================================
  // Smooth Typing Simulation (No Flicker)
  // ======================================
  const simulateTyping = async (field, text) => {
    const setter =
      field === "description"
        ? setDescription
        : field === "procedure"
        ? setProcedure
        : setConclusion;

    setter("");
    let buffer = "";

    for (let i = 0; i < text.length; i++) {
      if (stopRef.current) break;
      buffer += text[i];
      if (i % 5 === 0 || i === text.length - 1) {
        setter(buffer);
        await new Promise((r) => setTimeout(r, 10));
      }
    }
  };

  // ======================================
  // Render
  // ======================================
  return (
    <Card className="bg-gradient-to-b from-[#0a0a0a]/95 to-[#050505]/95 border border-zinc-800/70 shadow-lg shadow-orange-500/10 backdrop-blur-md rounded-2xl p-1">
      <CardHeader className="border-b border-zinc-800/50 pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-[#ffb84a] tracking-wide">
          <motion.div
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="w-5 h-5 text-[#ffd24a]" />
          </motion.div>
          AI Lab Report Assistant
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-8 pt-4">
        <SectionBlock
          label="Description"
          field="description"
          value={description}
          setter={setDescription}
          Icon={FileText}
          isActive={activeField === "description"}
          loading={loading}
          generateFor={generateFor}
          stopGeneration={stopGeneration}
        />
        <SectionBlock
          label="Procedure"
          field="procedure"
          value={procedure}
          setter={setProcedure}
          Icon={ClipboardList}
          isActive={activeField === "procedure"}
          loading={loading}
          generateFor={generateFor}
          stopGeneration={stopGeneration}
        />
        <SectionBlock
          label="Conclusion"
          field="conclusion"
          value={conclusion}
          setter={setConclusion}
          Icon={CheckCircle2}
          isActive={activeField === "conclusion"}
          loading={loading}
          generateFor={generateFor}
          stopGeneration={stopGeneration}
        />

        {(genError || error) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-400 text-sm mt-4 border border-red-500/20 bg-red-500/10 p-3 rounded-lg flex items-center gap-2"
          >
            ⚠️ {genError || error}
          </motion.div>
        )}

        {typing && (
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="text-xs text-zinc-500 text-center pt-2"
          >
            ✍️ AI is typing your report...
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
