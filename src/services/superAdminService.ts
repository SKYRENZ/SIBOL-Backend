import bcrypt from 'bcrypt';
import { pool } from '../config/db';
import config from '../config/env';
import * as emailService from '../utils/emailService';
import { fetchAllModules } from './moduleService.js';

const ADMIN_ROLE_ID = 1; // Admin role in user_roles_tbl

/**
 * Create an admin account assigned to a specific barangay.
 * Only callable by a SuperAdmin.
 */
export async function createAdmin(
    firstName: string,
    lastName: string,
    barangayId: number,
    email: string,
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

        // Determine password and hash it (treat whitespace-only as empty)
        const normalizedPassword = typeof password === 'string' ? password.trim() : '';
        const usePassword = normalizedPassword.length > 0 ? normalizedPassword : config.DEFAULT_PASSWORD;
        const hashedPassword = await bcrypt.hash(usePassword, 10);

        // Insert account with Admin role
        const [accountResult]: any = await conn.execute(
            'INSERT INTO accounts_tbl (Username, Password, Roles, IsActive, IsFirstLogin, credit_score) VALUES (?, ?, ?, 1, 0, 100)',
            [username, hashedPassword, ADMIN_ROLE_ID]
        );
        const newAccountId = accountResult.insertId;

        // Insert profile with Barangay_id
        await conn.execute(
            'INSERT INTO profile_tbl (Account_id, FirstName, LastName, Barangay_id, Email) VALUES (?, ?, ?, ?, ?)',
            [newAccountId, firstName, lastName, barangayId, email]
        );

        await conn.commit();

        // Send welcome email (best-effort)
        try {
            await emailService.sendWelcomeEmail(email, firstName, username, usePassword);
        } catch (emailErr) {
            console.error('Warning: failed to send welcome email:', emailErr);
        }

        // Return the created admin summary
        const [userRows]: any = await pool.execute(
            `SELECT 
         a.Account_id, a.Username, a.Roles, a.IsActive, a.Account_created,
         p.FirstName, p.LastName, p.Email, p.Barangay_id,
         b.Barangay_Name
       FROM accounts_tbl a
       JOIN profile_tbl p ON a.Account_id = p.Account_id
       LEFT JOIN barangay_tbl b ON p.Barangay_id = b.Barangay_id
       WHERE a.Account_id = ?`,
            [newAccountId]
        );

        return {
            success: true,
            message: 'Admin created successfully',
            user: userRows[0],
        };
    } catch (error) {
        await conn.rollback();
        console.error('❌ SuperAdmin create admin error:', error);
        throw new Error(`Failed to create admin: ${String(error)}`);
    } finally {
        conn.release();
    }
}

/**
 * Get all users filtered by barangay ID.
 * Joins accounts_tbl → profile_tbl → barangay_tbl.
 */
export async function getUsersByBarangay(barangayId: number) {
    try {
        const sql = `
      SELECT 
        a.Account_id, a.Username, a.Roles, a.IsActive, a.Account_created,
        p.FirstName, p.LastName, p.Email, p.Contact, p.Barangay_id,
        b.Barangay_Name,
        r.Roles AS RoleName
      FROM accounts_tbl a
      LEFT JOIN profile_tbl p ON a.Account_id = p.Account_id
      LEFT JOIN barangay_tbl b ON p.Barangay_id = b.Barangay_id
      LEFT JOIN user_roles_tbl r ON a.Roles = r.Roles_id
      WHERE p.Barangay_id = ? AND a.IsActive = 1
      ORDER BY p.LastName, p.FirstName
    `;
        const [rows]: any = await pool.execute(sql, [barangayId]);

        return {
            success: true,
            users: Array.isArray(rows) ? rows : [],
            count: Array.isArray(rows) ? rows.length : 0,
        };
    } catch (error) {
        console.error('❌ Error fetching users by barangay:', error);
        throw new Error('Failed to fetch users by barangay');
    }
}

/**
 * Get all active barangays for dropdown selection.
 */
export async function getAllBarangays() {
    try {
        const [rows]: any = await pool.execute(
            'SELECT Barangay_id, Barangay_Name, IsActive FROM barangay_tbl WHERE IsActive = 1 ORDER BY Barangay_id'
        );
        return {
            success: true,
            barangays: rows,
        };
    } catch (error) {
        console.error('❌ Error fetching barangays:', error);
        throw new Error('Failed to fetch barangays');
    }
}

