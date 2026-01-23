import pool from "../config/db";

export async function listOperators() {
  const [rows] = await pool.query<any[]>(
    "SELECT Account_id, Username FROM accounts_tbl WHERE Roles = 3"
  );
  return rows;
}