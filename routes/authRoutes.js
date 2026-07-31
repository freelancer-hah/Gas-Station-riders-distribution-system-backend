const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/auth");

const router = express.Router();

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ message: "name, phone and password are required" });
    }
    
    // Check if phone already exists
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(409).json({ message: "An account with this phone already exists" });
    }
    
    // Check if email already exists
    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
    }
    
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? "admin" : "rider";
    const isActive = userCount === 0; // Only admin is active by default

    const user = await User.create({ name, phone, email, password, role, isActive });
    
    if (role === "admin") {
      const token = signToken(user);
      res.status(201).json({ token, user: user.toSafeObject() });
    } else {
      const token = signToken(user);
      res.status(201).json({ 
        token, 
        user: user.toSafeObject(),
        message: "Account created. Waiting for admin verification."
      });
    }
  } catch (err) {
    res.status(500).json({ message: "Signup failed", error: err.message });
  }
});

// POST /api/auth/login - Support email OR phone
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: "Username (email/phone) and password are required" });
    }

    // Find user by email OR phone
    const user = await User.findOne({
      $or: [
        { email: username.toLowerCase() },
        { phone: username }
      ]
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid credentials or account not verified" });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken(user);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

// GET /api/auth/me
router.get("/me", protect, async (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

// POST /api/auth/register-staff (admin only)
router.post("/register-staff", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can register staff" });
    }
    const { name, phone, email, password, role } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ message: "name, phone and password are required" });
    }
    
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(409).json({ message: "An account with this phone already exists" });
    }
    
    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
    }
    
    const user = await User.create({
      name,
      phone,
      email,
      password,
      role: role === "admin" ? "admin" : "rider",
      isActive: true // Staff created by admin are active by default
    });
    res.status(201).json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: "Failed to register staff", error: err.message });
  }
});

module.exports = router;