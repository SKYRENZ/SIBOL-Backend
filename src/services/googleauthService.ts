import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { pool } from '../config/db';

interface GoogleProfile {
  id: string;
  emails: Array<{ value: string; verified: boolean }>;
  displayName: string;
  name: { givenName: string; familyName: string };
}

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: "/api/auth/google/callback"
}, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    console.log('🔍 Google OAuth profile received:', {
      id: profile.id,
      email: profile.emails?.[0]?.value,
      displayName: profile.displayName,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName
    });

    const email = profile.emails[0].value;
    
    // Check if user exists in active accounts (accounts_tbl + profile_tbl)
    const [userRows]: any = await pool.execute(`
      SELECT a.Account_id, a.Username, a.Roles, p.FirstName, p.LastName, p.Email 
      FROM accounts_tbl a 
      JOIN profile_tbl p ON a.Account_id = p.Account_id 
      WHERE p.Email = ? AND a.IsActive = 1
    `, [email]);

    if (userRows.length > 0) {
      // User exists and is active - allow login
      const user = userRows[0];
      console.log('✅ User found and active:', user.Email);
      return done(null, user);
    }

    console.log('❌ User not found in active accounts, checking pending...');

    // Check if user exists in pending accounts
    const [pendingRows]: any = await pool.execute(`
      SELECT * FROM pending_accounts_tbl WHERE Email = ?
    `, [email]);

    if (pendingRows.length > 0) {
      const pending = pendingRows[0];
      console.log('📋 Found in pending accounts:', {
        email: pending.Email,
        isEmailVerified: pending.IsEmailVerified,
        isAdminVerified: pending.IsAdminVerified
      });

      if (!pending.IsEmailVerified) {
        console.log('📧 Email not verified, redirecting to verify-email');
        return done(null, false, { 
          message: 'email_pending',
          email: email,
          redirectTo: 'verify-email'
        });
      }
      if (!pending.IsAdminVerified) {
        console.log('👤 Admin approval pending, redirecting to pending-approval');
        return done(null, false, { 
          message: 'admin_pending',
          email: email,
          redirectTo: 'pending-approval'
        });
      }
    }

    // User doesn't exist at all - redirect to signup
    console.log('🔄 User not registered, redirecting to signup');
    const authInfo = { 
      message: 'not_registered',
      email: email,
      firstName: profile.name?.givenName || '',
      lastName: profile.name?.familyName || '',
      redirectTo: 'signup'
    };
    
    console.log('📤 Sending authInfo:', authInfo);
    return done(null, false, authInfo);
    
  } catch (error) {
    console.error('❌ Google OAuth error:', error);
    return done(error, null);
  }
}));

passport.serializeUser((user: any, done: any) => {
  done(null, user.Account_id);
});

passport.deserializeUser(async (id: number, done: any) => {
  try {
    const [rows]: any = await pool.execute(
      'SELECT Account_id, Username, Roles FROM accounts_tbl WHERE Account_id = ?',
      [id]
    );
    done(null, rows[0] || null);
  } catch (error) {
    done(error, null);
  }
});

export default passport;