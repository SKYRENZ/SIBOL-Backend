import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';
import config from '../config/env';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = (req.headers.authorization as string) || (req.headers['x-auth-token'] as string) || null;

    if (!auth) return res.status(401).json({ message: 'Missing auth header' });

    const token = auth.replace(/^Bearer\s+/i, '');
    // Verify token
    let decoded;
    try {
      const SECRET = process.env.JWT_SECRET ?? config?.JWT_SECRET ?? 'changeme';
      decoded = jwt.verify(token, SECRET as string) as any;
    } catch (err) {
      console.warn('[server auth] jwt.verify failed', err);
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const accountId = decoded.Account_id ?? decoded.accountId ?? decoded.id ?? decoded.sub;
    if (!accountId) {
      console.warn('[authenticate] token missing account id', { payload: decoded });
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    const [rows]: any = await pool.query('SELECT * FROM accounts_tbl WHERE Account_id = ? LIMIT 1', [accountId]);
    const account = rows?.[0] ?? null;
    if (!account) {
      console.warn('[authenticate] account not found for id', accountId);
      return res.status(401).json({ message: 'Account not found' });
    }

    (req as any).user = account;
    return next();
  } catch (err) {
    console.error('[server auth] error', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
}