// filepath: c:\Users\Renz\OneDrive\Documents\GitHub\SIBOL\SIBOL-Backend\src\controllers\areaController.ts
import { Request, Response } from "express";
import pool from "../config/db";
import axios from "axios";

/**
 * Geocodes an address using the Nominatim API.
 * @param address The address string to geocode.
 * @returns An object with latitude and longitude, or null if not found.
 */
async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`;
    
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'SIBOL-App/1.0' } // Nominatim requires a User-Agent
    });

    if (response.data && response.data.length > 0) {
      const { lat, lon } = response.data[0];
      return { lat: parseFloat(lat), lon: parseFloat(lon) };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

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

  const GET_LOGS_QUERY = `
    SELECT 
        awi.input_id,
        awi.weight,
        DATE_FORMAT(awi.input_date, '%b %d, %Y') as date,
        TIME_FORMAT(awi.input_date, '%h:%i %p') as time,
        COALESCE(CONCAT(p.FirstName, ' ', p.LastName), 'Unknown Operator') as operator_name
    FROM 
        area_waste_inputs_tbl awi
    LEFT JOIN 
        profile_tbl p ON awi.operator_id = p.Account_id
    WHERE 
        awi.area_id = ?
    ORDER BY 
        awi.input_date DESC
    LIMIT 20;
  `;

  try {
    const [rows] = await pool.query(GET_LOGS_QUERY, [id]);
    res.json({ data: rows });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Failed to fetch area logs." });
  }
}