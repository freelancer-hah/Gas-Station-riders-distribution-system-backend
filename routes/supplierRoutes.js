const express = require("express");
const Supplier = require("../models/Supplier");
const PlantRefill = require("../models/PlantRefill");
const Payment = require("../models/Payment");
const { protect } = require("../middleware/auth");

const router = express.Router();

// GET /api/suppliers - All suppliers (riders can view)
router.get("/", protect, async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ name: 1 });
    res.json(suppliers);
  } catch (err) {
    console.error("Error fetching suppliers:", err);
    res.status(500).json({ message: "Failed to load suppliers", error: err.message });
  }
});

// POST /api/suppliers - Create supplier (Rider allowed)
router.post("/", protect, async (req, res) => {
  try {
    const supplierData = {
      ...req.body,
      createdBy: req.user.id
    };
    const supplier = await Supplier.create(supplierData);
    res.status(201).json(supplier);
  } catch (err) {
    console.error("Error creating supplier:", err);
    res.status(500).json({ message: "Failed to create supplier", error: err.message });
  }
});

// PUT /api/suppliers/:id - Update supplier
router.put("/:id", protect, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    
    const updated = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    console.error("Error updating supplier:", err);
    res.status(500).json({ message: "Failed to update supplier", error: err.message });
  }
});

// GET /api/suppliers/:id - Get single supplier
router.get("/:id", protect, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    res.json(supplier);
  } catch (err) {
    console.error("Error fetching supplier:", err);
    res.status(500).json({ message: "Failed to load supplier", error: err.message });
  }
});

// GET /api/suppliers/:id/ledger - Supplier Ledger (Rider allowed)
router.get("/:id/ledger", protect, async (req, res) => {
  try {
    const { id } = req.params;
    
    const supplier = await Supplier.findById(id);
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // Get all purchases (refills) from this supplier
    const purchases = await PlantRefill.find({ supplier: id })
      .populate("rider", "name")
      .sort({ purchaseDate: 1 });

    // Get all payments made to this supplier
    const payments = await Payment.find({ 
      type: "supplier", 
      supplier: id 
    })
      .populate("receivedBy", "name")
      .sort({ paymentDate: 1 });

    // Create ledger entries
    const entries = [
      ...purchases.map((p) => ({
        kind: "purchase",
        date: p.purchaseDate,
        reference: p.purchaseNumber,
        debit: p.totalAmount, // Supplier is owed this amount (purchase)
        credit: 0,
        description: `${p.quantity} cylinders of ${p.cylinderSize} (${p.totalWeightKg}kg)`,
        rider: p.rider?.name || "Unknown",
        rate: p.ratePerKg,
        totalWeight: p.totalWeightKg,
        quantity: p.quantity,
      })),
      ...payments.map((p) => ({
        kind: "payment",
        date: p.paymentDate,
        reference: p._id,
        debit: 0,
        credit: p.amount, // Payment made to supplier
        description: p.notes || `Payment via ${p.method}`,
        receivedBy: p.receivedBy?.name || "Unknown",
        method: p.method,
      })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance
    let running = 0;
    const ledger = entries.map((e) => {
      running += e.debit - e.credit;
      return { ...e, runningBalance: running };
    });

    // Summary
    const totalPurchases = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      supplier: {
        id: supplier._id,
        name: supplier.name,
        phone: supplier.phone,
        contactPerson: supplier.contactPerson,
        address: supplier.address,
      },
      ledger,
      summary: {
        totalPurchases,
        totalPayments,
        outstandingBalance: supplier.outstandingBalance,
        totalRefills: purchases.length,
        totalPaymentsCount: payments.length,
      },
    });

  } catch (err) {
    console.error("Error fetching supplier ledger:", err);
    res.status(500).json({ message: "Failed to load supplier ledger", error: err.message });
  }
});

module.exports = router;