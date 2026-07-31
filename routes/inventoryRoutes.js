const express = require("express");
const Inventory = require("../models/Inventory");
const RiderInventory = require("../models/RiderInventory");
const { protect, allowRoles } = require("../middleware/auth");

const router = express.Router();

// ============================================
// IMPORTANT: Put specific routes BEFORE dynamic routes
// ============================================

// GET /api/inventory - company-wide inventory (all roles can view)
router.get("/", protect, async (req, res) => {
  try {
    const items = await Inventory.find().sort({ cylinderSize: 1 });
    res.json(items);
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ message: "Failed to load inventory", error: err.message });
  }
});

// GET /api/inventory/alerts/low-stock - items below threshold
router.get("/alerts/low-stock", protect, async (req, res) => {
  try {
    const items = await Inventory.find();
    const low = items.filter((i) => i.filledQty <= i.lowStockThreshold);
    res.json(low);
  } catch (err) {
    console.error("Error fetching low stock alerts:", err);
    res.status(500).json({ message: "Failed to load low stock alerts", error: err.message });
  }
});

// ✅ GET /api/inventory/rider/me - rider sees own inventory (MUST come before /rider/:riderId)
router.get("/rider/me", protect, async (req, res) => {
  try {
    const riderId = req.user.id;
    console.log(`🔍 Fetching inventory for rider: ${riderId}`);
    
    const inventory = await RiderInventory.find({ rider: riderId });
    console.log(`✅ Found ${inventory.length} items for rider`);
    
    res.json(inventory);
  } catch (err) {
    console.error("Error fetching rider inventory:", err);
    res.status(500).json({ message: "Failed to load inventory", error: err.message });
  }
});

// GET /api/inventory/rider/:riderId - admin view rider inventory
router.get("/rider/:riderId", protect, async (req, res) => {
  try {
    const { riderId } = req.params;
    
    // Only admin can view other riders' inventory
    if (req.user.role !== "admin" && req.user.id !== riderId) {
      return res.status(403).json({ message: "You can only view your own inventory" });
    }
    
    const items = await RiderInventory.find({ rider: riderId });
    res.json(items);
  } catch (err) {
    console.error("Error fetching rider inventory:", err);
    res.status(500).json({ message: "Failed to load rider inventory", error: err.message });
  }
});

// POST /api/inventory - add a new cylinder size (admin only)
router.post("/", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { cylinderSize, weightKg, filledQty, emptyQty, lowStockThreshold } = req.body;
    
    // Check if cylinder size already exists
    const existing = await Inventory.findOne({ cylinderSize: cylinderSize.trim() });
    if (existing) {
      return res.status(400).json({ message: "Cylinder size already exists" });
    }
    
    const item = await Inventory.create({
      cylinderSize: cylinderSize.trim(),
      weightKg: weightKg || 0,
      filledQty: filledQty || 0,
      emptyQty: emptyQty || 0,
      lowStockThreshold: lowStockThreshold || 10,
    });
    res.status(201).json(item);
  } catch (err) {
    console.error("Error adding inventory:", err);
    res.status(500).json({ message: "Failed to add inventory", error: err.message });
  }
});

// PUT /api/inventory/:id - update/adjust stock (admin only)
router.put("/:id", protect, allowRoles("admin"), async (req, res) => {
  try {
    const item = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ message: "Inventory item not found" });
    res.json(item);
  } catch (err) {
    console.error("Error updating inventory:", err);
    res.status(500).json({ message: "Failed to update inventory", error: err.message });
  }
});

// POST /api/inventory/assign - admin assigns filled cylinders to a rider
router.post("/assign", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { riderId, cylinderSize, quantity } = req.body;
    if (!riderId || !cylinderSize || !quantity) {
      return res.status(400).json({ message: "riderId, cylinderSize and quantity are required" });
    }

    const companyStock = await Inventory.findOne({ cylinderSize: cylinderSize.trim() });
    if (!companyStock || companyStock.filledQty < quantity) {
      return res.status(400).json({ message: "Insufficient company inventory for this assignment" });
    }

    companyStock.filledQty -= quantity;
    await companyStock.save();

    let riderStock = await RiderInventory.findOne({ rider: riderId, cylinderSize: cylinderSize.trim() });
    if (!riderStock) {
      riderStock = await RiderInventory.create({ 
        rider: riderId, 
        cylinderSize: cylinderSize.trim(), 
        filledQty: 0, 
        emptyQty: 0,
        ratePerKg: companyStock.lastPurchaseRate || 0
      });
    }
    riderStock.filledQty += Number(quantity);
    riderStock.ratePerKg = companyStock.lastPurchaseRate || riderStock.ratePerKg;
    await riderStock.save();

    res.json({ companyStock, riderStock });
  } catch (err) {
    console.error("Error assigning inventory:", err);
    res.status(500).json({ message: "Assignment failed", error: err.message });
  }
});

// POST /api/inventory/return - rider returns empty/filled cylinders back to company
router.post("/return", protect, async (req, res) => {
  try {
    const { riderId, cylinderSize, filledQty = 0, emptyQty = 0 } = req.body;
    const targetRiderId = req.user.role === "rider" ? req.user.id : riderId;

    const riderStock = await RiderInventory.findOne({ rider: targetRiderId, cylinderSize: cylinderSize.trim() });
    if (!riderStock || riderStock.filledQty < filledQty || riderStock.emptyQty < emptyQty) {
      return res.status(400).json({ message: "Insufficient rider inventory to return" });
    }
    riderStock.filledQty -= filledQty;
    riderStock.emptyQty -= emptyQty;
    await riderStock.save();

    let companyStock = await Inventory.findOne({ cylinderSize: cylinderSize.trim() });
    if (!companyStock) {
      return res.status(404).json({ message: "Cylinder size not found in company inventory" });
    }
    companyStock.filledQty += Number(filledQty);
    companyStock.emptyQty += Number(emptyQty);
    await companyStock.save();

    res.json({ companyStock, riderStock });
  } catch (err) {
    console.error("Error returning inventory:", err);
    res.status(500).json({ message: "Return failed", error: err.message });
  }
});

module.exports = router;