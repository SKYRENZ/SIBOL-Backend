import { Router } from 'express';
import { createCollection, getMyCollections, getTotalWaste, getMonthlyWaste } from '../controllers/wasteCollectionController';
import { authenticate } from '../middleware/authenticate';


const router = Router();

router.post('/', authenticate, createCollection);
router.get('/mine', authenticate, getMyCollections);
router.get('/total', authenticate, getTotalWaste);
router.get('/monthly', authenticate, getMonthlyWaste);

export default router;