import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { runGarageAgentTask } from "../agent/agent.js";
import pool from "../db.js";

const router = express.Router();

/**
 * GET /api/ai/suggestions - Get role-tailored prompt suggestions
 */
router.get("/suggestions", authenticateToken, async (req, res) => {
    try {
        const rawRole = (req.user?.role || "").toLowerCase();
        const role = rawRole === "car_owner" ? "owner" : rawRole;

        // Staff are explicitly blocked from AI access
        if (role === "staff") {
            return res.status(403).json({
                error: "Access Denied: Staff accounts do not have access to the Precision AI Assistant.",
                code: "STAFF_AI_FORBIDDEN",
            });
        }

        if (role === "admin") {
            return res.json({
                success: true,
                role: "admin",
                suggestions: [
                    { label: "📊 Financial Summary", prompt: "Provide a complete financial summary of all invoices, revenue generated, and unpaid balances." },
                    { label: "📦 Low Stock Alerts", prompt: "List all inventory spare parts currently below their reorder threshold with quantities and unit costs." },
                    { label: "🚗 Vehicle Fleet Analysis", prompt: "Show the breakdown of the most frequently serviced car makes and models in our workshop." },
                    { label: "🛠️ Active Work Orders", prompt: "Summarize all active work orders currently in 'diagnosed', 'in_progress', or 'ready' status." },
                    { label: "👨‍🔧 Staff Workload", prompt: "Show the active work order count and assignments per lead technician." },
                    { label: "🧾 Overdue Invoices", prompt: "List all overdue or pending customer invoices with customer names and outstanding amounts." },
                ],
            });
        }

        // Customer / Vehicle Owner
        return res.json({
            success: true,
            role: "owner",
            suggestions: [
                { label: "🚗 My Registered Vehicles", prompt: "Show me all vehicles registered under my account with their VIN and license plates." },
                { label: "🔧 Complete Service History", prompt: "Summarize the complete repair and maintenance history for all my cars." },
                { label: "💵 Total Spending Breakdown", prompt: "What is my total lifetime spend across all service visits, including taxes?" },
                { label: "🧾 Recent Invoice Details", prompt: "Show the itemized breakdown and total cost of my most recent service invoice." },
                { label: "📦 Parts Replaced", prompt: "Which spare parts and components have been replaced in my vehicles?" },
                { label: "⏳ Active Garage Status", prompt: "Do I have any active work orders or pending repair jobs in progress?" },
            ],
        });
    } catch (err) {
        console.error("Error fetching AI suggestions:", err);
        res.status(500).json({ error: "Failed to load AI suggestions", details: err.message });
    }
});

/**
 * POST /api/ai/chat - Execute AI Data Chat & Reporting Task
 */
router.post("/chat", authenticateToken, async (req, res) => {
    try {
        const { prompt, chatHistory = [] } = req.body;

        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
            return res.status(400).json({ error: "A non-empty prompt is required." });
        }

        const rawRole = (req.user?.role || "").toLowerCase();
        const role = rawRole === "car_owner" ? "owner" : rawRole;

        // 1. STRICT RULE: Staff have NO AI access
        if (role === "staff") {
            return res.status(403).json({
                error: "Access Denied: Staff accounts do not have access to the Precision AI Assistant.",
                code: "STAFF_AI_FORBIDDEN",
            });
        }

        // 2. Resolve Verified Constant Owner ID for Customers
        let constantOwnerId = null;
        if (role === "owner") {
            constantOwnerId = req.user?.owner_id;

            // If token didn't contain owner_id, look it up securely in database
            if (!constantOwnerId && req.user?.user_id) {
                const userRes = await pool.query(
                    "SELECT owner_id FROM users WHERE user_id = $1;",
                    [req.user.user_id]
                );
                if (userRes.rows.length > 0 && userRes.rows[0].owner_id) {
                    constantOwnerId = userRes.rows[0].owner_id;
                }
            }

            // Fallback lookup via email if necessary
            if (!constantOwnerId && req.user?.email) {
                const ownerRes = await pool.query(
                    "SELECT owner_id FROM car_owners WHERE LOWER(email_address) = LOWER($1);",
                    [req.user.email]
                );
                if (ownerRes.rows.length > 0) {
                    constantOwnerId = ownerRes.rows[0].owner_id;
                }
            }

            if (!constantOwnerId) {
                return res.status(403).json({
                    error: "Unable to verify your customer account ID. Please re-login.",
                    code: "OWNER_ID_NOT_RESOLVED",
                });
            }
        }

        // 3. Execute AI Agent Task
        const result = await runGarageAgentTask({
            prompt: prompt.trim(),
            chatHistory: Array.isArray(chatHistory) ? chatHistory : [],
            role: role,
            ownerId: constantOwnerId,
        });

        // 4. Log audit record for tracking (non-blocking)
        try {
            await pool.query(`
                INSERT INTO audit_logs (event_type, description, payload_json)
                VALUES ($1, $2, $3);
            `, [
                result.isSevere ? 'AI_QUERY_SEVERE_BLOCKED' : 'AI_QUERY_EXECUTED',
                `AI query from ${role} (${constantOwnerId || 'admin'}): "${prompt.trim().substring(0, 120)}"`,
                JSON.stringify({
                    role,
                    owner_id: constantOwnerId,
                    isSevere: result.isSevere,
                    stepCount: result.steps?.length || 0,
                })
            ]);
        } catch (auditErr) {
            // Non-critical audit warning
            console.warn("Notice: Audit log insert for AI query skipped:", auditErr.message);
        }

        return res.json({
            success: true,
            answer: result.answer,
            isSevere: result.isSevere,
            steps: result.steps || [],
            role: role,
            owner_id: constantOwnerId,
        });
    } catch (err) {
        console.error("AI Chat Route Error:", err);
        res.status(500).json({
            error: "Failed to process AI query",
            details: err.message,
        });
    }
});

export default router;
