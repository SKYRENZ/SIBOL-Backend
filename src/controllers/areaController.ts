// filepath: c:\Users\Renz\OneDrive\Documents\GitHub\SIBOL\SIBOL-Backend\src\controllers\areaController.ts
import { Request, Response } from "express";
import * as areaService from "../services/areaService";
import * as wasteService from "../services/wasteCollectionService";

/**
 * Creates a new area, geocoding the address to get coordinates.
 */
export async function createArea(req: Request, res: Response) {
  const { areaName, fullAddress } = req.body;

  if (!areaName || !fullAddress) {
    return res.status(400).json({ error: "Area name and full address are required." });
  }

  try {
    const created = await areaService.createArea({ areaName, fullAddress });
    return res.status(201).json(created);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save the new area.";
    const status = message.toLowerCase().includes("coordinates") ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}

/**
 * Lists all areas.
 */
export async function list(req: Request, res: Response) {
  try {
    const rows = await areaService.listAreas();
    return res.json({ data: rows });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({ error: "Failed to fetch areas." });
  }
}

/**
 * Gets waste input logs for a specific area.
 */
export async function getLogsByArea(req: Request, res: Response) {
  const { id } = req.params;

  const areaId = Number(id);
  if (Number.isNaN(areaId) || areaId <= 0) {
    return res.status(400).json({ error: 'Invalid area id' });
  }

  try {
    // reuse shared service — it already returns date/time fields (or adjust format there)
    const rows = await wasteService.getCollectionsByArea(areaId, 20, 0);

    // if you need different date/time formatting, either change service SQL (DATE_FORMAT/TIME_FORMAT)
    // or format here before returning.
    return res.json({ data: rows });
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Failed to fetch area logs.' });
  }
}