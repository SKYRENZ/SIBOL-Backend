import { Request, Response } from "express";
import * as operatorService from "../services/operatorService";

export async function list(_req: Request, res: Response) {
  try {
    const rows = await operatorService.listOperators();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch operators" });
  }
}