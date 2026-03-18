import { pool } from "../config/db";
import config from "../config/env";

type JsonMap = Record<string, any>;

export type PushPayload = {
  title: string;
  body: string;
  data?: JsonMap;
  sound?: "default" | null;
};

type ExpoResult = {
  sent: number;
  invalidated: number;
  failed: number;
  errors: string[];
  disabled?: boolean;
};

const EXPO_BATCH_SIZE = 100;

function normalizeToken(token: string): string {
  return String(token || "").trim();
}

function isExpoPushToken(token: string): boolean {
  const t = normalizeToken(token);
  return /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(t);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getActiveTokensByAccount(accountId: number): Promise<string[]> {
  const [rows]: any = await pool.query(
    `
      SELECT Expo_push_token
      FROM push_device_tokens_tbl
      WHERE Account_id = ?
        AND Is_active = 1
    `,
    [accountId]
  );

  return Array.isArray(rows)
    ? rows
        .map((r: any) => String(r.Expo_push_token || "").trim())
        .filter((t: string) => t.length > 0)
    : [];
}

async function deactivateTokens(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  await pool.query(
    `
      UPDATE push_device_tokens_tbl
      SET Is_active = 0, Updated_at = NOW()
      WHERE Expo_push_token IN (?)
    `,
    [tokens]
  );
}

async function sendExpo(messages: any[]): Promise<ExpoResult> {
  if (!config.PUSH_NOTIFICATIONS_ENABLED) {
    return { sent: 0, invalidated: 0, failed: 0, errors: [], disabled: true };
  }

  let sent = 0;
  let invalidated = 0;
  let failed = 0;
  const errors: string[] = [];

  const chunks = chunkArray(messages, EXPO_BATCH_SIZE);

  for (const chunk of chunks) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (config.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${config.EXPO_ACCESS_TOKEN}`;
    }

    const resp = await fetch(config.EXPO_PUSH_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(chunk),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Expo push failed (${resp.status}): ${text || "no response body"}`);
    }

    const json: any = await resp.json().catch(() => ({}));
    console.log('[push] Expo API raw response:', JSON.stringify(json, null, 2)); // ✅ add this
    const data = Array.isArray(json?.data) ? json.data : [];

    const toDeactivate: string[] = [];

    data.forEach((item: any, idx: number) => {
      const msg = chunk[idx];
      const token = String(msg?.to || "");

      if (item?.status === "ok") {
        sent += 1;
        return;
      }

      failed += 1;

      const message = String(item?.message || "Expo send failed");
      const errorCode = String(item?.details?.error || "UNKNOWN");
      errors.push(`${errorCode}: ${message}`);

      if (errorCode === "DeviceNotRegistered" && token) {
        toDeactivate.push(token);
      }
    });

    if (toDeactivate.length) {
      await deactivateTokens(toDeactivate);
      invalidated += toDeactivate.length;
    }
  }

  return { sent, invalidated, failed, errors };
}

export async function registerDeviceToken(params: {
  accountId: number;
  expoPushToken: string;
  platform?: string | null;
  deviceId?: string | null;
}) {
  const accountId = Number(params.accountId);
  const expoPushToken = normalizeToken(params.expoPushToken);

  if (!accountId || Number.isNaN(accountId)) {
    throw new Error("Valid accountId is required");
  }
  if (!isExpoPushToken(expoPushToken)) {
    throw new Error("Invalid Expo push token format");
  }

  const platform = params.platform ? String(params.platform).trim() : null;
  const deviceId = params.deviceId ? String(params.deviceId).trim() : null;

  await pool.query(
    `
      INSERT INTO push_device_tokens_tbl
        (Account_id, Expo_push_token, Platform, Device_id, Is_active, Last_seen_at, Created_at, Updated_at)
      VALUES (?, ?, ?, ?, 1, NOW(), NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        Platform = VALUES(Platform),
        Device_id = VALUES(Device_id),
        Is_active = 1,
        Last_seen_at = NOW(),
        Updated_at = NOW()
    `,
    [accountId, expoPushToken, platform, deviceId]
  );

  return {
    registered: true,
    accountId,
    expoPushToken,
  };
}

