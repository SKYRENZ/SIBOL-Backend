import type { Request, Response } from 'express';
import * as adminService from '../services/adminService';

export async function createUser(req: Request, res: Response) {
    try {
        const { firstName, lastName, areaId, contact, email, roleId } = req.body;
        const result = await adminService.createUserAsAdmin(firstName, lastName, Number(areaId), contact, email, Number(roleId));
        return res.status(201).json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Create user failed';
        return res.status(400).json({ message });
    }
}

export async function updateUser(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    const updates = req.body;
    const updated = await adminService.updateAccountAndProfile(accountId, updates);
    return res.status(200).json({ success: true, user: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return res.status(400).json({ message });
  }
}

export async function toggleActive(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    const { isActive } = req.body;
    if (isActive === undefined) return res.status(400).json({ message: 'isActive required' });

    const updated = await adminService.setAccountActive(accountId, isActive ? 1 : 0);
    return res.status(200).json({ success: true, account: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Toggle active failed';
    return res.status(400).json({ message });
  }
}