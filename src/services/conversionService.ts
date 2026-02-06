import db from '../config/db';

export async function getPointsPerKg(): Promise<number> {
  const [rows]: any = await db.execute(
    'SELECT points_per_kg FROM conversion_rate_tbl WHERE id = 1 LIMIT 1'
  );
  if (!Array.isArray(rows) || rows.length === 0) return 5;
  return Number(rows[0].points_per_kg) || 5;
}

export async function setPointsPerKg(pointsPerKg: number, remark: string, changedBy?: number): Promise<number> {
  if (!Number.isFinite(pointsPerKg) || pointsPerKg <= 0) {
    throw new Error('Invalid pointsPerKg');
  }
  if (typeof remark !== 'string' || remark.trim().length === 0) {
    throw new Error('Remark is required');
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows]: any = await conn.execute('SELECT points_per_kg FROM conversion_rate_tbl WHERE id = 1 LIMIT 1');
    const oldValue = (Array.isArray(rows) && rows[0]) ? Number(rows[0].points_per_kg) : null;

    await conn.execute(
      'INSERT INTO conversion_rate_tbl (id, points_per_kg) VALUES (1, ?) ON DUPLICATE KEY UPDATE points_per_kg = ?',
      [pointsPerKg, pointsPerKg]
    );

    await conn.execute(
      'INSERT INTO conversion_audit_tbl (old_points_per_kg, new_points_per_kg, remark, changed_by) VALUES (?, ?, ?, ?)',
      [oldValue, pointsPerKg, remark.trim(), changedBy ?? null]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return getPointsPerKg();
}

// ✅ UPDATED: Return decimal with 2 decimal places (no rounding down)
export function calculatePointsFromWeight(weight: number, pointsPerKg: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (!Number.isFinite(pointsPerKg) || pointsPerKg <= 0) return 0;
  
  // ✅ Calculate and round to 2 decimal places
  const points = weight * pointsPerKg;
  return Math.round(points * 100) / 100;
}

export async function getAuditEntries(limit: number) {
  try {
    console.log('Executing query with limit:', limit, typeof limit); // Debug log
    const [rows]: any = await db.execute(
      `SELECT
         ca.id,
         ca.old_points_per_kg AS oldPoints,
         ca.new_points_per_kg AS newPoints,
         ca.remark,
         ca.changed_by AS changedBy,
         ac.Username AS changedByUsername,
         ca.created_at AS createdAt
       FROM conversion_audit_tbl ca
       LEFT JOIN accounts_tbl ac ON ac.Account_id = ca.changed_by
       ORDER BY ca.created_at DESC
       LIMIT ?`,
      [Number(limit)] // Ensure it's a number
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error('Error in getAuditEntries:', error);
    throw error;
  }
}