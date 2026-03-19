import type { Request, Response } from "express";
import * as notificationService from "../services/notificationService";

export async function listNotifications(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const accountId = Number(user?.Account_id);
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const type = String(req.query.type ?? "all") as "all" | "maintenance" | "waste-input" | "collection" | "system";
    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.offset ?? 0);
    const unreadOnly = String(req.query.unreadOnly ?? "false") === "true";

    console.log(`[Notification] Fetching ${type} for account ${accountId}, barangay=${user?.Barangay_id}, role=${user?.Roles}`);

    const rows = await notificationService.listNotifications(accountId, {
      type,
      limit,
      offset,
      unreadOnly,
    });

    console.log(`[Notification] Found ${rows.length} notifications for account ${accountId}, types: ${rows.map(r => r.type).join(', ')}`);
    if (rows.length === 0) {
      console.log(`[Notification] DEBUG: Expected system notifications with Role_id or Username for account ${accountId}`);
    }

    return res.json({ data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch notifications";
    console.error(`[Notification] Error for account ${(req as any).user?.Account_id}:`, message);
    if (message.toLowerCase().includes("notification_reads_tbl")) {
      return res.json({ data: [] });
    }
    return res.status(500).json({ message });
  }
}

export async function markRead(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const accountId = Number(user?.Account_id);
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const type = String(req.body.type ?? "maintenance") as "maintenance" | "waste-input" | "collection" | "system";
    const id = Number(req.body.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ message: "Notification id is required" });
    }

    const result = await notificationService.markNotificationRead(accountId, type, id);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark notification read";
    return res.status(500).json({ message });
  }
}

export async function markAllRead(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const accountId = Number(user?.Account_id);
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const type = String(req.body.type ?? "maintenance") as "maintenance" | "waste-input" | "collection" | "system";
    const result = await notificationService.markAllNotificationsRead(accountId, type);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark notifications read";
    return res.status(500).json({ message });
  }
}
