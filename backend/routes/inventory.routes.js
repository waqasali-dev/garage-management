import express from "express";
import pool from "../db.js";
import { getCache, setCache, deleteCachePattern } from "../redis.js";

const router = express.Router();

// GET /api/inventory & GET /api/inventory/items - Fetch all inventory parts with batch-aware valuation and KPI metrics
export const handleGetInventory = async (req, res) => {
    const cacheKey = "garage:cache:inventory:all";

    try {
        // 1. Check Redis Cache
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", ...cached });
        }

        // 2. Fetch workshop settings (currency and valuation_method)
        let currSymbol = "$";
        let valuationMethod = "fifo";
        try {
            const sRes = await pool.query(
                "SELECT currency_symbol, COALESCE(valuation_method, 'fifo') AS valuation_method FROM workshop_settings WHERE id = 1"
            );
            if (sRes.rows.length > 0) {
                if (sRes.rows[0].currency_symbol) currSymbol = sRes.rows[0].currency_symbol;
                if (sRes.rows[0].valuation_method) valuationMethod = sRes.rows[0].valuation_method;
            }
        } catch (e) {
            console.warn("Notice: Failed to fetch settings in inventory:", e.message);
        }

        const isPrefixChar = ['$', '€', '£', '₹', '¥'].includes(currSymbol);

        // 3. Fetch all parts with batch metrics & pricing
        const itemsQuery = `
            SELECT 
                i.part_id,
                i.sku,
                i.part_name AS name,
                i.category,
                i.stock_quantity AS stock,
                i.reorder_threshold,
                i.unit_cost,
                i.selling_price,
                i.created_at,
                COUNT(b.batch_id) FILTER (WHERE b.quantity_remaining > 0)::int AS active_batches_count,
                COUNT(b.batch_id)::int AS total_batches_count,
                COALESCE(SUM(b.quantity_remaining), i.stock_quantity)::int AS batch_stock_total,
                -- FIFO next available batch (oldest batch with stock)
                (
                    SELECT b_fifo.selling_price 
                    FROM inventory_batches b_fifo 
                    WHERE b_fifo.part_id = i.part_id AND b_fifo.quantity_remaining > 0 
                    ORDER BY b_fifo.created_at ASC, b_fifo.batch_id ASC LIMIT 1
                ) AS fifo_selling_price,
                (
                    SELECT b_fifo.unit_cost 
                    FROM inventory_batches b_fifo 
                    WHERE b_fifo.part_id = i.part_id AND b_fifo.quantity_remaining > 0 
                    ORDER BY b_fifo.created_at ASC, b_fifo.batch_id ASC LIMIT 1
                ) AS fifo_unit_cost,
                -- LIFO next available batch (newest batch with stock)
                (
                    SELECT b_lifo.selling_price 
                    FROM inventory_batches b_lifo 
                    WHERE b_lifo.part_id = i.part_id AND b_lifo.quantity_remaining > 0 
                    ORDER BY b_lifo.created_at DESC, b_lifo.batch_id DESC LIMIT 1
                ) AS lifo_selling_price,
                (
                    SELECT b_lifo.unit_cost 
                    FROM inventory_batches b_lifo 
                    WHERE b_lifo.part_id = i.part_id AND b_lifo.quantity_remaining > 0 
                    ORDER BY b_lifo.created_at DESC, b_lifo.batch_id DESC LIMIT 1
                ) AS lifo_unit_cost
            FROM inventory_data i
            LEFT JOIN inventory_batches b ON i.part_id = b.part_id
            GROUP BY i.part_id
            ORDER BY i.created_at DESC, i.part_name ASC;
        `;
        const itemsResult = await pool.query(itemsQuery);

        // 4. Compute statuses, effective pricing by valuation method, and formatted currency
        const formattedItems = itemsResult.rows.map((item) => {
            const stock = parseInt(item.stock, 10) || 0;
            const threshold = parseInt(item.reorder_threshold, 10) || 5;
            const defaultUnitCost = parseFloat(item.unit_cost) || 0;
            const defaultSellingPrice = parseFloat(item.selling_price) || 0;

            const fifoSelling = item.fifo_selling_price !== null ? parseFloat(item.fifo_selling_price) : defaultSellingPrice;
            const fifoCost = item.fifo_unit_cost !== null ? parseFloat(item.fifo_unit_cost) : defaultUnitCost;

            const lifoSelling = item.lifo_selling_price !== null ? parseFloat(item.lifo_selling_price) : defaultSellingPrice;
            const lifoCost = item.lifo_unit_cost !== null ? parseFloat(item.lifo_unit_cost) : defaultUnitCost;

            let effectiveSellingPriceNum = defaultSellingPrice;
            let effectiveUnitCostNum = defaultUnitCost;

            if (valuationMethod === "fifo") {
                effectiveSellingPriceNum = fifoSelling;
                effectiveUnitCostNum = fifoCost;
            } else if (valuationMethod === "lifo") {
                effectiveSellingPriceNum = lifoSelling;
                effectiveUnitCostNum = lifoCost;
            } else {
                // Normal / standard
                effectiveSellingPriceNum = defaultSellingPrice;
                effectiveUnitCostNum = defaultUnitCost;
            }

            let status = "Optimal";
            let statusType = "success";

            if (stock <= 0) {
                status = "Out of Stock";
                statusType = "error";
            } else if (stock <= threshold) {
                status = "Low Stock";
                statusType = "warning";
            }

            const formattedUnitCost = isPrefixChar ? `${currSymbol}${effectiveUnitCostNum.toFixed(2)}` : `${currSymbol} ${effectiveUnitCostNum.toFixed(2)}`;
            const formattedSellingPrice = isPrefixChar ? `${currSymbol}${effectiveSellingPriceNum.toFixed(2)}` : `${currSymbol} ${effectiveSellingPriceNum.toFixed(2)}`;

            return {
                part_id: item.part_id,
                sku: item.sku,
                name: item.name,
                part_name: item.name,
                category: item.category,
                stock: stock,
                stock_quantity: stock,
                reorder_threshold: threshold,
                unit_cost: effectiveUnitCostNum,
                selling_price: effectiveSellingPriceNum,
                base_unit_cost: defaultUnitCost,
                base_selling_price: defaultSellingPrice,
                fifo_selling_price: fifoSelling,
                fifo_unit_cost: fifoCost,
                lifo_selling_price: lifoSelling,
                lifo_unit_cost: lifoCost,
                active_batches_count: item.active_batches_count || 0,
                total_batches_count: item.total_batches_count || 0,
                unitCost: formattedUnitCost,
                sellingPrice: formattedSellingPrice,
                status: status,
                statusType: statusType,
                created_at: item.created_at,
            };
        });

        // 5. Compute KPI Metrics
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

        const formattedTotalVal = isPrefixChar 
            ? `${currSymbol}${totalVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `${currSymbol} ${totalVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const kpiStats = {
            totalValue: formattedTotalVal,
            totalValueRaw: totalVal,
            lowStockAlerts: lowStockCount + outOfStockCount,
            lowStockCount,
            outOfStockCount,
            totalItems: totalQuantity,
            totalSKUs: formattedItems.length,
            categoriesCount: categorySet.size,
            valuation_method: valuationMethod,
        };

        const responsePayload = {
            data: formattedItems,
            kpi: kpiStats,
            valuation_method: valuationMethod,
        };

        // 6. Save to Redis Cache (TTL: 5 minutes)
        await setCache(cacheKey, responsePayload, 300);

        res.json({ success: true, source: "postgres", ...responsePayload });
    } catch (err) {
        console.error("Error fetching inventory:", err);
        res.status(500).json({ error: "Failed to fetch inventory from database", details: err.message });
    }
};

