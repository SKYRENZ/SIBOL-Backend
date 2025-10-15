import { pool } from '../config/db';
import { Router } from 'express';
import type { Request, Response } from "express";
import bcrypt from 'bcrypt';

// Create router instance
const router = Router();

// 🔐 Default password
const DEFAULT_PASSWORD = "SIBOL12345";

//register function
export async function registerUser(firstName: string, lastName: string, areaId: number, contact: string, email: string, roleId: number) {
  // ✅ 1. Validation
  if (!firstName || !lastName || !areaId || !contact || !email || !roleId) {
    throw new Error("Missing required fields");
  }

  // Create username (firstname.lastname)
  const username = `${firstName}.${lastName}`.toLowerCase();

  try {
    // ✅ 2. Check if username already exists in accounts_tbl
    const [existingAccounts]: any = await pool.execute("SELECT * FROM accounts_tbl WHERE Username = ?", [username]);

    if (existingAccounts.length > 0) {
      throw new Error("Username already exists");
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

    // ✅ 7. Return user data
    return {
      success: true,
      message: "Registration successful",
      user: newUser,
      note: "Default password has been set"
    };
  } catch (error) {
    console.error("❌ Registration Error:", error);
    throw new Error(`Registration failed: ${error}`);
  }
}

// Router endpoint that uses the function
router.post("/register", async (req: Request, res: Response) => {
  const { firstName, lastName, areaId, contact, email, roleId } = req.body;

  try {
    const result = await registerUser(firstName, lastName, areaId, contact, email, roleId);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ 
      message: error instanceof Error ? error.message : 'Registration failed' 
    });
  }
});

//login
export async function validateUser(username: string, password: string) {
  const query = "SELECT Account_id, Username, Password, Roles FROM accounts_tbl WHERE Username = ? AND IsActive = 1 LIMIT 1";
  const [rows] = await pool.execute(query, [username]);
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

// Export the router
export default router;