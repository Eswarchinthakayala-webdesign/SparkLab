// /pages/api/generate-pdf.js
import PDFDocument from "pdfkit";

export const config = {
  api: { bodyParser: { sizeLimit: "50mb" } }, // support large base64 image
};

// Helper: convert base64 → Buffer
function base64ToBuffer(dataURL) {
  if (!dataURL) return null;
  const match = dataURL.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

// Helper: draw background and border
function drawPageLayout(doc) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#050505");
  doc.restore();

  const margin = 25;
  const w = doc.page.width - margin * 2;
  const h = doc.page.height - margin * 2;
  doc.lineWidth(1).strokeColor("#333").rect(margin, margin, w, h).stroke();
}

// Header
function drawHeader(doc, title, generatedAt) {
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#ffb84a");
  doc.text("SparkLab — Formula Report", { align: "center" });
  doc.moveDown(0.2);

  doc.font("Helvetica").fontSize(10).fillColor("#aaa");
  doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}`, { align: "center" });
  doc.moveDown(0.6);
  doc.strokeColor("#222").lineWidth(0.5).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
  doc.moveDown(1);
}

// Footer
function drawFooter(doc) {
  const y = doc.page.height - 40;
  doc.font("Helvetica-Oblique").fontSize(9).fillColor("#777");
  doc.text("Generated automatically by SparkLab AI Formula Suite", 0, y, { align: "center" });
}

// Section Title
function sectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#ffd24a").text(text, { underline: true });
  doc.moveDown(0.3);
}

// ✅ Main handler
export default async function handler(req, res) {
  // Handle CORS
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST method allowed" });
    return;
  }

  try {
    const {
      title = "Formula Report - SparkLab",
      generatedAt = new Date().toISOString(),
      formula = "Unknown Formula",
      category = "General",
      inputs = {},
      computed = {},
      aiSummary = "",
      aiDetail = "",
      visualImage = null,
    } = req.body || {};

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/pdf");

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader("Content-Disposition", `attachment; filename="${title.replace(/\s+/g, "_")}.pdf"`);
      res.send(pdf);
    });

    // ✅ Redraw dark theme for each page
    doc.on("pageAdded", () => {
      drawPageLayout(doc);
      drawFooter(doc);
    });

    // First page layout
    drawPageLayout(doc);
    drawHeader(doc, title, generatedAt);

    // Formula info
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffb84a").text(formula, { align: "left" });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#ccc").text(`Category: ${category}`);
    doc.moveDown(0.4);
    doc.strokeColor("#333").lineWidth(0.3).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(0.6);

    // Inputs
    if (Object.keys(inputs).length > 0) {
      sectionTitle(doc, "Inputs");
      Object.entries(inputs).forEach(([key, val]) => {
        doc.font("Helvetica").fontSize(10).fillColor("#ddd").text(`• ${key}: ${val}`);
      });
      doc.moveDown(0.6);
    }

    // Computed Values
    if (Object.keys(computed).length > 0) {
      sectionTitle(doc, "Computed Values");
      Object.entries(computed)
        .filter(([k]) => !k.endsWith("_unit"))
        .forEach(([k, v]) => {
          const unit = computed[`${k}_unit`] || "";
          doc.font("Helvetica").fontSize(10).fillColor("#ddd").text(`• ${k}: ${v} ${unit}`);
        });
      doc.moveDown(0.6);
    }

    // AI Summary
    if (aiSummary) {
      sectionTitle(doc, "AI Summary");
      doc.font("Helvetica").fontSize(10).fillColor("#eee").text(aiSummary, {
        align: "justify",
        width: doc.page.width - 80,
      });
      doc.moveDown(0.5);
    }

    // AI Detailed Explanation
    if (aiDetail) {
      sectionTitle(doc, "AI Detailed Explanation");
      doc.font("Helvetica").fontSize(10).fillColor("#ccc").text(aiDetail, {
        align: "justify",
        width: doc.page.width - 80,
      });
      doc.moveDown(0.6);
    }

    // Visual image (optional)
    if (visualImage) {
      try {
        const buf = base64ToBuffer(visualImage);
        const imgW = doc.page.width - 100;
        const imgH = 180;
        const y = doc.y + 10;

        doc.image(buf, 50, y, { width: imgW, height: imgH });
        doc.strokeColor("#444").lineWidth(1).rect(50, y, imgW, imgH).stroke();
        doc.moveDown(12);
      } catch (err) {
        console.error("Image embedding failed:", err.message);
        doc.fillColor("#f55").text("⚠️ Unable to render visual image.");
      }
    }

    // Divider and footer
    doc.moveDown(1);
    doc.strokeColor("#333").lineWidth(0.5).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(1);
    drawFooter(doc);

    doc.end();
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "PDF generation failed" });
  }
}
