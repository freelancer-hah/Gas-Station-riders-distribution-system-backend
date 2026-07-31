const express = require("express");
const AdminInventory = require("../models/AdminInventory");
const RiderInventory = require("../models/RiderInventory");
const RiderTransaction = require("../models/RiderTransaction");
const RiderLedger = require("../models/RiderLedger");
const RiderInvoice = require("../models/RiderInvoice");
const User = require("../models/User");
const generateNumber = require("../utils/generateNumber");
const generateRiderInvoicePDF = require("../utils/generateRiderInvoicePDF");
const { protect, allowRoles } = require("../middleware/auth");

const router = express.Router();

// ============================================================
// ADMIN INVENTORY ROUTES
// ============================================================

// GET /api/admin/inventory
router.get("/inventory", protect, allowRoles("admin"), async (req, res) => {
  try {
    const inventory = await AdminInventory.find().sort({ cylinderSize: 1 });
    res.json(inventory);
  } catch (err) {
    console.error("Error fetching admin inventory:", err);
    res.status(500).json({ message: "Failed to load inventory", error: err.message });
  }
});

// POST /api/admin/inventory
router.post("/inventory", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { cylinderSize, weightKg, filledQty, emptyQty, saleRatePerKg } = req.body;
    
    if (!cylinderSize || !weightKg) {
      return res.status(400).json({ message: "Cylinder size and weight are required" });
    }

    let inventory = await AdminInventory.findOne({ cylinderSize: cylinderSize.trim().toUpperCase() });
    
    if (inventory) {
      inventory.weightKg = weightKg || inventory.weightKg;
      inventory.filledQty = filledQty !== undefined ? filledQty : inventory.filledQty;
      inventory.emptyQty = emptyQty !== undefined ? emptyQty : inventory.emptyQty;
      inventory.saleRatePerKg = saleRatePerKg || inventory.saleRatePerKg;
      await inventory.save();
    } else {
      inventory = await AdminInventory.create({
        cylinderSize: cylinderSize.trim().toUpperCase(),
        weightKg: weightKg,
        filledQty: filledQty || 0,
        emptyQty: emptyQty || 0,
        saleRatePerKg: saleRatePerKg || 0,
      });
    }

    res.json(inventory);
  } catch (err) {
    console.error("Error updating admin inventory:", err);
    res.status(500).json({ message: "Failed to update inventory", error: err.message });
  }
});

// ============================================================
// SELL TO RIDER WITH INVOICE
// ============================================================

