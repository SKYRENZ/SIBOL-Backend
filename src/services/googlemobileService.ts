import config from '../config/env';
import { OAuth2Client } from 'google-auth-library';
import pool from '../config/db';
import jwt from 'jsonwebtoken';

const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

/**
 * Verify the idToken with Google, then find the account in DB.
 * Returns:
 *  - { status: 'success', token, user }            -> account exists & approved
 *  - { status: 'pending', email }                  -> account exists but not approved
 *  - { status: 'signup', email, firstName, lastName } -> no account found
 */
export async function verifyIdTokenAndFindUser(idToken: string) {
  if (!idToken) throw new Error('idToken required');

  // verify id token with google
  const ticket = await client.verifyIdToken({
    idToken,
    audience: config.GOOGLE_CLIENT_ID,
  });
  // ticket.getPayload() has weak typing in google-auth-library — cast to any for property access
  const payload = (ticket.getPayload() || {}) as any;
  const email = (payload.email || '').toLowerCase();
  const firstName = payload.given_name || payload?.givenName || '';
  const lastName = payload.family_name || payload?.familyName || '';
  const sub = payload.sub || payload?.sub;

  if (!email) {
    throw new Error('Google token did not contain an email');
  }

  // FIRST: check pending_accounts_tbl for this email (mirror web flow)
  try {
    const [pendingRows]: any = await pool.query(
      `SELECT * FROM pending_accounts_tbl WHERE LOWER(Email) = ? LIMIT 1`,
      [email]
    );
    if (pendingRows && pendingRows.length > 0) {
      const pending = pendingRows[0];
      const isEmailVerified = !!Number(pending.IsEmailVerified);
      const isAdminVerified = !!Number(pending.IsAdminVerified);

      // Not email-verified yet -> require email verification
      if (!isEmailVerified) {
        return { status: 'verify', email, firstName, lastName, sub };
      }

      // Email verified but admin approval pending -> pending
      if (!isAdminVerified) {
        return { status: 'pending', email, firstName, lastName, sub };
      }
      // If pending record exists and is fully approved, fall through to account lookup
    }
  } catch (err) {
    // warn and continue — fallback to account lookup
    console.warn('googleMobileService: pending lookup failed', err);
  }

  // find account by profile email
  const [rows]: any = await pool.query(
    `SELECT a.*, p.FirstName, p.LastName, p.Email AS profileEmail
     FROM accounts_tbl a
     LEFT JOIN profile_tbl p ON p.Account_id = a.Account_id
     WHERE LOWER(p.Email) = ? LIMIT 1`,
    [email]
  );

  const account = rows?.[0] ?? null;

  if (!account) {
    // Not registered -> prompt signup
    return { status: 'signup', email, firstName, lastName, sub };
  }

  // Determine "approved" flag heuristically (cover common column names)
  const isApproved =
    // explicit columns
    (typeof account.IsApproved !== 'undefined' ? Boolean(account.IsApproved) :
    (typeof account.Approved !== 'undefined' ? Boolean(account.Approved) :
    (typeof account.Active !== 'undefined' ? Boolean(account.Active) :
    // fallback: if Roles exists and > 0 assume approved
    (typeof account.Roles !== 'undefined' ? Number(account.Roles) > 0 : true))));

  if (!isApproved) {
    return { status: 'pending', email };
  }

  // Build JWT and user payload
  const payloadJwt: any = {
    Account_id: account.Account_id ?? account.AccountId ?? account.id,
    Roles: account.Roles ?? account.role ?? 0,
  };
  // jwt.sign typing expects jwt.Secret; ensure we pass a string and cast as jwt.Secret
  const secretStr = String(config.JWT_SECRET ?? 'changeme');
  const token = jwt.sign(payloadJwt, secretStr as jwt.Secret, { expiresIn: config.JWT_TTL ?? '7d' } as jwt.SignOptions);

  const userSafe = {
    Account_id: account.Account_id,
    Username: account.Username,
    Roles: account.Roles,
    FirstName: account.FirstName,
    LastName: account.LastName,
    Email: account.profileEmail ?? email,
  };

  return { status: 'success', token, user: userSafe };
}

export default { verifyIdTokenAndFindUser };