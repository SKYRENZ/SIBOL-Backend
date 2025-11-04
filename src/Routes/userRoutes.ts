import { Router } from "express";
import * as userController from "../controllers/userController.js";

const router = Router();

// GET /api/users/role/:roleName - A scalable route to fetch users by any role.
// Examples: /api/users/role/Operator, /api/users/role/Admin
router.get("/role/:roleName", userController.getUsersByRole);

export default router;