// filepath: c:\Users\Renz\OneDrive\Documents\GitHub\SIBOL\SIBOL-Backend\src\Routes\areaRoutes.ts
import { Router } from "express";
import * as areaController from "../controllers/areaController";

const router = Router();

router.get("/", areaController.list);

export default router;