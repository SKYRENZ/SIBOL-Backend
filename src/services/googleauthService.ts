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
    const email = profile.emails[0].value;
    
    // Simple check: if user exists in accounts_tbl + profile_tbl, they're verified
    const [userRows]: any = await pool.execute(`
      SELECT a.Account_id, a.Username, a.Roles, p.FirstName, p.LastName, p.Email 
      FROM accounts_tbl a 
      JOIN profile_tbl p ON a.Account_id = p.Account_id 
      WHERE p.Email = ? AND a.IsActive = 1
    `, [email]);

    if (userRows.length === 0) {
      return done(null, false, { message: 'Email not registered or not yet approved in system' });
    }

    const user = userRows[0];
    
    // If we reach here, user is already verified (email + admin)
    // because they exist in the main tables
    return done(null, user);
    
  } catch (error) {
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