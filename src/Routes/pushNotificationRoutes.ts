import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as ctrl from "../controllers/pushNotificationController";

const router = Router();

router.use(authenticate);

router.post("/register", ctrl.registerPushToken);
router.post("/unregister", ctrl.unregisterPushToken);
router.post("/test", ctrl.sendTestPushToSelf);

// ✅ Changed to POST and accepts array of ids
router.post("/receipts", async (req, res) => {
  try {
    const ids = req.body.ids as string[];

    const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ids }),
    });

    const json = await response.json();
    return res.json(json);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to get receipts" });
  }
});

export default router;