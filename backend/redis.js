import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL || "https://on-basilisk-103918.upstash.io";
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN || "";

let redis = null;
let isConfigured = false;

if (redisUrl && redisToken && redisToken !== "your_upstash_redis_token_here") {
    try {
        redis = new Redis({
            url: redisUrl,
            token: redisToken,
        });
        isConfigured = true;
        console.log("⚡ Upstash Redis Client Initialized (Serverless REST)");
    } catch (err) {
        console.warn("⚠️ Failed to initialize Upstash Redis:", err.message);
    }
} else {
    console.warn("⚠️ Upstash Redis token missing in .env. Continuing in Direct Database Mode.");
}

// Perform initial ping to verify connection
(async () => {
    if (redis && isConfigured) {
        try {
            const res = await redis.ping();
            if (res === "PONG" || res) {
                console.log("🚀 Upstash Redis is Connected and Ready for Fast Caching");
            }
        } catch (err) {
            console.warn("⚠️ Upstash Redis ping check failed:", err.message);
        }
    }
})();

// Helper Functions for Clean, Safe Caching
export const getCache = async (key) => {
    try {
        if (redis && isConfigured) {
            const data = await redis.get(key);
            if (data === null || data === undefined) return null;
            if (typeof data === "string") {
                try {
                    return JSON.parse(data);
                } catch {
                    return data;
                }
            }
            return data;
        }
    } catch (err) {
        console.warn(`Upstash getCache error for key [${key}]:`, err.message);
    }
    return null;
};

export const setCache = async (key, value, ttlSeconds = 600) => {
    try {
        if (redis && isConfigured) {
            await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
        }
    } catch (err) {
        console.warn(`Upstash setCache error for key [${key}]:`, err.message);
    }
};

export const deleteCache = async (key) => {
    try {
        if (redis && isConfigured) {
            await redis.del(key);
        }
    } catch (err) {
        console.warn(`Upstash deleteCache error for key [${key}]:`, err.message);
    }
};

export const deleteCachePattern = async (pattern) => {
    try {
        if (redis && isConfigured) {
            const keys = await redis.keys(pattern);
            if (keys && keys.length > 0) {
                await redis.del(...keys);
            }
        }
    } catch (err) {
        console.warn(`Upstash deleteCachePattern error for pattern [${pattern}]:`, err.message);
    }
};

// In-Memory Lock Fallback Map (for offline/direct DB mode or local resiliency)
const memoryLocks = new Map();

export const acquireLock = async (key, ttlSeconds = 15) => {
    try {
        if (redis && isConfigured) {
            const result = await redis.set(key, "in_progress", { nx: true, ex: ttlSeconds });
            return result === "OK" || result === true;
        }
    } catch (err) {
        console.warn(`Upstash acquireLock error for key [${key}]:`, err.message);
    }

    // Resilient In-Memory Lock Fallback
    const now = Date.now();
    const existing = memoryLocks.get(key);
    if (existing && existing > now) {
        return false;
    }
    memoryLocks.set(key, now + ttlSeconds * 1000);
    return true;
};

export const releaseLock = async (key) => {
    try {
        if (redis && isConfigured) {
            await redis.del(key);
        }
    } catch (err) {
        console.warn(`Upstash releaseLock error for key [${key}]:`, err.message);
    }
    memoryLocks.delete(key);
};

export const getIdempotencyRecord = async (key) => {
    try {
        if (redis && isConfigured) {
            const data = await redis.get(key);
            if (!data) return null;
            if (typeof data === "string") {
                try {
                    return JSON.parse(data);
                } catch {
                    return data;
                }
            }
            return data;
        }
    } catch (err) {
        console.warn(`Upstash getIdempotencyRecord error for key [${key}]:`, err.message);
    }
    return null;
};

export const setIdempotencyRecord = async (key, responseObj, ttlSeconds = 60) => {
    try {
        if (redis && isConfigured) {
            await redis.set(key, JSON.stringify(responseObj), { ex: ttlSeconds });
        }
    } catch (err) {
        console.warn(`Upstash setIdempotencyRecord error for key [${key}]:`, err.message);
    }
};

export const redisClient = {
    get isReady() {
        return Boolean(redis && isConfigured);
    },
    client: redis,
};

export default redisClient;
