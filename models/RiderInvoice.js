const mongoose = require("mongoose");
const { SIZE_LABELS } = require("../constants/cylinderSizes");

const riderInvoiceItemSchema = new mongoose.Schema(
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

const riderInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: "RiderTransaction" },
    items: [riderInvoiceItemSchema],
    subTotal: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    invoiceDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RiderInvoice", riderInvoiceSchema);