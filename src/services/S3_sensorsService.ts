import { pool } from '../config/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface S3SensorInsertInput {
  machineId: number;
  pressureSensor?: number | null;
  phSensor?: number | null;
  tempSensor?: number | null;
  methaneSensor?: number | null;
  timestamp?: string; // ISO string or MySQL-compatible
}

export async function insertSensorReading(input: S3SensorInsertInput) {
  const {
    machineId,
    pressureSensor = null,
    phSensor = null,
    tempSensor = null,
    methaneSensor = null,
    timestamp = null
  } = input;

  if (!machineId || isNaN(machineId)) {
    throw new Error('Valid machineId is required');
  }

  try {
    // Verify machine exists
    const [machineRows]: any = await pool.execute<RowDataPacket[]>(
      'SELECT Machine_id FROM machine_tbl WHERE Machine_id = ?',
      [machineId]
    );
    if (!Array.isArray(machineRows) || machineRows.length === 0) {
      throw new Error('Machine not found');
    }

    // Insert reading
    const query = `
      INSERT INTO s3_sensor_tbl
        (Machine_id, Pressure_Sensor, Ph_Sensor, Temp_Sensor, Methane_Sensor, \`Timestamp\`)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [
      machineId,
      pressureSensor,
      phSensor,
      tempSensor,
      methaneSensor,
      timestamp || new Date()
    ];

    const [result] = await pool.execute<ResultSetHeader>(query, params);

    return {
      success: true,
      insertId: (result as ResultSetHeader).insertId,
      data: {
        machineId,
        pressureSensor,
        phSensor,
        tempSensor,
        methaneSensor,
        timestamp: timestamp || new Date().toISOString()
      }
    };
  } catch (err) {
    console.error('S3_sensorsService.insertSensorReading error:', err);
    throw new Error(err instanceof Error ? err.message : String(err));
  }
}

export async function getLatestReadingsByMachine(machineId: number, limit = 100) {
  if (!machineId || isNaN(machineId)) {
    throw new Error('Valid machineId is required');
  }

  try {
    // Use pool.query instead of pool.execute to avoid prepared statement issues with LIMIT
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT S3sensor_id, Machine_id, Pressure_Sensor, Ph_Sensor, Temp_Sensor, Methane_Sensor, \`Timestamp\`
       FROM s3_sensor_tbl
       WHERE Machine_id = ?
       ORDER BY \`Timestamp\` DESC
       LIMIT ?`,
      [Number(machineId), Number(limit)]
    );

    // Normalize rows into plain objects to ensure JSON serialization is stable
    const normalized = (rows as any[]).map((r) => ({
      S3sensor_id: r.S3sensor_id,
      Machine_id: r.Machine_id,
      Pressure_Sensor: r.Pressure_Sensor != null ? Number(r.Pressure_Sensor) : null,
      Ph_Sensor: r.Ph_Sensor != null ? Number(r.Ph_Sensor) : null,
      Temp_Sensor: r.Temp_Sensor != null ? Number(r.Temp_Sensor) : null,
      Methane_Sensor: r.Methane_Sensor != null ? Number(r.Methane_Sensor) : null,
      Timestamp: r.Timestamp instanceof Date ? r.Timestamp.toISOString() : (r.Timestamp ?? null),
    }));

    return {
      success: true,
      count: normalized.length,
      data: normalized,
    };
  } catch (err) {
    console.error('S3_sensorsService.getLatestReadingsByMachine error:', err);
    throw new Error(err instanceof Error ? err.message : String(err));
  }
}