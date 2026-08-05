const express = require("express");
const User = require("../models/User");
const RiderInventory = require("../models/RiderInventory");
const RiderLedger = require("../models/RiderLedger");
const RiderTransaction = require("../models/RiderTransaction");
const AdminInventory = require("../models/AdminInventory");
const Invoice = require("../models/Invoice");
const { protect, allowRoles } = require("../middleware/auth");
const { SIZE_LABELS, getWeightBySize } = require("../constants/cylinderSizes");
const generateNumber = require("../utils/generateNumber");

const router = express.Router();

// ==================== ADMIN ROUTES ====================

// GET /api/riders/pending - admin only
router.get("/pending", protect, allowRoles("admin"), async (req, res) => {
  try {
    const [pending, verified] = await Promise.all([
      User.find({ role: "rider", isActive: false }).select("-password"),
      User.find({ role: "rider", isActive: true }).select("-password")
    ]);
    res.json({ pending, verified });
  } catch (err) {
    console.error("Error fetching pending riders:", err);
    res.status(500).json({ message: "Failed to load riders", error: err.message });
  }
});

// PUT /api/riders/:id/verify - admin only
router.put("/:id/verify", protect, allowRoles("admin"), async (req, res) => {
  try {
    const rider = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );
    if (!rider) return res.status(404).json({ message: "Rider not found" });
    res.json(rider.toSafeObject());
  } catch (err) {
    console.error("Error verifying rider:", err);
    res.status(500).json({ message: "Failed to verify rider", error: err.message });
  }
});

// PUT /api/riders/:id/deactivate - admin only
router.put("/:id/deactivate", protect, allowRoles("admin"), async (req, res) => {
  try {
    const rider = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!rider) return res.status(404).json({ message: "Rider not found" });
    res.json(rider.toSafeObject());
  } catch (err) {
    console.error("Error deactivating rider:", err);
    res.status(500).json({ message: "Failed to deactivate rider", error: err.message });
  }
});

// PUT /api/riders/:id/activate - admin only
router.put("/:id/activate", protect, allowRoles("admin"), async (req, res) => {
  try {
    const rider = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );
    if (!rider) return res.status(404).json({ message: "Rider not found" });
    res.json(rider.toSafeObject());
  } catch (err) {
    console.error("Error activating rider:", err);
    res.status(500).json({ message: "Failed to activate rider", error: err.message });
  }
});

// GET /api/riders - admin only
router.get("/", protect, allowRoles("admin"), async (req, res) => {
  try {
    const riders = await User.find({ role: "rider" }).select("-password");
    res.json(riders);
  } catch (err) {
    console.error("Error fetching riders:", err);
    res.status(500).json({ message: "Failed to load riders", error: err.message });
  }
});

// GET /api/riders/:id/summary - admin view of a rider's current state
router.get("/:id/summary", protect, allowRoles("admin"), async (req, res) => {
  try {
    const inventory = await RiderInventory.find({ rider: req.params.id });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todaysInvoices = await Invoice.find({
      rider: req.params.id,
      createdAt: { $gte: todayStart }
    });
    const todaysSales = todaysInvoices.reduce((sum, i) => sum + i.subTotal, 0);
    const todaysCollection = todaysInvoices.reduce((sum, i) => sum + i.amountPaid, 0);
    res.json({ inventory, todaysSales, todaysCollection, todaysDeliveries: todaysInvoices.length });
  } catch (err) {
    console.error("Error fetching rider summary:", err);
    res.status(500).json({ message: "Failed to load rider summary", error: err.message });
  }
});

// ==================== RIDER ROUTES ====================

// GET /api/riders/me - rider sees their own info
router.get("/me", protect, async (req, res) => {
  try {
    const riderId = req.user.id;
    const inventory = await RiderInventory.find({ rider: riderId });
    const ledger = await RiderLedger.findOne({ rider: riderId });
    const transactions = await RiderTransaction.find({ rider: riderId })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      rider: req.user.toSafeObject(),
      inventory,
      ledger: ledger || {
        totalFilledReceived: 0,
        totalEmptyReturned: 0,
        currentFilledBalance: 0,
        currentEmptyBalance: 0,
        totalPurchased: 0,
        totalPaid: 0,
        outstandingBalance: 0,
      },
      transactions,
    });
  } catch (err) {
    console.error("Error fetching rider data:", err);
    res.status(500).json({ message: "Failed to load rider data", error: err.message });
  }
});

// GET /api/riders/my-balance - rider sees their outstanding balance
router.get("/my-balance", protect, async (req, res) => {
  try {
    const riderId = req.user.id;
    const ledger = await RiderLedger.findOne({ rider: riderId });
    const payments = await RiderTransaction.find({
      rider: riderId,
      type: "payment"
    }).sort({ createdAt: -1 });

    res.json({
      outstandingBalance: ledger?.outstandingBalance || 0,
      totalPurchased: ledger?.totalPurchased || 0,
      totalPaid: ledger?.totalPaid || 0,
      payments: payments || [],
    });
  } catch (err) {
    console.error("Error fetching balance:", err);
    res.status(500).json({ message: "Failed to load balance", error: err.message });
  }
});

