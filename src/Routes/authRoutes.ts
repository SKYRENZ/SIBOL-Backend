import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticate } from '../middleware/authenticate';
import { signupAttachmentMiddleware } from '../controllers/uploadController';

const router = Router();

// Signup/Register (alias)
router.post('/register', signupAttachmentMiddleware, authController.register);
router.post('/signup', signupAttachmentMiddleware, authController.register);

// Login
router.post('/login', authController.login);

// Email verification (link + resend)
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);

// Status + dropdown
router.get('/check-status/:username', authController.checkStatus);
router.get('/barangays', authController.getBarangays);

// SSO eligibility
router.post('/check-sso-eligibility', authController.checkSSOEligibility);

// Password reset
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-reset-code', authController.verifyResetCode);
router.post('/reset-password', authController.resetPassword);

// Mobile email-code verification
router.post('/send-verification-code', authController.sendVerificationCode);
router.post('/verify-email-code', authController.verifyVerificationCode);

// Protected
router.get('/verify', authenticate, authController.verifyToken);
router.post('/change-password', authenticate, authController.changePassword);

// Queue position (your choice: public or protected)
// If it’s sensitive, protect it. If it’s meant for pre-login pending users, keep it public.
router.get('/queue-position', authController.getQueuePosition);

export default router;