/**
 * Get all available barangays (1-1000) that haven't been activated yet.
 * Returns IDs not yet in the database, excluding both actual IDs and numbers from names.
 */
export async function getAvailableBarangays() {
    try {
        const [existingBarangays]: any = await pool.execute(
            'SELECT Barangay_id, Barangay_Name FROM barangay_tbl'
        );

        const excludedNumbers = new Set<number>();

        // Exclude both the actual IDs and the numbers extracted from names
        existingBarangays.forEach((row: any) => {
            // Add the actual ID
            excludedNumbers.add(row.Barangay_id);

            // Extract number from name (e.g., "Barangay 176" -> 176)
            const match = row.Barangay_Name?.match(/\d+/);
            if (match) {
                excludedNumbers.add(parseInt(match[0], 10));
            }
        });

        const available = [];

        for (let i = 1; i <= 1000; i++) {
            if (!excludedNumbers.has(i)) {
                available.push({
                    barangayId: i,
                    barangayName: `Barangay ${i}`
                });
            }
        }

        return {
            success: true,
            available,
            count: available.length
        };
    } catch (error) {
        console.error('❌ Error fetching available barangays:', error);
        throw new Error('Failed to fetch available barangays');
    }
}

/**
 * Activate a barangay by adding it to the database.
 * Input: barangayId (1-1000)
 * Automatically generates barangayName as "Barangay {id}"
 */
export async function activateBarangay(barangayId: number) {
    const conn = await (pool as any).getConnection();
    try {
        // Validate barangayId range
        if (!Number.isInteger(barangayId) || barangayId < 1 || barangayId > 1000) {
            throw new Error('Barangay ID must be an integer between 1 and 1000');
        }

        // Check if already exists
        const [existing]: any = await conn.execute(
            'SELECT Barangay_id FROM barangay_tbl WHERE Barangay_id = ?',
            [barangayId]
        );
        if (existing.length > 0) {
            throw new Error('Barangay already exists in the system');
        }

        const barangayName = `Barangay ${barangayId}`;

        // Insert new active barangay
        await conn.execute(
            'INSERT INTO barangay_tbl (Barangay_id, Barangay_Name, IsActive) VALUES (?, ?, 1)',
            [barangayId, barangayName]
        );

        return {
            success: true,
            barangay: {
                Barangay_id: barangayId,
                Barangay_Name: barangayName,
                IsActive: 1
            }
        };
    } catch (error) {
        console.error('❌ Error activating barangay:', error);
        throw new Error(`Failed to activate barangay: ${String(error)}`);
    } finally {
        conn.release();
    }
}

/**
 * Deactivate a barangay and cascade deactivate all assigned admins.
 * Soft delete with IsActive = 0
 */
export async function deactivateBarangay(barangayId: number) {
    const conn = await (pool as any).getConnection();
    try {
        await conn.beginTransaction();

        // Check if barangay exists
        const [existing]: any = await conn.execute(
            'SELECT Barangay_id FROM barangay_tbl WHERE Barangay_id = ?',
            [barangayId]
        );
        if (existing.length === 0) {
            throw new Error('Barangay not found');
        }

        // Mark barangay as inactive
        await conn.execute(
            'UPDATE barangay_tbl SET IsActive = 0 WHERE Barangay_id = ?',
            [barangayId]
        );

        // Get admins assigned to this barangay before deactivating
        const [admins]: any = await conn.execute(
            'SELECT Account_id FROM profile_tbl WHERE Barangay_id = ?',
            [barangayId]
        );

        // Cascade deactivate admins
        if (admins.length > 0) {
            const adminIds = admins.map((row: any) => row.Account_id);
            const placeholders = adminIds.map(() => '?').join(',');
            await conn.execute(
                `UPDATE accounts_tbl SET IsActive = 0 WHERE Account_id IN (${placeholders})`,
                adminIds
            );
        }

        await conn.commit();

        return {
            success: true,
            deactivatedAdminCount: admins.length
        };
    } catch (error) {
        await conn.rollback();
        console.error('❌ Error deactivating barangay:', error);
        throw new Error(`Failed to deactivate barangay: ${String(error)}`);
    } finally {
        conn.release();
    }
}

/**
 * Get all admin accounts with profile and barangay info.
 */
