export function mvToPsi(mv: number): number {
  return ((mv - 500) * 30) / (4500 - 500);
}

export function computeAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Average ignoring nulls
export function computeAverageIgnoringNull(values: (number | null)[]): number | null {
  const validValues = values.filter((v): v is number => v !== null);
  if (validValues.length === 0) return null;
  return computeAverage(validValues);
}

// Feeding recommendation stub
export function computeFeeding(ph: number, temperature_c: number): number {
  // Example: 10 kg if pH < 6.8, 15 kg otherwise
  return ph < 6.8 ? 10 : 15;
}
