import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve directory of current file so .env is always found regardless of where the app is launched from
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;

// Support either full connection string (DATABASE_URL) or individual parameters from .env
const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
    }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'garage',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
    };

export const pool = new Pool(poolConfig);

// Test database connection on startup
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ PostgreSQL Database Connection Failed:');
        console.error(`   Error Message: ${err.message}`);
        console.error('   👉 Please check DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD in backend/.env');
    } else {
        console.log('✅ PostgreSQL Database Connected Successfully via .env!');
        console.log(`   Connected to Database: "${poolConfig.database}" on ${poolConfig.host}:${poolConfig.port}`);
        release();
    }
});

export default pool;
