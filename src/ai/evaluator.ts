import { mvToPsi } from "./dataProcessor";
import { evaluateCondition } from "./rules";

export function runAI(currentData: any, rrlNormal: any) {
  const pressurePsi = mvToPsi(currentData.pressure_mv);

  const processed = {
    ...currentData,
    pressure_psi: pressurePsi
  };

  return evaluateCondition(processed, rrlNormal);
}
