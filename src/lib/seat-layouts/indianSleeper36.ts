
import type { Seat } from '../types';

export function generateIndianSleeper36Layout() {
  const seats: Seat[] = [];
  const seatPrice = 1750; // Default price, can be overridden

  // This function assumes a specific layout and numbering scheme.
  // Adjust as necessary for different bus layouts.

  const createSeat = (number: string, deck: 'lower' | 'upper', row: number, col: number): Seat => ({
    id: number,
    number,
    deck,
    row,
    col,
    status: 'available',
    price: seatPrice
  });

  // Lower Deck
  for (let i = 0; i < 6; i++) {
    // Single row
    seats.push(createSeat(`L${i * 3 + 1}`, 'lower', 2, i));
    // Double row
    seats.push(createSeat(`L${i * 3 + 2}`, 'lower', 1, i));
    seats.push(createSeat(`L${i * 3 + 3}`, 'lower', 0, i));
  }

  // Upper Deck
  for (let i = 0; i < 6; i++) {
    // Single row
    seats.push(createSeat(`U${i * 3 + 1}`, 'upper', 2, i));
    // Double row
    seats.push(createSeat(`U${i * 3 + 2}`, 'upper', 1, i));
    seats.push(createSeat(`U${i * 3 + 3}`, 'upper', 0, i));
  }

  return {
    seats
  };
}
