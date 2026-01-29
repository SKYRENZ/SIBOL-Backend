import { pool } from '../config/db';
import bcrypt from 'bcrypt';
import type { ProfileUpdate } from '../models/types';

const DAYS_RESTRICTION = 15;

export async function getProfileByAccountId(accountId: number) {
  const sql = `
    SELECT
      p.*,
      a.Username,
      b.Barangay_Name,
      ar.Area_Name,
      ar.Full_Address
    FROM profile_tbl p
    JOIN accounts_tbl a ON a.Account_id = p.Account_id
    LEFT JOIN barangay_tbl b ON b.Barangay_id = p.Barangay_id
    LEFT JOIN area_tbl ar ON ar.Area_id = p.Area_id
    WHERE p.Account_id = ?
    LIMIT 1
  `;
  const [rows]: any = await pool.query(sql, [accountId]);
  return rows?.[0] || null;
}

// ✅ NEW: Get user's current points
export async function getPointsByAccountId(accountId: number) {
  const sql = `
    SELECT
      a.Account_id,
      a.Username,
      a.Points,
      COALESCE(t.Total_kg, 0) AS total_contributions
    FROM accounts_tbl a
    LEFT JOIN account_waste_totals_tbl t ON t.Account_id = a.Account_id
    WHERE a.Account_id = ?
    LIMIT 1
  `;
  const [rows]: any = await pool.query(sql, [accountId]);
  return rows?.[0] || null;
}

export async function updateProfile(accountId: number, payload: ProfileUpdate) {
  const existing = await getProfileByAccountId(accountId);
  if (!existing) throw new Error('Profile not found');

  // Check 15-day restriction if Profile_last_updated exists
  if (existing.Profile_last_updated) {
    const last = new Date(existing.Profile_last_updated);
    const now = new Date();
    const ms = now.getTime() - last.getTime();
    const days = ms / (1000 * 60 * 60 * 24);
    if (days < DAYS_RESTRICTION) {
      const retryAt = new Date(last.getTime() + DAYS_RESTRICTION * 24 * 60 * 60 * 1000).toISOString();
      const err: any = new Error(`You can update profile again after ${DAYS_RESTRICTION} days`);
      err.code = 'TOO_EARLY';
      err.retryAt = retryAt;
      throw err;
    }
  }

  // Begin update: update accounts_tbl for username/password, update profile_tbl for other fields
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (payload.username || payload.password) {
      const updates: string[] = [];
      const params: any[] = [];
      if (payload.username) {
        updates.push('Username = ?');
        params.push(payload.username);
      }
      if (payload.password) {
        const hashed = await bcrypt.hash(payload.password, 10);
        updates.push('Password = ?');
        params.push(hashed);
      }
      if (updates.length) {
        const sql = `UPDATE accounts_tbl SET ${updates.join(', ')} WHERE Account_id = ?`;
        params.push(accountId);
        await connection.query(sql, params);
      }
    }

    // profile fields
    const profileUpdates: string[] = [];
    const pParams: any[] = [];
    if (payload.firstName) { profileUpdates.push('FirstName = ?'); pParams.push(payload.firstName); }
    if (payload.lastName) { profileUpdates.push('LastName = ?'); pParams.push(payload.lastName); }
    if (typeof payload.area === 'number') { profileUpdates.push('Area_id = ?'); pParams.push(payload.area); }
    if (payload.contact) { profileUpdates.push('Contact = ?'); pParams.push(payload.contact); }
    if (payload.email) { profileUpdates.push('Email = ?'); pParams.push(payload.email); }

    // set Profile_last_updated to NOW()
    profileUpdates.push('Profile_last_updated = CURRENT_TIMESTAMP');
    const profileSql = `UPDATE profile_tbl SET ${profileUpdates.join(', ')} WHERE Account_id = ?`;
    pParams.push(accountId);
    await connection.query(profileSql, pParams);

    await connection.commit();

    // return fresh profile
    const updated = await getProfileByAccountId(accountId);
    return updated;
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}