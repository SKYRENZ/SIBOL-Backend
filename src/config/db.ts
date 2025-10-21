import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const port = Number(process.env.DB_PORT) || 3306;

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port,
  user: process.env.DB_USER || '',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || '',
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 10000, // 10s
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

// helper to test connection at runtime
export async function testDbConnection() {
  try {
    const conn = await pool.getConnection();
    conn.release();
    console.log('✅ DB connected successfully');
  } catch (err) {
    console.error('DB connection error:', err);
  }
}

export default pool;
