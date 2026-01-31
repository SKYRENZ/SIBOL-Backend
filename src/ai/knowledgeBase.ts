import db from "../config/db";
import { RowDataPacket } from "mysql2/promise";

export type RRLRow = {
  id: number;
  ph: number | null;
  temperature_c: number | null;
  pressure_psi: number | null;
  hrt_days: number | null;
  digester_volume_l: number | null;
  working_volume_percent: number | null;
  ts_percent: number | null;
  vs_percent: number | null;
  olr: number | null;
  status: "normal" | "warning" | "critical";
  explanation: string;
};

export async function getRRLData(): Promise<RRLRow[]> {
  try {
    // Each row is RRLRow & RowDataPacket
    const [rows] = await db.query<(RRLRow & RowDataPacket)[]>(
      "SELECT * FROM rrl_reference_data"
    );

    return rows; // TS now understands this is an array of objects
  } catch (err) {
    console.error("Error fetching RRL data:", err);
    return [];
  }
}
