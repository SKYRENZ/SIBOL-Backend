import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const auth = (req.headers.authorization || '').split(' ');
  const token = auth[0] === 'Bearer' ? auth[1] : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    // read secret at runtime so tests can set process.env before calling authenticate
    const SECRET = process.env.JWT_SECRET || 'changeme';
    const payload = jwt.verify(token, SECRET) as any;

    // try to resolve account id from common payload shapes
    const accountId = payload.Account_id ?? payload.accountId ?? payload.id ?? payload.sub;
    if (!accountId) {
      (req as any).user = payload;
      return next();
    }

    const [rows]: any = await pool.query('SELECT * FROM accounts_tbl WHERE Account_id = ? LIMIT 1', [accountId]);
    const account = rows?.[0] ?? null;
    if (!account) return res.status(401).json({ message: 'Account not found' });

    (req as any).user = account;
    return next();
  } catch (err: any) {
    console.log('JWT VERIFY ERROR:', err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}