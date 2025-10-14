// /pages/api/generate-pdf.js
import PDFDocument from "pdfkit";

export const config = {
  api: {
    bodyParser: { sizeLimit: "20mb" },
  },
};

export default async function handler(req, res) {
  // ✅ Handle preflight CORS request
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).end();
    return;
  }

  // ✅ Allow only POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST method allowed" });
    return;
  }

  try {
    const { title = "Formula Sheet", formulas = [], generatedAt = new Date().toISOString() } = req.body;

    // Setup response
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/pdf");

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => {
      const result = Buffer.concat(chunks);
      res.setHeader("Content-Disposition", `attachment; filename="${title.replace(/\s+/g, "_")}.pdf"`);
      res.send(result);
    });

    // Background
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#000000");

    // Header
    doc.fillColor("#ffb84a").fontSize(20).font("Helvetica-Bold").text("SparkLab — Formula Sheet", { align: "center" });
    doc.moveDown(0.4);
    doc.fillColor("#888").fontSize(10).text(`Generated: ${generatedAt}`, { align: "center" });
    doc.moveDown(1);

    // Content
    formulas.forEach((f, i) => {
      doc.fillColor("#ffb84a").font("Helvetica-Bold").fontSize(14).text(`${i + 1}. ${f.title}`, { underline: true });
      doc.fillColor("#ffd24a").font("Helvetica").fontSize(12).text(f.formula || "", { align: "left" });
      doc.moveDown(0.4);

      if (f.inputs) {
        doc.fillColor("#aaa").font("Helvetica-Oblique").fontSize(10).text("Inputs:");
        Object.entries(f.inputs).forEach(([k, v]) => doc.text(`• ${k}: ${v}`));
      }

      if (f.computed) {
        doc.fillColor("#aaa").font("Helvetica-Oblique").fontSize(10).text("Computed:");
        Object.entries(f.computed)
          .filter(([k]) => !k.endsWith("_unit"))
          .forEach(([k, v]) => {
            const unit = f.computed[`${k}_unit`] || "";
            doc.text(`• ${k}: ${v} ${unit}`);
          });
      }

      doc.moveDown(0.5);
      doc.strokeColor("#222").moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
      doc.moveDown(0.5);
    });

    doc.end();
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "PDF generation failed" });
  }
}