// POST /api/admin/sell-to-rider
router.post("/sell-to-rider", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { riderId, weightKg, filledQty, ratePerKg } = req.body;
    
    if (!riderId) {
      return res.status(400).json({ message: "Rider is required" });
    }
    if (!weightKg || Number(weightKg) <= 0) {
      return res.status(400).json({ message: "Valid cylinder weight is required" });
    }
    if (!filledQty || Number(filledQty) <= 0) {
      return res.status(400).json({ message: "Valid number of cylinders is required" });
    }
    if (!ratePerKg || Number(ratePerKg) <= 0) {
      return res.status(400).json({ message: "Valid rate per kg is required" });
    }

    const rider = await User.findById(riderId);
    if (!rider || rider.role !== "rider") {
      return res.status(404).json({ message: "Rider not found" });
    }

    const weight = Number(weightKg);
    const qty = Number(filledQty);
    const rate = Number(ratePerKg);
    
    const totalWeightKg = weight * qty;
    const totalAmount = totalWeightKg * rate;
    const size = `${weight}KG`;

    // 1. UPDATE ADMIN INVENTORY
    let adminStock = await AdminInventory.findOne({ cylinderSize: size });
    if (!adminStock) {
      adminStock = await AdminInventory.create({
        cylinderSize: size,
        weightKg: weight,
        filledQty: 0,
        emptyQty: 0,
        saleRatePerKg: rate,
      });
    } else {
      if (adminStock.weightKg !== weight) {
        adminStock.weightKg = weight;
      }
      adminStock.saleRatePerKg = rate;
    }
    adminStock.filledQty = Math.max(0, adminStock.filledQty - qty);
    await adminStock.save();

    // 2. UPDATE RIDER INVENTORY
    let riderStock = await RiderInventory.findOne({ 
      rider: riderId, 
      cylinderSize: size 
    });
    if (!riderStock) {
      riderStock = await RiderInventory.create({
        rider: riderId,
        cylinderSize: size,
        weightKg: weight,
        filledQty: qty,
        emptyQty: 0,
        ratePerKg: rate,
      });
    } else {
      riderStock.filledQty += qty;
      riderStock.ratePerKg = rate;
      if (riderStock.weightKg !== weight) {
        riderStock.weightKg = weight;
      }
      await riderStock.save();
    }

    // 3. CREATE TRANSACTION
    const transaction = await RiderTransaction.create({
      transactionNumber: generateNumber("RTR"),
      rider: riderId,
      type: "purchase",
      cylinderSize: size,
      filledQty: qty,
      ratePerKg: rate,
      totalWeightKg: totalWeightKg,
      totalAmount: totalAmount,
      notes: `Admin sold ${qty} cylinders of ${weight}kg to ${rider.name}`,
      createdBy: req.user.id,
    });

    // 4. CREATE INVOICE
    const invoice = await RiderInvoice.create({
      invoiceNumber: generateNumber("RINV"),
      rider: riderId,
      transaction: transaction._id,
      cylinderSize: size,
      weightKg: weight,
      quantity: qty,
      totalWeightKg: totalWeightKg,
      ratePerKg: rate,
      totalAmount: totalAmount,
      notes: `Sale of ${qty} cylinders of ${weight}kg to ${rider.name}`,
      createdBy: req.user.id,
    });

    // 5. UPDATE RIDER LEDGER
    let ledger = await RiderLedger.findOne({ rider: riderId });
    if (!ledger) {
      ledger = await RiderLedger.create({
        rider: riderId,
        totalFilledReceived: qty,
        currentFilledBalance: qty,
        totalPurchased: totalAmount,
        outstandingBalance: totalAmount,
        totalPaid: 0,
      });
    } else {
      ledger.totalFilledReceived += qty;
      ledger.currentFilledBalance += qty;
      ledger.totalPurchased += totalAmount;
      ledger.outstandingBalance += totalAmount;
      await ledger.save();
    }

    res.json({
      success: true,
      message: `Sold ${qty} cylinders of ${weight}kg to ${rider.name}`,
      invoice: {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        cylinderSize: invoice.cylinderSize,
        quantity: invoice.quantity,
        weightKg: invoice.weightKg,
        totalWeightKg: invoice.totalWeightKg,
        ratePerKg: invoice.ratePerKg,
        totalAmount: invoice.totalAmount,
        date: invoice.createdAt,
        rider: {
          name: rider.name,
          phone: rider.phone,
        }
      },
      transaction,
      adminStock,
      riderStock,
      ledger: {
        totalFilledReceived: ledger.totalFilledReceived,
        totalEmptyReturned: ledger.totalEmptyReturned || 0,
        currentFilledBalance: ledger.currentFilledBalance,
        currentEmptyBalance: ledger.currentEmptyBalance || 0,
        totalPurchased: ledger.totalPurchased,
        totalPaid: ledger.totalPaid || 0,
        outstandingBalance: ledger.outstandingBalance,
      },
    });

  } catch (err) {
    console.error("❌ Error selling to rider:", err);
    res.status(500).json({ message: "Failed to sell to rider", error: err.message });
  }
});

// ============================================================
// RECEIVE EMPTY CYLINDERS
// ============================================================

