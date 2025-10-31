import { Router } from 'express';
import * as googleController from '../controllers/googlemobileController';

const router = Router();

router.post('/sso-google', googleController.googleMobileSignIn);

export default router;