import { pool } from '../config/db';

// ============ CONSTANTS ============
export const CREDIT_SCORE_CONFIG = {
  INITIAL_SCORE: 100,
  MAX_SCORE: 100,
  MIN_SCORE: 0,
  WARNING_THRESHOLD_DAYS: {
    WARNING_1: 1,
    WARNING_2: 2,
    PENALTY_START: 3
  },
  PENALTY_PER_DAY: 5,
  RECOVERY_PER_DAY: 2,
  SCORE_THRESHOLDS: {
    GOOD: 70,
    AT_RISK: 40
  }
};

// ============ TYPE DEFINITIONS ============
interface LastActivityRow {
  last_activity: string | null;
}

interface CreditScoreRow {
  credit_score: number | null;
}

type ScoreStatus = 'new' | 'good' | 'at_risk' | 'critical';

// ============ UTILITY FUNCTIONS ============

/**
 * Determine score status based on credit score value
 */
function getScoreStatus(creditScore: number): ScoreStatus {
  if (creditScore >= CREDIT_SCORE_CONFIG.SCORE_THRESHOLDS.GOOD) {
    return 'good';
  }
  if (creditScore >= CREDIT_SCORE_CONFIG.SCORE_THRESHOLDS.AT_RISK) {
    return 'at_risk';
  }
  return 'critical';
}

// ============ SERVICE FUNCTIONS ============

/**
 * Get the last activity date (latest machine input or waste collection) for an operator
 */
