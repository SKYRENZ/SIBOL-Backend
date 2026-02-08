import { Router } from 'express';
import { S3_SensorsController } from '../controllers/S3_sensorsController';

const router = Router();

// POST: device -> send sensor data every 5 minutes
router.post('/data', S3_SensorsController.createReading);

// GET: retrieve latest readings for a machine
router.get('/data', S3_SensorsController.getLatest);

export default router;