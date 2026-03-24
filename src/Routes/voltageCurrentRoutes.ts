// routes/voltageCurrentRoutes.ts
import { Router } from 'express';
import { VoltageCurrentController } from '../controllers/voltageCurrentController';

const router = Router();

// POST /api/voltage-current - Receive sensor data from ESP32
router.post('/', VoltageCurrentController.receiveSensorData);

// GET /api/voltage-current - Get latest sensor readings
router.get('/', VoltageCurrentController.getLatestData);

// GET /api/voltage-current/devices - Get all devices
router.get('/devices', VoltageCurrentController.getDevices);

// GET /api/voltage-current/:deviceId/stats - Get device statistics
router.get('/:deviceId/stats', VoltageCurrentController.getDeviceStats);

export default router;
