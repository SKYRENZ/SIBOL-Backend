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

    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(null, false, { message: 'No email provided by Google' });
    }

    // Check for existing active user
    const [activeUser]: any = await pool.execute(
      'SELECT a.*, p.FirstName, p.LastName, p.Email FROM accounts_tbl a JOIN profile_tbl p ON a.Account_id = p.Account_id WHERE p.Email = ? AND a.IsActive = 1',
      [email]
    );

    if (activeUser.length > 0) {
      return done(null, activeUser[0]);
    }

    console.log('❌ User not found in active accounts, checking pending...');

    // Check for pending user (email verified)
    const [pendingUser]: any = await pool.execute(
      'SELECT * FROM pending_accounts_tbl WHERE Email = ? AND IsEmailVerified = 1',
      [email]
    );

    if (pendingUser.length > 0) {
      const pending = pendingUser[0];
      console.log('📋 Found in pending accounts:', {
        email: pending.Email,
        isEmailVerified: pending.IsEmailVerified,
        isAdminVerified: pending.IsAdminVerified
      });

      if (!pending.IsAdminVerified) {
        console.log('👤 Admin approval pending, redirecting to pending-approval');
        return done(null, false, { 
          message: 'admin_pending',
          email: email,
          redirectTo: 'pending-approval'
        });
      }
      // If somehow admin-verified but not moved, handle edge case (e.g., approveAccount)
    }

    // NEW: For unregistered SSO users, redirect to signup for completion (do NOT auto-register)
    const firstName = profile.name?.givenName || '';
    const lastName = profile.name?.familyName || '';
    console.log('👤 Unregistered SSO user, redirecting to signup for completion');
    return done(null, false, {
      message: 'not_registered',
      email: email,
      firstName: firstName,
      lastName: lastName,
      redirectTo: 'signup'
    });
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