import { Router } from 'express';
import * as machineAuthController from '../controllers/machineAuthController';
import { authenticateMachine } from '../middleware/authenticateMachine';

const router = Router();

// POST /api/machine-auth/login - Device authentication
router.post('/login', machineAuthController.authenticateDevice);

// GET /api/machine-auth/verify - Verify device token
router.get('/verify', authenticateMachine, machineAuthController.verifyDevice);

export default router;
