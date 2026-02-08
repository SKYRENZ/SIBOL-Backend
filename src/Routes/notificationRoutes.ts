import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as notificationController from "../controllers/notificationController";

const router = Router();

router.get("/", authenticate, notificationController.listNotifications);
router.post("/read", authenticate, notificationController.markRead);
router.post("/read-all", authenticate, notificationController.markAllRead);

export default router;
