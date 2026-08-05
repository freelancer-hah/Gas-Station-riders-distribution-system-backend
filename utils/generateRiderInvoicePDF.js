const PDFDocument = require("pdfkit");

const colors = {
  primary: "#0F62FE",
  dark: "#161616",
  gray: "#6F6F6F",
  lightGray: "#F4F4F4",
  border: "#E0E0E0",
};

function generateRiderInvoicePDF(invoice) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc.fontSize(20).font("Helvetica-Bold").fillColor(colors.primary)
         .text("GAS CYLINDER MANAGEMENT", { align: "center" });
      doc.fontSize(11).font("Helvetica").fillColor(colors.gray)
         .text("Sale Invoice (Admin → Rider)", { align: "center" });
      doc.moveDown(1.5);

      const topY = doc.y;
      doc.fontSize(12).font("Helvetica-Bold").fillColor(colors.dark)
         .text(`Invoice #: ${invoice.invoiceNumber}`, 50, topY);
      doc.fontSize(10).font("Helvetica").fillColor(colors.gray)
         .text(`Date: ${new Date(invoice.invoiceDate || Date.now()).toLocaleString()}`, 50, topY + 18);
      doc.fontSize(12).font("Helvetica-Bold").fillColor(colors.primary)
         .text("SALE", 450, topY, { width: 100, align: "right" });
      doc.moveDown(2.5);

      // Rider Info
      const riderName = invoice.rider?.name || "N/A";
      const riderPhone = invoice.rider?.phone || "N/A";
      doc.fontSize(11).font("Helvetica-Bold").fillColor(colors.dark).text("Rider:", 50, doc.y);
      doc.fontSize(10).font("Helvetica").fillColor(colors.dark).text(riderName);
      doc.fontSize(9).fillColor(colors.gray).text(`Phone: ${riderPhone}`);
      doc.moveDown(1);

      // Table
      const tableTop = doc.y;
      const colWidths = [90, 50, 60, 70, 80, 90];
      const headers = ["Cylinder Size", "Qty", "Wt/Cyl", "Total Wt", "Rate/kg", "Total"];

      doc.rect(50, tableTop, 500, 22).fill(colors.primary);
      let x = 55;
      headers.forEach((header, i) => {
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF")
           .text(header, x, tableTop + 6, { width: colWidths[i] - 5 });
        x += colWidths[i];
      });

      let yPos = tableTop + 22;
      const items = invoice.items || [];
      items.forEach((item, index) => {
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
          doc.rect(50, yPos, 500, 22).fill(colors.primary);
          x = 55;
          headers.forEach((header, i) => {
            doc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF")
               .text(header, x, yPos + 6, { width: colWidths[i] - 5 });
            x += colWidths[i];
          });
          yPos += 22;
        }
        const rowColor = index % 2 === 0 ? "#FFFFFF" : colors.lightGray;
        doc.rect(50, yPos, 500, 20).fill(rowColor);
        const rowValues = [
          item.cylinderSize,
          String(item.quantity),
          `${item.weightKg} kg`,
          `${item.totalWeightKg} kg`,
          `Rs. ${Number(item.ratePerKg).toLocaleString()}`,
          `Rs. ${Number(item.lineTotal).toLocaleString()}`
        ];
        x = 55;
        rowValues.forEach((val, i) => {
          doc.fontSize(9).font("Helvetica").fillColor(colors.dark)
             .text(val, x, yPos + 5, { width: colWidths[i] - 5 });
          x += colWidths[i];
        });
        yPos += 20;
      });

      doc.moveDown(2);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).lineWidth(1.5).strokeColor(colors.primary).stroke();
      doc.moveDown(0.5);

      doc.fontSize(14).font("Helvetica-Bold").fillColor(colors.dark).text("Total Amount:", 50, doc.y);
      doc.fontSize(14).font("Helvetica-Bold").fillColor(colors.primary)
         .text(`Rs. ${Number(invoice.totalAmount).toLocaleString()}`, 400, doc.y - 16, { width: 150, align: "right" });

      if (invoice.notes) {
        doc.moveDown(1.5);
        doc.fontSize(9).font("Helvetica").fillColor(colors.gray).text(`Notes: ${invoice.notes}`);
      }

      doc.moveDown(2);
      doc.fontSize(8).fillColor(colors.gray).text("Generated from Gas Cylinder Management System", { align: "center" });
      doc.text(`© ${new Date().getFullYear()} All Rights Reserved`, { align: "center" });
      doc.end();

    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateRiderInvoicePDF;