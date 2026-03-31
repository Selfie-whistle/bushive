'use server';

import { format, startOfDay, addDays, isBefore, parseISO } from 'date-fns';
import { adminDb } from '../firebase-admin';

/**
 * Utility to send notifications to all passengers in a schedule.
 * MUST be used within an existing transaction.
 */
async function notifyPassengers(
  transaction: FirebaseFirestore.Transaction,
  scheduleData: any,
  newBusId: string,
  newBusNumber: string,
  travelsName: string
) {
  if (!scheduleData.bookings || scheduleData.bookings.length === 0) return;

  const dateStr = format(parseISO(scheduleData.date), 'dd MMM yyyy');
  const title = "Trip Schedule Updated";
  const message = `The bus for your trip on ${dateStr} has been updated to ${travelsName} (${newBusNumber}). Please check your ticket for updated tracking details.`;

  for (const booking of scheduleData.bookings) {
    if (booking.userId) {
      // Create notification in user's sub-collection
      const notificationRef = adminDb.collection('users').doc(booking.userId).collection('notifications').doc();
      transaction.set(notificationRef, {
        userId: booking.userId,
        title,
        message,
        type: 'trip',
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  }
}

export async function scheduleRoundTripMonthAction(
  primaryBusId: string,
  returnBusId: string | undefined,
  serviceId: string,
  year: number,
  month: number // 0-based
) {
  if (!primaryBusId || !returnBusId) {
    throw new Error("Both forward and return bus IDs must be provided.");
  }

  const schedulesRef = adminDb.collection('schedules');

  // Find the last schedule for this service to determine the starting rotation
  const schedulesForServiceQuery = schedulesRef.where('serviceId', '==', serviceId);
  const schedulesForServiceSnap = await schedulesForServiceQuery.get();
  
  let lastSchedule: any = null;
  if (!schedulesForServiceSnap.empty) {
      const allSchedules = schedulesForServiceSnap.docs.map(doc => doc.data());
      // Filter for dates before the start of the month we are generating for
      const pastSchedules = allSchedules.filter(s => new Date(s.date) < new Date(year, month, 1));
      if (pastSchedules.length > 0) {
        pastSchedules.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        lastSchedule = pastSchedules[0];
      }
  }


  let lastScheduleDate = startOfDay(new Date(year, month, 0)); // Day before the start of the month to generate
  let isLastDayPrimaryForward = false; // Assume previous day had return bus forward as a default starting point

  if (lastSchedule) {
    lastScheduleDate = startOfDay(new Date(lastSchedule.date));

    const lastForwardScheduleForDateSnap = await schedulesRef.doc(`${lastSchedule.date}_${serviceId}_FORWARD`).get();
    if (lastForwardScheduleForDateSnap.exists) {
      isLastDayPrimaryForward = lastForwardScheduleForDateSnap.data()!.actualBusId === primaryBusId;
    }
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const batch = adminDb.batch();

  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = startOfDay(new Date(year, month, day));

    // Skip if date is in the past
    if (currentDate < startOfDay(new Date())) {
      continue;
    }

    // Determine rotation for the current day
    const daysDiff = Math.round((currentDate.getTime() - lastScheduleDate.getTime()) / 86400000);
    const shouldSwap = daysDiff % 2 !== 0; // Swap on odd day differences
    
    const primaryRunsForwardToday = isLastDayPrimaryForward ? !shouldSwap : shouldSwap;

    const forwardActualBusId = primaryRunsForwardToday ? primaryBusId : returnBusId;
    const returnActualBusId = primaryRunsForwardToday ? returnBusId : primaryBusId;

    const dateStr = format(currentDate, 'yyyy-MM-dd');

    // --- FORWARD TRIP ---
    const forwardBusSnap = await adminDb.collection('buses').doc(primaryBusId).get();
    if (forwardBusSnap.exists) {
      const bus = forwardBusSnap.data()!;
      const forwardScheduleRef = adminDb.collection('schedules').doc(`${dateStr}_${serviceId}_FORWARD`);
      
      const forwardScheduleSnap = await forwardScheduleRef.get();
      if (!forwardScheduleSnap.exists) {
        batch.set(forwardScheduleRef, {
          date: dateStr,
          serviceId,
          busId: primaryBusId,
          actualBusId: forwardActualBusId,
          direction: 'FORWARD',
          totalSeats: bus.totalSeats,
          availableSeats: bus.totalSeats,
          fare: bus.baseFare,
          bookings: [],
          seatPrices: {},
        });
      }
    }

    // --- RETURN TRIP ---
    const returnBusSnap = await adminDb.collection('buses').doc(returnBusId).get();
    if (returnBusSnap.exists) {
      const bus = returnBusSnap.data()!;
      const returnScheduleRef = adminDb.collection('schedules').doc(`${dateStr}_${serviceId}_RETURN`);
      const returnScheduleSnap = await returnScheduleRef.get();
      if (!returnScheduleSnap.exists) {
        batch.set(returnScheduleRef, {
          date: dateStr,
          serviceId,
          busId: returnBusId,
          actualBusId: returnActualBusId,
          direction: 'RETURN',
          totalSeats: bus.totalSeats,
          availableSeats: bus.totalSeats,
          fare: bus.baseFare,
          bookings: [],
          seatPrices: {},
        });
      }
    }
  }

  await batch.commit();
  return { success: true };
}


export async function swapBusRotationForServiceAction(serviceId: string) {
  if (!serviceId) {
    throw new Error("Service ID is required.");
  }
  
  const serviceRef = adminDb.collection('services').doc(serviceId);

  return adminDb.runTransaction(async (transaction) => {
    const serviceSnap = await transaction.get(serviceRef);
    const serviceData = serviceSnap.exists ? serviceSnap.data() : null;
    
    // Get all schedules for this service
    const schedulesRef = adminDb.collection('schedules');
    const schedulesQuery = schedulesRef.where('serviceId', '==', serviceId);
      
    const schedulesSnap = await transaction.get(schedulesQuery);

    if (schedulesSnap.empty) {
      return { success: true, message: "No schedules found to swap." };
    }

    const todayStr = format(startOfDay(new Date()), 'yyyy-MM-dd');
    
    // Filter for future schedules in memory
    const futureDocs = schedulesSnap.docs.filter(doc => {
        const data = doc.data();
        return data.date >= todayStr;
    });

    if (futureDocs.length === 0) {
        return { success: true, message: "No future schedules found to swap." };
    }

    // Determine the two bus IDs to interchange
    let busIdA = serviceData?.forwardBusId;
    let busIdB = serviceData?.returnBusId;

    if (!busIdA || !busIdB) {
        // Infer from schedules if missing in service doc
        const uniqueBusIds = new Set<string>();
        futureDocs.forEach(d => {
            const data = d.data();
            if (data.actualBusId) uniqueBusIds.add(data.actualBusId);
        });
        const ids = Array.from(uniqueBusIds);
        if (ids.length < 2) {
            throw new Error("Service rotation cannot be swapped: Could not find two distinct buses assigned to future schedules.");
        }
        busIdA = ids[0];
        busIdB = ids[1];
    }

    // Fetch bus details for notification info
    const busSnapA = await transaction.get(adminDb.collection('buses').doc(busIdA));
    const busSnapB = await transaction.get(adminDb.collection('buses').doc(busIdB));
    
    const busAData = busSnapA.data();
    const busBData = busSnapB.data();

    // Swap the bus IDs in the service document if it exists
    if (serviceSnap.exists) {
        transaction.update(serviceRef, {
            forwardBusId: busIdB,
            returnBusId: busIdA,
        });
    }

    // Now update all future schedules for this service and notify passengers
    for (const doc of futureDocs) {
      const schedule = doc.data();
      const currentActualBusId = schedule.actualBusId;
      
      let newBusId = '';
      let newBusNumber = '';
      let travelsName = '';

      if (currentActualBusId === busIdA) {
        newBusId = busIdB;
        newBusNumber = busBData?.busNumber || 'N/A';
        travelsName = busBData?.travelsName || 'Updated Bus';
      } else if (currentActualBusId === busIdB) {
        newBusId = busIdA;
        newBusNumber = busAData?.busNumber || 'N/A';
        travelsName = busAData?.travelsName || 'Updated Bus';
      }

      if (newBusId) {
        transaction.update(doc.ref, { actualBusId: newBusId });
        // Only notify if there are bookings
        if (schedule.bookings && schedule.bookings.length > 0) {
          await notifyPassengers(transaction, schedule, newBusId, newBusNumber, travelsName);
        }
      }
    }

    return { success: true, message: "Bus rotation swapped and booked passengers notified." };
  });
}

export async function swapBusesForDayAction(serviceId: string, date: string) {
    if (!serviceId || !date) {
        throw new Error("Service ID and Date are required.");
    }

    const schedulesRef = adminDb.collection('schedules');
    const q = schedulesRef.where('serviceId', '==', serviceId).where('date', '==', date);

    return adminDb.runTransaction(async (transaction) => {
        const snap = await transaction.get(q);
        if (snap.empty || snap.size < 2) {
            throw new Error("Could not find both forward and return schedules for this date to swap.");
        }

        const doc1 = snap.docs[0];
        const doc2 = snap.docs[1];
        
        const data1 = doc1.data();
        const data2 = doc2.data();

        const bus1Id = data1.actualBusId;
        const bus2Id = data2.actualBusId;

        // Fetch bus details for notification info
        const busSnap1 = await transaction.get(adminDb.collection('buses').doc(bus1Id));
        const busSnap2 = await transaction.get(adminDb.collection('buses').doc(bus2Id));
        
        const bus1Data = busSnap1.data();
        const bus2Data = busSnap2.data();

        transaction.update(doc1.ref, { actualBusId: bus2Id });
        transaction.update(doc2.ref, { actualBusId: bus1Id });

        // Notify passengers of both schedules about their new buses
        if (data1.bookings && data1.bookings.length > 0) {
          await notifyPassengers(transaction, data1, bus2Id, bus2Data?.busNumber || 'N/A', bus2Data?.travelsName || 'Updated Bus');
        }
        if (data2.bookings && data2.bookings.length > 0) {
          await notifyPassengers(transaction, data2, bus1Id, bus1Data?.busNumber || 'N/A', bus1Data?.travelsName || 'Updated Bus');
        }

        return { success: true, message: `Buses swapped for ${date} and booked passengers notified.` };
    });
}
