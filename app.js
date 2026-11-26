require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const dns = require("dns");

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const loginRoutes = require("./Router/loginRouter");
const accountRoutes = require("./Router/AccountRouter");
const AdminRouter = require("./Router/AdminRouter");
const addClubRouter = require("./Router/AddClubRouter");
const ensureInitialAccount = require("./utils/initialAccount");

const app = express();

const isProd = process.env.NODE_ENV === "production";

// Trust Render proxy in production
if (isProd) {
  app.set("trust proxy", 1);
}

// ========================================
// ALLOWED FRONTEND ORIGINS
// ========================================

const allowedOrigins = [
  "https://pay-nthra24.vercel.app",
  ...(process.env.FRONTEND_ORIGINS || "").split(","),
  process.env.FRONTEND_ORIGIN,
  process.env.CLIENT_URL,
]
  .filter(Boolean)
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter((origin, index, origins) => origins.indexOf(origin) === index);

// Check frontend origin
const isAllowedOrigin = (origin) => {
  // Allow requests without Origin (Postman/server-to-server)
  if (!origin) return true;

  const normalizedOrigin = origin.replace(/\/$/, "");

  // Configured production and development URLs
  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  // Allow localhost on any port
  if (
    /^http:\/\/localhost(:\d+)?$/.test(normalizedOrigin) ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(normalizedOrigin)
  ) {
    return true;
  }

  return false;
};

// ========================================
// CORS CONFIGURATION
// ========================================

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      console.log("Blocked frontend origin:", origin);

      return callback(new Error("Origin not allowed by CORS"));
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

// ========================================
// MIDDLEWARE
// ========================================

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ========================================
// REQUEST ORIGIN VALIDATION
// ========================================

app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");

    if (!origin || !isAllowedOrigin(origin)) {
      console.log("Rejected request origin:", origin);

      return res.status(403).json({
        success: false,
        message: "Request origin is not allowed",
      });
    }
  }

  next();
});

// ========================================
// API ROUTES
// ========================================

app.use("/api", loginRoutes);

app.use("/api/accounts", accountRoutes);

app.use("/api/admin", AdminRouter);

app.use("/api/clubs", addClubRouter);

// ========================================
// BACKEND HEALTH CHECK
// ========================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Club Management Backend is running",
    environment: isProd ? "production" : "development",
  });
});

// ========================================
// 404 HANDLER
// ========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

// ========================================
// ERROR HANDLER
// ========================================

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  if (err.message === "Origin not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "Frontend origin is not allowed by CORS",
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// ========================================
// SERVER CONFIGURATION
// ========================================

const PORT = process.env.PORT || 4001;

// ========================================
// START SERVER
// ========================================

async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from .env");
    }

    if (allowedOrigins.length === 0) {
      throw new Error(
        "At least one frontend origin must be configured"
      );
    }

    // Connect MongoDB
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected successfully");
    console.log("Database:", mongoose.connection.name);

    // Create initial admin account if required
    await ensureInitialAccount();

    // Start backend
    app.listen(PORT, () => {
      console.log("----------------------------------");
      console.log(`Backend running on port ${PORT}`);
      console.log(
        `Environment: ${isProd ? "production" : "development"}`
      );
      console.log("Allowed frontend origins:", allowedOrigins);
      console.log("Local API: http://localhost:" + PORT + "/api");
      console.log("Club API registered at /api/clubs");
      console.log("----------------------------------");
    });

  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
}

// Start server only when executed directly
if (require.main === module) {
  startServer();
}

module.exports = app;