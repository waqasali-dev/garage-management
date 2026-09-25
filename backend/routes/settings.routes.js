import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCachePattern } from "../redis.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = express.Router();
const CACHE_KEY = "garage:cache:settings:global";

// GET /api/settings - Fetch workshop settings (tax, currency, etc.)
router.get("/", async (req, res) => {
    try {
        const cached = await getCache(CACHE_KEY);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const query = `
            SELECT 
                id,
                tax_percentage::float AS tax_percentage,
                currency_code,
                currency_symbol,
                currency_decimals,
                workshop_name,
                updated_at
            FROM workshop_settings
            WHERE id = 1;
        `;
        let result = await pool.query(query);

        if (result.rows.length === 0) {
            // Seed fallback default
            await pool.query(`
                INSERT INTO workshop_settings (id, tax_percentage, currency_code, currency_symbol, currency_decimals)
                VALUES (1, 5.00, 'USD', '$', 2)
                ON CONFLICT (id) DO NOTHING;
            `);
            result = await pool.query(query);
        }

        const settings = result.rows[0];
        await setCache(CACHE_KEY, settings, 300);

        res.json({ success: true, source: "postgres", data: settings });
    } catch (err) {
        console.error("Error fetching workshop settings:", err);
        res.status(500).json({ error: "Failed to fetch settings", details: err.message });
    }
});

// PUT /api/settings - Update workshop settings (Admin only)
router.put("/", authenticateToken, requireRole(["admin"]), async (req, res) => {
    const {
        tax_percentage,
        currency_code,
        currency_symbol,
        currency_decimals,
        workshop_name,
        recalculate_pending = false,
    } = req.body;

    try {
        // Validation
        const parsedTax = parseFloat(tax_percentage);
        if (isNaN(parsedTax) || parsedTax < 0 || parsedTax > 100) {
            return res.status(400).json({ error: "Tax percentage must be a number between 0 and 100." });
        }

        const cleanCode = (currency_code || "USD").trim().toUpperCase().slice(0, 10);
        const cleanSymbol = (currency_symbol || cleanCode).trim().slice(0, 10);
        const decimals = currency_decimals !== undefined ? Math.max(0, Math.min(4, parseInt(currency_decimals, 10))) : (cleanCode === 'OMR' || cleanCode === 'KWD' || cleanCode === 'BHD' ? 3 : 2);
        const name = (workshop_name || "Precision Garage").trim().slice(0, 100);

        const updateQuery = `
            INSERT INTO workshop_settings (id, tax_percentage, currency_code, currency_symbol, currency_decimals, workshop_name, updated_at)
            VALUES (1, $1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                tax_percentage = EXCLUDED.tax_percentage,
                currency_code = EXCLUDED.currency_code,
                currency_symbol = EXCLUDED.currency_symbol,
                currency_decimals = EXCLUDED.currency_decimals,
                workshop_name = EXCLUDED.workshop_name,
                updated_at = CURRENT_TIMESTAMP
            RETURNING 
                id,
                tax_percentage::float AS tax_percentage,
                currency_code,
                currency_symbol,
                currency_decimals,
                workshop_name,
                updated_at;
        `;
        const result = await pool.query(updateQuery, [
            parsedTax,
            cleanCode,
            cleanSymbol,
            decimals,
            name,
        ]);

        const updatedSettings = result.rows[0];

        // Optionally recalculate pending invoices to match the newly set tax rate
        let recalculatedCount = 0;
        if (recalculate_pending) {
            const recalcResult = await pool.query(`
                UPDATE invoice_data
                SET 
                    tax_percentage = $1,
                    tax_amount = ROUND(subtotal * ($1 / 100.0), 2)
                WHERE status = 'pending'
                RETURNING invoice_id;
            `, [parsedTax]);
            recalculatedCount = recalcResult.rowCount;
        }

        // Audit Log
        try {
            await pool.query(`
                INSERT INTO audit_logs (staff_id, event_type, description, payload_json)
                VALUES ($1, 'SETTINGS_UPDATED', $2, $3);
            `, [
                req.user?.staff_id || null,
                `Admin updated workshop settings: VAT ${parsedTax}%, Currency ${cleanCode} (${cleanSymbol}).${recalculatedCount > 0 ? ` Recalculated ${recalculatedCount} pending invoices.` : ''}`,
                JSON.stringify({ updatedSettings, recalculated_invoices: recalculatedCount }),
            ]);
        } catch (auditErr) {
            console.warn("Notice: Audit log for settings failed:", auditErr.message);
        }

        // Clear all relevant caches
        await deleteCachePattern("garage:cache:settings*");
        await deleteCachePattern("garage:cache:invoice*");
        await deleteCachePattern("garage:cache:inventory*");

        res.json({
            success: true,
            message: "Workshop settings updated successfully.",
            data: updatedSettings,
            recalculatedCount,
        });
    } catch (err) {
        console.error("Error updating workshop settings:", err);
        res.status(500).json({ error: "Failed to update settings", details: err.message });
    }
});

export default router;
