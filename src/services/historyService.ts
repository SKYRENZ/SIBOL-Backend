import { pool } from '../config/db';

export type HistoryItem = {
  id: string; // "qr:<qr_code>" | "reward:<reward_transaction_id>"
  type: 'QR_SCAN' | 'REWARD_CLAIM';
  createdAt: string; // ISO-ish from MySQL
  pointsDelta: number; // + earned, - spent
  kgDelta: number; // + added for QR, 0 for rewards
  title: string; // reward item name or "QR Scan"
  code: string | null; // redemption code for rewards
};

export async function listHistoryForAccount(opts: {
  accountId: number;
  limit?: number;
  cursor?: string | null; // createdAt cursor
}): Promise<HistoryItem[]> {
  const limit = Math.max(1, Math.min(Number(opts.limit ?? 20), 100));
  const cursor = opts.cursor ? String(opts.cursor) : null;

  const sql = `
    SELECT *
    FROM (
      SELECT
        CONCAT('qr:', qs.QR_code) AS id,
        'QR_SCAN' AS type,
        qs.Scanned_at AS createdAt,
        CAST(qs.Points_awarded AS SIGNED) AS pointsDelta,
        CAST(qs.Weight AS DECIMAL(12,3)) AS kgDelta,
        'QR Scan' AS title,
        NULL AS code
      FROM qr_scans_tbl qs
      WHERE qs.Account_id = ?

      UNION ALL

      SELECT
        CONCAT('reward:', rt.Reward_transaction_id) AS id,
        'REWARD_CLAIM' AS type,
        rt.Created_at AS createdAt,
        -CAST(rt.Total_points AS SIGNED) AS pointsDelta,
        CAST(0 AS DECIMAL(12,3)) AS kgDelta,
        COALESCE(r.Item, 'Reward') AS title,
        rt.Redemption_code AS code
      FROM reward_transactions_tbl rt
      LEFT JOIN rewards_tbl r ON r.Reward_id = rt.Reward_id
      WHERE rt.Account_id = ?
    ) t
    WHERE (? IS NULL OR t.createdAt < ?)
    ORDER BY t.createdAt DESC
    LIMIT ?
  `;

  const params = [opts.accountId, opts.accountId, cursor, cursor, limit];
  const [rows]: any = await pool.query(sql, params);

  return (rows as any[]).map((r) => ({
    id: String(r.id),
    type: r.type === 'REWARD_CLAIM' ? 'REWARD_CLAIM' : 'QR_SCAN',
    createdAt: String(r.createdAt),
    pointsDelta: Number(r.pointsDelta ?? 0),
    kgDelta: Number(r.kgDelta ?? 0),
    title: String(r.title ?? ''),
    code: r.code == null ? null : String(r.code),
  }));
}