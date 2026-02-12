import db from '../config/db'; // your db connection
import { computeAverage } from '../utils/computeAverage';

export async function analyzeWaterRequirement(foodWasteKg: number) {
  console.log('[analyzeWaterRequirement] Starting with foodWasteKg:', foodWasteKg);
  
  try {
    // db.query returns [rows, fields]
    const [rows]: any[] = await db.query(
      `SELECT recommended_water_l, food_waste_kg
       FROM rrl_reference_data
       WHERE ai_role_id = 2
         AND recommended_water_l IS NOT NULL`
    );

    console.log('[analyzeWaterRequirement] Query returned rows:', rows?.length || 0);

    if (!rows || rows.length === 0) {
      // No reference data found - return a default ratio estimate
      console.warn('[analyzeWaterRequirement] No reference data found, using default ratio');
      return getFallbackResult(foodWasteKg);
    }

    const ratios = rows.map(
      (r: any) => r.recommended_water_l / r.food_waste_kg
    );

    const avgRatio = computeAverage(ratios);
    const recommendedWater = Number((avgRatio * foodWasteKg).toFixed(2));

    return {
      foodWasteKg,
      recommendedWater,
      explanation: `For your ${foodWasteKg}kg of food waste, Lili recommends ${recommendedWater}L of water to achieve the optimal 8-12% solids content for anaerobic digestion.`
    };
  } catch (error: any) {
    console.error('[analyzeWaterRequirement] DB error:', error?.message || error);
    // Return fallback when database is unavailable
    return getFallbackResult(foodWasteKg);
  }
}

function getFallbackResult(foodWasteKg: number) {
  // Default ratio: approximately 0.5L water per kg of food waste
  // Based on typical anaerobic digestion recommendations
  const defaultRatio = 0.5;
  const recommendedWater = Number((defaultRatio * foodWasteKg).toFixed(2));
  return {
    foodWasteKg,
    recommendedWater,
    explanation: `For your ${foodWasteKg}kg of food waste, Lili recommends approximately ${recommendedWater}L of water for optimal grinding.`
  };
}
