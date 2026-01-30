export function mvToPsi(mv: number): number {
  // 500mv = 0 psi
  // 4500mv = 30 psi
  return ((mv - 500) * 30) / (4500 - 500);
}

export function computeAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Helper to compute average while ignoring nulls
export function computeAverageIgnoringNull(values: (number | null)[]): number | null {
  const validValues = values.filter((v): v is number => v !== null);
  if (validValues.length === 0) return null;
  return computeAverage(validValues);
}
