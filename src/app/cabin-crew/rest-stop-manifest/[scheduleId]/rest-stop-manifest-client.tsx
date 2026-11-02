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
import { ArrowLeft, Users, Coffee, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { IndianSleeper36Layout } from '@/components/ui/indian-sleeper-36-layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';


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
    const busIdToListen = schedule?.actualBusId || schedule?.busId;
    if (!busIdToListen) return;

    const unsubBus = dataService.onBusSnapshot(busIdToListen, (busData) => {
      setBus(busData);
      
      if (busData && stopId) {
        const isReturn = schedule?.direction === 'RETURN' || scheduleId.includes('_RETURN');
        const stops = isReturn 
          ? (busData.restStopsReturn && busData.restStopsReturn.length > 0 ? busData.restStopsReturn : busData.restStops)
          : (busData.restStopsForward && busData.restStopsForward.length > 0 ? busData.restStopsForward : busData.restStops);
        const stopData = stops?.find(s => s.id === stopId);
        setRestStop(stopData || null);
      }
    });

    return () => unsubBus();
  }, [schedule, stopId, scheduleId]);
  
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
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-50 via-sky-50 to-white overflow-hidden pb-24">
        {/* Animated Background Blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-60">
           <motion.div 
              animate={{ rotate: 360, scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 40, 0] }} 
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-300/30 blur-[100px]"
           />
           <motion.div 
              animate={{ rotate: -360, scale: [1, 1.3, 1], x: [0, -40, 0], y: [0, -50, 0] }} 
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-sky-300/30 blur-[100px]"
           />
        </div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>

        {/* Sticky Header */}
        <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 shadow-sm pt-4 pb-4 px-4 mb-6">
            <div className="container max-w-2xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full bg-gray-100/50 hover:bg-gray-200">
                        <ArrowLeft className="w-5 h-5 text-gray-700" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-sky-500 tracking-tight">
                            {restStop?.name || 'Rest Stop'}
                        </h1>
                        <p className="text-xs font-bold text-gray-500">{bus?.travelsName} • {bus?.busNumber}</p>
                    </div>
                </div>
                <div className="bg-yellow-100 text-yellow-800 p-2 rounded-full border border-yellow-200">
                    <Coffee className="w-5 h-5" />
                </div>
            </div>
        </div>
      
        <div className="container mx-auto px-4 max-w-2xl relative z-10">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <div className="bg-white/70 backdrop-blur-xl border border-white/60 shadow-xl rounded-3xl overflow-hidden ring-1 ring-black/5">
                    
                    {/* Progress Section */}
                    <div className="p-6 border-b border-gray-100/50 bg-white/40">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                <Users className="w-5 h-5 text-indigo-500" />
                                Passenger Roll-call
                            </h2>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black text-indigo-600">{reboardedCount}</span>
                                <span className="text-lg font-bold text-gray-400">/ {totalToReboard}</span>
                            </div>
                        </div>
                        <Progress value={(reboardedCount / totalToReboard) * 100} className="h-3 bg-gray-100" />
                        <p className="text-sm font-semibold text-gray-500 mt-3 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse"></span>
                            Tap a seat to confirm re-boarding. Dim violet seats are onboard.
                        </p>
                    </div>

                    <div className="p-4 md:p-6">
                        {bus && schedule ? (
                        <Tabs value={activeBerth} onValueChange={(v) => setActiveBerth(v as any)} className="w-full">
                            <TabsList className="grid w-full grid-cols-2 bg-gray-100/80 p-1 rounded-2xl mb-6">
                            <TabsTrigger value="lower" className="rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Lower Deck</TabsTrigger>
                            <TabsTrigger value="upper" className="rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Upper Deck</TabsTrigger>
                            </TabsList>
                            <TabsContent value="lower" className="mt-0">
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
                            <TabsContent value="upper" className="mt-0">
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
                    </div>
                </div>
            </motion.div>
        </div>

        {/* Floating Action Button for Departure */}
        <motion.div 
            initial={{ y: 100 }} animate={{ y: 0 }} transition={{ delay: 0.3 }}
            className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/90 to-transparent z-50 pointer-events-none"
        >
            <div className="container max-w-2xl mx-auto pointer-events-auto">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button 
                            className={`w-full h-16 rounded-2xl text-lg font-black shadow-2xl transition-transform active:scale-95 ${reboardedCount < totalToReboard ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 ring-4 ring-red-500/20' : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 ring-4 ring-green-500/20'}`} 
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Departing...' : 'Confirm All Onboard & Depart'}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-3xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-2xl font-black flex items-center gap-2">
                                {reboardedCount < totalToReboard ? <AlertCircle className="text-red-500 w-6 h-6" /> : <CheckCircle2 className="text-green-500 w-6 h-6" />}
                                Confirm Departure?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-base text-gray-600">
                                {reboardedCount < totalToReboard ? (
                                    <span className="text-red-600 font-bold block bg-red-50 p-4 rounded-xl mt-2 border border-red-100">
                                        WARNING: {totalToReboard - reboardedCount} passenger(s) are still missing! Leaving now may result in stranded passengers.
                                    </span>
                                ) : (
                                    <span className="block bg-green-50 p-4 rounded-xl mt-2 border border-green-100 text-green-800 font-bold">
                                        All {totalToReboard} passengers have been verified and are onboard. Safe travels!
                                    </span>
                                )}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="mt-4">
                            <AlertDialogCancel className="h-12 rounded-xl font-bold">Wait</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDepart} className={`h-12 rounded-xl font-bold ${reboardedCount < totalToReboard ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                                Force Departure
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </motion.div>
    </div>
  );
}