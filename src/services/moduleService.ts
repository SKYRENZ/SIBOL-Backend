import { pool } from '../config/db.js';

export const fetchAllModules = async () => {
  const [rows] = await pool.query('SELECT Module_id, Name, Path FROM modules_tbl ORDER BY Module_id');
  return rows;
};

export const fetchAllowedModulesForAccount = async (account: any) => {
  if (!account) return [];

  // Prefer denormalized Module_id CSV on account
  if (account.User_modules && typeof account.User_modules === 'string' && account.User_modules.trim() !== '') {
    const ids = account.User_modules
      .split(',')
      .map((s: string) => Number(s.trim()))
      .filter((n: number) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT Module_id, Name, Path FROM modules_tbl WHERE Module_id IN (${placeholders}) ORDER BY Module_id`,
      ids
    );
    return rows;
  }

  // Fallback: lookup by role via user_module_tbl
  const sql = `
    SELECT DISTINCT m.Module_id, m.Name, m.Path
    FROM modules_tbl m
    JOIN user_module_tbl um ON um.Module_id = m.Module_id
    WHERE um.Roles_id = ?
    ORDER BY m.Module_id
  `;
  const [rows] = await pool.query(sql, [account.Roles]);
  return rows;
};