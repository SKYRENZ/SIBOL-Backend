import type { Request, Response, NextFunction } from 'express';

const ADMIN_ROLE = 1; // set to the role id that represents Admin in your DB

export function isAdmin(req: Request, res: Response, next: NextFunction) {
  // @ts-ignore
  const actor = req.user;
  if (!actor) return res.status(401).json({ message: 'Authentication required' });

  const role = actor.Roles ?? actor.roleId ?? actor.role;
  // accept either role 3 OR 1 if needed
  if (![ADMIN_ROLE, 1].includes(Number(role))) {
    return res.status(403).json({ message: 'Admin role required' });
  }
  return next();
}