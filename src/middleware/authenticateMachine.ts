import { Request, Response, NextFunction } from 'express';
import * as machineAuthService from '../services/machineAuthService';

export async function authenticateMachine(req: Request, res: Response, next: NextFunction) {
  try {
    const apiKey = req.headers['x-device-key'] as string;
    const deviceId = req.headers['x-device-id'] as string;
    const token = req.headers['x-device-token'] as string;

    // Device ID authentication (preferred for sensor data POST)
    if (deviceId) {
      const machine = await machineAuthService.verifyDeviceById(deviceId);
      (req as any).machine = machine;
      return next();
    }

    // Simple API key validation
    if (apiKey) {
      const machine = await machineAuthService.verifyDeviceByKey(apiKey);
      (req as any).machine = machine;
      return next();
    }

    // JWT token validation
    if (token) {
      const machine = await machineAuthService.verifyDeviceToken(token);
      (req as any).machine = machine;
      return next();
    }

    return res.status(401).json({ success: false, message: 'Device authentication required' });
  } catch (err) {
    console.error('[machine auth] error:', err);
    return res.status(401).json({ success: false, message: 'Invalid device credentials' });
  }
}
