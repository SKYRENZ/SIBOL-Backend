import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticate } from '../middleware/authenticate';

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

// NEW: Check if email is eligible for SSO
router.post('/check-sso-eligibility', authController.checkSSOEligibility);

router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-reset-code', authController.verifyResetCode);
router.post('/reset-password', authController.resetPassword);

// GET /api/auth/barangays - returns active barangays for signup dropdown
router.get('/barangays', authController.getBarangays);

// PUBLIC (signup maps to `register` which is exported by the controller)
router.post('/signup', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);

// PROTECTED ones should use middleware individually
// router.get('/me', authenticate, getMe);

// POST /api/auth/send-verification-code
router.post('/send-verification-code', authController.sendVerificationCode);
// POST /api/auth/verify-email-code (client sends { email, code })
router.post('/verify-email-code', authController.verifyVerificationCode);

// Token verification endpoint (PROTECTED)
router.get('/verify', authenticate, authController.verifyToken);

// POST /api/auth/change-password (PROTECTED)
router.post('/change-password', authenticate, authController.changePassword);

// GET /api/auth/queue-position - Get queue position for pending account
router.get('/queue-position', authController.getQueuePosition);

export default router;