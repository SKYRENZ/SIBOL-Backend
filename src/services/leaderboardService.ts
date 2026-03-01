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
  // compute leaderboard and notify only on real rank changes
  const LIMIT = 100;

  // 1) load previous snapshot ranks (if exists)
  const [[prevRow]]: any = await pool.query(`SELECT MAX(Snapshot_at) AS last_snapshot FROM leaderboard_snapshots_tbl LIMIT 1`);
  const lastSnapshotAt = prevRow?.last_snapshot ?? null;

  const prevRanks: Record<number, number> = {};
  if (lastSnapshotAt) {
    const [prevRows]: any = await pool.query(
      `SELECT Account_id, Rank FROM leaderboard_snapshots_tbl WHERE Snapshot_at = ?`,
      [lastSnapshotAt]
    );
    if (Array.isArray(prevRows)) {
      for (const r of prevRows) prevRanks[Number(r.Account_id)] = Number(r.Rank);
    }
  }

  // 2) compute current leaderboard (highest Total_kg first)
  const [curRows]: any = await pool.query(
    `SELECT Account_id, Total_kg
     FROM account_waste_totals_tbl
     WHERE Total_kg > 0
     ORDER BY Total_kg DESC, Account_id ASC
     LIMIT ?`,
    [LIMIT]
  );

  const snapshotTime = new Date();
  // 3) insert snapshot rows (one batch)
  if (Array.isArray(curRows) && curRows.length) {
    const values: any[] = [];
    const placeholders: string[] = [];
    let rank = 0;
    for (const r of curRows) {
      rank++;
      placeholders.push('(?, ?, ?, ?)');
      values.push(snapshotTime, Number(r.Account_id), rank, Number(r.Total_kg ?? 0));
    }
    // ensure table exists; if not this will throw (preserve prior behavior)
    await pool.query(
      `INSERT INTO leaderboard_snapshots_tbl (Snapshot_at, Account_id, Rank, Total_kg) VALUES ${placeholders.join(',')}`,
      values
    );
  } else {
    // still create an empty snapshot row time marker so lastSnapshotAt updates
    await pool.query(`INSERT INTO leaderboard_snapshot_markers_tbl (Snapshot_at) VALUES (?)`, [snapshotTime]).catch(() => {});
  }

  // 4) compare prevRanks <> current ranks and generate notifications only for real changes
  // build current rank map
  const curRanks: Record<number, number> = {};
  let r = 0;
  for (const row of (curRows || [])) {
    r++;
    curRanks[Number(row.Account_id)] = r;
  }

  // convenience: function to skip duplicate events inserted very recently
  async function existsRecentNotification(eventType: string, rankInfo: string | null) {
    const [rows]: any = await pool.query(
      `SELECT Notification_id FROM system_notifications_tbl
       WHERE Event_type = ? AND Role_id = ? AND Container_name = ? AND Created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE) LIMIT 1`,
      [eventType, 4, rankInfo]
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  // for accounts in current leaderboard
  for (const accIdStr of Object.keys(curRanks)) {
    const accId = Number(accIdStr);
    const newRank = curRanks[accId];
    const oldRank = prevRanks[accId] ?? null;

    let eventType: string | null = null;
    let rankInfo: string | null = null;

    if (oldRank == null) {
      // entered the leaderboard
      eventType = 'LEADERBOARD_ENTERED';
      rankInfo = String(newRank);
    } else if (oldRank !== newRank) {
      // moved (up or down)
      eventType = 'LEADERBOARD_MOVED';
      rankInfo = `${oldRank}->${newRank}`;
      // Only notify when rank number actually changed (this ensures no false positive)
    }

    if (!eventType) continue;

    // avoid duplicate notifications in quick succession
    const dup = await existsRecentNotification(eventType, rankInfo);
    if (dup) continue;

    try {
      // role-targeted notification (household)
      await pool.query(
        `INSERT INTO system_notifications_tbl
           (Event_type, Username, Role_id, Container_name, Created_at)
         VALUES (?, NULL, ?, ?, NOW())`,
        [eventType, 4, rankInfo]
      );
    } catch (err) {
      console.warn('[leaderboardService] insert notification failed', err);
    }
  }

  // detect exits: accounts that were in prevRanks but not in curRanks => LEADERBOARD_EXITED
  for (const accIdStr of Object.keys(prevRanks)) {
    const accId = Number(accIdStr);
    if (curRanks[accId] !== undefined) continue; // still present
    const oldRank = prevRanks[accId];
    const eventType = 'LEADERBOARD_EXITED';
    const rankInfo = String(oldRank);

    const dup = await existsRecentNotification(eventType, rankInfo);
    if (dup) continue;

    try {
      await pool.query(
        `INSERT INTO system_notifications_tbl
           (Event_type, Username, Role_id, Container_name, Created_at)
         VALUES (?, NULL, ?, ?, NOW())`,
        [eventType, 4, rankInfo]
      );
    } catch (err) {
      console.warn('[leaderboardService] insert EXITED notification failed', err);
    }
  }
}