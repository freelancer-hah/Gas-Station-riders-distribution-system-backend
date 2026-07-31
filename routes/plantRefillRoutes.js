const express = require("express");
const PlantRefill = require("../models/PlantRefill");
const Inventory = require("../models/Inventory");
const RiderInventory = require("../models/RiderInventory");
const Supplier = require("../models/Supplier");
const generateNumber = require("../utils/generateNumber");
const { protect } = require("../middleware/auth");

const router = express.Router();

// GET /api/plant-refills
router.get("/", protect, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === "rider") {
      filter.rider = req.user.id;
    }
    const refills = await PlantRefill.find(filter)
      .populate("supplier", "name phone")
      .populate("rider", "name phone")
      .sort({ createdAt: -1 });
    res.json(refills);
  } catch (err) {
    console.error("Error fetching refills:", err);
    res.status(500).json({ message: "Failed to load refills", error: err.message });
  }
});

// GET /api/plant-refills/:id
router.get("/:id", protect, async (req, res) => {
  try {
    const refill = await PlantRefill.findById(req.params.id)
      .populate("supplier", "name phone")
      .populate("rider", "name phone");
    if (!refill) return res.status(404).json({ message: "Refill not found" });
    if (req.user.role === "rider" && refill.rider._id.toString() !== req.user.id) {
      return res.status(403).json({ message: "You can only view your own refills" });
    }
    res.json(refill);
  } catch (err) {
    console.error("Error fetching refill:", err);
    res.status(500).json({ message: "Failed to load refill", error: err.message });
  }
});

// POST /api/plant-refills
router.post("/", protect, async (req, res) => {
  try {
    const { supplier, cylinderSize, quantity, weightKg, ratePerKg } = req.body;
    
    if (!supplier) return res.status(400).json({ message: "Supplier is required" });
    if (!cylinderSize) return res.status(400).json({ message: "Cylinder size is required" });
    if (!quantity || Number(quantity) <= 0) return res.status(400).json({ message: "Valid quantity is required" });
    if (!weightKg || Number(weightKg) <= 0) return res.status(400).json({ message: "Valid weight per cylinder is required" });
    if (!ratePerKg || Number(ratePerKg) <= 0) return res.status(400).json({ message: "Valid rate per kg is required" });

    const totalWeightKg = Number(weightKg) * Number(quantity);
    const totalAmount = totalWeightKg * Number(ratePerKg);

    const riderId = req.user.role === "rider" ? req.user.id : req.body.rider;
    if (!riderId) return res.status(400).json({ message: "Rider ID is required" });

    const supplierDoc = await Supplier.findById(supplier);
    if (!supplierDoc) return res.status(404).json({ message: "Supplier not found" });

    // Create refill record
    const refill = await PlantRefill.create({
      purchaseNumber: generateNumber("PR"),
      supplier,
      rider: riderId,
      cylinderSize: cylinderSize.trim(),
      quantity: Number(quantity),
      weightKg: Number(weightKg),
      totalWeightKg: totalWeightKg,
      ratePerKg: Number(ratePerKg),
      totalAmount: totalAmount,
      purchaseDate: new Date(),
      createdBy: req.user.id,
    });

    console.log(`✅ Refill created: ${refill.purchaseNumber}`);

    // 1. UPDATE COMPANY INVENTORY
    let companyStock = await Inventory.findOne({ cylinderSize: cylinderSize.trim() });
    if (!companyStock) {
      companyStock = await Inventory.create({
        cylinderSize: cylinderSize.trim(),
        weightKg: Number(weightKg),
        filledQty: Number(quantity),
        emptyQty: 0,
        lowStockThreshold: 10,
        lastPurchaseRatePerKg: Number(ratePerKg),
      });
      console.log(`✅ Created company inventory: ${cylinderSize} weight ${weightKg}kg`);
    } else {
      if (companyStock.weightKg !== Number(weightKg)) {
        companyStock.weightKg = Number(weightKg);
      }
      companyStock.lastPurchaseRatePerKg = Number(ratePerKg);
      companyStock.filledQty += Number(quantity);
      await companyStock.save();
      console.log(`✅ Updated company inventory: ${cylinderSize} +${quantity}`);
    }

    // 2. UPDATE RIDER INVENTORY
    let riderStock = await RiderInventory.findOne({
      rider: riderId,
      cylinderSize: cylinderSize.trim()
    });
    
    if (!riderStock) {
      riderStock = await RiderInventory.create({
        rider: riderId,
        cylinderSize: cylinderSize.trim(),
        weightKg: Number(weightKg),
        filledQty: Number(quantity),
        emptyQty: 0,
        ratePerKg: Number(ratePerKg),
      });
      console.log(`✅ Created rider inventory: ${cylinderSize} weight ${weightKg}kg, qty ${quantity}`);
    } else {
      riderStock.weightKg = Number(weightKg);
      riderStock.filledQty += Number(quantity);
      riderStock.ratePerKg = Number(ratePerKg);
      await riderStock.save();
      console.log(`✅ Updated rider inventory: ${cylinderSize} +${quantity}`);
    }

    // 3. UPDATE SUPPLIER OUTSTANDING
    supplierDoc.outstandingBalance = (supplierDoc.outstandingBalance || 0) + totalAmount;
    await supplierDoc.save();

    res.status(201).json({
      success: true,
      message: `Refill recorded: ${quantity} cylinders of ${cylinderSize}`,
      refill,
      companyStock,
      riderStock,
      supplierOutstanding: supplierDoc.outstandingBalance,
    });

  } catch (err) {
    console.error("❌ Plant refill error:", err);
    res.status(500).json({ message: "Failed to record plant refill", error: err.message });
  }
});

// PUT /api/plant-refills/:id
router.put("/:id", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can update refills" });
    }
    const refill = await PlantRefill.findById(req.params.id);
    if (!refill) return res.status(404).json({ message: "Refill not found" });
    const updated = await PlantRefill.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate("supplier", "name phone")
      .populate("rider", "name phone");
    res.json(updated);
  } catch (err) {
    console.error("Error updating refill:", err);
    res.status(500).json({ message: "Failed to update refill", error: err.message });
  }
});

// DELETE /api/plant-refills/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can delete refills" });
    }
    const refill = await PlantRefill.findById(req.params.id);
    if (!refill) return res.status(404).json({ message: "Refill not found" });
    await PlantRefill.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Refill deleted successfully" });
  } catch (err) {
    console.error("Error deleting refill:", err);
    res.status(500).json({ message: "Failed to delete refill", error: err.message });
  }
});

module.exports = router;