export async function unregisterDeviceToken(params: {
  accountId: number;
  expoPushToken?: string | null;
}) {
  const accountId = Number(params.accountId);
  if (!accountId || Number.isNaN(accountId)) {
    throw new Error("Valid accountId is required");
  }

  const token = params.expoPushToken ? normalizeToken(params.expoPushToken) : null;

  let result: any;
  if (token) {
    [result] = await pool.query(
      `
        UPDATE push_device_tokens_tbl
        SET Is_active = 0, Updated_at = NOW()
        WHERE Account_id = ? AND Expo_push_token = ?
      `,
      [accountId, token]
    );
  } else {
    [result] = await pool.query(
      `
        UPDATE push_device_tokens_tbl
        SET Is_active = 0, Updated_at = NOW()
        WHERE Account_id = ?
      `,
      [accountId]
    );
  }

  return {
    unregistered: true,
    affectedRows: Number(result?.affectedRows || 0),
  };
}

export async function sendPushToAccount(
  accountId: number,
  payload: PushPayload
): Promise<{
  tokenCount: number;
  sent: number;
  invalidated: number;
  failed: number;
  errors: string[];
  disabled?: boolean;
}> {
  const accId = Number(accountId);
  if (!accId || Number.isNaN(accId)) throw new Error("Valid accountId is required");
  if (!payload?.title || !payload?.body) throw new Error("Push title and body are required");

  const tokens = await getActiveTokensByAccount(accId);
  if (!tokens.length) {
    return { tokenCount: 0, sent: 0, invalidated: 0, failed: 0, errors: [] };
  }

  const messages = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    sound: payload.sound === undefined ? "default" : payload.sound,
    channelId: "default",
    priority: "high",
    data: payload.data ?? {},
  }));

  const result = await sendExpo(messages);

  const base = {
    tokenCount: tokens.length,
    sent: result.sent,
    invalidated: result.invalidated,
    failed: result.failed,
    errors: result.errors,
    };

    return result.disabled === undefined
    ? base
    : { ...base, disabled: result.disabled };
}

export async function sendPushToRoleAndBarangay(
  roleId: number,
  barangayId: number,
  payload: PushPayload
): Promise<{
  tokenCount: number;
  sent: number;
  invalidated: number;
  failed: number;
  errors: string[];
  disabled?: boolean;
}> {
  const role = Number(roleId);
  const brgy = Number(barangayId);

  if (!role || Number.isNaN(role)) throw new Error("Valid roleId is required");
  if (!brgy || Number.isNaN(brgy)) throw new Error("Valid barangayId is required");
  if (!payload?.title || !payload?.body) throw new Error("Push title and body are required");

  const [rows]: any = await pool.query(
    `
      SELECT DISTINCT pdt.Expo_push_token
      FROM push_device_tokens_tbl pdt
      JOIN accounts_tbl a ON a.Account_id = pdt.Account_id
      LEFT JOIN profile_tbl p ON p.Account_id = a.Account_id
      WHERE pdt.Is_active = 1
        AND a.Roles = ?
        COALESCE(p.Barangay_id, p.Area_id) = ?
    `,
    [role, brgy]
  );

  const tokens = Array.isArray(rows)
    ? rows
        .map((r: any) => String(r.Expo_push_token || "").trim())
        .filter((t: string) => t.length > 0)
    : [];

  if (!tokens.length) {
    return { tokenCount: 0, sent: 0, invalidated: 0, failed: 0, errors: [] };
  }

  const messages = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    sound: payload.sound === undefined ? "default" : payload.sound,
    channelId: "default",
    priority: "high",
    data: payload.data ?? {},
  }));

  const result = await sendExpo(messages);

  const base = {
    tokenCount: tokens.length,
    sent: result.sent,
    invalidated: result.invalidated,
    failed: result.failed,
    errors: result.errors,
    };

    return result.disabled === undefined
    ? base
    : { ...base, disabled: result.disabled };
}