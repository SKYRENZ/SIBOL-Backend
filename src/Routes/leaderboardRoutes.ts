import express from 'express';
import { listLeaderboard } from '../controllers/leaderboardController';

const router = express.Router();

// GET /leaderboard?limit=100
router.get('/', listLeaderboard);

export default router;