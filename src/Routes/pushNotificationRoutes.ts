import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as ctrl from "../controllers/pushNotificationController";

const router = Router();

router.use(authenticate);

router.post("/register", ctrl.registerPushToken);
router.post("/unregister", ctrl.unregisterPushToken);
router.post("/test", ctrl.sendTestPushToSelf);

export default router;