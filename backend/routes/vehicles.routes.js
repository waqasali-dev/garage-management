import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCachePattern } from "../redis.js";

const router = express.Router();

// GET /api/vehicles or /api/owner/vehicles - List all vehicles with owner, active work order, and service metrics
router.get(["/", "/vehicles"], async (req, res) => {
    const { owner_id, search } = req.query;
    const cacheKey = `garage:cache:owner:vehicles:${owner_id || "all"}:${(search || "").trim().toLowerCase()}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        let whereClause = "1=1";
        const queryParams = [];

        if (owner_id && owner_id.trim()) {
            queryParams.push(owner_id.trim());
            whereClause += ` AND v.owner_id = $${queryParams.length}`;
        }

        if (search && search.trim()) {
            queryParams.push(`%${search.trim()}%`);
            const sIdx = queryParams.length;
            whereClause += ` AND (
                v.vin ILIKE $${sIdx} OR
                v.make ILIKE $${sIdx} OR
                v.model ILIKE $${sIdx} OR
                v.license_plate ILIKE $${sIdx} OR
                o.full_name ILIKE $${sIdx}
            )`;
        }

        const query = `
            SELECT 
                v.vehicle_id,
                v.vin,
                v.make,
                v.model,
                v.year,
                v.license_plate,
                v.created_at,
                o.owner_id,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone,
                o.email_address AS owner_email,
                o.is_vip,
                (
                    SELECT w.work_order_id 
                    FROM work_order_data w 
                    WHERE w.vehicle_id = v.vehicle_id 
                      AND w.status IN ('received', 'diagnosed', 'in_progress', 'ready')
                    ORDER BY w.created_at DESC 
                    LIMIT 1
                ) AS active_work_order_id,
                (
                    SELECT w.status 
                    FROM work_order_data w 
                    WHERE w.vehicle_id = v.vehicle_id 
                      AND w.status IN ('received', 'diagnosed', 'in_progress', 'ready')
                    ORDER BY w.created_at DESC 
                    LIMIT 1
                ) AS active_status,
                (
                    SELECT COUNT(*) 
                    FROM work_order_data w 
                    WHERE w.vehicle_id = v.vehicle_id
                ) AS total_services_count,
                (
                    SELECT COALESCE(SUM(
                        CASE 
                            WHEN i.subtotal IS NOT NULL THEN (i.subtotal + COALESCE(i.tax_amount, 0))
                            ELSE (COALESCE(w.total_cost, 0) * 1.05)
                        END
                    ), 0.00) 
                    FROM work_order_data w 
                    LEFT JOIN invoice_data i ON w.work_order_id = i.work_order_id
                    WHERE w.vehicle_id = v.vehicle_id
                ) AS total_spent,
                (
                    SELECT TO_CHAR(MAX(w.created_at), 'YYYY-MM-DD') 
                    FROM work_order_data w 
                    WHERE w.vehicle_id = v.vehicle_id
                ) AS last_service_date
            FROM vehicles v
            JOIN car_owners o ON v.owner_id = o.owner_id
            WHERE ${whereClause}
            ORDER BY v.created_at DESC, v.make ASC;
        `;
        const result = await pool.query(query, queryParams);

        const formatted = result.rows.map((row) => ({
            ...row,
            total_services_count: parseInt(row.total_services_count, 10) || 0,
            total_spent: parseFloat(row.total_spent) || 0.0,
            has_active_order: Boolean(row.active_work_order_id),
        }));

        await setCache(cacheKey, formatted, 180);

        res.json({ success: true, source: "postgres", count: formatted.length, data: formatted });
    } catch (err) {
        console.error("Error fetching owner vehicles:", err);
        res.status(500).json({ error: "Failed to fetch vehicles", details: err.message });
    }
});
// GET /api/vehicles/vin/:vin - Fast Lookup existing vehicle & owner by VIN for intake auto-fill
router.get("/vin/:vin", async (req, res) => {
    const { vin } = req.params;
    const cleanVin = (vin || "").trim().toUpperCase();

    if (!cleanVin) {
        return res.status(400).json({ error: "VIN parameter is required." });
    }

    const cacheKey = `garage:cache:vehicle:vin:lookup:${cleanVin}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", ...cached });
        }

        const query = `
            SELECT 
                v.vehicle_id,
                v.vin,
                v.make,
                v.model,
                v.year,
                v.license_plate,
                v.created_at,
                o.owner_id,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone,
                o.email_address AS owner_email,
                o.billing_address AS owner_address,
                o.is_vip
            FROM vehicles v
            JOIN car_owners o ON v.owner_id = o.owner_id
            WHERE UPPER(TRIM(v.vin)) = $1
            LIMIT 1;
        `;
        const result = await pool.query(query, [cleanVin]);

        if (result.rows.length === 0) {
            return res.json({ success: true, found: false, data: null });
        }

        const payload = { found: true, data: result.rows[0] };
        await setCache(cacheKey, payload, 600);
        return res.json({ success: true, source: "postgres", ...payload });
    } catch (err) {
        console.error("Error looking up vehicle by VIN:", err);
        return res.status(500).json({ error: "Database error during VIN lookup", details: err.message });
    }
});

