const mongoose = require("mongoose");
const { SIZE_LABELS } = require("../constants/cylinderSizes");

const plantRefillSchema = new mongoose.Schema(
  {
    purchaseNumber: { type: String, required: true, unique: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cylinderSize: { type: String, required: true, enum: SIZE_LABELS },
    quantity: { type: Number, required: true },
    weightKg: { type: Number, required: true },
    totalWeightKg: { type: Number, required: true },
    ratePerKg: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    purchaseDate: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlantRefill", plantRefillSchema);