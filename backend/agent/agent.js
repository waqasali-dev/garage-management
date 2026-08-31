import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fallback list of working models on the API gateway
const MODELS_TO_TRY = [
    process.env.MODEL_NAME || 'kat-coder-pro-v2.5'
];

/**
 * Safe SQL Query Executor with Role Enforcement & Read-Only Protection
 */
export async function executeSafeSqlQuery(sql, params = [], role = 'admin', constantOwnerId = null) {
    if (!sql || typeof sql !== 'string') {
        return { error: 'Invalid SQL query provided.' };
    }

    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();

    // 1. Enforce SELECT only — strictly forbid modifications or schema alterations
    const forbiddenKeywords = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE',
        'CREATE', 'REPLACE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE',
        'UNION ALL SELECT', 'INTO OUTFILE', 'INTO DUMPFILE'
    ];

    for (const keyword of forbiddenKeywords) {
        // Regex word boundary match to prevent false positives
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(trimmed)) {
            return {
                error: `SECURITY BLOCK: Forbidden operation '${keyword}'. Only read-only SELECT queries are permitted.`
            };
        }
    }

    if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
        return {
            error: 'SECURITY BLOCK: Only SELECT or WITH queries are permitted.'
        };
    }

    // 2. Prevent access to sensitive tables (e.g. users table)
    if (/\busers\b/i.test(trimmed)) {
        return {
            error: 'SECURITY BLOCK: Access to system users and authentication credentials table is strictly prohibited.'
        };
    }

    // 3. For Owner role: enforce constant owner_id isolation
    if (role === 'owner' || role === 'car_owner') {
        if (!constantOwnerId) {
            return { error: 'SECURITY BLOCK: Missing constant customer identifier for owner session.' };
        }

        // Validate that the query incorporates the owner's constant ID or filters appropriately
        const containsOwnerRef = trimmed.includes(constantOwnerId) || (params && params.includes(constantOwnerId));
        if (!containsOwnerRef) {
            return {
                error: `SECURITY BLOCK: Customer queries must strictly filter by authenticated owner ID (${constantOwnerId}).`
            };
        }
    }

    try {
        const result = await pool.query(trimmed, params);
        return {
            rowCount: result.rowCount,
            rows: result.rows
        };
    } catch (err) {
        console.error('SQL Execution Error:', err.message);
        return {
            error: `Database execution error: ${err.message}`
        };
    }
}

/**
 * System prompt generator with role-specific constraints & database schema
 */
