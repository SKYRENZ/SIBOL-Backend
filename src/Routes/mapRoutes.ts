import { Router } from 'express';
import {
  containersGeoJSON,
  containerGeoJSONById,
  tileProxy,
} from '../controllers/mapController';

const router = Router();

/**
 * GET /api/map/containers.geojson
 * optional query: bbox=lonMin,latMin,lonMax,latMax
 */
router.get('/containers.geojson', containersGeoJSON);

/**
 * GET /api/map/container/:id.geojson
 */
router.get('/container/:id.geojson', containerGeoJSONById);

/**
 * Tile proxy (development)
 * GET /api/map/tiles/:z/:x/:y.png
 */
router.get('/tiles/:z/:x/:y.png', tileProxy);

export default router;