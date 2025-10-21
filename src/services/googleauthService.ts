import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const BACKEND_URL = process.env.BACKEND_URL || `https://sibol-backend-i0i6.onrender.com`;
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