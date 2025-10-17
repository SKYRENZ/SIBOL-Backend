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
      `INSERT INTO reward_transactions_tbl (Reward_id, Account_id, Quantity, Total_points, Redemption_code, Status) VALUES (?, ?, ?, ?, ?, 'Pending')`,
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
export const markTransactionRedeemed = async (transactionId: number): Promise<any> => {
  const [rows] = await pool.query(`UPDATE reward_transactions_tbl SET Status = 'Redeemed', Redeemed_at = NOW() WHERE Reward_transaction_id = ?`, [transactionId]);
  return rows;
};

/* get transaction by code */
export const getTransactionByCode = async (code: string): Promise<(RewardTransaction & { Item?: string; Points_cost?: number }) | null> => {
  const [rows] = await pool.query(
    `SELECT rt.*, r.Item, r.Points_cost FROM reward_transactions_tbl rt JOIN rewards_tbl r ON rt.Reward_id = r.Reward_id WHERE Redemption_code = ?`,
    [code]
  );
  return (rows as any[])[0] || null;
};