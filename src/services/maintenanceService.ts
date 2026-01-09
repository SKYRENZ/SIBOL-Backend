import pool from "../config/db.js";

type Row = any;

const ROLE_ADMIN = 1;
const ROLE_STAFF = 2;
const ROLE_OPERATOR = 3;

async function getStatusIdByName(name: string) {
  const [rows] = await pool.query<Row[]>("SELECT Main_stat_id FROM maintenance_status_tbl WHERE Status = ?", [name]);
  return rows.length ? rows[0].Main_stat_id : null;
}

async function getPriorityIdByName(name: string) {
  const [rows] = await pool.query<Row[]>("SELECT Priority_id FROM maintenance_priority_tbl WHERE Priority = ?", [name]);
  return rows.length ? rows[0].Priority_id : null;
}

export async function addAttachment(
  requestId: number,
  uploadedBy: number,
  filepath: string,
  filename: string,
  filetype?: string,
  filesize?: number,
  publicId?: string | null, // ✅ add
  eventId?: number | null // ✅ NEW: optional event ID
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
    eventId || null // ✅ add
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

  // ✅ NEW: cutoff (used for Operator Cancelled-history view)
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
  // Verify account exists and get role
  const [acctRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [data.created_by]);
  if (!acctRows.length) throw { status: 404, message: "Account not found" };
  
  const role = acctRows[0].Roles;
  
  // Allow Admin, Staff, and Operator to create tickets
  if (role !== ROLE_ADMIN && role !== ROLE_STAFF && role !== ROLE_OPERATOR) {
    throw { status: 403, message: "Only Admin, Staff, or Operators can create maintenance tickets" };
  }

  // resolve priority id
  let priorityId: number | null = null;
  if (data.priority) {
    if (['Critical', 'Urgent', 'Mild'].includes(data.priority)) {
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
    requestedStatusId
  ];
  
  const [result] = await pool.query(sql, params);
  const insertId = (result as any).insertId;

  // ✅ Log REQUESTED event
  await logEvent(insertId, 'REQUESTED', data.created_by, null);

  const [ticket] = await pool.query<Row[]>(
    "SELECT * FROM maintenance_tbl WHERE Request_Id = ?", 
    [insertId]
  );
  return ticket[0];
}

function extractToAccountIdFromNotes(notes: string | null): { toAccountId: number | null; message: string | null } {
  if (!notes) return { toAccountId: null, message: null };

  // 1) JSON notes: {"to_account_id":123,"message":"..."}
  try {
    const parsed = JSON.parse(notes);
    const to = parsed?.to_account_id;
    const msg = typeof parsed?.message === "string" ? parsed.message : notes;
    return { toAccountId: typeof to === "number" ? to : Number.isFinite(Number(to)) ? Number(to) : null, message: msg };
  } catch {
    // ignore
  }

  // 2) Legacy text notes: "Reassigned to operator 123 ..."
  const m = notes.match(/operator\s+(\d+)/i);
  return { toAccountId: m ? Number(m[1]) : null, message: notes };
}

export async function acceptAndAssign(
  requestId: number,
  staffAccountId: number,
  assignToAccountId: number | null
): Promise<any> {
  // Verify staff/admin role
  const [acctRows] = await pool.query<Row[]>(
    "SELECT Roles FROM accounts_tbl WHERE Account_id = ?",
    [staffAccountId]
  );
  if (!acctRows.length) throw { status: 404, message: "Staff account not found" };

  const role = acctRows[0].Roles;
  if (role !== ROLE_STAFF && role !== ROLE_ADMIN) {
    throw { status: 403, message: "Only Barangay Staff or Admin can accept tickets" };
  }

  // Verify ticket exists
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

  if (ticket.Main_stat_id === cancelledStatusId) {
    await pool.query(
      `UPDATE maintenance_tbl
       SET Main_stat_id = ?,
           Assigned_to = ?,
           Cancel_reason = NULL,
           Cancel_requested_by = NULL,
           Cancel_requested_at = NULL,
           Cancelled_by = NULL,
           Cancelled_at = NULL
       WHERE Request_Id = ?`,
      [onGoingStatusId, assignToAccountId, requestId]
    );

    // ✅ Log REASSIGNED event with structured payload (so UI can show "to (Name) (Role)")
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
      "UPDATE maintenance_tbl SET Main_stat_id = ?, Assigned_to = ? WHERE Request_Id = ?",
      [onGoingStatusId, assignToAccountId, requestId]
    );
    // ✅ Log ACCEPTED event
    await logEvent(
      requestId,
      'ACCEPTED',
      staffAccountId,
      assignToAccountId ? `Assigned to operator ${assignToAccountId}` : 'Accepted without assignment'
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

  // ✅ Log FOR_VERIFICATION event
  await logEvent(requestId, 'FOR_VERIFICATION', operatorAccountId, 'Operator marked task as complete');

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

  // ✅ Log COMPLETED event
  await logEvent(requestId, 'COMPLETED', staffAccountId, 'Staff verified completion');

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

    // ✅ Log CANCEL_REQUESTED event
    await logEvent(requestId, 'CANCEL_REQUESTED', actorAccountId, trimmed);

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

  // ✅ Log CANCELLED event (by staff/admin)
  await logEvent(requestId, 'CANCELLED', actorAccountId, trimmedReason || 'Cancelled by staff');

  // ✅ NEW: Approve ALL pending cancel logs for this ticket
  // This ensures EVERY operator who requested cancel gets a history entry
  const [updateResult] = await pool.query<any>(
    `UPDATE maintenance_cancel_log_tbl
     SET Approved_By = ?, Approved_At = NOW()
     WHERE Request_Id = ? AND Approved_At IS NULL`,
    [actorAccountId, requestId]
  );

  const affected = updateResult?.affectedRows ?? 0;

  // ✅ If no existing logs, create one for the assigned/requesting operator
  // This happens when Barangay cancels directly without operator requesting
  if (affected === 0) {
    const operatorForHistory = (ticket.Assigned_to ?? ticket.Cancel_requested_by ?? null) as number | null;

    if (operatorForHistory) {
      await pool.query(
        `INSERT INTO maintenance_cancel_log_tbl
          (Request_Id, Operator_Account_Id, Reason, Requested_At, Approved_By, Approved_At)
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

export async function getTicketById(requestId: number): Promise<any> {
  const sql = `
    SELECT 
      m.*, 
      p.Priority, 
      s.Status,
      CONCAT(op_profile.FirstName, ' ', op_profile.LastName) AS AssignedOperatorName,
      CONCAT(creator_profile.FirstName, ' ', creator_profile.LastName) AS CreatedByName,
      creator_account.Roles AS CreatorRole,

      -- ✅ Cancel Requested (Operator)
      CONCAT(cr_profile.FirstName, ' ', cr_profile.LastName) AS CancelRequestedByName,
      cr_account.Roles AS CancelRequestedByRoleId,
      cr_role.Roles AS CancelRequestedByRole,

      -- ✅ Cancelled (Staff/Admin)
      CONCAT(c_profile.FirstName, ' ', c_profile.LastName) AS CancelledByName,
      c_account.Roles AS CancelledByRoleId,
      c_role.Roles AS CancelledByRole,

      -- ✅ NEW: Last Assigned Operator from cancel log (for cancelled tickets)
      CONCAT(last_op_profile.FirstName, ' ', last_op_profile.LastName) AS LastAssignedOperatorName

    FROM maintenance_tbl m
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_Id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id

    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id

    LEFT JOIN profile_tbl creator_profile ON m.Created_by = creator_profile.Account_id
    LEFT JOIN accounts_tbl creator_account ON m.Created_by = creator_account.Account_id

    -- ✅ joins for Cancel Requested by
    LEFT JOIN profile_tbl cr_profile ON m.Cancel_requested_by = cr_profile.Account_id
    LEFT JOIN accounts_tbl cr_account ON m.Cancel_requested_by = cr_account.Account_id
    LEFT JOIN user_roles_tbl cr_role ON cr_account.Roles = cr_role.Roles_id

    -- ✅ joins for Cancelled by
    LEFT JOIN profile_tbl c_profile ON m.Cancelled_by = c_profile.Account_id
    LEFT JOIN accounts_tbl c_account ON m.Cancelled_by = c_account.Account_id
    LEFT JOIN user_roles_tbl c_role ON c_account.Roles = c_role.Roles_id

    -- ✅ NEW: Get last assigned operator from cancel log (most recent approved cancellation)
    LEFT JOIN (
      SELECT 
        Request_Id,
        Operator_Account_Id,
        ROW_NUMBER() OVER (PARTITION BY Request_Id ORDER BY Approved_At DESC) AS rn
      FROM maintenance_cancel_log_tbl
      WHERE Approved_At IS NOT NULL
    ) last_cancel_log ON m.Request_Id = last_cancel_log.Request_Id AND last_cancel_log.rn = 1
    LEFT JOIN profile_tbl last_op_profile ON last_cancel_log.Operator_Account_Id = last_op_profile.Account_id

    WHERE m.Request_Id = ?
      AND (m.IsDeleted = 0 OR m.IsDeleted IS NULL)
  `;
  const [ticket] = await pool.query<Row[]>(sql, [requestId]);
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const attachments = await getTicketAttachments(requestId);

  return {
    ...ticket[0],
    Attachments: attachments,
  };
}

export async function listTickets(filters: { status?: string; assigned_to?: number; created_by?: number } = {}): Promise<any[]> {
  let sql = `
    SELECT 
      m.*, 
      p.Priority, 
      s.Status,
      CONCAT(op_profile.FirstName, ' ', op_profile.LastName) AS AssignedOperatorName,
      CONCAT(creator_profile.FirstName, ' ', creator_profile.LastName) AS CreatedByName,
      creator_account.Roles AS CreatorRole,
      COUNT(ma.Attachment_Id) AS AttachmentCount,

      -- ✅ Cancel Requested (Operator)
      CONCAT(cr_profile.FirstName, ' ', cr_profile.LastName) AS CancelRequestedByName,
      cr_account.Roles AS CancelRequestedByRoleId,
      cr_role.Roles AS CancelRequestedByRole,

      -- ✅ Cancelled (Staff/Admin)
      CONCAT(c_profile.FirstName, ' ', c_profile.LastName) AS CancelledByName,
      c_account.Roles AS CancelledByRoleId,
      c_role.Roles AS CancelledByRole,

      -- ✅ NEW: Last Assigned Operator from cancel log
      CONCAT(last_op_profile.FirstName, ' ', last_op_profile.LastName) AS LastAssignedOperatorName

    FROM maintenance_tbl m
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_Id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id
    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id
    LEFT JOIN profile_tbl creator_profile ON m.Created_by = creator_profile.Account_id
    LEFT JOIN accounts_tbl creator_account ON m.Created_by = creator_account.Account_id
    LEFT JOIN maintenance_attachments_tbl ma ON m.Request_Id = ma.Request_Id

    -- ✅ joins for Cancel Requested by
    LEFT JOIN profile_tbl cr_profile ON m.Cancel_requested_by = cr_profile.Account_id
    LEFT JOIN accounts_tbl cr_account ON m.Cancel_requested_by = cr_account.Account_id
    LEFT JOIN user_roles_tbl cr_role ON cr_account.Roles = cr_role.Roles_id

    -- ✅ joins for Cancelled by
    LEFT JOIN profile_tbl c_profile ON m.Cancelled_by = c_profile.Account_id
    LEFT JOIN accounts_tbl c_account ON m.Cancelled_by = c_account.Account_id
    LEFT JOIN user_roles_tbl c_role ON c_account.Roles = c_role.Roles_id

    -- ✅ NEW: Get last assigned operator from cancel log
    LEFT JOIN (
      SELECT 
        Request_Id,
        Operator_Account_Id,
        ROW_NUMBER() OVER (PARTITION BY Request_Id ORDER BY Approved_At DESC) AS rn
      FROM maintenance_cancel_log_tbl
      WHERE Approved_At IS NOT NULL
    ) last_cancel_log ON m.Request_Id = last_cancel_log.Request_Id AND last_cancel_log.rn = 1
    LEFT JOIN profile_tbl last_op_profile ON last_cancel_log.Operator_Account_Id = last_op_profile.Account_id

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

  sql += " GROUP BY m.Request_Id ORDER BY m.Request_date DESC";

  const [rows] = await pool.query<Row[]>(sql, params);
  return rows;
}

export async function addRemarksToTicket(requestId: number, remarks: string): Promise<any> {
  const [ticket] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const existingRemarks = ticket[0].Remarks || '';
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
  eventId?: number | null // ✅ NEW: optional event ID
): Promise<any> {
  const trimmed = (remarkText ?? "").trim();
  if (!trimmed) throw { status: 400, message: "Remark text is required" };

  const [ticket] = await pool.query<Row[]>(
    "SELECT Request_Id FROM maintenance_tbl WHERE Request_Id = ?",
    [requestId]
  );
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const [result] = await pool.query<any>(
    `INSERT INTO maintenance_remarks_tbl (Request_Id, Remark_text, Created_by, User_role, Event_Id, Created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [requestId, trimmed, createdBy, userRole ?? null, eventId ?? null]
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
    WHERE mr.Remark_Id = ?
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
    WHERE mr.Request_Id = ?
  `;
  const params: any[] = [requestId];

  // ✅ NEW: cutoff (used for Operator Cancelled-history view)
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

  // role check
  const [acctRows] = await pool.query<any[]>(
    "SELECT Roles FROM accounts_tbl WHERE Account_id = ?",
    [actorAccountId]
  );
  if (!acctRows.length) throw { status: 404, message: "Account not found" };

  const role = acctRows[0].Roles;
  if (role !== ROLE_STAFF && role !== ROLE_ADMIN) {
    throw { status: 403, message: "Only Barangay Staff or Admin can delete tickets" };
  }

  // load ticket + status (+ IsDeleted)
  const [ticketRows] = await pool.query<any[]>(
    "SELECT Request_Id, Main_stat_id, IsDeleted FROM maintenance_tbl WHERE Request_Id = ?",
    [requestId]
  );
  if (!ticketRows.length) throw { status: 404, message: "Ticket not found" };

  // idempotent
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

  // ✅ SOFT DELETE + audit fields
  await pool.query(
    `UPDATE maintenance_tbl
     SET IsDeleted = 1,
         Deleted_by = ?,
         Deleted_at = NOW(),
         Deleted_reason = ?
     WHERE Request_Id = ?`,
    [actorAccountId, trimmedReason, requestId]
  );

  // ✅ Log DELETED event
  await logEvent(requestId, 'DELETED', actorAccountId, trimmedReason);

  return { deleted: true };
}

async function findLatestOpenCancelLogId(requestId: number, operatorId: number): Promise<number | null> {
  const [rows] = await pool.query<Row[]>(
    `SELECT Cancel_Log_Id
     FROM maintenance_cancel_log_tbl
     WHERE Request_Id = ? AND Operator_Account_Id = ? AND Approved_At IS NULL
     ORDER BY Requested_At DESC
     LIMIT 1`,
    [requestId, operatorId]
  );
  return rows.length ? rows[0].Cancel_Log_Id : null;
}

async function insertCancelLog(requestId: number, operatorId: number, reason: string | null) {
  await pool.query(
    `INSERT INTO maintenance_cancel_log_tbl (Request_Id, Operator_Account_Id, Reason, Requested_At)
     VALUES (?, ?, ?, NOW())`,
    [requestId, operatorId, reason]
  );
}

async function approveCancelLog(cancelLogId: number, approvedBy: number) {
  await pool.query(
    `UPDATE maintenance_cancel_log_tbl
     SET Approved_By = ?, Approved_At = NOW()
     WHERE Cancel_Log_Id = ?`,
    [approvedBy, cancelLogId]
  );
}

/**
 * ✅ NEW: Operator Cancelled tab feed (history-based)
 * Rules:
 * - show only approved cancellations
 * - hide if ticket is currently assigned back to the same operator (so it goes to Pending)
 * - de-dupe: return only latest approved log per ticket
 */
export async function listOperatorCancelledHistory(operatorAccountId: number): Promise<any[]> {
  const sql = `
    SELECT
      m.*,
      p.Priority,
      s.Status,
      CONCAT(op_profile.FirstName, ' ', op_profile.LastName) AS AssignedOperatorName,
      CONCAT(creator_profile.FirstName, ' ', creator_profile.LastName) AS CreatedByName,
      creator_account.Roles AS CreatorRole,

      l.Cancel_Log_Id AS CancelLogId,
      l.Reason AS CancelLogReason,
      l.Requested_At AS CancelRequestedAt,   -- ✅ NEW: cutoff we want
      l.Approved_At AS CancelApprovedAt

    FROM maintenance_cancel_log_tbl l
    JOIN (
      SELECT Request_Id, MAX(Cancel_Log_Id) AS LatestCancelLogId
      FROM maintenance_cancel_log_tbl
      WHERE Operator_Account_Id = ?
        AND Approved_At IS NOT NULL
      GROUP BY Request_Id
    ) latest ON latest.LatestCancelLogId = l.Cancel_Log_Id
    JOIN maintenance_tbl m ON l.Request_Id = m.Request_Id
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_Id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id
    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id
    LEFT JOIN profile_tbl creator_profile ON m.Created_by = creator_profile.Account_id
    LEFT JOIN accounts_tbl creator_account ON m.Created_by = creator_account.Account_id
    WHERE l.Operator_Account_Id = ?
      AND (m.Assigned_to IS NULL OR m.Assigned_to <> ?)
    ORDER BY l.Approved_At DESC
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
      COUNT(ma.Attachment_Id) AS AttachmentCount
    FROM maintenance_tbl m
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_Id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id
    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id
    LEFT JOIN profile_tbl creator_profile ON m.Created_by = creator_profile.Account_id
    LEFT JOIN accounts_tbl creator_account ON m.Created_by = creator_account.Account_id
    LEFT JOIN maintenance_attachments_tbl ma ON m.Request_Id = ma.Request_Id
    WHERE m.IsDeleted = 1
    GROUP BY m.Request_Id
    ORDER BY m.Request_date DESC
  `;
  const [rows] = await pool.query<Row[]>(sql);
  return rows;
}

// ✅ NEW: Event logging functions
async function logEvent(
  requestId: number,
  eventType: string,
  actorAccountId: number | null,
  notes: string | null = null
): Promise<number> {
  const [result] = await pool.query<any>(
    `INSERT INTO maintenance_events_tbl (Request_Id, Event_type, Actor_Account_Id, Notes, Created_At)
     VALUES (?, ?, ?, ?, NOW())`,
    [requestId, eventType, actorAccountId, notes]
  );
  return result?.insertId ?? 0;
}

export async function getTicketEvents(requestId: number): Promise<any[]> {
  const sql = `
    SELECT 
      e.*,
      CONCAT(p.FirstName, ' ', p.LastName) AS ActorName,
      a.Roles AS ActorRoleId,
      ur.Roles AS ActorRoleName
    FROM maintenance_events_tbl e
    LEFT JOIN profile_tbl p ON e.Actor_Account_Id = p.Account_id
    LEFT JOIN accounts_tbl a ON e.Actor_Account_Id = a.Account_id
    LEFT JOIN user_roles_tbl ur ON a.Roles = ur.Roles_id
    WHERE e.Request_Id = ?
    ORDER BY e.Created_At ASC
  `;
  const [rows] = await pool.query<Row[]>(sql, [requestId]);

  // ✅ Enrich REASSIGNED events with "to" operator (Name + Role)
  const toIds = new Set<number>();
  const parsedByEventId = new Map<number, { toAccountId: number | null; message: string | null }>();

  for (const ev of rows) {
    if (ev.Event_type !== "REASSIGNED") continue;
    const parsed = extractToAccountIdFromNotes(ev.Notes ?? null);
    parsedByEventId.set(ev.Event_Id, parsed);
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

    const parsed = parsedByEventId.get(ev.Event_Id) ?? { toAccountId: null, message: ev.Notes ?? null };
    const to = parsed.toAccountId ? toMap.get(parsed.toAccountId) : null;

    return {
      ...ev,
      Notes: parsed.message, // keep readable message in output
      ToActorAccountId: parsed.toAccountId,
      ToActorName: to?.name ?? null,
      ToActorRoleName: to?.roleName ?? null,
    };
  });
}

export async function getEventDetails(eventId: number): Promise<any> {
  // Get event with actor details
  const [eventRows] = await pool.query<Row[]>(
    `SELECT 
      e.*,
      CONCAT(p.FirstName, ' ', p.LastName) AS ActorName,
      a.Roles AS ActorRoleId,
      ur.Roles AS ActorRoleName
    FROM maintenance_events_tbl e
    LEFT JOIN profile_tbl p ON e.Actor_Account_Id = p.Account_id
    LEFT JOIN accounts_tbl a ON e.Actor_Account_Id = a.Account_id
    LEFT JOIN user_roles_tbl ur ON a.Roles = ur.Roles_id
    WHERE e.Event_Id = ?`,
    [eventId]
  );
  
  if (!eventRows.length) return null;

  const event = eventRows[0];

  // Get remarks for this event
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
    WHERE mr.Event_Id = ?
    ORDER BY mr.Created_at ASC`,
    [eventId]
  );

  // Get attachments for this event
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
    WHERE ma.Event_Id = ?
    ORDER BY ma.Uploaded_at ASC`,
    [eventId]
  );

  return {
    ...event,
    Remarks: remarks,
    Attachments: attachments
  };
}