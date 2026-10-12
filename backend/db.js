import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is missing in backend/.env');
}

const isProduction = process.env.NODE_ENV === "production";
const sslRejectUnauthorized = process.env.PG_SSL_REJECT_UNAUTHORIZED !== undefined
    ? process.env.PG_SSL_REJECT_UNAUTHORIZED === "true"
    : isProduction;

if (!sslRejectUnauthorized) {
    console.warn("⚠️ SECURITY WARNING (SEC-12): PostgreSQL TLS certificate verification is disabled (rejectUnauthorized: false). Set PG_SSL_REJECT_UNAUTHORIZED=true in production to prevent MitM.");
}

const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("sslmode=disable")
        ? false
        : {
            rejectUnauthorized: sslRejectUnauthorized,
            ...(process.env.PG_CA_CERT ? { ca: process.env.PG_CA_CERT } : {}),
        },
    max: parseInt(process.env.PG_MAX_CONNECTIONS, 10) || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
};

export const pool = new Pool(poolConfig);

// Test database connection on startup
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Neon PostgreSQL Connection Failed:');
        console.error(`   Error Message: ${err.message}`);
        console.error('   👉 Please verify DATABASE_URL in backend/.env');
    } else {
        console.log('✅ Connected to Neon PostgreSQL Cloud Database!');
        release();
    }
});

export default pool;
