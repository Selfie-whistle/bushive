'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirebase } from '@/firebase';
import type { Booking, Bus, Point, RestStop, Schedule } from '@/lib/types';
import { dataService, getDb } from '@/lib/data/client-service';
import { onSnapshot, doc } from 'firebase/firestore';


import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, Coffee, Utensils, ParkingCircle, PersonStanding, Frown, Bell, Check, 
  Volume2, VolumeX, RotateCcw, Users, Clock, AlertCircle, ShieldAlert, AlertTriangle, 
  HeartPulse, Loader2, CheckCircle2, MessageSquare, Send, Sparkles, Navigation, Ban, Fuel, PhoneCall, MapPin
} from 'lucide-react';
import { addMinutes, format as fnsFormat } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { motion, AnimatePresence } from 'framer-motion';
import type { StopRequest } from '@/lib/types';
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
import dynamic from 'next/dynamic';
import { useSchedule as useScheduleHook } from '@/hooks/use-schedule';
import { useLiveBusData } from '@/hooks/use-live-bus-data';
import { calculateRestStopEta } from '@/lib/eta';

const RouteEtaCalculator = dynamic(() => import('@/components/RouteEtaCalculator'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});


type StopWithETA = RestStop & { eta?: string; remainingTime?: string; };

function analyzeCrewResponse(message: string, requestType: 'washroom' | 'vomiting') {
  const lower = (message || '').toLowerCase();

  if (lower.includes('stop now') || lower.includes('come to cabin')) {
    return {
      title: "Bus Stopping Immediately",
      badge: "Immediate Action",
      badgeColor: "bg-emerald-500 text-white",
      headline: "The bus is pulling over right now",
      explanation: "Our driver is safely bringing the bus to a halt. Please remain careful while stepping into the aisle, hold on to handrails, and come forward to the front cabin as directed by the crew.",
      tip: "Please hold on to handrails while walking toward the front cabin."
    };
  }

  if (lower.includes('not possible') || lower.includes('running on road')) {
    return {
      title: "Stopping Prohibited on Current Stretch",
      badge: "Highway Safety Rule",
      badgeColor: "bg-amber-500 text-white",
      headline: "Currently on high-speed expressway / flyover",
      explanation: "The bus is currently traversing a restricted expressway or high-speed zone where halting is strictly prohibited by highway traffic regulations for passenger safety. The cabin crew has received your request and will bring the bus to a safe halt at the earliest authorized bay or exit.",
      tip: requestType === 'vomiting'
        ? "Please use the motion sickness bag available in your seat pocket. Lean back slightly, take deep slow breaths, and focus on steady breathing."
        : "Please relax and remain seated. The cabin crew is actively monitoring for the first safe stopping bay."
    };
  }

  if (lower.includes('petrol pump') || lower.includes('pump')) {
    return {
      title: "Stopping at Nearest Petrol Station",
      badge: "Restroom Facility Halt",
      badgeColor: "bg-blue-500 text-white",
      headline: "Navigating to the nearest petrol station",
      explanation: "The captain is pulling into the nearest highway petrol station with verified clean restroom facilities. The crew asks you to kindly hold on for a few moments as we make the turn-off safely.",
      tip: "The crew will announce and assist you the moment the bus enters the station premises."
    };
  }

  if (lower.includes('call you') || lower.includes('possible to stop')) {
    return {
      title: "Crew Will Call You at Safe Halt Point",
      badge: "Priority Follow-up",
      badgeColor: "bg-purple-500 text-white",
      headline: "Crew will notify your seat directly",
      explanation: "Your request is registered with urgent priority. Due to immediate road and traffic conditions, the cabin crew will directly call your seat or come over the moment a safe halt location is reached.",
      tip: "You can stay comfortable in your seat; the crew member will come directly to you."
    };
  }

  return {
    title: "Official Cabin Crew Update",
    badge: "Crew Message",
    badgeColor: "bg-indigo-500 text-white",
    headline: message || "Response received from crew",
    explanation: "The cabin crew has acknowledged your request and is attending to the situation with highest priority. Please follow crew guidance for your comfort and safety.",
    tip: "You may reach out to the cabin crew member at any time."
  };
}

