import express from "express";
import pool from "../db.js";
import { getCache, setCache } from "../redis.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Enforce admin-only authentication for bulk data exports
router.use(authenticateToken);
router.use(requireRole(["admin"]));

/**
 * Sanitize cell values against CSV Formula / DDE Injection (CWE-1236)
 * Prepend a single quote (') if the cell starts with formula trigger characters: =, +, -, @, \t, \r, %
 * Also escape embedded double quotes with ""
 */
export const sanitizeCsvCell = (val) => {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    str = str.replace(/"/g, '""');
    if (/^[=+\-@\t\r%]/.test(str)) {
        str = `'${str}`;
    }
    return `"${str}"`;
};

// GET /api/export/inventory.csv - Export inventory with short-term caching
router.get("/inventory.csv", async (req, res) => {
    const cacheKey = "garage:cache:export:inventory:csv";
    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", 'attachment; filename="inventory_report.csv"');
            res.setHeader("X-Data-Source", "redis");
            return res.send(cached);
        }

        const result = await pool.query(
            "SELECT sku, part_name, category, stock_quantity, reorder_threshold, unit_cost, selling_price FROM inventory_data ORDER BY part_name ASC;"
        );

        let csv = "SKU,Part Name,Category,Stock,Reorder Threshold,Unit Cost,Selling Price\n";
        for (const r of result.rows) {
            csv += [
                sanitizeCsvCell(r.sku),
                sanitizeCsvCell(r.part_name),
                sanitizeCsvCell(r.category),
                sanitizeCsvCell(r.stock_quantity),
                sanitizeCsvCell(r.reorder_threshold),
                sanitizeCsvCell(r.unit_cost),
                sanitizeCsvCell(r.selling_price),
            ].join(",") + "\n";
        }

        await setCache(cacheKey, csv, 60);

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", 'attachment; filename="inventory_report.csv"');
        res.setHeader("X-Data-Source", "postgres");
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: "Failed to export inventory CSV", details: err.message });
    }
});

// GET /api/export/work-orders.csv - Export work orders with short-term caching
router.get("/work-orders.csv", async (req, res) => {
    const cacheKey = "garage:cache:export:workorders:csv";
    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", 'attachment; filename="work_orders_report.csv"');
            res.setHeader("X-Data-Source", "redis");
            return res.send(cached);
        }

        const result = await pool.query(`
            SELECT w.work_order_id, v.vin, v.make, v.model, v.year, v.license_plate, o.full_name as owner_name, w.status, w.bay_assigned, w.total_cost, w.created_at
            FROM work_order_data w
            JOIN vehicles v ON w.vehicle_id = v.vehicle_id
            JOIN car_owners o ON v.owner_id = o.owner_id
            ORDER BY w.created_at DESC;
        `);

        let csv = "Work Order ID,VIN,Make,Model,Year,License Plate,Owner,Status,Bay,Total Cost,Created Date\n";
        for (const r of result.rows) {
            csv += [
                sanitizeCsvCell(r.work_order_id),
                sanitizeCsvCell(r.vin),
                sanitizeCsvCell(r.make),
                sanitizeCsvCell(r.model),
                sanitizeCsvCell(r.year),
                sanitizeCsvCell(r.license_plate),
                sanitizeCsvCell(r.owner_name),
                sanitizeCsvCell(r.status),
                sanitizeCsvCell(r.bay_assigned || ""),
                sanitizeCsvCell(r.total_cost),
                sanitizeCsvCell(new Date(r.created_at).toISOString()),
            ].join(",") + "\n";
        }

        await setCache(cacheKey, csv, 60);

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", 'attachment; filename="work_orders_report.csv"');
        res.setHeader("X-Data-Source", "postgres");
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: "Failed to export work orders CSV", details: err.message });
    }
});

export default router;
