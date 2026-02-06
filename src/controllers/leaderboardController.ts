import { Request, Response } from 'express';
import { getLeaderboard } from '../services/leaderboardService';

export async function listLeaderboard(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit) || 100;
    const data = await getLeaderboard(limit);
    return res.status(200).json({ data });
  } catch (err) {
    console.error('listLeaderboard error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}