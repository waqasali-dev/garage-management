-- ============================================================================
-- STATE MACHINE SYNCHRONIZATION TRIGGERS (Section 3.1 Issue 4)
-- Harmonizes status between appointments and work_order_data so workshop bay
-- occupancy, check-in, repair progression, and completion stay in lockstep.
-- Uses pg_trigger_depth() to prevent trigger recursion loops.
-- ============================================================================

-- 1. Appointment status changes propagate to linked Work Order
CREATE OR REPLACE FUNCTION fn_sync_appointment_to_work_order()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.work_order_id IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.status = 'in_bay' THEN
            UPDATE work_order_data
            SET status = 'in_progress',
                updated_at = CURRENT_TIMESTAMP
            WHERE work_order_id = NEW.work_order_id
              AND status IN ('received', 'scheduled');
        ELSIF NEW.status = 'completed' THEN
            UPDATE work_order_data
            SET status = 'completed',
                updated_at = CURRENT_TIMESTAMP
            WHERE work_order_id = NEW.work_order_id
              AND status NOT IN ('completed', 'cancelled');
        ELSIF NEW.status IN ('cancelled', 'no_show') THEN
            UPDATE work_order_data
            SET status = 'cancelled',
                updated_at = CURRENT_TIMESTAMP
            WHERE work_order_id = NEW.work_order_id
              AND status IN ('received', 'scheduled');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_appointment_to_work_order ON appointments;

CREATE TRIGGER trg_sync_appointment_to_work_order
AFTER UPDATE OF status ON appointments
FOR EACH ROW
EXECUTE FUNCTION fn_sync_appointment_to_work_order();


-- 2. Work Order status changes propagate to linked Appointment
CREATE OR REPLACE FUNCTION fn_sync_work_order_to_appointment()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.status IN ('in_progress', 'diagnosed', 'approved', 'quality_check') THEN
            UPDATE appointments
            SET status = 'in_bay',
                updated_at = CURRENT_TIMESTAMP
            WHERE work_order_id = NEW.work_order_id
              AND status = 'confirmed';
        ELSIF NEW.status IN ('completed', 'ready') THEN
            UPDATE appointments
            SET status = 'completed',
                updated_at = CURRENT_TIMESTAMP
            WHERE work_order_id = NEW.work_order_id
              AND status NOT IN ('completed', 'cancelled', 'no_show');
        ELSIF NEW.status = 'cancelled' THEN
            UPDATE appointments
            SET status = 'cancelled',
                updated_at = CURRENT_TIMESTAMP
            WHERE work_order_id = NEW.work_order_id
              AND status IN ('confirmed', 'in_bay');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_work_order_to_appointment ON work_order_data;

CREATE TRIGGER trg_sync_work_order_to_appointment
AFTER UPDATE OF status ON work_order_data
FOR EACH ROW
EXECUTE FUNCTION fn_sync_work_order_to_appointment();
