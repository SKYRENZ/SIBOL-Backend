import type { Request, Response, NextFunction } from 'express';

const SUPERADMIN_ROLE = 5; // SuperAdmin role id in user_roles_tbl

export function isSuperAdmin(req: Request, res: Response, next: NextFunction) {
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
        console.warn('isSuperAdmin: user has no role field', actor);
        return res.status(403).json({ message: 'Insufficient privileges' });
    }

    const roleNum = typeof role === 'string' ? Number(role) : role;
    if (Number.isNaN(roleNum)) {
        console.warn('isSuperAdmin: cannot parse role', role);
        return res.status(403).json({ message: 'Insufficient privileges' });
    }

    if (roleNum !== SUPERADMIN_ROLE) {
        return res.status(403).json({ message: 'SuperAdmin role required' });
    }

    return next();
}
