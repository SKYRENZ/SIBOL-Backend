// controllers/voltageCurrentController.ts
import type { Request, Response } from 'express';
import { pool } from '../config/db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

interface VoltageCurrentData {
  voltage: number;
  current: number;
  deviceId: string;
  timestamp?: string | number;
  cumulativeKwh?: number;
  intervalKwh?: number;
}

function isMissingColumnError(error: any): boolean {
  return (
    error?.code === 'ER_BAD_FIELD_ERROR' ||
    error?.sqlState === '42S22' ||
    String(error?.message || '').toLowerCase().includes('unknown column')
  );
}

function normalizeMeasurementTimestamp(input: unknown): Date {
  if (input === undefined || input === null || input === '') {
    return new Date();
  }

  // Handle numeric payloads safely (ESP32 may send uptime millis instead of epoch time).
  const asNumber = Number(input);
  if (Number.isFinite(asNumber)) {
    // Likely unix milliseconds.
    if (asNumber > 946684800000 && asNumber < 4102444800000) {
      return new Date(asNumber);
    }
    // Likely unix seconds.
    if (asNumber > 946684800 && asNumber < 4102444800) {
      return new Date(asNumber * 1000);
    }
    // Fallback for device uptime counters and other non-epoch values.
    return new Date();
  }

  const parsed = new Date(String(input));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export class VoltageCurrentController {
  // Receive voltage and current data from ESP32
  static async receiveSensorData(req: Request, res: Response): Promise<void> {
    try {
      const { voltage, current, deviceId = 'esp32-default', timestamp, cumulativeKwh = 0, intervalKwh = 0 } = req.body;

      // Validate data
      if (voltage === undefined || current === undefined) {
        res.status(400).json({ error: 'Voltage and current data are required' });
        return;
      }

      const voltageNum = Number(voltage);
      const currentNum = Number(current);

      if (!Number.isFinite(voltageNum) || !Number.isFinite(currentNum)) {
        res.status(400).json({ error: 'Voltage and current must be valid numbers' });
        return;
      }

      const cumulativeKwhNum = Number(cumulativeKwh);
      const intervalKwhNum = Number(intervalKwh);

      if (!Number.isFinite(cumulativeKwhNum) || !Number.isFinite(intervalKwhNum)) {
        res.status(400).json({ error: 'cumulativeKwh and intervalKwh must be valid numbers' });
        return;
      }

      // Validate reasonable ranges
      if (voltageNum < 0 || voltageNum > 500 || currentNum < 0 || currentNum > 100) {
        res.status(400).json({ error: 'Values out of reasonable range (Voltage: 0-500V, Current: 0-100A)' });
        return;
      }

      // Calculate power
      const power = voltageNum * currentNum;
      const measurementTimestamp = normalizeMeasurementTimestamp(timestamp);

      // Insert into database. Prefer energy columns; gracefully fallback for older schemas.
      let result: ResultSetHeader;
      try {
        const [insertWithEnergy] = await pool.execute<ResultSetHeader>(
          `INSERT INTO voltage_current_sensor_tbl (device_id, voltage, current, timestamp, cumulative_kwh, interval_kwh) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [deviceId, voltageNum, currentNum, measurementTimestamp, cumulativeKwhNum, intervalKwhNum]
        );
        result = insertWithEnergy;
      } catch (insertError: any) {
        if (!isMissingColumnError(insertError)) {
          throw insertError;
        }

        const [insertLegacy] = await pool.execute<ResultSetHeader>(
          `INSERT INTO voltage_current_sensor_tbl (device_id, voltage, current, timestamp) 
           VALUES (?, ?, ?, ?)`,
          [deviceId, voltageNum, currentNum, measurementTimestamp]
        );
        result = insertLegacy;
      }

      // Update device last seen (non-critical path; do not fail ingestion on metadata issues).
      try {
        await pool.execute<ResultSetHeader>(
          `INSERT INTO esp32_devices_tbl (device_id, last_seen) 
           VALUES (?, NOW()) 
           ON DUPLICATE KEY UPDATE last_seen = NOW()`,
          [deviceId]
        );
      } catch (deviceError) {
        console.warn('Warning: failed to update esp32_devices_tbl for', deviceId, deviceError);
      }

      const sensorData = {
        id: result.insertId,
        deviceId,
        voltage: voltageNum,
        current: currentNum,
        power,
        timestamp: measurementTimestamp.toISOString()
      };

      console.log('⚡ Received voltage/current data:', sensorData);

      res.status(201).json({
        success: true,
        message: 'Voltage and current data received',
        data: sensorData
      });

    } catch (error: any) {
      console.error('Error processing voltage/current data:', {
        message: error?.message,
        code: error?.code,
        sqlMessage: error?.sqlMessage,
        sqlState: error?.sqlState
      });
      res.status(500).json({ error: 'Failed to process sensor data' });
    }
  }

  // Get latest sensor readings
  static async getLatestData(req: Request, res: Response): Promise<void> {
    try {
      const parsedLimit = Number.parseInt(String(req.query.limit ?? ''), 10);
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 500)
        : 10;
      const deviceId = req.query.deviceId as string;

      let query = `
         SELECT id, device_id as deviceId, voltage, current,
           (voltage * current) as power,
               timestamp, created_at as createdAt,
               cumulative_kwh as cumulativeKwh, interval_kwh as intervalKwh
        FROM voltage_current_sensor_tbl
      `;
      const params: any[] = [];

      if (deviceId) {
        query += ' WHERE device_id = ?';
        params.push(deviceId);
      }

      // NOTE: Some MySQL environments reject prepared placeholders in LIMIT.
      query += ` ORDER BY timestamp DESC LIMIT ${limit}`;

      let rows: RowDataPacket[];
      try {
        const [resultRows] = await pool.execute<RowDataPacket[]>(query, params);
        rows = resultRows;
      } catch (selectError: any) {
        if (!isMissingColumnError(selectError)) {
          throw selectError;
        }

        let fallbackQuery = `
           SELECT id, device_id as deviceId, voltage, current,
             (voltage * current) as power,
                 timestamp, created_at as createdAt,
                 0 as cumulativeKwh, 0 as intervalKwh
          FROM voltage_current_sensor_tbl
        `;
        const fallbackParams: any[] = [];

        if (deviceId) {
          fallbackQuery += ' WHERE device_id = ?';
          fallbackParams.push(deviceId);
        }

        fallbackQuery += ` ORDER BY timestamp DESC LIMIT ${limit}`;

        const [fallbackRows] = await pool.execute<RowDataPacket[]>(fallbackQuery, fallbackParams);
        rows = fallbackRows;
      }

      res.json({
        count: rows.length,
        data: rows
      });

    } catch (error) {
      console.error('Error fetching voltage/current data:', error);
      res.status(500).json({ error: 'Failed to fetch sensor data' });
    }
  }

  // Get device statistics
  static async getDeviceStats(req: Request, res: Response): Promise<void> {
    try {
      const { deviceId } = req.params;
      const hours = parseInt(req.query.hours as string) || 24;

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          AVG(voltage) as avgVoltage,
          AVG(current) as avgCurrent,
          AVG(voltage * current) as avgPower,
          MAX(voltage) as maxVoltage,
          MAX(current) as maxCurrent,
          MAX(voltage * current) as maxPower,
          MIN(voltage) as minVoltage,
          MIN(current) as minCurrent,
          MIN(voltage * current) as minPower,
          COUNT(*) as readingCount
        FROM voltage_current_sensor_tbl 
        WHERE device_id = ? 
        AND timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
        [deviceId, hours]
      );

      const stats = rows[0] ?? ({} as RowDataPacket);

      res.json({
        deviceId,
        period: `Last ${hours} hours`,
        statistics: {
          average: {
            voltage: Number(stats.avgVoltage) || 0,
            current: Number(stats.avgCurrent) || 0,
            power: Number(stats.avgPower) || 0
          },
          maximum: {
            voltage: Number(stats.maxVoltage) || 0,
            current: Number(stats.maxCurrent) || 0,
            power: Number(stats.maxPower) || 0
          },
          minimum: {
            voltage: Number(stats.minVoltage) || 0,
            current: Number(stats.minCurrent) || 0,
            power: Number(stats.minPower) || 0
          },
          readingCount: Number(stats.readingCount) || 0
        }
      });

    } catch (error) {
      console.error('Error fetching device statistics:', error);
      res.status(500).json({ error: 'Failed to fetch device statistics' });
    }
  }

  // Get all devices
  static async getDevices(req: Request, res: Response): Promise<void> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT device_id as deviceId, device_name, location, is_active, last_seen, created_at
         FROM esp32_devices_tbl
         ORDER BY last_seen DESC`
      );

      res.json({
        count: rows.length,
        devices: rows
      });

    } catch (error) {
      console.error('Error fetching devices:', error);
      res.status(500).json({ error: 'Failed to fetch devices' });
    }
  }
}
