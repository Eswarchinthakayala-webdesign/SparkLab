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
import TopicsOverviewPage from "./pages/TopicsOverviewPage";
import LabSupportPage from "./pages/LabSupportPage";
import ExperimentsPage from "./pages/labs/ExperimentsPage";
import LabReportGeneratorPage from "./pages/labs/LabReportGenerator";
import ErrorCalculatorPage from "./pages/labs/ErrorCalculatorPage";
import UnitMeasurementPage from "./pages/labs/UnitMeasurementPage";
import ColorCodeIdentifierPage from "./pages/labs/ColorCodeIdentifierPage";
import CodeReaderPage from "./pages/labs/CodeReaderPage";
import TesterPage from "./pages/labs/TesterPage";
import SimulatorPage from "./pages/labs/SimulatorPage";
import VirtualLabPage from "./pages/labs/VirtualLabPage";
import CalibrationSimPage from "./pages/labs/CalibrationSimPage";
import LearningHubToolsPage from "./pages/LearningHubToolsPage";
import FormulaSheetPage from "./pages/hub/FormulaSheetPage";
import TheoremTutorialPage from "./pages/hub/TheoremTutorialPage";
import NotesPage from "./pages/hub/NotesPage";
import ExplainerPage from "./pages/hub/ExplainerPage";
import CheatCodesPage from "./pages/hub/CheatCodesPage";

