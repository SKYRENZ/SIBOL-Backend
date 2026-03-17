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
  REQUESTED: "Maintenance Requested",
  ACCEPTED: "Maintenance Accepted",
  REASSIGNED: "Maintenance Assigned",
  ONGOING: "Maintenance Started",
  FOR_VERIFICATION: "Maintenance For Verification",
  COMPLETED: "Maintenance Completed",
  CANCEL_REQUESTED: "Maintenance Cancel Requested",
  CANCELLED: "Maintenance Cancelled",
  DELETED: "Maintenance Deleted",
  MESSAGE: "Maintenance Message",
};

function buildMaintenanceTitle(eventType?: string, requestId?: number | null) {
  const evt = String(eventType ?? "").toUpperCase();
  const base = EVENT_TITLES[evt] ?? "Maintenance Update";
  return requestId ? `${base}: Request #${requestId}` : base;
}

function buildMaintenanceMessage(args: {
  eventType?: string;
  actorName?: string | null;
  title?: string | null;
}) {
  const evt = String(args.eventType ?? "").toUpperCase();
  const actor = args.actorName?.trim() || "Someone";
  const ticketTitle = args.title?.trim() || "this ticket";

  switch (evt) {
    case "ACCEPTED":
      return `${actor} has accepted your request of ${ticketTitle}.`;
    case "CANCELLED":
      return `${actor} has cancelled your request of ${ticketTitle}.`;
    case "REASSIGNED":
      return `${actor} has assigned you to ${ticketTitle}.`;
    case "COMPLETED":
      return `${actor} has marked your ticket as completed.`;
    case "MESSAGE":
      return `${actor} has a message to ${ticketTitle}.`;
    default:
      return `${actor} has updated your maintenance ticket of ${ticketTitle}.`;
  }
}

