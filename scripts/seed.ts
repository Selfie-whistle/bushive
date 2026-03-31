
import { addBus, getSchedule, addSchedule, createAdminRole, getBuses, resetAllRestStopStatuses, getAdminUserIdByEmail, addService } from '../src/lib/data/server-service';
import { initialBuses } from '../src/lib/seed/busesData';
import {punalurBangaloreRoute} from '../src/lib/seed/routeKL05BC9435';

const ADMIN_EMAILS = ['clubanandtravel@gmail.com', 'admin.onenesstravels@gmail.com'];

async function seedSchedules() {
  console.log('Seeding schedules for the next 30 days...');

  const today = new Date();
  const buses = await getBuses();

  if (buses.length === 0) {
    console.log("No manually added buses found to seed schedules for.");
    return;
  }
  
  for (const bus of buses) {
    // Skip schedule generation for the hardcoded initial buses
    if (initialBuses.some(b => b.busNumber === bus.busNumber)) continue;

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const scheduleId = `${dateStr}_${bus.id}`;

      try {
        const existingSchedule = await getSchedule(scheduleId);
        if (existingSchedule) {
          continue; // Skip if schedule already exists
        }
        
        let seatPrices = {};
        if (bus.seatLayout && typeof bus.seatLayout === 'object' && 'seats' in bus.seatLayout && Array.isArray((bus.seatLayout as any).seats)) {
            seatPrices = (bus.seatLayout as any).seats.reduce((acc: any, seat: any) => {
                acc[seat.number] = seat.price || bus.baseFare;
                return acc;
            }, {});
        }

        const newSchedule = {
          id: scheduleId,
          busId: bus.id,
          date: dateStr,
          fare: bus.baseFare,
          totalSeats: bus.totalSeats || 0,
          availableSeats: bus.totalSeats || 0,
          bookings: [],
          seatPrices: seatPrices,
          createdAt: new Date(),
        };

        await addSchedule(newSchedule);

      } catch (error) {
        console.error(`Failed to seed schedule for bus ${bus.id} on ${dateStr}`, error);
      }
    }
  }

  console.log('Schedule seeding complete for manually added buses.');
}

async function main() {
    console.log('Starting seed process...');
    
    // Reset all rest stop statuses to 'upcoming' for a clean state
    console.log('Resetting all rest stop statuses...');
    await resetAllRestStopStatuses();
    console.log('✅ All rest stop statuses have been reset.');

    console.log('Seeding initial bus data...');

    // Get the actual UID for the main admin
    const mainAdminEmail = 'clubanandtravel@gmail.com';
    const mainAdminUid = await getAdminUserIdByEmail(mainAdminEmail);

    if (!mainAdminUid) {
      console.error(`CRITICAL: Could not find UID for admin ${mainAdminEmail}. Please ensure this user has logged in at least once.`);
      console.error("Skipping bus data seeding.");
      return;
    }
    
    console.log(`Found UID for ${mainAdminEmail}: ${mainAdminUid}`);
    
    const locations = ['Punalur', 'Bangalore'].sort();
    const serviceId = locations.map(l => l.toLowerCase()).join('-');

    await addService(serviceId, punalurBangaloreRoute);
    console.log(`✅ Service '${serviceId}' created/updated with route points.`);

    for (const bus of initialBuses) {
        const id = bus.busNumber.replace(/\s+/g, '');
        
        let operatorId = bus.operatorId;
        if (bus.travelsName === 'CLUB ANAND TRAVEL') {
            operatorId = mainAdminUid;
            console.log(`Assigning operatorId ${mainAdminUid} to ${bus.travelsName}`);
        }
        
        await addBus({
            ...bus,
            id,
            operatorId,
            serviceId, // This will now trigger the embedding of route points
        } as any);
        console.log(`Added/Updated bus: ${bus.travelsName} (${id})`);
    }
    
    await seedSchedules();
    
    for (const email of ADMIN_EMAILS) {
        console.log(`Attempting to grant admin role to: ${email}`);
        const adminResult = await createAdminRole(email);
        if (adminResult.success) {
          console.log(`✅ ${adminResult.message}`);
        } else {
          console.warn(`⚠️ Could not grant admin role to ${email}: ${adminResult.message}`);
        }
    }
    
    console.log('Seeding finished.');
}

main().catch(console.error);
