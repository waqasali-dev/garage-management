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

            const parts = (member.full_name || "").trim().split(" ");
            const initials = parts.length === 1
                ? parts[0].substring(0, 2).toUpperCase()
                : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

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
