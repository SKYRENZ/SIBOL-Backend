import config from '../config/env';
import { OAuth2Client } from 'google-auth-library';
import pool from '../config/db';
import jwt from 'jsonwebtoken';

const GOOGLE_ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID || '';
const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const androidClient = new OAuth2Client(GOOGLE_ANDROID_CLIENT_ID);
const webClient = new OAuth2Client(GOOGLE_WEB_CLIENT_ID);

/**
 * Verify Google ID token and return payload
 */
export async function verifyGoogleIdToken(idToken: string) {
  // Try Android client first, then web client
  let ticket;
  try {
    ticket = await androidClient.verifyIdToken({
      idToken,
      audience: GOOGLE_ANDROID_CLIENT_ID,
    });
    console.log('[GoogleMobile Service] Verified with Android client');
  } catch (err) {
    console.log('[GoogleMobile Service] Android client failed, trying web client...');
    ticket = await webClient.verifyIdToken({
      idToken,
      audience: GOOGLE_WEB_CLIENT_ID,
    });
    console.log('[GoogleMobile Service] Verified with Web client');
  }

  const payload = ticket.getPayload();
  
  if (!payload || !payload.email) {
    throw new Error('Invalid token payload - no email found');
  }

  return {
    email: payload.email,
    firstName: payload.given_name || '',
    lastName: payload.family_name || '',
    picture: payload.picture,
    sub: payload.sub,
  };
}

/**
 * Find user account by email in active accounts
 */
export async function findUserByEmail(email: string) {
  const [rows]: any = await pool.query(
    `SELECT a.*, p.FirstName, p.LastName, p.Email 
     FROM accounts_tbl a
     JOIN profile_tbl p ON a.Account_id = p.Account_id
     WHERE LOWER(p.Email) = LOWER(?)
     LIMIT 1`,
    [email]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * NEW: Check if email exists in pending accounts
 */
export async function findPendingAccountByEmail(email: string) {
  const [rows]: any = await pool.query(
    `SELECT * FROM pending_accounts_tbl 
     WHERE LOWER(Email) = LOWER(?)
     LIMIT 1`,
    [email]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Check if user account is active/approved
 */
export function isAccountActive(user: any): boolean {
  // Check IsActive column (your DB uses this)
  return user.IsActive === 1 || user.IsActive === true;
}

/**
 * Generate JWT token for user
 */
export function generateUserToken(user: any): string {
  const token = jwt.sign(
    {
      Account_id: user.Account_id,
      Roles: user.Roles,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return token;
}

/**
 * Map user role ID to role name
 */
export function mapRoleName(roleId: number): string {
  // Based on your DB schema
  if (roleId === 1) return 'admin';
  if (roleId === 3) return 'operator';
  return 'user'; // default fallback
}

/**
 * Format user data for response
 */
export function formatUserResponse(user: any) {
  return {
    id: user.Account_id,
    email: user.Email,
    firstName: user.FirstName,
    lastName: user.LastName,
    role: mapRoleName(user.Roles),
  };
}

/**
 * Exchange Google authorization code for ID token
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const oauth2Client = new OAuth2Client(
    GOOGLE_ANDROID_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'postmessage' // Special redirect URI for mobile apps
  );

  const { tokens } = await oauth2Client.getToken(code);
  
  if (!tokens.id_token) {
    throw new Error('No ID token received from Google');
  }

  return tokens.id_token;
}

export default {
  verifyGoogleIdToken,
  findUserByEmail,
  findPendingAccountByEmail, // ADD THIS
  isAccountActive,
  generateUserToken,
  mapRoleName,
  formatUserResponse,
  exchangeCodeForToken,
};