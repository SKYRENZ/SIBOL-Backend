import express from 'express';
import { getConversion, updateConversion, getConversionAudit } from '../controllers/conversionController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// GET current conversion (public)
router.get('/', getConversion);

// GET audit history (public or restrict if needed)
router.get('/audit', getConversionAudit);

// PUT update conversion (require authentication)
router.put('/', authenticate, updateConversion);

export default router;