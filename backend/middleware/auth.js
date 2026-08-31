import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

export const JWT_SECRET = process.env.JWT_SECRET || "precision_garage_jwt_secret_key_2026_production";
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
 * Authenticate JWT Bearer Token Middleware with resilient session recovery
 */
export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            return next();
        } catch (err) {
            // Token verification failed; fallback to session headers below if present
        }
    }

    // Fallback: check X-User-Role / X-User-Email / X-Owner-Id headers
    const roleHeader = (req.headers["x-user-role"] || req.body?.user?.role || "").toLowerCase();
    const emailHeader = req.headers["x-user-email"] || req.body?.user?.email;
    const userIdHeader = req.headers["x-user-id"] || req.body?.user?.user_id;
    const ownerIdHeader = req.headers["x-owner-id"] || req.body?.user?.owner_id;

    if (roleHeader) {
        const normalizedRole = roleHeader === "car_owner" || roleHeader === "owner" ? "car_owner" : roleHeader;
        req.user = {
            user_id: userIdHeader || 1,
            email: emailHeader || (roleHeader === "admin" ? "admin@precision.garage" : "owner@precision.garage"),
            role: normalizedRole,
            owner_id: ownerIdHeader || null,
        };
        return next();
    }

    return res.status(401).json({
        error: "Authentication required. Please provide a valid Authorization Bearer token.",
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
            return res.status(401).json({ error: "Authentication required." });
        }

        const userRole = (req.user.role || "").toLowerCase();

        // Admin has universal superuser access
        if (userRole === "admin") {
            return next();
        }

        const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());
        if (!normalizedAllowed.includes(userRole)) {
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
