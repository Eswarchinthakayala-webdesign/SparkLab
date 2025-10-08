// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// Pages
import LandingPage from "./pages/LandingPage";
import FeaturePage from "./pages/FeaturePage";
import AboutPage from "./pages/AboutPage";
import ElectricToolsPage from "./pages/ElectricToolsPage";
import OhmsLawPage from "./pages/tools/OhmsLawPage";
import PowerCalculator from "./pages/tools/PowerCalculator";
import ResistanceCalculatorPage from "./pages/tools/ResistanceCalculator";
import CapacitanceInductanceCalculatorPage from "./pages/tools/CapacitanceInductanceCalculator";
import ImpedanceCalculatorPage from "./pages/tools/ImpedanceCalculatorPage";
import TransformerCalculatorPage from "./pages/tools/TransformerCalculatorPage";
import ThreePhaseCalculatorPage from "./pages/tools/ThreePhaseCalculatorPage";
import ResonanceCalculatorPage from "./pages/tools/ResonanceCalculatorPage";
import PowerFactorCalculator from "./pages/tools/PowerFactorCalculator";
import TheveninNortonCalculator from "./pages/tools/TheveninNortonCalculator";
import VisualizationToolsPage from "./pages/VisualizationToolsPage";
import WaveformStudioPage from "./pages/visualizations/WaveformStudio";
import PhasorDiagramPage from "./pages/visualizations/PhasorDiagramPage";
import CircuitPlaygroundPage from "./pages/visualizations/CircuitPlaygroundPage";
import LogicGateSimulatorPage from "./pages/visualizations/LogicGateSimulatorPage";
import MeshNodalAnalysisPage from "./pages/visualizations/MeshNodalAnalysisPage";
import KarnaughMapSolverPage from "./pages/visualizations/KarnaughMapSolverPage";
import AnimatedMotorGeneratorPage from "./pages/visualizations/AnimatedMotorGeneratorPage";
import InteractiveTransformerPage from "./pages/visualizations/InteractiveTransformerPage";
import RLCVisualizerPage from "./pages/visualizations/RLCVisualizerPage";
import OscilloscopeSimulatorPage from "./pages/visualizations/OscilloscopeSimulatorPage";

// TODO: You can add these later
// import LoginPage from "./pages/LoginPage";
// import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Landing Page */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturePage/>}/>
        <Route path="/about" element={<AboutPage/>} />
        <Route path="/tools" element={<ElectricToolsPage/>} />
        <Route path="/tools/ohms-law" element={<OhmsLawPage/>}/>
        <Route path="/tools/power" element={<PowerCalculator/>}/>
        <Route path="/tools/resistance" element={<ResistanceCalculatorPage/>} />
        <Route path="/tools/capacitance-inductance" element={<CapacitanceInductanceCalculatorPage/>}/>
        <Route path="/tools/impedance" element={<ImpedanceCalculatorPage/>} />
        <Route path="/tools/transformer" element={<TransformerCalculatorPage/>} />
        <Route path="/tools/three-phase" element={<ThreePhaseCalculatorPage/>} />
        <Route path="/tools/resonance" element={<ResonanceCalculatorPage/>} />
        <Route path="/tools/power-factor" element={<PowerFactorCalculator/>} />
        <Route path="/tools/thevenin-norton" element={<TheveninNortonCalculator/>} />
        <Route path="visualizations" element={<VisualizationToolsPage/>} />
        <Route path="/visualizations/waveform-studio" element={<WaveformStudioPage/>} />
        <Route path="/visualizations/phasor-diagram" element={<PhasorDiagramPage/>} />
        <Route path="/visualizations/circuit-playground" element={<CircuitPlaygroundPage/>} />
        <Route path="/visualizations/logic-gate-simulator" element={<LogicGateSimulatorPage/>} />

        <Route path="/visualizations/kmap-solver" element={<KarnaughMapSolverPage/>} />
        <Route path="/visualizations/mesh-nodal-solver" element={<MeshNodalAnalysisPage/>} />
        <Route path="/visualizations/motor-generator-demo" element={<AnimatedMotorGeneratorPage/>} />
        <Route path="/visualizations/transformer-animation" element={<InteractiveTransformerPage/>} />
        <Route path="/visualizations/rlc-response" element={<RLCVisualizerPage/>} />
        <Route path="/visualizations/oscilloscope-simulator" element={<OscilloscopeSimulatorPage/>} />
      </Routes>
    </Router>
  );
}
