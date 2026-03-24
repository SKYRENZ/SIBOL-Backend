// 2. Create uploadRoutes.ts
import { Router } from "express";
import * as ctrl from "../controllers/uploadController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";

const router = Router();
const canManageRewards = authorizeRoles([1, 2, 5]); // Admin, Barangay Staff, SuperAdmin

// protect uploads
router.use(authenticate);

// existing generic upload (maintenance_attachments, allows docs)
router.post("/", ctrl.uploadMiddleware, ctrl.uploadFile);

// reward image upload (admin/staff/superadmin)
router.post("/reward-image", canManageRewards, ctrl.rewardImageUploadMiddleware, ctrl.uploadRewardImage);

// reward attachment upload (controller enforces owner/staff checks)
router.post("/reward-attachment", ctrl.rewardAttachmentUploadMiddleware, ctrl.uploadClaimedRewardAttachment);

// return clean JSON for Multer errors
router.use(ctrl.uploadMulterErrorHandler);

export default router;