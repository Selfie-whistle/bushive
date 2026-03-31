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
  Target,
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

function TrackBusBoardedPageContent({ id }: { id: string }) {
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [busDetails, setBusDetails] = useState<BusType | null>(null);
  const [schedule, setSchedule] = useState<any | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [droppingRouteInfo, setDroppingRouteInfo] = useState<RouteInfo | null>(
    null
  );

  const { isTrackingActive, liveLocation, locationName } =
    useLiveBusData(booking?.busId || null);

  /* ---------------- FETCH DATA ---------------- */
  useEffect(() => {
    async function fetchDetails() {
      try {
        const bookingData = await dataService.getPublicBookingById(id);
        if (!bookingData) {
          setError('Booking not found');
          return;
        }

        setBooking(bookingData);

        const [busData, scheduleData] = await Promise.all([
          dataService.getBusById(bookingData.busId),
          dataService.getSchedule(bookingData.scheduleId),
        ]);

        setBusDetails(busData || (bookingData.busDetails as BusType));
        setSchedule(scheduleData);

        if (scheduleData?.serviceId) {
          const serviceData = await dataService.getServiceById(scheduleData.serviceId);
          setService(serviceData);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch booking details');
      } finally {
        setLoading(false);
      }
    }

    fetchDetails();
  }, [id]);

  /* ---------------- DROPPING POINT ---------------- */
  const droppingPoint: Point | undefined = useMemo(() => {
    if (!service || !booking || !schedule) return undefined;
    const points =
      schedule.direction === 'RETURN'
        ? service.droppingPointsReturn
        : service.droppingPointsForward;

    return points?.find(p => p.name === booking.droppingPoint);
  }, [service, booking, schedule]);
  
  const waypoints = useMemo(() => {
    if (!service || !schedule || !liveLocation || !droppingPoint) {
      return [];
    }

    const allDroppingPoints =
      schedule.direction === 'RETURN'
        ? service.droppingPointsReturn
        : service.droppingPointsForward;

    if (!allDroppingPoints || allDroppingPoints.length === 0) {
      return [];
    }
    
    const closestPointIndex = findBestMatchIndex(
      allDroppingPoints,
      undefined,
      liveLocation
    );

    if (closestPointIndex === -1) {
      return [];
    }
    
    const destinationIndex = allDroppingPoints.findIndex(
      (p) => p.name === droppingPoint.name
    );

    if (destinationIndex === -1 || closestPointIndex >= destinationIndex) {
      return [];
    }
    
    return allDroppingPoints.slice(closestPointIndex + 1, destinationIndex);

  }, [service, schedule, liveLocation, droppingPoint]);


  /* ---------------- STATUS LOGIC ---------------- */
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
          <AlertDescription>{error ?? 'Incomplete data'}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Top Bar */}
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white rounded-xl shadow-sm border">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Navigation className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Live Bus Tracking</h1>
                  <p className="text-sm text-gray-500">
                    Booking ID: <span className="font-mono font-semibold">{id}</span>
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-sm">
                <Bus className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{busDetails.travelsName}</span>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-gray-600">{busDetails.operator}</span>
              </div>
            </div>
            
            <div className="flex flex-col items-start md:items-end gap-3">
              <div className="bg-yellow-400 text-black font-mono text-sm font-bold px-2 py-1 rounded-md border-2 border-black">
                  {busDetails.busNumber}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    disabled={!busDetails.contactNumber}
                  >
                    <Phone className="h-4 w-4" />
                    <span className="hidden sm:inline">Cabin Call</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-destructive" />
                      Contact Bus Cabin
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      For emergencies only. This will call the bus cabin directly.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <a href={`tel:${busDetails.contactNumber}`}>
                        Call Now
                      </a>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="border border-gray-200 shadow-sm h-full">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-red-600" />
                  Live Bus Location
                  {isTrackingActive && (
                    <Badge variant="secondary" className="ml-2 animate-pulse bg-red-100 text-red-700">
                      LIVE
                    </Badge>
                  )}
                </CardTitle>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="text-xs">Boarding Points</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    <span className="text-xs">Dropping Points</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="text-xs">Live Bus</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 h-[400px]">
                <div className="h-full w-full">
                  {isTrackingActive ? (
                    <LiveTrackingMap
                      liveLocation={liveLocation}
                      mapRouteData={mapRouteData}
                      activeSchedule={schedule}
                      destinationPoint={droppingPoint}
                      waypoints={waypoints}
                    />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                        <Clock className="h-8 w-8 text-gray-400 mx-auto mb-4" />
                        <h4 className="font-medium text-gray-900 mb-1">Tracking Inactive</h4>
                        <p className="text-sm text-gray-600">Live tracking will begin when the trip starts.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-6">
            {isTrackingActive && droppingPoint && (
              <Card className="border border-gray-200 shadow-sm bg-gradient-to-br from-blue-50 to-white">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Navigation className="h-5 w-5 text-blue-700" />
                    </div>
                    <span>Arrival Status</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xl font-bold text-gray-900">{droppingPoint.name}</p>
                      {droppingPoint.description && (
                        <p className="text-sm text-gray-600 mt-1">{droppingPoint.description}</p>
                      )}
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Scheduled</span>
                        <span className="font-semibold text-blue-700">
                          {format(
                            getScheduledDateTime(
                              schedule.date,
                              droppingPoint.time,
                              busDetails.departureTime
                            )!,
                            'h:mm a'
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">ETA</span>
                        <Badge className={cn(
                          "border",
                          getStatusColor(droppingRouteInfo?.delayInMinutes),
                          "bg-opacity-10"
                        )}>
                          {droppingRouteInfo?.eta || '...'} {droppingRouteInfo ? getStatusText(droppingRouteInfo.delayInMinutes) : ''}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Target className="h-5 w-5 text-gray-700" />
                  Trip Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                {busDetails ? (
                  <div className="space-y-3">
                      <div>
                        <p className="font-bold text-lg">{busDetails.origin} <ArrowRight className="inline h-4 w-4" /> {busDetails.destination}</p>
                      </div>
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-gray-500" />
                          <span className="font-semibold text-gray-800">
                            {format(new Date(schedule.date), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500">Details not available.</p>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
        
        <div className="hidden">
          {liveLocation && droppingPoint && schedule && busDetails && (
            <RouteEtaCalculator
              key={`dropping-calc-${booking.id}`}
              busId={busDetails.id}
              startPoint={liveLocation}
              destinationPoint={droppingPoint}
              waypoints={waypoints}
              onRouteInfoChange={setDroppingRouteInfo}
              bookingDate={schedule.date}
              scheduledTime={droppingPoint.time}
              departureTime={busDetails.departureTime}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function TrackBusBoardedPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <TrackBusBoardedPageContent id={resolved.id} />
    </Suspense>
  );
}