const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    rider: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    category: {
      type: String,
      enum: ["diesel", "lunch", "salary", "vehicle_maintenance", "other"],
      required: true,
    },
    amount: { type: Number, required: true },
    description: { type: String, trim: true },
    expenseDate: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);
