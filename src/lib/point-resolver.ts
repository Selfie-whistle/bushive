
'use client';

import type { Point } from './types';

/**
 * Resolves a boarding or dropping STOP from a route.
 * IMPORTANT:
 * - `main`  → main city (Bangalore)
 * - `name`  → sub point / stop (Majestic)
 * This avoids mixing city & stop names.
 */
export function resolvePointAny(
  points: Point[] | undefined,
  bookingValue: any
): Point | null {
  if (!points || !bookingValue) return null;

  const bookingName =
    typeof bookingValue === 'string'
      ? bookingValue.trim().toLowerCase()
      : bookingValue?.name?.trim().toLowerCase();

  if (!bookingName) return null;

  for (const p of points) {
    // This is a direct match on a standalone point
    if (p.name?.trim().toLowerCase() === bookingName) {
      return p;
    }
  }

  // Fallback for safety, though it should be rare if data is structured well
  const fallbackPoint: Point = {
    name: typeof bookingValue === 'string' ? bookingValue : 'Unknown',
    time: '--',
    main: typeof bookingValue === 'string' ? bookingValue : 'Unknown',
    description: '',
    lat: 0,
    lng: 0,
    label: '',
    value: '',
  };
  
  return fallbackPoint;
}

/**
 * Legacy resolver (unchanged, still valid for seat logic etc.)
 */
export function resolvePoint(
  pointName: string,
  points: Point[] | undefined,
  strategy: 'earliest' | 'latest' = 'earliest'
): Point | null {
  if (!pointName || !points?.length) return null;

  const search = pointName.trim().toLowerCase();

  const sub = points.find(
    (p: any) => p.name?.toLowerCase() === search
  );
  if (sub) return sub;

  const mainMatches = points.filter(
    (p: any) => p.main?.toLowerCase() === search
  );

  if (mainMatches.length > 0) {
    mainMatches.sort((a: any, b: any) => {
      return strategy === 'latest'
        ? b.time.localeCompare(a.time)
        : a.time.localeCompare(b.time);
    });
    return mainMatches[0];
  }

  return null;
}
