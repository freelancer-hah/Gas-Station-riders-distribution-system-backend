const mongoose = require("mongoose");

const riderInventorySchema = new mongoose.Schema(
  {
    rider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    cylinderSize: { type: String, required: true },
    weightKg: { type: Number, default: 0 },
    filledQty: { type: Number, default: 0 },
    emptyQty: { type: Number, default: 0 },
    ratePerKg: { type: Number, default: 0 },
  },
  { timestamps: true }
);

riderInventorySchema.index({ rider: 1, cylinderSize: 1 }, { unique: true });

module.exports = mongoose.model("RiderInventory", riderInventorySchema);