import { pool } from '../config/db';
import * as authService from './authService';
import * as emailService from '../utils/emailService';

// create user via existing registerUser (keeps creation logic centralized) - removed contact parameter
export async function createUserAsAdmin(firstName: string, lastName: string, areaId: number, email: string, roleId: number) {
  return authService.registerUser(firstName, lastName, areaId, email, roleId);
}

// ✅ UPDATED: Get all pending accounts for admin review (removed Contact field)
export async function getPendingAccounts() {
  try {
    const [rows]: any = await pool.execute(`
      SELECT 
        p.Pending_id,
        p.Username,
        p.FirstName,
        p.LastName,
        p.Email,
        p.Area_id,
        p.Roles,
        p.IsEmailVerified,
        p.IsAdminVerified,
        p.Created_at,
        a.Area_Name,
        r.Roles as RoleName
      FROM pending_accounts_tbl p
      LEFT JOIN area_tbl a ON p.Area_id = a.Area_id
      LEFT JOIN user_roles_tbl r ON p.Roles = r.Roles_id
      WHERE p.IsEmailVerified = 1 AND p.IsAdminVerified = 0
      ORDER BY p.Created_at ASC
    `);

    return {
      success: true,
      pendingAccounts: rows,
      count: rows.length
    };
  } catch (error) {
    console.error("❌ Error fetching pending accounts:", error);
    throw new Error("Failed to fetch pending accounts");
  }
}

// ✅ UPDATED: Get pending account details by ID (removed Contact field)
export async function getPendingAccountById(pendingId: number) {
  try {
    const [rows]: any = await pool.execute(`
      SELECT 
        p.*,
        a.Area_Name,
        r.Roles as RoleName
      FROM pending_accounts_tbl p
      LEFT JOIN area_tbl a ON p.Area_id = a.Area_id
      LEFT JOIN user_roles_tbl r ON p.Roles = r.Roles_id
      WHERE p.Pending_id = ? AND p.IsEmailVerified = 1
    `, [pendingId]);

    if (rows.length === 0) {
      throw new Error("Pending account not found or email not verified");
    }

    const { Password, Verification_token, ...safeAccount } = rows[0];
    return {
      success: true,
      pendingAccount: safeAccount
    };

  } catch (error) {
    console.error("❌ Error fetching pending account:", error);
    throw new Error("Failed to fetch pending account details");
  }
}

// ✅ UPDATED: Admin approve account (removed contact field from transfer)
export async function approveAccount(pendingId: number) {
  const conn = await (pool as any).getConnection();
  
  try {
    await conn.beginTransaction();

    // 1. Get pending account data
    const [pendingRows]: any = await conn.execute(
      "SELECT * FROM pending_accounts_tbl WHERE Pending_id = ? AND IsEmailVerified = 1 AND IsAdminVerified = 0",
      [pendingId]
    );

    if (pendingRows.length === 0) {
      throw new Error("Pending account not found, email not verified, or already processed");
    }

    const pendingAccount = pendingRows[0];

    // 2. Insert into accounts_tbl
    const [accountResult]: any = await conn.execute(
      "INSERT INTO accounts_tbl (Username, Password, Roles, IsActive) VALUES (?, ?, ?, 1)",
      [pendingAccount.Username, pendingAccount.Password, pendingAccount.Roles]
    );

    const newAccountId = accountResult.insertId;

    // 3. Insert into profile_tbl (removed Contact field - set to NULL or remove if column doesn't allow NULL)
    await conn.execute(
      "INSERT INTO profile_tbl (Account_id, FirstName, LastName, Area_id, Email) VALUES (?, ?, ?, ?, ?)",
      [newAccountId, pendingAccount.FirstName, pendingAccount.LastName, pendingAccount.Area_id, pendingAccount.Email]
    );

    // 4. ✅ DELETE the pending account (no longer needed)
    await conn.execute(
      "DELETE FROM pending_accounts_tbl WHERE Pending_id = ?",
      [pendingId]
    );

    // 5. Send welcome email
    await emailService.sendWelcomeEmail(
      pendingAccount.Email, 
      pendingAccount.FirstName, 
      pendingAccount.Username
    );

    await conn.commit();

    // 6. Get the complete user data (Contact will be NULL in profile_tbl)
    const [newUserRows]: any = await pool.execute(`
      SELECT 
        a.Account_id, a.Username, a.Roles, a.IsActive, a.Account_created,
        p.FirstName, p.LastName, p.Email, p.Contact, p.Area_id
      FROM accounts_tbl a 
      JOIN profile_tbl p ON a.Account_id = p.Account_id 
      WHERE a.Account_id = ?
    `, [newAccountId]);

    return {
      success: true,
      message: "Account approved and activated successfully",
      user: newUserRows[0],
      note: "Welcome email sent to user. Pending account record deleted. Contact field set to NULL."
    };

  } catch (error) {
    await conn.rollback();
    console.error("❌ Account approval error:", error);
    throw new Error(`Account approval failed: ${error}`);
  } finally {
    conn.release();
  }
}

