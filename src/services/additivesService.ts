import { pool } from '../config/db';
import config from '../config/env';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface AdditiveRow {
  id: number;
  machine_id: number;
  additive_input: string;
  stage: string;
  value: number;
  units: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  person_in_charge?: string;
  created_at?: string;
  updated_at?: string;
  machine_name?: string | null;
}

export const createAdditive = async (payload: Omit<AdditiveRow, 'id' | 'created_at' | 'updated_at' | 'machine_name'>) => {
  const sql = `
    INSERT INTO additives_tbl
      (machine_id, additive_input, stage, value, units, date, time, person_in_charge)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    payload.machine_id,
    payload.additive_input,
    payload.stage,
    payload.value,
    payload.units,
    payload.date,
    payload.time,
    payload.person_in_charge || null,
  ];
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return (result as ResultSetHeader).insertId;
};

export const getAdditives = async (opts?: { machine_id?: number }) : Promise<AdditiveRow[]> => {
  let sql = `
    SELECT a.*, m.Name AS machine_name
    FROM additives_tbl a
    LEFT JOIN machine_tbl m ON m.Machine_id = a.machine_id
  `;
  const params: any[] = [];
  if (opts?.machine_id) {
    sql += ` WHERE a.machine_id = ?`;
    params.push(opts.machine_id);
  }
  sql += ` ORDER BY a.machine_id ASC, a.date DESC, a.time DESC`;
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return rows as AdditiveRow[];
};