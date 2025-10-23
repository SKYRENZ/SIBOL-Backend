// filepath: c:\Users\Renz\OneDrive\Documents\GitHub\SIBOL\SIBOL-Backend\src\controllers\areaController.ts
import { Request, Response } from "express";
import pool from "../config/db";

export async function list(req: Request, res: Response) {
  try {
    const [rows] = await pool.query<any[]>("SELECT Area_id, Area_Name FROM area_tbl");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch areas" });
  }
}