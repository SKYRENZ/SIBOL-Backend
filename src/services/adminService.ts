import * as emailService from '../utils/emailService';
import bcrypt from 'bcrypt';
import { pool } from '../config/db';
import config from '../config/env';
import cloudinary from '../config/cloudinary.js';

/**
 * Create a user directly as admin.
 * - password is optional; falls back to config.DEFAULT_PASSWORD
 * - hashes password before storing
 * - commits transaction then sends welcome email (with plain password only for admin-created accounts)
 */
export async function createUserAsAdmin(
  firstName: string,
  lastName: string,
  barangayId: number,  // Renamed from areaId
  email: string,
  roleId: number,
  password?: string
) {
  const conn = await (pool as any).getConnection();
  try {
    await conn.beginTransaction();

    const username = `${firstName}.${lastName}`.toLowerCase();

    // Check for existing username/email
    const [existingActive]: any = await conn.execute(
      'SELECT a.Account_id FROM accounts_tbl a JOIN profile_tbl p ON a.Account_id = p.Account_id WHERE a.Username = ? OR p.Email = ?',
      [username, email]
    );
    if (existingActive.length > 0) {
      throw new Error('Username or email already exists');
    }

    // Determine password and hash it
    const usePassword = password && password.length > 0 ? password : config.DEFAULT_PASSWORD;
    const hashedPassword = await bcrypt.hash(usePassword, 10);

    // Insert account
    const [accountResult]: any = await conn.execute(
      'INSERT INTO accounts_tbl (Username, Password, Roles, IsActive) VALUES (?, ?, ?, 1)',
      [username, hashedPassword, roleId]
    );
    const newAccountId = accountResult.insertId;

    // Insert profile
    await conn.execute(
      'INSERT INTO profile_tbl (Account_id, FirstName, LastName, Barangay_id, Email) VALUES (?, ?, ?, ?, ?)',  // Changed Area_id to Barangay_id
      [newAccountId, firstName, lastName, barangayId, email]  // Changed areaId to barangayId
    );

    await conn.commit();

    // Send welcome email (include plain password only for admin-created accounts)
    try {
      await emailService.sendWelcomeEmail(email, firstName, username, usePassword);
    } catch (emailErr) {
      // Log but do not fail the flow since account was created
      console.error('Warning: failed to send welcome email:', emailErr);
    }

    // Return the created user summary
    const [userRows]: any = await pool.execute(
      `SELECT 
         a.Account_id, a.Username, a.Roles, a.IsActive, a.Account_created,
         p.FirstName, p.LastName, p.Email, p.Contact, p.Area_id
       FROM accounts_tbl a
       JOIN profile_tbl p ON a.Account_id = p.Account_id
       WHERE a.Account_id = ?`,
      [newAccountId]
    );

    return {
      success: true,
      message: 'User created successfully',
      user: userRows[0],
    };
  } catch (error) {
    await conn.rollback();
    console.error('❌ Admin create user error:', error);
    throw new Error(`Failed to create user: ${String(error)}`);
  } finally {
    conn.release();
  }
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
        r.Roles as RoleName,
        pa.File_path AS AttachmentUrl,
        pa.Public_id AS AttachmentPublicId,
        pa.File_name AS AttachmentFileName,
        pa.File_type AS AttachmentFileType
      FROM pending_accounts_tbl p
      LEFT JOIN area_tbl a ON p.Area_id = a.Area_id
      LEFT JOIN user_roles_tbl r ON p.Roles = r.Roles_id
      LEFT JOIN pending_account_attachments_tbl pa ON pa.Pending_id = p.Pending_id
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
        r.Roles as RoleName,
        pa.File_path AS AttachmentUrl,
        pa.Public_id AS AttachmentPublicId,
        pa.File_name AS AttachmentFileName,
        pa.File_type AS AttachmentFileType,
        pa.File_size AS AttachmentFileSize,
        pa.Uploaded_at AS AttachmentUploadedAt
      FROM pending_accounts_tbl p
      LEFT JOIN area_tbl a ON p.Area_id = a.Area_id
      LEFT JOIN user_roles_tbl r ON p.Roles = r.Roles_id
      LEFT JOIN pending_account_attachments_tbl pa ON pa.Pending_id = p.Pending_id
      WHERE p.Pending_id = ? AND p.IsEmailVerified = 1
      LIMIT 1
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

    const [pendingRows]: any = await conn.execute(
      "SELECT * FROM pending_accounts_tbl WHERE Pending_id = ? AND IsEmailVerified = 1 AND IsAdminVerified = 0",
      [pendingId]
    );

    if (pendingRows.length === 0) {
      throw new Error("Pending account not found, email not verified, or already processed");
    }

    // ✅ get attachment public_id for deletion
    const [attRows]: any = await conn.execute(
      `SELECT Public_id FROM pending_account_attachments_tbl WHERE Pending_id = ?`,
      [pendingId]
    );

    const pendingAccount = pendingRows[0];

    const usePassword = config.DEFAULT_PASSWORD;
    const hashed = await bcrypt.hash(usePassword, 10);

    const [accountResult]: any = await conn.execute(
      "INSERT INTO accounts_tbl (Username, Password, Roles, IsActive) VALUES (?, ?, ?, 1)",
      [pendingAccount.Username, hashed, pendingAccount.Roles]
    );

    const newAccountId = accountResult.insertId;

    await conn.execute(
      "INSERT INTO profile_tbl (Account_id, FirstName, LastName, Area_id, Email) VALUES (?, ?, ?, ?, ?)",
      [newAccountId, pendingAccount.FirstName, pendingAccount.LastName, pendingAccount.Area_id, pendingAccount.Email]
    );

    // ✅ best-effort Cloudinary cleanup (do not fail approval if destroy fails)
    for (const a of attRows || []) {
      const publicId = a?.Public_id;
      if (!publicId) continue;
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      } catch (e) {
        console.warn('[approveAccount] failed to delete cloudinary asset', { pendingId, publicId });
      }
    }

    await conn.execute("DELETE FROM pending_accounts_tbl WHERE Pending_id = ?", [pendingId]);

    await conn.commit();

    try {
      await emailService.sendWelcomeEmail(
        pendingAccount.Email,
        pendingAccount.FirstName,
        pendingAccount.Username,
        usePassword
      );
    } catch (emailErr) {
      console.warn("Warning: failed to send welcome email (non-fatal):", emailErr);
    }

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
      message: 'Account approved and user created',
      user: newUserRows[0]
    };
  } catch (error) {
    await conn.rollback();
    console.error("❌ Admin approve account error:", error);
    throw new Error(`Failed to approve account: ${error}`);
  } finally {
    conn.release();
  }
}

