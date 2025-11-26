import type { Request, Response } from 'express';
import * as wasteService from '../services/wasteCollectionService';

export async function createCollection(req: Request, res: Response) {
  try {
    const { area_id, weight } = req.body;

    if (typeof area_id === 'undefined' || area_id === null) {
      return res.status(400).json({ message: 'area_id is required' });
    }
    if (typeof weight === 'undefined' || weight === null) {
      return res.status(400).json({ message: 'weight is required' });
    }

    const parsedAreaId = Number(area_id);
    const parsedWeight = Number(weight);

    if (Number.isNaN(parsedAreaId) || parsedAreaId <= 0) {
      return res.status(400).json({ message: 'area_id must be a positive number' });
    }
    if (Number.isNaN(parsedWeight) || parsedWeight < 0) {
      return res.status(400).json({ message: 'weight must be a non-negative number' });
    }

    // operator id should come from authenticated user
    const operator = (req as any).user;
    const operatorId = operator?.Account_id ?? req.body.operator_id;

    if (!operatorId) {
      return res.status(401).json({ message: 'Operator not authenticated' });
    }

    const created = await wasteService.createWasteCollection(parsedAreaId, Number(operatorId), parsedWeight);

    return res.status(201).json({ message: 'Collection recorded', data: created });
  } catch (err: any) {
    console.error('createCollection error', err);
    return res.status(500).json({ message: err?.message || 'Failed to record collection' });
  }
}

// new: controller to return collections for an area
export async function getCollectionsByArea(req: Request, res: Response) {
  try {
    const areaIdRaw = req.query.area_id ?? req.params.area_id;
    if (typeof areaIdRaw === 'undefined' || areaIdRaw === null) {
      return res.status(400).json({ message: 'area_id is required (query or param)' });
    }
    const areaId = Number(areaIdRaw);
    if (Number.isNaN(areaId) || areaId <= 0) {
      return res.status(400).json({ message: 'area_id must be a positive number' });
    }

    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const rows = await wasteService.getCollectionsByArea(areaId, limit, offset);
    return res.status(200).json({ data: rows });
  } catch (err: any) {
    console.error('getCollectionsByArea error', err);
    return res.status(500).json({ message: err?.message || 'Failed to fetch collections' });
  }
}