import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const port = Number(process.env.DB_PORT) || 3306;
const useSsl = process.env.DB_SSL === 'true' || process.env.DB_SSL === '1';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port,
  user: process.env.DB_USER || '',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || '',
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