// ADMIN FUNCTIONS

// Get admin stats (simplified)
export async function getAdminStats() {
  try {
    const [
      activeUsersResult,
      pendingAccountsResult,
      areasResult,
      rolesResult
    ] = await Promise.all([
      pool.execute("SELECT COUNT(*) as cnt FROM accounts_tbl WHERE IsActive = 1"),
      pool.execute("SELECT COUNT(*) as cnt FROM pending_accounts_tbl WHERE IsEmailVerified = 1 AND IsAdminVerified = 0"),
      pool.execute("SELECT COUNT(*) as cnt FROM area_tbl"),
      pool.execute("SELECT COUNT(*) as cnt FROM user_roles_tbl")
    ]);

    // each result is [rows, fields] - rows[0].cnt contains the count
    const extractCount = (res: any) => {
      const rows = Array.isArray(res) ? res[0] : res;
      if (Array.isArray(rows) && rows.length > 0 && typeof rows[0].cnt !== 'undefined') {
        return Number(rows[0].cnt) || 0;
      }
      return 0;
    };

    const stats = {
      activeUsers: extractCount(activeUsersResult),
      pendingAccounts: extractCount(pendingAccountsResult),
      areas: extractCount(areasResult),
      roles: extractCount(rolesResult)
    };

    return {
      success: true,
      stats
    };
  } catch (error) {
    console.error("❌ Error fetching admin stats:", error);
    throw new Error("Failed to fetch admin stats");
  }
}

// Get all users (with optional filters)
export async function getAllUsers(roleId?: number, isActive?: boolean) {
  try {
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (roleId !== undefined && roleId !== null) {
      where += ' AND a.Roles = ?';
      params.push(roleId);
    }
    if (isActive !== undefined && isActive !== null) {
      where += ' AND a.IsActive = ?';
      params.push(isActive ? 1 : 0);
    }

    const sql = `
      SELECT a.*, p.FirstName, p.LastName, p.Email, p.Barangay_id, b.Barangay_Name
      FROM accounts_tbl a
      LEFT JOIN profile_tbl p ON p.Account_id = a.Account_id
      LEFT JOIN barangay_tbl b ON p.Barangay_id = b.Barangay_id
      ${where}
      ORDER BY a.Account_id
    `;
    console.log('Executing SQL:', sql, 'Params:', params);  // Keep for debugging if needed
    const [rows]: any = await pool.execute(sql, params);  // Use pool.execute for consistency

    return {
      success: true,
      users: Array.isArray(rows) ? rows : [],
      count: Array.isArray(rows) ? rows.length : 0
    };
  } catch (error) {
    console.error('getAllUsers error:', error);
    throw error;  // Throw actual error for better debugging
  }
}

