import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./db.js";
import redisClient, { getCache, setCache, deleteCache, deleteCachePattern } from "./redis.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ==========================================
// 1. HEALTH CHECK & DATABASE / REDIS STATUS
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
// 2. VEHICLE INTAKE & WORK ORDER GENERATION
// ==========================================
app.post("/api/intake", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const {
            vin,
            make,
            model,
            year,
            licensePlate,
            fullName,
            phone,
            email,
            selectedOwnerId,
            notes,
        } = req.body;

        if (!vin || !make || !model || !year || !licensePlate) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: "All vehicle details (VIN, Make, Model, Year, License Plate) are required.",
            });
        }

        const sanitizedVin = vin.trim().toUpperCase();
        const parsedYear = parseInt(year, 10);
        if (isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: "Invalid vehicle year. Must be between 1900 and 2100.",
            });
        }

        // STEP 1: RESOLVE CAR OWNER
        let ownerId = selectedOwnerId || null;

        if (ownerId) {
            const checkOwner = await client.query(
                "SELECT owner_id, full_name, phone_number, email_address FROM car_owners WHERE owner_id = $1;",
                [ownerId]
            );
            if (checkOwner.rows.length === 0) {
                ownerId = null;
            }
        }

        if (!ownerId) {
            const cleanPhone = (phone || "").trim();
            const cleanEmail = (email || "").trim().toLowerCase();
            const cleanName = (fullName || "").trim();

            if (!cleanName || !cleanPhone) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: "Owner Full Name and Phone Number are required.",
                });
            }

            const findOwnerQuery = `
                SELECT owner_id, full_name, phone_number, email_address 
                FROM car_owners 
                WHERE phone_number = $1 OR (email_address IS NOT NULL AND LOWER(email_address) = $2)
                LIMIT 1;
            `;
            const existingOwner = await client.query(findOwnerQuery, [cleanPhone, cleanEmail || null]);

            if (existingOwner.rows.length > 0) {
                ownerId = existingOwner.rows[0].owner_id;
            } else {
                const insertOwnerQuery = `
                    INSERT INTO car_owners (
                        full_name,
                        phone_number,
                        email_address,
                        billing_address,
                        is_vip
                    )
                    VALUES ($1, $2, $3, NULL, FALSE)
                    RETURNING owner_id, full_name, phone_number, email_address;
                `;
                const newOwnerResult = await client.query(insertOwnerQuery, [
                    cleanName,
                    cleanPhone,
                    cleanEmail || null,
                ]);
                ownerId = newOwnerResult.rows[0].owner_id;
            }
        }

        // STEP 2: RESOLVE VEHICLE
        let vehicleId = null;
        const checkVehicle = await client.query(
            "SELECT vehicle_id, owner_id, vin, make, model, year, license_plate FROM vehicles WHERE UPPER(vin) = $1;",
            [sanitizedVin]
        );

        if (checkVehicle.rows.length > 0) {
            vehicleId = checkVehicle.rows[0].vehicle_id;
            await client.query(
                `UPDATE vehicles 
                 SET owner_id = $1, make = $2, model = $3, year = $4, license_plate = $5 
                 WHERE vehicle_id = $6;`,
                [ownerId, make.trim(), model.trim(), parsedYear, licensePlate.trim().toUpperCase(), vehicleId]
            );
        } else {
            const insertVehicleQuery = `
                INSERT INTO vehicles (
                    owner_id,
                    vin,
                    make,
                    model,
                    year,
                    license_plate
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING vehicle_id, owner_id, vin, make, model, year, license_plate;
            `;
            const newVehicleResult = await client.query(insertVehicleQuery, [
                ownerId,
                sanitizedVin,
                make.trim(),
                model.trim(),
                parsedYear,
                licensePlate.trim().toUpperCase(),
            ]);
            vehicleId = newVehicleResult.rows[0].vehicle_id;
        }

        // STEP 3: CREATE WORK ORDER
        const insertWorkOrderQuery = `
            INSERT INTO work_order_data (
                vehicle_id,
                assigned_staff_id,
                service_advisor_id,
                status,
                bay_assigned,
                scheduled_start,
                scheduled_end,
                initial_observations,
                estimated_cost,
                total_cost
            )
            VALUES (
                $1,
                NULL,
                NULL,
                'received',
                NULL,
                NULL,
                NULL,
                $2,
                0.00,
                0.00
            )
            RETURNING 
                work_order_id,
                vehicle_id,
                status,
                bay_assigned,
                scheduled_start,
                scheduled_end,
                initial_observations,
                estimated_cost,
                total_cost,
                created_at,
                updated_at;
        `;

        const workOrderResult = await client.query(insertWorkOrderQuery, [
            vehicleId,
            notes ? notes.trim() : null,
        ]);
        const createdWorkOrder = workOrderResult.rows[0];

        // STEP 4: AUDIT LOG
        const auditDescription = `Vehicle intake completed for VIN ${sanitizedVin}. Generated Work Order ${createdWorkOrder.work_order_id}.`;
        const auditPayload = JSON.stringify({
            event: "INTAKE_CREATED",
            work_order_id: createdWorkOrder.work_order_id,
            vehicle_id: vehicleId,
            owner_id: ownerId,
            vin: sanitizedVin,
            status: "received",
        });

        await client.query(
            `INSERT INTO audit_logs (work_order_id, event_type, description, payload_json)
             VALUES ($1, 'STATUS_CHANGE', $2, $3);`,
            [createdWorkOrder.work_order_id, auditDescription, auditPayload]
        );

        await client.query("COMMIT");

        // Fetch full resolved details
        const fullDetailsQuery = `
            SELECT 
                w.*,
                v.vin, v.make, v.model, v.year, v.license_plate,
                o.owner_id, o.full_name as owner_name, o.phone_number as owner_phone, o.email_address as owner_email
            FROM work_order_data w
            JOIN vehicles v ON w.vehicle_id = v.vehicle_id
            JOIN car_owners o ON v.owner_id = o.owner_id
            WHERE w.work_order_id = $1;
        `;
        const fullDetails = await pool.query(fullDetailsQuery, [createdWorkOrder.work_order_id]);
        const responseData = fullDetails.rows[0] || createdWorkOrder;

        // REDIS CACHE INVALIDATION & UPDATE
        await deleteCachePattern("garage:cache:owners:*");
        await deleteCachePattern("garage:cache:users:*");
        await setCache(`garage:cache:vehicle:vin:${sanitizedVin}`, responseData, 3600);
        await setCache(`garage:cache:workorder:${createdWorkOrder.work_order_id}`, responseData, 3600);

        return res.status(201).json({
            success: true,
            message: `Vehicle intake processed successfully. Work Order '${createdWorkOrder.work_order_id}' generated.`,
            data: responseData,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error during vehicle intake transaction:", err);
        return res.status(500).json({
            error: "Failed to process vehicle intake and create work order in database.",
            details: err.message,
        });
    } finally {
        client.release();
    }
});

