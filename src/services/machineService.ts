import { pool } from '../config/db';

// CREATE - Function to add new machine
export async function createMachine(areaId: number, status?: number) {
  // Validation
  if (!areaId) {
    throw new Error("Area ID is required");
  }

  try {
    // First insert with a temporary name to get the actual auto-increment ID
    const [result]: any = await pool.execute(
      "INSERT INTO machine_tbl (Name, Area_id, Status) VALUES (?, ?, ?)",
      ["TEMP_NAME", areaId, status || null]
    );

    // Get the actual inserted ID
    const actualId = result.insertId;
    
    // Generate machine name with the actual ID and current date
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const machineName = `SIBOL_MACHINE_${actualId}_${currentDate}`;

    // Update the record with the proper name
    await pool.execute(
      "UPDATE machine_tbl SET Name = ? WHERE Machine_id = ?",
      [machineName, actualId]
    );

    return {
      success: true,
      message: "Machine created successfully",
      machineId: actualId,
      machine: { 
        name: machineName, 
        areaId, 
        status,
        createdDate: currentDate,
        actualId: actualId
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
        m.machine_id,
        m.Name,
        m.Area_id,
        a.Area_Name,
        m.Status as status_id,
        ms.Status as status_name
      FROM machine_tbl m
      LEFT JOIN area_tbl a ON m.Area_id = a.Area_id
      LEFT JOIN machine_status_tbl ms ON m.Status = ms.Mach_status_id
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
      FROM machine_tbl m
      LEFT JOIN area_tbl a ON m.Area_id = a.Area_id
      LEFT JOIN machine_status_tbl ms ON m.Status = ms.Mach_status_id
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
    // console.error("❌ Fetch machine error:", error); // Remove or comment this line
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
      "UPDATE machine_tbl SET Name = ?, Area_id = ?, Status = ? WHERE Machine_id = ?",
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
    // console.error("❌ Update machine error:", error); // Remove or comment this line
    throw new Error(`Failed to update machine: ${error}`);
  }
}

/* // DELETE - Function to delete machine
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
} */

// Function to get all machine statuses
export async function getMachineStatuses() {
  try {
    const [statuses] = await pool.execute(
      "SELECT Mach_status_id, Status FROM machine_status_tbl ORDER BY Mach_status_id"
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
      FROM area_tbl 
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