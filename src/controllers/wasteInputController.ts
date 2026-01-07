import type { Request, Response } from "express";
import * as wasteInputService from "../services/wasteInputService";

export async function createWasteInput(req: Request, res: Response) {
  const { machineId, weight, accountId } = req.body;

  if (!machineId || !weight) {
    return res.status(400).json({ message: "Machine ID and weight are required" });
  }

  try {
    const result = await wasteInputService.createWasteInput(machineId, weight, accountId);
    return res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record waste input";
    const statusCode = message.toLowerCase().includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ message });
  }
}

export async function getAllWasteInputs(_req: Request, res: Response) {
  try {
    const result = await wasteInputService.getAllWasteInputs();
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch waste inputs";
    return res.status(500).json({ message });
  }
}

export async function getWasteInputsByMachineId(req: Request, res: Response) {
  const { machineId } = req.params;

  if (!machineId || isNaN(parseInt(machineId))) {
    return res.status(400).json({ message: "Valid Machine ID is required" });
  }

  try {
    const result = await wasteInputService.getWasteInputsByMachineId(parseInt(machineId));
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch waste inputs";
    return res.status(500).json({ message });
  }
}

export async function getWasteInputsByAccountId(req: Request, res: Response) {
  const { accountId } = req.params;

  if (!accountId || isNaN(parseInt(accountId))) {
    return res.status(400).json({ message: "Valid Account ID is required" });
  }

  try {
    const result = await wasteInputService.getWasteInputsByAccountId(parseInt(accountId));
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch waste inputs";
    return res.status(500).json({ message });
  }
}

export async function getWasteInputById(req: Request, res: Response) {
  const { id } = req.params;

  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ message: "Valid Input ID is required" });
  }

  try {
    const result = await wasteInputService.getWasteInputById(parseInt(id));
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch waste input";
    const statusCode = message.toLowerCase().includes("not found") ? 404 : 500;
    return res.status(statusCode).json({ message });
  }
}

export async function getWasteInputsByDateRange(req: Request, res: Response) {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required" });
  }

  try {
    const result = await wasteInputService.getWasteInputsByDateRange(
      startDate as string,
      endDate as string
    );
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch waste inputs";
    return res.status(500).json({ message });
  }
}