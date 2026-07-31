const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generateLedgerPDF(data, type, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  
  // Set response headers
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${data.title || 'ledger'}.pdf`);
  
  // Pipe the PDF to the response
  doc.pipe(res);

  // Colors
  const colors = {
    primary: '#0F62FE',
    dark: '#161616',
    gray: '#6F6F6F',
    lightGray: '#F4F4F4',
    danger: '#DA1E28',
    success: '#24A148',
    border: '#E0E0E0',
  };

  // Header
  doc.fontSize(20)
     .font('Helvetica-Bold')
     .fillColor(colors.primary)
     .text(data.title || 'Ledger Report', { align: 'center' });
  
  doc.moveDown(0.5);

  // Date and generation info
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor(colors.gray)
     .text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
  
  if (data.dateRange?.from || data.dateRange?.to) {
    const fromStr = data.dateRange.from || 'Start';
    const toStr = data.dateRange.to || 'End';
    doc.text(`Date Range: ${fromStr} to ${toStr}`, { align: 'right' });
  }
  
  doc.moveDown(0.5);

  // Summary Box
  const summaryY = doc.y;
  doc.rect(50, summaryY, 500, 80)
     .fillAndStroke(colors.lightGray, colors.border);
  
  doc.fillColor(colors.dark);
  
  let summaryX = 70;
  let summaryTexts = [];
  
  if (type === 'customer') {
    summaryTexts = [
      { label: 'Total Invoices', value: data.totalInvoices || 0 },
      { label: 'Total Purchases', value: `Rs. ${(data.totalPurchases || 0).toLocaleString()}` },
      { label: 'Total Payments', value: `Rs. ${(data.totalPaid || 0).toLocaleString()}` },
      { label: 'Outstanding', value: `Rs. ${(data.outstanding || 0).toLocaleString()}`, color: data.outstanding > 0 ? colors.danger : colors.success },
    ];
  } else {
    summaryTexts = [
      { label: 'Total Refills', value: data.totalRefills || 0 },
      { label: 'Total Purchases', value: `Rs. ${(data.totalPurchases || 0).toLocaleString()}` },
      { label: 'Total Payments', value: `Rs. ${(data.totalPaid || 0).toLocaleString()}` },
      { label: 'Outstanding', value: `Rs. ${(data.outstanding || 0).toLocaleString()}`, color: data.outstanding > 0 ? colors.danger : colors.success },
    ];
  }

  summaryTexts.forEach((item, index) => {
    const x = 70 + (index * 125);
    doc.fontSize(9)
       .fillColor(colors.gray)
       .text(item.label, x, summaryY + 8, { width: 100 });
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor(item.color || colors.dark)
       .text(String(item.value), x, summaryY + 24, { width: 100 });
  });

  doc.moveDown(3);

  // Customer/Supplier Info
  if (type === 'customer' && data.customer) {
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor(colors.dark)
       .text(`Customer: ${data.customer.name}`);
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor(colors.gray)
       .text(`Phone: ${data.customer.phone || 'N/A'}`);
    if (data.customer.businessName) {
      doc.text(`Business: ${data.customer.businessName}`);
    }
    if (data.customer.address) {
      doc.text(`Address: ${data.customer.address}`);
    }
  } else if (type === 'supplier' && data.supplier) {
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor(colors.dark)
       .text(`Supplier: ${data.supplier.name}`);
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor(colors.gray)
       .text(`Phone: ${data.supplier.phone || 'N/A'}`);
    if (data.supplier.contactPerson) {
      doc.text(`Contact Person: ${data.supplier.contactPerson}`);
    }
    if (data.supplier.address) {
      doc.text(`Address: ${data.supplier.address}`);
    }
  }

  doc.moveDown(1);

  // Table Headers
  const tableTop = doc.y;
  const colWidths = [70, 50, 80, 100, 70, 70, 70];
  const headers = ['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'];
  
  doc.rect(50, tableTop, 500, 25)
     .fill(colors.primary);
  
  headers.forEach((header, i) => {
    let x = 55;
    for (let j = 0; j < i; j++) {
      x += colWidths[j];
    }
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#FFFFFF')
       .text(header, x, tableTop + 6, { width: colWidths[i] - 10, align: 'center' });
  });

  doc.moveDown(0.5);

  // Table Rows
  let yPos = tableTop + 30;
  const ledgerEntries = data.ledger || [];
  
  ledgerEntries.forEach((entry, index) => {
    if (yPos > 700) {
      doc.addPage();
      yPos = 50;
      
      // Redraw headers on new page
      doc.rect(50, yPos, 500, 25)
         .fill(colors.primary);
      
      headers.forEach((header, i) => {
        let x = 55;
        for (let j = 0; j < i; j++) {
          x += colWidths[j];
        }
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#FFFFFF')
           .text(header, x, yPos + 6, { width: colWidths[i] - 10, align: 'center' });
      });
      yPos += 30;
    }

    const rowColor = index % 2 === 0 ? '#FFFFFF' : colors.lightGray;
    doc.rect(50, yPos - 2, 500, 20)
       .fill(rowColor);

    const values = [
      new Date(entry.date).toLocaleDateString(),
      entry.kind || 'N/A',
      entry.reference || '-',
      entry.description || '-',
      entry.debit > 0 ? entry.debit.toLocaleString() : '-',
      entry.credit > 0 ? entry.credit.toLocaleString() : '-',
      entry.runningBalance.toLocaleString(),
    ];

    values.forEach((value, i) => {
      let x = 55;
      for (let j = 0; j < i; j++) {
        x += colWidths[j];
      }
      const isDebit = i === 4 && entry.debit > 0;
      const isCredit = i === 5 && entry.credit > 0;
      const isBalance = i === 6;
      
      let color = colors.dark;
      if (isDebit) color = colors.danger;
      else if (isCredit) color = colors.success;
      else if (isBalance) color = colors.dark;
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor(color)
         .text(value, x, yPos, { width: colWidths[i] - 10, align: i === 0 ? 'left' : 'center' });
    });

    yPos += 20;
  });

  // Footer
  doc.moveDown(1);
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor(colors.gray)
     .text(`Total Entries: ${ledgerEntries.length}`, { align: 'center' });
  
  doc.moveDown(0.5);
  doc.fontSize(8)
     .fillColor(colors.gray)
     .text('Generated from Gas Cylinder Management System', { align: 'center' });
  doc.text(`© ${new Date().getFullYear()} All Rights Reserved`, { align: 'center' });

  // Finalize the PDF
  doc.end();
}

module.exports = generateLedgerPDF;