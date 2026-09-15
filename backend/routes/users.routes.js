import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { getCache, setCache, deleteCachePattern } from "../redis.js";
import { authenticateToken, requireRole, JWT_SECRET } from "../middleware/auth.js";

const router = express.Router();

// GET /api/users - Get all users
router.get("/", async (req, res) => {
    const cacheKey = "garage:cache:users:all";

    try {
        const cachedUsers = await getCache(cacheKey);
        if (cachedUsers) {
            return res.json({ success: true, source: "redis", data: cachedUsers });
        }

        const query = `
            SELECT 
                u.user_id,
                u.email,
                u.role,
                u.staff_id,
                u.owner_id,
                u.is_active,
                u.last_login,
                u.created_at,
                u.updated_at,
                s.full_name AS staff_name,
                s.role AS staff_role,
                s.phone_number AS staff_phone,
                s.hourly_rate AS staff_hourly_rate,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone,
                o.is_vip AS owner_is_vip
            FROM users u
            LEFT JOIN staff_data s ON u.staff_id = s.staff_id
            LEFT JOIN car_owners o ON u.owner_id = o.owner_id
            ORDER BY u.user_id DESC;
        `;
        const result = await pool.query(query);

        const formattedUsers = result.rows.map((row) => {
            let linkedName = "Admin Superuser";
            let details = "";
            if (row.role === "staff") {
                linkedName = row.staff_name
                    ? `${row.staff_name} (${row.staff_role || "Staff"})`
                    : `Staff ID #${row.staff_id}`;
                if (row.staff_phone) details = `Phone: ${row.staff_phone}`;
            } else if (row.role === "car_owner") {
                linkedName = row.owner_name
                    ? `${row.owner_name} (Car Owner${row.owner_is_vip ? " - VIP" : ""})`
                    : `Owner ID #${row.owner_id}`;
                if (row.owner_phone) details = `Phone: ${row.owner_phone}`;
            } else if (row.role === "admin") {
                linkedName = "System Administrator (Root)";
            }

            return {
                ...row,
                linkedName,
                details,
            };
        });

        await setCache(cacheKey, formattedUsers, 600);

        res.json({ success: true, source: "postgres", data: formattedUsers });
    } catch (err) {
        console.error("Error fetching users from database:", err);
        res.status(500).json({ error: "Failed to fetch users from database", details: err.message });
    }
});

