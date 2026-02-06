import { Request, Response } from 'express';
import * as https from 'https';
import {
  getAllContainersGeoJSON,
  getContainerGeoJSONById,
  getContainersWithinBBox,
} from '../services/mapService';

type BBox = { minLat: number; maxLat: number; minLon: number; maxLon: number } | null;

function parseBBox(raw?: unknown): BBox {
  if (!raw) return null;
  const s = Array.isArray(raw) ? String(raw[0]) : String(raw);
  if (!s) return null;
  const parts = s.split(',').map(p => Number(p.trim()));
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts;
  return {
    minLat: Number(minLat),
    maxLat: Number(maxLat),
    minLon: Number(minLon),
    maxLon: Number(maxLon),
  };
}

export async function containersGeoJSON(req: Request, res: Response) {
  try {
    console.debug('map.containersGeoJSON query=', req.query);

    const bbox = parseBBox(req.query.bbox);
    if (bbox) {
      const limitRaw = Array.isArray(req.query.limit) ? String(req.query.limit[0]) : String(req.query.limit ?? '1000');
      const limit = Math.max(1, Math.min(5000, Number(limitRaw) || 1000));

      // non-null assert to satisfy TS (we already checked bbox is truthy)
      const { minLat, maxLat, minLon, maxLon } = bbox;
      if (![minLat, maxLat, minLon, maxLon].every(n => Number.isFinite(n))) {
        return res.status(400).json({ error: 'invalid_bbox' });
      }

      const fc = await getContainersWithinBBox(minLat, maxLat, minLon, maxLon, limit);
      return res.json(fc);
    }

    const fc = await getAllContainersGeoJSON();
    return res.json(fc);
  } catch (err: any) {
    console.error('containersGeoJSON error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'internal_server_error', message: String(err?.message ?? err) });
  }
}

export async function containerGeoJSONById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const fc = await getContainerGeoJSONById(id);
    if (!fc) return res.status(404).json({ error: 'not_found' });
    return res.json(fc);
  } catch (err: any) {
    console.error('containerGeoJSONById error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'internal_server_error', message: String(err?.message ?? err) });
  }
}

export function tileProxy(req: Request, res: Response) {
  const z = Number.parseInt(String(req.params.z ?? ''), 10);
  const x = Number.parseInt(String(req.params.x ?? ''), 10);
  const y = Number.parseInt(String(req.params.y ?? ''), 10);

  if (![z, x, y].every(n => Number.isFinite(n))) {
    return res.status(400).send('invalid_tile_coords');
  }

  const sub = (x + y + z) % 3;
  const tileUrl = `https://${['a', 'b', 'c'][sub]}.tile.openstreetmap.org/${z}/${x}/${y}.png`;

  https.get(tileUrl, (tileRes) => {
    const status = tileRes?.statusCode ?? 502;
    if (status >= 400) {
      res.status(status).end();
      return;
    }
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'public, max-age=86400');
    tileRes.pipe(res);
  }).on('error', (e) => {
    console.error('tileProxy error', e);
    res.status(502).end();
  });
}