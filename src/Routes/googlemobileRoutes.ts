import { Router } from 'express';
import { handleGoogleAuth, handleGoogleCodeAuth } from '../controllers/googlemobileController';

const router = Router();

// POST /api/auth/sso-google - Direct ID token authentication
router.post('/sso-google', handleGoogleAuth);

// POST /api/auth/sso-google-code - Authorization code flow
router.post('/sso-google-code', handleGoogleCodeAuth);

export default router;