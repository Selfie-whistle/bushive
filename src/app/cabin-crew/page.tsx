
'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, MapPin, Users, Coffee, Ticket, UserCheck, Cookie, LifeBuoy, BellRing, IndianRupee, Camera, Briefcase, AlertCircle, AlertTriangle, HeartPulse } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import type { Schedule, Bus, EmergencyKitRequest, StopRequest } from '@/lib/types';
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
import { calculateRestStopEta } from '@/lib/eta';

interface LiveTrip extends Schedule {
  bus: Bus;
  totalPassengers: number;
  boardedCount: number;
}

export default function CabinCrewPage() {
  const router = useRouter();
  const { user, isUserLoading } = useFirebase();
  const [trip, setTrip] = useState<LiveTrip | null>(null);
  const [assignedBus, setAssignedBus] = useState<Bus | null>(null);
  const [kitRequest, setKitRequest] = useState<EmergencyKitRequest | null>(null);
  const [newBookingMessage, setNewBookingMessage] = useState<{ seats: string, message: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const alarmAudioRef = useRef<HTMLAudioElement>(null);
  const newBookingAlarmRef = useRef<HTMLAudioElement>(null);
  const newBookingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousBookingsCountRef = useRef<number>(-1);
  const previousScheduleIdRef = useRef<string | null>(null);
  const { toast } = useToast();

  const busId = useMemo(() => trip?.actualBusId || trip?.bus?.id || assignedBus?.id || null, [trip, assignedBus]);
  const { isTrackingActive, liveLocation } = useLiveBusData(busId);

  const nextRestStopInfo = useMemo(() => {
    const activeBus = trip?.bus || assignedBus;
    if (!activeBus) return null;
    const isReturn = trip?.direction === 'RETURN' || trip?.id?.includes('_RETURN');
    const stops = isReturn
      ? (activeBus.restStopsReturn && activeBus.restStopsReturn.length > 0 ? activeBus.restStopsReturn : activeBus.restStops || [])
      : (activeBus.restStopsForward && activeBus.restStopsForward.length > 0 ? activeBus.restStopsForward : activeBus.restStops || []);

    const upcoming = stops.find(s => {
      const status = trip?.stopStatuses?.[s.id]?.status;
      return status !== 'departed';
    });
    if (!upcoming) return null;

    if (!isTrackingActive || !liveLocation) {
      return { stop: upcoming, eta: null };
    }

    const eta = calculateRestStopEta(liveLocation, upcoming.coordinates);
    return { stop: upcoming, eta };
  }, [trip, assignedBus, isTrackingActive, liveLocation]);

  const pendingStopRequest = useMemo(() => {
    if (!trip?.stopRequests) return null;
    return (trip.stopRequests as StopRequest[]).find(r => r.status === 'pending') || null;
  }, [trip?.stopRequests]);


  useEffect(() => {
    if (isUserLoading || !user?.email) return;
    
    const now = new Date();
    const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const dateToUse = now < noon ? new Date(now.setDate(now.getDate() - 1)) : now;
    const dateStr = format(dateToUse, 'yyyy-MM-dd');

    const unsubscribe = dataService.onSchedulesForDateSnapshot(dateStr, async schedules => {
      if (!user) {
        setTrip(null);
        setAssignedBus(null);
        previousBookingsCountRef.current = -1;
        return;
      }

      const operatorBuses = await dataService.getBuses();
      const currentAssignedBus = operatorBuses.find(b => b.cabinCrewId === user.email);

      if (!currentAssignedBus) {
        setAssignedBus(null);
        setTrip(null);
        return;
      }

      setAssignedBus(currentAssignedBus);

      if (!schedules.length) {
        setTrip(null);
        previousBookingsCountRef.current = -1;
        return;
      }
      
      const busSchedules = schedules.filter(s => (s.actualBusId || s.busId) === currentAssignedBus.id);
      const scheduleForToday = busSchedules.find(s => s.tripStatus === 'in-progress') || 
                               busSchedules.find(s => !s.tripStatus || s.tripStatus === 'not-started') || 
                               busSchedules[0];

      if (!scheduleForToday) {
        setTrip(null);
        previousBookingsCountRef.current = -1;
        return;
      }

      const logicalBusForRoute = operatorBuses.find(b => b.id === scheduleForToday.busId);

      if (!logicalBusForRoute) {
        setTrip(null);
        previousBookingsCountRef.current = -1;
        return;
      }

      const bookings = scheduleForToday.bookings ?? [];
      
      if (previousScheduleIdRef.current !== scheduleForToday.id) {
          previousScheduleIdRef.current = scheduleForToday.id;
          previousBookingsCountRef.current = bookings.length;
      } else {
          previousBookingsCountRef.current = bookings.length;
      }

      // Check for new kit requests
      const pendingRequest = scheduleForToday.kitRequests?.find(req => req.status === 'pending');
      if (pendingRequest) {
        setKitRequest(pendingRequest);
        alarmAudioRef.current?.play().catch(e => console.error("Audio play failed", e));
      }
      
      const tripBus = {
        ...logicalBusForRoute,
        id: currentAssignedBus.id, // Use the physical bus's ID
        busNumber: currentAssignedBus.busNumber, // And its number
      };

      setTrip({
        ...scheduleForToday,
        bus: tripBus,
        totalPassengers: bookings.length,
        boardedCount: bookings.filter(b => b.boarded).length,
      });

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('bushive_crew_active_trip_id', scheduleForToday.id);
        localStorage.setItem('bushive_crew_active_trip_id', scheduleForToday.id);
        window.dispatchEvent(new CustomEvent('bushive:active_trip_changed', { detail: { tripId: scheduleForToday.id } }));
      }
    }, (error) => {
      console.error("Error fetching schedules:", error);
      toast({ title: "Error", description: "Could not load active trips.", variant: "destructive" });
    });

    return () => {
      unsubscribe();
      if (newBookingTimerRef.current) clearTimeout(newBookingTimerRef.current);
    };
  }, [user, isUserLoading]);

  const handleCloseNewBooking = () => {
      setNewBookingMessage(null);
      if (newBookingAlarmRef.current) {
          newBookingAlarmRef.current.pause();
          newBookingAlarmRef.current.currentTime = 0;
      }
      if (newBookingTimerRef.current) clearTimeout(newBookingTimerRef.current);
  };

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
        photoUpdate: true,
        luggageRegister: true,
    };
    
    return { ...defaultFeatures, ...assignedBus?.consoleFeatures };
  }, [assignedBus]);

  if (isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
          <p className="text-lg font-medium text-muted-foreground">Loading console...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-4 max-w-md p-8 bg-white rounded-xl shadow-sm border">
          <LifeBuoy className="w-16 h-16 mx-auto text-blue-500" />
          <h2 className="text-2xl font-bold">Access Denied</h2>
          <p className="text-muted-foreground">Please sign in with your cabin crew credentials to access the console.</p>
          <Button className="w-full mt-4" onClick={() => router.push('/login')}>Go to Login</Button>
        </div>
      </div>
    );
  }

  if (!assignedBus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-4 max-w-md p-8 bg-white rounded-xl shadow-sm border">
          <Coffee className="w-16 h-16 mx-auto text-yellow-500" />
          <h2 className="text-2xl font-bold">No Bus Assigned</h2>
          <p className="text-muted-foreground">You are not currently assigned to any bus. Please contact dispatch if this is an error.</p>
        </div>
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-50 via-sky-50 to-white overflow-hidden select-text pb-12">
        {/* Animated Background Blobs & Grid */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-60">
           <motion.div 
              animate={{ rotate: 360, scale: [1, 1.3, 1], x: [0, 60, -30, 0], y: [0, 50, -50, 0] }} 
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-300/40 blur-[120px]"
           />
           <motion.div 
              animate={{ rotate: -360, scale: [1, 1.4, 1], x: [0, -50, 50, 0], y: [0, -40, 60, 0] }} 
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              className="absolute bottom-[-10%] right-[-10%] w-[55vw] h-[55vw] rounded-full bg-sky-300/40 blur-[120px]"
           />
           <motion.div 
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.6, 0.3] }} 
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-[30%] left-[40%] w-[30vw] h-[30vw] rounded-full bg-purple-300/30 blur-[100px]"
           />
        </div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>

        <audio ref={alarmAudioRef} src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" loop preload="auto" />
        <audio ref={newBookingAlarmRef} src="https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg" loop preload="auto" />
        


        {/* Kit Request Modal */}
        <AlertDialog open={!!kitRequest}>
            <AlertDialogContent className="rounded-3xl border-0 shadow-2xl bg-gradient-to-b from-white to-pink-50">
                <AlertDialogHeader>
                    <div className="flex justify-center mb-4 relative">
                        <div className="absolute inset-0 bg-pink-400 blur-xl opacity-30 rounded-full animate-pulse"></div>
                        <div className="bg-pink-100 text-pink-600 rounded-full p-5 relative z-10 animate-bounce">
                            <LifeBuoy className="w-12 h-12" />
                        </div>
                    </div>
                    <AlertDialogTitle className="text-3xl text-center font-black text-gray-900 tracking-tight">
                        Emergency Kit Request
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-center text-lg pt-2">
                      <span className="text-gray-500 font-medium">Please deliver a kit to:</span>
                      <span className="font-black text-2xl text-gray-900 mt-2 block tracking-tight">
                          {kitRequest?.passengerName}
                      </span>
                      <span className="font-bold text-lg text-indigo-500 bg-indigo-50 inline-block px-4 py-1 rounded-full mt-3 uppercase tracking-widest">
                          Seat {kitRequest?.seatNumber}
                      </span>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-4">
                    <AlertDialogAction onClick={handleAcknowledgeKitRequest} className="w-full rounded-xl h-12 text-lg font-bold bg-pink-600 hover:bg-pink-700 shadow-md">
                        Acknowledge & Stop Alarm
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

      <div className="relative z-10 container mx-auto px-4 py-6">
          {/* PAGE HEADER */}
          <motion.header 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-10 mt-4 relative"
          >
            {/* Animated Bus passing behind the text */}
            <motion.div 
                animate={{ x: ['-100vw', '100vw'] }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 left-0 opacity-10 pointer-events-none flex items-center"
            >
                <div className="text-[120px]">🚌</div>
            </motion.div>

            <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-sky-500 tracking-tight pb-2 relative z-10">
              Cabin Crew Console
            </h1>
            
            <p className="text-xl font-black text-red-600 tracking-widest mt-1 relative z-10 drop-shadow-sm uppercase">
                {format(currentTime, 'hh:mm:ss a')}
            </p>
            
            <div className="flex flex-col items-center justify-center gap-4 mt-6">
                  {trip ? (
                    <motion.div 
                        whileHover={{ scale: 1.05 }}
                        className="bg-white/80 backdrop-blur-md px-8 py-5 rounded-3xl border border-white shadow-xl flex flex-col md:flex-row items-center gap-6 md:gap-10 ring-1 ring-black/5 hover:shadow-2xl transition-all duration-300 relative overflow-hidden"
                    >
                        {/* Shimmer effect */}
                        <motion.div 
                            animate={{ x: ['-100%', '200%'] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
                            className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent skew-x-12"
                        />
                        <div className="text-center md:text-left relative z-10 flex flex-col">
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">{trip.bus.travelsName}</h2>
                            <p className="text-sm font-bold text-indigo-600 uppercase tracking-widest mt-1">
                                {format(currentTime, 'EEEE, dd MMM yyyy')}
                            </p>
                        </div>
                        
                        <div className="hidden md:block w-px h-12 bg-gray-200/80 relative z-10"></div>

                        <div className="flex flex-col gap-1 items-center bg-gray-50/80 px-5 py-2.5 rounded-2xl border border-gray-100/50 shadow-inner relative z-10">
                            <div className="flex items-center gap-3">
                                <span className="font-black text-gray-800 text-lg">{trip.direction === 'RETURN' ? trip.bus.destination : trip.bus.origin}</span>
                                <motion.div animate={{ x: [0, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                                    <ArrowRight className="w-5 h-5 text-indigo-400 drop-shadow-sm" />
                                </motion.div>
                                <span className="font-black text-gray-800 text-lg">{trip.direction === 'RETURN' ? trip.bus.origin : trip.bus.destination}</span>
                            </div>
                        </div>
                        
                        <div className="hidden md:block w-px h-12 bg-gray-200/80 relative z-10"></div>

                        <div className="bg-gradient-to-r from-yellow-300 to-yellow-400 text-black font-mono text-xl font-black px-5 py-2 rounded-xl border-2 border-black shadow-[0_0_15px_rgba(250,204,21,0.5)] tracking-widest flex items-center justify-center relative z-10">
                            {trip.bus.busNumber}
                        </div>
                    </motion.div>
                  ) : (
                    <div className="bg-white/80 backdrop-blur-md px-8 py-5 rounded-3xl border border-white shadow-xl flex items-center gap-4 ring-1 ring-black/5">
                        <div className="text-center md:text-left flex flex-col">
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">{assignedBus.travelsName}</h2>
                            <p className="text-sm font-bold text-indigo-600 uppercase tracking-widest mt-1">
                                {format(currentTime, 'EEEE, dd MMM yyyy')}
                            </p>
                        </div>
                        <div className="hidden md:block w-px h-12 bg-gray-200/80"></div>
                        <div className="bg-gradient-to-r from-yellow-300 to-yellow-400 text-black font-mono text-xl font-black px-5 py-2 rounded-xl border-2 border-black shadow-[0_0_15px_rgba(250,204,21,0.5)] tracking-widest">
                            {assignedBus.busNumber}
                        </div>
                        <div className="hidden md:block w-px h-12 bg-gray-200/80"></div>
                        <p className="text-lg font-bold text-muted-foreground">No active trip scheduled</p>
                    </div>
                  )}
            </div>
          </motion.header>

          {/* URGENT HALT REQUEST BANNER */}
          {pendingStopRequest && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "mb-8 p-5 rounded-3xl border-2 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 max-w-6xl mx-auto backdrop-blur-md",
                pendingStopRequest.type === 'vomiting'
                  ? "bg-rose-500/15 border-rose-500 text-rose-950 dark:text-rose-100 shadow-rose-500/20"
                  : "bg-amber-500/15 border-amber-500 text-amber-950 dark:text-amber-100 shadow-amber-500/20"
              )}
            >
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md",
                  pendingStopRequest.type === 'vomiting' ? "bg-rose-600 text-white" : "bg-amber-600 text-white"
                )}>
                  {pendingStopRequest.type === 'vomiting' ? <HeartPulse className="w-6 h-6 animate-pulse" /> : <AlertTriangle className="w-6 h-6 animate-bounce" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <Badge className={pendingStopRequest.type === 'vomiting' ? "bg-rose-600 text-white border-0 font-bold" : "bg-amber-600 text-white border-0 font-bold"}>
                      Urgent Passenger Halt Request
                    </Badge>
                    <span className="text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">
                      Seat {pendingStopRequest.seatNumber}
                    </span>
                  </div>
                  <p className="text-lg font-black tracking-tight mt-1">
                    {pendingStopRequest.passengerName || 'Passenger'} reported {pendingStopRequest.type === 'vomiting' ? 'vomiting tendency' : 'urgent washroom need'}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('bushive:open_stop_request', { 
                    detail: { ...pendingStopRequest, scheduleId: trip?.id } 
                  }));
                }}
                className={cn(
                  "font-black text-white rounded-xl h-12 px-6 shadow-md hover:scale-105 transition-all shrink-0 w-full sm:w-auto text-base",
                  pendingStopRequest.type === 'vomiting' ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                Respond Now
              </Button>
            </motion.div>
          )}
          
          {/* CARDS ROW */}
          <motion.div 
              initial="hidden"
              animate="visible"
              variants={containerVariants}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-6xl mx-auto"
          >

            {features.manifest && (
              <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} className="h-full">
                  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-lg hover:shadow-2xl transition-all duration-300 rounded-3xl h-full flex flex-col overflow-hidden">
                    <div className="p-6 text-center flex-grow flex flex-col items-center justify-center">
                        <div className="relative flex justify-center mb-4">
                            <div className="absolute inset-0 bg-blue-400 blur-xl opacity-20 rounded-full animate-pulse"></div>
                            <div className="bg-gradient-to-br from-blue-100 to-blue-50 p-4 rounded-2xl relative z-10 border border-blue-100 shadow-sm transition-transform group-hover:scale-110">
                                <motion.div>
                                    <Users className="w-10 h-10 text-blue-600" />
                                </motion.div>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-gray-800 tracking-tight">Passenger Manifest</h3>
                        
                        <div className="flex justify-center gap-8 w-full mt-6 bg-white/50 py-3 rounded-2xl border border-white/60">
                            <div className="text-center">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total</p>
                            <p className="text-2xl font-black text-gray-800">{trip?.totalPassengers || 0}</p>
                            </div>
                            <div className="w-px bg-gray-300"></div>
                            <div className="text-center">
                            <p className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">Boarded</p>
                            <p className="text-2xl font-black text-green-600">{trip?.boardedCount || 0}</p>
                            </div>
                        </div>
                    </div>
                    <div className="px-6 pb-6 pt-2 mt-auto">
                        <Button disabled={!trip} onClick={() => trip && router.push(`/cabin-crew/${trip.id}`)} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 font-bold shadow-md">
                            View Manifest
                        </Button>
                    </div>
                  </div>
              </motion.div>
            )}

            {features.attendance && (
              <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} className="h-full">
                  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-lg hover:shadow-2xl transition-all duration-300 rounded-3xl h-full flex flex-col overflow-hidden">
                    <div className="p-6 text-center flex-grow flex flex-col items-center justify-center">
                        <div className="relative flex justify-center mb-4">
                            <div className="absolute inset-0 bg-indigo-400 blur-xl opacity-20 rounded-full animate-pulse"></div>
                            <div className="bg-gradient-to-br from-indigo-100 to-indigo-50 p-4 rounded-2xl relative z-10 border border-indigo-100 shadow-sm transition-transform group-hover:scale-110">
                                <motion.div>
                                    <UserCheck className="w-10 h-10 text-indigo-600" />
                                </motion.div>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-gray-800 tracking-tight">Attendance</h3>
                        <p className="text-sm font-semibold text-gray-500 mt-2">Mark crew attendance and hotseat duty.</p>
                    </div>
                    <div className="px-6 pb-6 pt-2 mt-auto">
                        <Button disabled={!trip} onClick={() => trip && router.push(`/cabin-crew/attendance?tripId=${trip.id}`)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-12 font-bold shadow-md">
                            Manage Crew
                        </Button>
                    </div>
                  </div>
              </motion.div>
            )}

            {features.liveTracking && (
              <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} className="h-full">
                  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-lg hover:shadow-2xl transition-all duration-300 rounded-3xl h-full flex flex-col overflow-hidden">
                    <div className="p-6 text-center flex-grow flex flex-col items-center justify-center">
                        <div className="relative flex justify-center mb-4">
                            <div className={cn("absolute inset-0 blur-xl opacity-30 rounded-full", isTrackingActive ? "bg-green-400 animate-pulse" : "bg-red-400")}></div>
                            <div className={cn("bg-gradient-to-br p-4 rounded-2xl relative z-10 border shadow-sm transition-transform group-hover:scale-110", isTrackingActive ? "from-green-100 to-green-50 border-green-200" : "from-red-100 to-red-50 border-red-200")}>
                                <motion.div>
                                    <MapPin className={cn("w-10 h-10", isTrackingActive ? "text-green-600" : "text-red-600")} />
                                </motion.div>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-gray-800 tracking-tight">GPS Tracking</h3>
                        <div className="mt-3 bg-white/50 px-4 py-2 rounded-xl border border-white/60 inline-flex items-center gap-2">
                           <div className="relative flex h-3 w-3">
                             <div className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", isTrackingActive && "bg-green-500 animate-ping")}></div>
                             <div className={cn("relative inline-flex rounded-full h-3 w-3", isTrackingActive ? "bg-green-600" : "bg-red-600")}></div>
                           </div>
                           <span className={cn("font-bold text-sm tracking-wider", isTrackingActive ? "text-green-600" : "text-red-600")}>
                               {isTrackingActive ? 'ONLINE' : 'OFFLINE'}
                           </span>
                        </div>
                    </div>
                    <div className="px-6 pb-6 pt-2 mt-auto">
                        <Button disabled={!trip} onClick={() => trip && router.push(`/cabin-crew/tracking`)} className={cn("w-full text-white rounded-xl h-12 font-bold shadow-md", isTrackingActive ? "bg-green-600 hover:bg-green-700" : "bg-gray-800 hover:bg-gray-900")}>
                            {isTrackingActive ? "View Tracker" : "Start Tracking"}
                        </Button>
                    </div>
                  </div>
              </motion.div>
            )}
            
            {features.snacks && (
              <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} className="h-full">
                  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-lg hover:shadow-2xl transition-all duration-300 rounded-3xl h-full flex flex-col overflow-hidden">
                    <div className="p-6 text-center flex-grow flex flex-col items-center justify-center">
                        <div className="relative flex justify-center mb-4">
                            <div className="absolute inset-0 bg-orange-400 blur-xl opacity-20 rounded-full animate-pulse"></div>
                            <div className="bg-gradient-to-br from-orange-100 to-orange-50 p-4 rounded-2xl relative z-10 border border-orange-100 shadow-sm transition-transform group-hover:scale-110">
                                <motion.div>
                                    <Cookie className="w-10 h-10 text-orange-600" />
                                </motion.div>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-gray-800 tracking-tight">Refreshments</h3>
                        <p className="text-sm font-semibold text-gray-500 mt-2">Manage in-trip snack distribution.</p>
                    </div>
                    <div className="px-6 pb-6 pt-2 mt-auto">
                        <Button disabled={!trip} onClick={() => trip && router.push(`/cabin-crew/snacks?tripId=${trip.id}`)} className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl h-12 font-bold shadow-md">
                            Check-in
                        </Button>
                    </div>
                  </div>
              </motion.div>
            )}
            
            {features.restStopCheckins && (
              <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} className="h-full">
                  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-lg hover:shadow-2xl transition-all duration-300 rounded-3xl h-full flex flex-col overflow-hidden">
                    <div className="p-6 text-center flex-grow flex flex-col items-center justify-center">
                        <div className="relative flex justify-center mb-4">
                            <div className="absolute inset-0 bg-yellow-400 blur-xl opacity-20 rounded-full animate-pulse"></div>
                            <div className="bg-gradient-to-br from-yellow-100 to-yellow-50 p-4 rounded-2xl relative z-10 border border-yellow-100 shadow-sm transition-transform group-hover:scale-110">
                                <motion.div>
                                    <Coffee className="w-10 h-10 text-yellow-600" />
                                </motion.div>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-gray-800 tracking-tight">Rest Stops</h3>
                        {nextRestStopInfo?.eta ? (
                            <div className="mt-2 text-center">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 border border-yellow-200 text-yellow-900 font-extrabold text-xs mb-1.5 shadow-sm">
                                    <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                                    Next: {nextRestStopInfo.stop.name}
                                </span>
                                <p className="text-sm font-black text-yellow-700">
                                    Arriving in {nextRestStopInfo.eta.remainingTime} <span className="text-xs font-semibold text-yellow-600 font-normal">({nextRestStopInfo.eta.eta})</span>
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm font-semibold text-gray-500 mt-2">
                                {nextRestStopInfo ? `Next: ${nextRestStopInfo.stop.name}` : "Update upcoming halt details."}
                            </p>
                        )}
                    </div>
                    <div className="px-6 pb-6 pt-2 mt-auto">
                        <Button disabled={!trip} onClick={() => trip && router.push(`/track/${trip.id}/rest-stop?from=crew`)} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl h-12 font-bold shadow-md">
                            Update
                        </Button>
                    </div>
                  </div>
              </motion.div>
            )}

            {features.createTicket && (
              <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} className="h-full">
                  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-lg hover:shadow-2xl transition-all duration-300 rounded-3xl h-full flex flex-col overflow-hidden">
                    <div className="p-6 text-center flex-grow flex flex-col items-center justify-center">
                        <div className="relative flex justify-center mb-4">
                            <div className="absolute inset-0 bg-purple-400 blur-xl opacity-20 rounded-full animate-pulse"></div>
                            <div className="bg-gradient-to-br from-purple-100 to-purple-50 p-4 rounded-2xl relative z-10 border border-purple-100 shadow-sm transition-transform group-hover:scale-110">
                                <motion.div>
                                    <Ticket className="w-10 h-10 text-purple-600" />
                                </motion.div>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-gray-800 tracking-tight">Walk-in Ticket</h3>
                        <p className="text-sm font-semibold text-gray-500 mt-2">Issue on-board manual ticket.</p>
                    </div>
                    <div className="px-6 pb-6 pt-2 mt-auto">
                        <Button disabled={!trip} onClick={() => trip && router.push('/cabin-crew/generate-tickets')} className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-12 font-bold shadow-md">
                            Create
                        </Button>
                    </div>
                  </div>
              </motion.div>
            )}

            {features.busExpenses && (
              <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} className="h-full">
                  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-lg hover:shadow-2xl transition-all duration-300 rounded-3xl h-full flex flex-col overflow-hidden">
                    <div className="p-6 text-center flex-grow flex flex-col items-center justify-center">
                        <div className="relative flex justify-center mb-4">
                            <div className="absolute inset-0 bg-teal-400 blur-xl opacity-20 rounded-full animate-pulse"></div>
                            <div className="bg-gradient-to-br from-green-100 to-green-50 p-4 rounded-2xl relative z-10 border border-green-100 shadow-sm transition-transform">
                                <motion.div>
                                    <IndianRupee className="w-10 h-10 text-teal-600" />
                                </motion.div>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-gray-800 tracking-tight">Expenses</h3>
                        <p className="text-sm font-semibold text-gray-500 mt-2">Log fuel, tolls, and other on-trip expenses.</p>
                    </div>
                    <div className="px-6 pb-6 pt-2 mt-auto">
                        <Button onClick={() => router.push(`/cabin-crew/expenses?busId=${assignedBus.id}`)} className="w-full bg-teal-600 hover:bg-teal-700 text-white rounded-xl h-12 font-bold shadow-md">
                            Manage
                        </Button>
                    </div>
                  </div>
              </motion.div>
            )}

            {features.photoUpdate && (
              <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} className="h-full">
                  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-lg hover:shadow-2xl transition-all duration-300 rounded-3xl h-full flex flex-col overflow-hidden">
                    <div className="p-6 text-center flex-grow flex flex-col items-center justify-center">
                        <div className="relative flex justify-center mb-4">
                            <div className="absolute inset-0 bg-rose-400 blur-xl opacity-20 rounded-full animate-pulse"></div>
                            <div className="bg-gradient-to-br from-rose-100 to-rose-50 p-4 rounded-2xl relative z-10 border border-rose-100 shadow-sm transition-transform group-hover:scale-110">
                                <motion.div>
                                    <Camera className="w-10 h-10 text-rose-600" />
                                </motion.div>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-gray-800 tracking-tight">Live Photos</h3>
                        <p className="text-sm font-semibold text-gray-500 mt-2">Update photos for passenger view.</p>
                    </div>
                    <div className="px-6 pb-6 pt-2 mt-auto">
                        <Button onClick={() => router.push(`/cabin-crew/photo-update?busId=${assignedBus.id}`)} className="w-full bg-rose-500 hover:bg-rose-600 text-white rounded-xl h-12 font-bold shadow-md">
                            Upload
                        </Button>
                    </div>
                  </div>
              </motion.div>
            )}

            <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} className="h-full">
                <div className="bg-white/70 backdrop-blur-md border border-red-200 shadow-lg hover:shadow-2xl transition-all duration-300 rounded-3xl h-full flex flex-col overflow-hidden relative">
                {trip?.emergencyAlarm?.active && (
                    <div className="absolute top-4 right-4 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
                    </div>
                )}
                <div className="p-6 text-center flex-grow flex flex-col items-center justify-center">
                    <div className="relative flex justify-center mb-4">
                        <div className="absolute inset-0 bg-red-500 blur-xl opacity-30 rounded-full animate-pulse"></div>
                        <div className="bg-gradient-to-br from-red-100 to-red-50 p-4 rounded-2xl relative z-10 border border-red-200 shadow-sm transition-transform group-hover:scale-110">
                            <motion.div>
                                <AlertCircle className="w-10 h-10 text-red-600" />
                            </motion.div>
                        </div>
                    </div>
                    <h3 className="text-xl font-black text-gray-800 tracking-tight">Emergency</h3>
                    <p className="text-sm font-semibold text-gray-500 mt-2">View active alarms and history.</p>
                </div>
                <div className="px-6 pb-6 pt-2 mt-auto">
                    <Button disabled={!trip} onClick={() => trip && router.push(`/cabin-crew/${trip.id}?tab=summary`)} className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl h-12 font-bold shadow-md relative overflow-hidden">
                        {trip?.emergencyAlarm?.active ? (
                            <span className="flex items-center gap-2">
                                Respond Now
                                <AlertCircle className="w-4 h-4 animate-ping" />
                            </span>
                        ) : 'View History'}
                    </Button>
                </div>
                </div>
            </motion.div>

            {features.luggageRegister && (
              <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} className="h-full">
                  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-lg hover:shadow-2xl transition-all duration-300 rounded-3xl h-full flex flex-col overflow-hidden">
                    <div className="p-6 text-center flex-grow flex flex-col items-center justify-center">
                        <div className="relative flex justify-center mb-4">
                            <div className="absolute inset-0 bg-slate-400 blur-xl opacity-20 rounded-full animate-pulse"></div>
                            <div className="bg-gradient-to-br from-slate-100 to-slate-50 p-4 rounded-2xl relative z-10 border border-slate-100 shadow-sm transition-transform group-hover:scale-110">
                                <motion.div>
                                    <Briefcase className="w-10 h-10 text-slate-700" />
                                </motion.div>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-gray-800 tracking-tight">Luggage</h3>
                        <p className="text-sm font-semibold text-gray-500 mt-2">Record excess luggage and bills.</p>
                    </div>
                    <div className="px-6 pb-6 pt-2 mt-auto">
                        <Button disabled={!trip} onClick={() => trip && router.push(`/cabin-crew/luggage?tripId=${trip.id}&busId=${assignedBus.id}`)} className="w-full bg-slate-700 hover:bg-slate-800 text-white rounded-xl h-12 font-bold shadow-md">
                            Register
                        </Button>
                    </div>
                  </div>
              </motion.div>
            )}
            
          </motion.div>
      </div>
    </div>
  );
}
