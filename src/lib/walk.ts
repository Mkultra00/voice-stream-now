// Walking-time estimates. Straight-line distance underestimates city walking,
// so apply a street-grid detour factor and an average pedestrian pace.
const DETOUR = 1.35; // sidewalk/grid routing vs straight line
const METERS_PER_MIN = 78; // ~4.7 km/h with crossings and lights

export function walkMinutes(distanceM: number): number {
  return Math.max(1, Math.round((distanceM * DETOUR) / METERS_PER_MIN));
}

export function formatWalk(minutes: number): string {
  if (minutes < 60) return `${minutes} min walk`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min walk` : `${h} h walk`;
}

export function formatDistance(distanceM: number): string {
  return distanceM < 1000 ? `${distanceM} m` : `${(distanceM / 1000).toFixed(1)} km`;
}
