import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCachePattern } from "../redis.js";

const router = express.Router();

// GET /api/staff - Complete Staff Directory with workload analytics
router.get("/", async (req, res) => {
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
                      AND w.status IN ('in_progress', 'received', 'diagnosed', 'scheduled', 'quality_check')
                      AND w.status::text NOT IN ('cancelled', 'rejected', 'deleted')
                ) AS active_jobs_count,
                (
                    SELECT COUNT(*) 
                    FROM work_order_data w 
                    WHERE w.assigned_staff_id = s.staff_id 
                      AND w.status IN ('completed', 'ready')
                      AND w.status::text NOT IN ('cancelled', 'rejected', 'deleted')
                ) AS completed_jobs_count,
                (
                    SELECT COUNT(*) 
                    FROM work_order_data w 
                    WHERE w.status IN ('completed', 'ready')
                      AND w.status::text NOT IN ('cancelled', 'rejected', 'deleted')
                ) AS total_garage_completed_count
            FROM staff_data s
            LEFT JOIN users u ON s.staff_id = u.staff_id
            ORDER BY s.full_name ASC;
        `;
        const result = await pool.query(query);

        // Format and compute workload percentages based on work done share
        const formattedStaff = result.rows.map((member) => {
            const activeJobs = parseInt(member.active_jobs_count, 10) || 0;
            const completedJobs = parseInt(member.completed_jobs_count, 10) || 0;
            const totalGarageDone = parseInt(member.total_garage_completed_count, 10) || 0;
            const isLead = (member.role || "").toLowerCase().includes("lead");

            const parts = (member.full_name || "").trim().split(" ");
            const initials = parts.length === 1
                ? parts[0].substring(0, 2).toUpperCase()
                : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

            // Share of all garage work done
            const workSharePercent = totalGarageDone > 0
                ? Math.round((completedJobs / totalGarageDone) * 100)
                : 0;

            let workloadLabel = `${workSharePercent}% of garage work (${completedJobs}/${totalGarageDone} done)`;
            let workloadType = "success";

            if (workSharePercent >= 50) {
                workloadType = "success";
            } else if (workSharePercent >= 20) {
                workloadType = "success";
            } else if (workSharePercent > 0) {
                workloadType = "warning";
            } else {
                workloadType = "muted";
            }

            const efficiency = completedJobs > 0 ? `${Math.min(90 + completedJobs, 99)}%` : "Available";
            const isSuspended = member.is_active === false || (member.user_id !== null && member.account_active === false);

            return {
                id: member.staff_id,
                staff_id: member.staff_id,
                name: member.full_name,
                role: member.role,
                email: member.email,
                phone: member.phone_number,
                address: member.residential_address,
                hourly_rate: parseFloat(member.hourly_rate || 0).toFixed(2),
                is_active: !isSuspended,
                is_suspended: isSuspended,
                staff_active: member.is_active,
                account_active: member.account_active,
                has_user_account: member.user_id !== null,
                isLead,
                activeJobs,
                completedJobs,
                totalGarageDone,
                workSharePercent,
                efficiency,
                workload: `${workSharePercent}%`,
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

// GET /api/staff/list - Simple active staff list for select dropdowns
router.get("/list", async (req, res) => {
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

// GET /api/staff/:id/profile or GET /api/staff/:id - Comprehensive employee profile, managed cars, and records
router.get("/:id/profile", async (req, res) => {
    return handleGetStaffProfile(req, res);
});

router.get("/:id", async (req, res) => {
    return handleGetStaffProfile(req, res);
});

async function handleGetStaffProfile(req, res) {
    const { id } = req.params;
    const cleanId = parseInt(id, 10);
    if (isNaN(cleanId)) {
        return res.status(400).json({ error: "Invalid staff ID" });
    }

    const cacheKey = `garage:cache:staff:profile:${cleanId}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        // 1. Fetch Staff Member Details
        const staffQuery = `
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
                u.last_login
            FROM staff_data s
            LEFT JOIN users u ON s.staff_id = u.staff_id
            WHERE s.staff_id = $1;
        `;
        const staffResult = await pool.query(staffQuery, [cleanId]);

        if (staffResult.rows.length === 0) {
            return res.status(404).json({ error: "Staff member not found" });
        }

        const member = staffResult.rows[0];

        // 2. Fetch Managed Vehicles (distinct cars serviced or currently assigned, excluding cancelled)
        const managedCarsQuery = `
            SELECT 
                v.vehicle_id,
                v.make,
                v.model,
                v.year,
                v.license_plate,
                v.vin,
                v.vehicle_type,
                o.owner_id,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone,
                o.email_address AS owner_email,
                o.is_vip AS owner_is_vip,
                COUNT(w.work_order_id)::int AS times_serviced,
                MAX(w.created_at) AS latest_service_date,
                (
                    SELECT w2.status 
                    FROM work_order_data w2 
                    WHERE w2.vehicle_id = v.vehicle_id 
                      AND w2.assigned_staff_id = $1 
                      AND w2.status::text NOT IN ('cancelled', 'rejected', 'deleted')
                    ORDER BY w2.created_at DESC 
                    LIMIT 1
                ) AS latest_status,
                (
                    SELECT w2.work_order_id 
                    FROM work_order_data w2 
                    WHERE w2.vehicle_id = v.vehicle_id 
                      AND w2.assigned_staff_id = $1 
                      AND w2.status::text NOT IN ('cancelled', 'rejected', 'deleted')
                    ORDER BY w2.created_at DESC 
                    LIMIT 1
                ) AS latest_work_order_id
            FROM work_order_data w
            JOIN vehicles v ON w.vehicle_id = v.vehicle_id
            JOIN car_owners o ON v.owner_id = o.owner_id
            WHERE w.assigned_staff_id = $1 
              AND w.status::text NOT IN ('cancelled', 'rejected', 'deleted')
            GROUP BY v.vehicle_id, v.make, v.model, v.year, v.license_plate, v.vin, v.vehicle_type, o.owner_id, o.full_name, o.phone_number, o.email_address, o.is_vip
            ORDER BY latest_service_date DESC;
        `;
        const managedCarsResult = await pool.query(managedCarsQuery, [cleanId]);

        // 3. Fetch All Work Orders Assigned to This Staff Member (excluding cancelled, rejected, deleted)
        const workOrdersQuery = `
            SELECT 
                w.work_order_id,
                w.vehicle_id,
                w.status,
                w.bay_assigned,
                w.scheduled_start,
                w.scheduled_end,
                w.initial_observations,
                w.estimated_cost,
                w.total_cost,
                w.created_at,
                w.updated_at,
                v.make,
                v.model,
                v.year,
                v.license_plate,
                v.vin,
                v.vehicle_type,
                o.owner_id,
                o.full_name AS owner_name,
                o.phone_number AS owner_phone,
                COALESCE((
                    SELECT SUM(wi.quantity_or_hours)
                    FROM work_order_items wi
                    WHERE wi.work_order_id = w.work_order_id AND wi.item_type = 'labor'
                ), 0)::numeric(8, 2) AS labor_hours,
                COALESCE((
                    SELECT SUM(wi.total_price)
                    FROM work_order_items wi
                    WHERE wi.work_order_id = w.work_order_id AND wi.item_type = 'labor'
                ), 0)::numeric(10, 2) AS labor_cost
            FROM work_order_data w
            JOIN vehicles v ON w.vehicle_id = v.vehicle_id
            JOIN car_owners o ON v.owner_id = o.owner_id
            WHERE w.assigned_staff_id = $1 
              AND w.status::text NOT IN ('cancelled', 'rejected', 'deleted')
            ORDER BY w.created_at DESC;
        `;
        const workOrdersResult = await pool.query(workOrdersQuery, [cleanId]);

        // 4. Fetch Scheduled Bay Tasks Assigned to This Staff Member (excluding cancelled, rejected, deleted)
        const tasksQuery = `
            SELECT 
                t.task_id,
                t.work_order_id,
                t.vehicle_id,
                t.task_title,
                t.task_description,
                t.priority,
                t.status,
                t.bay_assigned,
                t.scheduled_date,
                t.start_time,
                t.end_time,
                t.duration_hours,
                t.created_at,
                v.make,
                v.model,
                v.license_plate,
                v.vehicle_type
            FROM scheduled_tasks t
            LEFT JOIN vehicles v ON t.vehicle_id = v.vehicle_id
            WHERE t.assigned_staff_id = $1 
              AND t.status::text NOT IN ('cancelled', 'rejected', 'deleted')
            ORDER BY t.scheduled_date DESC, t.start_time ASC;
        `;
        const tasksResult = await pool.query(tasksQuery, [cleanId]);

        // 5. Query Total Work Orders Done in Entire Garage (completed + ready, excluding cancelled, rejected, deleted)
        const garageTotalQuery = `
            SELECT COUNT(*)::int AS total_garage_done 
            FROM work_order_data 
            WHERE status IN ('completed', 'ready') AND status::text NOT IN ('cancelled', 'rejected', 'deleted');
        `;
        const garageTotalRes = await pool.query(garageTotalQuery);
        const totalGarageDone = parseInt(garageTotalRes.rows[0]?.total_garage_done, 10) || 0;

        // 6. Aggregate Performance & Capacity Metrics
        const parts = (member.full_name || "").trim().split(" ");
        const initials = parts.length === 1
            ? parts[0].substring(0, 2).toUpperCase()
            : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

        const isSuspended = member.is_active === false || (member.user_id !== null && member.account_active === false);
        const activeJobs = workOrdersResult.rows.filter((w) =>
            ["in_progress", "received", "diagnosed", "scheduled", "quality_check"].includes(w.status)
        ).length;
        const completedJobs = workOrdersResult.rows.filter((w) =>
            ["completed", "ready"].includes(w.status)
        ).length;

        // Share of all garage work done
        const workSharePercent = totalGarageDone > 0
            ? Math.round((completedJobs / totalGarageDone) * 100)
            : 0;

        let workloadLabel = `${workSharePercent}% of garage work (${completedJobs}/${totalGarageDone} done)`;
        let workloadType = "success";

        if (workSharePercent >= 50) {
            workloadType = "success";
        } else if (workSharePercent >= 20) {
            workloadType = "success";
        } else if (workSharePercent > 0) {
            workloadType = "warning";
        } else {
            workloadType = "muted";
        }

        const totalLaborHours = workOrdersResult.rows.reduce(
            (acc, curr) => acc + parseFloat(curr.labor_hours || 0),
            0
        );

        const totalRevenue = workOrdersResult.rows.reduce(
            (acc, curr) => acc + (["completed", "ready"].includes(curr.status) ? parseFloat(curr.total_cost || 0) : 0),
            0
        );

        const efficiency = completedJobs > 0 ? `${Math.min(90 + completedJobs, 99)}%` : "Available";

        // Enrich work orders with date management metadata for easy frontend filtering & grouping
        const formattedWorkOrders = workOrdersResult.rows.map((wo) => {
            const createdDate = wo.created_at ? new Date(wo.created_at) : null;
            return {
                ...wo,
                date_formatted: createdDate
                    ? createdDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "--",
                month_year: createdDate
                    ? createdDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
                    : "Unassigned Date",
                year_month: createdDate
                    ? `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}`
                    : "",
                date_raw: createdDate ? createdDate.toISOString().split("T")[0] : "",
                time_formatted: createdDate
                    ? createdDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                    : "",
                created_timestamp: createdDate ? createdDate.getTime() : 0,
            };
        });

        const profileData = {
            staff: {
                id: member.staff_id,
                staff_id: member.staff_id,
                name: member.full_name,
                full_name: member.full_name,
                role: member.role,
                email: member.email,
                phone: member.phone_number,
                phone_number: member.phone_number,
                address: member.residential_address,
                residential_address: member.residential_address,
                hourly_rate: parseFloat(member.hourly_rate || 0).toFixed(2),
                is_active: !isSuspended,
                is_suspended: isSuspended,
                staff_active: member.is_active,
                account_active: member.account_active,
                has_user_account: member.user_id !== null,
                user_id: member.user_id,
                last_login: member.last_login,
                initials,
                created_at: member.created_at,
            },
            metrics: {
                total_managed_cars: managedCarsResult.rows.length,
                total_work_orders: workOrdersResult.rows.length,
                active_jobs: activeJobs,
                completed_jobs: completedJobs,
                total_garage_done: totalGarageDone,
                work_share_percent: workSharePercent,
                workload_percent: workSharePercent,
                workload_label: workloadLabel,
                workload_type: workloadType,
                total_labor_hours: parseFloat(totalLaborHours.toFixed(1)),
                total_revenue_generated: totalRevenue,
                total_revenue_formatted: `$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                efficiency,
            },
            managed_vehicles: managedCarsResult.rows,
            work_orders: formattedWorkOrders,
            scheduled_tasks: tasksResult.rows,
        };

        await setCache(cacheKey, profileData, 300);

        res.json({ success: true, source: "postgres", data: profileData });
    } catch (err) {
        console.error("Error fetching staff profile:", err);
        res.status(500).json({ error: "Failed to fetch staff profile from database", details: err.message });
    }
}

// PUT /api/staff/:id - Update staff profile details
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, role, phone_number, residential_address, hourly_rate } = req.body;

        const updateQuery = `
            UPDATE staff_data
            SET 
                full_name = COALESCE($1, full_name),
                role = COALESCE($2, role),
                phone_number = COALESCE($3, phone_number),
                residential_address = COALESCE($4, residential_address),
                hourly_rate = COALESCE($5, hourly_rate)
            WHERE staff_id = $6
            RETURNING *;
        `;

        const result = await pool.query(updateQuery, [
            full_name || null,
            role || null,
            phone_number || null,
            residential_address || null,
            hourly_rate !== undefined && hourly_rate !== '' ? parseFloat(hourly_rate) : null,
            id,
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Staff member not found" });
        }

        await deleteCachePattern("garage:cache:staff:*");

        res.json({
            success: true,
            message: "Staff profile updated successfully",
            data: result.rows[0],
        });
    } catch (err) {
        console.error("Error updating staff profile:", err);
        res.status(500).json({ error: "Failed to update staff profile", details: err.message });
    }
});

// PATCH /api/staff/:id/status - Update staff active status
router.patch("/:id/status", async (req, res) => {
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
router.delete("/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;

        // Unlink from work orders and scheduled tasks
        await client.query("UPDATE work_order_data SET assigned_staff_id = NULL WHERE assigned_staff_id = $1;", [id]);
        await client.query("UPDATE scheduled_tasks SET assigned_staff_id = NULL WHERE assigned_staff_id = $1;", [id]);

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

export default router;
