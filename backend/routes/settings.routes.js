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
                working_hours,
                updated_at
            FROM workshop_settings
            WHERE id = 1;
        `;
        let result = await pool.query(query);

        const defaultWorkingHours = {
            operating_days: [1, 2, 3, 4, 5, 6],
            slot_duration_minutes: 60,
            shifts: [
                { id: "shift-1", start: "08:00", end: "13:00", label: "Morning Shift" },
                { id: "shift-2", start: "16:00", end: "20:00", label: "Evening Shift" },
            ],
        };

        if (result.rows.length === 0) {
            // Seed fallback default
            await pool.query(`
                INSERT INTO workshop_settings (id, tax_percentage, currency_code, currency_symbol, currency_decimals, working_hours)
                VALUES (1, 5.00, 'USD', '$', 2, $1::JSONB)
                ON CONFLICT (id) DO NOTHING;
            `, [JSON.stringify(defaultWorkingHours)]);
            result = await pool.query(query);
        }

        const settings = result.rows[0];
        if (!settings.working_hours || !Array.isArray(settings.working_hours.shifts) || settings.working_hours.shifts.length === 0) {
            settings.working_hours = defaultWorkingHours;
        }

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
        working_hours,
        recalculate_pending = false,
    } = req.body;

    try {
        // Validation for tax
        const parsedTax = tax_percentage !== undefined ? parseFloat(tax_percentage) : 5.0;
        if (isNaN(parsedTax) || parsedTax < 0 || parsedTax > 100) {
            return res.status(400).json({ error: "Tax percentage must be a number between 0 and 100." });
        }

        const cleanCode = (currency_code || "USD").trim().toUpperCase().slice(0, 10);
        const cleanSymbol = (currency_symbol || cleanCode).trim().slice(0, 10);
        const decimals = currency_decimals !== undefined ? Math.max(0, Math.min(4, parseInt(currency_decimals, 10))) : (cleanCode === 'OMR' || cleanCode === 'KWD' || cleanCode === 'BHD' ? 3 : 2);
        const name = (workshop_name || "Precision Garage").trim().slice(0, 100);

        // Validation for working_hours
        let cleanWorkingHours = null;
        if (working_hours) {
            if (typeof working_hours === "object") {
                const shifts = Array.isArray(working_hours.shifts) ? [...working_hours.shifts] : [];
                if (shifts.length === 0) {
                    return res.status(400).json({ error: "At least one operating shift window must be specified." });
                }

                for (let i = 0; i < shifts.length; i++) {
                    const s = shifts[i];
                    if (!s.start || !s.end) {
                        return res.status(400).json({ error: `Shift ${i + 1} must specify both a start time and an end time.` });
                    }
                    if (s.start >= s.end) {
                        return res.status(400).json({ error: `Shift ${i + 1} (${s.label || 'Shift'}) end time (${s.end}) must be after start time (${s.start}).` });
                    }
                }

                // Sort shifts chronologically
                shifts.sort((a, b) => a.start.localeCompare(b.start));

                // Check for overlapping shifts
                for (let i = 0; i < shifts.length - 1; i++) {
                    if (shifts[i].end > shifts[i + 1].start) {
                        return res.status(400).json({
                            error: `Shift '${shifts[i].label || i + 1}' (${shifts[i].start} - ${shifts[i].end}) overlaps with Shift '${shifts[i + 1].label || i + 2}' (${shifts[i + 1].start} - ${shifts[i + 1].end}). Shift intervals must be distinct.`,
                        });
                    }
                }

                const operating_days = Array.isArray(working_hours.operating_days) && working_hours.operating_days.length > 0
                    ? working_hours.operating_days.map(Number).filter(d => d >= 1 && d <= 7)
                    : [1, 2, 3, 4, 5, 6];

                const slot_duration_minutes = parseInt(working_hours.slot_duration_minutes, 10) || 60;

                cleanWorkingHours = {
                    operating_days,
                    slot_duration_minutes,
                    shifts: shifts.map((s, idx) => ({
                        id: s.id || `shift-${idx + 1}`,
                        start: s.start,
                        end: s.end,
                        label: s.label || (idx === 0 ? "Morning Shift" : idx === 1 ? "Evening Shift" : `Shift ${idx + 1}`),
                    })),
                    daily_overrides: working_hours.daily_overrides || {},
                };
            }
        }

        const updateQuery = `
            INSERT INTO workshop_settings (id, tax_percentage, currency_code, currency_symbol, currency_decimals, workshop_name, working_hours, updated_at)
            VALUES (1, $1, $2, $3, $4, $5, COALESCE($6::JSONB, (SELECT working_hours FROM workshop_settings WHERE id = 1)), CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                tax_percentage = EXCLUDED.tax_percentage,
                currency_code = EXCLUDED.currency_code,
                currency_symbol = EXCLUDED.currency_symbol,
                currency_decimals = EXCLUDED.currency_decimals,
                workshop_name = EXCLUDED.workshop_name,
                working_hours = CASE WHEN $6::JSONB IS NOT NULL THEN $6::JSONB ELSE workshop_settings.working_hours END,
                updated_at = CURRENT_TIMESTAMP
            RETURNING 
                id,
                tax_percentage::float AS tax_percentage,
                currency_code,
                currency_symbol,
                currency_decimals,
                workshop_name,
                working_hours,
                updated_at;
        `;
        const result = await pool.query(updateQuery, [
            parsedTax,
            cleanCode,
            cleanSymbol,
            decimals,
            name,
            cleanWorkingHours ? JSON.stringify(cleanWorkingHours) : null,
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
            const shiftsDesc = cleanWorkingHours?.shifts 
                ? ` Working shifts: ${cleanWorkingHours.shifts.map(s => `${s.start}-${s.end}`).join(", ")}.`
                : "";
            await pool.query(`
                INSERT INTO audit_logs (staff_id, event_type, description, payload_json)
                VALUES ($1, 'SETTINGS_UPDATED', $2, $3);
            `, [
                req.user?.staff_id || null,
                `Admin updated workshop settings: VAT ${parsedTax}%, Currency ${cleanCode} (${cleanSymbol}).${shiftsDesc}${recalculatedCount > 0 ? ` Recalculated ${recalculatedCount} pending invoices.` : ''}`,
                JSON.stringify({ updatedSettings, recalculated_invoices: recalculatedCount }),
            ]);
        } catch (auditErr) {
            console.warn("Notice: Audit log for settings failed:", auditErr.message);
        }

        // Clear all relevant caches
        await deleteCachePattern("garage:cache:settings*");
        await deleteCachePattern("garage:cache:bays*");
        await deleteCachePattern("garage:cache:appointments*");
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
