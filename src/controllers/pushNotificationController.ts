import type { Request, Response } from "express";
import * as pushService from "../services/pushNotificationService";

function getAuthUser(req: Request): any {
  return (req as any).user || null;
}

export async function registerPushToken(req: Request, res: Response) {
  try {
    const user = getAuthUser(req);
    const accountId = Number(user?.Account_id);
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const expoPushToken = String(req.body?.expoPushToken || "").trim();
    const platform = req.body?.platform ? String(req.body.platform) : null;
    const deviceId = req.body?.deviceId ? String(req.body.deviceId) : null;

    if (!expoPushToken) {
      return res.status(400).json({ message: "expoPushToken is required" });
    }

    const data = await pushService.registerDeviceToken({
      accountId,
      expoPushToken,
      platform,
      deviceId,
    });

    return res.status(200).json({ message: "Push token registered", data });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to register push token" });
  }
}

export async function unregisterPushToken(req: Request, res: Response) {
  try {
    const user = getAuthUser(req);
    const accountId = Number(user?.Account_id);
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const expoPushToken = req.body?.expoPushToken ? String(req.body.expoPushToken).trim() : null;

    const data = await pushService.unregisterDeviceToken({
      accountId,
      expoPushToken,
    });

    return res.status(200).json({ message: "Push token unregistered", data });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to unregister push token" });
  }
}

export async function sendTestPushToSelf(req: Request, res: Response) {
  try {
    const user = getAuthUser(req);
    const accountId = Number(user?.Account_id);
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const title = String(req.body?.title || "SIBOL Test Notification");
    const body = String(req.body?.body || "Push notification is working.");
    const data = req.body?.data && typeof req.body.data === "object" ? req.body.data : { source: "manual-test" };

    const result = await pushService.sendPushToAccount(accountId, {
      title,
      body,
      data,
      sound: "default",
    });

    return res.status(200).json({
      message: "Test push attempted",
      result,
    });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to send test push" });
  }
}