// POST /api/riders/pay-admin - rider pays admin
router.post("/pay-admin", protect, async (req, res) => {
  try {
    const riderId = req.user.id;
    const { amount, method, notes } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const ledger = await RiderLedger.findOne({ rider: riderId });
    if (!ledger) {
      return res.status(400).json({ message: "No ledger found for this rider" });
    }

    if (Number(amount) > ledger.outstandingBalance) {
      // Allow overpayment but warn
      console.log(`Payment ${amount} exceeds outstanding ${ledger.outstandingBalance}`);
    }

    // Create payment transaction
    const transaction = await RiderTransaction.create({
      transactionNumber: `PAY-${Date.now()}`,
      rider: riderId,
      type: "payment",
      cylinderSize: "N/A",
      filledQty: 0,
      emptyQty: 0,
      ratePerKg: 0,
      totalAmount: Number(amount),
      notes: notes || `Payment via ${method || 'cash'}`,
      createdBy: riderId,
    });

    // Update ledger
    ledger.totalPaid = (ledger.totalPaid || 0) + Number(amount);
    ledger.outstandingBalance = Math.max(0, ledger.outstandingBalance - Number(amount));
    await ledger.save();

    res.json({
      success: true,
      message: "Payment recorded successfully",
      transaction,
      remainingOutstanding: ledger.outstandingBalance,
    });
  } catch (err) {
    console.error("Error processing payment:", err);
    res.status(500).json({ message: "Failed to process payment", error: err.message });
  }
});

// ============================================================
// ✅ UPDATED: RIDER RETURNS MULTIPLE EMPTY CYLINDERS
// ============================================================

// POST /api/riders/return-empty
router.post("/return-empty", protect, async (req, res) => {
  try {
    const riderId = req.user.id;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "At least one cylinder size is required" });
    }

    const rider = await User.findById(riderId);
    if (!rider || rider.role !== "rider") {
      return res.status(404).json({ message: "Rider not found" });
    }

    let totalEmptyReturned = 0;
    let transactionNotes = [];

    for (const item of items) {
      const { cylinderSize, emptyQty } = item;

      if (!cylinderSize) {
        return res.status(400).json({ message: "Cylinder size is required for all items" });
      }
      if (!emptyQty || Number(emptyQty) <= 0) {
        return res.status(400).json({ message: "Valid empty quantity is required for all items" });
      }

      // Validate and format size (add space if needed)
      const size = cylinderSize.trim().toUpperCase();
      // Ensure it's in the correct format (e.g., "23 KG")
      const formattedSize = size.replace(/(\d+)(KG)/i, '$1 KG');
      if (!SIZE_LABELS.includes(formattedSize)) {
        return res.status(400).json({
          message: `Invalid cylinder size ${formattedSize}. Allowed: ${SIZE_LABELS.join(", ")}`,
        });
      }

      const qty = Number(emptyQty);

      // Check rider inventory for this size
      const riderStock = await RiderInventory.findOne({
        rider: riderId,
        cylinderSize: formattedSize,
      });

      if (!riderStock || riderStock.emptyQty < qty) {
        return res.status(400).json({
          message: `Insufficient empty cylinders for ${formattedSize}. Available: ${riderStock?.emptyQty || 0}, Requested: ${qty}`,
        });
      }

      // 1. Update Rider Inventory (subtract empty)
      riderStock.emptyQty -= qty;
      await riderStock.save();

      // 2. Update Admin Inventory (add empty)
      let adminStock = await AdminInventory.findOne({ cylinderSize: formattedSize });
      if (!adminStock) {
        adminStock = await AdminInventory.create({
          cylinderSize: formattedSize,
          weightKg: riderStock.weightKg || 0,
          filledQty: 0,
          emptyQty: qty,
          saleRatePerKg: riderStock.ratePerKg || 0,
        });
      } else {
        adminStock.emptyQty += qty;
        await adminStock.save();
      }

      totalEmptyReturned += qty;
      transactionNotes.push(`${qty} of ${formattedSize}`);
    }

    // 3. Create ONE transaction
    const transaction = await RiderTransaction.create({
      transactionNumber: generateNumber("RET"),
      rider: riderId,
      type: "return_empty",
      cylinderSize: "MULTI",
      emptyQty: totalEmptyReturned,
      notes: `Returned ${totalEmptyReturned} empty cylinders (${transactionNotes.join(", ")})`,
      createdBy: riderId,
    });

    // 4. Update Rider Ledger
    const ledger = await RiderLedger.findOne({ rider: riderId });
    if (ledger) {
      ledger.totalEmptyReturned = (ledger.totalEmptyReturned || 0) + totalEmptyReturned;
      ledger.currentEmptyBalance = Math.max(0, (ledger.currentEmptyBalance || 0) - totalEmptyReturned);
      await ledger.save();
    }

    res.json({
      success: true,
      message: `Returned ${totalEmptyReturned} empty cylinders to admin`,
      transaction,
      ledger,
    });

  } catch (err) {
    console.error("Error returning empty cylinders:", err);
    res.status(500).json({ message: "Failed to return empty cylinders", error: err.message });
  }
});

// GET /api/riders/inventory/rider/me - rider sees own inventory (alias)
router.get("/inventory/rider/me", protect, async (req, res) => {
  try {
    const riderId = req.user.id;
    const inventory = await RiderInventory.find({ rider: riderId });
    res.json(inventory);
  } catch (err) {
    console.error("Error fetching rider inventory:", err);
    res.status(500).json({ message: "Failed to load inventory", error: err.message });
  }
});

module.exports = router;