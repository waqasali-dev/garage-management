import pool from './db.js';

export async function runVehicleTypeMigration() {
    console.log("⚡ Checking/migrating vehicle_type column in vehicles table...");
    const client = await pool.connect();
    try {
        await client.query("BEGIN;");

        // 1. Add vehicle_type column if not exists
        await client.query(`
            ALTER TABLE vehicles 
            ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50) DEFAULT 'Sedan';
        `);

        // 2. Intelligent backfill for existing vehicles based on model/make
        await client.query(`
            UPDATE vehicles
            SET vehicle_type = CASE
                WHEN LOWER(model) ~ '(suv|x3|x5|x7|q3|q5|q7|q8|rav4|cr-v|crv|tahoe|explorer|wrangler|patrol|land cruiser|prado|cherokee|grand cherokee|gle|glc|gls|cayenne|macan|suburban|pilot|highlander)' THEN 'SUV'
                WHEN LOWER(model) ~ '(truck|pickup|f-150|f150|f-250|silverado|ram|hilux|tundra|tacoma|sierra|ranger|navara|d-max)' THEN 'Pickup truck'
                WHEN LOWER(model) ~ '(van|transit|sienna|odyssey|caravan|hiace|sprinter|metris|pacifica|carnival)' THEN 'Van'
                WHEN LOWER(model) ~ '(sports|911|corvette|mustang|camaro|ferrari|lamborghini|m2|m3|m4|m5|amg gt|gt-r|gtr|supra|r8|miata|boxster|cayman|vantage)' THEN 'Sports car'
                WHEN LOWER(model) ~ '(micro|smart|mini|cooper|yaris|fiat 500|500|micra|i10|spark|picanto|beetle|twingo|fortwo)' THEN 'Micro car'
                ELSE COALESCE(vehicle_type, 'Sedan')
            END
            WHERE vehicle_type IS NULL OR vehicle_type = 'Sedan';
        `);

        await client.query("COMMIT;");
        console.log("✅ vehicle_type column migration successfully completed!");
    } catch (err) {
        await client.query("ROLLBACK;");
        console.error("❌ Failed to migrate vehicle_type column:", err.message);
        throw err;
    } finally {
        client.release();
    }
}

// Run directly if called as a script
if (process.argv[1] && process.argv[1].endsWith('migrate_vehicle_type.js')) {
    runVehicleTypeMigration().then(() => {
        pool.end();
    }).catch(() => {
        pool.end();
        process.exit(1);
    });
}
