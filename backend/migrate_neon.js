import pg from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
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
    ssl: {
        rejectUnauthorized: false
    }
});

async function runMigration() {
    const client = await pool.connect();
    console.log("⚡ Connected to Neon PostgreSQL cloud instance...");

    try {
        // Read schema from database.db (or create directly)
        const schemaPath = path.join(__dirname, '../frontend/database.db');
        const sql = fs.readFileSync(schemaPath, 'utf8');

        console.log("📦 Creating Tables, Types, Functions, Sequences, and Indexes on Neon...");

        // 1. Extensions & Types (Execute with safe DO blocks so existing types don't fail)
        await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

        const typeQueries = [
            `DO $$ BEGIN CREATE TYPE user_role_enum AS ENUM ('admin', 'staff', 'car_owner'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
            `DO $$ BEGIN CREATE TYPE work_order_status AS ENUM ('received', 'diagnosed', 'approved', 'in_progress', 'quality_check', 'ready', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
            `DO $$ BEGIN CREATE TYPE item_type_enum AS ENUM ('part', 'labor'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
            `DO $$ BEGIN CREATE TYPE invoice_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
            `DO $$ BEGIN CREATE TYPE media_type_enum AS ENUM ('vehicle_condition', 'part_damage', 'receipt', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
            `DO $$ BEGIN CREATE TYPE task_priority_enum AS ENUM ('low', 'standard', 'high', 'urgent'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
            `DO $$ BEGIN CREATE TYPE task_status_enum AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;`
        ];

        for (const tq of typeQueries) {
            await client.query(tq);
        }

        // 2. Sequences
        await client.query(`
            CREATE SEQUENCE IF NOT EXISTS owner_seq START WITH 1 INCREMENT BY 1;
            CREATE SEQUENCE IF NOT EXISTS vehicle_seq START WITH 1 INCREMENT BY 1;
            CREATE SEQUENCE IF NOT EXISTS work_order_seq START WITH 1 INCREMENT BY 1;
            CREATE SEQUENCE IF NOT EXISTS invoice_seq START WITH 1 INCREMENT BY 1;
            CREATE SEQUENCE IF NOT EXISTS task_seq START WITH 1 INCREMENT BY 1;
        `);

        // 3. Generator Functions
        await client.query(`
            CREATE OR REPLACE FUNCTION generate_owner_id()
            RETURNS TEXT AS $$
            BEGIN
                RETURN 'OWN-' || LPAD(NEXTVAL('owner_seq')::TEXT, 4, '0');
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION generate_vehicle_id()
            RETURNS TEXT AS $$
            BEGIN
                RETURN 'VEH-' || LPAD(NEXTVAL('vehicle_seq')::TEXT, 4, '0');
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION generate_work_order_id()
            RETURNS TEXT AS $$
            BEGIN
                RETURN 'WO-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('work_order_seq')::TEXT, 4, '0');
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION generate_invoice_id()
            RETURNS TEXT AS $$
            BEGIN
                RETURN 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('invoice_seq')::TEXT, 4, '0');
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION generate_task_id()
            RETURNS TEXT AS $$
            BEGIN
                RETURN 'TSK-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('task_seq')::TEXT, 4, '0');
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 4. Tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS car_owners (
                owner_id VARCHAR(30) PRIMARY KEY DEFAULT generate_owner_id(),
                full_name VARCHAR(150) NOT NULL,
                phone_number VARCHAR(20) NOT NULL,
                email_address VARCHAR(150),
                billing_address TEXT,
                is_vip BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_owner_id_format CHECK (owner_id ~ '^OWN-\\d{4,}$')
            );

            CREATE TABLE IF NOT EXISTS vehicles (
                vehicle_id VARCHAR(30) PRIMARY KEY DEFAULT generate_vehicle_id(),
                owner_id VARCHAR(30) NOT NULL REFERENCES car_owners(owner_id) ON DELETE CASCADE,
                vin VARCHAR(17) UNIQUE NOT NULL,
                make VARCHAR(50) NOT NULL,
                model VARCHAR(50) NOT NULL,
                year INT NOT NULL CHECK (year >= 1900 AND year <= 2100),
                license_plate VARCHAR(20) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_vehicle_id_format CHECK (vehicle_id ~ '^VEH-\\d{4,}$')
            );

            CREATE TABLE IF NOT EXISTS staff_data (
                staff_id SERIAL PRIMARY KEY,
                full_name VARCHAR(150) NOT NULL,
                role VARCHAR(50) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                phone_number VARCHAR(20),
                residential_address TEXT,
                hourly_rate NUMERIC(10, 2) DEFAULT 0.00,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS users (
                user_id SERIAL PRIMARY KEY,
                email VARCHAR(150) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role user_role_enum NOT NULL DEFAULT 'staff',
                staff_id INT UNIQUE REFERENCES staff_data(staff_id) ON DELETE CASCADE,
                owner_id VARCHAR(30) UNIQUE REFERENCES car_owners(owner_id) ON DELETE CASCADE,
                is_active BOOLEAN DEFAULT TRUE,
                last_login TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_user_profile_alignment CHECK (
                    (role = 'staff' AND staff_id IS NOT NULL AND owner_id IS NULL) OR
                    (role = 'car_owner' AND owner_id IS NOT NULL AND staff_id IS NULL) OR
                    (role = 'admin')
                )
            );

            CREATE TABLE IF NOT EXISTS inventory_data (
                part_id SERIAL PRIMARY KEY,
                sku VARCHAR(50) UNIQUE NOT NULL,
                part_name VARCHAR(150) NOT NULL,
                category VARCHAR(50) NOT NULL,
                stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
                reorder_threshold INT NOT NULL DEFAULT 5,
                unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                selling_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS work_order_data (
                work_order_id VARCHAR(30) PRIMARY KEY DEFAULT generate_work_order_id(),
                vehicle_id VARCHAR(30) NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE RESTRICT,
                assigned_staff_id INT REFERENCES staff_data(staff_id) ON DELETE SET NULL,
                service_advisor_id INT REFERENCES staff_data(staff_id) ON DELETE SET NULL,
                status work_order_status NOT NULL DEFAULT 'received',
                bay_assigned VARCHAR(50),
                scheduled_start TIMESTAMP WITH TIME ZONE,
                scheduled_end TIMESTAMP WITH TIME ZONE,
                initial_observations TEXT,
                estimated_cost NUMERIC(10, 2) DEFAULT 0.00,
                total_cost NUMERIC(10, 2) DEFAULT 0.00,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_work_order_id_format CHECK (work_order_id ~ '^WO-\\d{4}-\\d{4}$')
            );

            CREATE TABLE IF NOT EXISTS work_order_items (
                item_id SERIAL PRIMARY KEY,
                work_order_id VARCHAR(30) NOT NULL REFERENCES work_order_data(work_order_id) ON DELETE CASCADE,
                item_type item_type_enum NOT NULL,
                part_id INT REFERENCES inventory_data(part_id) ON DELETE SET NULL,
                description TEXT NOT NULL,
                quantity_or_hours NUMERIC(8, 2) NOT NULL DEFAULT 1.00 CHECK (quantity_or_hours > 0),
                unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                total_price NUMERIC(10, 2) GENERATED ALWAYS AS (quantity_or_hours * unit_price) STORED
            );

            CREATE TABLE IF NOT EXISTS work_order_media (
                media_id SERIAL PRIMARY KEY,
                work_order_id VARCHAR(30) NOT NULL REFERENCES work_order_data(work_order_id) ON DELETE CASCADE,
                file_url TEXT NOT NULL,
                file_type media_type_enum DEFAULT 'vehicle_condition',
                uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS invoice_data (
                invoice_id VARCHAR(30) PRIMARY KEY DEFAULT generate_invoice_id(),
                work_order_id VARCHAR(30) UNIQUE NOT NULL REFERENCES work_order_data(work_order_id) ON DELETE RESTRICT,
                owner_id VARCHAR(30) NOT NULL REFERENCES car_owners(owner_id) ON DELETE RESTRICT,
                subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                total_amount NUMERIC(10, 2) GENERATED ALWAYS AS (subtotal + tax_amount) STORED,
                status invoice_status NOT NULL DEFAULT 'pending',
                date_issued DATE NOT NULL DEFAULT CURRENT_DATE,
                date_due DATE,
                date_paid DATE,
                CONSTRAINT chk_invoice_id_format CHECK (invoice_id ~ '^INV-\\d{4}-\\d{4}$')
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                log_id SERIAL PRIMARY KEY,
                work_order_id VARCHAR(30) REFERENCES work_order_data(work_order_id) ON DELETE SET NULL,
                staff_id INT REFERENCES staff_data(staff_id) ON DELETE SET NULL,
                event_type VARCHAR(50) NOT NULL,
                description TEXT NOT NULL,
                payload_json JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS scheduled_tasks (
                task_id VARCHAR(30) PRIMARY KEY DEFAULT generate_task_id(),
                work_order_id VARCHAR(30) REFERENCES work_order_data(work_order_id) ON DELETE SET NULL,
                vehicle_id VARCHAR(30) REFERENCES vehicles(vehicle_id) ON DELETE SET NULL,
                assigned_staff_id INT REFERENCES staff_data(staff_id) ON DELETE SET NULL,
                task_title VARCHAR(200) NOT NULL,
                task_description TEXT,
                priority task_priority_enum NOT NULL DEFAULT 'standard',
                status task_status_enum NOT NULL DEFAULT 'scheduled',
                bay_assigned VARCHAR(50) DEFAULT 'B1',
                scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
                start_time TIME DEFAULT '09:00:00',
                end_time TIME DEFAULT '11:00:00',
                duration_hours NUMERIC(4, 2) DEFAULT 2.00,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_task_id_format CHECK (task_id ~ '^TSK-\\d{4}-\\d{4}$')
            );
        `);

        // 5. Indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
            CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_id);
            CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles(vin);
            CREATE INDEX IF NOT EXISTS idx_wo_status ON work_order_data(status);
            CREATE INDEX IF NOT EXISTS idx_wo_schedule ON work_order_data(scheduled_start, scheduled_end);
            CREATE INDEX IF NOT EXISTS idx_tasks_date ON scheduled_tasks(scheduled_date);
            CREATE INDEX IF NOT EXISTS idx_tasks_staff ON scheduled_tasks(assigned_staff_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON scheduled_tasks(status);
            CREATE INDEX IF NOT EXISTS idx_inventory_reorder ON inventory_data(stock_quantity, reorder_threshold);
            CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoice_data(status);
            CREATE INDEX IF NOT EXISTS idx_audit_json ON audit_logs USING GIN (payload_json);
        `);

        console.log("✅ Tables and indexes created successfully on Neon!");

        // 6. Seed default accounts if users table is empty
        const userCountRes = await client.query(`SELECT COUNT(*) FROM users;`);
        const userCount = parseInt(userCountRes.rows[0].count, 10);

        if (userCount === 0) {
            console.log("🌱 Seeding default Admin, Staff, and Car Owner accounts on Neon...");

            const adminHashed = await bcrypt.hash("admin123", 10);
            const userHashed = await bcrypt.hash("password123", 10);

            // Insert Admin
            await client.query(`
                INSERT INTO users (email, password, role, is_active)
                VALUES ('waqas@gmail.com', $1, 'admin', TRUE);
            `, [adminHashed]);

            await client.query(`
                INSERT INTO users (email, password, role, is_active)
                VALUES ('admin@precision.garage', $1, 'admin', TRUE);
            `, [adminHashed]);

            // Insert Staff Member & User
            const staffRes = await client.query(`
                INSERT INTO staff_data (full_name, role, email, phone_number, hourly_rate, is_active)
                VALUES ('Marcus Vance', 'Master Mechanic', 'marcus@gmail.com', '12345678', 45.00, TRUE)
                RETURNING staff_id;
            `);
            const staffId = staffRes.rows[0].staff_id;

            await client.query(`
                INSERT INTO users (email, password, role, staff_id, is_active)
                VALUES ('marcus@gmail.com', $1, 'staff', $2, TRUE);
            `, [userHashed, staffId]);

            // Insert Car Owner, Vehicle, & User
            const ownerRes = await client.query(`
                INSERT INTO car_owners (full_name, phone_number, email_address, billing_address, is_vip)
                VALUES ('kashi sab', '03136261165', 'kashinat@gmail.com', 'Rawalpindi, PK', TRUE)
                RETURNING owner_id;
            `);
            const ownerId = ownerRes.rows[0].owner_id;

            await client.query(`
                INSERT INTO users (email, password, role, owner_id, is_active)
                VALUES ('kashinat@gmail.com', $1, 'car_owner', $2, TRUE);
            `, [userHashed, ownerId]);

            await client.query(`
                INSERT INTO vehicles (owner_id, vin, make, model, year, license_plate)
                VALUES ($1, '1HGCR2F83HA001234', 'Toyota', 'Camry', 2001, 'BPN989898');
            `, [ownerId]);

            // Insert initial inventory items
            await client.query(`
                INSERT INTO inventory_data (sku, part_name, category, stock_quantity, reorder_threshold, unit_cost, selling_price)
                VALUES 
                ('BRK-001', 'Ceramic Brake Pads Front', 'Brakes', 24, 6, 35.00, 75.00),
                ('OIL-5W30', 'Fully Synthetic Motor Oil 5W-30 (1L)', 'Fluids', 60, 15, 8.50, 18.00),
                ('FLT-AIR-01', 'High Flow Engine Air Filter', 'Filters', 18, 5, 12.00, 28.00),
                ('SPK-IRID', 'Iridium Long-Life Spark Plug', 'Ignition', 40, 10, 6.00, 14.50),
                ('BAT-12V-AGM', '12V 70Ah AGM Heavy Duty Battery', 'Electrical', 8, 3, 90.00, 165.00)
                ON CONFLICT (sku) DO NOTHING;
            `);

            console.log("✅ Seed data populated successfully!");
        } else {
            console.log(`ℹ️ Neon database already contains ${userCount} user accounts. Schema verified.`);
        }

        console.log("\n🎉 NEON DATABASE MIGRATION COMPLETE! 🎉\n");
    } catch (err) {
        console.error("❌ Migration Error:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
