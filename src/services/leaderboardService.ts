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
  const LIMIT = 100;

  const [[prevRow]]: any = await pool.query(
    `SELECT MAX(Snapshot_at) AS last_snapshot FROM leaderboard_snapshots_tbl LIMIT 1`
  );
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

  const [curRows]: any = await pool.query(
    `
      SELECT
        t.Account_id,
        t.Total_kg,
        p.Barangay_id,
        p.FirstName,
        p.LastName
      FROM account_waste_totals_tbl t
      LEFT JOIN profile_tbl p ON p.Account_id = t.Account_id
      WHERE t.Total_kg > 0
      ORDER BY t.Total_kg DESC, t.Account_id ASC
      LIMIT ?
    `,
    [LIMIT]
  );

  const snapshotTime = new Date();

  if (Array.isArray(curRows) && curRows.length) {
    const placeholders: string[] = [];
    const values: any[] = [];
    let rank = 0;

    for (const row of curRows) {
      rank++;
      placeholders.push("(?, ?, ?, ?)");
      values.push(snapshotTime, Number(row.Account_id), rank, Number(row.Total_kg ?? 0));
    }

    await pool.query(
      `INSERT INTO leaderboard_snapshots_tbl (Snapshot_at, Account_id, Rank, Total_kg) VALUES ${placeholders.join(",")}`,
      values
    );
  } else {
    await pool
      .query(`INSERT INTO leaderboard_snapshot_markers_tbl (Snapshot_at) VALUES (?)`, [snapshotTime])
      .catch(() => {});
  }

  const curRanks: Record<number, number> = {};
  const curMeta: Record<number, { barangayId: number | null; firstName: string | null; lastName: string | null }> = {};
  let rankCursor = 0;

  for (const row of curRows || []) {
    const accId = Number(row.Account_id);
    rankCursor++;
    curRanks[accId] = rankCursor;
    curMeta[accId] = {
      barangayId: row.Barangay_id == null ? null : Number(row.Barangay_id),
      firstName: row.FirstName ?? null,
      lastName: row.LastName ?? null,
    };
  }

  async function existsRecentNotification(
    eventType: string,
    rankInfo: string | null,
    barangayId: number
  ) {
    const [rows]: any = await pool.query(
      `
        SELECT Notification_id
        FROM system_notifications_tbl
        WHERE Event_type = ?
          AND Role_id = 4
          AND Barangay_id = ?
          AND Container_name = ?
          AND Created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
        LIMIT 1
      `,
      [eventType, barangayId, rankInfo]
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  for (const accIdStr of Object.keys(curRanks)) {
    const accId = Number(accIdStr);
    const newRank = curRanks[accId];
    const oldRank = prevRanks[accId] ?? null;

    let eventType: string | null = null;
    let rankInfo: string | null = null;

    if (oldRank == null) {
      eventType = "LEADERBOARD_ENTERED";
      rankInfo = String(newRank);
    } else if (oldRank !== newRank) {
      eventType = "LEADERBOARD_MOVED";
      rankInfo = `${oldRank}->${newRank}`;
    }

    if (!eventType) continue;

    const meta = curMeta[accId];
    const barangayId = meta?.barangayId ?? null;
    const firstName = meta?.firstName ?? null;
    const lastName = meta?.lastName ?? null;

    if (barangayId == null) continue;

    const dup = await existsRecentNotification(eventType, rankInfo, barangayId);
    if (dup) continue;

    try {
      await pool.query(
        `
          INSERT INTO system_notifications_tbl
            (Event_type, Username, Role_id, Barangay_id, Container_name, FirstName, LastName, Created_at)
          VALUES (?, NULL, 4, ?, ?, ?, ?, NOW())
        `,
        [eventType, barangayId, rankInfo, firstName, lastName]
      );
    } catch (err) {
      console.warn("[leaderboardService] insert notification failed", err);
    }
  }

  for (const accIdStr of Object.keys(prevRanks)) {
    const accId = Number(accIdStr);
    if (curRanks[accId] !== undefined) continue;

    const oldRank = prevRanks[accId];
    const eventType = "LEADERBOARD_EXITED";
    const rankInfo = String(oldRank);

    const [profileRows]: any = await pool.query(
      `SELECT Barangay_id, FirstName, LastName FROM profile_tbl WHERE Account_id = ? LIMIT 1`,
      [accId]
    );
    const profile = profileRows?.[0] ?? null;
    const barangayId: number | null = profile?.Barangay_id == null ? null : Number(profile.Barangay_id);
    const firstName: string | null = profile?.FirstName ?? null;
    const lastName: string | null = profile?.LastName ?? null;

    if (barangayId == null) continue;

    const dup = await existsRecentNotification(eventType, rankInfo, barangayId);
    if (dup) continue;

    try {
      await pool.query(
        `
          INSERT INTO system_notifications_tbl
            (Event_type, Username, Role_id, Barangay_id, Container_name, FirstName, LastName, Created_at)
          VALUES (?, NULL, 4, ?, ?, ?, ?, NOW())
        `,
        [eventType, barangayId, rankInfo, firstName, lastName]
      );
    } catch (err) {
      console.warn("[leaderboardService] insert EXITED notification failed", err);
    }
  }
}