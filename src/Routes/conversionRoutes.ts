import express from 'express';
import { getConversion, updateConversion, getConversionAudit } from '../controllers/conversionController';

const router = express.Router();

// GET current conversion
router.get('/', getConversion);

// GET audit history
router.get('/audit', getConversionAudit);

// PUT update conversion (admin only: add auth middleware in production)
router.put('/', updateConversion);

export default router;