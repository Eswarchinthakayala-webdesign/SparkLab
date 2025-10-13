// server.js (corrected)
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const PDFDocument = require("pdfkit");
const SVGtoPDF = require("svg-to-pdfkit"); // npm i svg-to-pdfkit
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" })); // increased limit
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// small helper to decode base64 image
function base64ToBuffer(dataURL) {
  if (!dataURL) return null;
  const matches = dataURL.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) return null;
  const mime = matches[1];
  const base64 = matches[2];
  const buf = Buffer.from(base64, "base64");
  return { buf, mime };
}

app.post("/api/generate-report", async (req, res) => {
  try {
    const payload = req.body || {};
    const {
      title = "Lab Report",
      author = "",
      college = "",
      roll = "",
      date = "",
      template = "",
      observations = [],
      procedure = "",
      circuitImageBase64 = null,
      chartSVG = null,
      calculations = "",
      conclusion = "",
      result = "",
    } = payload;

    // Build PDF
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const filenameSafe = (title || "lab-report").replace(/\s+/g, "-").toLowerCase();

    res.setHeader("Content-disposition", `attachment; filename=${filenameSafe}.pdf`);
    res.setHeader("Content-type", "application/pdf");
    doc.pipe(res);

    // --- Header (professional) ---
    const headerHeight = 72;
    doc.rect(doc.x, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, headerHeight).fill("#070707").stroke();

    // college title and report title
    doc.fillColor("#ffd24a").fontSize(18).text(college || "Your College Name", { align: "left" });
    doc.moveUp();
    doc.fillColor("#fff").fontSize(10).text(title || "Lab Report", { align: "left" });

    // author & date on the right (FIXED mismatched quotes)
    doc.fontSize(10).fillColor("#ddd");
    const metaX = doc.page.width - doc.page.margins.right - 200;
    doc.text(`Student: ${author}`, metaX, doc.y - 24, { width: 200 });
    doc.text(`Roll: ${roll}`, metaX, doc.y, { width: 200 });
    doc.text(`Date: ${date}`, metaX, doc.y, { width: 200 });

    doc.moveDown(2);
    doc.fillColor("#fff");

    // Info block
    doc.fontSize(12).fillColor("#ff9a4a").text("Objective", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor("#fff").text(payload.objective || `Objective for ${title}`, { continued: false });

    doc.moveDown(0.8);
    doc.fillColor("#ff9a4a").fontSize(12).text("Apparatus");
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#fff").text((payload.apparatus || "Ammeter, Voltmeter, Resistor, Supply, Wires"), {});

    doc.moveDown(0.8);
    doc.fillColor("#ff9a4a").fontSize(12).text("Procedure");
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#fff");
    (procedure || "Follow the standard experiment procedure.").split("\n").forEach((line) => {
      doc.text("• " + line);
    });

    doc.moveDown(0.6);
    // --- Observations table ---
    doc.fillColor("#ff9a4a").fontSize(12).text("Observation Table");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#fff");

    const tableTop = doc.y;
    const startX = doc.x;
    const colWidths = [80, 80, 80, 80];
    const headers = ["t", "Voltage (V)", "Current (A)", "Remarks"];

    let curX = startX;
    doc.fillColor("#111").rect(curX - 4, tableTop - 6, colWidths.reduce((a,b)=>a+b,0) + 8, 20).fill("#ffb86b").stroke();
    doc.fillColor("#000").fontSize(10);
    headers.forEach((h, i) => {
      doc.text(h, curX, tableTop - 4, { width: colWidths[i], align: "center" });
      curX += colWidths[i];
    });

    doc.moveDown(1.6);
    doc.fontSize(9).fillColor("#fff");
    observations.forEach((row, i) => {
      const y = doc.y;
      let x = startX;
      const cols = [row.t ?? i, row.V ?? "", row.I ?? "", row.remark ?? ""];
      cols.forEach((c, j) => {
        doc.text(String(c), x, y, { width: colWidths[j], align: "center" });
        x += colWidths[j];
      });
      doc.moveDown(1.2);
    });

    doc.addPage();

    // --- Chart embedding if SVG provided
    if (chartSVG) {
      try {
        doc.fontSize(12).fillColor("#ff9a4a").text("Auto-plotted Graph", { underline: true });
        doc.moveDown(0.4);
        const svgWidth = 500;
        const svgHeight = 300;
        SVGtoPDF(doc, chartSVG, doc.x, doc.y, { assumePt: true, width: svgWidth, height: svgHeight });
        doc.moveDown(16);
      } catch (err) {
        console.error("SVG embed failed", err);
        doc.fillColor("#fff").text("Failed to embed chart (server error).");
      }
    } else {
      doc.fontSize(10).fillColor("#fff").text("No chart provided.");
    }

    // Circuit image
    if (circuitImageBase64) {
      const img = base64ToBuffer(circuitImageBase64);
      if (img) {
        try {
          doc.addPage();
          doc.fontSize(12).fillColor("#ff9a4a").text("Circuit Diagram", { underline: true });
          doc.moveDown(0.3);
          doc.image(img.buf, { fit: [420, 320], align: "center" });
          doc.moveDown(1);
        } catch (e) {
          console.error("circuit embed error", e);
          doc.fillColor("#fff").text("Failed to embed circuit image.");
        }
      }
    }

    // calculations & result
    doc.addPage();
    doc.fontSize(12).fillColor("#ff9a4a").text("Calculation", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor("#fff");
    doc.text(calculations || "No calculations provided.").moveDown(1);

    doc.fontSize(12).fillColor("#ff9a4a").text("Result");
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#fff").text(result || "Result placeholder");

    doc.moveDown(0.8);
    doc.fontSize(12).fillColor("#ff9a4a").text("Conclusion / Remarks");
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#fff").text(conclusion || "");

    // signature area
    doc.moveDown(2);
    const signY = doc.y;
    doc.moveTo(doc.x, signY + 30).lineTo(doc.x + 180, signY + 30).stroke("#888");
    doc.text("Student signature", doc.x, signY + 36);
    doc.moveTo(doc.x + 220, signY + 30).lineTo(doc.x + 400, signY + 30).stroke("#888");
    doc.text("Instructor signature", doc.x + 220, signY + 36);

    // footer
    const footerText = "Auto-Generated by BEEE Report Generator";
    doc.fontSize(8).fillColor("#888");
    doc.text(footerText, doc.page.margins.left, doc.page.height - doc.page.margins.bottom - 20, { align: "center", width: doc.page.width - doc.page.margins.left - doc.page.margins.right });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`LabReport PDF server running on http://localhost:${PORT}`);
});
