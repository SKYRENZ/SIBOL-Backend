import { pool } from '../config/db';

export async function createWasteCollection(areaId: number, operatorId: number, weight: number) {
  const sql = `
    INSERT INTO waste_collection_tbl (area_id, operator_id, weight, collected_at)
    VALUES (?, ?, ?, NOW())
  `;
  const params = [areaId, operatorId, weight];

  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(sql, params) as any;
    const insertId = result.insertId;
    return {
      collection_id: insertId,
      area_id: areaId,
      operator_id: operatorId,
      weight,
      collected_at: new Date() // approximate; DB time is authoritative
    };
  } finally {
    conn.release();
  }
}