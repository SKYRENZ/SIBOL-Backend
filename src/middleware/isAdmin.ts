import type { Request, Response, NextFunction } from 'express';

const ADMIN_ROLE = 1; // adjust to match your roles table

export function isAdmin(req: Request, res: Response, next: NextFunction) {
    // assume authentication middleware sets req.user
    // @ts-ignore
    const actor = req.user;
    if (!actor) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    const role = actor.Roles ?? actor.roleId ?? actor.role;
    if (Number(role) !== ADMIN_ROLE) {
        return res.status(403).json({ message: 'Admin role required' });
    }
    return next();
}