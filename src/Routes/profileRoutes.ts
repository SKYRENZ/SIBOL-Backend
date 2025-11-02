import { Router } from 'express';
import { handleUpdateProfile, handleGetProfile } from '../controllers/profileController.js';

const router = Router();

// GET /api/profile/:accountId - fetch profile (public, for schedules)
router.get('/:accountId', handleGetProfile);

// PUT /api/profile/:accountId - update user's profile (requires auth)
router.put('/:accountId', handleUpdateProfile);

export default router;