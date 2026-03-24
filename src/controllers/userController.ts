import * as userService from "../services/userService.js";
import type { Request, Response } from "express";

// Role constants for easy reference
const ROLES = {
  Admin: 1,
  Barangay: 2,
  Operator: 3,
  Household: 4
};

/** Cache for detected accounts timestamp column name */
let _accountsCreatedCol: string | null | undefined;

/** Probe likely created-timestamp column names on first use and cache result. */
async function resolveAccountsCreatedColumn(): Promise<string | null> {
  if (_accountsCreatedCol !== undefined) return _accountsCreatedCol;
  const candidates = ["created_at", "Created_at", "Created_At", "CreatedAt", "Created"];
  for (const col of candidates) {
    try {
      // use a safe probe that selects the column with LIMIT 1
      const sql = `SELECT \`${col}\` FROM accounts_tbl LIMIT 1`;
      await pool.query(sql);
      _accountsCreatedCol = col;
      console.info('Detected accounts timestamp column:', col);
      return col;
    } catch (e) {
      // ignore and try next candidate
    }
  }
  _accountsCreatedCol = null;
  console.warn('No accounts timestamp column detected; falling back to totals');
  return null;
}

/**
 * A scalable controller to get users by any role name.
 * Supports optional barangay filtering via query parameter: ?barangayId=123
 */
export async function getUsersByRole(req: Request, res: Response) {
  try {
    const { roleName } = req.params;
    if (!roleName) {
      return res.status(400).json({ message: "Role name is required." });
    }

    // Capitalize the first letter to match database format (e.g., "operator" -> "Operator")
    const formattedRoleName = roleName.charAt(0).toUpperCase() + roleName.slice(1);

    // Extract optional barangayId from query parameters
    const barangayId = req.query.barangayId ? Number(req.query.barangayId) : undefined;

    const users = await userService.getUsersByRoleName(formattedRoleName, barangayId);

    // Format the response to be easily consumable by frontend dropdowns
    const formattedUsers = users.map(user => ({
        value: user.Account_id,
        label: `${user.FirstName} ${user.LastName}`.trim()
    }));

    return res.json(formattedUsers);
  } catch (err: any) {
    console.error(`Failed to fetch users for role ${req.params.roleName}:`, err);
    return res.status(500).json({ message: "Server error while fetching users" });
  }
}

/**
 * ✅ REUSABLE authorization checker
 * Checks if the authenticated user has one of the allowed roles.
 * Returns true if authorized, false otherwise.
 * Also sends 403 response if not authorized (unless skipResponse = true).
 */
export function checkUserRole(
  req: Request, 
  res: Response, 
  allowedRoles: (keyof typeof ROLES | number)[],
  skipResponse: boolean = false
): boolean {
  const actor = (req as any).user;
  
  if (!actor) {
    if (!skipResponse) {
      res.status(401).json({ message: 'Authentication required' });
    }
    return false;
  }

  // Normalize role field
  const role =
    (actor as any).Roles ??
    (actor as any).roleId ??
    (actor as any).role ??
    (actor as any).Roles_id ??
    (actor as any).RolesId ??
    null;

  if (role === null || role === undefined) {
    console.warn('checkUserRole: user has no role field', actor);
    if (!skipResponse) {
      res.status(403).json({ message: 'Insufficient privileges' });
    }
    return false;
  }

  const roleNum = typeof role === 'string' ? Number(role) : role;
  if (Number.isNaN(roleNum)) {
    console.warn('checkUserRole: cannot parse role', role);
    if (!skipResponse) {
      res.status(403).json({ message: 'Insufficient privileges' });
    }
    return false;
  }

  // Convert role names to IDs for comparison
  const allowedRoleIds = allowedRoles.map(r => 
    typeof r === 'string' ? ROLES[r] : r
  );

  if (!allowedRoleIds.includes(roleNum)) {
    if (!skipResponse) {
      res.status(403).json({ 
        message: `Access denied: Only ${allowedRoles.join(', ')} can access this resource` 
      });
    }
    return false;
  }

  return true;
}

