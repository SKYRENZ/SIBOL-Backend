import type { Request, Response } from "express";
import * as rewardService from "../services/rewardService";
import cloudinary from "../config/cloudinary"; // ✅ needed for attachment deletion

type RewardActorInfo = {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

function getRewardActorInfo(req: Request): { barangayId: number; actor: RewardActorInfo } | null {
  const actor: any = (req as any).user;
  const barangayId = Number(actor?.Barangay_id);

  if (!barangayId || Number.isNaN(barangayId)) return null;

  return {
    barangayId,
    actor: {
      username: actor?.Username ? String(actor.Username) : null,
      firstName: actor?.FirstName ? String(actor.FirstName) : null,
      lastName: actor?.LastName ? String(actor.LastName) : null,
      email: actor?.Profile_Email ? String(actor.Profile_Email) : (actor?.Email ? String(actor.Email) : null),
    },
  };
}

export const createReward = async (req: Request, res: Response) => {
  try {
    const { Item, Description, Points_cost, Quantity } = req.body;
    if (!Item || Points_cost == null || Quantity == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const actorCtx = getRewardActorInfo(req);
    if (!actorCtx) {
      return res.status(400).json({ message: "Actor barangay is required" });
    }

    const id = await rewardService.createReward(
      { Item, Description, Points_cost, Quantity },
      actorCtx.barangayId,
      actorCtx.actor
    );

    return res.status(201).json({ message: "Reward created", Reward_id: id });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

export const updateReward = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid reward id" });
    }

    const actorCtx = getRewardActorInfo(req);
    if (!actorCtx) {
      return res.status(400).json({ message: "Actor barangay is required" });
    }

    await rewardService.updateReward(id, req.body, actorCtx.barangayId, actorCtx.actor);
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

    // Get user's barangay to filter rewards
    const authUser: any = (req as any).user;
    const userBarangayId = authUser?.Barangay_id ? Number(authUser.Barangay_id) : undefined;

    if (userBarangayId !== undefined) {
      options.barangayId = userBarangayId;
    }

    const rows = await rewardService.listRewards(options);
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

export const getReward = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    // Get user's barangay to check access
    const authUser: any = (req as any).user;
    const userBarangayId = authUser?.Barangay_id ? Number(authUser.Barangay_id) : undefined;

    const reward = await rewardService.getRewardById(id, userBarangayId);
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

    // Get user's barangay to check access
    const authUser: any = (req as any).user;
    const userBarangayId = authUser?.Barangay_id ? Number(authUser.Barangay_id) : undefined;

    const tx = await rewardService.getTransactionByCode(code, userBarangayId);
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

    // auth: allow staff (roles 1,2,5) OR the transaction owner (household role)
    const authUser: any = (req as any).user;
    if (!authUser) return res.status(401).json({ message: "Authentication required" });

    const role = Number(authUser?.Roles);
    const userBarangayId = authUser?.Barangay_id ? Number(authUser.Barangay_id) : undefined;

    // fetch transaction for ownership check and to ensure it exists
    const tx = await rewardService.getTransactionById(id, userBarangayId);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    const isStaff = [1, 2, 5].includes(Number(role));
    const isOwner = Number(tx.Account_id) === Number(authUser?.Account_id);

    if (!isStaff && !isOwner) {
      return res.status(403).json({ message: "Insufficient privileges" });
    }

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
    let barangayFilter: number | undefined = undefined;

    if (authUser && Number(authUser?.Roles) === 4) {
      // Household user - show only their own transactions
      accountFilter = Number(authUser?.Account_id);
    } else {
      // Staff user - filter by barangay
      const userBarangayId = authUser?.Barangay_id ? Number(authUser.Barangay_id) : undefined;
      if (userBarangayId !== undefined) {
        barangayFilter = userBarangayId;
      }

      // Allow filtering by specific account if provided
      if (req.query.account_id) {
        accountFilter = Number(req.query.account_id);
      }
    }

    const opts: { status?: string; accountId?: number; barangayId?: number } = {};
    if (status !== undefined) opts.status = status;
    if (accountFilter !== undefined) opts.accountId = accountFilter;
    if (barangayFilter !== undefined) opts.barangayId = barangayFilter;

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

    // Verify user has access to this transaction
    const authUser: any = (req as any).user;
    const userBarangayId = authUser?.Barangay_id ? Number(authUser.Barangay_id) : undefined;

    const tx = await rewardService.getTransactionById(txId, userBarangayId);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

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

    // Verify user has access to the transaction this attachment belongs to
    const authUser: any = (req as any).user;
    const userBarangayId = authUser?.Barangay_id ? Number(authUser.Barangay_id) : undefined;

    const tx = await rewardService.getTransactionById(row.Reward_transaction_id, userBarangayId);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

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