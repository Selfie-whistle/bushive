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
  Ticket,
  Calendar,
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
import { motion, AnimatePresence } from 'framer-motion';
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

  const busIdToTrack = useMemo(() => {
    return schedule?.actualBusId || booking?.busId || null;
  }, [schedule?.actualBusId, booking?.busId]);

  const { isTrackingActive, liveLocation, locationName } =
    useLiveBusData(busIdToTrack);

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

  // Subscribe to real-time schedule updates (e.g. actualBusId changes or status)
  useEffect(() => {
    if (!booking?.scheduleId) return;
    const unsub = dataService.onScheduleSnapshot(booking.scheduleId, (updatedSchedule) => {
      if (updatedSchedule) {
        setSchedule(updatedSchedule);
      }
    });
    return () => unsub();
  }, [booking?.scheduleId]);

  /* ---------------- DROPPING & BOARDING POINTS ---------------- */
  const droppingPoint: Point | undefined = useMemo(() => {
    if (!service || !booking || !schedule) return undefined;
    const points =
      schedule.direction === 'RETURN'
        ? service.droppingPointsReturn
        : service.droppingPointsForward;

    if (!points || points.length === 0) return undefined;

    const normalize = (s?: string) => s?.trim().toLowerCase();
    const targetSub = normalize(booking.droppingPoint);
    const targetMain = normalize(booking.droppingMain);

    return points.find(p => normalize(p.name) === targetSub)
        || points.find(p => normalize(p.name) === targetMain)
        || points.find(p => targetSub && normalize(p.name)?.includes(targetSub))
        || points[points.length - 1];
  }, [service, booking, schedule]);

  const boardingPoint: Point | undefined = useMemo(() => {
    if (!service || !booking || !schedule) return undefined;
    const points =
      schedule.direction === 'RETURN'
        ? service.boardingPointsReturn
        : service.boardingPointsForward;

    return points?.find(p => p.name === booking.boardingPoint);
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
    
    return allDroppingPoints.slice(closestPointIndex, destinationIndex);

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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-rose-50 selection:bg-rose-100 relative overflow-hidden">
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
        
        <div className="relative z-10 h-full w-full">
            <div className="bg-white/70 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-[100]">
              <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
                <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-rose-500 tracking-tight">Live Tracking</h1>
              </div>
            </div>

            <motion.div 
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
              }}
              className="max-w-6xl mx-auto px-4 py-8 space-y-8"
            >
              <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-black/5">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">{busDetails.travelsName}</h2>
                        <p className="text-indigo-600 font-bold uppercase tracking-wider text-sm mt-1">{busDetails.operator}</p>
                        <p className="text-xs text-gray-400 mt-3 font-medium uppercase tracking-wider">
                          Booking Ref: <span className="font-mono text-gray-600 ml-1">{id.substring(0, 8)}</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-start md:items-end gap-3">
                        <motion.div 
                            whileHover={{ scale: 1.05 }}
                            className="bg-gradient-to-r from-yellow-300 to-yellow-400 text-black font-mono text-base font-black px-4 py-2 rounded-xl border-2 border-black shadow-[0_0_15px_rgba(250,204,21,0.5)] flex items-center justify-center w-max"
                        >
                            {busDetails.busNumber}
                        </motion.div>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            onClick={() => router.push(`/track/${id}/console`)}
                            className="gap-2 bg-white/50 hover:bg-white/80 border-indigo-100 text-indigo-700 shadow-sm transition-all rounded-xl font-semibold h-11 px-6 text-base"
                          >
                            <Ticket className="w-4 h-4" />
                            <span className="hidden sm:inline">Passenger Console</span>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="destructive"
                                className="h-11 px-6 text-base rounded-xl font-bold shadow-md hover:shadow-lg transition-all gap-2"
                                disabled={!busDetails.contactNumber}
                              >
                                <Phone className="h-4 w-4" />
                                <span className="hidden sm:inline">Cabin Call</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-2xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                  <AlertCircle className="h-5 w-5 text-destructive" />
                                  Contact Bus Cabin?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  For emergencies only. This will call the bus cabin directly.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => window.open(`tel:${busDetails.contactNumber}`, '_self')}
                                  className="rounded-xl"
                                >
                                  Call Now
                                </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              </div>
            </div>
          </div>
          </CardContent>
        </Card>
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="lg:col-span-2">
            <div className="rounded-3xl overflow-hidden bg-white/80 backdrop-blur-md shadow-2xl shadow-indigo-500/10 border border-white ring-1 ring-black/5 relative group h-full flex flex-col">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-indigo-400/20 to-rose-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none blur-2xl"></div>
              
              <div className="border-b border-gray-100/80 px-6 py-4 flex justify-between items-center text-sm bg-white/50 relative z-10">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                  <span className="font-bold text-gray-700 tracking-wide">{locationName || "Fetching location..."}</span>
                </div>
                <span className="text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-full text-xs">
                  Updated: {liveLocation ? format(new Date(liveLocation.ts), "hh:mm a") : "--"}
                </span>
              </div>
              
              <div className="flex-1 bg-gray-50 relative z-0 min-h-[400px]">
                {isTrackingActive ? (
                  <LiveTrackingMap
                    liveLocation={liveLocation}
                    mapRouteData={mapRouteData}
                    activeSchedule={schedule}
                    destinationPoint={droppingPoint}
                    waypoints={waypoints}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-transparent to-indigo-50/30">
                      <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
                        <Navigation className="h-16 w-16 text-indigo-200 mx-auto mb-6 drop-shadow-md" />
                      </motion.div>
                      <h4 className="font-bold text-xl text-gray-700 mb-2">Tracking Inactive</h4>
                      <p className="text-sm font-medium text-gray-500 max-w-sm">Live tracking will begin when the trip starts.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          <div className="lg:col-span-1 space-y-6">
            {droppingPoint && (
              <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-black/5 bg-gradient-to-br from-blue-50/50 via-white/80 to-indigo-50/40">
                  <CardHeader className="bg-white/60 border-b border-gray-100/80 px-6 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-2xl shadow-sm">
                          <MapPin className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="text-xs uppercase font-extrabold tracking-wider text-blue-600 block">Your Drop-Off Stop</span>
                          <h3 className="text-xl font-black text-gray-900 tracking-tight">{droppingPoint.name}</h3>
                        </div>
                      </div>
                      {droppingPoint.time && busDetails && (
                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Scheduled</span>
                          <span className="font-mono font-bold text-sm text-gray-800">
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
                      )}
                    </div>
                    {droppingPoint.description && (
                      <p className="text-xs text-gray-500 font-medium mt-2">{droppingPoint.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="p-6">
                    {/* 3-Column Stats Grid: ETA, Time, Distance */}
                    <div className="grid grid-cols-3 gap-3 text-center">
                      {/* 1. ETA */}
                      <div className="p-3 rounded-2xl bg-white border border-gray-100/80 shadow-sm flex flex-col justify-between">
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider flex items-center justify-center gap-1 mb-1">
                          <CalendarClock className="w-4 h-4 text-indigo-500" /> ETA
                        </p>
                        <div>
                          <p className={cn("font-black text-lg sm:text-xl tracking-tight", getStatusColor(droppingRouteInfo?.delayInMinutes))}>
                            {droppingRouteInfo?.eta || (isTrackingActive ? '...' : '--:--')}
                          </p>
                          <p className={cn("text-[10px] font-semibold mt-0.5", getStatusColor(droppingRouteInfo?.delayInMinutes))}>
                            {isTrackingActive ? getStatusText(droppingRouteInfo?.delayInMinutes) : '(Tracking Inactive)'}
                          </p>
                        </div>
                      </div>

                      {/* 2. Time */}
                      <div className="p-3 rounded-2xl bg-white border border-gray-100/80 shadow-sm flex flex-col justify-between">
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider flex items-center justify-center gap-1 mb-1">
                          <Clock className="w-4 h-4 text-amber-500" /> Time
                        </p>
                        <div>
                          <p className={cn("font-black text-lg sm:text-xl tracking-tight", getStatusColor(droppingRouteInfo?.delayInMinutes))}>
                            {droppingRouteInfo?.duration || (isTrackingActive ? '...' : '-- min')}
                          </p>
                          <p className="text-[10px] font-medium text-gray-400 mt-0.5">
                            Remaining
                          </p>
                        </div>
                      </div>

                      {/* 3. Distance */}
                      <div className="p-3 rounded-2xl bg-white border border-gray-100/80 shadow-sm flex flex-col justify-between">
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider flex items-center justify-center gap-1 mb-1">
                          <Milestone className="w-4 h-4 text-blue-500" /> Distance
                        </p>
                        <div>
                          <p className="font-black text-lg sm:text-xl tracking-tight text-blue-600">
                            {droppingRouteInfo?.distance || (isTrackingActive ? '...' : '-- km')}
                          </p>
                          <p className="text-[10px] font-medium text-gray-400 mt-0.5">
                            To Drop Point
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-black/5">
                <CardHeader className="bg-white/50 border-b border-gray-100/80 px-6 py-5">
                  <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-3 tracking-tight">
                    <Navigation className="h-6 w-6 text-indigo-500" />
                    Journey Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                {busDetails && boardingPoint && droppingPoint ? (
                  <div className="relative pl-6 mt-2 space-y-8 pb-2">
                    {/* Timeline line */}
                    <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-gray-200"></div>
                    
                    {/* Boarding Point */}
                    <div className="relative">
                      <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-white shadow-sm z-10"></div>
                      <div>
                        <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">Boarding</p>
                        <h4 className="text-base font-bold text-gray-900">{boardingPoint.name}</h4>
                        {boardingPoint.description && <p className="text-sm text-gray-500 mt-1">{boardingPoint.description}</p>}
                        <div className="flex items-center gap-3 mt-2 text-sm text-gray-700">
                          <div className="flex items-center gap-1.5 bg-gray-100 px-2.5 py-1 rounded-md">
                            <Clock className="h-3.5 w-3.5 text-gray-500" />
                            <span className="font-semibold">{boardingPoint.time}</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-gray-100 px-2.5 py-1 rounded-md">
                            <Calendar className="h-3.5 w-3.5 text-gray-500" />
                            <span className="font-semibold">{format(new Date(schedule.date), 'MMM dd')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Dropping Point */}
                    <div className="relative">
                      <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-purple-500 border-4 border-white shadow-sm z-10"></div>
                      <div>
                        <p className="text-xs font-bold text-purple-600 uppercase tracking-widest mb-1">Dropping</p>
                        <h4 className="text-base font-bold text-gray-900">{droppingPoint.name}</h4>
                        {droppingPoint.description && <p className="text-sm text-gray-500 mt-1">{droppingPoint.description}</p>}
                        <div className="flex items-center gap-3 mt-2 text-sm text-gray-700">
                          <div className="flex items-center gap-1.5 bg-gray-100 px-2.5 py-1 rounded-md">
                            <Clock className="h-3.5 w-3.5 text-gray-500" />
                            <span className="font-semibold">{droppingPoint.time}</span>
                          </div>
                           <div className="flex items-center gap-1.5 bg-gray-100 px-2.5 py-1 rounded-md">
                            <Calendar className="h-3.5 w-3.5 text-gray-500" />
                            <span className="font-semibold">{format(new Date(schedule.date), 'MMM dd')}</span>
                          </div>
                        </div>
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
            </motion.div>

          </div>
        </div>
        
            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
              <div className="absolute w-0 h-0 overflow-hidden pointer-events-none opacity-0">
                {liveLocation && droppingPoint && schedule && busDetails && (
                  <RouteEtaCalculator
                    key={`dropping-calc-${booking.id}-${droppingPoint.name}`}
                    busId={busDetails.id}
                    startPoint={liveLocation}
                    destinationPoint={droppingPoint}
                    waypoints={waypoints}
                    onRouteInfoChange={setDroppingRouteInfo}
                    bookingDate={schedule.date}
                    scheduledTime={droppingPoint.time}
                    departureTime={busDetails.departureTime}
                    mapRouteData={mapRouteData}
                    activeSchedule={schedule}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
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