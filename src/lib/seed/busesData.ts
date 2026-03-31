
import { generateIndianSleeper36Layout } from '../seat-layouts/indianSleeper36';

// This is sample data. You can add more bus details here.
export const initialBuses = [
  {
    id: "KL05BC9435",
    travelsName: 'CLUB ANAND TRAVEL',
    busType: 'A/C Sleeper(2+1)',
    busCategory: 'Sleeper' as 'Sleeper' | 'Seater' | 'Seater + Sleeper',
    busModel: 'BharatBenz Glider',
    operatorId: 'some-admin-uid-placeholder-1', // This should be a real admin UID
    operator: 'CLUB ANAND TRAVEL',
    origin: 'Punalur',
    destination: 'Bangalore',
    departureTime: '16:00',
    arrivalTime: '06:00',
    duration: '14h 0m',
    busNumber: 'KL 05 BC 9435',
    contactNumber: '9747399900',
    amenities: ['A/C', 'Live Tracking', 'Water Bottle', 'Charging Point'],
    baseFare: 1750,
    rating: 4.8,
    totalSeats: 36,
    seatLayout: generateIndianSleeper36Layout(),
    // Route points would be populated by the route editor
    boardingPointsForward: [], 
    droppingPointsForward: [],
    boardingPointsReturn: [],
    droppingPointsReturn: [],
  }
];
