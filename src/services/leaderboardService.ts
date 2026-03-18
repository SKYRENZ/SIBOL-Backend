import { pool } from "../config/db";
import { sendPushToRoleAndBarangay } from "./pushNotificationService";

function leaderboardPushBody(eventType: string, rankInfo: string | null): string {
  if (eventType === "LEADERBOARD_ENTERED") {
    return "A household entered the leaderboard at rank " + (rankInfo ?? "-") + ".";
  }
  if (eventType === "LEADERBOARD_MOVED") {
    return "Leaderboard rank changed: " + (rankInfo ?? "-") + ".";
  }
  if (eventType === "LEADERBOARD_EXITED") {
    return "A household exited the leaderboard (previous rank " + (rankInfo ?? "-") + ").";
  }
  return "Leaderboard updated.";
}

export async function getLeaderboard(limit = 100, barangayId?: number): Promise<any[]> {
  const l = Number(limit) || 100;
  const hasBarangay = typeof barangayId === "number" && !Number.isNaN(barangayId);

  let maxSnapshotSql =
    "SELECT MAX(ls.snapshot_at) AS max_snapshot " +
    "FROM leaderboard_snapshots_tbl ls ";
  const maxParams: any[] = [];

  if (hasBarangay) {
    maxSnapshotSql +=
      "JOIN profile_tbl p ON p.Account_id = ls.Account_id " +
      "WHERE p.Barangay_id = ?";
    maxParams.push(barangayId);
  }

  const [maxRows]: any = await pool.query(maxSnapshotSql, maxParams);
  const maxSnapshot =
    Array.isArray(maxRows) && maxRows[0]?.max_snapshot ? maxRows[0].max_snapshot : null;

  const prevRanksMap: Record<number, number> = {};
  if (maxSnapshot) {
    let prevSql =
      "SELECT Account_id, previous_rank FROM (" +
      " SELECT ls.Account_id, RANK() OVER (ORDER BY ls.Total_kg DESC) AS previous_rank " +
      " FROM leaderboard_snapshots_tbl ls ";

    const prevParams: any[] = [];

    if (hasBarangay) {
      prevSql += "JOIN profile_tbl p ON p.Account_id = ls.Account_id ";
    }

    prevSql += "WHERE ls.snapshot_at = ?";
    prevParams.push(maxSnapshot);

    if (hasBarangay) {
      prevSql += " AND p.Barangay_id = ?";
      prevParams.push(barangayId);
    }

    prevSql += ") t";

    const [prevRows]: any = await pool.query(prevSql, prevParams);
    if (Array.isArray(prevRows)) {
      prevRows.forEach((r: any) => {
        prevRanksMap[Number(r.Account_id)] = Number(r.previous_rank);
      });
    }
  }

  let sql =
    "SELECT t.Account_id, COALESCE(a.Username, '') AS Username, t.Total_kg, COALESCE(a.Points, 0) AS Points " +
    "FROM account_waste_totals_tbl t " +
    "LEFT JOIN accounts_tbl a ON a.Account_id = t.Account_id " +
    "LEFT JOIN profile_tbl p ON p.Account_id = t.Account_id ";

  const params: any[] = [];

  if (hasBarangay) {
    sql += "WHERE p.Barangay_id = ? ";
    params.push(barangayId);
  }

  sql += "ORDER BY t.Total_kg DESC LIMIT ?";
  params.push(l);

  const [rows]: any = await pool.query(sql, params);
  const result = Array.isArray(rows)
    ? rows.map((r: any, i: number) => ({
        ...r,
        rank: i + 1,
        previous_rank: prevRanksMap[Number(r.Account_id)] as number | undefined,
      }))
    : [];

  return result;
}

