// 2. Create uploadRoutes.ts
import { Router } from "express";
import * as ctrl from "../controllers/uploadController.js";
import { authenticate } from "../middleware/authenticate.js";
import { isAdmin } from "../middleware/isAdmin.js";

const router = Router();

// ✅ protect uploads
router.use(authenticate);

// existing generic upload (maintenance_attachments, allows docs)
router.post("/", ctrl.uploadMiddleware, ctrl.uploadFile);

// ✅ reward image upload (admin only, image-only)
router.post("/reward-image", isAdmin, ctrl.rewardImageUploadMiddleware, ctrl.uploadRewardImage);

export default router;