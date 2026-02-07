import type { Request, Response } from 'express';
import * as S3Service from '../services/S3_sensorsService';

export class S3_SensorsController {
  // POST /data - receive sensor payload (from device)
  static async createReading(req: Request, res: Response) {
    try {
      const {
        machineId,
        pressureSensor,
        phSensor,
        tempSensor,
        methaneSensor,
        timestamp
      } = req.body;

      if (!machineId) {
        return res.status(400).json({ success: false, message: 'machineId is required' });
      }

      const result = await S3Service.insertSensorReading({
        machineId: Number(machineId),
        pressureSensor: pressureSensor != null ? Number(pressureSensor) : null,
        phSensor: phSensor != null ? Number(phSensor) : null,
        tempSensor: tempSensor != null ? Number(tempSensor) : null,
        methaneSensor: methaneSensor != null ? Number(methaneSensor) : null,
        timestamp: timestamp || undefined
      });

      return res.status(201).json({
        success: true,
        message: 'Sensor reading saved',
        data: result.data,
        id: result.insertId
      });
    } catch (err) {
      console.error('S3_SensorsController.createReading error:', err);
      return res.status(500).json({ success: false, message: 'Failed to save sensor reading', error: err instanceof Error ? err.message : String(err) });
    }
  }

  // GET /data?machineId=123&limit=50 - get latest readings for a machine
  static async getLatest(req: Request, res: Response) {
    try {
      const machineId = Number(req.query.machineId);
      const limit = Number(req.query.limit) || 100;

      if (!machineId || isNaN(machineId)) {
        return res.status(400).json({ success: false, message: 'machineId query param is required' });
      }

      const result = await S3Service.getLatestReadingsByMachine(machineId, limit);
      return res.json(result);
    } catch (err) {
      console.error('S3_SensorsController.getLatest error:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch readings', error: err instanceof Error ? err.message : String(err) });
    }
  }
}