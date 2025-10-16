// src/utils/exportPdf.js
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * exportElementToPdf(element, filename)
 * - element: DOM node to snapshot
 */
export async function exportElementToPdf(element, filename = "energy-report.pdf") {
  if (!element) throw new Error("Element required for PDF export.");
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
  pdf.save(filename);
}
