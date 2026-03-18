import { Request, Response } from "express";
import { getLeaderboard } from "../services/leaderboardService";

export async function listLeaderboard(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit) || 100;

    const actor: any = (req as any).user;
    const role = Number(actor?.Roles);
    const barangayId = Number(actor?.Barangay_id);

    // Admin and SuperAdmin see global; others see own barangay
    const scopedBarangayId =
      role === 1 || role === 5 ? undefined : (barangayId && !Number.isNaN(barangayId) ? barangayId : undefined);

    const data = await getLeaderboard(limit, scopedBarangayId);
    return res.status(200).json({ data });
  } catch (err) {
    console.error("listLeaderboard error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}