const mongoose = require("mongoose");
const { SIZE_LABELS } = require("../constants/cylinderSizes");

const riderTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: { type: String, required: true, unique: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["purchase", "return_empty", "payment", "return_filled", "adjustment"],
      required: true,
    },
cylinderSize: {
      type: String,
      required: true,
      enum: [...SIZE_LABELS, "MULTI"], // 👈 add MULTI
    },    filledQty: { type: Number, default: 0 },
    emptyQty: { type: Number, default: 0 },
    ratePerKg: { type: Number, default: 0 },
    totalWeightKg: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    transactionDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RiderTransaction", riderTransactionSchema);