export async function listNotifications(accountId: number, opts: ListOptions = {}) {
  const type = opts.type ?? "all";
  const limit = Math.min(Math.max(Number(opts.limit ?? 20), 1), 200);
  const offset = Math.max(Number(opts.offset ?? 0), 0);
  const unreadOnly = !!opts.unreadOnly;

  if (type !== "all" && type !== "maintenance" && type !== "waste-input" && type !== "collection" && type !== "system") {
    return [] as NotificationRow[];
  }

  const [accRows]: any = await pool.query(
    `
      SELECT
        a.Roles,
        a.Username,
        COALESCE(p.Barangay_id, p.Area_id) AS scope_barangay_id
      FROM accounts_tbl a
      LEFT JOIN profile_tbl p ON p.Account_id = a.Account_id
      WHERE a.Account_id = ?
      LIMIT 1
    `,
    [accountId]
  );

  const accountRoleId: number | null = accRows?.[0]?.Roles ?? null;
  const accountUsername: string | null = accRows?.[0]?.Username ?? null;
  const viewerBarangayId: number | null = accRows?.[0]?.scope_barangay_id ?? null;

  const isOperator = Number(accountRoleId) === 3;
  const effectiveType: NotificationType | "all" = isOperator ? "maintenance" : type;

  const operatorMaintenanceWhere = isOperator
    ? `
      WHERE
        e.Event_type IN ('ACCEPTED', 'REASSIGNED', 'CANCELLED', 'COMPLETED', 'MESSAGE')
        AND (
          mt.Created_by = ${Number(accountId)}
          OR mt.Assigned_to = ${Number(accountId)}
          OR (
            e.Event_type = 'REASSIGNED'
            AND (
              (JSON_VALID(e.Notes) AND CAST(JSON_UNQUOTE(JSON_EXTRACT(e.Notes, '$.to_account_id')) AS UNSIGNED) = ${Number(accountId)})
              OR (NOT JSON_VALID(e.Notes) AND e.Notes REGEXP 'operator[[:space:]]+${Number(accountId)}([^0-9]|$)')
            )
          )
        )
    `
    : (viewerBarangayId != null ? `WHERE creator_profile.Barangay_id = ?` : "");

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
      NULL AS container_names,
      NULL AS weight,
      NULL AS first_name,
      NULL AS last_name,
      NULL AS email,
      NULL AS role_name,
      NULL AS Reward_item,
      NULL AS Reward_quantity,
      NULL AS Reward_points,
      CASE WHEN nr.Notification_id IS NULL THEN 0 ELSE 1 END AS read_flag
    FROM maintenance_events_tbl e
    JOIN maintenance_tbl mt ON e.Request_Id = mt.Request_Id
    LEFT JOIN profile_tbl creator_profile ON creator_profile.Account_id = mt.Created_by
    LEFT JOIN maintenance_status_tbl ms ON mt.Main_stat_id = ms.Main_stat_id
    LEFT JOIN maintenance_priority_tbl mp ON mt.Priority_Id = mp.Priority_id
    LEFT JOIN accounts_tbl acc ON e.Actor_Account_Id = acc.Account_id
    LEFT JOIN profile_tbl p ON acc.Account_id = p.Account_id
    LEFT JOIN notification_reads_tbl nr
      ON nr.Notification_id = e.Event_Id
      AND nr.Notification_type = 'maintenance'
      AND nr.Account_id = ?
    ${operatorMaintenanceWhere}
  `;

  const wasteInputWhere = viewerBarangayId != null ? `WHERE actor_profile.Barangay_id = ?` : "";
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
      NULL AS container_names,
      wi.Weight AS weight,
      NULL AS first_name,
      NULL AS last_name,
      NULL AS email,
      NULL AS role_name,
      NULL AS Reward_item,
      NULL AS Reward_quantity,
      NULL AS Reward_points,
      CASE WHEN nr.Notification_id IS NULL THEN 0 ELSE 1 END AS read_flag
    FROM machine_waste_input_tbl wi
    JOIN machine_tbl m ON wi.Machine_id = m.Machine_id
    LEFT JOIN accounts_tbl acc ON wi.Account_id = acc.Account_id
    LEFT JOIN profile_tbl p ON acc.Account_id = p.Account_id
    LEFT JOIN profile_tbl actor_profile ON actor_profile.Account_id = wi.Account_id
    LEFT JOIN notification_reads_tbl nr
      ON nr.Notification_id = wi.Input_id
      AND nr.Notification_type = 'waste-input'
      AND nr.Account_id = ?
    ${wasteInputWhere}
  `;

  const collectionWhere = viewerBarangayId != null ? `WHERE operator_profile.Barangay_id = ?` : "";
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
      a.Area_name AS area_name,
      c.container_names AS container_names,
      wc.weight AS weight,
      NULL AS first_name,
      NULL AS last_name,
      NULL AS email,
      NULL AS role_name,
      NULL AS Reward_item,
      NULL AS Reward_quantity,
      NULL AS Reward_points,
      CASE WHEN nr.Notification_id IS NULL THEN 0 ELSE 1 END AS read_flag
    FROM waste_collection_tbl wc
    LEFT JOIN area_tbl a ON wc.area_id = a.Area_id
    LEFT JOIN (
      SELECT area_id, GROUP_CONCAT(container_name ORDER BY container_name SEPARATOR ', ') AS container_names
      FROM waste_containers_tbl
      WHERE device_id IS NOT NULL
        AND current_weight_kg > 0
      GROUP BY area_id
    ) c ON wc.area_id = c.area_id
    LEFT JOIN accounts_tbl acc ON wc.operator_id = acc.Account_id
    LEFT JOIN profile_tbl p ON acc.Account_id = p.Account_id
    LEFT JOIN profile_tbl operator_profile ON operator_profile.Account_id = wc.operator_id
    LEFT JOIN notification_reads_tbl nr
      ON nr.Notification_id = wc.collection_id
      AND nr.Notification_type = 'collection'
      AND nr.Account_id = ?
    ${collectionWhere}
  `;

  const roleScope = accountRoleId !== null
    ? `(sn.Role_id IS NULL OR sn.Role_id = ${Number(accountRoleId)})`
    : `sn.Role_id IS NULL`;

  const systemBarangayFilter = viewerBarangayId != null
    ? `AND (sn.Username IS NOT NULL OR sn.Barangay_id = ?)`
    : "";

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
      sn.Area_name AS area_name,
      sn.Container_name AS container_names,
      NULL AS weight,
      sn.FirstName AS first_name,
      sn.LastName AS last_name,
      sn.Email AS email,
      sn.Reward_item AS Reward_item,
      sn.Reward_quantity AS Reward_quantity,
      sn.Reward_points AS Reward_points,
      r.Roles AS role_name,
      CASE WHEN nr.Notification_id IS NULL THEN 0 ELSE 1 END AS read_flag
    FROM system_notifications_tbl sn
    LEFT JOIN user_roles_tbl r ON sn.Role_id = r.Roles_id
    LEFT JOIN notification_reads_tbl nr
      ON nr.Notification_id = sn.Notification_id
      AND nr.Notification_type = 'system'
      AND nr.Account_id = ?
    WHERE (
      (sn.Username IS NOT NULL AND sn.Username = ?)
      OR (
        sn.Username IS NULL
        AND (${roleScope})
      )
    )
    ${systemBarangayFilter}
  `;

  let sql = "";
  const params: any[] = [];

  if (effectiveType === "maintenance") {
    sql = maintenanceSelect;
    params.push(accountId);
    if (!isOperator && viewerBarangayId != null) params.push(viewerBarangayId);
  } else if (effectiveType === "waste-input") {
    sql = wasteInputSelect;
    params.push(accountId);
    if (viewerBarangayId != null) params.push(viewerBarangayId);
  } else if (effectiveType === "collection") {
    sql = collectionSelect;
    params.push(accountId);
    if (viewerBarangayId != null) params.push(viewerBarangayId);
  } else if (effectiveType === "system") {
    sql = systemSelect;
    params.push(accountId, accountUsername);
    if (viewerBarangayId != null) params.push(viewerBarangayId);
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
    params.push(accountId);
    if (!isOperator && viewerBarangayId != null) params.push(viewerBarangayId);

    params.push(accountId);
    if (viewerBarangayId != null) params.push(viewerBarangayId);

    params.push(accountId);
    if (viewerBarangayId != null) params.push(viewerBarangayId);

    params.push(accountId, accountUsername);
    if (viewerBarangayId != null) params.push(viewerBarangayId);
  }

  if (unreadOnly) {
    sql = `
      SELECT * FROM (
        ${sql}
      ) AS notif_unread
      WHERE notif_unread.read_flag = 0
    `;
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
      const containerLabel = row.container_names ? ` • ${row.container_names}` : "";
      return {
        id: Number(row.id),
        type: "collection" as const,
        title: `Collection logged: ${areaLabel}${containerLabel}`,
        message: `${actorName || "Someone"} collected ${Number(row.weight ?? 0).toFixed(2)} kg in ${areaLabel}${containerLabel}.`,
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
      const containerLabel = row.container_names ? `${row.container_names}` : "Container";
      const areaLabel = row.area_name ? `${row.area_name}` : "Area";

      let title = "System update";
      let message = `${nameLabel}${emailLabel} has a system update.`;
      const eventType = String(row.event_type ?? "").toUpperCase();

      if (eventType === "REGISTERED") {
        title = `New registration: ${nameLabel}`;
        message = `${nameLabel}${emailLabel} registered${roleLabel}.`;
      } else if (eventType === "REGISTERED_VERIFIED") {
        title = `New registration (verified): ${nameLabel}`;
        message = `${nameLabel}${emailLabel} registered and verified their email${roleLabel}.`;
      } else if (eventType === "APPROVED") {
        title = `Registration approved: ${nameLabel}`;
        message = `${nameLabel}${emailLabel} was approved${roleLabel}.`;
      } else if (eventType === "REJECTED") {
        title = `Registration rejected: ${nameLabel}`;
        message = `${nameLabel}${emailLabel} was rejected${roleLabel}.`;
      } else if (eventType === "CONTAINER_ADDED") {
        title = `Container added: ${containerLabel}`;
        message = `A new container (${containerLabel}) was added in ${areaLabel}.`;
      } else if (eventType === "CONTAINER_FULL") {
        title = `Container full: ${containerLabel}`;
        message = `${containerLabel} in ${areaLabel} reached 20 kg and is now full.`;
      } else if (eventType.startsWith("LEADERBOARD_")) {
        const uname = nameLabel || row.actor_username || "User";
        const rankInfo = String(row.container_names ?? "").trim();
        if (eventType === "LEADERBOARD_ENTERED") {
          title = `Leaderboard: ${uname} entered (#${rankInfo})`;
          message = `${uname} has entered the leaderboard at #${rankInfo}.`;
        } else if (eventType === "LEADERBOARD_EXITED") {
          title = `Leaderboard: ${uname} left (#${rankInfo})`;
          message = `${uname} has dropped out of the leaderboard (was #${rankInfo}).`;
        } else {
          const parts = rankInfo.split("->").map((s: string) => s.trim());
          if (parts.length === 2) {
            title = `Leaderboard: ${uname} moved up to #${parts[1]}`;
            message = `${uname} moved from #${parts[0]} to #${parts[1]}.`;
          } else {
            title = `Leaderboard update: ${uname}`;
            message = `${uname} has a leaderboard update.`;
          }
        }
      } else if (eventType.startsWith("REWARD_")) {
        const itemLabel = row.Reward_item || row.first_name || row.actor_username || "Reward";
        const qtyLabel = (row.Reward_quantity != null && row.Reward_quantity !== "") ? `${row.Reward_quantity}` : (row.container_names ? `${row.container_names}` : null);
        const costLabel = (row.Reward_points != null && row.Reward_points !== "") ? `${row.Reward_points}` : (row.area_name ? `${row.area_name}` : null);

        if (eventType === "REWARD_NEW") {
          title = `New Reward: ${itemLabel}`;
          const priceLine = costLabel ? `Price: ${costLabel} points` : "";
          const stockLine = qtyLabel ? `Stock: ${qtyLabel}` : "";
          message = [`${itemLabel} reward has been added.`, priceLine, stockLine].filter(Boolean).join("\n");
        } else if (eventType === "REWARD_RESTOCKED") {
          title = `Reward Restocked: ${itemLabel}`;
          message = `${itemLabel} has been restocked.`;
        } else if (eventType === "REWARD_UPDATED") {
          title = `Reward Updated: ${itemLabel}`;
          const priceLine = costLabel ? `Price: ${costLabel} points` : "";
          const stockLine = qtyLabel ? `Stock: ${qtyLabel}` : "";
          message = [`${itemLabel} reward were updated`, priceLine, stockLine].filter(Boolean).join("\n");
        } else if (eventType === "REWARD_UNCLAIMED") {
          title = `Reward Redeemed: ${itemLabel}`;
          message = `${itemLabel} was redeemed. Please claim it at your Barangay.`;
        } else if (eventType === "REWARD_CLAIMED") {
          title = `Reward Claimed: ${itemLabel}`;
          message = `Congratulations! ${itemLabel} has been claimed successfully.`;
        } else if (eventType === "REWARD_ELIGIBLE") {
          title = `You can claim: ${itemLabel}`;
          message = `You have enough points to claim ${itemLabel}${costLabel ? ` for ${costLabel} points` : ""}.`;
        } else {
          title = `Reward notice: ${itemLabel}`;
          message = `${itemLabel} has an update.`;
        }
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
  const [accRows]: any = await pool.query(
    `
      SELECT
        a.Roles,
        a.Username,
        COALESCE(p.Barangay_id, p.Area_id) AS scope_barangay_id
      FROM accounts_tbl a
      LEFT JOIN profile_tbl p ON p.Account_id = a.Account_id
      WHERE a.Account_id = ?
      LIMIT 1
    `,
    [accountId]
  );

  const accountRoleId: number | null = accRows?.[0]?.Roles ?? null;
  const accountUsername: string | null = accRows?.[0]?.Username ?? null;
  const viewerBarangayId: number | null = accRows?.[0]?.scope_barangay_id ?? null;

  if (type === "maintenance") {
    const isOperator = Number(accountRoleId) === 3;

    if (isOperator) {
      const sql = `
        INSERT INTO notification_reads_tbl (Account_id, Notification_type, Notification_id, Read_at)
        SELECT ?, 'maintenance', e.Event_Id, NOW()
        FROM maintenance_events_tbl e
        JOIN maintenance_tbl mt ON e.Request_Id = mt.Request_Id
        LEFT JOIN notification_reads_tbl nr
          ON nr.Notification_id = e.Event_Id
          AND nr.Notification_type = 'maintenance'
          AND nr.Account_id = ?
        WHERE nr.Notification_id IS NULL
          AND e.Event_type IN ('ACCEPTED', 'REASSIGNED', 'CANCELLED', 'COMPLETED', 'MESSAGE')
          AND (
            mt.Created_by = ${Number(accountId)}
            OR mt.Assigned_to = ${Number(accountId)}
            OR (
              e.Event_type = 'REASSIGNED'
              AND (
                (JSON_VALID(e.Notes) AND CAST(JSON_UNQUOTE(JSON_EXTRACT(e.Notes, '$.to_account_id')) AS UNSIGNED) = ${Number(accountId)})
                OR (NOT JSON_VALID(e.Notes) AND e.Notes REGEXP 'operator[[:space:]]+${Number(accountId)}([^0-9]|$)')
              )
            )
          )
      `;
      await pool.query(sql, [accountId, accountId]);
      return { success: true };
    }

    const sql = `
      INSERT INTO notification_reads_tbl (Account_id, Notification_type, Notification_id, Read_at)
      SELECT ?, 'maintenance', e.Event_Id, NOW()
      FROM maintenance_events_tbl e
      JOIN maintenance_tbl mt ON mt.Request_Id = e.Request_Id
      LEFT JOIN profile_tbl creator_profile ON creator_profile.Account_id = mt.Created_by
      LEFT JOIN notification_reads_tbl nr
        ON nr.Notification_id = e.Event_Id
        AND nr.Notification_type = 'maintenance'
        AND nr.Account_id = ?
      WHERE nr.Notification_id IS NULL
      ${viewerBarangayId != null ? "AND creator_profile.Barangay_id = ?" : ""}
    `;
    const params = viewerBarangayId != null ? [accountId, accountId, viewerBarangayId] : [accountId, accountId];
    await pool.query(sql, params);
    return { success: true };
  }

  if (type === "waste-input") {
    const sql = `
      INSERT INTO notification_reads_tbl (Account_id, Notification_type, Notification_id, Read_at)
      SELECT ?, 'waste-input', wi.Input_id, NOW()
      FROM machine_waste_input_tbl wi
      LEFT JOIN profile_tbl actor_profile ON actor_profile.Account_id = wi.Account_id
      LEFT JOIN notification_reads_tbl nr
        ON nr.Notification_id = wi.Input_id
        AND nr.Notification_type = 'waste-input'
        AND nr.Account_id = ?
      WHERE nr.Notification_id IS NULL
      ${viewerBarangayId != null ? "AND actor_profile.Barangay_id = ?" : ""}
    `;
    const params = viewerBarangayId != null ? [accountId, accountId, viewerBarangayId] : [accountId, accountId];
    await pool.query(sql, params);
    return { success: true };
  }

  if (type === "system") {
    const roleCondition = accountRoleId !== null
      ? `(sn.Username = ? OR (sn.Username IS NULL AND (sn.Role_id IS NULL OR sn.Role_id = ${Number(accountRoleId)})))`
      : `(sn.Username = ? OR (sn.Username IS NULL AND sn.Role_id IS NULL))`;

    const sql = `
      INSERT INTO notification_reads_tbl (Account_id, Notification_type, Notification_id, Read_at)
      SELECT ?, 'system', sn.Notification_id, NOW()
      FROM system_notifications_tbl sn
      LEFT JOIN notification_reads_tbl nr
        ON nr.Notification_id = sn.Notification_id
        AND nr.Notification_type = 'system'
        AND nr.Account_id = ?
      WHERE nr.Notification_id IS NULL
        AND ${roleCondition}
        ${viewerBarangayId != null ? "AND (sn.Username IS NOT NULL OR sn.Barangay_id = ?)" : ""}
    `;
    const params = viewerBarangayId != null
      ? [accountId, accountId, accountUsername, viewerBarangayId]
      : [accountId, accountId, accountUsername];
    await pool.query(sql, params);
    return { success: true };
  }

  const sql = `
    INSERT INTO notification_reads_tbl (Account_id, Notification_type, Notification_id, Read_at)
    SELECT ?, 'collection', wc.collection_id, NOW()
    FROM waste_collection_tbl wc
    LEFT JOIN profile_tbl operator_profile ON operator_profile.Account_id = wc.operator_id
    LEFT JOIN notification_reads_tbl nr
      ON nr.Notification_id = wc.collection_id
      AND nr.Notification_type = 'collection'
      AND nr.Account_id = ?
    WHERE nr.Notification_id IS NULL
    ${viewerBarangayId != null ? "AND operator_profile.Barangay_id = ?" : ""}
  `;
  const params = viewerBarangayId != null ? [accountId, accountId, viewerBarangayId] : [accountId, accountId];
  await pool.query(sql, params);
  return { success: true };
}
