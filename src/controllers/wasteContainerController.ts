import { Request, Response } from "express";
import pool from "../config/db";

const GET_ALL_QUERY = `
    SELECT 
        wc.container_id,
        wc.container_name,
        wc.area_id,
        a.Area_Name as area_name,
        a.Latitude as latitude,
        a.Longitude as longitude,
        wc.status,
        DATE_FORMAT(wc.deployment_date, '%b %d, %Y') as deployment_date,
        wc.last_updated
    FROM 
        waste_containers_tbl wc
    JOIN 
        area_tbl a ON wc.area_id = a.Area_id
    ORDER BY 
        wc.container_id DESC;
`;

export async function list(req: Request, res: Response) {
  try {
    const [rows] = await pool.query(GET_ALL_QUERY);
    res.json({ data: rows });
  } catch (err) {
    console.error("Failed to fetch waste containers:", err);
    res.status(500).json({ error: "Failed to fetch waste containers" });
  }
}

export async function create(req: Request, res: Response) {
  const { container_name, area_id, deployment_date } = req.body;
  if (!container_name || !area_id || !deployment_date) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const [result] = await pool.query<any>(
      "INSERT INTO waste_containers_tbl (container_name, area_id, deployment_date) VALUES (?, ?, ?)",
      [container_name, area_id, deployment_date]
    );
    res.status(201).json({ container_id: result.insertId, ...req.body });
  } catch (err) {
    console.error("Failed to create waste container:", err);
    res.status(500).json({ error: "Failed to create waste container" });
  }
}