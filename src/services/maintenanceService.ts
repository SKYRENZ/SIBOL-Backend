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
  publicId?: string | null // ✅ add
): Promise<any> {
  const [ticket] = await pool.query<Row[]>(
    "SELECT Request_Id FROM maintenance_tbl WHERE Request_Id = ?",
    [requestId]
  );
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const sql = `INSERT INTO maintenance_attachments_tbl 
    (Request_Id, Uploaded_by, File_path, File_name, File_type, File_size, Public_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`;

  const [result] = await pool.query(sql, [
    requestId,
    uploadedBy,
    filepath,
    filename,
    filetype || null,
    filesize || null,
    publicId || null, // ✅ add
  ]);
  const insertId = (result as any).insertId;

  const [attachment] = await pool.query<Row[]>(
    "SELECT * FROM maintenance_attachments_tbl WHERE Attachment_Id = ?",
    [insertId]
  );
  return attachment[0];
}

export async function getTicketAttachments(requestId: number): Promise<any[]> {
  const sql = `
    SELECT 
      ma.*,
      CONCAT(p.FirstName, ' ', p.LastName) AS UploaderName,
      a.Roles AS UploaderRole
    FROM maintenance_attachments_tbl ma
    LEFT JOIN profile_tbl p ON ma.Uploaded_by = p.Account_id
    LEFT JOIN accounts_tbl a ON ma.Uploaded_by = a.Account_id
    WHERE ma.Request_Id = ?
    ORDER BY ma.Uploaded_at ASC
  `;
  
  const [rows] = await pool.query<Row[]>(sql, [requestId]);
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

  const [ticket] = await pool.query<Row[]>(
    "SELECT * FROM maintenance_tbl WHERE Request_Id = ?", 
    [insertId]
  );
  return ticket[0];
}

