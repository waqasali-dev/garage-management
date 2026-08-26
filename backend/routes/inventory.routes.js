import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCachePattern } from "../redis.js";

const router = express.Router();

// GET /api/inventory - Fetch all inventory parts with computed statuses and KPI metrics
router.get("/", async (req, res) => {
    const cacheKey = "garage:cache:inventory:all";

    try {
        // 1. Check Redis Cache
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", ...cached });
        }

        // 2. Fetch all parts from inventory_data
        const itemsQuery = `
            SELECT 
                part_id,
                sku,
                part_name AS name,
                category,
                stock_quantity AS stock,
                reorder_threshold,
                unit_cost,
                selling_price,
                created_at
            FROM inventory_data
            ORDER BY created_at DESC, part_name ASC;
        `;
        const itemsResult = await pool.query(itemsQuery);

        // 3. Compute statuses and formatted currency
        const formattedItems = itemsResult.rows.map((item) => {
            const stock = parseInt(item.stock, 10) || 0;
            const threshold = parseInt(item.reorder_threshold, 10) || 5;
            const unitCostNum = parseFloat(item.unit_cost) || 0;
            const sellingPriceNum = parseFloat(item.selling_price) || 0;

            let status = "Optimal";
            let statusType = "success";

            if (stock <= 0) {
                status = "Out of Stock";
                statusType = "error";
            } else if (stock <= threshold) {
                status = "Low Stock";
                statusType = "warning";
            }

            return {
                part_id: item.part_id,
                sku: item.sku,
                name: item.name,
                part_name: item.name,
                category: item.category,
                stock: stock,
                stock_quantity: stock,
                reorder_threshold: threshold,
                unit_cost: unitCostNum,
                selling_price: sellingPriceNum,
                unitCost: `$${unitCostNum.toFixed(2)}`,
                sellingPrice: `$${sellingPriceNum.toFixed(2)}`,
                status: status,
                statusType: statusType,
                created_at: item.created_at,
            };
        });

        // 4. Compute KPI Metrics
        let totalVal = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let totalQuantity = 0;
        const categorySet = new Set();

        formattedItems.forEach((it) => {
            totalVal += it.stock * it.unit_cost;
            totalQuantity += it.stock;
            categorySet.add(it.category);
            if (it.statusType === "warning") lowStockCount++;
            if (it.statusType === "error") outOfStockCount++;
        });

        const kpiStats = {
            totalValue: `$${totalVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            totalValueRaw: totalVal,
            lowStockAlerts: lowStockCount + outOfStockCount,
            lowStockCount,
            outOfStockCount,
            totalItems: totalQuantity,
            totalSKUs: formattedItems.length,
            categoriesCount: categorySet.size,
        };

        const responsePayload = {
            data: formattedItems,
            kpi: kpiStats,
        };

        // 5. Save to Redis Cache (TTL: 5 minutes)
        await setCache(cacheKey, responsePayload, 300);

        res.json({ success: true, source: "postgres", ...responsePayload });
    } catch (err) {
        console.error("Error fetching inventory:", err);
        res.status(500).json({ error: "Failed to fetch inventory from database", details: err.message });
    }
});

// GET /api/inventory/categories - List unique categories
router.get("/categories", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT DISTINCT category FROM inventory_data WHERE category IS NOT NULL ORDER BY category ASC;"
        );
        const categories = result.rows.map((r) => r.category);
        res.json({ success: true, data: categories });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch categories", details: err.message });
    }
});

// POST /api/inventory - Add a new part to inventory_data
router.post("/", async (req, res) => {
    const {
        sku,
        part_name,
        name,
        category,
        stock_quantity = 0,
        stock = 0,
        reorder_threshold = 5,
        unit_cost = 0.0,
        selling_price = 0.0,
    } = req.body;

    const targetName = (part_name || name || "").trim();
    const targetSku = (sku || "").trim().toUpperCase();
    const targetCategory = (category || "General").trim();
    const initialStock = parseInt(stock_quantity || stock || 0, 10);
    const threshold = parseInt(reorder_threshold || 5, 10);
    const unitCost = parseFloat(unit_cost) || 0.0;
    const sellingPrice = parseFloat(selling_price) || 0.0;

    if (!targetSku || !targetName) {
        return res.status(400).json({ error: "SKU and Part Name are required fields." });
    }

    if (initialStock < 0) {
        return res.status(400).json({ error: "Stock quantity cannot be negative." });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Check SKU uniqueness
        const checkSku = await client.query(
            "SELECT part_id FROM inventory_data WHERE UPPER(sku) = $1;",
            [targetSku]
        );
        if (checkSku.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: `Part with SKU '${targetSku}' already exists in inventory.` });
        }

        const insertQuery = `
            INSERT INTO inventory_data (
                sku,
                part_name,
                category,
                stock_quantity,
                reorder_threshold,
                unit_cost,
                selling_price
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const result = await client.query(insertQuery, [
            targetSku,
            targetName,
            targetCategory,
            initialStock,
            threshold,
            unitCost,
            sellingPrice,
        ]);

        const newPart = result.rows[0];

        // Audit Log
        await client.query(
            `INSERT INTO audit_logs (event_type, description, payload_json)
             VALUES ('PART_ALLOCATED', $1, $2);`,
            [
                `New part '${targetName}' (${targetSku}) added to inventory`,
                JSON.stringify({ part_id: newPart.part_id, sku: targetSku, stock: initialStock }),
            ]
        );

        await client.query("COMMIT");

        // Invalidate Redis Caches
        await deleteCachePattern("garage:cache:inventory:*");

        res.status(201).json({
            success: true,
            message: `Part '${targetName}' (${targetSku}) added successfully to inventory.`,
            data: newPart,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error adding inventory part:", err);
        res.status(500).json({ error: "Database error while adding part", details: err.message });
    } finally {
        client.release();
    }
});

// PATCH /api/inventory/:id - Update part details
router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const partId = parseInt(id, 10);

    if (isNaN(partId)) {
        return res.status(400).json({ error: "Invalid part ID" });
    }

    const {
        sku,
        part_name,
        name,
        category,
        stock_quantity,
        stock,
        reorder_threshold,
        unit_cost,
        selling_price,
    } = req.body;

    const targetName = part_name || name;
    const targetStock = stock_quantity !== undefined ? stock_quantity : stock;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const query = `
            UPDATE inventory_data
            SET
                sku = COALESCE($1, sku),
                part_name = COALESCE($2, part_name),
                category = COALESCE($3, category),
                stock_quantity = COALESCE($4, stock_quantity),
                reorder_threshold = COALESCE($5, reorder_threshold),
                unit_cost = COALESCE($6, unit_cost),
                selling_price = COALESCE($7, selling_price)
            WHERE part_id = $8
            RETURNING *;
        `;

        const result = await client.query(query, [
            sku ? sku.trim().toUpperCase() : null,
            targetName ? targetName.trim() : null,
            category ? category.trim() : null,
            targetStock !== undefined ? parseInt(targetStock, 10) : null,
            reorder_threshold !== undefined ? parseInt(reorder_threshold, 10) : null,
            unit_cost !== undefined ? parseFloat(unit_cost) : null,
            selling_price !== undefined ? parseFloat(selling_price) : null,
            partId,
        ]);

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Part not found in inventory" });
        }

        const updatedPart = result.rows[0];

        // Create Audit Log Entry for Part Edit atomically
        await client.query(
            `INSERT INTO audit_logs (event_type, description, payload_json)
             VALUES ('INVENTORY_UPDATE', $1, $2);`,
            [
                `Part '${updatedPart.part_name}' (${updatedPart.sku}) details updated. Selling Price: $${parseFloat(updatedPart.selling_price || 0).toFixed(2)}, Cost: $${parseFloat(updatedPart.unit_cost || 0).toFixed(2)}, Stock: ${updatedPart.stock_quantity}`,
                JSON.stringify({
                    part_id: updatedPart.part_id,
                    sku: updatedPart.sku,
                    part_name: updatedPart.part_name,
                    selling_price: updatedPart.selling_price,
                    unit_cost: updatedPart.unit_cost,
                    stock_quantity: updatedPart.stock_quantity,
                    reorder_threshold: updatedPart.reorder_threshold,
                }),
            ]
        );

        await client.query("COMMIT");

        await deleteCachePattern("garage:cache:inventory:*");

        res.json({
            success: true,
            message: "Part details updated successfully",
            data: updatedPart,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error updating inventory part:", err);
        res.status(500).json({ error: "Failed to update part", details: err.message });
    } finally {
        client.release();
    }
});

// PATCH /api/inventory/:id/restock - Restock / add stock units to a part
router.patch("/:id/restock", async (req, res) => {
    const { id } = req.params;
    const partId = parseInt(id, 10);
    const { added_quantity, unit_cost } = req.body;

    if (isNaN(partId)) {
        return res.status(400).json({ error: "Invalid part ID" });
    }

    const qtyToAdd = parseInt(added_quantity, 10);
    if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
        return res.status(400).json({ error: "Added quantity must be a positive integer greater than 0." });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const updateQuery = `
            UPDATE inventory_data
            SET 
                stock_quantity = stock_quantity + $1,
                unit_cost = COALESCE($2, unit_cost)
            WHERE part_id = $3
            RETURNING *;
        `;
        const updatedCost = unit_cost !== undefined && unit_cost !== "" ? parseFloat(unit_cost) : null;
        const result = await client.query(updateQuery, [qtyToAdd, updatedCost, partId]);

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Part not found in inventory" });
        }

        const updatedPart = result.rows[0];

        // Audit Log
        await client.query(
            `INSERT INTO audit_logs (event_type, description, payload_json)
             VALUES ('PART_ALLOCATED', $1, $2);`,
            [
                `Restocked ${qtyToAdd} units of '${updatedPart.part_name}' (${updatedPart.sku}). New stock: ${updatedPart.stock_quantity}`,
                JSON.stringify({
                    part_id: updatedPart.part_id,
                    sku: updatedPart.sku,
                    added_quantity: qtyToAdd,
                    new_stock: updatedPart.stock_quantity,
                    unit_cost: updatedPart.unit_cost,
                }),
            ]
        );

        await client.query("COMMIT");

        await deleteCachePattern("garage:cache:inventory:*");

        res.json({
            success: true,
            message: `Restocked ${qtyToAdd} units of [${updatedPart.sku}] ${updatedPart.part_name}. Total in stock: ${updatedPart.stock_quantity}`,
            data: updatedPart,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error restocking inventory part:", err);
        res.status(500).json({ error: "Failed to restock part in database", details: err.message });
    } finally {
        client.release();
    }
});

// DELETE /api/inventory/:id - Delete a part from inventory
router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const partId = parseInt(id, 10);

    if (isNaN(partId)) {
        return res.status(400).json({ error: "Invalid part ID" });
    }

    try {
        const result = await pool.query(
            "DELETE FROM inventory_data WHERE part_id = $1 RETURNING part_id, sku, part_name;",
            [partId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Part not found in inventory" });
        }

        const deleted = result.rows[0];

        // Audit Log
        await pool.query(
            `INSERT INTO audit_logs (event_type, description, payload_json)
             VALUES ('STATUS_CHANGE', $1, $2);`,
            [
                `Part '${deleted.part_name}' (${deleted.sku}) removed from inventory`,
                JSON.stringify({ deleted_part_id: deleted.part_id, sku: deleted.sku }),
            ]
        );

        await deleteCachePattern("garage:cache:inventory:*");

        res.json({
            success: true,
            message: `Part '${deleted.part_name}' (${deleted.sku}) deleted successfully`,
            deletedPart: deleted,
        });
    } catch (err) {
        console.error("Error deleting inventory part:", err);
        res.status(500).json({ error: "Failed to delete part from database", details: err.message });
    }
});

export default router;
