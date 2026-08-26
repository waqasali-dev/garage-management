import express from "express";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { deleteCachePattern } from "../redis.js";
import { generateToken, authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        const result = await pool.query(
            "SELECT user_id, email, password, role, staff_id, owner_id, is_active FROM users WHERE LOWER(email) = LOWER($1);",
            [email.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials." });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(403).json({ error: "This account has been deactivated/suspended." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials." });
        }

        await pool.query(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1;",
            [user.user_id]
        );

        await deleteCachePattern("garage:cache:users:*");

        const detailsResult = await pool.query(
            `SELECT 
                u.user_id,
                u.email,
                u.role,
                u.staff_id,
                u.owner_id,
                u.is_active,
                u.created_at,
                u.last_login,
                COALESCE(s.full_name, o.full_name, 'System Administrator') AS full_name
             FROM users u
             LEFT JOIN staff_data s ON u.staff_id = s.staff_id
             LEFT JOIN car_owners o ON u.owner_id = o.owner_id
             WHERE u.user_id = $1;`,
            [user.user_id]
        );

        const safeUser = detailsResult.rows[0] || {
            user_id: user.user_id,
            email: user.email,
            role: user.role,
            staff_id: user.staff_id,
            owner_id: user.owner_id,
            is_active: user.is_active,
            full_name: user.email,
        };

        const token = generateToken(safeUser);

        return res.json({
            success: true,
            message: "Login successful.",
            token,
            user: safeUser,
        });
    } catch (err) {
        console.error("Login database error:", err);
        res.status(500).json({ error: "Internal authentication error.", details: err.message });
    }
});

// POST /api/auth/change-password
router.post("/change-password", authenticateToken, async (req, res) => {
    const { current_password, new_password } = req.body;
    const userId = req.user?.user_id;

    if (!current_password || !new_password) {
        return res.status(400).json({ error: "Current password and new password are required." });
    }

    if (new_password.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters long." });
    }

    try {
        const userRes = await pool.query("SELECT password FROM users WHERE user_id = $1;", [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: "User not found." });
        }

        const isMatch = await bcrypt.compare(current_password, userRes.rows[0].password);
        if (!isMatch) {
            return res.status(401).json({ error: "Current password does not match." });
        }

        const newHash = await bcrypt.hash(new_password, 10);
        await pool.query("UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2;", [
            newHash,
            userId,
        ]);

        res.json({ success: true, message: "Password updated successfully." });
    } catch (err) {
        console.error("Error changing password:", err);
        res.status(500).json({ error: "Failed to update password", details: err.message });
    }
});

export default router;
