import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format as fnsFormat, parse, parseISO, addDays as fnsAddDays, isValid, isBefore as isBeforeFns } from 'date-fns';
import { getAdjacentSeat } from "./utils/seatRules";
import type { Point } from "./types";
import { resolvePointAny } from "./point-resolver";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(timeString: string) {
  if (!timeString || !timeString.includes(':')) return timeString;
  try {
    const date = parse(timeString, 'HH:mm', new Date());
    if (!isValidDate(date)) return timeString;
    return fnsFormat(date, 'h:mm a');
  } catch (e) {
    console.error("Invalid time format:", timeString);
    return timeString;
  }
}

export function formatIndianTime(timeString: string) {
  return `${formatTime(timeString)} IST`;
}

export function formatIndianDate(date: Date | null) {
    if (!date || !isValidDate(date)) return 'Invalid Date';
    return fnsFormat(date, 'dd MMMM yyyy, EEEE');
}

/**
 * Checks if a seat can be selected based on gender of adjacent booked seat.
 * @param seat The seat number being considered for selection.
 * @param gender The gender of the passenger who would take this seat.
 * @param bookings The array of existing bookings.
 * @param selectedSeats The array of seats currently selected by the user.
 * @returns `true` if the seat can be selected, `false` otherwise.
 */
export function canSelectSeat(
  seat: string,
  gender: 'male' | 'female' | 'other' | undefined,
  bookings: { seat: string; gender: 'male' | 'female' | 'other' }[],
  selectedSeats: string[]
): boolean {
  const adjacent = getAdjacentSeat(seat);

  if (!adjacent) return true; // singles have no restriction

  // if the user is booking both paired seats in this selection → allow
  if (selectedSeats.includes(adjacent)) return true;

  const booked = bookings.find((b) => b.seat === adjacent);

  // if adjacent seat is empty → allowed
  if (!booked) return true;

  // if same gender → allowed
  return booked.gender === gender;
}

/**
 * Correctly calculates a scheduled date and time, handling overnight journeys.
 * @param journeyDate The base date of the journey (e.g., '2024-08-01' or a full ISO string).
 * @param targetTime The time to calculate for (e.g., '06:00' for arrival).
 * @param departureTime The main departure time of the bus to determine day change (e.g., '18:00').
 * @returns A Date object representing the correct scheduled datetime.
 */
export function getScheduledDateTime(
    journeyDate: string | Date,
    targetTime: string,
    departureTime?: string,
): Date | null {
  if (!journeyDate || !targetTime || !/^\d{2}:\d{2}(:\d{2})?$/.test(targetTime)) {
    return null;
  }
  
  let baseDate: Date;
  if (typeof journeyDate === 'string') {
    baseDate = parseISO(journeyDate.split('T')[0]);
  } else {
    baseDate = new Date(journeyDate);
  }
  
  if (!isValid(baseDate)) {
    return null;
  }

  // Ensure base date starts at midnight
  baseDate.setHours(0, 0, 0, 0);

  const [targetHours, targetMinutes] = targetTime.split(':').map(Number);
  if (isNaN(targetHours) || isNaN(targetMinutes)) return null;
  
  const targetDateTime = new Date(baseDate);
  targetDateTime.setHours(targetHours, targetMinutes, 0, 0);

  // If a departure time is provided, use it to detect overnight journeys
  if (departureTime && /^\d{2}:\d{2}(:\d{2})?$/.test(departureTime)) {
    const [depHours, depMinutes] = departureTime.split(':').map(Number);
    if (!isNaN(depHours) && !isNaN(depMinutes)) {
        const totalTargetMinutes = targetHours * 60 + targetMinutes;
        const totalDepartureMinutes = depHours * 60 + depMinutes;

        // If the target time is numerically earlier than the reference departure time, 
        // it usually means the event happens on the following day (Day 2).
        // However, boarding points can be slightly before the main departure time on the SAME day.
        // We assume it's the next day if we are jumping from PM to AM, or if the difference is large.
        if (totalTargetMinutes < totalDepartureMinutes) {
          // If the difference is small (less than 4 hours), it's likely an early boarding point on the same day.
          // Otherwise, it's an overnight journey reaching the next day.
          const isEarlyBoarding = (totalDepartureMinutes - totalTargetMinutes) < 4 * 60;
          if (!isEarlyBoarding) {
            targetDateTime.setDate(targetDateTime.getDate() + 1);
          }
        }
    }
  }

  return targetDateTime;
}


/**
 * Finds the index of the best matching point in a route array.
 * It uses a case-insensitive, trimmed comparison.
 * @param routePoints An array of points with a `name` property.
 * @param pointName The name of the point to search for.
 * @returns The index of the best match, or -1 if not found.
 */
export function findBestMatchIndex(routePoints: Point[], pointName?: string, currentLocation?: {lat: number, lng: number}) {
  if ((!pointName && !currentLocation) || !routePoints || routePoints.length === 0) return -1;
  
  if (pointName) {
    const normalizedPoint = pointName.toLowerCase().trim();
    let bestMatchIndex = -1;
    let lowestDistance = Infinity;

    // Levenshtein distance function to find "closest" string match
    const levenshtein = (a: string, b: string): number => {
      if (a.length === 0) return b.length;
      if (b.length === 0) return a.length;
      const matrix = [];
      for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
      }
      for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
      }
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
          }
        }
      }
      return matrix[b.length][a.length];
    };

    routePoints.forEach((point, index) => {
      if (!point || !point.name) return;
      const normalizedRoutePoint = point.name.toLowerCase().trim();
      
      // Exact match is always preferred
      if (normalizedRoutePoint === normalizedPoint) {
          bestMatchIndex = index;
          lowestDistance = 0;
          return; // Found exact match, can stop early
      }

      // If we are already on an exact match, don't check for fuzzy matches
      if(lowestDistance === 0) return;

      // Fuzzy match for close names
      const distance = levenshtein(normalizedRoutePoint, normalizedPoint);
      if (distance < lowestDistance) {
        lowestDistance = distance;
        bestMatchIndex = index;
      }
    });

    // Only accept fuzzy matches if they are very close (e.g., distance < 3)
    if (lowestDistance > 2) {
      // Check for main location as a fallback
      const mainMatch = routePoints.findIndex(p => p.main?.toLowerCase().trim() === normalizedPoint);
      if(mainMatch !== -1) return mainMatch;
    }
    
    return bestMatchIndex;
  }

  if (currentLocation) {
    let closestPointIndex = -1;
    let minDistance = Infinity;

    routePoints.forEach((point, index) => {
        if(point.lat && point.lng) {
            const distance = Math.sqrt(Math.pow(currentLocation.lat - point.lat, 2) + Math.pow(currentLocation.lng - point.lng, 2));
            if (distance < minDistance) {
                minDistance = distance;
                closestPointIndex = index;
            }
        }
    });

    return closestPointIndex;
  }

  return -1;
}

export function isValidDate(d?: Date | null): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
}

export { getAdjacentSeat, resolvePointAny };