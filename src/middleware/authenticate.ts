import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'changeme';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const auth = (req.headers.authorization || '').split(' ');
  const token = auth[0] === 'Bearer' ? auth[1] : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const payload = jwt.verify(token, SECRET) as any;
    // @ts-ignore
    req.user = payload;
    return next();
  } catch (err) {
    console.log('JWT VERIFY ERROR:', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
}