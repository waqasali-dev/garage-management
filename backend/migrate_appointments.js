import pg from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("❌ DATABASE_URL is not defined in .env");
    process.exit(1);
}

const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

export async function runAppointmentMigration() {
    const client = await pool.connect();
    console.log("⚡ Connected to Neon PostgreSQL cloud instance for appointment migration...");

    try {
        await client.query("BEGIN");

        // 1. Create workshop_bays table
        console.log("🛠️ Creating workshop_bays table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS workshop_bays (
                bay_id VARCHAR(30) PRIMARY KEY,
                bay_name VARCHAR(100) NOT NULL,
                bay_type VARCHAR(50) DEFAULT 'general',
                opening_time TIME NOT NULL DEFAULT '08:00:00',
                closing_time TIME NOT NULL DEFAULT '18:00:00',
                slot_duration_minutes INT NOT NULL DEFAULT 60 CHECK (slot_duration_minutes >= 15),
                operating_days INT[] DEFAULT '{1,2,3,4,5,6}',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Create appointment sequence & function
        console.log("🔢 Creating appointment_seq and generator function...");
        await client.query(`
            CREATE SEQUENCE IF NOT EXISTS appointment_seq START WITH 1 INCREMENT BY 1;

            CREATE OR REPLACE FUNCTION generate_appointment_id()
            RETURNS TEXT AS $$
            BEGIN
                RETURN 'APT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('appointment_seq')::TEXT, 4, '0');
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 3. Create appointments table
        console.log("📅 Creating appointments table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                appointment_id VARCHAR(30) PRIMARY KEY DEFAULT generate_appointment_id(),
                owner_id VARCHAR(30) NOT NULL REFERENCES car_owners(owner_id) ON DELETE CASCADE,
                vehicle_id VARCHAR(30) NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
                bay_id VARCHAR(30) NOT NULL REFERENCES workshop_bays(bay_id) ON DELETE RESTRICT,
                work_order_id VARCHAR(30) REFERENCES work_order_data(work_order_id) ON DELETE SET NULL,
                appointment_date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                service_type VARCHAR(100) NOT NULL DEFAULT 'Diagnostic & Inspection',
                customer_notes TEXT,
                status VARCHAR(30) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'in_bay', 'completed', 'cancelled', 'no_show')),
                booked_by VARCHAR(30) NOT NULL DEFAULT 'admin' CHECK (booked_by IN ('admin', 'customer', 'staff')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_time_window CHECK (end_time > start_time)
            );
        `);

        // 4. Create performance indexes
        console.log("⚡ Creating indexes for bays and appointments...");
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_appointments_date_bay ON appointments(appointment_date, bay_id);
            CREATE INDEX IF NOT EXISTS idx_appointments_vehicle ON appointments(vehicle_id);
            CREATE INDEX IF NOT EXISTS idx_appointments_owner ON appointments(owner_id);
            CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
            CREATE INDEX IF NOT EXISTS idx_workshop_bays_active ON workshop_bays(is_active);
        `);

        // 5. Seed default bays (B1, B2, B3) for backward compatibility
        console.log("🌱 Seeding default workshop bays (B1, B2, B3)...");
        await client.query(`
            INSERT INTO workshop_bays (bay_id, bay_name, bay_type, opening_time, closing_time, slot_duration_minutes, is_active)
            VALUES 
                ('B1', 'Bay 1 - Heavy Repair', 'heavy_repair', '08:00:00', '18:00:00', 60, TRUE),
                ('B2', 'Bay 2 - Diagnostics & Electrical', 'diagnostics', '08:00:00', '18:00:00', 60, TRUE),
                ('B3', 'Bay 3 - Express Lube & Tires', 'express', '08:00:00', '18:00:00', 30, TRUE)
            ON CONFLICT (bay_id) DO UPDATE 
            SET bay_name = EXCLUDED.bay_name,
                bay_type = EXCLUDED.bay_type,
                opening_time = EXCLUDED.opening_time,
                closing_time = EXCLUDED.closing_time;
        `);

        await client.query("COMMIT");
        console.log("✅ Appointment and Workshop Bay migration completed successfully!");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Migration failed:", err);
        throw err;
    } finally {
        client.release();
    }
}

// Execute directly if run via CLI
if (process.argv[1] && process.argv[1].endsWith('migrate_appointments.js')) {
    runAppointmentMigration()
        .then(() => {
            console.log("Migration process finished.");
            process.exit(0);
        })
        .catch(() => process.exit(1));
}
