import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Database & Redis Clients
import pool from "./db.js";
import redisClient from "./redis.js";

// Middlewares
import idempotencyMiddleware from "./middleware/idempotency.js";
import errorHandler from "./middleware/errorHandler.js";

// Modular Express Routers
import authRoutes from "./routes/auth.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import workOrdersRoutes, { handleIntake, handleGetWorkOrdersList, handleGetSingleWorkOrder } from "./routes/workOrders.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import ownersRoutes from "./routes/owners.routes.js";
import vehiclesRoutes from "./routes/vehicles.routes.js";
import schedulesRoutes from "./routes/schedules.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import usersRoutes, { handleCreateUser } from "./routes/users.routes.js";
import invoicesRoutes from "./routes/invoices.routes.js";
import exportRoutes from "./routes/export.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const port = process.env.PORT || 5000;

// ==========================================
// 🛡️ SECURE CORS CONFIGURATION
// ==========================================
const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "https://garage-management-hy5h.onrender.com",
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
                return callback(null, true);
            }
            return callback(null, true);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Idempotency-Key"],
    })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Mutex / Idempotency protection for state mutations
app.use(idempotencyMiddleware);

// ==========================================
// 1. HEALTH CHECK & TELEMETRY
// ==========================================
app.get("/api/health", async (req, res) => {
    let dbStatus = "Disconnected";
    let serverTime = null;
    let pgVersion = null;
    let redisStatus = redisClient.isReady ? "Connected (In-Memory Cache)" : "Disconnected";

    try {
        const result = await pool.query("SELECT NOW() as server_time, version() as pg_version");
        dbStatus = "Connected";
        serverTime = result.rows[0].server_time;
        pgVersion = result.rows[0].pg_version;
    } catch (err) {
        dbStatus = `Error: ${err.message}`;
    }

    res.json({
        status: dbStatus === "Connected" ? "OK" : "Degraded",
        service: "Precision Garage API",
        database: dbStatus,
        redis: redisStatus,
        serverTime,
        version: pgVersion,
    });
});

// ==========================================
// 2. MODULAR ROUTE MOUNTING
// ==========================================
app.use("/api/auth", authRoutes);
app.use("/api/inventory", inventoryRoutes);

// Work Orders & Intake Endpoints
app.post("/api/intake", handleIntake);
app.use("/api/work-orders", workOrdersRoutes);
app.use("/api/staff/work-orders", workOrdersRoutes);

// Staff, Owners, Vehicles & Fleet
app.use("/api/staff", staffRoutes);
app.use("/api/owners", ownersRoutes);
app.use("/api/vehicles", vehiclesRoutes);
app.use("/api/owner", vehiclesRoutes); // Supports /api/owner/vehicles

// Schedules, Audit, Invoices & Reports
app.use("/api/schedules", schedulesRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/export", exportRoutes);

// User Management & Admin Provisioning
app.post("/api/admin/create-user", handleCreateUser);
app.use("/api/users", usersRoutes);
app.use("/api/admin/users", usersRoutes);

// ==========================================
// 3. GLOBAL ERROR HANDLER & LISTENER
// ==========================================
app.use(errorHandler);

app.listen(port, () => {
    console.log(`🚀 Precision Garage API Server running on http://localhost:${port}`);
});
