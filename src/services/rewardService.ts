import {pool} from "../config/db"; // keep default import so tests that mock the module work
import crypto from "crypto";
import type { Reward, RewardTransaction } from "../models/types";

/* CREATE */
export const createReward = async (reward: Reward): Promise<number> => {
  const sql = `INSERT INTO rewards_tbl (Item, Description, Points_cost, Quantity) VALUES (?, ?, ?, ?)`;
  const [result]: any = await pool.query(sql, [
    reward.Item,
    reward.Description || null,
    reward.Points_cost,
    reward.Quantity,
  ]);
  return (result as any).insertId;
};

/* UPDATE (partial) */
export const updateReward = async (rewardId: number, fields: Partial<Reward>): Promise<void> => {
  const sets: string[] = [];
  const params: any[] = [];
  if (fields.Item !== undefined) { sets.push("Item = ?"); params.push(fields.Item); }
  if (fields.Description !== undefined) { sets.push("Description = ?"); params.push(fields.Description); }
  if (fields.Points_cost !== undefined) { sets.push("Points_cost = ?"); params.push(fields.Points_cost); }
  if (fields.Quantity !== undefined) { sets.push("Quantity = ?"); params.push(fields.Quantity); }
  if (fields.IsArchived !== undefined) { sets.push("IsArchived = ?"); params.push(fields.IsArchived); }

  // ✅ new fields
  if (fields.Image_url !== undefined) { sets.push("Image_url = ?"); params.push(fields.Image_url); }
  if (fields.Image_public_id !== undefined) { sets.push("Image_public_id = ?"); params.push(fields.Image_public_id); }

  if (sets.length === 0) return;

  const sql = `UPDATE rewards_tbl SET ${sets.join(", ")} WHERE Reward_id = ?`;
  params.push(rewardId);
  await pool.query(sql, params);
};

/* Archive / Restore */
export const archiveReward = async (rewardId: number): Promise<void> => {
  await pool.query(`UPDATE rewards_tbl SET IsArchived = 1 WHERE Reward_id = ?`, [rewardId]);
};

export const restoreReward = async (rewardId: number): Promise<void> => {
  await pool.query(`UPDATE rewards_tbl SET IsArchived = 0 WHERE Reward_id = ?`, [rewardId]);
};

/* READ */
export const getRewardById = async (id: number): Promise<Reward | null> => {
  const [rows]: any = await pool.query(`SELECT * FROM rewards_tbl WHERE Reward_id = ?`, [id]);
  return (rows as any[])[0] || null;
};

export const listRewards = async (opts: { archived?: boolean } = {}): Promise<Reward[]> => {
  if (opts.archived === true) {
    const [rows]: any = await pool.query(`SELECT * FROM rewards_tbl WHERE IsArchived = 1 ORDER BY Item ASC`);
    return rows;
  }
  if (opts.archived === false) {
    const [rows]: any = await pool.query(`SELECT * FROM rewards_tbl WHERE IsArchived = 0 ORDER BY Item ASC`);
    return rows;
  }
  const [rows]: any = await pool.query(`SELECT * FROM rewards_tbl ORDER BY Item ASC`);
  return rows;
};

/**
 * Redeem a reward (transactional)
 */