export async function getOperatorLastActivityDate(operatorId: number) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT
        GREATEST(
          COALESCE(MAX(mwi.Input_datetime), '1970-01-01'),
          COALESCE(MAX(wc.collected_at), '1970-01-01')
        ) as last_activity
      FROM accounts_tbl a
      LEFT JOIN machine_waste_input_tbl mwi ON a.Account_id = mwi.Account_id
      LEFT JOIN waste_collection_tbl wc ON a.Account_id = wc.operator_id
      WHERE a.Account_id = ?`,
      [operatorId]
    ) as [LastActivityRow[]];

    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0].last_activity;
    }
    return null;
  } finally {
    conn.release();
  }
}

/**
 * Calculate credit score based on activity gaps and consistency
 *
 * Algorithm:
 * - Start at 100 points
 * - 1 day without input: Warning 1 (no deduction)
 * - 2 days without input: Warning 2 (no deduction)
 * - 3+ days without input: Deduct -5 points per day beyond 2 days
 * - Score capped between 0-100
 */
export async function calculateCreditScore(operatorId: number) {
  try {
    const lastActivityDate = await getOperatorLastActivityDate(operatorId);

    // If no activity, assume new operator - no score yet
    if (!lastActivityDate || lastActivityDate === '1970-01-01') {
      return {
        creditScore: CREDIT_SCORE_CONFIG.INITIAL_SCORE,
        warnings: 0,
        daysMissed: 0,
        lastActivityDate: null,
        status: 'new' as ScoreStatus
      };
    }

    // Calculate days since last activity
    const lastDate = new Date(lastActivityDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    lastDate.setHours(0, 0, 0, 0);

    const daysMissed = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    let creditScore = CREDIT_SCORE_CONFIG.INITIAL_SCORE;
    let warnings = 0;

    if (daysMissed >= CREDIT_SCORE_CONFIG.WARNING_THRESHOLD_DAYS.PENALTY_START) {
      // 3+ days: deduct -5 points per day beyond 2 days
      const penaltyDays = daysMissed - CREDIT_SCORE_CONFIG.WARNING_THRESHOLD_DAYS.WARNING_2;
      creditScore = CREDIT_SCORE_CONFIG.INITIAL_SCORE - (penaltyDays * CREDIT_SCORE_CONFIG.PENALTY_PER_DAY);
      warnings = 2; // Max warnings before penalties
    } else if (daysMissed === CREDIT_SCORE_CONFIG.WARNING_THRESHOLD_DAYS.WARNING_2) {
      // 2 days: Warning 2
      warnings = 2;
    } else if (daysMissed === CREDIT_SCORE_CONFIG.WARNING_THRESHOLD_DAYS.WARNING_1) {
      // 1 day: Warning 1
      warnings = 1;
    }

    // Cap between 0-100
    creditScore = Math.max(CREDIT_SCORE_CONFIG.MIN_SCORE, Math.min(CREDIT_SCORE_CONFIG.MAX_SCORE, creditScore));
    const status = getScoreStatus(creditScore);

    return {
      creditScore,
      warnings,
      daysMissed,
      lastActivityDate,
      status
    };
  } catch (error) {
    console.error('Error calculating credit score:', error);
    throw error;
  }
}

/**
 * Get the current credit score for an operator with detailed metadata
 */
export async function getOperatorCreditScore(operatorId: number) {
  try {
    // Get calculated score
    const scoreData = await calculateCreditScore(operatorId);

    return {
      operatorId,
      creditScore: scoreData.creditScore,
      warnings: scoreData.warnings,
      daysMissed: scoreData.daysMissed,
      lastActivityDate: scoreData.lastActivityDate,
      status: scoreData.status
    };
  } catch (error) {
    console.error('Error fetching operator credit score:', error);
    throw error;
  }
}

/**
 * Update the operator's credit score in the database
 * This is called automatically after machine input or waste collection
 */
export async function updateOperatorCreditScore(operatorId: number) {
  try {
    const scoreData = await calculateCreditScore(operatorId);
    const { creditScore } = scoreData;

    const conn = await pool.getConnection();
    try {
      await conn.query(
        `UPDATE accounts_tbl SET credit_score = ? WHERE Account_id = ?`,
        [creditScore, operatorId]
      );

      return {
        success: true,
        operatorId,
        creditScore,
        ...scoreData
      };
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('Error updating operator credit score:', error);
    throw error;
  }
}

/**
 * Recover credit score by rewarding consistent activity
 * Called periodically or when operator maintains daily inputs
 */
export async function recoverCreditScore(operatorId: number) {
  try {
    const conn = await pool.getConnection();
    try {
      // Fetch current score
      const [rows] = await conn.query(
        `SELECT credit_score FROM accounts_tbl WHERE Account_id = ?`,
        [operatorId]
      ) as [CreditScoreRow[]];

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('Operator not found');
      }

      let currentScore = rows[0].credit_score ?? CREDIT_SCORE_CONFIG.INITIAL_SCORE;

      // Increase score by 2 points per day of consistent activity (up to 100)
      let recoveredScore = Math.min(CREDIT_SCORE_CONFIG.MAX_SCORE, currentScore + CREDIT_SCORE_CONFIG.RECOVERY_PER_DAY);

      await conn.query(
        `UPDATE accounts_tbl SET credit_score = ? WHERE Account_id = ?`,
        [recoveredScore, operatorId]
      );

      return {
        success: true,
        operatorId,
        previousScore: currentScore,
        recoveredScore
      };
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('Error recovering operator credit score:', error);
    throw error;
  }
}

/**
 * Get all operators with their credit scores (for admin dashboard)
 */
export async function getAllOperatorScores(limit = 100, offset = 0) {
  try {
    // Validate and sanitize inputs
    const MAX_LIMIT = 1000;
    const safeLimit = Math.min(Math.max(1, Number(limit) || 100), MAX_LIMIT);
    const safeOffset = Math.max(0, Number(offset) || 0);

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT
          a.Account_id,
          CONCAT(COALESCE(p.FirstName, ''), ' ', COALESCE(p.LastName, '')) as operator_name,
          a.credit_score
        FROM accounts_tbl a
        LEFT JOIN profile_tbl p ON a.Account_id = p.Account_id
        WHERE a.Roles = 3 AND a.IsActive = 1
        ORDER BY a.credit_score DESC
        LIMIT ? OFFSET ?`,
        [safeLimit, safeOffset]
      ) as any[];

      // Map and add status based on score
      return (rows || []).map((row: any) => ({
        Account_id: row.Account_id,
        operator_name: row.operator_name,
        credit_score: row.credit_score,
        status: getScoreStatus(row.credit_score ?? CREDIT_SCORE_CONFIG.INITIAL_SCORE)
      }));
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('Error fetching all operator scores:', error);
    throw error;
  }
}
