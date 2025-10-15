// /pages/api/generate-pdf.js
import PDFDocument from "pdfkit";

// ✅ Allow large payloads (for base64 images)
export const config = {
  api: {
    bodyParser: { sizeLimit: "50mb" },
  },
};

// -------------------------------------------------------------
// 🧩 Helper: Convert base64 → Buffer
function base64ToBuffer(dataURL) {
  if (!dataURL) return null;
  const match = dataURL.match(/^data:(image\/\\w+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

// -------------------------------------------------------------
// 🧩 Page Layout (Dark Theme)
function drawPageLayout(doc) {
  // Full dark background
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0b0b0b");
  doc.restore();

  const margin = 25;
  const w = doc.page.width - margin * 2;
  const h = doc.page.height - margin * 2;
  doc.lineWidth(0.8).strokeColor("#222").rect(margin, margin, w, h).stroke();
}

// 🧩 Header
function drawHeader(doc, title, generatedAt) {
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#ffb84a");
  doc.text("⚡ SparkLab — Formula Report", { align: "center" });
  doc.moveDown(0.3);

  doc.font("Helvetica").fontSize(9).fillColor("#aaaaaa");
  doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}`, {
    align: "center",
  });

  doc.moveDown(0.6);
  const y = doc.y;
  doc.strokeColor("#333").lineWidth(0.5).moveTo(40, y).lineTo(doc.page.width - 40, y).stroke();
  doc.moveDown(1);
}

// 🧩 Footer with Page Number
function drawFooter(doc) {
  const bottomY = doc.page.height - 40;
  doc.font("Helvetica-Oblique").fontSize(9).fillColor("#777");
  doc.text("Generated automatically by SparkLab AI Formula Suite", 0, bottomY, {
    align: "center",
  });

  // Page number at bottom-right
  const pageNum = doc.page.bufferedPageRange().count
    ? doc.page.bufferedPageRange().start + doc.page.bufferedPageRange().count
    : doc.page.number;
  doc.font("Helvetica").fontSize(9).fillColor("#666");
  doc.text(`Page ${doc.page.number}`, doc.page.width - 80, bottomY, {
    align: "left",
  });
}

// 🧩 Section Title
function sectionTitle(doc, text) {
  ensurePageSpace(doc, 50);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#ffb84a");
  doc.text(text.toUpperCase(), { underline: true });
  doc.moveDown(0.3);
}

// 🧩 Ensure space on current page before writing
function ensurePageSpace(doc, spaceNeeded = 80) {
  const maxY = doc.page.height - 100;
  if (doc.y + spaceNeeded > maxY) {
    doc.addPage();
    drawPageLayout(doc);
    drawHeader(doc, "SparkLab — Formula Report", new Date().toISOString());
    drawFooter(doc);
    doc.moveDown(1);
  }
}

// 🧩 Safe text rendering with color reset
function safeText(doc, text, options = {}) {
  ensurePageSpace(doc, 20);
  doc.font("Helvetica").fontSize(10).fillColor("#e0e0e0");
  doc.text(text, options);
}

// -------------------------------------------------------------
// ✅ Main Handler
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST method allowed" });

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

    const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: true });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${title.replace(/\s+/g, "_")}.pdf"`
    );
    doc.pipe(res);

    // -------------------------------------------------------------
    // First Page Layout
    drawPageLayout(doc);
    drawHeader(doc, title, generatedAt);

    // Formula Header
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffb84a");
    doc.text(formula);
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#cccccc");
    doc.text(`Category: ${category}`);
    doc.moveDown(0.5);
    doc.strokeColor("#333").lineWidth(0.3).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(1);

    // -------------------------------------------------------------
    // Inputs
    if (Object.keys(inputs).length > 0) {
      sectionTitle(doc, "Inputs");
      for (const [key, val] of Object.entries(inputs)) {
        safeText(doc, `• ${key}: ${val}`);
      }
      doc.moveDown(0.6);
    }

    // Computed Values
    if (Object.keys(computed).length > 0) {
      sectionTitle(doc, "Computed Values");
      Object.entries(computed)
        .filter(([k]) => !k.endsWith("_unit"))
        .forEach(([k, v]) => {
          const unit = computed[`${k}_unit`] || "";
          safeText(doc, `• ${k}: ${v} ${unit}`);
        });
      doc.moveDown(0.6);
    }

    // AI Summary
    if (aiSummary) {
      sectionTitle(doc, "AI Summary");
      safeText(doc, aiSummary, {
        align: "justify",
        width: doc.page.width - 100,
      });
      doc.moveDown(0.8);
    }

    // AI Detailed Explanation
    if (aiDetail) {
      sectionTitle(doc, "AI Detailed Explanation");
      safeText(doc, aiDetail, {
        align: "justify",
        width: doc.page.width - 100,
      });
      doc.moveDown(0.8);
    }

    // -------------------------------------------------------------
    // Image Section (centered, responsive)
    if (visualImage && visualImage.startsWith("data:image/")) {
      try {
        const buf = base64ToBuffer(visualImage);
        ensurePageSpace(doc, 220);
        const imgMaxWidth = doc.page.width - 100;
        const imgMaxHeight = 200;

        const x = (doc.page.width - imgMaxWidth) / 2;
        doc.image(buf, x, doc.y, {
          fit: [imgMaxWidth, imgMaxHeight],
          align: "center",
          valign: "center",
        });
        doc.strokeColor("#444").lineWidth(1).rect(x, doc.y, imgMaxWidth, imgMaxHeight).stroke();
        doc.moveDown(12);
      } catch (err) {
        console.error("Image embedding failed:", err.message);
        doc.fillColor("#f55").text("⚠️ Unable to render visual image.");
      }
    }

    // -------------------------------------------------------------
    // Final Divider + Footer
    ensurePageSpace(doc, 60);
    doc.strokeColor("#333").lineWidth(0.5).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(1.5);
    drawFooter(doc);

    // Ensure background + footer for every new page
    doc.on("pageAdded", () => {
      drawPageLayout(doc);
      drawHeader(doc, title, generatedAt);
      drawFooter(doc);
    });

    doc.end();
  } catch (err) {
    console.error("❌ PDF generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "PDF generation failed",
        details: err.message || err.toString(),
      });
    }
  }
}
