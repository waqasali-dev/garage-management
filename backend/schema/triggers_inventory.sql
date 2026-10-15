-- ============================================================================
-- INVENTORY BATCH & CATALOG STOCK SYNCHRONIZATION TRIGGER (Section 3.1 SEC-09)
-- Automatically synchronizes inventory_data.stock_quantity with the sum of
-- inventory_batches.quantity_remaining whenever batches are modified.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_sync_inventory_batch_stock()
RETURNS TRIGGER AS $$
DECLARE
    target_part_id INT;
    total_remaining INT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_part_id := OLD.part_id;
    ELSE
        target_part_id := NEW.part_id;
    END IF;

    -- Compute true remaining stock across all active batches for this part
    SELECT COALESCE(SUM(quantity_remaining), 0)
    INTO total_remaining
    FROM inventory_batches
    WHERE part_id = target_part_id;

    -- Update catalog stock quantity to guarantee 100% synchronization
    UPDATE inventory_data
    SET stock_quantity = total_remaining
    WHERE part_id = target_part_id;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_inventory_batch_stock ON inventory_batches;

CREATE TRIGGER trg_sync_inventory_batch_stock
AFTER INSERT OR UPDATE OR DELETE ON inventory_batches
FOR EACH ROW
EXECUTE FUNCTION fn_sync_inventory_batch_stock();