// append to src/controllers/userController.ts

export async function getUsersByRoleMonthly(req: Request, res: Response) {
  try {
    const rawRole = req.params.roleName;
    if (!rawRole) return res.status(400).json({ message: "Role name required" });

    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    if (Number.isNaN(year) || year < 2000) return res.status(400).json({ message: "Invalid year" });

    const roleName = rawRole.charAt(0).toUpperCase() + rawRole.slice(1);

    // parse cumulative flag: ?cumulative=1 or ?cumulative=true
    const cumulative = String(req.query.cumulative || "").toLowerCase();
    const isCumulative = cumulative === "1" || cumulative === "true";

    const arr = await userService.getMonthlyUsersByRoleName(roleName, year, isCumulative);

    return res.json({ data: arr, cumulative: isCumulative });
  } catch (err: any) {
    console.error("Failed to fetch monthly users by role:", {
      role: req.params.roleName,
      year: req.query.year,
      error: err?.stack ?? err,
    });
    return res.status(500).json({ message: "Server error" });
  }
}

/**
 * Returns an array of 12 numbers representing counts of users
 * for the given roleName by month in the given year (indexes 0..11).
 * If `cumulative` is true, returns cumulative totals up to each month.
 * The function auto-detects the accounts timestamp column and falls back
 * to a sensible total-placement if no timestamp column exists.
 */
export async function getMonthlyUsersByRoleName(
  roleName: string,
  year: number,
  cumulative: boolean = false
): Promise<number[]> {
  // Assumes getRoleIdByName is defined elsewhere in this file.
  const roleId = await getRoleIdByName(roleName);
  if (roleId === null) return Array(12).fill(0);

  const empty = () => Array(12).fill(0);

  const col = await resolveAccountsCreatedColumn();

  // If we have a timestamp column, query per-month using it
  if (col) {
    try {
      const sqlYear = `
        SELECT MONTH(\`${col}\`) AS month, COUNT(*) AS cnt
        FROM accounts_tbl
        WHERE Roles = ? AND YEAR(\`${col}\`) = ?
        GROUP BY MONTH(\`${col}\`)
        ORDER BY MONTH(\`${col}\`)
      `;
      const params = [roleId, year];
      const [rows] = (await pool.query<any[]>(sqlYear, params)) as any;

      const monthly = Array(12).fill(0);
      for (const r of rows) {
        const m = Number(r.month);
        if (m >= 1 && m <= 12) monthly[m - 1] = Number(r.cnt) || 0;
      }

      if (!cumulative) return monthly;

      // cumulative: count before the year using the same column
      const startOfYear = `${year}-01-01 00:00:00`;
      const sqlBefore = `SELECT COUNT(*) AS cnt FROM accounts_tbl WHERE Roles = ? AND \`${col}\` < ?`;
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
      console.warn('getMonthlyUsersByRoleName: monthly query failed even with detected column, falling back', { roleName, year, col, err: err?.message ?? err });
      // fall through to totals fallback below
    }
  }

  // Fallback: no timestamp column or queries failed — return total placed in current month
  try {
    const [totalRows] = (await pool.query<any[]>("SELECT COUNT(*) AS cnt FROM accounts_tbl WHERE Roles = ?", [roleId])) as any;
    const total = Number(totalRows?.[0]?.cnt) || 0;
    const idx = new Date().getMonth(); // 0..11
    if (!cumulative) {
      const monthly = Array(12).fill(0);
      monthly[idx] = total;
      return monthly;
    } else {
      const out = Array(12).fill(0);
      for (let i = 0; i <= idx; i++) out[i] = total;
      return out;
    }
  } catch (e) {
    console.error('getMonthlyUsersByRoleName fallback total query failed', e);
    return empty();
  }
}