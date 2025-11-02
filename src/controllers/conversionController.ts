import { Request, Response } from 'express';
import * as conversionService from '../services/conversionService';

export async function getConversion(req: Request, res: Response) {
  try {
    const pointsPerKg = await conversionService.getPointsPerKg();
    return res.status(200).json({ pointsPerKg });
  } catch (err) {
    console.error('getConversion error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function updateConversion(req: Request, res: Response) {
  try {
    // require authenticated user
    const user = (req as any).user;
    if (!user?.Account_id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { pointsPerKg, remark } = req.body as { pointsPerKg?: number; remark?: string };

    if (pointsPerKg == null || !Number.isFinite(pointsPerKg) || pointsPerKg <= 0) {
      return res.status(400).json({ message: 'Invalid pointsPerKg' });
    }
    if (typeof remark !== 'string' || remark.trim().length < 3) {
      return res.status(400).json({ message: 'Remark is required (min 3 chars)' });
    }

    const changedBy = Number(user.Account_id);

    const updated = await conversionService.setPointsPerKg(Number(pointsPerKg), remark.trim(), changedBy);
    return res.status(200).json({ pointsPerKg: updated });
  } catch (err) {
    console.error('updateConversion error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function getConversionAudit(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit ?? 100);
    const entries = await conversionService.getAuditEntries(limit);
    return res.status(200).json({ entries });
  } catch (err) {
    console.error('getConversionAudit error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}