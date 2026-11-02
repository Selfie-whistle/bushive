
'use client';

import React, { useState, useEffect, use, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardDescription, CardHeader, CardTitle, CardFooter, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bus, Phone, Coffee, ArrowRight, Bell, LifeBuoy, Volume2, VolumeX, AlertTriangle } from "lucide-react";
import { useFirebase } from '@/firebase';
import type { Booking, Bus as BusDetails, RestStop, Schedule } from '@/lib/types';
import { dataService, getDb } from '@/lib/data/client-service';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useLiveBusData } from '@/hooks/use-live-bus-data';
import { calculateRestStopEta } from '@/lib/eta';

interface LiveTrip extends Schedule {
  bus: Bus;
  totalPassengers: number;
  boardedCount: number;
}

function PassengerConsolePageContent({ id }: { id: string }) {
    const router = useRouter();
    const { user, isUserLoading } = useFirebase();
    const [booking, setBooking] = useState<Booking | null>(null);
    const [busDetails, setBusDetails] = useState<BusDetails | null>(null);
    const [schedule, setSchedule] = useState<Schedule | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [alarmSettings, setAlarmSettings] = useState({ hours: '0', minutes: '15', off: false });
    const [hasSetAlarmBefore, setHasSetAlarmBefore] = useState(false);
    const { toast } = useToast();
    const [selectedSeatForKit, setSelectedSeatForKit] = useState<string | null>(null);
    const [kitRequest, setKitRequest] = useState<EmergencyKitRequest | null>(null);
    
    const busId = useMemo(() => schedule?.actualBusId || schedule?.busId || booking?.busId || null, [schedule?.actualBusId, schedule?.busId, booking?.busId]);
    const { isTrackingActive, liveLocation } = useLiveBusData(busId);
    
    // Sound related state
    const alarmAudioRef = useRef<HTMLAudioElement>(null);
    const [isSoundEnabled, setIsSoundEnabled] = useState(true);
    const isSoundEnabledRef = useRef(true);
    isSoundEnabledRef.current = isSoundEnabled;
    const kitRequestRef = useRef<EmergencyKitRequest | null>(null);
    kitRequestRef.current = kitRequest;
    const soundInitialized = useRef(false);
    const lastBroadcastTimestamp = useRef<string | null>(null);

    const initializeSound = useCallback(() => {
      if (!soundInitialized.current && alarmAudioRef.current) {
          const audio = alarmAudioRef.current;
          audio.muted = true;
          audio.play().then(() => {
              audio.pause();
              audio.currentTime = 0;
              audio.muted = false;
              soundInitialized.current = true;
          }).catch(e => {
              console.warn("Could not initialize sound automatically:", e);
              setIsSoundEnabled(false);
          });
      }
    }, []);

    const toggleSound = () => {
      if (!soundInitialized.current) {
          initializeSound();
      }
      setIsSoundEnabled(prev => {
        const newState = !prev;
        toast({ title: `Sound ${newState ? 'enabled' : 'disabled'}` });
        return newState;
      });
    };
    
    useEffect(() => {
        const hasBeenSet = localStorage.getItem('alarmHasBeenSet');
        setHasSetAlarmBefore(hasBeenSet === 'true');
    }, []);
    
    useEffect(() => {
        const loadAlarmSettings = () => {
            if (!id) return;
            const savedSettings = localStorage.getItem(`alarm_${id}`);

            if (savedSettings) {
                try {
                    const { hours, minutes, off } = JSON.parse(savedSettings);
                    setAlarmSettings({
                        hours: String(hours || 0),
                        minutes: String(minutes || 0),
                        off: off || false,
                    });
                } catch(e) {
                    console.error("Failed to parse alarm settings", e);
                     setAlarmSettings({ hours: '0', minutes: '15', off: false });
                }
            } else {
                setAlarmSettings({ hours: '0', minutes: '15', off: false });
            }
        };
        
        loadAlarmSettings();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                loadAlarmSettings();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [id]);
    
      useEffect(() => {
        if (isUserLoading || !id) return;
    
        let bookingUnsubscribe: (() => void) | undefined;
        let busUnsubscribe: (() => void) | undefined;
        let scheduleUnsubscribe: (() => void) | undefined;
        let isCleanedUp = false;
    
        const cleanup = () => {
          isCleanedUp = true;
          bookingUnsubscribe?.();
          busUnsubscribe?.();
          scheduleUnsubscribe?.();
        };
    
        const fetchAndListen = async () => {
          setIsLoading(true);
          try {
            bookingUnsubscribe = dataService.onPublicBookingSnapshot(id, async (bookingData) => {
              if (isCleanedUp) return;
              if (bookingData) {
                setBooking(bookingData);
                
                busUnsubscribe?.(); 
                busUnsubscribe = dataService.onBusSnapshot(bookingData.busId, (busData) => {
                  if (!isCleanedUp) setBusDetails(busData);
                });
                
                scheduleUnsubscribe?.(); 
                scheduleUnsubscribe = dataService.onScheduleSnapshot(bookingData.scheduleId, (scheduleData) => {
                  if (isCleanedUp) return;
                  if (scheduleData) {
                    setSchedule(scheduleData);
                    const passengerForThisBooking = bookingData.passengers[0];
                    const scheduleBookingInfo = scheduleData.bookings?.find(
                      (b: any) => b.bookingId === id && b.seat === passengerForThisBooking?.seatNumber
                    );
    
                    if (scheduleBookingInfo?.deboarded) {
                      router.replace(`/track/finished?bookingId=${id}`);
                      return;
                    }

                     const pendingRequest = scheduleData.kitRequests?.find(req => req.status === 'pending' && req.bookingId === id);
                      if (pendingRequest && !kitRequestRef.current) { 
                        setKitRequest(pendingRequest);
                        if (isSoundEnabledRef.current) {
                            if (soundInitialized.current) {
                                alarmAudioRef.current?.play().catch(e => console.error("Audio play failed", e));
                            } else {
                                toast({
                                    title: "Emergency Kit Requested!",
                                    description: "Click the sound icon to enable audio alerts for future requests.",
                                });
                            }
                        }
                      }
                      
                    // Check for new broadcast
                    if (
                        scheduleData?.broadcast &&
                        scheduleData.broadcast.timestamp !== lastBroadcastTimestamp.current
                    ) {
                        // Only show toast if it's a new message since the component mounted or last seen
                        if (lastBroadcastTimestamp.current !== null) {
                        toast({
                            title: "Update from Crew",
                            description: scheduleData.broadcast.message,
                            duration: 10000,
                        });
                        }
                        lastBroadcastTimestamp.current = scheduleData.broadcast.timestamp;
                    }
                  }
                });

                if (bookingData.passengers.length === 1) {
                  setSelectedSeatForKit(bookingData.passengers[0].seatNumber);
                } else {
                  setSelectedSeatForKit(null);
                }
              }
              if (!isCleanedUp) setIsLoading(false);
            });
    
          } catch (error) {
            console.error("Failed to fetch details:", error);
            if (!isCleanedUp) setIsLoading(false);
          }
        };
    
        fetchAndListen();
    
        return cleanup;
      }, [id, isUserLoading, router, toast]);
    
    const getAlarmDescription = () => {
        if (alarmSettings.off) {
            return 'Alarm is currently turned off.';
        }
        const { hours, minutes } = alarmSettings;
        let description = 'Alarm set for ';
        if (hours !== '0') {
            description += `${hours} hour(s) `;
        }
        if (minutes !== '0') {
            description += `${minutes} minute(s) `;
        }
        description += 'before arrival.';
        return description;
    };

    const handleAlarmClick = () => {
        initializeSound();
        localStorage.setItem('alarmHasBeenSet', 'true');
        setHasSetAlarmBefore(true);
        router.push(`/track/${id}/alarm`);
    };
    
    const handleRequestKit = async () => {
        initializeSound();
        if (!selectedSeatForKit || !booking) {
            toast({
                title: "Seat Not Selected",
                description: "Please select a passenger/seat for the request.",
                variant: "destructive"
            });
            return;
        }

        const passenger = booking.passengers.find(p => p.seatNumber === selectedSeatForKit);
        if (!passenger) {
             toast({ title: "Error", description: "Could not find passenger details.", variant: "destructive" });
             return;
        }

        try {
            await dataService.requestEmergencyKit(
                booking.scheduleId,
                booking.id,
                selectedSeatForKit,
                passenger.name
            );

            toast({
                title: "Request Sent",
                description: `Your request for an emergency kit for seat ${selectedSeatForKit} has been sent to the cabin crew.`,
            });
        } catch (error: any) {
            toast({
                title: "Request Failed",
                description: error.message || "Could not send the request. Please try again.",
                variant: "destructive"
            });
        }
    };
    
    const features = useMemo(() => {
        const defaultFeatures = {
          passengerTrackBus: true,
          passengerCallCabin: true,
          passengerRestStops: true,
          passengerAlarm: true,
          passengerEmergencyKit: true,
        };

        return { ...defaultFeatures, ...busDetails?.consoleFeatures };
    }, [busDetails]);

    const nextRestStopInfo = useMemo(() => {
      if (!busDetails) return null;
      const isReturn = schedule?.direction === 'RETURN' || schedule?.id?.includes('_RETURN') || id.includes('_RETURN');
      const stops = isReturn
        ? (busDetails.restStopsReturn && busDetails.restStopsReturn.length > 0 ? busDetails.restStopsReturn : busDetails.restStops || [])
        : (busDetails.restStopsForward && busDetails.restStopsForward.length > 0 ? busDetails.restStopsForward : busDetails.restStops || []);

      const upcoming = stops.find(s => {
        const status = schedule?.stopStatuses?.[s.id]?.status;
        return status !== 'departed';
      });
      if (!upcoming) return null;

      if (!isTrackingActive || !liveLocation) {
        return { stop: upcoming, eta: null };
      }

      const eta = calculateRestStopEta(liveLocation, upcoming.coordinates);
      return { stop: upcoming, eta };
    }, [busDetails, schedule, id, isTrackingActive, liveLocation]);

    if (isLoading) {
        return (
            <div className="container mx-auto px-4 py-8">
                 <div className="max-w-2xl mx-auto text-center mb-8">
                    <Skeleton className="h-9 w-3/4 mx-auto" />
                    <Skeleton className="h-5 w-1/2 mx-auto mt-3" />
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6">
                    {[...Array(5)].map((_, i) => (
                        <Card key={i} className="flex flex-col justify-between">
                            <CardHeader>
                                <Skeleton className="h-16 w-16 rounded-full mx-auto" />
                                <Skeleton className="h-6 w-3/5 mx-auto mt-4" />
                                <Skeleton className="h-4 w-4/5 mx-auto mt-2" />
                            </CardHeader>
                            <CardFooter>
                                <Skeleton className="h-10 w-full" />
                            </CardFooter>
                        </Card>
                    ))}
                 </div>
            </div>
        );
    }
     const handleAcknowledgeKitRequest = async () => {
    if (!kitRequest || !booking) return;
    try {
        await dataService.acknowledgeKitRequest(booking.scheduleId, kitRequest.timestamp);
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

    const hasMultiplePassengers = booking && booking.passengers.length > 1;

    const isReturn = schedule?.direction === 'RETURN';
    const displayOrigin = isReturn
        ? (busDetails?.destination || booking?.busDetails?.origin || 'Bangalore')
        : (busDetails?.origin || booking?.busDetails?.origin || 'Punalur');
    const displayDestination = isReturn
        ? (busDetails?.origin || booking?.busDetails?.destination || 'Punalur')
        : (busDetails?.destination || booking?.busDetails?.destination || 'Bangalore');

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-rose-50 selection:bg-rose-100 relative overflow-hidden pb-12">
            {/* Animated Background Blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <motion.div 
                    animate={{ rotate: 360, scale: [1, 1.1, 1], x: [0, 50, 0], y: [0, 30, 0] }} 
                    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                    className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-300/20 blur-[100px]"
                />
                <motion.div 
                    animate={{ rotate: -360, scale: [1, 1.2, 1], x: [0, -40, 0], y: [0, -50, 0] }} 
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-rose-300/20 blur-[100px]"
                />
            </div>

            <div className="container mx-auto px-4 py-8 relative z-10 max-w-6xl">
            <audio ref={alarmAudioRef} src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" loop preload="auto" />
            <AlertDialog open={!!kitRequest}>
                <AlertDialogContent className="rounded-3xl border-0 shadow-2xl">
                    <AlertDialogHeader>
                        <div className="flex justify-center mb-6 relative">
                            <div className="absolute inset-0 bg-pink-400 rounded-full blur-xl animate-pulse opacity-50 w-20 h-20 mx-auto"></div>
                            <div className="bg-pink-100 text-pink-600 rounded-full p-5 relative z-10 animate-bounce">
                                <LifeBuoy className="w-10 h-10" />
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

            <motion.header 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-10 mt-4"
            >
                <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-rose-500 tracking-tight pb-2">Passenger Console</h1>
                <div className="flex flex-col items-center justify-center gap-4 mt-6">
                  {busDetails && (
                    <div className="bg-white/80 backdrop-blur-md px-8 py-5 rounded-3xl border border-white shadow-xl flex flex-col md:flex-row items-center gap-6 md:gap-10 ring-1 ring-black/5 hover:shadow-2xl transition-shadow duration-300">
                        <div className="text-center md:text-left">
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">{busDetails.travelsName}</h2>
                            <p className="text-indigo-600 font-bold uppercase tracking-widest text-sm mt-1">{busDetails.operator}</p>
                        </div>
                        
                        <div className="hidden md:block w-px h-12 bg-gray-200/80"></div>

                        <div className="flex items-center gap-3 bg-gray-50/80 px-5 py-2.5 rounded-2xl border border-gray-100/50 shadow-inner">
                            <span className="font-black text-gray-800 text-lg">{displayOrigin}</span>
                            <ArrowRight className="w-5 h-5 text-rose-400 drop-shadow-sm" />
                            <span className="font-black text-gray-800 text-lg">{displayDestination}</span>
                        </div>
                        
                        <div className="hidden md:block w-px h-12 bg-gray-200/80"></div>

                        <div className="bg-gradient-to-r from-yellow-300 to-yellow-400 text-black font-mono text-xl font-black px-5 py-2 rounded-xl border-2 border-black shadow-[0_0_15px_rgba(250,204,21,0.5)] tracking-widest flex items-center justify-center">
                            {busDetails.busNumber}
                        </div>
                    </div>
                  )}
                </div>
            </motion.header>
            
            <motion.div 
                initial="hidden"
                animate="visible"
                variants={{
                    hidden: { opacity: 0 },
                    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
                }}
                className="flex flex-wrap justify-center gap-6"
            >
                {features.passengerTrackBus && (
                    <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="w-full sm:w-[280px] flex-shrink-0">
                        <motion.div whileHover={{ y: -8, scale: 1.02 }} className="h-full">
                            <Card className="h-full flex flex-col justify-between border-0 shadow-xl bg-white/70 backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-black/5 hover:shadow-2xl transition-all duration-300">
                                <CardHeader className="pt-8 text-center pb-4">
                                    <div className="flex justify-center mb-6 relative">
                                        <div className="absolute inset-0 bg-rose-400 rounded-full blur-lg animate-pulse opacity-20 w-16 h-16 mx-auto"></div>
                                        <div className="bg-gradient-to-br from-rose-100 to-red-50 text-rose-600 rounded-2xl p-4 relative z-10 border border-white shadow-sm">
                                            <Bus className="h-8 w-8" />
                                        </div>
                                    </div>
                                    <CardTitle className="text-xl font-black text-gray-900 tracking-tight">Track Bus</CardTitle>
                                    <CardDescription className="text-gray-500 font-medium mt-2">
                                        Live Sharing is <span className={`font-bold ${isTrackingActive ? 'text-green-500' : 'text-gray-400'}`}>{isTrackingActive ? 'ACTIVE' : 'INACTIVE'}</span>
                                    </CardDescription>
                                </CardHeader>
                                <CardFooter className="pb-6 px-6">
                                    <Button onClick={(e) => { e.stopPropagation(); router.push(`/track/${id}/boarded`); }} className="w-full rounded-xl h-12 font-bold shadow-md bg-white hover:bg-rose-50 text-rose-600 border border-rose-100 group transition-all">
                                        Track <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    </Button>
                                </CardFooter>
                            </Card>
                        </motion.div>
                    </motion.div>
                )}
                
                {features.passengerCallCabin && (
                    <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="w-full sm:w-[280px] flex-shrink-0">
                        <motion.div whileHover={{ y: -8, scale: 1.02 }} className="h-full">
                            <Card className="h-full flex flex-col justify-between border-0 shadow-xl bg-white/70 backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-black/5 hover:shadow-2xl transition-all duration-300">
                                <CardHeader className="pt-8 text-center pb-4">
                                    <div className="flex justify-center mb-6 relative">
                                        <div className="absolute inset-0 bg-green-400 rounded-full blur-lg animate-pulse opacity-20 w-16 h-16 mx-auto"></div>
                                        <div className="bg-gradient-to-br from-green-100 to-emerald-50 text-green-600 rounded-2xl p-4 relative z-10 border border-white shadow-sm">
                                            <Phone className="h-8 w-8" />
                                        </div>
                                    </div>
                                    <CardTitle className="text-xl font-black text-gray-900 tracking-tight">Call Cabin</CardTitle>
                                    <CardDescription className="text-gray-500 font-medium mt-2">
                                        Need assistance? Contact the bus cabin crew directly.
                                    </CardDescription>
                                </CardHeader>
                                <CardFooter className="pb-6 px-6">
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                        <Button disabled={!busDetails?.contactNumber} className="w-full rounded-xl h-12 font-bold shadow-md bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white border-0 transition-all">
                                            Call Now
                                        </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="rounded-3xl border-0 shadow-2xl">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="text-2xl font-black">Call Bus Cabin?</AlertDialogTitle>
                                            <AlertDialogDescription className="text-lg font-medium">
                                            You are about to call the crew of {busDetails?.travelsName}.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter className="mt-4">
                                            <AlertDialogCancel className="rounded-xl h-12">Cancel</AlertDialogCancel>
                                            <AlertDialogAction asChild className="rounded-xl h-12 bg-green-600 hover:bg-green-700">
                                            <a href={`tel:${busDetails?.contactNumber}`}>Yes, Call</a>
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </CardFooter>
                            </Card>
                        </motion.div>
                    </motion.div>
                )}
                
                {features.passengerRestStops && (
                    <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="w-full sm:w-[280px] flex-shrink-0">
                        <Link href={`/track/${id}/rest-stop`} className="block h-full">
                            <motion.div whileHover={{ y: -8, scale: 1.02 }} className="h-full cursor-pointer">
                                <Card className="h-full flex flex-col justify-between border-0 shadow-xl bg-white/70 backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-black/5 hover:shadow-2xl transition-all duration-300">
                                    <CardHeader className="pt-8 text-center pb-4">
                                        <div className="flex justify-center mb-6 relative">
                                            <div className="absolute inset-0 bg-indigo-400 rounded-full blur-lg animate-pulse opacity-20 w-16 h-16 mx-auto"></div>
                                            <div className="bg-gradient-to-br from-indigo-100 to-blue-50 text-indigo-600 rounded-2xl p-4 relative z-10 border border-white shadow-sm">
                                                <Coffee className="h-8 w-8" />
                                            </div>
                                        </div>
                                        <CardTitle className="text-xl font-black text-gray-900 tracking-tight">Rest Stops</CardTitle>
                                        {nextRestStopInfo?.eta ? (
                                            <div className="mt-2 text-center">
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100/80 text-indigo-700 font-extrabold text-xs mb-1.5 shadow-sm">
                                                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                                                    Next: {nextRestStopInfo.stop.name}
                                                </span>
                                                <p className="text-sm font-black text-indigo-700">
                                                    Arriving in {nextRestStopInfo.eta.remainingTime} <span className="text-xs font-semibold text-indigo-400 font-normal">({nextRestStopInfo.eta.eta})</span>
                                                </p>
                                            </div>
                                        ) : (
                                            <CardDescription className="text-gray-500 font-medium mt-2">
                                                {nextRestStopInfo ? `Next: ${nextRestStopInfo.stop.name}` : "View upcoming rest stops and plan your breaks."}
                                            </CardDescription>
                                        )}
                                    </CardHeader>
                                    <CardFooter className="pb-6 px-6">
                                        <Button className="w-full rounded-xl h-12 font-bold shadow-md bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white border-0 transition-all pointer-events-none">
                                            View Stops
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </motion.div>
                        </Link>
                    </motion.div>
                )}
                
                {features.passengerAlarm && (
                    <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="w-full sm:w-[280px] flex-shrink-0">
                        <motion.div whileHover={{ y: -8, scale: 1.02 }} className="h-full">
                            <Card className="h-full flex flex-col justify-between border-0 shadow-xl bg-white/70 backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-black/5 hover:shadow-2xl transition-all duration-300">
                                <CardHeader className="pt-8 text-center pb-4">
                                    <div className="flex justify-center mb-6 relative">
                                        <div className="absolute inset-0 bg-yellow-400 rounded-full blur-lg animate-pulse opacity-20 w-16 h-16 mx-auto"></div>
                                        <div className="bg-gradient-to-br from-yellow-100 to-amber-50 text-amber-600 rounded-2xl p-4 relative z-10 border border-white shadow-sm">
                                            <Bell className="h-8 w-8" />
                                        </div>
                                    </div>
                                    <CardTitle className="text-xl font-black text-gray-900 tracking-tight">Arrival Alarm</CardTitle>
                                    <CardDescription className="text-gray-500 font-medium mt-2">
                                        {getAlarmDescription()}
                                    </CardDescription>
                                </CardHeader>
                                <CardFooter className="pb-6 px-6">
                                    {hasSetAlarmBefore ? (
                                        <Button onClick={() => router.push(`/track/${id}/alarm`)} className="w-full rounded-xl h-12 font-bold shadow-md bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-white border-0 transition-all">
                                            Edit Alarm
                                        </Button>
                                    ) : (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button className="w-full rounded-xl h-12 font-bold shadow-md bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-white border-0 transition-all" onClick={initializeSound}>
                                                    Set Alarm
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent className="rounded-3xl border-0 shadow-2xl">
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle className="text-2xl font-black">Set Arrival Alarm</AlertDialogTitle>
                                                    <AlertDialogDescription className="text-lg font-medium">
                                                    Alarm set for 15 minute(s) before arrival by default. You can edit or turn it off.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter className="mt-4">
                                                    <AlertDialogAction onClick={handleAlarmClick} className="rounded-xl h-12 font-bold bg-amber-500 hover:bg-amber-600">
                                                        Got It
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                </CardFooter>
                            </Card>
                        </motion.div>
                    </motion.div>
                )}
                
                {features.passengerEmergencyKit && (
                    <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="w-full sm:w-[280px] flex-shrink-0">
                        <motion.div whileHover={{ y: -8, scale: 1.02 }} className="h-full">
                            <Card className="h-full flex flex-col justify-between border-0 shadow-xl bg-white/70 backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-black/5 hover:shadow-2xl transition-all duration-300">
                                <CardHeader className="pt-8 text-center pb-4">
                                    <div className="flex justify-center mb-6 relative">
                                        <div className="absolute inset-0 bg-pink-400 rounded-full blur-lg animate-pulse opacity-20 w-16 h-16 mx-auto"></div>
                                        <div className="bg-gradient-to-br from-pink-100 to-rose-50 text-pink-600 rounded-2xl p-4 relative z-10 border border-white shadow-sm">
                                            <LifeBuoy className="h-8 w-8" />
                                        </div>
                                    </div>
                                    <CardTitle className="text-xl font-black text-gray-900 tracking-tight">Emergency Kit</CardTitle>
                                    <CardDescription className="text-gray-500 font-medium mt-2">
                                        Request a complimentary periods kit.
                                    </CardDescription>
                                </CardHeader>
                                <CardFooter className="pb-6 px-6">
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button className="w-full rounded-xl h-12 font-bold shadow-md bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white border-0 transition-all" onClick={initializeSound}>
                                                Request Kit
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="rounded-3xl border-0 shadow-2xl">
                                            <AlertDialogHeader>
                                                <AlertDialogTitle className="text-2xl font-black">Confirm Request</AlertDialogTitle>
                                                {hasMultiplePassengers && booking ? (
                                                    <>
                                                        <AlertDialogDescription className="text-lg font-medium">
                                                            Please select the passenger who requires the kit.
                                                        </AlertDialogDescription>
                                                        <RadioGroup
                                                            value={selectedSeatForKit || ''}
                                                            onValueChange={setSelectedSeatForKit}
                                                            className="py-6 space-y-3"
                                                        >
                                                            {booking.passengers.map(p => (
                                                                <div key={p.seatNumber} className="flex items-center space-x-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                                    <RadioGroupItem value={p.seatNumber} id={p.seatNumber} className="w-5 h-5 text-pink-600 border-pink-200" />
                                                                    <Label htmlFor={p.seatNumber} className="text-base font-bold cursor-pointer">{p.name} (Seat {p.seatNumber})</Label>
                                                                </div>
                                                            ))}
                                                        </RadioGroup>
                                                    </>
                                                ) : (
                                                    <AlertDialogDescription className="text-lg font-medium pt-2">
                                                        This will send a request to the cabin crew for a complimentary periods kit for seat number <span className="font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded">{booking?.passengers[0]?.seatNumber}</span>.
                                                    </AlertDialogDescription>
                                                )}
                                            </AlertDialogHeader>
                                            <AlertDialogFooter className="mt-4">
                                                <AlertDialogCancel className="rounded-xl h-12 font-bold">Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleRequestKit} disabled={hasMultiplePassengers && !selectedSeatForKit} className="rounded-xl h-12 font-bold bg-pink-600 hover:bg-pink-700">
                                                    Confirm Request
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </CardFooter>
                            </Card>
                        </motion.div>
                    </motion.div>
                )}
                
                <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="w-full sm:w-[280px] flex-shrink-0">
                    <Link href={`/track/${id}/console/emergency`} className="block h-full">
                        <motion.div whileHover={{ y: -8, scale: 1.02 }} className="h-full cursor-pointer">
                            <Card className="h-full flex flex-col justify-between border-0 shadow-xl bg-white/70 backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-black/5 hover:shadow-2xl transition-all duration-300">
                                <CardHeader className="pt-8 text-center pb-4">
                                    <div className="flex justify-center mb-6 relative">
                                        <div className="absolute inset-0 bg-red-400 rounded-full blur-lg animate-pulse opacity-30 w-16 h-16 mx-auto"></div>
                                        <div className="bg-gradient-to-br from-red-100 to-red-50 text-red-600 rounded-2xl p-4 relative z-10 border border-white shadow-sm">
                                            <AlertTriangle className="h-8 w-8" />
                                        </div>
                                    </div>
                                    <CardTitle className="text-xl font-black text-gray-900 tracking-tight">Emergency Alert</CardTitle>
                                    <CardDescription className="text-gray-500 font-medium mt-2">
                                        SOS and emergency info.
                                    </CardDescription>
                                </CardHeader>
                                <CardFooter className="pb-6 px-6">
                                    <Button className="w-full rounded-xl h-12 font-bold shadow-md bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white border-0 group transition-all">
                                        View Info <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    </Button>
                                </CardFooter>
                            </Card>
                        </motion.div>
                    </Link>
                </motion.div>
            </motion.div>
            </div>
        </div>
    );
}

export default function PassengerConsolePageWrapper({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    return <PassengerConsolePageContent id={resolvedParams.id} />;
}
