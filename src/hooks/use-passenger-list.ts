
'use client';

import { useEffect, useState } from "react";
import type { Schedule } from '@/lib/types';
import { dataService } from "@/lib/data/client-service";

type PassengerInfo = {
    seat: string;
    gender: 'male' | 'female' | 'other';
    userId: string;
    bookingId: string;
    bookedAt: string;
    passengerName?: string;
};

export function usePassengerList(schedule: Schedule | null) {
  const [passengers, setPassengers] = useState<PassengerInfo[]>([]);

  useEffect(() => {
    async function fetchPassengerDetails() {
      if (!schedule || !schedule.bookings) {
        setPassengers([]);
        return;
      }
      
      const passengerPromises = schedule.bookings.map(async (bookingRef) => {
        if (!bookingRef.userId || !bookingRef.bookingId) return { ...bookingRef, passengerName: 'Unknown' };

        const bookingDetails = await dataService.getBookingById(bookingRef.userId, bookingRef.bookingId);
        return {
            ...bookingRef,
            passengerName: bookingDetails?.passengers?.[0]?.name || 'Unknown',
            bookedAt: (bookingRef as any).bookedAt,
        };
      });
      
      const detailedPassengers = await Promise.all(passengerPromises);
      setPassengers(detailedPassengers);
    }

    fetchPassengerDetails();
  }, [schedule]);

  return passengers;
}
