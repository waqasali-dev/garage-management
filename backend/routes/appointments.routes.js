import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCachePattern } from "../redis.js";

const router = express.Router();

// Helper to format timestamps
const combineDateTime = (dateStr, timeStr) => {
    return `${dateStr}T${timeStr}:00`;
};

// Helper: Convert "HH:MM" to minutes from midnight
const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = String(timeStr).split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
};

// Helper: Validate that a requested slot falls within workshop operating shifts (excluding breaks)
const validateWithinWorkshopHours = async (client, appointmentDate, startTime, endTime) => {
    const settingsRes = await client.query("SELECT working_hours FROM workshop_settings WHERE id = 1;");
    const workingHours = settingsRes.rows[0]?.working_hours;
    if (!workingHours) return { valid: true };

    const targetDate = new Date(`${appointmentDate}T00:00:00`);
    let dayOfWeek = targetDate.getDay();
    dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

    const openDays = Array.isArray(workingHours.operating_days) ? workingHours.operating_days : [1, 2, 3, 4, 5, 6];
    if (!openDays.includes(dayOfWeek)) {
        return {
            valid: false,
            error: `Workshop is closed on this day of the week (${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dayOfWeek - 1]}).`,
        };
    }

    const activeShifts = (workingHours.daily_overrides && workingHours.daily_overrides[dayOfWeek])
        || (Array.isArray(workingHours.shifts) && workingHours.shifts.length > 0 ? workingHours.shifts : [
            { start: "08:00", end: "18:00" }
        ]);

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);

    // Must fit entirely inside AT LEAST ONE active shift window
    const matchingShift = activeShifts.find((shift) => {
        const sStart = timeToMinutes(shift.start);
        const sEnd = timeToMinutes(shift.end);
        return startMin >= sStart && endMin <= sEnd;
    });

    if (!matchingShift) {
        const shiftsText = activeShifts.map((s) => `${s.start} - ${s.end}`).join(", ");
        return {
            valid: false,
            error: `Requested appointment time (${startTime} - ${endTime}) falls outside workshop working hours or during a break. Operating shifts: ${shiftsText}.`,
        };
    }

    return { valid: true };
};

