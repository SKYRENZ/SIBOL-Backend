import { Request, Response } from 'express';
import googleMobileService from '../services/googlemobileService';
import jwt from 'jsonwebtoken';
import config from '../config/env';

export async function googleMobileSignIn(req: Request, res: Response) {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'idToken required' });

  try {
    const { account, payload } = await googleMobileService.verifyIdTokenAndFindUser(idToken);

    if (!account) {
      return res.status(404).json({ message: 'not_registered', email: payload?.email });
    }

    const token = jwt.sign({ Account_id: account.Account_id, Roles: account.Roles }, config.JWT_SECRET, { expiresIn: config.JWT_TTL || '7d' });
    const user = { Account_id: account.Account_id, Username: account.Username, Roles: account.Roles, Email: payload?.email };
    return res.json({ token, user });
  } catch (err: any) {
    console.error('googleMobileSignIn error', err);
    return res.status(400).json({ error: err.message || 'Invalid idToken' });
  }
}