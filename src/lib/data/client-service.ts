
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
  writeBatch,
  collectionGroup,
  onSnapshot,
  updateDoc,
  arrayUnion,
  deleteField,
  orderBy,
  limit,
} from 'firebase/firestore';
import { getStorage, ref, getDownloadURL, uploadBytesResumable, type UploadTaskSnapshot } from 'firebase/storage';
import type { Booking, Bus as BusType, SeatLayout, Schedule, PointGroup, Point, RestStop, EmergencyKitRequest, Service, Expense, Notification, Review } from '../types';
import { useToast, toast } from '@/hooks/use-toast';
import { initializeFirebase } from '@/firebase';
import { generateIndianSleeper36Layout } from '../seat-layouts/indianSleeper36';
import { createAdminRole, resetAllRestStopStatuses, deleteUserAccount, deleteAllSchedulesForService } from './server-service';
import { format } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

let db: Firestore;
let storage: ReturnType<typeof getStorage>;

const getDb = () => {
    if (!db) {
        db = initializeFirebase().firestore;
    }
    return db;
};

const getFirebaseStorage = () => {
    if (!storage) {
        storage = initializeFirebase().storage;
    }
    return storage;
}

export { getDb };


const normalize = (v: string) => v.toLowerCase().trim();

export const dataService = {
  resetAllRestStopStatuses,
  deleteUserAccount,
  createAdminRole,
  deleteAllSchedulesForService,
  
  isCabinCrew: async (email: string): Promise<boolean> => {
    const q = query(collection(getDb(), 'buses'), where("cabinCrewId", "==", email));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  },
  isAdmin: async (userId: string): Promise<boolean> => {
    const adminRoleRef = doc(getDb(), 'roles_admin', userId);
    const adminDoc = await getDoc(adminRoleRef);
    return adminDoc.exists();
  },
  
  async getUserProfile(userId: string): Promise<any | null> {
    const docRef = doc(getDb(), 'users', userId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  },
  
  async updateUserProfile(userId: string, data: any): Promise<void> {
    const docRef = doc(getDb(), 'users', userId);
    await setDoc(docRef, data, { merge: true }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: data,
      }));
    });
  },

  async uploadImage(file: File, path: string, onProgress?: (progress: number) => void): Promise<string> {
    const storage = getFirebaseStorage();
    const storageRef = ref(storage, path);
    
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
            (snapshot: UploadTaskSnapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if (onProgress) {
                    onProgress(progress);
                }
            },
            (error) => {
                console.error("Upload failed", error);
                reject(error);
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    resolve(downloadURL);
                });
            }
        );
    });
  },

  async updateRestStopStatus(scheduleId: string, stopId: string, status: 'arrived' | 'departed' | 'upcoming'): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    const statusUpdate = {
        status: status,
        timestamp: new Date().toISOString(),
    };
    await updateDoc(scheduleRef, {
        [`stopStatuses.${stopId}`]: statusUpdate
    }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: scheduleRef.path,
        operation: 'update',
        requestResourceData: { [`stopStatuses.${stopId}`]: statusUpdate },
      }));
    });
  },

  async toggleRestStopPassengerCheck(scheduleId: string, stopId: string, seatNumber: string): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    await runTransaction(getDb(), async (transaction) => {
        const snap = await transaction.get(scheduleRef);
        if (!snap.exists()) return;
        const data = snap.data() as Schedule;
        const stopStatus = data.stopStatuses?.[stopId] || { status: 'upcoming', timestamp: new Date().toISOString(), checkedInSeats: [] };
        const checkedInSeats = stopStatus.checkedInSeats || [];
        
        const newCheckedIn = checkedInSeats.includes(seatNumber)
            ? checkedInSeats.filter((s: string) => s !== seatNumber)
            : [...checkedInSeats, seatNumber];
            
        transaction.update(scheduleRef, {
            [`stopStatuses.${stopId}.checkedInSeats`]: newCheckedIn
        });
    });
  },
  
  async addExpenseToBus(busId: string, expense: Expense): Promise<void> {
    const busRef = doc(getDb(), 'buses', busId);
    await updateDoc(busRef, {
      expenses: arrayUnion(expense)
    }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: busRef.path,
        operation: 'update',
        requestResourceData: { expenses: expense },
      }));
    });
  },

  async markCrewAttendance(scheduleId: string, role: string, checkedIn: boolean, onHotseat?: boolean, duty?: 'first' | 'second' | null): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    if (checkedIn) {
        const updateData: { [key: string]: any } = { 
            timestamp: new Date().toISOString()
        };
        if (onHotseat !== undefined) updateData.onHotseat = onHotseat;
        if (duty !== undefined) updateData.duty = duty;
        if (onHotseat) updateData.hotseatSince = new Date().toISOString();

        await updateDoc(scheduleRef, {
            [`attendance.${role}`]: updateData
        }).catch(async (error) => {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: scheduleRef.path,
            operation: 'update',
            requestResourceData: { [`attendance.${role}`]: updateData },
          }));
        });
    } else {
        await updateDoc(scheduleRef, {
            [`attendance.${role}`]: deleteField()
        }).catch(async (error) => {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: scheduleRef.path,
            operation: 'update',
          }));
        });
    }
  },

  async batchUpdateCrewStatus(scheduleId: string, updates: { role: string; onHotseat: boolean; duty: 'first' | 'second' | null, hotseatSince?: string | null }[]): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    
    await runTransaction(getDb(), async (transaction) => {
      const scheduleDoc = await transaction.get(scheduleRef);
      if (!scheduleDoc.exists()) throw new Error("Schedule not found.");
      
      const currentAttendance = scheduleDoc.data().attendance || {};
      
      updates.forEach(update => {
        const currentRecord = currentAttendance[update.role] || {};
        currentAttendance[update.role] = {
          ...currentRecord,
          onHotseat: update.onHotseat,
          duty: update.duty,
          hotseatSince: update.onHotseat ? (update.hotseatSince || new Date().toISOString()) : null,
        };
      });

      transaction.update(scheduleRef, { attendance: currentAttendance });
    });
  },

  async lockAllDriverDuties(scheduleId: string, roles: string[]): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    await runTransaction(getDb(), async (transaction) => {
      const scheduleDoc = await transaction.get(scheduleRef);
      if (!scheduleDoc.exists()) throw new Error("Schedule not found.");

      const scheduleData = scheduleDoc.data();
      const attendance = scheduleData.attendance || {};

      roles.forEach(role => {
          if (attendance[role]) {
              attendance[role].dutyLocked = true;
          }
      });
      
      transaction.update(scheduleRef, { attendance });
    });
  },

  async updateSnackStatus(scheduleId: string, bookingId: string, seatNumber: string, distributed: boolean): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    await runTransaction(getDb(), async (transaction) => {
      const scheduleDoc = await transaction.get(scheduleRef);
      if (!scheduleDoc.exists()) {
        throw new Error("Schedule not found.");
      }

      const scheduleData = scheduleDoc.data() as Schedule;
      const bookings = scheduleData.bookings || [];

      const bookingIndex = bookings.findIndex((b: any) => b.bookingId === bookingId && b.seat === seatNumber);
      if (bookingIndex !== -1) {
        bookings[bookingIndex].snackDistributed = distributed;
        transaction.update(scheduleRef, { bookings });
      } else {
        // Fallback for safety, though it shouldn't be needed with correct IDs.
        const fallbackIndex = bookings.findIndex((b: any) => b.bookingId === bookingId);
        if (fallbackIndex === -1) {
          throw new Error("Booking not found in schedule to update snack status.");
        }
        bookings[fallbackIndex].snackDistributed = distributed;
        transaction.update(scheduleRef, { bookings });
      }
    });
  },

  async updateTripStatus(scheduleId: string, status: 'in-progress' | 'completed'): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    await updateDoc(scheduleRef, {
        tripStatus: status,
    }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: scheduleRef.path,
        operation: 'update',
        requestResourceData: { tripStatus: status },
      }));
    });
  },

  async sendBroadcastMessage(scheduleId: string, message: string): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    await updateDoc(scheduleRef, {
      broadcast: {
        message: message,
        timestamp: new Date().toISOString(),
      }
    }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: scheduleRef.path,
        operation: 'update',
        requestResourceData: { broadcast: { message, timestamp: '...' } },
      }));
    });
  },

  onBusesSnapshot(callback: (buses: BusType[]) => void, onError: (error: Error) => void) {
    const busesQuery = collection(getDb(), 'buses');
    return onSnapshot(busesQuery, (snapshot) => {
      const buses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      callback(buses);
    }, async (serverError) => {
      const contextualError = new FirestorePermissionError({
        operation: 'list',
        path: 'buses',
      });
      errorEmitter.emit('permission-error', contextualError);
      if (onError) onError(contextualError);
    });
  },

  onServicesSnapshot(callback: (services: Service[]) => void, onError?: (error: Error) => void) {
    const q = collection(getDb(), 'services');
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Service)));
    }, (error) => {
        const contextualError = new FirestorePermissionError({
            operation: 'list',
            path: 'services',
        });
        errorEmitter.emit('permission-error', contextualError);
        if (onError) onError(contextualError);
    });
  },
  
  async updateBusLiveLocation(busId: string, location: { lat: number; lng: number; ts: number } | null, locationName?: string | null): Promise<void> {
    const busRef = doc(getDb(), 'buses', busId);
    const dataToUpdate: { liveLocation: any; locationName?: any } = { liveLocation: location };
    if (locationName !== undefined) {
      dataToUpdate.locationName = locationName;
    }
    await setDoc(busRef, { ...dataToUpdate }, { merge: true }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: busRef.path,
        operation: 'update',
        requestResourceData: dataToUpdate,
      }));
    });
  },

  async updateBusLiveRoute(busId: string, route: { origin: string; destination: string; } | null): Promise<void> {
    const busRef = doc(getDb(), 'buses', busId);
    await setDoc(busRef, { liveRoute: route }, { merge: true }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: busRef.path,
        operation: 'update',
        requestResourceData: { liveRoute: route },
      }));
    });
  },

  async requestEmergencyKit(scheduleId: string, bookingId: string, seatNumber: string, passengerName: string): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    const newRequest: EmergencyKitRequest = {
        bookingId,
        seatNumber,
        passengerName,
        timestamp: new Date().toISOString(),
        status: 'pending',
    };
    await updateDoc(scheduleRef, {
        kitRequests: arrayUnion(newRequest)
    }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: scheduleRef.path,
        operation: 'update',
        requestResourceData: { kitRequests: newRequest },
      }));
    });
  },

  async acknowledgeKitRequest(scheduleId: string, requestTimestamp: string): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    await runTransaction(getDb(), async (transaction) => {
        const scheduleDoc = await transaction.get(scheduleRef);
        if (!scheduleDoc.exists()) throw new Error("Schedule not found");

        const scheduleData = scheduleDoc.data() as Schedule;
        const requests = scheduleData.kitRequests || [];

        const updatedRequests = requests.map(req => 
            req.timestamp === requestTimestamp ? { ...req, status: 'acknowledged' } : req
        );

        transaction.update(scheduleRef, { kitRequests: updatedRequests });
    });
  },

  async getBuses(): Promise<BusType[]> {
    const snapshot = await getDocs(collection(getDb(), "buses"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
  },
  
  async getBusByCrewId(crewId: string): Promise<BusType | null> {
    const q = query(collection(getDb(), "buses"), where("cabinCrewId", "==", crewId));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as BusType;
  },

  async getBusesByOperator(operatorId: string, travelsName?: string): Promise<BusType[]> {
    const busesRef = collection(getDb(), "buses");
    const operatorBusesQuery = query(busesRef, where("operatorId", "==", operatorId));
    const operatorSnapshot = await getDocs(operatorBusesQuery);
    const operatorBuses = operatorSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

    if (travelsName === "CLUB ANAND TRAVEL") {
        const travelsNameQuery = query(busesRef, where("travelsName", "==", "CLUB ANAND TRAVEL"));
        const travelsNameSnapshot = await getDocs(travelsNameQuery);
        const travelsNameBuses = travelsNameSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        
        const busMap = new Map<string, BusType>();
        operatorBuses.forEach(bus => busMap.set(bus.id, bus));
        travelsNameBuses.forEach(bus => busMap.set(bus.id, bus));
        return Array.from(busMap.values());
    }

    return operatorBuses;
  },

  async getBusById(id: string): Promise<BusType | null> {
    const ref = doc(getDb(), "buses", id);
    const snap = await getDoc(ref);
  
    if (!snap.exists()) return null;
  
    const data = snap.data();
  
    return {
      id: snap.id,
      ...data,
    } as BusType;
  },

  onBusSnapshot(busId: string, callback: (bus: BusType | null) => void) {
    const busRef = doc(getDb(), 'buses', busId);
    return onSnapshot(busRef, (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() } as BusType);
        } else {
            callback(null);
        }
    }, async (serverError) => {
      const contextualError = new FirestorePermissionError({
        operation: 'get',
        path: busRef.path,
      });
      errorEmitter.emit('permission-error', contextualError);
    });
  },

  async addBus(bus: BusType) {
    const busData = JSON.parse(JSON.stringify(bus));
    const busRef = doc(getDb(), "buses", bus.id);
    await setDoc(
      busRef,
      busData,
      { merge: true }
    ).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: busRef.path,
        operation: 'write',
        requestResourceData: busData,
      }));
    });
    return bus;
  },

  // Upload a single image file to Firebase Storage and return its download URL
  async uploadBusImage(
    busId: string, 
    file: File, 
    onProgress?: (progress: number, eta?: number) => void
  ): Promise<string> {
    const storageRef = ref(getFirebaseStorage(), `bus-images/${busId}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed', 
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            
            // Calculate ETA
            let eta = 0;
            const elapsedTime = (Date.now() - startTime) / 1000; // seconds
            if (progress > 0) {
                const totalEstimatedTime = elapsedTime / (progress / 100);
                eta = Math.max(0, totalEstimatedTime - elapsedTime);
            }
            
            if (onProgress) onProgress(progress, eta);
        }, 
        reject, 
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('Firebase Storage upload success:', url);
          resolve(url);
        }
      );
    });
  },

  async uploadOperatorImage(
    operatorId: string, 
    file: File,
    onProgress?: (progress: number, eta?: number) => void
  ): Promise<string> {
    const storageRef = ref(getFirebaseStorage(), `operator-images/${operatorId}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed', 
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            
            // Calculate ETA
            let eta = 0;
            const elapsedTime = (Date.now() - startTime) / 1000; // seconds
            if (progress > 0) {
                const totalEstimatedTime = elapsedTime / (progress / 100);
                eta = Math.max(0, totalEstimatedTime - elapsedTime);
            }
            
            if (onProgress) onProgress(progress, eta);
        }, 
        reject, 
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('Firebase Storage operator upload success:', url);
          resolve(url);
        }
      );
    });
  },

  // Persist image URL arrays to Firestore
  async updateBusImages(busId: string, imageUrls: string[]): Promise<void> {
    const busRef = doc(getDb(), 'buses', busId);
    await setDoc(busRef, { images: imageUrls }, { merge: true });
  },

  // Update operatorImages on every bus belonging to the same operatorId
  async updateOperatorImages(operatorId: string, imageUrls: string[]): Promise<void> {
    const q = query(collection(getDb(), 'buses'), where('operatorId', '==', operatorId));
    const snap = await getDocs(q);
    const batch = writeBatch(getDb());
    snap.docs.forEach(d => batch.update(d.ref, { operatorImages: imageUrls }));
    await batch.commit();
  },

  async getSchedules(): Promise<Schedule[]> {
    const snap = await getDocs(collection(getDb(), "schedules"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  },

  async addSchedule(schedule: any) {
    const scheduleRef = doc(getDb(), "schedules", schedule.id);
    const docSnap = await getDoc(scheduleRef);
    if (docSnap.exists()) {
        throw new Error(`Schedule with ID ${schedule.id} already exists.`);
    }
    await setDoc(scheduleRef, { ...schedule, createdAt: new Date().toISOString() }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: scheduleRef.path,
        operation: 'create',
        requestResourceData: schedule,
      }));
    });
    return schedule;
  },

  async deleteSchedule(id: string) {
    const scheduleRef = doc(getDb(), 'schedules', id);
    const scheduleSnap = await getDoc(scheduleRef);
    if (!scheduleSnap.exists() || (scheduleSnap.data().bookings?.length || 0) > 0) {
      return { success: false, message: 'Cannot delete non-existent or booked schedule.' };
    }
    await deleteDoc(scheduleRef).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: scheduleRef.path,
        operation: 'delete',
      }));
    });
    return { success: true };
  },

  async deleteBusAndSchedules(busId: string) {
    const busRef = doc(getDb(), "buses", busId);
    const schedulesQuery = query(collection(getDb(), "schedules"), where("busId", "==", busId));
    
    await runTransaction(getDb(), async (transaction) => {
      const schedulesSnapshot = await getDocs(schedulesQuery);
      schedulesSnapshot.docs.forEach(d => {
        transaction.delete(d.ref);
      });
      transaction.delete(busRef);
    });

    return { success: true };
  },
  
  async getServices(): Promise<Service[]> {
    const snapshot = await getDocs(collection(getDb(), 'services'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
  },

  async addService(serviceId: string, serviceData: any) {
    const ref = doc(getDb(), "services", serviceId);
    await setDoc(ref, serviceData, { merge: true }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: ref.path,
        operation: 'write',
        requestResourceData: serviceData,
      }));
    });
    return { id: serviceId, ...serviceData };
  },

  async updateService(serviceId: string, serviceData: Partial<Service>): Promise<void> {
    const serviceRef = doc(getDb(), 'services', serviceId);
    await setDoc(serviceRef, serviceData, { merge: true }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: serviceRef.path,
        operation: 'update',
        requestResourceData: serviceData,
      }));
    });
  },

  async getAllSchedules() {
    return this.getSchedules();
  },

  async getSchedulesForDate(date: string): Promise<Schedule[]> {
    const q = query(collection(getDb(), 'schedules'), where('date', '==', date));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Schedule));
  },

  onSchedulesForDateSnapshot(date: string, callback: (schedules: Schedule[]) => void, onError: (error: Error) => void) {
    const q = query(collection(getDb(), 'schedules'), where('date', '==', date));
    return onSnapshot(q, async (snapshot) => {
        try {
            const schedules = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Schedule));
            callback(schedules);
        } catch(err) {
            onError(err as Error);
        }
    }, async (serverError) => {
      const contextualError = new FirestorePermissionError({
        operation: 'list',
        path: 'schedules',
      });
      errorEmitter.emit('permission-error', contextualError);
      if (onError) onError(contextualError);
    });
  },

  async updateScheduleSeatPrices(scheduleId: string, seatPrices: { [key: string]: number }, fare: number): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    await setDoc(scheduleRef, { seatPrices, fare }, { merge: true }).catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: scheduleRef.path,
        operation: 'update',
        requestResourceData: { seatPrices, fare },
      }));
    });
  },

  async createPendingBooking(bookingData: Omit<Booking, 'id' | 'status' | 'createdAt'>): Promise<Booking> {
    const db = getDb();
    const userBookingRef = doc(collection(db, 'users', bookingData.userId, 'bookings'));
    const publicBookingRef = doc(db, 'publicBookings', userBookingRef.id);
    const lookupRef = doc(db, 'booking_lookups', userBookingRef.id);
    const bookingId = userBookingRef.id;

    const pnr = String(Math.floor(100000 + Math.random() * 900000));
    const bus = await this.getBusById(bookingData.busId);
    const schedule = await this.getSchedule(bookingData.scheduleId);
    const service = schedule?.serviceId ? await this.getServiceById(schedule.serviceId) : null;

    const isReturn = schedule?.direction === 'RETURN';
    const boardingPoints = isReturn ? service?.boardingPointsReturn : service?.boardingPointsForward;
    const droppingPoints = isReturn ? service?.droppingPointsReturn : service?.droppingPointsForward;

    const fullBookingData: Booking = {
        ...bookingData,
        id: bookingId,
        pnr,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        busDetails: {
            name: bus?.travelsName || '',
            operator: bus?.operator || '',
            origin: bus?.origin || '',
            destination: bus?.destination || '',
            departureTime: bus?.departureTime || '',
            arrivalTime: bus?.arrivalTime || '',
            duration: bus?.duration || '',
            busNumber: bus?.busNumber || '',
            contactNumber: bus?.contactNumber || undefined,
            boardingPoints: boardingPoints,
            droppingPoints: droppingPoints,
        }
    };

    await runTransaction(db, async (transaction) => {
        transaction.set(userBookingRef, fullBookingData);
        transaction.set(publicBookingRef, fullBookingData);
        transaction.set(lookupRef, {
            userId: bookingData.userId,
            scheduleId: bookingData.scheduleId,
            createdAt: new Date(),
        });
    });

    return fullBookingData;
},

  async getAllBookings(): Promise<Booking[]> {
    const bookingsQuery = collection(getDb(), 'publicBookings');
    const bookingsSnapshot = await getDocs(bookingsQuery);
    
    const bookings = await Promise.all(bookingsSnapshot.docs.map(async (docSnap) => {
        const bookingData = docSnap.data() as Booking;
        const bus = await dataService.getBusById(bookingData.busId);
        return {
            ...bookingData,
            id: docSnap.id,
            bus: bus || (bookingData.busDetails as unknown as BusType),
        };
     }));

    return bookings;
  },
  
  async getUserTicketsByUserId(userId: string): Promise<Booking[]> {
    const mainUserBookingsQuery = query(collection(getDb(), 'users', userId, 'bookings'));
    const mainUserBookingsSnap = await getDocs(mainUserBookingsQuery);
    const mainBookings = mainUserBookingsSnap.docs.map(doc => ({ ...doc.data() as Booking, id: doc.id }));
    return mainBookings;
  },

  async getUserTicketsByPhone(phone: string): Promise<Booking[]> {
    const q = query(collection(getDb(), 'publicBookings'), where('contact.phone', '==', phone));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return [];

    const bookings = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const bookingData = docSnap.data() as Booking;
        const bus = await dataService.getBusById(bookingData.busId);
        return {
            ...bookingData,
            id: docSnap.id,
            busDetails: bus ? {
                name: bus.travelsName,
                operator: bus.operator || '',
                origin: bus.origin,
                destination: bus.destination,
                departureTime: bus.departureTime,
                arrivalTime: bus.arrivalTime,
                duration: bus.duration || '',
                busNumber: bus.busNumber,
                contactNumber: bus.contactNumber || undefined,
                boardingPoints: bus.boardingPointsForward || [],
                droppingPoints: bus.droppingPointsForward || [],
            } : bookingData.busDetails,
        };
    }));

    return bookings;
  },
  
  async getPublicBookingById(bookingId: string): Promise<Booking | null> {
    const bookingRef = doc(getDb(), 'publicBookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);
    if (!bookingSnap.exists()) return null;
    return { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
  },
  
  async getBookingByPnr(pnr: string): Promise<Booking | null> {
    const q = query(collection(getDb(), 'publicBookings'), where('pnr', '==', pnr));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const docSnap = snapshot.docs[0];
    const bookingData = docSnap.data() as Booking;
    return this.getPublicBookingById(bookingData.id);
  },

  async getBookingOwner(bookingId: string): Promise<{ userId: string; scheduleId: string } | null> {
    const lookupRef = doc(getDb(), 'booking_lookups', bookingId);
    const lookupSnap = await getDoc(lookupRef);
    if (!lookupSnap.exists()) {
      return null;
    }
    const data = lookupSnap.data();
    return {
      userId: data?.userId,
      scheduleId: data?.scheduleId,
    };
  },

  onBookingSnapshot(userId: string, bookingId: string, callback: (booking: Booking | null) => void) {
    const userBookingRef = doc(getDb(), 'users', userId, 'bookings', bookingId);

    return onSnapshot(userBookingRef, async (userBookingSnap) => {
        if (!userBookingSnap.exists()) {
            callback(null);
            return;
        }

        const bookingData = userBookingSnap.data() as Omit<Booking, 'id'>;

        const scheduleRef = doc(getDb(), 'schedules', bookingData.scheduleId);
        onSnapshot(scheduleRef, async (scheduleSnap) => {
            if (!scheduleSnap.exists()) {
                callback({ ...bookingData, id: userBookingSnap.id, scheduleBookings: [] } as Booking);
                return;
            }
            const scheduleData = scheduleSnap.data() as Schedule;
            const bus = await dataService.getBusById(bookingData.busId);
            const service = await dataService.getServiceById(scheduleData.serviceId!);

            const fullBooking: Booking = {
                ...bookingData,
                id: userBookingSnap.id,
                busDetails: bus && service ? {
                    name: bus.travelsName,
                    operator: bus.operator || 'Unknown Operator',
                    origin: bus.origin,
                    destination: bus.destination,
                    departureTime: bus.departureTime,
                    arrivalTime: bus.arrivalTime,
                    duration: bus.duration || '',
                    busNumber: bus.busNumber,
                    contactNumber: bus.contactNumber || undefined,
                    boardingPoints: service.boardingPointsForward || [],
                    droppingPoints: service.droppingPointsForward || [],
                } : bookingData.busDetails,
                scheduleBookings: scheduleData.bookings, 
            };
            callback(fullBooking);
        });
    }, async (serverError) => {
      const contextualError = new FirestorePermissionError({
        operation: 'get',
        path: userBookingRef.path,
      });
      errorEmitter.emit('permission-error', contextualError);
    });
  },

  async getBookingById(userId: string, bookingId: string): Promise<Booking | null> {
    const bookingRef = doc(getDb(), 'users', userId, 'bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);
    if (!bookingSnap.exists()) return null;

    const bookingData = bookingSnap.data() as Omit<Booking, 'id'>;
    const bus = await dataService.getBusById(bookingData.busId);
    const schedule = await this.getSchedule(bookingData.scheduleId);
    const service = schedule ? await dataService.getServiceById(schedule.serviceId!) : null;

    const fullBooking: Booking = {
      ...bookingData,
      id: bookingSnap.id,
      busDetails: bus && service ? {
        name: bus.travelsName,
        operator: bus.operator || 'Unknown Operator',
        origin: bus.origin,
        destination: bus.destination,
        departureTime: bus.departureTime,
        arrivalTime: bus.arrivalTime,
        duration: bus.duration || '',
        busNumber: bus.busNumber,
        contactNumber: bus.contactNumber || undefined,
        boardingPoints: service.boardingPointsForward || [],
        droppingPoints: service.droppingPointsForward || [],
      } : bookingData.busDetails,
    };
    return fullBooking;
  },

  async bookSeats(scheduleId: string, seats: { seatNumber: string; gender: string }[], userId: string, bookingId: string) {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    try {
        await runTransaction(getDb(), async (transaction) => {
            const scheduleDoc = await transaction.get(scheduleRef);
            if (!scheduleDoc.exists()) {
                throw new Error("Schedule not found.");
            }

            const scheduleData = scheduleDoc.data() as Schedule;
            const existingBookings = Array.isArray(scheduleData.bookings) ? scheduleData.bookings : [];

            for (const seat of seats) {
                if (existingBookings.some((b: any) => b.seat === seat.seatNumber)) {
                    throw new Error(`Seat ${seat.seatNumber} is already booked.`);
                }
            }

            const newBookings = seats.map(s => ({ seat: s.seatNumber, gender: s.gender, userId, bookingId, boarded: false, snackDistributed: false, bookedAt: new Date().toISOString() }));
            const updatedBookings = [...existingBookings, ...newBookings];
            
            transaction.update(scheduleRef, {
                bookings: updatedBookings,
                availableSeats: (scheduleData.availableSeats || 0) - seats.length
            });
        });
        return { success: true };
    } catch (error: any) {
        console.error("Booking transaction failed:", error);
        return { success: false, message: error.message };
    }
  },

  async updateTicketStatus(userId: string, bookingId: string, status: 'CONFIRMED' | 'CANCELLED' | 'FAILED' | 'PENDING'): Promise<void> {
    const userBookingRef = doc(getDb(), 'users', userId, 'bookings', bookingId);
    const publicBookingRef = doc(getDb(), 'publicBookings', bookingId);
    
    const batch = writeBatch(getDb());
    batch.update(userBookingRef, { status });
    batch.update(publicBookingRef, { status });
    await batch.commit().catch(async (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `users/${userId}/bookings/${bookingId}`,
        operation: 'update',
        requestResourceData: { status },
      }));
    });
  },
  
  async changeSeatTransaction(scheduleId: string, oldSeatNumber: string, newSeatNumber: string, bookingId: string, userId: string): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    const userBookingRef = doc(getDb(), 'users', userId, 'bookings', bookingId);
    const publicBookingRef = doc(getDb(), 'publicBookings', bookingId);

    await runTransaction(getDb(), async (transaction) => {
        const [scheduleDoc, userBookingDoc, publicBookingDoc] = await Promise.all([
          transaction.get(scheduleRef),
          transaction.get(userBookingRef),
          transaction.get(publicBookingRef)
        ]);

        if (!scheduleDoc.exists()) throw new Error('Schedule not found');
        if (!userBookingDoc.exists()) throw new Error('User booking not found');
        if (!publicBookingDoc.exists()) throw new Error('Public booking not found');
        
        const scheduleData = scheduleDoc.data() as Schedule;
        const bookingData = userBookingDoc.data() as Booking;

        const bookings = Array.isArray(scheduleData.bookings) ? scheduleData.bookings : [];

        const newSeatIsBooked = bookings.some((b: any) => b.seat === newSeatNumber);
        if (newSeatIsBooked) throw new Error('New seat is already taken.');

        const bookingToUpdateIndex = bookings.findIndex((b: any) => b.bookingId === bookingId && b.seat === oldSeatNumber);
        if(bookingToUpdateIndex === -1) throw new Error("Could not find your original booking in the schedule to update.");

        const bookingRefToUpdate = bookings[bookingToUpdateIndex];
        
        const updatedScheduleBookings = bookings.filter((_: any, index: number) => index !== bookingToUpdateIndex);
        updatedScheduleBookings.push({ ...bookingRefToUpdate, seat: newSeatNumber });
        
        transaction.update(scheduleRef, { bookings: updatedScheduleBookings });

        const passengerIndex = bookingData.passengers.findIndex(p => p.seatNumber === oldSeatNumber);
        if (passengerIndex !== -1) {
            const updatedPassengers = [...bookingData.passengers];
            updatedPassengers[passengerIndex].previousSeatNumber = oldSeatNumber;
            updatedPassengers[passengerIndex].seatNumber = newSeatNumber;
            transaction.update(userBookingRef, { passengers: updatedPassengers });
            transaction.update(publicBookingRef, { passengers: updatedPassengers });
        } else {
            throw new Error("Could not find the passenger in the booking document.");
        }
    });
  },
  
  async cancelBooking(scheduleId: string, bookingId: string, userId: string): Promise<{ success: boolean, message?: string }> {
     const scheduleRef = doc(getDb(), 'schedules', scheduleId);
     const userBookingRef = doc(getDb(), 'users', userId, 'bookings', bookingId);
     const publicBookingRef = doc(getDb(), 'publicBookings', bookingId);

    try {
        await runTransaction(getDb(), async (transaction) => {
            const [scheduleDoc, publicBookingDoc] = await Promise.all([
                transaction.get(scheduleRef),
                transaction.get(publicBookingRef),
            ]);
            
            const userBookingDoc = await transaction.get(userBookingRef).catch(() => null);

            if (!scheduleDoc.exists()) throw new Error("Schedule not found.");
            if (!publicBookingDoc.exists()) throw new Error("Public booking record not found.");

            const scheduleData = scheduleDoc.data() as Schedule;
            const bookingData = (userBookingDoc?.data() || publicBookingDoc.data()) as Booking;

            const seatsToRelease = bookingData.passengers.length;
            const initialBookingCount = (scheduleData.bookings || []).length;
            
            const updatedBookings = (scheduleData.bookings || []).filter((b: any) => b.bookingId !== bookingId);

            if (updatedBookings.length === initialBookingCount) {
                console.warn(`Booking ID ${bookingId} not found in schedule ${scheduleId} for cancellation.`);
            }

            transaction.update(scheduleRef, {
                bookings: updatedBookings,
                availableSeats: (scheduleData.availableSeats || 0) + seatsToRelease
            });

            if (userBookingDoc && userBookingDoc.exists()) {
              transaction.update(userBookingRef, { status: 'CANCELLED' });
            }
            transaction.update(publicBookingRef, { status: 'CANCELLED' });
        });
        
        return { success: true };
    } catch (e: any) {
        console.error("Cancellation transaction failed:", e);
        try {
            await dataService.updateTicketStatus(userId, bookingId, 'CANCELLED');
            return { success: true, message: 'Could not fully update schedule, but booking status set to CANCELLED.' };
        } catch (finalError) {
             return { success: false, message: (e as Error).message };
        }
    }
  },

  async getAllLocations(): Promise<string[]> {
    const snapshot = await getDocs(collection(getDb(), 'services'));

    const map = new Map<string, string>();
    
    function normalize(value: string) {
      if (!value) return;
      const trimmed = value.trim();
      const key = trimmed.toLowerCase();
  
      const display =
        trimmed.charAt(0).toUpperCase() +
        trimmed.slice(1).toLowerCase();
  
      if (!map.has(key)) {
        map.set(key, display);
      }
    }
  
    snapshot.forEach(doc => {
      const data = doc.data() as Service;
  
      normalize(data.origin);
      normalize(data.destination);
  
      data.boardingPointsForward?.forEach((p: any) => {
        if (p.main) normalize(p.main);
        if (p.name) normalize(p.name);
      });
  
      data.droppingPointsForward?.forEach((p: any) => {
        if (p.main) normalize(p.main);
        if (p.name) normalize(p.name);
      });
      data.boardingPointsReturn?.forEach((p: any) => {
        if (p.main) normalize(p.main);
        if (p.name) normalize(p.name);
      });
  
      data.droppingPointsReturn?.forEach((p: any) => {
        if (p.main) normalize(p.main);
        if (p.name) normalize(p.name);
      });
    });
  
    return Array.from(map.values());
  },

  onScheduleBySlug: (
    slug: string,
    date: string,
    callback: (schedule: Schedule | null) => void
  ) => {
    const q = query(
      collection(getDb(), 'schedules'),
      where('slug', '==', slug),
      where('date', '==', date)
    );

    return onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }
      const doc = snapshot.docs[0];
      callback({ id: doc.id, ...doc.data() } as Schedule);
    }, async (serverError) => {
      const contextualError = new FirestorePermissionError({
        operation: 'list',
        path: 'schedules',
      });
      errorEmitter.emit('permission-error', contextualError);
    });
  },
  
  onScheduleSnapshot(
    scheduleId: string,
    callback: (schedule: Schedule | null) => void
  ) {
    const ref = doc(getDb(), "schedules", scheduleId);

    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...snap.data() } as Schedule);
    }, async (serverError) => {
      const contextualError = new FirestorePermissionError({
        operation: 'get',
        path: ref.path,
      });
      errorEmitter.emit('permission-error', contextualError);
    });
  },

  async getSchedule(scheduleId: string): Promise<Schedule | null> {
    const ref = doc(getDb(), "schedules", scheduleId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Schedule;
  },

  async getServiceById(serviceId: string): Promise<Service | null> {
    const ref = doc(getDb(), "services", serviceId);
    const snap = await getDoc(ref);
    return snap.exists() ? { ...snap.data() as Service, id: snap.id } : null;
  },

  onAllBookingsSnapshot(callback: (bookings: Booking[]) => void, onError: (error: Error) => void) {
    const bookingsQuery = collection(getDb(), 'publicBookings');
    return onSnapshot(bookingsQuery, async (snapshot) => {
      try {
        const bookings = await Promise.all(snapshot.docs.map(async (docSnap) => {
            const bookingData = docSnap.data() as Booking;
            const bus = await dataService.getBusById(bookingData.busId);
            return {
                ...bookingData,
                id: docSnap.id,
                bus: bus || (bookingData.busDetails as unknown as BusType),
            };
        }));
        callback(bookings);
      } catch (error) {
        onError(error as Error);
      }
    }, async (serverError) => {
      const contextualError = new FirestorePermissionError({
        operation: 'list',
        path: 'publicBookings',
      });
      errorEmitter.emit('permission-error', contextualError);
      if (onError) onError(contextualError);
    });
  },
  
  async searchBuses(origin: string, destination: string, date: string): Promise<{ service: any; schedule: any; actualBus: any; }[]> {
    const db = getDb();
  
    const schedSnap = await getDocs(query(collection(db, "schedules"), where("date", "==", date)));
    if (schedSnap.empty) return [];
  
    const allBusesSnap = await getDocs(collection(db, "buses"));
    const busesMap = new Map<string, BusType>(
      allBusesSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as BusType])
    );
  
    const results = [];
  
    for (const scheduleDoc of schedSnap.docs) {
      const schedule = { id: scheduleDoc.id, ...scheduleDoc.data() } as Schedule;
      const actualBusId = schedule.actualBusId || schedule.busId;
      const actualBus = busesMap.get(actualBusId);
  
      if (!actualBus || !schedule.serviceId) continue;

      const serviceDoc = await getDoc(doc(db, 'services', schedule.serviceId));
      if (!serviceDoc.exists()) continue;
      const serviceData = serviceDoc.data() as Service;

      const boardingPoints = schedule.direction === 'RETURN' ? serviceData.boardingPointsReturn : serviceData.boardingPointsForward;
      const droppingPoints = schedule.direction === 'RETURN' ? serviceData.droppingPointsReturn : serviceData.droppingPointsForward;

      const normalizedOrigin = origin.toLowerCase().trim();
      const normalizedDestination = destination.toLowerCase().trim();
      
      const originMatch = boardingPoints?.some(
        (p: any) =>
          p.main?.toLowerCase() === normalizedOrigin ||
          p.name?.toLowerCase() === normalizedOrigin
      );
      
      const destinationMatch = droppingPoints?.some(
        (p: any) =>
          p.main?.toLowerCase() === normalizedDestination ||
          p.name?.toLowerCase() === normalizedDestination
      );

      if (originMatch && destinationMatch) {
        results.push({
          service: { ...serviceData, id: schedule.serviceId },
          schedule,
          actualBus,
        });
      }
    }
  
    return results;
  },

  async updateBoardingStatus(scheduleId: string, bookingId: string, seatNumber: string, boarded: boolean): Promise<{ success: boolean, message?: string }> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    try {
        await runTransaction(getDb(), async (transaction) => {
            const scheduleDoc = await transaction.get(scheduleRef);
            if (!scheduleDoc.exists()) {
                throw new Error("Schedule not found.");
            }

            const scheduleData = scheduleDoc.data() as Schedule;
            const bookings = scheduleData.bookings || [];

            const bookingIndex = bookings.findIndex((b: any) => b.bookingId === bookingId && b.seat === seatNumber);
            if (bookingIndex !== -1) {
                bookings[bookingIndex].boarded = boarded;
                transaction.update(scheduleRef, { bookings });
            } else {
                const fallbackIndex = bookings.findIndex((b: any) => b.bookingId === bookingId);
                if(fallbackIndex === -1) {
                   throw new Error("Booking not found in schedule.");
                }
                bookings[fallbackIndex].boarded = boarded;
            }
            
            transaction.update(scheduleRef, { bookings });
        });
        return { success: true };
    } catch (error: any) {
        console.error("Update boarding status transaction failed:", error);
        return { success: false, message: error.message };
    }
  },

  async updateDeboardingStatus(scheduleId: string, bookingId: string, seatNumber: string, deboarded: boolean): Promise<{ success: boolean; message?: string }> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    try {
      await runTransaction(getDb(), async (transaction) => {
        const scheduleDoc = await transaction.get(scheduleRef);
        if (!scheduleDoc.exists()) {
          throw new Error("Schedule not found.");
        }
        const scheduleData = scheduleDoc.data() as Schedule;
        const bookings = scheduleData.bookings || [];
        const bookingIndex = bookings.findIndex((b: any) => b.bookingId === bookingId && b.seat === seatNumber);
        if (bookingIndex !== -1) {
          bookings[bookingIndex].deboarded = deboarded;
          transaction.update(scheduleRef, { bookings });
        } else {
          throw new Error("Booking for this seat not found in schedule.");
        }
      });
      return { success: true };
    } catch (error: any) {
      console.error("Update deboarding status transaction failed:", error);
      return { success: false, message: error.message };
    }
  },

  async markPassengerAsBoarded(scheduleId: string, bookingId: string, seatNumber: string): Promise<void> {
    const scheduleRef = doc(getDb(), 'schedules', scheduleId);
    await runTransaction(getDb(), async (transaction) => {
        const scheduleDoc = await transaction.get(scheduleRef);
        if (!scheduleDoc.exists()) {
            throw new Error("Schedule not found.");
        }
        const scheduleData = scheduleDoc.data() as Schedule;
        const bookings = scheduleData.bookings.map((b: any) => {
            if (b.bookingId === bookingId && b.seat === seatNumber) {
                return { ...b, boarded: true };
            }
            return b;
        });
        transaction.update(scheduleRef, { bookings });
    });
  },

  async swapBusesForDay(serviceId: string, date: Date): Promise<{ success: boolean; message?: string }> {
    const db = getDb();
    const dateStr = format(date, 'yyyy-MM-dd');
    const forwardScheduleId = `${dateStr}_${serviceId}_FORWARD`;
    const returnScheduleId = `${dateStr}_${serviceId}_RETURN`;

    const forwardScheduleRef = doc(db, 'schedules', forwardScheduleId);
    const returnScheduleRef = doc(db, 'schedules', returnScheduleId);

    try {
      await runTransaction(db, async (transaction) => {
        const [forwardSnap, returnSnap] = await Promise.all([
          transaction.get(forwardScheduleRef),
          transaction.get(returnScheduleRef),
        ]);

        if (!forwardSnap.exists() || !returnSnap.exists()) {
          throw new Error("Schedules for today not found. Cannot swap.");
        }

        const forwardData = forwardSnap.data();
        const returnData = returnSnap.data();

        const forwardActualBusId = forwardData.actualBusId;
        const returnActualBusId = returnData.actualBusId;

        // Swap the actualBusId
        transaction.update(forwardScheduleRef, { actualBusId: returnActualBusId });
        transaction.update(returnScheduleRef, { actualBusId: forwardActualBusId });
      });

      return { success: true, message: "Buses for today have been swapped." };
    } catch (e: any) {
      console.error("Bus swap transaction failed:", e);
      return { success: false, message: e.message };
    }
  },

  onNotificationsSnapshot(userId: string, callback: (notifications: Notification[]) => void) {
    const q = query(
      collection(getDb(), 'users', userId, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      callback(notifications);
    }, (error) => {
      console.error("Failed to fetch notifications:", error);
    });
  },

  async markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
    const ref = doc(getDb(), 'users', userId, 'notifications', notificationId);
    await updateDoc(ref, { read: true });
  },

  async addReview(review: Omit<Review, 'id' | 'timestamp'>): Promise<void> {
    const reviewsRef = collection(getDb(), 'reviews');
    await addDoc(reviewsRef, {
      ...review,
      timestamp: new Date().toISOString(),
    });
  },

  onAllReviewsSnapshot(callback: (reviews: Review[]) => void, onError?: (error: Error) => void) {
    const reviewsQuery = collection(getDb(), 'reviews');
    return onSnapshot(reviewsQuery, (snapshot) => {
      const reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
      callback(reviews);
    }, (error) => {
      const contextualError = new FirestorePermissionError({
        operation: 'list',
        path: 'reviews',
      });
      errorEmitter.emit('permission-error', contextualError);
      if (onError) onError(contextualError);
    });
  },

  onBusReviewsSnapshot(busId: string, callback: (reviews: Review[]) => void) {
    const q = query(
      collection(getDb(), 'reviews'),
      where('busId', '==', busId)
    );
    return onSnapshot(q, (snapshot) => {
      const reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
      callback(reviews.sort((a, b) => {
        const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return dateB - dateA;
      }));
    }, async (serverError) => {
      const contextualError = new FirestorePermissionError({
        operation: 'list',
        path: 'reviews',
      });
      errorEmitter.emit('permission-error', contextualError);
    });
  },
};
