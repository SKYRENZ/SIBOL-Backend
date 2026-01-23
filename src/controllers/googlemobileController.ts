import { Request, Response } from 'express';
import {
  verifyGoogleIdToken,
  findUserByEmail,
  findPendingAccountByEmail,
  isAccountActive,
  generateUserToken,
  formatUserResponse,
  exchangeCodeForToken,
} from '../services/googlemobileService';

/**
 * POST /api/auth/sso-google
 * Handle Google Sign-In with ID token (direct flow)
 */
export async function handleGoogleAuth(req: Request, res: Response) {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }

    // ✅ Basic token validation before verification
    if (typeof idToken !== 'string' || idToken.length < 10) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    console.log('[GoogleMobile Controller] Verifying ID token...');

    try {
      // 1. Verify ID token with Google
      const googleUser = await verifyGoogleIdToken(idToken);
      console.log('[GoogleMobile Controller] Token verified for:', googleUser.email);

      // 2. Check if user exists in ACTIVE accounts first
      const user = await findUserByEmail(googleUser.email);

      if (user) {
        if (!isAccountActive(user)) {
          return res.json({
            status: 'pending',
            email: user.Email,
            message: 'Your account is pending admin approval',
          });
        }

        const roleNum = Number(user.Roles ?? NaN);
        const MOBILE_ALLOWED = new Set([3, 4]);
        if (!MOBILE_ALLOWED.has(roleNum)) {
          return res.status(403).json({
            error: 'Your account does not have access to this platform.',
          });
        }

        const token = generateUserToken(user);

        return res.json({
          status: 'success',
          token,
          user: formatUserResponse(user),
        });
      }

      // 3. Check if user exists in PENDING accounts (only if not in active)
      const pendingAccount = await findPendingAccountByEmail(googleUser.email);

      if (pendingAccount) {
        // SSO users don't need email verification - their email is already verified by Google
        // Just check admin approval status
        console.log('[GoogleMobile Controller] Found pending SSO account:', pendingAccount.Email);

        if (!pendingAccount.IsAdminVerified || Number(pendingAccount.IsAdminVerified) === 0) {
          return res.json({
            status: 'pending',
            email: pendingAccount.Email,
            message: 'Your account is pending admin approval',
          });
        }

        // If admin approved but still in pending table, treat as pending
        return res.json({
          status: 'pending',
          email: pendingAccount.Email,
          message: 'Your account is being processed',
        });
      }

      // 4. User doesn't exist anywhere - redirect to signup
      console.log('[GoogleMobile Controller] No account found, redirecting to signup');
      return res.json({
        status: 'signup',
        email: googleUser.email,
        firstName: googleUser.firstName,
        lastName: googleUser.lastName,
        picture: googleUser.picture,
        message: 'Please complete your registration',
      });

    } catch (verifyError: any) {
      // ✅ Handle token verification errors gracefully
      console.error('[GoogleMobile Controller] Token verification failed:', verifyError.message);
      return res.status(401).json({ 
        error: 'Invalid Google token',
        details: verifyError.message 
      });
    }

  } catch (error: any) {
    console.error('[GoogleMobile Controller] Error:', error);
    
    if (error.message?.includes('Invalid token')) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * POST /api/auth/sso-google-code
 * Handle Google Sign-In with authorization code (code exchange flow)
 */
export async function handleGoogleCodeAuth(req: Request, res: Response) {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    console.log('[GoogleMobile Controller] Exchanging authorization code...');

    // 1. Exchange code for ID token
    const idToken = await exchangeCodeForToken(code);
    console.log('[GoogleMobile Controller] Got ID token from code exchange');

    // 2. Verify ID token with Google
    const googleUser = await verifyGoogleIdToken(idToken);
    console.log('[GoogleMobile Controller] Token verified for:', googleUser.email);

    // 3. Check if user exists in PENDING accounts first (NEW)
    const pendingAccount = await findPendingAccountByEmail(googleUser.email);

    if (pendingAccount) {
      console.log('[GoogleMobile Controller] Found pending account:', pendingAccount.Email);

      if (!pendingAccount.IsEmailVerified || Number(pendingAccount.IsEmailVerified) === 0) {
        return res.json({
          status: 'verify-email',
          email: pendingAccount.Email,
          message: 'Please verify your email first',
        });
      }

      if (!pendingAccount.IsAdminVerified || Number(pendingAccount.IsAdminVerified) === 0) {
        return res.json({
          status: 'pending',
          email: pendingAccount.Email,
          message: 'Your account is pending admin approval',
        });
      }

      return res.json({
        status: 'pending',
        email: pendingAccount.Email,
        message: 'Your account is being processed',
      });
    }

    // 4. Check if user exists in ACTIVE accounts
    const user = await findUserByEmail(googleUser.email);

    if (!user) {
      return res.json({
        status: 'signup',
        email: googleUser.email,
        firstName: googleUser.firstName,
        lastName: googleUser.lastName,
        picture: googleUser.picture,
        message: 'Please complete your registration',
      });
    }

    // 5. Check if active account is actually active
    if (!isAccountActive(user)) {
      return res.json({
        status: 'pending',
        email: user.Email,
        message: 'Your account is pending admin approval',
      });
    }

    // 6. Generate JWT token
    const token = generateUserToken(user);

    // 7. Return success with token and user data
    return res.json({
      status: 'success',
      token,
      user: formatUserResponse(user),
    });

  } catch (error: any) {
    console.error('[GoogleMobile Controller] Code exchange error:', error);
    
    if (error.message?.includes('Invalid token')) {
      return res.status(401).json({ error: 'Invalid authorization code' });
    }

    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}