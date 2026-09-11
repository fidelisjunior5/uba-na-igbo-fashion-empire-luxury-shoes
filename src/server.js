const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const publicDir = path.join(__dirname, "..", "public");
const dbFile = path.join(__dirname, "..", "data", "db.json");

app.use(express.static(publicDir));

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(dbFile, "utf8"));
  } catch (error) {
    return {
      products: [],
      orders: [],
      users: []
    };
  }
}

function writeDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

app.post("/api/payments/initialize", async (req, res) => {
  try {
    const { orderNumber } = req.body || {};

    if (!orderNumber) {
      return res.status(400).json({
        success: false,
        message: "Order number is required"
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Paystack secret key is not configured"
      });
    }

    const db = readDB();
    const order = db.orders.find(item => item.orderNumber === orderNumber);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (!order.email) {
      return res.status(400).json({
        success: false,
        message: "Customer email is required for payment"
      });
    }

    const amountNaira = Number(order.totalAmount);

    if (!Number.isFinite(amountNaira) || amountNaira <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount"
      });
    }

    const amountKobo = Math.round(amountNaira * 100);

    const paymentReference = `${order.orderNumber}-${Date.now()}`;

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: order.email,
        amount: amountKobo,
        reference: paymentReference,
        currency: "NGN"
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.data || !response.data.status) {
      return res.status(400).json({
        success: false,
        message: "Paystack could not initialize the payment"
      });
    }

    order.paymentReference = response.data.data.reference;
    order.paymentStatus = "Pending";
    writeDB(db);

    res.json({
      success: true,
      message: "Payment initialized successfully",
      publicKey: process.env.PAYSTACK_PUBLIC_KEY,
      authorizationUrl: response.data.data.authorization_url,
      accessCode: response.data.data.access_code,
      reference: response.data.data.reference
    });
  } catch (error) {
    console.error(
      "Paystack initialization error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: "Unable to initialize Paystack payment"
    });
  }
});

app.get("/api/payments/verify/:reference", async (req, res) => {
  try {
    const reference = req.params.reference;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required"
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Paystack secret key is not configured"
      });
    }

    const db = readDB();

    const order = db.orders.find(
      item =>
        item.orderNumber === reference ||
        item.paymentReference === reference
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const payment = response.data?.data;

    if (!payment || payment.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment has not been successfully verified",
        paymentStatus: payment?.status || "unknown"
      });
    }

    const expectedAmount = Math.round(Number(order.totalAmount) * 100);
    const paidAmount = Number(payment.amount);

    if (paidAmount !== expectedAmount) {
      return res.status(400).json({
        success: false,
        message: "Payment amount does not match the order amount"
      });
    }

    if (payment.currency && payment.currency !== "NGN") {
      return res.status(400).json({
        success: false,
        message: "Payment currency does not match the order currency"
      });
    }

    order.paymentStatus = "PAID";
    order.paymentReference = payment.reference;
    order.paidAt = new Date().toISOString();

    writeDB(db);

    res.json({
      success: true,
      message: "Payment verified successfully",
      paymentStatus: "PAID",
      orderNumber: order.orderNumber,
      reference: payment.reference
    });
  } catch (error) {
    console.error(
      "Paystack verification error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: "Unable to verify Paystack payment"
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Uba Na Igbo Fashion Empire & Luxury Shoes API is running"
  });
});

app.get("/api/products", (req, res) => {
  const db = readDB();

  res.json({
    success: true,
    products: db.products
  });
});

app.get("/api/products/:id", (req, res) => {
  const db = readDB();

  const product = db.products.find(
    item => item.id === req.params.id
  );

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found"
    });
  }

  res.json({
    success: true,
    product
  });
});

