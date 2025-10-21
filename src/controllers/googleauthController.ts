import { Request, Response, NextFunction } from 'express';
import passport from '../services/googleauthService';
import config from '../config/env.js';

export async function googleAuthInit(req: Request, res: Response, next: NextFunction) {
  // passport returns middleware; just invoke it
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
}

export async function googleAuthCallback(req: Request, res: Response, next: NextFunction) {
  return passport.authenticate('google', (err: any, user: any, info: any) => {
    if (err) {
      console.error('Passport error:', err);
      return res.redirect(`${config.FRONT_END_PORT}/login?error=server_error`);
    }

    if (user) {
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.redirect(`${config.FRONT_END_PORT}/login?error=login_failed`);
        }
        const userDataString = encodeURIComponent(JSON.stringify({
          Account_id: user.Account_id,
          Username: user.Username,
          Roles: user.Roles,
          FirstName: user.FirstName,
          LastName: user.LastName,
          Email: user.Email
        }));
        return res.redirect(`${config.FRONT_END_PORT}/dashboard?user=${userDataString}&auth=success`);
      });
    } else if (info && typeof info === 'object') {
      const { message, email, redirectTo } = info;
      switch (redirectTo) {
        case 'signup':
          return res.redirect(`http://localhost:5173/signup?email=${encodeURIComponent(email || '')}&sso=google`);
        case 'verify-email':
          return res.redirect(`http://localhost:5173/verify-email?email=${encodeURIComponent(email || '')}`);
        case 'pending-approval':
          return res.redirect(`http://localhost:5173/pending-approval?email=${encodeURIComponent(email || '')}`);
        default:
          return res.redirect(`http://localhost:5173/login?error=auth_failed&message=${encodeURIComponent(message || 'Authentication failed')}`);
      }
    } else {
      return res.redirect(`http://localhost:5173/login?error=auth_failed&message=${encodeURIComponent('Google authentication failed')}`);
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
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    return res.json({ success: true, message: 'Logged out successfully' });
  });
}