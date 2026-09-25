import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCachePattern } from "../redis.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /api/invoices - List all invoices with owner and vehicle details
router.get("/", async (req, res) => {
    const { owner_id } = req.query;
    const cacheKey = `garage:cache:invoices:list:${owner_id || "all"}`;

    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            if (Array.isArray(cached)) {
                return res.json({ success: true, source: "redis", data: cached });
            }
            if (cached && Array.isArray(cached.invoices)) {
                return res.json({ success: true, source: "redis", data: cached.invoices, settings: cached.settings });
            }
            return res.json({ success: true, source: "redis", data: cached });
        }

        let whereClause = "1=1";
        const queryParams = [];
        if (owner_id && owner_id.trim()) {
            queryParams.push(owner_id.trim());
            whereClause += ` AND i.owner_id = $${queryParams.length}`;
        }

        const query = `
            SELECT 
                i.invoice_id,
                i.work_order_id,
                i.owner_id,
                i.subtotal,
                i.tax_amount,
                COALESCE(i.tax_percentage, 5.00)::float AS tax_percentage,
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
            WHERE ${whereClause}
            ORDER BY i.date_issued DESC, i.invoice_id DESC;
        `;
        const result = await pool.query(query, queryParams);

        // Fetch active workshop settings for tax and currency
        let workshopSettings = { tax_percentage: 5.0, currency_code: 'USD', currency_symbol: '$', currency_decimals: 2 };
        try {
            const settingsRes = await pool.query('SELECT tax_percentage::float, currency_code, currency_symbol, currency_decimals FROM workshop_settings WHERE id = 1');
            if (settingsRes.rows.length > 0) {
                workshopSettings = settingsRes.rows[0];
            }
        } catch (sErr) {
            console.warn("Could not fetch workshop settings for invoices:", sErr.message);
        }

        const responsePayload = {
            invoices: result.rows,
            settings: workshopSettings,
        };

        await setCache(cacheKey, responsePayload, 300);

        res.json({ success: true, source: "postgres", data: result.rows, settings: workshopSettings });
    } catch (err) {
        console.error("Error fetching invoices list:", err);
        res.status(500).json({ error: "Failed to fetch invoices", details: err.message });
    }
});

// GET /api/invoices/:id - Get complete Tax Invoice details with line items
router.get("/:id", async (req, res) => {
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
                COALESCE(i.tax_percentage, 5.00)::float AS tax_percentage,
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
router.post("/generate", async (req, res) => {
    const { work_order_id, tax_rate = 0.05 } = req.body;

    if (!work_order_id) {
        return res.status(400).json({ error: "Work order ID is required to generate invoice." });
    }

    try {
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

        // Calculate subtotal from items
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

        // Resolve tax percentage from request body or workshop settings
        let effectiveTaxPercentage = 5.0;
        if (req.body.tax_percentage !== undefined && req.body.tax_percentage !== null) {
            effectiveTaxPercentage = parseFloat(req.body.tax_percentage) || 0;
        } else if (req.body.tax_rate !== undefined && req.body.tax_rate !== null) {
            const tr = parseFloat(req.body.tax_rate) || 0;
            effectiveTaxPercentage = tr <= 1 ? tr * 100 : tr;
        } else {
            try {
                const sRes = await pool.query('SELECT tax_percentage::float FROM workshop_settings WHERE id = 1');
                if (sRes.rows.length > 0 && sRes.rows[0].tax_percentage !== null) {
                    effectiveTaxPercentage = parseFloat(sRes.rows[0].tax_percentage) || 5.0;
                }
            } catch (e) {
                effectiveTaxPercentage = 5.0;
            }
        }

        const taxAmount = parseFloat((subtotal * (effectiveTaxPercentage / 100.0)).toFixed(2));
        const initialStatus = wo.status === 'completed' ? 'paid' : 'pending';

        // Upsert invoice record including tax_percentage
        const upsertQuery = `
            INSERT INTO invoice_data (
                work_order_id,
                owner_id,
                subtotal,
                tax_percentage,
                tax_amount,
                status,
                date_issued,
                date_due
            )
            VALUES ($1, $2, $3, $4, $5, $6::invoice_status, CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days')
            ON CONFLICT (work_order_id) DO UPDATE SET
                subtotal = EXCLUDED.subtotal,
                tax_percentage = EXCLUDED.tax_percentage,
                tax_amount = EXCLUDED.tax_amount,
                status = CASE WHEN invoice_data.status = 'paid' THEN 'paid' ELSE EXCLUDED.status END
            RETURNING *;
        `;
        const invoiceResult = await pool.query(upsertQuery, [
            wo.work_order_id,
            wo.owner_id,
            subtotal,
            effectiveTaxPercentage,
            taxAmount,
            initialStatus,
        ]);

        const invoice = invoiceResult.rows[0];

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
        await deleteCachePattern("garage:cache:vehicle*");
        await deleteCachePattern("garage:cache:owner*");

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
router.patch("/:id/status", async (req, res) => {
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
                status = $1::invoice_status,
                date_paid = CASE WHEN $1::text = 'paid' THEN CURRENT_DATE ELSE NULL END
            WHERE UPPER(TRIM(invoice_id)) = UPPER(TRIM($2))
               OR UPPER(TRIM(work_order_id)) = UPPER(TRIM($2))
            RETURNING *;
        `;
        const result = await pool.query(query, [status, id.trim()]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        await deleteCachePattern("garage:cache:invoice*");
        await deleteCachePattern("garage:cache:vehicle*");
        await deleteCachePattern("garage:cache:owner*");
        await deleteCachePattern("garage:cache:workorder*");

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

// DELETE /api/invoices/:id - Delete an invoice
router.delete("/:id", authenticateToken, requireRole(["admin"]), async (req, res) => {
    const { id } = req.params;
    const cleanId = (id || "").trim();

    try {
        const result = await pool.query(
            "DELETE FROM invoice_data WHERE UPPER(TRIM(invoice_id)) = UPPER(TRIM($1)) OR UPPER(TRIM(work_order_id)) = UPPER(TRIM($1)) RETURNING *;",
            [cleanId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Invoice not found." });
        }

        await deleteCachePattern("garage:cache:invoice*");
        await deleteCachePattern("garage:cache:vehicle*");
        await deleteCachePattern("garage:cache:owner*");
        await deleteCachePattern("garage:cache:workorder*");

        res.json({
            success: true,
            message: `Invoice [${result.rows[0].invoice_id}] deleted successfully.`,
            deletedInvoice: result.rows[0],
        });
    } catch (err) {
        console.error("Error deleting invoice:", err);
        res.status(500).json({ error: "Failed to delete invoice", details: err.message });
    }
});

export default router;
