// /pages/api/generate-pdf.js
import PDFDocument from "pdfkit";

// ✅ Allow larger request body (for base64 images)
export const config = {
  api: {
    bodyParser: { sizeLimit: "50mb" },
  },
};

// -------------------------------------------------------------
// 🧩 Helper: Convert base64 → Buffer
function base64ToBuffer(dataURL) {
  if (!dataURL) return null;
  const match = dataURL.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

// -------------------------------------------------------------
// 🧩 Page Layout (Dark Theme)
function drawPageLayout(doc) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#050505");
  doc.restore();

  const margin = 25;
  const w = doc.page.width - margin * 2;
  const h = doc.page.height - margin * 2;
  doc.lineWidth(0.5).strokeColor("#333").rect(margin, margin, w, h).stroke();
}

// 🧩 Header
function drawHeader(doc, title, generatedAt) {
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#ffb84a");
  doc.text("SparkLab — Formula Report", { align: "center" });
  doc.moveDown(0.25);

  doc.font("Helvetica").fontSize(9).fillColor("#aaa");
  doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}`, {
    align: "center",
  });

  doc.moveDown(0.5);
  const lineY = doc.y;
  doc.strokeColor("#333").lineWidth(0.5).moveTo(40, lineY).lineTo(doc.page.width - 40, lineY).stroke();
  doc.moveDown(1);
  doc.fillColor("#ddd"); // ✅ Reset color after header
}

// 🧩 Footer
function drawFooter(doc) {
  const y = doc.page.height - 40;
  doc.font("Helvetica-Oblique").fontSize(9).fillColor("#777");
  doc.text("Generated automatically by SparkLab AI Formula Suite", 0, y, {
    align: "center",
  });
  doc.fillColor("#ddd"); // ✅ Reset color for next page
}

// 🧩 Section Title
function sectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#ffd24a");
  doc.text(text.toUpperCase(), { underline: true });
  doc.moveDown(0.3);
  doc.fillColor("#ddd"); // ✅ Reset to readable grey after orange title
}

// 🧩 Smart text rendering (auto page break)
function writeText(doc, text, options = {}) {
  const maxY = doc.page.height - 100; // Keep footer space
  if (doc.y > maxY) {
    doc.addPage();
    drawPageLayout(doc);
    drawHeader(doc, "", new Date().toISOString());
    drawFooter(doc);
  }
  doc.text(text, options);
}

// -------------------------------------------------------------
// ✅ Main Handler
export default async function handler(req, res) {
  // ✅ CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Allow", "POST, OPTIONS");

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

    // ✅ Create new PDF
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      autoFirstPage: true,
    });

    // ✅ Stream PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${title.replace(/\s+/g, "_")}.pdf"`
    );
    doc.pipe(res);

    // -------------------------------------------------------------
    // 🧱 Initial Layout
    drawPageLayout(doc);
    drawHeader(doc, title, generatedAt);
      doc.on("pageAdded", () => {
      drawPageLayout(doc);
      doc.fillColor("#ddd");
    });
    // Formula Header
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffb84a");
    writeText(doc, formula);
    doc.moveDown(0.3);

    doc.font("Helvetica").fontSize(10).fillColor("#ccc");
    writeText(doc, `Category: ${category}`);
    doc.moveDown(0.4);

    doc.strokeColor("#333").lineWidth(0.3).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(0.8);
    doc.fillColor("#ddd");

    // -------------------------------------------------------------
    // 🧩 Inputs
    if (Object.keys(inputs).length > 0) {
      sectionTitle(doc, "Inputs");
      Object.entries(inputs).forEach(([key, val]) => {
        writeText(doc, `• ${key}: ${val}`, {
          font: "Helvetica",
          fontSize: 10,
          fillColor: "#ddd",
        });
      });
      doc.moveDown(0.8);
    }

    // -------------------------------------------------------------
    // 🧩 Computed Values
    if (Object.keys(computed).length > 0) {
      sectionTitle(doc, "Computed Values");
      Object.entries(computed)
        .filter(([k]) => !k.endsWith("_unit"))
        .forEach(([k, v]) => {
          const unit = computed[`${k}_unit`] || "";
          writeText(doc, `• ${k}: ${v} ${unit}`, {
            font: "Helvetica",
            fontSize: 10,
            fillColor: "#ddd",
          });
        });
      doc.moveDown(0.8);
    }

    // -------------------------------------------------------------
    // 🧩 AI Summary
    if (aiSummary) {
      sectionTitle(doc, "AI Summary");
      writeText(doc, aiSummary, {
        align: "justify",
        width: doc.page.width - 100,
        font: "Helvetica",
        fontSize: 10,
        fillColor: "#eee",
      });
      doc.moveDown(0.8);
    }

    // -------------------------------------------------------------
    // 🧩 AI Detailed Explanation
    if (aiDetail) {
      sectionTitle(doc, "AI Detailed Explanation");
      writeText(doc, aiDetail, {
        align: "justify",
        width: doc.page.width - 100,
        font: "Helvetica",
        fontSize: 10,
        fillColor: "#ccc",
      });
      doc.moveDown(0.8);
    }

    // -------------------------------------------------------------
    // 🧩 Optional Visual Image
    if (visualImage && visualImage.startsWith("data:image/")) {
      try {
        const buf = base64ToBuffer(visualImage);
        const imgMaxWidth = doc.page.width - 100;
        const imgMaxHeight = 200;
        const imgY = doc.y + 10;

        // Ensure enough space or add new page
        if (imgY + imgMaxHeight > doc.page.height - 100) {
          doc.addPage();
          drawPageLayout(doc);
          drawHeader(doc, "", new Date().toISOString());
          drawFooter(doc);
        }

        const x = (doc.page.width - imgMaxWidth) / 2;
        doc.image(buf, x, doc.y, {
          fit: [imgMaxWidth, imgMaxHeight],
          align: "center",
          valign: "center",
        });
        doc.strokeColor("#444").lineWidth(1).rect(x, doc.y, imgMaxWidth, imgMaxHeight).stroke();
        doc.moveDown(10);
      } catch (err) {
        console.error("Image embedding failed:", err.message);
        doc.fillColor("#f55").text("⚠️ Unable to render visual image.");
      }
    }

    // -------------------------------------------------------------
    // Footer + Divider
    doc.moveDown(1);
    doc.strokeColor("#333").lineWidth(0.5).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(1);
   

    // -------------------------------------------------------------
    // Handle new pages automatically
  

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