export async function getAdminAccounts() {
    try {
        const sql = `
      SELECT 
        a.Account_id, a.Username, a.Roles, a.IsActive, a.Account_created, a.User_modules,
        p.FirstName, p.LastName, p.Email, p.Contact, p.Barangay_id,
        b.Barangay_Name
      FROM accounts_tbl a
      LEFT JOIN profile_tbl p ON a.Account_id = p.Account_id
      LEFT JOIN barangay_tbl b ON p.Barangay_id = b.Barangay_id
      WHERE a.Roles = ?
      ORDER BY a.Account_id
    `;
        const [rows]: any = await pool.execute(sql, [ADMIN_ROLE_ID]);

        return {
            success: true,
            users: Array.isArray(rows) ? rows : [],
            count: Array.isArray(rows) ? rows.length : 0,
        };
    } catch (error) {
        console.error('❌ Error fetching admin accounts:', error);
        throw new Error('Failed to fetch admin accounts');
    }
}

/**
 * Update admin account (roles/modules/profile fields).
 */
export async function updateAdminAccount(accountId: number, updates: any) {
    let conn: any = null;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const accSets: string[] = [];
        const accParams: any[] = [];
        const profSets: string[] = [];
        const profParams: any[] = [];

        if (updates.Roles !== undefined) {
            accSets.push('Roles = ?');
            accParams.push(updates.Roles);
        }

        if (updates.User_modules !== undefined) {
            accSets.push('User_modules = ?');
            accParams.push(updates.User_modules ?? null);
        }

        if (updates.Barangay_id !== undefined) {
            profSets.push('Barangay_id = ?');
            profParams.push(updates.Barangay_id);
        }

        if (accSets.length > 0) {
            await conn.execute(
                `UPDATE accounts_tbl SET ${accSets.join(', ')} WHERE Account_id = ?`,
                [...accParams, accountId]
            );
        }

        if (profSets.length > 0) {
            await conn.execute(
                `UPDATE profile_tbl SET ${profSets.join(', ')} WHERE Account_id = ?`,
                [...profParams, accountId]
            );
        }

        await conn.commit();

        const [rows]: any = await pool.execute(
            `SELECT 
         a.Account_id, a.Username, a.Roles, a.IsActive, a.Account_created, a.User_modules,
         p.FirstName, p.LastName, p.Email, p.Contact, p.Barangay_id,
         b.Barangay_Name
       FROM accounts_tbl a
       LEFT JOIN profile_tbl p ON a.Account_id = p.Account_id
       LEFT JOIN barangay_tbl b ON p.Barangay_id = b.Barangay_id
       WHERE a.Account_id = ?
       LIMIT 1`,
            [accountId]
        );

        return {
            success: true,
            user: rows?.[0] ?? null,
        };
    } catch (error) {
        if (conn) await conn.rollback();
        console.error('❌ Error updating admin account:', error);
        throw new Error('Failed to update admin account');
    } finally {
        conn?.release?.();
    }
}

/**
 * Toggle admin account active status.
 */
export async function setAdminActive(accountId: number, isActive: number) {
    try {
        await pool.execute('UPDATE accounts_tbl SET IsActive = ? WHERE Account_id = ?', [isActive, accountId]);
        const [rows]: any = await pool.execute(
            `SELECT 
         a.Account_id, a.Username, a.Roles, a.IsActive, a.Account_created, a.User_modules,
         p.FirstName, p.LastName, p.Email, p.Contact, p.Barangay_id,
         b.Barangay_Name
       FROM accounts_tbl a
       LEFT JOIN profile_tbl p ON a.Account_id = p.Account_id
       LEFT JOIN barangay_tbl b ON p.Barangay_id = b.Barangay_id
       WHERE a.Account_id = ?
       LIMIT 1`,
            [accountId]
        );
        return rows?.[0] ?? null;
    } catch (error) {
        console.error('❌ Error toggling admin account:', error);
        throw new Error('Failed to toggle admin account');
    }
}

/**
 * Get roles (Admin only for superadmin management).
 */
export async function getRoles() {
    try {
        const [rows]: any = await pool.execute(
            'SELECT Roles_id, Roles FROM user_roles_tbl WHERE Roles_id = ? ORDER BY Roles_id',
            [ADMIN_ROLE_ID]
        );
        return { success: true, roles: rows };
    } catch (error) {
        console.error('❌ Error fetching roles:', error);
        throw new Error('Failed to fetch roles');
    }
}

/**
 * Get modules.
 */
export async function getModules() {
    try {
        const rows = await fetchAllModules();
        return { success: true, modules: rows };
    } catch (error) {
        console.error('❌ Error fetching modules:', error);
        throw new Error('Failed to fetch modules');
    }
}
