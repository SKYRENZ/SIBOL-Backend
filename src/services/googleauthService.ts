import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import config from '../config/env.js';  // Add this import

const CLIENT_ID = config.GOOGLE_CLIENT_ID;  // Use config.GOOGLE_CLIENT_ID
const CLIENT_SECRET = config.GOOGLE_CLIENT_SECRET;  // Use config.GOOGLE_CLIENT_SECRET
const BACKEND_URL = config.BACKEND_URL;  // Use config.BACKEND_URL
const CALLBACK_URL = `${BACKEND_URL}/api/auth/google/callback`;

console.log('GOOGLE_CLIENT_ID:', CLIENT_ID);
console.log('GOOGLE_CALLBACK:', CALLBACK_URL);

// Simple serialize/deserialize (adjust to your user shape)
passport.serializeUser((user: any, done) => done(null, user));
passport.deserializeUser((obj: any, done) => done(null, obj));

// Only register strategy if credentials exist
if (CLIENT_ID && CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // adapt: find or create user in DB here and return user object
      const user = {
        id: profile.id,
        displayName: profile.displayName,
        emails: profile.emails
      };
      return done(null, user);
    } catch (err) {
      return done(err as any, undefined);
    }
  }));
} else {
  console.warn('Google OAuth credentials missing; Google strategy not registered.');
}

export default passport;