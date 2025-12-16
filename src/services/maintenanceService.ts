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
  filesize?: number
): Promise<any> {
  const [ticket] = await pool.query<Row[]>(
    "SELECT Request_Id FROM maintenance_tbl WHERE Request_Id = ?", 
    [requestId]
  );
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const sql = `INSERT INTO maintenance_attachments_tbl 
    (Request_Id, Uploaded_by, File_path, File_name, File_type, File_size) 
    VALUES (?, ?, ?, ?, ?, ?)`;
  
  const [result] = await pool.query(sql, [
    requestId, 
    uploadedBy, 
    filepath, 
    filename,
    filetype || null,
    filesize || null
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

export async function cancelTicket(requestId: number, actorAccountId: number): Promise<any> {
  const [acctRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [actorAccountId]);
  if (!acctRows.length) throw { status: 404, message: "Account not found" };

  const [ticket] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  if (!ticket.length) throw { status: 404, message: "Ticket not found" };

  const role = acctRows[0].Roles;
  const isCreator = ticket[0].Created_by === actorAccountId;
  const canCancel = isCreator || role === ROLE_STAFF || role === ROLE_ADMIN;

  if (!canCancel) {
    throw { status: 403, message: "Only creator, staff, or admin can cancel tickets" };
  }

  const cancelledStatusId = await getStatusIdByName("Cancelled");
  await pool.query("UPDATE maintenance_tbl SET Main_stat_id = ? WHERE Request_Id = ?", [cancelledStatusId, requestId]);

  const [updated] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  return updated[0];
}

export async function getTicketById(requestId: number): Promise<any> {
  const sql = `
    SELECT 
      m.*, 
      p.Priority, 
      s.Status,
      CONCAT(op_profile.FirstName, ' ', op_profile.LastName) AS AssignedOperatorName
    FROM maintenance_tbl m
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_Id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id
    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id
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
      COUNT(ma.Attachment_Id) AS AttachmentCount
    FROM maintenance_tbl m
    LEFT JOIN maintenance_priority_tbl p ON m.Priority_Id = p.Priority_id
    LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id
    LEFT JOIN profile_tbl op_profile ON m.Assigned_to = op_profile.Account_id
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