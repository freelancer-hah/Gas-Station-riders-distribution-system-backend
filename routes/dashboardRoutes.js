const express = require("express");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const Expense = require("../models/Expense");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const Inventory = require("../models/Inventory");
const RiderInventory = require("../models/RiderInventory");
const RiderLedger = require("../models/RiderLedger");
const RiderTransaction = require("../models/RiderTransaction");
const User = require("../models/User");
const PlantRefill = require("../models/PlantRefill");
const { protect, allowRoles } = require("../middleware/auth");

const router = express.Router();

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ==================== ADMIN DASHBOARD (RIDER-BASED) ====================
// GET /api/dashboard/admin
router.get("/admin", protect, allowRoles("admin"), async (req, res) => {
  try {
    const today = startOfToday();

    // Get all active riders
    const riders = await User.find({ role: "rider", isActive: true }).select("name phone");
    
    let todaysSales = 0;        // Admin sells to riders (RiderTransaction - purchase)
    let todaysCollection = 0;   // Riders pay to admin (RiderTransaction - payment)
    let todaysExpenseTotal = 0; // Riders expenses (Expense model)
    let monthlyRevenue = 0;     // Admin's monthly revenue from riders
    let totalRiderOutstanding = 0; // All riders outstanding
    let totalFilled = 0;
    let totalEmpty = 0;
    let riderStats = [];

    // Month start for monthly revenue
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Process each rider
    for (const rider of riders) {
      // Today's purchases from admin (admin sold to rider)
      const todaysPurchases = await RiderTransaction.find({
        rider: rider._id,
        type: "purchase",
        createdAt: { $gte: today }
      });
      
      // Today's payments from rider to admin
      const todaysPayments = await RiderTransaction.find({
        rider: rider._id,
        type: "payment",
        createdAt: { $gte: today }
      });
      
      // Today's expenses for this rider
      const todaysExpenses = await Expense.find({
        rider: rider._id,
        expenseDate: { $gte: today }
      });
      
      // Monthly purchases (admin revenue from rider)
      const monthPurchases = await RiderTransaction.find({
        rider: rider._id,
        type: "purchase",
        createdAt: { $gte: monthStart }
      });

      const riderSales = todaysPurchases.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
      const riderCollection = todaysPayments.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
      const riderExpenses = todaysExpenses.reduce((sum, e) => sum + e.amount, 0);
      const riderMonthlyRevenue = monthPurchases.reduce((sum, t) => sum + (t.totalAmount || 0), 0);

      todaysSales += riderSales;
      todaysCollection += riderCollection;
      todaysExpenseTotal += riderExpenses;
      monthlyRevenue += riderMonthlyRevenue;

      // Get rider inventory and ledger
      const inventory = await RiderInventory.find({ rider: rider._id });
      const ledger = await RiderLedger.findOne({ rider: rider._id });
      
      const filled = inventory.reduce((sum, item) => sum + (item.filledQty || 0), 0);
      const empty = inventory.reduce((sum, item) => sum + (item.emptyQty || 0), 0);
      
      totalFilled += filled;
      totalEmpty += empty;
      totalRiderOutstanding += (ledger?.outstandingBalance || 0);

      riderStats.push({
        rider: {
          id: rider._id,
          name: rider.name,
          phone: rider.phone,
        },
        today: {
          sales: riderSales,        // Admin sold to this rider
          collection: riderCollection, // Rider paid to admin
          expenses: riderExpenses,
        },
        monthlyRevenue: riderMonthlyRevenue,
        inventory: {
          filled,
          empty,
          total: filled + empty,
          items: inventory,
        },
        outstanding: ledger?.outstandingBalance || 0,
        totalPaid: ledger?.totalPaid || 0,
        totalPurchased: ledger?.totalPurchased || 0,
      });
    }

    // Sort riders by today's sales (highest first)
    riderStats.sort((a, b) => b.today.sales - a.today.sales);

    res.json({
      summary: {
        todaysSales,          // Admin's total sales to riders today
        todaysCollection,     // Riders total payment to admin today
        dailyExpenses: todaysExpenseTotal, // Riders total expenses today
        monthlyRevenue,       // Admin's monthly revenue from riders
        totalRiders: riders.length,
        totalFilled,
        totalEmpty,
        totalCylinders: totalFilled + totalEmpty,
        totalOutstanding: totalRiderOutstanding,
      },
      riderStats,
    });

  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).json({ message: "Failed to load admin dashboard", error: err.message });
  }
});

