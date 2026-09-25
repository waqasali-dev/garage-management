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

// Cache Telemetry & In-Memory Resilient Cache Fallback
const memoryCache = new Map();
const MAX_MEMORY_CACHE_ITEMS = 500;
const cacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    invalidations: 0,
};

const cleanupMemoryCache = () => {
    const now = Date.now();
    for (const [k, v] of memoryCache.entries()) {
        if (v.expiresAt <= now) {
            memoryCache.delete(k);
        }
    }
    if (memoryCache.size > MAX_MEMORY_CACHE_ITEMS) {
        const oldestKeys = Array.from(memoryCache.keys()).slice(0, 100);
        for (const k of oldestKeys) memoryCache.delete(k);
    }
};

// Helper Functions for Clean, Safe Caching with In-Memory Resiliency
export const getCache = async (key) => {
    try {
        if (redis && isConfigured) {
            const data = await redis.get(key);
            if (data !== null && data !== undefined) {
                cacheStats.hits++;
                if (typeof data === "string") {
                    try {
                        return JSON.parse(data);
                    } catch {
                        return data;
                    }
                }
                return data;
            }
        }
    } catch (err) {
        console.warn(`Upstash getCache error for key [${key}], checking local fallback:`, err.message);
    }

    // Check resilient local memory cache fallback
    const local = memoryCache.get(key);
    if (local && local.expiresAt > Date.now()) {
        cacheStats.hits++;
        return local.value;
    }

    cacheStats.misses++;
    return null;
};

export const setCache = async (key, value, ttlSeconds = 600) => {
    cacheStats.sets++;
    const expiresAt = Date.now() + ttlSeconds * 1000;

    try {
        if (redis && isConfigured) {
            await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
        }
    } catch (err) {
        console.warn(`Upstash setCache error for key [${key}]:`, err.message);
    }

    // Also populate local memory cache for resilience & instant fallback
    cleanupMemoryCache();
    memoryCache.set(key, { value, expiresAt });
};

export const deleteCache = async (key) => {
    cacheStats.invalidations++;
    memoryCache.delete(key);

    try {
        if (redis && isConfigured) {
            await redis.del(key);
        }
    } catch (err) {
        console.warn(`Upstash deleteCache error for key [${key}]:`, err.message);
    }
};

export const deleteCachePattern = async (pattern) => {
    cacheStats.invalidations++;

    // Invalidate matching keys in local memory cache
    try {
        const regexPattern = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        for (const k of memoryCache.keys()) {
            if (regexPattern.test(k)) {
                memoryCache.delete(k);
            }
        }
    } catch (_) {}

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

export const getCacheStats = () => {
    const total = cacheStats.hits + cacheStats.misses;
    const hitRate = total > 0 ? `${((cacheStats.hits / total) * 100).toFixed(1)}%` : "N/A";
    return {
        ...cacheStats,
        hitRate,
        memoryCacheSize: memoryCache.size,
        redisConnected: Boolean(redis && isConfigured),
    };
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
