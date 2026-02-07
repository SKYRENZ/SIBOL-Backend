import pool from "../config/db.js";

type Row = any;

export type NotificationType = "maintenance" | "waste-input" | "collection" | "system";

export type NotificationRow = {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority?: string | null;
  status?: string | null;
  eventType?: string | null;
};

type ListOptions = {
  type?: NotificationType | "all";
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
};

const EVENT_TITLES: Record<string, string> = {
  REQUESTED: "Maintenance requested",
  ACCEPTED: "Maintenance accepted",
  REASSIGNED: "Maintenance reassigned",
  ONGOING: "Maintenance started",
  FOR_VERIFICATION: "Maintenance for verification",
  COMPLETED: "Maintenance completed",
  CANCEL_REQUESTED: "Maintenance cancel requested",
  CANCELLED: "Maintenance cancelled",
  DELETED: "Maintenance deleted",
};

function buildMaintenanceTitle(eventType?: string, requestId?: number | null) {
  const base = EVENT_TITLES[eventType ?? ""] ?? "Maintenance update";
  return requestId ? `${base}: Request #${requestId}` : base;
}

function buildMaintenanceMessage(args: {
  eventType?: string;
  actorName?: string | null;
  title?: string | null;
}) {
  const actor = args.actorName ? `${args.actorName}` : "Someone";
  const title = args.title ? ` in ${args.title}` : "";
  const type = args.eventType ?? "update";
  return `${actor} sent a ${type.toLowerCase()}${title}.`;
}

