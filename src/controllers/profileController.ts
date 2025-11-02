import type { Request, Response } from 'express';
import { getProfileByAccountId, updateProfile } from '../services/profileService';

export async function handleGetProfile(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId);
    if (!accountId) return res.status(400).json({ message: 'accountId required' });

    const profile = await getProfileByAccountId(accountId);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    return res.json(profile);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Failed to fetch profile' });
  }
}

export async function handleUpdateProfile(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.accountId || req.body.accountId);
    if (!accountId) return res.status(400).json({ message: 'accountId required' });

    const payload = req.body; // { username, password, firstName, lastName, area, contact, email }
    const updated = await updateProfile(accountId, payload);
    return res.json({ message: 'Profile updated', data: updated });
  } catch (err: any) {
    if (err?.code === 'TOO_EARLY') {
      return res.status(429).json({ message: err.message, retryAt: err.retryAt });
    }
    return res.status(400).json({ message: err?.message || 'Update failed' });
  }
}