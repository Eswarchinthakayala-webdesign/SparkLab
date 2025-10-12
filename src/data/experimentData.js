// src/data/experimentData.js
export const experimentData = {
  "ohms-law": {
    title: "Verification of Ohm's Law",
    defaultObservations: [
      { t: 1, V: "1.0", I: "0.1", remark: "" },
      { t: 2, V: "2.0", I: "0.2", remark: "" },
      { t: 3, V: "3.0", I: "0.3", remark: "" },
      { t: 4, V: "4.0", I: "0.4", remark: "" },
      { t: 5, V: "5.0", I: "0.5", remark: "" },
    ],
    chartType: "line",
  },
  "resistivity": {
    title: "Determination of Resistivity of Wire",
    defaultObservations: [
      { t: 1, V: "0.5", I: "0.1", remark: "" },
      { t: 2, V: "1.0", I: "0.2", remark: "" },
      { t: 3, V: "1.5", I: "0.3", remark: "" },
      { t: 4, V: "2.0", I: "0.4", remark: "" },
    ],
    chartType: "line",
  },
  "rc-time": {
    title: "Charging and Discharging of Capacitor (RC Time Constant)",
    defaultObservations: [
      { t: 1, V: "5.0", I: "0.01", remark: "" },
      { t: 2, V: "3.0", I: "0.006", remark: "" },
      { t: 3, V: "1.5", I: "0.004", remark: "" },
    ],
    chartType: "exponential",
  },
};