export const redeemReward = async (accountId: number, rewardId: number, quantity: number): Promise<{
  transactionId: number;
  redemption_code: string;
  total_points: number;
  status: string;
}> => {
  const conn: any = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [accRows]: any = await conn.query(`SELECT Points FROM accounts_tbl WHERE Account_id = ? FOR UPDATE`, [accountId]);
    if (!accRows || accRows.length === 0) throw new Error("Account not found");
    const accountPoints = accRows[0].Points as number;

    const [rewardRows]: any = await conn.query(`SELECT Points_cost, Quantity, IsArchived FROM rewards_tbl WHERE Reward_id = ? FOR UPDATE`, [rewardId]);
    if (!rewardRows || rewardRows.length === 0) throw new Error("Reward not found");
    const reward = rewardRows[0];
    if (reward.IsArchived === 1) throw new Error("Reward is archived");
    if (reward.Quantity < quantity) throw new Error("Insufficient reward stock");

    const totalCost = reward.Points_cost * quantity;
    if (accountPoints < totalCost) throw new Error("Insufficient points");

    const code = crypto.randomBytes(6).toString("hex").toUpperCase();

    const [insertResult]: any = await conn.query(
      `INSERT INTO reward_transactions_tbl (Reward_id, Account_id, Quantity, Total_points, Redemption_code, Status) VALUES (?, ?, ?, ?, ?, 'Unclaimed')`,
      [rewardId, accountId, quantity, totalCost, code]
    );

    await conn.query(`UPDATE accounts_tbl SET Points = Points - ? WHERE Account_id = ?`, [totalCost, accountId]);
    await conn.query(`UPDATE rewards_tbl SET Quantity = Quantity - ? WHERE Reward_id = ?`, [quantity, rewardId]);

    await conn.commit();

    return {
      transactionId: (insertResult as any).insertId,
      redemption_code: code,
      total_points: totalCost,
      status: "Pending",
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* mark transaction redeemed */
export const markTransactionRedeemed = async (transactionId: number) => {
  const sql = `
    UPDATE reward_transactions_tbl
    SET Status = 'Claimed',
        Redeemed_at = NOW()
    WHERE Reward_transaction_id = ?
  `;
  await pool.query(sql, [transactionId]);
  const [rows]: any = await pool.query(
    "SELECT * FROM reward_transactions_tbl WHERE Reward_transaction_id = ?",
    [transactionId]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
};

/* get transaction by code */
export const getTransactionByCode = async (code: string): Promise<(RewardTransaction & { Item?: string; Points_cost?: number }) | null> => {
  const [rows] = await pool.query(
    `SELECT rt.*, r.Item, r.Points_cost FROM reward_transactions_tbl rt JOIN rewards_tbl r ON rt.Reward_id = r.Reward_id WHERE Redemption_code = ?`,
    [code]
  );
  return (rows as any[])[0] || null;
};

/* list transactions */
export const listTransactions = async (opts: { status?: string; accountId?: number } = {}) => {
  const params: any[] = [];
  const where: string[] = [];

  if (opts.status) {
    const s = String(opts.status).toLowerCase();
    const statusVal = s === "claimed" ? "Claimed" : "Unclaimed";
    where.push("rt.Status = ?");
    params.push(statusVal);
  }

  if (opts.accountId) {
    where.push("rt.Account_id = ?");
    params.push(opts.accountId);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      rt.Reward_transaction_id,
      rt.Account_id,
      rt.Reward_id,
      r.Item,
      -- prefer profile first/last name and fallback to accounts.Username
      COALESCE(CONCAT(COALESCE(p.FirstName, ''), ' ', COALESCE(p.LastName, '')), a.Username, '') AS Fullname,
      -- profile email only (accounts_tbl has no Email column)
      COALESCE(p.Email, '') AS Email,
      rt.Quantity AS Quantity,
      rt.Total_points,
      rt.Redemption_code,
      rt.Status,
      rt.Redeemed_at,
      rt.Created_at
    FROM reward_transactions_tbl rt
    LEFT JOIN rewards_tbl r ON rt.Reward_id = r.Reward_id
    LEFT JOIN accounts_tbl a ON rt.Account_id = a.Account_id
    LEFT JOIN profile_tbl p ON rt.Account_id = p.Account_id
    ${whereSql}
    ORDER BY rt.Created_at DESC
  `;

  const [rows]: any = await pool.query(sql, params);
  return rows;
};

// -------------------- NEW: reward transaction attachments helpers --------------------
export const transactionExists = async (transactionId: number): Promise<boolean> => {
  const [rows]: any = await pool.query(
    "SELECT Reward_transaction_id FROM reward_transactions_tbl WHERE Reward_transaction_id = ?",
    [transactionId]
  );
  return Array.isArray(rows) && rows.length > 0;
};

export const insertRewardAttachment = async (payload: {
  Reward_transaction_id: number;
  Account_id?: number | null;
  File_path: string;
  Public_id?: string | null;
  File_name?: string | null;
  File_type?: string | null;
  File_size?: number | null;
  Created_by?: number | null;
}) => {
  const { Reward_transaction_id, Account_id, File_path, Public_id, File_name, File_type, File_size, Created_by } = payload;
  const [res]: any = await pool.query(
    `INSERT INTO reward_transaction_attachments_tbl
      (Reward_transaction_id, Account_id, File_path, Public_id, File_name, File_type, File_size, Created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [Reward_transaction_id, Account_id ?? null, File_path, Public_id ?? null, File_name ?? null, File_type ?? null, File_size ?? null, Created_by ?? null]
  );
  const insertId = (res as any).insertId;
  const [rows]: any = await pool.query("SELECT * FROM reward_transaction_attachments_tbl WHERE Attachment_id = ?", [insertId]);
  return (rows as any[])[0] || null;
};

export const listRewardAttachmentsByTransaction = async (transactionId: number) => {
  const [rows]: any = await pool.query(
    `SELECT Attachment_id, Reward_transaction_id, Account_id, File_path, Public_id, File_name, File_type, File_size, Created_at, Created_by
     FROM reward_transaction_attachments_tbl
     WHERE Reward_transaction_id = ?
     ORDER BY Created_at ASC`,
    [transactionId]
  );
  return rows;
};

export const getAttachmentById = async (attachmentId: number) => {
  const [rows]: any = await pool.query("SELECT * FROM reward_transaction_attachments_tbl WHERE Attachment_id = ?", [attachmentId]);
  return (rows as any[])[0] || null;
};

export const deleteAttachmentById = async (attachmentId: number) => {
  await pool.query("DELETE FROM reward_transaction_attachments_tbl WHERE Attachment_id = ?", [attachmentId]);
};

export const hasAttachments = async (transactionId: number): Promise<boolean> => {
  const [rows]: any = await pool.query(
    "SELECT Attachment_id FROM reward_transaction_attachments_tbl WHERE Reward_transaction_id = ? LIMIT 1",
    [transactionId]
  );
  return Array.isArray(rows) && rows.length > 0;
};