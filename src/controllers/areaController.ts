// filepath: c:\Users\Renz\OneDrive\Documents\GitHub\SIBOL\SIBOL-Backend\src\controllers\areaController.ts
import { Request, Response } from "express";
import pool from "../config/db";
import { geocodeAddress } from "../utils/geocode";
import * as wasteService from '../services/wasteCollectionService';

/**
 * Creates a new area, geocoding the address to get coordinates.
 */
export async function createArea(req: Request, res: Response) {
  const { areaName, fullAddress } = req.body;

  if (!areaName || !fullAddress) {
    return res.status(400).json({ error: "Area name and full address are required." });
  }

  const coordinates = await geocodeAddress(fullAddress);

  if (!coordinates) {
    return res.status(400).json({ error: "Could not find coordinates for the provided address. Please check the address and try again." });
  }

  try {
    const [result] = await pool.query<any>(
      "INSERT INTO area_tbl (Area_Name, Full_Address, Latitude, Longitude) VALUES (?, ?, ?, ?)",
      [areaName, fullAddress, coordinates.lat, coordinates.lon]
    );
    res.status(201).json({
      Area_id: result.insertId,
      Area_Name: areaName,
      Full_Address: fullAddress,
      Latitude: coordinates.lat,
      Longitude: coordinates.lon,
    });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Failed to save the new area." });
  }
}

/**
 * Lists all areas.
 */
export async function list(req: Request, res: Response) {
  try {
    const [rows] = await pool.query("SELECT Area_id, Area_Name, Full_Address FROM area_tbl ORDER BY Area_Name ASC");
    res.json({ data: rows });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Failed to fetch areas." });
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