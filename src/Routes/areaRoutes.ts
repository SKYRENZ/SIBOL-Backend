// filepath: c:\Users\Renz\OneDrive\Documents\GitHub\SIBOL\SIBOL-Backend\src\Routes\areaRoutes.ts
import { Router } from "express";
import * as areaController from "../controllers/areaController";

const router = Router();

// Route to get all areas
router.get("/", areaController.list);

// Route to create a new area
router.post("/", areaController.createArea);

// Route to get waste logs for a specific area
router.get("/:id/logs", areaController.getLogsByArea);

export default router;