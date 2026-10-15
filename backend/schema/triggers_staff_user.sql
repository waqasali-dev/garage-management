-- ============================================================================
-- USER & STAFF PROFILE SYNCHRONIZATION TRIGGERS (Section 3.1 Issue 2)
-- Automatically synchronizes is_active and email between users and staff_data
-- to prevent split-brain state and dual authority entity duplication.
-- Uses pg_trigger_depth() to prevent trigger recursion loops.
-- ============================================================================

-- 1. Propagate updates from users to staff_data
CREATE OR REPLACE FUNCTION fn_sync_user_to_staff()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.staff_id IS NOT NULL AND (
        (OLD.is_active IS DISTINCT FROM NEW.is_active) OR 
        (OLD.email IS DISTINCT FROM NEW.email)
    ) THEN
        UPDATE staff_data
        SET is_active = NEW.is_active,
            email = NEW.email
        WHERE staff_id = NEW.staff_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_to_staff ON users;

CREATE TRIGGER trg_sync_user_to_staff
AFTER UPDATE OF is_active, email ON users
FOR EACH ROW
EXECUTE FUNCTION fn_sync_user_to_staff();


-- 2. Propagate updates from staff_data to users
CREATE OR REPLACE FUNCTION fn_sync_staff_to_user()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF (
        (OLD.is_active IS DISTINCT FROM NEW.is_active) OR 
        (OLD.email IS DISTINCT FROM NEW.email)
    ) THEN
        UPDATE users
        SET is_active = NEW.is_active,
            email = NEW.email,
            updated_at = CURRENT_TIMESTAMP
        WHERE staff_id = NEW.staff_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_staff_to_user ON staff_data;

CREATE TRIGGER trg_sync_staff_to_user
AFTER UPDATE OF is_active, email ON staff_data
FOR EACH ROW
EXECUTE FUNCTION fn_sync_staff_to_user();
