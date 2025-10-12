// src/components/LabReportData.jsx
// Holds a list of experiments (title + titleID) and allows selecting one.
// Exposes a callback onSelect(titleID) to parent.

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function LabReportData({ experiments = [], selectedTitleID, onSelect }) {
  // experiments: [{ titleID: 'ohm-01', title: 'Verification of Ohm's Law', defaultData: {...} }, ...]
  return (
    <Card className="bg-[#070707] border border-zinc-800 text-white">
      <CardHeader>
        <CardTitle className="text-[#ffd24a]">Experiments</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {experiments.length === 0 && <div className="text-zinc-400 text-sm">No experiments defined</div>}
          {experiments.map((exp) => (
            <div key={exp.titleID} className={`flex items-center justify-between p-2 rounded-md ${selectedTitleID === exp.titleID ? "bg-zinc-900 border border-zinc-800" : ""}`}>
              <div>
                <div className="text-sm font-medium">{exp.title}</div>
                <div className="text-xs text-zinc-500">{exp.titleID}</div>
              </div>
              <div>
                <Button variant={selectedTitleID === exp.titleID ? "secondary" : "ghost"} onClick={() => onSelect(exp.titleID)}>
                  {selectedTitleID === exp.titleID ? "Selected" : "Select"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
