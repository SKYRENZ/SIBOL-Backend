// Routes/S1_esp32Routes.ts
import { Router } from 'express';
import { S1_ESP32Controller } from '../controllers/S1_esp32Controller';

const router = Router();

// POST: Receive sensor data from ESP32
router.post('/data', S1_ESP32Controller.receiveSensorData);

// GET: Retrieve latest sensor data
router.get('/data', S1_ESP32Controller.getLatestData);

// GET: Get data for specific device
router.get('/device/:deviceId', S1_ESP32Controller.getDeviceData);

// POST: Send command to ESP32
router.post('/command', S1_ESP32Controller.sendCommand);

// GET: Get pending commands for a device (for ESP32 to poll)
router.get('/commands/:deviceId', S1_ESP32Controller.getPendingCommands);

// PUT: Mark command as executed
router.put('/command/:commandId/executed', S1_ESP32Controller.markCommandExecuted);

export default router;