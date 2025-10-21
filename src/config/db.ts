import mysql from 'mysql2/promise';
import config from './env.js';  // Add this import

// Replace direct process.env usage
const port = config.DB_PORT;  // Use config.DB_PORT
const useSsl = config.DB_SSL;  // Use config.DB_SSL

export const pool = mysql.createPool({
  host: config.DB_HOST,  // Use config.DB_HOST
  port,
  user: config.DB_USER,  // Use config.DB_USER
  password: config.DB_PASS,  // Use config.DB_PASS
  database: config.DB_NAME,  // Use config.DB_NAME
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000,
  // cast ssl to any to satisfy mysql2 typings
  ssl: useSsl ? ({ rejectUnauthorized: false } as any) : undefined,
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