router.get("/", handleGetInventory);
router.get("/items", handleGetInventory);

// GET /api/inventory/categories - List unique categories with Redis caching
router.get("/categories", async (req, res) => {
    const cacheKey = "garage:cache:inventory:categories";
    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, source: "redis", data: cached });
        }

        const result = await pool.query(
            "SELECT DISTINCT category FROM inventory_data WHERE category IS NOT NULL ORDER BY category ASC;"
        );
        const categories = result.rows.map((r) => r.category);
        await setCache(cacheKey, categories, 600);
        res.json({ success: true, source: "postgres", data: categories });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch categories", details: err.message });
    }
});

// GET /api/inventory/:id/details - Comprehensive Item Details with Active Batches, Price History, and Graph Data
router.get("/:id/details", async (req, res) => {
    const { id } = req.params;
    const partId = parseInt(id, 10);

    if (isNaN(partId)) {
        return res.status(400).json({ error: "Invalid part ID" });
    }

    try {
        // 1. Fetch Part Catalog Details
        const partResult = await pool.query(
            `SELECT part_id, sku, part_name, category, stock_quantity, reorder_threshold, unit_cost, selling_price, created_at
             FROM inventory_data 
             WHERE part_id = $1;`,
            [partId]
        );

        if (partResult.rows.length === 0) {
            return res.status(404).json({ error: "Part not found in inventory." });
        }

        const part = partResult.rows[0];

        // 2. Fetch Workshop Valuation Method & Currency
        const settRes = await pool.query(
            "SELECT currency_symbol, currency_code, COALESCE(valuation_method, 'fifo') AS valuation_method FROM workshop_settings WHERE id = 1"
        );
        const settings = settRes.rows[0] || { currency_symbol: "$", currency_code: "USD", valuation_method: "fifo" };
        const valuationMethod = settings.valuation_method;
        const currSymbol = settings.currency_symbol || "$";

        // 3. Fetch All Batches for this Part
        const batchesResult = await pool.query(
            `SELECT 
                batch_id,
                batch_number,
                quantity_received,
                quantity_remaining,
                unit_cost::float AS unit_cost,
                selling_price::float AS selling_price,
                received_date,
                notes,
                created_at,
                updated_at,
                CASE 
                    WHEN quantity_remaining <= 0 THEN 'depleted'
                    WHEN quantity_remaining < quantity_received THEN 'partially_consumed'
                    ELSE 'active'
                END AS status
             FROM inventory_batches
             WHERE part_id = $1
             ORDER BY created_at DESC, batch_id DESC;`,
            [partId]
        );

        const batches = batchesResult.rows;

        // 4. Fetch Complete Price History for this Part (ordered chronologically for graphing)
        const historyResult = await pool.query(
            `SELECT 
                h.history_id,
                h.batch_id,
                h.change_type,
                h.old_unit_cost::float AS old_unit_cost,
                h.new_unit_cost::float AS new_unit_cost,
                h.old_selling_price::float AS old_selling_price,
                h.new_selling_price::float AS new_selling_price,
                h.quantity_changed,
                h.notes,
                h.recorded_at,
                b.batch_number
             FROM inventory_price_history h
             LEFT JOIN inventory_batches b ON h.batch_id = b.batch_id
             WHERE h.part_id = $1
             ORDER BY h.recorded_at ASC, h.history_id ASC;`,
            [partId]
        );

        const priceHistory = historyResult.rows;

        // 5. Build Graph Timeline Data Points
        // We will build clean sequential price points suitable for SVG line chart
        const graphTimeline = priceHistory.map((item, index) => {
            const dateObj = new Date(item.recorded_at);
            const dateLabel = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            const timeLabel = dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

            return {
                id: item.history_id,
                index: index + 1,
                date: item.recorded_at,
                dateLabel: `${dateLabel} ${timeLabel}`,
                shortDate: dateLabel,
                costPrice: item.new_unit_cost,
                sellingPrice: item.new_selling_price,
                profitMargin: (item.new_selling_price - item.new_unit_cost).toFixed(2),
                marginPercent: item.new_unit_cost > 0 ? (((item.new_selling_price - item.new_unit_cost) / item.new_unit_cost) * 100).toFixed(1) : "100.0",
                changeType: item.change_type,
                batchNumber: item.batch_number || "Baseline",
                notes: item.notes,
            };
        });

        // 6. Compute Batch Summary Statistics
        let totalBatchStock = 0;
        let totalValuationCost = 0;
        let activeBatchesCount = 0;

        batches.forEach((b) => {
            if (b.quantity_remaining > 0) {
                activeBatchesCount++;
                totalBatchStock += b.quantity_remaining;
                totalValuationCost += (b.quantity_remaining * b.unit_cost);
            }
        });

        const weightedAvgCost = totalBatchStock > 0 ? (totalValuationCost / totalBatchStock) : parseFloat(part.unit_cost || 0);

        // Next batch to be sold according to current valuation method:
        let nextBatchToSell = null;
        if (valuationMethod === "lifo") {
            nextBatchToSell = batches.find((b) => b.quantity_remaining > 0); // already sorted DESC
        } else {
            // FIFO: reverse to find oldest with quantity_remaining > 0
            const activeAsc = [...batches].reverse();
            nextBatchToSell = activeAsc.find((b) => b.quantity_remaining > 0);
        }

        const nextSellingPrice = nextBatchToSell ? nextBatchToSell.selling_price : parseFloat(part.selling_price || 0);
        const nextCostPrice = nextBatchToSell ? nextBatchToSell.unit_cost : parseFloat(part.unit_cost || 0);

        res.json({
            success: true,
            data: {
                part: {
                    ...part,
                    stock_quantity: parseInt(part.stock_quantity, 10),
                    unit_cost: parseFloat(part.unit_cost || 0),
                    selling_price: parseFloat(part.selling_price || 0),
                },
                valuation_method: valuationMethod,
                currency_symbol: currSymbol,
                batches,
                price_history: priceHistory,
                graph_timeline: graphTimeline,
                stats: {
                    total_stock: totalBatchStock || parseInt(part.stock_quantity, 10),
                    active_batches_count: activeBatchesCount,
                    total_batches_count: batches.length,
                    weighted_avg_cost: parseFloat(weightedAvgCost.toFixed(2)),
                    next_selling_price: parseFloat(nextSellingPrice.toFixed(2)),
                    next_cost_price: parseFloat(nextCostPrice.toFixed(2)),
                    next_batch_number: nextBatchToSell ? nextBatchToSell.batch_number : "Standard",
                },
            },
        });
    } catch (err) {
        console.error("Error fetching inventory part details:", err);
        res.status(500).json({ error: "Failed to fetch item details", details: err.message });
    }
});

