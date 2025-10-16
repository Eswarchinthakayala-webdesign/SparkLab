// src/components/EnergyControls.jsx
import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Plus,
  Trash2,
  Download,
  Settings,
  Building2,
  Home,
  Factory,
  Sparkles,
  Zap, Cpu, Hash
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function EnergyControls({
  appliances,
  setAppliances,
  userProfile,
  setUserProfile,
  efficiencyFactor,
  setEfficiencyFactor,
  onGenerateRecommendations,
  onExportPDF,
  geminiLoading,
}) {
  // Add new appliance
  const addAppliance = () => {
    setAppliances((s) => [
      ...s,
      {
        id: Date.now() + Math.random(),
        name: "New Appliance",
        baseWatts: 60,
        quantity: 1,
        enabled: true,
      },
    ]);
    toast.success("Appliance added");
  };

  // Update appliance info
  const updateAppliance = (id, patch) => {
    setAppliances((s) => s.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  // Remove appliance
  const removeAppliance = (id) => {
    setAppliances((s) => s.filter((a) => a.id !== id));
    toast.info("Appliance removed");
  };

  // Preset data
  const presets = useMemo(
    () => ({
      household: [
        { id: "led1", name: "LED bulb", baseWatts: 10, quantity: 6, enabled: true },
        { id: "fridge", name: "Fridge (avg)", baseWatts: 120, quantity: 1, enabled: true },
        { id: "tv", name: "TV", baseWatts: 80, quantity: 1, enabled: true },
        { id: "ac", name: "AC (avg)", baseWatts: 1500, quantity: 0, enabled: false },
      ],
      smallOffice: [
        { id: "led1", name: "LED bulb", baseWatts: 10, quantity: 12, enabled: true },
        { id: "pc", name: "Desktop PC", baseWatts: 200, quantity: 6, enabled: true },
        { id: "printer", name: "Printer", baseWatts: 100, quantity: 1, enabled: true },
      ],
      industrial: [
        { id: "motor", name: "Motor (avg)", baseWatts: 2000, quantity: 2, enabled: true },
        { id: "lights", name: "Industrial lights", baseWatts: 80, quantity: 20, enabled: true },
      ],
    }),
    []
  );

  // Apply preset + store user profile
  const applyPreset = (key) => {
    setAppliances(presets[key]);
    setUserProfile(key);
    toast.success(`Preset applied: ${key}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-4"
    >
      <div className="bg-gradient-to-b from-black via-zinc-950 to-zinc-900 border border-zinc-800 p-4 sm:p-6 rounded-2xl shadow-[0_0_25px_rgba(255,122,45,0.15)] backdrop-blur-md">
        {/* Header */}
        <div className="flex flex-col  sm:justify-between mb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black flex items-center justify-center shadow-md">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-[#ffd24a]">Energy Controls</div>
              <div className="text-xs text-zinc-400">
                Manage your appliances, adjust efficiency & apply smart presets
              </div>
            </div>
          </div>

          {/* Profile Select → Applies preset directly */}
          <Select
            value={userProfile}
            onValueChange={(v) => applyPreset(v)}
          >
            <SelectTrigger className="w-full  cursor-pointer bg-black/80 border border-zinc-800 text-white text-sm rounded-md shadow-sm hover:border-orange-500 focus:ring-[#ff7a2d] transition-all duration-200">
              <SelectValue placeholder="Select Preset" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border border-zinc-800 rounded-md text-white shadow-lg">
              <SelectItem
                value="household"
                className="flex items-center gap-2 text-white data-[highlighted]:text-orange-400 data-[highlighted]:bg-orange-500/20 rounded-md cursor-pointer"
              >
                <Home className="w-4 h-4 text-[#ff7a2d]" /> Household
              </SelectItem>
              <SelectItem
                value="smallOffice"
                className="flex items-center gap-2 text-white data-[highlighted]:text-orange-400 data-[highlighted]:bg-orange-500/20 rounded-md cursor-pointer"
              >
                <Building2 className="w-4 h-4 text-[#ff7a2d]" /> Small Office
              </SelectItem>
              <SelectItem
                value="industrial"
                className="flex items-center gap-2 text-white data-[highlighted]:text-orange-400 data-[highlighted]:bg-orange-500/20 rounded-md cursor-pointer"
              >
                <Factory className="w-4 h-4 text-[#ff7a2d]" /> Industrial
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Efficiency Slider */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="text-xs text-zinc-400 w-32">Efficiency</div>
          <div className="flex-1">
            <div className="text-xs text-zinc-400">
              What-if:{" "}
              <span className="text-[#ffd24a] font-semibold">
                {Math.round(efficiencyFactor * 100)}%
              </span>
            </div>
            <Slider
              value={[efficiencyFactor]}
              min={0.5}
              max={1}
              step={0.01}
              onValueChange={(v) => setEfficiencyFactor(v[0])}
            />
          </div>
        </div>

        {/* Appliance List */}
        <div className="space-y-3">
          {appliances.map((a) => (
            <div
              key={a.id}
              className="flex flex-col gap-3 items-start border border-zinc-800 bg-zinc-900/60 p-3 rounded-xl transition-all hover:border-orange-500/40"
            >
            <div className="flex flex-col sm:flex-row gap-3 w-full bg-gradient-to-br from-zinc-950/80 to-black/80 border border-zinc-800/70 p-3 rounded-xl shadow-md hover:border-[#ff7a2d]/60 transition-all duration-300">
      {/* Appliance Name */}
      <div className="flex flex-col flex-1">
        <label className="flex items-center gap-2 text-xs sm:text-sm text-zinc-400 mb-1">
          <Cpu className="w-4 h-4 text-[#ffb84a]" />
          Appliance
        </label>
        <Input
          value={a.name}
          onChange={(e) => updateAppliance(a.id, { name: e.target.value })}
          className="flex-1 bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500 focus-visible:ring-[#ff7a2d]"
          placeholder="e.g., Air Conditioner"
        />
      </div>

      {/* Power (Watts) */}
      <div className="flex flex-col sm:w-28">
        <label className="flex items-center gap-2 text-xs sm:text-sm text-zinc-400 mb-1">
          <Zap className="w-4 h-4 text-[#ff7a2d]" />
          Power (W)
        </label>
        <Input
          value={a.baseWatts}
          type="number"
          onChange={(e) =>
            updateAppliance(a.id, { baseWatts: Number(e.target.value) || 0 })
          }
          className="w-full bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500 focus-visible:ring-[#ff7a2d]"
          placeholder="Watts"
        />
      </div>

      {/* Quantity */}
      <div className="flex flex-col sm:w-24">
        <label className="flex items-center gap-2 text-xs sm:text-sm text-zinc-400 mb-1">
          <Hash className="w-4 h-4 text-[#ffd24a]" />
          Qty
        </label>
        <Input
          value={a.quantity}
          type="number"
          onChange={(e) =>
            updateAppliance(a.id, { quantity: Number(e.target.value) || 1 })
          }
          className="w-full bg-zinc-900/70 border-zinc-800 text-orange-100 placeholder:text-zinc-500 focus-visible:ring-[#ff7a2d]"
          placeholder="1"
        />
      </div>
    </div>
              <div className="flex items-center justify-end gap-2 w-full">
                <Badge
                  className={`px-3 py-1 rounded-full border ${
                    a.enabled
                      ? "bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black border-transparent"
                      : "bg-black/50 text-zinc-400 border-zinc-700"
                  }`}
                >
                  {a.enabled ? "On" : "Off"}
                </Badge>
                <Button
                  variant="ghost"
                  className="text-xs bg-white cursor-pointer text-orange-400 hover:text-orange-300"
                  onClick={() => updateAppliance(a.id, { enabled: !a.enabled })}
                >
                  {a.enabled ? "Disable" : "Enable"}
                </Button>
                <Button
                  variant="ghost"
                  className="p-2 text-black cursor-pointer hover:bg-red-600 bg-red-500"
                  onClick={() => removeAppliance(a.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            className="flex-1 cursor-pointer sm:flex-none bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black font-medium shadow-md hover:shadow-lg"
            onClick={addAppliance}
          >
            <Plus className="w-4 h-4 mr-2" /> Add Appliance
          </Button>
        </div>

        {/* Bottom Controls */}
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button
            className="flex-1 cursor-pointer bg-gradient-to-tr from-[#ff7a2d] to-[#ffd24a] text-black hover:shadow-lg"
            onClick={onGenerateRecommendations}
            disabled={geminiLoading}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {geminiLoading ? "Thinking..." : "Generate Tips (Gemini)"}
          </Button>
          <Button
            variant="outline"
            className="border-zinc-700 text-black cursor-pointer hover:border-orange-500 hover:text-orange-300"
            onClick={onExportPDF}
          >
            <Download className="w-4 h-4 mr-2" /> Export PDF
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
