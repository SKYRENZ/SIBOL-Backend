import { Request, Response } from 'express';
import { analyzeWaterRequirement } from '../services/waterService';

export async function analyzeWater(req: Request, res: Response) {
  const { food_waste_kg } = req.body;

  if (!food_waste_kg) {
    return res.status(400).json({ error: 'food_waste_kg is required' });
  }

  const result = await analyzeWaterRequirement(food_waste_kg);
  res.json(result);
}
