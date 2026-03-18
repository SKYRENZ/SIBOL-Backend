import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as ctrl from "../controllers/pushNotificationController";

const router = Router();

router.use(authenticate);

router.post("/register", ctrl.registerPushToken);
router.post("/unregister", ctrl.unregisterPushToken);
router.post("/test", ctrl.sendTestPushToSelf);

router.get("/receipts", authenticate, async (req, res) => {
  const receiptId = req.query.id as string;
  
  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ ids: [receiptId] }),
  });

  const json = await response.json();
  return res.json(json);
});

export default router;