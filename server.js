require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const plantRefillRoutes = require("./routes/plantRefillRoutes");
const customerRoutes = require("./routes/customerRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const riderRoutes = require("./routes/riderRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const adminInventoryRoutes = require("./routes/adminInventoryRoutes");

const app = express();

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    time: new Date().toISOString(),
    message: "Backend is running!"
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/plant-refills", plantRefillRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/riders", riderRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminInventoryRoutes);

// 404 handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({ 
    message: "Route not found", 
    path: req.originalUrl 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({ 
    message: "Unexpected server error", 
    error: err.message 
  });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 API available at http://localhost:${PORT}/api`);
  });
}).catch(err => {
  console.error("❌ Database connection failed:", err);
  process.exit(1);
});