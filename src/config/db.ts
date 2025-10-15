import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();


export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "",
});

// Test the connection
pool
  .getConnection()
  .then((connection) => {
    console.log("✅ Connected to MySQL database");
    connection.release();
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
  });

export default pool;
