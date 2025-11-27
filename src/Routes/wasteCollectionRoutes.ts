import { Router } from 'express';
import { createCollection, getCollectionsByArea } from '../controllers/wasteCollectionController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// POST /api/waste-collections
router.post('/', authenticate, createCollection);

// GET /api/waste-collections?area_id=1  (or /api/waste-collections/:area_id if you prefer)
router.get('/', authenticate, getCollectionsByArea);
// optional param route
router.get('/:area_id', authenticate, getCollectionsByArea);

export default router;