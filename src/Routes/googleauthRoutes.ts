import { Router, Request, Response } from 'express';
import config from '../config/env.js';
import passport from '../services/googleauthService';
import * as jwt from 'jsonwebtoken';
import type { NextFunction } from 'express';

const SECRET = config.JWT_SECRET as jwt.Secret;
const TOKEN_TTL = config.JWT_TTL || '8h';

const router = Router();

// Initiate Google OAuth
router.get('/google', (req: Request, res: Response, next: NextFunction) => {
  const callback = `${config.BACKEND_URL}/api/auth/google/callback`;
  console.log('Starting Google OAuth. Strategy callback configured as:', callback);

  // Preview URL for debugging
  const authUrlPreview = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrlPreview.searchParams.set('client_id', config.GOOGLE_CLIENT_ID || '');
  authUrlPreview.searchParams.set('redirect_uri', callback);
  authUrlPreview.searchParams.set('response_type', 'code');
  authUrlPreview.searchParams.set('scope', 'profile email');
  console.log('Google auth URL preview (compare redirect_uri):', authUrlPreview.toString());

  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// Callback: use config.FRONT_END_PORT for redirects and SECRET/TOKEN_TTL for token
router.get('/google/callback', (req: Request, res: Response, next) => {
  passport.authenticate('google', (err: any, user: any, info: any) => {
    if (err) {
      return res.redirect(`${config.FRONT_END_PORT}/login?auth=fail&error=${encodeURIComponent(err.message)}`);
    }

    if (!user) {
      if (info && info.redirectTo) {
        if (info.redirectTo === 'signup') {
          const params = new URLSearchParams({
            sso: 'google',
            email: info.email || '',
            firstName: info.firstName || '',
            lastName: info.lastName || '',
            message: info.message || 'Complete your registration to continue with Google Sign-In'
          });
          return res.redirect(`${config.FRONT_END_PORT}/signup?${params.toString()}`);
        }
        if (info.redirectTo === 'verify-email') {
          return res.redirect(`${config.FRONT_END_PORT}/verify-email?email=${encodeURIComponent(info.email || '')}&message=Please verify your email first`);
        }
        if (info.redirectTo === 'pending-approval') {
          return res.redirect(`${config.FRONT_END_PORT}/pending-approval?email=${encodeURIComponent(info.email || '')}&message=Your account is pending admin approval`);
        }
        return res.redirect(`${config.FRONT_END_PORT}/login?error=auth_failed&message=${encodeURIComponent(info.message || 'Authentication failed')}`);
      }
      return res.redirect(`${config.FRONT_END_PORT}/login?auth=fail`);
    }

    const token = jwt.sign(
      { Account_id: user.Account_id, Username: user.Username, Roles: user.Roles },
      SECRET,
      { expiresIn: TOKEN_TTL } as jwt.SignOptions
    );

    const userDataString = encodeURIComponent(JSON.stringify({
      Account_id: user.Account_id, Username: user.Username, Roles: user.Roles, Email: user.Email
    }));

    return res.redirect(`${config.FRONT_END_PORT}/dashboard?token=${encodeURIComponent(token)}&user=${userDataString}&auth=success`);
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