import { Router } from 'express';
import {
  containersGeoJSON,
  containerGeoJSONById,
  geocodeReverse,
  geocodeSearch,
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

/**
 * Geocode proxy endpoints to avoid browser CORS/rate-limit issues.
 * GET /api/map/geocode/search?query=...
 * GET /api/map/geocode/reverse?lat=...&lon=...
 */
router.get('/geocode/search', geocodeSearch);
router.get('/geocode/reverse', geocodeReverse);

export default router;
