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

// new: fetch collections for an area, with separate date and time fields
export async function getCollectionsByArea(areaId: number, limit = 100, offset = 0) {
  const sql = `
    SELECT 
      wc.collection_id,
      wc.area_id,
      wc.operator_id,
      wc.weight,
      wc.collected_at,
      DATE(wc.collected_at) AS collected_date,
      TIME(wc.collected_at) AS collected_time,
      acct.Username AS operator_username
    FROM waste_collection_tbl wc
    LEFT JOIN accounts_tbl acct ON acct.Account_id = wc.operator_id
    WHERE wc.area_id = ?
    ORDER BY wc.collected_at DESC
    LIMIT ? OFFSET ?
  `;
  const params = [areaId, Number(limit), Number(offset)];

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, params) as any;
    // rows already contains collected_date and collected_time as strings
    return rows;
  } finally {
    conn.release();
  }
}