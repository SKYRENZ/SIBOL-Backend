// 2. Create uploadRoutes.ts
import { Router } from "express";
import * as ctrl from "../controllers/uploadController.js";

const router = Router();

router.post("/", ctrl.uploadMiddleware, ctrl.uploadFile);

export default router;