// ==================== RIDER DASHBOARD ====================
// GET /api/dashboard/rider
router.get("/rider", protect, async (req, res) => {
  try {
    const riderId = req.user.id;
    const today = startOfToday();

    const [riderInventory, todaysInvoices, todaysExpenses, todaysPayments] = await Promise.all([
      RiderInventory.find({ rider: riderId }),
      Invoice.find({ rider: riderId, createdAt: { $gte: today } }),
      Expense.find({ rider: riderId, expenseDate: { $gte: today } }),
      Payment.find({ type: "customer", receivedBy: riderId, createdAt: { $gte: today } })
    ]);

    const salesSummary = todaysInvoices.reduce((sum, inv) => sum + inv.subTotal, 0);
    const paymentCollection = todaysPayments.reduce((sum, p) => sum + p.amount, 0);
    const expenseSummary = todaysExpenses.reduce((sum, e) => sum + e.amount, 0);

    res.json({
      assignedInventory: riderInventory,
      todaysDeliveries: todaysInvoices.length,
      salesSummary,
      paymentCollection,
      remainingInventory: riderInventory.reduce((sum, item) => sum + item.filledQty, 0),
      expenseSummary,
    });
  } catch (err) {
    console.error("Rider dashboard error:", err);
    res.status(500).json({ message: "Failed to load rider dashboard", error: err.message });
  }
});

// ==================== RIDER STATS ====================
// GET /api/dashboard/rider-stats
router.get("/rider-stats", protect, allowRoles("admin"), async (req, res) => {
  try {
    const riders = await User.find({ role: "rider", isActive: true }).select("name phone");
    
    let riderSummaries = [];
    let totalFilled = 0;
    let totalEmpty = 0;
    let totalOutstanding = 0;
    
    for (const rider of riders) {
      const inventory = await RiderInventory.find({ rider: rider._id });
      const ledger = await RiderLedger.findOne({ rider: rider._id });
      
      const filled = inventory.reduce((sum, item) => sum + (item.filledQty || 0), 0);
      const empty = inventory.reduce((sum, item) => sum + (item.emptyQty || 0), 0);
      
      totalFilled += filled;
      totalEmpty += empty;
      totalOutstanding += (ledger?.outstandingBalance || 0);
      
      riderSummaries.push({
        rider: {
          id: rider._id,
          name: rider.name,
          phone: rider.phone,
        },
        inventory: {
          items: inventory,
          totalFilled: filled,
          totalEmpty: empty,
          totalCylinders: filled + empty,
        },
        outstanding: ledger?.outstandingBalance || 0,
        totalPurchased: ledger?.totalPurchased || 0,
        totalPaid: ledger?.totalPaid || 0,
      });
    }
    
    riderSummaries.sort((a, b) => b.outstanding - a.outstanding);
    
    res.json({
      summary: {
        totalRiders: riders.length,
        totalFilled,
        totalEmpty,
        totalCylinders: totalFilled + totalEmpty,
        totalOutstanding,
      },
      riders: riderSummaries,
    });
    
  } catch (err) {
    console.error("Error fetching rider stats:", err);
    res.status(500).json({ message: "Failed to load rider stats", error: err.message });
  }
});

// ==================== PAYMENT COLLECTION ====================
// GET /api/dashboard/payment-collection
router.get("/payment-collection", protect, async (req, res) => {
  try {
    const { from, to, riderId } = req.query;
    const filter = { type: "payment" };
    
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    
    if (req.user.role === "rider") {
      filter.rider = req.user.id;
    } else if (riderId && req.user.role === "admin") {
      filter.rider = riderId;
    }

    const payments = await RiderTransaction.find(filter)
      .populate("rider", "name phone")
      .sort({ createdAt: -1 });

    const totalCollection = payments.reduce((sum, p) => sum + p.totalAmount, 0);

    // Group by rider
    const riderBreakdown = payments.reduce((acc, p) => {
      const name = p.rider?.name || "Unknown";
      if (!acc[name]) {
        acc[name] = { rider: name, total: 0, count: 0 };
      }
      acc[name].total += p.totalAmount;
      acc[name].count += 1;
      return acc;
    }, {});

    // Group by method
    const methodBreakdown = payments.reduce((acc, p) => {
      const method = p.notes?.includes("via") ? p.notes.split("via ")[1] || "cash" : "cash";
      if (!acc[method]) {
        acc[method] = { method: method, total: 0, count: 0 };
      }
      acc[method].total += p.totalAmount;
      acc[method].count += 1;
      return acc;
    }, {});

    res.json({
      payments,
      summary: {
        totalCollection,
        count: payments.length,
        averageAmount: payments.length > 0 ? totalCollection / payments.length : 0,
      },
      riderBreakdown: Object.values(riderBreakdown),
      methodBreakdown: Object.values(methodBreakdown),
    });
  } catch (err) {
    console.error("Payment collection error:", err);
    res.status(500).json({ message: "Failed to load payment collection", error: err.message });
  }
});

