
import { pool } from '../config/db.js';
import { Router } from 'express';
import type { Request, Response } from "express";

// Create router instance
const router = Router();

import bcrypt from 'bcrypt';

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

    // ✅ 3. Insert into accounts_tbl first (flush to get Account_id)
    const [accountResult]: any = await pool.execute(
      "INSERT INTO accounts_tbl (Username, Password, Roles, isActive, Account_Created) VALUES (?, ?, ?, 1, NOW())",
      [username, DEFAULT_PASSWORD, roleId]
    );

    const accountId = accountResult.insertId; // 🔑 Get generated Account_id

    // ✅ 4. Insert into profile_tbl (using Account_id)
    await pool.execute(
      "INSERT INTO profile_tbl (Account_id, FirstName, LastName, Area_id, Contact, Email) VALUES (?, ?, ?, ?, ?, ?)",
      [accountId, firstName, lastName, areaId, contact, email]
    );

    // ✅ 5. Response
    res.status(201).json({
      message: "Registration successful",
      username,
      accountId,
      defaultPassword: DEFAULT_PASSWORD,
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