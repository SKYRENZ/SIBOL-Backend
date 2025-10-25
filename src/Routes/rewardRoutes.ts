import express from "express";
import * as rewardController from "../controllers/rewardController";
import { isAdmin } from "../middleware/isAdmin"; // named export

const router = express.Router();

// Public / household routes
router.get("/", rewardController.listRewards); // query ?archived=true|false
router.get("/:id", rewardController.getReward);
router.post("/redeem", rewardController.redeemReward); // body: { account_id, reward_id, quantity }
router.get("/code/:code", rewardController.validateRedemptionCode); // staff can lookup code

// Admin / barangay staff routes
router.post("/", isAdmin, rewardController.createReward);
router.put("/:id", isAdmin, rewardController.updateReward);
router.patch("/:id/archive", isAdmin, rewardController.archiveReward);
router.patch("/:id/restore", isAdmin, rewardController.restoreReward);
router.patch("/transaction/:id/redeemed", isAdmin, rewardController.markRedeemed);

export default router;