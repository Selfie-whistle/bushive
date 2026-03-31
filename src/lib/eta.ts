

'use client';

// Straight-line distance calculation is no longer used for primary ETA.
// Keeping it for potential fallbacks or simple distance estimations.

/**
 * Calculates the distance between two geographical points in kilometers using the Haversine formula.
 * @param lat1 Latitude of the first point.
 * @param lon1 Longitude of the first point.
 * @param lat2 Latitude of the second point.
 * @param lon2 Longitude of the second point.
 * @returns The distance in kilometers.
 */
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculates a rough estimated time of arrival based on straight-line distance and constant speed.
 * @deprecated This function is not accurate for road travel. Use Google Maps Directions API for better ETAs.
 * @param distance The distance to travel in kilometers.
 * @param speed The speed in kilometers per hour.
 * @returns A string representing the travel duration.
 */
export function calculateRoughETA(distance: number, speed: number): string {
  if (speed === 0) return 'N/A';
  const timeHours = distance / speed;
  const hours = Math.floor(timeHours);
  const minutes = Math.round((timeHours - hours) * 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
