'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { dataService } from '@/lib/data/client-service';
import type { Bus, Schedule, RestStop } from '@/lib/types';
import { useSchedule } from '@/hooks/use-schedule';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Users } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { IndianSleeper36Layout } from '@/components/ui/indian-sleeper-36-layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


export default function RestStopManifestClient({ scheduleId }: { scheduleId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stopId = searchParams.get('stopId');
  const { toast } = useToast();

  const { schedule, isLoading: isScheduleLoading } = useSchedule(scheduleId);
  const [bus, setBus] = useState<Bus | null>(null);
  const [restStop, setRestStop] = useState<RestStop | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeBerth, setActiveBerth] = useState<'lower' | 'upper'>('lower');

  const isLoading = isScheduleLoading || !bus || !restStop;

  const stopStatus = useMemo(() => {
    if (!schedule || !stopId) return null;
    return schedule.stopStatuses?.[stopId];
  }, [schedule, stopId]);

  const checkedInSeats = useMemo(() => stopStatus?.checkedInSeats || [], [stopStatus]);

  const originallyBoardedBookings = useMemo(() => {
    // Only count passengers who were marked as boarded but not yet deboarded
    return schedule?.bookings.filter(b => b.boarded && !b.deboarded) || [];
  }, [schedule]);

  const totalToReboard = originallyBoardedBookings.length;
  const reboardedCount = checkedInSeats.length;

  useEffect(() => {
    if (!schedule || !schedule.busId) return;

    async function fetchData() {
      const busData = await dataService.getBusById(schedule.busId);
      setBus(busData);
      
      if (busData && stopId) {
        const stops = schedule.direction === 'RETURN' ? busData.restStopsReturn : busData.restStopsForward;
        const stopData = stops?.find(s => s.id === stopId);
        setRestStop(stopData || null);
      }
    }
    fetchData();
  }, [schedule, stopId]);
  
  const handleDepart = async () => {
    if (!scheduleId || !stopId) return;
    setIsSubmitting(true);
    try {
        await dataService.updateRestStopStatus(scheduleId, stopId, 'departed');
        toast({ title: 'Bus Departed', description: 'The bus has now departed from the rest stop.' });
        router.back();
    } catch (e) {
        toast({ title: "Error", description: "Failed to mark as departed.", variant: "destructive"});
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleBoardingToggle = async (seatNumber: string, bookingId: string, isBoarded: boolean) => {
    if (!scheduleId || !stopId) return;
    try {
      await dataService.toggleRestStopPassengerCheck(scheduleId, stopId, seatNumber);
      toast({
        title: !isBoarded ? 'Passenger Re-boarded' : 'Check Removed',
        description: `Seat ${seatNumber} status updated.`,
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: `Failed to update status: ${e.message}`,
        variant: 'destructive',
      });
    }
  };
  
  if (isLoading) {
    return (
        <div className="container mx-auto px-4 py-8 max-w-2xl">
            <Skeleton className="h-8 w-1/2 mb-4" />
            <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
        </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-2xl font-bold font-headline">{restStop?.name || 'Passenger Check'}</h1>
          <p className="text-muted-foreground">{bus?.travelsName} - {bus?.busNumber}</p>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Users className="h-6 w-6 text-primary" />
            Passenger Roll-call ({reboardedCount} / {totalToReboard})
          </CardTitle>
          <CardDescription>
            Tap a seat to confirm re-boarding. Dim violet seats are safely onboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
            {bus && schedule ? (
              <Tabs value={activeBerth} onValueChange={(v) => setActiveBerth(v as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="lower">Lower Deck</TabsTrigger>
                  <TabsTrigger value="upper">Upper Deck</TabsTrigger>
                </TabsList>
                <TabsContent value="lower">
                  <IndianSleeper36Layout 
                    bus={bus} 
                    schedule={schedule}
                    berth="lower"
                    showLegend={false}
                    showPrice={false}
                    disableGenderReservation={true}
                    onBoardingToggle={handleBoardingToggle}
                    isRestStopManifest={true}
                    checkedInSeats={checkedInSeats}
                  />
                </TabsContent>
                <TabsContent value="upper">
                  <IndianSleeper36Layout 
                    bus={bus} 
                    schedule={schedule}
                    berth="upper" 
                    showLegend={false}
                    showPrice={false}
                    disableGenderReservation={true}
                    onBoardingToggle={handleBoardingToggle}
                    isRestStopManifest={true}
                    checkedInSeats={checkedInSeats}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <p>No seat layout information available.</p>
              </div>
            )}
        </CardContent>
        <CardFooter>
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button className="w-full h-12 text-lg font-bold" disabled={isSubmitting}>
                        {isSubmitting ? 'Departing...' : 'Confirm All Onboard & Depart'}
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Departure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {reboardedCount < totalToReboard ? (
                                <span className="text-destructive font-bold">WARNING: {totalToReboard - reboardedCount} passenger(s) are still missing!</span>
                            ) : (
                                "All passengers verified. Ready for departure."
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Wait</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDepart}>Confirm Departure</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </CardFooter>
      </Card>
    </div>
  );
}