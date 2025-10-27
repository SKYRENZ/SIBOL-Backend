import { Router, Request, Response, NextFunction } from 'express';
import * as googleController from '../controllers/googleauthController';

const router = Router();

// Initiate Google OAuth
router.get('/google', googleController.googleAuthInit);

// Callback
router.get('/google/callback', googleController.googleAuthCallback);

// API endpoint to get current user session
router.get('/me', googleController.getMe);

// Logout endpoint
router.post('/logout', googleController.logout);

export default router;