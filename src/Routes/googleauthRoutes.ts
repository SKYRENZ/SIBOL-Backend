import { Router, Request, Response } from 'express';
import passport from '../services/googleauthService';
import * as jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET as jwt.Secret;
const TOKEN_TTL = process.env.JWT_TTL || '8h';

const router = Router();

// Initiate Google OAuth
router.get('/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback with custom handling
router.get('/google/callback', (req: Request, res: Response, next) => {
  passport.authenticate('google', (err: any, user: any, info: any) => {
    if (err) {
      return res.redirect(`${process.env.FRONT_END_PORT || 'http://localhost:5173'}/login?auth=fail&error=${encodeURIComponent(err.message)}`);
    }

    if (!user) {
      if (info && info.redirectTo) {
        if (info.redirectTo === 'signup') {
          // Redirect to signup with pre-filled SSO params (from main, with logging from HEAD)
          const params = new URLSearchParams({
            sso: 'google',
            email: info.email || '',
            firstName: info.firstName || '',
            lastName: info.lastName || '',
            message: info.message || 'Complete your registration to continue with Google Sign-In'
          });
          console.log('➡️ Redirecting to signup:', params.toString());  // Added logging from HEAD
          return res.redirect(`${process.env.FRONT_END_PORT || 'http://localhost:5173'}/signup?${params.toString()}`);
        } else if (info.redirectTo === 'verify-email') {
          // Added from HEAD: Handle verify-email case
          console.log('➡️ Redirecting to verify-email');
          return res.redirect(`${process.env.FRONT_END_PORT || 'http://localhost:5173'}/verify-email?email=${encodeURIComponent(info.email || '')}&message=Please verify your email first`);
        } else if (info.redirectTo === 'admin-pending') {
          // Added from HEAD: Handle admin-pending case (renamed to match main's 'pending-approval')
          console.log('➡️ Redirecting to pending-approval');
          return res.redirect(`${process.env.FRONT_END_PORT || 'http://localhost:5173'}/pending-approval?email=${encodeURIComponent(info.email || '')}&message=Your account is pending admin approval`);
        } else if (info.redirectTo === 'pending-approval') {
          // From main: Keep as-is for compatibility
          return res.redirect(`${process.env.FRONT_END_PORT || 'http://localhost:5173'}/pending-approval?email=${encodeURIComponent(info.email)}`);
        } else {
          // Added from HEAD: Default case with logging
          console.log('➡️ Redirecting to login with error message:', info.message || 'Authentication failed');
          return res.redirect(`${process.env.FRONT_END_PORT || 'http://localhost:5173'}/login?error=auth_failed&message=${encodeURIComponent(info.message || 'Authentication failed')}`);
        }
      }
      return res.redirect(`${process.env.FRONT_END_PORT || 'http://localhost:5173'}/login?auth=fail`);
    }

    // Sign token for successful login (unchanged)
    const token = jwt.sign(
      { Account_id: user.Account_id, Username: user.Username, Roles: user.Roles },
      SECRET,
      { expiresIn: TOKEN_TTL } as jwt.SignOptions
    );

    const userDataString = encodeURIComponent(JSON.stringify({
      Account_id: user.Account_id, Username: user.Username, Roles: user.Roles, Email: user.Email
    }));

    return res.redirect(`${process.env.FRONT_END_PORT || 'http://localhost:5173'}/dashboard?token=${encodeURIComponent(token)}&user=${userDataString}&auth=success`);
  })(req, res, next);
});

// API endpoint to get current user session
router.get('/me', (req: Request, res: Response) => {
  if (req.user) {
    res.json({ success: true, user: req.user });
  } else {
    res.status(401).json({ success: false, message: 'Not authenticated' });
  }
});

// Logout endpoint
router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

export default router;