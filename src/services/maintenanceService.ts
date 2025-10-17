import pool from "../config/db";
import type { MaintenanceTicket } from "../models/types";

type Row = any;

const ROLE_OPERATOR = 3;
const ROLE_STAFF = 2;

async function getStatusIdByName(name: string) {
  const [rows] = await pool.query<Row[]>("SELECT Main_stat_id FROM maintenance_status_tbl WHERE Status = ?", [name]);
  return rows.length ? rows[0].Main_stat_id : null;
}

async function getPriorityIdByName(name: string) {
  const [rows] = await pool.query<Row[]>("SELECT Priority_id FROM maintenance_priority_tbl WHERE Priority = ?", [name]);
  return rows.length ? rows[0].Priority_id : null;
}

export async function createTicket(data: {
  title: string;
  details?: string;
  priority?: string;           // 'Critical' | 'Urgent' | 'Mild' or priority id
  created_by: number;         // account id of creator (operator)
  due_date?: string | null;
  attachment?: string | null;
}): Promise<MaintenanceTicket> {
  // ensure creator is Operator
  const [acctRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [data.created_by]);
  if (!acctRows.length) throw { status: 404, message: "Creator account not found" };
  if (acctRows[0].Roles !== ROLE_OPERATOR) throw { status: 403, message: "Only Operator can create maintenance requests" };

  // resolve priority id
  let priorityId: number | null = null;
  if (data.priority) {
    if (typeof data.priority === "string") {
      priorityId = await getPriorityIdByName(data.priority);
      if (!priorityId) throw { status: 400, message: "Invalid priority" };
    } else {
      priorityId = data.priority as unknown as number;
    }
  }

  const requestedStatusId = await getStatusIdByName("Requested");

  const sql = `INSERT INTO maintenance_tbl 
    (Title, Details, Priority_Id, Created_by, Due_date, Attachment, Main_stat_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const params = [data.title, data.details || null, priorityId, data.created_by, data.due_date || null, data.attachment || null, requestedStatusId];
  const [result] = await pool.query(sql, params);
  const insertId = (result as any).insertId;
  const [rows] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [insertId]);
  return rows[0];
}

export async function acceptAndAssign(requestId: number, staffAccountId: number, assignToAccountId: number | null): Promise<MaintenanceTicket> {
  // Only Barangay_staff (role 2) can accept and assign
  const [staffRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [staffAccountId]);
  if (!staffRows.length) throw { status: 404, message: "Staff account not found" };
  if (staffRows[0].Roles !== ROLE_STAFF) throw { status: 403, message: "Only Barangay_staff can accept/assign" };

  // If assignTo provided, ensure it's an Operator
  if (assignToAccountId) {
    const [opRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [assignToAccountId]);
    if (!opRows.length) throw { status: 404, message: "Assigned operator not found" };
    if (opRows[0].Roles !== ROLE_OPERATOR) throw { status: 403, message: "Assigned user must be an Operator" };
  }

  // set status to Pending or On-going. We'll set to "On-going" if assigned, otherwise "Pending"
  const statusName = assignToAccountId ? "On-going" : "Pending";
  const statusId = await getStatusIdByName(statusName);
  if (!statusId) throw { status: 500, message: "Status not configured" };

  await pool.query("UPDATE maintenance_tbl SET Main_stat_id = ?, Assigned_to = ? WHERE Request_Id = ?", [statusId, assignToAccountId, requestId]);
  const [rows] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  return rows[0];
}

export async function markOnGoingByOperator(requestId: number, operatorAccountId: number): Promise<MaintenanceTicket> {
  // ensure operator is assigned to this ticket
  const [rows] = await pool.query<Row[]>("SELECT Assigned_to FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  if (!rows.length) throw { status: 404, message: "Request not found" };
  const assigned = rows[0].Assigned_to;
  if (assigned !== operatorAccountId) throw { status: 403, message: "Only the assigned Operator can update this ticket" };

  const statusId = await getStatusIdByName("On-going");
  await pool.query("UPDATE maintenance_tbl SET Main_stat_id = ? WHERE Request_Id = ?", [statusId, requestId]);
  const [updated] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  return updated[0];
}

export async function operatorMarkForVerification(requestId: number, operatorAccountId: number): Promise<MaintenanceTicket> {
  // ensure operator is assigned
  const [rows] = await pool.query<Row[]>("SELECT Assigned_to FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  if (!rows.length) throw { status: 404, message: "Request not found" };
  const assigned = rows[0].Assigned_to;
  if (assigned !== operatorAccountId) throw { status: 403, message: "Only the assigned Operator can set verification" };

  const statusId = await getStatusIdByName("For Verification");
  await pool.query("UPDATE maintenance_tbl SET Main_stat_id = ? WHERE Request_Id = ?", [statusId, requestId]);
  const [updated] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  return updated[0];
}

export async function staffVerifyCompletion(requestId: number, staffAccountId: number): Promise<MaintenanceTicket> {
  // only staff can finalize to Completed
  const [staffRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [staffAccountId]);
  if (!staffRows.length) throw { status: 404, message: "Staff account not found" };
  if (staffRows[0].Roles !== ROLE_STAFF) throw { status: 403, message: "Only Barangay_staff can verify completion" };

  const statusId = await getStatusIdByName("Completed");
  await pool.query("UPDATE maintenance_tbl SET Main_stat_id = ? WHERE Request_Id = ?", [statusId, requestId]);
  const [updated] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  return updated[0];
}

export async function cancelTicket(requestId: number, actorAccountId: number): Promise<MaintenanceTicket> {
  // allow either creator (operator) or staff to cancel
  const [rows] = await pool.query<Row[]>("SELECT Created_by FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  if (!rows.length) throw { status: 404, message: "Request not found" };
  const creator = rows[0].Created_by;

  const [acctRows] = await pool.query<Row[]>("SELECT Roles FROM accounts_tbl WHERE Account_id = ?", [actorAccountId]);
  if (!acctRows.length) throw { status: 404, message: "Account not found" };
  const role = acctRows[0].Roles;
  if (actorAccountId !== creator && role !== ROLE_STAFF) throw { status: 403, message: "Only creator or Barangay_staff can cancel" };

  const statusId = await getStatusIdByName("Cancelled");
  await pool.query("UPDATE maintenance_tbl SET Main_stat_id = ? WHERE Request_Id = ?", [statusId, requestId]);
  const [updated] = await pool.query<Row[]>("SELECT * FROM maintenance_tbl WHERE Request_Id = ?", [requestId]);
  return updated[0];
}

export async function getTicketById(requestId: number): Promise<MaintenanceTicket> {
  const [rows] = await pool.query<Row[]>("SELECT m.*, s.Status as StatusName, p.Priority as PriorityName FROM maintenance_tbl m LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id LEFT JOIN maintenance_priority_tbl p ON m.Priority_Id = p.Priority_id WHERE Request_Id = ?", [requestId]);
  if (!rows.length) throw { status: 404, message: "Request not found" };
  return rows[0];
}

export async function listTickets(filters: { status?: string | undefined; assigned_to?: number | undefined; created_by?: number | undefined } = {}): Promise<MaintenanceTicket[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  if (filters.status) { conditions.push("s.Status = ?"); params.push(filters.status); }
  if (filters.assigned_to) { conditions.push("m.Assigned_to = ?"); params.push(filters.assigned_to); }
  if (filters.created_by) { conditions.push("m.Created_by = ?"); params.push(filters.created_by); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const sql = `SELECT m.*, s.Status as StatusName, p.Priority as PriorityName FROM maintenance_tbl m LEFT JOIN maintenance_status_tbl s ON m.Main_stat_id = s.Main_stat_id LEFT JOIN maintenance_priority_tbl p ON m.Priority_Id = p.Priority_id ${where} ORDER BY m.Request_date DESC`;
  const [rows] = await pool.query<Row[]>(sql, params);
  return rows;
}