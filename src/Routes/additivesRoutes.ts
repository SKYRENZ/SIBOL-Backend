import { Router } from 'express';
import * as controller from '../controllers/additivesController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

/**
 * GET /api/additives/types
 * returns active additive types
 */
router.get('/types', controller.listAdditiveTypes);

/**
 * POST /api/additives
 * body: { machine_id, additive_type_id, stage?, value, units }
 * date/time auto-set on server, operator from auth
 */
router.post('/', authenticate, controller.createAdditive);

/**
 * GET /api/additives
 * optional query: ?machine_id=1
 */
router.get('/', controller.listAdditives);

export default router;