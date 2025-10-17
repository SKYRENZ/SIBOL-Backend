import { Router } from 'express';
import { handleUpdateProfile } from '../controllers/profileController.js';

const router = Router();

// PUT /api/profile/:accountId  - update user's profile (username/password + profile fields)
router.put('/:accountId', handleUpdateProfile);

export default router;