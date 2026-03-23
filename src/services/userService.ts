import pool from "../config/db.js";

type Row = any;

/**
 * Fetches a role ID from the database based on the role name.
 * @param roleName - The name of the role (e.g., "Operator", "Admin").
 * @returns The ID of the role, or null if not found.
 */
async function getRoleIdByName(roleName: string): Promise<number | null> {
  const raw = (roleName || "").trim();
  if (!raw) return null;

  // 1) exact case-insensitive match
  const sqlExact =
    "SELECT Roles_id FROM user_roles_tbl WHERE LOWER(Roles) = LOWER(?) LIMIT 1";
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
      const [r] = (await pool.query<Row[]>(
        "SELECT Roles_id FROM user_roles_tbl WHERE LOWER(Roles) = LOWER(?) LIMIT 1",
        [a]
      )) as any;
      if (r.length > 0) return r[0].Roles_id;
    }
  }

  // 3) partial match fallback (e.g. "barangay" -> "barangay_staff")
  const sqlLike =
    "SELECT Roles_id FROM user_roles_tbl WHERE LOWER(Roles) LIKE ? LIMIT 1";
  const [rowsLike] = await pool.query<Row[]>(sqlLike, [
    `%${raw.toLowerCase()}%`,
  ]);
  if (rowsLike.length > 0) return rowsLike[0].Roles_id;

  return null;
}

/**
 * Fetches active users by their role ID, joining with profile to get names.
 * @param roleId - The numeric ID of the role.
 * @param barangayId - Optional barangay ID to filter users by barangay.
 */
export async function getUsersByRoleId(roleId: number, barangayId?: number): Promise<any[]> {
  let sql = `
    SELECT
      a.Account_id AS Account_id,
      a.Username AS Username,
      p.Account_id IS NOT NULL AS HasProfile,
      p.FirstName AS FirstName,
      p.LastName AS LastName,
      a.Roles AS RoleId,
      p.Barangay_id AS Barangay_id
    FROM accounts_tbl a
    LEFT JOIN profile_tbl p ON a.Account_id = p.Account_id
    WHERE a.Roles = ? AND a.IsActive = 1
  `;

  const params: any[] = [roleId];

  // Filter by barangay if provided
  if (barangayId !== undefined && barangayId !== null) {
    sql += ' AND p.Barangay_id = ?';
    params.push(barangayId);
  }

  sql += ' ORDER BY COALESCE(p.LastName, a.Username), COALESCE(p.FirstName, a.Username)';

  const [rows] = await pool.query<Row[]>(sql, params);
  return rows;
}

/**
 * Fetches active users by their role name (e.g., 'Operator', 'Admin').
 * This is the new scalable function.
 * @param roleName - The name of the role to fetch users for.
 * @param barangayId - Optional barangay ID to filter users by barangay.
 */
export async function getUsersByRoleName(roleName: string, barangayId?: number): Promise<any[]> {
  const roleId = await getRoleIdByName(roleName);
  if (roleId === null) {
    console.warn(`Role '${roleName}' not found.`);
    return []; // Return empty array if role doesn't exist to prevent errors
  }
  return getUsersByRoleId(roleId, barangayId);
}

/**
 * Returns an array of 12 numbers representing counts of users
 * for the given roleName by month in the given year (indexes 0..11).
 */
export async function getMonthlyUsersByRoleName(
  roleName: string,
  year: number
): Promise<number[]> {
  const roleId = await getRoleIdByName(roleName);
  if (roleId === null) return Array(12).fill(0);

  const sql = `
    SELECT MONTH(created_at) AS month, COUNT(*) AS cnt
    FROM accounts_tbl
    WHERE Roles = ? AND YEAR(created_at) = ?
    GROUP BY MONTH(created_at)
    ORDER BY MONTH(created_at)
  `;
  const params = [roleId, year];
  const [rows] = (await pool.query<any[]>(sql, params)) as any;
  const out = Array(12).fill(0);
  for (const r of rows) {
    const m = Number(r.month);
    if (m >= 1 && m <= 12) out[m - 1] = Number(r.cnt) || 0;
  }
  return out;
}

