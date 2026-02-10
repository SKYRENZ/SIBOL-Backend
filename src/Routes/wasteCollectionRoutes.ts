import { Router } from 'express';
import { createCollection, getMyCollections, getTotalWaste } from '../controllers/wasteCollectionController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/', authenticate, createCollection);
router.get('/mine', authenticate, getMyCollections);
router.get('/total', authenticate, getTotalWaste);

export default router;