// Get user by ID
export async function getUserById(userId: number) {
  try {
    const [rows]: any = await pool.execute(`
      SELECT 
        a.Account_id, a.Username, a.Roles, a.IsActive, a.Account_created,
        p.FirstName, p.LastName, p.Email, p.Contact, p.Area_id
      FROM accounts_tbl a 
      JOIN profile_tbl p ON a.Account_id = p.Account_id 
      WHERE a.Account_id = ?
    `, [userId]);

    if (rows.length === 0) {
      throw new Error("User not found");
    }

    return {
      success: true,
      user: rows[0]
    };
  } catch (error) {
    console.error("❌ Error fetching user by ID:", error);
    throw new Error("Failed to fetch user details");
  }
}

// Update user (admin)
export async function updateUser(userId: number, updates: any) {
  let conn: any = null;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const accSets: string[] = [];
    const accParams: any[] = [];
    const profSets: string[] = [];
    const profParams: any[] = [];

    // account-level fields (accounts_tbl)
    if (updates.Roles !== undefined) { accSets.push('Roles = ?'); accParams.push(updates.Roles); }
    if (updates.IsActive !== undefined) { accSets.push('IsActive = ?'); accParams.push(updates.IsActive ? 1 : 0); }
    if (updates.User_modules !== undefined) { accSets.push('User_modules = ?'); accParams.push(updates.User_modules); }

    // profile-level fields (profile_tbl)
    if (updates.FirstName !== undefined) { profSets.push('FirstName = ?'); profParams.push(updates.FirstName); }
    if (updates.LastName !== undefined) { profSets.push('LastName = ?'); profParams.push(updates.LastName); }
    if (updates.Email !== undefined) { profSets.push('Email = ?'); profParams.push(updates.Email); }
    if (updates.Contact !== undefined) { profSets.push('Contact = ?'); profParams.push(updates.Contact); }
    if (updates.Barangay_id !== undefined) { profSets.push('Barangay_id = ?'); profParams.push(updates.Barangay_id); }  // Changed from Area_id

    // run updates if anything to update
    if (accSets.length > 0) {
      const sqlAcc = `UPDATE accounts_tbl SET ${accSets.join(', ')} WHERE Account_id = ?`;
      await conn.execute(sqlAcc, [...accParams, userId]);
    }

    if (profSets.length > 0) {
      const sqlProf = `UPDATE profile_tbl SET ${profSets.join(', ')} WHERE Account_id = ?`;
      await conn.execute(sqlProf, [...profParams, userId]);
    }

    await conn.commit();

    // return fresh user/profile summary
    const [rows]: any = await pool.query(
      `SELECT a.Account_id, a.Username, a.Roles, a.IsActive, a.User_modules, p.FirstName, p.LastName, p.Email, p.Contact, p.Area_id
       FROM accounts_tbl a
       LEFT JOIN profile_tbl p ON p.Account_id = a.Account_id
       WHERE a.Account_id = ?`,
      [userId]
    );

    return { success: true, user: rows?.[0] ?? null };
  } catch (err: any) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('❌ Error updating user:', err);
    throw new Error('Failed to update user');
  } finally {
    if (conn) try { conn.release(); } catch (_) {}
  }
}

// Delete user (soft delete by setting IsActive = 0)
export async function deleteUser(userId: number) {
  try {
    await pool.execute(
      `UPDATE accounts_tbl SET IsActive = 0 WHERE Account_id = ?`,
      [userId]
    );

    return {
      success: true,
      message: 'User deactivated successfully'
    };
  } catch (error) {
    console.error("❌ Error deactivating user:", error);
    throw new Error("Failed to deactivate user");
  }
}

