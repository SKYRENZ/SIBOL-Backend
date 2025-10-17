import { Router } from 'express';
import * as authController from '../controllers/authController';

const router = Router();

// POST /api/auth/register
router.post('/register', authController.register);

// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', authController.verifyEmail);

// POST /api/auth/resend-verification
router.post('/resend-verification', authController.resendVerification);

// GET /api/auth/check-status/:username
router.get('/check-status/:username', authController.checkStatus);

// POST /api/auth/login
router.post('/login', authController.login);

export default router;