app.post("/api/orders", (req, res) => {
  try {
  const db = readDB();

  const {
    customerName,
    phone,
    email,
    address,
    items
  } = req.body;

  if (
    !customerName ||
    !phone ||
    !email ||
    !address ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Please provide all required order information"
    });
  }

  const verifiedItems = [];
  let totalAmount = 0;

  for (const item of items) {
    const productId = String(item.productId || "").trim();
    const quantity = Number(item.quantity || 1);

    if (!productId || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid product or quantity"
      });
    }

    const product = db.products.find(
      productItem => productItem.id === productId
    );

    if (!product) {
      return res.status(400).json({
        success: false,
        message: `Product not found: ${productId}`
      });
    }

    if (product.available === false) {
      return res.status(400).json({
        success: false,
        message: `${product.name} is currently unavailable`
      });
    }

    const price = Number(product.price);

    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid price for product: ${product.name}`
      });
    }

    const itemTotal = price * quantity;
    totalAmount += itemTotal;

    verifiedItems.push({
      productId: product.id,
      name: product.name,
      price,
      quantity,
      size: item.size || "",
      color: item.color || "",
      image: product.image || ""
    });
  }

  const order = {
    id: uuidv4(),
    orderNumber: `UNIG-${Date.now()}`,
    customerName,
    phone,
    email,
    address,
    items: verifiedItems,
    totalAmount,
    paymentStatus: "Pending",
    orderStatus: "Order Received",
    createdAt: new Date().toISOString()
  };

  db.orders.push(order);
  writeDB(db);

  res.status(201).json({
    success: true,
    message: "Order received successfully",
    order
  });
  } catch (error) {
    console.error("ORDER API ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Order creation failed",
      error: error.message
    });
  }
});;

app.get("/api/orders/:orderNumber", (req, res) => {
  const db = readDB();

  const order = db.orders.find(
    item => item.orderNumber === req.params.orderNumber
  );

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found"
    });
  }

  res.json({
    success: true,
    order
  });
});


// ==================== ADMIN API ====================

const crypto = require("crypto");
const adminSessions = new Set();

function requireAdmin(req, res, next) {
  const cookie = req.headers.cookie || "";

  const match = cookie
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith("uba_admin_session="));

  const token = match
    ? match.split("=")[1]
    : null;

  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({
      success: false,
      message: "Admin authentication required"
    });
  }

  next();
}

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};

  const adminUsername =
    process.env.ADMIN_USERNAME || "admin";

  const adminPassword =
    process.env.ADMIN_PASSWORD || "change-this-password";

  if (
    username !== adminUsername ||
    password !== adminPassword
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid username or password"
    });
  }

  const token = crypto.randomBytes(32).toString("hex");

  adminSessions.add(token);

  res.setHeader(
    "Set-Cookie",
    `uba_admin_session=${token}; HttpOnly; Path=/; SameSite=Lax`
  );

  res.json({
    success: true,
    message: "Admin login successful"
  });
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const db = readDB();

  const sortedOrders = [...db.orders].sort(
    (a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
  );

  res.json({
    success: true,
    orders: sortedOrders
  });
});

app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const db = readDB();

  const order = db.orders.find(
    item => item.id === req.params.id
  );

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found"
    });
  }

  const allowedStatuses = [
    "Order Received",
    "Preparing",
    "Ready for Delivery",
    "Out for Delivery",
    "Delivered",
    "Completed",
    "Cancelled"
  ];

  const allowedPayments = [
    "Pending",
    "Paid",
    "Failed",
    "Refunded"
  ];

  const { orderStatus, paymentStatus } = req.body || {};

  if (
    orderStatus &&
    !allowedStatuses.includes(orderStatus)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid order status"
    });
  }

  if (
    paymentStatus &&
    !allowedPayments.includes(paymentStatus)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment status"
    });
  }

  if (orderStatus) {
    order.orderStatus = orderStatus;
  }

  if (paymentStatus) {
    order.paymentStatus = paymentStatus;
  }

  order.updatedAt = new Date().toISOString();

  writeDB(db);

  res.json({
    success: true,
    message: "Order updated successfully",
    order
  });
});

/*
  Express 5 catch-all route.
  We use middleware instead of app.get("*")
  because Express 5 no longer accepts "*".
*/
app.get("/api/admin/images", requireAdmin, (req, res) => {
  const imagesDir = path.join(publicDir, "images");

  try {
    const images = fs.readdirSync(imagesDir)
      .filter(name => /\.(jpg|jpeg|png|webp|gif)$/i.test(name))
      .map(name => ({
        name,
        url: "/images/" + encodeURIComponent(name)
      }));

    res.json({ success: true, images });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to read image library"
    });
  }
});

app.get("/api/admin/products", requireAdmin, (req, res) => {
  const db = readDB();

  res.json({
    success: true,
    products: db.products || []
  });
});

app.post("/api/admin/products", requireAdmin, (req, res) => {
  const db = readDB();

  const {
    name, category, subcategory, price, description,
    sizes, colors, preOrder, preparationTime,
    deliveryTime, image, available
  } = req.body || {};

  if (!name || !category || price === undefined || !image) {
    return res.status(400).json({
      success: false,
      message: "Name, category, price and image are required"
    });
  }

  const product = {
    id: uuidv4(),
    name: String(name).trim(),
    category: String(category).trim().toLowerCase(),
    subcategory: String(subcategory || "").trim(),
    price: Number(price),
    description: String(description || "").trim(),
    sizes: Array.isArray(sizes) ? sizes : [],
    colors: Array.isArray(colors) ? colors : [],
    preOrder: Boolean(preOrder),
    preparationTime: String(preparationTime || "5–7 working days"),
    deliveryTime: String(deliveryTime || "1–3 working days"),
    image: String(image).trim(),
    available: available !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.products = db.products || [];
  db.products.push(product);
  writeDB(db);

  res.status(201).json({
    success: true,
    message: "Product created successfully",
    product
  });
});

app.patch("/api/admin/products/:id", requireAdmin, (req, res) => {
  const db = readDB();

  const product = (db.products || []).find(
    item => item.id === req.params.id
  );

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found"
    });
  }

  const allowedFields = [
    "name",
    "category",
    "subcategory",
    "price",
    "description",
    "sizes",
    "colors",
    "preOrder",
    "preparationTime",
    "deliveryTime",
    "image",
    "available"
  ];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  }

  if (product.price !== undefined) {
    product.price = Number(product.price);
  }

  product.updatedAt = new Date().toISOString();
  writeDB(db);

  res.json({
    success: true,
    message: "Product updated successfully",
    product
  });
});

app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  const db = readDB();

  const index = (db.products || []).findIndex(
    item => item.id === req.params.id
  );

  if (index === -1) {
    return res.status(404).json({
      success: false,
      message: "Product not found"
    });
  }

  const deleted = db.products.splice(index, 1)[0];
  writeDB(db);

  res.json({
    success: true,
    message: "Product deleted successfully",
    product: deleted
  });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      success: false,
      message: "API endpoint not found"
    });
  }

  res.sendFile(path.join(publicDir, "index.html"));
});
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `Uba Na Igbo Fashion Empire & Luxury Shoes running on port ${PORT}`
    );
  });
}

module.exports = app;
