import { Request, Response } from 'express';
import { analyzeWaterRequirement } from '../services/waterService';

export async function analyzeWater(req: Request, res: Response) {
  try {
    // Log incoming request details for diagnosis in production
    console.log('[analyzeWater] headers:', JSON.stringify(req.headers || {}).slice(0, 1000));
    console.log('[analyzeWater] body:', JSON.stringify(req.body || {}).slice(0, 1000));

    const { food_waste_kg } = req.body;

    if (!food_waste_kg) {
      console.warn('[analyzeWater] missing food_waste_kg');
      return res.status(400).json({ error: 'food_waste_kg is required' });
    }

    const result = await analyzeWaterRequirement(food_waste_kg);
    res.json(result);
  } catch (error: any) {
    console.error('[analyzeWater] Error:', error && error.stack ? error.stack : error);
    // Ensure we return JSON (avoid HTML error pages). Include stack to help remote-host debugging.
    return res.status(500).json({
      error: 'Failed to analyze water requirement',
      message: error?.message || 'Unknown error',
      details: error?.stack || null
    });
  }
}