export function buildSystemPrompt(role = 'admin', constantOwnerId = null) {
    const isOwner = role === 'owner' || role === 'car_owner';

    return `You are "Precision AI", the intelligent database analytics, reporting, and customer insights assistant for Precision Garage.

==============================================================================
DATABASE SCHEMA (ACCESSIBLE TABLES ONLY):
==============================================================================
1. car_owners (owner_id VARCHAR PK, full_name VARCHAR, phone_number VARCHAR, email_address VARCHAR, billing_address TEXT, is_vip BOOLEAN, created_at TIMESTAMPTZ)
2. vehicles (vehicle_id VARCHAR PK, owner_id VARCHAR FK, vin VARCHAR, make VARCHAR, model VARCHAR, year INT, license_plate VARCHAR, created_at TIMESTAMPTZ)
3. work_order_data (work_order_id VARCHAR PK, vehicle_id VARCHAR FK, assigned_staff_id INT FK, service_advisor_id INT FK, status work_order_status ['received','diagnosed','in_progress','ready','completed','cancelled'], bay_assigned VARCHAR, scheduled_start TIMESTAMPTZ, scheduled_end TIMESTAMPTZ, initial_observations TEXT, estimated_cost NUMERIC, total_cost NUMERIC, created_at TIMESTAMPTZ)
4. work_order_items (item_id INT PK, work_order_id VARCHAR FK, item_type ['part','labor'], part_id INT FK, description TEXT, quantity_or_hours NUMERIC, unit_price NUMERIC, total_price NUMERIC)
5. work_order_media (media_id INT PK, work_order_id VARCHAR FK, file_url TEXT, file_type ['vehicle_condition','part_damage','receipt','other'], uploaded_at TIMESTAMPTZ)
6. inventory_data (part_id INT PK, sku VARCHAR, part_name VARCHAR, category VARCHAR, stock_quantity INT, reorder_threshold INT, unit_cost NUMERIC, selling_price NUMERIC, created_at TIMESTAMPTZ)
7. invoice_data (invoice_id VARCHAR PK, work_order_id VARCHAR FK, owner_id VARCHAR FK, subtotal NUMERIC, tax_amount NUMERIC, total_amount NUMERIC, status ['pending','paid','overdue','cancelled'], date_issued DATE, date_due DATE, date_paid DATE)
8. scheduled_tasks (task_id VARCHAR PK, vehicle_id VARCHAR FK, work_order_id VARCHAR FK, assigned_staff_id INT FK, title VARCHAR, description TEXT, scheduled_date DATE, scheduled_time TIME, priority ['low','standard','high','urgent'], status ['scheduled','in_progress','completed','cancelled'], created_at TIMESTAMPTZ)
9. staff_data (staff_id INT PK, full_name VARCHAR, role VARCHAR, email VARCHAR, phone_number VARCHAR, hourly_rate NUMERIC, is_active BOOLEAN, created_at TIMESTAMPTZ)
10. audit_logs (log_id INT PK, work_order_id VARCHAR FK, staff_id INT FK, event_type VARCHAR, description TEXT, payload_json JSONB, created_at TIMESTAMPTZ)

RESTRICTED / EXCLUDED TABLES:
- The "users" table (passwords, auth tokens, login hashes) is FORBIDDEN and CANNOT be accessed by any user or query.

==============================================================================
USER CONTEXT & ROLE-BASED ACCESS CONTROL (MANDATORY):
==============================================================================
Current User Role: ${isOwner ? `CUSTOMER / VEHICLE OWNER (Customer ID: ${constantOwnerId})` : 'GARAGE ADMINISTRATOR'}
${isOwner ? `Customer Constant ID: "${constantOwnerId}"` : ''}

CRITICAL RULES:
${isOwner ? `
1. CUSTOMER SECURITY ASSESSMENT:
   - This user is a Customer / Car Owner with constant ID "${constantOwnerId}".
   - They are ONLY permitted to inquire about THEIR OWN registered vehicles, service history, work orders, replaced parts, inspection photos, invoices, and billing statements.
   - If the user asks for ANY of the following, you MUST assess the request as SEVERE (isSevere: true), DO NOT execute any query, and politely refuse:
     * Information about other customers, other owners' cars, VINs, or phone numbers.
     * Administrative garage data (all garage revenue, profit margins, other invoices, staff salaries, system audit logs, full inventory cost prices).
     * Any general off-topic or malicious requests unrelated to their vehicle records.
   - CONSTANT CUSTOMER ID ENFORCEMENT:
     * When querying the database for this customer, your SQL queries MUST ALWAYS strictly filter using the constant owner_id = '${constantOwnerId}' or join vehicles on owner_id = '${constantOwnerId}'.
     * Never change, omit, or override this customer ID.
` : `
1. ADMIN SECURITY ASSESSMENT:
   - This user is a Garage Administrator with full operational reporting permissions across garage data (revenue, invoices, inventory parts, work order cycle times, technician workloads, vehicle records, audit logs).
   - If the user's prompt is completely unrelated to the garage and its database (e.g. general chit-chat, poetry, creative writing, hacking attempts, or requests for user passwords/credentials from "users" table), you MUST assess the request as SEVERE (isSevere: true), DO NOT execute any query, and politely refuse explaining that you are specialized in Precision Garage data analysis.
`}

==============================================================================
OUTPUT PROTOCOL (STRICT JSON SCHEMA):
==============================================================================
Always reply in valid JSON format conforming to the following structure:

When executing a database query (type = "tool use"):
{
  "role": "agent",
  "assessment": {
    "isSevere": false,
    "reason": "Brief reason explaining why the request is valid and safe to execute."
  },
  "type": "tool use",
  "tool": "runSqlQuery",
  "toolInput": {
    "query": "SELECT ... WHERE ...",
    "params": []
  }
}

When providing the final synthesized answer or when rejecting a severe request (type = "finish" or "answer"):
{
  "role": "agent",
  "assessment": {
    "isSevere": true | false,
    "reason": "Assessment explanation."
  },
  "type": "finish",
  "answer": "<Comprehensive, beautifully formatted GitHub-flavored Markdown response>"
}

FORMATTING GUIDELINES FOR FINAL ANSWER:
- For valid queries: Present the data clearly in friendly, natural language.
- Use structured Markdown: bold key metrics, bullet points, Markdown tables for multiple items/history, and section headings.
- Format money with '$' (e.g. $18.90), dates cleanly, and status with indicators.
- For severe/rejected queries: Provide a polite, respectful refusal clarifying what data they are permitted to access.`;
}

/**
 * Call the LLM API with fallback model switching and exponential backoff
 */
