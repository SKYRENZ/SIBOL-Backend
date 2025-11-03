import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import config from '../config/env';
import { pool } from '../config/db';
import * as authService from './authService';

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
       LEFT JOIN profile_tbl p ON p.Account_id = p.Account_id
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
          return done(null, false, { 
            redirectTo: 'signup', 
            message: 'no_email', 
            email: '', 
            firstName, 
            lastName 
          });
        }

        console.log('🔍 Google SSO - Checking for email:', email);

        // 1) Check pending accounts first
        const [pendingRows]: any = await pool.query(
          `SELECT * FROM pending_accounts_tbl WHERE Email = ? LIMIT 1`,
          [email]
        );

        if (pendingRows && pendingRows.length > 0) {
          const pending = pendingRows[0];
          console.log('📋 Found in pending_accounts_tbl:', {
            email: pending.Email,
            username: pending.Username,
            isEmailVerified: pending.IsEmailVerified,
            isAdminVerified: pending.IsAdminVerified
          });
          
          // Email not yet verified
          if (!pending.IsEmailVerified || Number(pending.IsEmailVerified) === 0) {
            console.log('📧 Email not verified - redirecting to verify-email');
            return done(null, false, { 
              message: 'email_pending', 
              email, 
              username: pending.Username,
              redirectTo: 'verify-email' 
            });
          }
          
          // Email verified but admin approval pending
          if (!pending.IsAdminVerified || Number(pending.IsAdminVerified) === 0) {
            console.log('⏳ Admin approval pending - redirecting to pending-approval');
            return done(null, false, { 
              message: 'admin_pending', 
              email, 
              username: pending.Username,
              redirectTo: 'pending-approval'
            });
          }
          
          console.log('✅ Both verified in pending table, checking accounts_tbl...');
        }

        // 2) Lookup active account by email (profile table)
        const [rows]: any = await pool.query(
          `SELECT a.*, p.FirstName, p.LastName, p.Email AS Email
           FROM accounts_tbl a
           LEFT JOIN profile_tbl p ON p.Account_id = a.Account_id
           WHERE p.Email = ? LIMIT 1`,
          [email]
        );
        const account = rows?.[0] ?? null;

        if (!account) {
          console.log('❌ No account found - redirecting to signup');
          return done(null, false, { 
            message: 'not_registered', 
            redirectTo: 'signup', 
            email, 
            firstName, 
            lastName 
          });
        }

        console.log('👤 Account found:', {
          accountId: account.Account_id,
          username: account.Username,
          isActive: account.IsActive
        });

        // Check if account is active
        const isActiveFlag = Number(account.IsActive ?? account.is_active ?? 0);
        if (isNaN(isActiveFlag) || isActiveFlag === 0) {
          console.log('⏳ Account inactive - redirecting to pending-approval');
          return done(null, false, { 
            message: 'admin_pending', 
            email,
            username: account.Username,
            redirectTo: 'pending-approval'
          });
        }

        // Account exists and is active -> allow login
        console.log('✅ Account active - allowing login');
        return done(null, account);
      } catch (err) {
        console.error('❌ Google auth error:', err);
        return done(err as any);
      }
    }
  ));
} else {
  console.warn('Google OAuth credentials missing; Google strategy not registered.');
}

export default passport;