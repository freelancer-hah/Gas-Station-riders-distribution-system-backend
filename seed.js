require("dotenv").config();
const mongoose = require("mongoose");

const User = require("./models/User");
const Customer = require("./models/Customer");
const Supplier = require("./models/Supplier");
const Inventory = require("./models/Inventory");
const AdminInventory = require("./models/adminInventory");
const PlantRefill = require("./models/PlantRefill");
const RiderInventory = require("./models/RiderInventory");
const RiderTransaction = require("./models/RiderTransaction");
const RiderLedger = require("./models/RiderLedger");
const Invoice = require("./models/Invoice");
const Payment = require("./models/Payment");
const Expense = require("./models/Expense");

// Helper to get past dates
const daysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

const seedDatabase = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gas_cylinder_mvp";
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Clear existing collections
    console.log("Cleaning old data...");
    await User.deleteMany({});
    await Customer.deleteMany({});
    await Supplier.deleteMany({});
    await Inventory.deleteMany({});
    await AdminInventory.deleteMany({});
    await PlantRefill.deleteMany({});
    await RiderInventory.deleteMany({});
    await RiderTransaction.deleteMany({});
    await RiderLedger.deleteMany({});
    await Invoice.deleteMany({});
    await Payment.deleteMany({});
    await Expense.deleteMany({});

    console.log("Creating 1 Admin user...");
    const admin = await User.create({
      name: "Muhammad Ali",
      phone: "03001234567",
      email: "admin@gasstation.pk",
      password: "admin123", // Pre-save hook hashes password
      role: "admin",
      isActive: true,
    });

    console.log("Creating 5 Riders...");
    const riderData = [
      { name: "Tariq Mahmood", phone: "03019876543", email: "tariq@gasstation.pk" },
      { name: "Usman Ghani", phone: "03123456789", email: "usman@gasstation.pk" },
      { name: "Hamza Malik", phone: "03335557778", email: "hamza@gasstation.pk" },
      { name: "Bilal Ahmed", phone: "03456789012", email: "bilal@gasstation.pk" },
      { name: "Zubair Khan", phone: "03218889990", email: "zubair@gasstation.pk" },
    ];

    const riders = [];
    for (const r of riderData) {
      const createdRider = await User.create({
        ...r,
        password: "password123",
        role: "rider",
        isActive: true,
      });
      riders.push(createdRider);
    }

    console.log("Creating Suppliers...");
    const supplier1 = await Supplier.create({
      name: "PARCO LPG Plant",
      contactPerson: "Kamran Akmal",
      phone: "04235551122",
      address: "Sheikhupura Road, Lahore",
      paymentTerms: "Net 15",
      outstandingBalance: 125000,
    });

    const supplier2 = await Supplier.create({
      name: "PSO Gas Terminal",
      contactPerson: "Shehryar Khan",
      phone: "0514443322",
      address: "Kora Khas, Rawalpindi",
      paymentTerms: "Net 30",
      outstandingBalance: 85000,
    });

    const supplier3 = await Supplier.create({
      name: "Shell Pakistan LPG",
      contactPerson: "Faisal Qureshi",
      phone: "02138887766",
      address: "Port Qasim, Karachi",
      paymentTerms: "Immediate",
      outstandingBalance: 45000,
    });

    console.log("Creating Main & Admin Inventories...");
    await AdminInventory.create([
      { cylinderSize: "11.8kg Commercial", weightKg: 11.8, filledQty: 180, emptyQty: 95, lowStockThreshold: 15, saleRatePerKg: 260 },
      { cylinderSize: "45.4kg Industrial", weightKg: 45.4, filledQty: 60, emptyQty: 40, lowStockThreshold: 10, saleRatePerKg: 250 },
      { cylinderSize: "6kg Domestic", weightKg: 6.0, filledQty: 90, emptyQty: 50, lowStockThreshold: 20, saleRatePerKg: 270 },
    ]);

    await Inventory.create([
      { cylinderSize: "11.8kg Commercial", weightKg: 11.8, filledQty: 180, emptyQty: 95, lowStockThreshold: 15, lastPurchaseRatePerKg: 240 },
      { cylinderSize: "45.4kg Industrial", weightKg: 45.4, filledQty: 60, emptyQty: 40, lowStockThreshold: 10, lastPurchaseRatePerKg: 230 },
      { cylinderSize: "6kg Domestic", weightKg: 6.0, filledQty: 90, emptyQty: 50, lowStockThreshold: 20, lastPurchaseRatePerKg: 250 },
    ]);

    console.log("Creating Plant Refills...");
    await PlantRefill.create([
      { purchaseNumber: "PRF-1001", supplier: supplier1._id, rider: riders[0]._id, cylinderSize: "11.8kg Commercial", quantity: 100, weightKg: 11.8, totalWeightKg: 1180, ratePerKg: 240, totalAmount: 283200, purchaseDate: daysAgo(40), createdBy: admin._id },
      { purchaseNumber: "PRF-1002", supplier: supplier2._id, rider: riders[1]._id, cylinderSize: "45.4kg Industrial", quantity: 40, weightKg: 45.4, totalWeightKg: 1816, ratePerKg: 230, totalAmount: 417680, purchaseDate: daysAgo(30), createdBy: admin._id },
      { purchaseNumber: "PRF-1003", supplier: supplier3._id, rider: riders[2]._id, cylinderSize: "6kg Domestic", quantity: 80, weightKg: 6.0, totalWeightKg: 480, ratePerKg: 250, totalAmount: 120000, purchaseDate: daysAgo(20), createdBy: admin._id },
      { purchaseNumber: "PRF-1004", supplier: supplier1._id, rider: riders[3]._id, cylinderSize: "11.8kg Commercial", quantity: 120, weightKg: 11.8, totalWeightKg: 1416, ratePerKg: 245, totalAmount: 346920, purchaseDate: daysAgo(10), createdBy: admin._id },
      { purchaseNumber: "PRF-1005", supplier: supplier2._id, rider: riders[4]._id, cylinderSize: "45.4kg Industrial", quantity: 30, weightKg: 45.4, totalWeightKg: 1362, ratePerKg: 235, totalAmount: 320070, purchaseDate: daysAgo(3), createdBy: admin._id },
    ]);

    console.log("Creating 33 Customers assigned to 5 Riders...");
    const customerRawData = [
      // Rider 1 Customers (Tariq Mahmood)
      { name: "Al-Khan Pakwan Center", businessName: "Al-Khan Catering", phone: "03021112233", address: "Main Market, Gulberg III, Lahore", creditLimit: 100000, riderIdx: 0 },
      { name: "Butt Karahi & BBQ", businessName: "Butt Karahi Shop", phone: "03022223344", address: "Lakshmi Chowk, Lahore", creditLimit: 150000, riderIdx: 0 },
      { name: "Bundu Khan Restaurant", businessName: "Bundu Khan Liberty", phone: "03023334455", address: "Liberty Market, Lahore", creditLimit: 200000, riderIdx: 0 },
      { name: "Spice Bazaar", businessName: "Spice Bazaar Restaurant", phone: "03024445566", address: "MM Alam Road, Lahore", creditLimit: 120000, riderIdx: 0 },
      { name: "Barkat Market Cafe", businessName: "Barkat Cafe", phone: "03025556677", address: "Garden Town, Lahore", creditLimit: 80000, riderIdx: 0 },
      { name: "City Sweets & Bakers", businessName: "City Sweets", phone: "03026667788", address: "Model Town Link Road, Lahore", creditLimit: 90000, riderIdx: 0 },
      { name: "Al-Hafeez Hotel", businessName: "Al-Hafeez Hotel", phone: "03027778899", address: "Kalma Chowk, Lahore", creditLimit: 75000, riderIdx: 0 },

      // Rider 2 Customers (Usman Ghani)
      { name: "Quetta Hotel & Tea Stall", businessName: "Quetta Tea Spot", phone: "03131112233", address: "Johar Town, Doctor Hospital Chowk, Lahore", creditLimit: 60000, riderIdx: 1 },
      { name: "Zakir Tikka Main", businessName: "Zakir Tikka", phone: "03132223344", address: "PIA Road, Johar Town, Lahore", creditLimit: 110000, riderIdx: 1 },
      { name: "Gourmet Bakers Outlet", businessName: "Gourmet Bakers", phone: "03133334455", address: "College Road, Township, Lahore", creditLimit: 140000, riderIdx: 1 },
      { name: "Options Restaurant", businessName: "Options Fine Dining", phone: "03134445566", address: "Garden Town, Lahore", creditLimit: 180000, riderIdx: 1 },
      { name: "Bismillah Biryani", businessName: "Bismillah Biryani", phone: "03135556677", address: "Township Market, Lahore", creditLimit: 50000, riderIdx: 1 },
      { name: "Faisal Hotel", businessName: "Faisal Hotel", phone: "03136667788", address: "Wapda Town Roundabout, Lahore", creditLimit: 70000, riderIdx: 1 },
      { name: "Pizza Junction", businessName: "Pizza Junction", phone: "03137778899", address: "Khayaban-e-Jinnah, Lahore", creditLimit: 85000, riderIdx: 1 },

      // Rider 3 Customers (Hamza Malik)
      { name: "Monal Lahore", businessName: "Monal Restaurant", phone: "03341112233", address: "Ring Road Interchange, Lahore", creditLimit: 250000, riderIdx: 2 },
      { name: "Salt'n Pepper Village", businessName: "Salt'n Pepper", phone: "03342223344", address: "DHA Phase 5, Lahore", creditLimit: 200000, riderIdx: 2 },
      { name: "Gloria Jean's Coffees", businessName: "Gloria Jean's DHA", phone: "03343334455", address: "DHA Phase 3, Lahore", creditLimit: 130000, riderIdx: 2 },
      { name: "Hardees DHA", businessName: "Hardees Pakistan", phone: "03344445566", address: "Z-Block DHA, Lahore", creditLimit: 160000, riderIdx: 2 },
      { name: "Broadway Pizza", businessName: "Broadway Pizza", phone: "03345556677", address: "DHA Phase 1, Lahore", creditLimit: 95000, riderIdx: 2 },
      { name: "Subway Outlet", businessName: "Subway Bedian", phone: "03346667788", address: "Bedian Road, Lahore", creditLimit: 90000, riderIdx: 2 },

      // Rider 4 Customers (Bilal Ahmed)
      { name: "Savour Foods Branch", businessName: "Savour Foods", phone: "03461112233", address: "F-7 Markaz, Islamabad", creditLimit: 300000, riderIdx: 3 },
      { name: "Tehzeeb Bakers", businessName: "Tehzeeb Bakers", phone: "03462223344", address: "Saddar, Rawalpindi", creditLimit: 220000, riderIdx: 3 },
      { name: "Cheezious Outlet", businessName: "Cheezious F-10", phone: "03463334455", address: "F-10 Markaz, Islamabad", creditLimit: 170000, riderIdx: 3 },
      { name: "Kabul Restaurant", businessName: "Kabul Restaurant", phone: "03464445566", address: "Super Market F-6, Islamabad", creditLimit: 150000, riderIdx: 3 },
      { name: "Royal Elephant", businessName: "Royal Thai Cuisine", phone: "03465556677", address: "G-9 Markaz, Islamabad", creditLimit: 110000, riderIdx: 3 },
      { name: "Student Biryani Pindi", businessName: "Student Biryani", phone: "03466667788", address: "Commercial Market, Rawalpindi", creditLimit: 100000, riderIdx: 3 },
      { name: "Shinwari Karahi", businessName: "Shinwari Restaurant", phone: "03467778899", address: "Blue Area, Islamabad", creditLimit: 140000, riderIdx: 3 },

      // Rider 5 Customers (Zubair Khan)
      { name: "Student Biryani Main", businessName: "Student Biryani Saddar", phone: "03221112233", address: "Saddar, Karachi", creditLimit: 250000, riderIdx: 4 },
      { name: "Javed Nihari", businessName: "Javed Nihari House", phone: "03222223344", address: "Alamgir Road, Karachi", creditLimit: 180000, riderIdx: 4 },
      { name: "Zahid Nihari", businessName: "Zahid Nihari", phone: "03223334455", address: "Tariq Road, Karachi", creditLimit: 160000, riderIdx: 4 },
      { name: "BBQ Tonight", businessName: "BBQ Tonight Clifton", phone: "03224445566", address: "Clifton Block 5, Karachi", creditLimit: 300000, riderIdx: 4 },
      { name: "Kolachi Restaurant", businessName: "Kolachi Do Darya", phone: "03225556677", address: "Do Darya, Defense Phase 8, Karachi", creditLimit: 350000, riderIdx: 4 },
      { name: "Al-Haj Bundu Khan", businessName: "Bundu Khan Nazimabad", phone: "03226667788", address: "Nazimabad Block 3, Karachi", creditLimit: 140000, riderIdx: 4 },
    ];

    const customers = [];
    for (const cData of customerRawData) {
      const rider = riders[cData.riderIdx];
      const customer = await Customer.create({
        name: cData.name,
        businessName: cData.businessName,
        phone: cData.phone,
        address: cData.address,
        creditLimit: cData.creditLimit,
        outstandingBalance: 0, // Will be accumulated from invoices
        assignedRider: rider._id,
        createdBy: admin._id,
      });
      customers.push(customer);
    }

    console.log("Setting up Rider Inventories & Ledgers...");
    for (const rider of riders) {
      // Rider Inventories
      await RiderInventory.create([
        { rider: rider._id, cylinderSize: "11.8kg Commercial", weightKg: 11.8, filledQty: 25, emptyQty: 10, ratePerKg: 260 },
        { rider: rider._id, cylinderSize: "45.4kg Industrial", weightKg: 45.4, filledQty: 8, emptyQty: 4, ratePerKg: 250 },
        { rider: rider._id, cylinderSize: "6kg Domestic", weightKg: 6.0, filledQty: 15, emptyQty: 8, ratePerKg: 270 },
      ]);

      // Rider Ledgers
      await RiderLedger.create({
        rider: rider._id,
        totalFilledReceived: 120,
        totalEmptyReturned: 85,
        totalFilledSold: 95,
        currentFilledBalance: 25,
        currentEmptyBalance: 10,
        totalPurchased: 291560,
        totalPaid: 215000,
        outstandingBalance: 76560,
      });
    }

    console.log("Generating Historical Invoices & Payments for Customers...");
    let invSeq = 1001;

    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const rider = riders[i % 5];

      // Historical Invoice 1 (30 to 45 days ago)
      const invDate1 = daysAgo(35 + (i % 10));
      const qty1 = 3 + (i % 4);
      const rate1 = 260;
      const weight1 = 11.8;
      const totalWeight1 = qty1 * weight1;
      const lineTotal1 = totalWeight1 * rate1;
      const invNum1 = `INV-${invSeq++}`;

      const inv1 = await Invoice.create({
        invoiceNumber: invNum1,
        customer: customer._id,
        rider: rider._id,
        items: [
          { cylinderSize: "11.8kg Commercial", weightKg: weight1, quantity: qty1, totalWeightKg: totalWeight1, ratePerKg: rate1, lineTotal: lineTotal1 }
        ],
        subTotal: lineTotal1,
        previousBalance: 0,
        grandTotal: lineTotal1,
        amountPaid: lineTotal1, // Fully paid
        remainingBalance: 0,
        invoiceDate: invDate1,
        status: "paid"
      });

      // Historical Payment 1 (for Inv 1)
      const pmtDate1 = daysAgo(33 + (i % 10));
      await Payment.create({
        type: "customer",
        customer: customer._id,
        invoice: inv1._id,
        amount: lineTotal1,
        method: i % 2 === 0 ? "easypaisa" : "cash",
        receivedBy: rider._id,
        paymentDate: pmtDate1,
        notes: `Full payment for invoice ${invNum1}`
      });

      // Historical Invoice 2 (10 to 20 days ago)
      const invDate2 = daysAgo(15 + (i % 5));
      const qty2 = 2 + (i % 3);
      const rate2 = 265;
      const weight2 = 11.8;
      const totalWeight2 = qty2 * weight2;
      const lineTotal2 = totalWeight2 * rate2;
      const invNum2 = `INV-${invSeq++}`;
      const paidAmount2 = Math.round(lineTotal2 * 0.6); // Partial payment
      const remBal2 = lineTotal2 - paidAmount2;

      const inv2 = await Invoice.create({
        invoiceNumber: invNum2,
        customer: customer._id,
        rider: rider._id,
        items: [
          { cylinderSize: "11.8kg Commercial", weightKg: weight2, quantity: qty2, totalWeightKg: totalWeight2, ratePerKg: rate2, lineTotal: lineTotal2 }
        ],
        subTotal: lineTotal2,
        previousBalance: 0,
        grandTotal: lineTotal2,
        amountPaid: paidAmount2,
        remainingBalance: remBal2,
        invoiceDate: invDate2,
        status: remBal2 === 0 ? "paid" : "partial"
      });

      // Historical Payment 2 (for Inv 2)
      const pmtDate2 = daysAgo(12 + (i % 5));
      await Payment.create({
        type: "customer",
        customer: customer._id,
        invoice: inv2._id,
        amount: paidAmount2,
        method: i % 3 === 0 ? "jazzcash" : i % 3 === 1 ? "bank_transfer" : "cash",
        receivedBy: rider._id,
        paymentDate: pmtDate2,
        notes: `Partial payment for invoice ${invNum2}`
      });

      // Update customer outstanding balance
      customer.outstandingBalance = remBal2;
      await customer.save();
    }

    console.log("Generating Rider Historical Transactions...");
    let txSeq = 5001;
    for (let rIdx = 0; rIdx < riders.length; rIdx++) {
      const rider = riders[rIdx];

      // Transaction 1: Stock Purchase (30 days ago)
      await RiderTransaction.create({
        transactionNumber: `TX-${txSeq++}`,
        rider: rider._id,
        type: "purchase",
        cylinderSize: "11.8kg Commercial",
        filledQty: 40,
        emptyQty: 0,
        ratePerKg: 260,
        totalWeightKg: 472,
        totalAmount: 122720,
        notes: "Daily stock issuance from plant",
        createdBy: admin._id,
        transactionDate: daysAgo(30)
      });

      // Transaction 2: Return Empty (22 days ago)
      await RiderTransaction.create({
        transactionNumber: `TX-${txSeq++}`,
        rider: rider._id,
        type: "return_empty",
        cylinderSize: "11.8kg Commercial",
        filledQty: 0,
        emptyQty: 30,
        ratePerKg: 0,
        totalWeightKg: 0,
        totalAmount: 0,
        notes: "Returned empty cylinders to main station",
        createdBy: admin._id,
        transactionDate: daysAgo(22)
      });

      // Transaction 3: Payment (14 days ago)
      await RiderTransaction.create({
        transactionNumber: `TX-${txSeq++}`,
        rider: rider._id,
        type: "payment",
        cylinderSize: "11.8kg Commercial",
        filledQty: 0,
        emptyQty: 0,
        ratePerKg: 0,
        totalWeightKg: 0,
        totalAmount: 85000,
        notes: "Rider cash submission to Admin",
        createdBy: admin._id,
        transactionDate: daysAgo(14)
      });
    }

    console.log("Generating Expenses...");
    await Expense.create([
      { rider: riders[0]._id, category: "diesel", amount: 4500, description: "Fuel refill for Suzuki Carry (Gulberg route)", expenseDate: daysAgo(25), createdBy: admin._id },
      { rider: riders[1]._id, category: "lunch", amount: 1200, description: "Rider team lunch allowance", expenseDate: daysAgo(18), createdBy: admin._id },
      { rider: riders[2]._id, category: "vehicle_maintenance", amount: 6500, description: "Delivery Rickshaw tire replacement", expenseDate: daysAgo(10), createdBy: admin._id },
      { rider: riders[3]._id, category: "diesel", amount: 5000, description: "Fuel refill for Isuzu pickup", expenseDate: daysAgo(5), createdBy: admin._id },
      { rider: riders[4]._id, category: "other", amount: 2000, description: "Rope and safety belt equipment", expenseDate: daysAgo(2), createdBy: admin._id },
    ]);

    console.log("=========================================");
    console.log("🎉 DATABASE SEEDED SUCCESSFULLY!");
    console.log("=========================================");
    console.log("🔑 Admin Login Credentials:");
    console.log("   Phone: 03001234567");
    console.log("   Email: admin@gasstation.pk");
    console.log("   Password: admin123");
    console.log("-----------------------------------------");
    console.log("🏍️ Rider Login Credentials (5 Riders):");
    console.log("   1. Tariq Mahmood  - Phone: 03019876543 | Pass: password123");
    console.log("   2. Usman Ghani     - Phone: 03123456789 | Pass: password123");
    console.log("   3. Hamza Malik     - Phone: 03335557778 | Pass: password123");
    console.log("   4. Bilal Ahmed     - Phone: 03456789012 | Pass: password123");
    console.log("   5. Zubair Khan     - Phone: 03218889990 | Pass: password123");
    console.log("=========================================");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding Error:", error);
    process.exit(1);
  }
};

seedDatabase();
