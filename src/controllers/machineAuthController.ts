import type { Request, Response } from 'express';
import * as machineAuthService from '../services/machineAuthService';

export async function authenticateDevice(req: Request, res: Response) {
  try {
    const { deviceId, macAddress } = req.body;

    const result = await machineAuthService.authenticateDevice({ deviceId, macAddress });

    return res.json(result);
  } catch (err) {
    console.error('machineAuthController.authenticateDevice error:', err);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication failed'
    });
  }
}

export async function verifyDevice(req: Request, res: Response) {
  try {
    const machine = (req as any).machine;
    
    return res.json({
      success: true,
      machine: {
        machineId: machine.Machine_id,
        deviceId: machine.Device_id
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Verification failed' });
  }
}
