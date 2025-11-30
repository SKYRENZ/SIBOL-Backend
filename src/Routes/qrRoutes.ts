import express from 'express';
import { scanQr } from '../controllers/qrController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// Optionally add auth middleware here
router.post('/scan', authenticate, scanQr);

export default router;