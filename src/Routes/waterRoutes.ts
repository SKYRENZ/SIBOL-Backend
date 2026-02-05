import { Router } from 'express';
import { analyzeWater } from '../controllers/waterController';

const router = Router();

router.post('/analyze-water', analyzeWater);

export default router;