// POST /api/admin/receive-empty
router.post("/receive-empty", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { riderId, cylinderSize, emptyQty } = req.body;
    
    if (!riderId || !cylinderSize || !emptyQty || emptyQty <= 0) {
      return res.status(400).json({ message: "Rider, cylinder size and valid quantity are required" });
    }

    const rider = await User.findById(riderId);
    if (!rider || rider.role !== "rider") {
      return res.status(404).json({ message: "Rider not found" });
    }

    const size = cylinderSize.trim().toUpperCase();

    const riderStock = await RiderInventory.findOne({ 
      rider: riderId, 
      cylinderSize: size 
    });
    if (!riderStock || riderStock.emptyQty < emptyQty) {
      return res.status(400).json({ 
        message: `Insufficient empty cylinders. Available: ${riderStock?.emptyQty || 0}, Returning: ${emptyQty}` 
      });
    }

    let adminStock = await AdminInventory.findOne({ cylinderSize: size });
    if (!adminStock) {
      adminStock = await AdminInventory.create({
        cylinderSize: size,
        weightKg: riderStock.weightKg || 0,
        filledQty: 0,
        emptyQty: emptyQty,
        saleRatePerKg: riderStock.ratePerKg || 0,
      });
    } else {
      adminStock.emptyQty += emptyQty;
      await adminStock.save();
    }

    riderStock.emptyQty -= emptyQty;
    await riderStock.save();

    const transaction = await RiderTransaction.create({
      transactionNumber: generateNumber("RET"),
      rider: riderId,
      type: "return_empty",
      cylinderSize: size,
      emptyQty: emptyQty,
      notes: `${rider.name} returned ${emptyQty} empty cylinders of ${size}`,
      createdBy: req.user.id,
    });

    const ledger = await RiderLedger.findOne({ rider: riderId });
    if (ledger) {
      ledger.totalEmptyReturned = (ledger.totalEmptyReturned || 0) + emptyQty;
      ledger.currentEmptyBalance = Math.max(0, (ledger.currentEmptyBalance || 0) - emptyQty);
      await ledger.save();
    }

    res.json({
      success: true,
      message: `Received ${emptyQty} empty cylinders of ${size} from ${rider.name}`,
      transaction,
      adminStock,
      riderStock,
      ledger,
    });

  } catch (err) {
    console.error("Error receiving empty cylinders:", err);
    res.status(500).json({ message: "Failed to receive empty cylinders", error: err.message });
  }
});

// ============================================================
// RECORD PAYMENT
// ============================================================

// POST /api/admin/record-payment
router.post("/record-payment", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { riderId, amount, method, notes } = req.body;
    
    if (!riderId) {
      return res.status(400).json({ message: "Rider is required" });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const rider = await User.findById(riderId);
    if (!rider || rider.role !== "rider") {
      return res.status(404).json({ message: "Rider not found" });
    }

    const ledger = await RiderLedger.findOne({ rider: riderId });
    if (!ledger) {
      return res.status(400).json({ message: "No ledger found for this rider" });
    }

    // Create payment transaction
    const transaction = await RiderTransaction.create({
      transactionNumber: generateNumber("PAY"),
      rider: riderId,
      type: "payment",
      cylinderSize: "N/A",
      filledQty: 0,
      emptyQty: 0,
      totalAmount: Number(amount),
      notes: notes || `Payment via ${method || 'cash'}`,
      createdBy: req.user.id,
    });

    // Update ledger
    ledger.totalPaid = (ledger.totalPaid || 0) + Number(amount);
    ledger.outstandingBalance = Math.max(0, ledger.outstandingBalance - Number(amount));
    await ledger.save();

    res.json({
      success: true,
      message: `Payment of Rs. ${Number(amount).toLocaleString()} recorded from ${rider.name}`,
      transaction: {
        id: transaction._id,
        transactionNumber: transaction.transactionNumber,
        amount: transaction.totalAmount,
        notes: transaction.notes,
        date: transaction.createdAt,
      },
      ledger: {
        totalPaid: ledger.totalPaid,
        outstandingBalance: ledger.outstandingBalance,
        totalPurchased: ledger.totalPurchased,
      },
    });

  } catch (err) {
    console.error("❌ Error recording payment:", err);
    res.status(500).json({ message: "Failed to record payment", error: err.message });
  }
});

// ============================================================
// REPORTS & SUMMARIES
// ============================================================

