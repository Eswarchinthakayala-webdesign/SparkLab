// src/pages/LandingPage.jsx
import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Zap, Cpu, Users, BookOpen, Gamepad2 } from "lucide-react";
import Navbar from "../components/landing/Navbar";
import Hero from "../components/landing/Hero";
import USPStrip from "../components/landing/USPStrip";
import FeaturesOverview from "../components/landing/FeaturesOverview";
import FeaturesShowcase from "../components/landing/FeaturesShowcase";
import BenefitsSection from "../components/landing/BenefitsSection";
import ComparisonTable from "../components/landing/ComparisonTable";
import UseCasesSection from "../components/landing/UseCasesSection";
import HowItWorksSection from "../components/landing/HowItWorksSection";
import SimulationPreviewSection from "../components/landing/SimulationPreviewSection";
import GamificationPreviewSection from "../components/landing/GamificationPreviewSection";
import StudyHubSection from "../components/landing/StudyHubSection";
import RealLifeApplicationsSection from "../components/landing/RealLifeApplicationsSection";
import Footer from "../components/landing/Footer";
import StudentImpactStatsSection from "../components/landing/StudentImpactStatsSection";
import RoadmapsSection from "../components/landing/RoadmapsSection";

export default function LandingPage() {
  const features = [
    {
      icon: <Zap className="w-6 h-6 text-orange-500" />,
      title: "70+ Tools",
      desc: "From Ohm’s Law to Smart Energy Simulators – all in one place.",
    },
    {
      icon: <Cpu className="w-6 h-6 text-orange-500" />,
      title: "Interactive Simulations",
      desc: "Waveforms, phasors, circuit playgrounds, and more – hands-on learning.",
    },
    {
      icon: <BookOpen className="w-6 h-6 text-orange-500" />,
      title: "Study Hub",
      desc: "Formula sheets, notes, tutorials, flashcards & solvers.",
    },
    {
      icon: <Gamepad2 className="w-6 h-6 text-orange-500" />,
      title: "Gamified Learning",
      desc: "Quizzes, puzzles, leaderboards, and circuit debugging games.",
    },
    {
      icon: <Users className="w-6 h-6 text-orange-500" />,
      title: "Collaboration",
      desc: "Share circuits, join study rooms, and compete with peers.",
    },
    {
      icon: <Sparkles className="w-6 h-6 text-orange-500" />,
      title: "Future Ready",
      desc: "Energy analyzers, renewable simulations, and real-world applications.",
    },
  ];

  return (
    <div className="bg-black text-white min-h-screen">
      <Navbar/>
      <Hero/>
      <USPStrip/>
      <FeaturesOverview/>
      <FeaturesShowcase/>
      <BenefitsSection/>
      <ComparisonTable/>
      <UseCasesSection/>
      <HowItWorksSection/>
      <SimulationPreviewSection/>
      <GamificationPreviewSection/>
      <StudyHubSection/>
      <RealLifeApplicationsSection/>
      <StudentImpactStatsSection/>
      <RoadmapsSection/>
      <Footer/>
    </div>
  );
}
