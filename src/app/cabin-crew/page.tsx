
'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowRight, MapPin, Users, Coffee, Ticket, UserCheck, Cookie, LifeBuoy, BellRing, IndianRupee } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import type { Schedule, Bus, EmergencyKitRequest } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useLiveBusData } from '@/hooks/use-live-bus-data';

interface LiveTrip extends Schedule {
  bus: Bus;
  totalPassengers: number;
  boardedCount: number;
}

export default function CabinCrewPage() {
  const router = useRouter();
  const { user, isUserLoading } = useFirebase();
  const [trip, setTrip] = useState<LiveTrip | null>(null);
  const [kitRequest, setKitRequest] = useState<EmergencyKitRequest | null>(null);
  const alarmAudioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();

  const busId = useMemo(() => trip?.bus.id || null, [trip]);
  const { isTrackingActive } = useLiveBusData(busId);


  useEffect(() => {
    if (isUserLoading || !user?.email) return;
    
    const now = new Date();
    const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const dateToUse = now < noon ? new Date(now.setDate(now.getDate() - 1)) : now;
    const dateStr = format(dateToUse, 'yyyy-MM-dd');

    const unsubscribe = dataService.onSchedulesForDateSnapshot(dateStr, async schedules => {
      if (!schedules.length || !user) {
        setTrip(null);
        return;
      }

      const operatorBuses = await dataService.getBuses();
      const assignedBus = operatorBuses.find(b => b.cabinCrewId === user.email);

      if (!assignedBus) {
        setTrip(null);
        return;
      }
      
      const scheduleForToday = schedules.find(s => s.actualBusId === assignedBus.id);

      if (!scheduleForToday) {
        setTrip(null);
        return;
      }

      const logicalBusForRoute = operatorBuses.find(b => b.id === scheduleForToday.busId);

      if (!logicalBusForRoute) {
        setTrip(null);
        return;
      }

      const bookings = scheduleForToday.bookings ?? [];

      // Check for new kit requests
      const pendingRequest = scheduleForToday.kitRequests?.find(req => req.status === 'pending');
      if (pendingRequest) {
        setKitRequest(pendingRequest);
        alarmAudioRef.current?.play().catch(e => console.error("Audio play failed", e));
      }
      
      const tripBus = {
        ...logicalBusForRoute,
        id: assignedBus.id, // Use the physical bus's ID
        busNumber: assignedBus.busNumber, // And its number
      };

      setTrip({
        ...scheduleForToday,
        bus: tripBus,
        totalPassengers: bookings.length,
        boardedCount: bookings.filter(b => b.boarded).length,
      });
    });

    return () => unsubscribe();
  }, [user, isUserLoading]);

  const handleAcknowledgeKitRequest = async () => {
    if (!kitRequest || !trip) return;
    try {
        await dataService.acknowledgeKitRequest(trip.id, kitRequest.timestamp);
        setKitRequest(null);
        alarmAudioRef.current?.pause();
        if (alarmAudioRef.current) alarmAudioRef.current.currentTime = 0;
        toast({
            title: "Request Acknowledged",
            description: `Please deliver the kit to ${kitRequest.passengerName} at seat ${kitRequest.seatNumber}.`
        });
    } catch (error) {
        toast({ title: "Error", description: "Could not acknowledge the request.", variant: "destructive" });
    }
  };

  const features = useMemo(() => {
    const defaultFeatures = {
        manifest: true,
        attendance: true,
        liveTracking: true,
        snacks: true,
        restStopCheckins: true,
        createTicket: true,
        busExpenses: true,
    };
    
    return { ...defaultFeatures, ...trip?.bus.consoleFeatures };
  }, [trip?.bus]);

  if (!trip) return null;

  return (
    <div className="container mx-auto px-4 py-6 select-text">
        <audio ref={alarmAudioRef} src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" loop preload="auto" />
        <AlertDialog open={!!kitRequest}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <div className="flex justify-center mb-4">
                        <div className="bg-pink-100 text-pink-600 rounded-full p-4 animate-pulse">
                            <LifeBuoy className="w-12 h-12" />
                        </div>
                    </div>
                    <AlertDialogTitle className="text-2xl text-center">
                        Emergency Kit Request
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-center text-lg pt-2">
                      <span>Please deliver a kit to:</span>
                      <span className="font-bold text-xl text-foreground mt-2 block">
                          {kitRequest?.passengerName}
                      </span>
                      <span className="font-mono text-base text-muted-foreground block">
                          Seat: {kitRequest?.seatNumber}
                      </span>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogAction onClick={handleAcknowledgeKitRequest} className="w-full">
                        Acknowledge & Stop Alarm
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

      {/* PAGE HEADER */}
      <header className="text-center mb-6">
        <h1 className="text-3xl font-bold">
          Cabin Crew Console
        </h1>
        <div className="text-center">
            <p className="text-xl font-semibold">
            {trip.bus.travelsName}
            </p>

            <div className="mt-2 inline-block bg-yellow-400 text-black font-mono font-bold px-3 py-1 rounded-md border border-black">
            {trip.bus.busNumber}
            </div>

            <p className="mt-2 text-md font-medium">
                {trip.direction === 'RETURN' ? trip.bus.destination : trip.bus.origin}
                <ArrowRight className="inline-block mx-1 h-4 w-4" />
                {trip.direction === 'RETURN' ? trip.bus.origin : trip.bus.destination}
            </p>
        </div>
        <p className="text-lg font-bold text-red-600 mt-1">
          {format(new Date(), 'dd MMMM yyyy, EEEE')}
        </p>
      </header>
      

      {/* CARDS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

        {features.manifest && (
          <Card className="rounded-2xl select-text flex flex-col">
            <CardHeader className="pb-1 text-center">
              <CardTitle className="text-xl font-bold">
                Passenger Manifest
              </CardTitle>
              <p className="text-sm text-black">
                Passenger entry list
              </p>
            </CardHeader>

            <CardContent className="pt-4 pb-5 flex-grow">
              <div className="flex justify-center mb-2">
                  <Users className="w-10 h-10 mx-auto text-blue-500" />
              </div>
              <div className="flex justify-center gap-6 px-2">
                <div className="text-center">
                  <p className="text-sm text-black">
                    Passengers
                  </p>
                  <p className="text-2xl font-bold">
                    {trip.totalPassengers}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-sm text-black">
                    Boarded
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {trip.boardedCount}
                  </p>
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-0 pb-4">
              <Button
                className="w-full bg-blue-800 hover:bg-blue-900 text-sm"
                onClick={() => router.push(`/cabin-crew/${trip.id}`)}
              >
                View
              </Button>
            </CardFooter>
          </Card>
        )}

        {features.attendance && (
            <Card className="rounded-2xl select-text flex flex-col">
              <CardHeader className="pb-1 text-center">
                <CardTitle className="text-xl font-bold">
                  Attendance
                </CardTitle>
                <p className="text-sm text-black">
                  Mark crew attendance
                </p>
              </CardHeader>
              <CardContent className="pt-4 pb-5 flex-grow flex flex-col items-center justify-center">
                  <div className="flex justify-center mb-2">
                    <UserCheck className="w-10 h-10 mx-auto text-indigo-500" />
                  </div>
                  <p className="text-sm text-center text-muted-foreground mt-2">
                    Mark attendance for the current trip.
                  </p>
              </CardContent>
              <CardFooter className="pt-0 pb-4">
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-sm"
                  onClick={() => router.push(`/cabin-crew/attendance?tripId=${trip.id}`)}
                >
                  Manage Crew
                </Button>
              </CardFooter>
            </Card>
        )}

        {features.liveTracking && (
            <Card className="rounded-2xl select-text flex flex-col">
              <CardHeader className="pb-1 text-center">
                <CardTitle className="text-xl font-bold">
                  Location
                </CardTitle>
                <CardDescription className="text-center">
                  Live Sharing is {isTrackingActive ? '(ACTIVE)' : '(INACTIVE)'}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 pb-5 flex-grow flex flex-col items-center justify-center">
                  <div className="relative flex h-10 w-10 items-center justify-center">
                    <div className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", isTrackingActive && "bg-green-500 animate-ping")}></div>
                    <div className={cn("relative inline-flex rounded-full h-8 w-8", isTrackingActive ? "bg-green-600" : "bg-red-600")}></div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">Live Sharing is</p>
                  <p className={cn("text-lg font-bold", isTrackingActive ? "text-green-600" : "text-red-600")}>{isTrackingActive ? 'ACTIVE' : 'INACTIVE'}</p>
              </CardContent>
              <CardFooter className="pt-0 pb-4">
                <Button
                  className="w-full bg-red-600 hover:bg-red-700 text-sm"
                  onClick={() => router.push(`/cabin-crew/tracking`)}
                >
                  View
                </Button>
              </CardFooter>
            </Card>
        )}
        
        {features.snacks && (
            <Card className="rounded-2xl select-text flex flex-col">
              <CardHeader className="pb-1 text-center">
                <CardTitle className="text-xl font-bold">
                  Snacks
                </CardTitle>
                <p className="text-sm text-black">
                  Distribute snacks and track
                </p>
              </CardHeader>
              <CardContent className="pt-4 pb-5 flex-grow flex flex-col items-center justify-center">
                  <div className="flex justify-center mb-2">
                    <Cookie className="w-10 h-10 mx-auto text-orange-500" />
                  </div>
                  <p className="text-sm text-center text-muted-foreground mt-2">
                    Manage in-trip refreshment distribution.
                  </p>
              </CardContent>
              <CardFooter className="pt-0 pb-4">
                <Button
                  className="w-full bg-orange-500 hover:bg-orange-600 text-sm"
                  onClick={() => router.push(`/cabin-crew/snacks?tripId=${trip.id}`)}
                >
                  Check-in
                </Button>
              </CardFooter>
            </Card>
        )}
        
        {features.restStopCheckins && (
            <Card className="rounded-2xl select-text flex flex-col">
              <CardHeader className="pb-1 text-center">
                <CardTitle className="text-xl font-bold">
                  Rest Stop Check-ins
                </CardTitle>
                <p className="text-sm text-black">
                  Update Upcoming Stops
                </p>
              </CardHeader>
              <CardContent className="pt-4 pb-5 flex-grow flex flex-col items-center justify-center">
                  <div className="flex justify-center mb-2">
                    <Coffee className="w-10 h-10 mx-auto text-yellow-600" />
                  </div>
                  <p className="text-sm text-center text-muted-foreground mt-2">
                    Halt Details
                  </p>
              </CardContent>
              <CardFooter className="pt-0 pb-4">
                <Button
                  className="w-full bg-yellow-600 hover:bg-yellow-700 text-sm"
                  onClick={() => router.push(`/track/${trip.id}/rest-stop?from=crew`)}
                >
                  Check-in
                </Button>
              </CardFooter>
            </Card>
        )}

        {features.createTicket && (
            <Card className="rounded-2xl select-text flex flex-col">
              <CardHeader className="pb-1 text-center">
                <CardTitle className="text-xl font-bold">
                  Create Ticket
                </CardTitle>
                <p className="text-sm text-black">
                  Generate a new ticket
                </p>
              </CardHeader>
              <CardContent className="pt-4 pb-5 flex-grow flex flex-col items-center justify-center">
                  <div className="flex justify-center mb-2">
                    <Ticket className="w-10 h-10 mx-auto text-purple-600" />
                  </div>
                  <p className="text-sm text-center text-muted-foreground mt-2">
                    Issue ticket without payment
                  </p>
              </CardContent>
              <CardFooter className="pt-0 pb-4">
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-sm"
                  onClick={() => router.push('/cabin-crew/generate-tickets')}
                >
                  Create
                </Button>
              </CardFooter>
            </Card>
        )}

        {features.busExpenses && (
            <Card className="rounded-2xl select-text flex flex-col">
              <CardHeader className="pb-1 text-center">
                <CardTitle className="text-xl font-bold">
                  Expense Management
                </CardTitle>
                <p className="text-sm text-black">
                  Track on-trip expenses
                </p>
              </CardHeader>
              <CardContent className="pt-4 pb-5 flex-grow flex flex-col items-center justify-center">
                  <div className="flex justify-center mb-2">
                    <IndianRupee className="w-10 h-10 mx-auto text-orange-500" />
                  </div>
                  <p className="text-sm text-center text-muted-foreground mt-2">
                    Log fuel, tolls, and other expenses.
                  </p>
              </CardContent>
              <CardFooter className="pt-0 pb-4">
                <Button
                  className="w-full bg-orange-500 hover:bg-orange-600 text-sm"
                  onClick={() => router.push(`/cabin-crew/expenses?busId=${trip.bus.id}`)}
                >
                  Manage
                </Button>
              </CardFooter>
            </Card>
        )}
      </div>
    </div>
  );
}
