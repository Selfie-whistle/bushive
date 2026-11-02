

'use client';

import React, { useState, useEffect, Suspense, use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { dataService } from '@/lib/data/client-service';
import { cn } from '@/lib/utils';
import type { Bus, Schedule, Seat } from '@/lib/types';
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
  gender?: string;
};

const getSeatType = (seat: Seat): string => {
    if (!seat.number) return "";
    const num = parseInt(seat.number.substring(1), 10);
    if (num % 3 === 1) return "Single";
    if (seat.row === 0) return "Window";
    if (seat.row === 1) return "Aisle";
    return "";
};

function SnackSeatBox({ 
    seat, 
    passenger,
    onSeatClick 
}: { 
    seat: Seat; 
    passenger?: PassengerSnackStatus; 
    onSeatClick: (seat: string, bookingId: string, currentStatus: boolean) => void;
}) {
    const isBooked = !!passenger;
    const isBoarded = passenger?.boarded;
    const gender = passenger?.gender;
    const isDistributed = passenger?.snackDistributed;
    const canClick = isBooked;

    return (
        <div
            onClick={() => canClick && onSeatClick(seat.number, passenger.bookingId, passenger.snackDistributed)}
            className={cn(
                "relative w-24 h-10 rounded-[6px] border-2 flex flex-col items-center justify-center text-[10px] font-headline transition",
                !isBooked && "bg-white border-green-600 text-gray-500 opacity-50",
                isBooked && !isDistributed && gender === "male" && "bg-white border-blue-600 text-blue-600",
                isBooked && !isDistributed && gender === "female" && "bg-white border-pink-600 text-pink-600",
                isBooked && isDistributed && gender === "male" && "bg-blue-600 border-blue-700 text-white",
                isBooked && isDistributed && gender === "female" && "bg-pink-600 border-pink-700 text-white",
                canClick ? "cursor-pointer hover:shadow-md" : "cursor-default"
            )}
        >
            <div className={cn("text-[9px] font-sans font-bold", isBooked && isDistributed ? "text-white/80" : "text-gray-400")}>{getSeatType(seat)}</div>
            
            <div
                className={cn(
                "absolute right-[3px] top-1/2 -translate-y-1/2 w-[4px] h-[70%] rounded-full",
                isBooked ? "bg-white/80" : "bg-gray-400"
                )}
            />
            
            <span className="text-[10px] font-sans font-semibold z-10 flex items-center gap-1">
                {seat.number} 
            </span>
        </div>
    );
}

function SnackBerth({
    seats,
    passengers,
    onSeatClick,
    title,
}: {
    seats: Seat[];
    passengers: PassengerSnackStatus[];
    onSeatClick: (seat: string, bookingId: string, currentStatus: boolean) => void;
    title: string;
}) {
    if (seats.length === 0) return null;

    const seatByNumber: Record<number, Seat> = {};
    seats.forEach(seat => {
        const num = parseInt(String(seat.number).replace(/\D/g, ""), 10);
        if (!isNaN(num)) {
            seatByNumber[num] = seat;
        }
    });

    const rows = 3;
    const cols = Math.ceil(seats.length / rows);

    return (
        <div className="mb-8 w-full overflow-x-auto">
            <h3 className="text-center font-bold text-gray-500 mb-4">{title}</h3>
            <div className="flex gap-12 w-max mx-auto px-4 pb-2">
                {Array.from({ length: cols }).map((_, colIndex) => {
                    const colStartNum = colIndex * 3 + 1;
                    const seatsInCol = [
                        seatByNumber[colStartNum + 2],
                        seatByNumber[colStartNum + 1],
                        null,
                        seatByNumber[colStartNum]
                    ];
                    
                    return (
                        <div key={`col-${colIndex}`} className="flex flex-col gap-2">
                            {seatsInCol.map((seat, rowIndex) => {
                                if (seat === null) {
                                    return <div key={`aisle-${colIndex}`} className="h-6" />;
                                }
                                if (!seat) {
                                    return <div key={`empty-${colIndex}-${rowIndex}`} className="w-24 h-10" />;
                                }
                                const passenger = passengers.find(p => p.seat === seat.number);
                                return (
                                    <SnackSeatBox 
                                        key={seat.id} 
                                        seat={seat} 
                                        passenger={passenger} 
                                        onSeatClick={onSeatClick} 
                                    />
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

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
      const busIdToFetch = schedule?.actualBusId || schedule?.busId;
      if (busIdToFetch) {
        const busData = await dataService.getBusById(busIdToFetch);
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
                gender: passenger?.gender || booking?.gender || 'male',
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
        <CardContent className="space-y-3 pt-6 max-h-[70vh] overflow-y-auto w-full">
            <div className="relative w-full border-[3px] border-gray-400 rounded-lg p-6 bg-white min-h-[300px] flex items-center justify-center shadow-sm overflow-x-auto">
                <div className="flex flex-col w-full gap-8">
                    <SnackBerth 
                        seats={bus.seatLayout?.seats?.filter(s => s.deck === 'lower') || []} 
                        passengers={passengerSnacks} 
                        onSeatClick={handleToggleSnack} 
                        title="Lower Berth" 
                    />
                    <SnackBerth 
                        seats={bus.seatLayout?.seats?.filter(s => s.deck === 'upper') || []} 
                        passengers={passengerSnacks} 
                        onSeatClick={handleToggleSnack} 
                        title="Upper Berth" 
                    />
                </div>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-6 text-xs text-muted-foreground font-medium">
                <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-blue-600 rounded"></div> Male Booked</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-pink-600 rounded"></div> Female Booked</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-green-600 rounded opacity-50"></div> Available</div>
                <div className="flex items-center gap-2 ml-2"><div className="w-4 h-4 bg-blue-600 border-2 border-blue-700 rounded"></div> Snack Provided</div>
            </div>
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
