import { OAuth2Client } from 'google-auth-library';
import config from '../config/env';
import { pool } from '../config/db';

const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

export async function verifyIdTokenAndFindUser(idToken: string) {
  if (!idToken) throw new Error('idToken required');

  const audiences = [config.GOOGLE_CLIENT_ID];
  if (process.env.GOOGLE_ANDROID_CLIENT_ID) audiences.push(process.env.GOOGLE_ANDROID_CLIENT_ID);

  const ticket = await client.verifyIdToken({ idToken, audience: audiences });
  const payload = ticket.getPayload();
  const email = payload?.email;
  if (!email) throw new Error('No email in token');

  const [rows]: any = await pool.execute(
    `SELECT a.Account_id, a.Username, a.Roles, p.Email
     FROM accounts_tbl a
     LEFT JOIN profile_tbl p ON p.Account_id = a.Account_id
     WHERE p.Email = ? LIMIT 1`,
    [email]
  );

  const account = rows?.[0] ?? null;
  return { account, payload };
}

export default { verifyIdTokenAndFindUser };