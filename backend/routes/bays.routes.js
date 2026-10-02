import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCachePattern } from "../redis.js";

const router = express.Router();

// Helper to format TIME string "HH:MM:SS" or "HH:MM" to "HH:MM"
const formatTimeHHMM = (timeStr) => {
    if (!timeStr) return "00:00";
    const parts = String(timeStr).split(":");
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
};

// Helper: Convert "HH:MM" to minutes from midnight
const timeToMinutes = (timeStr) => {
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + (m || 0);
};

// Helper: Convert minutes from midnight to "HH:MM"
const minutesToTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// ==========================================
// 1. GET /api/bays - List all Workshop Bays with load telemetry
// ==========================================
router.get("/", async (req, res) => {
    const cacheKey = "garage:cache:bays:all";

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const query = `
            SELECT 
                b.bay_id,
                b.bay_name,
                b.bay_type,
                TO_CHAR(b.opening_time, 'HH24:MI') AS opening_time,
                TO_CHAR(b.closing_time, 'HH24:MI') AS closing_time,
                b.slot_duration_minutes,
                b.operating_days,
                b.is_active,
                b.created_at,
                b.updated_at,
                (
                    SELECT COUNT(*) 
                    FROM appointments a 
                    WHERE a.bay_id = b.bay_id 
                      AND a.appointment_date = CURRENT_DATE 
                      AND a.status NOT IN ('cancelled', 'completed')
                ) AS today_appointments_count,
                (
                    SELECT COUNT(*) 
                    FROM scheduled_tasks t 
                    WHERE t.bay_assigned = b.bay_id 
                      AND t.scheduled_date = CURRENT_DATE 
                      AND t.status NOT IN ('cancelled', 'completed')
                ) AS today_tasks_count
            FROM workshop_bays b
            ORDER BY b.bay_id ASC;
        `;
        const result = await pool.query(query);

        const bays = result.rows.map((row) => {
            const openMin = timeToMinutes(row.opening_time || "08:00");
            const closeMin = timeToMinutes(row.closing_time || "18:00");
            const totalHours = Math.max(1, (closeMin - openMin) / 60);
            
            // Approximate load calculation based on appointments and tasks
            const activeBookings = parseInt(row.today_appointments_count, 10) + parseInt(row.today_tasks_count, 10);
            const loadPercent = Math.min(100, Math.round((activeBookings * 1.5 / totalHours) * 100));

            return {
                ...row,
                today_appointments_count: parseInt(row.today_appointments_count, 10),
                today_tasks_count: parseInt(row.today_tasks_count, 10),
                active_bookings_count: activeBookings,
                loadPercent: `${loadPercent}%`,
                loadType: loadPercent > 75 ? "error" : loadPercent > 40 ? "pending" : "success",
            };
        });

        await setCache(cacheKey, bays, 180);
        res.json({ success: true, source: "postgres", data: bays });
    } catch (err) {
        console.error("Error fetching workshop bays:", err);
        res.status(500).json({ error: "Failed to fetch workshop bays", details: err.message });
    }
});

// ==========================================
// 2. POST /api/bays - Create New Workshop Bay (Admin)
// ==========================================
router.post("/", async (req, res) => {
    const {
        bay_id,
        bay_name,
        bay_type = "general",
        opening_time = "08:00",
        closing_time = "18:00",
        slot_duration_minutes = 60,
        operating_days = [1, 2, 3, 4, 5, 6],
        is_active = true,
    } = req.body;

    if (!bay_name || !bay_name.trim()) {
        return res.status(400).json({ error: "Bay Name is required." });
    }

    const cleanBayId = (bay_id && bay_id.trim()) 
        ? bay_id.trim().toUpperCase() 
        : `BAY-${Date.now().toString().slice(-4)}`;

    try {
        const query = `
            INSERT INTO workshop_bays (
                bay_id,
                bay_name,
                bay_type,
                opening_time,
                closing_time,
                slot_duration_minutes,
                operating_days,
                is_active
            )
            VALUES ($1, $2, $3, $4::TIME, $5::TIME, $6, $7, $8)
            RETURNING *,
                TO_CHAR(opening_time, 'HH24:MI') AS opening_time,
                TO_CHAR(closing_time, 'HH24:MI') AS closing_time;
        `;
        const result = await pool.query(query, [
            cleanBayId,
            bay_name.trim(),
            bay_type,
            opening_time,
            closing_time,
            parseInt(slot_duration_minutes, 10) || 60,
            operating_days,
            Boolean(is_active),
        ]);

        await deleteCachePattern("garage:cache:bays:*");
        res.status(201).json({
            success: true,
            message: "Workshop Bay created successfully",
            data: result.rows[0],
        });
    } catch (err) {
        console.error("Error creating workshop bay:", err);
        if (err.code === "23505") {
            return res.status(409).json({ error: `Bay ID '${cleanBayId}' already exists.` });
        }
        res.status(500).json({ error: "Failed to create workshop bay", details: err.message });
    }
});