// ==========================================
// 3. OWNER SEARCH (REDIS CACHED)
// ==========================================
app.get("/api/owners/search", async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || query.trim().length < 2) {
            return res.json({ success: true, source: "none", data: [] });
        }

        const normalizedQuery = query.trim().toLowerCase();
        const cacheKey = `garage:cache:owners:search:${normalizedQuery}`;

        // 1. Check Redis Cache
        const cachedResults = await getCache(cacheKey);
        if (cachedResults) {
            return res.json({ success: true, source: "redis", data: cachedResults });
        }

        // 2. Query PostgreSQL
        const searchTerm = `%${normalizedQuery}%`;
        const result = await pool.query(
            `SELECT owner_id, full_name, phone_number, email_address, billing_address, is_vip
             FROM car_owners
             WHERE full_name ILIKE $1 
                OR phone_number ILIKE $1 
                OR email_address ILIKE $1
                OR owner_id ILIKE $1
             ORDER BY created_at DESC
             LIMIT 8;`,
            [searchTerm]
        );

        // 3. Store in Redis (TTL: 5 minutes)
        await setCache(cacheKey, result.rows, 300);

        res.json({ success: true, source: "postgres", data: result.rows });
    } catch (err) {
        console.error("Error searching owners:", err);
        res.status(500).json({ error: "Failed to search owners", details: err.message });
    }
});

