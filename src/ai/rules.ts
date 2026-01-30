export function evaluateCondition(
  current: any,
  reference: any
) {
  if (current.ph < reference.ph - 0.5) {
    return {
      status: "CRITICAL",
      reason: "pH dropped significantly",
      recommendation: "Stop feeding and monitor acidity"
    };
  }

  if (current.temperature_c < reference.temperature_c - 3) {
    return {
      status: "WARNING",
      reason: "Temperature below optimal range",
      recommendation: "Insulate digester or reduce feeding"
    };
  }

  return {
    status: "NORMAL",
    reason: "All parameters within stable range",
    recommendation: "Continue normal operation"
  };
}
