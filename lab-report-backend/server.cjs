// server.cjs
// Professional Lab Report PDF generator
// - Dark theme applied to every page
// - Nice rounded section cards / borders
// - Data & Visuals continuation section (table -> chart -> circuit image) that flows
// - Conclusion placement safe-guarded so it doesn't get lost between pages
// - Footer with page numbers, and final Thank You page including student's name
// Usage: POST /api/generate-report with JSON payload (same as before)

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const PDFDocument = require("pdfkit");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "80mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "80mb" }));

// ---------- Helpers ----------
function base64ToBuffer(dataURL) {
  if (!dataURL) return null;
  const match = dataURL.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

function drawPageBackground(doc) {
  // black background for full page
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#000000");
  doc.restore();
}

function sectionTitle(doc, title, x = null) {
  // small orange title
  doc.moveDown(0.6);
  doc.fillColor("#ffb84a").font("Helvetica-Bold").fontSize(14);
  if (x !== null) doc.text(title, x, doc.y, { continued: false });
  else doc.text(title);
  doc.moveDown(0.25);
  doc.fillColor("#ffffff").font("Helvetica").fontSize(10);
}

function drawRoundedRect(doc, x, y, w, h, r = 6, options = {}) {
  // Very small helper for rounded rectangles
  // stroke & fill options handled by current fill/stroke colors/lineWidth
  doc.roundedRect
    ? doc.roundedRect(x, y, w, h, r).stroke()
    : doc
        .save()
        .moveTo(x + r, y)
        .lineTo(x + w - r, y)
        .quadraticCurveTo(x + w, y, x + w, y + r)
        .lineTo(x + w, y + h - r)
        .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
        .lineTo(x + r, y + h)
        .quadraticCurveTo(x, y + h, x, y + h - r)
        .lineTo(x, y + r)
        .quadraticCurveTo(x, y, x + r, y)
        .stroke()
        .restore();
}

// Footer (simple): draws Page X on bottom-right. Called on pageAdded & at end.
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

// Ensure there's room for heightNeeded; if not, add a page (background & footer)
function ensureSpace(doc, heightNeeded = 120, marginBottom = 80) {
  const available = doc.page.height - doc.y - marginBottom;
  if (available < heightNeeded) {
    doc.addPage();
    // doc.on('pageAdded') handler will set background and default fillColor
  }
}

// ---------- Main route ----------
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

    // create PDF doc
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: false });

    // Re-apply background & reset color on every page add (fix white page issue)
    doc.on("pageAdded", () => {
      drawPageBackground(doc);
      // default font color for new page content
      doc.fillColor("#ffffff");
      drawFooter(doc);
    });

    // Pipe PDF to response
    const fileSafe = (title || "lab-report").replace(/\s+/g, "-").toLowerCase();
    res.setHeader("Content-Disposition", `attachment; filename=${fileSafe}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    // Initial page background + header
    drawPageBackground(doc);
    doc.fillColor("#ffb84a").font("Helvetica-Bold").fontSize(20).text(college, {
      align: "center",
    });
    doc.moveDown(0.2);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text(title, {
      align: "center",
    });
    doc.moveDown(0.6);

    // metadata block (boxed)
    const metaX = 60;
    const metaW = doc.page.width - 120;
    const metaH = 70;
    const metaY = doc.y;
    doc.save();
    doc.lineWidth(1).strokeColor("#222").fillColor("#070707");
    // rectangle with stroke
    try {
      // draw box background
      doc.roundedRect
        ? doc.roundedRect(metaX, metaY, metaW, metaH, 8).fill("#070707")
        : doc.rect(metaX, metaY, metaW, metaH).fill("#070707");
      // border
      doc.strokeColor("#2b2b2b").lineWidth(0.8).stroke();
    } catch (e) {
      doc.rect(metaX, metaY, metaW, metaH).fill("#070707").stroke();
    }
    doc.restore();

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

    // small line spacer
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke("#222");
    doc.moveDown(0.4);

    // OBJECTIVE card
    sectionTitle(doc, "Objective");
    // Render objective inside a light bordered box
    ensureSpace(doc, 80);
    const objX = 60, objW = doc.page.width - 120;
    const objY = doc.y;
    doc.save();
    doc.fillColor("#0b0b0c").strokeColor("#333").lineWidth(0.8);
    try { doc.roundedRect(objX, objY, objW, 60, 6).fillAndStroke("#0b0b0c", "#333"); } catch (e) { doc.rect(objX, objY, objW, 60).fill("#0b0b0c").stroke(); }
    doc.fillColor("#ffffff").font("Helvetica").fontSize(10).text(objective, objX + 10, objY + 8, { width: objW - 20, lineGap: 3 });
    doc.moveDown(3.2);
    doc.restore();

    // DESCRIPTION card (long text — handle overflow)
    sectionTitle(doc, "Description");
    ensureSpace(doc, 40);
    const descX = 60, descW = doc.page.width - 120;
    const descY = doc.y;
    // draw a taller box that will expand as we write
    doc.save();
    doc.fillColor("#0b0b0c").strokeColor("#333").lineWidth(0.8);
    // approximate height, but let text flow (we draw a subtle border first)
    try { doc.roundedRect(descX, descY, descW, 50, 6).stroke("#333"); } catch (e) { doc.rect(descX, descY, descW, 50).stroke(); }
    doc.fillColor("#ffffff").font("Helvetica").fontSize(10);
    // Use doc.text — this will auto-wrap and create new pages if needed; pageAdded handler will draw backgrounds
    doc.text(description || "No description provided.", descX + 10, descY + 8, { width: descW - 20, align: "justify", lineGap: 3 });
    doc.moveDown(1);
    doc.restore();

    // APPARATUS card
    sectionTitle(doc, "Apparatus");
    ensureSpace(doc, 40);
    const appX = 60, appW = doc.page.width - 120;
    const appY = doc.y;
    doc.save();
    try { doc.roundedRect(appX, appY, appW, 48, 6).fillAndStroke("#0b0b0c", "#333"); } catch (e) { doc.rect(appX, appY, appW, 48).fill("#0b0b0c").stroke(); }
    doc.fillColor("#ffffff").font("Helvetica").fontSize(10).text(apparatus || "No apparatus provided.", appX + 10, appY + 8, { width: appW - 20 });
    doc.moveDown(2.8);
    doc.restore();

    // PROCEDURE (bullet list)
    sectionTitle(doc, "Procedure");
    const steps = (procedure || "").split("\n").filter(Boolean);
    if (steps.length === 0) {
      ensureSpace(doc, 40);
      doc.text("Procedure not provided.", { lineGap: 3 });
    } else {
      for (const step of steps) {
        ensureSpace(doc, 36);
        doc.text(`• ${step.trim()}`, { indent: 8, lineGap: 3 });
      }
    }

    // ----- Data & Visuals continuation section -----
    // This is a single section where we place the table first, then chart, then circuit image.
    // They will continue on the next page if needed, preserving background and footer.
    doc.addPage(); // start visuals on a fresh page to get a clean layout
    sectionTitle(doc, "Data & Visuals");

    // Observation table: draw a framed table with alternating row backgrounds and border
    // Table area configuration
    const tableX = 55;
    const tableYStart = doc.y;
    const tableWidth = doc.page.width - 110;
    const colWidths = [60, (tableWidth - 60) * 0.3, (tableWidth - 60) * 0.3, (tableWidth - 60) * 0.4];
    const headerH = 22;
    // Header background
    doc.save();
    doc.rect(tableX, doc.y, tableWidth, headerH).fill("#ffb84a");
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);
    let tx = tableX;
    const headers = ["t", "Voltage (V)", "Current (A)", "Remarks"];
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], tx, doc.y + 6, { width: colWidths[i], align: "center" });
      tx += colWidths[i];
    }
    doc.restore();
    // Rows
    let rowY = doc.y + headerH;
    const rowH = 20;
    let rowIndex = 0;
    for (const row of observations) {
      // if not enough space for row + footer, add page
      if (rowY + rowH > doc.page.height - 100) {
        doc.addPage();
        // redraw header for continuation
        doc.rect(tableX, doc.y, tableWidth, headerH).fill("#ffb84a");
        doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);
        tx = tableX;
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], tx, doc.y + 6, { width: colWidths[i], align: "center" });
          tx += colWidths[i];
        }
        rowY = doc.y + headerH;
      }

      const bg = rowIndex % 2 === 0 ? "#0a0a0a" : "#131313";
      doc.rect(tableX, rowY, tableWidth, rowH).fill(bg);
      doc.fillColor("#ffffff").font("Helvetica").fontSize(9);
      let cx = tableX;
      const vals = [row.t ?? rowIndex + 1, row.V ?? "", row.I ?? "", row.remark ?? ""];
      for (let j = 0; j < vals.length; j++) {
        doc.text(String(vals[j]), cx + 6, rowY + 5, { width: colWidths[j] - 12, align: "left" });
        cx += colWidths[j];
      }
      rowY += rowH;
      rowIndex++;
    }
    // move cursor below table
    doc.y = rowY + 12;

    // Chart & circuit: attempt side-by-side if space permits, else stacked
    // allocate max width for image area
    const visualMaxWidth = doc.page.width - 120;
    const halfWidth = (visualMaxWidth - 12) / 2;

    // Chart
    if (chartImageBase64) {
      try {
        // if there is room horizontally: show chart left and circuit right (if circuit exists)
        if (circuitImageBase64) {
          // ensure space vertically for both images heights
          ensureSpace(doc, 220);
          const imgBuf = Buffer.from(chartImageBase64.split(",")[1], "base64");
          // left chart box with border
          const leftX = 60;
          const topY = doc.y;
          doc.save();
          try { doc.roundedRect(leftX - 6, topY - 6, halfWidth + 12, 160, 6).stroke("#333"); } catch (e) { doc.rect(leftX - 6, topY - 6, halfWidth + 12, 160).stroke(); }
          doc.image(imgBuf, leftX, topY, { fit: [halfWidth, 160], align: "center", valign: "center" });
          doc.restore();

          // Circuit to the right
          const rightX = leftX + halfWidth + 24;
          const circBuf = base64ToBuffer(circuitImageBase64);
          if (circBuf) {
            doc.save();
            try { doc.roundedRect(rightX - 6, topY - 6, halfWidth + 12, 160, 6).stroke("#333"); } catch (e) { doc.rect(rightX - 6, topY - 6, halfWidth + 12, 160).stroke(); }
            doc.image(circBuf, rightX, topY, { fit: [halfWidth, 160], align: "center", valign: "center" });
            doc.restore();
          }
          // advance cursor below images
          doc.y = topY + 160 + 12;
        } else {
          // only chart: full width
          ensureSpace(doc, 200);
          const imgBuf = Buffer.from(chartImageBase64.split(",")[1], "base64");
          doc.save();
          try { doc.roundedRect(60 - 6, doc.y - 6, visualMaxWidth + 12, 220, 6).stroke("#333"); } catch (e) { doc.rect(60 - 6, doc.y - 6, visualMaxWidth + 12, 220).stroke(); }
          doc.image(imgBuf, 60, doc.y, { fit: [visualMaxWidth, 220], align: "center", valign: "center" });
          doc.restore();
          doc.y += 220 + 12;
        }
      } catch (err) {
        console.error("Chart embed failed:", err);
        doc.fillColor("#f55").text("Error rendering chart image.");
      }
    } else if (circuitImageBase64) {
      // only circuit image (no chart)
      ensureSpace(doc, 220);
      const circBuf = base64ToBuffer(circuitImageBase64);
      if (circBuf) {
        doc.save();
        try { doc.roundedRect(60 - 6, doc.y - 6, visualMaxWidth + 12, 220, 6).stroke("#333"); } catch (e) { doc.rect(60 - 6, doc.y - 6, visualMaxWidth + 12, 220).stroke(); }
        doc.image(circBuf, 60, doc.y, { fit: [visualMaxWidth, 220], align: "center", valign: "center" });
        doc.restore();
        doc.y += 220 + 12;
      }
    }

    // CALCULATIONS / RESULT (keep in same flow)
    sectionTitle(doc, "Calculations & Result");
    ensureSpace(doc, 80);
    doc.fillColor("#ffffff").font("Helvetica").fontSize(10);
    doc.text(calculations || "No calculations provided.", { lineGap: 3 });
    doc.moveDown(0.5);
    doc.text(`Result: ${result || "No result provided."}`, { lineGap: 3 });

    // Conclusion: ensure it doesn't split awkwardly; if current y is near bottom, start new page
    const conclusionEstimatedHeight = 120;
    ensureSpace(doc, conclusionEstimatedHeight);
    sectionTitle(doc, "Conclusion");
    doc.text(conclusion || "No conclusion provided.", { align: "justify", lineGap: 3 });

    // Signatures area: ensure there's space, else add page
    ensureSpace(doc, 120);
    doc.moveDown(2);
    const signY = doc.y + 30;
    doc.strokeColor("#777").lineWidth(0.6);
    doc.moveTo(80, signY).lineTo(240, signY).stroke();
    doc.fillColor("#bbbbbb").font("Helvetica").fontSize(10).text("Student Signature", 80, signY + 6);
    doc.moveTo(340, signY).lineTo(500, signY).stroke();
    doc.text("Instructor Signature", 340, signY + 6);

    // Final Thank You page
    doc.addPage();
    sectionTitle(doc, "Thank You");
    ensureSpace(doc, 160);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(18).text("Thank you!", { align: "center" });
    doc.moveDown(0.5);
    const nameLine = author ? `Student: ${author}` : "Student";
    doc.fillColor("#bbbbbb").font("Helvetica").fontSize(11).text(`${nameLine}`, { align: "center" });
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(10).fillColor("#ffffff").text("We hope the Lab Report was helpful. Visit again — AprkLaba.", {
      align: "center",
    });
    doc.moveDown(2);
    doc.fillColor("#777").fontSize(9).text("Generated by BEEE Lab Report Generator", { align: "center" });

    // Footer (on last page too)
    drawFooter(doc);

    // finish
    doc.end();
  } catch (err) {
    console.error("PDF generation error:", err);
    try {
      res.status(500).json({ error: "Failed to generate PDF" });
    } catch (e) {
      // ignore
    }
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ LabReport PDF server running at http://localhost:${PORT}`));
