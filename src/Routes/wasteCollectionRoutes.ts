import { Router } from 'express';
import { createCollection, getMyCollections } from '../controllers/wasteCollectionController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// POST /api/waste-collections
router.post('/', authenticate, createCollection);

// GET /api/waste-collections/mine -> collections submitted by current logged-in operator
router.get('/mine', authenticate, getMyCollections);

// Listing collections by area is still provided by areaController (GET /api/areas/:id/logs)

export default router;