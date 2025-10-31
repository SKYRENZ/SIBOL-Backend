import { Request, Response } from 'express';
import * as googleService from '../services/googlemobileService';

export async function googleMobileSignIn(req: Request, res: Response) {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'idToken required' });

  try {
    const result = await googleService.verifyIdTokenAndFindUser(idToken);

    switch (result.status) {
      case 'success':
        // normal SSO: return token + user
        return res.json({ success: true, token: result.token, user: result.user });

      case 'pending':
        // account found but not approved
        return res.json({
          success: true,
          redirectTo: 'pending-approval',
          email: result.email,
          message: 'Account pending admin approval',
        });

      case 'verify':
        // pending record exists but email not yet verified -> require verify flow
        return res.json({
          success: true,
          redirectTo: 'verify-email',
          email: result.email,
          message: 'Please verify your email to continue',
        });

      case 'signup':
      default:
        // not registered -> prompt signup / sign-in page
        return res.json({
          success: true,
          redirectTo: 'signup',
          email: result.email,
          firstName: result.firstName,
          lastName: result.lastName,
          message: 'Complete your registration to continue with Google Sign-In',
        });
    }
  } catch (err: any) {
    console.error('googleMobileSignIn error', err);
    return res.status(500).json({ success: false, error: 'server_error', message: err?.message });
  }
}