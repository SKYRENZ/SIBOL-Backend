import { pool } from '../config/db';

// CREATE - Function to add waste input to machine with operator tracking
export async function createWasteInput(machineId: number, weight: number, accountId?: number) {
  // Validation
  if (!machineId || isNaN(machineId)) {
    throw new Error("Valid Machine ID is required");
  }
  if (!weight || isNaN(weight) || weight <= 0) {
    throw new Error("Weight must be a positive number");
  }

  try {
    // Check if machine exists
    const [machineCheck]: any = await pool.execute(
      "SELECT Machine_id FROM machine_tbl WHERE Machine_id = ?",
      [machineId]
    );

    if (machineCheck.length === 0) {
      throw new Error("Machine not found");
    }

    // If accountId provided, verify the account exists
    if (accountId) {
      const [accountCheck]: any = await pool.execute(
        "SELECT Account_id FROM accounts_tbl WHERE Account_id = ?",
        [accountId]
      );

      if (accountCheck.length === 0) {
        throw new Error("Account/User not found");
      }
    }

    // Insert waste input record with optional accountId
    const [result]: any = await pool.execute(
      "INSERT INTO machine_waste_input_tbl (Machine_id, Account_id, Weight, Input_datetime) VALUES (?, ?, ?, NOW())",
      [machineId, accountId || null, weight]
    );

    return {
      success: true,
      message: "Waste input recorded successfully",
      inputId: result.insertId,
      data: {
        inputId: result.insertId,
        machineId,
        accountId: accountId || null,
        weight,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error("❌ Create waste input error:", error);
    throw new Error(`Failed to record waste input: ${error instanceof Error ? error.message : error}`);
  }
}

// READ - Function to get all waste inputs with operator details
export async function getAllWasteInputs() {
  try {
    const [inputs] = await pool.execute(`
      SELECT 
        wi.Input_id,
        wi.Machine_id,
        m.Name as Machine_Name,
        m.Area_id,
        a.Area_Name,
        wi.Weight,
        wi.Account_id,
        acc.Username,
        p.FirstName,
        p.LastName,
        wi.Input_datetime,
        wi.Created_at
      FROM machine_waste_input_tbl wi
      JOIN machine_tbl m ON wi.Machine_id = m.Machine_id
      LEFT JOIN area_tbl a ON m.Area_id = a.Area_id
      LEFT JOIN accounts_tbl acc ON wi.Account_id = acc.Account_id
      LEFT JOIN profile_tbl p ON acc.Account_id = p.Account_id
      ORDER BY wi.Input_datetime DESC
    `);

    return {
      success: true,
      data: inputs
    };
  } catch (error) {
    console.error("❌ Get all waste inputs error:", error);
    throw new Error(`Failed to fetch waste inputs: ${error instanceof Error ? error.message : error}`);
  }
}

// READ - Function to get waste inputs by machine ID
export async function getWasteInputsByMachineId(machineId: number) {
  if (!machineId || isNaN(machineId)) {
    throw new Error("Valid Machine ID is required");
  }

  try {
    const [inputs] = await pool.execute(`
      SELECT 
        wi.Input_id,
        wi.Machine_id,
        m.Name as Machine_Name,
        m.Area_id,
        a.Area_Name,
        wi.Weight,
        wi.Account_id,
        acc.Username,
        p.FirstName,
        p.LastName,
        wi.Input_datetime,
        wi.Created_at
      FROM machine_waste_input_tbl wi
      JOIN machine_tbl m ON wi.Machine_id = m.Machine_id
      LEFT JOIN area_tbl a ON m.Area_id = a.Area_id
      LEFT JOIN accounts_tbl acc ON wi.Account_id = acc.Account_id
      LEFT JOIN profile_tbl p ON acc.Account_id = p.Account_id
      WHERE wi.Machine_id = ?
      ORDER BY wi.Input_datetime DESC
    `, [machineId]);

    return {
      success: true,
      data: inputs
    };
  } catch (error) {
    console.error("❌ Get waste inputs by machine error:", error);
    throw new Error(`Failed to fetch waste inputs: ${error instanceof Error ? error.message : error}`);
  }
}

// READ - Function to get waste inputs by operator/user ID
export async function getWasteInputsByAccountId(accountId: number) {
  if (!accountId || isNaN(accountId)) {
    throw new Error("Valid Account ID is required");
  }

  try {
    const [inputs] = await pool.execute(`
      SELECT 
        wi.Input_id,
        wi.Machine_id,
        m.Name as Machine_Name,
        m.Area_id,
        a.Area_Name,
        wi.Weight,
        wi.Account_id,
        acc.Username,
        p.FirstName,
        p.LastName,
        wi.Input_datetime,
        wi.Created_at
      FROM machine_waste_input_tbl wi
      JOIN machine_tbl m ON wi.Machine_id = m.Machine_id
      LEFT JOIN area_tbl a ON m.Area_id = a.Area_id
      LEFT JOIN accounts_tbl acc ON wi.Account_id = acc.Account_id
      LEFT JOIN profile_tbl p ON acc.Account_id = p.Account_id
      WHERE wi.Account_id = ?
      ORDER BY wi.Input_datetime DESC
    `, [accountId]);

    return {
      success: true,
      data: inputs
    };
  } catch (error) {
    console.error("❌ Get waste inputs by account error:", error);
    throw new Error(`Failed to fetch waste inputs: ${error instanceof Error ? error.message : error}`);
  }
}

// READ - Function to get waste input by ID
export async function getWasteInputById(inputId: number) {
  if (!inputId || isNaN(inputId)) {
    throw new Error("Valid Input ID is required");
  }

  try {
    const [inputs]: any = await pool.execute(`
      SELECT 
        wi.Input_id,
        wi.Machine_id,
        m.Name as Machine_Name,
        m.Area_id,
        a.Area_Name,
        wi.Weight,
        wi.Account_id,
        acc.Username,
        p.FirstName,
        p.LastName,
        wi.Input_datetime,
        wi.Created_at
      FROM machine_waste_input_tbl wi
      JOIN machine_tbl m ON wi.Machine_id = m.Machine_id
      LEFT JOIN area_tbl a ON m.Area_id = a.Area_id
      LEFT JOIN accounts_tbl acc ON wi.Account_id = acc.Account_id
      LEFT JOIN profile_tbl p ON acc.Account_id = p.Account_id
      WHERE wi.Input_id = ?
    `, [inputId]);

    if (inputs.length === 0) {
      throw new Error("Waste input record not found");
    }

    return {
      success: true,
      data: inputs[0]
    };
  } catch (error) {
    console.error("❌ Get waste input by ID error:", error);
    throw new Error(`Failed to fetch waste input: ${error instanceof Error ? error.message : error}`);
  }
}

// READ - Function to get waste inputs by date range
export async function getWasteInputsByDateRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) {
    throw new Error("Start date and end date are required");
  }

  try {
    const [inputs] = await pool.execute(`
      SELECT 
        wi.Input_id,
        wi.Machine_id,
        m.Name as Machine_Name,
        m.Area_id,
        a.Area_Name,
        wi.Weight,
        wi.Account_id,
        acc.Username,
        p.FirstName,
        p.LastName,
        wi.Input_datetime,
        wi.Created_at
      FROM machine_waste_input_tbl wi
      JOIN machine_tbl m ON wi.Machine_id = m.Machine_id
      LEFT JOIN area_tbl a ON m.Area_id = a.Area_id
      LEFT JOIN accounts_tbl acc ON wi.Account_id = acc.Account_id
      LEFT JOIN profile_tbl p ON acc.Account_id = p.Account_id
      WHERE DATE(wi.Input_datetime) BETWEEN ? AND ?
      ORDER BY wi.Input_datetime DESC
    `, [startDate, endDate]);

    return {
      success: true,
      data: inputs
    };
  } catch (error) {
    console.error("❌ Get waste inputs by date range error:", error);
    throw new Error(`Failed to fetch waste inputs: ${error instanceof Error ? error.message : error}`);
  }
}