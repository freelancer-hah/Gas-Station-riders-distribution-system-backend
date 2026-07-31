const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    cylinderSize: { type: String, required: true, unique: true },
    weightKg: { type: Number, required: true },
    filledQty: { type: Number, default: 0 },
    emptyQty: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    lastPurchaseRatePerKg: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Inventory", inventorySchema);