// GET /api/admin/riders-summary
router.get("/riders-summary", protect, allowRoles("admin"), async (req, res) => {
  try {
    const riders = await User.find({ role: "rider", isActive: true }).select("name phone");
    
    const summary = await Promise.all(riders.map(async (rider) => {
      const ledger = await RiderLedger.findOne({ rider: rider._id });
      const inventory = await RiderInventory.find({ rider: rider._id });
      const transactions = await RiderTransaction.find({ rider: rider._id });
      
      const totalFilled = inventory.reduce((sum, item) => sum + (item.filledQty || 0), 0);
      const totalEmpty = inventory.reduce((sum, item) => sum + (item.emptyQty || 0), 0);
      
      return {
        rider: {
          id: rider._id,
          name: rider.name,
          phone: rider.phone,
        },
        ledger: ledger || {
          totalFilledReceived: 0,
          totalEmptyReturned: 0,
          currentFilledBalance: 0,
          currentEmptyBalance: 0,
          totalPurchased: 0,
          totalPaid: 0,
          outstandingBalance: 0,
        },
        inventory: {
          items: inventory,
          totalFilled,
          totalEmpty,
          totalCylinders: totalFilled + totalEmpty,
        },
        transactionCount: transactions.length,
      };
    }));

    res.json({
      riders: summary,
      totalRiders: riders.length,
    });
  } catch (err) {
    console.error("Error fetching riders summary:", err);
    res.status(500).json({ message: "Failed to load riders summary", error: err.message });
  }
});

// GET /api/admin/sales-report
router.get("/sales-report", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = { type: "purchase" };
    
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const sales = await RiderTransaction.find(filter)
      .populate("rider", "name phone")
      .sort({ createdAt: -1 });

    const totalAmount = sales.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const totalCylinders = sales.reduce((sum, t) => sum + (t.filledQty || 0), 0);

    res.json({
      sales,
      summary: {
        totalAmount,
        totalTransactions: sales.length,
        totalCylinders,
      }
    });
  } catch (err) {
    console.error("Error fetching sales report:", err);
    res.status(500).json({ message: "Failed to load sales report", error: err.message });
  }
});

// GET /api/admin/payment-collection
router.get("/payment-collection", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { from, to, riderId } = req.query;
    const filter = { type: "payment" };
    
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    if (riderId) {
      filter.rider = riderId;
    }

    const payments = await RiderTransaction.find(filter)
      .populate("rider", "name phone")
      .sort({ createdAt: -1 });

    const totalAmount = payments.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

    res.json({
      payments,
      summary: {
        totalAmount,
        totalPayments: payments.length,
      }
    });
  } catch (err) {
    console.error("Error fetching payment collection:", err);
    res.status(500).json({ message: "Failed to load payment collection", error: err.message });
  }
});

// ============================================================
// TRANSACTION & INVOICE ROUTES
// ============================================================

// GET /api/admin/transaction/:id
router.get("/transaction/:id", protect, allowRoles("admin"), async (req, res) => {
  try {
    const transaction = await RiderTransaction.findById(req.params.id)
      .populate("rider", "name phone");
    
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    
    res.json(transaction);
  } catch (err) {
    console.error("Error fetching transaction:", err);
    res.status(500).json({ message: "Failed to load transaction", error: err.message });
  }
});

// GET /api/admin/invoice/:id
router.get("/invoice/:id", protect, allowRoles("admin"), async (req, res) => {
  try {
    const invoice = await RiderInvoice.findById(req.params.id)
      .populate("rider", "name phone");
    
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    
    res.json(invoice);
  } catch (err) {
    console.error("Error fetching invoice:", err);
    res.status(500).json({ message: "Failed to load invoice", error: err.message });
  }
});

