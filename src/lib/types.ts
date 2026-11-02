
export type SeatStatus = 'available' | 'booked' | 'women' | 'male' | 'unavailable';

export type Seat = {
  id: string;
  number: string;
  status: SeatStatus;
  price: number;
  row: number;
  col: number;
  deck?: 'lower' | 'upper';
  gender?: 'male' | 'female' | 'other';
};

export type SeatLayout = {
  seats: Seat[];
  lower?: { rows: Seat[][] };
  upper?: { rows: Seat[][] };
};

export type Point = {
  name: string;
  description: string;
  time: string;
  lat: number;
  lng: number;
  label: string;
  value: string;
  order?: number;
  main?: string; // Main grouping location, e.g., "Adoor"
  subPoints?: Point[]; // For nested points
};

export type PointGroup = {
  main: string;
  points: Point[];
};

export type RestStop = {
    id: string;
    name: string;
    location: string;
    description?: string;
    coordinates?: string;
    type?: 'FOOD' | 'REST' | 'SCENIC';
    duration: number; // in minutes
    amenities: string[];
    status?: 'upcoming' | 'arrived' | 'departed';
};

export type ConsoleFeatures = {
  manifest: boolean;
  attendance: boolean;
  liveTracking: boolean;
  snacks: boolean;
  restStopCheckins: boolean;
  createTicket: boolean;
  busExpenses: boolean;
  passengerTrackBus: boolean;
  passengerCallCabin: boolean;
  passengerRestStops: boolean;
  passengerAlarm: boolean;
  passengerEmergencyKit: boolean;
  photoUpdate?: boolean;
  luggageRegister?: boolean;
};

export type Service = {
  id: string;
  origin: string;
  destination: string;
  forwardBusId: string;
  returnBusId?: string;
  boardingPointsForward?: Point[];
  droppingPointsForward?: Point[];
  boardingPointsReturn?: Point[];
  droppingPointsReturn?: Point[];
};

export type Expense = {
  id: string;
  type: 'fuel' | 'service' | 'repair' | 'parking' | 'fine' | 'other';
  amount: number;
  description?: string;
  litres?: number;
  timestamp: string;
};

export type Bus = {
  id: string;
  operatorId: string;
  operator?: string | null;
  travelsName: string;
  rating?: number | null;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration?: string | null;
  baseFare: number;
  amenities: string[];
  seatLayout: SeatLayout;
  busType?: string | null;
  busCategory: string;
  busModel?: string | null;
  busNumber: string;
  contactNumber?: string | null;
  cabinCrewId?: string | null;
  driver1?: string;
  driver2?: string;
  cleaner1?: string;
  cleaner2?: string;
  totalSeats?: number | null;
  route?: string[];
  serviceId?: string; // Links bus to a Service
  availableDates?: string[];
  liveLocation?: { lat: number; lng: number; ts: number; heading?: number | null; speed?: number | null; accuracy?: number | null; } | null;
  liveRoute?: { origin: string; destination: string; } | null;
  consoleFeatures?: ConsoleFeatures;
  expenses?: Expense[];
  boardingPointsForward?: Point[];
  droppingPointsForward?: Point[];
  boardingPointsReturn?: Point[];
  droppingPointsReturn?: Point[];
  images?: string[];         // Bus-specific image URLs
  operatorImages?: string[]; // Shared across all buses under this operator
};

export type EmergencyKitRequest = {
    bookingId: string;
    seatNumber: string;
    passengerName: string;
    timestamp: string;
    status: 'pending' | 'acknowledged';
};

export type StopRequest = {
    id: string;
    scheduleId: string;
    bookingId: string;
    seatNumber: string;
    passengerName: string;
    type: 'washroom' | 'vomiting';
    status: 'pending' | 'responded' | 'resolved';
    requestedAt: string;
    responseMessage?: string;
    respondedAt?: string;
    acknowledgedByPassenger?: boolean;
    acknowledgedAt?: string;
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'alert' | 'trip';
  read: boolean;
  createdAt: string;
};

export type Review = {
  id: string;
  bookingId: string;
  busId: string;
  busRating: number;
  appRating: number;
  busFeedback: string;
  appFeedback: string;
  passengerName: string;
  timestamp: string;
};

