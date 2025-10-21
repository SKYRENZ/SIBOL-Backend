import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import config from '../config/env';
import { pool } from '../config/db';
import * as authService from './authService'; // optional, if you have helper functions

const CLIENT_ID = config.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = config.GOOGLE_CLIENT_SECRET;
const BACKEND_URL = config.BACKEND_URL;
const CALLBACK_URL = `${BACKEND_URL}/api/auth/google/callback`;

console.log('GOOGLE_CLIENT_ID:', CLIENT_ID);
console.log('GOOGLE_CALLBACK:', CALLBACK_URL);

// serialize only the account id into session
passport.serializeUser((user: any, done) => {
  const id = user?.Account_id ?? user?.AccountId ?? user?.id ?? null;
  done(null, id ?? user);
});

// deserialize: fetch account row from DB by Account_id
passport.deserializeUser(async (id: any, done) => {
  try {
    if (!id) return done(null, null);
    const [rows]: any = await pool.query(
      `SELECT a.*, p.FirstName, p.LastName, p.Email AS profileEmail
       FROM accounts_tbl a
       LEFT JOIN profile_tbl p ON p.Account_id = a.Account_id
       WHERE a.Account_id = ? LIMIT 1`,
      [Number(id)]
    );
    const account = rows?.[0] ?? null;
    return done(null, account);
  } catch (err) {
    return done(err as any, null);
  }
});

// register Google strategy only when credentials exist
if (CLIENT_ID && CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: CALLBACK_URL
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const firstName = profile.name?.givenName || '';
        const lastName = profile.name?.familyName || '';

        if (!email) {
          return done(null, false, { redirectTo: 'signup', message: 'Google did not provide an email' });
        }

        // Lookup account by email in profile_tbl/accounts_tbl
        const [rows]: any = await pool.query(
          `SELECT a.*, p.FirstName, p.LastName, p.Email AS profileEmail
           FROM accounts_tbl a
           LEFT JOIN profile_tbl p ON p.Account_id = a.Account_id
           WHERE p.Email = ? OR a.Username = ? LIMIT 1`,
          [email, email.split('@')[0]]
        );
        const account = rows?.[0] ?? null;

        if (!account) {
          // no account in system -> redirect to signup (SSO signup flow)
          return done(null, false, { redirectTo: 'signup', email, firstName, lastName });
        }

        // Account exists -> allow login
        // Optional: check IsActive / Roles etc. if needed
        return done(null, account);
      } catch (err) {
        return done(err as any);
      }
    }
  ));
} else {
  console.warn('Google OAuth credentials missing; Google strategy not registered.');
}

export default passport;