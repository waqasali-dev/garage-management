import pool from './db.js';

export async function runInventoryBatchesMigration() {
    console.log("⚡ Checking and running database migration for Inventory Multi-Batch Pricing & Valuation (FIFO/LIFO/Normal)...");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Add valuation_method to workshop_settings
        await client.query(`
            ALTER TABLE workshop_settings 
            ADD COLUMN IF NOT EXISTS valuation_method VARCHAR(20) NOT NULL DEFAULT 'fifo';
        `);

        // Add check constraint if not already present
        try {
            await client.query(`
                ALTER TABLE workshop_settings 
                ADD CONSTRAINT chk_valuation_method 
                CHECK (valuation_method IN ('fifo', 'lifo', 'normal'));
            `);
        } catch (constraintErr) {
            // Constraint may already exist
            if (constraintErr.code !== '42710') {
                console.warn("Notice checking valuation_method constraint:", constraintErr.message);
            }
        }

        // 2. Create inventory_batches table
        await client.query(`
            CREATE TABLE IF NOT EXISTS inventory_batches (
                batch_id SERIAL PRIMARY KEY,
                part_id INT NOT NULL REFERENCES inventory_data(part_id) ON DELETE CASCADE,
                batch_number VARCHAR(50) NOT NULL,
                quantity_received INT NOT NULL CHECK (quantity_received >= 0),
                quantity_remaining INT NOT NULL CHECK (quantity_remaining >= 0),
                unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                selling_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                received_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                notes TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Index on inventory_batches
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_inventory_batches_lookup 
            ON inventory_batches (part_id, quantity_remaining, created_at);
        `);

        // 3. Create inventory_price_history table
        await client.query(`
            CREATE TABLE IF NOT EXISTS inventory_price_history (
                history_id SERIAL PRIMARY KEY,
                part_id INT NOT NULL REFERENCES inventory_data(part_id) ON DELETE CASCADE,
                batch_id INT REFERENCES inventory_batches(batch_id) ON DELETE SET NULL,
                change_type VARCHAR(30) NOT NULL DEFAULT 'RESTOCK',
                old_unit_cost NUMERIC(10, 2),
                new_unit_cost NUMERIC(10, 2) NOT NULL,
                old_selling_price NUMERIC(10, 2),
                new_selling_price NUMERIC(10, 2) NOT NULL,
                quantity_changed INT DEFAULT 0,
                notes TEXT,
                recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Index on price history
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_inventory_price_history_lookup 
            ON inventory_price_history (part_id, recorded_at);
        `);

        // 4. Create work_order_item_allocations table
        await client.query(`
            CREATE TABLE IF NOT EXISTS work_order_item_allocations (
                allocation_id SERIAL PRIMARY KEY,
                item_id INT NOT NULL REFERENCES work_order_items(item_id) ON DELETE CASCADE,
                batch_id INT NOT NULL REFERENCES inventory_batches(batch_id) ON DELETE CASCADE,
                quantity INT NOT NULL CHECK (quantity > 0),
                unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_wo_allocations_lookup 
            ON work_order_item_allocations (item_id, batch_id);
        `);

        // 5. Backfill existing inventory parts that don't have batches
        const partsWithoutBatches = await client.query(`
            SELECT i.part_id, i.sku, i.stock_quantity, i.unit_cost, i.selling_price, i.created_at
            FROM inventory_data i
            LEFT JOIN inventory_batches b ON i.part_id = b.part_id
            WHERE b.batch_id IS NULL;
        `);

        console.log(`Found ${partsWithoutBatches.rows.length} existing inventory parts requiring initial batch backfill.`);

        for (const part of partsWithoutBatches.rows) {
            const stock = parseInt(part.stock_quantity, 10) || 0;
            const cost = parseFloat(part.unit_cost) || 0.0;
            const price = parseFloat(part.selling_price) || 0.0;
            const batchNum = `INIT-${part.sku || part.part_id}`;

            const batchRes = await client.query(`
                INSERT INTO inventory_batches (
                    part_id,
                    batch_number,
                    quantity_received,
                    quantity_remaining,
                    unit_cost,
                    selling_price,
                    received_date,
                    notes,
                    created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_TIMESTAMP), 'Initial inventory stock batch', COALESCE($7, CURRENT_TIMESTAMP))
                RETURNING batch_id;
            `, [part.part_id, batchNum, stock, stock, cost, price, part.created_at]);

            const batchId = batchRes.rows[0].batch_id;

            await client.query(`
                INSERT INTO inventory_price_history (
                    part_id,
                    batch_id,
                    change_type,
                    old_unit_cost,
                    new_unit_cost,
                    old_selling_price,
                    new_selling_price,
                    quantity_changed,
                    notes,
                    recorded_at
                )
                VALUES ($1, $2, 'INITIAL', $3, $3, $4, $4, $5, 'Initial baseline catalog price', COALESCE($6, CURRENT_TIMESTAMP));
            `, [part.part_id, batchId, cost, price, stock, part.created_at]);
        }

        await client.query("COMMIT");
        console.log("✅ Inventory Multi-Batch Pricing & Valuation migration completed successfully.");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Inventory Batches migration failed:", err);
        throw err;
    } finally {
        client.release();
    }
}

// Run directly if called as a script
if (process.argv[1] && process.argv[1].endsWith('migrate_inventory_batches.js')) {
    runInventoryBatchesMigration()
        .then(() => {
            console.log("Migration executed directly.");
            process.exit(0);
        })
        .catch((e) => {
            console.error(e);
            process.exit(1);
        });
}