// ==================== SUMMARY REPORTS ====================
// GET /api/dashboard/reports/summary
router.get("/reports/summary", protect, allowRoles("admin"), async (req, res) => {
  try {
    const [riders, customers, suppliers, invoices, expenses, allUsers] = await Promise.all([
      User.countDocuments({ role: "rider", isActive: true }),
      Customer.countDocuments(),
      Supplier.countDocuments(),
      Invoice.find(),
      Expense.find(),
      User.find({ role: "rider", isActive: true }).select("name phone")
    ]);

    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.subTotal, 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    const customerOutstandingAgg = await Customer.aggregate([
      { $group: { _id: null, total: { $sum: "$outstandingBalance" } } }
    ]);
    const supplierOutstandingAgg = await Supplier.aggregate([
      { $group: { _id: null, total: { $sum: "$outstandingBalance" } } }
    ]);

    const topRiderAgg = await Invoice.aggregate([
      { $group: { _id: "$rider", total: { $sum: "$subTotal" } } },
      { $sort: { total: -1 } },
      { $limit: 1 },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "rider" } },
      { $unwind: "$rider" }
    ]);

    const topCustomerAgg = await Invoice.aggregate([
      { $group: { _id: "$customer", total: { $sum: "$subTotal" } } },
      { $sort: { total: -1 } },
      { $limit: 1 },
      { $lookup: { from: "customers", localField: "_id", foreignField: "_id", as: "customer" } },
      { $unwind: "$customer" }
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyTrend = await Invoice.aggregate([
      { 
        $match: { createdAt: { $gte: sixMonthsAgo } } 
      },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          revenue: { $sum: "$subTotal" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    const recentInvoices = await Invoice.find()
      .populate("customer", "name")
      .populate("rider", "name")
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      totalRiders: riders,
      totalCustomers: customers,
      totalSuppliers: suppliers,
      totalInvoices: invoices.length,
      totalRevenue,
      totalExpenses,
      customerOutstanding: customerOutstandingAgg[0]?.total || 0,
      supplierOutstanding: supplierOutstandingAgg[0]?.total || 0,
      topRider: topRiderAgg[0]?.rider || null,
      topCustomer: topCustomerAgg[0]?.customer || null,
      monthlyTrend,
      recentInvoices,
      activeRidersList: allUsers,
    });
  } catch (err) {
    console.error("Summary reports error:", err);
    res.status(500).json({ message: "Failed to load summary reports", error: err.message });
  }
});

// ==================== SALES REPORT ====================
// GET /api/dashboard/reports/sales
router.get("/reports/sales", protect, async (req, res) => {
  try {
    const { from, to, riderId } = req.query;
    const filter = {};
    
    if (from || to) {
      filter.invoiceDate = {};
      if (from) filter.invoiceDate.$gte = new Date(from);
      if (to) filter.invoiceDate.$lte = new Date(to);
    }
    
    if (req.user.role === "rider") {
      filter.rider = req.user.id;
    } else if (riderId && req.user.role === "admin") {
      filter.rider = riderId;
    }

    const invoices = await Invoice.find(filter)
      .populate("customer", "name phone")
      .populate("rider", "name phone")
      .sort({ invoiceDate: -1 });

    const total = invoices.reduce((sum, inv) => sum + inv.subTotal, 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + inv.amountPaid, 0);
    const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.remainingBalance, 0);

    const customerBreakdown = invoices.reduce((acc, inv) => {
      const name = inv.customer?.name || "Unknown";
      if (!acc[name]) {
        acc[name] = { customer: name, totalPurchases: 0, invoices: 0 };
      }
      acc[name].totalPurchases += inv.subTotal;
      acc[name].invoices += 1;
      return acc;
    }, {});

    res.json({
      invoices,
      summary: {
        total,
        totalPaid,
        totalOutstanding,
        count: invoices.length,
        customerBreakdown: Object.values(customerBreakdown),
      },
    });
  } catch (err) {
    console.error("Sales report error:", err);
    res.status(500).json({ message: "Failed to load sales report", error: err.message });
  }
});