export type Schedule = {
    id: string;
    busId: string; // The primary bus ID for the route (e.g. forward bus)
    serviceId?: string; // Identifies the service route (e.g. Punalur-Bangalore)
    actualBusId?: string; // The specific bus running this schedule on this day
    date: string; // YYYY-MM-DD
    direction?: 'FORWARD' | 'RETURN';
    fare: number; // Represents the LOWEST available fare for searching
    totalSeats: number;
    availableSeats: number;
    bookings: { 
        seat: string; 
        gender: 'male' | 'female' | 'other'; 
        userId: string, 
        bookingId: string, 
        boarded?: boolean, 
        deboarded?: boolean,
        snackDistributed?: boolean,
        bookedAt?: string,
        boardingPoint?: string,
        boardingMain?: string,
        passengerName?: string,
        blocked?: boolean,
    }[];
    seatPrices: { [key: string]: number };
    stopStatuses?: { [stopId: string]: { status: 'arrived' | 'departed' | 'upcoming'; timestamp: string; checkedInSeats?: string[] } };
    attendance?: { [role: string]: { timestamp: string, onHotseat?: boolean, duty?: 'first' | 'second' | null, hotseatSince?: string, dutyLocked?: boolean } };
    kitRequests?: EmergencyKitRequest[];
    stopRequests?: StopRequest[];
    activeStopRequest?: StopRequest | null;
    createdAt?: Date | null;
    tripStatus?: 'not-started' | 'in-progress' | 'completed';
    broadcast?: {
        message: string;
        timestamp: string;
    };
    emergencyAlarm?: {
        active: boolean;
        timestamp: string;
        seatNumber: string;
        passengerName: string;
        bookingId: string;
        severe?: boolean;
        severeAt?: string;
        withdrawn?: boolean;
        withdrawnAt?: string;
    };
    emergencyHistory?: {
        timestamp: string;
        seatNumber: string;
        passengerName: string;
        bookingId: string;
        respondedAt?: string;
        status: 'responded' | 'withdrawn';
        severe?: boolean;
        severeAt?: string;
        withdrawn?: boolean;
        withdrawnAt?: string;
        issueReport?: string;
        reportedAt?: string;
        adminApproved?: boolean;
        adminApprovedAt?: string;
        aiAnalysis?: string;
        reportRequested?: boolean;
        reportRequestedAt?: string;
    }[];
    pendingReportRequest?: {
        id?: string;
        incidentTimestamp: string;
        scheduleId: string;
        seatNumber: string;
        passengerName: string;
        requestedAt: string;
        active?: boolean;
    };
};

export type Passenger = {
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  price: number;
  seatNumber: string;
  previousSeatNumber?: string;
};

export type Booking = {
  id: string;
  pnr?: string;
  userId: string;
  busId: string;
  scheduleId: string; // Link to the specific schedule
  passengers: Passenger[];
  contact: { email?: string; phone: string; };
  boardingPoint: string;
  droppingPoint: string;
  boardingMain: string;
  boardingTime: string;
  droppingMain: string;
  droppingTime: string;
  baseFare: number;
  taxes: number;
  discount: number;
  totalFare: number;
  bookingDate: string; // The date of the journey
  status: 'CONFIRMED' | 'CANCELLED' | 'PENDING' | 'FAILED';
  busDetails: {
    name: string;
    operator: string;
    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
    duration: string;
    busNumber: string;
    contactNumber?: string;
    boardingPoints?: Point[];
    droppingPoints?: Point[];
    boardingPointsReturn?: Point[];
    droppingPointsReturn?: Point[];
    locationApiUrl?: string;
  };
  createdAt: string;
  boardedAt?: string;
  deboardedAt?: string;
  scheduleBookings?: { seat: string; gender: 'male' | 'female' | 'other'; userId: string, bookingId: string, boarded?: boolean }[];
  generatedBy?: 'crew' | 'owner' | 'user';
};

export interface PremiumSubscription {
  userId: string;
  status: 'active' | 'expired';
  planName: string;
  startDate: any; // Firestore Timestamp
  expiryDate: any; // Firestore Timestamp
  currentYear: number; // 1, 2, 3, 4
  currentYearTrips: number; // 0 to 32
  totalTripsCompleted: number;
  mealBenefits: { tripId: string; code: string; isServed: boolean; servedAt?: string }[];
}

export type MealLog = {
  code: string;
  userId: string;
  tripId: string;
  operatorId: string;
  timestamp: string;
  isServed: boolean;
  crewEmail: string;
};

export type LuggageRecord = {
  id: string;
  scheduleId: string;
  busId: string;
  passengerName: string;
  seatNumber?: string;
  boardingPoint?: string;
  droppingPoint?: string;
  itemsCount?: number;
  weight?: number;
  description?: string;
  amount?: number;
  timestamp: string;
  crewEmail: string;
};
