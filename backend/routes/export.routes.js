import express from "express";
import pool from "../db.js";
import { getCache, setCache } from "../redis.js";

const router = express.Router();

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
            csv += `"${r.sku}","${r.part_name}","${r.category}",${r.stock_quantity},${r.reorder_threshold},${r.unit_cost},${r.selling_price}\n`;
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
            csv += `"${r.work_order_id}","${r.vin}","${r.make}","${r.model}",${r.year},"${r.license_plate}","${r.owner_name}","${r.status}","${r.bay_assigned || ''}",${r.total_cost},"${new Date(r.created_at).toISOString()}"\n`;
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
