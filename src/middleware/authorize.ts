import type { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';

function getRoleNumber(user: any): number | null {
  const role =
    user?.Roles ??
    user?.roleId ??
    user?.role ??
    user?.Roles_id ??
    user?.RolesId ??
    null;

  const roleNum = typeof role === 'string' ? Number(role) : role;
  return Number.isFinite(roleNum) ? roleNum : null;
}

// usage: authorizeByModulePath('/admin')
export const authorizeByModulePath = (path: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user?.Roles) return res.status(401).json({ message: 'Not authenticated' });

      const sql = `
        SELECT COUNT(*) AS cnt
        FROM user_module_tbl um
        JOIN modules_tbl m ON um.Module_id = m.Module_id
        WHERE um.Roles_id = ? AND m.Path = ?
      `;
      const [rows]: any = await pool.query(sql, [user.Roles, path]);
      if (rows?.[0]?.cnt > 0) return next();
      return res.status(403).json({ message: 'Forbidden - insufficient module access' });
    } catch (err) {
      return res.status(500).json({ message: 'Authorization check failed', error: err });
    }
  };
};

export function authorizeRoles(allowedRoles: number[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const actor = (req as any).user;
    if (!actor) return res.status(401).json({ message: 'Authentication required' });

    const roleNum = getRoleNumber(actor);
    if (roleNum === null) return res.status(403).json({ message: 'Insufficient privileges' });

    if (!allowedRoles.includes(roleNum)) {
      return res.status(403).json({ message: 'Insufficient privileges' });
    }

    return next();
  };
}