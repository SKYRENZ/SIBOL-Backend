import { Request, Response } from "express";
import pool from "../config/db";
import { geocodeAddress } from "../utils/geocode";

/**
 * Create a new waste container.
 * Expects body: { container_name, area_name, fullAddress, deployment_date? }
 * - Geocodes the fullAddress
 * - Reuses existing area (by name + address) or creates it (with lat/lon)
 * - Inserts into waste_containers_tbl (links to area_tbl)
 */
export async function createContainer(req: Request, res: Response) {
  const { container_name, area_name, fullAddress } = req.body;

  console.log("Creating container with:", { container_name, area_name, fullAddress });

  if (!container_name || !area_name || !fullAddress) {
    return res.status(400).json({ error: "container_name, area_name and fullAddress are required." });
  }

  let coords = await geocodeAddress(fullAddress);
  console.log("Geocoded coords:", coords);
  if (!coords) {
    return res.status(400).json({ error: "Could not geocode the provided address." });
  }

  try {
    // Try to find an existing area record by name + address
    console.log("Checking for existing area...");
    const [existingAreaRows]: any = await pool.query(
      "SELECT Area_id, Latitude, Longitude FROM area_tbl WHERE Area_Name = ? AND Full_Address = ? LIMIT 1",
      [area_name, fullAddress]
    );
    console.log("Existing area rows:", existingAreaRows);

    let areaId: number;
    let areaLat: number | null = null;
    let areaLon: number | null = null;

    if (existingAreaRows && existingAreaRows.length > 0) {
      areaId = existingAreaRows[0].Area_id;
      areaLat = existingAreaRows[0].Latitude;
      areaLon = existingAreaRows[0].Longitude;

      // If area exists but has no coordinates, update them
      if (areaLat === null || areaLon === null) {
        console.log("Updating area coordinates...");
        await pool.query("UPDATE area_tbl SET Latitude = ?, Longitude = ? WHERE Area_id = ?", [
          coords.lat,
          coords.lon,
          areaId,
        ]);
        areaLat = coords.lat;
        areaLon = coords.lon;
      }
    } else {
      // Create a new area
      console.log("Inserting new area...");
      const [areaResult]: any = await pool.query(
        "INSERT INTO area_tbl (Area_Name, Full_Address, Latitude, Longitude) VALUES (?, ?, ?, ?)",
        [area_name, fullAddress, coords.lat, coords.lon]
      );
      console.log("Area insert result:", areaResult);
      areaId = areaResult.insertId;
      areaLat = coords.lat;
      areaLon = coords.lon;
    }

    // Insert the container (table is waste_containers_tbl)
    console.log("Inserting container...");
    const deploymentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const [containerResult]: any = await pool.query(
      "INSERT INTO waste_containers_tbl (container_name, area_id, deployment_date, status) VALUES (?, ?, ?, ?)",
      [container_name, areaId, deploymentDate, "Empty"]
    );
    console.log("Container insert result:", containerResult);

    const created = {
      container_id: containerResult.insertId,
      container_name,
      area_id: areaId,
      area_name,
      deployment_date: deploymentDate,
      status: "Empty",
      latitude: areaLat,
      longitude: areaLon,
    };

    return res.status(201).json({ data: created });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({ error: "Failed to create waste container." });
  }
}

/**
 * List all containers joined with area info.
 * Uses existing waste_containers_tbl schema.
 */
export async function listContainers(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.query(
      `SELECT
         wc.container_id,
         wc.container_name,
         wc.deployment_date,
         wc.status,
         a.Area_id AS area_id,
         a.Area_Name AS area_name,
         a.Full_Address AS full_address,
         a.Latitude AS latitude,
         a.Longitude AS longitude
       FROM waste_containers_tbl wc
       LEFT JOIN area_tbl a ON wc.area_id = a.Area_id
       ORDER BY wc.container_id DESC`
    );

    return res.json({ data: rows });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({ error: "Failed to fetch containers." });
  }
}