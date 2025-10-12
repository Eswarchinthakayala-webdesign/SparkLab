// server/generate-pdf.cjs
const express = require("express");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const SVGtoPDF = require("svg-to-pdfkit");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "20mb" })); // support large images/charts

// ---------- Utility Helpers ----------
function round(v, p = 6) {
  const f = 10 ** p;
  return Math.round((Number(v) || 0) * f) / f;
}

function safeText(t) {
  return t && typeof t === "string" ? t : "-";
}

// ---------- Draw Table ----------
function drawTable(doc, startX, startY, headers, rows, columnWidths, rowHeight = 20) {
  const x = startX;
  let y = startY;
  doc.fontSize(9).fillColor("#ffffff").font("Helvetica-Bold");

  let cx = x;
  headers.forEach((h, i) => {
    doc.rect(cx, y, columnWidths[i], rowHeight).fillOpacity(0.06).fillAndStroke("#111", "#222");
    doc.fillColor("#ffd24a").text(h, cx + 6, y + 5, { width: columnWidths[i] - 10 });
    cx += columnWidths[i];
  });
  y += rowHeight;
  doc.font("Helvetica").fontSize(9).fillColor("#ddd");

  rows.forEach((r, ri) => {
    cx = x;
    r.forEach((cell, ci) => {
      if (ri % 2 === 0)
        doc.rect(cx, y, columnWidths[ci], rowHeight).fillOpacity(0.02).fillAndStroke("#000", "#111");
      doc.fillColor("#eee").text(String(cell || ""), cx + 6, y + 5, { width: columnWidths[ci] - 10 });
      cx += columnWidths[ci];
    });
    y += rowHeight;
    if (y + 80 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  });
  return y;
}

// ---------- PDF Generation ----------
app.post("/api/generate-pdf", async (req, res) => {
  try {
    const { report = {}, chartSvg, circuitImageBase64, logoBase64 } = req.body;
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    const left = 40;
    const right = doc.page.width - 40;
    const sectionSpacing = 12;

    // ---------- Header ----------
    if (logoBase64) {
      try {
        const imgBuf = Buffer.from(logoBase64, "base64");
        doc.image(imgBuf, left, 30, { width: 60 });
      } catch (e) {
        console.warn("Logo embed failed", e);
      }
    }

    doc.fillColor("#ffd24a").fontSize(16).font("Helvetica-Bold")
      .text(safeText(report.title || "Lab Report"), 110, 30);
    doc.fontSize(10).fillColor("#ddd").font("Helvetica")
      .text("BEEE — Basic Electrical & Electronics Engineering", 110, 48);

    doc.moveTo(left, 90).lineTo(right, 90).strokeColor("#222").stroke();

    // ---------- Student Info ----------
    const infoTop = 100;
    doc.fontSize(10).fillColor("#fff").font("Helvetica-Bold").text("Student:", left, infoTop);
    doc.font("Helvetica").fontSize(10).fillColor("#eee").text(safeText(report.studentName), 100, infoTop);
    doc.font("Helvetica-Bold").fillColor("#fff").text("Roll No:", 320, infoTop);
    doc.font("Helvetica").fontSize(10).fillColor("#eee").text(safeText(report.rollNo), 380, infoTop);
    doc.font("Helvetica-Bold").fillColor("#fff").text("Instructor:", left, infoTop + 18);
    doc.font("Helvetica").fontSize(10).fillColor("#eee").text(safeText(report.instructorName), 110, infoTop + 18);
    doc.font("Helvetica-Bold").fillColor("#fff").text("Date:", 320, infoTop + 18);
    doc.font("Helvetica").fontSize(10).fillColor("#eee").text(safeText(report.labDate), 380, infoTop + 18);

    // ---------- Helper for sections ----------
    let y = infoTop + 48;
    function drawSection(title, text) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#ffd24a").text(title, left, y);
      y += 16;
      doc.font("Helvetica").fontSize(9).fillColor("#ddd")
        .text(safeText(text), left, y, { width: right - left });
      y = doc.y + sectionSpacing;
      if (y > doc.page.height - 120) { doc.addPage(); y = doc.page.margins.top; }
    }

    drawSection("Objective", report.objective);
    drawSection("Apparatus", report.apparatus);
    drawSection("Theory", report.theory);
    drawSection("Procedure", report.procedure);

    // ---------- Observations ----------
    doc.addPage();
    y = doc.page.margins.top;
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#ffd24a").text("Observations", left, y);
    y += 20;
    const obs = Array.isArray(report.observations) ? report.observations : [];
    const headers = ["Voltage (V)", "Current (A)", "Remarks"];
    const rows = obs.map((r) => [r.V ?? "", r.I ?? "", r.remarks ?? ""]);
    const colW = [(doc.page.width - 80) * 0.25, (doc.page.width - 80) * 0.25, (doc.page.width - 80) * 0.5];
    drawTable(doc, left, y, headers, rows, colW, 22);

    // ---------- Chart ----------
    if (chartSvg) {
      doc.addPage();
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#ffd24a")
        .text("Graph — V vs I / Oscilloscope", left, doc.y + 6);
      try {
        SVGtoPDF(doc, chartSvg, left, doc.y + 8, {
          assumePt: true,
          width: doc.page.width - 80,
        });
      } catch (e) {
        console.warn("SVG embed failed", e);
        doc.font("Helvetica").fontSize(10).fillColor("#ddd")
          .text("Graph could not be embedded as SVG (invalid data).", left, doc.y + 8);
      }
    }

    // ---------- Circuit Diagram ----------
    if (circuitImageBase64) {
      doc.addPage();
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#ffd24a")
        .text("Circuit Diagram", left, doc.y + 6);
      const imgTop = doc.y + 10;
      try {
        const buf = Buffer.from(circuitImageBase64, "base64");
        const imgW = doc.page.width - 80;
        doc.image(buf, left, imgTop, { width: imgW });
        if (Array.isArray(report.markers) && report.markers.length) {
          let markY = doc.y + 12;
          doc.moveTo(left, markY - 6).lineTo(right, markY - 6).strokeColor("#111").stroke();
          doc.font("Helvetica").fontSize(10).fillColor("#eee")
            .text("Markers (x%, y%) — placed on uploaded circuit:", left, markY);
          markY += 14;
          report.markers.forEach((m) => {
            doc.font("Helvetica").fontSize(9).fillColor("#ffd24a")
              .text(`${m.label}: (${round(m.xPct, 2)}%, ${round(m.yPct, 2)}%)`, left + 8, markY);
            markY += 12;
          });
        }
      } catch (e) {
        console.warn("Circuit embed failed", e);
        doc.font("Helvetica").fontSize(10).fillColor("#ddd")
          .text("Circuit image could not be embedded (invalid base64).", left, doc.y + 8);
      }
    }

    // ---------- Calculations & Results ----------
    doc.addPage();
    y = doc.page.margins.top;
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#ffd24a").text("Calculations & Results", left, y);
    y += 18;
    doc.font("Helvetica").fontSize(10).fillColor("#ddd");

    if (report.fit) {
      doc.text(`Slope (R) = ${round(report.fit.slope, 6)} Ω`, left, y); y += 14;
      doc.text(`Intercept = ${round(report.fit.intercept, 6)}`, left, y); y += 14;
      doc.text(`Std. Error ≈ ${round(report.fit.s_slope, 8)}`, left, y); y += 18;
      doc.text("Calculation steps:", left, y); y += 12;
      (report.fit.steps || []).forEach((s) => { doc.list([s], left + 6); y = doc.y + 6; });
    } else {
      doc.text("Fit not available (insufficient data)", left, y); y += 14;
    }

    // ---------- Result & Conclusion ----------
    doc.moveDown(2);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#ffd24a").text("Result", left);
    doc.font("Helvetica").fontSize(10).fillColor("#eee")
      .text(report.result || `Measured resistance ≈ ${report.fit ? round(report.fit.slope, 6) + " Ω" : "—"}`,
        left, doc.y + 4);

    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#ffd24a").text("Conclusion", left);
    doc.font("Helvetica").fontSize(10).fillColor("#eee")
      .text(safeText(report.conclusion), left, doc.y + 4);

    // ---------- Signatures ----------
    doc.moveDown(4);
    const sigY = doc.y;
    doc.moveTo(left, sigY).lineTo(left + 180, sigY).strokeColor("#444").stroke();
    doc.text("Student signature", left, sigY + 6);
    doc.moveTo(left + 220, sigY).lineTo(left + 400, sigY).strokeColor("#444").stroke();
    doc.text("Instructor signature", left + 220, sigY + 6);

    // ---------- Footer ----------
    const footer = (pageNum) =>
      `Auto-Generated by BEEE Report Generator — Page ${pageNum}`;
    doc.on("pageAdded", () => {
      const p = doc.page;
      doc.fontSize(8).fillColor("#888")
        .text(footer(p.pageNumber), left, p.height - 30);
    });
    doc.fontSize(8).fillColor("#888")
      .text(footer(doc.page.pageNumber), left, doc.page.height - 30);

    // finalize
    doc.end();
  } catch (err) {
    console.error("PDF gen error", err);
    res.status(500).json({ error: "Failed to generate PDF", details: err.message });
  }
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`✅ PDF server running on http://localhost:${PORT}`));
