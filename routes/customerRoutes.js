const express = require("express");
const Customer = require("../models/Customer");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const { protect, allowRoles } = require("../middleware/auth");

const router = express.Router();

// GET /api/customers - list (riders see only their assigned customers)
router.get("/", protect, async (req, res) => {
  const filter = req.user.role === "rider" ? { assignedRider: req.user.id } : {};
  const customers = await Customer.find(filter).sort({ name: 1 });
  res.json(customers);
});

// POST /api/customers - create (Riders can create customers)
// Rider creates customer - automatically assigned to that rider
router.post("/", protect, async (req, res) => {
  try {
    const customerData = {
      ...req.body,
      assignedRider: req.user.id, // Auto-assign to the rider creating it
      createdBy: req.user.id
    };
    const customer = await Customer.create(customerData);
    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ message: "Failed to create customer", error: err.message });
  }
});

// PUT /api/customers/:id - update (Rider can update their own customers)
router.put("/:id", protect, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    
    // Check if rider owns this customer
    if (req.user.role === "rider" && customer.assignedRider.toString() !== req.user.id) {
      return res.status(403).json({ message: "You can only update your own customers" });
    }
    
    const updated = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update customer", error: err.message });
  }
});

// GET /api/customers/:id - detail
router.get("/:id", protect, async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ message: "Customer not found" });
  
  // Check if rider can view this customer
  if (req.user.role === "rider" && customer.assignedRider.toString() !== req.user.id) {
    return res.status(403).json({ message: "You can only view your own customers" });
  }
  
  res.json(customer);
});

// GET /api/customers/:id/ledger - full transaction history, running balance
router.get("/:id/ledger", protect, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    
    // Check if rider can view this ledger
    if (req.user.role === "rider" && customer.assignedRider.toString() !== req.user.id) {
      return res.status(403).json({ message: "You can only view your own customers' ledgers" });
    }
    
    const invoices = await Invoice.find({ customer: req.params.id }).sort({ invoiceDate: 1 });
    const payments = await Payment.find({ type: "customer", customer: req.params.id }).sort({
      paymentDate: 1,
    });

    const entries = [
      ...invoices.map((inv) => ({
        kind: "invoice",
        date: inv.invoiceDate,
        reference: inv.invoiceNumber,
        debit: inv.grandTotal - inv.previousBalance,
        credit: 0,
      })),
      ...payments.map((p) => ({
        kind: "payment",
        date: p.paymentDate,
        reference: p._id,
        debit: 0,
        credit: p.amount,
      })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = 0;
    const ledger = entries.map((e) => {
      running += e.debit - e.credit;
      return { ...e, runningBalance: running };
    });

    res.json({ ledger, outstandingBalance: running });
  } catch (err) {
    res.status(500).json({ message: "Failed to build ledger", error: err.message });
  }
});

module.exports = router;