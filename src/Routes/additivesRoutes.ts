import { Router } from 'express';
import * as controller from '../controllers/additivesController';

const router = Router();

/**
 * POST /api/additives
 * body: {
 *  machine_id, additive_input, stage, value, units, date (YYYY-MM-DD), time (HH:MM), person_in_charge
 * }
 */
router.post('/', controller.createAdditive);

/**
 * GET /api/additives
 * optional query: ?machine_id=1
 * returns additives ordered by machine_id, date desc, time desc and includes machine_name
 */
router.get('/', controller.listAdditives);

export default router;