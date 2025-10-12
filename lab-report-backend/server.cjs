// server.cjs
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const PDFDocument = require("pdfkit");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// Convert base64 image → Buffer
function base64ToBuffer(dataURL) {
  if (!dataURL) return null;
  const match = dataURL.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

// Helper for orange section titles
function sectionTitle(doc, title) {
  doc.moveDown(1);
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor("#ffb84a")
    .text(title, { underline: true });
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).fillColor("#ffffff");
}

// Draw black page background
function drawPageBackground(doc) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#000000");
  doc.restore();
}
function drawFooter(doc) {
  try {
    const footerY = doc.page.height - 36;
    doc.save();
    doc.fontSize(8).fillColor("#777");
    const pageText = `Page ${doc.page.number}`;
    doc.text(pageText, 50, footerY, {
      align: "right",
      width: doc.page.width - 100,
    });
    doc.restore();
  } catch (e) {
    // ignore footer errors
  }
}
app.post("/api/generate-report", async (req, res) => {
  try {
    const payload = req.body || {};
    const {
      title = "Lab Report",
      author = "",
      college = "Your College Name",
      roll = "",
      date = "",
      observations = [],
      chartImageBase64 = null,
      circuitImageBase64 = null,
      calculations = "",
      result = "Auto Result Placeholder",
      objective = "To verify the given experiment.",
      apparatus = "Ammeter, Voltmeter, Resistor, Power Supply, Connecting Wires.",
      description = "Description not provided.",
      procedure = "Connect the circuit as shown.\nIncrease the voltage gradually.\nMeasure current for each voltage.\nPlot V-I graph and calculate resistance.",
      conclusion = "Conclusion not provided.",
    } = payload;

    const doc = new PDFDocument({ size: "A4", margin: 50 });

    // ✅ FIX: automatically reapply dark background for every new page
    doc.on("pageAdded", () => {
      drawPageBackground(doc);
      doc.fillColor("#ffffff");
       drawFooter(doc);
    });

    const fileSafe = title.replace(/\s+/g, "-").toLowerCase();
    res.setHeader("Content-Disposition", `attachment; filename=${fileSafe}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    // PAGE 1: HEADER + DETAILS
    drawPageBackground(doc);

    doc.fillColor("#ffb84a")
      .font("Helvetica-Bold")
      .fontSize(20)
      .text(college, { align: "center" });
    doc.moveDown(0.3);
    doc.fillColor("#ffffff").fontSize(12).text(title, { align: "center" });
    doc.moveDown(0.5);



       // Place metadata text inside box
    doc.fillColor("#bbbbbb").font("Helvetica").fontSize(10);
    const col1X = metaX + 12;
    const col2X = metaX + metaW / 2 + 6;
    let ty = metaY + 10;
    doc.text(`Student: ${author || "-"}`, col1X, ty);
    doc.text(`Roll No: ${roll || "-"}`, col1X, ty + 14);
    doc.text(`Date: ${date || "-"}`, col1X, ty + 28);
    doc.text(`Title ID: ${payload.titleID || "-"}`, col2X, ty);
    doc.text(`Generated: ${new Date().toLocaleString()}`, col2X, ty + 14);
    doc.moveDown(3.5);
    // OBJECTIVE
    sectionTitle(doc, "Objective");
    doc.text(objective || "No objective provided.", { align: "justify" });

    // DESCRIPTION
    sectionTitle(doc, "Description");
    doc.text(description || "No description provided.", {
      align: "justify",
      lineGap: 3,
    });

    // APPARATUS
    sectionTitle(doc, "Apparatus");
    doc.text(apparatus || "No apparatus provided.", { align: "left" });

    // PROCEDURE
    sectionTitle(doc, "Procedure");
    const steps = procedure.split("\n").filter(Boolean);
    if (steps.length > 0) {
      steps.forEach((line) => doc.text("• " + line.trim(), { lineGap: 2 }));
    } else {
      doc.text("Procedure not provided.");
    }

    // PAGE 2: OBSERVATION TABLE
    doc.addPage();
    sectionTitle(doc, "Observation Table");

    const startX = 55;
    const colWidths = [50, 120, 120, 180];
    const headers = ["t", "Voltage (V)", "Current (A)", "Remarks"];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    let y = doc.y;

    // Table header
    doc.rect(startX, y, totalWidth, 20).fill("#ffb84a");
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);
    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x, y + 5, { width: colWidths[i], align: "center" });
      x += colWidths[i];
    });

    // Table rows
    y += 22;
    observations.forEach((row, i) => {
      const bg = i % 2 === 0 ? "#0a0a0a" : "#131313";
      doc.rect(startX, y, totalWidth, 18).fill(bg);
      doc.fillColor("#ffffff").font("Helvetica").fontSize(9);
      const cols = [
        row.t ?? i + 1,
        row.V ?? "",
        row.I ?? "",
        row.remark ?? "",
      ];
      let cellX = startX;
      cols.forEach((val, j) => {
        doc.text(String(val), cellX, y + 4, {
          width: colWidths[j],
          align: "center",
        });
        cellX += colWidths[j];
      });
      y += 18;
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 60;
      }
    });

    // PAGE 3: CHART
    doc.addPage();
    sectionTitle(doc, "Graph (Auto-Plotted)");
    if (chartImageBase64) {
      try {
        const imageBuffer = Buffer.from(chartImageBase64.split(",")[1], "base64");
        doc.image(imageBuffer, {
          fit: [440, 300],
          align: "center",
          valign: "center",
        });
      } catch (err) {
        console.error("Chart image embed failed:", err);
        doc.fillColor("#f55").text("Error rendering chart image.");
      }
    } else {
      doc.fillColor("#bbb").text("No chart image provided.");
    }

    // PAGE 4: CIRCUIT IMAGE
    if (circuitImageBase64) {
      const imgBuf = base64ToBuffer(circuitImageBase64);
      if (imgBuf) {
        doc.addPage();
        sectionTitle(doc, "Circuit Diagram");
        try {
          doc.image(imgBuf, { fit: [440, 300], align: "center", valign: "center" });
        } catch (err) {
          console.error("Image embed failed:", err);
          doc.fillColor("#f55").text("Error displaying circuit image.");
        }
      }
    }

    // PAGE 5: CALCULATIONS / RESULT / CONCLUSION
    doc.addPage();

    sectionTitle(doc, "Calculations");
    doc.text(calculations || "No calculations provided.", {
      align: "justify",
      lineGap: 3,
    });

    sectionTitle(doc, "Result");
    doc.text(result || "No result provided.", {
      align: "justify",
      lineGap: 3,
    });

    sectionTitle(doc, "Conclusion");
    doc.text(conclusion || "No conclusion provided.", {
      align: "justify",
      lineGap: 3,
    });

    // Signatures
    doc.moveDown(2);
    const signY = doc.y + 30;
    doc.moveTo(60, signY).lineTo(220, signY).stroke("#777");
    doc.text("Student Signature", 60, signY + 5);
    doc.moveTo(340, signY).lineTo(500, signY).stroke("#777");
    doc.text("Instructor Signature", 340, signY + 5);

    // Footer
    doc
      .fontSize(8)
      .fillColor("#777")
      .text("Auto-generated by BEEE Lab Report Generator", 0, doc.page.height - 40, {
        align: "center",
      });

    doc.end();
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`✅ LabReport PDF server running at http://localhost:${PORT}`)
);
