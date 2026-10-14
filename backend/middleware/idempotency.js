import crypto from "crypto";
import {
    acquireLock,
    releaseLock,
    getIdempotencyRecord,
    setIdempotencyRecord,
} from "../redis.js";
import { extractToken } from "./cookies.js";

/**
 * Global Idempotency & Concurrency Mutex Middleware
 * Protects mutating requests (POST, PUT, PATCH, DELETE) against duplicate submissions & race conditions
 * while strictly isolating user sessions to prevent IP cross-talk behind NAT/proxies (SEC-2.3).
 */
export const idempotencyMiddleware = async (req, res, next) => {
    // Only intercept state-mutating HTTP methods
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        return next();
    }

    const clientKey = req.headers["x-idempotency-key"];
    const token = extractToken(req);
    const ip = req.ip || req.headers["x-forwarded-for"] || "client";

    // Bind identity to prevent cross-talk behind shared NAT / proxies (SEC-2.3)
    let userIdentifier = "anon";
    if (token) {
        userIdentifier = `user:${crypto.createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
    } else {
        userIdentifier = `ip:${ip}`;
    }

    let signature;
    let shouldCacheReplay = false;

    if (clientKey) {
        // Explicit client key: always eligible for replay caching, scoped to user identity
        signature = `key:${userIdentifier}:${clientKey}`;
        shouldCacheReplay = true;
    } else {
        const bodyStr = req.body
            ? typeof req.body === "string"
                ? req.body.substring(0, 10000)
                : JSON.stringify(req.body).substring(0, 10000)
            : "";
        const bodyHash = crypto
            .createHash("sha256")
            .update(`${req.method}:${req.originalUrl}:${bodyStr}`)
            .digest("hex");

        signature = `hash:${userIdentifier}:${bodyHash}`;
        // Only cache automated replay for authenticated users; never cache replay for unauthenticated requests without an explicit key
        shouldCacheReplay = Boolean(token);
    }

    const lockKey = `garage:lock:idempotency:${signature}`;
    const resultKey = `garage:result:idempotency:${signature}`;

    try {
        // Step 1: Check if this exact request already completed and cached its response
        if (shouldCacheReplay) {
            const cachedResponse = await getIdempotencyRecord(resultKey);
            if (cachedResponse && cachedResponse.status && cachedResponse.body) {
                res.setHeader("X-Idempotent-Replay", "true");
                return res.status(cachedResponse.status).json(cachedResponse.body);
            }
        }

        // Step 2: Acquire atomic distributed execution lock (TTL: 15 seconds)
        const acquired = await acquireLock(lockKey, 15);
        if (!acquired) {
            console.warn(`[IDEMPOTENCY] Blocked duplicate in-flight request: ${req.method} ${req.originalUrl}`);
            return res.status(409).json({
                success: false,
                duplicate: true,
                error: "A request for this operation is already being processed. Please wait.",
            });
        }

        // Step 3: Wrap response methods to record result and safely release lock
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);

        let isCompleted = false;
        const finalize = async (body, isJson = true) => {
            if (isCompleted) return;
            isCompleted = true;

            try {
                // If operation succeeded (2xx) and replay caching is permitted, cache result
                if (shouldCacheReplay && res.statusCode >= 200 && res.statusCode < 400) {
                    let parsedBody = body;
                    if (typeof body === "string" && isJson) {
                        try {
                            parsedBody = JSON.parse(body);
                        } catch {}
                    }
                    await setIdempotencyRecord(resultKey, { status: res.statusCode, body: parsedBody }, 60);
                }
            } catch (err) {
                console.warn("[IDEMPOTENCY] Cache error:", err.message);
            } finally {
                // Always release active concurrency lock
                await releaseLock(lockKey);
            }
        };

        res.json = function (body) {
            finalize(body, true);
            return originalJson(body);
        };

        res.send = function (body) {
            finalize(body, false);
            return originalSend(body);
        };

        next();
    } catch (err) {
        console.error("[IDEMPOTENCY] Middleware exception:", err);
        next();
    }
};

export default idempotencyMiddleware;