import RealLifeApplicationsSection from "./components/landing/RealLifeApplicationsSection";
import RealWorldApplicationPage from "./pages/RealWorldApplicationPage";
import ApplianceEnergyAnalyzer from "./pages/real-world/ApplianceEnergyAnalyzer";
import ElectricBillEstimatorPage from "./pages/real-world/ElectricBillEstimator";
import EnergySimulatorPage from "./pages/real-world/EnergySimulator";
import EstimatorPage from "./pages/real-world/EstimatorPage";
import BatteryUPSDesignerPage from "./pages/real-world/BatteryUPSDesignerPage";
import InverterSizingPage from "./pages/real-world/InverterSizingPage";
import LoadBalancePage from "./pages/real-world/LoadBalancePage";
import FootPrintCalculatorPage from "./pages/real-world/FootPrintCalculatorPage";
import EnergyEnginePage from "./pages/real-world/EnergyEnginePage";
import ComparePage from "./pages/real-world/ComparePage";
import GlossaryPage from "./pages/hub/GlossaryPage";
import ConceptMapPage from "./pages/hub/ConceptMapPage";
import DocumentationPage from "./pages/hub/DocumentationPage";
import SolverPage from "./pages/hub/SolverPage";
import FlashCardPage from "./pages/hub/FlashCard";

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
         <Route path="/topics" element={<TopicsOverviewPage />} />
        <Route path="/topics/tools" element={<ElectricToolsPage/>} />
        <Route path="/topics/tools/ohms-law" element={<OhmsLawPage/>}/>
        <Route path="/topics/tools/power" element={<PowerCalculator/>}/>
        <Route path="/topics/tools/resistance" element={<ResistanceCalculatorPage/>} />
        <Route path="/topics/tools/capacitance-inductance" element={<CapacitanceInductanceCalculatorPage/>}/>
        <Route path="/topics/tools/impedance" element={<ImpedanceCalculatorPage/>} />
        <Route path="/topics/tools/transformer" element={<TransformerCalculatorPage/>} />
        <Route path="/topics/tools/three-phase" element={<ThreePhaseCalculatorPage/>} />
        <Route path="/topics/tools/resonance" element={<ResonanceCalculatorPage/>} />
        <Route path="/topics/tools/power-factor" element={<PowerFactorCalculator/>} />
        <Route path="/topics/tools/thevenin-norton" element={<TheveninNortonCalculator/>} />
        <Route path="/topics/visualizations" element={<VisualizationToolsPage/>} />
        <Route path="/topics/visualizations/waveform-studio" element={<WaveformStudioPage/>} />
        <Route path="/topics/visualizations/phasor-diagram" element={<PhasorDiagramPage/>} />
        <Route path="/topics/visualizations/circuit-playground" element={<CircuitPlaygroundPage/>} />
        <Route path="/topics/visualizations/logic-gate-simulator" element={<LogicGateSimulatorPage/>} />

        <Route path="/topics/visualizations/kmap-solver" element={<KarnaughMapSolverPage/>} />
        <Route path="/topics/visualizations/mesh-nodal-solver" element={<MeshNodalAnalysisPage/>} />
        <Route path="/topics/visualizations/motor-generator-demo" element={<AnimatedMotorGeneratorPage/>} />
        <Route path="/topics/visualizations/transformer-animation" element={<InteractiveTransformerPage/>} />
        <Route path="/topics/visualizations/rlc-response" element={<RLCVisualizerPage/>} />
        <Route path="/topics/visualizations/oscilloscope-simulator" element={<OscilloscopeSimulatorPage/>} />
        <Route path="/topics/lab-support" element={<LabSupportPage/>}/>
        <Route path="/topics/labs/virtual-experiments" element={<ExperimentsPage/>} />
        <Route path="/topics/labs/lab-report-gen" element={<LabReportGeneratorPage/>} />
        <Route path="/topics/labs/error-calculator" element={<ErrorCalculatorPage/>} />
        <Route path="/topics/labs/unit-converter" element={<UnitMeasurementPage/>} />
        <Route path="/topics/labs/resistor-identifier" element={<ColorCodeIdentifierPage/>} />

        <Route path="/topics/labs/cap-ind-code" element={<CodeReaderPage/>} />
        <Route path="/topics/labs/diode-transistor-tester" element={<TesterPage/>} />
        <Route path="/topics/labs/dmm-simulator" element={<SimulatorPage/>} />
        <Route path="/topics/labs/oscilloscope-lab" element={<VirtualLabPage/>} />
        <Route path="/topics/labs/calibration-sim" element={<CalibrationSimPage/>} />

        <Route path="/topics/learning-hub" element={<LearningHubToolsPage/>} />
        <Route path="/learning/formula-sheet" element={<FormulaSheetPage/>} />
        <Route path="/learning/theorem-tutorials" element={<TheoremTutorialPage/>} />
        <Route path="/learning/short-notes" element={<NotesPage/>} />
        <Route path="/learning/animated-explainers" element={<ExplainerPage/>} />
        <Route path="/learning/cheat-codes" element={<CheatCodesPage/>} />
        <Route path="/learning/glossary" element={<GlossaryPage/>} />

        <Route path="/topics/real-life" element={<RealWorldApplicationPage/>} />
        <Route path="/tools/real-world/appliance-analyzer" element={<ApplianceEnergyAnalyzer/>} />
        <Route path="/tools/real-world/bill-estimator" element={<ElectricBillEstimatorPage/>} />
        <Route path="/tools/real-world/renewable-sim" element={<EnergySimulatorPage/>} />
        <Route path="/tools/real-world/solar-estimator" element={<EstimatorPage/>} />
        <Route path="/tools/real-world/battery-designer" element={<BatteryUPSDesignerPage/>}/>
        <Route path="/tools/real-world/inverter-sizing" element={<InverterSizingPage/>} />
        <Route path="/tools/real-world/load-balancer" element={<LoadBalancePage/>} />
        <Route path='/tools/real-world/carbon-footprint' element={<FootPrintCalculatorPage/>} />
        <Route path="/tools/real-world/energy-tips" element={<EnergyEnginePage/>} />
        <Route path="/tools/real-world/compare-appliances" element={<ComparePage/>} />
        <Route path="/learning/concept-maps" element={<ConceptMapPage/>} />
        <Route path="/learning/video-integration" element={<DocumentationPage/>}/>
        <Route path="/learning/step-solvers" element={<SolverPage/>}/>
        <Route path="/learning/flashcards" element={<FlashCardPage/>} />
      </Routes>
    </Router>
  );
}
