import { db } from '../config/db';
import bcrypt from 'bcrypt';


//login
export async function validateUser(username: string, password: string) {
  const query = "SELECT Account_id, Username, Password, Roles FROM accounts_tbl WHERE Username = ? AND IsActive = 1 LIMIT 1";
  const [rows] = await db.execute(query, [username]); // Prepared statement
  if (Array.isArray(rows) && rows.length > 0) {
    const user = rows[0] as any;
    const match = await bcrypt.compare(password, user.Password);
    if (match) {
      // Flush sensitive data before returning
      const { Password, ...safeUser } = user;
      return safeUser;
    }
  }
  return null;
}