export async function acceptAndAssign(requestId: number, staffAccountId: number, assignToAccountId: number | null): Promise<any> {
  // Verify staff/admin role
  const [acctRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [staffAccountId]);
  if (!acctRows.length) throw { status: 404, message: "Staff account not found" };
  
  const role = acctRows[0].Roles;
  if (role !== ROLE_STAFF && role !== ROLE_ADMIN) {
    throw { status: 403, message: "Only Barangay Staff or Admin can accept tickets" };
  }

  // Verify ticket exists and is in Requested status
  const [ticket] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const onGoingStatusId = await getStatusIdByName("On-going");

  await pool.query("UPDATE maintenance_tbl SET Main_stat_id = ?, Assigned_to = ? WHERE Request_Id = ?", [onGoingStatusId, assignToAccountId, requestId]);

  const [updated] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
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
  await pool.query("UPDATE maintenance_tbl SET Main_stat_id = ? WHERE Request_Id = ?", [forVerificationStatusId, requestId]);

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

  // Already cancelled?
  if (ticket.Main_stat_id === cancelledStatusId) {
    throw { status: 400, message: "Ticket is already cancelled" };
  }

  // ✅ Operator: must provide reason, set status = Cancel Requested (not Cancelled)
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

    const [updated] = await pool.query<Row[]>(
      "SELECT * FROM maintenance_tbl WHERE Request_Id = ?",
      [requestId]
    );
    return updated[0];
  }

  // ✅ Staff/Admin: cancel immediately, status = Cancelled (reason optional)
  if (role !== ROLE_STAFF && role !== ROLE_ADMIN) {
    throw { status: 403, message: "Only staff/admin can cancel tickets" };
  }

  const trimmedReason = (reason ?? "").trim();

  await pool.query(
    `UPDATE maintenance_tbl
     SET Main_stat_id = ?,
         Cancelled_by = ?,
         Cancelled_at = NOW(),
         Cancel_reason = CASE WHEN ? <> '' THEN ? ELSE Cancel_reason END
     WHERE Request_Id = ?`,
    [cancelledStatusId, actorAccountId, trimmedReason, trimmedReason, requestId]
  );

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
      creator_account.Roles AS CreatorRole
    FROM maintenance_tbl m
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_Id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id
    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id
    LEFT JOIN profile_tbl creator_profile ON m.Created_by = creator_profile.Account_id
    LEFT JOIN accounts_tbl creator_account ON m.Created_by = creator_account.Account_id
    WHERE m.Request_Id = ?
  `;
  const [ticket] = await pool.query<Row[]>(sql, [requestId]);
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };
  
  // Get attachments
  const attachments = await getTicketAttachments(requestId);
  
  return {
    ...ticket[0],
    Attachments: attachments
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
      COUNT(ma.Attachment_Id) AS AttachmentCount
    FROM maintenance_tbl m
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_Id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id
    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id
    LEFT JOIN profile_tbl creator_profile ON m.Created_by = creator_profile.Account_id
    LEFT JOIN accounts_tbl creator_account ON m.Created_by = creator_account.Account_id
    LEFT JOIN maintenance_attachments_tbl ma ON m.Request_Id = ma.Request_Id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters.status) {
    const statusNames = filters.status.split(',');
    const statusIds = await Promise.all(statusNames.map(name => getStatusIdByName(name.trim())));
    const validStatusIds = statusIds.filter(id => id !== null);

    if (validStatusIds.length > 0) {
      sql += ` AND m.Main_stat_id IN (?)`;
      params.push(validStatusIds);
    }
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
  userRole: string
): Promise<any> {
  const [ticket] = await pool.query<Row[]>(
    "SELECT Request_Id FROM maintenance_tbl WHERE Request_Id = ?", 
    [requestId]
  );
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const sql = `INSERT INTO maintenance_remarks_tbl 
    (Request_Id, Remark_text, Created_by, User_role) 
    VALUES (?, ?, ?, ?)`;
  
  const [result] = await pool.query(sql, [requestId, remarkText, createdBy, userRole]);
  const insertId = (result as any).insertId;

  const [remark] = await pool.query<Row[]>(
    "SELECT * FROM maintenance_remarks_tbl WHERE Remark_Id = ?", 
    [insertId]
  );
  return remark[0];
}

export async function getTicketRemarks(requestId: number): Promise<any[]> {
  const sql = `
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
    ORDER BY mr.Created_at ASC
  `;
  
  const [rows] = await pool.query<Row[]>(sql, [requestId]);
  return rows;
}

export async function deleteTicket(
  requestId: number,
  actorAccountId: number
): Promise<{ deleted: boolean }> {
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

  // load ticket + status
  const [ticketRows] = await pool.query<any[]>(
    "SELECT Request_Id, Main_stat_id FROM maintenance_tbl WHERE Request_Id = ?",
    [requestId]
  );
  if (!ticketRows.length) throw { status: 404, message: "Ticket not found" };

  const requestedStatusId = await getStatusIdByName("Requested");
  if (!requestedStatusId) throw { status: 500, message: "Requested status not configured" };

  const cancelRequestedStatusId = await getStatusIdByName("Cancel Requested");
  if (!cancelRequestedStatusId) throw { status: 500, message: "Cancel Requested status not configured" };

  const mainStatId = ticketRows[0].Main_stat_id;
  const canDelete = mainStatId === requestedStatusId || mainStatId === cancelRequestedStatusId;

  if (!canDelete) {
    throw {
      status: 400,
      message: "Only Requested or Cancel Requested tickets can be deleted",
    };
  }

  // transaction: delete children first
  const conn = await (pool as any).getConnection();
  try {
    await conn.beginTransaction();

    await conn.query("DELETE FROM maintenance_attachments_tbl WHERE Request_Id = ?", [requestId]);
    await conn.query("DELETE FROM maintenance_remarks_tbl WHERE Request_Id = ?", [requestId]);

    const [delRes] = await conn.query("DELETE FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
    const affected = (delRes as any).affectedRows ?? 0;

    await conn.commit();
    return { deleted: affected > 0 };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
      l.Reason AS CancelLogReason,
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