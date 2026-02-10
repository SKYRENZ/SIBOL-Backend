import { pool } from '../config/db';
import bcrypt from 'bcrypt';
import type { ProfileUpdate } from '../models/types';

// ✅ Dedicated day restrictions (edit these independently)
const USERNAME_DAYS_RESTRICTION = 15;
const PASSWORD_DAYS_RESTRICTION = 15;
const PROFILEINFO_DAYS_RESTRICTION = 15;

type RestrictionKind = 'USERNAME' | 'PASSWORD' | 'PROFILE';

function daysSince(dateLike: any) {
  const d = dateLike ? new Date(dateLike) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function tooEarly(kind: RestrictionKind, daysRestriction: number, lastUpdated: any) {
  const last = new Date(lastUpdated);
  const retryAt = new Date(last.getTime() + daysRestriction * 24 * 60 * 60 * 1000).toISOString();
  const err: any = new Error(`You can update ${kind.toLowerCase()} again after ${daysRestriction} days`);
  err.code = 'TOO_EARLY';
  err.kind = kind;
  err.retryAt = retryAt;
  return err;
}

export async function getProfileByAccountId(accountId: number) {
  const sql = `
    SELECT
      p.*,
      -- provide a stable key for the frontend: Image_path (alias for Profile_image_path)
      p.Profile_image_path AS Image_path,
      a.Username,
      a.Username_last_updated,
      a.Password_last_updated,
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

  const wantsUsername = Boolean(payload?.username && String(payload.username).trim() !== '');
  const wantsPassword = Boolean(payload?.password && String(payload.password).trim() !== '');

  const wantsProfileInfo =
    payload?.firstName ||
    payload?.lastName ||
    payload?.contact ||
    payload?.email ||
    typeof (payload as any)?.area === 'number';

  if (!wantsUsername && !wantsPassword && !wantsProfileInfo) {
    throw new Error('No changes provided');
  }

  // ✅ Separate restriction checks
  if (wantsUsername && existing.Username_last_updated) {
    const d = daysSince(existing.Username_last_updated);
    if (d !== null && d < USERNAME_DAYS_RESTRICTION) {
      throw tooEarly('USERNAME', USERNAME_DAYS_RESTRICTION, existing.Username_last_updated);
    }
  }

  if (wantsPassword && existing.Password_last_updated) {
    const d = daysSince(existing.Password_last_updated);
    if (d !== null && d < PASSWORD_DAYS_RESTRICTION) {
      throw tooEarly('PASSWORD', PASSWORD_DAYS_RESTRICTION, existing.Password_last_updated);
    }
  }

  if (wantsProfileInfo && existing.Profile_last_updated) {
    const d = daysSince(existing.Profile_last_updated);
    if (d !== null && d < PROFILEINFO_DAYS_RESTRICTION) {
      throw tooEarly('PROFILE', PROFILEINFO_DAYS_RESTRICTION, existing.Profile_last_updated);
    }
  }

  // Begin update
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // accounts_tbl (username/password + their own timestamps)
    if (wantsUsername || wantsPassword) {
      const updates: string[] = [];
      const params: any[] = [];

      if (wantsUsername) {
        updates.push('Username = ?');
        params.push(payload.username);
        updates.push('Username_last_updated = CURRENT_TIMESTAMP');
      }

      if (wantsPassword) {
        const hashed = await bcrypt.hash(String(payload.password), 10);
        updates.push('Password = ?');
        params.push(hashed);
        updates.push('Password_last_updated = CURRENT_TIMESTAMP');
      }

      const sql = `UPDATE accounts_tbl SET ${updates.join(', ')} WHERE Account_id = ?`;
      params.push(accountId);
      await connection.query(sql, params);
    }

    // profile_tbl (profile info + Profile_last_updated ONLY when profile fields changed)
    if (wantsProfileInfo) {
      const profileUpdates: string[] = [];
      const pParams: any[] = [];

      if (payload.firstName) { profileUpdates.push('FirstName = ?'); pParams.push(payload.firstName); }
      if (payload.lastName) { profileUpdates.push('LastName = ?'); pParams.push(payload.lastName); }
      if (typeof (payload as any).area === 'number') { profileUpdates.push('Area_id = ?'); pParams.push((payload as any).area); }
      if (payload.contact) { profileUpdates.push('Contact = ?'); pParams.push(payload.contact); }
      if (payload.email) { profileUpdates.push('Email = ?'); pParams.push(payload.email); }

      profileUpdates.push('Profile_last_updated = CURRENT_TIMESTAMP');

      const profileSql = `UPDATE profile_tbl SET ${profileUpdates.join(', ')} WHERE Account_id = ?`;
      pParams.push(accountId);
      await connection.query(profileSql, pParams);
    }

    await connection.commit();

    const updated = await getProfileByAccountId(accountId);
    return updated;
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}

export async function updateProfileImage(accountId: number, imagePath: string | null, publicId: string | null) {
  const existing = await getProfileByAccountId(accountId);
  if (!existing) throw new Error('Profile not found');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // This database schema uses `Profile_image_path` for the avatar URL.
    // Update that column and the Profile_last_updated timestamp.
    const sql = `UPDATE profile_tbl SET Profile_image_path = ?, Profile_last_updated = CURRENT_TIMESTAMP WHERE Account_id = ?`;
    await connection.query(sql, [imagePath, accountId]);

    // NOTE: We currently do not persist Cloudinary public_id because the schema
    // provided uses `Profile_image_path` only. If you add a column for public_id,
    // we can store it here as well.

    await connection.commit();

    const updated = await getProfileByAccountId(accountId);
    return updated;
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}