// controllers/S1_esp32Controller.ts
import type { Request, Response } from 'express';
import { pool } from '../config/db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

interface SensorData {
  weight?: number;
  timestamp: string;
  deviceId: string;
}

export class S1_ESP32Controller {
  // Receive sensor data from ESP32
  static async receiveSensorData(req: Request, res: Response): Promise<void> {
    try {
      const { weight, deviceId = 'esp32-default' } = req.body;

      // Validate data
      if (weight === undefined) {
        res.status(400).json({ error: 'Weight data is required' });
        return;
      }

      // Insert into database
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO esp32_sensor_data (device_id, weight, created_at) 
         VALUES (?, ?, NOW())`,
        [deviceId, weight]
      );

      const sensorData = {
        id: result.insertId,
        deviceId,
        weight,
        timestamp: new Date().toISOString()
      };

      console.log('📊 Received weight data:', sensorData);

      res.status(201).json({
        success: true,
        message: 'Weight data received',
        data: sensorData
      });

    } catch (error) {
      console.error('Error processing sensor data:', error);
      res.status(500).json({ error: 'Failed to process sensor data' });
    }
  }

  // Get latest sensor readings
  static async getLatestData(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const deviceId = req.query.deviceId as string;

      let query = `
        SELECT id, device_id as deviceId, weight, 
               created_at as timestamp 
        FROM esp32_sensor_data
      `;
      const params: any[] = [];

      if (deviceId) {
        query += ' WHERE device_id = ?';
        params.push(deviceId);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const [rows] = await pool.execute<RowDataPacket[]>(query, params);

      res.json({
        count: rows.length,
        data: rows
      });

    } catch (error) {
      console.error('Error fetching sensor data:', error);
      res.status(500).json({ error: 'Failed to fetch sensor data' });
    }
  }

  // Get specific device data
  static async getDeviceData(req: Request, res: Response): Promise<void> {
    try {
      const { deviceId } = req.params;

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, device_id as deviceId, weight, 
                created_at as timestamp 
         FROM esp32_sensor_data 
         WHERE device_id = ? 
         ORDER BY created_at DESC`,
        [deviceId]
      );

      if (rows.length === 0) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }

      res.json({
        deviceId,
        count: rows.length,
        latestReading: rows[0],
        allReadings: rows
      });

    } catch (error) {
      console.error('Error fetching device data:', error);
      res.status(500).json({ error: 'Failed to fetch device data' });
    }
  }

  // Send command to ESP32
  static async sendCommand(req: Request, res: Response): Promise<void> {
    try {
      const { command, value, deviceId = 'esp32-default' } = req.body;

      if (!command) {
        res.status(400).json({ error: 'Command is required' });
        return;
      }

      // Store command in database for ESP32 to poll
      await pool.execute<ResultSetHeader>(
        `INSERT INTO esp32_commands (device_id, command, value, status, created_at) 
         VALUES (?, ?, ?, 'pending', NOW())`,
        [deviceId, command, value || null]
      );

      console.log('📤 Sending command:', { command, value, deviceId });

      res.json({
        success: true,
        message: 'Command queued',
        command,
        value,
        deviceId
      });

    } catch (error) {
      console.error('Error sending command:', error);
      res.status(500).json({ error: 'Failed to send command' });
    }
  }

  // Get pending commands for ESP32 to poll
  static async getPendingCommands(req: Request, res: Response): Promise<void> {
    try {
      const { deviceId } = req.params;

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, device_id as deviceId, command, value, created_at as timestamp 
         FROM esp32_commands 
         WHERE device_id = ? AND status = 'pending' 
         ORDER BY created_at ASC`,
        [deviceId]
      );

      res.json({
        count: rows.length,
        commands: rows
      });

    } catch (error) {
      console.error('Error fetching commands:', error);
      res.status(500).json({ error: 'Failed to fetch commands' });
    }
  }

  // Mark command as executed
  static async markCommandExecuted(req: Request, res: Response): Promise<void> {
    try {
      const { commandId } = req.params;

      await pool.execute<ResultSetHeader>(
        `UPDATE esp32_commands 
         SET status = 'executed', executed_at = NOW() 
         WHERE id = ?`,
        [commandId]
      );

      res.json({
        success: true,
        message: 'Command marked as executed'
      });

    } catch (error) {
      console.error('Error updating command status:', error);
      res.status(500).json({ error: 'Failed to update command status' });
    }
  }
}