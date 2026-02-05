import db from "../config/db";
import { RowDataPacket } from "mysql2/promise";

export type RRLRow = {
  id: number;
  ai_role_id: number; // NEW: 1 = digester, 2 = water/feed calc
  ph: number | null;
  temperature_c: number | null;
  pressure_psi: number | null;
  hrt_days: number | null;
  digester_volume_l: number | null;
  working_volume_percent: number | null;
  ts_percent: number | null;
  vs_percent: number | null;
  olr: number | null;
  notes: string | null;
};

// Fetch RRL data by AI role
export async function getRRLData(ai_role_id: number): Promise<RRLRow[]> {
  try {
    const [rows] = await db.query<(RRLRow & RowDataPacket)[]>(
      "SELECT * FROM rrl_reference_data WHERE ai_role_id = ?",
      [ai_role_id]
    );
    return rows;
  } catch (err) {
    console.error("Error fetching RRL data:", err);
    return [];
  }
}