// ==================== OUTSTANDING REPORT ====================
// GET /api/dashboard/reports/outstanding
router.get("/reports/outstanding", protect, async (req, res) => {
  try {
    const customerFilter = req.user.role === "rider" ? { assignedRider: req.user.id } : {};
    
    const [customers, suppliers] = await Promise.all([
      Customer.find({ ...customerFilter, outstandingBalance: { $gt: 0 } })
        .populate("assignedRider", "name")
        .sort({ outstandingBalance: -1 }),
      Supplier.find({ outstandingBalance: { $gt: 0 } })
        .sort({ outstandingBalance: -1 })
    ]);

    const totalCustomerOutstanding = customers.reduce((sum, c) => sum + c.outstandingBalance, 0);
    const totalSupplierOutstanding = suppliers.reduce((sum, sup) => sum + sup.outstandingBalance, 0);

    res.json({
      customers,
      suppliers,
      summary: {
        totalCustomerOutstanding,
        totalSupplierOutstanding,
        totalOverallOutstanding: totalCustomerOutstanding + totalSupplierOutstanding,
        customerCount: customers.length,
        supplierCount: suppliers.length,
      }
    });
  } catch (err) {
    console.error("Outstanding report error:", err);
    res.status(500).json({ message: "Failed to load outstanding report", error: err.message });
  }
});

// ==================== EXPENSE REPORT ====================
// GET /api/dashboard/reports/expenses
router.get("/reports/expenses", protect, async (req, res) => {
  try {
    const { from, to, category, riderId } = req.query;
    const filter = {};
    
    if (from || to) {
      filter.expenseDate = {};
      if (from) filter.expenseDate.$gte = new Date(from);
      if (to) filter.expenseDate.$lte = new Date(to);
    }
    
    if (category) filter.category = category;
    
    if (req.user.role === "rider") {
      filter.rider = req.user.id;
    } else if (riderId && req.user.role === "admin") {
      filter.rider = riderId;
    }

    const expenses = await Expense.find(filter)
      .populate("rider", "name phone")
      .sort({ expenseDate: -1 });

    const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    const categoryBreakdown = expenses.reduce((acc, exp) => {
      if (!acc[exp.category]) {
        acc[exp.category] = { category: exp.category, total: 0, count: 0 };
      }
      acc[exp.category].total += exp.amount;
      acc[exp.category].count += 1;
      return acc;
    }, {});

    res.json({
      expenses,
      summary: {
        total,
        count: expenses.length,
        categoryBreakdown: Object.values(categoryBreakdown),
      },
    });
  } catch (err) {
    console.error("Expense report error:", err);
    res.status(500).json({ message: "Failed to load expense report", error: err.message });
  }
});

// ==================== INVENTORY REPORT ====================
// GET /api/dashboard/reports/inventory
router.get("/reports/inventory", protect, async (req, res) => {
  try {
    const [companyInventory, riderInventory, riders] = await Promise.all([
      Inventory.find().sort({ cylinderSize: 1 }),
      RiderInventory.find().populate("rider", "name phone"),
      User.find({ role: "rider", isActive: true }).select("name phone")
    ]);

    const totalFilled = companyInventory.reduce((sum, item) => sum + item.filledQty, 0);
    const totalEmpty = companyInventory.reduce((sum, item) => sum + item.emptyQty, 0);
    const totalCylinders = totalFilled + totalEmpty;

    const riderBreakdown = riders.map(rider => {
      const inv = riderInventory.filter(item => item.rider._id.toString() === rider._id.toString());
      const filled = inv.reduce((sum, item) => sum + item.filledQty, 0);
      const empty = inv.reduce((sum, item) => sum + item.emptyQty, 0);
      return {
        rider,
        filled,
        empty,
        total: filled + empty,
      };
    });

    res.json({
      companyInventory,
      summary: {
        totalFilled,
        totalEmpty,
        totalCylinders,
        itemCount: companyInventory.length,
      },
      riderBreakdown,
      riderInventory,
    });
  } catch (err) {
    console.error("Inventory report error:", err);
    res.status(500).json({ message: "Failed to load inventory report", error: err.message });
  }
});

