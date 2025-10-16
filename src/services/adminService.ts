import { pool } from '../config/db';
import * as authService from './authService';

// create user via existing registerUser (keeps creation logic centralized)
export async function createUserAsAdmin(firstName: string, lastName: string, areaId: number, contact: string, email: string, roleId: number) {
  return authService.registerUser(firstName, lastName, areaId, contact, email, roleId);
}

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