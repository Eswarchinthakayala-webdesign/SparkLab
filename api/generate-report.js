// /pages/api/generate-report.js
import PDFDocument from "pdfkit";

export const config = {
  api: {
    bodyParser: { sizeLimit: "40mb" },
  },
};

// Draws a full-page black background
function drawPageBackground(doc) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#000000");
  doc.restore();
}

// Draws a thin border on the current page
function drawPageBorder(doc) {
  const margin = 24;
  const width = doc.page.width - margin * 2;
  const height = doc.page.height - margin * 2;
  doc
    .save()
    .lineWidth(0.8)
    .strokeColor("#444")
    .rect(margin, margin, width, height)
    .stroke()
    .restore();
}

// Section title style
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST method allowed" });
    return;
  }

  try {
    const {
      title = "Lab Report",
      author = "",
      college = "",
      date = "",
      observations = [],
      chartImageBase64 = null,
      circuitImageBase64 = null,
      calculations = {},
      objective = "",
      apparatus = "",
      description = "",
      procedure = "",
      conclusion = "",
    } = req.body || {};

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${title.replace(/\s+/g, "-")}.pdf"`
    );

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => res.send(Buffer.concat(chunks)));

    // PAGE 1 — Cover + Intro
    drawPageBackground(doc);
    drawPageBorder(doc);

    doc.fillColor("#ffb84a").font("Helvetica-Bold").fontSize(22);
    doc.text(college || "Your College Name", { align: "center" });
    doc.moveDown(0.4);
    doc.fillColor("#ffffff").fontSize(14).text(title, { align: "center" });
    doc.moveDown(1.5);

    // Info block
    doc.fontSize(10).fillColor("#bbbbbb");
    const startY = doc.y;
    const infoX = 70;
    doc.text(`Student Name : `, infoX, startY);
    doc.fillColor("#ffffff").text(author || "N/A", infoX + 120, startY);
    doc.fillColor("#bbbbbb").text(`Date : `, infoX, startY + 18);
    doc.fillColor("#ffffff").text(date || "N/A", infoX + 120, startY + 18);

    // Objective
    sectionTitle(doc, "Objective");
    doc.text(objective || "To perform the given experiment and record observations.");

    // Apparatus
    sectionTitle(doc, "Apparatus");
    doc.text(
      apparatus ||
        "Ammeter, Voltmeter, Resistor, Power Supply, Connecting Wires."
    );

    // Procedure
    sectionTitle(doc, "Procedure");
    (procedure || "1. Connect the circuit.\n2. Record readings.\n3. Plot V-I graph.")
      .split("\n")
      .forEach((line) => doc.text("• " + line));

    // PAGE 2 — Observations Table
    doc.addPage();
    drawPageBackground(doc);
    drawPageBorder(doc);

    sectionTitle(doc, "Observation Table");

    const startX = 60;
    const colWidths = [50, 120, 120, 180];
    const headers = ["t", "Voltage (V)", "Current (A)", "Remarks"];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    let y = doc.y;

    // Table header
    doc.fillColor("#000000").rect(startX, y, totalWidth, 20).fill("#ffb84a");
    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(10);
    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x, y + 5, { width: colWidths[i], align: "center" });
      x += colWidths[i];
    });

    // Table rows
    y += 22;
    observations.forEach((row, i) => {
      const bg = i % 2 === 0 ? "#0a0a0a" : "#151515";
      doc.rect(startX, y, totalWidth, 18).fill(bg);
      doc.fillColor("#ffffff").font("Helvetica").fontSize(9);
      const cols = [
        row.t ?? i + 1,
        row.V ?? "",
        row.I ?? "",
        row.remark ?? "",
      ];
      let cx = startX;
      cols.forEach((val, j) => {
        doc.text(String(val), cx, y + 4, { width: colWidths[j], align: "center" });
        cx += colWidths[j];
      });
      y += 18;
      if (y > doc.page.height - 80) {
        doc.addPage();
        drawPageBackground(doc);
        drawPageBorder(doc);
        y = 70;
      }
    });

    // PAGE 3 — Graph
    if (chartImageBase64) {
      const chartBuf = base64ToBuffer(chartImageBase64);
      if (chartBuf) {
        doc.addPage();
        drawPageBackground(doc);
        drawPageBorder(doc);
        sectionTitle(doc, "Graph (Auto-Plotted)");
        try {
          doc.image(chartBuf, {
            fit: [440, 300],
            align: "center",
            valign: "center",
          });
        } catch (err) {
          doc.fillColor("#f55").text("Error embedding chart image.");
        }
      }
    }

    // PAGE 4 — Circuit Diagram
    if (circuitImageBase64) {
      const circuitBuf = base64ToBuffer(circuitImageBase64);
      if (circuitBuf) {
        doc.addPage();
        drawPageBackground(doc);
        drawPageBorder(doc);
        sectionTitle(doc, "Circuit Diagram");
        try {
          doc.image(circuitBuf, {
            fit: [440, 320],
            align: "center",
            valign: "center",
          });
        } catch (err) {
          doc.fillColor("#f55").text("Error embedding circuit diagram.");
        }
      }
    }

    // PAGE 5 — Calculations & Conclusion
    doc.addPage();
    drawPageBackground(doc);
    drawPageBorder(doc);

    sectionTitle(doc, "Calculations");
    doc.font("Courier").fontSize(10).fillColor("#ffffff");
    if (typeof calculations === "string") {
      doc.text(calculations);
    } else {
      doc.text(JSON.stringify(calculations, null, 2));
    }

    sectionTitle(doc, "Conclusion / Remarks");
    doc.font("Helvetica").fontSize(10).fillColor("#ffffff");
    doc.text(conclusion || "The experiment was performed successfully.");

    // Signatures
    doc.moveDown(2);
    const lineY = doc.y + 30;
    doc.moveTo(60, lineY).lineTo(220, lineY).stroke("#777");
    doc.text("Student Signature", 60, lineY + 5);
    doc.moveTo(340, lineY).lineTo(500, lineY).stroke("#777");
    doc.text("Instructor Signature", 340, lineY + 5);

    // Footer
    doc.fontSize(8).fillColor("#777");
    doc.text(
      "Auto-generated by BEEE Lab Report Generator",
      0,
      doc.page.height - 40,
      { align: "center" }
    );

    doc.end();
  } catch (err) {
    console.error("PDF generation failed", err);
    res.status(500).json({ error: "PDF generation failed", details: err.message });
  }
}
