import { Request, Response } from "express";
import pool from "../config/db";

export async function list(req: Request, res: Response) {
  try {
    const [rows] = await pool.query<any[]>(
      "SELECT Account_id, Username FROM accounts_tbl WHERE Roles = 3"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch operators" });
  }
}