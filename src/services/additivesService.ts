import { pool } from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface AdditiveRow {
  id: number;
  machine_id: number;
  additive_type_id: number;
  additive_input: string;
  value: number;
  units: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  person_in_charge?: string;
  account_id?: number | null;
  created_at?: string;
  updated_at?: string;
  machine_name?: string | null;
  additive_name?: string | null;
  operator_username?: string | null;
  operator_first_name?: string | null;
  operator_last_name?: string | null;
}

export interface AdditiveTypeRow {
  id: number;
  name: string;
}

export const getAdditiveTypes = async (): Promise<AdditiveTypeRow[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name FROM additive_types_tbl WHERE is_active = 1 ORDER BY name`
  );
  return rows as AdditiveTypeRow[];
};

export const createAdditive = async (payload: {
  machine_id: number;
  additive_type_id: number;
  value: number;
  units: string;
  account_id?: number | null;
  person_in_charge?: string;
}) => {
  const [typeRows] = await pool.execute<RowDataPacket[]>(
    `SELECT name FROM additive_types_tbl WHERE id = ? AND is_active = 1 LIMIT 1`,
    [payload.additive_type_id]
  );
  const type = typeRows?.[0] as { name: string } | undefined;
  if (!type) throw new Error('Invalid additive type');

  const sql = `
    INSERT INTO additives_tbl
      (machine_id, additive_type_id, additive_input, value, units, date, time, person_in_charge, account_id)
    VALUES (?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?)
  `;
  const params = [
    payload.machine_id,
    payload.additive_type_id,
    type.name,
    payload.value,
    payload.units,
    payload.person_in_charge || null,
    payload.account_id ?? null,
  ];
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return (result as ResultSetHeader).insertId;
};

export const getAdditives = async (opts?: { machine_id?: number }) : Promise<AdditiveRow[]> => {
  let sql = `
    SELECT a.*,
           m.Name AS machine_name,
           t.name AS additive_name,
           acc.Username AS operator_username,
           p.FirstName AS operator_first_name,
           p.LastName AS operator_last_name
    FROM additives_tbl a
    LEFT JOIN machine_tbl m ON m.Machine_id = a.machine_id
    LEFT JOIN additive_types_tbl t ON t.id = a.additive_type_id
    LEFT JOIN accounts_tbl acc ON acc.Account_id = a.account_id
    LEFT JOIN profile_tbl p ON p.Account_id = acc.Account_id
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