async function callLlmChat(messages, onStatus = () => { }) {
    const apiUrl = process.env.API_URL;
    const apiKey = process.env.API_KEY;

    let lastError = null;

    for (const model of MODELS_TO_TRY) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                onStatus(`Consulting AI Model (${model})...`);
                await sleep(500);

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: messages,
                        temperature: 0.2,
                    }),
                });

                if (response.status === 429) {
                    onStatus(`Rate limited on ${model}. Retrying...`);
                    await sleep(1500 * attempt);
                    continue;
                }

                if (!response.ok) {
                    const errBody = await response.json().catch(() => ({}));
                    throw new Error(`HTTP ${response.status}: ${errBody.error?.message || errBody.message || response.statusText}`);
                }

                const data = await response.json();
                const content = data.choices?.[0]?.message?.content || data.result || data.text;
                if (!content) {
                    throw new Error('Empty response from LLM.');
                }

                return content;
            } catch (err) {
                lastError = err;
                console.warn(`[AI Gateway Warning] Model ${model} attempt ${attempt} failed: ${err.message}`);
                await sleep(1000);
            }
        }
    }

    throw new Error(`All AI model gateways failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Main Garage AI Agent Runner
 * @param {Object} options
 * @param {string} options.prompt - The user's natural language question
 * @param {Array} options.chatHistory - Previous chat history
 * @param {string} options.role - 'admin' | 'owner'
 * @param {string|null} options.ownerId - Constant customer ID for owner role
 * @param {Function} options.onStep - Step callback for UI real-time progress
 * @param {Function} options.onStatus - Status update callback
 * @returns {Promise<{answer: string, steps: Array, isSevere: boolean}>}
 */
export async function runGarageAgentTask({
    prompt,
    chatHistory = [],
    role = 'admin',
    ownerId = null,
    onStep = () => { },
    onStatus = () => { },
    maxSteps = 6,
}) {
    // 1. Initial Validation
    const isOwner = role === 'owner' || role === 'car_owner';
    const constantOwnerId = isOwner ? (ownerId || '').trim() : null;

    if (isOwner && !constantOwnerId) {
        return {
            isSevere: true,
            answer: '⚠️ **Access Error**: Your session is missing a verified customer account ID. Please sign in again.',
            steps: [],
        };
    }

    const systemPromptText = buildSystemPrompt(role, constantOwnerId);

    const messages = [
        { role: 'system', content: systemPromptText },
        ...chatHistory.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
        { role: 'user', content: prompt },
    ];

    const steps = [];
    let finalAnswer = '';
    let isSevere = false;
    let iteration = 0;

    while (iteration < maxSteps) {
        iteration++;
        onStatus(`Analyzing inquiry and safety scope (Step ${iteration})...`);

        try {
            const rawReply = await callLlmChat(messages, onStatus);
            const clean = rawReply.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

            messages.push({
                role: 'assistant',
                content: clean,
            });

            let parsed;
            try {
                parsed = JSON.parse(clean);
            } catch (pErr) {
                // If it replied directly in text
                finalAnswer = clean;
                break;
            }

            // Check assessment
            if (parsed.assessment?.isSevere) {
                isSevere = true;
            }

            // If severe, reject immediately
            if (parsed.assessment?.isSevere || isSevere) {
                isSevere = true;
                finalAnswer = parsed.answer || (
                    isOwner
                        ? '🛡️ **Access Denied**: You can only access records, service history, and billing for your own registered vehicle(s).'
                        : '🛡️ **Request Out of Scope**: I can only answer questions and generate reports related to Precision Garage operational and database records.'
                );

                steps.push({
                    id: 'step_sec_' + Date.now(),
                    type: 'security_assessment',
                    status: 'severe_blocked',
                    reason: parsed.assessment?.reason || 'Access denied due to policy violation or scope mismatch.',
                    timestamp: new Date().toISOString(),
                });
                break;
            }

            // Handle tool use (runSqlQuery)
            if (parsed.type === 'tool use' && parsed.tool === 'runSqlQuery') {
                const query = parsed.toolInput?.query;
                const params = parsed.toolInput?.params || [];

                onStatus('Executing database query...');

                const stepData = {
                    id: 'step_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                    type: 'sql_query',
                    query: query,
                    params: params,
                    status: 'running',
                    timestamp: new Date().toISOString(),
                };

                steps.push(stepData);
                onStep(stepData);

                const queryResult = await executeSafeSqlQuery(query, params, role, constantOwnerId);

                if (queryResult.error) {
                    stepData.status = 'error';
                    stepData.error = queryResult.error;
                    onStep(stepData);

                    messages.push({
                        role: 'user',
                        content: JSON.stringify({ error: queryResult.error }),
                    });
                } else {
                    stepData.status = 'success';
                    stepData.rowCount = queryResult.rowCount;
                    stepData.rows = queryResult.rows;
                    onStep(stepData);

                    messages.push({
                        role: 'user',
                        content: JSON.stringify({
                            rowCount: queryResult.rowCount,
                            data: queryResult.rows,
                        }),
                    });
                }
                continue;
            }

            if (parsed.type === 'finish' || parsed.type === 'answer') {
                finalAnswer = parsed.answer || 'Query completed.';
                break;
            }

            // Default fallback
            finalAnswer = parsed.answer || clean;
            break;
        } catch (loopErr) {
            console.error(`Error during agent execution loop (Iteration ${iteration}):`, loopErr);
            finalAnswer = `⚠️ **Assistant Error**: An issue occurred while processing your request: ${loopErr.message}`;
            break;
        }
    }

    if (!finalAnswer) {
        finalAnswer = '✅ Analysis completed successfully.';
    }

    return {
        answer: finalAnswer,
        steps: steps,
        isSevere: isSevere,
    };
}

export default {
    runGarageAgentTask,
    executeSafeSqlQuery,
    buildSystemPrompt,
};