// ✅ NEW: Admin reject account (already deletes the pending account)
export async function rejectAccount(pendingId: number, reason?: string) {
  try {
    // Get pending account data for logging/email
    const [pendingRows]: any = await pool.execute(
      "SELECT * FROM pending_accounts_tbl WHERE Pending_id = ? AND IsEmailVerified = 1 AND IsAdminVerified = 0",
      [pendingId]
    );

    if (pendingRows.length === 0) {
      throw new Error("Pending account not found, email not verified, or already processed");
    }

    const pendingAccount = pendingRows[0];

    // Delete the pending account
    await pool.execute("DELETE FROM pending_accounts_tbl WHERE Pending_id = ?", [pendingId]);

    return {
      success: true,
      message: "Account rejected successfully",
      rejectedUser: {
        email: pendingAccount.Email,
        name: `${pendingAccount.FirstName} ${pendingAccount.LastName}`,
        reason: reason || "Not specified"
      }
    };

  } catch (error) {
    console.error("❌ Account rejection error:", error);
    throw new Error(`Account rejection failed: ${error}`);
  }
}

// ✅ Existing functions (contact field remains in profile_tbl for existing users)
export async function updateAccountAndProfile(accountId: number, updates: {
  firstName?: string;
  lastName?: string;
  areaId?: number;
  contact?: string;
  email?: string;
  roleId?: number;
}) {
  if (!accountId) throw new Error("accountId required");

  const conn = await (pool as any).getConnection();
  try {
    await conn.beginTransaction();

    if (updates.roleId !== undefined) {
      await conn.execute("UPDATE accounts_tbl SET Roles = ? WHERE Account_id = ?", [updates.roleId, accountId]);
    }

    const profileFields: string[] = [];
    const params: any[] = [];
    if (updates.firstName !== undefined) { profileFields.push("FirstName = ?"); params.push(updates.firstName); }
    if (updates.lastName !== undefined) { profileFields.push("LastName = ?"); params.push(updates.lastName); }
    if (updates.areaId !== undefined) { profileFields.push("Area_id = ?"); params.push(updates.areaId); }
    if (updates.contact !== undefined) { profileFields.push("Contact = ?"); params.push(updates.contact); }
    if (updates.email !== undefined) { profileFields.push("Email = ?"); params.push(updates.email); }

    if (profileFields.length > 0) {
      const sql = `UPDATE profile_tbl SET ${profileFields.join(", ")} WHERE Account_id = ?`;
      params.push(accountId);
      await conn.execute(sql, params);
    }

    await conn.commit();

    const [rows]: any = await pool.execute("SELECT a.Account_id, a.Username, a.Roles, a.IsActive, p.FirstName, p.LastName, p.Email, p.Contact, p.Area_id FROM accounts_tbl a JOIN profile_tbl p USING (Account_id) WHERE a.Account_id = ?", [accountId]);
    return rows[0];
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function setAccountActive(accountId: number, isActive: 0 | 1) {
  if (!accountId) throw new Error("accountId required");
  await pool.execute("UPDATE accounts_tbl SET IsActive = ? WHERE Account_id = ?", [isActive, accountId]);
  const [rows]: any = await pool.execute("SELECT Account_id, Username, Roles, IsActive FROM accounts_tbl WHERE Account_id = ?", [accountId]);
  return rows[0];
}