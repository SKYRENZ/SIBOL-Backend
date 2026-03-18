import express from "express";
import * as rewardController from "../controllers/rewardController";
import { authenticate } from "../middleware/authenticate";
import { authorizeRoles } from "../middleware/authorize";

const router = express.Router();
const canManageRewards = authorizeRoles([1, 2, 5]); // Admin, Barangay Staff, SuperAdmin

router.use(authenticate);

// Public / household routes (authenticated users can view)
router.get("/", rewardController.listRewards);

// move specific routes before the dynamic :id route
router.get("/transactions", rewardController.listTransactions);
router.get("/code/:code", rewardController.validateRedemptionCode);

router.get("/:id", rewardController.getReward);
router.post("/redeem", rewardController.redeemReward);

// Admin / barangay staff routes
router.post("/", canManageRewards, rewardController.createReward);
router.put("/:id", canManageRewards, rewardController.updateReward);
router.patch("/:id/archive", canManageRewards, rewardController.archiveReward);
router.patch("/:id/restore", canManageRewards, rewardController.restoreReward);
router.patch("/transaction/:id/redeemed", canManageRewards, rewardController.markRedeemed);

// attachments
router.get("/transaction/:transactionId/attachments", rewardController.listRewardAttachments);
router.delete("/attachment/:id", canManageRewards, rewardController.deleteRewardAttachment);

export default router;