import { Router } from 'express';
import {
  handleUpdateProfile,
  handleGetProfile,
  handleGetMyPoints,
  handleGetMyProfile,
  handleUpdateMyProfile
} from '../controllers/profileController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// ✅ NEW: Get authenticated user's points (requires auth)
router.get('/points', authenticate, handleGetMyPoints);

// ✅ NEW: logged-in user's profile
router.get('/me', authenticate, handleGetMyProfile);
router.put('/me', authenticate, handleUpdateMyProfile);

// existing
router.get('/:accountId', handleGetProfile);
router.put('/:accountId', authenticate, handleUpdateProfile);

export default router;