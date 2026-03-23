import { Router } from 'express';
import { CollectionLogController } from '../controllers/collectionLogController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// Log a new waste collection
router.post('/log', authenticate, CollectionLogController.logCollection);

// Get collection logs for an operator
router.get('/operator/:operator_id', authenticate, CollectionLogController.getOperatorCollections);

// Get collection logs for an area
router.get('/area/:area_id', authenticate, CollectionLogController.getAreaCollections);

// Get collection statistics
router.get('/stats', authenticate, CollectionLogController.getCollectionStats);

export default router;