// ==========================================
// 3. PATCH /api/bays/:id - Update Bay Configuration (Admin)
// ==========================================
router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const {
        bay_name,
        bay_type,
        opening_time,
        closing_time,
        slot_duration_minutes,
        operating_days,
        is_active,
    } = req.body;

    try {
        const query = `
            UPDATE workshop_bays
            SET
                bay_name = COALESCE($1, bay_name),
                bay_type = COALESCE($2, bay_type),
                opening_time = COALESCE($3::TIME, opening_time),
                closing_time = COALESCE($4::TIME, closing_time),
                slot_duration_minutes = COALESCE($5, slot_duration_minutes),
                operating_days = COALESCE($6, operating_days),
                is_active = COALESCE($7, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE bay_id = $8
            RETURNING *,
                TO_CHAR(opening_time, 'HH24:MI') AS opening_time,
                TO_CHAR(closing_time, 'HH24:MI') AS closing_time;
        `;
        const result = await pool.query(query, [
            bay_name ? bay_name.trim() : null,
            bay_type || null,
            opening_time || null,
            closing_time || null,
            slot_duration_minutes ? parseInt(slot_duration_minutes, 10) : null,
            operating_days || null,
            is_active !== undefined ? Boolean(is_active) : null,
            id,
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: `Workshop Bay '${id}' not found.` });
        }

        await deleteCachePattern("garage:cache:bays:*");
        res.json({
            success: true,
            message: "Workshop Bay updated successfully",
            data: result.rows[0],
        });
    } catch (err) {
        console.error("Error updating workshop bay:", err);
        res.status(500).json({ error: "Failed to update workshop bay", details: err.message });
    }
});

// ==========================================
// 4. DELETE /api/bays/:id - Delete Bay (Admin)
// ==========================================
router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
        // Guard: check if bay has future or active bookings
        const activeCheck = await pool.query(
            `SELECT COUNT(*) FROM appointments 
             WHERE bay_id = $1 AND appointment_date >= CURRENT_DATE AND status NOT IN ('cancelled', 'completed');`,
            [id]
        );
        if (parseInt(activeCheck.rows[0].count, 10) > 0) {
            return res.status(400).json({
                error: `Cannot delete Bay '${id}' because it has active future appointments. Reassign or cancel them first, or deactivate the bay.`,
            });
        }

        const result = await pool.query("DELETE FROM workshop_bays WHERE bay_id = $1 RETURNING *;", [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Workshop Bay not found" });
        }

        await deleteCachePattern("garage:cache:bays:*");
        res.json({ success: true, message: `Workshop Bay '${id}' deleted successfully` });
    } catch (err) {
        console.error("Error deleting workshop bay:", err);
        res.status(500).json({ error: "Failed to delete workshop bay", details: err.message });
    }
});