// GET /api/vehicles/vin/:vin/history - Complete service history matched with VIN number
router.get("/vin/:vin/history", async (req, res) => {
    const { vin } = req.params;
    const cleanVin = vin.trim().toUpperCase();
    const cacheKey = `garage:cache:vehicle:vin:history:${cleanVin}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        // 1. Fetch Vehicle & Owner Information
        const vehicleQuery = `
            SELECT 
                v.*,
                o.owner_id,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone,
                o.email_address AS owner_email,
                o.billing_address AS owner_address,
                o.is_vip
            FROM vehicles v
            JOIN car_owners o ON v.owner_id = o.owner_id
            WHERE UPPER(TRIM(v.vin)) = $1;
        `;
        const vehicleResult = await pool.query(vehicleQuery, [cleanVin]);

        if (vehicleResult.rows.length === 0) {
            return res.status(404).json({ error: `Vehicle with VIN ${cleanVin} not found in precision database.` });
        }

        const vehicle = vehicleResult.rows[0];

        // 2. Fetch all Work Orders for this vehicle with invoice & tax resolution
        const workOrdersQuery = `
            SELECT 
                w.*,
                s.full_name AS assigned_staff_name,
                s.role AS assigned_staff_role,
                sa.full_name AS service_advisor_name,
                i.invoice_id,
                i.subtotal AS invoice_subtotal,
                i.tax_amount AS invoice_tax,
                i.status AS invoice_status,
                CASE 
                    WHEN i.subtotal IS NOT NULL THEN (i.subtotal + COALESCE(i.tax_amount, 0))
                    ELSE (COALESCE(w.total_cost, 0) * 1.05)
                END AS total_with_tax
            FROM work_order_data w
            LEFT JOIN staff_data s ON w.assigned_staff_id = s.staff_id
            LEFT JOIN staff_data sa ON w.service_advisor_id = sa.staff_id
            LEFT JOIN invoice_data i ON w.work_order_id = i.work_order_id
            WHERE w.vehicle_id = $1
            ORDER BY w.created_at DESC;
        `;
        const workOrdersResult = await pool.query(workOrdersQuery, [vehicle.vehicle_id]);
        const workOrders = workOrdersResult.rows;
        const workOrderIds = workOrders.map((w) => w.work_order_id);

        // 3. Batch fetch all Line Items, Media, and Tasks in 3 single queries (eliminates N+1)
        let itemsByOrder = {};
        let mediaByOrder = {};
        let tasksByOrder = {};

        if (workOrderIds.length > 0) {
            const [batchItemsRes, batchMediaRes, batchTasksRes] = await Promise.all([
                pool.query(
                    `SELECT wi.*, i.part_name, i.sku, i.category AS part_category 
                     FROM work_order_items wi 
                     LEFT JOIN inventory_data i ON wi.part_id = i.part_id 
                     WHERE wi.work_order_id = ANY($1) 
                     ORDER BY wi.item_id ASC;`,
                    [workOrderIds]
                ),
                pool.query(
                    `SELECT * FROM work_order_media 
                     WHERE work_order_id = ANY($1) 
                     ORDER BY uploaded_at DESC;`,
                    [workOrderIds]
                ),
                pool.query(
                    `SELECT t.*, s.full_name AS assigned_staff_name 
                     FROM scheduled_tasks t 
                     LEFT JOIN staff_data s ON t.assigned_staff_id = s.staff_id 
                     WHERE t.work_order_id = ANY($1) OR t.vehicle_id = $2 
                     ORDER BY t.scheduled_date DESC;`,
                    [workOrderIds, vehicle.vehicle_id]
                ).catch(() => ({ rows: [] }))
            ]);

            for (const item of batchItemsRes.rows) {
                if (!itemsByOrder[item.work_order_id]) itemsByOrder[item.work_order_id] = [];
                itemsByOrder[item.work_order_id].push(item);
            }

            for (const media of batchMediaRes.rows) {
                if (!mediaByOrder[media.work_order_id]) mediaByOrder[media.work_order_id] = [];
                mediaByOrder[media.work_order_id].push(media);
            }

            for (const task of batchTasksRes.rows) {
                const targetKey = task.work_order_id || 'vehicle_level';
                if (!tasksByOrder[targetKey]) tasksByOrder[targetKey] = [];
                tasksByOrder[targetKey].push(task);
            }
        }

        // 4. Assemble enhanced work orders in-memory
        const enhancedWorkOrders = workOrders.map((wo) => {
            const items = itemsByOrder[wo.work_order_id] || [];
            const media = mediaByOrder[wo.work_order_id] || [];
            const tasks = tasksByOrder[wo.work_order_id] || [];

            const partsTotal = items
                .filter((i) => i.item_type === "part")
                .reduce((sum, i) => sum + (parseFloat(i.total_price) || 0), 0);

            const laborTotal = items
                .filter((i) => i.item_type === "labor")
                .reduce((sum, i) => sum + (parseFloat(i.total_price) || 0), 0);

            return {
                ...wo,
                total_with_tax: parseFloat(wo.total_with_tax) || (parseFloat(wo.total_cost || 0) * 1.05),
                items,
                media,
                scheduled_tasks: tasks,
                partsTotal,
                laborTotal,
            };
        });

        // 5. Compute High-Level Metrics
        const totalSpent = enhancedWorkOrders.reduce(
            (sum, wo) => sum + (parseFloat(wo.total_with_tax) || (parseFloat(wo.total_cost || 0) * 1.05)),
            0
        );
        const totalPartsReplaced = enhancedWorkOrders.reduce(
            (sum, wo) => sum + wo.items.filter((i) => i.item_type === "part").length,
            0
        );
        const activeOrder = enhancedWorkOrders.find((wo) =>
            ["received", "diagnosed", "in_progress", "ready"].includes(wo.status)
        );

        const historyPayload = {
            vehicle,
            totalVisits: enhancedWorkOrders.length,
            totalSpent,
            totalPartsReplaced,
            hasActiveOrder: Boolean(activeOrder),
            activeStatus: activeOrder ? activeOrder.status : "completed",
            lastServiceDate: enhancedWorkOrders[0]?.created_at || vehicle.created_at,
            workOrders: enhancedWorkOrders,
        };

        await setCache(cacheKey, historyPayload, 300);

        res.json({ success: true, source: "postgres", data: historyPayload });
    } catch (err) {
        console.error("Error fetching VIN service history:", err);
        res.status(500).json({ error: "Failed to fetch vehicle history", details: err.message });
    }
});

export default router;
