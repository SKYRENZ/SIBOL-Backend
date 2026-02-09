import pool from "../config/db";
import { geocodeAddress } from "../utils/geocode";

export type CreateContainerInput = {
  container_name: string;
  area_name: string;
  fullAddress: string;
  latitude?: number;
  longitude?: number;
};

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export async function createContainer(input: CreateContainerInput) {
  const { container_name, area_name, fullAddress, latitude, longitude } = input;

  const coords =
    isFiniteNumber(latitude) && isFiniteNumber(longitude)
      ? { lat: latitude, lon: longitude }
      : await geocodeAddress(fullAddress);

  if (!coords) {
    throw new Error("Could not geocode the provided address.");
  }

  // Check existing area
  const [existingAreaRows]: any = await pool.query(
    "SELECT Area_id, Latitude, Longitude FROM area_tbl WHERE Area_Name = ? AND Full_Address = ? LIMIT 1",
    [area_name, fullAddress]
  );

  let areaId: number;
  let areaLat: number | null = null;
  let areaLon: number | null = null;

  if (existingAreaRows && existingAreaRows.length > 0) {
    areaId = existingAreaRows[0].Area_id;
    areaLat = existingAreaRows[0].Latitude;
    areaLon = existingAreaRows[0].Longitude;

    if (areaLat === null || areaLon === null) {
      await pool.query("UPDATE area_tbl SET Latitude = ?, Longitude = ? WHERE Area_id = ?", [
        coords.lat,
        coords.lon,
        areaId,
      ]);
      areaLat = coords.lat;
      areaLon = coords.lon;
    }
  } else {
    const [areaResult]: any = await pool.query(
      "INSERT INTO area_tbl (Area_Name, Full_Address, Latitude, Longitude) VALUES (?, ?, ?, ?)",
      [area_name, fullAddress, coords.lat, coords.lon]
    );
    areaId = areaResult.insertId;
    areaLat = coords.lat;
    areaLon = coords.lon;
  }

  const deploymentDate = new Date().toISOString().split("T")[0];
  const [containerResult]: any = await pool.query(
    "INSERT INTO waste_containers_tbl (container_name, area_id, deployment_date, status) VALUES (?, ?, ?, ?)",
    [container_name, areaId, deploymentDate, "Empty"]
  );

  // best-effort: log system notification for container addition
  try {
    await pool.query(
      `INSERT INTO system_notifications_tbl
       (Event_type, Container_name, Area_name, Created_at)
       VALUES ('CONTAINER_ADDED', ?, ?, NOW())`,
      [container_name, area_name]
    );
  } catch (notifErr) {
    console.warn('⚠️ Failed to log container notification:', notifErr);
  }

  return {
    container_id: containerResult.insertId,
    container_name,
    area_id: areaId,
    area_name,
    deployment_date: deploymentDate,
    status: "Empty",
    latitude: areaLat,
    longitude: areaLon,
  };
}

export async function listContainers() {
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

  return rows;
}