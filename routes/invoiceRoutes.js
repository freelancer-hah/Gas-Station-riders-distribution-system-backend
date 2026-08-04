const express = require("express");
const Invoice = require("../models/Invoice");
const Customer = require("../models/Customer");
const RiderInventory = require("../models/RiderInventory");
const RiderLedger = require("../models/RiderLedger");
const Payment = require("../models/Payment");
const generateNumber = require("../utils/generateNumber");
const { protect } = require("../middleware/auth");

const router = express.Router();

// GET /api/invoices
router.get("/", protect, async (req, res) => {
  try {
    const filter = req.user.role === "rider" ? { rider: req.user.id } : {};
    const invoices = await Invoice.find(filter)
      .populate("customer", "name businessName phone")
      .populate("rider", "name phone")
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ message: "Failed to load invoices", error: err.message });
  }
});

// GET /api/invoices/:id
router.get("/:id", protect, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("customer", "name businessName phone")
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

// POST /api/invoices - Create Invoice (Rider sells to customer)
router.post("/", protect, async (req, res) => {
  try {
    const {
      customer: customerId,
      items,
      amountPaid = 0,
      paymentMethod = "cash",
      paymentNotes = "",
    } = req.body;

    console.log("📝 Creating invoice with:", { customerId, items, amountPaid, paymentMethod, paymentNotes });

    if (!customerId) {
      return res.status(400).json({ message: "Customer is required" });
    }
    if (!items || !items.length) {
      return res.status(400).json({ message: "At least one item is required" });
    }

    const riderId = req.user.role === "rider" ? req.user.id : req.body.rider;
    if (!riderId) {
      return res.status(400).json({ message: "Rider ID is required" });
    }

    const preparedItems = [];
    for (const item of items) {
      const { cylinderSize, weightKg, quantity, ratePerKg } = item;

      if (!cylinderSize || !weightKg || !quantity || !ratePerKg) {
        return res.status(400).json({
          message: `Missing fields for item: ${JSON.stringify(item)}`,
        });
      }

      // Find rider inventory
      const riderStock = await RiderInventory.findOne({
        rider: riderId,
        cylinderSize: cylinderSize,
      });

      if (!riderStock) {
        return res.status(400).json({
          message: `Cylinder size ${cylinderSize} not found in your inventory`,
        });
      }

      if (riderStock.filledQty < quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${cylinderSize}. Available: ${riderStock.filledQty}, Need: ${quantity}`,
        });
      }

      // Update rider inventory: filled--, empty++
      riderStock.filledQty -= quantity;
      riderStock.emptyQty += quantity;
      await riderStock.save();

      const totalWeightKg = weightKg * quantity;
      const lineTotal = totalWeightKg * ratePerKg;

      preparedItems.push({
        cylinderSize,
        weightKg,
        quantity,
        totalWeightKg,
        ratePerKg,
        lineTotal,
      });
    }

    const subTotal = preparedItems.reduce((sum, i) => sum + i.lineTotal, 0);

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const previousBalance = customer.outstandingBalance || 0;
    const paidAmount = Number(amountPaid) || 0;

    // Grand total displayed on invoice = new sale + previous balance
    const grandTotal = subTotal + previousBalance;

    // Remaining balance for this invoice (includes previous balance)
    const remainingBalance = Math.max(0, grandTotal - paidAmount);

    // Invoice status: "paid" if the NEW sale amount is fully covered
    let status;
    if (paidAmount >= subTotal) {
      status = "paid";
    } else if (paidAmount > 0) {
      status = "partial";
    } else {
      status = "unpaid";
    }

    // Create invoice
    const invoice = await Invoice.create({
      invoiceNumber: generateNumber("INV"),
      customer: customerId,
      rider: riderId,
      items: preparedItems,
      subTotal,
      previousBalance,
      grandTotal,
      amountPaid: paidAmount,
      remainingBalance,
      status,
    });

    console.log(`✅ Invoice created: ${invoice.invoiceNumber}`);

    // Update customer outstanding balance
    customer.outstandingBalance = remainingBalance;
    await customer.save();

    // Update rider ledger - track sold to customers
    const riderLedger = await RiderLedger.findOne({ rider: riderId });
    if (riderLedger) {
      const totalSold = items.reduce((sum, item) => sum + item.quantity, 0);
      riderLedger.totalFilledSold = (riderLedger.totalFilledSold || 0) + totalSold;
      riderLedger.currentFilledBalance = (riderLedger.currentFilledBalance || 0) - totalSold;
      riderLedger.currentEmptyBalance = (riderLedger.currentEmptyBalance || 0) + totalSold;
      await riderLedger.save();
    }

    // Record payment if amountPaid > 0
    let payment = null;
    if (paidAmount > 0) {
      payment = await Payment.create({
        type: "customer",
        customer: customerId,
        invoice: invoice._id,
        amount: paidAmount,
        method: paymentMethod,
        receivedBy: riderId,
        notes: paymentNotes || `Payment on invoice ${invoice.invoiceNumber}`,
        paymentDate: new Date(),
      });
      console.log(`✅ Payment recorded: ${payment._id}`);
    }

    // Populate and return full invoice
    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate("customer", "name businessName phone")
      .populate("rider", "name phone");

    res.status(201).json({
      success: true,
      message: `Invoice ${populatedInvoice.invoiceNumber} created successfully`,
      invoice: populatedInvoice,
      payment, // may be null if no payment
    });
  } catch (err) {
    console.error("❌ Invoice creation error:", err);
    res.status(500).json({
      message: "Failed to create invoice",
      error: err.message,
    });
  }
});

module.exports = router;