import pool from './db.js';

export async function migrateWorkingHours() {
    console.log("⚡ Checking and running database migration for Workshop Working Hours...");
    const client = await pool.connect();
    try {
        // 1. Add working_hours JSONB column to workshop_settings if it does not exist
        await client.query(`
            ALTER TABLE workshop_settings 
            ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT '{
                "operating_days": [1, 2, 3, 4, 5, 6],
                "slot_duration_minutes": 60,
                "shifts": [
                    { "id": "shift-1", "start": "08:00", "end": "13:00", "label": "Morning Shift" },
                    { "id": "shift-2", "start": "16:00", "end": "20:00", "label": "Evening Shift" }
                ]
            }'::JSONB;
        `);

        // 2. Ensure row 1 has working_hours populated
        await client.query(`
            UPDATE workshop_settings
            SET working_hours = '{
                "operating_days": [1, 2, 3, 4, 5, 6],
                "slot_duration_minutes": 60,
                "shifts": [
                    { "id": "shift-1", "start": "08:00", "end": "13:00", "label": "Morning Shift" },
                    { "id": "shift-2", "start": "16:00", "end": "20:00", "label": "Evening Shift" }
                ]
            }'::JSONB
            WHERE id = 1 AND (working_hours IS NULL OR working_hours = '{}'::JSONB);
        `);

        // 3. Add working_hours JSONB column to workshop_bays for optional bay-level overrides
        await client.query(`
            ALTER TABLE workshop_bays
            ADD COLUMN IF NOT EXISTS working_hours JSONB;
        `);

        const res = await client.query("SELECT id, workshop_name, working_hours FROM workshop_settings WHERE id = 1;");
        console.log("✅ Workshop Working Hours migration complete. Active Settings:", JSON.stringify(res.rows[0], null, 2));
    } catch (err) {
        console.error("❌ Migration error:", err);
        throw err;
    } finally {
        client.release();
    }
}

// Run directly
if (process.argv[1] && process.argv[1].endsWith('migrate_working_hours.js')) {
    migrateWorkingHours()
        .then(() => {
            console.log("Working hours migration script finished.");
            process.exit(0);
        })
        .catch(() => process.exit(1));
}
