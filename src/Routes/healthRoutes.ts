import { Router } from 'express';
import { healthCheck } from '../controllers/healthController.js';

const router = Router();

// GET /api/health
router.get('/', healthCheck);

export default router;