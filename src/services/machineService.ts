import { pool } from '../config/db';
import { Router } from 'express';
import type { Request, Response } from "express";

const router = Router();

// CREATE - Function to add new machine
export async function createMachine(areaId: number, status?: number) {
  // Validation
  if (!areaId) {
    throw new Error("Area ID is required");
  }

  try {
    // Generate automated machine name with current date
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const machineName = `SIBOL_MACHINE_${currentDate}`;

    const [result]: any = await pool.execute(
      "INSERT INTO Machine_tbl (Name, Area_id, Status) VALUES (?, ?, ?)",
      [machineName, areaId, status || null]
    );

    return {
      success: true,
      message: "Machine created successfully",
      machineId: result.insertId,
      machine: { 
        name: machineName, 
        areaId, 
        status,
        createdDate: currentDate
      }
    };
  } catch (error) {
    console.error("❌ Create machine error:", error);
    throw new Error(`Failed to create machine: ${error}`);
  }
}

// READ - Function to get all machines
export async function getAllMachines() {
  try {
    const [machines] = await pool.execute(`
      SELECT 
        m.Machine_id,
        m.Name,
        m.Area_id,
        a.Area_Name,
        m.Status as status_id,
        ms.Status as status_name
      FROM Machine_tbl m
      LEFT JOIN Area_tbl a ON m.Area_id = a.Area_id
      LEFT JOIN Machine_status_tbl ms ON m.Status = ms.Mach_status_id
      ORDER BY m.Machine_id
    `);

    return {
      success: true,
      message: "Machines fetched successfully",
      data: machines
    };
  } catch (error) {
    console.error("❌ Fetch machines error:", error);
    throw new Error(`Failed to fetch machines: ${error}`);
  }
}

// READ - Function to get single machine by ID
export async function getMachineById(id: number) {
  if (!id || id === undefined || id === null) {
    throw new Error("Machine ID is required");
  }

  try {
    const [machines]: any = await pool.execute(`
      SELECT 
        m.Machine_id,
        m.Name,
        m.Area_id,
        a.Area_Name,
        m.Status as status_id,
        ms.Status as status_name
      FROM Machine_tbl m
      LEFT JOIN Area_tbl a ON m.Area_id = a.Area_id
      LEFT JOIN Machine_status_tbl ms ON m.Status = ms.Mach_status_id
      WHERE m.Machine_id = ?
    `, [id]);

    if (machines.length === 0) {
      throw new Error("Machine not found");
    }

    return {
      success: true,
      message: "Machine fetched successfully",
      data: machines[0]
    };
  } catch (error) {
    console.error("❌ Fetch machine error:", error);
    throw new Error(`Failed to fetch machine: ${error}`);
  }
}

// UPDATE - Function to update machine
export async function updateMachine(id: number, name: string, areaId: number, status?: number) {
  // Validation
  if (!name || !areaId) {
    throw new Error("Name and Area ID are required");
  }

  try {
    const [result]: any = await pool.execute(
      "UPDATE Machine_tbl SET Name = ?, Area_id = ?, Status = ? WHERE Machine_id = ?",
      [name, areaId, status || null, id]
    );

    if (result.affectedRows === 0) {
      throw new Error("Machine not found");
    }

    return {
      success: true,
      message: "Machine updated successfully",
      machineId: id,
      machine: { name, areaId, status }
    };
  } catch (error) {
    console.error("❌ Update machine error:", error);
    throw new Error(`Failed to update machine: ${error}`);
  }
}

// DELETE - Function to delete machine
export async function deleteMachine(id: number) {
  try {
    const [result]: any = await pool.execute(
      "DELETE FROM Machine_tbl WHERE Machine_id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      throw new Error("Machine not found");
    }

    return {
      success: true,
      message: "Machine deleted successfully",
      machineId: id
    };
  } catch (error) {
    console.error("❌ Delete machine error:", error);
    throw new Error(`Failed to delete machine: ${error}`);
  }
}

// Function to get all machine statuses
export async function getMachineStatuses() {
  try {
    const [statuses] = await pool.execute(
      "SELECT Mach_status_id, Status FROM Machine_status_tbl ORDER BY Mach_status_id"
    );

    return {
      success: true,
      message: "Machine statuses fetched successfully",
      data: statuses
    };
  } catch (error) {
    console.error("❌ Fetch statuses error:", error);
    throw new Error(`Failed to fetch machine statuses: ${error}`);
  }
}

// Function to get all areas
export async function getAreas() {
  try {
    const [areas] = await pool.execute(`
      SELECT Area_id, Area_Name 
      FROM Area_tbl 
      ORDER BY Area_Name
    `);

    return {
      success: true,
      message: "Areas fetched successfully",
      data: areas
    };
  } catch (error) {
    console.error("❌ Fetch areas error:", error);
    throw new Error(`Failed to fetch areas: ${error}`);
  }
}

// ROUTER ENDPOINTS THAT USE THE FUNCTIONS

// CREATE route
/* router.post("/machines", async (req: Request, res: Response) => {
  const { areaId, status } = req.body;

  try {
    const result = await createMachine(areaId, status);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ 
      message: error instanceof Error ? error.message : 'Failed to create machine' 
    });
  }
});

// READ all route
router.get("/machines", async (req: Request, res: Response) => {
  try {
    const result = await getAllMachines();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      message: error instanceof Error ? error.message : 'Failed to fetch machines' 
    });
  }
});

// READ single route
router.get("/machines/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Machine ID is required" });
  }

  try {
    const result = await getMachineById(parseInt(id));
    res.json(result);
  } catch (error) {
    res.status(404).json({ 
      message: error instanceof Error ? error.message : 'Failed to fetch machine' 
    });
  }
});

// UPDATE route
router.put("/machines/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, areaId, status } = req.body;

  if (!id) {
    return res.status(400).json({ message: "Machine ID is required" });
  }

  try {
    const result = await updateMachine(parseInt(id), name, areaId, status);
    res.json(result);
  } catch (error) {
    res.status(400).json({ 
      message: error instanceof Error ? error.message : 'Failed to update machine' 
    });
  }
});

// DELETE route
router.delete("/machines/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Machine ID is required" });
  }

  try {
    const result = await deleteMachine(parseInt(id));
    res.json(result);
  } catch (error) {
    res.status(404).json({ 
      message: error instanceof Error ? error.message : 'Failed to delete machine' 
    });
  }
});

// BONUS routes
router.get("/machine-statuses", async (req: Request, res: Response) => {
  try {
    const result = await getMachineStatuses();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      message: error instanceof Error ? error.message : 'Failed to fetch machine statuses' 
    });
  }
});

router.get("/areas", async (req: Request, res: Response) => {
  try {
    const result = await getAreas();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      message: error instanceof Error ? error.message : 'Failed to fetch areas' 
    });
  }
}); */

export default router;