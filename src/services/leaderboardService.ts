import db from '../config/db';

export async function getLeaderboard(limit = 100): Promise<any[]> {
  const l = Number(limit) || 100;

  // 1) find latest snapshot time (if none, previous ranks are null)
  const [[{ max_snapshot }]]: any = await db.execute(
    `SELECT MAX(snapshot_at) AS max_snapshot FROM leaderboard_snapshots_tbl`
  );

  // 2) if snapshot exists, build previous rank mapping using window function
  let prevRanksMap: Record<number, number> = {};
  if (max_snapshot) {
    const prevSql = `
      SELECT Account_id, previous_rank FROM (
        SELECT Account_id, RANK() OVER (ORDER BY Total_kg DESC) AS previous_rank
        FROM leaderboard_snapshots_tbl
        WHERE snapshot_at = ?
      ) t
    `;
    const [prevRows]: any = await db.execute(prevSql, [max_snapshot]);
    if (Array.isArray(prevRows)) {
      prevRows.forEach((r: any) => {
        prevRanksMap[Number(r.Account_id)] = Number(r.previous_rank);
      });
    }
  }

  // 3) current leaderboard
  const sql = `
    SELECT
      t.Account_id,
      COALESCE(a.Username, '') AS Username,
      t.Total_kg,
      COALESCE(a.Points, 0) AS Points
    FROM account_waste_totals_tbl t
    LEFT JOIN accounts_tbl a ON a.Account_id = t.Account_id
    ORDER BY t.Total_kg DESC
    LIMIT ?
  `;
  const [rows]: any = await db.execute(sql, [l]);
  const result = Array.isArray(rows) ? rows.map((r: any, i: number) => ({
    ...r,
    rank: i + 1,
    // return undefined when we don't have a previous rank so frontend's typeof check works
    previous_rank: prevRanksMap[Number(r.Account_id)] as number | undefined
  })) : [];

  return result;
}

export async function createSnapshot(): Promise<void> {
  // insert a snapshot row for every account's current total (single snapshot_at for all)
  const snapshotAt = new Date();
  await db.execute(
    `INSERT INTO leaderboard_snapshots_tbl (Account_id, Total_kg, snapshot_at)
     SELECT Account_id, Total_kg, ? FROM account_waste_totals_tbl`,
    [snapshotAt]
  );
}