// ==================== RIDER PERFORMANCE REPORT ====================
// GET /api/dashboard/reports/rider-performance
router.get("/reports/rider-performance", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const riders = await User.find({ role: "rider", isActive: true }).select("name phone");
    
    const performance = await Promise.all(riders.map(async (rider) => {
      const invoices = await Invoice.find({ ...filter, rider: rider._id });
      const expenses = await Expense.find({ 
        ...filter, 
        rider: rider._id 
      });
      
      const totalSales = invoices.reduce((sum, inv) => sum + inv.subTotal, 0);
      const totalCollection = invoices.reduce((sum, inv) => sum + inv.amountPaid, 0);
      const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
      const deliveryCount = invoices.length;
      
      const avgPerDelivery = deliveryCount > 0 ? totalSales / deliveryCount : 0;
      
      const inventory = await RiderInventory.find({ rider: rider._id });
      const totalFilled = inventory.reduce((sum, item) => sum + item.filledQty, 0);
      
      return {
        rider: rider.toSafeObject ? rider.toSafeObject() : { id: rider._id, name: rider.name, phone: rider.phone },
        totalSales,
        totalCollection,
        totalExpenses,
        deliveryCount,
        avgPerDelivery,
        remainingInventory: totalFilled,
        netRevenue: totalCollection - totalExpenses,
      };
    }));

    performance.sort((a, b) => b.totalSales - a.totalSales);

    res.json({
      performance,
      summary: {
        totalRiders: riders.length,
        totalSales: performance.reduce((sum, p) => sum + p.totalSales, 0),
        totalCollection: performance.reduce((sum, p) => sum + p.totalCollection, 0),
        totalExpenses: performance.reduce((sum, p) => sum + p.totalExpenses, 0),
        totalDeliveries: performance.reduce((sum, p) => sum + p.deliveryCount, 0),
      },
    });
  } catch (err) {
    console.error("Rider performance report error:", err);
    res.status(500).json({ message: "Failed to load rider performance report", error: err.message });
  }
});

// ==================== DAILY SUMMARY ====================
// GET /api/dashboard/rider/daily
router.get("/rider/daily", protect, async (req, res) => {
  try {
    const riderId = req.user.id;
    const today = startOfToday();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [invoices, expenses, payments] = await Promise.all([
      Invoice.find({ 
        rider: riderId, 
        createdAt: { $gte: today, $lt: tomorrow } 
      }).populate("customer", "name"),
      Expense.find({ 
        rider: riderId, 
        expenseDate: { $gte: today, $lt: tomorrow } 
      }),
      Payment.find({ 
        type: "customer",
        receivedBy: riderId, 
        paymentDate: { $gte: today, $lt: tomorrow } 
      })
    ]);

    const totalSales = invoices.reduce((sum, inv) => sum + inv.subTotal, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.remainingBalance, 0);

    res.json({
      date: today.toISOString().split('T')[0],
      invoices,
      expenses,
      payments,
      summary: {
        totalSales,
        totalPaid,
        totalExpenses,
        totalOutstanding,
        deliveryCount: invoices.length,
        netCash: totalPaid - totalExpenses,
      },
    });
  } catch (err) {
    console.error("Rider daily summary error:", err);
    res.status(500).json({ message: "Failed to load daily summary", error: err.message });
  }
});

