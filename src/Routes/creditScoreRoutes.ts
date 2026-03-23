import { Router } from 'express';
import * as creditScoreController from '../controllers/creditScoreController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

/**
 * Get all operators with their credit scores (admin dashboard)
 * GET /api/credit-score/operators/all
 */
router.get('/operators/all', authenticate, creditScoreController.getAllOperatorScores);

/**
 * Get credit score for a specific operator
 * GET /api/credit-score/:operatorId
 */
router.get('/:operatorId', authenticate, creditScoreController.getOperatorScore);

/**
 * Recalculate and update credit score for an operator
 * PUT /api/credit-score/:operatorId/recalculate
 */
router.put('/:operatorId/recalculate', authenticate, creditScoreController.recalculateScore);

/**
 * Recover credit score for an operator (reward consistent activity)
 * PUT /api/credit-score/:operatorId/recover
 */
router.put('/:operatorId/recover', authenticate, creditScoreController.recoverScore);

export default router;
