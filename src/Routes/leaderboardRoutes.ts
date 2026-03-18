import express from "express";
import { listLeaderboard } from "../controllers/leaderboardController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// GET /leaderboard?limit=100
router.get("/", authenticate, listLeaderboard);

export default router;