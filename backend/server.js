import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ==========================================
// 1. HEALTH CHECK & DATABASE CONNECTION
// ==========================================
app.get("/api/health", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() as server_time, version() as pg_version");
        res.json({
            status: "OK",
            service: "Precision Garage API",
            database: "Connected",
            serverTime: result.rows[0].server_time,
            version: result.rows[0].pg_version,
        });
    } catch (err) {
        res.status(500).json({
            status: "Error",
            database: "Disconnected",
            error: err.message,
            hint: "Check backend/.env credentials",
        });
    }
});

// ==========================================
// 2. GET ALL USERS (WITH JOINED PROFILE DATA)
// ==========================================
app.get("/api/users", async (req, res) => {
    try {
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

        res.json({ success: true, data: formattedUsers });
    } catch (err) {
        console.error("Error fetching users from database:", err);
        res.status(500).json({ error: "Failed to fetch users from database", details: err.message });
    }
});

// ==========================================
// 3. CREATE USER & INSERT INTO CORRESPONDING TABLE
// ==========================================
app.post("/api/admin/create-user", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const {
            role,
            email,
            password,
            is_active = true,
            // staff_data fields
            staff_name,
            staff_role,
            staff_phone,
            staff_address,
            staff_hourly_rate,
            // car_owners fields
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

        // 1. ADMIN ROLE -> users table directly
        if (role === "admin") {
            if (!targetEmail) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "Email is required for admin account." });
            }
        }

        // 2. STAFF ROLE -> insert into staff_data table first
        else if (role === "staff") {
            if (!staff_name || !staff_role || !targetEmail) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: "Full Name, Role, and Email are required to create staff member.",
                });
            }

            // Check staff_data email uniqueness
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
        }

        // 3. CAR OWNER ROLE -> insert into car_owners table first
        else if (role === "car_owner") {
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

        // Check if email already exists in users table
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

        // Hash password securely with bcrypt
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // INSERT into PostgreSQL users table
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
});

// ==========================================
// 4. TOGGLE ACTIVE / SUSPEND STATUS
// ==========================================
app.patch("/api/users/:id/status", async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { is_active } = req.body;

        if (isNaN(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        const result = await pool.query(
            "UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING user_id, email, is_active, updated_at;",
            [Boolean(is_active), userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found in database" });
        }

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

// ==========================================
// 5. DELETE / REVOKE USER
// ==========================================
app.delete("/api/users/:id", async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        if (isNaN(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        const result = await pool.query(
            "DELETE FROM users WHERE user_id = $1 RETURNING user_id, email, role;",
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found in database" });
        }

        return res.json({
            success: true,
            message: `User account '${result.rows[0].email}' revoked and deleted.`,
            deletedUser: result.rows[0],
        });
    } catch (err) {
        console.error("Error deleting user from database:", err);
        res.status(500).json({ error: "Failed to delete user from database", details: err.message });
    }
});

// ==========================================
// 6. AUTH LOGIN
// ==========================================
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        const result = await pool.query(
            "SELECT * FROM users WHERE LOWER(email) = LOWER($1);",
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

        const { password: _, ...safeUser } = user;
        return res.json({
            success: true,
            message: "Login successful.",
            user: safeUser,
        });
    } catch (err) {
        console.error("Login database error:", err);
        res.status(500).json({ error: "Internal authentication error.", details: err.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Garage Backend Server running on http://localhost:${port}`);
});
