import pool from './db.js';

async function migrateScheduled() {
    console.log("Checking work_order_status enum and existing scheduled work orders...");
    const client = await pool.connect();
    try {
        await client.query("ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'scheduled' AFTER 'received';");
        
        // Update work orders that have scheduled_start or active appointments to status = 'scheduled'
        const updateRes = await client.query(`
            UPDATE work_order_data
            SET status = 'scheduled'
            WHERE (
                scheduled_start IS NOT NULL 
                OR EXISTS (
                    SELECT 1 FROM appointments a 
                    WHERE a.work_order_id = work_order_data.work_order_id 
                      AND a.status NOT IN ('cancelled', 'completed')
                )
            )
            AND status IN ('received', 'diagnosed')
            RETURNING work_order_id, vehicle_id, status;
        `);
        console.log(`✅ Updated ${updateRes.rowCount} work orders to 'scheduled':`, updateRes.rows);

        const checkRes = await client.query("SELECT work_order_id, status, bay_assigned, scheduled_start FROM work_order_data WHERE work_order_id IN ('WO-2026-0011', 'WO-2026-0012');");
        console.log("Current status of test work orders:", checkRes.rows);
    } catch (err) {
        console.error("Migration error:", err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

migrateScheduled();
