import pool from "../config/db.js";

type Row = any;

/**
 * Fetches a role ID from the database based on the role name.
 * @param roleName - The name of the role (e.g., "Operator", "Admin").
 * @returns The ID of the role, or null if not found.
 */
async function getRoleIdByName(roleName: string): Promise<number | null> {
  const raw = (roleName || '').trim();
  if (!raw) return null;

  // 1) exact case-insensitive match
  const sqlExact = "SELECT Roles_id FROM user_roles_tbl WHERE LOWER(Roles) = LOWER(?) LIMIT 1";
  const [rowsExact] = await pool.query<Row[]>(sqlExact, [raw]);
  if (rowsExact.length > 0) return rowsExact[0].Roles_id;

  // 2) common alias mapping (handle short names)
  const aliases: Record<string, string[]> = {
    barangay: ["barangay_staff"],
    admin: ["Admin"],
    operator: ["Operator"],
  };
  const key = raw.toLowerCase();
  if (aliases[key]) {
    for (const a of aliases[key]) {
      const [r] = await pool.query<Row[]>("SELECT Roles_id FROM user_roles_tbl WHERE LOWER(Roles) = LOWER(?) LIMIT 1", [a]);
      if (r.length > 0) return r[0].Roles_id;
    }
  }

  // 3) partial match fallback (e.g. "barangay" -> "barangay_staff")
  const sqlLike = "SELECT Roles_id FROM user_roles_tbl WHERE LOWER(Roles) LIKE ? LIMIT 1";
  const [rowsLike] = await pool.query<Row[]>(sqlLike, [`%${raw.toLowerCase()}%`]);
  if (rowsLike.length > 0) return rowsLike[0].Roles_id;

  return null;
}

/**
 * Fetches active users by their role ID, joining with profile to get names.
 * @param roleId - The numeric ID of the role.
 */
export async function getUsersByRoleId(roleId: number): Promise<any[]> {
  const sql = `
    SELECT
      a.Account_id AS Account_id,
      a.Username AS Username,
      p.Account_id IS NOT NULL AS HasProfile,
      p.FirstName AS FirstName,
      p.LastName AS LastName,
      a.Roles AS RoleId
    FROM accounts_tbl a
    LEFT JOIN profile_tbl p ON a.Account_id = p.Account_id
    WHERE a.Roles = ? AND a.IsActive = 1
    ORDER BY COALESCE(p.LastName, a.Username), COALESCE(p.FirstName, a.Username);
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