// GET /api/admin/invoice/:id/pdf
// Returns the invoice PDF as base64 in a JSON payload
router.get("/invoice/:id/pdf", protect, allowRoles("admin"), async (req, res) => {
  try {
    const invoice = await RiderInvoice.findById(req.params.id)
      .populate("rider", "name phone");

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found",
      });
    }

    const pdfBuffer = await generateRiderInvoicePDF(invoice);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Invoice_${invoice.invoiceNumber}.pdf`
    );

    return res.send(pdfBuffer);

  } catch (err) {
    console.error("Error generating invoice PDF:", err);

    res.status(500).json({
      message: "Failed to generate invoice PDF",
      error: err.message,
    });
  }
});

// GET /api/admin/invoices/:riderId
router.get("/invoices/:riderId", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { riderId } = req.params;
    
    const invoices = await RiderInvoice.find({ rider: riderId })
      .populate("rider", "name phone")
      .sort({ createdAt: -1 });

    res.json(invoices);
  } catch (err) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ message: "Failed to load invoices", error: err.message });
  }
});

// ============================================================
// RIDER LEDGER ROUTES
// ============================================================

// GET /api/admin/rider-ledger/:riderId
router.get("/rider-ledger/:riderId", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { riderId } = req.params;
    
    const rider = await User.findById(riderId).select("name phone");
    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }

    const ledger = await RiderLedger.findOne({ rider: riderId });
    const transactions = await RiderTransaction.find({ rider: riderId })
      .sort({ transactionDate: -1 });

    const inventory = await RiderInventory.find({ rider: riderId });

    res.json({
      rider,
      ledger: ledger || {
        totalFilledReceived: 0,
        totalEmptyReturned: 0,
        currentFilledBalance: 0,
        currentEmptyBalance: 0,
        totalPurchased: 0,
        totalPaid: 0,
        outstandingBalance: 0,
      },
      inventory,
      transactions,
    });
  } catch (err) {
    console.error("Error fetching rider ledger:", err);
    res.status(500).json({ message: "Failed to load rider ledger", error: err.message });
  }
});

// GET /api/admin/rider-inventory/:riderId
router.get("/rider-inventory/:riderId", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { riderId } = req.params;
    
    const rider = await User.findById(riderId).select("name phone");
    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }

    const inventory = await RiderInventory.find({ rider: riderId });
    const ledger = await RiderLedger.findOne({ rider: riderId });

    res.json({
      rider,
      inventory,
      ledger: ledger || {
        totalFilledReceived: 0,
        totalEmptyReturned: 0,
        currentFilledBalance: 0,
        currentEmptyBalance: 0,
      },
    });
  } catch (err) {
    console.error("Error fetching rider inventory:", err);
    res.status(500).json({ message: "Failed to load rider inventory", error: err.message });
  }
});

// GET /api/admin/export-rider-ledger/:riderId
router.get("/export-rider-ledger/:riderId", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { riderId } = req.params;
    
    const rider = await User.findById(riderId).select("name phone");
    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }

    const ledger = await RiderLedger.findOne({ rider: riderId });
    const transactions = await RiderTransaction.find({ rider: riderId })
      .sort({ transactionDate: -1 });
    const inventory = await RiderInventory.find({ rider: riderId });
    const invoices = await RiderInvoice.find({ rider: riderId })
      .sort({ createdAt: -1 });

    // Generate PDF
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Rider_Ledger_${rider.name.replace(/\s/g, '_')}.pdf`);
    
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
    doc.fontSize(20).font('Helvetica-Bold').fillColor(colors.primary).text('Rider Ledger Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor(colors.gray).text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown(0.5);

    // Rider Info
    doc.fontSize(14).font('Helvetica-Bold').fillColor(colors.dark).text(`Rider: ${rider.name}`);
    doc.fontSize(10).font('Helvetica').fillColor(colors.gray).text(`Phone: ${rider.phone || 'N/A'}`);
    doc.moveDown(1);

    // Summary Box
    const summaryY = doc.y;
    doc.rect(50, summaryY, 500, 80).fillAndStroke(colors.lightGray, colors.border);
    
    const summaryTexts = [
      { label: 'Total Received', value: ledger?.totalFilledReceived || 0 },
      { label: 'Empty Returned', value: ledger?.totalEmptyReturned || 0 },
      { label: 'Total Purchased', value: `Rs. ${(ledger?.totalPurchased || 0).toLocaleString()}` },
      { label: 'Total Paid', value: `Rs. ${(ledger?.totalPaid || 0).toLocaleString()}` },
      { label: 'Outstanding', value: `Rs. ${(ledger?.outstandingBalance || 0).toLocaleString()}`, color: (ledger?.outstandingBalance || 0) > 0 ? colors.danger : colors.success },
    ];

    summaryTexts.forEach((item, index) => {
      const x = 60 + (index * 95);
      doc.fontSize(8).font('Helvetica').fillColor(colors.gray).text(item.label, x, summaryY + 8, { width: 90 });
      doc.fontSize(10).font('Helvetica-Bold').fillColor(item.color || colors.dark).text(String(item.value), x, summaryY + 22, { width: 90 });
    });

    doc.moveDown(3);

    // Current Inventory
    if (inventory && inventory.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.dark).text('Current Inventory');
      doc.moveDown(0.5);
      
      const tableTop = doc.y;
      const colWidths = [150, 100, 100, 100];
      const headers = ['Cylinder Size', 'Filled', 'Empty', 'Total'];
      
      doc.rect(50, tableTop, 500, 20).fill(colors.primary);
      headers.forEach((header, i) => {
        let x = 55;
        for (let j = 0; j < i; j++) x += colWidths[j];
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF').text(header, x, tableTop + 5, { width: colWidths[i] - 5, align: 'left' });
      });

      let yPos = tableTop + 25;
      inventory.forEach((item, index) => {
        const rowColor = index % 2 === 0 ? '#FFFFFF' : colors.lightGray;
        doc.rect(50, yPos - 2, 500, 20).fill(rowColor);
        
        const values = [item.cylinderSize, item.filledQty || 0, item.emptyQty || 0, (item.filledQty || 0) + (item.emptyQty || 0)];
        values.forEach((value, i) => {
          let x = 55;
          for (let j = 0; j < i; j++) x += colWidths[j];
          doc.fontSize(9).font('Helvetica').fillColor(colors.dark).text(String(value), x, yPos, { width: colWidths[i] - 5, align: 'left' });
        });
        yPos += 20;
      });
      doc.moveDown(1);
    }

    // Transactions
    doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.dark).text('Transaction History');
    doc.moveDown(0.5);

    if (transactions && transactions.length > 0) {
      const transTop = doc.y;
      const transCols = [70, 80, 80, 100, 80, 80];
      const transHeaders = ['Date', 'Type', 'Reference', 'Cylinder', 'Amount', 'Balance'];
      
      doc.rect(50, transTop, 500, 20).fill(colors.primary);
      transHeaders.forEach((header, i) => {
        let x = 55;
        for (let j = 0; j < i; j++) x += transCols[j];
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF').text(header, x, transTop + 5, { width: transCols[i] - 5, align: 'left' });
      });

      let transY = transTop + 25;
      transactions.slice(0, 50).forEach((t, index) => {
        if (transY > 700) {
          doc.addPage();
          transY = 50;
          doc.rect(50, transY, 500, 20).fill(colors.primary);
          transHeaders.forEach((header, i) => {
            let x = 55;
            for (let j = 0; j < i; j++) x += transCols[j];
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF').text(header, x, transY + 5, { width: transCols[i] - 5, align: 'left' });
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
          doc.fontSize(8).font('Helvetica').fillColor(isAmount ? colors.primary : colors.dark).text(String(value), x, transY, { width: transCols[i] - 5, align: 'left' });
        });
        transY += 20;
      });
    }

    // Footer
    doc.moveDown(1);
    doc.fontSize(8).fillColor(colors.gray).text('Generated from Gas Cylinder Management System', { align: 'center' });
    doc.text(`© ${new Date().getFullYear()} All Rights Reserved`, { align: 'center' });

    doc.end();

  } catch (err) {
    console.error("Error exporting rider ledger:", err);
    res.status(500).json({ message: "Failed to export rider ledger", error: err.message });
  }
});

module.exports = router;