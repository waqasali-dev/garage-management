-- ============================================================================
-- 1. EXTENSIONS & ENUMS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role_enum AS ENUM (
    'admin',
    'staff',
    'car_owner'
);

CREATE TYPE work_order_status AS ENUM (
    'received',
    'scheduled',
    'diagnosed',
    'approved',
    'in_progress',
    'quality_check',
    'ready',
    'completed',
    'cancelled'
);

CREATE TYPE item_type_enum AS ENUM (
    'part',
    'labor'
);

CREATE TYPE invoice_status AS ENUM (
    'pending',
    'paid',
    'overdue',
    'cancelled'
);

CREATE TYPE media_type_enum AS ENUM (
    'vehicle_condition',
    'part_damage',
    'receipt',
    'other'
);

-- ============================================================================
-- 2. SEQUENCES & ID GENERATION FUNCTIONS
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS owner_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS vehicle_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS work_order_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS invoice_seq START WITH 1 INCREMENT BY 1;

-- Formatted Owner ID (e.g., OWN-0001)
CREATE OR REPLACE FUNCTION generate_owner_id()
RETURNS TEXT AS $$
BEGIN
    RETURN 'OWN-' || LPAD(NEXTVAL('owner_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Formatted Vehicle ID (e.g., VEH-0001)
CREATE OR REPLACE FUNCTION generate_vehicle_id()
RETURNS TEXT AS $$
BEGIN
    RETURN 'VEH-' || LPAD(NEXTVAL('vehicle_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Formatted Work Order ID (e.g., WO-2026-0001)
CREATE OR REPLACE FUNCTION generate_work_order_id()
RETURNS TEXT AS $$
BEGIN
    RETURN 'WO-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('work_order_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Formatted Invoice ID (e.g., INV-2026-0001)
CREATE OR REPLACE FUNCTION generate_invoice_id()
RETURNS TEXT AS $$
BEGIN
    RETURN 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('invoice_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. CORE ENTITY TABLES
-- ============================================================================

-- Car Owners
CREATE TABLE IF NOT EXISTS car_owners (
    owner_id VARCHAR(30) PRIMARY KEY DEFAULT generate_owner_id(),
    full_name VARCHAR(150) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    email_address VARCHAR(150),
    billing_address TEXT,
    vat_number VARCHAR(50),
    is_vip BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_owner_id_format CHECK (owner_id ~ '^OWN-\d{4,}$')
);

-- Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id VARCHAR(30) PRIMARY KEY DEFAULT generate_vehicle_id(),
    owner_id VARCHAR(30) NOT NULL REFERENCES car_owners(owner_id) ON DELETE CASCADE,
    vin VARCHAR(17) UNIQUE NOT NULL,
    make VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    year INT NOT NULL CHECK (year >= 1900 AND year <= 2100),
    license_plate VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_vehicle_id_format CHECK (vehicle_id ~ '^VEH-\d{4,}$')
);

-- Staff Members
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

-- User Accounts & Auth
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

-- Inventory & Spare Parts
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

-- ============================================================================
-- 4. OPERATIONS & FINANCIAL TABLES
-- ============================================================================

-- Work Orders
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
    booked_by VARCHAR(30) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_work_order_id_format CHECK (work_order_id ~ '^WO-\d{4}-\d{4}$')
);

-- Work Order Line Items (Parts & Labor)
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

-- Work Order Uploaded Media & Inspection Photos
CREATE TABLE IF NOT EXISTS work_order_media (
    media_id SERIAL PRIMARY KEY,
    work_order_id VARCHAR(30) NOT NULL REFERENCES work_order_data(work_order_id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_type media_type_enum DEFAULT 'vehicle_condition',
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoice_data (
    invoice_id VARCHAR(30) PRIMARY KEY DEFAULT generate_invoice_id(),
    work_order_id VARCHAR(30) UNIQUE NOT NULL REFERENCES work_order_data(work_order_id) ON DELETE RESTRICT,
    owner_id VARCHAR(30) NOT NULL REFERENCES car_owners(owner_id) ON DELETE RESTRICT,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tax_percentage NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(10, 2) GENERATED ALWAYS AS (subtotal + tax_amount) STORED,
    status invoice_status NOT NULL DEFAULT 'pending',
    customer_vat VARCHAR(50),
    date_issued DATE NOT NULL DEFAULT CURRENT_DATE,
    date_due DATE,
    date_paid DATE,
    CONSTRAINT chk_invoice_id_format CHECK (invoice_id ~ '^INV-\d{4}-\d{4}$')
);

-- System Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id SERIAL PRIMARY KEY,
    work_order_id VARCHAR(30) REFERENCES work_order_data(work_order_id) ON DELETE SET NULL,
    staff_id INT REFERENCES staff_data(staff_id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    payload_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled Tasks & Workshop Calendar
CREATE SEQUENCE IF NOT EXISTS task_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION generate_task_id()
RETURNS TEXT AS $$
BEGIN
    RETURN 'TSK-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('task_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TYPE task_priority_enum AS ENUM (
    'low',
    'standard',
    'high',
    'urgent'
);

CREATE TYPE task_status_enum AS ENUM (
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
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
    CONSTRAINT chk_task_id_format CHECK (task_id ~ '^TSK-\d{4}-\d{4}$')
);

-- Workshop Bays & Configuration
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

-- Appointments & Vehicle Bookings
CREATE SEQUENCE IF NOT EXISTS appointment_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION generate_appointment_id()
RETURNS TEXT AS $$
BEGIN
    RETURN 'APT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('appointment_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

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

-- Workshop & System Settings
CREATE TABLE IF NOT EXISTS workshop_settings (
    id INT PRIMARY KEY DEFAULT 1,
    tax_percentage NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
    currency_symbol VARCHAR(10) NOT NULL DEFAULT '$',
    currency_decimals INT NOT NULL DEFAULT 2,
    workshop_name VARCHAR(100) DEFAULT 'Precision Garage',
    working_hours JSONB DEFAULT '{
        "operating_days": [1, 2, 3, 4, 5, 6],
        "slot_duration_minutes": 60,
        "shifts": [
            { "id": "shift-1", "start": "08:00", "end": "13:00", "label": "Morning Shift" },
            { "id": "shift-2", "start": "16:00", "end": "20:00", "label": "Evening Shift" }
        ]
    }'::JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_single_settings CHECK (id = 1)
);

-- ============================================
-- 5. PERFORMANCE INDEXES
-- ============================================

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
CREATE INDEX IF NOT EXISTS idx_appointments_date_bay ON appointments(appointment_date, bay_id);
CREATE INDEX IF NOT EXISTS idx_appointments_vehicle ON appointments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_appointments_owner ON appointments(owner_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_workshop_bays_active ON workshop_bays(is_active);
