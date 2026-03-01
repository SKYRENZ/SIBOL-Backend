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
  const insertId = (result as any).insertId;

  // NEW: create a system notification targeting household users
  try {
    const eventType = "REWARD_NEW";
    // Insert into explicit reward columns; leave unrelated columns NULL
    await pool.query(
      `INSERT INTO system_notifications_tbl
         (Event_type, Username, FirstName, LastName, Email, Role_id, Container_name, Area_name, Reward_item, Reward_quantity, Reward_points, Created_at)
       VALUES (?, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?, ?, ?, NOW())`,
      [eventType, 4, reward.Item, Number(reward.Quantity ?? null), Number(reward.Points_cost ?? null)]
    );
  } catch (e) {
    // non-fatal: don't break reward creation if notif insert fails
    console.warn("createReward: failed to insert system notification", e);
  }

  return insertId;
};

/* UPDATE (partial) */
export const updateReward = async (rewardId: number, fields: Partial<Reward>): Promise<void> => {
  // fetch existing to detect changes (quantity/restock/price/item changes)
  const [existingRows]: any = await pool.query(`SELECT * FROM rewards_tbl WHERE Reward_id = ? LIMIT 1`, [rewardId]);
  const existing = (existingRows as any[])[0] || null;
  if (!existing) throw new Error("Reward not found");

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

  // NEW: determine event and create system notification for households
  try {
    const oldQty = Number(existing.Quantity ?? 0);
    const newQty = Number(fields.Quantity !== undefined ? fields.Quantity : existing.Quantity ?? 0);
    const itemName = (fields.Item ?? existing.Item) as string;
    const pointsCost = (fields.Points_cost !== undefined ? fields.Points_cost : existing.Points_cost) as any;

    let eventType = "";
    if (fields.Quantity !== undefined && newQty > oldQty) {
      eventType = "REWARD_RESTOCKED";
    } else {
      // any other change considered update
      eventType = "REWARD_UPDATED";
    }

    // Insert into explicit reward columns; leave unrelated fields NULL
    await pool.query(
      `INSERT INTO system_notifications_tbl
         (Event_type, Username, FirstName, LastName, Email, Role_id, Container_name, Area_name, Reward_item, Reward_quantity, Reward_points, Created_at)
       VALUES (?, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?, ?, ?, NOW())`,
      [eventType, 4, itemName, Number(isNaN(newQty) ? null : newQty), Number(isNaN(Number(pointsCost)) ? null : Number(pointsCost))]
    );
  } catch (e) {
    console.warn("updateReward: failed to insert system notification", e);
  }
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

    // Grab points + metadata for notification target
    const [accRows]: any = await conn.query(
      `SELECT Points, Username, Roles FROM accounts_tbl WHERE Account_id = ? FOR UPDATE`,
      [accountId]
    );
    if (!accRows || accRows.length === 0) throw new Error("Account not found");
    const accountPoints = accRows[0].Points as number;
    const accountUsername = accRows[0].Username ?? null;
    const accountRole = accRows[0].Roles ?? null;

    const [rewardRows]: any = await conn.query(`SELECT Points_cost, Quantity, IsArchived, Item FROM rewards_tbl WHERE Reward_id = ? FOR UPDATE`, [rewardId]);
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

    // create a user-targeted system notification: "unclaimed" (household sees it)
    try {
      await pool.query(
        `INSERT INTO system_notifications_tbl
           (Event_type, Username, FirstName, LastName, Email, Role_id, Container_name, Area_name, Reward_item, Reward_quantity, Reward_points, Created_at)
         VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, ?, ?, NOW())`,
        ['REWARD_UNCLAIMED', accountUsername, Number(accountRole ?? 4), reward.Item, Number(quantity), Number(totalCost)]
      );
    } catch (e) {
      console.warn('redeemReward: failed to insert REWARD_UNCLAIMED notification', e);
    }

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
    "SELECT rt.*, r.Item, r.Points_cost, a.Username AS account_username, a.Roles AS account_roles FROM reward_transactions_tbl rt JOIN rewards_tbl r ON rt.Reward_id = r.Reward_id LEFT JOIN accounts_tbl a ON rt.Account_id = a.Account_id WHERE Reward_transaction_id = ?",
    [transactionId]
  );
  const tx = Array.isArray(rows) && rows.length ? rows[0] : null;

  // notify the user (and their role) that their redemption is claimed
  try {
    if (tx) {
      const acctUser = tx.account_username ?? null;
      const acctRole = Number(tx.account_roles ?? 4);
      const item = tx.Item ?? null;
      await pool.query(
        `INSERT INTO system_notifications_tbl
           (Event_type, Username, FirstName, LastName, Email, Role_id, Container_name, Area_name, Reward_item, Reward_quantity, Reward_points, Created_at)
         VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, ?, ?, NOW())`,
        ['REWARD_CLAIMED', acctUser, acctRole, item, Number(tx.Quantity ?? 1), Number(tx.Total_points ?? 0)]
      );
    }
  } catch (e) {
    console.warn('markTransactionRedeemed: failed to insert REWARD_CLAIMED notification', e);
  }

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

