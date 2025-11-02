import express from 'express';
import { scanQr } from '../controllers/qrController';

const router = express.Router();

// Optionally add auth middleware here
router.post('/scan', scanQr);

export default router;