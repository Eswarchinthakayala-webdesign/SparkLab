// /pages/api/generate-pdf.js
import PDFDocument from "pdfkit";

export const config = {
  api: {
    bodyParser: { sizeLimit: "30mb" }, // Allow large image payloads
  },
};

export default async function handler(req, res) {
  // ✅ Handle preflight CORS
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).end();
    return;
  }

  // ✅ Only POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST method allowed" });
    return;
  }

  try {
    const {
      title = "Formula Report - SparkLab",
      generatedAt = new Date().toISOString(),
      formulas = [],
    } = req.body;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/pdf");

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const result = Buffer.concat(chunks);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${title.replace(/\s+/g, "_")}.pdf"`
      );
      res.send(result);
    });

    /* ---------- BACKGROUND ---------- */
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#000");
    doc.fillColor("#ffb84a").font("Helvetica-Bold").fontSize(22);
    doc.text("SparkLab — Formula Report", { align: "center" });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor("#888")
      .text(`Generated: ${new Date(generatedAt).toLocaleString()}`, {
        align: "center",
      });
    doc.moveDown(1);

    /* ---------- MAIN CONTENT ---------- */
    formulas.forEach((f, i) => {
      const startY = doc.y;

      // Section header
      doc
        .fillColor("#ffb84a")
        .font("Helvetica-Bold")
        .fontSize(14)
        .text(`${i + 1}. ${f.title || "Untitled Formula"}`, {
          underline: true,
        });

      if (f.category) {
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#ffd24a")
          .text(`Category: ${f.category}`, { continued: false });
      }

      if (f.formula) {
        doc
          .font("Helvetica-BoldOblique")
          .fontSize(12)
          .fillColor("#ffaa4a")
          .text(f.formula);
      }

      doc.moveDown(0.4);

      // Inputs
      if (f.inputs && Object.keys(f.inputs).length > 0) {
        doc
          .fillColor("#aaa")
          .font("Helvetica-Oblique")
          .fontSize(10)
          .text("Inputs:");
        Object.entries(f.inputs).forEach(([k, v]) => {
          doc.font("Helvetica").fillColor("#ccc").text(`• ${k}: ${v}`);
        });
        doc.moveDown(0.3);
      }

      // Computed
      if (f.computed && Object.keys(f.computed).length > 0) {
        doc
          .fillColor("#aaa")
          .font("Helvetica-Oblique")
          .fontSize(10)
          .text("Computed:");
        Object.entries(f.computed)
          .filter(([k]) => !k.endsWith("_unit"))
          .forEach(([k, v]) => {
            const unit = f.computed[`${k}_unit`] || "";
            doc.font("Helvetica").fillColor("#ccc").text(`• ${k}: ${v} ${unit}`);
          });
        doc.moveDown(0.5);
      }

      // AI Summary
      if (f.aiSummary) {
        doc
          .fillColor("#ffb84a")
          .font("Helvetica-Bold")
          .fontSize(11)
          .text("AI Summary:");
        doc
          .font("Helvetica")
          .fillColor("#e0e0e0")
          .fontSize(10)
          .text(f.aiSummary, {
            width: doc.page.width - 80,
            align: "justify",
          });
        doc.moveDown(0.5);
      }

      // AI Detailed Explanation
      if (f.aiDetail) {
        doc
          .fillColor("#ffb84a")
          .font("Helvetica-Bold")
          .fontSize(11)
          .text("AI Detailed Explanation:");
        doc
          .font("Helvetica")
          .fillColor("#ccc")
          .fontSize(10)
          .text(f.aiDetail, {
            width: doc.page.width - 80,
            align: "justify",
          });
        doc.moveDown(0.5);
      }

      // Visual Image (base64)
      if (f.visualImage) {
        try {
          const imageBase64 = f.visualImage.replace(/^data:image\/\w+;base64,/, "");
          const imageBuffer = Buffer.from(imageBase64, "base64");
          const maxWidth = doc.page.width - 100;
          const imgHeight = 200;
          doc.moveDown(0.4);
          doc
            .image(imageBuffer, 50, doc.y, {
              width: maxWidth,
              height: imgHeight,
              align: "center",
            })
            .strokeColor("#222")
            .lineWidth(1)
            .rect(50, doc.y - 2, maxWidth, imgHeight + 4)
            .stroke();
          doc.moveDown(0.5);
        } catch (err) {
          console.error("Image embedding failed:", err.message);
          doc.fillColor("#f55").text("⚠️ Failed to render visual image.");
          doc.moveDown(0.5);
        }
      }

      // Section divider
      doc
        .strokeColor("#333")
        .moveTo(40, doc.y)
        .lineTo(doc.page.width - 40, doc.y)
        .stroke();
      doc.moveDown(1);

      // Page break if near bottom
      if (doc.y > doc.page.height - 150) {
        doc.addPage();
      }
    });

    /* ---------- FOOTER ---------- */
    doc.moveDown(1);
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor("#777")
      .text("Generated automatically by SparkLab AI Formula Suite.", {
        align: "center",
      });

    doc.end();
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "PDF generation failed" });
  }
}