/* NEW: helper to notify a single user when their points reach enough for a reward.
   Call this from your "add points" / QR-scan handler after you credit points to the account. */
export const notifyPointsEnough = async (accountId: number, rewardId: number) => {
  // fetch current points and reward cost
  const [[accRows]]: any = await pool.query(`SELECT Points, Username, Roles FROM accounts_tbl WHERE Account_id = ? LIMIT 1`, [accountId]);
  const acc = accRows ?? null;
  if (!acc) return false;

  const [rewardRows]: any = await pool.query(`SELECT Reward_id, Item, Points_cost FROM rewards_tbl WHERE Reward_id = ? LIMIT 1`, [rewardId]);
  const reward = (rewardRows as any[])[0] ?? null;
  if (!reward) return false;

  const points = Number(acc.Points ?? 0);
  const cost = Number(reward.Points_cost ?? 0);
  if (points >= cost) {
    try {
      await pool.query(
        `INSERT INTO system_notifications_tbl
           (Event_type, Username, FirstName, LastName, Email, Role_id, Container_name, Area_name, Reward_item, Reward_quantity, Reward_points, Created_at)
         VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, NULL, ?, NOW())`,
        ['REWARD_ELIGIBLE', acc.Username ?? null, Number(acc.Roles ?? 4), reward.Item, cost]
      );
      return true;
    } catch (e) {
      console.warn('notifyPointsEnough: failed to insert REWARD_ELIGIBLE notification', e);
      return false;
    }
  }
  return false;
};

export const notifyEligibleRewardsOnPointsIncrease = async (accountId: number, oldPoints: number, newPoints: number) => {
  console.log('[rewardService] notifyEligibleRewardsOnPointsIncrease called', { accountId, oldPoints, newPoints });
  if (Number(newPoints) <= Number(oldPoints)) {
    console.log('[rewardService] no points increase, skipping');
    return 0;
  }

  const [accRows]: any = await pool.query(`SELECT Username, Roles, Points FROM accounts_tbl WHERE Account_id = ? LIMIT 1`, [accountId]);
  const acct = accRows?.[0] ?? null;
  const username = acct?.Username ?? null;
  const roleId = Number(acct?.Roles ?? 4);
  console.log('[rewardService] account row', acct);

  // DEBUG: list rewards with cost <= newPoints (temporarily remove > oldPoints to inspect candidates)
  const [rows]: any = await pool.query(
    `SELECT Reward_id, Item, Points_cost, Quantity
     FROM rewards_tbl
     WHERE IsArchived = 0 AND Quantity > 0 AND CAST(Points_cost AS DECIMAL(10,2)) <= ?
     ORDER BY CAST(Points_cost AS DECIMAL(10,2)) ASC`,
    [Number(newPoints)]
  );

  console.log('[rewardService] debug eligible rewards found count=', Array.isArray(rows) ? rows.length : 0, rows);

  if (!Array.isArray(rows) || rows.length === 0) return 0;

  let inserted = 0;
  for (const r of rows) {
    try {
      await pool.query(
        `INSERT INTO system_notifications_tbl
           (Event_type, Username, FirstName, LastName, Email, Role_id, Reward_item, Reward_quantity, Reward_points, Created_at)
         VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, ?, NOW())`,
        ['REWARD_ELIGIBLE', username, roleId, r.Item, Number(r.Quantity ?? null), Number(r.Points_cost ?? 0)]
      );
      inserted++;
    } catch (e) {
      console.warn('notifyEligibleRewardsOnPointsIncrease: failed to insert notification for reward', r.Reward_id, e);
    }
  }

  console.log('[rewardService] inserted REWARD_ELIGIBLE notifications count=', inserted);
  return inserted;
};