export function calculateTravelMinutes(distanceMiles = 0, averageMph = 55) {
  const miles = Number(distanceMiles) || 0;
  const mph = Number(averageMph) || 55;
  if (miles <= 0 || mph <= 0) return 0;
  return Math.round((miles / mph) * 60);
}
