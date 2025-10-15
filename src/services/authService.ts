import { pool } from './db';

export async function validateUser(username: string, password: string) {
  const query = "SELECT Account_id, Username, Password, Roles FROM accounts_tbl WHERE Username = ? AND IsActive = 1 LIMIT 1";
  const [rows] = await pool.execute(query, [username]);
  if (Array.isArray(rows) && rows.length > 0) {
    const user = rows[0] as any;
    // For demo: plain text comparison. Use bcrypt in production!
    if (user.Password === password) {
      return { Account_id: user.Account_id, Username: user.Username, Roles: user.Roles };
    }
  }
  return null;
}