export async function listNotifications(accountId: number, opts: ListOptions = {}) {
  const type = opts.type ?? "all";
  const limit = Math.min(Math.max(Number(opts.limit ?? 20), 1), 200);
  const offset = Math.max(Number(opts.offset ?? 0), 0);
  const unreadOnly = !!opts.unreadOnly;

  if (type !== "all" && type !== "maintenance" && type !== "waste-input" && type !== "collection" && type !== "system") {
    return [] as NotificationRow[];
  }

  const maintenanceSelect = `
    SELECT
      e.Event_Id AS id,
      'maintenance' AS notif_type,
      e.Event_type AS event_type,
      e.Request_Id AS request_id,
      e.Created_At AS created_at,
      mt.Title AS ticket_title,
      ms.Status AS status_name,
      mp.Priority AS priority_name,
      CONCAT(p.FirstName, ' ', p.LastName) AS actor_name,
      acc.Username AS actor_username,
      NULL AS machine_name,
      NULL AS area_name,
      NULL AS weight,
      NULL AS first_name,
      NULL AS last_name,
      NULL AS email,
      NULL AS role_name,
      CASE WHEN nr.Notification_id IS NULL THEN 0 ELSE 1 END AS read_flag
    FROM maintenance_events_tbl e
    JOIN maintenance_tbl mt ON e.Request_Id = mt.Request_Id
    LEFT JOIN maintenance_status_tbl ms ON mt.Main_stat_id = ms.Main_stat_id
    LEFT JOIN maintenance_priority_tbl mp ON mt.Priority_Id = mp.Priority_id
    LEFT JOIN accounts_tbl acc ON e.Actor_Account_Id = acc.Account_id
    LEFT JOIN profile_tbl p ON acc.Account_id = p.Account_id
    LEFT JOIN notification_reads_tbl nr
      ON nr.Notification_id = e.Event_Id
      AND nr.Notification_type = 'maintenance'
      AND nr.Account_id = ?
  `;

  const wasteInputSelect = `
    SELECT
      wi.Input_id AS id,
      'waste-input' AS notif_type,
      'WASTE_INPUT' AS event_type,
      NULL AS request_id,
      COALESCE(wi.Input_datetime, wi.Created_at) AS created_at,
      NULL AS ticket_title,
      NULL AS status_name,
      NULL AS priority_name,
      CONCAT(p.FirstName, ' ', p.LastName) AS actor_name,
      acc.Username AS actor_username,
      m.Name AS machine_name,
      NULL AS area_name,
      wi.Weight AS weight,
      NULL AS first_name,
      NULL AS last_name,
      NULL AS email,
      NULL AS role_name,
      CASE WHEN nr.Notification_id IS NULL THEN 0 ELSE 1 END AS read_flag
    FROM machine_waste_input_tbl wi
    JOIN machine_tbl m ON wi.Machine_id = m.Machine_id
    LEFT JOIN accounts_tbl acc ON wi.Account_id = acc.Account_id
    LEFT JOIN profile_tbl p ON acc.Account_id = p.Account_id
    LEFT JOIN notification_reads_tbl nr
      ON nr.Notification_id = wi.Input_id
      AND nr.Notification_type = 'waste-input'
      AND nr.Account_id = ?
  `;

  const collectionSelect = `
    SELECT
      wc.collection_id AS id,
      'collection' AS notif_type,
      'COLLECTION' AS event_type,
      NULL AS request_id,
      wc.collected_at AS created_at,
      NULL AS ticket_title,
      NULL AS status_name,
      NULL AS priority_name,
      CONCAT(p.FirstName, ' ', p.LastName) AS actor_name,
      acc.Username AS actor_username,
      NULL AS machine_name,
      a.Area_Name AS area_name,
      wc.weight AS weight,
      NULL AS first_name,
      NULL AS last_name,
      NULL AS email,
      NULL AS role_name,
      CASE WHEN nr.Notification_id IS NULL THEN 0 ELSE 1 END AS read_flag
    FROM waste_collection_tbl wc
    LEFT JOIN area_tbl a ON wc.area_id = a.Area_id
    LEFT JOIN accounts_tbl acc ON wc.operator_id = acc.Account_id
    LEFT JOIN profile_tbl p ON acc.Account_id = p.Account_id
    LEFT JOIN notification_reads_tbl nr
      ON nr.Notification_id = wc.collection_id
      AND nr.Notification_type = 'collection'
      AND nr.Account_id = ?
  `;

  const systemSelect = `
    SELECT
      sn.Notification_id AS id,
      'system' AS notif_type,
      sn.Event_type AS event_type,
      NULL AS request_id,
      sn.Created_at AS created_at,
      NULL AS ticket_title,
      NULL AS status_name,
      NULL AS priority_name,
      NULL AS actor_name,
      sn.Username AS actor_username,
      NULL AS machine_name,
      NULL AS area_name,
      NULL AS weight,
      sn.FirstName AS first_name,
      sn.LastName AS last_name,
      sn.Email AS email,
      r.Roles AS role_name,
      CASE WHEN nr.Notification_id IS NULL THEN 0 ELSE 1 END AS read_flag
    FROM system_notifications_tbl sn
    LEFT JOIN user_roles_tbl r ON sn.Role_id = r.Roles_id
    LEFT JOIN notification_reads_tbl nr
      ON nr.Notification_id = sn.Notification_id
      AND nr.Notification_type = 'system'
      AND nr.Account_id = ?
  `;

  let sql = "";
  const params: any[] = [];

  if (type === "maintenance") {
    sql = maintenanceSelect;
    params.push(accountId);
  } else if (type === "waste-input") {
    sql = wasteInputSelect;
    params.push(accountId);
  } else if (type === "collection") {
    sql = collectionSelect;
    params.push(accountId);
  } else if (type === "system") {
    sql = systemSelect;
    params.push(accountId);
  } else {
    sql = `
      SELECT * FROM (
        ${maintenanceSelect}
        UNION ALL
        ${wasteInputSelect}
        UNION ALL
        ${collectionSelect}
        UNION ALL
        ${systemSelect}
      ) AS notif
    `;
    params.push(accountId, accountId, accountId, accountId);
  }

  if (unreadOnly) {
    sql += " WHERE read_flag = 0";
  }

  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const [rows] = await pool.query<Row[]>(sql, params);

  return (rows || []).map((row) => {
    const actorName = row.actor_name || row.actor_username || null;
    if (row.notif_type === "waste-input") {
      const machineLabel = row.machine_name ? `${row.machine_name}` : "Machine";
      return {
        id: Number(row.id),
        type: "waste-input" as const,
        title: `Waste input logged: ${machineLabel}`,
        message: `${actorName || "Someone"} logged ${Number(row.weight ?? 0).toFixed(2)} kg in ${machineLabel}.`,
        timestamp: row.created_at,
        read: Boolean(row.read_flag),
        priority: null,
        status: null,
        eventType: row.event_type ?? null,
      } as NotificationRow;
    }

    if (row.notif_type === "collection") {
      const areaLabel = row.area_name ? `${row.area_name}` : "Area";
      return {
        id: Number(row.id),
        type: "collection" as const,
        title: `Collection logged: ${areaLabel}`,
        message: `${actorName || "Someone"} collected ${Number(row.weight ?? 0).toFixed(2)} kg in ${areaLabel}.`,
        timestamp: row.created_at,
        read: Boolean(row.read_flag),
        priority: null,
        status: null,
        eventType: row.event_type ?? null,
      } as NotificationRow;
    }

    if (row.notif_type === "system") {
      const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
      const nameLabel = fullName || row.actor_username || "User";
      const emailLabel = row.email ? ` (${row.email})` : "";
      const roleLabel = row.role_name ? ` as ${row.role_name}` : "";

      let title = "System update";
      let message = `${nameLabel}${emailLabel} has a system update.`;
      const eventType = String(row.event_type ?? "").toUpperCase();

      if (eventType === "REGISTERED") {
        title = `New registration: ${nameLabel}`;
        message = `${nameLabel}${emailLabel} registered${roleLabel}.`;
      } else if (eventType === "APPROVED") {
        title = `Registration approved: ${nameLabel}`;
        message = `${nameLabel}${emailLabel} was approved${roleLabel}.`;
      } else if (eventType === "REJECTED") {
        title = `Registration rejected: ${nameLabel}`;
        message = `${nameLabel}${emailLabel} was rejected${roleLabel}.`;
      }

      return {
        id: Number(row.id),
        type: "system" as const,
        title,
        message,
        timestamp: row.created_at,
        read: Boolean(row.read_flag),
        priority: null,
        status: null,
        eventType: row.event_type ?? null,
      } as NotificationRow;
    }

    return {
      id: Number(row.id),
      type: "maintenance" as const,
      title: buildMaintenanceTitle(row.event_type, row.request_id),
      message: buildMaintenanceMessage({
        eventType: row.event_type,
        actorName,
        title: row.ticket_title,
      }),
      timestamp: row.created_at,
      read: Boolean(row.read_flag),
      priority: row.priority_name ?? null,
      status: row.status_name ?? null,
      eventType: row.event_type ?? null,
    } as NotificationRow;
  });
}