export default function RestStopsClientPage({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isUserLoading } = useFirebase();
  const fromCrew = searchParams.get('from') === 'crew';
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const soundInitialized = useRef(false);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [bus, setBus] = useState<Bus | null>(null);
  const [scheduleId, setScheduleId] = useState<string | undefined>(fromCrew ? id : undefined);
  const { schedule, isLoading: isScheduleLoading } = useScheduleHook(scheduleId);
  const [mapRouteData, setMapRouteData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [upcomingRestStops, setUpcomingRestStops] = useState<RestStop[]>([]);
  const prevStopsRef = React.useRef<RestStop[]>([]);
  const [etaData, setEtaData] = useState<Record<string, { eta: string; remainingTime: string; distance?: string }>>({});
  
  const [subscribedStops, setSubscribedStops] = useState<Set<string>>(new Set());
  const [activeArrivalStop, setActiveArrivalStop] = useState<RestStop | null>(null);
  const dismissedArrivalsRef = useRef<Set<string>>(new Set());

  const busIdToListen = schedule?.actualBusId || schedule?.busId || booking?.busId || null;
  const { isTrackingActive, liveLocation } = useLiveBusData(busIdToListen);

  // Urgent Stop Request State (Washroom & Vomiting Tendency)
  const [submittingType, setSubmittingType] = useState<'washroom' | 'vomiting' | null>(null);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const previousRespondedIdRef = useRef<string | null>(null);

  const primarySeat = useMemo(() => {
    if (booking?.passengers && booking.passengers.length > 0) {
      return booking.passengers.map(p => p.seatNumber).filter(Boolean).join(', ') || 'Seat';
    }
    return (booking as any)?.seatNumber || 'Seat';
  }, [booking]);

  const passengerName = useMemo(() => {
    return booking?.passengers?.[0]?.name || booking?.contact?.name || 'Passenger';
  }, [booking]);

  const myStopRequests = useMemo(() => {
    if (!schedule?.stopRequests || !booking) return [];
    return schedule.stopRequests.filter(r => 
      r.bookingId === booking.id || 
      (primarySeat !== 'Seat' && r.seatNumber === primarySeat)
    );
  }, [schedule?.stopRequests, booking, primarySeat]);

  const latestRequest = useMemo(() => {
    if (myStopRequests.length === 0) return null;
    return myStopRequests[myStopRequests.length - 1];
  }, [myStopRequests]);

  const isPending = Boolean(latestRequest && latestRequest.status === 'pending');
  const isResponded = Boolean(latestRequest && latestRequest.status === 'responded' && !latestRequest.acknowledgedByPassenger);

  // Play audio chime when response arrives from cabin crew
  useEffect(() => {
    if (isResponded && latestRequest && previousRespondedIdRef.current !== latestRequest.id) {
      previousRespondedIdRef.current = latestRequest.id;
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, ctx.currentTime);
          osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
          gain.gain.setValueAtTime(0.35, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.6);
        }
      } catch (e) {}
    }
  }, [isResponded, latestRequest]);

  const handleRequestStop = async (type: 'washroom' | 'vomiting') => {
    if (!scheduleId || !booking?.id || submittingType) return;
    setSubmittingType(type);
    try {
      await dataService.requestBusStop(
        scheduleId,
        booking.id,
        primarySeat,
        passengerName,
        type
      );
      toast({
        title: type === 'vomiting' ? 'Vomiting Alert Sent' : 'Washroom Request Sent',
        description: 'Request sent to cabin crew. Response will be given to the passenger as fast as possible.',
      });
    } catch (err: any) {
      toast({
        title: 'Error sending request',
        description: err.message || 'Please alert crew directly.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingType(null);
    }
  };

  const handleAcknowledgeResponse = async () => {
    if (!scheduleId || !latestRequest || isAcknowledging) return;
    setIsAcknowledging(true);
    try {
      await dataService.acknowledgeStopRequest(scheduleId, latestRequest.id);
      toast({
        title: 'Acknowledged',
        description: 'Thank you. You can request again whenever needed.',
      });
    } catch (err) {
      console.error('Error acknowledging response:', err);
    } finally {
      setIsAcknowledging(false);
    }
  };
  
  const attemptToEnableSound = useCallback(() => {
    if (audioRef.current && !soundInitialized.current) {
        audioRef.current.muted = false;
        audioRef.current.play().then(() => {
            audioRef.current?.pause();
            soundInitialized.current = true;
            setIsSoundEnabled(true);
        }).catch(() => {
            setIsSoundEnabled(false);
            soundInitialized.current = false;
        });
    }
  }, []);

  const handleDisableSound = () => {
    if(audioRef.current) {
        audioRef.current.muted = true;
    }
    setIsSoundEnabled(false);
    toast({ title: 'Sound Disabled', description: 'Alarm notifications have been turned off.' });
  }

  // 1. Initial setup and booking listener for passengers
  useEffect(() => {
    if (fromCrew) {
      setScheduleId(id);
      setIsLoading(false);
      return;
    }

    if (!id) return;
    setIsLoading(true);
    const unsubBooking = dataService.onPublicBookingSnapshot(id, (bookingData) => {
      if (bookingData) {
        setBooking(bookingData);
        if (bookingData.scheduleId) {
          setScheduleId(bookingData.scheduleId);
        }
      }
      setIsLoading(false);
    });

    return () => unsubBooking();
  }, [id, fromCrew]);

  // 2. Real-time Bus listener (reacts to schedule.actualBusId || schedule.busId || booking.busId)
  useEffect(() => {
    if (!busIdToListen) return;

    const unsubBus = dataService.onBusSnapshot(busIdToListen, async (busData) => {
      setBus(busData);
      if (busData?.serviceId) {
        try {
          const serviceData = await dataService.getServiceById(busData.serviceId);
          if (serviceData) {
            setMapRouteData({
              forward: {
                boarding: serviceData.boardingPointsForward || [],
                dropping: serviceData.droppingPointsForward || [],
              },
              return: {
                boarding: serviceData.boardingPointsReturn || [],
                dropping: serviceData.droppingPointsReturn || [],
              }
            });
          }
        } catch (e) {
          console.error("Failed to fetch service data:", e);
        }
      }
    });

    return () => unsubBus();
  }, [busIdToListen]);

  // Load subscriptions from local storage
  useEffect(() => {
    if (!id) return;
    const key = `notifyme_${id}`;
    const savedSubs = localStorage.getItem(key);
    if (savedSubs) {
      setSubscribedStops(new Set(JSON.parse(savedSubs)));
    }
  }, [id]);

  const isReturn = useMemo(() => {
    if (schedule?.direction) return schedule.direction === 'RETURN';
    if (scheduleId && scheduleId.includes('_RETURN')) return true;
    if (id && id.includes('_RETURN')) return true;
    if (booking?.scheduleDirection) return booking.scheduleDirection === 'RETURN';
    if (booking?.scheduleId && booking.scheduleId.includes('_RETURN')) return true;
    return false;
  }, [schedule?.direction, scheduleId, id, booking?.scheduleDirection, booking?.scheduleId]);

  const restStopsToShow = useMemo(() => {
    if (!bus) return [];
    if (isReturn) {
      return (bus.restStopsReturn && bus.restStopsReturn.length > 0)
        ? bus.restStopsReturn
        : (bus.restStops || []);
    } else {
      return (bus.restStopsForward && bus.restStopsForward.length > 0)
        ? bus.restStopsForward
        : (bus.restStops || []);
    }
  }, [bus, isReturn]);

  useEffect(() => {
    if (!restStopsToShow.length) {
      setUpcomingRestStops([]);
      return;
    }

    const statusMap = new Map<string, { status: string; timestamp: string }>();
    if (schedule?.stopStatuses) {
      Object.entries(schedule.stopStatuses).forEach(([stopId, statusInfo]) => {
        statusMap.set(stopId, statusInfo);
      });
    }

    const mergedStops = restStopsToShow.map((stop): RestStop => {
      const statusInfo = statusMap.get(stop.id);
      return {
        ...stop,
        status: (statusInfo?.status as RestStop['status']) || 'upcoming',
      };
    });

    setUpcomingRestStops(mergedStops);
  }, [restStopsToShow, schedule?.stopStatuses]);

  // Real-time arriving-in calculation when tracking is active
  useEffect(() => {
    if (!isTrackingActive || !liveLocation?.lat || !liveLocation?.lng) {
      setEtaData({});
      return;
    }

    const newEtaMap: Record<string, { eta: string; remainingTime: string; distance?: string }> = {};

    upcomingRestStops.forEach(stop => {
      const etaResult = calculateRestStopEta(liveLocation, stop.coordinates);
      if (etaResult) {
        newEtaMap[stop.id] = {
          eta: etaResult.eta,
          remainingTime: etaResult.remainingTime,
          distance: etaResult.distance,
        };
      }
    });

    setEtaData(newEtaMap);
  }, [isTrackingActive, liveLocation?.lat, liveLocation?.lng, liveLocation?.speed, upcomingRestStops]);

  // Effect to trigger High Priority Arrived Card when rest stop arrives
  useEffect(() => {
    if (fromCrew) return;

    upcomingRestStops.forEach(currentStop => {
      const prevStop = prevStopsRef.current.find(p => p.id === currentStop.id);
      let isAlreadyDismissed = dismissedArrivalsRef.current.has(currentStop.id);
      if (!isAlreadyDismissed && typeof window !== 'undefined') {
        try {
          isAlreadyDismissed = sessionStorage.getItem(`bushive_dismissed_arrival_${id}_${currentStop.id}`) === 'true';
        } catch (e) {}
      }
      
      if (
        currentStop.status === 'arrived' &&
        !isAlreadyDismissed &&
        (prevStop?.status !== 'arrived' || subscribedStops.has(currentStop.id))
      ) {
        setActiveArrivalStop(currentStop);
        if (soundInitialized.current && isSoundEnabled && audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(e => console.error("Audio play failed:", e));
        }
      }
    });
    
    prevStopsRef.current = upcomingRestStops;
  }, [upcomingRestStops, fromCrew, isSoundEnabled, subscribedStops, id]);

  const handleDismissArrivalModal = () => {
    if (activeArrivalStop) {
      dismissedArrivalsRef.current.add(activeArrivalStop.id);
      try {
        sessionStorage.setItem(`bushive_dismissed_arrival_${id}_${activeArrivalStop.id}`, 'true');
      } catch (e) {}
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setActiveArrivalStop(null);
  };


  const handleUpdateStatus = async (stop: RestStop, status: 'arrived' | 'departed' | 'upcoming') => {
    if (!scheduleId) return;
    try {
        await dataService.updateRestStopStatus(scheduleId, stop.id, status);
        toast({
            title: `Stop status updated to ${status}.`,
        });
    } catch (e) {
        toast({
            title: "Error updating status",
            variant: "destructive",
        });
    }
  };
  
  const handleResetAll = async () => {
    if (!scheduleId) return;
    try {
      const result = await dataService.resetAllRestStopStatuses(scheduleId);
      if (result.success) {
        toast({
            title: "All statuses reset",
            description: "All rest stops have been set to 'upcoming'.",
        });
      } else {
        throw new Error(result.message || "Failed to reset statuses.");
      }
    } catch (e: any) {
        toast({
            title: "Error Resetting",
            description: e.message,
            variant: "destructive",
        });
    }
  }

  const handleToggleSubscription = (stopId: string, subscribe: boolean, stopName?: string) => {
    if (subscribe && !soundInitialized.current) {
        attemptToEnableSound();
    }
    const key = `notifyme_${id}`;
    const updatedSubs = new Set(subscribedStops);
    if (subscribe) {
      updatedSubs.add(stopId);
      const matchedStop = upcomingRestStops.find(s => s.id === stopId);
      const stopInfo = {
        stopId,
        stopName: stopName || matchedStop?.name || 'Rest Stop',
        location: matchedStop?.location || '',
        duration: matchedStop?.duration || 15,
        type: matchedStop?.type || 'REST',
        amenities: matchedStop?.amenities || [],
        eta: etaData[stopId]?.eta,
        remainingTime: etaData[stopId]?.remainingTime,
      };

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bushive:rest_stop_notify_card', { detail: stopInfo }));
        window.dispatchEvent(new CustomEvent('bushive:rest_stop_subscription_changed', { 
          detail: { bookingId: id, stopId, subscribe: true } 
        }));
      }
    } else {
      updatedSubs.delete(stopId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bushive:rest_stop_subscription_changed', { 
          detail: { bookingId: id, stopId, subscribe: false } 
        }));
      }
      toast({
        title: 'Alarm Removed',
        description: `Notification for ${stopName || 'this stop'} has been turned off.`,
      });
    }
    setSubscribedStops(updatedSubs);
    localStorage.setItem(key, JSON.stringify(Array.from(updatedSubs)));
  };

  const handleRouteInfoChange = useCallback((stopId: string, info: any) => {
    setEtaData(prev => ({
      ...prev,
      [stopId]: {
        eta: info.eta,
        remainingTime: info.duration,
      },
    }));
  }, []);

  const amenityIcons: { [key: string]: React.ReactNode } = {
    'Restaurant': <Utensils className="w-4 h-4" />,
    'Restrooms': <PersonStanding className="w-4 h-4" />,
    'Parking': <ParkingCircle className="w-4 h-4" />,
    'Snacks': <Utensils className="w-4 h-4" />,
    'Coffee/Tea': <Coffee className="w-4 h-4" />,
  };
  
  const getStopTypeLabel = (type?: 'FOOD' | 'REST' | 'SCENIC') => {
    switch (type) {
        case 'FOOD': return 'Food Stop';
        case 'REST': return 'Rest Stop';
        case 'SCENIC': return 'Scenic View';
        default: return 'Stop';
    }
  }

  const getStopTypeColor = (type?: 'FOOD' | 'REST' | 'SCENIC') => {
    switch (type) {
        case 'FOOD': return 'bg-green-600';
        case 'REST': return 'bg-blue-600';
        case 'SCENIC': return 'bg-purple-600';
        default: return 'bg-gray-600';
    }
  }
  
  const stopsToDisplay = useMemo(() => {
    return upcomingRestStops.sort((a, b) => {
      if (a.status === 'departed' && b.status !== 'departed') return 1;
      if (a.status !== 'departed' && b.status === 'departed') return -1;
      return 0;
    });
  }, [upcomingRestStops]);

  if (isLoading || isScheduleLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Skeleton className="h-8 w-1/2 mb-4" />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen overflow-hidden pb-12 relative", fromCrew ? "bg-gradient-to-br from-indigo-50 via-sky-50 to-white" : "bg-gradient-to-br from-rose-50 via-orange-50 to-white")}>
        <audio ref={audioRef} src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" preload="auto" muted />
        
        {/* Animated Background Blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-60">
           <motion.div 
              animate={{ rotate: 360, scale: [1, 1.3, 1], x: [0, 40, -20, 0], y: [0, 50, -30, 0] }} 
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              className={cn("absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[100px]", fromCrew ? "bg-indigo-300/30" : "bg-rose-300/30")}
           />
           <motion.div 
              animate={{ rotate: -360, scale: [1, 1.4, 1], x: [0, -30, 40, 0], y: [0, -40, 50, 0] }} 
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className={cn("absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full blur-[100px]", fromCrew ? "bg-sky-300/30" : "bg-orange-300/30")}
           />
        </div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>

        <div className="container mx-auto px-4 py-8 max-w-3xl relative z-10">
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="rounded-full bg-white/50 backdrop-blur-md shadow-sm hover:bg-white/80" onClick={() => router.push(fromCrew ? `/cabin-crew` : `/track/${id}/console`)}>
                        <ArrowLeft className={fromCrew ? "text-indigo-900" : "text-rose-900"} />
                    </Button>
                    <div>
                        <h1 className={cn("text-2xl md:text-3xl font-black tracking-tight bg-clip-text text-transparent", fromCrew ? "bg-gradient-to-r from-indigo-600 to-sky-500" : "bg-gradient-to-r from-rose-600 to-orange-500")}>
                            Upcoming Halts
                        </h1>
                        {bus && (
                            <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                {isReturn ? `${bus.destination} → ${bus.origin}` : `${bus.origin} → ${bus.destination}`}
                            </p>
                        )}
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    {fromCrew && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <RotateCcw className="mr-2 h-4 w-4" /> Reset
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Reset All Stop Statuses?</AlertDialogTitle>
                                    <AlertDialogDescription>This will mark all stops as 'upcoming'. This is useful if a mistake was made.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleResetAll}>Confirm Reset</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                    {!fromCrew && (
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => {
                            if (isSoundEnabled) {
                                handleDisableSound();
                            } else {
                                attemptToEnableSound();
                            }
                        }}>
                            {isSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                        </Button>
                    )}
                </div>
            </motion.div>

            {/* Passenger Urgent Halt Assistance Card */}
            {!fromCrew && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <Card className="overflow-hidden border-2 border-rose-200/70 dark:border-rose-900/50 bg-gradient-to-br from-white via-rose-50/40 to-orange-50/30 backdrop-blur-xl shadow-xl rounded-3xl p-5 md:p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20">
                        <ShieldAlert className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase font-extrabold tracking-wider bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-2.5 py-0.5 rounded-full">
                            Emergency & Comfort
                          </span>
                          <span className="text-xs font-bold text-gray-500">Seat {primarySeat}</span>
                        </div>
                        <h2 className="text-xl font-headline font-black text-gray-900 dark:text-white mt-0.5">
                          Urgent Halt Assistance
                        </h2>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-300 font-medium mb-5 leading-relaxed">
                    Experiencing an urgent health need or restroom requirement while traveling? Tap an option below to immediately notify the cabin crew in real time.
                  </p>

                  {/* Two Main Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* 1. Request for Washroom */}
                    <Button
                      type="button"
                      disabled={isPending || Boolean(submittingType)}
                      onClick={() => handleRequestStop('washroom')}
                      className={cn(
                        "h-14 rounded-2xl font-headline font-black text-base shadow-md transition-all flex items-center justify-center gap-3",
                        (isPending && latestRequest?.type === 'washroom') || (submittingType === 'washroom')
                          ? "bg-amber-500 hover:bg-amber-600 text-white cursor-not-allowed opacity-90"
                          : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white hover:shadow-lg active:scale-[0.98]"
                      )}
                    >
                      {submittingType === 'washroom' ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : isPending && latestRequest?.type === 'washroom' ? (
                        <>
                          <Clock className="w-5 h-5 animate-spin" />
                          <span>Requested</span>
                        </>
                      ) : (
                        <>
                          <PersonStanding className="w-5 h-5" />
                          <span>Request for Washroom</span>
                        </>
                      )}
                    </Button>

                    {/* 2. Vomiting Tendency */}
                    <Button
                      type="button"
                      disabled={isPending || Boolean(submittingType)}
                      onClick={() => handleRequestStop('vomiting')}
                      className={cn(
                        "h-14 rounded-2xl font-headline font-black text-base shadow-md transition-all flex items-center justify-center gap-3",
                        (isPending && latestRequest?.type === 'vomiting') || (submittingType === 'vomiting')
                          ? "bg-rose-500 hover:bg-rose-600 text-white cursor-not-allowed opacity-90"
                          : "bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white hover:shadow-lg active:scale-[0.98]"
                      )}
                    >
                      {submittingType === 'vomiting' ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : isPending && latestRequest?.type === 'vomiting' ? (
                        <>
                          <Clock className="w-5 h-5 animate-spin" />
                          <span>Requested</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-5 h-5" />
                          <span>Vomiting Tendency</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Message displayed when in Requested state */}
                  {isPending && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start gap-3 shadow-inner"
                    >
                      <div className="relative flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-white shrink-0 mt-0.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <Clock className="w-4 h-4 relative" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
                          Request sent to cabin crew. Response will be given to the passenger as fast as possible.
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5 font-medium">
                          Please remain comfortably seated; our crew is reviewing road conditions and will respond right here on your screen.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </Card>
              </motion.div>
            )}

            {stopsToDisplay.length > 0 ? (
                 <div className="space-y-6">
                    <AnimatePresence>
                    {stopsToDisplay.map((stop, index) => {
                        const stopEta = etaData[stop.id];
                        const stopPoint = { lat: parseFloat(stop.coordinates?.split(',')[0] || '0'), lng: parseFloat(stop.coordinates?.split(',')[1] || '0'), name: stop.name, time: '' };
                        return (
                        <motion.div
                            key={stop.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="relative"
                        >
                            <Card className={cn("overflow-hidden flex bg-white/70 backdrop-blur-md border-white/60 shadow-lg hover:shadow-xl transition-all duration-300 ring-1 ring-black/5 rounded-3xl", stop.status === 'departed' && 'opacity-60 grayscale-[50%]')}>
                                <div className={cn("text-white flex items-center justify-center p-3 md:p-4", getStopTypeColor(stop.type))}>
                                    <span className="[writing-mode:vertical-rl] rotate-180 font-black text-sm tracking-widest uppercase">{getStopTypeLabel(stop.type)}</span>
                                </div>
                                <div className="flex-grow p-4 md:p-6 flex flex-col justify-center relative">
                                <CardHeader className="p-3 md:p-4">
                                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                                        <div>
                                            <CardTitle className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">{stop.name}</CardTitle>
                                            <CardDescription className="text-sm md:text-base font-semibold text-gray-500 mt-1">{stop.location}</CardDescription>
                                        </div>
                                        <div className="text-left sm:text-right shrink-0">
                                            {stop.status === 'arrived' ? (
                                                <div className="bg-green-100 text-green-700 font-black px-4 py-2 rounded-xl flex items-center gap-2 border border-green-200">
                                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                                    Arrived
                                                </div>
                                            ) : stop.status === 'departed' ? (
                                                <div className="bg-gray-100 text-gray-600 font-black px-4 py-2 rounded-xl border border-gray-200">
                                                    Departed
                                                </div>
                                            ) : (
                                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                                  {isTrackingActive ? (
                                                    <div className="bg-blue-50 px-4 py-2.5 rounded-2xl border border-blue-100 shadow-sm">
                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                                            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Arriving in</p>
                                                        </div>
                                                        <p className="font-black text-blue-700 text-lg flex items-baseline gap-1.5">
                                                            {stopEta?.remainingTime || 'Calculating...'}
                                                            {stopEta?.eta && <span className="text-sm font-semibold text-blue-500 font-normal">({stopEta.eta})</span>}
                                                        </p>
                                                        {stopEta?.distance && (
                                                            <p className="text-[11px] font-semibold text-blue-400 mt-0.5">{stopEta.distance} away</p>
                                                        )}
                                                    </div>
                                                  ) : (
                                                    <div className="bg-gray-50 px-4 py-2.5 rounded-2xl border border-gray-100">
                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                            <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tracking Off</p>
                                                        </div>
                                                        <p className="font-semibold text-gray-400 text-xs">Arriving time when tracking starts</p>
                                                    </div>
                                                  )}
                                                  {!fromCrew && (
                                                      subscribedStops.has(stop.id) ? (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button size="sm" className="h-10 px-4 bg-green-500 hover:bg-green-600 text-white font-black rounded-xl shadow-md">
                                                                    <Check className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Active</span>
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent className="rounded-3xl">
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle className="font-black text-xl">Turn off alarm?</AlertDialogTitle>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel className="font-bold rounded-xl h-12">Keep Alarm</AlertDialogCancel>
                                                                    <AlertDialogAction className="font-bold rounded-xl h-12 bg-red-500 hover:bg-red-600" onClick={() => handleToggleSubscription(stop.id, false)}>
                                                                        Turn Off
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                      ) : (
                                                        <Button
                                                            size="sm"
                                                            className="h-10 px-4 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 font-black shadow-md shadow-yellow-400/20 rounded-xl"
                                                            onClick={() => handleToggleSubscription(stop.id, true, stop.name)}
                                                        >
                                                            <Bell className="mr-2 h-4 w-4 animate-[ring_3s_ease-in-out_infinite]"/>
                                                            <span className="hidden sm:inline">Notify Me</span>
                                                        </Button>
                                                      )
                                                  )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="px-3 pb-3 md:px-4 md:pb-4">
                                    <p className="text-sm mb-4">{stop.description}</p>
                                        {stop.amenities && stop.amenities.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100/50">
                                                {stop.amenities.map(amenity => (
                                                    <span key={amenity} className="inline-flex items-center gap-1.5 bg-white/50 border border-gray-200/50 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600">
                                                        {amenityIcons[amenity]}
                                                        {amenity}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                     <div className="mt-4 text-sm">
                                        <p className="font-semibold">Duration: <span className="font-normal text-primary">{stop.duration} minutes</span></p>
                                    </div>
                                </CardContent>
                                    {fromCrew && stop.status !== 'departed' && (
                                        <div className="flex items-center gap-3 mt-4 border-t border-gray-100/50 pt-4 px-4 pb-4">
                                            {stop.status === 'upcoming' ? (
                                                <Button 
                                                    className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-black h-12 rounded-xl shadow-md shadow-blue-500/20" 
                                                    onClick={() => handleUpdateStatus(stop, 'arrived')}
                                                >
                                                    Mark Arrived
                                                </Button>
                                            ) : stop.status === 'arrived' ? (
                                                <>
                                                    <Button 
                                                        variant="outline" 
                                                        className="flex-1 h-12 rounded-xl font-black border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100" 
                                                        onClick={() => router.push(`/cabin-crew/rest-stop-manifest/${scheduleId}?stopId=${stop.id}`)}
                                                    >
                                                        <Users className="w-4 h-4 mr-2" /> Manifest
                                                    </Button>
                                                </>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            </Card>

                            {isTrackingActive && liveLocation?.lat && stop.status === 'upcoming' && (
                                <div className="absolute w-0 h-0 overflow-hidden pointer-events-none opacity-0">
                                    <RouteEtaCalculator
                                        busId={bus?.id || ''}
                                        startPoint={liveLocation}
                                        destinationPoint={stopPoint}
                                        onRouteInfoChange={(info) => handleRouteInfoChange(stop.id, info)}
                                        bookingDate={schedule?.date || ''}
                                        scheduledTime={stop.time}
                                        departureTime={bus?.departureTime || ''}
                                        mapRouteData={mapRouteData}
                                        activeSchedule={schedule}
                                    />
                                </div>
                            )}
                        </motion.div>
                        );
                    })}
                    </AnimatePresence>
                 </div>
            ) : (
                <Card className="bg-white/70 backdrop-blur-md border-white/60 shadow-xl rounded-3xl">
                    <CardContent className="p-10 text-center">
                        <Coffee className="w-16 h-16 mx-auto text-indigo-300 mb-4 animate-bounce" />
                        <h3 className="text-2xl font-black tracking-tight text-gray-800">No Upcoming Halts</h3>
                        <p className="text-gray-500 text-base font-semibold mt-2">There are no major rest stops scheduled for this route, or they have already been passed.</p>
                    </CardContent>
                </Card>
            )}
        </div>

        {/* High Priority Rest Stop Arrived Modal (Centered on Screen) */}
        {activeArrivalStop && (
          <div 
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
            onClick={handleDismissArrivalModal}
          >
            <div 
              className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border-4 border-emerald-500 overflow-hidden text-gray-900 dark:text-zinc-100 animate-in zoom-in-95 duration-200"
              onClick={e => e.stopPropagation()}
            >
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-6 text-white flex items-center justify-between shadow-md">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner animate-bounce">
                    <Coffee className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold bg-white/25 px-2.5 py-0.5 rounded-full animate-pulse">
                        High Priority Update
                      </span>
                      <span className="text-xs text-emerald-100 font-bold">
                        Bus Halted
                      </span>
                    </div>
                    <h2 className="text-2xl font-headline font-black tracking-tight text-white mt-1">
                      {activeArrivalStop.name}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                  <p className="font-headline font-black text-xl text-emerald-950 dark:text-emerald-100 leading-snug">
                    The bus has safely arrived at {activeArrivalStop.name}!
                  </p>
                  {activeArrivalStop.location && (
                    <p className="text-sm text-emerald-800 dark:text-emerald-200 font-semibold mt-1.5 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Location: {activeArrivalStop.location}</span>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
                    <span className="text-xs text-gray-500 font-semibold block">Break Duration</span>
                    <span className="font-black text-lg text-gray-900 dark:text-white">
                      {activeArrivalStop.duration || 15} minutes
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
                    <span className="text-xs text-gray-500 font-semibold block">Halt Type</span>
                    <span className="font-black text-lg text-gray-900 dark:text-white">
                      {getStopTypeLabel(activeArrivalStop.type)}
                    </span>
                  </div>
                </div>

                {activeArrivalStop.amenities && activeArrivalStop.amenities.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Available Amenities</span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeArrivalStop.amenities.map((amenity, idx) => (
                        <span key={idx} className="bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                          {amenityIcons[amenity]}
                          {amenity}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-500 font-medium leading-relaxed bg-gray-50 dark:bg-zinc-900 p-3 rounded-xl border border-gray-100 dark:border-zinc-800">
                  Please note your seat and bus registration before stepping out. Make sure to return to the vehicle before the scheduled break concludes.
                </p>
              </div>

              {/* Footer */}
              <div className="p-5 bg-gray-50 dark:bg-zinc-900/60 border-t border-gray-100 dark:border-zinc-800">
                <Button
                  size="lg"
                  onClick={handleDismissArrivalModal}
                  className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:opacity-95 text-white font-headline font-black rounded-2xl h-14 text-base shadow-lg shadow-emerald-600/25 transition-all"
                >
                  <Check className="w-5 h-5 mr-2" />
                  <span>OK, Understood</span>
                </Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
