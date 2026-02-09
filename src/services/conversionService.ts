import db from '../config/db';

type DbExecutor = {
  execute: (sql: string, params?: any[]) => Promise<any>;
};

function isAuditSchemaError(err: unknown): boolean {
  const code = (err as { code?: string } | null | undefined)?.code;
  return code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR' || code === 'ER_PARSE_ERROR';
}

async function ensureConversionTables(executor: DbExecutor) {
  await executor.execute(
    `CREATE TABLE IF NOT EXISTS conversion_rate_tbl (
      id INT PRIMARY KEY,
      points_per_kg DECIMAL(10,2) NOT NULL
    )`
  );

  await executor.execute(
    `CREATE TABLE IF NOT EXISTS conversion_audit_tbl (
      id INT AUTO_INCREMENT PRIMARY KEY,
      old_points_per_kg DECIMAL(10,2) NULL,
      new_points_per_kg DECIMAL(10,2) NOT NULL,
      remark VARCHAR(255) NOT NULL,
      changed_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

export async function getPointsPerKg(): Promise<number> {
  await ensureConversionTables(db);
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

  await ensureConversionTables(db);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows]: any = await conn.execute('SELECT points_per_kg FROM conversion_rate_tbl WHERE id = 1 LIMIT 1');
    const oldValue = (Array.isArray(rows) && rows[0]) ? Number(rows[0].points_per_kg) : null;

    await conn.execute(
      'INSERT INTO conversion_rate_tbl (id, points_per_kg) VALUES (1, ?) ON DUPLICATE KEY UPDATE points_per_kg = ?',
      [pointsPerKg, pointsPerKg]
    );

    try {
      await conn.execute(
        'INSERT INTO conversion_audit_tbl (old_points_per_kg, new_points_per_kg, remark, changed_by) VALUES (?, ?, ?, ?)',
        [oldValue, pointsPerKg, remark.trim(), changedBy ?? null]
      );
    } catch (err) {
      if (!isAuditSchemaError(err)) {
        throw err;
      }
      console.warn('Audit insert skipped due to schema issue:', (err as { code?: string } | null | undefined)?.code ?? err);
    }

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
    await ensureConversionTables(db);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 100;
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
       LIMIT ${safeLimit}`
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isAuditSchemaError(error)) {
      console.warn('Audit query skipped due to schema issue:', (error as { code?: string } | null | undefined)?.code ?? error);
      return [];
    }
    console.error('Error in getAuditEntries:', error);
    throw error;
  }
}