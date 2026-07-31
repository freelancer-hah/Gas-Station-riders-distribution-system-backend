const PDFDocument = require("pdfkit");

// Colors kept consistent with generateRiderLedgerPDF.js
const colors = {
  primary: "#0F62FE",
  dark: "#161616",
  gray: "#6F6F6F",
  lightGray: "#F4F4F4",
  border: "#E0E0E0",
};

/**
 * Builds a PDF for a single admin -> rider sale invoice and resolves
 * with a Buffer (does NOT stream to a response) so callers can also
 * base64-encode it for clients that can't consume raw binary
 * responses (e.g. React Native / Hermes over axios).
 *
 * @param {Object} invoice - RiderInvoice document (rider populated)
 * @returns {Promise<Buffer>}
 */
function generateRiderInvoicePDF(invoice) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .fillColor(colors.primary)
        .text("GAS CYLINDER MANAGEMENT", { align: "center" });

      doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor(colors.gray)
        .text("Sale Invoice", { align: "center" });

      doc.moveDown(1.5);

      // Invoice # / date row
      const topY = doc.y;
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .fillColor(colors.dark)
        .text(`Invoice #: ${invoice.invoiceNumber}`, 50, topY);
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(colors.gray)
        .text(
          `Date: ${new Date(invoice.createdAt || invoice.invoiceDate || Date.now()).toLocaleString()}`,
          50,
          topY + 18
        );

      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .fillColor(colors.primary)
        .text("SALE", 450, topY, { width: 100, align: "right" });

      doc.moveDown(2.5);

      // Rider info box
      const riderName = invoice.rider?.name || "N/A";
      const riderPhone = invoice.rider?.phone || "N/A";

      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(colors.dark)
        .text("Rider:", 50, doc.y);
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(colors.dark)
        .text(riderName);
      doc
        .fontSize(9)
        .fillColor(colors.gray)
        .text(`Phone: ${riderPhone}`);

      doc.moveDown(1);

      // Line item table
      const tableTop = doc.y;
      const colWidths = [110, 70, 90, 90, 90, 50]; // last is spare
      const headers = ["Cylinder Size", "Qty", "Weight/Cyl", "Total Wt", "Rate/kg", ""];

      doc.rect(50, tableTop, 500, 22).fill(colors.primary);
      let x = 55;
      headers.forEach((header, i) => {
        doc
          .fontSize(9)
          .font("Helvetica-Bold")
          .fillColor("#FFFFFF")
          .text(header, x, tableTop + 6, { width: colWidths[i] - 5 });
        x += colWidths[i];
      });

      const rowY = tableTop + 22;
      doc.rect(50, rowY, 500, 24).fill(colors.lightGray);
      const rowValues = [
        invoice.cylinderSize,
        String(invoice.quantity),
        `${invoice.weightKg} kg`,
        `${invoice.totalWeightKg} kg`,
        `Rs. ${Number(invoice.ratePerKg).toLocaleString()}`,
        "",
      ];
      x = 55;
      rowValues.forEach((val, i) => {
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor(colors.dark)
          .text(val, x, rowY + 7, { width: colWidths[i] - 5 });
        x += colWidths[i];
      });

      doc.moveDown(3.5);

      // Total
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .lineWidth(1.5)
        .strokeColor(colors.primary)
        .stroke();

      doc.moveDown(0.5);
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor(colors.dark)
        .text("Total Amount:", 50, doc.y, { continued: false });
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor(colors.primary)
        .text(`Rs. ${Number(invoice.totalAmount).toLocaleString()}`, 400, doc.y - 16, {
          width: 150,
          align: "right",
        });

      if (invoice.notes) {
        doc.moveDown(1.5);
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor(colors.gray)
          .text(`Notes: ${invoice.notes}`);
      }

      doc.moveDown(2);
      doc
        .fontSize(8)
        .fillColor(colors.gray)
        .text("Generated from Gas Cylinder Management System", { align: "center" });
      doc.text(`© ${new Date().getFullYear()} All Rights Reserved`, { align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateRiderInvoicePDF;