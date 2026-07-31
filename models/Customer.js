const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    businessName: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    creditLimit: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    assignedRider: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);
