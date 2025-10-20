import type { Request, Response } from 'express';
import { fetchAllModules, fetchAllowedModulesForAccount } from '../services/moduleService';

export const getAllModules = async (_req: Request, res: Response) => {
  try {
    const rows = await fetchAllModules();
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load modules', error: err });
  }
};

export const getAllowedModules = async (req: Request, res: Response) => {
  try {
    const account = (req as any).user;
    if (!account?.Account_id) return res.status(401).json({ message: 'Not authenticated' });

    const rows = await fetchAllowedModulesForAccount(account);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load allowed modules', error: err });
  }
};