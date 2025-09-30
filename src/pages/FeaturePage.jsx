
import Navbar from "../components/landing/Navbar";
import FeaturesOverview from "../components/landing/FeaturesOverview";
import FeaturesShowcase from "../components/landing/FeaturesShowcase";
import SimulationPreviewSection from "../components/landing/SimulationPreviewSection";


/* ---------- Full FeaturePage Export ---------- */
export default function FeaturePage() {
  return (
    <div className="bg-black text-white min-h-screen">
      <Navbar/>
      <main>
        <FeaturesOverview/>
        <FeaturesShowcase/>
        <SimulationPreviewSection/>
       
      </main>
      
    </div>
  );
}
