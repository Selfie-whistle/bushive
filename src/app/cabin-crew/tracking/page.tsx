'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { dataService } from '@/lib/data/client-service';
import type { Bus as BusType, Schedule, Point, Service, Booking } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Bus,
  Route as RouteIcon,
  Play,
  StopCircle,
  ArrowLeft,
  Clock,
  MapPin,
  CalendarClock,
  Volume2,
  VolumeX,
  Milestone,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { cn, getScheduledDateTime, findBestMatchIndex } from '@/lib/utils';
import { useFirebase } from '@/firebase';
import { TrackingManager, type TrackingStatus } from '@/lib/tracking-manager';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useLiveBusData } from '@/hooks/use-live-bus-data';
import dynamic from 'next/dynamic';

const LiveTrackingMap = dynamic(() => import('@/components/LiveTrackingMap'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const RouteEtaCalculator = dynamic(() => import('@/components/RouteEtaCalculator'), { ssr: false });

type RouteInfo = {
  distance: string;
  duration: string;
  eta: string;
  etaDate: Date;
  delayInMinutes: number;
  locationName: string | null;
  durationMinutes: number;
};

export default function TrackingControlPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading } = useFirebase();

  const [logicalBus, setLogicalBus] = useState<BusType | null>(null);
  const [physicalBus, setPhysicalBus] = useState<BusType | null>(null);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [detailedBookings, setDetailedBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>(TrackingManager.getStatus());

  const { liveLocation, locationName } = useLiveBusData(physicalBus?.id || null);

  const [nextStopRouteInfo, setNextStopRouteInfo] = useState<RouteInfo | null>(null);
  const [finalDestinationRouteInfo, setFinalDestinationRouteInfo] = useState<RouteInfo | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const alarmTriggeredRef = useRef(false);

  useEffect(() => {
    const handleStatusChange = (status: TrackingStatus) => {
        setTrackingStatus(status);
        if (status.status === 'error' && status.error) {
            toast({
                title: "Tracking Error",
                description: status.error,
                variant: "destructive"
            });
        }
    };

    handleStatusChange(TrackingManager.getStatus());
    TrackingManager.on('statusChange', handleStatusChange);

    return () => {
        TrackingManager.off('statusChange', handleStatusChange);
    };
  }, [toast]);

  useEffect(() => {
    if (isUserLoading || !user?.email) {
      if (!isUserLoading) setIsLoading(false);
      return;
    }
  
    setIsLoading(true);
  
    const unsub = dataService.onBusesSnapshot(async (buses) => {
      const crewAssignedBus = buses.find((b) => b.cabinCrewId === user.email);
  
      if (crewAssignedBus) {
        const today = new Date().toISOString().split('T')[0];
        const schedules = await dataService.getSchedulesForDate(today);
        
        const scheduleForToday = schedules.find(s => s.actualBusId === crewAssignedBus.id);
        setActiveSchedule(scheduleForToday ?? null);
  
        if (scheduleForToday) {
          const logicalBusForRoute = await dataService.getBusById(scheduleForToday.busId);
          setLogicalBus(logicalBusForRoute ?? null);
          setPhysicalBus(crewAssignedBus);
  
          if (scheduleForToday.serviceId) {
            const serviceData = await dataService.getServiceById(scheduleForToday.serviceId);
            setService(serviceData);
          }
  
          if (scheduleForToday.bookings) {
            const bookingDetailsPromises = scheduleForToday.bookings.map(bookingRef => 
              dataService.getBookingById(bookingRef.userId, bookingRef.bookingId)
            );
            const bookings = (await Promise.all(bookingDetailsPromises)).filter(Boolean) as Booking[];
            setDetailedBookings(bookings);
          }
        }
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Failed to listen for buses:", error);
      setIsLoading(false);
    });
  
    return () => unsub();
  }, [user, isUserLoading]);
  
  const finalDestinationPoint = useMemo(() => {
    if (!service || !activeSchedule || !logicalBus) return null;
    const points = activeSchedule.direction === 'RETURN'
      ? service.droppingPointsReturn
      : service.droppingPointsForward;
    
    if (!points || points.length === 0) return null;

    const sortedPoints = [...points].sort((a, b) => {
        const dateA = getScheduledDateTime(activeSchedule.date, a.time, logicalBus.departureTime);
        const dateB = getScheduledDateTime(activeSchedule.date, b.time, logicalBus.departureTime);
        return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
    });

    return sortedPoints[sortedPoints.length - 1];
  }, [service, activeSchedule, logicalBus]);
  
  const nextDroppingPoint = useMemo(() => {
    if (!logicalBus || !liveLocation || !activeSchedule || !service) {
      return null;
    }

    if (detailedBookings.length === 0) {
      return finalDestinationPoint;
    }

    const allDroppingPoints =
      activeSchedule.direction === 'RETURN'
        ? service.droppingPointsReturn
        : service.droppingPointsForward;

    if (!allDroppingPoints || allDroppingPoints.length === 0) {
      return null;
    }

    const bookedDroppingPointNames = new Set(detailedBookings.map((b) => b.droppingPoint));
    const closestStopIndex = findBestMatchIndex(allDroppingPoints, undefined, liveLocation);

    if (closestStopIndex === -1) return null;

    for (let i = closestStopIndex; i < allDroppingPoints.length; i++) {
      const stop = allDroppingPoints[i];
      if (stop && bookedDroppingPointNames.has(stop.name)) {
        return stop;
      }
    }

    return finalDestinationPoint;
  }, [logicalBus, liveLocation, detailedBookings, finalDestinationPoint, activeSchedule, service]);

  useEffect(() => {
    if (
      !alarmTriggeredRef.current &&
      isSoundEnabled &&
      nextStopRouteInfo &&
      nextStopRouteInfo.durationMinutes <= 10
    ) {
      audioRef.current?.play().catch(e => console.error("Audio play failed:", e));
      toast({
        title: "Approaching Next Drop-off!",
        description: `Arriving at ${nextDroppingPoint?.name} in approximately 10 minutes.`,
        duration: 10000,
      });
      alarmTriggeredRef.current = true;
    }
  }, [nextStopRouteInfo, isSoundEnabled, toast, nextDroppingPoint]);

  const startTracking = () => {
    if (!physicalBus) {
        toast({ title: 'Tracking Error', description: 'No bus assigned.', variant: 'destructive' });
        return;
    }
    try {
        TrackingManager.start(physicalBus.id);
        toast({ title: 'Tracking started successfully' });
    } catch (e: any) {
        toast({ title: 'Error Starting Tracking', description: e.message, variant: 'destructive' });
    }
  };

  const stopTracking = () => {
    TrackingManager.stop();
    toast({ title: 'Tracking stopped' });
  };

  const getStatusText = (delay?: number) => {
    if (typeof delay !== 'number') return '(Calculating...)';
    if (Math.abs(delay) <= 2) return '(On Time)';
    const absMinutes = Math.abs(delay);
    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;
    const timeString = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return delay > 0 ? `(Late by ${timeString})` : `(Early by ${timeString})`;
  };

  const getStatusColor = (delay?: number) => {
    if (typeof delay !== 'number') return 'text-muted-foreground';
    if (delay <= 2) return 'text-green-600';
    if (delay <= 10) return 'text-orange-500';
    return 'text-red-600';
  };

  const mapRouteData = useMemo(() => {
    if (!service) return null;
    return {
      forward: {
        boarding: service.boardingPointsForward || [],
        dropping: service.droppingPointsForward || [],
      },
      return: {
        boarding: service.boardingPointsReturn || [],
        dropping: service.droppingPointsReturn || [],
      },
    };
  }, [service]);

  if (isLoading || isUserLoading) {
    return (
       <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-24 mb-4" />
        <Card className="max-w-xl mx-auto">
            <CardHeader><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-1/3 mt-2" /></CardHeader>
            <CardContent className="space-y-6"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <audio ref={audioRef} src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" preload="auto" />
      <Button variant="ghost" size="sm" onClick={() => router.push('/cabin-crew')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <div className="max-w-xl mx-auto mt-4 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Live Tracking Control</CardTitle>
                <CardDescription>Control live location sharing</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn('w-3 h-3 rounded-full', trackingStatus.isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400')} />
                <span className="text-sm">{trackingStatus.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="flex gap-2"><Bus className="w-4 h-4" /> Assigned Bus</Label>
              <p className="font-medium">{logicalBus ? `${logicalBus.travelsName} (${physicalBus?.busNumber})` : 'Not assigned'}</p>
            </div>
            <div>
              <Label className="flex gap-2"><RouteIcon className="w-4 h-4" /> Route</Label>
              <p className="font-medium">
                {logicalBus && activeSchedule
                  ? `${activeSchedule.direction === 'RETURN' ? logicalBus.destination : logicalBus.origin} → ${activeSchedule.direction === 'RETURN' ? logicalBus.origin : logicalBus.destination}`
                  : 'No active route'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Button disabled={trackingStatus.isActive || !logicalBus || !activeSchedule} className="bg-green-600 hover:bg-green-700" onClick={startTracking}>
                <Play className="mr-2 h-4 w-4" /> Start
              </Button>
              <Button disabled={!trackingStatus.isActive} variant="destructive" onClick={stopTracking}>
                <StopCircle className="mr-2 h-4 w-4" /> Stop
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {trackingStatus.isActive && (
          <div className="h-96 w-full rounded-lg overflow-hidden border">
             {mapRouteData && activeSchedule && (
                <LiveTrackingMap 
                  liveLocation={liveLocation}
                  mapRouteData={mapRouteData}
                  activeSchedule={activeSchedule}
                  destinationPoint={nextDroppingPoint || finalDestinationPoint}
                />
             )}
          </div>
        )}

        {trackingStatus.isActive && (
          <>
            <Card className="bg-muted/50">
              <CardContent className="pt-4 space-y-2 text-sm">
                   <div className="grid grid-cols-2 items-start">
                    <span className="font-semibold text-muted-foreground flex items-center gap-1"><MapPin className="h-4 w-4" /> Current Location</span>
                    <span className="font-mono text-right">{locationName ?? 'Fetching location…'}</span>
                  </div>
                  <div className="grid grid-cols-2 items-center border-t pt-2 mt-2">
                    <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-4 w-4"/> Last Updated</span>
                    <span className="font-mono text-right">{liveLocation?.ts ? format(new Date(liveLocation.ts), 'p') : '—'}</span>
                  </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center justify-between gap-2 text-blue-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Next Stop: {nextDroppingPoint?.name || 'Calculating...'}
                    </div>
                     <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsSoundEnabled(!isSoundEnabled)}>
                        {isSoundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                    </Button>
                  </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4 text-center">
                 <div>
                      <p className="text-xs text-muted-foreground font-semibold flex items-center justify-center gap-1"><CalendarClock className="w-4 h-4"/> ETA</p>
                      <p className={cn("font-bold text-lg", getStatusColor(nextStopRouteInfo?.delayInMinutes))}>{nextStopRouteInfo?.eta || '...'}</p>
                      <p className={cn("text-xs font-medium", getStatusColor(nextStopRouteInfo?.delayInMinutes))}>{getStatusText(nextStopRouteInfo?.delayInMinutes)}</p>
                  </div>
                  <div>
                      <p className="text-xs text-muted-foreground font-semibold flex items-center justify-center gap-1"><Clock className="w-4 h-4"/> Time</p>
                      <p className={cn("font-bold text-lg", getStatusColor(nextStopRouteInfo?.delayInMinutes))}>{nextStopRouteInfo?.duration || '...'}</p>
                  </div>
                  <div>
                      <p className="text-xs text-muted-foreground font-semibold flex items-center justify-center gap-1"><Milestone className="w-4 h-4"/> Distance</p>
                      <p className="font-bold text-lg text-blue-600">{nextStopRouteInfo?.distance || '...'}</p>
                  </div>
              </CardContent>
            </Card>

            {finalDestinationPoint && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-purple-600">
                    <MapPin className="h-4 w-4" />
                    Final Destination: {finalDestinationPoint.name || 'Unknown'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold flex items-center justify-center gap-1"><CalendarClock className="w-4 h-4"/> ETA</p>
                    <p className={cn("font-bold text-lg", getStatusColor(finalDestinationRouteInfo?.delayInMinutes))}>{finalDestinationRouteInfo?.eta || '...'}</p>
                    <p className={cn("text-xs font-medium", getStatusColor(finalDestinationRouteInfo?.delayInMinutes))}>{getStatusText(finalDestinationRouteInfo?.delayInMinutes)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold flex items-center justify-center gap-1"><Clock className="w-4 h-4"/> Time</p>
                    <p className={cn("font-bold text-lg", getStatusColor(finalDestinationRouteInfo?.delayInMinutes))}>{finalDestinationRouteInfo?.duration || '...'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold flex items-center justify-center gap-1"><Milestone className="w-4 h-4"/> Distance</p>
                    <p className="font-bold text-lg text-blue-600">{finalDestinationRouteInfo?.distance || '...'}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
      
      <div className="hidden">
          {logicalBus && activeSchedule && nextDroppingPoint && liveLocation && (
              <RouteEtaCalculator
                  busId={logicalBus.id}
                  startPoint={liveLocation}
                  destinationPoint={nextDroppingPoint}
                  onRouteInfoChange={setNextStopRouteInfo}
                  bookingDate={activeSchedule.date}
                  scheduledTime={nextDroppingPoint.time}
                  departureTime={logicalBus.departureTime}
              />
          )}
          {logicalBus && activeSchedule && finalDestinationPoint && liveLocation && (
              <RouteEtaCalculator
                  busId={logicalBus.id}
                  startPoint={liveLocation}
                  destinationPoint={finalDestinationPoint}
                  onRouteInfoChange={setFinalDestinationRouteInfo}
                  bookingDate={activeSchedule.date}
                  scheduledTime={finalDestinationPoint.time}
                  departureTime={logicalBus.departureTime}
              />
          )}
      </div>
    </div>
  );
}