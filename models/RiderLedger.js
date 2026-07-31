const mongoose = require("mongoose");

const riderLedgerSchema = new mongoose.Schema(
  {
    rider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    totalFilledReceived: { type: Number, default: 0 },
    totalEmptyReturned: { type: Number, default: 0 },
    totalFilledSold: { type: Number, default: 0 },
    currentFilledBalance: { type: Number, default: 0 },
    currentEmptyBalance: { type: Number, default: 0 },
    totalPurchased: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RiderLedger", riderLedgerSchema);