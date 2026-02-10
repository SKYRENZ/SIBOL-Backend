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

// new: fetch collections submitted by a specific operator (returns date and time strings)
export async function getCollectionsByOperator(operatorId: number, limit = 100, offset = 0) {
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
    WHERE wc.operator_id = ?
    ORDER BY wc.collected_at DESC
    LIMIT ? OFFSET ?
  `;
  const params = [operatorId, Number(limit), Number(offset)];

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, params) as any;
    return rows;
  } finally {
    conn.release();
  }
}

// Returns monthly aggregated waste (kg) for a given area and year
export async function getMonthlyWasteByArea(areaId: number, year: number) {
  const sql = `
    SELECT MONTH(collected_at) AS month, COALESCE(SUM(weight),0) AS total_kg
    FROM waste_collection_tbl
    WHERE area_id = ? AND YEAR(collected_at) = ?
    GROUP BY MONTH(collected_at)
    ORDER BY MONTH(collected_at)
  `;
  const params = [areaId, year];

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, params) as any;
    // build array for 12 months
    const out = Array(12).fill(0);
    for (const r of rows) {
      const m = Number(r.month);
      if (m >= 1 && m <= 12) out[m - 1] = Number(r.total_kg) || 0;
    }
    return out;
  } finally {
    conn.release();
  }
}

export async function getTotalWasteByRange(range: 'weekly' | 'monthly' | 'yearly' = 'monthly') {
  const conn = await pool.getConnection();
  try {
    let sql = '';
    if (range === 'weekly') {
      // current week (ISO-like: Monday-start)
      sql = `
        SELECT COALESCE(SUM(weight), 0) AS total_kg
        FROM waste_collection_tbl
        WHERE YEARWEEK(collected_at, 1) = YEARWEEK(CURDATE(), 1)
      `;
    } else if (range === 'monthly') {
      sql = `
        SELECT COALESCE(SUM(weight), 0) AS total_kg
        FROM waste_collection_tbl
        WHERE MONTH(collected_at) = MONTH(CURDATE()) AND YEAR(collected_at) = YEAR(CURDATE())
      `;
    } else {
      sql = `
        SELECT COALESCE(SUM(weight), 0) AS total_kg
        FROM waste_collection_tbl
        WHERE YEAR(collected_at) = YEAR(CURDATE())
      `;
    }

    const [rows] = await conn.query(sql) as any;
    return Number(rows?.[0]?.total_kg || 0);
  } finally {
    conn.release();
  }
}

export async function getMonthlyWasteAllAreas(year: number) {
  const sql = `
    SELECT MONTH(collected_at) AS month, COALESCE(SUM(weight),0) AS total_kg
    FROM waste_collection_tbl
    WHERE YEAR(collected_at) = ?
    GROUP BY MONTH(collected_at)
    ORDER BY MONTH(collected_at)
  `;
  const params = [year];

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, params) as any;
    const out = Array(12).fill(0);
    for (const r of rows) {
      const m = Number(r.month);
      if (m >= 1 && m <= 12) out[m - 1] = Number(r.total_kg) || 0;
    }
    return out;
  } finally {
    conn.release();
  }
}