import jwt from 'jsonwebtoken';
import { pool } from '../config/db';
import config from '../config/env';
import type { RowDataPacket } from 'mysql2/promise';

export interface DeviceAuthInput {
  deviceId: string;
  macAddress?: string;
}

export interface DeviceAuthResult {
  success: true;
  token: string;
  machineId: number;
  deviceId: string;
}

export async function authenticateDevice(input: DeviceAuthInput): Promise<DeviceAuthResult> {
  const { deviceId, macAddress } = input;

  // TODO: Placeholder - accept all devices during provisioning
  // No validation for now, just generate token
  
  // Generate device token
  const SECRET = config.JWT_SECRET + '_DEVICE';
  const token = jwt.sign(
    { 
      deviceId: deviceId || macAddress,
      macAddress,
      type: 'device'
    },
    SECRET,
    { expiresIn: '30d' } // Longer expiry for devices
  );

  return {
    success: true,
    token,
    machineId: 0, // Placeholder
    deviceId: deviceId || macAddress || 'unknown'
  };
}

export async function verifyDeviceToken(token: string) {
  const SECRET = config.JWT_SECRET + '_DEVICE';
  const decoded: any = jwt.verify(token, SECRET);
  
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT Machine_id, Device_id FROM machine_tbl WHERE Machine_id = ? AND Status = 1',
    [decoded.machineId]
  );
  
  if (!rows || rows.length === 0 || !rows[0]) {
    throw new Error('Device not found or inactive');
  }

  return rows[0];
}

export async function verifyDeviceByKey(deviceId: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT Machine_id, Device_id FROM machine_tbl WHERE Device_id = ? AND Status = 1',
    [deviceId]
  );
  
  if (!rows || rows.length === 0 || !rows[0]) {
    throw new Error('Invalid device key');
  }

  return rows[0];
}

export async function verifyDeviceById(deviceId: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT Machine_id, Device_id FROM machine_tbl WHERE Device_id = ? AND Status = 1',
    [deviceId]
  );
  
  if (!rows || rows.length === 0 || !rows[0]) {
    throw new Error('Device not found or inactive');
  }

  return rows[0];
}
