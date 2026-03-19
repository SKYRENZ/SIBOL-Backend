import { pool } from "../config/db"; // keep default import so tests that mock the module work
import crypto from "crypto";
import type { Reward, RewardTransaction } from "../models/types";
import { sendPushToAccount, sendPushToRoleAndBarangay } from "./pushNotificationService";

type RewardActorInfo = {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

function rewardUpdatedPushBody(eventType: string, itemName: string, qty: number): string {
  if (eventType === "REWARD_RESTOCKED") {
    return `${itemName} was restocked (new quantity: ${qty}).`;
  }
  return `${itemName} was updated.`;
}

/* CREATE */
export const createReward = async (
  reward: Reward,
  actorBarangayId: number,
  actor: RewardActorInfo = {}
): Promise<number> => {
  const sql = "INSERT INTO rewards_tbl (Item, Description, Points_cost, Quantity) VALUES (?, ?, ?, ?)";
  const [result]: any = await pool.query(sql, [
    reward.Item,
    reward.Description || null,
    reward.Points_cost,
    reward.Quantity,
  ]);
  const insertId = Number((result as any).insertId);

  try {
    const eventType = "REWARD_NEW";
    await pool.query(
      "INSERT INTO system_notifications_tbl " +
        "(Event_type, Username, FirstName, LastName, Email, Role_id, Barangay_id, Reward_item, Reward_quantity, Reward_points, Created_at) " +
        "VALUES (?, NULL, ?, ?, ?, 4, ?, ?, ?, ?, NOW())",
      [
        eventType,
        actor.firstName ?? null,
        actor.lastName ?? null,
        actor.email ?? null,
        actorBarangayId,
        reward.Item ?? null,
        Number(reward.Quantity ?? 0),
        Number(reward.Points_cost ?? 0),
      ]
    );
  } catch (e) {
    console.warn("createReward: failed to insert system notification", e);
  }

  try {
    await sendPushToRoleAndBarangay(4, actorBarangayId, {
      title: "New Reward Available",
      body: `${reward.Item ?? "A reward"} is now available in your barangay.`,
      data: {
        type: "reward",
        eventType: "REWARD_NEW",
        rewardId: insertId,
      },
      sound: "default",
    });
  } catch (e) {
    console.warn("createReward: push send failed", e);
  }

  return insertId;
};

/* UPDATE (partial) */
export const updateReward = async (
  rewardId: number,
  fields: Partial<Reward>,
  actorBarangayId: number,
  actor: RewardActorInfo = {}
): Promise<void> => {
  const [existingRows]: any = await pool.query("SELECT * FROM rewards_tbl WHERE Reward_id = ? LIMIT 1", [rewardId]);
  const existing = (existingRows as any[])[0] || null;
  if (!existing) throw new Error("Reward not found");

  const sets: string[] = [];
  const params: any[] = [];
  if (fields.Item !== undefined) {
    sets.push("Item = ?");
    params.push(fields.Item);
  }
  if (fields.Description !== undefined) {
    sets.push("Description = ?");
    params.push(fields.Description);
  }
  if (fields.Points_cost !== undefined) {
    sets.push("Points_cost = ?");
    params.push(fields.Points_cost);
  }
  if (fields.Quantity !== undefined) {
    sets.push("Quantity = ?");
    params.push(fields.Quantity);
  }
  if (fields.IsArchived !== undefined) {
    sets.push("IsArchived = ?");
    params.push(fields.IsArchived);
  }
  if (fields.Image_url !== undefined) {
    sets.push("Image_url = ?");
    params.push(fields.Image_url);
  }
  if (fields.Image_public_id !== undefined) {
    sets.push("Image_public_id = ?");
    params.push(fields.Image_public_id);
  }

  if (sets.length === 0) return;

  const updateSql = "UPDATE rewards_tbl SET " + sets.join(", ") + " WHERE Reward_id = ?";
  params.push(rewardId);
  await pool.query(updateSql, params);

  let eventType = "REWARD_UPDATED";
  let itemName = String(fields.Item ?? existing.Item ?? "Reward");
  let newQty = Number(fields.Quantity !== undefined ? fields.Quantity : existing.Quantity ?? 0);
  let pointsCost = Number(fields.Points_cost !== undefined ? fields.Points_cost : existing.Points_cost ?? 0);

  try {
    const oldQty = Number(existing.Quantity ?? 0);
    if (fields.Quantity !== undefined && newQty > oldQty) {
      eventType = "REWARD_RESTOCKED";
    }

    // Avoid immediate duplicate event after create->update races
    try {
      const createdRaw = existing.Created_at ?? existing.CreatedAt ?? existing.created_at ?? null;
      if (createdRaw && (eventType === "REWARD_UPDATED" || eventType === "REWARD_RESTOCKED")) {
        const createdAt = new Date(createdRaw);
        if (!isNaN(createdAt.getTime()) && Date.now() - createdAt.getTime() < 10000) {
          return;
        }
      }
    } catch (_e) {}

    await pool.query(
      "INSERT INTO system_notifications_tbl " +
        "(Event_type, Username, FirstName, LastName, Email, Role_id, Barangay_id, Reward_item, Reward_quantity, Reward_points, Created_at) " +
        "VALUES (?, NULL, ?, ?, ?, 4, ?, ?, ?, ?, NOW())",
      [
        eventType,
        actor.firstName ?? null,
        actor.lastName ?? null,
        actor.email ?? null,
        actorBarangayId,
        itemName ?? null,
        Number(isNaN(newQty) ? 0 : newQty),
        Number(isNaN(pointsCost) ? 0 : pointsCost),
      ]
    );
  } catch (e) {
    console.warn("updateReward: failed to insert system notification", e);
  }

  try {
    await sendPushToRoleAndBarangay(4, actorBarangayId, {
      title: eventType === "REWARD_RESTOCKED" ? "Reward Restocked" : "Reward Updated",
      body: rewardUpdatedPushBody(eventType, itemName, Number(isNaN(newQty) ? 0 : newQty)),
      data: {
        type: "reward",
        eventType,
        rewardId,
      },
      sound: "default",
    });
  } catch (e) {
    console.warn("updateReward: push send failed", e);
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
export const redeemReward = async (
  accountId: number,
  rewardId: number,
  quantity: number
): Promise<{
  transactionId: number;
  redemption_code: string;
  total_points: number;
  status: string;
}> => {
  const conn: any = await pool.getConnection();
  let accountUsername: string | null = null;
  let accountBarangayId: number | null = null;
  let rewardItem: string | null = null;
  let totalCost = 0;
  let insertedTransactionId = 0;
  let code = "";

  try {
    await conn.beginTransaction();

    const [accRows]: any = await conn.query(
      `SELECT a.Points, a.Username, a.Roles, p.Barangay_id
       FROM accounts_tbl a
       LEFT JOIN profile_tbl p ON p.Account_id = a.Account_id
       WHERE a.Account_id = ?
       FOR UPDATE`,
      [accountId]
    );
    if (!accRows || accRows.length === 0) throw new Error("Account not found");
    const accountPoints = Number(accRows[0].Points ?? 0);
    accountUsername = accRows[0].Username ?? null;
    accountBarangayId =
      accRows[0].Barangay_id != null && !Number.isNaN(Number(accRows[0].Barangay_id))
        ? Number(accRows[0].Barangay_id)
        : null;

    const [rewardRows]: any = await conn.query(
      `SELECT Points_cost, Quantity, IsArchived, Item FROM rewards_tbl WHERE Reward_id = ? FOR UPDATE`,
      [rewardId]
    );
    if (!rewardRows || rewardRows.length === 0) throw new Error("Reward not found");
    const reward = rewardRows[0];
    rewardItem = reward.Item ?? null;

    if (Number(reward.IsArchived) === 1) throw new Error("Reward is archived");
    if (Number(reward.Quantity ?? 0) < quantity) throw new Error("Insufficient reward stock");

    totalCost = Number(reward.Points_cost ?? 0) * quantity;
    if (accountPoints < totalCost) throw new Error("Insufficient points");

    code = crypto.randomBytes(6).toString("hex").toUpperCase();

    const [insertResult]: any = await conn.query(
      `INSERT INTO reward_transactions_tbl
        (Reward_id, Account_id, Quantity, Total_points, Redemption_code, Status)
       VALUES (?, ?, ?, ?, ?, 'Unclaimed')`,
      [rewardId, accountId, quantity, totalCost, code]
    );
    insertedTransactionId = Number((insertResult as any).insertId);

    await conn.query(`UPDATE accounts_tbl SET Points = Points - ? WHERE Account_id = ?`, [totalCost, accountId]);
    await conn.query(`UPDATE rewards_tbl SET Quantity = Quantity - ? WHERE Reward_id = ?`, [quantity, rewardId]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Notify account in-app
  try {
    await pool.query(
      `INSERT INTO system_notifications_tbl
         (Event_type, Username, Role_id, Reward_item, Reward_quantity, Reward_points, Created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      ["REWARD_UNCLAIMED", accountUsername, null, rewardItem, Number(quantity), Number(totalCost)]
    );
  } catch (e) {
    console.warn("redeemReward: failed to insert REWARD_UNCLAIMED notification", e);
  }

  // Push to redeemer
  try {
    await sendPushToAccount(accountId, {
      title: "Reward Redemption Submitted",
      body: `You redeemed ${quantity}x ${rewardItem ?? "reward"}. Claim code: ${code}.`,
      data: {
        type: "reward",
        eventType: "REWARD_UNCLAIMED",
        transactionId: insertedTransactionId,
        rewardId,
      },
      sound: "default",
    });
  } catch (e) {
    console.warn("redeemReward: push to account failed", e);
  }

  // Optional push to barangay staff to process claim
  try {
    if (accountBarangayId && !Number.isNaN(accountBarangayId)) {
      await sendPushToRoleAndBarangay(2, accountBarangayId, {
        title: "New Reward Claim",
        body: `${accountUsername ?? "A household"} redeemed ${rewardItem ?? "a reward"}.`,
        data: {
          type: "reward",
          eventType: "REWARD_UNCLAIMED",
          transactionId: insertedTransactionId,
          rewardId,
        },
        sound: "default",
      });
    }
  } catch (e) {
    console.warn("redeemReward: push to staff failed", e);
  }

  return {
    transactionId: insertedTransactionId,
    redemption_code: code,
    total_points: totalCost,
    status: "Pending",
  };
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
    `SELECT
       rt.*,
       r.Item,
       r.Points_cost,
       a.Username AS account_username,
       a.Roles AS account_roles
     FROM reward_transactions_tbl rt
     JOIN rewards_tbl r ON rt.Reward_id = r.Reward_id
     LEFT JOIN accounts_tbl a ON rt.Account_id = a.Account_id
     WHERE rt.Reward_transaction_id = ?`,
    [transactionId]
  );
  const tx = Array.isArray(rows) && rows.length ? rows[0] : null;

  try {
    if (tx) {
      const acctUser = tx.account_username ?? null;
      const item = tx.Item ?? null;
      await pool.query(
        `INSERT INTO system_notifications_tbl
           (Event_type, Username, Role_id, Reward_item, Reward_quantity, Reward_points, Created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        ["REWARD_CLAIMED", acctUser, null, item, Number(tx.Quantity ?? 1), Number(tx.Total_points ?? 0)]
      );
    }
  } catch (e) {
    console.warn("markTransactionRedeemed: failed to insert REWARD_CLAIMED notification", e);
  }

  try {
    if (tx?.Account_id) {
      await sendPushToAccount(Number(tx.Account_id), {
        title: "Reward Claimed",
        body: `Your reward ${tx.Item ?? ""} has been marked as claimed.`,
        data: {
          type: "reward",
          eventType: "REWARD_CLAIMED",
          transactionId: Number(tx.Reward_transaction_id),
          rewardId: Number(tx.Reward_id),
        },
        sound: "default",
      });
    }
  } catch (e) {
    console.warn("markTransactionRedeemed: push send failed", e);
  }

  return tx;
};

/* get transaction by code */
export const getTransactionByCode = async (
  code: string
): Promise<(RewardTransaction & { Item?: string; Points_cost?: number }) | null> => {
  const [rows] = await pool.query(
    `SELECT rt.*, r.Item, r.Points_cost
     FROM reward_transactions_tbl rt
     JOIN rewards_tbl r ON rt.Reward_id = r.Reward_id
     WHERE Redemption_code = ?`,
    [code]
  );
  return (rows as any[])[0] || null;
};

export const getTransactionById = async (
  id: number
): Promise<(RewardTransaction & { Item?: string; Points_cost?: number }) | null> => {
  const [rows] = await pool.query(
    `SELECT rt.*, r.Item, r.Points_cost
     FROM reward_transactions_tbl rt
     LEFT JOIN rewards_tbl r ON rt.Reward_id = r.Reward_id
     WHERE rt.Reward_transaction_id = ?`,
    [id]
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
      COALESCE(CONCAT(COALESCE(p.FirstName, ''), ' ', COALESCE(p.LastName, '')), a.Username, '') AS Fullname,
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

// -------------------- reward transaction attachments helpers --------------------
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
  const { Reward_transaction_id, Account_id, File_path, Public_id, File_name, File_type, File_size, Created_by } =
    payload;
  const [res]: any = await pool.query(
    `INSERT INTO reward_transaction_attachments_tbl
      (Reward_transaction_id, Account_id, File_path, Public_id, File_name, File_type, File_size, Created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Reward_transaction_id,
      Account_id ?? null,
      File_path,
      Public_id ?? null,
      File_name ?? null,
      File_type ?? null,
      File_size ?? null,
      Created_by ?? null,
    ]
  );
  const insertId = Number((res as any).insertId);
  const [rows]: any = await pool.query("SELECT * FROM reward_transaction_attachments_tbl WHERE Attachment_id = ?", [
    insertId,
  ]);
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
  const [rows]: any = await pool.query("SELECT * FROM reward_transaction_attachments_tbl WHERE Attachment_id = ?", [
    attachmentId,
  ]);
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

/* Notify a single user when their points are enough for one reward */
export const notifyPointsEnough = async (accountId: number, rewardId: number) => {
  const [accRows]: any = await pool.query(
    `SELECT Points, Username, Roles FROM accounts_tbl WHERE Account_id = ? LIMIT 1`,
    [accountId]
  );
  const acc = (accRows as any[])[0] ?? null;
  if (!acc) return false;

  const [rewardRows]: any = await pool.query(
    `SELECT Reward_id, Item, Points_cost FROM rewards_tbl WHERE Reward_id = ? LIMIT 1`,
    [rewardId]
  );
  const reward = (rewardRows as any[])[0] ?? null;
  if (!reward) return false;

  const points = Number(acc.Points ?? 0);
  const cost = Number(reward.Points_cost ?? 0);
  if (points < cost) return false;

  try {
    await pool.query(
      `INSERT INTO system_notifications_tbl
         (Event_type, Username, Role_id, Reward_item, Reward_quantity, Reward_points, Created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      ["REWARD_ELIGIBLE", acc.Username ?? null, null, reward.Item ?? null, null, cost]
    );
  } catch (e) {
    console.warn("notifyPointsEnough: failed to insert REWARD_ELIGIBLE notification", e);
    return false;
  }

  try {
    await sendPushToAccount(accountId, {
      title: "Reward Available",
      body: `${reward.Item ?? "A reward"} is now redeemable with your current points.`,
      data: {
        type: "reward",
        eventType: "REWARD_ELIGIBLE",
        rewardId: Number(reward.Reward_id),
      },
      sound: "default",
    });
  } catch (e) {
    console.warn("notifyPointsEnough: push send failed", e);
  }

  return true;
};

export const notifyEligibleRewardsOnPointsIncrease = async (accountId: number, oldPoints: number, newPoints: number) => {
  if (Number(newPoints) <= Number(oldPoints)) return 0;

  const [accRows]: any = await pool.query(`SELECT Username FROM accounts_tbl WHERE Account_id = ? LIMIT 1`, [accountId]);
  const acct = (accRows as any[])[0] ?? null;
  const username = acct?.Username ?? null;

  const [rows]: any = await pool.query(
    `SELECT Reward_id, Item, Points_cost, Quantity
     FROM rewards_tbl
     WHERE IsArchived = 0
       AND Quantity > 0
       AND CAST(Points_cost AS DECIMAL(10,2)) > ?
       AND CAST(Points_cost AS DECIMAL(10,2)) <= ?
     ORDER BY CAST(Points_cost AS DECIMAL(10,2)) ASC`,
    [Number(oldPoints), Number(newPoints)]
  );

  if (!Array.isArray(rows) || rows.length === 0) return 0;

  let inserted = 0;
  for (const r of rows) {
    try {
      await pool.query(
        `INSERT INTO system_notifications_tbl
           (Event_type, Username, Role_id, Reward_item, Reward_quantity, Reward_points, Created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          "REWARD_ELIGIBLE",
          username,
          null,
          r.Item ?? null,
          Number(r.Quantity ?? 0),
          Number(r.Points_cost ?? 0),
        ]
      );
      inserted++;
    } catch (e) {
      console.warn(
        "notifyEligibleRewardsOnPointsIncrease: failed to insert notification for reward",
        r?.Reward_id,
        e
      );
    }
  }

  if (inserted > 0) {
    try {
      await sendPushToAccount(accountId, {
        title: "New Rewards Unlocked",
        body: `${inserted} reward${inserted > 1 ? "s are" : " is"} now redeemable with your points.`,
        data: {
          type: "reward",
          eventType: "REWARD_ELIGIBLE",
          count: inserted,
        },
        sound: "default",
      });
    } catch (e) {
      console.warn("notifyEligibleRewardsOnPointsIncrease: push send failed", e);
    }
  }

  return inserted;
};