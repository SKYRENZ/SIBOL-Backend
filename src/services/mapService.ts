import { pool } from '../config/db';

type DBRow = {
  container_id: number;
  container_name?: string | null;
  area_name?: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  status?: string | null;
  deployment_date?: string | null;
  full_address?: string | null;
};

function toFeature(r: DBRow) {
  const lat = Number(r.latitude);
  const lon = Number(r.longitude);
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [lon, lat],
    },
    properties: {
      id: Number(r.container_id),
      name: r.container_name ?? null,
      area: r.area_name ?? null,
      status: r.status ?? null,
      deployment_date: r.deployment_date ?? null,
      full_address: r.full_address ?? null,
    },
  };
}

const emptyFC = { type: 'FeatureCollection', features: [] as any[] };

export async function getAllContainersGeoJSON() {
  const sql = `
    SELECT
      container_id,
      container_name,
      area_name,
      latitude,
      longitude,
      status,
      deployment_date,
      full_address
    FROM waste_container_tbl
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `;
  let conn: any;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.query(sql, []) as any;
    console.debug('mapService.getAllContainersGeoJSON rows:', Array.isArray(rows) ? rows.length : typeof rows);
    const features = (rows as DBRow[])
      .map(toFeature)
      .filter(f => Number.isFinite(f.geometry.coordinates[0]) && Number.isFinite(f.geometry.coordinates[1]));
    console.debug('mapService.getAllContainersGeoJSON features:', features.length);
    return { type: 'FeatureCollection', features };
  } catch (err: any) {
    console.error('getAllContainersGeoJSON error:', err);
    return emptyFC;
  } finally {
    try { conn?.release(); } catch {}
  }
}

export async function getContainerGeoJSONById(containerId: number) {
  const sql = `
    SELECT
      container_id,
      container_name,
      area_name,
      latitude,
      longitude,
      status,
      deployment_date,
      full_address
    FROM waste_container_tbl
    WHERE container_id = ?
      AND latitude IS NOT NULL AND longitude IS NOT NULL
    LIMIT 1
  `;
  let conn: any;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.query(sql, [containerId]) as any;
    const row = (rows as DBRow[])[0];
    if (!row) return null;
    return { type: 'FeatureCollection', features: [toFeature(row)] };
  } catch (err: any) {
    console.error('getContainerGeoJSONById error:', err && err.stack ? err.stack : err);
    return null;
  } finally {
    try { conn?.release(); } catch {}
  }
}

/**
 * minLat, maxLat, minLon, maxLon
 */
export async function getContainersWithinBBox(minLat: number, maxLat: number, minLon: number, maxLon: number, limit = 1000) {
  const sql = `
    SELECT
      container_id,
      container_name,
      area_name,
      latitude,
      longitude,
      status,
      deployment_date,
      full_address
    FROM waste_container_tbl
    WHERE latitude BETWEEN ? AND ?
      AND longitude BETWEEN ? AND ?
    LIMIT ?
  `;
  let conn: any;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.query(sql, [minLat, maxLat, minLon, maxLon, Number(limit)]) as any;
    const features = (rows as DBRow[])
      .map(toFeature)
      .filter(f => Number.isFinite(f.geometry.coordinates[0]) && Number.isFinite(f.geometry.coordinates[1]));
    return { type: 'FeatureCollection', features };
  } catch (err: any) {
    console.error('getContainersWithinBBox error:', err && err.stack ? err.stack : err);
    return emptyFC;
  } finally {
    try { conn?.release(); } catch {}
  }
}