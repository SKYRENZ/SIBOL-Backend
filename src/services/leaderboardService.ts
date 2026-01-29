import db from '../config/db';

export async function getLeaderboard(limit = 100): Promise<any[]> {
    const l = Number(limit) || 100;
    const sql = `
      SELECT
        t.Account_id,
        COALESCE(a.Username, '') AS Username,
        t.Total_kg,
        a.Points
      FROM account_waste_totals_tbl t
      LEFT JOIN accounts_tbl a ON a.Account_id = t.Account_id
      ORDER BY t.Total_kg DESC
      LIMIT ?
    `;
    const [rows]: any = await db.execute(sql, [l]);
    return Array.isArray(rows) ? rows : [];
}