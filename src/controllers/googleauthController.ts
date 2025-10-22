import { Request, Response, NextFunction } from 'express';
import passport from '../services/googleauthService';
import config from '../config/env.js';

const FRONTEND = config.FRONT_END_PORT || 'http://localhost:5173';

export async function googleAuthInit(req: Request, res: Response, next: NextFunction) {
  // invoke passport middleware
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
}

export async function googleAuthCallback(req: Request, res: Response, next: NextFunction) {
  return passport.authenticate('google', (err: any, user: any, info: any) => {
    if (err) {
      console.error('Passport error:', err);
      return res.redirect(`${FRONTEND}/login?error=server_error`);
    }

    if (user) {
      // login user into session then redirect with encoded user
      req.logIn(user, (loginErr: any) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.redirect(`${FRONTEND}/login?error=login_failed`);
        }
        const userDataString = encodeURIComponent(JSON.stringify({
          Account_id: user.Account_id,
          Username: user.Username,
          Roles: user.Roles,
          FirstName: user.FirstName,
          LastName: user.LastName,
          Email: user.Email
        }));
        return res.redirect(`${FRONTEND}/dashboard?user=${userDataString}&auth=success`);
      });
    } else if (info && typeof info === 'object') {
      const { message, email, redirectTo, firstName, lastName } = info as any;
      switch (redirectTo) {
        case 'signup': {
          const params = new URLSearchParams({
            sso: 'google',
            email: email || '',
            firstName: firstName || '',
            lastName: lastName || '',
            message: message || 'Complete your registration to continue with Google Sign-In'
          });
          return res.redirect(`${FRONTEND}/signup?${params.toString()}`);
        }
        case 'verify-email':
          return res.redirect(`${FRONTEND}/verify-email?email=${encodeURIComponent(email || '')}&message=${encodeURIComponent(message || '')}`);
        case 'pending-approval':
          return res.redirect(`${FRONTEND}/pending-approval?email=${encodeURIComponent(email || '')}&message=${encodeURIComponent(message || '')}`);
        default:
          return res.redirect(`${FRONTEND}/login?error=auth_failed&message=${encodeURIComponent(message || 'Authentication failed')}`);
      }
    } else {
      return res.redirect(`${FRONTEND}/login?error=auth_failed&message=${encodeURIComponent('Google authentication failed')}`);
    }
  })(req, res, next);
}

export async function getMe(req: Request, res: Response) {
  if (req.user) {
    return res.json({ success: true, user: req.user });
  }
  return res.status(401).json({ success: false, message: 'Not authenticated' });
}

export async function logout(req: Request, res: Response) {
  req.logout((err: any) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    return res.json({ success: true, message: 'Logged out successfully' });
  });
}