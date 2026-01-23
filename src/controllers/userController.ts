import * as userService from "../services/userService.js";
import type { Request, Response, NextFunction } from "express";

// Role constants for easy reference
const ROLES = {
  Admin: 1,
  Barangay: 2,
  Operator: 3,
  Household: 4
};

/**
 * A scalable controller to get users by any role name.
 */
export async function getUsersByRole(req: Request, res: Response) {
  try {
    const { roleName } = req.params;
    if (!roleName) {
      return res.status(400).json({ message: "Role name is required." });
    }

    // Capitalize the first letter to match database format (e.g., "operator" -> "Operator")
    const formattedRoleName = roleName.charAt(0).toUpperCase() + roleName.slice(1);

    const users = await userService.getUsersByRoleName(formattedRoleName);
    
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