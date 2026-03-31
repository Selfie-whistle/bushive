/**
 * For a given sleeper seat, returns the adjacent seat in a pair.
 * Returns null if the seat is a single seat.
 * @param seat The seat number (e.g., "L2").
 * @returns The adjacent seat number (e.g., "L3") or null.
 */
export function getAdjacentSeat(seat: string): string | null {
  const prefix = seat[0]; // L or U
  const num = parseInt(seat.slice(1));

  if (num % 3 === 2) {
    // 2, 5, 8, 11, 14, 17 → first in pair
    return `${prefix}${num + 1}`;
  }

  if (num % 3 === 0) {
    // 3, 6, 9, 12, 15, 18 → second in pair
    return `${prefix}${num - 1}`;
  }

  return null; // 1, 4, 7, 10, 13, 16 → single sleeper
}
