import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCache, deleteCachePattern } from "../redis.js";

const router = express.Router();

// GET /api/owners - Complete Car Owners Directory with metrics
router.get("/", async (req, res) => {
    const cacheKey = "garage:cache:owners:all";

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const query = `
            SELECT 
                o.owner_id,
                o.full_name,
                o.phone_number,
                o.email_address,
                o.billing_address,
                o.is_vip,
                o.created_at,
                u.user_id,
                u.is_active AS account_active,
                (SELECT COUNT(*) FROM vehicles v WHERE v.owner_id = o.owner_id) AS vehicles_count,
                (
                    SELECT v.make || ' ' || v.model 
                    FROM vehicles v 
                    WHERE v.owner_id = o.owner_id 
                    ORDER BY v.created_at DESC 
                    LIMIT 1
                ) AS primary_vehicle,
                (
                    SELECT v.vin 
                    FROM vehicles v 
                    WHERE v.owner_id = o.owner_id 
                    ORDER BY v.created_at DESC 
                    LIMIT 1
                ) AS primary_vin,
                (
                    SELECT COUNT(*) 
                    FROM work_order_data w 
                    JOIN vehicles v ON w.vehicle_id = v.vehicle_id 
                    WHERE v.owner_id = o.owner_id 
                      AND w.status IN ('in_progress', 'received', 'diagnosed')
                ) AS active_orders_count,
                (
                    SELECT COALESCE(SUM(w.total_cost), 0.00) 
                    FROM work_order_data w 
                    JOIN vehicles v ON w.vehicle_id = v.vehicle_id 
                    WHERE v.owner_id = o.owner_id
                ) AS lifetime_spent
            FROM car_owners o
            LEFT JOIN users u ON o.owner_id = u.owner_id
            ORDER BY o.created_at DESC, o.full_name ASC;
        `;
        const result = await pool.query(query);

        const formattedOwners = result.rows.map((owner) => {
            const parts = (owner.full_name || "").trim().split(" ");
            const initials = parts.length === 1
                ? parts[0].substring(0, 2).toUpperCase()
                : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

            const vehiclesCount = parseInt(owner.vehicles_count, 10) || 0;
            const activeOrders = parseInt(owner.active_orders_count, 10) || 0;
            const lifetimeSpentNum = parseFloat(owner.lifetime_spent) || 0.0;

            return {
                id: owner.owner_id,
                owner_id: owner.owner_id,
                name: owner.full_name,
                phone: owner.phone_number,
                email: owner.email_address,
                address: owner.billing_address,
                is_vip: owner.is_vip,
                isActive: activeOrders > 0,
                statusType: activeOrders > 0 ? "active" : "history",
                lastService: activeOrders > 0 ? "In Shop (Active)" : "Prior Service",
                initials,
                vehicle: owner.primary_vehicle || "No Vehicle Registered",
                vin: owner.primary_vin ? `VIN: ${owner.primary_vin}` : "",
                vehicleType: "directions_car",
                additionalVehicles: Math.max(vehiclesCount - 1, 0),
                vehicles_count: vehiclesCount,
                active_orders_count: activeOrders,
                lifetime_spent: `$${lifetimeSpentNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                lifetime_spent_raw: lifetimeSpentNum,
                has_user_account: owner.user_id !== null,
                account_active: owner.account_active,
                created_at: owner.created_at,
            };
        });

        await setCache(cacheKey, formattedOwners, 300);

        res.json({ success: true, source: "postgres", data: formattedOwners });
    } catch (err) {
        console.error("Error fetching owners directory:", err);
        res.status(500).json({ error: "Failed to fetch owners from database", details: err.message });
    }
});

// GET /api/owners/unlinked - Fetch customers from car_owners without a user portal account
router.get("/unlinked", async (req, res) => {
    try {
        const query = `
            SELECT 
                o.owner_id,
                o.full_name,
                o.phone_number,
                o.email_address,
                o.billing_address,
                o.is_vip,
                o.created_at,
                (SELECT COUNT(*) FROM vehicles v WHERE v.owner_id = o.owner_id) AS vehicles_count,
                (
                    SELECT v.make || ' ' || v.model || ' (' || v.year || ')'
                    FROM vehicles v 
                    WHERE v.owner_id = o.owner_id 
                    ORDER BY v.created_at DESC 
                    LIMIT 1
                ) AS primary_vehicle
            FROM car_owners o
            LEFT JOIN users u ON o.owner_id = u.owner_id
            WHERE u.user_id IS NULL
            ORDER BY o.created_at DESC, o.full_name ASC;
        `;
        const result = await pool.query(query);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows,
        });
    } catch (err) {
        console.error("Error fetching unlinked owners:", err);
        res.status(500).json({ error: "Failed to fetch unlinked owners", details: err.message });
    }
});

// GET /api/owners/:id - Detailed profile with vehicles and work orders
router.get("/:id", async (req, res) => {
    const { id } = req.params;
    const cacheKey = `garage:cache:owner:details:${id}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const ownerQuery = `
            SELECT 
                o.*,
                u.user_id,
                u.is_active AS account_active,
                u.last_login
            FROM car_owners o
            LEFT JOIN users u ON o.owner_id = u.owner_id
            WHERE o.owner_id = $1;
        `;
        const ownerResult = await pool.query(ownerQuery, [id]);

        if (ownerResult.rows.length === 0) {
            return res.status(404).json({ error: "Car owner not found" });
        }

        const owner = ownerResult.rows[0];

        // Fetch vehicles
        const vehiclesQuery = `
            SELECT * FROM vehicles 
            WHERE owner_id = $1 
            ORDER BY created_at DESC;
        `;
        const vehiclesResult = await pool.query(vehiclesQuery, [id]);

        // Fetch work orders
        const workOrdersQuery = `
            SELECT 
                w.*,
                v.make, v.model, v.year, v.license_plate, v.vin
            FROM work_order_data w
            JOIN vehicles v ON w.vehicle_id = v.vehicle_id
            WHERE v.owner_id = $1
            ORDER BY w.created_at DESC;
        `;
        const workOrdersResult = await pool.query(workOrdersQuery, [id]);

        // Calculate lifetime value
        const lifetimeValue = workOrdersResult.rows.reduce(
            (sum, wo) => sum + (parseFloat(wo.total_cost) || 0),
            0
        );

        const parts = (owner.full_name || "").trim().split(" ");
        const initials = parts.length === 1
            ? parts[0].substring(0, 2).toUpperCase()
            : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

        const fullOwnerData = {
            ...owner,
            initials,
            tier: owner.is_vip ? "VIP Client" : "Standard Client",
            joinedDate: owner.created_at ? new Date(owner.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "--",
            lifetimeValue: `$${lifetimeValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            vehicles: vehiclesResult.rows,
            workOrders: workOrdersResult.rows,
        };

        await setCache(cacheKey, fullOwnerData, 300);

        res.json({ success: true, source: "postgres", data: fullOwnerData });
    } catch (err) {
        console.error("Error fetching single owner details:", err);
        res.status(500).json({ error: "Failed to fetch owner details", details: err.message });
    }
});

// PATCH /api/owners/:id - Update owner profile details
router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const { full_name, phone_number, email_address, billing_address, is_vip } = req.body;

    try {
        const query = `
            UPDATE car_owners
            SET 
                full_name = COALESCE($1, full_name),
                phone_number = COALESCE($2, phone_number),
                email_address = COALESCE($3, email_address),
                billing_address = COALESCE($4, billing_address),
                is_vip = COALESCE($5, is_vip)
            WHERE owner_id = $6
            RETURNING *;
        `;
        const result = await pool.query(query, [
            full_name ? full_name.trim() : null,
            phone_number ? phone_number.trim() : null,
            email_address ? email_address.trim().toLowerCase() : null,
            billing_address !== undefined ? billing_address : null,
            is_vip !== undefined ? Boolean(is_vip) : null,
            id,
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Car owner not found" });
        }

        // Invalidate owner caches
        await deleteCache(`garage:cache:owner:details:${id}`);
        await deleteCachePattern("garage:cache:owners:*");

        res.json({
            success: true,
            message: "Owner profile updated successfully",
            data: result.rows[0],
        });
    } catch (err) {
        console.error("Error updating owner profile:", err);
        res.status(500).json({ error: "Failed to update owner profile", details: err.message });
    }
});

export default router;
