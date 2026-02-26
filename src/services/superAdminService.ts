import bcrypt from 'bcrypt';
import { pool } from '../config/db';
import config from '../config/env';
import * as emailService from '../utils/emailService';

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

        // Determine password and hash it
        const usePassword = password && password.length > 0 ? password : config.DEFAULT_PASSWORD;
        const hashedPassword = await bcrypt.hash(usePassword, 10);

        // Insert account with Admin role
        const [accountResult]: any = await conn.execute(
            'INSERT INTO accounts_tbl (Username, Password, Roles, IsActive) VALUES (?, ?, ?, 1)',
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
