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
      </Routes>
    </Router>
  );
}
