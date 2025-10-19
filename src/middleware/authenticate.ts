import type { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

// don't log or exit at module import — read env at runtime and return a 500 if misconfigured
export function authenticate(req: Request, res: Response, next: NextFunction) {
  // read secret at runtime so dotenv timing/import order can't break middleware
  const SECRET = process.env.JWT_SECRET as jwt.Secret | undefined;
  if (!SECRET) {
    console.error('authenticate: JWT_SECRET not configured');
    return res.status(500).json({ message: 'Server misconfiguration' });
  }

  // allow passport session users
  if ((req as any).user) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ message: 'Invalid authorization header' });
  }

  const token = parts[1] as string;
  if (!token) return res.status(401).json({ message: 'Token missing' });

  try {
    const payload = jwt.verify(token, SECRET) as any;
    (req as any).user = payload;
    return next();
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired' });
    console.error('JWT VERIFY ERROR:', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
}