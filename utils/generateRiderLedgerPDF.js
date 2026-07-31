const PDFDocument = require('pdfkit');

function generateRiderLedgerPDF(data, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Rider_Ledger_${data.rider.name.replace(/\s/g, '_')}.pdf`);
  
  doc.pipe(res);

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
     .text('Rider Ledger Report', { align: 'center' });
  
  doc.moveDown(0.5);

  doc.fontSize(10)
     .font('Helvetica')
     .fillColor(colors.gray)
     .text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
  
  doc.moveDown(0.5);

  // Rider Info
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .fillColor(colors.dark)
     .text(`Rider: ${data.rider.name}`);
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor(colors.gray)
     .text(`Phone: ${data.rider.phone || 'N/A'}`);
  
  doc.moveDown(1);

  // Summary Box
  const summaryY = doc.y;
  doc.rect(50, summaryY, 500, 80)
     .fillAndStroke(colors.lightGray, colors.border);
  
  const summaryTexts = [
    { label: 'Total Received', value: data.ledger.totalFilledReceived || 0 },
    { label: 'Empty Returned', value: data.ledger.totalEmptyReturned || 0 },
    { label: 'Total Purchased', value: `Rs. ${(data.ledger.totalPurchased || 0).toLocaleString()}` },
    { label: 'Total Paid', value: `Rs. ${(data.ledger.totalPaid || 0).toLocaleString()}` },
    { label: 'Outstanding', value: `Rs. ${(data.ledger.outstandingBalance || 0).toLocaleString()}`, color: data.ledger.outstandingBalance > 0 ? colors.danger : colors.success },
  ];

  summaryTexts.forEach((item, index) => {
    const x = 60 + (index * 95);
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor(colors.gray)
       .text(item.label, x, summaryY + 8, { width: 90 });
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor(item.color || colors.dark)
       .text(String(item.value), x, summaryY + 22, { width: 90 });
  });

  doc.moveDown(3);

  // Current Inventory
  if (data.inventory && data.inventory.length > 0) {
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor(colors.dark)
       .text('Current Inventory');
    
    doc.moveDown(0.5);
    
    const tableTop = doc.y;
    const colWidths = [150, 100, 100, 100];
    const headers = ['Cylinder Size', 'Filled', 'Empty', 'Total'];
    
    doc.rect(50, tableTop, 500, 20).fill(colors.primary);
    headers.forEach((header, i) => {
      let x = 55;
      for (let j = 0; j < i; j++) x += colWidths[j];
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF')
         .text(header, x, tableTop + 5, { width: colWidths[i] - 5, align: 'left' });
    });

    let yPos = tableTop + 25;
    data.inventory.forEach((item, index) => {
      const rowColor = index % 2 === 0 ? '#FFFFFF' : colors.lightGray;
      doc.rect(50, yPos - 2, 500, 20).fill(rowColor);
      
      const values = [item.cylinderSize, item.filledQty || 0, item.emptyQty || 0, (item.filledQty || 0) + (item.emptyQty || 0)];
      values.forEach((value, i) => {
        let x = 55;
        for (let j = 0; j < i; j++) x += colWidths[j];
        doc.fontSize(9).font('Helvetica').fillColor(colors.dark)
           .text(String(value), x, yPos, { width: colWidths[i] - 5, align: 'left' });
      });
      yPos += 20;
    });
    doc.moveDown(1);
  }

  // Transactions
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor(colors.dark)
     .text('Transaction History');
  
  doc.moveDown(0.5);

  if (data.transactions && data.transactions.length > 0) {
    const transTop = doc.y;
    const transCols = [70, 80, 80, 100, 80, 80];
    const transHeaders = ['Date', 'Type', 'Reference', 'Cylinder', 'Amount', 'Balance'];
    
    doc.rect(50, transTop, 500, 20).fill(colors.primary);
    transHeaders.forEach((header, i) => {
      let x = 55;
      for (let j = 0; j < i; j++) x += transCols[j];
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
         .text(header, x, transTop + 5, { width: transCols[i] - 5, align: 'left' });
    });

    let transY = transTop + 25;
    data.transactions.slice(0, 50).forEach((t, index) => {
      if (transY > 700) {
        doc.addPage();
        transY = 50;
        doc.rect(50, transY, 500, 20).fill(colors.primary);
        transHeaders.forEach((header, i) => {
          let x = 55;
          for (let j = 0; j < i; j++) x += transCols[j];
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
             .text(header, x, transY + 5, { width: transCols[i] - 5, align: 'left' });
        });
        transY += 25;
      }

      const rowColor = index % 2 === 0 ? '#FFFFFF' : colors.lightGray;
      doc.rect(50, transY - 2, 500, 20).fill(rowColor);
      
      const values = [
        new Date(t.transactionDate || t.createdAt).toLocaleDateString(),
        t.type || 'N/A',
        t.transactionNumber || '-',
        t.cylinderSize || '-',
        (t.totalAmount || 0).toLocaleString(),
        '...',
      ];
      values.forEach((value, i) => {
        let x = 55;
        for (let j = 0; j < i; j++) x += transCols[j];
        const isAmount = i === 4;
        doc.fontSize(8).font('Helvetica')
           .fillColor(isAmount ? colors.primary : colors.dark)
           .text(String(value), x, transY, { width: transCols[i] - 5, align: 'left' });
      });
      transY += 20;
    });
  }

  // Footer
  doc.moveDown(1);
  doc.fontSize(8)
     .fillColor(colors.gray)
     .text('Generated from Gas Cylinder Management System', { align: 'center' });
  doc.text(`© ${new Date().getFullYear()} All Rights Reserved`, { align: 'center' });

  doc.end();
}

module.exports = generateRiderLedgerPDF;