// Get user areas (for admin)
export async function getUserAreas(userId: number) {
  try {
    const [rows]: any = await pool.execute(`
      SELECT a.Area_id, a.Area_Name
      FROM area_tbl a
      JOIN profile_tbl p ON a.Area_id = p.Area_id
      WHERE p.Account_id = ?
    `, [userId]);

    return {
      success: true,
      areas: rows
    };
  } catch (error) {
    console.error("❌ Error fetching user areas:", error);
    throw new Error("Failed to fetch user areas");
  }
}

// Get user roles (for admin)
export async function getUserRoles(userId: number) {
  try {
    const [rows]: any = await pool.execute(`
      SELECT r.Roles_id, r.Roles
      FROM user_roles_tbl r
      JOIN accounts_tbl a ON r.Roles_id = a.Roles
      WHERE a.Account_id = ?
    `, [userId]);

    return {
      success: true,
      roles: rows
    };
  } catch (error) {
    console.error("❌ Error fetching user roles:", error);
    throw new Error("Failed to fetch user roles");
  }
}

// Assign areas to user (admin)
export async function assignAreasToUser(userId: number, areaIds: number[]) {
  const conn = await (pool as any).getConnection();
  try {
    await conn.beginTransaction();

    // 1. Delete existing area assignments
    await conn.execute(
      `DELETE FROM user_area_tbl WHERE Account_id = ?`,
      [userId]
    );

    // 2. Insert new area assignments
    const values = areaIds.map(areaId => [userId, areaId]);
    if (values.length > 0) {
      await conn.execute(
        `INSERT INTO user_area_tbl (Account_id, Area_id) VALUES ?`,
        [values]
      );
    }

    await conn.commit();

    return {
      success: true,
      message: 'Areas assigned to user successfully'
    };
  } catch (error) {
    await conn.rollback();
    console.error("❌ Error assigning areas to user:", error);
    throw new Error("Failed to assign areas to user");
  } finally {
    conn.release();
  }
}

// Assign roles to user (admin)
export async function assignRolesToUser(userId: number, roleIds: number[]) {
  const conn = await (pool as any).getConnection();
  try {
    await conn.beginTransaction();

    // 1. Delete existing role assignments
    await conn.execute(
      `DELETE FROM user_roles_tbl WHERE Account_id = ?`,
      [userId]
    );

    // 2. Insert new role assignments
    const values = roleIds.map(roleId => [userId, roleId]);
    if (values.length > 0) {
      await conn.execute(
        `INSERT INTO user_roles_tbl (Account_id, Roles_id) VALUES ?`,
        [values]
      );
    }

    await conn.commit();

    return {
      success: true,
      message: 'Roles assigned to user successfully'
    };
  } catch (error) {
    await conn.rollback();
    console.error("❌ Error assigning roles to user:", error);
    throw new Error("Failed to assign roles to user");
  } finally {
    conn.release();
  }
}

// Get area assignments for user (admin)
export async function getUserAreaAssignments(userId: number) {
  try {
    const [rows]: any = await pool.execute(`
      SELECT ua.Area_id, a.Area_Name
      FROM user_area_tbl ua
      JOIN area_tbl a ON ua.Area_id = a.Area_id
      WHERE ua.Account_id = ?
    `, [userId]);

    return {
      success: true,
      areaAssignments: rows
    };
  } catch (error) {
    console.error("❌ Error fetching user area assignments:", error);
    throw new Error("Failed to fetch user area assignments");
  }
}

// Get role assignments for user (admin)
export async function getUserRoleAssignments(userId: number) {
  try {
    const [rows]: any = await pool.execute(`
      SELECT ur.Roles_id, r.Roles
      FROM user_roles_tbl ur
      JOIN user_roles_tbl r ON ur.Roles_id = r.Roles_id
      WHERE ur.Account_id = ?
    `, [userId]);

    return {
      success: true,
      roleAssignments: rows
    };
  } catch (error) {
    console.error("❌ Error fetching user role assignments:", error);
    throw new Error("Failed to fetch user role assignments");
  }
}

// Admin login
export async function adminLogin(username: string, password: string) {
  try {
    // 1. Get admin account by username
    const [adminRows]: any = await pool.execute(
      `SELECT a.Account_id, a.Username, a.Password, a.Roles, a.IsActive
       FROM accounts_tbl a 
       WHERE a.Username = ? AND a.IsActive = 1`,
      [username]
    );

    if (adminRows.length === 0) {
      throw new Error("Admin account not found or inactive");
    }

    const admin = adminRows[0];

    // 2. Check password
    const isPasswordValid = await bcrypt.compare(password, admin.Password);
    if (!isPasswordValid) {
      throw new Error("Invalid password");
    }

    // 3. Return admin session info (exclude password)
    const { Password, ...adminSession } = admin;
    return {
      success: true,
      admin: adminSession
    };
  } catch (error) {
    console.error("❌ Admin login error:", error);
    throw new Error("Failed to login as admin");
  }
}

