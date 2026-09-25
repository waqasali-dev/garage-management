import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCachePattern } from "../redis.js";

const router = express.Router();

// GET /api/schedules - Fetch all scheduled repair and maintenance tasks
router.get("/", async (req, res) => {
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
        if (err.code === "42P01") {
            console.warn("Notice: scheduled_tasks table does not exist yet.");
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

// POST /api/schedules - Create scheduled task with automated conflict detection
router.post("/", async (req, res) => {
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
        force_override = false,
    } = req.body;

    if (!task_title || !scheduled_date) {
        return res.status(400).json({ error: "task_title and scheduled_date are required." });
    }

    try {
        // Conflict Check: Check for overlapping Bay assignments unless overridden
        if (!force_override && bay_assigned) {
            const bayConflictRes = await pool.query(
                `SELECT task_id, task_title, TO_CHAR(start_time, 'HH24:MI') as start_time, TO_CHAR(end_time, 'HH24:MI') as end_time 
                 FROM scheduled_tasks 
                 WHERE scheduled_date = $1::DATE 
                   AND bay_assigned = $2 
                   AND status NOT IN ('cancelled', 'completed')
                   AND (start_time < $4::TIME AND end_time > $3::TIME)
                 LIMIT 1;`,
                [scheduled_date, bay_assigned, start_time, end_time]
            );

            if (bayConflictRes.rows.length > 0) {
                const conflict = bayConflictRes.rows[0];
                return res.status(409).json({
                    error: `Workshop Bay conflict: '${bay_assigned}' is already booked for '${conflict.task_title}' from ${conflict.start_time} to ${conflict.end_time}.`,
                    conflictType: "BAY_OCCUPIED",
                    conflictTask: conflict,
                });
            }
        }

        // Conflict Check: Check for technician overlap unless overridden
        if (!force_override && assigned_staff_id) {
            const staffConflictRes = await pool.query(
                `SELECT task_id, task_title, TO_CHAR(start_time, 'HH24:MI') as start_time, TO_CHAR(end_time, 'HH24:MI') as end_time 
                 FROM scheduled_tasks 
                 WHERE scheduled_date = $1::DATE 
                   AND assigned_staff_id = $2 
                   AND status NOT IN ('cancelled', 'completed')
                   AND (start_time < $4::TIME AND end_time > $3::TIME)
                 LIMIT 1;`,
                [scheduled_date, parseInt(assigned_staff_id, 10), start_time, end_time]
            );

            if (staffConflictRes.rows.length > 0) {
                const conflict = staffConflictRes.rows[0];
                return res.status(409).json({
                    error: `Technician schedule overlap: This staff member is already assigned to '${conflict.task_title}' from ${conflict.start_time} to ${conflict.end_time}.`,
                    conflictType: "STAFF_BUSY",
                    conflictTask: conflict,
                });
            }
        }

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
        await deleteCachePattern("garage:cache:workorder:details:*");

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

// PATCH /api/schedules/:id - Update scheduled task
router.patch("/:id", async (req, res) => {
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
        await deleteCachePattern("garage:cache:workorder:details:*");

        res.json({ success: true, message: "Task updated successfully", data: result.rows[0] });
    } catch (err) {
        console.error("Error updating scheduled task:", err);
        res.status(500).json({ error: "Failed to update scheduled task", details: err.message });
    }
});

// DELETE /api/schedules/:id - Delete scheduled task
router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query("DELETE FROM scheduled_tasks WHERE task_id = $1 RETURNING *;", [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Scheduled task not found" });
        }

        await deleteCachePattern("garage:cache:schedules:*");
        await deleteCachePattern("garage:cache:workorder:details:*");

        res.json({ success: true, message: "Scheduled task deleted", data: result.rows[0] });
    } catch (err) {
        console.error("Error deleting scheduled task:", err);
        res.status(500).json({ error: "Failed to delete scheduled task", details: err.message });
    }
});

export default router;
