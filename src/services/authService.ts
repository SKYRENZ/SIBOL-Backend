import { pool } from '../config/db.js';
import { Router } from 'express';
import type { Request, Response } from "express";

import bcrypt from 'bcrypt';

// Create router instance
const router = Router();

//register
// 🔐 Default password
const DEFAULT_PASSWORD = "SIBOL12345";

router.post("/register", async (req: Request, res: Response) => {
  const { firstName, lastName, areaId, contact, email, roleId } = req.body;

  // ✅ 1. Validation
  if (!firstName || !lastName || !areaId || !contact || !email || !roleId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // Create username (firstname.lastname)
  const username = `${firstName}.${lastName}`.toLowerCase();

  try {
    // ✅ 2. Check if username already exists in accounts_tbl
    const [existingAccounts]: any = await pool.execute("SELECT * FROM accounts_tbl WHERE Username = ?", [username]);

    if (existingAccounts.length > 0) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // ✅ 3. Hash the password before storing
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // ✅ 4. Insert into accounts_tbl first
    const [accountResult]: any = await pool.execute(
      "INSERT INTO accounts_tbl (Username, Password, Roles, isActive, Account_Created) VALUES (?, ?, ?, 1, NOW())",
      [username, hashedPassword, roleId]
    );

    const accountId = accountResult.insertId; // 🔑 Get generated Account_id

    // ✅ 5. Insert into profile_tbl
    await pool.execute(
      "INSERT INTO profile_tbl (Account_id, FirstName, LastName, Area_id, Contact, Email) VALUES (?, ?, ?, ?, ?, ?)",
      [accountId, firstName, lastName, areaId, contact, email]
    );

    // ✅ 6. Fetch the created user data (without password)
    const [newUserRows]: any = await pool.execute(
      "SELECT Account_id, Username, Roles FROM accounts_tbl WHERE Account_id = ?",
      [accountId]
    );

    const newUser = newUserRows[0];

    // ✅ 7. Response with user data (password already excluded from query)
    res.status(201).json({
      message: "Registration successful",
      user: newUser,
      note: "Default password has been set"
    });
  } catch (error) {
    console.error("❌ Registration Error:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

//login
export async function validateUser(username: string, password: string) {
  const query = "SELECT Account_id, Username, Password, Roles FROM accounts_tbl WHERE Username = ? AND IsActive = 1 LIMIT 1";
  const [rows] = await pool.execute(query, [username]); // Prepared statement
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

// Export the router
export default router;