// api/generate-report.js
// Vercel Serverless version of the professional PDF generator
import PDFDocument from "pdfkit";

function base64ToBuffer(dataURL) {
  if (!dataURL) return null;
  const match = dataURL.match(/^data:(image\/\\w+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

function drawPageBackground(doc) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#000000");
  doc.restore();
}

function sectionTitle(doc, title) {
  doc.moveDown(0.6);
  doc.fillColor("#ffb84a").font("Helvetica-Bold").fontSize(14).text(title);
  doc.moveDown(0.25);
  doc.fillColor("#ffffff").font("Helvetica").fontSize(10);
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
  } catch {}
}

function ensureSpace(doc, heightNeeded = 120, marginBottom = 80) {
  const available = doc.page.height - doc.y - marginBottom;
  if (available < heightNeeded) doc.addPage();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST method allowed" });
  }

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

    // Initialize PDF
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    let resultBuffer;

    // Capture PDF into memory instead of piping to a file
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      resultBuffer = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${title.replace(/\s+/g, "-")}.pdf`
      );
      res.send(resultBuffer);
    });

    // Ensure dark background on every new page
    doc.on("pageAdded", () => {
      drawPageBackground(doc);
      doc.fillColor("#ffffff");
      drawFooter(doc);
    });

    // ---- Page 1 ----
    drawPageBackground(doc);
    doc.fillColor("#ffb84a").font("Helvetica-Bold").fontSize(20).text(college, { align: "center" });
    doc.moveDown(0.2);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text(title, { align: "center" });
    doc.moveDown(0.6);

    // metadata
    doc.fillColor("#bbbbbb").font("Helvetica").fontSize(10);
    doc.text(`Student: ${author || "-"}`);
    doc.text(`Roll No: ${roll || "-"}`);
    doc.text(`Date: ${date || "-"}`);
    doc.text(`Title ID: ${payload.titleID || "-"}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown(0.8);

    // Objective
    sectionTitle(doc, "Objective");
    doc.text(objective);

    // Description
    sectionTitle(doc, "Description");
    doc.text(description, { align: "justify", lineGap: 3 });

    // Apparatus
    sectionTitle(doc, "Apparatus");
    doc.text(apparatus);

    // Procedure
    sectionTitle(doc, "Procedure");
    const steps = (procedure || "").split("\n").filter(Boolean);
    steps.forEach((s) => doc.text(`• ${s.trim()}`, { indent: 10, lineGap: 2 }));

    // ---- Page 2: Data & Visuals ----
    doc.addPage();
    sectionTitle(doc, "Data & Visuals");

    const tableX = 55;
    const colWidths = [50, 120, 120, 180];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const headers = ["t", "Voltage (V)", "Current (A)", "Remarks"];
    let y = doc.y;

    // Header
    doc.rect(tableX, y, totalWidth, 20).fill("#ffb84a");
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(10);
    let x = tableX;
    headers.forEach((h, i) => {
      doc.text(h, x, y + 5, { width: colWidths[i], align: "center" });
      x += colWidths[i];
    });
    y += 22;

    // Rows
    observations.forEach((row, i) => {
      const bg = i % 2 === 0 ? "#0a0a0a" : "#131313";
      doc.rect(tableX, y, totalWidth, 18).fill(bg);
      doc.fillColor("#fff").font("Helvetica").fontSize(9);
      const vals = [row.t ?? i + 1, row.V ?? "", row.I ?? "", row.remark ?? ""];
      let cx = tableX;
      vals.forEach((val, j) => {
        doc.text(String(val), cx, y + 4, { width: colWidths[j], align: "center" });
        cx += colWidths[j];
      });
      y += 18;
      if (y > doc.page.height - 100) {
        doc.addPage();
        sectionTitle(doc, "Data (contd.)");
        y = doc.y;
      }
    });

    doc.y = y + 20;

    // Chart & Circuit Images
    if (chartImageBase64) {
      try {
        const buf = Buffer.from(chartImageBase64.split(",")[1], "base64");
        ensureSpace(doc, 200);
        doc.image(buf, 60, doc.y, { fit: [450, 220], align: "center" });
        doc.y += 230;
      } catch {
        doc.fillColor("#f55").text("Chart image error.");
      }
    }
    if (circuitImageBase64) {
      try {
        const buf = base64ToBuffer(circuitImageBase64);
        ensureSpace(doc, 200);
        doc.image(buf, 60, doc.y, { fit: [450, 220], align: "center" });
        doc.y += 230;
      } catch {
        doc.fillColor("#f55").text("Circuit image error.");
      }
    }

    // ---- Calculations & Result ----
    sectionTitle(doc, "Calculations & Result");
    doc.text(calculations || "No calculations provided.", { lineGap: 3 });
    doc.text(`Result: ${result}`, { lineGap: 3 });

    // ---- Conclusion ----
    sectionTitle(doc, "Conclusion");
    doc.text(conclusion || "No conclusion provided.", { align: "justify", lineGap: 3 });

    // ---- Thank You ----
    doc.addPage();
    sectionTitle(doc, "Thank You");
    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#ffffff").text("Thank you!", { align: "center" });
    doc.moveDown(0.5);
    const nameLine = author ? `Student: ${author}` : "Student";
    doc.font("Helvetica").fontSize(10).fillColor("#bbbbbb").text(nameLine, { align: "center" });
    doc.moveDown(1);
    doc.fillColor("#ffffff").text("We hope the Lab Report was helpful. Visit again — AprkLaba.", { align: "center" });
    doc.moveDown(2);
    doc.fontSize(9).fillColor("#777").text("Generated by BEEE Lab Report Generator", { align: "center" });

    drawFooter(doc);
    doc.end();
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
}
