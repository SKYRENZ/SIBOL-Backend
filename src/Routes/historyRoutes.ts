import express from 'express';
import { authenticate } from '../middleware/authenticate';
import * as historyController from '../controllers/historyController';

const router = express.Router();

router.use(authenticate);

// GET /history?limit=20&cursor=2026-02-07T00:00:00.000Z (cursor uses createdAt)
router.get('/', historyController.listMyHistory);

export default router;