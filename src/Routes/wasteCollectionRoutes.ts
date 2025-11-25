import { Router } from 'express';
import { createCollection } from '../controllers/wasteCollectionController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// POST /api/waste-collections
router.post('/', authenticate, createCollection);

export default router;