// POST /api/inventory - Add a new part to inventory_data with initial batch
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
    const targetCategory = (category || "General Hardware").trim();
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

        // Create initial batch if stock > 0
        let batchId = null;
        if (initialStock > 0) {
            const batchNum = `INIT-${targetSku}`;
            const bRes = await client.query(
                `INSERT INTO inventory_batches (
                    part_id,
                    batch_number,
                    quantity_received,
                    quantity_remaining,
                    unit_cost,
                    selling_price,
                    received_date,
                    notes
                )
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, 'Initial baseline catalog inventory')
                RETURNING batch_id;`,
                [newPart.part_id, batchNum, initialStock, initialStock, unitCost, sellingPrice]
            );
            batchId = bRes.rows[0]?.batch_id;
        }

        // Record Initial Price History
        await client.query(
            `INSERT INTO inventory_price_history (
                part_id,
                batch_id,
                change_type,
                old_unit_cost,
                new_unit_cost,
                old_selling_price,
                new_selling_price,
                quantity_changed,
                notes
            )
            VALUES ($1, $2, 'INITIAL', $3, $3, $4, $4, $5, 'Catalog item created');`,
            [newPart.part_id, batchId, unitCost, sellingPrice, initialStock]
        );

        // Audit Log
        await client.query(
            `INSERT INTO audit_logs (event_type, description, payload_json)
             VALUES ('PART_ALLOCATED', $1, $2);`,
            [
                `New part '${targetName}' (${targetSku}) added to inventory. Stock: ${initialStock}, Cost: $${unitCost.toFixed(2)}, Price: $${sellingPrice.toFixed(2)}`,
                JSON.stringify({ part_id: newPart.part_id, sku: targetSku, stock: initialStock, unitCost, sellingPrice }),
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

// PATCH /api/inventory/:id - Update part details and record price adjustments if modified
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

        const curPartRes = await client.query(
            "SELECT * FROM inventory_data WHERE part_id = $1 FOR UPDATE;",
            [partId]
        );
        if (curPartRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Part not found in inventory" });
        }
        const curPart = curPartRes.rows[0];

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

        const newCost = unit_cost !== undefined ? parseFloat(unit_cost) : null;
        const newPrice = selling_price !== undefined ? parseFloat(selling_price) : null;

        const result = await client.query(query, [
            sku ? sku.trim().toUpperCase() : null,
            targetName ? targetName.trim() : null,
            category ? category.trim() : null,
            targetStock !== undefined ? parseInt(targetStock, 10) : null,
            reorder_threshold !== undefined ? parseInt(reorder_threshold, 10) : null,
            newCost,
            newPrice,
            partId,
        ]);

        const updatedPart = result.rows[0];

        // If unit_cost or selling_price changed manually, record in price history
        const costChanged = newCost !== null && Math.abs(parseFloat(curPart.unit_cost) - newCost) > 0.001;
        const priceChanged = newPrice !== null && Math.abs(parseFloat(curPart.selling_price) - newPrice) > 0.001;

        if (costChanged || priceChanged) {
            await client.query(
                `INSERT INTO inventory_price_history (
                    part_id,
                    change_type,
                    old_unit_cost,
                    new_unit_cost,
                    old_selling_price,
                    new_selling_price,
                    notes
                )
                VALUES ($1, 'PRICE_ADJUSTMENT', $2, $3, $4, $5, 'Catalog price updated manually');`,
                [
                    partId,
                    parseFloat(curPart.unit_cost),
                    newCost !== null ? newCost : parseFloat(curPart.unit_cost),
                    parseFloat(curPart.selling_price),
                    newPrice !== null ? newPrice : parseFloat(curPart.selling_price),
                ]
            );
        }

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

// PATCH /api/inventory/:id/restock - Restock part with distinct batch price (FIFO/LIFO Multi-Batch Support)
router.patch("/:id/restock", async (req, res) => {
    const { id } = req.params;
    const partId = parseInt(id, 10);
    const {
        added_quantity,
        unit_cost,
        selling_price,
        batch_number,
        notes,
    } = req.body;

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

        // 1. Fetch current catalog part info
        const partRes = await client.query(
            "SELECT * FROM inventory_data WHERE part_id = $1 FOR UPDATE;",
            [partId]
        );

        if (partRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Part not found in inventory" });
        }

        const currentPart = partRes.rows[0];
        const oldCost = parseFloat(currentPart.unit_cost) || 0.0;
        const oldPrice = parseFloat(currentPart.selling_price) || 0.0;

        // Use custom batch price if provided, otherwise preserve previous price
        const batchCost = unit_cost !== undefined && unit_cost !== "" && !isNaN(parseFloat(unit_cost))
            ? parseFloat(unit_cost)
            : oldCost;

        const batchSellingPrice = selling_price !== undefined && selling_price !== "" && !isNaN(parseFloat(selling_price))
            ? parseFloat(selling_price)
            : oldPrice;

        // Auto-generate batch number if none supplied
        const cleanBatchNum = (batch_number || "").trim() || `BATCH-${currentPart.sku}-${Date.now().toString().slice(-6)}`;
        const batchNotes = (notes || "").trim() || `Restocked +${qtyToAdd} units (Cost: $${batchCost.toFixed(2)}, Price: $${batchSellingPrice.toFixed(2)})`;

        // 2. Insert new batch into inventory_batches (Preserves old price on previous batches!)
        const batchInsertQuery = `
            INSERT INTO inventory_batches (
                part_id,
                batch_number,
                quantity_received,
                quantity_remaining,
                unit_cost,
                selling_price,
                received_date,
                notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
            RETURNING *;
        `;
        const batchResult = await client.query(batchInsertQuery, [
            partId,
            cleanBatchNum,
            qtyToAdd,
            qtyToAdd,
            batchCost,
            batchSellingPrice,
            batchNotes,
        ]);
        const newBatch = batchResult.rows[0];

        // 3. Record in inventory_price_history for graph visualization
        await client.query(
            `INSERT INTO inventory_price_history (
                part_id,
                batch_id,
                change_type,
                old_unit_cost,
                new_unit_cost,
                old_selling_price,
                new_selling_price,
                quantity_changed,
                notes
            )
            VALUES ($1, $2, 'RESTOCK', $3, $4, $5, $6, $7, $8);`,
            [
                partId,
                newBatch.batch_id,
                oldCost,
                batchCost,
                oldPrice,
                batchSellingPrice,
                qtyToAdd,
                batchNotes,
            ]
        );

        // 4. Update overall inventory_data stock quantity and current reference prices
        const updatePartQuery = `
            UPDATE inventory_data
            SET 
                stock_quantity = stock_quantity + $1,
                unit_cost = $2,
                selling_price = $3
            WHERE part_id = $4
            RETURNING *;
        `;
        const updatedPartRes = await client.query(updatePartQuery, [
            qtyToAdd,
            batchCost,
            batchSellingPrice,
            partId,
        ]);
        const updatedPart = updatedPartRes.rows[0];

        // 5. Audit Log
        await client.query(
            `INSERT INTO audit_logs (event_type, description, payload_json)
             VALUES ('PART_ALLOCATED', $1, $2);`,
            [
                `Restocked ${qtyToAdd} units of '${updatedPart.part_name}' (${updatedPart.sku}) under batch [${cleanBatchNum}]. Cost: $${batchCost.toFixed(2)}, Selling Price: $${batchSellingPrice.toFixed(2)}. Total stock: ${updatedPart.stock_quantity}`,
                JSON.stringify({
                    part_id: updatedPart.part_id,
                    sku: updatedPart.sku,
                    batch_id: newBatch.batch_id,
                    batch_number: cleanBatchNum,
                    added_quantity: qtyToAdd,
                    new_stock: updatedPart.stock_quantity,
                    batch_unit_cost: batchCost,
                    batch_selling_price: batchSellingPrice,
                }),
            ]
        );

        await client.query("COMMIT");

        // Clear Redis cache
        await deleteCachePattern("garage:cache:inventory:*");

        res.json({
            success: true,
            message: `Restocked ${qtyToAdd} units of [${updatedPart.sku}] ${updatedPart.part_name} under batch ${cleanBatchNum}. Total in stock: ${updatedPart.stock_quantity}`,
            data: updatedPart,
            batch: newBatch,
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
        if (err.code === "23503") {
            return res.status(409).json({
                error: "Cannot delete this part because it is referenced in existing work orders or service records. Consider adjusting its stock to 0 instead.",
                code: "FOREIGN_KEY_VIOLATION",
            });
        }
        console.error("Error deleting inventory part:", err);
        res.status(500).json({ error: "Failed to delete part from database", details: err.message });
    }
});

export default router;
