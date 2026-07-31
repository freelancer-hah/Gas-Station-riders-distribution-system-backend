const express = require("express");
const Expense = require("../models/Expense");
const { protect } = require("../middleware/auth");

const router = express.Router();

// GET /api/expenses - riders see only their own, admin sees all (optionally filtered)
router.get("/", protect, async (req, res) => {
  const filter = req.user.role === "rider" ? { rider: req.user.id } : {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.riderId && req.user.role === "admin") filter.rider = req.query.riderId;
  const expenses = await Expense.find(filter).populate("rider", "name").sort({ expenseDate: -1 });
  res.json(expenses);
});

// POST /api/expenses
router.post("/", protect, async (req, res) => {
  try {
    const { category, amount, description, expenseDate } = req.body;
    if (!category || !amount) {
      return res.status(400).json({ message: "category and amount are required" });
    }
    const expense = await Expense.create({
      rider: req.user.role === "rider" ? req.user.id : req.body.riderId,
      category,
      amount,
      description,
      expenseDate: expenseDate || Date.now(),
      createdBy: req.user.id,
    });
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ message: "Failed to record expense", error: err.message });
  }
});

module.exports = router;
