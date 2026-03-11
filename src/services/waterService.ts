import db from '../config/db'; // your db connection
import { computeAverage } from '../utils/computeAverage';

export async function analyzeWaterRequirement(foodWasteKg: number) {
  console.log('[analyzeWaterRequirement] Starting with foodWasteKg:', foodWasteKg);
  
  try {
    // db.query returns [rows, fields]
    // Use SELECT * to avoid referencing a column that may not exist in some deployments.
    const [rows]: any[] = await db.query(
      `SELECT *
       FROM rrl_reference_data
       WHERE ai_role_id = 2`
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

    // Only use rows with valid numeric values and non-zero food_waste_kg
    // Some deployments/exports might use different column names; detect a water value safely.
    const detectWaterLitres = (r: any): number | null => {
      if (!r || typeof r !== 'object') return null;
      // common possible column names (litres)
      const candidates = [
        'recommended_water_l',
        'recommended_water',
        'recommended_water_liters',
        'recommended_liters',
        'water_l',
        'water_liters'
      ];
      for (const key of candidates) {
        if (Object.prototype.hasOwnProperty.call(r, key)) {
          const v = r[key];
          if (typeof v === 'number' && Number.isFinite(v)) return v;
          // sometimes stored as string
          if (typeof v === 'string' && v.trim() !== '') {
            const num = Number(v);
            if (Number.isFinite(num)) return num;
          }
        }
      }
      // handle millilitres stored in fields ending with _ml
      for (const k of Object.keys(r)) {
        if (k.toLowerCase().endsWith('_ml')) {
          const v = r[k];
          const num = typeof v === 'number' ? v : Number(v);
          if (Number.isFinite(num)) return num / 1000; // convert ml -> L
        }
      }
      return null;
    };

    const validRatios = rows
      .filter((r: any) => r && (typeof r.food_waste_kg === 'number' || typeof r.food_waste_kg === 'string'))
      .map((r: any) => {
        const fw = typeof r.food_waste_kg === 'number' ? r.food_waste_kg : Number(r.food_waste_kg);
        const water = detectWaterLitres(r);
        return (Number.isFinite(fw) && fw > 0 && water !== null && Number.isFinite(water)) ? (water / fw) : null;
      })
      .filter((v: any) => Number.isFinite(v));

    if (!validRatios || validRatios.length === 0) {
      console.warn('[analyzeWaterRequirement] No valid ratio rows, using fallback');
      return getFallbackResult(foodWasteKg);
    }

    const avgRatio = computeAverage(validRatios);
    if (!Number.isFinite(avgRatio) || Number.isNaN(avgRatio)) {
      console.warn('[analyzeWaterRequirement] avgRatio not finite, using fallback', avgRatio);
      return getFallbackResult(foodWasteKg);
    }

    const recommendedWater = Number((avgRatio * foodWasteKg).toFixed(2));
    if (!Number.isFinite(recommendedWater) || Number.isNaN(recommendedWater)) {
      console.warn('[analyzeWaterRequirement] recommendedWater invalid, using fallback', recommendedWater);
      return getFallbackResult(foodWasteKg);
    }

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
