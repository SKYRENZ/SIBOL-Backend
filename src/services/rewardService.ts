import { pool } from "../config/db";
import crypto from "crypto";

type Reward = {
  Reward_id?: number;
  Item: string;
  Description?: string;
  Points_cost: number;
  Quantity: number;
  IsArchived?: number;
};

export const createReward = async (reward: Reward) => {
  const sql = `INSERT INTO rewards_tbl (Item, Description, Points_cost, Quantity) VALUES (?, ?, ?, ?)`;
  const [result] = await pool.query(sql, [reward.Item, reward.Description || null, reward.Points_cost, reward.Quantity]);
  return (result as any).insertId;
};

export const updateReward = async (id: number, updates: Partial<Reward>) => {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.Item !== undefined) { fields.push("Item = ?"); values.push(updates.Item); }
  if (updates.Description !== undefined) { fields.push("Description = ?"); values.push(updates.Description); }
  if (updates.Points_cost !== undefined) { fields.push("Points_cost = ?"); values.push(updates.Points_cost); }
  if (updates.Quantity !== undefined) { fields.push("Quantity = ?"); values.push(updates.Quantity); }
  if (fields.length === 0) return;
  const sql = `UPDATE rewards_tbl SET ${fields.join(", ")} WHERE Reward_id = ?`;
  values.push(id);
  await pool.query(sql, values);
};

export const archiveReward = async (id: number) => {
  const sql = `UPDATE rewards_tbl SET IsArchived = 1 WHERE Reward_id = ?`;
  await pool.query(sql, [id]);
};

export const restoreReward = async (id: number) => {
  const sql = `UPDATE rewards_tbl SET IsArchived = 0 WHERE Reward_id = ?`;
  await pool.query(sql, [id]);
};

export const getRewardById = async (id: number) => {
  const [rows] = await pool.query(`SELECT * FROM rewards_tbl WHERE Reward_id = ?`, [id]);
  return (rows as any[])[0] || null;
};

export const listRewards = async (options: { archived?: boolean | null } = {}) => {
  if (options.archived === true) {
    const [rows] = await pool.query(`SELECT * FROM rewards_tbl WHERE IsArchived = 1 ORDER BY Created_at DESC`);
    return rows;
  } else if (options.archived === false) {
    const [rows] = await pool.query(`SELECT * FROM rewards_tbl WHERE IsArchived = 0 ORDER BY Created_at DESC`);
    return rows;
  } else {
    const [rows] = await pool.query(`SELECT * FROM rewards_tbl ORDER BY Created_at DESC`);
    return rows;
  }
};

/**
 * Redeem a reward:
 * - checks account points
 * - checks reward stock
 * - creates a transaction with a unique code
 * - deducts account points and reward quantity in a DB transaction
 */
export const redeemReward = async (accountId: number, rewardId: number, quantity: number) => {
  const conn: any = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the account row and reward row
    const [accRows] = await conn.query(`SELECT Points FROM accounts_tbl WHERE Account_id = ? FOR UPDATE`, [accountId]);
    if (!accRows || (accRows as any[]).length === 0) throw new Error("Account not found");
    const accountPoints = (accRows as any[])[0].Points as number;

    const [rewardRows] = await conn.query(`SELECT Points_cost, Quantity, IsArchived FROM rewards_tbl WHERE Reward_id = ? FOR UPDATE`, [rewardId]);
    if (!rewardRows || (rewardRows as any[]).length === 0) throw new Error("Reward not found");
    const reward = (rewardRows as any[])[0];
    if (reward.IsArchived === 1) throw new Error("Reward is archived");
    if (reward.Quantity < quantity) throw new Error("Insufficient reward stock");

    const totalCost = reward.Points_cost * quantity;
    if (accountPoints < totalCost) throw new Error("Insufficient points");

    // generate unique redemption code
    const code = crypto.randomBytes(6).toString("hex").toUpperCase(); // 12 hex chars

    // insert transaction
    const [insertResult] = await conn.query(
      `INSERT INTO reward_transactions_tbl (Reward_id, Account_id, Quantity, Total_points, Redemption_code, Status) VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [rewardId, accountId, quantity, totalCost, code]
    );

    // deduct points from account
    await conn.query(`UPDATE accounts_tbl SET Points = Points - ? WHERE Account_id = ?`, [totalCost, accountId]);

    // reduce reward stock
    await conn.query(`UPDATE rewards_tbl SET Quantity = Quantity - ? WHERE Reward_id = ?`, [quantity, rewardId]);

    await conn.commit();

    return {
      transactionId: (insertResult as any).insertId,
      redemption_code: code,
      total_points: totalCost,
      status: "Pending"
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Optional: mark a transaction as Redeemed (used by barangay staff when they validate code)
 */
export const markTransactionRedeemed = async (transactionId: number) => {
  const [rows] = await pool.query(`UPDATE reward_transactions_tbl SET Status = 'Redeemed', Redeemed_at = NOW() WHERE Reward_transaction_id = ?`, [transactionId]);
  return rows;
};

export const getTransactionByCode = async (code: string) => {
  const [rows] = await pool.query(`SELECT rt.*, r.Item, r.Points_cost FROM reward_transactions_tbl rt JOIN rewards_tbl r ON rt.Reward_id = r.Reward_id WHERE Redemption_code = ?`, [code]);
  return (rows as any[])[0] || null;
};