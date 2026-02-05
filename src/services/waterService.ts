import db from '../config/db'; // your db connection
import { computeAverage } from '../utils/computeAverage';

export async function analyzeWaterRequirement(foodWasteKg: number) {
  // db.query returns [rows, fields]
  const [rows]: any[] = await db.query(
    `SELECT recommended_water_l, food_waste_kg
     FROM rrl_reference_data
     WHERE ai_role_id = 2
       AND recommended_water_l IS NOT NULL`
  );

  const ratios = rows.map(
    (r: any) => r.recommended_water_l / r.food_waste_kg
  );

  const avgRatio = computeAverage(ratios);
  const recommendedWater = Number((avgRatio * foodWasteKg).toFixed(2));

  return {
    foodWasteKg,
    recommendedWater,
    explanation: `
Based on previous biogas studies, raw food waste contains high moisture
but still needs dilution to form a slurry suitable for anaerobic digestion.

Scientific literature suggests maintaining a total solids content of
around 8–12%. Using reference data, the system calculated an average
water-to-waste ratio and applied it to your input.
`
  };
}
