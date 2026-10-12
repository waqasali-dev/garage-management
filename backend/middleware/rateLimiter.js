/**
 * Precision Garage API - Rate Limiter Middleware
 * Mitigates brute-force credential stuffing and DoS attacks (CWE-307 / SEC-13)
 */

const memoryStore = new Map();
const CLEANUP_INTERVAL_MS = 60 * 1000;

// Periodic cleanup of expired rate limit entries
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of memoryStore.entries()) {
        if (now > record.resetTime) {
            memoryStore.delete(key);
        }
    }
}, CLEANUP_INTERVAL_MS).unref();

export const createRateLimiter = ({
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 10,                   // 10 requests default
    message = "Too many requests. Please try again later.",
    keyGenerator = (req) => {
        const forwarded = req.headers["x-forwarded-for"];
        const ip = forwarded ? forwarded.split(",")[0].trim() : req.ip || req.socket.remoteAddress || "unknown-ip";
        return `${ip}:${req.baseUrl || ""}${req.path || ""}`;
    },
} = {}) => {
    return (req, res, next) => {
        const key = keyGenerator(req);
        const now = Date.now();

        let record = memoryStore.get(key);

        if (!record || now > record.resetTime) {
            record = {
                count: 1,
                resetTime: now + windowMs,
            };
            memoryStore.set(key, record);
        } else {
            record.count += 1;
        }

        const remaining = Math.max(0, max - record.count);
        const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

        res.setHeader("RateLimit-Limit", max);
        res.setHeader("RateLimit-Remaining", remaining);
        res.setHeader("RateLimit-Reset", resetSeconds);

        if (record.count > max) {
            res.setHeader("Retry-After", resetSeconds);
            return res.status(429).json({
                error: message,
                code: "RATE_LIMIT_EXCEEDED",
                retryAfterSeconds: resetSeconds,
            });
        }

        next();
    };
};

/**
 * Strict Rate Limiter for Authentication (Login / Password Reset)
 * 10 attempts per 15-minute window per IP/email
 */
export const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many authentication attempts. For your security, this endpoint has been temporarily locked. Please try again in 15 minutes.",
    keyGenerator: (req) => {
        const forwarded = req.headers["x-forwarded-for"];
        const ip = forwarded ? forwarded.split(",")[0].trim() : req.ip || "unknown-ip";
        const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : "";
        return `auth:${ip}:${email}`;
    },
});

export default authLimiter;
