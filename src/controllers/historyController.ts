import type { Request, Response } from 'express';
import * as historyService from '../services/historyService';

export async function listMyHistory(req: Request, res: Response) {
  try {
    const user: any = (req as any).user;
    const accountId = Number(user?.Account_id);
    if (!accountId) return res.status(401).json({ message: 'Authentication required' });

    const limitRaw = req.query.limit;
    const limit =
      typeof limitRaw === 'string' && limitRaw.trim() !== '' ? Number(limitRaw) : undefined;

    const cursorRaw = req.query.cursor;
    const cursor = typeof cursorRaw === 'string' && cursorRaw.trim() !== '' ? cursorRaw : null;

    const args: { accountId: number; cursor: string | null; limit?: number } = {
      accountId,
      cursor,
      ...(limit !== undefined && !Number.isNaN(limit) ? { limit } : {}),
    };

    const items = await historyService.listHistoryForAccount(args);
    return res.json({ items });
  } catch (err: any) {
    console.error('[history] listMyHistory error', err);
    return res.status(500).json({ message: err?.message ?? 'Server error' });
  }
}