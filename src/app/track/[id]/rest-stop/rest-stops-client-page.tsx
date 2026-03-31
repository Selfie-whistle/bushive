'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirebase } from '@/firebase';
import type { Booking, Bus, Point, RestStop, Schedule } from '@/lib/types';
import { dataService, getDb } from '@/lib/data/client-service';
import { onSnapshot, doc } from 'firebase/firestore';


import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Coffee, Utensils, ParkingCircle, PersonStanding, Frown, Bell, Check, Volume2, VolumeX, RotateCcw, Users } from 'lucide-react';
import { addMinutes, format as fnsFormat } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

const BusRouteMap = dynamic(() => import('@/components/LiveBusRoute'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});


type StopWithETA = RestStop & { eta?: string; remainingTime?: string; };

function useBusLocation(busId: string | null) {
    const [busLocation, setBusLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [isTrackingActive, setIsTrackingActive] = useState(false);

    useEffect(() => {
        if (!busId) {
            setBusLocation(null);
            setIsTrackingActive(false);
            return;
        }

        const busRef = doc(getDb(), 'buses', busId);
        const unsubscribe = onSnapshot(busRef, (docSnap) => {
            if (docSnap.exists()) {
                const busData = docSnap.data() as Bus;
                setBusLocation(busData.liveLocation || null);
                setIsTrackingActive(!!busData.liveLocation);
            }
        });

        return () => unsubscribe();
    }, [busId]);

    return useMemo(() => ({
        lat: busLocation?.lat,
        lng: busLocation?.lng,
        isTrackingActive: isTrackingActive,
    }), [busLocation?.lat, busLocation?.lng, isTrackingActive]);
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
  const [scheduleId, setScheduleId] = useState<string | undefined>(undefined);
  const { schedule, isLoading: isScheduleLoading } = useScheduleHook(scheduleId);
  const [isLoading, setIsLoading] = useState(true);
  const [upcomingRestStops, setUpcomingRestStops] = useState<RestStop[]>([]);
  const prevStopsRef = React.useRef<RestStop[]>([]);
  const [etaData, setEtaData] = useState<Record<string, { eta: string; remainingTime: string; }>>({});
  
  const [subscribedStops, setSubscribedStops] = useState<Set<string>>(new Set());

  const { isTrackingActive, ...busLocation } = useBusLocation(bus?.id || null);
  
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

  useEffect(() => {
    const fetchDetails = async () => {
      if (isUserLoading || !id) return;
      
      setIsLoading(true);
      try {
        let busIdToListen: string | null = null;

        if (fromCrew) {
            setScheduleId(id);
            const sched = await dataService.getSchedule(id);
            if (sched) {
                busIdToListen = sched.busId;
            } else {
                throw new Error("Schedule not found for crew.");
            }
        } else {
            const bookingData = await dataService.getPublicBookingById(id);
            if (bookingData) {
              setBooking(bookingData);
              setScheduleId(bookingData.scheduleId);
              busIdToListen = bookingData.busId;
            } else {
              throw new Error("Booking not found.");
            }
        }
        
        if (busIdToListen) {
            const busData = await dataService.getBusById(busIdToListen);
            setBus(busData);
        }

      } catch (error: any) {
        console.error("Failed to fetch details:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchDetails();
  }, [id, user, isUserLoading, fromCrew]);

  // Load subscriptions from local storage
  useEffect(() => {
    if (!id) return;
    const key = `notifyme_${id}`;
    const savedSubs = localStorage.getItem(key);
    if (savedSubs) {
      setSubscribedStops(new Set(JSON.parse(savedSubs)));
    }
  }, [id]);

  useEffect(() => {
    const restStopsToShow = bus?.restStopsForward || bus?.restStops || [];
    if (!restStopsToShow.length || !schedule) return;

    const statusMap = new Map<string, { status: string; timestamp: string }>();
    if (schedule.stopStatuses) {
      Object.entries(schedule.stopStatuses).forEach(([stopId, statusInfo]) => {
        statusMap.set(stopId, statusInfo);
      });
    }

    const mergedStops = restStopsToShow.map((stop): RestStop => {
      const statusInfo = statusMap.get(stop.id);
      return {
        ...stop,
        status: statusInfo?.status as RestStop['status'] || 'upcoming',
      };
    });

    setUpcomingRestStops(mergedStops);

  }, [bus, schedule]);

  // Effect to handle alarms on status changes
  useEffect(() => {
    if (fromCrew || !isSoundEnabled) return;

    upcomingRestStops.forEach(currentStop => {
        const prevStop = prevStopsRef.current.find(p => p.id === currentStop.id);
        
        if (
            prevStop && 
            prevStop.status !== 'arrived' && 
            currentStop.status === 'arrived' &&
            subscribedStops.has(currentStop.id)
        ) {
            toast({
              title: `Arrived at ${currentStop.name}!`,
              description: `The bus has reached ${currentStop.location}. Duration: ${currentStop.duration} mins.`,
              duration: 10000,
            });
            if (soundInitialized.current) {
                audioRef.current?.play().catch(e => console.error("Audio play failed:", e));
            }
        }
    });
    
    prevStopsRef.current = upcomingRestStops;

  }, [upcomingRestStops, fromCrew, isSoundEnabled, subscribedStops, toast]);


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
      toast({
        title: 'Notification Set!',
        description: `We'll let you know when the bus arrives at ${stopName}.`,
      });
    } else {
      updatedSubs.delete(stopId);
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
    <div className="bg-gray-50 min-h-screen">
        <audio ref={audioRef} src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" preload="auto" muted />
        <div className="container mx-auto px-4 py-8 max-w-3xl">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => router.push(fromCrew ? `/cabin-crew` : `/track/${id}/console`)}>
                        <ArrowLeft />
                    </Button>
                    <h1 className="text-xl md:text-2xl font-bold font-headline">Upcoming Rest Stops</h1>
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
            </div>

            {stopsToDisplay.length > 0 ? (
                 <div className="space-y-4">
                    {stopsToDisplay.map(stop => {
                        const stopEta = etaData[stop.id];
                        const stopPoint = { lat: parseFloat(stop.coordinates?.split(',')[0] || '0'), lng: parseFloat(stop.coordinates?.split(',')[1] || '0'), name: stop.name, time: '' };
                        return (
                        <React.Fragment key={stop.id}>
                        <Card className={cn("overflow-hidden flex", stop.status === 'departed' && 'opacity-50 bg-red-50 border-red-200')}>
                            <div className={cn("text-white flex items-center justify-center p-2 md:p-3", getStopTypeColor(stop.type))}>
                                <span className="[writing-mode:vertical-rl] rotate-180 font-bold text-sm tracking-wider uppercase">{getStopTypeLabel(stop.type)}</span>
                            </div>
                            <div className="flex-grow">
                                <CardHeader className="p-3 md:p-4">
                                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                                        <div>
                                            <CardTitle className="text-base md:text-lg">{stop.name}</CardTitle>
                                            <CardDescription className="text-xs md:text-sm">{stop.location}</CardDescription>
                                        </div>
                                        <div className="text-left sm:text-right shrink-0">
                                            {stop.status === 'arrived' ? (
                                                <p className="font-bold text-green-600">Arrived</p>
                                            ) : stop.status === 'departed' ? (
                                                <p className="font-bold text-red-800">Departed</p>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                  <div>
                                                      <p className="text-xs text-muted-foreground">Arriving in</p>
                                                      <p className="font-bold text-blue-600">{stopEta?.remainingTime || '...'}
                                                      {stopEta?.eta && <span className="text-xs font-normal text-muted-foreground ml-1">({stopEta.eta})</span>}</p>
                                                  </div>
                                                  {!fromCrew && (
                                                      subscribedStops.has(stop.id) ? (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button size="sm" className="h-8 px-2 bg-green-600 hover:bg-green-700 text-white font-semibold">
                                                                    <Check className="mr-1.5 h-3 w-3" /> <span className="hidden sm:inline">Notify</span>
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Turn off notification?</AlertDialogTitle>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => handleToggleSubscription(stop.id, false)}>
                                                                        Turn Off
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                      ) : (
                                                        <Button
                                                            size="sm"
                                                            className="h-8 px-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold"
                                                            onClick={() => handleToggleSubscription(stop.id, true, stop.name)}
                                                        >
                                                            <Bell className="mr-1.5 h-3 w-3"/>
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
                                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                        {stop.amenities?.map(amenity => (
                                            <div key={amenity} className="flex items-center gap-2">
                                                {amenityIcons[amenity] || <Coffee className="w-4 h-4" />}
                                                <span>{amenity}</span>
                                            </div>
                                        ))}
                                    </div>
                                     <div className="mt-4 text-sm">
                                        <p className="font-semibold">Duration: <span className="font-normal text-primary">{stop.duration} minutes</span></p>
                                    </div>
                                </CardContent>
                                {fromCrew && (
                                    <CardFooter className="flex justify-end p-4 bg-muted/50 gap-2">
                                        {stop.status === 'arrived' ? (
                                            <>
                                                <Button size="sm" variant="outline" onClick={() => router.push(`/cabin-crew/rest-stop-manifest/${scheduleId}?stopId=${stop.id}`)}>
                                                    <Users className="mr-2 h-4 w-4" />
                                                    Passenger Check
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button size="sm" variant="destructive">Mark as Departed</Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Confirm Departure</AlertDialogTitle>
                                                            <AlertDialogDescription>Are you sure you want to mark the bus as departed from {stop.name}?</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleUpdateStatus(stop, 'departed')}>Confirm Departure</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </>
                                        ) : stop.status === 'departed' ? (
                                            <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(stop, 'upcoming')}>Reset Status</Button>
                                        ) : (
                                             <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button size="sm">Arrived</Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Confirm Arrival</AlertDialogTitle>
                                                        <AlertDialogDescription>Are you sure you want to mark the bus as arrived at {stop.name}?</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleUpdateStatus(stop, 'arrived')}>
                                                        Confirm Arrival
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </CardFooter>
                                )}
                            </div>
                        </Card>
                        {isTrackingActive && busLocation.lat && stop.status === 'upcoming' && (
                            <div className="hidden">
                                <BusRouteMap
                                    busId={bus?.id || ''}
                                    isTrackingActive={true}
                                    startPoint={busLocation}
                                    destinationPoint={stopPoint}
                                    onRouteInfoChange={(info) => handleRouteInfoChange(stop.id, info)}
                                    bookingDate={schedule?.date}
                                    scheduledTime={stop.time}
                                    departureTime={bus?.departureTime}
                                />
                            </div>
                        )}
                        </React.Fragment>
                    )})}
                 </div>
            ) : (
                <Card>
                    <CardContent className="p-10 text-center">
                        <Coffee className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold">No Upcoming Rest Stops</h3>
                        <p className="text-muted-foreground text-sm">There are no major rest stops scheduled for this route, or they have already been passed.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    </div>
  );
}
