import pool from "../config/db";
import { geocodeAddress } from "../utils/geocode";

export type CreateContainerInput = {
  container_name: string;
  area_name: string;
  fullAddress: string;
  device_id?: string;
  latitude?: number;
  longitude?: number;
};

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export async function createContainer(input: CreateContainerInput) {
  const { container_name, area_name, fullAddress, device_id, latitude, longitude } = input;

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

  let areaBarangayId: number | null = null;
  try {
    const [bRows]: any = await pool.query(
      "SELECT Barangay_id FROM area_tbl WHERE Area_id = ? LIMIT 1",
      [areaId]
    );
    areaBarangayId = bRows?.[0]?.Barangay_id ?? null;
  } catch {
    areaBarangayId = null;
  }

  const deploymentDate = new Date().toISOString().split("T")[0];
  const [containerResult]: any = await pool.query(
    "INSERT INTO waste_containers_tbl (container_name, area_id, deployment_date, status, device_id) VALUES (?, ?, ?, ?, ?)",
    [container_name, areaId, deploymentDate, "Empty", device_id ?? null]
  );

  // best-effort: log system notification for container addition
  try {
    await pool.query(
      `INSERT INTO system_notifications_tbl
       (Event_type, Container_name, Area_name, Barangay_id, Created_at)
       VALUES ('CONTAINER_ADDED', ?, ?, ?, NOW())`,
      [container_name, area_name, areaBarangayId]
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
    device_id: device_id ?? null,
    latitude: areaLat,
    longitude: areaLon,
    barangay_id: areaBarangayId,
  };
}

export async function listContainers() {
  const [rows]: any = await pool.query(
    `SELECT
       wc.container_id,
       wc.container_name,
       wc.deployment_date,
       wc.status,
       wc.device_id,
       a.Area_id AS area_id,
       a.Area_Name AS area_name,
       a.Full_Address AS full_address,
       a.Latitude AS latitude,
       a.Longitude AS longitude,
       wc.current_weight_kg AS current_kg,
       wc.last_weight_at AS last_weight_at,
       CASE
         WHEN wc.device_id IS NULL THEN 0
         WHEN wc.last_weight_at IS NULL THEN 0
         ELSE 1
       END AS has_weight_data,
       CASE
         WHEN wc.device_id IS NULL THEN 'No data'
         WHEN wc.last_weight_at IS NULL THEN 'No data'
         WHEN wc.current_weight_kg IS NULL OR wc.current_weight_kg <= 0 THEN CONCAT('Empty • ', FORMAT(0, 2), ' kg')
         WHEN wc.current_weight_kg >= 20 THEN CONCAT('Full • ', FORMAT(wc.current_weight_kg, 2), ' kg')
         ELSE CONCAT('Has waste • ', FORMAT(wc.current_weight_kg, 2), ' kg')
       END AS status_label
     FROM waste_containers_tbl wc
     LEFT JOIN area_tbl a ON wc.area_id = a.Area_id
     ORDER BY wc.container_id DESC`
  );

  return rows;
}

export async function updateContainerLocation(
  container_id: number,
  latitude: number,
  longitude: number,
  address?: string
) {
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
    throw new Error("Invalid latitude or longitude.");
  }

  // Get the area_id for this container
  const [containerRows]: any = await pool.query(
    "SELECT area_id FROM waste_containers_tbl WHERE container_id = ? LIMIT 1",
    [container_id]
  );

  if (!containerRows || containerRows.length === 0) {
    throw new Error("Container not found.");
  }

  const areaId = containerRows[0].area_id;

  // Build update query
  if (address && address.trim()) {
    await pool.query(
      "UPDATE area_tbl SET Latitude = ?, Longitude = ?, Full_Address = ? WHERE Area_id = ?",
      [latitude, longitude, address.trim(), areaId]
    );
  } else {
    await pool.query(
      "UPDATE area_tbl SET Latitude = ?, Longitude = ? WHERE Area_id = ?",
      [latitude, longitude, areaId]
    );
  }

  return { container_id, latitude, longitude, address: address || undefined };
}