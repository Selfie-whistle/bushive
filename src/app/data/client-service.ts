

'use client';

import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  runTransaction,
  Firestore,
} from 'firebase/firestore';
import type { Booking, Bus as BusType, SeatLayout, Schedule, PointGroup, Point } from '../types';
import { initializeFirebase } from '@/firebase';
import { generateIndianSleeper36Layout } from '../seat-layouts/indianSleeper36';

let db: Firestore;
const getDb = () => {
    if (!db) {
        db = initializeFirebase().firestore;
    }
    return db;
};

const normalize = (v: string) => v.toLowerCase().trim();

function matchesOrigin(bus: any, searchOrigin: string) {
  const o = normalize(searchOrigin);

  // ✅ main origin
  if (normalize(bus.origin) === o) return true;

  // ✅ boarding / sub boarding points
  if (bus.boardingPoints?.some((group: PointGroup) => 
    group.subBoardingPoints.some(p => normalize(p.name) === o)
  )) return true;

  // ✅ route pass-through (IMPORTANT)
  if (bus.route?.some((r: string) => normalize(r) === o)) return true;

  return false;
}

export const dataService = {
  // ✅ GET ALL BUSES
  async getBuses() {
    const snapshot = await getDocs(collection(getDb(), "buses"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
  },

  // ✅ GET BUS BY ID
  async getBusById(id: string) {
    const ref = doc(getDb(), "buses", id);
    const snap = await getDoc(ref);
  
    if (!snap.exists()) return null;
  
    const data = snap.data();
  
    return {
      id: snap.id,
      ...data,
      boardingPoints: data.boardingPoints || [],
      droppingPoints: data.droppingPoints || []
    } as BusType;
  },

  // ✅ ADD BUS
  async addBus(bus: any) {
    const busData = { ...bus };
    if (bus.seatLayout === 'indiansleeper36layout') {
        const layout = generateIndianSleeper36Layout();
        busData.seatLayout = layout;
        busData.totalSeats = layout.seats.length;
    }
    const ref = doc(getDb(), "buses", bus.id);
    await setDoc(ref, busData);
    return busData;
  },

  // ✅ SCHEDULES
  async getSchedules() {
    const snap = await getDocs(collection(getDb(), "schedules"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  },

  async addSchedule(schedule: any) {
    const scheduleRef = doc(getDb(), "schedules", schedule.id);
    const docSnap = await getDoc(scheduleRef);
    if (docSnap.exists()) {
        throw new Error(`Schedule with ID ${schedule.id} already exists.`);
    }
    await setDoc(scheduleRef, { ...schedule, createdAt: new Date().toISOString() });
    return schedule;
  },

  async deleteSchedule(id: string) {
    const scheduleRef = doc(getDb(), 'schedules', id);
    const scheduleSnap = await getDoc(scheduleRef);
    if (!scheduleSnap.exists() || (scheduleSnap.data().bookings?.length || 0) > 0) {
      return { success: false, message: 'Cannot delete non-existent or booked schedule.' };
    }
    await deleteDoc(scheduleRef);
    return { success: true };
  },

  async deleteBusAndSchedules(busId: string) {
    await deleteDoc(doc(getDb(), "buses", busId));

    const q = query(collection(getDb(), "schedules"), where("busId", "==", busId));
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }

    return { success: true };
  },

  async updateBusSeatLayout(busId: string, newSeatLayout: SeatLayout): Promise<{ success: boolean; }> {
    const busRef = doc(getDb(), 'buses', busId);
    await setDoc(busRef, { seatLayout: newSeatLayout }, { merge: true });
    return { success: true };
  },
  
  async updateBusPoints(busId: string, points: { boardingPoints: PointGroup[], droppingPoints: Point[] }): Promise<{ success: boolean; }> {
    const busRef = doc(getDb(), 'buses', busId);
    await setDoc(busRef, { boardingPoints: points.boardingPoints, droppingPoints: points.droppingPoints }, { merge: true });
    return { success: true };
  },

  async getAllSchedules() {
    const snap = await getDocs(collection(getDb(), "schedules"));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  },

  getSchedulesForDate: async(date: string): Promise<Schedule[]> => {
    const q = query(collection(getDb(), 'schedules'), where('date', '==', date));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Schedule));
  },

  updateScheduleSeatPrices: async (scheduleId: string, seatPrices: { [key: string]: number }, fare: number): Promise<void> => {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    await setDoc(scheduleRef, { seatPrices, fare }, { merge: true });
  },

  addTicket: async (ticket: any): Promise<Booking> => {
    const ticketRef = await addDoc(collection(getDb(), 'users', ticket.userId, 'bookings'), ticket);
    return { ...ticket, id: ticketRef.id };
  },

  getUserTickets: async (mobile: string): Promise<Booking[]> => {
    console.warn("Searching tickets by phone number on the client is inefficient and not implemented for Firestore.");
    // This would typically require a server-side query or a different data structure.
    return [];
  },

  searchBuses: async (origin: string, destination: string, date: string): Promise<{ bus: BusType; schedule: Schedule }[]> => {
    const o = normalize(origin);
    const d = normalize(destination);
  
    // 1️⃣ Load schedules for date
    const schedulesSnap = await getDocs(
      query(
        collection(getDb(), 'schedules'),
        where('date', '==', date)
      )
    );
  
    const results: { bus: any; schedule: any }[] = [];
  
    for (const schedDoc of schedulesSnap.docs) {
      const schedule = { id: schedDoc.id, ...schedDoc.data() };
  
      // 2️⃣ Load bus
      const busDoc = await getDoc(doc(getDb(), 'buses', schedule.busId));
      if (!busDoc.exists()) continue;
  
      const bus = { id: busDoc.id, ...busDoc.data() };
  
      // ✅ destination must match
      if (normalize(bus.destination) !== d) continue;
  
      // ✅ origin / sub-boarding match
      if (!matchesOrigin(bus, origin)) continue;
  
      results.push({ bus, schedule });
    }
  
    return results;
  },

  getScheduleById: async (id: string) => {
    const ref = doc(getDb(), "schedules", id);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() as any } : null;
  },

  async getSchedule(id: string) {
    return dataService.getScheduleById(id);
  },

  getBookingById: async (userId: string, bookingId: string): Promise<Booking | null> => {
    const bookingRef = doc(getDb(), 'users', userId, 'bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);
    if (!bookingSnap.exists()) return null;

    const bookingData = bookingSnap.data() as Omit<Booking, 'id'>;
    const bus = await dataService.getBusById(bookingData.busId);

    const fullBooking: Booking = {
      ...bookingData,
      id: bookingSnap.id,
      busDetails: {
          name: bus?.travelsName || 'Unknown Bus',
          operator: bus?.operator || 'Unknown Operator',
          origin: bus?.origin || 'Unknown',
          destination: bus?.destination || 'Unknown',
          departureTime: bus?.departureTime || '',
          arrivalTime: bus?.arrivalTime || '',
          duration: bus?.duration || '',
          busNumber: bus?.busNumber || '',
          boardingPoints: bus?.boardingPoints || [],
          droppingPoints: bus?.droppingPoints || [],
      }
    };
    return fullBooking;
  },

  bookSeats: async (scheduleId: string, seats: { seatNumber: string; gender: string }[], userId: string, bookingId: string) => {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    try {
        await runTransaction(getDb(), async (transaction) => {
            const scheduleDoc = await transaction.get(scheduleRef);
            if (!scheduleDoc.exists()) {
                throw new Error("Schedule not found.");
            }

            const scheduleData = scheduleDoc.data() as Schedule;
            const existingBookings = scheduleData.bookings || [];

            for (const seat of seats) {
                if (existingBookings.some((b: any) => b.seat === seat.seatNumber)) {
                    throw new Error(`Seat ${seat.seatNumber} is already booked.`);
                }
            }

            const newBookings = seats.map(s => ({ seat: s.seatNumber, gender: s.gender, userId, bookingId, bookedAt: new Date().toISOString() }));
            const updatedBookings = [...existingBookings, ...newBookings];
            
            transaction.update(scheduleRef, {
                bookings: updatedBookings,
                availableSeats: scheduleData.availableSeats - seats.length
            });
        });
        return { success: true };
    } catch (error: any) {
        console.error("Booking transaction failed:", error);
        return { success: false, message: error.message };
    }
  },

  updateTicketStatus: async (bookingId: string, status: string, userId: string): Promise<void> => {
    const bookingRef = doc(getDb(), 'users', userId, 'bookings', bookingId);
    await setDoc(bookingRef, { status }, { merge: true });
  },
  
  changeSeat: async (scheduleId: string, oldSeat: string, newSeat: string, bookingId: string): Promise<{ success: boolean, message?: string }> => {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    try {
        await runTransaction(getDb(), async (transaction) => {
            const scheduleDoc = await transaction.get(scheduleRef);
            if (!scheduleDoc.exists()) throw new Error("Schedule not found.");

            const scheduleData = scheduleDoc.data() as Schedule;
            const bookings = scheduleData.bookings || [];

            if (bookings.some((b: any) => b.seat === newSeat)) {
                throw new Error("New seat is already booked.");
            }

            const bookingIndex = bookings.findIndex((b: any) => b.seat === oldSeat && b.bookingId === bookingId);
            if (bookingIndex === -1) throw new Error("Could not find your original seat booking.");

            bookings[bookingIndex].seat = newSeat;
            transaction.update(scheduleRef, { bookings });
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
  },
  
  cancelBooking: async (scheduleId: string, bookingId: string): Promise<{ success: boolean, message?: string }> => {
     const scheduleRef = doc(getDb(), 'schedules', scheduleId);
     try {
        await runTransaction(getDb(), async (transaction) => {
            const scheduleDoc = await transaction.get(scheduleRef);
            if (!scheduleDoc.exists()) throw new Error("Schedule not found.");

            const scheduleData = scheduleDoc.data() as Schedule;
            const initialBookingCount = scheduleData.bookings.length;
            const updatedBookings = scheduleData.bookings.filter((b: any) => b.bookingId !== bookingId);
            
            if (updatedBookings.length === initialBookingCount) {
                // No bookings were removed, maybe bookingId was wrong
                throw new Error("Booking ID not found in this schedule.");
            }

            const seatsFreed = initialBookingCount - updatedBookings.length;
            
            transaction.update(scheduleRef, {
                bookings: updatedBookings,
                availableSeats: (scheduleData.availableSeats || 0) + seatsFreed
            });
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
  }
};
