import { pool } from '../config/db';

export async function getLeaderboard(limit = 100): Promise<any[]> {
  const l = Number(limit) || 100;

  // 1) find latest snapshot time (if none, previous ranks are null)
  const [maxRows]: any = await pool.query(`SELECT MAX(snapshot_at) AS max_snapshot FROM leaderboard_snapshots_tbl`);
  const max_snapshot = (Array.isArray(maxRows) && maxRows[0]?.max_snapshot) ? maxRows[0].max_snapshot : null;

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
    const [prevRows]: any = await pool.query(prevSql, [max_snapshot]);
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
  const [rows]: any = await pool.query(sql, [l]);
  const result = Array.isArray(rows) ? rows.map((r: any, i: number) => ({
    ...r,
    rank: i + 1,
    previous_rank: prevRanksMap[Number(r.Account_id)] as number | undefined
  })) : [];

  return result;
}

export async function createSnapshot(): Promise<void> {
  // create a snapshot and notify rank changes for top entries
  const snapshotAt = new Date();

  // Determine previous snapshot (if any)
  const [maxRows]: any = await pool.query(`SELECT MAX(snapshot_at) AS max_snapshot FROM leaderboard_snapshots_tbl`);
  const prevSnapshot = (Array.isArray(maxRows) && maxRows[0]?.max_snapshot) ? maxRows[0].max_snapshot : null;

  const TOP_N = 100;

  // build previous ranks map for top N (if exists)
  const prevRanksMap: Record<number, number> = {};
  if (prevSnapshot) {
    const prevSql = `
      SELECT Account_id, previous_rank FROM (
        SELECT Account_id, RANK() OVER (ORDER BY Total_kg DESC) AS previous_rank
        FROM leaderboard_snapshots_tbl
        WHERE snapshot_at = ?
      ) t
      WHERE previous_rank <= ?
    `;
    const [prevRows]: any = await pool.query(prevSql, [prevSnapshot, TOP_N]);
    if (Array.isArray(prevRows)) {
      prevRows.forEach((r: any) => { prevRanksMap[Number(r.Account_id)] = Number(r.previous_rank); });
    }
  }

  // build current ranks map (top N)
  const currRanksMap: Record<number, number> = {};
  const currSql = `
    SELECT Account_id, curr_rank FROM (
      SELECT Account_id, RANK() OVER (ORDER BY Total_kg DESC) AS curr_rank
      FROM account_waste_totals_tbl
    ) t
    WHERE curr_rank <= ?
  `;
  const [currRows]: any = await pool.query(currSql, [TOP_N]);
  if (Array.isArray(currRows)) {
    currRows.forEach((r: any) => { currRanksMap[Number(r.Account_id)] = Number(r.curr_rank); });
  }

  // compute diffs and insert system notifications for moved/entered/exited
  try {
    // gather union of affected account ids
    const ids = new Set<number>([...Object.keys(prevRanksMap).map(Number), ...Object.keys(currRanksMap).map(Number)]);
    for (const id of ids) {
      const prevRank = prevRanksMap[id] ?? null;
      const currRank = currRanksMap[id] ?? null;

      // no change -> skip
      if (prevRank === currRank) continue;

      // fetch username and role for the account (use household role as default target)
      const [accRows]: any = await pool.query(`SELECT Username, Roles FROM accounts_tbl WHERE Account_id = ? LIMIT 1`, [id]);
      const acct = accRows?.[0] ?? null;
      const username = acct?.Username ?? null;
      const roleId = Number(acct?.Roles ?? 4);

      let eventType = '';
      let containerName: string | null = null; // we reuse Container_name to hold rank info (prev->curr)

      if (prevRank == null && currRank != null) {
        eventType = 'LEADERBOARD_ENTERED';
        containerName = String(currRank);
      } else if (prevRank != null && currRank == null) {
        eventType = 'LEADERBOARD_EXITED';
        containerName = String(prevRank);
      } else {
        eventType = 'LEADERBOARD_MOVED';
        containerName = `${prevRank}->${currRank}`;
      }

      try {
        await pool.query(
          `INSERT INTO system_notifications_tbl
             (Event_type, Username, FirstName, LastName, Email, Role_id, Container_name, Area_name, Reward_item, Reward_quantity, Reward_points, Created_at)
           VALUES (?, ?, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, NOW())`,
          [eventType, username, roleId, containerName]
        );
      } catch (e) {
        console.warn('createSnapshot: failed to insert leaderboard notification for account', id, e);
      }
    }
  } catch (e) {
    console.warn('createSnapshot: error computing leaderboard diffs', e);
  }

  // finally, insert the snapshot rows for all accounts
  await pool.query(
    `INSERT INTO leaderboard_snapshots_tbl (Account_id, Total_kg, snapshot_at)
     SELECT Account_id, Total_kg, ? FROM account_waste_totals_tbl`,
    [snapshotAt]
  );
}