export async function createSnapshot(): Promise<void> {
  const LIMIT = 100;

  const [[prevRow]]: any = await pool.query(
    "SELECT MAX(Snapshot_at) AS last_snapshot FROM leaderboard_snapshots_tbl LIMIT 1"
  );
  const lastSnapshotAt = prevRow?.last_snapshot ?? null;

  const prevRanks: Record<number, number> = {};
  if (lastSnapshotAt) {
    const [prevRows]: any = await pool.query(
      "SELECT Account_id, Rank FROM leaderboard_snapshots_tbl WHERE Snapshot_at = ?",
      [lastSnapshotAt]
    );
    if (Array.isArray(prevRows)) {
      for (const r of prevRows) {
        prevRanks[Number(r.Account_id)] = Number(r.Rank);
      }
    }
  }

  const [curRows]: any = await pool.query(
    "SELECT " +
      "t.Account_id, " +
      "t.Total_kg, " +
      "p.Barangay_id, " +
      "p.FirstName, " +
      "p.LastName " +
      "FROM account_waste_totals_tbl t " +
      "LEFT JOIN profile_tbl p ON p.Account_id = t.Account_id " +
      "WHERE t.Total_kg > 0 " +
      "ORDER BY t.Total_kg DESC, t.Account_id ASC " +
      "LIMIT ?",
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
      "INSERT INTO leaderboard_snapshots_tbl (Snapshot_at, Account_id, Rank, Total_kg) VALUES " +
        placeholders.join(","),
      values
    );
  } else {
    await pool
      .query("INSERT INTO leaderboard_snapshot_markers_tbl (Snapshot_at) VALUES (?)", [snapshotTime])
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
  ): Promise<boolean> {
    const [rows]: any = await pool.query(
      "SELECT Notification_id " +
        "FROM system_notifications_tbl " +
        "WHERE Event_type = ? " +
        "AND Role_id = 4 " +
        "AND Barangay_id = ? " +
        "AND Container_name = ? " +
        "AND Created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE) " +
        "LIMIT 1",
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
      rankInfo = String(oldRank) + "->" + String(newRank);
    }

    if (!eventType) {
      continue;
    }

    const meta = curMeta[accId];
    const barangayId = meta?.barangayId ?? null;
    const firstName = meta?.firstName ?? null;
    const lastName = meta?.lastName ?? null;

    if (barangayId == null) {
      continue;
    }

    const dup = await existsRecentNotification(eventType, rankInfo, barangayId);
    if (dup) {
      continue;
    }

    try {
      await pool.query(
        "INSERT INTO system_notifications_tbl " +
          "(Event_type, Username, Role_id, Barangay_id, Container_name, FirstName, LastName, Created_at) " +
          "VALUES (?, NULL, 4, ?, ?, ?, ?, NOW())",
        [eventType, barangayId, rankInfo, firstName, lastName]
      );

      try {
        await sendPushToRoleAndBarangay(4, barangayId, {
          title: "Leaderboard Update",
          body: leaderboardPushBody(eventType, rankInfo),
          data: {
            type: "leaderboard",
            eventType,
            rankInfo,
            barangayId,
          },
          sound: "default",
        });
      } catch (pushErr) {
        console.warn("[leaderboardService] push send failed", pushErr);
      }
    } catch (err) {
      console.warn("[leaderboardService] insert notification failed", err);
    }
  }

  for (const accIdStr of Object.keys(prevRanks)) {
    const accId = Number(accIdStr);
    if (curRanks[accId] !== undefined) {
      continue;
    }

    const oldRank = prevRanks[accId];
    const eventType = "LEADERBOARD_EXITED";
    const rankInfo = String(oldRank);

    const [profileRows]: any = await pool.query(
      "SELECT Barangay_id, FirstName, LastName FROM profile_tbl WHERE Account_id = ? LIMIT 1",
      [accId]
    );
    const profile = profileRows?.[0] ?? null;
    const barangayId: number | null = profile?.Barangay_id == null ? null : Number(profile.Barangay_id);
    const firstName: string | null = profile?.FirstName ?? null;
    const lastName: string | null = profile?.LastName ?? null;

    if (barangayId == null) {
      continue;
    }

    const dup = await existsRecentNotification(eventType, rankInfo, barangayId);
    if (dup) {
      continue;
    }

    try {
      await pool.query(
        "INSERT INTO system_notifications_tbl " +
          "(Event_type, Username, Role_id, Barangay_id, Container_name, FirstName, LastName, Created_at) " +
          "VALUES (?, NULL, 4, ?, ?, ?, ?, NOW())",
        [eventType, barangayId, rankInfo, firstName, lastName]
      );

      try {
        await sendPushToRoleAndBarangay(4, barangayId, {
          title: "Leaderboard Update",
          body: leaderboardPushBody(eventType, rankInfo),
          data: {
            type: "leaderboard",
            eventType,
            rankInfo,
            barangayId,
          },
          sound: "default",
        });
      } catch (pushErr) {
        console.warn("[leaderboardService] push send failed", pushErr);
      }
    } catch (err) {
      console.warn("[leaderboardService] insert EXITED notification failed", err);
    }
  }
}