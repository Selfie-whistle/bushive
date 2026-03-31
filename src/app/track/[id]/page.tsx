'use client';

import React, { useState, useEffect, useMemo, Suspense, use } from 'react';
import { useRouter } from 'next/navigation';
import { dataService } from '@/lib/data/client-service';
import type { Bus as BusType, Point, Service, Booking } from '@/lib/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Phone,
  Clock,
  MapPin,
  Milestone,
  CalendarClock,
  Frown,
  ArrowRight,
  Bus,
  Navigation,
  ChevronRight,
  MessageSquareWarning,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, getScheduledDateTime, findBestMatchIndex } from '@/lib/utils';
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
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

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

function TrackPageContent({ id }: { id: string }) {
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [busDetails, setBusDetails] = useState<BusType | null>(null);
  const [schedule, setSchedule] = useState<any | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boardingRouteInfo, setBoardingRouteInfo] = useState<RouteInfo | null>(
    null
  );
  
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const lastBroadcastTimestamp = React.useRef<string | null>(null);

  const { isTrackingActive, liveLocation, locationName } = useLiveBusData(
    booking?.busId || null
  );

  useEffect(() => {
    let unsubscribeSchedule: (() => void) | undefined;

    async function fetchAndListen() {
      if (!id) {
        setError("Booking ID is missing.");
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        const bookingData = await dataService.getPublicBookingById(id);
        if (!bookingData) {
          setError("Booking not found.");
          setLoading(false);
          return;
        }
        setBooking(bookingData);

        const busData = await dataService.getBusById(bookingData.busId);
        setBusDetails(busData || (bookingData.busDetails as BusType));
        
        if (busData?.serviceId) {
            const serviceData = await dataService.getServiceById(busData.serviceId);
            setService(serviceData);
        }

        if (!bookingData.scheduleId) {
            setError("Schedule information is missing from the booking.");
            setLoading(false);
            return;
        }

        unsubscribeSchedule = dataService.onScheduleSnapshot(bookingData.scheduleId, (scheduleData) => {
          if (scheduleData) {
            setSchedule(scheduleData);

            // Check for broadcast
            if (scheduleData.broadcast && scheduleData.broadcast.timestamp !== lastBroadcastTimestamp.current) {
              setBroadcastMessage(scheduleData.broadcast.message);
              setShowBroadcast(true);
              lastBroadcastTimestamp.current = scheduleData.broadcast.timestamp;
            }

            const passengerSeat = bookingData.passengers[0]?.seatNumber;
            const bookingInSchedule = scheduleData.bookings?.find(
              (b: any) => b.bookingId === id && b.seat === passengerSeat
            );
            
            if (bookingInSchedule?.deboarded) {
                router.replace(`/track/finished?bookingId=${id}`);
                return;
            }

            if (bookingInSchedule?.boarded) {
              router.push(`/track/${id}/console`);
            }
          } else {
            console.warn("Could not find the schedule for this trip.");
          }
          setLoading(false);
        });

      } catch (err: any) {
        console.error("Failed to fetch tracking details:", err);
        setError(err.message || "An unexpected error occurred.");
        setLoading(false);
      }
    }

    fetchAndListen();

    return () => {
      if (unsubscribeSchedule) {
        unsubscribeSchedule();
      }
    };
  }, [id, router]);

  const boardingPoint: Point | undefined = useMemo(() => {
    if (!service || !booking || !schedule) return undefined;
    const points =
      schedule.direction === 'RETURN'
        ? service.boardingPointsReturn
        : service.boardingPointsForward;

    return points?.find((p) => p.name === booking.boardingPoint);
  }, [service, booking, schedule]);

  const waypointsToBoarding = useMemo(() => {
    if (!service || !schedule || !liveLocation || !boardingPoint) return [];

    const allBoardingPoints =
      schedule.direction === 'RETURN'
        ? service.boardingPointsReturn
        : service.boardingPointsForward;
    if (!allBoardingPoints || allBoardingPoints.length === 0) return [];

    const closestPointIndex = findBestMatchIndex(
      allBoardingPoints,
      undefined,
      liveLocation
    );
    if (closestPointIndex === -1) return [];

    const destinationIndex = allBoardingPoints.findIndex(
      (p) => p.name === boardingPoint.name
    );
    if (destinationIndex === -1 || closestPointIndex >= destinationIndex)
      return [];

    return allBoardingPoints.slice(closestPointIndex + 1, destinationIndex);
  }, [service, schedule, liveLocation, boardingPoint]);

  const getStatusColor = (delay?: number) => {
    if (typeof delay !== 'number') return 'text-muted-foreground';
    if (delay <= 2) return 'text-green-600';
    if (delay <= 10) return 'text-orange-500';
    return 'text-red-600';
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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-96 w-full max-w-4xl mx-auto" />
      </div>
    );
  }

  if (error || !booking || !busDetails || !schedule || !service) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Alert variant="destructive">
          <Frown className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error || 'Incomplete data'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
  <div className="min-h-screen bg-gray-50">
      <AlertDialog open={showBroadcast} onOpenChange={setShowBroadcast}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex justify-center mb-4">
              <div className="bg-destructive/10 text-destructive rounded-full p-4">
                <MessageSquareWarning className="w-12 h-12" />
              </div>
            </div>
            <AlertDialogTitle className="text-2xl text-center">
              Important Update from Crew
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base pt-2">
              {broadcastMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowBroadcast(false)}>
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    <div className="bg-white border-b">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Live Tracking</h1>
      </div>
    </div>
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <Card className="border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{busDetails.travelsName}</h2>
              <p className="text-gray-600 font-medium">{busDetails.operator}</p>
              <div className="flex items-center gap-2 mt-1 text-gray-700">
                <span>{busDetails.origin}</span>
                <ChevronRight className="h-4 w-4" />
                <span>{busDetails.destination}</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Booking ID: <span className="font-mono">{id}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
                <div className="bg-yellow-400 text-black font-mono text-sm font-bold px-3 py-1.5 rounded-md border-2 border-black inline-block h-11 flex items-center justify-center">
                    {busDetails.busNumber}
                </div>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="h-11 px-6 text-base" disabled={!busDetails.contactNumber}>
                            <Phone className="h-4 w-4 mr-2" />
                            Call Cabin
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Contact Bus Cabin?</AlertDialogTitle>
                            <AlertDialogDescription>For emergencies only. This will call the bus cabin directly.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction asChild>
                                <a href={`tel:${busDetails.contactNumber}`}>Call Now</a>
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="border-b px-4 py-3 flex justify-between items-center text-sm">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-blue-600" />
            <span className="font-medium">{locationName || "Fetching location..."}</span>
          </div>
          <span className="text-gray-500">
            Last updated: {liveLocation ? format(new Date(liveLocation.ts), "hh:mm a") : "--"}
          </span>
        </div>
        <div className="h-[500px] bg-gray-50">
          {isTrackingActive ? (
            <LiveTrackingMap
                liveLocation={liveLocation}
                mapRouteData={mapRouteData}
                activeSchedule={schedule}
                destinationPoint={boardingPoint}
                waypoints={waypointsToBoarding}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-center p-8">
              <div>
                <Navigation className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">Waiting for tracking to start</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
       <Card>
        <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <CalendarClock className="h-5 w-5" />
                Arrival Status
            </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
             <div>
                <p className="text-sm text-muted-foreground font-semibold flex items-center justify-center gap-1">ETA</p>
                <p className={cn('text-xl font-bold', getStatusColor(boardingRouteInfo?.delayInMinutes))}>{boardingRouteInfo?.eta || '...'}</p>
                <p className={cn('text-xs font-medium', getStatusColor(boardingRouteInfo?.delayInMinutes))}>{getStatusText(boardingRouteInfo?.delayInMinutes)}</p>
            </div>
            <div>
                <p className="text-sm text-muted-foreground font-semibold flex items-center justify-center gap-1">
                    <Clock className="w-4 h-4"/> Time</p>
                <p className={cn('text-xl font-bold', getStatusColor(boardingRouteInfo?.delayInMinutes))}>{boardingRouteInfo?.duration || '...'}</p>
            </div>
            <div>
                <p className="text-sm text-muted-foreground font-semibold flex items-center justify-center gap-1">
                    <Milestone className="w-4 h-4"/> Distance</p>
                <p className="text-xl font-bold text-blue-600">{boardingRouteInfo?.distance || '...'}</p>
            </div>
        </CardContent>
       </Card>

      <div className="border rounded-lg p-4 bg-white space-y-2">
        <h3 className="text-lg font-bold text-red-600">
          {boardingPoint?.name}
        </h3>
        {boardingPoint?.description && (
          <p className="text-gray-600 text-sm">
            {boardingPoint.description}
          </p>
        )}
        <div className="flex flex-wrap gap-4 text-sm text-gray-700">
          <div>
            Date:{" "}
            <span className="font-medium">
              {format(new Date(schedule.date), "MMM dd")}
            </span>
          </div>
          <div>
            Time:{" "}
            <span className="font-medium">
              {boardingPoint?.time}
            </span>
          </div>
        </div>
      </div>
      <div className="hidden">
        {liveLocation && boardingPoint && schedule && busDetails && boardingPoint.time && busDetails.departureTime && (
          <RouteEtaCalculator
            busId={busDetails.id}
            key={`boarding-calc-${booking.id}`}
            startPoint={liveLocation}
            destinationPoint={boardingPoint}
            waypoints={waypointsToBoarding}
            onRouteInfoChange={setBoardingRouteInfo}
            bookingDate={schedule.date}
            scheduledTime={boardingPoint.time}
            departureTime={busDetails.departureTime}
          />
        )}
      </div>
    </div>
  </div>
);
}

export default function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolved = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <TrackPageContent id={resolved.id} />
    </Suspense>
  );
}