// Admin logout (invalidate session)
export async function adminLogout(adminId: number) {
  try {
    // Invalidate admin session (implementation depends on session management)
    // For example, delete session token from database or cache
    return {
      success: true,
      message: 'Admin logged out successfully'
    };
  } catch (error) {
    console.error("❌ Admin logout error:", error);
    throw new Error("Failed to logout as admin");
  }
}

// Get all roles
export async function getRoles() {
  try {
    const [rows]: any = await pool.execute(`SELECT Roles_id, Roles FROM user_roles_tbl ORDER BY Roles_id`);
    return {
      success: true,
      roles: rows
    };
  } catch (error) {
    console.error("❌ Error fetching roles:", error);
    throw new Error("Failed to fetch roles");
  }
}

// Set account active/inactive
export async function setAccountActive(accountId: number, isActive: number) {
  try {
    await pool.execute(`UPDATE accounts_tbl SET IsActive = ? WHERE Account_id = ?`, [isActive, accountId]);

    // return basic updated account summary
    const [rows]: any = await pool.execute(
      `SELECT a.Account_id, a.Username, a.Roles, a.IsActive, p.FirstName, p.LastName, p.Email
       FROM accounts_tbl a JOIN profile_tbl p ON a.Account_id = p.Account_id
       WHERE a.Account_id = ?`,
      [accountId]
    );

    return {
      success: true,
      account: rows[0] ?? null
    };
  } catch (error) {
    console.error("❌ Error setting account active state:", error);
    throw new Error("Failed to update account active state");
  }
}

// Reject pending account
export async function rejectAccount(pendingId: number, reason?: string) {
  try {
    const [rows]: any = await pool.execute(`SELECT * FROM pending_accounts_tbl WHERE Pending_id = ?`, [pendingId]);
    if (!rows || rows.length === 0) {
      throw new Error("Pending account not found");
    }
    const pending = rows[0];

    const [attRows]: any = await pool.execute(
      `SELECT Public_id FROM pending_account_attachments_tbl WHERE Pending_id = ?`,
      [pendingId]
    );

    for (const a of attRows || []) {
      const publicId = a?.Public_id;
      if (!publicId) continue;
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      } catch (e) {
        console.warn('[rejectAccount] failed to delete cloudinary asset', { pendingId, publicId });
      }
    }

    try {
      if (pending.Email && (emailService as any).sendRejectionEmail) {
        await (emailService as any).sendRejectionEmail(pending.Email, pending.FirstName, reason);
      }
    } catch (emailErr) {
      console.warn("Warning: failed to send rejection email:", emailErr);
    }

    await pool.execute(`DELETE FROM pending_accounts_tbl WHERE Pending_id = ?`, [pendingId]);

    return {
      success: true,
      message: 'Pending account rejected and removed'
    };
  } catch (error) {
    console.error("❌ Error rejecting pending account:", error);
    throw new Error("Failed to reject pending account");
  }
}

// REPLACED: getModules implementation to query modules_tbl and normalize fields
export const getModules = async () => {
  try {
    const [rows] = await pool.query('SELECT * FROM modules_tbl');
    const list = Array.isArray(rows) ? (rows as any[]) : [];

    return list.map((m: any) => ({
      Module_id: m.Module_id ?? m.module_id ?? m.id ?? null,
      Module_name: m.Name ?? m.Module_name ?? m.name ?? '',  // Use 'Name' from modules_tbl
      Path: m.Path ?? m.path ?? m.route ?? null,
      _raw: m,
    }));
  } catch (err: any) {
    console.error('Get modules error:', err);
    throw new Error(`Failed to fetch modules: ${err?.message ?? String(err)}`);
  }
};

// NEW: Add getBarangays function
export async function getBarangays() {
  try {
    const [rows]: any = await pool.execute(`SELECT Barangay_id, Barangay_Name FROM barangay_tbl ORDER BY Barangay_id`);
    return {
      success: true,
      barangays: rows
    };
  } catch (error) {
    console.error("❌ Error fetching barangays:", error);
    throw new Error("Failed to fetch barangays");
  }
}