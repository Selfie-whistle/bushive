
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { usePassengerList } from '@/hooks/use-passenger-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TD, TH, TableHeader, TR } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Frown, ArrowLeft, Bus, Calendar, User, IndianRupee, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import React, { useEffect, useState, Suspense, useMemo, useCallback } from 'react';
import { dataService } from '@/lib/data/client-service';
import type { Bus as BusType, Seat, Schedule } from '@/lib/types';
import { useSchedule as useScheduleHook } from '@/hooks/use-schedule';

export default function BookingDetailsPageContent({ scheduleId }: { scheduleId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromFare = searchParams.get('from') === 'fare';

  const { schedule, isLoading: isScheduleLoading, refresh } = useScheduleHook(scheduleId);
  const passengers = usePassengerList(schedule);
  const [bus, setBus] = useState<BusType | null>(null);
  const [loadingBus, setLoadingBus] = useState(true);

  const fetchBusDetails = useCallback(async () => {
    if (schedule && schedule.busId) {
      setLoadingBus(true);
      const busData = await dataService.getBusById(schedule.busId);
      setBus(busData);
      setLoadingBus(false);
    } else if (schedule === null && !isScheduleLoading) {
      setLoadingBus(false);
    }
  }, [schedule, isScheduleLoading]);
  
  useEffect(() => {
    fetchBusDetails();
  }, [fetchBusDetails]);

  const extractAllSeats = useCallback(() => {
    if (!bus?.seatLayout) return [];
    return bus.seatLayout.seats || [];
  }, [bus]);

  const totalSeats = useMemo(() => {
    if (!schedule) return 0;
    const allSeats = extractAllSeats();
    return allSeats.length > 0 ? allSeats.length : schedule.totalSeats;
  }, [extractAllSeats, schedule]);

  const bookedSeatsCount = useMemo(() => schedule?.bookings?.length || 0, [schedule]);
  
  const lowestFare = useMemo(() => {
    if (!schedule || !bus?.seatLayout?.seats) return schedule?.fare ?? bus?.baseFare ?? 0;

    const allSeats: Seat[] = bus.seatLayout.seats;
    const bookedSeatNumbers = new Set(schedule.bookings?.map((b: any) => b.seat));
    const seatPrices = schedule.seatPrices || {};

    const availableSeats = allSeats.filter(seat => !bookedSeatNumbers.has(seat.number));

    if (availableSeats.length === 0) {
        return schedule.fare;
    }
    
    const validPrices = availableSeats.map(seat => seatPrices[seat.number] || bus.baseFare).filter(price => price > 0);

    if (validPrices.length === 0) return schedule.fare;
    
    return Math.min(...validPrices);
  }, [schedule, bus]);


  if (loadingBus || isScheduleLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="outline" size="icon" onClick={() => router.push('/admin/bookings')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">Loading...</h1>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-1/4 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!schedule || !bus) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <Frown className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Schedule or Bus details could not be loaded.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-4">
        <Button variant="outline" size="icon" onClick={() => router.push('/admin/bookings')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">Booking Details</h1>
      </div>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{bus?.travelsName || 'Schedule Information'}</CardTitle>
              <CardDescription>Details for schedule ID: <span className="font-mono">{schedule.id}</span></CardDescription>
            </div>
             {bus && (
              <div className="text-right">
                  <div className="font-semibold text-lg flex items-center gap-2">
                      {bus.origin} <ArrowRight className="h-4 w-4 text-muted-foreground" /> {bus.destination}
                  </div>
                  <div className="mt-1">
                      <div className="bg-yellow-400 text-black font-mono text-sm font-bold px-2 py-1 rounded-md border-2 border-black inline-block">
                          {bus.busNumber}
                      </div>
                  </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-semibold">{schedule.date}</p>
                </div>
            </div>
             <div className="flex items-center gap-2">
                <IndianRupee className="h-5 w-5 text-muted-foreground" />
                <div>
                    <p className="text-sm text-muted-foreground">Lowest Fare</p>
                    <p className="font-semibold">{lowestFare > 0 ? lowestFare : 'N/A'}</p>
                </div>
            </div>
             <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                    <p className="text-sm text-muted-foreground">Booked / Total</p>
                    <p className="font-semibold">{bookedSeatsCount} / {totalSeats}</p>
                </div>
            </div>
            <div className="flex items-center gap-2 col-span-2 md:col-span-1">
                <Bus className="h-5 w-5 text-muted-foreground" />
                <div>
                    <p className="text-sm text-muted-foreground">Bus ID</p>
                    <p className="font-semibold font-mono text-xs">{schedule.busId}</p>
                </div>
            </div>
        </CardContent>
      </Card>

      {!fromFare && (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>Passenger Manifest</CardTitle>
                <CardDescription>{passengers.length} passenger(s) on this bus.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                    <TR>
                        <TH>Seat</TH>
                        <TH>Passenger Name</TH>
                        <TH>Gender</TH>
                        <TH>Booked At</TH>
                    </TR>
                    </TableHeader>
                    <TableBody>
                    {passengers.map((p: any) => (
                        <TR key={p.seat}>
                        <TD className="font-mono">{p.seat}</TD>
                        <TD>{p.passengerName || 'N/A'}</TD>
                        <TD className="capitalize">{p.gender}</TD>
                        <TD>{p.bookedAt ? new Date(p.bookedAt).toLocaleString() : 'N/A'}</TD>
                        </TR>
                    ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
