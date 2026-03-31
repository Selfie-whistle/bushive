
'use server';

import { adminDb, adminAuth } from '../firebase-admin';
import type { Bus as BusType, Service } from '../types';
import { format, isBefore, startOfDay } from 'date-fns';


export async function addService(serviceId: string, serviceData: any) {
    const ref = adminDb.collection('services').doc(serviceId);
    await ref.set(serviceData, { merge: true });
}

export async function getReturnBus(busId: string): Promise<BusType | null> {
    const originalBusSnap = await adminDb.collection('buses').doc(busId).get();
    if (!originalBusSnap.exists) return null;
    const originalBus = originalBusSnap.data() as BusType;

    const busesSnap = await adminDb.collection('buses').get();
    const allBuses = busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

    const returnBus = allBuses.find(bus => 
        bus.origin === originalBus.destination &&
        bus.destination === originalBus.origin &&
        bus.id !== originalBus.id &&
        bus.operatorId === originalBus.operatorId
    );

    return returnBus || null;
}

export async function createAdminRole(email: string) {
    try {
        const userRecord = await adminAuth.getUserByEmail(email);
        const userId = userRecord.uid;

        const adminRoleRef = adminDb.collection('roles_admin').doc(userId);
        const adminDoc = await adminRoleRef.get();

        if (adminDoc.exists) {
            return { success: true, message: "User is already an admin." };
        }

        await adminRoleRef.set({
            isAdmin: true,
            grantedAt: new Date().toISOString(),
        });

        return { success: true, message: `Successfully granted admin role to ${email}.` };

    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            const message = `User with email "${email}" not found. Please ensure the user has signed up.`;
            return { success: false, message };
        } else {
            const message = `An unexpected error occurred: ${error.message}`;
            return { success: false, message };
        }
    }
}

export async function getAdminUserIdByEmail(email: string): Promise<string | null> {
    try {
        const userRecord = await adminAuth.getUserByEmail(email);
        return userRecord.uid;
    } catch (error) {
        console.error(`Failed to get UID for email ${email}:`, error);
        return null;
    }
}

export async function resetAllRestStopStatuses(scheduleId?: string): Promise<{ success: boolean; message?: string }> {
    if (!scheduleId) {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const q = adminDb.collection('schedules').where('date', '==', todayStr);
        const querySnapshot = await q.get();

        if (querySnapshot.empty) {
            return { success: true, message: "No schedules for today to reset." };
        }

        const batch = adminDb.batch();
        querySnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { stopStatuses: {} });
        });
        await batch.commit();
        return { success: true };

    } else {
      const scheduleRef = adminDb.collection('schedules').doc(scheduleId);
      try {
          await scheduleRef.update({ stopStatuses: {} });
          return { success: true };
      } catch (error: any) {
          return { success: false, message: error.message };
      }
    }
}

export async function deleteUserAccount(userId: string): Promise<{ success: boolean; }> {
    console.log(`Request to delete user account for UID: ${userId}`);
    return { success: true };
}

export async function getBusById(id: string): Promise<BusType | null> {
    const docRef = adminDb.collection('buses').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
        return null;
    }
    return { id: docSnap.id, ...docSnap.data() } as BusType;
}

export async function getBuses(): Promise<BusType[]> {
    const snapshot = await adminDb.collection("buses").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
}

export async function getSchedule(id: string) {
    const ref = adminDb.collection("schedules").doc(id);
    const snap = await ref.get();
    return snap.exists ? { id: snap.id, ...snap.data() as any } : null;
}

export async function addSchedule(schedule: any) {
    const scheduleRef = adminDb.collection("schedules").doc(schedule.id);
    const docSnap = await scheduleRef.get();
    if (docSnap.exists()) {
        throw new Error(`Schedule with ID ${schedule.id} already exists.`);
    }
    await scheduleRef.set({ ...schedule, createdAt: new Date().toISOString() });
    return schedule;
}

export async function addBus(bus: any) {
    const busData = { ...bus };

    // If a serviceId is provided, fetch the service and embed its points
    if (bus.serviceId) {
        const serviceRef = adminDb.collection('services').doc(bus.serviceId);
        const serviceSnap = await serviceRef.get();
        if (serviceSnap.exists) {
            const serviceData = serviceSnap.data() as Service;
            busData.boardingPointsForward = serviceData.boardingPointsForward || [];
            busData.droppingPointsForward = serviceData.droppingPointsForward || [];
            busData.boardingPointsReturn = serviceData.boardingPointsReturn || [];
            busData.droppingPointsReturn = serviceData.droppingPointsReturn || [];
        }
    }
    
    const ref = adminDb.collection("buses").doc(bus.id);
    await ref.set(busData, { merge: true });
    return busData;
}


export async function deleteAllSchedulesForService(serviceId: string): Promise<{ success: boolean; message?: string }> {
    const schedulesQuery = adminDb.collection('schedules').where('serviceId', '==', serviceId);
    
    try {
        const snapshot = await schedulesQuery.get();
        if (snapshot.empty) {
            return { success: true, message: "No schedules found for this service." };
        }

        const batch = adminDb.batch();
        let deletedCount = 0;
        let keptCount = 0;

        const today = startOfDay(new Date());

        snapshot.docs.forEach(doc => {
            const schedule = doc.data();
            const hasBookings = schedule.bookings && schedule.bookings.length > 0;
            const isPastSchedule = isBefore(new Date(schedule.date), today);

            if (!hasBookings && !isPastSchedule) {
                batch.delete(doc.ref);
                deletedCount++;
            } else {
                keptCount++;
            }
        });

        await batch.commit();

        let message = `Deleted ${deletedCount} future, non-booked schedules.`;
        if (keptCount > 0) {
            message += ` ${keptCount} schedules with existing bookings or in the past were not deleted.`
        }

        return { success: true, message };
    } catch (error: any) {
        console.error("Failed to delete schedules for service:", error);
        return { success: false, message: error.message };
    }
}
