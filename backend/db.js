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

const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
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
