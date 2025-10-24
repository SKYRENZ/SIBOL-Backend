import { Request, Response, NextFunction } from 'express';
import passport from '../services/googleauthService';
import config from '../config/env.js';

const RAW_FRONTEND = (config.FRONT_END_PORT ?? '').trim();
const FRONTEND_BASE = (RAW_FRONTEND && RAW_FRONTEND !== '/' ? RAW_FRONTEND.replace(/\/+$/, '') : 'http://localhost:5173');

function buildFrontendUrl(path: string, params?: Record<string, string>) {
  try {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(cleanPath, FRONTEND_BASE);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    return url.toString();
  } catch {
    // fallback
    const cleanPath = (`/${path}`).replace(/\/+/g, '/');
    const qp = params ? `?${new URLSearchParams(params).toString()}` : '';
    return `${FRONTEND_BASE}${cleanPath}${qp}`;
  }
}

export async function googleAuthInit(req: Request, res: Response, next: NextFunction) {
  // invoke passport middleware
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
}

// use the helper for redirects
export async function googleAuthCallback(req: Request, res: Response, next: NextFunction) {
  return passport.authenticate('google', (err: any, user: any, info: any) => {
    if (err) {
      console.error('Passport error:', err);
      return res.redirect(buildFrontendUrl('/login', { error: 'server_error' }));
    }

    if (user) {
      req.logIn(user, (loginErr: any) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.redirect(buildFrontendUrl('/login', { error: 'login_failed' }));
        }
        const userDataString = encodeURIComponent(JSON.stringify({
          Account_id: user.Account_id,
          Username: user.Username,
          Roles: user.Roles,
          FirstName: user.FirstName,
          LastName: user.LastName,
          Email: user.Email
        }));
        return res.redirect(buildFrontendUrl('/dashboard', { user: userDataString, auth: 'success' }));
      });
    } else if (info && typeof info === 'object') {
      const { message, email, redirectTo, firstName, lastName } = info as any;
      switch (redirectTo) {
        case 'signup': {
          return res.redirect(buildFrontendUrl('/signup', {
            sso: 'google',
            email: email || '',
            firstName: firstName || '',
            lastName: lastName || '',
            message: message || 'Complete your registration to continue with Google Sign-In'
          }));
        }
        case 'verify-email':
          return res.redirect(buildFrontendUrl('/email-verification', { email: email || '', message: message || '' }));
        case 'pending-approval':
          return res.redirect(buildFrontendUrl('/pending-approval', { email: email || '', message: message || '' }));
        default:
          return res.redirect(buildFrontendUrl('/login', { error: 'auth_failed', message: message || 'Authentication failed' }));
      }
    } else {
      return res.redirect(buildFrontendUrl('/login', { error: 'auth_failed', message: 'Google authentication failed' }));
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