-- ============================================================================
-- 3NF FINANCIAL TOTALS SYNCHRONIZATION TRIGGER (Section 3.1 Issue 1)
-- Automatically synchronizes work_order_data.total_cost and pending invoice_data.subtotal
-- whenever work_order_items are inserted, updated, or deleted.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_sync_work_order_totals()
RETURNS TRIGGER AS $$
DECLARE
    target_wo_id VARCHAR(30);
    new_subtotal NUMERIC(10, 2);
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_wo_id := OLD.work_order_id;
    ELSE
        target_wo_id := NEW.work_order_id;
    END IF;

    -- Calculate current sum of line items for the work order
    SELECT COALESCE(SUM(total_price), 0.00)
    INTO new_subtotal
    FROM work_order_items
    WHERE work_order_id = target_wo_id;

    -- Update work_order_data.total_cost directly
    UPDATE work_order_data
    SET total_cost = new_subtotal,
        updated_at = CURRENT_TIMESTAMP
    WHERE work_order_id = target_wo_id;

    -- Update pending invoice subtotal and tax_amount if linked invoice exists
    UPDATE invoice_data
    SET subtotal = new_subtotal,
        tax_amount = ROUND(new_subtotal * (tax_percentage / 100.0), 2)
    WHERE work_order_id = target_wo_id
      AND status = 'pending';

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_work_order_totals ON work_order_items;

CREATE TRIGGER trg_sync_work_order_totals
AFTER INSERT OR UPDATE OR DELETE ON work_order_items
FOR EACH ROW
EXECUTE FUNCTION fn_sync_work_order_totals();