// POST /api/admin/create-user
export const handleCreateUser = async (req, res) => {
    // Verify Admin authentication unless system is empty (bootstrap mode)
    try {
        const userCountRes = await pool.query("SELECT COUNT(*) as count FROM users;");
        const userCount = parseInt(userCountRes.rows[0]?.count, 10) || 0;

        if (userCount > 0) {
            const authHeader = req.headers["authorization"] || req.headers["Authorization"];
            const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
            let isAdminAuthorized = false;

            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    if (decoded.role === "admin") {
                        isAdminAuthorized = true;
                    } else {
                        return res.status(403).json({ error: "Access denied. Only administrators can manage users." });
                    }
                } catch (err) {
                    // Fall through to session header verification
                }
            }

            if (!isAdminAuthorized) {
                const roleHeader = (req.headers["x-user-role"] || req.body?.user?.role || "").toLowerCase();
                if (roleHeader === "admin") {
                    isAdminAuthorized = true;
                }
            }

            if (!isAdminAuthorized) {
                return res.status(401).json({ error: "Admin authentication required to create users." });
            }
        }
    } catch (countErr) {
        console.warn("Notice: user count check error:", countErr.message);
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const {
            role,
            email,
            password,
            is_active = true,
            staff_name,
            staff_role,
            staff_phone,
            staff_address,
            staff_hourly_rate,
            existing_owner_id,
            owner_name,
            owner_phone,
            owner_address,
            owner_is_vip = false,
        } = req.body;

        if (!password || !role) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: "Role and Password are required fields.",
            });
        }

        const validRoles = ["admin", "staff", "car_owner"];
        if (!validRoles.includes(role)) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: `Invalid role '${role}'. Must be one of: ${validRoles.join(", ")}`,
            });
        }

        let targetEmail = (email || "").trim().toLowerCase();
        let targetStaffId = null;
        let targetOwnerId = null;

        if (role === "admin") {
            if (!targetEmail) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "Email is required for admin account." });
            }
        } else if (role === "staff") {
            if (!staff_name || !staff_role || !targetEmail) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: "Full Name, Role, and Email are required to create staff member.",
                });
            }

            const checkStaff = await client.query(
                "SELECT staff_id FROM staff_data WHERE LOWER(email) = LOWER($1);",
                [targetEmail]
            );
            if (checkStaff.rows.length > 0) {
                await client.query("ROLLBACK");
                return res.status(409).json({
                    error: `A staff member with email '${targetEmail}' already exists in staff_data.`,
                });
            }

            const insertStaffQuery = `
                INSERT INTO staff_data (
                    full_name,
                    role,
                    email,
                    phone_number,
                    residential_address,
                    hourly_rate,
                    is_active
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING staff_id, full_name, email;
            `;
            const staffResult = await client.query(insertStaffQuery, [
                staff_name.trim(),
                staff_role.trim(),
                targetEmail,
                staff_phone ? staff_phone.trim() : null,
                staff_address ? staff_address.trim() : null,
                staff_hourly_rate ? parseFloat(staff_hourly_rate) : 0.0,
                Boolean(is_active),
            ]);

            targetStaffId = staffResult.rows[0].staff_id;
        } else if (role === "car_owner") {
            if (existing_owner_id) {
                const checkExisting = await client.query(
                    "SELECT * FROM car_owners WHERE owner_id = $1;",
                    [existing_owner_id]
                );

                if (checkExisting.rows.length === 0) {
                    await client.query("ROLLBACK");
                    return res.status(404).json({
                        error: `Car owner profile '${existing_owner_id}' not found in database.`,
                    });
                }

                const checkExistingUser = await client.query(
                    "SELECT user_id FROM users WHERE owner_id = $1;",
                    [existing_owner_id]
                );
                if (checkExistingUser.rows.length > 0) {
                    await client.query("ROLLBACK");
                    return res.status(409).json({
                        error: `A user portal account is already linked to car owner '${existing_owner_id}'.`,
                    });
                }

                if (owner_name || owner_phone || targetEmail || owner_address) {
                    await client.query(
                        `UPDATE car_owners
                         SET
                            full_name = COALESCE($1, full_name),
                            phone_number = COALESCE($2, phone_number),
                            email_address = COALESCE($3, email_address),
                            billing_address = COALESCE($4, billing_address),
                            is_vip = COALESCE($5, is_vip)
                         WHERE owner_id = $6;`,
                        [
                            owner_name ? owner_name.trim() : null,
                            owner_phone ? owner_phone.trim() : null,
                            targetEmail || null,
                            owner_address ? owner_address.trim() : null,
                            owner_is_vip !== undefined ? Boolean(owner_is_vip) : null,
                            existing_owner_id,
                        ]
                    );
                }

                targetOwnerId = existing_owner_id;
                if (!targetEmail && checkExisting.rows[0].email_address) {
                    targetEmail = checkExisting.rows[0].email_address.trim().toLowerCase();
                }
            } else {
                if (!owner_name || !owner_phone || !targetEmail) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({
                        error: "Full Name, Phone Number, and Email are required to create car owner.",
                    });
                }

                const insertOwnerQuery = `
                    INSERT INTO car_owners (
                        full_name,
                        phone_number,
                        email_address,
                        billing_address,
                        is_vip
                    )
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING owner_id, full_name, email_address;
                `;
                const ownerResult = await client.query(insertOwnerQuery, [
                    owner_name.trim(),
                    owner_phone.trim(),
                    targetEmail,
                    owner_address ? owner_address.trim() : null,
                    Boolean(owner_is_vip),
                ]);

                targetOwnerId = ownerResult.rows[0].owner_id;
            }
        }

        const checkUserEmail = await client.query(
            "SELECT user_id FROM users WHERE LOWER(email) = LOWER($1);",
            [targetEmail]
        );
        if (checkUserEmail.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: `A user account with email '${targetEmail}' already exists in users table.`,
            });
        }

        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        const insertUserQuery = `
            INSERT INTO users (
                email, 
                password, 
                role, 
                staff_id, 
                owner_id, 
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING 
                user_id, 
                email, 
                role, 
                staff_id, 
                owner_id, 
                is_active, 
                created_at, 
                updated_at;
        `;

        const userResult = await client.query(insertUserQuery, [
            targetEmail,
            password_hash,
            role,
            targetStaffId,
            targetOwnerId,
            Boolean(is_active),
        ]);

        await client.query("COMMIT");

        await deleteCachePattern("garage:cache:users:*");
        await deleteCachePattern("garage:cache:owners:*");
        await deleteCachePattern("garage:cache:staff:*");

        return res.status(201).json({
            success: true,
            message: `User account created successfully with '${role}' role.`,
            user: userResult.rows[0],
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Database error while creating user:", err);
        return res.status(500).json({
            error: "Database error during user account creation.",
            details: err.message,
        });
    } finally {
        client.release();
    }
};

