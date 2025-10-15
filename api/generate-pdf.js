// /pages/api/generate-pdf.js
import PDFDocument from "pdfkit";

// ===========================================================
// ✅ CONFIG — Node.js runtime + large base64 payloads
// ===========================================================
export const config = {

  api: {
    bodyParser: { sizeLimit: "100mb" },
  },
};

// ===========================================================
// 🧩 Helper Functions
// ===========================================================

// Convert base64 → Buffer safely
function base64ToBuffer(dataURL) {
  if (!dataURL) return null;
  const match = dataURL.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

// Draw page background + elegant border
function drawPageLayout(doc) {
  const { width, height } = doc.page;

  // Dark gradient background
  const gradient = doc.linearGradient(0, 0, 0, height);
  gradient.stop(0, "#080808").stop(1, "#0e0e0e");
  doc.rect(0, 0, width, height).fill(gradient);

  // Outer border
  doc.lineWidth(2).strokeColor("#444");
  doc.rect(15, 15, width - 30, height - 30).stroke();

  // Inner glow border
  doc.lineWidth(0.5).strokeColor("#2b2b2b");
  doc.rect(25, 25, width - 50, height - 50).stroke();
}

// Page header
function drawHeader(doc, title, generatedAt) {
  const w = doc.page.width;
  const y = 40;

  // Decorative line
  doc.save();
  doc.lineWidth(1).strokeColor("#ffb84a");
  doc.moveTo(60, y + 25).lineTo(w - 60, y + 25).stroke();
  doc.restore();

  // Title
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#ffd24a");
  doc.text("⚡ SparkLab — Formula Intelligence Report ⚡", 0, y, {
    align: "center",
  });

  // Date
  doc.font("Helvetica").fontSize(10).fillColor("#bbb");
  doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}`, 0, y + 30, {
    align: "center",
  });

  doc.moveDown(1.2);
}

// Footer watermark
function drawFooter(doc) {
  const y = doc.page.height - 50;
  doc.font("Helvetica-Oblique").fontSize(9).fillColor("#777");
  doc.text("Generated automatically by SparkLab AI Formula Suite © 2025", 0, y, {
    align: "center",
  });

  // Bottom glowing line
  doc.lineWidth(0.5).strokeColor("#333");
  doc.moveTo(60, y - 10).lineTo(doc.page.width - 60, y - 10).stroke();
}

// Section title styling
function sectionTitle(doc, text) {
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#ffd24a");
  doc.text(text.toUpperCase(), {
    underline: true,
    align: "left",
  });
  doc.moveDown(0.3);
}

// Subtle divider
function divider(doc) {
  doc.strokeColor("#333").lineWidth(0.6);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
  doc.moveDown(0.8);
}

// ===========================================================
// ✅ MAIN HANDLER
// ===========================================================
export default async function handler(req, res) {
  // Always set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

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

    const doc = new PDFDocument({ size: "A4", margin: 40 });

    // ✅ Stream PDF directly to response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${title.replace(/\s+/g, "_")}.pdf"`
    );
    doc.pipe(res);

    const TEXT_WIDTH = doc.page.width - 80;

    // Register event *before* any content
    doc.on("pageAdded", () => {
      drawPageLayout(doc);
      drawHeader(doc, title, generatedAt);
      drawFooter(doc);
    });

    // First page layout
    drawPageLayout(doc);
    drawHeader(doc, title, generatedAt);

    // =======================================================
    // 🧠 Formula Section
    // =======================================================
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#ffb84a");
    doc.text(formula, { width: TEXT_WIDTH });
    doc.moveDown(0.3);

    doc.font("Helvetica").fontSize(10).fillColor("#ccc");
    doc.text(`Category: ${category}`, { width: TEXT_WIDTH });
    divider(doc);

    // =======================================================
    // 🔹 Inputs
    // =======================================================
    if (Object.keys(inputs).length > 0) {
      sectionTitle(doc, "Inputs");
      Object.entries(inputs).forEach(([key, val]) => {
        doc.font("Helvetica").fontSize(10).fillColor("#ddd");
        doc.text(`• ${key}: ${val}`, { width: TEXT_WIDTH });
      });
      divider(doc);
    }

    // =======================================================
    // 🔹 Computed Values
    // =======================================================
    if (Object.keys(computed).length > 0) {
      sectionTitle(doc, "Computed Values");
      Object.entries(computed)
        .filter(([k]) => !k.endsWith("_unit"))
        .forEach(([k, v]) => {
          const unit = computed[`${k}_unit`] || "";
          doc.font("Helvetica").fontSize(10).fillColor("#ddd");
          doc.text(`• ${k}: ${v} ${unit}`, { width: TEXT_WIDTH });
        });
      divider(doc);
    }

    // =======================================================
    // 🧩 AI Summary
    // =======================================================
    if (aiSummary) {
      sectionTitle(doc, "AI Summary");
      doc.font("Helvetica").fontSize(10).fillColor("#eee");
      doc.text(aiSummary, {
        align: "justify",
        width: TEXT_WIDTH,
      });
      divider(doc);
    }

    // =======================================================
    // 🧩 AI Detailed Explanation
    // =======================================================
    if (aiDetail) {
      sectionTitle(doc, "AI Detailed Explanation");
      doc.font("Helvetica").fontSize(10).fillColor("#ccc");
      doc.text(aiDetail, {
        align: "justify",
        width: TEXT_WIDTH,
      });
      divider(doc);
    }

    // =======================================================
    // 🧩 Visual Image
    // =======================================================
    if (visualImage && visualImage.startsWith("data:image/")) {
      try {
        const buf = base64ToBuffer(visualImage);
        const marginX = 50;
        const imgW = doc.page.width - marginX * 2;
        const imgH = 200;

        // Add new page if not enough space left
        if (doc.y + imgH + 60 > doc.page.height - 60) {
          doc.addPage();
        }

        const x = (doc.page.width - imgW) / 2;
        const y = doc.y + 10;

        // Image frame shadow
        doc.save();
        doc.rect(x - 2, y - 2, imgW + 4, imgH + 4).fill("#111").stroke();
        doc.restore();

        // Actual image
        doc.image(buf, x, y, { width: imgW, height: imgH });

        // Decorative border
        doc.strokeColor("#555").lineWidth(1.2).rect(x, y, imgW, imgH).stroke();
        doc.moveDown(13);
      } catch (err) {
        console.error("Image embedding failed:", err.message);
        doc.fillColor("#f55").text("⚠️ Unable to render visual image.", {
          width: TEXT_WIDTH,
        });
      }
    }

    // =======================================================
    // 🔹 Closing line
    // =======================================================
    divider(doc);
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#999");
    doc.text(
      "End of Report • Thank you for using SparkLab AI Formula Suite",
      { align: "center", width: TEXT_WIDTH }
    );

    drawFooter(doc);
    doc.end();
  } catch (err) {
    console.error("❌ PDF generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "PDF generation failed",
        message: err.message || String(err),
      });
    }
  }
}