// ==================== EXPORT LEDGER AS PDF ====================
// GET /api/dashboard/export/ledger/:type/:id
router.get("/export/ledger/:type/:id", protect, async (req, res) => {
  try {
    const { type, id } = req.params;
    const { from, to } = req.query;

    let data = {};
    let title = "";

    if (type === "customer") {
      const customer = await Customer.findById(id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      if (req.user.role === "rider" && customer.assignedRider?.toString() !== req.user.id) {
        return res.status(403).json({ message: "You can only view your own customers" });
      }

      const invoices = await Invoice.find({ customer: id }).sort({ invoiceDate: 1 });
      const payments = await Payment.find({ type: "customer", customer: id }).sort({ paymentDate: 1 });

      let filteredInvoices = invoices;
      let filteredPayments = payments;
      
      if (from || to) {
        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;
        
        if (fromDate) fromDate.setHours(0, 0, 0, 0);
        if (toDate) toDate.setHours(23, 59, 59, 999);
        
        filteredInvoices = invoices.filter(inv => {
          const invDate = new Date(inv.invoiceDate);
          if (fromDate && invDate < fromDate) return false;
          if (toDate && invDate > toDate) return false;
          return true;
        });
        
        filteredPayments = payments.filter(p => {
          const pDate = new Date(p.paymentDate);
          if (fromDate && pDate < fromDate) return false;
          if (toDate && pDate > toDate) return false;
          return true;
        });
      }

      const entries = [
        ...filteredInvoices.map((inv) => ({
          kind: "invoice",
          date: inv.invoiceDate,
          reference: inv.invoiceNumber,
          debit: inv.grandTotal - inv.previousBalance,
          credit: 0,
          description: `Invoice ${inv.invoiceNumber}`,
        })),
        ...filteredPayments.map((p) => ({
          kind: "payment",
          date: p.paymentDate,
          reference: p._id,
          debit: 0,
          credit: p.amount,
          description: `Payment via ${p.method}`,
        })),
      ].sort((a, b) => new Date(a.date) - new Date(b.date));

      let running = 0;
      const ledger = entries.map((e) => {
        running += e.debit - e.credit;
        return { ...e, runningBalance: running };
      });

      const totalPurchases = filteredInvoices.reduce((sum, i) => sum + i.subTotal, 0);
      const totalPaid = filteredPayments.reduce((sum, p) => sum + p.amount, 0);

      data = {
        title: `${customer.name} - Customer Ledger`,
        customer: {
          name: customer.name,
          phone: customer.phone,
          businessName: customer.businessName,
          address: customer.address,
        },
        ledger: ledger,
        outstanding: customer.outstandingBalance,
        totalInvoices: filteredInvoices.length,
        totalPayments: filteredPayments.length,
        totalPurchases: totalPurchases,
        totalPaid: totalPaid,
        dateRange: { from: from || null, to: to || null },
      };
      title = `Customer_Ledger_${customer.name}`;
    } 
    else if (type === "supplier") {
      const supplier = await Supplier.findById(id);
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }

      const purchases = await PlantRefill.find({ supplier: id }).sort({ purchaseDate: 1 });
      const payments = await Payment.find({ type: "supplier", supplier: id }).sort({ paymentDate: 1 });

      let filteredPurchases = purchases;
      let filteredPayments = payments;
      
      if (from || to) {
        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;
        
        if (fromDate) fromDate.setHours(0, 0, 0, 0);
        if (toDate) toDate.setHours(23, 59, 59, 999);
        
        filteredPurchases = purchases.filter(p => {
          const pDate = new Date(p.purchaseDate);
          if (fromDate && pDate < fromDate) return false;
          if (toDate && pDate > toDate) return false;
          return true;
        });
        
        filteredPayments = payments.filter(p => {
          const pDate = new Date(p.paymentDate);
          if (fromDate && pDate < fromDate) return false;
          if (toDate && pDate > toDate) return false;
          return true;
        });
      }

      const entries = [
        ...filteredPurchases.map((p) => ({
          kind: "purchase",
          date: p.purchaseDate,
          reference: p.purchaseNumber,
          debit: p.totalAmount,
          credit: 0,
          description: `${p.quantity} cylinders of ${p.cylinderSize}`,
        })),
        ...filteredPayments.map((p) => ({
          kind: "payment",
          date: p.paymentDate,
          reference: p._id,
          debit: 0,
          credit: p.amount,
          description: p.notes || `Payment via ${p.method}`,
        })),
      ].sort((a, b) => new Date(a.date) - new Date(b.date));

      let running = 0;
      const ledger = entries.map((e) => {
        running += e.debit - e.credit;
        return { ...e, runningBalance: running };
      });

      const totalPurchases = filteredPurchases.reduce((sum, p) => sum + p.totalAmount, 0);
      const totalPaid = filteredPayments.reduce((sum, p) => sum + p.amount, 0);

      data = {
        title: `${supplier.name} - Supplier Ledger`,
        supplier: {
          name: supplier.name,
          phone: supplier.phone,
          contactPerson: supplier.contactPerson,
          address: supplier.address,
        },
        ledger: ledger,
        outstanding: supplier.outstandingBalance,
        totalRefills: filteredPurchases.length,
        totalPaymentsCount: filteredPayments.length,
        totalPurchases: totalPurchases,
        totalPaid: totalPaid,
        dateRange: { from: from || null, to: to || null },
      };
      title = `Supplier_Ledger_${supplier.name}`;
    } 
    else {
      return res.status(400).json({ message: "Invalid ledger type. Use 'customer' or 'supplier'" });
    }

    res.json({
      success: true,
      data: data,
      title: title,
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error("Export ledger error:", err);
    res.status(500).json({ message: "Failed to export ledger", error: err.message });
  }
});

// ==================== DOWNLOAD PDF LEDGER ====================
// GET /api/dashboard/download/ledger/:type/:id
router.get("/download/ledger/:type/:id", protect, async (req, res) => {
  try {
    const { type, id } = req.params;
    const { from, to } = req.query;

    const generateLedgerPDF = require('../utils/generatePDF');

    let data = {};

    if (type === "customer") {
      const customer = await Customer.findById(id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      if (req.user.role === "rider" && customer.assignedRider?.toString() !== req.user.id) {
        return res.status(403).json({ message: "You can only view your own customers" });
      }

      const invoices = await Invoice.find({ customer: id }).sort({ invoiceDate: 1 });
      const payments = await Payment.find({ type: "customer", customer: id }).sort({ paymentDate: 1 });

      let filteredInvoices = invoices;
      let filteredPayments = payments;
      
      if (from || to) {
        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;
        
        if (fromDate) fromDate.setHours(0, 0, 0, 0);
        if (toDate) toDate.setHours(23, 59, 59, 999);
        
        filteredInvoices = invoices.filter(inv => {
          const invDate = new Date(inv.invoiceDate);
          if (fromDate && invDate < fromDate) return false;
          if (toDate && invDate > toDate) return false;
          return true;
        });
        
        filteredPayments = payments.filter(p => {
          const pDate = new Date(p.paymentDate);
          if (fromDate && pDate < fromDate) return false;
          if (toDate && pDate > toDate) return false;
          return true;
        });
      }

      const entries = [
        ...filteredInvoices.map((inv) => ({
          kind: "invoice",
          date: inv.invoiceDate,
          reference: inv.invoiceNumber,
          debit: inv.grandTotal - inv.previousBalance,
          credit: 0,
          description: `Invoice ${inv.invoiceNumber}`,
        })),
        ...filteredPayments.map((p) => ({
          kind: "payment",
          date: p.paymentDate,
          reference: p._id,
          debit: 0,
          credit: p.amount,
          description: `Payment via ${p.method}`,
        })),
      ].sort((a, b) => new Date(a.date) - new Date(b.date));

      let running = 0;
      const ledger = entries.map((e) => {
        running += e.debit - e.credit;
        return { ...e, runningBalance: running };
      });

      data = {
        title: `${customer.name} - Customer Ledger`,
        customer: {
          name: customer.name,
          phone: customer.phone,
          businessName: customer.businessName,
          address: customer.address,
        },
        ledger: ledger,
        outstanding: customer.outstandingBalance,
        totalInvoices: filteredInvoices.length,
        totalPayments: filteredPayments.length,
        totalPurchases: filteredInvoices.reduce((sum, i) => sum + i.subTotal, 0),
        totalPaid: filteredPayments.reduce((sum, p) => sum + p.amount, 0),
        dateRange: { from: from || null, to: to || null },
      };
    } 
    else if (type === "supplier") {
      const supplier = await Supplier.findById(id);
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }

      const purchases = await PlantRefill.find({ supplier: id }).sort({ purchaseDate: 1 });
      const payments = await Payment.find({ type: "supplier", supplier: id }).sort({ paymentDate: 1 });

      let filteredPurchases = purchases;
      let filteredPayments = payments;
      
      if (from || to) {
        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;
        
        if (fromDate) fromDate.setHours(0, 0, 0, 0);
        if (toDate) toDate.setHours(23, 59, 59, 999);
        
        filteredPurchases = purchases.filter(p => {
          const pDate = new Date(p.purchaseDate);
          if (fromDate && pDate < fromDate) return false;
          if (toDate && pDate > toDate) return false;
          return true;
        });
        
        filteredPayments = payments.filter(p => {
          const pDate = new Date(p.paymentDate);
          if (fromDate && pDate < fromDate) return false;
          if (toDate && pDate > toDate) return false;
          return true;
        });
      }

      const entries = [
        ...filteredPurchases.map((p) => ({
          kind: "purchase",
          date: p.purchaseDate,
          reference: p.purchaseNumber,
          debit: p.totalAmount,
          credit: 0,
          description: `${p.quantity} cylinders of ${p.cylinderSize}`,
        })),
        ...filteredPayments.map((p) => ({
          kind: "payment",
          date: p.paymentDate,
          reference: p._id,
          debit: 0,
          credit: p.amount,
          description: p.notes || `Payment via ${p.method}`,
        })),
      ].sort((a, b) => new Date(a.date) - new Date(b.date));

      let running = 0;
      const ledger = entries.map((e) => {
        running += e.debit - e.credit;
        return { ...e, runningBalance: running };
      });

      data = {
        title: `${supplier.name} - Supplier Ledger`,
        supplier: {
          name: supplier.name,
          phone: supplier.phone,
          contactPerson: supplier.contactPerson,
          address: supplier.address,
        },
        ledger: ledger,
        outstanding: supplier.outstandingBalance,
        totalRefills: filteredPurchases.length,
        totalPaymentsCount: filteredPayments.length,
        totalPurchases: filteredPurchases.reduce((sum, p) => sum + p.totalAmount, 0),
        totalPaid: filteredPayments.reduce((sum, p) => sum + p.amount, 0),
        dateRange: { from: from || null, to: to || null },
      };
    } 
    else {
      return res.status(400).json({ message: "Invalid ledger type. Use 'customer' or 'supplier'" });
    }

    generateLedgerPDF(data, type, res);

  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ message: "Failed to generate PDF", error: err.message });
  }
});

