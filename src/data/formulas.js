// src/pages/formulaData.js
export const FORMULAS = [
  {
    id: "qcv",
    category: "Capacitor",
    title: "Charge on a capacitor",
    formula: "Q = C × V",
    inputs: [
      { key: "C", label: "Capacitance", unit: "μF", default: 10 },
      { key: "V", label: "Voltage", unit: "V", default: 12 },
    ],
    compute: ({ C, V }) => {
      const c = Number(C) * 1e-6;
      const q = c * Number(V);
      return { Q: q, Q_unit: "C" };
    },
    description: "Charge stored on a capacitor (Coulombs).",
  },
  {
    id: "ec",
    category: "Capacitor",
    title: "Energy stored in capacitor",
    formula: "E = ½ C V²",
    inputs: [
      { key: "C", label: "Capacitance", unit: "μF", default: 10 },
      { key: "V", label: "Voltage", unit: "V", default: 12 },
    ],
    compute: ({ C, V }) => {
      const c = Number(C) * 1e-6;
      const e = 0.5 * c * Number(V) * Number(V);
      return { E: e, E_unit: "J" };
    },
    description: "Energy stored in the capacitor (joules).",
  },
  // ... other formulas
];
