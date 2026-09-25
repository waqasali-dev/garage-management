import pool from './db.js';

export async function migrateSettingsAndTax() {
    console.log("⚡ Checking and running database migration for Settings and Tax...");
    const client = await pool.connect();
    try {
        // 1. Add tax_percentage column to invoice_data if it does not exist
        await client.query(`
            ALTER TABLE invoice_data 
            ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC(5, 2) DEFAULT 5.00;
        `);

        await client.query(`
            UPDATE invoice_data 
            SET tax_percentage = 5.00 
            WHERE tax_percentage IS NULL;
        `);

        // 2. Create workshop_settings table if it does not exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS workshop_settings (
                id INT PRIMARY KEY DEFAULT 1,
                tax_percentage NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
                currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
                currency_symbol VARCHAR(10) NOT NULL DEFAULT '$',
                currency_decimals INT NOT NULL DEFAULT 2,
                workshop_name VARCHAR(100) DEFAULT 'Precision Garage',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_single_settings CHECK (id = 1)
            );
        `);

        // 3. Ensure single default settings row exists
        await client.query(`
            INSERT INTO workshop_settings (id, tax_percentage, currency_code, currency_symbol, currency_decimals)
            VALUES (1, 5.00, 'USD', '$', 2)
            ON CONFLICT (id) DO NOTHING;
        `);

        const res = await client.query("SELECT * FROM workshop_settings WHERE id = 1");
        console.log("✅ Workshop settings initialized:", res.rows[0]);

        const invSample = await client.query("SELECT invoice_id, subtotal, tax_amount, tax_percentage, total_amount FROM invoice_data LIMIT 3");
        console.log("✅ Invoices verified with tax_percentage:", invSample.rows);
    } catch (err) {
        console.error("❌ Migration error:", err);
        throw err;
    } finally {
        client.release();
    }
}

// If executed directly
if (process.argv[1] && process.argv[1].endsWith('migrate_settings.js')) {
    migrateSettingsAndTax()
        .then(() => {
            console.log("Migration finished successfully.");
            process.exit(0);
        })
        .catch(() => process.exit(1));
}