// ==================== EXPORT REPORTS ====================
// GET /api/dashboard/reports/export/:type
router.get("/reports/export/:type", protect, allowRoles("admin"), async (req, res) => {
  try {
    const { type } = req.params;
    const { from, to } = req.query;
    
    const filter = {};
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    let data = {};
    
    switch(type) {
      case 'sales':
        const salesInvoices = await Invoice.find(filter)
          .populate("customer", "name phone")
          .populate("rider", "name phone");
        data = {
          title: "Sales Report",
          generatedAt: new Date().toISOString(),
          total: salesInvoices.reduce((sum, inv) => sum + inv.subTotal, 0),
          count: salesInvoices.length,
          invoices: salesInvoices,
        };
        break;
        
      case 'expenses':
        const expenseDocs = await Expense.find(filter)
          .populate("rider", "name");
        data = {
          title: "Expense Report",
          generatedAt: new Date().toISOString(),
          total: expenseDocs.reduce((sum, exp) => sum + exp.amount, 0),
          count: expenseDocs.length,
          expenses: expenseDocs,
        };
        break;
        
      case 'outstanding':
        const [outstandingCustomers, outstandingSuppliers] = await Promise.all([
          Customer.find({ outstandingBalance: { $gt: 0 } }),
          Supplier.find({ outstandingBalance: { $gt: 0 } })
        ]);
        data = {
          title: "Outstanding Report",
          generatedAt: new Date().toISOString(),
          customerTotal: outstandingCustomers.reduce((sum, c) => sum + c.outstandingBalance, 0),
          supplierTotal: outstandingSuppliers.reduce((sum, sup) => sum + sup.outstandingBalance, 0),
          customers: outstandingCustomers,
          suppliers: outstandingSuppliers,
        };
        break;
        
      default:
        return res.status(400).json({ message: "Invalid report type" });
    }

    res.json({ 
      report: data,
      downloadUrl: `/api/dashboard/reports/export/${type}/pdf?from=${from || ''}&to=${to || ''}`
    });
  } catch (err) {
    console.error("Export report error:", err);
    res.status(500).json({ message: "Failed to generate report", error: err.message });
  }
});

module.exports = router;