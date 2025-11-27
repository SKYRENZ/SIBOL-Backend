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
            collected_at: new Date() // DB time is authoritative; this is approximate
        };
    } finally {
        conn.release();
    }
}

// getCollectionsByArea — returns human-friendly date/time strings (matches previous areaController format)
export async function getCollectionsByArea(areaId: number, limit = 100, offset = 0) {
    const sql = `
    SELECT
      wc.collection_id,
      wc.area_id,
      wc.operator_id,
      wc.weight,
      wc.collected_at,
      DATE_FORMAT(wc.collected_at, '%b %d, %Y') AS date,
      TIME_FORMAT(wc.collected_at, '%h:%i %p') AS time,
      COALESCE(CONCAT(p.FirstName, ' ', p.LastName), acct.Username, 'Unknown Operator') AS operator_name
    FROM
      waste_collection_tbl wc
    LEFT JOIN profile_tbl p ON wc.operator_id = p.Account_id
    LEFT JOIN accounts_tbl acct ON wc.operator_id = acct.Account_id
    WHERE wc.area_id = ?
    ORDER BY wc.collected_at DESC
    LIMIT ? OFFSET ?
  `;
    const params = [areaId, Number(limit), Number(offset)];

    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(sql, params) as any;
        return rows;
    } finally {
        conn.release();
    }
}