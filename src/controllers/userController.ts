import * as userService from "../services/userService.js";
import type { Request, Response } from "express";

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