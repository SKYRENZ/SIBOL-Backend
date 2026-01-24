import { Request, Response, NextFunction } from 'express';
import passport from '../services/googleauthService';
import config from '../config/env';
import jwt from 'jsonwebtoken';

console.log('FRONT_END_PORT at startup:', config.FRONT_END_PORT);

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
    const cleanPath = (`/${path}`).replace(/\/+/g, '/');
    const qp = params ? `?${new URLSearchParams(params).toString()}` : '';
    return `${FRONTEND_BASE}${cleanPath}${qp}`;
  }
}

export async function googleAuthInit(req: Request, res: Response, next: NextFunction) {
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
}

function getRoleNumber(user: any): number | null {
  const role =
    user?.Roles ??
    user?.roleId ??
    user?.role ??
    user?.Roles_id ??
    user?.RolesId ??
    null;

  const roleNum = typeof role === 'string' ? Number(role) : role;
  return Number.isFinite(roleNum) ? roleNum : null;
}

export async function googleAuthCallback(req: Request, res: Response, next: NextFunction) {
  return passport.authenticate('google', (err: any, user: any, info: any) => {
    if (err) {
      console.error('Passport error:', err);
      return res.redirect(buildFrontendUrl('/auth/callback', {
        error: 'server_error',
        auth: 'fail'
      }));
    }

    if (user) {
      req.logIn(user, (loginErr: any) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.redirect(buildFrontendUrl('/auth/callback', {
            error: 'login_failed',
            auth: 'fail'
          }));
        }

        try {
          // ✅ Enforce WEB-only roles BEFORE issuing cookie/token
          const roleNum = getRoleNumber(user);
          const WEB_ALLOWED = new Set([1, 2]); // Admin + Barangay (your rule)

          if (roleNum === null || !WEB_ALLOWED.has(roleNum)) {
            // ensure no auth cookie is left behind
            res.clearCookie('token', {
              httpOnly: true,
              secure: config.NODE_ENV === 'production',
              sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
              path: '/'
            });

            return res.redirect(buildFrontendUrl('/auth/callback', {
              auth: 'fail',
              error: 'platform_not_allowed',
              message: 'Your account does not have access to this platform.'
            }));
          }

          const secret = config.JWT_SECRET || 'changeme';
          const payload: any = {
            Account_id: user.Account_id ?? user.AccountId ?? user.id,
            Roles: user.Roles ?? user.role ?? undefined,
            IsFirstLogin: user.IsFirstLogin
          };
          const token = jwt.sign(payload, secret, { expiresIn: '7d' });

          // ✅ Set HTTP-only cookie (WEB only)
          res.cookie('token', token, {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
          });

          const userSafe = {
            Account_id: user.Account_id,
            Username: user.Username,
            Roles: user.Roles,
            FirstName: user.FirstName,
            LastName: user.LastName,
            Email: user.Email,
            IsFirstLogin: user.IsFirstLogin
          };

          // ✅ IMPORTANT: do NOT pre-encode; URLSearchParams will encode it
          return res.redirect(buildFrontendUrl('/auth/callback', {
            user: JSON.stringify(userSafe),
            auth: 'success'
          }));
        } catch (tokenErr) {
          console.error('JWT creation failed:', tokenErr);
          return res.redirect(buildFrontendUrl('/auth/callback', {
            error: 'token_failed',
            auth: 'fail'
          }));
        }
      });
    } else if (info && typeof info === 'object') {
      const { message, email, redirectTo, firstName, lastName, username } = info as any;
      
      const params: Record<string, string> = {
        message: message || '',
        email: email || '',
      };
      
      if (redirectTo === 'signup') {
        params.sso = 'google';
        if (firstName) params.firstName = firstName;
        if (lastName) params.lastName = lastName;
      } else if (redirectTo === 'verify-email') {
        params.message = 'email_pending';
        if (username) params.username = username;
      } else if (redirectTo === 'pending-approval') {
        params.message = 'admin_pending';
        params.sso = 'true';
        if (username) params.username = username;
      } else {
        params.auth = 'fail';
      }
      
      return res.redirect(buildFrontendUrl('/auth/callback', params));
    } else {
      return res.redirect(buildFrontendUrl('/auth/callback', { 
        error: 'auth_failed',
        auth: 'fail',
        message: 'Google authentication failed' 
      }));
    }
  })(req, res, next);
}

// ✅ Add logout endpoint to clear cookie
export async function logout(req: Request, res: Response) {
  req.logout((err: any) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    
    // Clear the token cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/'
    });
    
    return res.json({ success: true, message: 'Logged out successfully' });
  });
}

export async function getMe(req: Request, res: Response) {
  if (req.user) {
    return res.json({ success: true, user: req.user });
  }
  return res.status(401).json({ success: false, message: 'Not authenticated' });
}