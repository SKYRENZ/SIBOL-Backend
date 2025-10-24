import { Router } from 'express';
import FiltersController from '../controllers/filtersController';

const router = Router();

/**
 * GET /api/filters
 * returns grouped filters
 */
router.get('/', FiltersController.getAll);

/**
 * GET /api/filters/:type
 * types: machine-status | maintenance-priority | maintenance-status | schedule-status
 */
router.get('/:type', FiltersController.getByType);

export default router;