// ==========================================
// 5. GET /api/bays/:id/available-slots - Real-time Slot Availability Engine
// ==========================================
router.get("/:id/available-slots", async (req, res) => {
    const { id } = req.params;
    const { date, duration_minutes } = req.query;

    if (!date) {
        return res.status(400).json({ error: "Query parameter 'date' (YYYY-MM-DD) is required." });
    }

    try {
        // 1. Fetch Bay configuration
        const bayRes = await pool.query(
            `SELECT 
                bay_id, 
                bay_name, 
                bay_type, 
                TO_CHAR(opening_time, 'HH24:MI') as opening_time, 
                TO_CHAR(closing_time, 'HH24:MI') as closing_time, 
                slot_duration_minutes, 
                operating_days, 
                is_active 
             FROM workshop_bays 
             WHERE bay_id = $1;`,
            [id]
        );

        if (bayRes.rows.length === 0) {
            return res.status(404).json({ error: `Workshop Bay '${id}' not found.` });
        }

        const bay = bayRes.rows[0];

        if (!bay.is_active) {
            return res.json({
                success: true,
                bay,
                date,
                isOpen: false,
                reason: "Bay is currently inactive or under maintenance",
                slots: [],
            });
        }

        // 2. Fetch Workshop Operating Hours & Shifts
        const settingsRes = await pool.query(
            `SELECT working_hours FROM workshop_settings WHERE id = 1;`
        );
        const workingHours = settingsRes.rows[0]?.working_hours || {
            operating_days: [1, 2, 3, 4, 5, 6],
            slot_duration_minutes: 60,
            shifts: [
                { id: "shift-1", start: "08:00", end: "13:00", label: "Morning Shift" },
                { id: "shift-2", start: "16:00", end: "20:00", label: "Evening Shift" },
            ],
        };

        // 3. Check day of week
        // Date parsing: get day of week (1=Mon, ..., 7=Sun)
        const targetDate = new Date(`${date}T00:00:00`);
        let dayOfWeek = targetDate.getDay(); // 0 is Sun, 1 is Mon...
        dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

        const workshopOpenDays = Array.isArray(workingHours.operating_days)
            ? workingHours.operating_days
            : [1, 2, 3, 4, 5, 6];

        if (!workshopOpenDays.includes(dayOfWeek) || (Array.isArray(bay.operating_days) && !bay.operating_days.includes(dayOfWeek))) {
            return res.json({
                success: true,
                bay,
                date,
                isOpen: false,
                reason: "Workshop Bay is closed on this day of the week",
                slots: [],
            });
        }

        // 4. Resolve Active Shifts and Breaks for this Day
        const activeShifts = (workingHours.daily_overrides && workingHours.daily_overrides[dayOfWeek])
            || (Array.isArray(workingHours.shifts) && workingHours.shifts.length > 0 ? workingHours.shifts : [
                { id: "shift-1", start: bay.opening_time || "08:00", end: bay.closing_time || "18:00", label: "General Shift" }
            ]);

        // Sort shifts chronologically
        const sortedShifts = [...activeShifts].sort((a, b) => a.start.localeCompare(b.start));

        // Calculate break intervals between shifts
        const breaks = [];
        for (let i = 0; i < sortedShifts.length - 1; i++) {
            const curEnd = timeToMinutes(sortedShifts[i].end);
            const nextStart = timeToMinutes(sortedShifts[i + 1].start);
            if (nextStart > curEnd) {
                breaks.push({
                    start: sortedShifts[i].end,
                    end: sortedShifts[i + 1].start,
                    time_label: `${sortedShifts[i].end} - ${sortedShifts[i + 1].start}`,
                    duration_minutes: nextStart - curEnd,
                });
            }
        }

        // 5. Determine interval
        const slotInterval = parseInt(duration_minutes, 10) 
            || bay.slot_duration_minutes 
            || parseInt(workingHours.slot_duration_minutes, 10) 
            || 60;

        // 6. Fetch all active bookings for this bay on this date from APPOINTMENTS and SCHEDULED_TASKS
        const appointmentsQuery = `
            SELECT 
                a.appointment_id,
                a.work_order_id,
                a.vehicle_id,
                TO_CHAR(a.start_time, 'HH24:MI') AS start_time,
                TO_CHAR(a.end_time, 'HH24:MI') AS end_time,
                a.service_type,
                a.status,
                v.license_plate,
                v.make,
                v.model,
                o.full_name AS owner_name
            FROM appointments a
            LEFT JOIN vehicles v ON a.vehicle_id = v.vehicle_id
            LEFT JOIN car_owners o ON a.owner_id = o.owner_id
            WHERE a.bay_id = $1 
              AND a.appointment_date = $2::DATE
              AND a.status NOT IN ('cancelled', 'completed');
        `;
        const tasksQuery = `
            SELECT 
                t.task_id,
                t.work_order_id,
                t.vehicle_id,
                TO_CHAR(t.start_time, 'HH24:MI') AS start_time,
                TO_CHAR(t.end_time, 'HH24:MI') AS end_time,
                t.task_title AS service_type,
                t.status,
                v.license_plate,
                v.make,
                v.model,
                o.full_name AS owner_name
            FROM scheduled_tasks t
            LEFT JOIN vehicles v ON t.vehicle_id = v.vehicle_id
            LEFT JOIN car_owners o ON v.owner_id = o.owner_id
            WHERE t.bay_assigned = $1 
              AND t.scheduled_date = $2::DATE
              AND t.status NOT IN ('cancelled', 'completed');
        `;

        const [appRes, taskRes] = await Promise.all([
            pool.query(appointmentsQuery, [id, date]),
            pool.query(tasksQuery, [id, date]),
        ]);

        const bookings = [...appRes.rows, ...taskRes.rows];

        // 7. Generate slots across each distinct shift (breaks are strictly excluded)
        const slots = [];
        const now = new Date();
        const isToday = now.toISOString().slice(0, 10) === date;
        const currentMinutesToday = now.getHours() * 60 + now.getMinutes();

        for (const shift of sortedShifts) {
            const shiftStartMin = timeToMinutes(shift.start);
            const shiftEndMin = timeToMinutes(shift.end);

            for (let m = shiftStartMin; m + slotInterval <= shiftEndMin; m += slotInterval) {
                const slotStart = minutesToTime(m);
                const slotEnd = minutesToTime(m + slotInterval);
                const slotStartMin = m;
                const slotEndMin = m + slotInterval;

                // Check if slot is in the past for today
                const isPast = isToday && slotStartMin <= currentMinutesToday;

                // Check collision: slotStart < booking.end AND slotEnd > booking.start
                let conflictBooking = null;
                for (const b of bookings) {
                    const bStartMin = timeToMinutes(b.start_time);
                    const bEndMin = timeToMinutes(b.end_time);

                    if (slotStartMin < bEndMin && slotEndMin > bStartMin) {
                        conflictBooking = b;
                        break;
                    }
                }

                const isAvailable = !isPast && !conflictBooking;

                slots.push({
                    slot_id: `${id}_${date}_${slotStart.replace(":", "")}`,
                    shift_id: shift.id,
                    shift_label: shift.label || `${shift.start} - ${shift.end}`,
                    start_time: slotStart,
                    end_time: slotEnd,
                    time_label: `${slotStart} - ${slotEnd}`,
                    duration_minutes: slotInterval,
                    is_available: isAvailable,
                    is_past: isPast,
                    occupant: conflictBooking ? {
                        id: conflictBooking.appointment_id || conflictBooking.task_id,
                        work_order_id: conflictBooking.work_order_id,
                        license_plate: conflictBooking.license_plate,
                        make: conflictBooking.make,
                        model: conflictBooking.model,
                        owner_name: conflictBooking.owner_name,
                        service_type: conflictBooking.service_type,
                        status: conflictBooking.status,
                    } : null,
                });
            }
        }

        res.json({
            success: true,
            bay,
            date,
            isOpen: true,
            operating_shifts: sortedShifts,
            breaks,
            total_slots: slots.length,
            available_slots_count: slots.filter((s) => s.is_available).length,
            slots,
        });
    } catch (err) {
        console.error("Error calculating available slots:", err);
        res.status(500).json({ error: "Failed to calculate slot availability", details: err.message });
    }
});

export default router;
