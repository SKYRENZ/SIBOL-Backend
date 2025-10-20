import type { Request, Response, NextFunction } from 'express';

const ADMIN_ROLE = 1; // set to the role id that represents Admin in your DB

export function isAdmin(req: Request, res: Response, next: NextFunction) {
  // @ts-ignore -> cast to any to avoid TS errors when req.user shape varies
  const actor = (req as any).user;
  if (!actor) return res.status(401).json({ message: 'Authentication required' });

  // normalize possible role property names from different auth flows
  const role =
    (actor as any).Roles ??
    (actor as any).roleId ??
    (actor as any).role ??
    (actor as any).Roles_id ??
    (actor as any).RolesId ??
    null;

  if (role === null || role === undefined) {
    console.warn('isAdmin: user has no role field', actor);
    return res.status(403).json({ message: 'Insufficient privileges' });
  }

  const roleNum = typeof role === 'string' ? Number(role) : role;
  if (Number.isNaN(roleNum)) {
    console.warn('isAdmin: cannot parse role', role);
    return res.status(403).json({ message: 'Insufficient privileges' });
  }

  if (roleNum !== ADMIN_ROLE) {
    return res.status(403).json({ message: 'Admin role required' });
  }

  return next();
}