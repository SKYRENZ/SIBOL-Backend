import { Request, Response } from 'express';
import * as creditScoreService from '../services/creditScoreService';

/**
 * Validate and extract operatorId from request params
 */
function getValidatedOperatorId(req: Request, res: Response): number | null {
  const operatorId = Number(req.params.operatorId);
  if (!operatorId || isNaN(operatorId)) {
    res.status(400).json({ message: 'Invalid operator ID' });
    return null;
  }
  return operatorId;
}

/**
 * Get credit score for a specific operator
 * GET /api/credit-score/:operatorId
 */
export async function getOperatorScore(req: Request, res: Response) {
  try {
    const operatorId = getValidatedOperatorId(req, res);
    if (!operatorId) return;

    const scoreData = await creditScoreService.getOperatorCreditScore(operatorId);
    return res.json({
      success: true,
      data: scoreData
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch credit score';
    console.error('Error in getOperatorScore:', error);
    return res.status(500).json({ message });
  }
}

/**
 * Recalculate and update credit score for an operator
 * PUT /api/credit-score/:operatorId/recalculate
 */
export async function recalculateScore(req: Request, res: Response) {
  try {
    const operatorId = getValidatedOperatorId(req, res);
    if (!operatorId) return;

    const result = await creditScoreService.updateOperatorCreditScore(operatorId);
    return res.json({
      success: true,
      message: 'Credit score updated successfully',
      data: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to recalculate credit score';
    console.error('Error in recalculateScore:', error);
    return res.status(500).json({ message });
  }
}

/**
 * Get all operators with their credit scores (admin dashboard)
 * GET /api/credit-score/operators/all
 */
export async function getAllOperatorScores(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit) || 100;
    const offset = Number(req.query.offset) || 0;

    const scores = await creditScoreService.getAllOperatorScores(limit, offset);
    return res.json({
      success: true,
      data: scores
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch operator scores';
    console.error('Error in getAllOperatorScores:', error);
    return res.status(500).json({ message });
  }
}

/**
 * Recover credit score for an operator (reward consistent activity)
 * PUT /api/credit-score/:operatorId/recover
 */
export async function recoverScore(req: Request, res: Response) {
  try {
    const operatorId = getValidatedOperatorId(req, res);
    if (!operatorId) return;

    const result = await creditScoreService.recoverCreditScore(operatorId);
    return res.json({
      success: true,
      message: 'Credit score recovered',
      data: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to recover credit score';
    console.error('Error in recoverScore:', error);
    return res.status(500).json({ message });
  }
}
