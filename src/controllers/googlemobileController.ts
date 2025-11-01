import { Request, Response } from 'express';
import {
  verifyGoogleIdToken,
  findUserByEmail,
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

    console.log('[GoogleMobile Controller] Verifying ID token...');

    // 1. Verify ID token with Google
    const googleUser = await verifyGoogleIdToken(idToken);
    console.log('[GoogleMobile Controller] Token verified for:', googleUser.email);

    // 2. Check if user exists in database
    const user = await findUserByEmail(googleUser.email);

    if (!user) {
      // User doesn't exist - redirect to signup
      return res.json({
        status: 'signup',
        email: googleUser.email,
        firstName: googleUser.firstName,
        lastName: googleUser.lastName,
        picture: googleUser.picture,
        message: 'Please complete your registration',
      });
    }

    // 3. Check if account is active/approved
    if (!isAccountActive(user)) {
      return res.json({
        status: 'pending',
        email: user.Email,
        message: 'Your account is pending admin approval',
      });
    }

    // 4. Generate JWT token
    const token = generateUserToken(user);

    // 5. Return success with token and user data
    return res.json({
      status: 'success',
      token,
      user: formatUserResponse(user),
    });

  } catch (error: any) {
    console.error('[GoogleMobile Controller] Error:', error);
    
    // Handle specific Google verification errors
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

    // 3. Check if user exists in database
    const user = await findUserByEmail(googleUser.email);

    if (!user) {
      // User doesn't exist - redirect to signup
      return res.json({
        status: 'signup',
        email: googleUser.email,
        firstName: googleUser.firstName,
        lastName: googleUser.lastName,
        picture: googleUser.picture,
        message: 'Please complete your registration',
      });
    }

    // 4. Check if account is active/approved
    if (!isAccountActive(user)) {
      return res.json({
        status: 'pending',
        email: user.Email,
        message: 'Your account is pending admin approval',
      });
    }

    // 5. Generate JWT token
    const token = generateUserToken(user);

    // 6. Return success with token and user data
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