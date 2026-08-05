const mongoose = require("mongoose");

const { SIZE_LABELS } = require("../constants/cylinderSizes");

const invoiceItemSchema = new mongoose.Schema(
  {
    cylinderSize: { type: String, required: true, enum: SIZE_LABELS },
    weightKg: { type: Number, required: true },
    quantity: { type: Number, required: true },
    totalWeightKg: { type: Number, required: true },
    ratePerKg: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [invoiceItemSchema],
    subTotal: { type: Number, required: true },
    previousBalance: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    remainingBalance: { type: Number, required: true },
    invoiceDate: { type: Date, default: Date.now },
    status: { type: String, enum: ["unpaid", "partial", "paid"], default: "unpaid" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);