import { Router } from 'express';
import { getShareBridge } from '../controllers/shareController.js';

const router = Router();

// Public endpoint for social crawlers to read OG tags, then redirect users to frontend app.
router.get('/bridge', getShareBridge);

export default router;
