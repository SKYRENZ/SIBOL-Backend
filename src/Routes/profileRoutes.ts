import { Router } from 'express';
import { handleUpdateProfile, handleGetProfile, handleGetMyPoints } from '../controllers/profileController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// ✅ NEW: Get authenticated user's points (requires auth)
router.get('/points', authenticate, handleGetMyPoints);

// GET /api/profile/:accountId - fetch profile (public, for schedules)
router.get('/:accountId', handleGetProfile);

// PUT /api/profile/:accountId - update user's profile (requires auth)
router.put('/:accountId', authenticate, handleUpdateProfile);

export default router;