// src/pages/formulaData.js

export const FORMULAS = [
  // === CAPACITOR ===
  {
    id: "qcv",
    category: "Capacitor",
    title: "Charge on a Capacitor",
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
    title: "Energy Stored in Capacitor",
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
    description: "Energy stored in the capacitor (Joules).",
  },

  // === OHM’S LAW & RESISTANCE ===
  {
    id: "ohm",
    category: "DC Circuits",
    title: "Ohm’s Law",
    formula: "V = I × R",
    inputs: [
      { key: "I", label: "Current", unit: "A", default: 2 },
      { key: "R", label: "Resistance", unit: "Ω", default: 10 },
    ],
    compute: ({ I, R }) => {
      const v = Number(I) * Number(R);
      return { V: v, V_unit: "V" };
    },
    description: "Voltage drop across a resistor (Volts).",
  },
  {
    id: "resseries",
    category: "DC Circuits",
    title: "Resistance in Series",
    formula: "R_total = R₁ + R₂ + R₃ + ...",
    inputs: [
      { key: "R1", label: "R₁", unit: "Ω", default: 10 },
      { key: "R2", label: "R₂", unit: "Ω", default: 20 },
      { key: "R3", label: "R₃", unit: "Ω", default: 30 },
    ],
    compute: ({ R1, R2, R3 }) => {
      const r = Number(R1) + Number(R2) + Number(R3);
      return { R_total: r, R_unit: "Ω" };
    },
    description: "Total resistance of resistors connected in series.",
  },
  {
    id: "resparallel",
    category: "DC Circuits",
    title: "Resistance in Parallel",
    formula: "1/R_total = 1/R₁ + 1/R₂ + 1/R₃",
    inputs: [
      { key: "R1", label: "R₁", unit: "Ω", default: 10 },
      { key: "R2", label: "R₂", unit: "Ω", default: 20 },
      { key: "R3", label: "R₃", unit: "Ω", default: 30 },
    ],
    compute: ({ R1, R2, R3 }) => {
      const inv = 1 / Number(R1) + 1 / Number(R2) + 1 / Number(R3);
      return { R_total: 1 / inv, R_unit: "Ω" };
    },
    description: "Total resistance of resistors connected in parallel.",
  },

  // === ELECTRICAL POWER & ENERGY ===
  {
    id: "pvi",
    category: "Power",
    title: "Electrical Power",
    formula: "P = V × I",
    inputs: [
      { key: "V", label: "Voltage", unit: "V", default: 230 },
      { key: "I", label: "Current", unit: "A", default: 2 },
    ],
    compute: ({ V, I }) => {
      const p = Number(V) * Number(I);
      return { P: p, P_unit: "W" };
    },
    description: "Instantaneous power consumed (Watts).",
  },
  {
    id: "pe",
    category: "Power",
    title: "Electrical Energy",
    formula: "E = P × t",
    inputs: [
      { key: "P", label: "Power", unit: "W", default: 100 },
      { key: "t", label: "Time", unit: "s", default: 60 },
    ],
    compute: ({ P, t }) => {
      const e = Number(P) * Number(t);
      return { E: e, E_unit: "J" };
    },
    description: "Total electrical energy consumed (Joules).",
  },
  {
    id: "pfactor",
    category: "AC Circuits",
    title: "Power Factor",
    formula: "PF = cos(φ)",
    inputs: [{ key: "phi", label: "Phase Angle", unit: "°", default: 30 }],
    compute: ({ phi }) => {
      const pf = Math.cos((Number(phi) * Math.PI) / 180);
      return { PF: pf, PF_unit: "" };
    },
    description: "Power factor for given phase angle φ.",
  },

  // === INDUCTOR ===
  {
    id: "xl",
    category: "AC Circuits",
    title: "Inductive Reactance",
    formula: "X_L = 2π f L",
    inputs: [
      { key: "f", label: "Frequency", unit: "Hz", default: 50 },
      { key: "L", label: "Inductance", unit: "mH", default: 100 },
    ],
    compute: ({ f, L }) => {
      const xl = 2 * Math.PI * Number(f) * (Number(L) / 1000);
      return { X_L: xl, X_unit: "Ω" };
    },
    description: "Reactance of an inductor in an AC circuit (Ohms).",
  },
  {
    id: "el",
    category: "Inductor",
    title: "Energy Stored in Inductor",
    formula: "E = ½ L I²",
    inputs: [
      { key: "L", label: "Inductance", unit: "H", default: 0.1 },
      { key: "I", label: "Current", unit: "A", default: 2 },
    ],
    compute: ({ L, I }) => {
      const e = 0.5 * Number(L) * Number(I) * Number(I);
      return { E: e, E_unit: "J" };
    },
    description: "Energy stored in a magnetic field of an inductor (Joules).",
  },

  // === CAPACITIVE REACTANCE & IMPEDANCE ===
  {
    id: "xc",
    category: "AC Circuits",
    title: "Capacitive Reactance",
    formula: "X_C = 1 / (2π f C)",
    inputs: [
      { key: "f", label: "Frequency", unit: "Hz", default: 50 },
      { key: "C", label: "Capacitance", unit: "μF", default: 10 },
    ],
    compute: ({ f, C }) => {
      const xc = 1 / (2 * Math.PI * Number(f) * (Number(C) * 1e-6));
      return { X_C: xc, X_unit: "Ω" };
    },
    description: "Reactance of a capacitor in AC circuit (Ohms).",
  },
  {
    id: "zrlc",
    category: "AC Circuits",
    title: "Impedance in RLC Circuit",
    formula: "Z = √(R² + (X_L - X_C)²)",
    inputs: [
      { key: "R", label: "Resistance", unit: "Ω", default: 50 },
      { key: "XL", label: "Inductive Reactance", unit: "Ω", default: 100 },
      { key: "XC", label: "Capacitive Reactance", unit: "Ω", default: 20 },
    ],
    compute: ({ R, XL, XC }) => {
      const z = Math.sqrt(
        Number(R) * Number(R) + (Number(XL) - Number(XC)) ** 2
      );
      return { Z: z, Z_unit: "Ω" };
    },
    description: "Net impedance of a series RLC circuit (Ohms).",
  },

  // === TRANSFORMER ===
  {
    id: "turnsratio",
    category: "Transformer",
    title: "Turns Ratio",
    formula: "N₁ / N₂ = V₁ / V₂",
    inputs: [
      { key: "V1", label: "Primary Voltage", unit: "V", default: 230 },
      { key: "V2", label: "Secondary Voltage", unit: "V", default: 12 },
    ],
    compute: ({ V1, V2 }) => {
      const n = Number(V1) / Number(V2);
      return { "N₁/N₂": n, unit: "" };
    },
    description: "Ratio of primary to secondary turns in a transformer.",
  },
  {
    id: "efficiency",
    category: "Transformer",
    title: "Transformer Efficiency",
    formula: "η = (Output Power / Input Power) × 100",
    inputs: [
      { key: "Pout", label: "Output Power", unit: "W", default: 100 },
      { key: "Pin", label: "Input Power", unit: "W", default: 120 },
    ],
    compute: ({ Pout, Pin }) => {
      const eta = (Number(Pout) / Number(Pin)) * 100;
      return { η: eta, η_unit: "%" };
    },
    description: "Efficiency of transformer operation (percentage).",
  },

  // === DIODE & RECTIFIER ===
  {
    id: "vd",
    category: "Diode",
    title: "Diode Voltage Drop",
    formula: "V_D ≈ 0.7V (Si), 0.3V (Ge)",
    inputs: [],
    compute: () => ({ VD: 0.7, VD_unit: "V" }),
    description: "Typical forward voltage drop across a silicon diode.",
  },
  {
    id: "vdc_rect",
    category: "Rectifier",
    title: "Average DC Output of Full-wave Rectifier",
    formula: "V_DC = 0.637 × V_m",
    inputs: [{ key: "Vm", label: "Peak Voltage", unit: "V", default: 10 }],
    compute: ({ Vm }) => {
      const vdc = 0.637 * Number(Vm);
      return { V_DC: vdc, V_unit: "V" };
    },
    description: "Average DC voltage output of a full-wave rectifier.",
  },
  {
    id: "vdc_half",
    category: "Rectifier",
    title: "Average DC Output of Half-wave Rectifier",
    formula: "V_DC = 0.318 × V_m",
    inputs: [{ key: "Vm", label: "Peak Voltage", unit: "V", default: 10 }],
    compute: ({ Vm }) => {
      const vdc = 0.318 * Number(Vm);
      return { V_DC: vdc, V_unit: "V" };
    },
    description: "Average DC voltage output of a half-wave rectifier.",
  },

  // === RLC & FREQUENCY ===
  {
    id: "resonance",
    category: "RLC Circuits",
    title: "Resonant Frequency",
    formula: "f₀ = 1 / (2π√(LC))",
    inputs: [
      { key: "L", label: "Inductance", unit: "H", default: 0.1 },
      { key: "C", label: "Capacitance", unit: "μF", default: 10 },
    ],
    compute: ({ L, C }) => {
      const f0 = 1 / (2 * Math.PI * Math.sqrt(Number(L) * Number(C) * 1e-6));
      return { f0: f0, f_unit: "Hz" };
    },
    description: "Natural resonant frequency of an RLC circuit (Hz).",
  },
  {
    id: "qfactor",
    category: "RLC Circuits",
    title: "Quality Factor",
    formula: "Q = (1/R) × √(L/C)",
    inputs: [
      { key: "R", label: "Resistance", unit: "Ω", default: 100 },
      { key: "L", label: "Inductance", unit: "H", default: 0.1 },
      { key: "C", label: "Capacitance", unit: "μF", default: 10 },
    ],
    compute: ({ R, L, C }) => {
      const q = (1 / Number(R)) * Math.sqrt(Number(L) / (Number(C) * 1e-6));
      return { Q: q, unit: "" };
    },
    description: "Selectivity (sharpness) of an RLC resonance circuit.",
  },

  // === MOTORS & GENERATORS ===
  {
    id: "emfgen",
    category: "Machine",
    title: "EMF Generated in DC Generator",
    formula: "E = (PΦZN) / (60A)",
    inputs: [
      { key: "P", label: "Number of Poles", unit: "", default: 4 },
      { key: "Phi", label: "Flux per Pole", unit: "Wb", default: 0.02 },
      { key: "Z", label: "Total Conductors", unit: "", default: 480 },
      { key: "N", label: "Speed", unit: "rpm", default: 1500 },
      { key: "A", label: "Parallel Paths", unit: "", default: 2 },
    ],
    compute: ({ P, Phi, Z, N, A }) => {
      const e = (Number(P) * Number(Phi) * Number(Z) * Number(N)) / (60 * Number(A));
      return { E: e, E_unit: "V" };
    },
    description: "Generated EMF in a DC generator (Volts).",
  },
  {
    id: "torque",
    category: "Machine",
    title: "Electromagnetic Torque",
    formula: "T = (P × 60) / (2πN)",
    inputs: [
      { key: "P", label: "Power", unit: "W", default: 1000 },
      { key: "N", label: "Speed", unit: "rpm", default: 1500 },
    ],
    compute: ({ P, N }) => {
      const t = (Number(P) * 60) / (2 * Math.PI * Number(N));
      return { T: t, T_unit: "N·m" };
    },
    description: "Electromagnetic torque of a rotating machine (N·m).",
  },

  // === ELECTRIC FIELD & CHARGES ===
  {
    id: "coulomb",
    category: "Electrostatics",
    title: "Coulomb’s Law",
    formula: "F = k q₁ q₂ / r²",
    inputs: [
      { key: "q1", label: "Charge q₁", unit: "μC", default: 5 },
      { key: "q2", label: "Charge q₂", unit: "μC", default: 10 },
      { key: "r", label: "Distance", unit: "m", default: 0.5 },
    ],
    compute: ({ q1, q2, r }) => {
      const k = 9e9;
      const f =
        (k * Number(q1) * 1e-6 * Number(q2) * 1e-6) /
        (Number(r) * Number(r));
      return { F: f, F_unit: "N" };
    },
    description: "Electrostatic force between two point charges (Newtons).",
  },
  {
    id: "efield",
    category: "Electrostatics",
    title: "Electric Field",
    formula: "E = F / q",
    inputs: [
      { key: "F", label: "Force", unit: "N", default: 0.1 },
      { key: "q", label: "Charge", unit: "C", default: 1e-6 },
    ],
    compute: ({ F, q }) => {
      const E = Number(F) / Number(q);
      return { E: E, E_unit: "N/C" };
    },
    description: "Electric field intensity (N/C).",
  },
  {
    id: "potential",
    category: "Electrostatics",
    title: "Electric Potential",
    formula: "V = W / q",
    inputs: [
      { key: "W", label: "Work Done", unit: "J", default: 1 },
      { key: "q", label: "Charge", unit: "C", default: 1e-6 },
    ],
    compute: ({ W, q }) => {
          const v = Number(W) / Number(q);
      return { V: v, V_unit: "V" };
    },
    description: "Potential difference between two points in an electric field (Volts).",
  },

  // === KIRCHHOFF’S LAWS ===
  {
    id: "kcl",
    category: "DC Circuits",
    title: "Kirchhoff’s Current Law (KCL)",
    formula: "Σ I_in = Σ I_out",
    inputs: [
      { key: "Iin", label: "Sum of Incoming Currents", unit: "A", default: 6 },
      { key: "Iout", label: "Sum of Outgoing Currents", unit: "A", default: 4 },
    ],
    compute: ({ Iin, Iout }) => {
      const diff = Number(Iin) - Number(Iout);
      return { "Net Current": diff, I_unit: "A" };
    },
    description: "At any node, algebraic sum of currents is zero.",
  },
  {
    id: "kvl",
    category: "DC Circuits",
    title: "Kirchhoff’s Voltage Law (KVL)",
    formula: "Σ V = 0",
    inputs: [
      { key: "sumV", label: "Sum of Voltage Drops", unit: "V", default: 12 },
      { key: "Vsource", label: "Source Voltage", unit: "V", default: 12 },
    ],
    compute: ({ sumV, Vsource }) => {
      const net = Number(Vsource) - Number(sumV);
      return { "Net Voltage": net, V_unit: "V" };
    },
    description: "In a closed loop, sum of voltage rises equals sum of voltage drops.",
  },

  // === SEMICONDUCTORS ===
  {
    id: "npn_gain",
    category: "Transistor",
    title: "Current Gain of Transistor",
    formula: "β = I_C / I_B",
    inputs: [
      { key: "IC", label: "Collector Current", unit: "mA", default: 20 },
      { key: "IB", label: "Base Current", unit: "mA", default: 0.2 },
    ],
    compute: ({ IC, IB }) => {
      const beta = Number(IC) / Number(IB);
      return { β: beta, unit: "" };
    },
    description: "DC current gain (β) of a BJT transistor.",
  },
  {
    id: "transistor_ie",
    category: "Transistor",
    title: "Emitter Current Relation",
    formula: "I_E = I_B + I_C",
    inputs: [
      { key: "IB", label: "Base Current", unit: "mA", default: 0.2 },
      { key: "IC", label: "Collector Current", unit: "mA", default: 20 },
    ],
    compute: ({ IB, IC }) => {
      const IE = Number(IB) + Number(IC);
      return { I_E: IE, unit: "mA" };
    },
    description: "Emitter current equals sum of base and collector currents.",
  },

  // === LED & PHOTO DEVICES ===
  {
    id: "led_power",
    category: "Optoelectronics",
    title: "LED Electrical Power",
    formula: "P = V × I",
    inputs: [
      { key: "V", label: "Voltage Drop", unit: "V", default: 2 },
      { key: "I", label: "Current", unit: "mA", default: 20 },
    ],
    compute: ({ V, I }) => {
      const p = Number(V) * Number(I) * 1e-3;
      return { P: p, P_unit: "W" };
    },
    description: "Electrical power consumed by an LED (Watts).",
  },
  {
    id: "ldr",
    category: "Optoelectronics",
    title: "LDR Resistance",
    formula: "R = k / L",
    inputs: [
      { key: "k", label: "Constant k", unit: "", default: 5000 },
      { key: "L", label: "Light Intensity", unit: "lux", default: 100 },
    ],
    compute: ({ k, L }) => {
      const r = Number(k) / Number(L);
      return { R: r, R_unit: "Ω" };
    },
    description: "Resistance of an LDR varies inversely with light intensity.",
  },

  // === ALTERNATING CURRENT ===
  {
    id: "irms",
    category: "AC Circuits",
    title: "RMS Current",
    formula: "I_rms = I_m / √2",
    inputs: [{ key: "Im", label: "Peak Current", unit: "A", default: 10 }],
    compute: ({ Im }) => {
      const irms = Number(Im) / Math.sqrt(2);
      return { I_rms: irms, I_unit: "A" };
    },
    description: "Root Mean Square current of a sinusoidal wave (Amps).",
  },
  {
    id: "vrms",
    category: "AC Circuits",
    title: "RMS Voltage",
    formula: "V_rms = V_m / √2",
    inputs: [{ key: "Vm", label: "Peak Voltage", unit: "V", default: 230 }],
    compute: ({ Vm }) => {
      const vrms = Number(Vm) / Math.sqrt(2);
      return { V_rms: vrms, V_unit: "V" };
    },
    description: "Root Mean Square voltage of a sinusoidal wave (Volts).",
  },

  // === ELECTRICAL ENERGY & COST ===
  {
    id: "energy_cost",
    category: "Power",
    title: "Electric Energy Cost",
    formula: "Cost = (P × t × Rate) / 1000",
    inputs: [
      { key: "P", label: "Power", unit: "W", default: 1000 },
      { key: "t", label: "Time", unit: "hr", default: 10 },
      { key: "Rate", label: "Cost Rate", unit: "₹/kWh", default: 8 },
    ],
    compute: ({ P, t, Rate }) => {
      const cost = (Number(P) * Number(t) * Number(Rate)) / 1000;
      return { Cost: cost, unit: "₹" };
    },
    description: "Electricity bill cost for given power and time usage.",
  },
  {
    id: "effmotor",
    category: "Machine",
    title: "Motor Efficiency",
    formula: "η = (Output Power / Input Power) × 100",
    inputs: [
      { key: "Pout", label: "Output Power", unit: "W", default: 800 },
      { key: "Pin", label: "Input Power", unit: "W", default: 1000 },
    ],
    compute: ({ Pout, Pin }) => {
      const eff = (Number(Pout) / Number(Pin)) * 100;
      return { η: eff, η_unit: "%" };
    },
    description: "Efficiency of a DC or AC motor (percentage).",
  },
  {
    id: "pfkw",
    category: "AC Circuits",
    title: "Active Power in AC Circuit",
    formula: "P = V × I × cos(φ)",
    inputs: [
      { key: "V", label: "Voltage", unit: "V", default: 230 },
      { key: "I", label: "Current", unit: "A", default: 5 },
      { key: "phi", label: "Phase Angle", unit: "°", default: 30 },
    ],
    compute: ({ V, I, phi }) => {
      const P = Number(V) * Number(I) * Math.cos((Number(phi) * Math.PI) / 180);
      return { P: P, P_unit: "W" };
    },
    description: "Real power consumed in an AC circuit (Watts).",
  },
  {
    id: "s_apparent",
    category: "AC Circuits",
    title: "Apparent Power",
    formula: "S = V × I",
    inputs: [
      { key: "V", label: "Voltage", unit: "V", default: 230 },
      { key: "I", label: "Current", unit: "A", default: 5 },
    ],
    compute: ({ V, I }) => {
      const S = Number(V) * Number(I);
      return { S: S, S_unit: "VA" };
    },
    description: "Total apparent power in an AC circuit (Volt-Amperes).",
  },
  {
    id: "q_reactive",
    category: "AC Circuits",
    title: "Reactive Power",
    formula: "Q = V × I × sin(φ)",
    inputs: [
      { key: "V", label: "Voltage", unit: "V", default: 230 },
      { key: "I", label: "Current", unit: "A", default: 5 },
      { key: "phi", label: "Phase Angle", unit: "°", default: 30 },
    ],
    compute: ({ V, I, phi }) => {
      const Q = Number(V) * Number(I) * Math.sin((Number(phi) * Math.PI) / 180);
      return { Q: Q, Q_unit: "VAR" };
    },
    description: "Reactive power in AC circuit (Volt-Amperes Reactive).",
  },
  // === RECTIFIER EFFICIENCY ===
  {
    id: "rect_efficiency",
    category: "Rectifier",
    title: "Efficiency of Full-Wave Rectifier",
    formula: "η = (P_DC / P_AC) × 100 = 81.2%",
    inputs: [
      { key: "Vdc", label: "DC Output Voltage", unit: "V", default: 10 },
      { key: "Vac", label: "AC Input Voltage (rms)", unit: "V", default: 12 },
    ],
    compute: ({ Vdc, Vac }) => {
      // Simplified relation η = (Vdc^2 / Vac^2) * 100
      const eta = (Number(Vdc) ** 2 / Number(Vac) ** 2) * 100;
      return { η: eta, η_unit: "%" };
    },
    description:
      "Efficiency of a full-wave rectifier, typically about 81.2% for ideal diodes.",
  },

  // === RC OSCILLATOR FREQUENCY ===
  {
    id: "rc_oscillator",
    category: "Oscillator",
    title: "Frequency of RC Phase Shift Oscillator",
    formula: "f = 1 / (2πRC√6)",
    inputs: [
      { key: "R", label: "Resistance", unit: "kΩ", default: 10 },
      { key: "C", label: "Capacitance", unit: "μF", default: 0.1 },
    ],
    compute: ({ R, C }) => {
      const f =
        1 / (2 * Math.PI * Number(R) * 1e3 * Number(C) * 1e-6 * Math.sqrt(6));
      return { f: f, f_unit: "Hz" };
    },
    description:
      "Frequency of oscillation for a single-transistor RC phase shift oscillator.",
  },

  // === TIME CONSTANT (RC CIRCUIT) ===
  {
    id: "time_constant",
    category: "RC Circuits",
    title: "RC Time Constant",
    formula: "τ = R × C",
    inputs: [
      { key: "R", label: "Resistance", unit: "kΩ", default: 10 },
      { key: "C", label: "Capacitance", unit: "μF", default: 100 },
    ],
    compute: ({ R, C }) => {
      const tau = Number(R) * 1e3 * Number(C) * 1e-6;
      return { τ: tau, τ_unit: "s" };
    },
    description:
      "Time constant of an RC charging/discharging circuit (seconds).",
  },
];

