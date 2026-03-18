import pool from "../config/db.js";
import { sendPushToAccount, sendPushToRoleAndBarangay } from "./pushNotificationService.js";

type Row = any;

const ROLE_ADMIN = 1;
const ROLE_STAFF = 2;
const ROLE_OPERATOR = 3;

type MaintenancePushContext = {
  requestId: number;
  title: string | null;
  createdBy: number | null;
  assignedTo: number | null;
  creatorBarangayId: number | null;
  creatorName: string | null;
  assignedName: string | null;
};

async function getStatusIdByName(name: string) {
  const [rows] = await pool.query<Row[]>("SELECT Main_stat_id FROM maintenance_status_tbl WHERE Status = ?", [name]);
  return rows.length ? rows[0].Main_stat_id : null;
}

async function getPriorityIdByName(name: string) {
  const [rows] = await pool.query<Row[]>("SELECT Priority_id FROM maintenance_priority_tbl WHERE Priority = ?", [name]);
  return rows.length ? rows[0].Priority_id : null;
}

function buildPushTitle(eventType: string, requestId: number) {
  const map: Record<string, string> = {
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

  const base = map[String(eventType || "").toUpperCase()] ?? "Maintenance Update";
  return `${base}: Request #${requestId}`;
}

function extractToAccountIdFromNotes(notes: string | null): { toAccountId: number | null; message: string | null } {
  if (!notes) return { toAccountId: null, message: null };

  try {
    const parsed = JSON.parse(notes);
    const to = parsed?.to_account_id;
    const msg = typeof parsed?.message === "string" ? parsed.message : notes;
    return { toAccountId: typeof to === "number" ? to : Number.isFinite(Number(to)) ? Number(to) : null, message: msg };
  } catch {
    // ignore
  }

  const m = notes.match(/operator\s+(\d+)/i);
  return { toAccountId: m ? Number(m[1]) : null, message: notes };
}

function buildPushBody(eventType: string, ctx: MaintenancePushContext, notes: string | null): string {
  const evt = String(eventType || "").toUpperCase();
  const ticketTitle = (ctx.title || "this ticket").trim();
  const assignee = (ctx.assignedName || "the assigned operator").trim();
  const noteMsg = extractToAccountIdFromNotes(notes).message?.trim();

  if (evt === "REQUESTED") return `A new maintenance ticket was submitted: ${ticketTitle}.`;
  if (evt === "ACCEPTED") return `Your maintenance ticket was accepted and assigned to ${assignee}.`;
  if (evt === "REASSIGNED") return noteMsg ? noteMsg : `Maintenance assignment changed for ${ticketTitle}.`;
  if (evt === "ONGOING") return `Work has started on ${ticketTitle}.`;
  if (evt === "FOR_VERIFICATION") return `Ticket ${ticketTitle} is now waiting for verification.`;
  if (evt === "COMPLETED") return `Your maintenance ticket ${ticketTitle} has been completed.`;
  if (evt === "CANCEL_REQUESTED") return noteMsg ? `Cancel requested: ${noteMsg}` : `A cancellation request was submitted for ${ticketTitle}.`;
  if (evt === "CANCELLED") return noteMsg ? `Ticket cancelled: ${noteMsg}` : `Your maintenance ticket ${ticketTitle} was cancelled.`;
  if (evt === "DELETED") return noteMsg ? `Ticket deleted: ${noteMsg}` : `Maintenance ticket ${ticketTitle} was deleted.`;
  if (evt === "MESSAGE") return noteMsg ? noteMsg : `There is a new message on ${ticketTitle}.`;

  return `Maintenance update for ${ticketTitle}.`;
}

async function getMaintenancePushContext(requestId: number): Promise<MaintenancePushContext | null> {
  const [rows] = await pool.query<Row[]>(
    `
      SELECT
        m.Request_Id AS requestId,
        m.Title,
        m.Created_by,
        m.Assigned_to,
        creator_profile.Barangay_id AS creatorBarangayId,
        CONCAT(creator_profile.FirstName, ' ', creator_profile.LastName) AS creatorName,
        CONCAT(assigned_profile.FirstName, ' ', assigned_profile.LastName) AS assignedName
      FROM maintenance_tbl m
      LEFT JOIN profile_tbl creator_profile ON m.Created_by = creator_profile.Account_id
      LEFT JOIN profile_tbl assigned_profile ON m.Assigned_to = assigned_profile.Account_id
      WHERE m.Request_Id = ?
      LIMIT 1
    `,
    [requestId]
  );

  if (!rows.length) return null;

  const r = rows[0];
  return {
    requestId: Number(r.requestId),
    title: r.Title ?? null,
    createdBy: r.Created_by != null ? Number(r.Created_by) : null,
    assignedTo: r.Assigned_to != null ? Number(r.Assigned_to) : null,
    creatorBarangayId: r.creatorBarangayId != null ? Number(r.creatorBarangayId) : null,
    creatorName: r.creatorName ?? null,
    assignedName: r.assignedName ?? null,
  };
}

async function sendPushToAccountsUnique(
  accountIds: Array<number | null | undefined>,
  payload: { title: string; body: string; data: Record<string, any> },
  excludeAccountId?: number | null
): Promise<void> {
  const seen = new Set<number>();
  for (const raw of accountIds) {
    const id = Number(raw);
    if (!id || Number.isNaN(id)) continue;
    if (excludeAccountId && id === Number(excludeAccountId)) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    try {
      await sendPushToAccount(id, {
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: "default",
      });
    } catch (e) {
      console.warn("maintenance push account send failed", { accountId: id, error: e });
    }
  }
}

async function dispatchMaintenancePush(
  requestId: number,
  eventType: string,
  actorAccountId: number | null,
  notes: string | null
): Promise<void> {
  try {
    const ctx = await getMaintenancePushContext(requestId);
    if (!ctx) return;

    const evt = String(eventType || "").toUpperCase();
    const title = buildPushTitle(evt, requestId);
    const body = buildPushBody(evt, ctx, notes);
    const data = {
      type: "maintenance",
      eventType: evt,
      requestId,
    };

    if (evt === "REQUESTED") {
      if (ctx.creatorBarangayId && !Number.isNaN(ctx.creatorBarangayId)) {
        try {
          await sendPushToRoleAndBarangay(ROLE_STAFF, ctx.creatorBarangayId, {
            title,
            body,
            data,
            sound: "default",
          });
        } catch (e) {
          console.warn("maintenance push role send failed (staff/requested)", e);
        }

        try {
          await sendPushToRoleAndBarangay(ROLE_ADMIN, ctx.creatorBarangayId, {
            title,
            body,
            data,
            sound: "default",
          });
        } catch (e) {
          console.warn("maintenance push role send failed (admin/requested)", e);
        }
      }
      return;
    }

    if (evt === "REASSIGNED") {
      const parsed = extractToAccountIdFromNotes(notes);
      await sendPushToAccountsUnique(
        [ctx.createdBy, parsed.toAccountId ?? ctx.assignedTo],
        { title, body, data },
        actorAccountId
      );
      return;
    }

    if (evt === "CANCEL_REQUESTED") {
      await sendPushToAccountsUnique([ctx.createdBy], { title, body, data }, actorAccountId);

      if (ctx.creatorBarangayId && !Number.isNaN(ctx.creatorBarangayId)) {
        try {
          await sendPushToRoleAndBarangay(ROLE_STAFF, ctx.creatorBarangayId, {
            title,
            body,
            data,
            sound: "default",
          });
        } catch (e) {
          console.warn("maintenance push role send failed (staff/cancel_requested)", e);
        }

        try {
          await sendPushToRoleAndBarangay(ROLE_ADMIN, ctx.creatorBarangayId, {
            title,
            body,
            data,
            sound: "default",
          });
        } catch (e) {
          console.warn("maintenance push role send failed (admin/cancel_requested)", e);
        }
      }
      return;
    }

    await sendPushToAccountsUnique([ctx.createdBy, ctx.assignedTo], { title, body, data }, actorAccountId);
  } catch (e) {
    console.warn("dispatchMaintenancePush failed", { requestId, eventType, error: e });
  }
}

export async function addAttachment(
  requestId: number,
  uploadedBy: number,
  filepath: string,
  filename: string,
  filetype?: string,
  filesize?: number,
  publicId?: string | null,
  eventId?: number | null
): Promise<any> {
  const [ticket] = await pool.query<Row[]>(
    "SELECT Request_Id FROM maintenance_tbl WHERE Request_Id = ?",
    [requestId]
  );
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const sql = `INSERT INTO maintenance_attachments_tbl 
    (Request_Id, Uploaded_by, File_path, File_name, File_type, File_size, Public_id, Event_Id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  const [result] = await pool.query(sql, [
    requestId,
    uploadedBy,
    filepath,
    filename,
    filetype || null,
    filesize || null,
    publicId || null,
    eventId || null,
  ]);
  const insertId = (result as any).insertId;

  const [attachment] = await pool.query<Row[]>(
    "SELECT * FROM maintenance_attachments_tbl WHERE Attachment_Id = ?",
    [insertId]
  );
  return attachment[0];
}

export async function getTicketAttachments(requestId: number, before?: Date | null): Promise<any[]> {
  let sql = `
    SELECT
      ma.*,
      CONCAT(p.FirstName, ' ', p.LastName) AS UploaderName,
      a.Roles AS UploaderRoleId,
      ur.Roles AS UploaderRoleName
    FROM maintenance_attachments_tbl ma
    LEFT JOIN profile_tbl p ON ma.Uploaded_by = p.Account_id
    LEFT JOIN accounts_tbl a ON ma.Uploaded_by = a.Account_id
    LEFT JOIN user_roles_tbl ur ON a.Roles = ur.Roles_id
    WHERE ma.Request_Id = ?
  `;
  const params: any[] = [requestId];

  if (before) {
    sql += ` AND ma.Uploaded_at <= ?`;
    params.push(before);
  }

  sql += ` ORDER BY ma.Uploaded_at ASC`;

  const [rows] = await pool.query<Row[]>(sql, params);
  return rows;
}

export async function createTicket(data: {
  title: string;
  details?: string;
  priority?: string;
  created_by: number;
  due_date?: string | null;
}): Promise<any> {
  const [acctRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [data.created_by]);
  if (!acctRows.length) throw { status: 404, message: "Account not found" };

  const role = acctRows[0].Roles;
  if (role !== ROLE_ADMIN && role !== ROLE_STAFF && role !== ROLE_OPERATOR) {
    throw { status: 403, message: "Only Admin, Staff, or Operators can create maintenance tickets" };
  }

  let priorityId: number | null = null;
  if (data.priority) {
    if (["Critical", "Urgent", "Mild"].includes(data.priority)) {
      priorityId = await getPriorityIdByName(data.priority);
    } else {
      priorityId = Number(data.priority);
    }
  }

  const requestedStatusId = await getStatusIdByName("Requested");

  const sql = `INSERT INTO maintenance_tbl 
    (Title, Details, Priority_Id, Created_by, Due_date, Main_stat_id)
    VALUES (?, ?, ?, ?, ?, ?)`;
  const params = [
    data.title,
    data.details || null,
    priorityId,
    data.created_by,
    data.due_date || null,
    requestedStatusId,
  ];

  const [result] = await pool.query(sql, params);
  const insertId = (result as any).insertId;

  await logEvent(insertId, "REQUESTED", data.created_by, null);

  const [ticket] = await pool.query<Row[]>(
    "SELECT * FROM maintenance_tbl WHERE Request_Id = ?",
    [insertId]
  );
  return ticket[0];
}

export async function acceptAndAssign(
  requestId: number,
  staffAccountId: number,
  assignToAccountId: number | null,
  priority?: string | number | null,
  dueDate?: string | null
): Promise<any> {
  const [acctRows] = await pool.query<Row[]>(
    "SELECT Roles FROM accounts_tbl WHERE Account_id = ?",
    [staffAccountId]
  );
  if (!acctRows.length) throw { status: 404, message: "Staff account not found" };

  const role = acctRows[0].Roles;
  if (role !== ROLE_STAFF && role !== ROLE_ADMIN) {
    throw { status: 403, message: "Only Barangay Staff or Admin can accept tickets" };
  }

  const [ticketRows] = await pool.query<Row[]>(
    "SELECT * FROM maintenance_tbl WHERE Request_Id = ?",
    [requestId]
  );
  if (!ticketRows.length) throw { status: 404, message: "Ticket not found" };

  const ticket = ticketRows[0];
  const onGoingStatusId = await getStatusIdByName("On-going");
  if (!onGoingStatusId) throw { status: 500, message: "Status 'On-going' not found" };

  const cancelledStatusId = await getStatusIdByName("Cancelled");
  if (!cancelledStatusId) throw { status: 500, message: "Status 'Cancelled' not found" };

  let priorityId: number | null = null;
  if (priority !== undefined && priority !== null && String(priority).trim() !== "") {
    const p = String(priority).trim();
    if (["Critical", "Urgent", "Mild"].includes(p)) {
      priorityId = await getPriorityIdByName(p);
    } else {
      const n = Number(p);
      priorityId = Number.isFinite(n) ? n : null;
    }
  }

  const dueDateValue =
    dueDate !== undefined && dueDate !== null && String(dueDate).trim() !== ""
      ? String(dueDate).trim()
      : null;

  if (ticket.Main_stat_id === cancelledStatusId) {
    await pool.query(
      `UPDATE maintenance_tbl
       SET Main_stat_id = ?,
           Assigned_to = ?,
           Priority_Id = CASE WHEN ? IS NOT NULL THEN ? ELSE Priority_Id END,
           Due_date   = CASE WHEN ? IS NOT NULL THEN ? ELSE Due_date END,
           Cancel_reason = NULL,
           Cancel_requested_by = NULL,
           Cancel_requested_at = NULL,
           Cancelled_by = NULL,
           Cancelled_at = NULL
       WHERE Request_Id = ?`,
      [
        onGoingStatusId,
        assignToAccountId,
        priorityId, priorityId,
        dueDateValue, dueDateValue,
        requestId,
      ]
    );

    await logEvent(
      requestId,
      "REASSIGNED",
      staffAccountId,
      JSON.stringify({
        to_account_id: assignToAccountId,
        message: assignToAccountId
          ? `Reassigned to operator ${assignToAccountId} after cancellation`
          : "Reassigned after cancellation (unassigned)",
      })
    );
  } else {
    await pool.query(
      `UPDATE maintenance_tbl
       SET Main_stat_id = ?,
           Assigned_to = ?,
           Priority_Id = CASE WHEN ? IS NOT NULL THEN ? ELSE Priority_Id END,
           Due_date   = CASE WHEN ? IS NOT NULL THEN ? ELSE Due_date END
       WHERE Request_Id = ?`,
      [
        onGoingStatusId,
        assignToAccountId,
        priorityId, priorityId,
        dueDateValue, dueDateValue,
        requestId,
      ]
    );

    await logEvent(
      requestId,
      "ACCEPTED",
      staffAccountId,
      assignToAccountId ? `Assigned to operator ${assignToAccountId}` : "Accepted without assignment"
    );
  }

  const [updated] = await pool.query<Row[]>(
    "SELECT * FROM maintenance_tbl WHERE Request_Id = ?",
    [requestId]
  );
  return updated[0];
}

export async function markOnGoingByOperator(requestId: number, operatorAccountId: number): Promise<any> {
  const [acctRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [operatorAccountId]);
  if (!acctRows.length) throw { status: 404, message: "Operator account not found" };
  if (acctRows[0].Roles !== ROLE_OPERATOR) throw { status: 403, message: "Only Operators can mark as On-going" };

  const [ticket] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };
  if (ticket[0].Assigned_to !== operatorAccountId) throw { status: 403, message: "Only assigned operator can mark as On-going" };

  const onGoingStatusId = await getStatusIdByName("On-going");

  await pool.query("UPDATE maintenance_tbl SET Main_stat_id = ? WHERE Request_Id = ?", [onGoingStatusId, requestId]);
  await logEvent(requestId, "ONGOING", operatorAccountId, null);

  const [updated] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  return updated[0];
}

export async function operatorMarkForVerification(requestId: number, operatorAccountId: number): Promise<any> {
  const [acctRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [operatorAccountId]);
  if (!acctRows.length) throw { status: 404, message: "Operator account not found" };
  if (acctRows[0].Roles !== ROLE_OPERATOR) throw { status: 403, message: "Only Operators can mark for verification" };

  const [ticket] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };
  if (ticket[0].Assigned_to !== operatorAccountId) throw { status: 403, message: "Only assigned operator can mark for verification" };

  const forVerificationStatusId = await getStatusIdByName("For Verification");

  await pool.query(
    "UPDATE maintenance_tbl SET Main_stat_id = ?, For_verification_at = NOW() WHERE Request_Id = ?",
    [forVerificationStatusId, requestId]
  );

  await logEvent(requestId, "FOR_VERIFICATION", operatorAccountId, "Operator marked task as complete");

  const [updated] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  return updated[0];
}

export async function staffVerifyCompletion(requestId: number, staffAccountId: number): Promise<any> {
  const [acctRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [staffAccountId]);
  if (!acctRows.length) throw { status: 404, message: "Staff account not found" };

  const role = acctRows[0].Roles;
  if (role !== ROLE_STAFF && role !== ROLE_ADMIN) {
    throw { status: 403, message: "Only Barangay Staff or Admin can verify completion" };
  }

  const [ticket] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const completedStatusId = await getStatusIdByName("Completed");
  await pool.query("UPDATE maintenance_tbl SET Main_stat_id = ?, Completed_at = NOW() WHERE Request_Id = ?", [completedStatusId, requestId]);

  await logEvent(requestId, "COMPLETED", staffAccountId, "Staff verified completion");

  const [updated] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  return updated[0];
}

export async function cancelTicket(
  requestId: number,
  actorAccountId: number,
  reason?: string
): Promise<any> {
  const [acctRows] = await pool.query<Row[]>(
    "SELECT Roles FROM accounts_tbl WHERE Account_id = ?",
    [actorAccountId]
  );
  if (!acctRows.length) throw { status: 404, message: "Account not found" };

  const [ticketRows] = await pool.query<Row[]>(
    "SELECT * FROM maintenance_tbl WHERE Request_Id = ?",
    [requestId]
  );
  if (!ticketRows.length) throw { status: 404, message: "Ticket not found" };

  const role = acctRows[0].Roles;
  const ticket = ticketRows[0];

  const cancelledStatusId = await getStatusIdByName("Cancelled");
  if (!cancelledStatusId) throw { status: 500, message: "Cancelled status not configured" };

  const cancelRequestedStatusId = await getStatusIdByName("Cancel Requested");
  if (!cancelRequestedStatusId) throw { status: 500, message: "Cancel Requested status not configured" };

  if (ticket.Main_stat_id === cancelledStatusId) {
    throw { status: 400, message: "Ticket is already cancelled" };
  }

  if (role === ROLE_OPERATOR) {
    const trimmed = (reason ?? "").trim();
    if (!trimmed) throw { status: 400, message: "Cancellation reason is required" };

    await pool.query(
      `UPDATE maintenance_tbl
       SET Main_stat_id = ?,
           Cancel_reason = ?,
           Cancel_requested_by = ?,
           Cancel_requested_at = NOW()
       WHERE Request_Id = ?`,
      [cancelRequestedStatusId, trimmed, actorAccountId, requestId]
    );

    await insertCancelLog(requestId, actorAccountId, trimmed);
    await logEvent(requestId, "CANCEL_REQUESTED", actorAccountId, trimmed);

    const [updated] = await pool.query<Row[]>(
      "SELECT * FROM maintenance_tbl WHERE Request_Id = ?",
      [requestId]
    );
    return updated[0];
  }

  if (role !== ROLE_STAFF && role !== ROLE_ADMIN) {
    throw { status: 403, message: "Only staff/admin can cancel tickets" };
  }

  const trimmedReason = (reason ?? "").trim();

  await pool.query(
    `UPDATE maintenance_tbl
     SET Main_stat_id = ?,
         Assigned_to = NULL,
         Cancelled_by = ?,
         Cancelled_at = NOW(),
         Cancel_reason = CASE WHEN ? <> '' THEN ? ELSE Cancel_reason END
     WHERE Request_Id = ?`,
    [cancelledStatusId, actorAccountId, trimmedReason, trimmedReason, requestId]
  );

  await logEvent(requestId, "CANCELLED", actorAccountId, trimmedReason || "Cancelled by staff");

  const [updateResult] = await pool.query<any>(
    `UPDATE maintenance_cancel_log_tbl
     SET Approved_By = ?, Approved_At = NOW()
     WHERE Request_Id = ? AND Approved_At IS NULL`,
    [actorAccountId, requestId]
  );

  const affected = updateResult?.affectedRows ?? 0;

  if (affected === 0) {
    const operatorForHistory = (ticket.Assigned_to ?? ticket.Cancel_requested_by ?? null) as number | null;

    if (operatorForHistory) {
      await pool.query(
        `INSERT INTO maintenance_cancel_log_tbl
          (Request_Id, Operator_Account_id, Reason, Requested_at, Approved_by, Approved_at)
         VALUES (?, ?, ?, NOW(), ?, NOW())`,
        [requestId, operatorForHistory, trimmedReason || null, actorAccountId]
      );
    }
  }

  const [updated] = await pool.query<Row[]>(
    "SELECT * FROM maintenance_tbl WHERE Request_Id = ?",
    [requestId]
  );
  return updated[0];
}

export async function getTicketById(requestId: number, userRole?: number, userBarangayId?: number): Promise<any> {
  const sql = `
    SELECT
      m.*,
      p.Priority,
      s.Status,
      CONCAT(op_profile.FirstName, ' ', op_profile.LastName) AS AssignedOperatorName,
      CONCAT(creator_profile.FirstName, ' ', creator_profile.LastName) AS CreatedByName,
      creator_account.Roles AS CreatorRole,

      CONCAT(cr_profile.FirstName, ' ', cr_profile.LastName) AS CancelRequestedByName,
      cr_account.Roles AS CancelRequestedByRoleId,
      cr_role.Roles AS CancelRequestedByRole,

      CONCAT(c_profile.FirstName, ' ', c_profile.LastName) AS CancelledByName,
      c_account.Roles AS CancelledByRoleId,
      c_role.Roles AS CancelledByRole,

      CONCAT(last_op_profile.FirstName, ' ', last_op_profile.LastName) AS LastAssignedOperatorName,

      creator_profile.Barangay_id AS CreatorBarangayId

    FROM maintenance_tbl m
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id

    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id

    LEFT JOIN profile_tbl creator_profile ON m.Created_by = creator_profile.Account_id
    LEFT JOIN accounts_tbl creator_account ON m.Created_by = creator_account.Account_id

    LEFT JOIN profile_tbl cr_profile ON m.Cancel_requested_by = cr_profile.Account_id
    LEFT JOIN accounts_tbl cr_account ON m.Cancel_requested_by = cr_account.Account_id
    LEFT JOIN user_roles_tbl cr_role ON cr_account.Roles = cr_role.Roles_id

    LEFT JOIN profile_tbl c_profile ON m.Cancelled_by = c_profile.Account_id
    LEFT JOIN accounts_tbl c_account ON m.Cancelled_by = c_account.Account_id
    LEFT JOIN user_roles_tbl c_role ON c_account.Roles = c_role.Roles_id

    LEFT JOIN (
      SELECT
        Request_Id,
        Operator_Account_id,
        ROW_NUMBER() OVER (PARTITION BY Request_id ORDER BY Approved_at DESC) AS rn
      FROM maintenance_cancel_log_tbl
      WHERE Approved_at IS NOT NULL
    ) last_cancel_log ON m.Request_id = last_cancel_log.Request_id AND last_cancel_log.rn = 1
    LEFT JOIN profile_tbl last_op_profile ON last_cancel_log.Operator_Account_id = last_op_profile.Account_id

    WHERE m.Request_id = ?
      AND (m.IsDeleted = 0 OR m.IsDeleted IS NULL)
  `;
  const [ticket] = await pool.query<Row[]>(sql, [requestId]);
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  if ((userRole === 2 || userRole === 3) && userBarangayId) {
    if (ticket[0].CreatorBarangayId !== userBarangayId) {
      throw { status: 403, message: "You do not have permission to view this ticket" };
    }
  }

  const attachments = await getTicketAttachments(requestId);

  return {
    ...ticket[0],
    Attachments: attachments,
  };
}

export async function listTickets(filters: { status?: string; assigned_to?: number; created_by?: number; created_by_barangay_id?: number } = {}): Promise<any[]> {
  let sql = `
    SELECT 
      m.*, 
      p.Priority, 
      s.Status,
      CONCAT(op_profile.FirstName, ' ', op_profile.LastName) AS AssignedOperatorName,
      CONCAT(creator_profile.FirstName, ' ', creator_profile.LastName) AS CreatedByName,
      creator_account.Roles AS CreatorRole,
      COUNT(ma.Attachment_id) AS AttachmentCount,

      CONCAT(cr_profile.FirstName, ' ', cr_profile.LastName) AS CancelRequestedByName,
      cr_account.Roles AS CancelRequestedByRoleId,
      cr_role.Roles AS CancelRequestedByRole,

      CONCAT(c_profile.FirstName, ' ', c_profile.LastName) AS CancelledByName,
      c_account.Roles AS CancelledByRoleId,
      c_role.Roles AS CancelledByRole,

      CONCAT(last_op_profile.FirstName, ' ', last_op_profile.LastName) AS LastAssignedOperatorName

    FROM maintenance_tbl m
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id
    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id
    LEFT JOIN profile_tbl creator_profile ON m.Created_by = creator_profile.Account_id
    LEFT JOIN accounts_tbl creator_account ON m.Created_by = creator_account.Account_id
    LEFT JOIN maintenance_attachments_tbl ma ON m.Request_id = ma.Request_id

    LEFT JOIN profile_tbl cr_profile ON m.Cancel_requested_by = cr_profile.Account_id
    LEFT JOIN accounts_tbl cr_account ON m.Cancel_requested_by = cr_account.Account_id
    LEFT JOIN user_roles_tbl cr_role ON cr_account.Roles = cr_role.Roles_id

    LEFT JOIN profile_tbl c_profile ON m.Cancelled_by = c_profile.Account_id
    LEFT JOIN accounts_tbl c_account ON m.Cancelled_by = c_account.Account_id
    LEFT JOIN user_roles_tbl c_role ON c_account.Roles = c_role.Roles_id

    LEFT JOIN (
      SELECT 
        Request_id,
        Operator_Account_id,
        ROW_NUMBER() OVER (PARTITION BY Request_id ORDER BY Approved_at DESC) AS rn
      FROM maintenance_cancel_log_tbl
      WHERE Approved_at IS NOT NULL
    ) last_cancel_log ON m.Request_id = last_cancel_log.Request_id AND last_cancel_log.rn = 1
    LEFT JOIN profile_tbl last_op_profile ON last_cancel_log.Operator_Account_id = last_op_profile.Account_id

    WHERE 1=1
      AND (m.IsDeleted = 0 OR m.IsDeleted IS NULL)
  `;
  const params: any[] = [];

  if (filters.status) {
    const statuses = filters.status.split(",").map((s) => s.trim());
    sql += ` AND s.Status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);
  }

  if (typeof filters.assigned_to === "number") {
    sql += " AND m.Assigned_to = ?";
    params.push(filters.assigned_to);
  }

  if (typeof filters.created_by === "number") {
    sql += " AND m.Created_by = ?";
    params.push(filters.created_by);
  }

  if (typeof filters.created_by_barangay_id === "number") {
    sql += " AND creator_profile.Barangay_id = ?";
    params.push(filters.created_by_barangay_id);
  }

  sql += `
  GROUP BY
    m.Request_id,
    m.Title,
    m.Details,
    m.Priority_id,
    m.Created_by,
    m.Due_date,
    m.Main_stat_id,
    m.Assigned_to,
    m.Request_date,
    m.IsDeleted,
    m.Cancel_requested_by,
    m.Cancel_requested_at,
    m.Cancel_reason,
    m.Cancelled_by,
    m.Cancelled_at,
    m.Completed_at,
    m.Deleted_by,
    m.Deleted_at,
    m.Deleted_reason,
    p.Priority,
    s.Status,
    op_profile.FirstName,
    op_profile.LastName,
    creator_profile.FirstName,
    creator_profile.LastName,
    creator_account.Roles,
    cr_profile.FirstName,
    cr_profile.LastName,
    cr_account.Roles,
    cr_role.Roles,
    c_profile.FirstName,
    c_profile.LastName,
    c_account.Roles,
    c_role.Roles,
    last_op_profile.FirstName,
    last_op_profile.LastName
  ORDER BY m.Request_date DESC
`;

  const [rows] = await pool.query<Row[]>(sql, params);
  return rows;
}

