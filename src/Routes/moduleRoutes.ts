import express from 'express';
import { getAllModules, getAllowedModules } from '../controllers/moduleController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = express.Router();

router.get('/', getAllModules);                   // public listing (admin UI)
router.get('/allowed', authenticate, getAllowedModules); // current user's allowed web modules

export default router;