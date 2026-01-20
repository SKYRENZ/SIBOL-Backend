import express from "express";
import * as rewardController from "../controllers/rewardController";
import { authenticate } from "../middleware/authenticate";
import { isAdmin } from "../middleware/isAdmin";

const router = express.Router();

router.use(authenticate);

// Public / household routes (authenticated users can view)
router.get("/", rewardController.listRewards); // query ?archived=true|false

// move specific routes before the dynamic :id route
router.get("/transactions", rewardController.listTransactions); // authenticated
router.get("/code/:code", rewardController.validateRedemptionCode); // staff can lookup code

router.get("/:id", rewardController.getReward);
router.post("/redeem", rewardController.redeemReward); // body: { account_id, reward_id, quantity }

// Admin / barangay staff routes (admin only)
router.post("/", isAdmin, rewardController.createReward);
router.put("/:id", isAdmin, rewardController.updateReward);
router.patch("/:id/archive", isAdmin, rewardController.archiveReward);
router.patch("/:id/restore", isAdmin, rewardController.restoreReward);
router.patch("/transaction/:id/redeemed", isAdmin, rewardController.markRedeemed);

// ---------------- attachments ----------------
router.get("/transaction/:transactionId/attachments", rewardController.listRewardAttachments);
router.delete("/attachment/:id", isAdmin, rewardController.deleteRewardAttachment);

export default router;