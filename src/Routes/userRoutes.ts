import { Router } from "express";
import * as userController from "../controllers/userController.js";
import { authenticate } from "../middleware/authenticate";
import { authorizeRoles } from "../middleware/authorize";

const router = Router();

// GET /api/users/role/:roleName - A scalable route to fetch users by any role.
// Examples: /api/users/role/Operator, /api/users/role/Admin
router.get("/role/:roleName", userController.getUsersByRole);

// New (protected) — same controller, but restricted to Admin
router.get("/admin/role/:roleName", authenticate, authorizeRoles([1]), userController.getUsersByRole);

export default router;