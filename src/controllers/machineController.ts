import type { Request, Response } from "express";
import * as machineService from "../services/machineService";

export async function createMachine(req: Request, res: Response) {
  const { areaId, status } = req.body;
  if (!areaId) return res.status(400).json({ message: "Area ID is required" });

  try {
    const result = await machineService.createMachine(areaId, status);
    return res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create machine";
    return res.status(400).json({ message });
  }
}

export async function getAllMachines(_req: Request, res: Response) {
  try {
    const result = await machineService.getAllMachines();
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch machines";
    return res.status(500).json({ message });
  }
}

export async function getMachineById(req: Request, res: Response) {
  const { id } = req.params;
  if (!id || isNaN(parseInt(id))) return res.status(400).json({ message: "Valid Machine ID is required" });

  try {
    const result = await machineService.getMachineById(parseInt(id));
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch machine";
    const statusCode = error instanceof Error && message.toLowerCase().includes("not found") ? 404 : 500;
    return res.status(statusCode).json({ message });
  }
}

export async function updateMachine(req: Request, res: Response) {
  const { id } = req.params;
  const { name, areaId, status } = req.body;

  if (!id || isNaN(parseInt(id))) return res.status(400).json({ message: "Valid Machine ID is required" });
  if (!name || !areaId) return res.status(400).json({ message: "Name and Area ID are required" });

  try {
    const result = await machineService.updateMachine(parseInt(id), name, areaId, status);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update machine";
    const statusCode = error instanceof Error && message.toLowerCase().includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ message });
  }
}

export async function deleteMachine(_req: Request, res: Response) {
  // service.deleteMachine is commented out in service file; keep delete route unimplemented for now.
  return res.status(501).json({ message: "Delete machine not implemented in service" });
}

export async function getMachineStatuses(_req: Request, res: Response) {
  try {
    const result = await machineService.getMachineStatuses();
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch statuses";
    return res.status(500).json({ message });
  }
}

export async function getAreas(_req: Request, res: Response) {
  try {
    const result = await machineService.getAreas();
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch areas";
    return res.status(500).json({ message });
  }
}