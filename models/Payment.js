const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["customer", "supplier"], required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier" },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    amount: { type: Number, required: true },
    method: {
      type: String,
      enum: ["cash", "bank_transfer", "jazzcash", "easypaisa", "cheque"],
      default: "cash",
    },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    paymentDate: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);