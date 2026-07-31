const mongoose = require("mongoose");

const riderInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: "RiderTransaction" },
    cylinderSize: { type: String, required: true },
    weightKg: { type: Number, required: true },
    quantity: { type: Number, required: true },
    totalWeightKg: { type: Number, required: true },
    ratePerKg: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    invoiceDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RiderInvoice", riderInvoiceSchema);