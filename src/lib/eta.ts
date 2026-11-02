

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

/**
 * Calculates real-time distance and estimated time of arrival (ETA) for a rest stop from live bus location.
 */
export function calculateRestStopEta(
  currentLocation: { lat: number; lng: number; speed?: number | null } | null | undefined,
  stopCoordinates: string | { lat: number; lng: number } | null | undefined
): { distance: string; remainingTime: string; eta: string; durationMinutes: number } | null {
  if (!currentLocation || typeof currentLocation.lat !== 'number' || typeof currentLocation.lng !== 'number') return null;
  if (!stopCoordinates) return null;

  let stopLat: number | null = null;
  let stopLng: number | null = null;

  if (typeof stopCoordinates === 'object' && 'lat' in stopCoordinates && 'lng' in stopCoordinates) {
    stopLat = Number((stopCoordinates as any).lat);
    stopLng = Number((stopCoordinates as any).lng);
  } else if (typeof stopCoordinates === 'string') {
    const parts = stopCoordinates.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      stopLat = parts[0];
      stopLng = parts[1];
    }
  }

  if (stopLat === null || stopLng === null || isNaN(stopLat) || isNaN(stopLng)) return null;

  const straightKm = getDistanceKm(currentLocation.lat, currentLocation.lng, stopLat, stopLng);
  // Real driving distance accounts for road curves (~1.3x straight line)
  const roadKm = straightKm * 1.3;
  
  // Speed in km/h (minimum 35, maximum 65, default 50 for buses)
  let speedKmH = 50;
  if (currentLocation.speed && currentLocation.speed > 15) {
    speedKmH = Math.min(65, Math.max(35, currentLocation.speed));
  }

  const durationMinutes = Math.max(1, Math.round((roadKm / speedKmH) * 60));
  const etaDate = new Date(Date.now() + durationMinutes * 60000);
  const eta = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let remainingTime = '';
  if (durationMinutes < 60) {
    remainingTime = `${durationMinutes} min`;
  } else {
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    remainingTime = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  const distance = roadKm >= 1 ? `${roadKm.toFixed(1)} km` : `${Math.round(roadKm * 1000)} m`;

  return {
    distance,
    remainingTime,
    eta,
    durationMinutes,
  };
}
