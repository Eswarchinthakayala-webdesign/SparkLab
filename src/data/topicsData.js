// src/data/topicsData.js

import {
  Zap,
  LineChart,
  FlaskConical,
  BookOpen,
  Battery,
} from "lucide-react";

const data = [
  {
    id: "tools",
    title: " Core Electrical Tools (Basics)",
    category: "Core Tools",
    desc: "Essential calculators and analyzers for foundational circuit and electrical theory.",
    icon: Zap,
    subtopics: [
      "Ohm’s Law Calculator",
      "Power Calculator",
      "Series/Parallel Resistance",
      "Capacitance & Inductance",
      "Impedance Calculator",
      "Transformer Calculator",
      "3-Phase Power Calculator",
      "Resonance Frequency Calculator",
      "Power Factor Calculator",
      "Thevenin/Norton Equivalent",
    ],
  },

  {
    id: "visualizations",
    title: " Visualization & Simulation",
    category: "Visualization",
    desc: "Interactive simulations and visual tools to understand electrical concepts dynamically.",
    icon: LineChart,
    subtopics: [
      "Waveform Studio",
      "Phasor Diagram Animator",
      "Circuit Playground",
      "Logic Gate Simulator",
      "Karnaugh Map Visualizer",
      "Mesh & Nodal Analysis Auto-Solver",
      "Motor/Generator 3D Demo",
      "Transformer Animation",
      "RLC Frequency Response",
      "Oscilloscope Simulator",
    ],
  },

  {
    id: "lab-support",
    title: " Lab & Practical Support",
    category: "Lab Support",
    desc: "Virtual lab experiments, measurement tools, and component testers for practical sessions.",
    icon: FlaskConical,
    subtopics: [
      "Virtual Experiments",
      "Lab Report Generator",
      "Error Calculator",
      "Unit Converter",
      "Resistor Color Code Identifier",
      "Capacitor & Inductor Code Reader",
      "Diode & Transistor Tester",
      "Digital Multimeter Simulator",
      "Oscilloscope Virtual Lab",
      "Instrument Calibration Simulator",
    ],
  },

  {
    id: "learning-hub",
    title: " Learning & Knowledge Hub",
    category: "Learning Hub",
    desc: "Educational resources, tutorials, and concept explorers for deep learning and quick revision.",
    icon: BookOpen,
    subtopics: [
      "Formula Sheet",
      "Theorem Tutorials",
      "Short Notes & Diagrams",
      "Animated Concept Explainers",
      "Quick Cheat Codes",
      "Glossary of BEEE Terms",
      "Concept Maps",
      "Video Tutorials",
      "Step-by-Step Solvers",
      "Interactive Flashcards",
    ],
  },

  {
    id: "real-life",
    title:"Energy & Real-Life Applications",
    category: "Real-Life Applications",
    desc: "Practical energy analysis and sustainability tools to connect theory with real-world use.",
    icon: Battery,
    subtopics: [
      "Appliance Energy Analyzer",
      "Electricity Bill Estimator",
      "Renewable Energy Simulator",
      "Solar Panel Estimator",
      "Battery/UPS Designer",
      "Inverter Sizing Tool",
      "Smart Load Balancer",
      "Carbon Footprint Calculator",
      "Energy Saving Tips",
      "Appliance Comparison Tool",
    ],
  },
];

export default data;