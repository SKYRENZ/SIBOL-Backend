import pool from "../config/db";
import type { Schedule } from "../models/types";

async function getCollectorUsername(accountId: number): Promise<string | null> {
  const [rows] = await pool.query<any[]>(
    "SELECT Username FROM accounts_tbl WHERE Account_id = ?",
    [accountId]
  );
  return rows[0]?.Username ?? null;
}

export async function createSchedule(data: Schedule): Promise<Schedule> {
  const collector = (await getCollectorUsername(data.Account_id)) ?? "";
  const [result]: any = await pool.query(
    `INSERT INTO schedule_tbl (Account_id, Collector, Contact, Area, sched_stat_id, Date_of_collection)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.Account_id,
      collector,
      data.Contact,
      data.Area,
      data.sched_stat_id,
      data.Date_of_collection,
    ]
  );
  return {
    Schedule_id: result.insertId,
    ...data,
    Collector: collector,
  };
}

export async function getScheduleById(id: number): Promise<Schedule | null> {
  const [rows] = await pool.query<any[]>(
    "SELECT * FROM schedule_tbl WHERE Schedule_id = ?",
    [id]
  );
  return rows[0] ?? null;
}

export async function updateSchedule(
  id: number,
  data: Schedule
): Promise<Schedule | null> {
  const collector = (await getCollectorUsername(data.Account_id)) ?? "";
  await pool.query(
    `UPDATE schedule_tbl SET Account_id=?, Collector=?, Contact=?, Area=?, sched_stat_id=?, Date_of_collection=?
     WHERE Schedule_id=?`,
    [
      data.Account_id,
      collector,
      data.Contact,
      data.Area,
      data.sched_stat_id,
      data.Date_of_collection,
      id,
    ]
  );
  return getScheduleById(id);
}

export async function deleteSchedule(id: number): Promise<{ deleted: boolean }> {
  await pool.query("DELETE FROM schedule_tbl WHERE Schedule_id = ?", [id]);
  return { deleted: true };
}

export async function listSchedules(): Promise<Schedule[]> {
  const [rows] = await pool.query<any[]>("SELECT * FROM schedule_tbl");
  return rows;
}