// ==========================================
// 1. GET /api/appointments - List appointments with full joins
// ==========================================
router.get("/", async (req, res) => {
    const { date, bay_id, vehicle_id, owner_id, status } = req.query;
    const cacheKey = `garage:cache:appointments:${date || "all"}:${bay_id || "all"}:${owner_id || "all"}:${status || "all"}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        let whereConditions = ["1=1"];
        const queryParams = [];

        if (date) {
            queryParams.push(date);
            whereConditions.push(`a.appointment_date = $${queryParams.length}::DATE`);
        }
        if (bay_id) {
            queryParams.push(bay_id);
            whereConditions.push(`a.bay_id = $${queryParams.length}`);
        }
        if (vehicle_id) {
            queryParams.push(vehicle_id);
            whereConditions.push(`a.vehicle_id = $${queryParams.length}`);
        }
        if (owner_id) {
            queryParams.push(owner_id);
            whereConditions.push(`a.owner_id = $${queryParams.length}`);
        }
        if (status) {
            queryParams.push(status);
            whereConditions.push(`a.status = $${queryParams.length}`);
        }

        const query = `
            SELECT 
                a.appointment_id,
                a.owner_id,
                a.vehicle_id,
                a.bay_id,
                a.work_order_id,
                TO_CHAR(a.appointment_date, 'YYYY-MM-DD') AS appointment_date,
                TO_CHAR(a.start_time, 'HH24:MI') AS start_time,
                TO_CHAR(a.end_time, 'HH24:MI') AS end_time,
                a.service_type,
                a.customer_notes,
                a.status,
                a.booked_by,
                a.created_at,
                a.updated_at,
                b.bay_name,
                b.bay_type,
                v.license_plate,
                v.make,
                v.model,
                v.year,
                v.vin,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone,
                o.email_address AS owner_email,
                w.status AS work_order_status
            FROM appointments a
            LEFT JOIN workshop_bays b ON a.bay_id = b.bay_id
            LEFT JOIN vehicles v ON a.vehicle_id = v.vehicle_id
            LEFT JOIN car_owners o ON a.owner_id = o.owner_id
            LEFT JOIN work_order_data w ON a.work_order_id = w.work_order_id
            WHERE ${whereConditions.join(" AND ")}
            ORDER BY a.appointment_date ASC, a.start_time ASC;
        `;
        const result = await pool.query(query, queryParams);

        await setCache(cacheKey, result.rows, 120);
        res.json({ success: true, source: "postgres", data: result.rows });
    } catch (err) {
        console.error("Error fetching appointments:", err);
        res.status(500).json({ error: "Failed to fetch appointments", details: err.message });
    }
});

// ==========================================
// 2. GET /api/appointments/eligible-work-orders
// Returns work orders in 'received', 'diagnosed', or 'scheduled' phase with schedule status
// ==========================================
router.get("/eligible-work-orders", async (req, res) => {
    try {
        const query = `
            SELECT 
                w.work_order_id,
                w.vehicle_id,
                w.status,
                w.bay_assigned,
                w.scheduled_start,
                w.scheduled_end,
                w.initial_observations,
                w.assigned_staff_id,
                w.booked_by,
                v.make,
                v.model,
                v.year,
                v.license_plate,
                v.vin,
                o.owner_id,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone,
                s.full_name AS assigned_staff_name,
                app_info.appointment_id,
                app_info.bay_id AS appointment_bay_id,
                app_info.bay_name AS appointment_bay_name,
                app_info.appointment_date,
                app_info.start_time AS appointment_start_time,
                app_info.end_time AS appointment_end_time,
                CASE 
                    WHEN app_info.appointment_id IS NOT NULL OR w.status = 'scheduled' THEN true 
                    ELSE false 
                END AS is_scheduled
            FROM work_order_data w
            JOIN vehicles v ON w.vehicle_id = v.vehicle_id
            JOIN car_owners o ON v.owner_id = o.owner_id
            LEFT JOIN staff_data s ON w.assigned_staff_id = s.staff_id
            LEFT JOIN LATERAL (
                SELECT 
                    a.appointment_id,
                    a.bay_id,
                    wb.bay_name,
                    TO_CHAR(a.appointment_date, 'YYYY-MM-DD') AS appointment_date,
                    TO_CHAR(a.start_time, 'HH24:MI') AS start_time,
                    TO_CHAR(a.end_time, 'HH24:MI') AS end_time
                FROM appointments a
                LEFT JOIN workshop_bays wb ON a.bay_id = wb.bay_id
                WHERE a.work_order_id = w.work_order_id
                  AND a.status NOT IN ('cancelled', 'completed')
                ORDER BY a.appointment_date DESC, a.start_time DESC
                LIMIT 1
            ) app_info ON true
            WHERE w.status IN ('received', 'diagnosed', 'scheduled')
            ORDER BY 
                CASE 
                    WHEN w.status = 'received' THEN 1 
                    WHEN w.status = 'diagnosed' THEN 2 
                    WHEN w.status = 'scheduled' THEN 3
                    ELSE 4 
                END,
                w.created_at ASC;
        `;
        const result = await pool.query(query);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows,
        });
    } catch (err) {
        console.error("Error fetching eligible work orders:", err);
        res.status(500).json({ error: "Failed to fetch eligible work orders", details: err.message });
    }
});

// ==========================================
// 3. POST /api/appointments/admin-appoint
// Admin appoints a car in 'received' or 'diagnosed' status to a bay slot
// ==========================================
router.post("/admin-appoint", async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const {
            work_order_id,
            bay_id,
            appointment_date,
            start_time,
            end_time,
            assigned_staff_id,
            service_type = "Diagnostic & Repair Intake",
            customer_notes = "",
        } = req.body;

        if (!work_order_id || !bay_id || !appointment_date || !start_time || !end_time) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: "work_order_id, bay_id, appointment_date, start_time, and end_time are required.",
            });
        }

        // STEP 1: Verify Work Order and STRICT PHASE REQUIREMENT ('received' or 'diagnosed')
        const woRes = await client.query(
            `SELECT w.work_order_id, w.vehicle_id, w.status, w.bay_assigned, v.owner_id, v.make, v.model, v.license_plate 
             FROM work_order_data w
             JOIN vehicles v ON w.vehicle_id = v.vehicle_id
             WHERE w.work_order_id = $1;`,
            [work_order_id]
        );

        if (woRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: `Work order '${work_order_id}' not found.` });
        }

        const wo = woRes.rows[0];

        if (wo.status !== "received" && wo.status !== "diagnosed" && wo.status !== "scheduled") {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: `Appointment constraint violation: Only cars in 'received', 'diagnosed', or 'scheduled' phase can be appointed to a bay. Current phase for ${wo.make} ${wo.model} (${wo.license_plate}) is '${wo.status.toUpperCase()}'.`,
            });
        }

        // STEP 2: Verify Bay exists and is active
        const bayRes = await client.query(
            `SELECT bay_id, bay_name, opening_time, closing_time, is_active FROM workshop_bays WHERE bay_id = $1;`,
            [bay_id]
        );
        if (bayRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: `Workshop Bay '${bay_id}' not found.` });
        }
        const bay = bayRes.rows[0];
        if (!bay.is_active) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: `Workshop Bay '${bay.bay_name}' is currently inactive.` });
        }

        // STEP 2.5: Verify within Workshop Working Hours and Shifts (excludes breaks)
        const hoursCheck = await validateWithinWorkshopHours(client, appointment_date, start_time, end_time);
        if (!hoursCheck.valid) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: hoursCheck.error, code: "OUTSIDE_WORKING_HOURS" });
        }

        // STEP 3: CONFLICT CHECK - Bay Overlap
        const bayConflictQuery = `
            SELECT 
                'appointment' as source,
                a.appointment_id as id,
                TO_CHAR(a.start_time, 'HH24:MI') as start_time,
                TO_CHAR(a.end_time, 'HH24:MI') as end_time,
                v.license_plate,
                v.make,
                v.model
            FROM appointments a
            LEFT JOIN vehicles v ON a.vehicle_id = v.vehicle_id
            WHERE a.bay_id = $1 
              AND a.appointment_date = $2::DATE
              AND a.status NOT IN ('cancelled', 'completed')
              AND (a.work_order_id IS NULL OR a.work_order_id != $5)
              AND (a.start_time < $4::TIME AND a.end_time > $3::TIME)
            UNION ALL
            SELECT 
                'scheduled_task' as source,
                t.task_id as id,
                TO_CHAR(t.start_time, 'HH24:MI') as start_time,
                TO_CHAR(t.end_time, 'HH24:MI') as end_time,
                v.license_plate,
                v.make,
                v.model
            FROM scheduled_tasks t
            LEFT JOIN vehicles v ON t.vehicle_id = v.vehicle_id
            WHERE t.bay_assigned = $1 
              AND t.scheduled_date = $2::DATE
              AND t.status NOT IN ('cancelled', 'completed')
              AND (t.work_order_id IS NULL OR t.work_order_id != $5)
              AND (t.start_time < $4::TIME AND t.end_time > $3::TIME)
            LIMIT 1;
        `;
        const bayConflictRes = await client.query(bayConflictQuery, [
            bay_id,
            appointment_date,
            start_time,
            end_time,
            work_order_id,
        ]);

        if (bayConflictRes.rows.length > 0) {
            const conflict = bayConflictRes.rows[0];
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: `Bay Schedule Conflict: '${bay.bay_name}' is already occupied from ${conflict.start_time} to ${conflict.end_time} by vehicle ${conflict.make || ''} ${conflict.model || ''} (${conflict.license_plate || 'In-Bay'}).`,
                conflictType: "BAY_OCCUPIED",
                conflict,
            });
        }

        // STEP 4: CONFLICT CHECK - Vehicle Overlap (Car cannot be in two bays at once, ignoring self work_order)
        const vehicleConflictQuery = `
            SELECT 
                a.appointment_id,
                a.bay_id,
                TO_CHAR(a.start_time, 'HH24:MI') as start_time,
                TO_CHAR(a.end_time, 'HH24:MI') as end_time
            FROM appointments a
            WHERE a.vehicle_id = $1
              AND a.appointment_date = $2::DATE
              AND a.status NOT IN ('cancelled', 'completed')
              AND (a.work_order_id IS NULL OR a.work_order_id != $5)
              AND (a.start_time < $4::TIME AND a.end_time > $3::TIME)
            LIMIT 1;
        `;
        const vehicleConflictRes = await client.query(vehicleConflictQuery, [
            wo.vehicle_id,
            appointment_date,
            start_time,
            end_time,
            work_order_id,
        ]);

        if (vehicleConflictRes.rows.length > 0) {
            const conflict = vehicleConflictRes.rows[0];
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: `Vehicle Overlap Conflict: This car (${wo.license_plate}) is already appointed to Bay '${conflict.bay_id}' from ${conflict.start_time} to ${conflict.end_time}.`,
                conflictType: "VEHICLE_BUSY",
                conflict,
            });
        }

        // STEP 4.5: Cancel older active appointments and scheduled tasks for this work order before re-appointing
        await client.query(
            `UPDATE appointments 
             SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
             WHERE work_order_id = $1 AND status NOT IN ('cancelled', 'completed');`,
            [work_order_id]
        );
        await client.query(
            `UPDATE scheduled_tasks 
             SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
             WHERE work_order_id = $1 AND status NOT IN ('cancelled', 'completed');`,
            [work_order_id]
        );

        // STEP 5: INSERT APPOINTMENT RECORD
        const insertAppQuery = `
            INSERT INTO appointments (
                owner_id,
                vehicle_id,
                bay_id,
                work_order_id,
                appointment_date,
                start_time,
                end_time,
                service_type,
                customer_notes,
                status,
                booked_by
            )
            VALUES ($1, $2, $3, $4, $5::DATE, $6::TIME, $7::TIME, $8, $9, 'confirmed', 'admin')
            RETURNING *;
        `;
        const newAppRes = await client.query(insertAppQuery, [
            wo.owner_id,
            wo.vehicle_id,
            bay_id,
            work_order_id,
            appointment_date,
            start_time,
            end_time,
            service_type.trim(),
            customer_notes ? customer_notes.trim() : null,
        ]);
        const appointment = newAppRes.rows[0];

        // STEP 6: UPDATE WORK ORDER DATA (Status = 'scheduled', Bay & Timestamps)
        const scheduledStart = `${appointment_date} ${start_time}:00`;
        const scheduledEnd = `${appointment_date} ${end_time}:00`;

        await client.query(
            `UPDATE work_order_data
             SET status = 'scheduled',
                 bay_assigned = $1,
                 scheduled_start = $2::TIMESTAMPTZ,
                 scheduled_end = $3::TIMESTAMPTZ,
                 assigned_staff_id = COALESCE($4, assigned_staff_id),
                 updated_at = CURRENT_TIMESTAMP
             WHERE work_order_id = $5;`,
            [
                bay_id,
                scheduledStart,
                scheduledEnd,
                assigned_staff_id ? parseInt(assigned_staff_id, 10) : null,
                work_order_id,
            ]
        );

        // STEP 7: SYNC INTO SCHEDULED_TASKS FOR WORKSHOP CALENDAR
        const taskTitle = `WO ${work_order_id} - ${wo.make} ${wo.model} (${service_type})`;
        await client.query(
            `INSERT INTO scheduled_tasks (
                work_order_id,
                vehicle_id,
                assigned_staff_id,
                task_title,
                task_description,
                priority,
                status,
                bay_assigned,
                scheduled_date,
                start_time,
                end_time
            )
            VALUES ($1, $2, $3, $4, $5, 'standard', 'scheduled', $6, $7::DATE, $8::TIME, $9::TIME);`,
            [
                work_order_id,
                wo.vehicle_id,
                assigned_staff_id ? parseInt(assigned_staff_id, 10) : null,
                taskTitle,
                customer_notes || `Appointed to ${bay.bay_name}`,
                bay_id,
                appointment_date,
                start_time,
                end_time,
            ]
        );

        // STEP 8: AUDIT LOG
        await client.query(
            `INSERT INTO audit_logs (work_order_id, staff_id, event_type, description, payload_json)
             VALUES ($1, $2, 'APPOINTMENT_SCHEDULED', $3, $4);`,
            [
                work_order_id,
                assigned_staff_id ? parseInt(assigned_staff_id, 10) : null,
                `Car ${wo.make} ${wo.model} (${wo.license_plate}) appointed to ${bay.bay_name} on ${appointment_date} from ${start_time} to ${end_time}.`,
                JSON.stringify({ appointment_id: appointment.appointment_id, bay_id, appointment_date, start_time, end_time }),
            ]
        );

        await client.query("COMMIT");

        // STEP 9: CACHE INVALIDATION
        await deleteCachePattern("garage:cache:appointments:*");
        await deleteCachePattern("garage:cache:schedules:*");
        await deleteCachePattern("garage:cache:workorder:*");
        await deleteCachePattern("garage:cache:bays:*");

        res.status(201).json({
            success: true,
            message: `Successfully appointed ${wo.make} ${wo.model} (${wo.license_plate}) to ${bay.bay_name} for ${appointment_date} at ${start_time}!`,
            data: appointment,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error in admin appointment:", err);
        res.status(500).json({ error: "Failed to schedule appointment", details: err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// 4. POST /api/appointments/customer-book
// Customer books an appointment for one of their vehicles
// ==========================================
router.post("/customer-book", async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const {
            vehicle_id,
            owner_id,
            bay_id,
            appointment_date,
            start_time,
            end_time,
            service_type = "Routine Service & Inspection",
            customer_notes = "",
        } = req.body;

        if (!vehicle_id || !bay_id || !appointment_date || !start_time || !end_time) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: "vehicle_id, bay_id, appointment_date, start_time, and end_time are required.",
            });
        }

        // STEP 1: Resolve and verify vehicle
        const vehRes = await client.query(
            `SELECT v.vehicle_id, v.owner_id, v.vin, v.make, v.model, v.year, v.license_plate, o.full_name as owner_name, o.phone_number 
             FROM vehicles v
             JOIN car_owners o ON v.owner_id = o.owner_id
             WHERE v.vehicle_id = $1;`,
            [vehicle_id]
        );

        if (vehRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: `Vehicle '${vehicle_id}' not found.` });
        }

        const vehicle = vehRes.rows[0];
        const resolvedOwnerId = owner_id || vehicle.owner_id;

        // STEP 1.5: Verify vehicle does not already have an active upcoming booking that has not passed
        const existingAppQuery = `
            SELECT 
                a.appointment_id,
                a.bay_id,
                wb.bay_name,
                TO_CHAR(a.appointment_date, 'YYYY-MM-DD') AS appointment_date,
                TO_CHAR(a.start_time, 'HH24:MI') AS start_time,
                TO_CHAR(a.end_time, 'HH24:MI') AS end_time,
                a.service_type
            FROM appointments a
            LEFT JOIN workshop_bays wb ON a.bay_id = wb.bay_id
            WHERE a.vehicle_id = $1
              AND a.status NOT IN ('cancelled', 'completed')
              AND (a.appointment_date > CURRENT_DATE OR (a.appointment_date = CURRENT_DATE AND a.end_time > CURRENT_TIME))
            LIMIT 1;
        `;
        const existingAppRes = await client.query(existingAppQuery, [vehicle.vehicle_id]);
        if (existingAppRes.rows.length > 0) {
            const existing = existingAppRes.rows[0];
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: `This vehicle (${vehicle.make} ${vehicle.model} - ${vehicle.license_plate}) already has an active upcoming appointment for ${existing.bay_name || 'Workshop Bay'} on ${existing.appointment_date} from ${existing.start_time} to ${existing.end_time}. You cannot book another schedule for this car until that appointment has passed or is cancelled.`,
                code: "VEHICLE_ALREADY_SCHEDULED",
                activeAppointment: existing,
            });
        }

        // STEP 2: Verify Bay exists and is active
        const bayRes = await client.query(
            `SELECT bay_id, bay_name, opening_time, closing_time, is_active FROM workshop_bays WHERE bay_id = $1;`,
            [bay_id]
        );
        if (bayRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: `Workshop Bay '${bay_id}' not found.` });
        }
        const bay = bayRes.rows[0];
        if (!bay.is_active) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: `Workshop Bay '${bay.bay_name}' is currently unavailable.` });
        }

        // STEP 2.5: Verify within Workshop Working Hours and Shifts (excludes breaks)
        const hoursCheck = await validateWithinWorkshopHours(client, appointment_date, start_time, end_time);
        if (!hoursCheck.valid) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: hoursCheck.error, code: "OUTSIDE_WORKING_HOURS" });
        }

        // STEP 3: CONFLICT CHECK - Bay Overlap
        const conflictQuery = `
            SELECT 
                TO_CHAR(start_time, 'HH24:MI') as start_time,
                TO_CHAR(end_time, 'HH24:MI') as end_time
            FROM appointments
            WHERE bay_id = $1 
              AND appointment_date = $2::DATE
              AND status NOT IN ('cancelled', 'completed')
              AND (start_time < $4::TIME AND end_time > $3::TIME)
            UNION ALL
            SELECT 
                TO_CHAR(start_time, 'HH24:MI') as start_time,
                TO_CHAR(end_time, 'HH24:MI') as end_time
            FROM scheduled_tasks
            WHERE bay_assigned = $1 
              AND scheduled_date = $2::DATE
              AND status NOT IN ('cancelled', 'completed')
              AND (start_time < $4::TIME AND end_time > $3::TIME)
            LIMIT 1;
        `;
        const conflictRes = await client.query(conflictQuery, [
            bay_id,
            appointment_date,
            start_time,
            end_time,
        ]);

        if (conflictRes.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: `This time slot (${start_time} - ${end_time}) on ${bay.bay_name} was just booked by another customer. Please select another available time.`,
                conflictType: "SLOT_TAKEN",
            });
        }

        // STEP 4: CREATE WORK ORDER IN 'scheduled' STATUS FOR INTAKE WORKFLOW
        const scheduledStart = `${appointment_date} ${start_time}:00`;
        const scheduledEnd = `${appointment_date} ${end_time}:00`;
        const initialObservations = customer_notes 
            ? `[Customer Online Booking - ${service_type}] ${customer_notes}` 
            : `[Customer Online Booking] Service requested: ${service_type}`;

        const insertWoQuery = `
            INSERT INTO work_order_data (
                vehicle_id,
                status,
                bay_assigned,
                scheduled_start,
                scheduled_end,
                initial_observations,
                estimated_cost,
                total_cost,
                booked_by
            )
            VALUES ($1, 'scheduled', $2, $3::TIMESTAMPTZ, $4::TIMESTAMPTZ, $5, 0.00, 0.00, 'customer')
            RETURNING work_order_id;
        `;
        const woRes = await client.query(insertWoQuery, [
            vehicle.vehicle_id,
            bay_id,
            scheduledStart,
            scheduledEnd,
            initialObservations,
        ]);
        const newWorkOrderId = woRes.rows[0].work_order_id;

        // STEP 5: INSERT APPOINTMENT
        const insertAppQuery = `
            INSERT INTO appointments (
                owner_id,
                vehicle_id,
                bay_id,
                work_order_id,
                appointment_date,
                start_time,
                end_time,
                service_type,
                customer_notes,
                status,
                booked_by
            )
            VALUES ($1, $2, $3, $4, $5::DATE, $6::TIME, $7::TIME, $8, $9, 'confirmed', 'customer')
            RETURNING *;
        `;
        const newAppRes = await client.query(insertAppQuery, [
            resolvedOwnerId,
            vehicle.vehicle_id,
            bay_id,
            newWorkOrderId,
            appointment_date,
            start_time,
            end_time,
            service_type.trim(),
            customer_notes ? customer_notes.trim() : null,
        ]);
        const appointment = newAppRes.rows[0];

        // STEP 6: CREATE SCHEDULED TASK FOR CALENDAR SYNC
        await client.query(
            `INSERT INTO scheduled_tasks (
                work_order_id,
                vehicle_id,
                task_title,
                task_description,
                priority,
                status,
                bay_assigned,
                scheduled_date,
                start_time,
                end_time
            )
            VALUES ($1, $2, $3, $4, 'standard', 'scheduled', $5, $6::DATE, $7::TIME, $8::TIME);`,
            [
                newWorkOrderId,
                vehicle.vehicle_id,
                `Customer Appt: ${vehicle.make} ${vehicle.model} (${service_type})`,
                customer_notes || `Booked online by ${vehicle.owner_name}`,
                bay_id,
                appointment_date,
                start_time,
                end_time,
            ]
        );

        // STEP 7: AUDIT LOG
        await client.query(
            `INSERT INTO audit_logs (work_order_id, event_type, description, payload_json)
             VALUES ($1, 'CUSTOMER_BOOKING', $2, $3);`,
            [
                newWorkOrderId,
                `Customer ${vehicle.owner_name} booked service appointment for ${vehicle.make} ${vehicle.model} (${vehicle.license_plate}) on ${appointment_date} from ${start_time} to ${end_time}.`,
                JSON.stringify({ appointment_id: appointment.appointment_id, bay_id, appointment_date, start_time, end_time }),
            ]
        );

        await client.query("COMMIT");

        // STEP 8: CACHE INVALIDATION
        await deleteCachePattern("garage:cache:appointments:*");
        await deleteCachePattern("garage:cache:schedules:*");
        await deleteCachePattern("garage:cache:workorder:*");
        await deleteCachePattern("garage:cache:bays:*");
        await deleteCachePattern("garage:cache:owner:*");

        res.status(201).json({
            success: true,
            message: `🎉 Appointment confirmed for your ${vehicle.make} ${vehicle.model} on ${appointment_date} at ${start_time}!`,
            data: {
                ...appointment,
                work_order_id: newWorkOrderId,
                vehicle: {
                    make: vehicle.make,
                    model: vehicle.model,
                    license_plate: vehicle.license_plate,
                },
                bay_name: bay.bay_name,
            },
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error in customer appointment booking:", err);
        res.status(500).json({ error: "Failed to book appointment", details: err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// 5. PATCH /api/appointments/:id/cancel
// Cancel appointment and free bay slot
// ==========================================
router.patch("/:id/cancel", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const appRes = await client.query(
            `SELECT appointment_id, work_order_id, bay_id, appointment_date, start_time, end_time, status 
             FROM appointments WHERE appointment_id = $1;`,
            [id]
        );

        if (appRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Appointment not found" });
        }

        const app = appRes.rows[0];

        // Update appointment status to cancelled
        await client.query(
            `UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE appointment_id = $1;`,
            [id]
        );

        // If linked to work order, update scheduled tasks and revert work order status
        if (app.work_order_id) {
            await client.query(
                `UPDATE scheduled_tasks 
                 SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
                 WHERE work_order_id = $1 AND scheduled_date = $2::DATE;`,
                [app.work_order_id, app.appointment_date]
            );
            await client.query(
                `UPDATE work_order_data
                 SET status = 'received',
                     bay_assigned = NULL,
                     scheduled_start = NULL,
                     scheduled_end = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE work_order_id = $1 AND status = 'scheduled';`,
                [app.work_order_id]
            );
        }

        await client.query("COMMIT");

        await deleteCachePattern("garage:cache:appointments:*");
        await deleteCachePattern("garage:cache:schedules:*");
        await deleteCachePattern("garage:cache:workorder:*");
        await deleteCachePattern("garage:cache:bays:*");

        res.json({
            success: true,
            message: `Appointment '${id}' has been cancelled and the bay slot has been freed.`,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error cancelling appointment:", err);
        res.status(500).json({ error: "Failed to cancel appointment", details: err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// 6. PUT /api/appointments/:id - Admin Edit / Reschedule Appointment
// ==========================================
router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const {
            bay_id,
            appointment_date,
            start_time,
            end_time,
            service_type,
            customer_notes,
            assigned_staff_id,
            status,
        } = req.body;

        const appRes = await client.query(
            `SELECT a.*, v.license_plate, v.make, v.model, v.owner_id 
             FROM appointments a
             JOIN vehicles v ON a.vehicle_id = v.vehicle_id
             WHERE a.appointment_id = $1;`,
            [id]
        );

        if (appRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Appointment not found." });
        }

        const app = appRes.rows[0];
        const targetBayId = bay_id || app.bay_id;
        const targetDate = appointment_date || app.appointment_date;
        const targetStart = start_time || app.start_time;
        const targetEnd = end_time || app.end_time;

        // Verify bay
        const bayRes = await client.query("SELECT bay_name, is_active FROM workshop_bays WHERE bay_id = $1;", [targetBayId]);
        if (bayRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: `Workshop bay '${targetBayId}' not found.` });
        }
        const bay = bayRes.rows[0];

        // Verify hours
        const hoursCheck = await validateWithinWorkshopHours(client, targetDate, targetStart, targetEnd);
        if (!hoursCheck.valid) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: hoursCheck.error });
        }

        // Conflict check on Bay (excluding this appointment & this work order's task)
        const bayConflictQuery = `
            SELECT 'appointment' as source, a.appointment_id as id, TO_CHAR(a.start_time, 'HH24:MI') as start_time, TO_CHAR(a.end_time, 'HH24:MI') as end_time
            FROM appointments a
            WHERE a.bay_id = $1 
              AND a.appointment_date = $2::DATE
              AND a.status NOT IN ('cancelled', 'completed')
              AND a.appointment_id != $5
              AND (a.start_time < $4::TIME AND a.end_time > $3::TIME)
            UNION ALL
            SELECT 'scheduled_task' as source, t.task_id as id, TO_CHAR(t.start_time, 'HH24:MI') as start_time, TO_CHAR(t.end_time, 'HH24:MI') as end_time
            FROM scheduled_tasks t
            WHERE t.bay_assigned = $1 
              AND t.scheduled_date = $2::DATE
              AND t.status NOT IN ('cancelled', 'completed')
              AND (t.work_order_id IS NULL OR t.work_order_id != $6)
              AND (t.start_time < $4::TIME AND t.end_time > $3::TIME)
            LIMIT 1;
        `;
        const bayConflictRes = await client.query(bayConflictQuery, [
            targetBayId,
            targetDate,
            targetStart,
            targetEnd,
            id,
            app.work_order_id || 'NO_WO',
        ]);

        if (bayConflictRes.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: `Bay Schedule Conflict: '${bay.bay_name}' is already occupied from ${bayConflictRes.rows[0].start_time} to ${bayConflictRes.rows[0].end_time}.`,
            });
        }

        // Update appointment
        const updateAppRes = await client.query(
            `UPDATE appointments
             SET bay_id = $1,
                 appointment_date = $2::DATE,
                 start_time = $3::TIME,
                 end_time = $4::TIME,
                 service_type = COALESCE($5, service_type),
                 customer_notes = COALESCE($6, customer_notes),
                 status = COALESCE($7, status),
                 updated_at = CURRENT_TIMESTAMP
             WHERE appointment_id = $8
             RETURNING *;`,
            [
                targetBayId,
                targetDate,
                targetStart,
                targetEnd,
                service_type !== undefined ? service_type : null,
                customer_notes !== undefined ? customer_notes : null,
                status || null,
                id,
            ]
        );

        // Update linked work order
        if (app.work_order_id) {
            const scheduledStart = `${targetDate} ${targetStart}:00`;
            const scheduledEnd = `${targetDate} ${targetEnd}:00`;
            await client.query(
                `UPDATE work_order_data
                 SET bay_assigned = $1,
                     scheduled_start = $2::TIMESTAMPTZ,
                     scheduled_end = $3::TIMESTAMPTZ,
                     assigned_staff_id = COALESCE($4, assigned_staff_id),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE work_order_id = $5;`,
                [
                    targetBayId,
                    scheduledStart,
                    scheduledEnd,
                    assigned_staff_id ? parseInt(assigned_staff_id, 10) : null,
                    app.work_order_id,
                ]
            );

            // Update linked scheduled tasks
            await client.query(
                `UPDATE scheduled_tasks
                 SET bay_assigned = $1,
                     scheduled_date = $2::DATE,
                     start_time = $3::TIME,
                     end_time = $4::TIME,
                     assigned_staff_id = COALESCE($5, assigned_staff_id),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE work_order_id = $6 AND status NOT IN ('cancelled', 'completed');`,
                [
                    targetBayId,
                    targetDate,
                    targetStart,
                    targetEnd,
                    assigned_staff_id ? parseInt(assigned_staff_id, 10) : null,
                    app.work_order_id,
                ]
            );
        }

        await client.query("COMMIT");

        await deleteCachePattern("garage:cache:appointments:*");
        await deleteCachePattern("garage:cache:schedules:*");
        await deleteCachePattern("garage:cache:workorder:*");
        await deleteCachePattern("garage:cache:bays:*");
        await deleteCachePattern("garage:cache:owner:*");

        res.json({
            success: true,
            message: `Appointment '${id}' updated successfully!`,
            data: updateAppRes.rows[0],
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error editing appointment:", err);
        res.status(500).json({ error: "Failed to update appointment", details: err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// 7. DELETE /api/appointments/:id - Admin Delete Appointment
// ==========================================
router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const { delete_work_order } = req.query;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const appRes = await client.query(
            `SELECT appointment_id, work_order_id, bay_id, appointment_date, status 
             FROM appointments WHERE appointment_id = $1;`,
            [id]
        );

        if (appRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Appointment not found." });
        }

        const app = appRes.rows[0];

        // Delete appointment record
        await client.query("DELETE FROM appointments WHERE appointment_id = $1;", [id]);

        if (app.work_order_id) {
            // Delete associated scheduled task
            await client.query("DELETE FROM scheduled_tasks WHERE work_order_id = $1;", [app.work_order_id]);

            if (delete_work_order === "true") {
                // Delete work order line items, media, invoices, audit logs and work order
                await client.query("DELETE FROM work_order_items WHERE work_order_id = $1;", [app.work_order_id]);
                await client.query("DELETE FROM work_order_media WHERE work_order_id = $1;", [app.work_order_id]);
                await client.query("DELETE FROM invoice_data WHERE work_order_id = $1;", [app.work_order_id]);
                await client.query("DELETE FROM audit_logs WHERE work_order_id = $1;", [app.work_order_id]);
                await client.query("DELETE FROM work_order_data WHERE work_order_id = $1;", [app.work_order_id]);
            } else {
                // Revert work order status to 'received' and clear schedule
                await client.query(
                    `UPDATE work_order_data
                     SET status = 'received',
                         bay_assigned = NULL,
                         scheduled_start = NULL,
                         scheduled_end = NULL,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE work_order_id = $1 AND status = 'scheduled';`,
                    [app.work_order_id]
                );
            }
        }

        await client.query("COMMIT");

        await deleteCachePattern("garage:cache:appointments:*");
        await deleteCachePattern("garage:cache:schedules:*");
        await deleteCachePattern("garage:cache:workorder:*");
        await deleteCachePattern("garage:cache:bays:*");
        await deleteCachePattern("garage:cache:owner:*");
        await deleteCachePattern("garage:cache:vehicle:*");

        res.json({
            success: true,
            message: `Appointment '${id}' and associated slot reservation deleted successfully.`,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error deleting appointment:", err);
        res.status(500).json({ error: "Failed to delete appointment", details: err.message });
    } finally {
        client.release();
    }
});

export default router;
