

'use client';

import React, { useState, useEffect, Suspense, use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { dataService } from '@/lib/data/client-service';
import type { Bus, Schedule } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Cookie, UserCheck, Frown } from 'lucide-react';
import { useSchedule as useScheduleHook } from '@/hooks/use-schedule';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type PassengerSnackStatus = {
  seat: string;
  name: string;
  snackDistributed: boolean;
  bookingId: string;
  boarded?: boolean;
};

function SnacksPageContent() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get('tripId');
  const router = useRouter();
  const { toast } = useToast();

  const { schedule, isLoading: isScheduleLoading } = useScheduleHook(tripId || undefined);
  const [bus, setBus] = useState<Bus | null>(null);
  const [passengerSnacks, setPassengerSnacks] = useState<PassengerSnackStatus[]>([]);
  const [loadingBus, setLoadingBus] = useState(true);

  useEffect(() => {
    async function fetchBusDetails() {
      if (schedule?.busId) {
        const busData = await dataService.getBusById(schedule.busId);
        setBus(busData);
      }
      setLoadingBus(false);
    }

    if (schedule) {
      fetchBusDetails();
    }
  }, [schedule]);

  useEffect(() => {
    async function fetchPassengerDetails() {
        if (!schedule || !schedule.bookings) {
          setPassengerSnacks([]);
          return;
        }

        const detailsPromises = schedule.bookings.map(async (bookingRef) => {
            const booking = await dataService.getBookingById(bookingRef.userId, bookingRef.bookingId);
            const passenger = booking?.passengers.find(p => p.seatNumber === bookingRef.seat);
            return {
                seat: bookingRef.seat,
                name: passenger?.name || 'Unknown Passenger',
                snackDistributed: !!bookingRef.snackDistributed,
                bookingId: bookingRef.bookingId,
                boarded: !!bookingRef.boarded,
            }
        });
        const details = await Promise.all(detailsPromises);
        setPassengerSnacks(details.sort((a,b) => a.seat.localeCompare(b.seat, undefined, {numeric: true})));
    }
    
    fetchPassengerDetails();
  }, [schedule]);

  const handleToggleSnack = async (seat: string, bookingId: string, currentStatus: boolean) => {
    if (!schedule) return;

    const newStatus = !currentStatus;
    try {
      await dataService.updateSnackStatus(schedule.id, bookingId, seat, newStatus);
      // Optimistic update
      setPassengerSnacks(prev =>
        prev.map(p => (p.seat === seat ? { ...p, snackDistributed: newStatus } : p))
      );
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update snack status.",
        variant: "destructive",
      });
    }
  };

  const isLoading = isScheduleLoading || loadingBus;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-10 w-28" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!schedule || !bus) {
    return (
        <div className="container mx-auto px-4 py-8 max-w-lg">
            <Card>
                <CardHeader className="text-center">
                    <Frown className="mx-auto w-12 h-12 text-muted-foreground" />
                    <CardTitle className="mt-2">Trip Not Found</CardTitle>
                    <CardDescription>The specified trip could not be loaded.</CardDescription>
                </CardHeader>
                <CardFooter>
                    <Button onClick={() => router.push('/cabin-crew')} className="w-full">
                        <ArrowLeft className="mr-2 h-4 w-4"/>
                        Go Back
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <Button variant="ghost" size="sm" onClick={() => router.push('/cabin-crew')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Console
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cookie className="w-6 h-6 text-primary" />
            Snacks Distribution
          </CardTitle>
          <CardDescription>
            Check off passengers as you distribute snacks for the trip on {bus.travelsName} ({bus.busNumber}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[60vh] overflow-y-auto">
          {passengerSnacks.length > 0 ? (
            passengerSnacks.map((passenger) => (
              <div
                key={passenger.seat}
                className="flex items-center justify-between p-3 border rounded-lg bg-background"
              >
                <div>
                  <p className="font-semibold">{passenger.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Seat: {passenger.seat}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                   <Label htmlFor={`snack-${passenger.seat}`} className="text-sm font-medium pr-2">
                        {passenger.snackDistributed ? 'Distributed' : 'Pending'}
                    </Label>
                    <Checkbox 
                        id={`snack-${passenger.seat}`}
                        checked={passenger.snackDistributed}
                        onCheckedChange={() => handleToggleSnack(passenger.seat, passenger.bookingId, passenger.snackDistributed)}
                        disabled={!passenger.boarded}
                    />
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-4">
              No passengers have booked this trip yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SnacksPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <SnacksPageContent />
        </Suspense>
    )
}
