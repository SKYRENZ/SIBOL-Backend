import type { Request, Response } from "express";
import * as rewardService from "../services/rewardService";
import cloudinary from "../config/cloudinary"; // ✅ needed for attachment deletion

export const createReward = async (req: Request, res: Response) => {
  try {
    const { Item, Description, Points_cost, Quantity } = req.body;
    if (!Item || Points_cost == null || Quantity == null) return res.status(400).json({ message: "Missing required fields" });
    const id = await rewardService.createReward({ Item, Description, Points_cost, Quantity });
    return res.status(201).json({ message: "Reward created", Reward_id: id });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

export const updateReward = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await rewardService.updateReward(id, req.body);
    return res.json({ message: "Reward updated" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

export const archiveReward = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await rewardService.archiveReward(id);
    return res.json({ message: "Reward archived" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

export const restoreReward = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await rewardService.restoreReward(id);
    return res.json({ message: "Reward restored" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

export const listRewards = async (req: Request, res: Response) => {
  try {
    const archived = req.query.archived;
    let options: any = {};
    if (archived === "true") options.archived = true;
    else if (archived === "false") options.archived = false;
    const rows = await rewardService.listRewards(options);
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

export const getReward = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const reward = await rewardService.getRewardById(id);
    if (!reward) return res.status(404).json({ message: "Reward not found" });
    return res.json(reward);
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

export const redeemReward = async (req: Request, res: Response) => {
  try {
    const { account_id, reward_id, quantity } = req.body;
    if (!account_id || !reward_id || !quantity) return res.status(400).json({ message: "Missing required fields" });
    const result = await rewardService.redeemReward(Number(account_id), Number(reward_id), Number(quantity));
    return res.status(201).json({ message: "Redeemed", data: result });
  } catch (err: any) {
    // map known messages for client-friendly response
    const msg = err.message || "Server error";
    if (msg.includes("Insufficient")) return res.status(400).json({ message: msg });
    if (msg.includes("not found") || msg.includes("archived")) return res.status(404).json({ message: msg });
    return res.status(500).json({ message: msg });
  }
};

export const validateRedemptionCode = async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    if (!code) return res.status(400).json({ message: "Missing code parameter" });
    const tx = await rewardService.getTransactionByCode(code);
    if (!tx) return res.status(404).json({ message: "Code not found" });
    return res.json(tx);
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

export const markRedeemed = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid transaction id" });

    // ensure attachment exists (if enforced)
    const has = await rewardService.hasAttachments(id);
    if (!has) {
      return res.status(400).json({ message: "Please upload at least one attachment before marking as claimed." });
    }

    const updated = await rewardService.markTransactionRedeemed(id);
    return res.json({ message: "Transaction marked as Redeemed", transaction: updated });
  } catch (err: any) {
    console.error("markRedeemed error:", err);
    return res.status(500).json({ message: err?.message ?? "Server error" });
  }
};

export const listTransactions = async (req: Request, res: Response) => {
  try {
    const status = req.query.status ? String(req.query.status).trim() : undefined;

    // If household user, restrict to their own transactions
    const authUser: any = (req as any).user;
    let accountFilter: number | undefined = undefined;

    if (authUser && Number(authUser?.Roles) === 4) {
      accountFilter = Number(authUser?.Account_id);
    } else if (req.query.account_id) {
      accountFilter = Number(req.query.account_id);
    }

    const opts: { status?: string; accountId?: number } = {};
    if (status !== undefined) opts.status = status;
    if (accountFilter !== undefined) opts.accountId = accountFilter;

    const rows = await rewardService.listTransactions(opts);
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message ?? "Server error" });
  }
};

export const listRewardAttachments = async (req: Request, res: Response) => {
  try {
    const txId = Number(req.params.transactionId ?? req.query.transactionId);
    if (!txId) return res.status(400).json({ message: "Missing transaction id" });

    const rows = await rewardService.listRewardAttachmentsByTransaction(txId);
    return res.json(rows);
  } catch (err: any) {
    console.error("listRewardAttachments error:", err);
    return res.status(500).json({ message: err?.message ?? "Server error" });
  }
};

export const deleteRewardAttachment = async (req: Request, res: Response) => {
  try {
    const attachId = Number(req.params.id);
    if (!attachId) return res.status(400).json({ message: "Missing attachment id" });

    const row = await rewardService.getAttachmentById(attachId);
    if (!row) return res.status(404).json({ message: "Attachment not found" });

    if (row.Public_id) {
      try {
        await cloudinary.uploader.destroy(String(row.Public_id), { resource_type: "auto" });
      } catch (e) {
        console.warn("cloudinary destroy failed, continuing:", e);
      }
    }

    await rewardService.deleteAttachmentById(attachId);
    return res.json({ message: "Attachment deleted" });
  } catch (err: any) {
    console.error("deleteRewardAttachment error:", err);
    return res.status(500).json({ message: err?.message ?? "Server error" });
  }
};