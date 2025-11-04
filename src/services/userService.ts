import pool from "../config/db.js";

type Row = any;

/**
 * Fetches a role ID from the database based on the role name.
 * @param roleName - The name of the role (e.g., "Operator", "Admin").
 * @returns The ID of the role, or null if not found.
 */
async function getRoleIdByName(roleName: string): Promise<number | null> {
  const sql = "SELECT Roles_id FROM user_roles_tbl WHERE Roles = ? LIMIT 1";
  const [rows] = await pool.query<Row[]>(sql, [roleName]);
  return rows.length > 0 ? rows[0].Roles_id : null;
}

/**
 * Fetches active users by their role ID, joining with profile to get names.
 * @param roleId - The numeric ID of the role.
 */
export async function getUsersByRoleId(roleId: number): Promise<any[]> {
  const sql = `
    SELECT 
      a.Account_id,
      p.FirstName,
      p.LastName
    FROM accounts_tbl a
    JOIN profile_tbl p ON a.Account_id = p.Account_id
    WHERE a.Roles = ? AND a.IsActive = 1
    ORDER BY p.LastName, p.FirstName;
  `;
  const [rows] = await pool.query<Row[]>(sql, [roleId]);
  return rows;
}

/**
 * Fetches active users by their role name (e.g., 'Operator', 'Admin').
 * This is the new scalable function.
 * @param roleName - The name of the role to fetch users for.
 */
export async function getUsersByRoleName(roleName: string): Promise<any[]> {
  const roleId = await getRoleIdByName(roleName);
  if (roleId === null) {
    console.warn(`Role '${roleName}' not found.`);
    return []; // Return empty array if role doesn't exist to prevent errors
  }
  return getUsersByRoleId(roleId);
}