// ==========================================
// 4. VEHICLE LOOKUP BY VIN (REDIS CACHED)
// ==========================================
app.get("/api/vehicles/vin/:vin", async (req, res) => {
    try {
        const { vin } = req.params;
        const sanitizedVin = (vin || "").trim().toUpperCase();
        const cacheKey = `garage:cache:vehicle:vin:${sanitizedVin}`;

        // 1. Check Redis Cache
        const cachedVehicle = await getCache(cacheKey);
        if (cachedVehicle) {
            return res.json({ found: true, source: "redis", data: cachedVehicle });
        }

        // 2. Query PostgreSQL
        const query = `
            SELECT 
                v.vehicle_id, v.owner_id, v.vin, v.make, v.model, v.year, v.license_plate,
                o.full_name as owner_name, o.phone_number as owner_phone, o.email_address as owner_email
            FROM vehicles v
            LEFT JOIN car_owners o ON v.owner_id = o.owner_id
            WHERE UPPER(v.vin) = $1
            LIMIT 1;
        `;
        const result = await pool.query(query, [sanitizedVin]);

        if (result.rows.length === 0) {
            return res.status(404).json({ found: false, message: "Vehicle not found" });
        }

        // 3. Store in Redis (TTL: 1 hour)
        await setCache(cacheKey, result.rows[0], 3600);

        res.json({ found: true, source: "postgres", data: result.rows[0] });
    } catch (err) {
        console.error("Error looking up vehicle by VIN:", err);
        res.status(500).json({ error: "Failed to lookup vehicle", details: err.message });
    }
});

// ==========================================
// 5. GET ALL USERS (REDIS CACHED)
// ==========================================
app.get("/api/users", async (req, res) => {
    const cacheKey = "garage:cache:users:all";

    try {
        // 1. Check Redis Cache First
        const cachedUsers = await getCache(cacheKey);
        if (cachedUsers) {
            return res.json({ success: true, source: "redis", data: cachedUsers });
        }

        // 2. Query PostgreSQL on Cache Miss
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

        // 3. Save to Redis Cache (TTL: 10 minutes)
        await setCache(cacheKey, formattedUsers, 600);

        res.json({ success: true, source: "postgres", data: formattedUsers });
    } catch (err) {
        console.error("Error fetching users from database:", err);
        res.status(500).json({ error: "Failed to fetch users from database", details: err.message });
    }
});

// ==========================================
// 6. CREATE USER (ADMIN ACCESS & CACHE INVALIDATION)
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
            staff_name,
            staff_role,
            staff_phone,
            staff_address,
            staff_hourly_rate,
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

        // 1. ADMIN ROLE
        if (role === "admin") {
            if (!targetEmail) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "Email is required for admin account." });
            }
        }

        // 2. STAFF ROLE
        else if (role === "staff") {
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
        }

        // 3. CAR OWNER ROLE
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

        // Check users email uniqueness
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

        // REDIS CACHE INVALIDATION
        await deleteCachePattern("garage:cache:users:*");
        await deleteCachePattern("garage:cache:owners:*");

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
// 7. TOGGLE USER STATUS (WITH CACHE INVALIDATION)
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

        // REDIS CACHE INVALIDATION
        await deleteCachePattern("garage:cache:users:*");

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
// 8. DELETE USER (WITH CACHE INVALIDATION)
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

        // REDIS CACHE INVALIDATION
        await deleteCachePattern("garage:cache:users:*");
        await deleteCachePattern("garage:cache:owners:*");

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
// 9. AUTH LOGIN
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

        // Invalidate user cache to reflect new last_login
        await deleteCachePattern("garage:cache:users:*");

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
