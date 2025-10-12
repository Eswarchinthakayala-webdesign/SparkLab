// src/components/LabReportControl.jsx
// Handles metadata, image upload, and PDF trigger
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export default function LabReportControl({
  title, setTitle,
  author, setAuthor,
  college, setCollege,
  date, setDate,
  circuitImageBase64, setCircuitImageBase64,
  onGeneratePDF
}) {
  const handleUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      // limit 4MB
      alert("File too big (max 4MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCircuitImageBase64(reader.result);
    reader.readAsDataURL(f);
  };

  return (
    <Card className="bg-[#070707] border border-zinc-800 text-white">
      <CardHeader>
        <CardTitle className="text-[#ffd24a]">Metadata</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Experiment title" className="bg-[#0b0b0c] border border-zinc-800 text-white" />
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Student name" className="bg-[#0b0b0c] border border-zinc-800 text-white" />
          <Input value={college} onChange={(e) => setCollege(e.target.value)} placeholder="College name" className="bg-[#0b0b0c] border border-zinc-800 text-white" />
          <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="bg-[#0b0b0c] border border-zinc-800 text-white" />

          <div className="flex gap-2 items-center mt-2">
            <label className="flex items-center gap-2 cursor-pointer bg-zinc-900 px-3 py-2 rounded-md border border-zinc-800">
              <Upload className="w-4 h-4 text-[#ffd24a]" />
              <span className="text-sm text-zinc-300">Upload Circuit</span>
              <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            </label>

            <Button variant="ghost" onClick={() => setCircuitImageBase64(null)} className="border border-zinc-800">Clear</Button>

            <Button onClick={onGeneratePDF} className="ml-auto bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black">Generate PDF</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
