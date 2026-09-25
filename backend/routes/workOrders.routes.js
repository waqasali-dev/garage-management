import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCache, deleteCachePattern } from "../redis.js";

const router = express.Router();

// ==========================================
// VEHICLE INTAKE & WORK ORDER GENERATION
// ==========================================
export const handleIntake = async (req, res) => {
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
                initial_observations,
                estimated_cost,
                total_cost
            )
            VALUES ($1, NULL, NULL, 'received', 'B1', $2, 0.00, 0.00)
            RETURNING *;
        `;
        const workOrderResult = await client.query(insertWorkOrderQuery, [
            vehicleId,
            notes ? notes.trim() : "Initial vehicle drop-off inspection pending",
        ]);

        const createdWorkOrder = workOrderResult.rows[0];

        // STEP 4: RECORD IN AUDIT LOG
        const auditLogQuery = `
            INSERT INTO audit_logs (
                work_order_id,
                staff_id,
                event_type,
                description,
                payload_json
            )
            VALUES ($1, NULL, 'WORK_ORDER_CREATED', $2, $3);
        `;
        await client.query(auditLogQuery, [
            createdWorkOrder.work_order_id,
            `Work order ${createdWorkOrder.work_order_id} opened for ${make} ${model} (${licensePlate})`,
            JSON.stringify({
                vin: sanitizedVin,
                owner_id: ownerId,
                vehicle_id: vehicleId,
                initial_status: "received",
            }),
        ]);

        await client.query("COMMIT");

        // Prepare Complete Response Payload
        const responseData = {
            work_order_id: createdWorkOrder.work_order_id,
            status: createdWorkOrder.status,
            bay_assigned: createdWorkOrder.bay_assigned,
            created_at: createdWorkOrder.created_at,
            initial_observations: createdWorkOrder.initial_observations,
            estimated_cost: createdWorkOrder.estimated_cost,
            total_cost: createdWorkOrder.total_cost,
            vehicle: {
                vehicle_id: vehicleId,
                vin: sanitizedVin,
                make: make.trim(),
                model: model.trim(),
                year: parsedYear,
                license_plate: licensePlate.trim().toUpperCase(),
            },
            owner: {
                owner_id: ownerId,
                full_name: fullName ? fullName.trim() : "",
                phone_number: phone ? phone.trim() : "",
                email_address: email ? email.trim() : "",
            },
        };

        // Cache Invalidation
        await deleteCachePattern("garage:cache:owners:*");
        await deleteCachePattern("garage:cache:users:*");
        await deleteCachePattern("garage:cache:workorders:*");
        await deleteCachePattern("garage:cache:owner:vehicles:*");
        await deleteCachePattern("garage:cache:vehicle:*");
        await deleteCachePattern("garage:cache:dashboard:*");
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
};

// ==========================================
// WORK ORDERS LIST & METRICS
// ==========================================
export const handleGetWorkOrdersList = async (req, res) => {
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

// ==========================================
// SINGLE WORK ORDER DETAILS
// ==========================================
export const handleGetSingleWorkOrder = async (req, res) => {
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

// Routes Registration
router.get("/", handleGetWorkOrdersList);
router.get("/:id", handleGetSingleWorkOrder);

// POST /api/work-orders/:id/notes
router.post("/:id/notes", async (req, res) => {
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

// DELETE /api/work-orders/:id
router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const checkRes = await client.query(
            "SELECT work_order_id, status, vehicle_id FROM work_order_data WHERE work_order_id = $1 FOR UPDATE;",
            [id]
        );

        if (checkRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: `Work order [${id}] not found.` });
        }

        const wo = checkRes.rows[0];
        const allowedPhases = ["received", "diagnosed"];
        if (!allowedPhases.includes(wo.status)) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: `Cannot delete work order in '${wo.status}' state. Only orders in 'received' or 'diagnosed' phase can be deleted. Once repair progress begins, work orders are locked.`,
            });
        }

        // Restore any allocated inventory parts
        const allocatedParts = await client.query(
            "SELECT part_id, quantity_or_hours FROM work_order_items WHERE work_order_id = $1 AND item_type = 'part' AND part_id IS NOT NULL;",
            [id]
        );

        for (const part of allocatedParts.rows) {
            const qty = parseFloat(part.quantity_or_hours) || 0;
            if (qty > 0) {
                await client.query(
                    "UPDATE inventory_data SET stock_quantity = stock_quantity + $1 WHERE part_id = $2;",
                    [qty, part.part_id]
                );
            }
        }

        // Delete dependencies
        await client.query("DELETE FROM work_order_items WHERE work_order_id = $1;", [id]);
        await client.query("DELETE FROM work_order_media WHERE work_order_id = $1;", [id]);
        await client.query("DELETE FROM invoice_data WHERE work_order_id = $1;", [id]);
        await client.query("DELETE FROM scheduled_tasks WHERE work_order_id = $1;", [id]);
        await client.query("DELETE FROM audit_logs WHERE work_order_id = $1;", [id]);
        await client.query("DELETE FROM work_order_data WHERE work_order_id = $1;", [id]);

        await client.query("COMMIT");

        // Flush caches
        await deleteCache(`garage:cache:workorder:details:${id}`);
        await deleteCachePattern("garage:cache:workorders:*");
        await deleteCachePattern("garage:cache:dashboard:*");
        await deleteCachePattern("garage:cache:inventory:*");
        await deleteCachePattern("garage:cache:schedules:*");
        await deleteCachePattern("garage:cache:owner:vehicles:*");
        await deleteCachePattern("garage:cache:vehicle:*");
        await deleteCachePattern("garage:cache:owners:*");

        res.json({
            success: true,
            message: `Work Order [${id}] has been completely deleted, and any allocated parts have been returned to inventory.`,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error(`Error deleting work order [${id}]:`, err);
        res.status(500).json({ error: "Failed to delete work order", details: err.message });
    } finally {
        client.release();
    }
});

// Status & Progress Pipeline Transition
router.patch("/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status, staff_id, notes } = req.body;

    const validStatuses = ["received", "diagnosed", "in_progress", "ready", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    const VALID_TRANSITIONS = {
        received: ["diagnosed", "in_progress", "cancelled"],
        diagnosed: ["in_progress", "received", "cancelled"],
        in_progress: ["ready", "diagnosed", "cancelled"],
        ready: ["completed", "in_progress", "cancelled"],
        completed: ["ready"],
        cancelled: ["received"],
    };

    try {
        const currentRes = await pool.query(
            "SELECT status FROM work_order_data WHERE work_order_id = $1;",
            [id]
        );

        if (currentRes.rows.length === 0) {
            return res.status(404).json({ error: "Work order not found" });
        }

        const currentStatus = currentRes.rows[0].status;

        if (currentStatus !== status) {
            const allowed = VALID_TRANSITIONS[currentStatus] || [];
            if (!allowed.includes(status)) {
                return res.status(400).json({
                    error: `Invalid transition from '${currentStatus}' to '${status}'. Allowed next stages: ${allowed.join(", ") || "none"}.`,
                });
            }
        }

        const result = await pool.query(
            `UPDATE work_order_data 
             SET status = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE work_order_id = $2 
             RETURNING *;`,
            [status, id]
        );

        // Audit Log
        await pool.query(
            `INSERT INTO audit_logs (work_order_id, staff_id, event_type, description, payload_json)
             VALUES ($1, $2, 'STATUS_CHANGE', $3, $4);`,
            [
                id,
                staff_id || null,
                `Work Order ${id} transitioned from '${currentStatus.toUpperCase()}' to '${status.toUpperCase()}'`,
                JSON.stringify({ previous_status: currentStatus, new_status: status, notes: notes || null }),
            ]
        );

        await deleteCachePattern("garage:cache:workorders:*");
        await deleteCache(`garage:cache:workorder:details:${id}`);
        await deleteCachePattern("garage:cache:owner:vehicles:*");
        await deleteCachePattern("garage:cache:vehicle:*");
        await deleteCachePattern("garage:cache:dashboard:*");

        res.json({ success: true, message: `Status updated to ${status}`, data: result.rows[0] });
    } catch (err) {
        console.error("Error updating work order status:", err);
        res.status(500).json({ error: "Failed to update status", details: err.message });
    }
});

// Update Work Order Details
router.patch("/:id/details", async (req, res) => {
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

// Line Items Management
router.post("/:id/items", async (req, res) => {
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
        await deleteCachePattern("garage:cache:owner:vehicles:*");
        await deleteCachePattern("garage:cache:vehicle:*");
        await deleteCachePattern("garage:cache:owners:*");

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

router.delete("/:id/items/:itemId", async (req, res) => {
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
        await deleteCachePattern("garage:cache:owner:vehicles:*");
        await deleteCachePattern("garage:cache:vehicle:*");
        await deleteCachePattern("garage:cache:owners:*");

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

// Media Management
router.post("/:id/media", async (req, res) => {
    const { id } = req.params;
    const { file_url, file_type = "vehicle_condition" } = req.body;

    if (!file_url) {
        return res.status(400).json({ error: "file_url is required." });
    }

    const validTypes = ["vehicle_condition", "part_damage", "receipt", "other"];
    const sanitizedType = validTypes.includes(file_type) ? file_type : "vehicle_condition";

    try {
        const query = `
            INSERT INTO work_order_media (work_order_id, file_url, file_type)
            VALUES ($1, $2, $3)
            RETURNING *;
        `;
        const result = await pool.query(query, [id, file_url.trim(), sanitizedType]);

        await deleteCache(`garage:cache:workorder:details:${id}`);
        await deleteCachePattern("garage:cache:workorders:*");
        await deleteCachePattern("garage:cache:vehicle:*");

        res.status(201).json({ success: true, message: "Media attached successfully", data: result.rows[0] });
    } catch (err) {
        console.error("Error attaching media:", err);
        res.status(500).json({ error: "Failed to attach media", details: err.message });
    }
});

router.delete("/:id/media/:mediaId", async (req, res) => {
    const { id, mediaId } = req.params;

    try {
        const query = `
            DELETE FROM work_order_media
            WHERE media_id = $1 AND work_order_id = $2
            RETURNING *;
        `;
        const result = await pool.query(query, [parseInt(mediaId, 10), id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Media item not found." });
        }

        await deleteCache(`garage:cache:workorder:details:${id}`);
        await deleteCachePattern("garage:cache:workorders:*");
        await deleteCachePattern("garage:cache:vehicle:*");

        res.json({ success: true, message: "Media removed successfully", data: result.rows[0] });
    } catch (err) {
        console.error("Error removing media:", err);
        res.status(500).json({ error: "Failed to remove media", details: err.message });
    }
});

export default router;
