const mongoose = require("mongoose");

// Admin's existing company inventory
const adminInventorySchema = new mongoose.Schema(
  {
    cylinderSize: { type: String, required: true, unique: true },
    weightKg: { type: Number, required: true },
    filledQty: { type: Number, default: 0 },
    emptyQty: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    saleRatePerKg: { type: Number, default: 0 }, // Admin's sale rate to riders
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminInventory", adminInventorySchema);