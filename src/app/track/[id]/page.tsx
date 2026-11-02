'use client';

import React, { useState, useEffect, useMemo, Suspense, use, useRef, useCallback } from 'react';
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
  Ticket,
  CheckCircle2,
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
import { usePassengerLocation } from '@/hooks/use-passenger-location';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { WelcomeAboardOverlay } from '@/components/welcome-aboard-overlay';

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
  const [isBoardedTransitionActive, setIsBoardedTransitionActive] = useState(false);


  const { isTrackingActive, liveLocation, locationName } = useLiveBusData(
    booking?.busId || null
  );

  const { coords: passengerCoords, error: locationError } = usePassengerLocation();

  const isPassengerPhase = !isTrackingActive && passengerCoords;

  const isBoarded = useMemo(() => {
    if (!schedule?.bookings || !booking) return false;
    const passengerSeat = booking.passengers?.[0]?.seatNumber;
    return schedule.bookings.some(
      (b: any) => b.bookingId === id && (!passengerSeat || b.seat === passengerSeat) && b.boarded
    );
  }, [schedule, booking, id]);

  const hasNavigatedToBoardedRef = useRef(false);
  const scheduleUnsubRef = useRef<(() => void) | null>(null);
  const prevBoardedRef = useRef<boolean | null>(null);

  const isCurrentlyOnTrack1Page = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const currentPath = window.location.pathname.replace(/\/+$/, '');
    const expectedPath = `/track/${id}`.replace(/\/+$/, '');
    return currentPath === expectedPath;
  }, [id]);

  useEffect(() => {
    let isCleanedUp = false;

    async function fetchAndListen() {
      if (!id || isCleanedUp || !isCurrentlyOnTrack1Page()) {
        if (!id) {
          setError("Booking ID is missing.");
          setLoading(false);
        }
        return;
      }
      
      setLoading(true);
      try {
        const bookingData = await dataService.getPublicBookingById(id);
        if (isCleanedUp || !isCurrentlyOnTrack1Page()) return;

        if (!bookingData) {
          setError("Booking not found.");
          setLoading(false);
          return;
        }
        setBooking(bookingData);

        const busData = await dataService.getBusById(bookingData.busId);
        if (isCleanedUp || !isCurrentlyOnTrack1Page()) return;
        setBusDetails(busData || (bookingData.busDetails as BusType));
        
        if (busData?.serviceId) {
            const serviceData = await dataService.getServiceById(busData.serviceId);
            if (isCleanedUp || !isCurrentlyOnTrack1Page()) return;
            setService(serviceData);
        }

        if (!bookingData.scheduleId) {
            setError("Schedule information is missing from the booking.");
            setLoading(false);
            return;
        }

        if (scheduleUnsubRef.current) {
          scheduleUnsubRef.current();
          scheduleUnsubRef.current = null;
        }

        if (isCleanedUp || !isCurrentlyOnTrack1Page()) return;

        const unsub = dataService.onScheduleSnapshot(bookingData.scheduleId, (scheduleData) => {
          if (isCleanedUp || hasNavigatedToBoardedRef.current || !isCurrentlyOnTrack1Page()) {
            if (scheduleUnsubRef.current) {
              scheduleUnsubRef.current();
              scheduleUnsubRef.current = null;
            }
            return;
          }

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
                hasNavigatedToBoardedRef.current = true;
                if (scheduleUnsubRef.current) {
                  scheduleUnsubRef.current();
                  scheduleUnsubRef.current = null;
                }
                if (isCurrentlyOnTrack1Page()) {
                  router.replace(`/track/finished?bookingId=${id}`);
                }
                return;
            }

            const isCurrentlyBoarded = Boolean(bookingInSchedule?.boarded);
            const storageKey = `bushive_welcome_shown_${id}`;
            const alreadyShown = 
              typeof window !== 'undefined' && 
              (localStorage.getItem(storageKey) === 'true' || sessionStorage.getItem(storageKey) === 'true');

            // Establish baseline boarding status on initial snapshot load
            if (prevBoardedRef.current === null) {
              prevBoardedRef.current = isCurrentlyBoarded;
              // If already boarded when first opening the page, mark as already shown so it NEVER auto-redirects
              if (isCurrentlyBoarded && typeof window !== 'undefined') {
                try {
                  localStorage.setItem(storageKey, 'true');
                  sessionStorage.setItem(storageKey, 'true');
                  localStorage.setItem(`boarded_${id}`, 'true');
                } catch (e) {}
              }
              setLoading(false);
              return;
            }

            // ONLY redirect when the cabin crew actively marks the passenger as boarded in real time
            // Transition MUST be from explicit false -> true, NOT already shown, and user is actively on /track/[id]
            const justMarkedBoarded = prevBoardedRef.current === false && isCurrentlyBoarded === true;
            prevBoardedRef.current = isCurrentlyBoarded;

            if (justMarkedBoarded && !alreadyShown && !hasNavigatedToBoardedRef.current && !isBoardedTransitionActive && isCurrentlyOnTrack1Page()) {
              try {
                sessionStorage.setItem(storageKey, 'true');
                localStorage.setItem(storageKey, 'true');
                localStorage.setItem(`boarded_${id}`, 'true');
              } catch (e) {}
              setIsBoardedTransitionActive(true);
              return;
            }


          } else {
            console.warn("Could not find the schedule for this trip.");
          }
          setLoading(false);
        });

        scheduleUnsubRef.current = unsub;
        if (isCleanedUp || !isCurrentlyOnTrack1Page()) {
          unsub();
          scheduleUnsubRef.current = null;
        }

      } catch (err: any) {
        if (!isCleanedUp && isCurrentlyOnTrack1Page()) {
          console.error("Failed to fetch tracking details:", err);
          setError(err.message || "An unexpected error occurred.");
          setLoading(false);
        }
      }
    }

    fetchAndListen();

    return () => {
      isCleanedUp = true;
      if (scheduleUnsubRef.current) {
        scheduleUnsubRef.current();
        scheduleUnsubRef.current = null;
      }
    };
  }, [id, router, isCurrentlyOnTrack1Page]);

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

    return allBoardingPoints.slice(closestPointIndex, destinationIndex);
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
  <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-rose-50 selection:bg-rose-100 relative overflow-hidden">
      {/* ─── Celebratory Welcome Aboard Transition ─── */}
      <AnimatePresence>
        {isBoardedTransitionActive && (
          <WelcomeAboardOverlay
            passengerName={booking?.passengers?.[0]?.name}
            seatNumber={booking?.passengers?.[0]?.seatNumber}
            busName={busDetails?.travelsName}
            destination={booking?.droppingPoint || booking?.droppingMain}
            durationSeconds={3}
            onComplete={() => {
              hasNavigatedToBoardedRef.current = true;
              setIsBoardedTransitionActive(false);
              if (scheduleUnsubRef.current) {
                scheduleUnsubRef.current();
                scheduleUnsubRef.current = null;
              }
              router.push(`/track/${id}/boarded`);
            }}
            onGoToConsole={() => {
              hasNavigatedToBoardedRef.current = true;
              setIsBoardedTransitionActive(false);
              router.push(`/track/${id}/console`);
            }}
            onGoToTracking={() => {
              hasNavigatedToBoardedRef.current = true;
              setIsBoardedTransitionActive(false);
              router.push(`/track/${id}/boarded`);
            }}
          />
        )}
      </AnimatePresence>
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
      <AlertDialog open={showBroadcast} onOpenChange={setShowBroadcast}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <div className="flex justify-center mb-4">
              <div className="bg-destructive/10 text-destructive rounded-full p-4">
                <MessageSquareWarning className="w-12 h-12" />
              </div>
            </div>
            <AlertDialogTitle className="text-2xl text-center">
              Important Update from Crew
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base pt-2 whitespace-pre-wrap text-left">
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
              <div className="flex items-center gap-3 mt-3 text-gray-700 font-semibold bg-gray-50/50 inline-flex px-4 py-2 rounded-xl border border-gray-100">
                <span>{schedule?.direction === 'RETURN' ? busDetails.destination : busDetails.origin}</span>
                <ArrowRight className="h-4 w-4 text-gray-400" />
                <span>{schedule?.direction === 'RETURN' ? busDetails.origin : busDetails.destination}</span>
              </div>
              <p className="text-xs text-gray-400 mt-3 font-medium uppercase tracking-wider">
                Booking Ref: <span className="font-mono text-gray-600 ml-1">{id.substring(0, 8)}</span>
              </p>
              {isBoarded && !isBoardedTransitionActive && (
                <div className="mt-3.5 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold">You are marked as boarded on this trip.</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => router.push(`/track/${id}/console`)}
                      variant="outline"
                      className="border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-bold rounded-xl h-8 px-3 text-xs"
                    >
                      Passenger Console
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/track/${id}/boarded`)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl h-8 px-3 text-xs shadow-sm"
                    >
                      View Phase 2 Tracking
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
                <motion.div 
                    whileHover={{ scale: 1.05 }}
                    className="bg-gradient-to-r from-yellow-300 to-yellow-400 text-black font-mono text-base font-black px-4 py-2 rounded-xl border-2 border-black shadow-[0_0_15px_rgba(250,204,21,0.5)] flex items-center justify-center"
                >
                    {busDetails.busNumber}
                </motion.div>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="h-11 px-6 text-base rounded-xl font-bold shadow-md hover:shadow-lg transition-all" disabled={!busDetails.contactNumber}>
                            <Phone className="h-4 w-4 mr-2" />
                            Call Cabin
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle>Contact Bus Cabin?</AlertDialogTitle>
                            <AlertDialogDescription>For emergencies only. This will call the bus cabin directly.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction asChild className="rounded-xl">
                                <a href={`tel:${busDetails.contactNumber}`}>Call Now</a>
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
      </motion.div>
      <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
      <div className="rounded-3xl overflow-hidden bg-white/80 backdrop-blur-md shadow-2xl shadow-indigo-500/10 border border-white ring-1 ring-black/5 relative group">
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
        <div className="h-[500px] bg-gray-50 relative z-0">
          {locationError && !isTrackingActive && (
            <div className="absolute top-4 left-4 right-4 z-[400]">
                <Alert variant="destructive" className="bg-white/90 backdrop-blur-md border-0 shadow-lg rounded-2xl">
                    <AlertCircle className="w-5 h-5" />
                    <AlertTitle className="font-bold">Location Access Needed</AlertTitle>
                    <AlertDescription className="font-medium">{locationError}. Please enable location to see route to boarding point.</AlertDescription>
                </Alert>
            </div>
          )}
          {isTrackingActive || isPassengerPhase ? (
            <LiveTrackingMap
                liveLocation={isTrackingActive ? liveLocation : null}
                passengerLocation={passengerCoords}
                mapRouteData={mapRouteData}
                activeSchedule={schedule}
                destinationPoint={boardingPoint}
                waypoints={isTrackingActive ? waypointsToBoarding : []}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-gradient-to-b from-transparent to-indigo-50/30">
              <motion.div
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Navigation className="h-16 w-16 text-indigo-200 mx-auto mb-6 drop-shadow-md" />
              </motion.div>
              <h3 className="text-xl font-bold text-gray-700 mb-2">Waiting for tracking to start</h3>
              <p className="text-sm font-medium text-gray-500 max-w-sm">Enable location to see your route to boarding point.</p>
            </div>
          )}
        </div>
      </div>
      </motion.div>
      
      <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
       <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-black/5">
        <CardHeader className="bg-white/50 border-b border-gray-100/80 px-6 py-5">
            <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-3 tracking-tight">
                <CalendarClock className="h-6 w-6 text-indigo-500" />
                {isPassengerPhase ? 'Your Route to Boarding Point' : 'Bus Arrival Status'}
            </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center p-6 bg-gradient-to-b from-white/50 to-transparent">
             <motion.div whileHover={{ scale: 1.02 }} className="p-4 rounded-2xl bg-white shadow-sm border border-gray-50">
                <p className="text-xs text-indigo-500 font-bold uppercase tracking-widest mb-2 flex items-center justify-center">
                    ETA
                </p>
                <p className={cn('text-3xl font-black text-gray-800 tracking-tight', getStatusColor(boardingRouteInfo?.delayInMinutes))}>{boardingRouteInfo?.eta || '--:--'}</p>
                {!isPassengerPhase && <p className={cn('text-sm font-bold mt-1', getStatusColor(boardingRouteInfo?.delayInMinutes))}>{getStatusText(boardingRouteInfo?.delayInMinutes)}</p>}
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} className="p-4 rounded-2xl bg-white shadow-sm border border-gray-50">
                <p className="text-xs text-indigo-500 font-bold uppercase tracking-widest mb-2 flex items-center justify-center gap-1">
                    <Clock className="w-4 h-4"/> {isPassengerPhase ? 'Time to Reach' : 'Time Left'}</p>
                <p className={cn('text-3xl font-black text-gray-800 tracking-tight', getStatusColor(boardingRouteInfo?.delayInMinutes))}>{boardingRouteInfo?.duration || '-- min'}</p>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} className="p-4 rounded-2xl bg-white shadow-sm border border-gray-50">
                <p className="text-xs text-indigo-500 font-bold uppercase tracking-widest mb-2 flex items-center justify-center gap-1">
                    <Milestone className="w-4 h-4"/> Distance</p>
                <p className="text-3xl font-black text-gray-800 tracking-tight">{boardingRouteInfo?.distance || '-- km'}</p>
            </motion.div>
        </CardContent>
       </Card>
      </motion.div>

      <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
      <div className="relative border-0 shadow-xl rounded-3xl p-8 bg-white overflow-hidden ring-1 ring-black/5">
        {/* Ticket stub cutouts */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-indigo-50/50 rounded-full border-r border-gray-200"></div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 bg-rose-50/50 rounded-full border-l border-gray-200"></div>
        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 border-t-[3px] border-dotted border-gray-200"></div>
        
        <div className="space-y-10 relative z-10">
            <div className="text-center">
                <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-2">Boarding Point</p>
                <h3 className="text-3xl font-black text-red-600 tracking-tight">
                {boardingPoint?.name}
                </h3>
                {boardingPoint?.description && (
                <p className="text-gray-500 font-medium text-sm mt-3 max-w-md mx-auto">
                    {boardingPoint.description}
                </p>
                )}
            </div>
            
            <div className="flex justify-around items-center pt-6">
            <div className="text-center">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1 flex items-center justify-center gap-1">Date</p>
                <p className="text-xl font-black text-gray-800 tracking-tight">
                {schedule ? format(new Date(schedule.date), "MMM dd, yyyy") : '--'}
                </p>
            </div>
            <div className="text-center">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1 flex items-center justify-center gap-1">Time</p>
                <p className="text-xl font-black text-gray-800 tracking-tight">
                {boardingPoint?.time || '--:--'}
                </p>
            </div>
            </div>
        </div>
      </div>
      </motion.div>
      <div className="absolute w-0 h-0 overflow-hidden pointer-events-none opacity-0">
        {(isTrackingActive || isPassengerPhase) && boardingPoint && schedule && busDetails && boardingPoint.time && busDetails.departureTime && (
          <RouteEtaCalculator
            busId={busDetails.id}
            key={`boarding-calc-${booking.id}-${isPassengerPhase ? 'passenger' : 'bus'}`}
            startPoint={isTrackingActive ? liveLocation! : passengerCoords!}
            destinationPoint={boardingPoint}
            waypoints={isTrackingActive ? waypointsToBoarding : []}
            onRouteInfoChange={setBoardingRouteInfo}
            bookingDate={schedule.date}
            scheduledTime={boardingPoint.time}
            departureTime={busDetails.departureTime}
          />
        )}
      </div>
    </motion.div>
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