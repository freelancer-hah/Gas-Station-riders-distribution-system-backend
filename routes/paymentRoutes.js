const express = require("express");
const Payment = require("../models/Payment");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const Invoice = require("../models/Invoice");
const { protect } = require("../middleware/auth");

const router = express.Router();

// GET /api/payments
router.get("/", protect, async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.customer) filter.customer = req.query.customer;
    if (req.query.supplier) filter.supplier = req.query.supplier;
    
    // Riders can only see their own payments
    if (req.user.role === "rider") {
      filter.receivedBy = req.user.id;
    }
    
    const payments = await Payment.find(filter)
      .populate("customer", "name phone")
      .populate("supplier", "name phone")
      .populate("receivedBy", "name")
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    console.error("Error fetching payments:", err);
    res.status(500).json({ message: "Failed to load payments", error: err.message });
  }
});

// POST /api/payments/customer - Record customer payment (Rider allowed)
router.post("/customer", protect, async (req, res) => {
  try {
    const { customerId, amount, method, invoiceId, notes } = req.body;
    
    if (!customerId || !amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Customer ID and valid amount are required" });
    }
    
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Check if rider owns this customer
    if (req.user.role === "rider" && customer.assignedRider.toString() !== req.user.id) {
      return res.status(403).json({ message: "You can only receive payments from your own customers" });
    }

    const payment = await Payment.create({
      type: "customer",
      customer: customerId,
      invoice: invoiceId || undefined,
      amount: Number(amount),
      method: method || "cash",
      receivedBy: req.user.id,
      notes,
    });

    // Update customer outstanding
    customer.outstandingBalance = Math.max(0, customer.outstandingBalance - Number(amount));
    await customer.save();

    // Update invoice if linked
    if (invoiceId) {
      const invoice = await Invoice.findById(invoiceId);
      if (invoice) {
        invoice.amountPaid += Number(amount);
        invoice.remainingBalance = Math.max(0, invoice.remainingBalance - Number(amount));
        invoice.status = invoice.remainingBalance <= 0 ? "paid" : "partial";
        await invoice.save();
      }
    }

    const populatedPayment = await Payment.findById(payment._id)
      .populate("customer", "name phone")
      .populate("receivedBy", "name");

    res.status(201).json({
      payment: populatedPayment,
      customerOutstanding: customer.outstandingBalance,
    });

  } catch (err) {
    console.error("Error recording customer payment:", err);
    res.status(500).json({ message: "Failed to record customer payment", error: err.message });
  }
});

// POST /api/payments/supplier - Record supplier payment (Rider allowed)
router.post("/supplier", protect, async (req, res) => {
  try {
    const { supplierId, amount, method, notes } = req.body;
    
    if (!supplierId || !amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Supplier ID and valid amount are required" });
    }
    
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    const payment = await Payment.create({
      type: "supplier",
      supplier: supplierId,
      amount: Number(amount),
      method: method || "cash",
      receivedBy: req.user.id,
      notes,
    });

    // Update supplier outstanding balance (decrease)
    supplier.outstandingBalance = Math.max(0, supplier.outstandingBalance - Number(amount));
    await supplier.save();

    const populatedPayment = await Payment.findById(payment._id)
      .populate("supplier", "name phone")
      .populate("receivedBy", "name");

    res.status(201).json({
      payment: populatedPayment,
      supplierOutstanding: supplier.outstandingBalance,
    });

  } catch (err) {
    console.error("Error recording supplier payment:", err);
    res.status(500).json({ message: "Failed to record supplier payment", error: err.message });
  }
});

// GET /api/payments/supplier/:supplierId - Get all payments for a supplier
router.get("/supplier/:supplierId", protect, async (req, res) => {
  try {
    const { supplierId } = req.params;
    
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    const payments = await Payment.find({ 
      type: "supplier", 
      supplier: supplierId 
    })
      .populate("receivedBy", "name")
      .sort({ paymentDate: -1 });

    res.json({
      supplier: supplier,
      payments: payments,
      totalPaid: payments.reduce((sum, p) => sum + p.amount, 0),
      outstandingBalance: supplier.outstandingBalance,
    });

  } catch (err) {
    console.error("Error fetching supplier payments:", err);
    res.status(500).json({ message: "Failed to load supplier payments", error: err.message });
  }
});

module.exports = router;