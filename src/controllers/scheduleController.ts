import { Request, Response } from "express";
import {
  createSchedule,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
  listSchedules,
} from "../services/scheduleService";

// Create
export async function create(req: Request, res: Response) {
  try {
    const result = await createSchedule(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to create schedule" });
  }
}

// Fetch by ID
export async function getById(req: Request, res: Response) {
  try {
    const result = await getScheduleById(Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch schedule" });
  }
}

// Edit
export async function update(req: Request, res: Response) {
  try {
    const result = await updateSchedule(Number(req.params.id), req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to update schedule" });
  }
}

// Delete
export async function remove(req: Request, res: Response) {
  try {
    await deleteSchedule(Number(req.params.id));
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete schedule" });
  }
}

// List all
export async function list(req: Request, res: Response) {
  try {
    const result = await listSchedules();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to list schedules" });
  }
}