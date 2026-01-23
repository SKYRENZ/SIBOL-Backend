import { Request, Response } from "express";
import * as wasteContainerService from "../services/wasteContainerService";

/**
 * Create a new waste container.
 * Expects body: { container_name, area_name, fullAddress, deployment_date? }
 * - Geocodes the fullAddress
 * - Reuses existing area (by name + address) or creates it (with lat/lon)
 * - Inserts into waste_containers_tbl (links to area_tbl)
 */
export async function createContainer(req: Request, res: Response) {
  const { container_name, area_name, fullAddress, latitude, longitude } = req.body;

  console.log("Creating container with:", { container_name, area_name, fullAddress });

  if (!container_name || !area_name || !fullAddress) {
    return res.status(400).json({ error: "container_name, area_name and fullAddress are required." });
  }

  try {
    const created = await wasteContainerService.createContainer({
      container_name,
      area_name,
      fullAddress,
      latitude,
      longitude,
    });

    return res.status(201).json({ data: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create waste container.";
    return res.status(500).json({ error: message });
  }
}

/**
 * List all containers joined with area info.
 * Uses existing waste_containers_tbl schema.
 */
export async function listContainers(_req: Request, res: Response) {
  try {
    const rows = await wasteContainerService.listContainers();
    return res.json({ data: rows });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({ error: "Failed to fetch containers." });
  }
}