import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.js";
import { getCache, setCache } from "../redis.js";
import { extractToken } from "./cookies.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const envSecret = process.env.JWT_SECRET && process.env.JWT_SECRET.trim();
if (!envSecret) {
    if (process.env.NODE_ENV === "production") {
        throw new Error("FATAL SECURITY ERROR: JWT_SECRET environment variable is required in production mode.");
    }
    console.warn("⚠️ SECURITY WARNING: JWT_SECRET is not set in environment. Set JWT_SECRET in .env for production deployment.");
}

export const JWT_SECRET = envSecret || "dev_precision_garage_temporary_local_secret_2026";
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * Generate a signed JWT token for an authenticated user
 */
export const generateToken = (user) => {
    return jwt.sign(
        {
            user_id: user.user_id,
            email: user.email,
            role: user.role,
            staff_id: user.staff_id || null,
            owner_id: user.owner_id || null,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

/**
 * Authenticate JWT Token Middleware with cookie extraction, resilient bearer fallback,
 * and real-time active status verification to mitigate stateless drift (SEC-2.2).
 */
export const authenticateToken = async (req, res, next) => {
    const token = extractToken(req);

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;

            // Mitigate stateless token drift - verify user active status in real time
            if (decoded.user_id) {
                const activeCacheKey = `garage:user_active:${decoded.user_id}`;
                let isActive = await getCache(activeCacheKey);

                if (isActive === null) {
                    const statusRes = await pool.query(
                        "SELECT is_active FROM users WHERE user_id = $1;",
                        [decoded.user_id]
                    );
                    if (statusRes.rows.length === 0) {
                        return res.status(401).json({
                            error: "User account no longer exists. Please log in again.",
                            code: "AUTH_USER_NOT_FOUND",
                        });
                    }
                    isActive = Boolean(statusRes.rows[0].is_active);
                    await setCache(activeCacheKey, isActive, 60); // 60s cache with active invalidation
                }

                if (!isActive) {
                    return res.status(401).json({
                        error: "Account has been deactivated or suspended.",
                        code: "AUTH_ACCOUNT_DEACTIVATED",
                    });
                }
            }

            return next();
        } catch (err) {
            return res.status(401).json({
                error: "Invalid or expired authorization token. Please log in again.",
                code: "AUTH_TOKEN_INVALID",
            });
        }
    }

    return res.status(401).json({
        error: "Authentication required. Please provide a valid session cookie or Authorization Bearer token.",
        code: "AUTH_TOKEN_MISSING",
    });
};

/**
 * Role-based authorization middleware
 * Admin is considered superuser and permitted on all protected endpoints.
 */
export const requireRole = (allowedRoles = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Authentication required.", code: "AUTH_REQUIRED" });
        }

        const userRole = (req.user.role || "").toLowerCase();

        // Admin has universal superuser access
        if (userRole === "admin") {
            return next();
        }

        const normalizedAllowed = allowedRoles.map((r) => {
            const low = r.toLowerCase();
            return low === "owner" ? "car_owner" : low;
        });
        const normalizedUserRole = userRole === "owner" ? "car_owner" : userRole;

        if (!normalizedAllowed.includes(normalizedUserRole)) {
            return res.status(403).json({
                error: `Access denied. Role '${req.user.role}' is not authorized for this resource.`,
                code: "FORBIDDEN_ROLE",
            });
        }

        next();
    };
};

export default {
    generateToken,
    authenticateToken,
    requireRole,
};
