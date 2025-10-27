import mysql from 'mysql2/promise';
import config from './env';


// Replace direct process.env usage
const DB_HOST = process.env.DB_HOST ?? config.DB_HOST ?? 'localhost';
const DB_USER = process.env.DB_USER ?? config.DB_USER ?? 'root';
const DB_PASSWORD = process.env.DB_PASSWORD ?? config.DB_PASS ?? '';
const DB_NAME = process.env.DB_NAME ?? config.DB_NAME ?? 'sibol';
const DB_PORT = Number(process.env.DB_PORT ?? config.DB_PORT ?? 3306);

// <-- changed: log resolved DB config (no password) for debugging
console.info('[db] resolved config', { host: DB_HOST, user: DB_USER, database: DB_NAME, port: DB_PORT });

export const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 20000,
  // cast ssl to any to satisfy mysql2 typings
  ssl: config.DB_SSL ? ({ rejectUnauthorized: false } as any) : undefined,
} as any);

// helper to test connection at startup
export async function testDbConnection(retries = 3, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await pool.getConnection();
      conn.release();
      console.log('✅ DB connected successfully');
      return true;
    } catch (err) {
      console.error(`DB connection attempt ${i + 1} failed:`, err);
      if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  console.error('❌ All DB connection attempts failed.');
  return false;
}

export default pool;
