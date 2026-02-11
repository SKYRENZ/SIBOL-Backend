import { Router } from 'express';
import {
  handleUpdateProfile,
  handleGetProfile,
  handleGetMyPoints,
  handleGetMyProfile,
  handleUpdateMyProfile
} from '../controllers/profileController';
import * as uploadCtrl from '../controllers/uploadController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// ✅ NEW: Get authenticated user's points (requires auth)
router.get('/points', authenticate, handleGetMyPoints);

// ✅ NEW: logged-in user's profile
router.get('/me', authenticate, handleGetMyProfile);
router.put('/me', authenticate, handleUpdateMyProfile);

// upload profile image (authenticated)
router.post('/me/image', authenticate, uploadCtrl.profileImageUploadMiddleware, uploadCtrl.uploadProfileImage);

// existing
router.get('/:accountId', handleGetProfile);
router.put('/:accountId', authenticate, handleUpdateProfile);

export default router;