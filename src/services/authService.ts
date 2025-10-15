import { db } from '../config/db.js';
import bcrypt from 'bcrypt';


//login
export async function validateUser(username: string, password: string) {
  const query = "SELECT Account_id, Username, Password, Roles FROM accounts_tbl WHERE Username = ? AND IsActive = 1 LIMIT 1";
  const [rows] = await db.execute(query, [username]);
  if (Array.isArray(rows) && rows.length > 0) {
    const user = rows[0] as any;
    // Use bcrypt to compare
    const match = await bcrypt.compare(password, user.Password);
    if (match) {
      return { Account_id: user.Account_id, Username: user.Username, Roles: user.Roles };
    }
  }
  return null;
}