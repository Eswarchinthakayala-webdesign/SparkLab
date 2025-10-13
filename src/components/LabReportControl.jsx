import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, FileDown, Image as ImageIcon } from "lucide-react";

export default function LabReportControl({
  title, setTitle,
  author, setAuthor,
  college, setCollege,
  date, setDate,
  circuitImageBase64, setCircuitImageBase64,
  onGeneratePDF,
}) {
  const [errorMsg, setErrorMsg] = useState("");

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please upload an image file.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setErrorMsg("File too large (max 4MB).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCircuitImageBase64(reader.result);
      setErrorMsg("");
    };
    reader.readAsDataURL(file);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="bg-[#070707] border border-zinc-800 text-white shadow-[0_0_25px_-10px_#ffb34740]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#ffd24a]">
            <ImageIcon className="w-5 h-5 text-[#ffd24a]" />
            Experiment Metadata
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Experiment Title"
              className="bg-[#0b0b0c] border border-zinc-800 text-white focus:border-[#ffd24a]/60"
            />
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Student Name"
              className="bg-[#0b0b0c] border border-zinc-800 text-white focus:border-[#ffd24a]/60"
            />
            <Input
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              placeholder="College Name"
              className="bg-[#0b0b0c] border border-zinc-800 text-white focus:border-[#ffd24a]/60"
            />
            <Input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              type="date"
              className="bg-[#0b0b0c] border border-zinc-800 text-white focus:border-[#ffd24a]/60"
            />
          </div>

          {/* Upload Section */}
          <div className="flex flex-wrap gap-3 items-center mt-4">
            <label className="flex items-center gap-2 cursor-pointer bg-zinc-900 px-4 py-2 rounded-md border border-zinc-800 hover:border-[#ffd24a]/40 hover:bg-[#111] transition">
              <Upload className="w-4 h-4 text-[#ffd24a]" />
              <span className="text-sm text-zinc-300">Upload Circuit</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
              />
            </label>

            {circuitImageBase64 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCircuitImageBase64(null)}
                className="flex items-center gap-2 border-zinc-800 text-red-500 cursor-pointer hover:border-red-500 hover:text-red-400 transition"
              >
                <Trash2 className="w-4 h-4" /> Clear
              </Button>
            )}

            <Button
              onClick={onGeneratePDF}
              className="ml-auto bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-semibold hover:shadow-[0_0_15px_#ffd24a50] transition"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Generate PDF
            </Button>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="text-red-400 text-sm mt-2 flex items-center gap-2">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Image Preview */}
          {circuitImageBase64 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="mt-4 relative group"
            >
              <div className="border border-zinc-800 rounded-lg overflow-hidden bg-[#0b0b0c] p-2">
                <motion.img
                  src={circuitImageBase64}
                  alt="Circuit Diagram"
                  className="rounded-lg w-full max-h-[250px] object-contain transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-black/40 flex items-center justify-center rounded-lg">
                <p className="text-xs text-[#ffd24a] bg-black/60 px-2 py-1 rounded">
                  Circuit Preview
                </p>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
