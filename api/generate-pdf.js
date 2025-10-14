// api/generate-pdf.js  (Node / Vercel serverless)
const PDFDocument = require("pdfkit");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const payload = req.body;
    // create PDF in memory
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const result = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="formulasheet-${Date.now()}.pdf"`);
      res.send(result);
    });

    // Header
    doc.fontSize(18).fillColor("#ff7a2d").text("SparkLab — Formula Sheet", { continued: false });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#999").text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown(0.5);

    // Body
    const formulas = Array.isArray(payload.formulas) ? payload.formulas : [];
    for (let i = 0; i < formulas.length; i++) {
      const f = formulas[i];
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor("#ffd24a").text(`${f.title} (${f.category})`);
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor("#fff").text(f.formula);
      doc.moveDown(0.2);

      if (f.inputs) {
        doc.fontSize(9).fillColor("#ccc").text("Inputs:");
        Object.entries(f.inputs).forEach(([k, v]) => {
          doc.text(`  ${k}: ${v}`);
        });
      }

      if (f.computed) {
        doc.fontSize(9).fillColor("#ccc").text("Computed:");
        Object.entries(f.computed).forEach(([k, v]) => {
          if (k.endsWith("_unit")) return;
          const unit = f.computed[`${k}_unit`] || "";
          doc.text(`  ${k}: ${Number.isFinite(v) ? Number(v) : v} ${unit}`);
        });
      }
      doc.moveDown(0.5);
      doc.strokeColor("#222").lineWidth(0.2).moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.options.margins.right, doc.y).stroke();
    }

    doc.end();
  } catch (err) {
    console.error("PDF generation error", err);
    res.status(500).json({ error: "PDF generation failed" });
  }
};
