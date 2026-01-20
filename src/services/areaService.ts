import pool from "../config/db";
import { geocodeAddress } from "../utils/geocode";

export type CreateAreaInput = {
  areaName: string;
  fullAddress: string;
};

export async function createArea(input: CreateAreaInput) {
  const { areaName, fullAddress } = input;

  const coordinates = await geocodeAddress(fullAddress);
  if (!coordinates) {
    throw new Error(
      "Could not find coordinates for the provided address. Please check the address and try again."
    );
  }

  const [result]: any = await pool.query(
    "INSERT INTO area_tbl (Area_Name, Full_Address, Latitude, Longitude) VALUES (?, ?, ?, ?)",
    [areaName, fullAddress, coordinates.lat, coordinates.lon]
  );

  return {
    Area_id: result.insertId,
    Area_Name: areaName,
    Full_Address: fullAddress,
    Latitude: coordinates.lat,
    Longitude: coordinates.lon,
  };
}

export async function listAreas() {
  const [rows] = await pool.query(
    "SELECT Area_id, Area_Name, Full_Address FROM area_tbl ORDER BY Area_Name ASC"
  );
  return rows;
}