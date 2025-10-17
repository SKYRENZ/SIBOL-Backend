import { pool } from '../config/db';
import bcrypt from 'bcrypt';

// 🔐 Default password
const DEFAULT_PASSWORD = "SIBOL12345";
const ADMIN_ROLE = 1; // <-- adjust to match your roles table

//register function - now stores in pending_accounts_tbl
export async function registerUser(firstName: string, lastName: string, areaId: number, contact: string, email: string, roleId: number) {
  // ✅ 1. Validation
  if (!firstName || !lastName || !areaId || !contact || !email || !roleId) {
    throw new Error("Missing required fields");
  }

  // Create username (firstname.lastname)
  const username = `${firstName}.${lastName}`.toLowerCase();

  try {
    // ✅ 2. Check if username already exists in pending_accounts_tbl
    const [existingPending]: any = await pool.execute("SELECT * FROM pending_accounts_tbl WHERE Username = ? OR Email = ?", [username, email]);

    if (existingPending.length > 0) {
      throw new Error("Username or email already exists in pending accounts");
    }

    // ✅ 3. Check if username/email already exists in active accounts_tbl
    const [existingActive]: any = await pool.execute("SELECT * FROM accounts_tbl a JOIN profile_tbl p ON a.Account_id = p.Account_id WHERE a.Username = ? OR p.Email = ?", [username, email]);

    if (existingActive.length > 0) {
      throw new Error("Username or email already exists");
    }

    // ✅ 4. Hash the password before storing
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // ✅ 5. Insert into pending_accounts_tbl
    const [pendingResult]: any = await pool.execute(
      `INSERT INTO pending_accounts_tbl 
       (Username, Password, FirstName, LastName, Email, Contact, Area_id, Roles) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, hashedPassword, firstName, lastName, email, contact, areaId, roleId]
    );

    // ✅ 6. Return registration data
    return {
      success: true,
      message: "Registration successful. Account is pending admin approval.",
      pendingId: pendingResult.insertId,
      username: username,
      email: email,
      note: "Account stored in pending_accounts_tbl"
    };
  } catch (error) {
    console.error("❌ Registration Error:", error);
    throw new Error(`Registration failed: ${error}`);
  }
}

//login
export async function validateUser(username: string, password: string) {
  const query = "SELECT Account_id, Username, Password, Roles FROM accounts_tbl WHERE Username = ? AND IsActive = 1 LIMIT 1";
  const [rows]: any = await pool.execute(query, [username]);
  if (Array.isArray(rows) && rows.length > 0) {
    const user = rows[0] as any;
    const match = await bcrypt.compare(password, user.Password);
    if (match) {
      const { Password, ...safeUser } = user;
      return safeUser;
    }
  }
  return null;
}

// NOTE: admin-specific functions (updateAccountAndProfile, setAccountActive, etc.)
// were moved to src/services/adminService.ts to follow SRP.