export async function markNotificationRead(accountId: number, type: NotificationType, id: number) {
  const sql = `
    INSERT INTO notification_reads_tbl (Account_id, Notification_type, Notification_id, Read_at)
    VALUES (?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE Read_at = VALUES(Read_at)
  `;
  await pool.query(sql, [accountId, type, id]);
  return { success: true };
}

export async function markAllNotificationsRead(accountId: number, type: NotificationType) {
  if (type === "maintenance") {
    const sql = `
      INSERT INTO notification_reads_tbl (Account_id, Notification_type, Notification_id, Read_at)
      SELECT ?, 'maintenance', e.Event_Id, NOW()
      FROM maintenance_events_tbl e
      LEFT JOIN notification_reads_tbl nr
        ON nr.Notification_id = e.Event_Id
        AND nr.Notification_type = 'maintenance'
        AND nr.Account_id = ?
      WHERE nr.Notification_id IS NULL
    `;
    await pool.query(sql, [accountId, accountId]);
    return { success: true };
  }

  if (type === "waste-input") {
    const sql = `
      INSERT INTO notification_reads_tbl (Account_id, Notification_type, Notification_id, Read_at)
      SELECT ?, 'waste-input', wi.Input_id, NOW()
      FROM machine_waste_input_tbl wi
      LEFT JOIN notification_reads_tbl nr
        ON nr.Notification_id = wi.Input_id
        AND nr.Notification_type = 'waste-input'
        AND nr.Account_id = ?
      WHERE nr.Notification_id IS NULL
    `;
    await pool.query(sql, [accountId, accountId]);
    return { success: true };
  }

  if (type === "system") {
    const sql = `
      INSERT INTO notification_reads_tbl (Account_id, Notification_type, Notification_id, Read_at)
      SELECT ?, 'system', sn.Notification_id, NOW()
      FROM system_notifications_tbl sn
      LEFT JOIN notification_reads_tbl nr
        ON nr.Notification_id = sn.Notification_id
        AND nr.Notification_type = 'system'
        AND nr.Account_id = ?
      WHERE nr.Notification_id IS NULL
    `;
    await pool.query(sql, [accountId, accountId]);
    return { success: true };
  }

  const sql = `
    INSERT INTO notification_reads_tbl (Account_id, Notification_type, Notification_id, Read_at)
    SELECT ?, 'collection', wc.collection_id, NOW()
    FROM waste_collection_tbl wc
    LEFT JOIN notification_reads_tbl nr
      ON nr.Notification_id = wc.collection_id
      AND nr.Notification_type = 'collection'
      AND nr.Account_id = ?
    WHERE nr.Notification_id IS NULL
  `;
  await pool.query(sql, [accountId, accountId]);
  return { success: true };
}
