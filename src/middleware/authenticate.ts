import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';
import config from '../config/env';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  // ✅ Try to get token from cookie first, then fall back to Authorization header
  let token = req.cookies?.token;
  
  if (!token) {
    const authHeader = (req.headers.authorization || '').toString();
    const parts = authHeader.trim().split(/\s+/);
    token = parts.length === 2 && /^bearer$/i.test(parts[0] ?? '') ? parts[1] : null;
  }

  if (!token) {
    console.warn('[authenticate] no token found on request', {
      url: req.originalUrl,
      method: req.method,
      hasCookie: !!req.cookies?.token,
      hasAuthHeader: !!req.headers.authorization
    });
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const SECRET = process.env.JWT_SECRET ?? config?.JWT_SECRET ?? 'changeme';
    const payload = jwt.verify(token, SECRET as string) as any;

    const accountId = payload.Account_id ?? payload.accountId ?? payload.id ?? payload.sub;
    if (!accountId) {
      console.warn('[authenticate] token missing account id', { payload });
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
  } catch (err: any) {
    return res.status(401).json({ message: 'Invalid or expired token', error: err?.message });
  }
}