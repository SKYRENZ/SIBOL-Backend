import type { Request, Response } from 'express';
import { getProfileByAccountId, getPointsByAccountId, updateProfile } from '../services/profileService';

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

// ✅ NEW: Get authenticated user's points
export async function handleGetMyPoints(req: Request, res: Response) {
  try {
    const user = (req as any).user;

    if (!user) return res.status(401).json({ message: 'Not authenticated' });

    const accountId = Number(user?.Account_id ?? user?.account_id ?? user?.id);

    if (!accountId) return res.status(400).json({ message: 'Invalid account id' });

    const account = await getPointsByAccountId(accountId);

    if (!account) return res.status(404).json({ message: 'Account not found' });

    // Normalize DB/row field casing (some rows use Points / Username)
    const pointsVal = account?.points ?? account?.Points ?? user?.Points ?? 0;
    const usernameVal = account?.username ?? account?.Username ?? user?.Username ?? user?.username ?? '';

    return res.json({
      account_id: accountId,
      points: Number(pointsVal) || 0,
      username: usernameVal
    });
  } catch (err) {
    console.error('handleGetMyPoints error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function handleUpdateProfile(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const authedId = user?.Account_id ?? user?.account_id ?? user?.id;

    const accountId = Number(req.params.accountId || req.body.accountId);
    if (!accountId) return res.status(400).json({ message: 'accountId required' });

    if (!authedId) return res.status(401).json({ message: 'Not authenticated' });
    if (Number(accountId) !== Number(authedId)) {
      return res.status(403).json({ message: 'Forbidden - cannot update another user' });
    }

    const payload = req.body;
    const updated = await updateProfile(accountId, payload);
    return res.json({ message: 'Profile updated', data: updated });
  } catch (err: any) {
    if (err?.code === 'TOO_EARLY') {
      return res.status(429).json({ message: err.message, retryAt: err.retryAt });
    }
    return res.status(400).json({ message: err?.message || 'Update failed' });
  }
}

export async function handleGetMyProfile(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const accountId = user?.Account_id ?? user?.account_id ?? user?.id;

    if (!accountId) return res.status(401).json({ message: 'Not authenticated' });

    const profile = await getProfileByAccountId(Number(accountId));
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    return res.json(profile);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Failed to fetch profile' });
  }
}

export async function handleUpdateMyProfile(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const accountId = user?.Account_id ?? user?.account_id ?? user?.id;

    if (!accountId) return res.status(401).json({ message: 'Not authenticated' });

    const updated = await updateProfile(Number(accountId), req.body);
    return res.json({ message: 'Profile updated', data: updated });
  } catch (err: any) {
    if (err?.code === 'TOO_EARLY') {
      return res.status(429).json({ message: err.message, retryAt: err.retryAt });
    }
    return res.status(400).json({ message: err?.message || 'Update failed' });
  }
}