export async function addRemarksToTicket(requestId: number, remarks: string): Promise<any> {
  const [ticket] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const existingRemarks = ticket[0].Remarks || "";
  const timestamp = new Date().toISOString();
  const newRemarks = existingRemarks
    ? `${existingRemarks}\n[${timestamp}] ${remarks}`
    : `[${timestamp}] ${remarks}`;

  await pool.query("UPDATE maintenance_tbl SET Remarks = ? WHERE Request_Id = ?", [newRemarks, requestId]);

  const [updated] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  return updated[0];
}

export async function getAllPriorities(): Promise<any[]> {
  const sql = "SELECT Priority_id, Priority FROM maintenance_priority_tbl ORDER BY Priority_id ASC";
  const [rows] = await pool.query<Row[]>(sql);
  return rows;
}

export async function addRemark(
  requestId: number,
  remarkText: string,
  createdBy: number,
  userRole: string | null,
  eventId?: number | null
): Promise<any> {
  const trimmed = (remarkText ?? "").trim();
  if (!trimmed) throw { status: 400, message: "Remark text is required" };

  const [ticket] = await pool.query<Row[]>(
    "SELECT Request_Id FROM maintenance_tbl WHERE Request_Id = ?",
    [requestId]
  );
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const [acctRows] = await pool.query<Row[]>(
    "SELECT Roles FROM accounts_tbl WHERE Account_id = ?",
    [createdBy]
  );
  if (!acctRows.length) throw { status: 404, message: "Account not found" };

  const roleId = Number(acctRows[0].Roles);

  let effectiveEventId: number | null = eventId ?? null;
  if (!effectiveEventId && (roleId === ROLE_ADMIN || roleId === ROLE_STAFF)) {
    effectiveEventId = await logEvent(requestId, "MESSAGE", createdBy, trimmed);
  }

  const [result] = await pool.query<any>(
    `INSERT INTO maintenance_remarks_tbl (Request_Id, Remark_text, Created_by, User_role, Event_Id, Created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [requestId, trimmed, createdBy, userRole ?? null, effectiveEventId]
  );

  const insertId = result?.insertId;

  const [rows] = await pool.query<Row[]>(
    `SELECT
      mr.*,
      CONCAT(p.FirstName, ' ', p.LastName) AS CreatedByName,
      a.Roles AS CreatedByRoleId,
      ur.Roles AS CreatedByRoleName
    FROM maintenance_remarks_tbl mr
    LEFT JOIN profile_tbl p ON mr.Created_by = p.Account_id
    LEFT JOIN accounts_tbl a ON mr.Created_by = a.Account_id
    LEFT JOIN user_roles_tbl ur ON a.Roles = ur.Roles_id
    WHERE mr.Remark_id = ?
    LIMIT 1`,
    [insertId]
  );

  return rows.length ? rows[0] : null;
}

export async function getTicketRemarks(requestId: number, before?: Date | null): Promise<any[]> {
  let sql = `
    SELECT 
      mr.*,
      CONCAT(p.FirstName, ' ', p.LastName) AS CreatedByName,
      a.Roles AS CreatedByRoleId,
      ur.Roles AS CreatedByRoleName
    FROM maintenance_remarks_tbl mr
    LEFT JOIN profile_tbl p ON mr.Created_by = p.Account_id
    LEFT JOIN accounts_tbl a ON mr.Created_by = a.Account_id
    LEFT JOIN user_roles_tbl ur ON a.Roles = ur.Roles_id
    WHERE mr.Request_id = ?
  `;
  const params: any[] = [requestId];

  if (before) {
    sql += ` AND mr.Created_at <= ?`;
    params.push(before);
  }

  sql += ` ORDER BY mr.Created_at ASC`;

  const [rows] = await pool.query<Row[]>(sql, params);
  return rows;
}

export async function deleteTicket(
  requestId: number,
  actorAccountId: number,
  reason: string
): Promise<{ deleted: boolean }> {
  const trimmedReason = (reason ?? "").trim();
  if (!trimmedReason) throw { status: 400, message: "reason is required" };

  const [acctRows] = await pool.query<any[]>(
    "SELECT Roles FROM accounts_tbl WHERE Account_id = ?",
    [actorAccountId]
  );
  if (!acctRows.length) throw { status: 404, message: "Account not found" };

  const role = acctRows[0].Roles;
  if (role !== ROLE_STAFF && role !== ROLE_ADMIN) {
    throw { status: 403, message: "Only Barangay Staff or Admin can delete tickets" };
  }

  const [ticketRows] = await pool.query<any[]>(
    "SELECT Request_Id, Main_stat_id, IsDeleted FROM maintenance_tbl WHERE Request_Id = ?",
    [requestId]
  );
  if (!ticketRows.length) throw { status: 404, message: "Ticket not found" };

  if (ticketRows[0].IsDeleted === 1) return { deleted: true };

  const requestedStatusId = await getStatusIdByName("Requested");
  if (!requestedStatusId) throw { status: 500, message: "Requested status not found" };

  const cancelRequestedStatusId = await getStatusIdByName("Cancel Requested");
  if (!cancelRequestedStatusId) throw { status: 500, message: "Cancel Requested status not found" };

  const cancelledStatusId = await getStatusIdByName("Cancelled");
  if (!cancelledStatusId) throw { status: 500, message: "Cancelled status not found" };

  const mainStatId = ticketRows[0].Main_stat_id;

  const canDelete =
    mainStatId === requestedStatusId ||
    mainStatId === cancelRequestedStatusId ||
    mainStatId === cancelledStatusId;

  if (!canDelete) {
    throw { status: 400, message: "Only Requested / Cancel Requested / Cancelled tickets can be deleted" };
  }

  await pool.query(
    `UPDATE maintenance_tbl
     SET IsDeleted = 1,
         Deleted_by = ?,
         Deleted_at = NOW(),
         Deleted_reason = ?
     WHERE Request_Id = ?`,
    [actorAccountId, trimmedReason, requestId]
  );

  await logEvent(requestId, "DELETED", actorAccountId, trimmedReason);

  return { deleted: true };
}

async function findLatestOpenCancelLogId(requestId: number, operatorId: number): Promise<number | null> {
  const [rows] = await pool.query<Row[]>(
    `SELECT Cancel_Log_id
     FROM maintenance_cancel_log_tbl
     WHERE Request_id = ? AND Operator_Account_id = ? AND Approved_at IS NULL
     ORDER BY Requested_at DESC
     LIMIT 1`,
    [requestId, operatorId]
  );
  return rows.length ? rows[0].Cancel_log_id : null;
}

async function insertCancelLog(requestId: number, operatorId: number, reason: string | null) {
  await pool.query(
    `INSERT INTO maintenance_cancel_log_tbl (Request_id, Operator_Account_id, Reason, Requested_at)
     VALUES (?, ?, ?, NOW())`,
    [requestId, operatorId, reason]
  );
}

async function approveCancelLog(cancelLogId: number, approvedBy: number) {
  await pool.query(
    `UPDATE maintenance_cancel_log_tbl
     SET Approved_by = ?, Approved_at = NOW()
     WHERE Cancel_log_id = ?`,
    [approvedBy, cancelLogId]
  );
}

export async function listOperatorCancelledHistory(operatorAccountId: number): Promise<any[]> {
  const sql = `
    SELECT
      m.*,
      p.Priority,
      s.Status,
      CONCAT(op_profile.FirstName, ' ', op_profile.LastName) AS AssignedOperatorName,
      CONCAT(creator_profile.FirstName, ' ', creator_profile.LastName) AS CreatedByName,
      creator_account.Roles AS CreatorRole,

      l.Cancel_log_id AS CancelLogId,
      l.Reason AS CancelLogReason,
      l.Requested_at AS CancelRequestedAt,
      l.Approved_at AS CancelApprovedAt

    FROM maintenance_cancel_log_tbl l
    JOIN (
      SELECT Request_id, MAX(Cancel_log_id) AS LatestCancelLogId
      FROM maintenance_cancel_log_tbl
      WHERE Operator_Account_id = ?
        AND Approved_at IS NOT NULL
      GROUP BY Request_id
    ) latest ON latest.LatestCancelLogId = l.Cancel_log_id
    JOIN maintenance_tbl m ON l.Request_id = m.Request_id
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id
    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id
    LEFT JOIN profile_tbl creator_profile ON m.Created_by = creator_profile.Account_id
    LEFT JOIN accounts_tbl creator_account ON m.Created_by = creator_account.Account_id
    WHERE l.Operator_Account_id = ?
      AND (m.Assigned_to IS NULL OR m.Assigned_to <> ?)
    ORDER BY l.Approved_at DESC
  `;

  const [rows] = await pool.query<Row[]>(sql, [
    operatorAccountId,
    operatorAccountId,
    operatorAccountId,
  ]);
  return rows;
}

export async function listDeletedTickets(): Promise<any[]> {
  const sql = `
    SELECT 
      m.*, 
      p.Priority, 
      s.Status,
      CONCAT(op_profile.FirstName, ' ', op_profile.LastName) AS AssignedOperatorName,
      CONCAT(creator_profile.FirstName, ' ', creator_profile.LastName) AS CreatedByName,
      creator_account.Roles AS CreatorRole,
      COUNT(ma.Attachment_id) AS AttachmentCount
    FROM maintenance_tbl m
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id
    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id
    LEFT JOIN profile_tbl creator_profile ON m.Created_by = creator_profile.Account_id
    LEFT JOIN accounts_tbl creator_account ON m.Created_by = creator_account.Account_id
    LEFT JOIN maintenance_attachments_tbl ma ON m.Request_id = ma.Request_id
    WHERE m.IsDeleted = 1
    GROUP BY m.Request_id
    ORDER BY m.Request_date DESC
  `;
  const [rows] = await pool.query<Row[]>(sql);
  return rows;
}

async function logEvent(
  requestId: number,
  eventType: string,
  actorAccountId: number | null,
  notes: string | null = null
): Promise<number> {
  const [result] = await pool.query<any>(
    `INSERT INTO maintenance_events_tbl (Request_id, Event_type, Actor_Account_id, Notes, Created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [requestId, eventType, actorAccountId, notes]
  );

  const eventId = result?.insertId ?? 0;
  await dispatchMaintenancePush(requestId, eventType, actorAccountId, notes);
  return eventId;
}

export async function getTicketEvents(requestId: number, before?: Date | null): Promise<any[]> {
  let sql = `
    SELECT 
      e.*,
      CONCAT(p.FirstName, ' ', p.LastName) AS ActorName,
      a.Roles AS ActorRoleId,
      ur.Roles AS ActorRoleName
    FROM maintenance_events_tbl e
    LEFT JOIN profile_tbl p ON e.Actor_Account_id = p.Account_id
    LEFT JOIN accounts_tbl a ON e.Actor_Account_id = a.Account_id
    LEFT JOIN user_roles_tbl ur ON a.Roles = ur.Roles_id
    WHERE e.Request_id = ?
  `;
  const params: any[] = [requestId];

  if (before) {
    sql += ` AND e.Created_at <= ?`;
    params.push(before);
  }

  sql += ` ORDER BY e.Created_at ASC`;

  const [rows] = await pool.query<Row[]>(sql, params);

  const toIds = new Set<number>();
  const parsedByEventId = new Map<number, { toAccountId: number | null; message: string | null }>();

  for (const ev of rows) {
    if (ev.Event_type !== "REASSIGNED") continue;
    const parsed = extractToAccountIdFromNotes(ev.Notes ?? null);
    parsedByEventId.set(ev.Event_id, parsed);
    if (parsed.toAccountId) toIds.add(parsed.toAccountId);
  }

  let toMap = new Map<number, { name: string; roleName: string | null }>();
  if (toIds.size > 0) {
    const ids = Array.from(toIds);
    const placeholders = ids.map(() => "?").join(",");
    const [toRows] = await pool.query<Row[]>(
      `
      SELECT
        p.Account_id AS AccountId,
        CONCAT(p.FirstName, ' ', p.LastName) AS FullName,
        ur.Roles AS RoleName
      FROM profile_tbl p
      LEFT JOIN accounts_tbl a ON p.Account_id = a.Account_id
      LEFT JOIN user_roles_tbl ur ON a.Roles = ur.Roles_id
      WHERE p.Account_id IN (${placeholders})
      `,
      ids
    );

    toMap = new Map(
      toRows.map((r) => [Number(r.AccountId), { name: r.FullName || "Unknown", roleName: r.RoleName ?? null }])
    );
  }

  return rows.map((ev) => {
    if (ev.Event_type !== "REASSIGNED") return ev;

    const parsed = parsedByEventId.get(ev.Event_id) ?? { toAccountId: null, message: ev.Notes ?? null };
    const to = parsed.toAccountId ? toMap.get(parsed.toAccountId) : null;

    return {
      ...ev,
      Notes: parsed.message,
      ToActorAccountId: parsed.toAccountId,
      ToActorName: to?.name ?? null,
      ToActorRoleName: to?.roleName ?? null,
    };
  });
}

export async function getEventDetails(eventId: number): Promise<any> {
  const [eventRows] = await pool.query<Row[]>(
    `SELECT 
      e.*,
      CONCAT(p.FirstName, ' ', p.LastName) AS ActorName,
      a.Roles AS ActorRoleId,
      ur.Roles AS ActorRoleName
    FROM maintenance_events_tbl e
    LEFT JOIN profile_tbl p ON e.Actor_Account_id = p.Account_id
    LEFT JOIN accounts_tbl a ON e.Actor_Account_id = a.Account_id
    LEFT JOIN user_roles_tbl ur ON a.Roles = ur.Roles_id
    WHERE e.Event_id = ?`,
    [eventId]
  );

  if (!eventRows.length) return null;

  const event = eventRows[0];

  const [remarks] = await pool.query<Row[]>(
    `SELECT 
      mr.*,
      CONCAT(p.FirstName, ' ', p.LastName) AS CreatedByName,
      a.Roles AS CreatedByRoleId,
      ur.Roles AS CreatedByRoleName
    FROM maintenance_remarks_tbl mr
    LEFT JOIN profile_tbl p ON mr.Created_by = p.Account_id
    LEFT JOIN accounts_tbl a ON mr.Created_by = a.Account_id
    LEFT JOIN user_roles_tbl ur ON a.Roles = ur.Roles_id
    WHERE mr.Event_id = ?
    ORDER BY mr.Created_at ASC`,
    [eventId]
  );

  const [attachments] = await pool.query<Row[]>(
    `SELECT
      ma.*,
      CONCAT(p.FirstName, ' ', p.LastName) AS UploaderName,
      a.Roles AS UploaderRoleId,
      ur.Roles AS UploaderRoleName
    FROM maintenance_attachments_tbl ma
    LEFT JOIN profile_tbl p ON ma.Uploaded_by = p.Account_id
    LEFT JOIN accounts_tbl a ON ma.Uploaded_by = a.Account_id
    LEFT JOIN user_roles_tbl ur ON a.Roles = ur.Roles_id
    WHERE ma.Event_id = ?
    ORDER BY ma.Uploaded_at ASC`,
    [eventId]
  );

  return {
    ...event,
    Remarks: remarks,
    Attachments: attachments,
  };
}