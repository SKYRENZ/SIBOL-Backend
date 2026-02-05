import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';
import config from '../config/env';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const cookieToken = (req as any).cookies?.token as string | undefined;
    const headerAuth =
      (req.headers.authorization as string) ||
      (req.headers['x-auth-token'] as string) ||
      null;

    const auth = headerAuth ?? (cookieToken ? `Bearer ${cookieToken}` : null);
    if (!auth) return res.status(401).json({ message: 'Missing auth token (header or cookie)' });

    const token = auth.replace(/^Bearer\s+/i, '');

    const SECRET = config.JWT_SECRET;
    if (!SECRET) {
      // fail fast; otherwise tokens will randomly break depending on fallback
      console.error('[auth] JWT_SECRET missing in config');
      return res.status(500).json({ message: 'Server misconfigured (missing JWT secret)' });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, SECRET) as any;
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const accountId = decoded.Account_id ?? decoded.accountId ?? decoded.id ?? decoded.sub;
    if (!accountId) return res.status(401).json({ message: 'Invalid token payload' });

    const [rows]: any = await pool.query('SELECT * FROM accounts_tbl WHERE Account_id = ? LIMIT 1', [accountId]);
    const account = rows?.[0] ?? null;
    if (!account) return res.status(401).json({ message: 'Account not found' });

    (req as any).user = account;
    return next();
  } catch (err) {
    console.error('[server auth] error', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
}