/**
 * Returns an array of 12 numbers representing counts of users
 * for the given roleName by month in the given year (indexes 0..11),
 * with cumulative sums.
 */
export async function getMonthlyUsersByRoleName(
  roleName: string,
  year: number,
  cumulative: boolean = false
): Promise<number[]> {
  const roleId = await getRoleIdByName(roleName);
  if (roleId === null) return Array(12).fill(0);

  // Helper zero-filled array
  const empty = () => Array(12).fill(0);

  // Try to get monthly counts for the given year.
  let monthly = Array(12).fill(0);
  try {
    const sqlYear = `
      SELECT MONTH(created_at) AS month, COUNT(*) AS cnt
      FROM accounts_tbl
      WHERE Roles = ? AND YEAR(created_at) = ?
      GROUP BY MONTH(created_at)
      ORDER BY MONTH(created_at)
    `;
    const params = [roleId, year];
    const [rows] = (await pool.query<any[]>(sqlYear, params)) as any;
    for (const r of rows) {
      const m = Number(r.month);
      if (m >= 1 && m <= 12) monthly[m - 1] = Number(r.cnt) || 0;
    }
  } catch (err: any) {
    // Likely the DB doesn't have a `created_at` column for accounts_tbl.
    console.warn(
      "getMonthlyUsersByRoleName: failed monthly-by-created_at query, falling back to total",
      { roleName, year, err: err?.message ?? err }
    );
    try {
      const [totalRows] = (await pool.query<any[]>("SELECT COUNT(*) AS cnt FROM accounts_tbl WHERE Roles = ?", [roleId])) as any;
      const total = Number(totalRows?.[0]?.cnt) || 0;
      // Put the total at the current month index so chart shows a non-zero value
      const idx = new Date().getMonth(); // 0..11
      monthly = Array(12).fill(0);
      monthly[idx] = total;
      // If cumulative requested, make cumulative array where every month up to idx has total
      if (cumulative) {
        const out = Array(12).fill(0);
        for (let i = 0; i <= idx; i++) out[i] = total;
        return out;
      }
      return monthly;
    } catch (e) {
      console.error("getMonthlyUsersByRoleName: failed fallback total query", e);
      return empty();
    }
  }

  if (!cumulative) return monthly;

  // Build cumulative array. If created_at exists we can compute 'before year' safely, otherwise try fallback.
  try {
    const startOfYear = `${year}-01-01 00:00:00`;
    const sqlBefore = `SELECT COUNT(*) AS cnt FROM accounts_tbl WHERE Roles = ? AND created_at < ?`;
    const [beforeRows] = (await pool.query<any[]>(sqlBefore, [roleId, startOfYear])) as any;
    const initial = Number(beforeRows?.[0]?.cnt) || 0;

    const out = Array(12).fill(0);
    let running = initial;
    for (let i = 0; i < 12; i++) {
      running += monthly[i];
      out[i] = running;
    }
    return out;
  } catch (err: any) {
    // If created_at isn't available for the "before" query, fall back to simple cumulative from monthly
    console.warn(
      "getMonthlyUsersByRoleName: failed cumulative-before query, building cumulative from monthly only",
      { roleName, year, err: err?.message ?? err }
    );
    const out = Array(12).fill(0);
    let running = 0;
    for (let i = 0; i < 12; i++) {
      running += monthly[i];
      out[i] = running;
    }
    return out;
  }
}

let _accountsCreatedCol: string | null | undefined;

/** Probe likely created-timestamp column names on first use and cache result. */
async function resolveAccountsCreatedColumn(): Promise<string | null> {
  if (_accountsCreatedCol !== undefined) return _accountsCreatedCol;
  const candidates = [
    "created_at",
    "Created_at",
    "Created_At",
    "CreatedAt",
    "Created",
  ];
  for (const col of candidates) {
    try {
      const sql = `SELECT \`${col}\` FROM accounts_tbl LIMIT 1`;
      await pool.query(sql);
      _accountsCreatedCol = col;
      console.info("Detected accounts timestamp column:", col);
      return col;
    } catch (e) {
      // ignore and try next candidate
    }
  }
  _accountsCreatedCol = null;
  console.warn(
    "No accounts timestamp column detected; falling back to totals"
  );
  return null;
}