import { Router } from 'express';
import { createCollection } from '../controllers/wasteCollectionController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// POST /api/waste-collections
router.post('/', authenticate, createCollection);

// Listing collections by area is now provided by areaController (GET /api/areas/:id/logs)

export default router;