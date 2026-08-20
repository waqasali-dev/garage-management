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
// 2. INVENTORY MANAGEMENT (CRUD & KPIS)
// ==========================================

// GET /api/inventory - Fetch all inventory parts with computed statuses and KPI metrics
app.get("/api/inventory", async (req, res) => {
    const cacheKey = "garage:cache:inventory:all";

    try {
        // 1. Check Redis Cache
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", ...cached });
        }

        // 2. Fetch all parts from inventory_data
        const itemsQuery = `
            SELECT 
                part_id,
                sku,
                part_name AS name,
                category,
                stock_quantity AS stock,
                reorder_threshold,
                unit_cost,
                selling_price,
                created_at
            FROM inventory_data
            ORDER BY created_at DESC, part_name ASC;
        `;
        const itemsResult = await pool.query(itemsQuery);

        // 3. Compute statuses and formatted currency
        const formattedItems = itemsResult.rows.map((item) => {
            const stock = parseInt(item.stock, 10) || 0;
            const threshold = parseInt(item.reorder_threshold, 10) || 5;
            const unitCostNum = parseFloat(item.unit_cost) || 0;
            const sellingPriceNum = parseFloat(item.selling_price) || 0;

            let status = "Optimal";
            let statusType = "success";

            if (stock <= 0) {
                status = "Out of Stock";
                statusType = "error";
            } else if (stock <= threshold) {
                status = "Low Stock";
                statusType = "warning";
            }

            return {
                part_id: item.part_id,
                sku: item.sku,
                name: item.name,
                part_name: item.name,
                category: item.category,
                stock: stock,
                stock_quantity: stock,
                reorder_threshold: threshold,
                unit_cost: unitCostNum,
                selling_price: sellingPriceNum,
                unitCost: `$${unitCostNum.toFixed(2)}`,
                sellingPrice: `$${sellingPriceNum.toFixed(2)}`,
                status: status,
                statusType: statusType,
                created_at: item.created_at,
            };
        });

        // 4. Compute KPI Metrics
        let totalVal = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let totalQuantity = 0;
        const categorySet = new Set();

        formattedItems.forEach((it) => {
            totalVal += it.stock * it.unit_cost;
            totalQuantity += it.stock;
            categorySet.add(it.category);
            if (it.statusType === "warning") lowStockCount++;
            if (it.statusType === "error") outOfStockCount++;
        });

        const kpiStats = {
            totalValue: `$${totalVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            totalValueRaw: totalVal,
            lowStockAlerts: lowStockCount + outOfStockCount,
            lowStockCount,
            outOfStockCount,
            totalItems: totalQuantity,
            totalSKUs: formattedItems.length,
            categoriesCount: categorySet.size,
        };

        const responsePayload = {
            data: formattedItems,
            kpi: kpiStats,
        };

        // 5. Save to Redis Cache (TTL: 5 minutes)
        await setCache(cacheKey, responsePayload, 300);

        res.json({ success: true, source: "postgres", ...responsePayload });
    } catch (err) {
        console.error("Error fetching inventory:", err);
        res.status(500).json({ error: "Failed to fetch inventory from database", details: err.message });
    }
});

// GET /api/inventory/categories - List unique categories
app.get("/api/inventory/categories", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT DISTINCT category FROM inventory_data WHERE category IS NOT NULL ORDER BY category ASC;"
        );
        const categories = result.rows.map((r) => r.category);
        res.json({ success: true, data: categories });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch categories", details: err.message });
    }
});

// POST /api/inventory - Add a new part to inventory_data
app.post("/api/inventory", async (req, res) => {
    const {
        sku,
        part_name,
        name,
        category,
        stock_quantity = 0,
        stock = 0,
        reorder_threshold = 5,
        unit_cost = 0.0,
        selling_price = 0.0,
    } = req.body;

    const targetName = (part_name || name || "").trim();
    const targetSku = (sku || "").trim().toUpperCase();
    const targetCategory = (category || "General").trim();
    const initialStock = parseInt(stock_quantity || stock || 0, 10);
    const threshold = parseInt(reorder_threshold || 5, 10);
    const unitCost = parseFloat(unit_cost) || 0.0;
    const sellingPrice = parseFloat(selling_price) || 0.0;

    if (!targetSku || !targetName) {
        return res.status(400).json({ error: "SKU and Part Name are required fields." });
    }

    if (initialStock < 0) {
        return res.status(400).json({ error: "Stock quantity cannot be negative." });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Check SKU uniqueness
        const checkSku = await client.query(
            "SELECT part_id FROM inventory_data WHERE UPPER(sku) = $1;",
            [targetSku]
        );
        if (checkSku.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: `Part with SKU '${targetSku}' already exists in inventory.` });
        }

        const insertQuery = `
            INSERT INTO inventory_data (
                sku,
                part_name,
                category,
                stock_quantity,
                reorder_threshold,
                unit_cost,
                selling_price
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const result = await client.query(insertQuery, [
            targetSku,
            targetName,
            targetCategory,
            initialStock,
            threshold,
            unitCost,
            sellingPrice,
        ]);

        const newPart = result.rows[0];

        // Audit Log
        await client.query(
            `INSERT INTO audit_logs (event_type, description, payload_json)
             VALUES ('PART_ALLOCATED', $1, $2);`,
            [
                `New part '${targetName}' (${targetSku}) added to inventory`,
                JSON.stringify({ part_id: newPart.part_id, sku: targetSku, stock: initialStock }),
            ]
        );

        await client.query("COMMIT");

        // Invalidate Redis Caches
        await deleteCachePattern("garage:cache:inventory:*");

        res.status(201).json({
            success: true,
            message: `Part '${targetName}' (${targetSku}) added successfully to inventory.`,
            data: newPart,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error adding inventory part:", err);
        res.status(500).json({ error: "Database error while adding part", details: err.message });
    } finally {
        client.release();
    }
});

// PATCH /api/inventory/:id - Update part details
app.patch("/api/inventory/:id", async (req, res) => {
    const { id } = req.params;
    const partId = parseInt(id, 10);

    if (isNaN(partId)) {
        return res.status(400).json({ error: "Invalid part ID" });
    }

    const {
        sku,
        part_name,
        name,
        category,
        stock_quantity,
        stock,
        reorder_threshold,
        unit_cost,
        selling_price,
    } = req.body;

    const targetName = part_name || name;
    const targetStock = stock_quantity !== undefined ? stock_quantity : stock;

    try {
        const query = `
            UPDATE inventory_data
            SET
                sku = COALESCE($1, sku),
                part_name = COALESCE($2, part_name),
                category = COALESCE($3, category),
                stock_quantity = COALESCE($4, stock_quantity),
                reorder_threshold = COALESCE($5, reorder_threshold),
                unit_cost = COALESCE($6, unit_cost),
                selling_price = COALESCE($7, selling_price)
            WHERE part_id = $8
            RETURNING *;
        `;

        const result = await pool.query(query, [
            sku ? sku.trim().toUpperCase() : null,
            targetName ? targetName.trim() : null,
            category ? category.trim() : null,
            targetStock !== undefined ? parseInt(targetStock, 10) : null,
            reorder_threshold !== undefined ? parseInt(reorder_threshold, 10) : null,
            unit_cost !== undefined ? parseFloat(unit_cost) : null,
            selling_price !== undefined ? parseFloat(selling_price) : null,
            partId,
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Part not found in inventory" });
        }

        await deleteCachePattern("garage:cache:inventory:*");

        res.json({
            success: true,
            message: "Part details updated successfully",
            data: result.rows[0],
        });
    } catch (err) {
        console.error("Error updating inventory part:", err);
        res.status(500).json({ error: "Failed to update part", details: err.message });
    }
});

// PATCH /api/inventory/:id/restock - Restock / add stock units to a part
app.patch("/api/inventory/:id/restock", async (req, res) => {
    const { id } = req.params;
    const partId = parseInt(id, 10);
    const { added_quantity, unit_cost } = req.body;

    if (isNaN(partId)) {
        return res.status(400).json({ error: "Invalid part ID" });
    }

    const qtyToAdd = parseInt(added_quantity, 10);
    if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
        return res.status(400).json({ error: "Added quantity must be a positive integer greater than 0." });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const updateQuery = `
            UPDATE inventory_data
            SET 
                stock_quantity = stock_quantity + $1,
                unit_cost = COALESCE($2, unit_cost)
            WHERE part_id = $3
            RETURNING *;
        `;
        const updatedCost = unit_cost !== undefined && unit_cost !== "" ? parseFloat(unit_cost) : null;
        const result = await client.query(updateQuery, [qtyToAdd, updatedCost, partId]);

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Part not found in inventory" });
        }

        const updatedPart = result.rows[0];

        // Audit Log
        await client.query(
            `INSERT INTO audit_logs (event_type, description, payload_json)
             VALUES ('PART_ALLOCATED', $1, $2);`,
            [
                `Restocked ${qtyToAdd} units of '${updatedPart.part_name}' (${updatedPart.sku}). New stock: ${updatedPart.stock_quantity}`,
                JSON.stringify({
                    part_id: updatedPart.part_id,
                    sku: updatedPart.sku,
                    added_quantity: qtyToAdd,
                    new_stock: updatedPart.stock_quantity,
                    unit_cost: updatedPart.unit_cost,
                }),
            ]
        );

        await client.query("COMMIT");

        await deleteCachePattern("garage:cache:inventory:*");

        res.json({
            success: true,
            message: `Restocked ${qtyToAdd} units of [${updatedPart.sku}] ${updatedPart.part_name}. Total in stock: ${updatedPart.stock_quantity}`,
            data: updatedPart,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error restocking inventory part:", err);
        res.status(500).json({ error: "Failed to restock part in database", details: err.message });
    } finally {
        client.release();
    }
});

// DELETE /api/inventory/:id - Delete a part from inventory
app.delete("/api/inventory/:id", async (req, res) => {
    const { id } = req.params;
    const partId = parseInt(id, 10);

    if (isNaN(partId)) {
        return res.status(400).json({ error: "Invalid part ID" });
    }

    try {
        const result = await pool.query(
            "DELETE FROM inventory_data WHERE part_id = $1 RETURNING part_id, sku, part_name;",
            [partId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Part not found in inventory" });
        }

        const deleted = result.rows[0];

        // Audit Log
        await pool.query(
            `INSERT INTO audit_logs (event_type, description, payload_json)
             VALUES ('STATUS_CHANGE', $1, $2);`,
            [
                `Part '${deleted.part_name}' (${deleted.sku}) removed from inventory`,
                JSON.stringify({ deleted_part_id: deleted.part_id, sku: deleted.sku }),
            ]
        );

        await deleteCachePattern("garage:cache:inventory:*");

        res.json({
            success: true,
            message: `Part '${deleted.part_name}' (${deleted.sku}) deleted successfully.`,
            deletedPart: deleted,
        });
    } catch (err) {
        console.error("Error deleting part:", err);
        res.status(500).json({ error: "Failed to delete part from database", details: err.message });
    }
});

// ==========================================
// 3. VEHICLE INTAKE & WORK ORDER GENERATION
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
        await deleteCachePattern("garage:cache:workorders:*");
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
// 4. WORK ORDERS LIST & METRICS (DIRECT HANDLER)
// ==========================================
const handleGetWorkOrdersList = async (req, res) => {
    const cacheKey = "garage:cache:workorders:list";

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const query = `
            SELECT 
                w.work_order_id,
                w.vehicle_id,
                w.assigned_staff_id,
                w.service_advisor_id,
                w.status,
                w.bay_assigned,
                w.scheduled_start,
                w.scheduled_end,
                w.initial_observations,
                w.estimated_cost,
                w.total_cost,
                w.created_at,
                w.updated_at,
                v.vin,
                v.make,
                v.model,
                v.year,
                v.license_plate,
                o.owner_id,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone,
                o.email_address AS owner_email,
                o.is_vip AS owner_is_vip,
                s.full_name AS assigned_staff_name,
                s.role AS assigned_staff_role,
                sa.full_name AS service_advisor_name,
                (SELECT COUNT(*) FROM work_order_items wi WHERE wi.work_order_id = w.work_order_id) AS items_count,
                (SELECT COUNT(*) FROM work_order_media wm WHERE wm.work_order_id = w.work_order_id) AS media_count
            FROM work_order_data w
            JOIN vehicles v ON w.vehicle_id = v.vehicle_id
            JOIN car_owners o ON v.owner_id = o.owner_id
            LEFT JOIN staff_data s ON w.assigned_staff_id = s.staff_id
            LEFT JOIN staff_data sa ON w.service_advisor_id = sa.staff_id
            ORDER BY 
                CASE 
                    WHEN w.status = 'in_progress' THEN 1
                    WHEN w.status = 'received' THEN 2
                    WHEN w.status = 'diagnosed' THEN 3
                    WHEN w.status = 'ready' THEN 4
                    WHEN w.status = 'completed' THEN 5
                    ELSE 6 
                END,
                w.created_at DESC;
        `;
        const result = await pool.query(query);

        await setCache(cacheKey, result.rows, 300);

        res.json({ success: true, source: "postgres", data: result.rows });
    } catch (err) {
        console.error("Error fetching work orders list:", err);
        res.status(500).json({ error: "Failed to fetch work orders", details: err.message });
    }
};

app.get("/api/staff/work-orders", handleGetWorkOrdersList);
app.get("/api/work-orders", handleGetWorkOrdersList);

// ==========================================
// 5. SINGLE WORK ORDER EXECUTION DETAILS (DIRECT HANDLER)
// ==========================================
const handleGetSingleWorkOrder = async (req, res) => {
    const rawId = req.params.id;
    const cleanId = (rawId || "").trim();
    const cacheKey = `garage:cache:workorder:details:${cleanId.toUpperCase()}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const mainQuery = `
            SELECT 
                w.*,
                v.vin, v.make, v.model, v.year, v.license_plate,
                o.owner_id, o.full_name AS owner_name, o.phone_number AS owner_phone, o.email_address AS owner_email, o.is_vip AS owner_is_vip,
                s.full_name AS assigned_staff_name, s.role AS assigned_staff_role, s.hourly_rate AS staff_hourly_rate,
                sa.full_name AS service_advisor_name
            FROM work_order_data w
            JOIN vehicles v ON w.vehicle_id = v.vehicle_id
            JOIN car_owners o ON v.owner_id = o.owner_id
            LEFT JOIN staff_data s ON w.assigned_staff_id = s.staff_id
            LEFT JOIN staff_data sa ON w.service_advisor_id = sa.staff_id
            WHERE UPPER(TRIM(w.work_order_id)) = UPPER(TRIM($1));
        `;
        const mainResult = await pool.query(mainQuery, [cleanId]);

        if (mainResult.rows.length === 0) {
            return res.status(404).json({ error: "Work order not found" });
        }

        const workOrder = mainResult.rows[0];
        const canonicalId = workOrder.work_order_id;

        const itemsQuery = `
            SELECT 
                wi.*,
                i.sku,
                i.part_name,
                i.category as part_category,
                i.stock_quantity
            FROM work_order_items wi
            LEFT JOIN inventory_data i ON wi.part_id = i.part_id
            WHERE UPPER(TRIM(wi.work_order_id)) = UPPER(TRIM($1))
            ORDER BY wi.item_id ASC;
        `;
        const itemsResult = await pool.query(itemsQuery, [canonicalId]);

        const mediaQuery = `
            SELECT * FROM work_order_media 
            WHERE UPPER(TRIM(work_order_id)) = UPPER(TRIM($1)) 
            ORDER BY uploaded_at DESC;
        `;
        const mediaResult = await pool.query(mediaQuery, [canonicalId]);

        const timelineQuery = `
            SELECT 
                a.log_id,
                a.event_type,
                a.description,
                a.payload_json,
                a.created_at,
                s.full_name AS staff_name
            FROM audit_logs a
            LEFT JOIN staff_data s ON a.staff_id = s.staff_id
            WHERE UPPER(TRIM(a.work_order_id)) = UPPER(TRIM($1))
            ORDER BY a.created_at DESC;
        `;
        const timelineResult = await pool.query(timelineQuery, [canonicalId]);

        let scheduledTasks = [];
        try {
            const tasksQuery = `
                SELECT 
                    t.task_id,
                    t.task_title,
                    t.task_description,
                    t.priority,
                    t.status,
                    t.bay_assigned,
                    TO_CHAR(t.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
                    TO_CHAR(t.start_time, 'HH24:MI') AS start_time,
                    TO_CHAR(t.end_time, 'HH24:MI') AS end_time,
                    t.duration_hours,
                    s.full_name AS assigned_staff_name
                FROM scheduled_tasks t
                LEFT JOIN staff_data s ON t.assigned_staff_id = s.staff_id
                WHERE UPPER(TRIM(t.work_order_id)) = UPPER(TRIM($1)) OR t.vehicle_id = $2
                ORDER BY t.scheduled_date ASC, t.start_time ASC;
            `;
            const tasksResult = await pool.query(tasksQuery, [canonicalId, workOrder.vehicle_id]);
            scheduledTasks = tasksResult.rows;
        } catch (taskErr) {
            scheduledTasks = [];
        }

        const fullData = {
            ...workOrder,
            items: itemsResult.rows,
            media: mediaResult.rows,
            timeline: timelineResult.rows,
            scheduled_tasks: scheduledTasks,
        };

        await setCache(cacheKey, fullData, 300);

        res.json({ success: true, source: "postgres", data: fullData });
    } catch (err) {
        console.error("Error fetching work order details:", err);
        res.status(500).json({ error: "Failed to fetch work order details", details: err.message });
    }
};

app.get("/api/staff/work-orders/:id", handleGetSingleWorkOrder);
app.get("/api/work-orders/:id", handleGetSingleWorkOrder);

// POST /api/work-orders/:id/notes - Add note / activity log
app.post("/api/work-orders/:id/notes", async (req, res) => {
    const { id } = req.params;
    const { note, staff_id } = req.body;

    if (!note || !note.trim()) {
        return res.status(400).json({ error: "Note text is required." });
    }

    try {
        const query = `
            INSERT INTO audit_logs (work_order_id, staff_id, event_type, description, payload_json)
            VALUES ($1, $2, 'NOTE_ADDED', $3, $4)
            RETURNING *;
        `;
        const result = await pool.query(query, [
            id,
            staff_id ? parseInt(staff_id, 10) : null,
            note.trim(),
            JSON.stringify({ type: "INTERNAL_NOTE" }),
        ]);

        await deleteCache(`garage:cache:workorder:details:${id}`);

        res.status(201).json({ success: true, message: "Note added to activity log", data: result.rows[0] });
    } catch (err) {
        console.error("Error adding note:", err);
        res.status(500).json({ error: "Failed to add note", details: err.message });
    }
});

// ==========================================
// 6. UPDATE WORK ORDER STATUS & ADVANCE PIPELINE
// ==========================================
app.patch("/api/staff/work-orders/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status, staff_id, notes } = req.body;

    const validStatuses = ["received", "diagnosed", "in_progress", "ready", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    try {
        const result = await pool.query(
            `UPDATE work_order_data 
             SET status = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE work_order_id = $2 
             RETURNING *;`,
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Work order not found" });
        }

        // Audit Log
        await pool.query(
            `INSERT INTO audit_logs (work_order_id, staff_id, event_type, description, payload_json)
             VALUES ($1, $2, 'STATUS_CHANGE', $3, $4);`,
            [
                id,
                staff_id || null,
                `Work Order ${id} transitioned to '${status.toUpperCase()}'`,
                JSON.stringify({ new_status: status, notes: notes || null }),
            ]
        );

        await deleteCachePattern("garage:cache:workorders:*");
        await deleteCache(`garage:cache:workorder:details:${id}`);

        res.json({ success: true, message: `Status updated to ${status}`, data: result.rows[0] });
    } catch (err) {
        console.error("Error updating work order status:", err);
        res.status(500).json({ error: "Failed to update status", details: err.message });
    }
});

// ==========================================
// 7. UPDATE WORK ORDER ASSIGNMENTS (BAY, STAFF, ESTIMATE)
// ==========================================
app.patch("/api/staff/work-orders/:id/details", async (req, res) => {
    const { id } = req.params;
    const { bay_assigned, assigned_staff_id, service_advisor_id, estimated_cost, initial_observations } = req.body;

    try {
        const query = `
            UPDATE work_order_data 
            SET 
                bay_assigned = COALESCE($1, bay_assigned),
                assigned_staff_id = COALESCE($2, assigned_staff_id),
                service_advisor_id = COALESCE($3, service_advisor_id),
                estimated_cost = COALESCE($4, estimated_cost),
                initial_observations = COALESCE($5, initial_observations),
                updated_at = CURRENT_TIMESTAMP
            WHERE work_order_id = $6
            RETURNING *;
        `;
        const result = await pool.query(query, [
            bay_assigned || null,
            assigned_staff_id ? parseInt(assigned_staff_id, 10) : null,
            service_advisor_id ? parseInt(service_advisor_id, 10) : null,
            estimated_cost !== undefined ? parseFloat(estimated_cost) : null,
            initial_observations !== undefined ? initial_observations : null,
            id,
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Work order not found" });
        }

        await deleteCachePattern("garage:cache:workorders:*");
        await deleteCache(`garage:cache:workorder:details:${id}`);

        res.json({ success: true, message: "Work order details updated", data: result.rows[0] });
    } catch (err) {
        console.error("Error updating work order details:", err);
        res.status(500).json({ error: "Failed to update work order details", details: err.message });
    }
});

// ==========================================
// 8. ADD LINE ITEM (PART OR LABOR) TO WORK ORDER
// ==========================================
app.post("/api/staff/work-orders/:id/items", async (req, res) => {
    const { id } = req.params;
    const { item_type, part_id, description, quantity_or_hours, unit_price } = req.body;

    if (!item_type || !description || !unit_price) {
        return res.status(400).json({ error: "item_type, description, and unit_price are required." });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const qty = parseFloat(quantity_or_hours) || 1.0;
        const price = parseFloat(unit_price) || 0.0;

        const insertItemQuery = `
            INSERT INTO work_order_items (
                work_order_id,
                item_type,
                part_id,
                description,
                quantity_or_hours,
                unit_price
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        const itemResult = await client.query(insertItemQuery, [
            id,
            item_type,
            part_id ? parseInt(part_id, 10) : null,
            description.trim(),
            qty,
            price,
        ]);

        // If it's a part, decrement inventory stock
        if (item_type === "part" && part_id) {
            await client.query(
                `UPDATE inventory_data 
                 SET stock_quantity = GREATEST(stock_quantity - $1, 0) 
                 WHERE part_id = $2;`,
                [Math.round(qty), parseInt(part_id, 10)]
            );
            await deleteCachePattern("garage:cache:inventory:*");
        }

        // Recalculate total_cost on work_order_data
        const calcQuery = `
            UPDATE work_order_data 
            SET total_cost = (
                SELECT COALESCE(SUM(total_price), 0.00) 
                FROM work_order_items 
                WHERE work_order_id = $1
            ),
            updated_at = CURRENT_TIMESTAMP
            WHERE work_order_id = $1
            RETURNING total_cost;
        `;
        const totalResult = await client.query(calcQuery, [id]);

        await client.query("COMMIT");

        await deleteCachePattern("garage:cache:workorders:*");
        await deleteCache(`garage:cache:workorder:details:${id}`);

        res.status(201).json({
            success: true,
            message: "Item added to work order",
            item: itemResult.rows[0],
            newTotalCost: totalResult.rows[0]?.total_cost,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error adding work order item:", err);
        res.status(500).json({ error: "Failed to add work order item", details: err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// 9. DELETE LINE ITEM
// ==========================================
app.delete("/api/staff/work-orders/:id/items/:itemId", async (req, res) => {
    const { id, itemId } = req.params;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const deleteResult = await client.query(
            "DELETE FROM work_order_items WHERE item_id = $1 AND work_order_id = $2 RETURNING *;",
            [parseInt(itemId, 10), id]
        );

        if (deleteResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Item not found" });
        }

        const deletedItem = deleteResult.rows[0];

        // If the removed item was an inventory part, restore/restock the quantity back into inventory_data
        if (deletedItem.item_type === "part" && deletedItem.part_id) {
            const returnQty = Math.round(parseFloat(deletedItem.quantity_or_hours) || 1);
            await client.query(
                `UPDATE inventory_data 
                 SET stock_quantity = stock_quantity + $1 
                 WHERE part_id = $2;`,
                [returnQty, parseInt(deletedItem.part_id, 10)]
            );
            await deleteCachePattern("garage:cache:inventory:*");
        }

        // Recalculate total
        const calcQuery = `
            UPDATE work_order_data 
            SET total_cost = (
                SELECT COALESCE(SUM(total_price), 0.00) 
                FROM work_order_items 
                WHERE work_order_id = $1
            ),
            updated_at = CURRENT_TIMESTAMP
            WHERE work_order_id = $1
            RETURNING total_cost;
        `;
        const totalResult = await client.query(calcQuery, [id]);

        await client.query("COMMIT");

        await deleteCachePattern("garage:cache:workorders:*");
        await deleteCache(`garage:cache:workorder:details:${id}`);

        res.json({
            success: true,
            message: "Item removed",
            newTotalCost: totalResult.rows[0]?.total_cost,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error deleting line item:", err);
        res.status(500).json({ error: "Failed to remove line item", details: err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// 10. UPLOAD / ATTACH MEDIA
// ==========================================
app.post("/api/staff/work-orders/:id/media", async (req, res) => {
    const { id } = req.params;
    const { file_url, file_type = "vehicle_condition" } = req.body;

    if (!file_url) {
        return res.status(400).json({ error: "file_url is required." });
    }

    try {
        const query = `
            INSERT INTO work_order_media (work_order_id, file_url, file_type)
            VALUES ($1, $2, $3)
            RETURNING *;
        `;
        const result = await pool.query(query, [id, file_url.trim(), file_type]);

        await deleteCache(`garage:cache:workorder:details:${id}`);

        res.status(201).json({ success: true, message: "Media attached", data: result.rows[0] });
    } catch (err) {
        console.error("Error attaching media:", err);
        res.status(500).json({ error: "Failed to attach media", details: err.message });
    }
});

// ==========================================
// 11. STAFF DIRECTORY & METRICS
// ==========================================
app.get("/api/staff", async (req, res) => {
    const cacheKey = "garage:cache:staff:all";

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const query = `
            SELECT 
                s.staff_id,
                s.full_name,
                s.role,
                s.email,
                s.phone_number,
                s.residential_address,
                s.hourly_rate,
                s.is_active,
                s.created_at,
                u.user_id,
                u.is_active AS account_active,
                (
                    SELECT COUNT(*) 
                    FROM work_order_data w 
                    WHERE w.assigned_staff_id = s.staff_id 
                      AND w.status IN ('in_progress', 'received', 'diagnosed')
                ) AS active_jobs_count,
                (
                    SELECT COUNT(*) 
                    FROM work_order_data w 
                    WHERE w.assigned_staff_id = s.staff_id 
                      AND w.status = 'completed'
                ) AS completed_jobs_count
            FROM staff_data s
            INNER JOIN users u ON s.staff_id = u.staff_id
            WHERE s.is_active = TRUE AND u.is_active = TRUE
            ORDER BY s.full_name ASC;
        `;
        const result = await pool.query(query);

        // Format and compute workload percentages
        const formattedStaff = result.rows.map((member) => {
            const activeJobs = parseInt(member.active_jobs_count, 10) || 0;
            const completedJobs = parseInt(member.completed_jobs_count, 10) || 0;
            const isLead = (member.role || "").toLowerCase().includes("lead");

            // Compute initials
            const parts = (member.full_name || "").trim().split(" ");
            const initials = parts.length === 1
                ? parts[0].substring(0, 2).toUpperCase()
                : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

            // Workload heuristics
            let workloadPercent = Math.min(activeJobs * 25, 100);
            let workloadLabel = `${workloadPercent}% - Light`;
            let workloadType = "success";

            if (workloadPercent >= 75) {
                workloadLabel = `${workloadPercent}% - Heavy`;
                workloadType = "warning";
            } else if (workloadPercent >= 40) {
                workloadLabel = `${workloadPercent}% - Optimal`;
                workloadType = "success";
            }

            const efficiency = completedJobs > 0 ? `${Math.min(90 + completedJobs, 99)}%` : "Available";

            return {
                id: member.staff_id,
                staff_id: member.staff_id,
                name: member.full_name,
                role: member.role,
                email: member.email,
                phone: member.phone_number,
                address: member.residential_address,
                hourly_rate: parseFloat(member.hourly_rate || 0).toFixed(2),
                is_active: member.is_active,
                account_active: member.account_active,
                has_user_account: member.user_id !== null,
                isLead,
                activeJobs,
                completedJobs,
                efficiency,
                workload: `${workloadPercent}%`,
                workloadLabel,
                workloadType,
                initials,
                created_at: member.created_at,
            };
        });

        await setCache(cacheKey, formattedStaff, 300);

        res.json({ success: true, source: "postgres", data: formattedStaff });
    } catch (err) {
        console.error("Error fetching staff directory:", err);
        res.status(500).json({ error: "Failed to fetch staff from database", details: err.message });
    }
});

app.get("/api/staff/list", async (req, res) => {
    const cacheKey = "garage:cache:staff:list:active";
    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const result = await pool.query(
            "SELECT staff_id, full_name, role, hourly_rate, is_active FROM staff_data WHERE is_active = TRUE ORDER BY full_name ASC;"
        );

        await setCache(cacheKey, result.rows, 300);

        res.json({ success: true, source: "postgres", data: result.rows });
    } catch (err) {
        console.error("Error fetching staff list:", err);
        res.status(500).json({ error: "Failed to fetch staff list", details: err.message });
    }
});

// PATCH /api/staff/:id/status - Update staff active status & sync linked user
app.patch("/api/staff/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        const result = await pool.query(
            "UPDATE staff_data SET is_active = $1 WHERE staff_id = $2 RETURNING *;",
            [Boolean(is_active), id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Staff member not found" });
        }

        // Also sync linked user account
        await pool.query(
            "UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE staff_id = $2;",
            [Boolean(is_active), id]
        );

        await deleteCachePattern("garage:cache:staff:*");
        await deleteCachePattern("garage:cache:users:*");
        await deleteCachePattern("garage:cache:schedules:*");

        res.json({
            success: true,
            message: `Staff member status updated to ${is_active ? "ACTIVE" : "INACTIVE"}`,
            data: result.rows[0],
        });
    } catch (err) {
        console.error("Error updating staff status:", err);
        res.status(500).json({ error: "Failed to update staff status", details: err.message });
    }
});

// DELETE /api/staff/:id - Delete staff member and linked user account
app.delete("/api/staff/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;

        // Unlink from work orders and schedules
        await client.query("UPDATE work_order_data SET assigned_staff_id = NULL WHERE assigned_staff_id = $1;", [id]);
        await client.query("UPDATE schedules SET assigned_staff_id = NULL WHERE assigned_staff_id = $1;", [id]);

        // Delete linked user
        await client.query("DELETE FROM users WHERE staff_id = $1;", [id]);

        // Delete staff record
        const result = await client.query("DELETE FROM staff_data WHERE staff_id = $1 RETURNING *;", [id]);

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Staff member not found" });
        }

        await client.query("COMMIT");

        await deleteCachePattern("garage:cache:staff:*");
        await deleteCachePattern("garage:cache:users:*");
        await deleteCachePattern("garage:cache:schedules:*");

        res.json({
            success: true,
            message: `Staff member ${result.rows[0].full_name} deleted successfully`,
            deletedStaff: result.rows[0],
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error deleting staff member:", err);
        res.status(500).json({ error: "Failed to delete staff member", details: err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// 12. CAR OWNERS DIRECTORY & DETAIL PROFILES
// ==========================================
app.get("/api/owners", async (req, res) => {
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
app.get("/api/owners/unlinked", async (req, res) => {
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
app.get("/api/owners/:id", async (req, res) => {
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

// GET /api/owner/vehicles - List all vehicles with owner, active work order, and service metrics
app.get("/api/owner/vehicles", async (req, res) => {
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
                    SELECT COALESCE(SUM(w.total_cost), 0.00) 
                    FROM work_order_data w 
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

// GET /api/vehicles/vin/:vin/history - Complete service history matched with VIN number
app.get("/api/vehicles/vin/:vin/history", async (req, res) => {
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

        // 2. Fetch all Work Orders for this vehicle
        const workOrdersQuery = `
            SELECT 
                w.*,
                s.full_name AS assigned_staff_name,
                s.role AS assigned_staff_role,
                sa.full_name AS service_advisor_name
            FROM work_order_data w
            LEFT JOIN staff_data s ON w.assigned_staff_id = s.staff_id
            LEFT JOIN staff_data sa ON w.service_advisor_id = sa.staff_id
            WHERE w.vehicle_id = $1
            ORDER BY w.created_at DESC;
        `;
        const workOrdersResult = await pool.query(workOrdersQuery, [vehicle.vehicle_id]);
        const workOrders = workOrdersResult.rows;

        // 3. For each work order, fetch items, media, and scheduled tasks
        const enhancedWorkOrders = await Promise.all(
            workOrders.map(async (wo) => {
                // Line items
                const itemsRes = await pool.query(
                    `SELECT wi.*, i.part_name, i.sku, i.category AS part_category 
                     FROM work_order_items wi 
                     LEFT JOIN inventory_data i ON wi.part_id = i.part_id 
                     WHERE wi.work_order_id = $1 
                     ORDER BY wi.item_id ASC;`,
                    [wo.work_order_id]
                );

                // Media photos
                const mediaRes = await pool.query(
                    `SELECT * FROM work_order_media 
                     WHERE work_order_id = $1 
                     ORDER BY uploaded_at DESC;`,
                    [wo.work_order_id]
                );

                // Scheduled tasks
                let tasks = [];
                try {
                    const tasksRes = await pool.query(
                        `SELECT t.*, s.full_name AS assigned_staff_name 
                         FROM scheduled_tasks t 
                         LEFT JOIN staff_data s ON t.assigned_staff_id = s.staff_id 
                         WHERE t.work_order_id = $1 OR t.vehicle_id = $2 
                         ORDER BY t.scheduled_date DESC;`,
                        [wo.work_order_id, vehicle.vehicle_id]
                    );
                    tasks = tasksRes.rows;
                } catch (tErr) {
                    tasks = [];
                }

                return {
                    ...wo,
                    items: itemsRes.rows,
                    media: mediaRes.rows,
                    scheduled_tasks: tasks,
                    partsTotal: itemsRes.rows
                        .filter((i) => i.item_type === "part")
                        .reduce((sum, i) => sum + (parseFloat(i.total_price) || 0), 0),
                    laborTotal: itemsRes.rows
                        .filter((i) => i.item_type === "labor")
                        .reduce((sum, i) => sum + (parseFloat(i.total_price) || 0), 0),
                };
            })
        );

        // 4. Compute High-Level Metrics
        const totalSpent = enhancedWorkOrders.reduce(
            (sum, wo) => sum + (parseFloat(wo.total_cost) || parseFloat(wo.estimated_cost) || 0),
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

// ==========================================
// 12. SCHEDULING TERMINAL & TASKS
// ==========================================
app.get("/api/schedules", async (req, res) => {
    const { date, week_start } = req.query;
    const cacheKey = `garage:cache:schedules:${date || "all"}:${week_start || "current"}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const query = `
            SELECT 
                t.task_id,
                t.task_title,
                t.task_description,
                t.priority,
                t.status,
                t.bay_assigned,
                TO_CHAR(t.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
                TO_CHAR(t.start_time, 'HH24:MI') AS start_time,
                TO_CHAR(t.end_time, 'HH24:MI') AS end_time,
                t.duration_hours,
                t.work_order_id,
                t.vehicle_id,
                t.assigned_staff_id,
                t.created_at,
                s.full_name AS assigned_staff_name,
                s.role AS staff_role,
                v.make,
                v.model,
                v.year,
                v.license_plate,
                v.vin,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone
            FROM scheduled_tasks t
            LEFT JOIN staff_data s ON t.assigned_staff_id = s.staff_id
            LEFT JOIN vehicles v ON t.vehicle_id = v.vehicle_id
            LEFT JOIN car_owners o ON v.owner_id = o.owner_id
            ORDER BY t.scheduled_date ASC, t.start_time ASC;
        `;
        const result = await pool.query(query);

        await setCache(cacheKey, result.rows, 120);

        res.json({ success: true, source: "postgres", data: result.rows });
    } catch (err) {
        // If scheduled_tasks table doesn't exist yet, return graceful response
        if (err.code === "42P01") {
            console.warn("Notice: scheduled_tasks table does not exist yet. Please run the migration SQL.");
            return res.json({
                success: true,
                source: "empty_fallback",
                data: [],
                tablePending: true,
                message: "scheduled_tasks table pending creation",
            });
        }
        console.error("Error fetching schedules:", err);
        res.status(500).json({ error: "Failed to fetch schedules", details: err.message });
    }
});

app.post("/api/schedules", async (req, res) => {
    const {
        task_title,
        task_description,
        priority = "standard",
        status = "scheduled",
        bay_assigned = "B1",
        scheduled_date,
        start_time = "09:00",
        end_time = "11:00",
        duration_hours = 2.0,
        work_order_id,
        vehicle_id,
        assigned_staff_id,
    } = req.body;

    if (!task_title || !scheduled_date) {
        return res.status(400).json({ error: "task_title and scheduled_date are required." });
    }

    try {
        const query = `
            INSERT INTO scheduled_tasks (
                task_title,
                task_description,
                priority,
                status,
                bay_assigned,
                scheduled_date,
                start_time,
                end_time,
                duration_hours,
                work_order_id,
                vehicle_id,
                assigned_staff_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::TIME, $8::TIME, $9, $10, $11, $12)
            RETURNING *;
        `;
        const result = await pool.query(query, [
            task_title.trim(),
            task_description ? task_description.trim() : null,
            priority,
            status,
            bay_assigned,
            scheduled_date,
            start_time,
            end_time,
            parseFloat(duration_hours) || 2.0,
            work_order_id || null,
            vehicle_id || null,
            assigned_staff_id ? parseInt(assigned_staff_id, 10) : null,
        ]);

        await deleteCachePattern("garage:cache:schedules:*");

        res.status(201).json({
            success: true,
            message: "Scheduled task created successfully",
            data: result.rows[0],
        });
    } catch (err) {
        if (err.code === "42P01") {
            return res.status(400).json({
                error: "The scheduled_tasks table has not been created yet in PostgreSQL. Please execute the provided SQL query first.",
                tablePending: true,
            });
        }
        console.error("Error creating scheduled task:", err);
        res.status(500).json({ error: "Failed to create scheduled task", details: err.message });
    }
});

app.patch("/api/schedules/:id", async (req, res) => {
    const { id } = req.params;
    const {
        task_title,
        task_description,
        priority,
        status,
        bay_assigned,
        scheduled_date,
        start_time,
        end_time,
        duration_hours,
        assigned_staff_id,
    } = req.body;

    try {
        const query = `
            UPDATE scheduled_tasks
            SET
                task_title = COALESCE($1, task_title),
                task_description = COALESCE($2, task_description),
                priority = COALESCE($3, priority),
                status = COALESCE($4, status),
                bay_assigned = COALESCE($5, bay_assigned),
                scheduled_date = COALESCE($6, scheduled_date),
                start_time = COALESCE($7::TIME, start_time),
                end_time = COALESCE($8::TIME, end_time),
                duration_hours = COALESCE($9, duration_hours),
                assigned_staff_id = COALESCE($10, assigned_staff_id),
                updated_at = CURRENT_TIMESTAMP
            WHERE task_id = $11
            RETURNING *;
        `;
        const result = await pool.query(query, [
            task_title ? task_title.trim() : null,
            task_description !== undefined ? task_description : null,
            priority || null,
            status || null,
            bay_assigned || null,
            scheduled_date || null,
            start_time || null,
            end_time || null,
            duration_hours ? parseFloat(duration_hours) : null,
            assigned_staff_id ? parseInt(assigned_staff_id, 10) : null,
            id,
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Scheduled task not found" });
        }

        await deleteCachePattern("garage:cache:schedules:*");

        res.json({ success: true, message: "Task updated successfully", data: result.rows[0] });
    } catch (err) {
        console.error("Error updating scheduled task:", err);
        res.status(500).json({ error: "Failed to update scheduled task", details: err.message });
    }
});

app.delete("/api/schedules/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query("DELETE FROM scheduled_tasks WHERE task_id = $1 RETURNING *;", [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Scheduled task not found" });
        }

        await deleteCachePattern("garage:cache:schedules:*");

        res.json({ success: true, message: "Scheduled task deleted", data: result.rows[0] });
    } catch (err) {
        console.error("Error deleting scheduled task:", err);
        res.status(500).json({ error: "Failed to delete scheduled task", details: err.message });
    }
});

// ==========================================
// 13. AUDIT LOGS & EVENT STREAM (PAGINATED)
// ==========================================
app.get("/api/audit-logs", async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;
    const { range = "ALL", event_type = "all", search = "" } = req.query;

    const cacheKey = `garage:cache:audit:logs:${limit}:${offset}:${range}:${event_type}:${search.trim().toLowerCase()}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", ...cached });
        }

        // Build Time Range Clause
        let timeCondition = "1=1";
        if (range === "1H") {
            timeCondition = "a.created_at >= NOW() - INTERVAL '1 hour'";
        } else if (range === "24H") {
            timeCondition = "a.created_at >= NOW() - INTERVAL '24 hours'";
        } else if (range === "7D") {
            timeCondition = "a.created_at >= NOW() - INTERVAL '7 days'";
        }

        // Build Event Type Clause
        let typeCondition = "1=1";
        if (event_type && event_type !== "all") {
            typeCondition = `a.event_type ILIKE '%${event_type}%'`;
        }

        // Build Search Clause
        let searchCondition = "1=1";
        const queryParams = [];
        if (search && search.trim().length > 0) {
            queryParams.push(`%${search.trim()}%`);
            const sIdx = queryParams.length;
            searchCondition = `(
                a.description ILIKE $${sIdx} 
                OR a.event_type ILIKE $${sIdx} 
                OR a.work_order_id ILIKE $${sIdx}
                OR s.full_name ILIKE $${sIdx}
            )`;
        }

        const whereClause = `WHERE ${timeCondition} AND ${typeCondition} AND ${searchCondition}`;

        // Query Logs with joined staff details
        const query = `
            SELECT 
                a.log_id,
                a.work_order_id,
                a.staff_id,
                a.event_type,
                a.description,
                a.payload_json,
                a.created_at,
                s.full_name AS staff_name,
                s.role AS staff_role
            FROM audit_logs a
            LEFT JOIN staff_data s ON a.staff_id = s.staff_id
            ${whereClause}
            ORDER BY a.created_at DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2};
        `;

        const logsResult = await pool.query(query, [...queryParams, limit, offset]);

        // Total Count
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM audit_logs a
            LEFT JOIN staff_data s ON a.staff_id = s.staff_id
            ${whereClause};
        `;
        const countResult = await pool.query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0]?.total, 10) || 0;

        // KPI Stats (Events 24h, Critical Alerts, Top Actors)
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM audit_logs WHERE created_at >= NOW() - INTERVAL '24 hours') AS events_24h,
                (SELECT COUNT(*) FROM audit_logs WHERE event_type IN ('AUTH_FAILURE', 'CRITICAL', 'ERROR')) AS critical_alerts;
        `;
        const statsResult = await pool.query(statsQuery);

        const actorsQuery = `
            SELECT s.full_name, s.staff_id, COUNT(*) AS count
            FROM audit_logs a
            JOIN staff_data s ON a.staff_id = s.staff_id
            GROUP BY s.full_name, s.staff_id
            ORDER BY count DESC
            LIMIT 4;
        `;
        const actorsResult = await pool.query(actorsQuery);

        // Format Logs
        const formattedLogs = logsResult.rows.map((log) => {
            const dateObj = new Date(log.created_at);
            const timeStr = dateObj.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
            });

            // Date label
            const today = new Date();
            const isToday =
                dateObj.getDate() === today.getDate() &&
                dateObj.getMonth() === today.getMonth() &&
                dateObj.getFullYear() === today.getFullYear();

            const dateStr = isToday
                ? "Today"
                : dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });

            // Map event type categories
            let typeCategory = "creation";
            let badgeLabel = log.event_type;
            let badgeType = "neutral";
            let actionText = "recorded event on";

            const evt = (log.event_type || "").toUpperCase();
            if (evt.includes("AUTH") || evt.includes("CRITICAL") || evt.includes("FAILURE")) {
                typeCategory = "critical";
                badgeType = "error";
                actionText = "triggered";
            } else if (evt.includes("STATUS")) {
                typeCategory = "status_change";
                badgeType = "warning";
                actionText = "updated status on";
            } else if (evt.includes("PART") || evt.includes("INVENTORY") || evt.includes("STOCK")) {
                typeCategory = "inventory";
                badgeType = "info";
                actionText = "allocated part / stock for";
            } else if (evt.includes("ORDER") || evt.includes("CREATE") || evt.includes("TASK")) {
                typeCategory = "creation";
                badgeType = "success";
                actionText = "created new entity";
            }

            // Actor Initials
            let actorName = log.staff_name || "System Automated";
            const nameParts = actorName.trim().split(" ");
            const initials =
                nameParts.length === 1
                    ? nameParts[0].substring(0, 2).toUpperCase()
                    : (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();

            return {
                id: log.log_id,
                log_id: log.log_id,
                type: typeCategory,
                event_type: log.event_type,
                actor: actorName,
                initials,
                action: actionText,
                targetId: log.work_order_id || null,
                badge: badgeLabel,
                badgeType,
                description: log.description,
                payload: log.payload_json ? JSON.stringify(log.payload_json, null, 2) : null,
                raw_payload: log.payload_json,
                time: timeStr,
                date: dateStr,
                created_at: log.created_at,
            };
        });

        const responsePayload = {
            data: formattedLogs,
            total,
            hasMore: offset + limit < total,
            stats: {
                events24h: parseInt(statsResult.rows[0]?.events_24h, 10) || 0,
                criticalAlerts: parseInt(statsResult.rows[0]?.critical_alerts, 10) || 0,
                topActors: actorsResult.rows.map((a) => {
                    const parts = (a.full_name || "").trim().split(" ");
                    const init =
                        parts.length === 1
                            ? parts[0].substring(0, 2).toUpperCase()
                            : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                    return { name: a.full_name, initials: init, count: a.count };
                }),
            },
        };

        await setCache(cacheKey, responsePayload, 60);

        res.json({ success: true, source: "postgres", ...responsePayload });
    } catch (err) {
        if (err.code === "42P01") {
            console.warn("Notice: audit_logs table does not exist yet.");
            return res.json({
                success: true,
                source: "empty_fallback",
                data: [],
                total: 0,
                hasMore: false,
                tablePending: true,
                stats: { events24h: 0, criticalAlerts: 0, topActors: [] },
                message: "audit_logs table pending creation in database",
            });
        }
        console.error("Error fetching audit logs:", err);
        res.status(500).json({ error: "Failed to fetch audit logs", details: err.message });
    }
});

// Endpoint to insert audit event
app.post("/api/audit-logs", async (req, res) => {
    const { work_order_id, staff_id, event_type, description, payload_json } = req.body;

    if (!event_type || !description) {
        return res.status(400).json({ error: "event_type and description are required." });
    }

    try {
        const query = `
            INSERT INTO audit_logs (work_order_id, staff_id, event_type, description, payload_json)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const result = await pool.query(query, [
            work_order_id || null,
            staff_id ? parseInt(staff_id, 10) : null,
            event_type,
            description.trim(),
            payload_json || null,
        ]);

        await deleteCachePattern("garage:cache:audit:*");

        res.status(201).json({ success: true, message: "Audit event recorded", data: result.rows[0] });
    } catch (err) {
        console.error("Error inserting audit log:", err);
        res.status(500).json({ error: "Failed to insert audit log", details: err.message });
    }
});

app.get("/api/inventory/items", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT part_id, sku, part_name, category, stock_quantity, selling_price FROM inventory_data ORDER BY part_name ASC;"
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch inventory items", details: err.message });
    }
});

// ==========================================
// 12. OWNER SEARCH & LOOKUPS (REDIS CACHED)
// ==========================================
app.get("/api/owners/search", async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || query.trim().length < 2) {
            return res.json({ success: true, source: "none", data: [] });
        }

        const normalizedQuery = query.trim().toLowerCase();
        const cacheKey = `garage:cache:owners:search:${normalizedQuery}`;

        const cachedResults = await getCache(cacheKey);
        if (cachedResults) {
            return res.json({ success: true, source: "redis", data: cachedResults });
        }

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

        await setCache(cacheKey, result.rows, 300);

        res.json({ success: true, source: "postgres", data: result.rows });
    } catch (err) {
        console.error("Error searching owners:", err);
        res.status(500).json({ error: "Failed to search owners", details: err.message });
    }
});

app.get("/api/vehicles/vin/:vin", async (req, res) => {
    try {
        const { vin } = req.params;
        const sanitizedVin = (vin || "").trim().toUpperCase();
        const cacheKey = `garage:cache:vehicle:vin:${sanitizedVin}`;

        const cachedVehicle = await getCache(cacheKey);
        if (cachedVehicle) {
            return res.json({ found: true, source: "redis", data: cachedVehicle });
        }

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

        await setCache(cacheKey, result.rows[0], 3600);

        res.json({ found: true, source: "postgres", data: result.rows[0] });
    } catch (err) {
        console.error("Error looking up vehicle by VIN:", err);
        res.status(500).json({ error: "Failed to lookup vehicle", details: err.message });
    }
});

// ==========================================
// 13. GET ALL USERS (REDIS CACHED)
// ==========================================
app.get("/api/users", async (req, res) => {
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

// ==========================================
// 14. USER CREATION & MANAGEMENT
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
                // Link Existing Customer from car_owners
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

                // Optionally update profile details if provided
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
                // Create New Customer profile in car_owners
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
});

app.patch("/api/users/:id/status", async (req, res) => {
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

        // If this user account belongs to a staff member, synchronize staff_data.is_active
        if (user.staff_id) {
            await pool.query(
                "UPDATE staff_data SET is_active = $1 WHERE staff_id = $2;",
                [Boolean(is_active), user.staff_id]
            );
        }

        // Invalidate all related Redis caches immediately
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

app.delete("/api/users/:id", async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        if (isNaN(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        // Soft-deactivate user record so foreign keys in other tables stay intact
        const result = await pool.query(
            "UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 RETURNING user_id, email, role, staff_id, owner_id, is_active, updated_at;",
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found in database" });
        }

        const user = result.rows[0];

        // If user is a staff member, synchronize staff_data.is_active = FALSE
        if (user.staff_id) {
            await pool.query(
                "UPDATE staff_data SET is_active = FALSE WHERE staff_id = $1;",
                [user.staff_id]
            );
        }

        // Invalidate all Redis caches
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

// ==========================================
// 15. AUTH LOGIN
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

// ==========================================
// 16. INVOICES & TAX INVOICE MANAGEMENT
// ==========================================

// GET /api/invoices - List all invoices with owner and vehicle details
app.get("/api/invoices", async (req, res) => {
    const cacheKey = "garage:cache:invoices:list";

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const query = `
            SELECT 
                i.invoice_id,
                i.work_order_id,
                i.owner_id,
                i.subtotal,
                i.tax_amount,
                i.total_amount,
                i.status,
                TO_CHAR(i.date_issued, 'YYYY-MM-DD') AS date_issued,
                TO_CHAR(i.date_due, 'YYYY-MM-DD') AS date_due,
                TO_CHAR(i.date_paid, 'YYYY-MM-DD') AS date_paid,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone,
                o.email_address AS owner_email,
                o.is_vip AS owner_is_vip,
                v.vehicle_id,
                v.vin,
                v.make,
                v.model,
                v.year,
                v.license_plate,
                w.status AS work_order_status
            FROM invoice_data i
            JOIN car_owners o ON i.owner_id = o.owner_id
            JOIN work_order_data w ON i.work_order_id = w.work_order_id
            JOIN vehicles v ON w.vehicle_id = v.vehicle_id
            ORDER BY i.date_issued DESC, i.invoice_id DESC;
        `;
        const result = await pool.query(query);

        await setCache(cacheKey, result.rows, 300);

        res.json({ success: true, source: "postgres", data: result.rows });
    } catch (err) {
        console.error("Error fetching invoices list:", err);
        res.status(500).json({ error: "Failed to fetch invoices", details: err.message });
    }
});

// GET /api/invoices/:id - Get complete Tax Invoice details with line items
app.get("/api/invoices/:id", async (req, res) => {
    const { id } = req.params;
    const cleanId = (id || "").trim();
    const cacheKey = `garage:cache:invoice:details:${cleanId.toUpperCase()}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const invoiceQuery = `
            SELECT 
                i.invoice_id,
                i.work_order_id,
                i.owner_id,
                i.subtotal,
                i.tax_amount,
                i.total_amount,
                i.status,
                TO_CHAR(i.date_issued, 'YYYY-MM-DD') AS date_issued,
                TO_CHAR(i.date_due, 'YYYY-MM-DD') AS date_due,
                TO_CHAR(i.date_paid, 'YYYY-MM-DD') AS date_paid,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone,
                o.email_address AS owner_email,
                o.billing_address AS owner_address,
                o.is_vip AS owner_is_vip,
                v.vehicle_id,
                v.vin,
                v.make,
                v.model,
                v.year,
                v.license_plate,
                w.status AS work_order_status,
                w.initial_observations,
                s.full_name AS lead_technician_name
            FROM invoice_data i
            JOIN car_owners o ON i.owner_id = o.owner_id
            JOIN work_order_data w ON i.work_order_id = w.work_order_id
            JOIN vehicles v ON w.vehicle_id = v.vehicle_id
            LEFT JOIN staff_data s ON w.assigned_staff_id = s.staff_id
            WHERE UPPER(TRIM(i.invoice_id)) = UPPER(TRIM($1))
               OR UPPER(TRIM(i.work_order_id)) = UPPER(TRIM($1));
        `;
        const invoiceResult = await pool.query(invoiceQuery, [cleanId]);

        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ error: "Invoice not found." });
        }

        const invoice = invoiceResult.rows[0];

        // Fetch line items for this work order
        const itemsQuery = `
            SELECT 
                wi.item_id,
                wi.item_type,
                wi.description,
                wi.quantity_or_hours,
                wi.unit_price,
                wi.total_price,
                i.sku,
                i.part_name
            FROM work_order_items wi
            LEFT JOIN inventory_data i ON wi.part_id = i.part_id
            WHERE UPPER(TRIM(wi.work_order_id)) = UPPER(TRIM($1))
            ORDER BY wi.item_id ASC;
        `;
        const itemsResult = await pool.query(itemsQuery, [invoice.work_order_id]);

        const fullInvoice = {
            ...invoice,
            items: itemsResult.rows,
        };

        await setCache(cacheKey, fullInvoice, 300);

        res.json({ success: true, source: "postgres", data: fullInvoice });
    } catch (err) {
        console.error("Error fetching invoice details:", err);
        res.status(500).json({ error: "Failed to fetch invoice details", details: err.message });
    }
});

// POST /api/invoices/generate - Create or refresh Tax Invoice from a Work Order
app.post("/api/invoices/generate", async (req, res) => {
    const { work_order_id, tax_rate = 0.05 } = req.body;

    if (!work_order_id) {
        return res.status(400).json({ error: "Work order ID is required to generate invoice." });
    }

    try {
        // 1. Fetch work order & vehicle & owner details
        const woQuery = `
            SELECT 
                w.work_order_id,
                w.vehicle_id,
                w.status,
                w.total_cost,
                v.owner_id
            FROM work_order_data w
            JOIN vehicles v ON w.vehicle_id = v.vehicle_id
            WHERE UPPER(TRIM(w.work_order_id)) = UPPER(TRIM($1));
        `;
        const woResult = await pool.query(woQuery, [work_order_id.trim()]);

        if (woResult.rows.length === 0) {
            return res.status(404).json({ error: `Work order '${work_order_id}' was not found.` });
        }

        const wo = woResult.rows[0];

        // 2. Calculate subtotal from items
        const itemsQuery = `
            SELECT COALESCE(SUM(total_price), 0) AS calculated_subtotal
            FROM work_order_items
            WHERE UPPER(TRIM(work_order_id)) = UPPER(TRIM($1));
        `;
        const itemsResult = await pool.query(itemsQuery, [wo.work_order_id]);
        let subtotal = parseFloat(itemsResult.rows[0].calculated_subtotal || 0);

        if (subtotal === 0 && parseFloat(wo.total_cost || 0) > 0) {
            subtotal = parseFloat(wo.total_cost);
        }

        const taxRateNum = parseFloat(tax_rate) || 0.05;
        const taxAmount = parseFloat((subtotal * taxRateNum).toFixed(2));
        const initialStatus = wo.status === 'completed' ? 'paid' : 'pending';

        // 3. Upsert invoice record
        const upsertQuery = `
            INSERT INTO invoice_data (
                work_order_id,
                owner_id,
                subtotal,
                tax_amount,
                status,
                date_issued,
                date_due
            )
            VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days')
            ON CONFLICT (work_order_id) DO UPDATE SET
                subtotal = EXCLUDED.subtotal,
                tax_amount = EXCLUDED.tax_amount,
                status = CASE WHEN invoice_data.status = 'paid' THEN 'paid' ELSE EXCLUDED.status END
            RETURNING *;
        `;
        const invoiceResult = await pool.query(upsertQuery, [
            wo.work_order_id,
            wo.owner_id,
            subtotal,
            taxAmount,
            initialStatus,
        ]);

        const invoice = invoiceResult.rows[0];

        // Log audit event
        try {
            await pool.query(`
                INSERT INTO audit_logs (work_order_id, event_type, description, payload_json)
                VALUES ($1, 'INVOICE_GENERATED', $2, $3);
            `, [
                wo.work_order_id,
                `Tax Invoice ${invoice.invoice_id} generated for total $${(subtotal + taxAmount).toFixed(2)}.`,
                JSON.stringify({ invoice_id: invoice.invoice_id, subtotal, tax_amount: taxAmount }),
            ]);
        } catch (auditErr) {
            console.warn("Notice: Audit log for invoice failed:", auditErr.message);
        }

        // Flush caches
        await deleteCachePattern("garage:cache:invoice*");
        await deleteCachePattern("garage:cache:workorder*");

        res.status(201).json({
            success: true,
            message: `Tax Invoice ${invoice.invoice_id} created successfully!`,
            data: invoice,
        });
    } catch (err) {
        console.error("Error generating invoice:", err);
        res.status(500).json({ error: "Failed to generate invoice", details: err.message });
    }
});

// PATCH /api/invoices/:id/status - Update invoice payment status
app.patch("/api/invoices/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'paid', 'overdue', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    try {
        const query = `
            UPDATE invoice_data
            SET 
                status = $1,
                date_paid = CASE WHEN $1 = 'paid' THEN CURRENT_DATE ELSE NULL END
            WHERE UPPER(TRIM(invoice_id)) = UPPER(TRIM($2))
               OR UPPER(TRIM(work_order_id)) = UPPER(TRIM($2))
            RETURNING *;
        `;
        const result = await pool.query(query, [status, id.trim()]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        await deleteCachePattern("garage:cache:invoice*");

        res.json({
            success: true,
            message: `Invoice status updated to ${status}.`,
            data: result.rows[0],
        });
    } catch (err) {
        console.error("Error updating invoice status:", err);
        res.status(500).json({ error: "Failed to update invoice status", details: err.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Garage Backend Server running on http://localhost:${port}`);
});
