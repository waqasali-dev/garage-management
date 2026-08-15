import { createClient } from "redis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || "127.0.0.1"}:${process.env.REDIS_PORT || 6379}`;

const redisClient = createClient({
    url: redisUrl,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 5) {
                console.warn("⚠️ Redis max reconnection attempts reached. Continuing in direct DB mode.");
                return new Error("Redis connection failed");
            }
            return Math.min(retries * 200, 2000);
        },
    },
});

redisClient.on("error", (err) => console.error("❌ Redis Client Error:", err.message));
redisClient.on("connect", () => console.log("⚡ Connected to Redis In-Memory Cache"));
redisClient.on("ready", () => console.log("🚀 Redis is Ready for Fast In-Memory Caching"));

// Connect immediately
(async () => {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
    } catch (err) {
        console.warn("⚠️ Redis initial connection skipped:", err.message);
    }
})();

// Helper Functions for Clean, Safe Caching
export const getCache = async (key) => {
    try {
        if (redisClient.isReady) {
            const data = await redisClient.get(key);
            return data ? JSON.parse(data) : null;
        }
    } catch (err) {
        console.warn(`Redis getCache error for key [${key}]:`, err.message);
    }
    return null;
};

export const setCache = async (key, value, ttlSeconds = 600) => {
    try {
        if (redisClient.isReady) {
            await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
        }
    } catch (err) {
        console.warn(`Redis setCache error for key [${key}]:`, err.message);
    }
};

export const deleteCache = async (key) => {
    try {
        if (redisClient.isReady) {
            await redisClient.del(key);
        }
    } catch (err) {
        console.warn(`Redis deleteCache error for key [${key}]:`, err.message);
    }
};

export const deleteCachePattern = async (pattern) => {
    try {
        if (redisClient.isReady) {
            const keys = await redisClient.keys(pattern);
            if (keys.length > 0) {
                await redisClient.del(keys);
            }
        }
    } catch (err) {
        console.warn(`Redis deleteCachePattern error for pattern [${pattern}]:`, err.message);
    }
};

export default redisClient;
