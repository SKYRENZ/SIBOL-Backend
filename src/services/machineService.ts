import { pool } from '../config/db.js';
import { Router } from 'express';
import type { Request, Response } from "express";

const router = Router();

// CREATE - Add new machine
router.post("/machines", async (req: Request, res: Response) => {
  const { areaId, status } = req.body;

  // Validation
  if (!areaId) {
    return res.status(400).json({ message: "Area ID is required" });
  }

  try {
    // Generate automated machine name with current date
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const machineName = `SIBOL_MACHINE_${currentDate}`;

    // Optional: Add time for uniqueness if multiple machines per day
    // const currentDateTime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0]; // YYYYMMDDTHHMMSS
    // const machineName = `SIBOL_MACHINE_${currentDateTime}`;

    const [result]: any = await pool.execute(
      "INSERT INTO Machine_tbl (Name, Area_id, Status) VALUES (?, ?, ?)",
      [machineName, areaId, status || null]
    );

    res.status(201).json({
      message: "Machine created successfully",
      machineId: result.insertId,
      machine: { 
        name: machineName, 
        areaId, 
        status,
        createdDate: currentDate
      }
    });
  } catch (error) {
    console.error("❌ Create machine error:", error);
    res.status(500).json({ message: "Failed to create machine" });
  }
});

// READ - Get all machines
router.get("/machines", async (req: Request, res: Response) => {
  try {
    const [machines] = await pool.execute(`
      SELECT 
        m.Machine_id,
        m.Name,
        m.Area_id,
        a.Area_name,
        m.Status as status_id,
        ms.Status as status_name
      FROM Machine_tbl m
      LEFT JOIN Area_tbl a ON m.Area_id = a.Area_id
      LEFT JOIN Machine_status_tbl ms ON m.Status = ms.Mach_status_id
      ORDER BY m.Machine_id
    `);

    res.json({
      message: "Machines fetched successfully",
      data: machines
    });
  } catch (error) {
    console.error("❌ Fetch machines error:", error);
    res.status(500).json({ message: "Failed to fetch machines" });
  }
});

// READ - Get single machine by ID
router.get("/machines/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [machines]: any = await pool.execute(`
      SELECT 
        m.Machine_id,
        m.Name,
        m.Area_id,
        a.Area_name,
        m.Status as status_id,
        ms.Status as status_name
      FROM Machine_tbl m
      LEFT JOIN Area_tbl a ON m.Area_id = a.Area_id
      LEFT JOIN Machine_status_tbl ms ON m.Status = ms.Mach_status_id
      WHERE m.Machine_id = ?
    `, [id]);

    if (machines.length === 0) {
      return res.status(404).json({ message: "Machine not found" });
    }

    res.json({
      message: "Machine fetched successfully",
      data: machines[0]
    });
  } catch (error) {
    console.error("❌ Fetch machine error:", error);
    res.status(500).json({ message: "Failed to fetch machine" });
  }
});

// UPDATE - Update machine
router.put("/machines/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, areaId, status } = req.body;

  // Validation
  if (!name || !areaId) {
    return res.status(400).json({ message: "Name and Area ID are required" });
  }

  try {
    const [result]: any = await pool.execute(
      "UPDATE Machine_tbl SET Name = ?, Area_id = ?, Status = ? WHERE Machine_id = ?",
      [name, areaId, status || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Machine not found" });
    }

    res.json({
      message: "Machine updated successfully",
      machineId: id,
      machine: { name, areaId, status }
    });
  } catch (error) {
    console.error("❌ Update machine error:", error);
    res.status(500).json({ message: "Failed to update machine" });
  }
});

// DELETE - Delete machine
router.delete("/machines/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [result]: any = await pool.execute(
      "DELETE FROM Machine_tbl WHERE Machine_id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Machine not found" });
    }

    res.json({
      message: "Machine deleted successfully",
      machineId: id
    });
  } catch (error) {
    console.error("❌ Delete machine error:", error);
    res.status(500).json({ message: "Failed to delete machine" });
  }
});

// BONUS - Get all machine statuses
router.get("/machine-statuses", async (req: Request, res: Response) => {
  try {
    const [statuses] = await pool.execute(
      "SELECT Mach_status_id, Status FROM Machine_status_tbl ORDER BY Mach_status_id"
    );

    res.json({
      message: "Machine statuses fetched successfully",
      data: statuses
    });
  } catch (error) {
    console.error("❌ Fetch statuses error:", error);
    res.status(500).json({ message: "Failed to fetch machine statuses" });
  }
});

// BONUS - Get all areas
router.get("/areas", async (req: Request, res: Response) => {
  try {
    const [areas] = await pool.execute(
      "SELECT Area_id, Area_name FROM Area_tbl ORDER BY Area_id"
    );

    res.json({
      message: "Areas fetched successfully",
      data: areas
    });
  } catch (error) {
    console.error("❌ Fetch areas error:", error);
    res.status(500).json({ message: "Failed to fetch areas" });
  }
});

export default router;