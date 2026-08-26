import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCachePattern } from "../redis.js";

const router = express.Router();

// GET /api/audit-logs - Paginated and filtered event stream with telemetry KPIs
router.get("/", async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;
    const { range = "ALL", event_type = "all", search = "" } = req.query;

    const cacheKey = `garage:cache:audit:logs:${limit}:${offset}:${range}:${event_type}:${search.trim().toLowerCase()}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", ...cached });
        }

        const queryParams = [];

        // Build Time Range Clause
        let timeCondition = "1=1";
        if (range === "1H") {
            timeCondition = "a.created_at >= NOW() - INTERVAL '1 hour'";
        } else if (range === "24H") {
            timeCondition = "a.created_at >= NOW() - INTERVAL '24 hours'";
        } else if (range === "7D") {
            timeCondition = "a.created_at >= NOW() - INTERVAL '7 days'";
        }

        // Build Event Type Clause (Parameterized to prevent SQL injection)
        let typeCondition = "1=1";
        if (event_type && event_type !== "all") {
            queryParams.push(`%${event_type.trim()}%`);
            typeCondition = `a.event_type ILIKE $${queryParams.length}`;
        }

        // Build Search Clause (Parameterized)
        let searchCondition = "1=1";
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

            const today = new Date();
            const isToday =
                dateObj.getDate() === today.getDate() &&
                dateObj.getMonth() === today.getMonth() &&
                dateObj.getFullYear() === today.getFullYear();

            const dateStr = isToday
                ? "Today"
                : dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });

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

// POST /api/audit-logs - Record an audit event
router.post("/", async (req, res) => {
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

export default router;