router.post("/create", handleCreateUser);

// PATCH /api/users/:id/status
router.patch("/:id/status", authenticateToken, requireRole(["admin"]), async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { is_active } = req.body;

        if (isNaN(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        const result = await pool.query(
            "UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING user_id, email, role, staff_id, owner_id, is_active, updated_at;",
            [Boolean(is_active), userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found in database" });
        }

        const user = result.rows[0];

        if (user.staff_id) {
            await pool.query(
                "UPDATE staff_data SET is_active = $1 WHERE staff_id = $2;",
                [Boolean(is_active), user.staff_id]
            );
        }

        await deleteCachePattern("garage:cache:users:*");
        await deleteCachePattern("garage:cache:staff:*");
        await deleteCachePattern("garage:cache:owners:*");
        await deleteCachePattern("garage:cache:schedules:*");

        return res.json({
            success: true,
            message: `User status updated to ${is_active ? "ACTIVE" : "SUSPENDED"}`,
            user: result.rows[0],
        });
    } catch (err) {
        console.error("Error updating user status in database:", err);
        res.status(500).json({ error: "Failed to update status in database", details: err.message });
    }
});

// DELETE /api/users/:id - Soft deactivate user
router.delete("/:id", authenticateToken, requireRole(["admin"]), async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        if (isNaN(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        const result = await pool.query(
            "UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 RETURNING user_id, email, role, staff_id, owner_id, is_active, updated_at;",
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found in database" });
        }

        const user = result.rows[0];

        if (user.staff_id) {
            await pool.query(
                "UPDATE staff_data SET is_active = FALSE WHERE staff_id = $1;",
                [user.staff_id]
            );
        }

        await deleteCachePattern("garage:cache:users:*");
        await deleteCachePattern("garage:cache:staff:*");
        await deleteCachePattern("garage:cache:owners:*");
        await deleteCachePattern("garage:cache:schedules:*");

        return res.json({
            success: true,
            message: `User account '${user.email}' disabled and moved to disabled accounts.`,
            user,
        });
    } catch (err) {
        console.error("Error disabling user in database:", err);
        res.status(500).json({ error: "Failed to disable user", details: err.message });
    }
});

// PATCH /api/users/:id/reset-password
router.patch("/:id/reset-password", authenticateToken, requireRole(["admin"]), async (req, res) => {
    const { id } = req.params;
    const { new_password } = req.body;
    const targetUserId = parseInt(id, 10);

    if (isNaN(targetUserId)) {
        return res.status(400).json({ error: "Invalid user ID." });
    }

    if (!new_password || new_password.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters long." });
    }

    try {
        const newHash = await bcrypt.hash(new_password, 10);
        const result = await pool.query(
            "UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING user_id, email, role;",
            [newHash, targetUserId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found." });
        }

        res.json({
            success: true,
            message: `Password reset successfully for user [${result.rows[0].email}].`,
            user: result.rows[0],
        });
    } catch (err) {
        console.error("Error resetting user password:", err);
        res.status(500).json({ error: "Failed to reset password", details: err.message });
    }
});

export default router;
