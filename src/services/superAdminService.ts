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
 * Get all barangays for dropdown selection.
 */
export async function getAllBarangays() {
    try {
        const [rows]: any = await pool.execute(
            'SELECT Barangay_id, Barangay_Name FROM barangay_tbl ORDER BY Barangay_id'
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
