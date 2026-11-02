'use client';

import React, { useState, useEffect, useMemo, use, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { BellRing, ChevronLeft, Clock, AlertCircle, Check, Bell } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFirebase } from '@/firebase';
import type { Booking, Bus, Point, Schedule } from '@/lib/types';
import { dataService } from '@/lib/data/client-service';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Frown } from 'lucide-react';
import { addMinutes, subMinutes, format as fnsFormat } from 'date-fns';
import { useLiveBusData } from '@/hooks/use-live-bus-data';
import dynamic from 'next/dynamic';

const RouteEtaCalculator = dynamic(() => import('@/components/RouteEtaCalculator'), { ssr: false });

const presetMinutes = [15, 30, 45, 60];

type RouteInfo = {
  distance: string;
  duration: string;
  eta: string;
  etaDate: Date;
  delayInMinutes: number;
  locationName: string | null;
  durationMinutes: number;
};

function SetAlarmPageContent({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const fromCrew = searchParams.get('from') === 'crew';
  const { user, isUserLoading } = useFirebase();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [bus, setBus] = useState<Bus | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totalMinutes, setTotalMinutes] = useState(15);
  const [isAlarmOn, setIsAlarmOn] = useState(true);
  const [customHours, setCustomHours] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const soundInitialized = useRef(false);
  const alarmTriggeredRef = useRef(false);
  const [isArrivalModalOpen, setIsArrivalModalOpen] = useState(false);
  
  const { liveLocation } = useLiveBusData(bus?.id || null);
  
  const initializeSound = useCallback(() => {
    if (!soundInitialized.current && audioRef.current) {
        const audio = audioRef.current;
        audio.muted = true;
        audio.play().then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
            soundInitialized.current = true;
        }).catch(e => {
            console.warn("Could not initialize sound automatically:", e);
            setIsAlarmOn(false); // Can't play sound, so disable alarm toggle
        });
    }
  }, []);

  useEffect(() => {
    async function fetchDetails() {
      if (isUserLoading || !id) return;
      
      try {
        if (fromCrew) {
            const scheduleData = await dataService.getSchedule(id);
            if(scheduleData) {
                setSchedule(scheduleData);
                const busData = await dataService.getBusById(scheduleData.busId);
                setBus(busData);
            } else {
                setError('Schedule not found for crew.');
            }
        } else {
            if (!user) {
              setError('You must be logged in to set an alarm.');
              setIsLoading(false);
              return;
            }
            const bookingData = await dataService.getBookingById(user.uid, id);
            if (bookingData) {
              setBooking(bookingData);
              setSchedule(await dataService.getSchedule(bookingData.scheduleId));
              const busDetails = await dataService.getBusById(bookingData.busId);
              setBus(busDetails || (bookingData.busDetails as Bus));
            } else {
              setError('Booking not found.');
            }
        }
      } catch (error) {
        setError('Failed to fetch trip details.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchDetails();
  }, [id, user, isUserLoading, fromCrew]);

  const fullDroppingPoint: Point | undefined = useMemo(() => {
    if (!bus) return undefined;
    const isReturn = schedule?.direction === 'RETURN';
    const allPoints = isReturn
      ? [...(bus.boardingPointsReturn || []), ...(bus.droppingPointsReturn || [])]
      : [...(bus.boardingPointsForward || []), ...(bus.droppingPointsForward || [])];

    if (fromCrew) {
        // For crew, the "dropping point" is the final destination of the bus
        const droppingPoints = isReturn ? bus.droppingPointsReturn : bus.droppingPointsForward;
        return droppingPoints?.[droppingPoints.length - 1];
    }
    
    if (booking) {
        return allPoints.find((p) => p.name === booking.droppingPoint);
    }

    return undefined;
  }, [booking, bus, fromCrew, schedule]);

  useEffect(() => {
    if (!id) return;
    const key = `alarm_${id}`;
    const savedSettings = localStorage.getItem(key);
    if (savedSettings) {
      const { hours, minutes, off } = JSON.parse(savedSettings);
      const savedTotalMinutes = (hours || 0) * 60 + (minutes || 0);

      setTotalMinutes(savedTotalMinutes || 15);
      setIsAlarmOn(!off);

      if (!presetMinutes.includes(savedTotalMinutes)) {
        if (hours > 0) setCustomHours(String(hours));
        if (minutes > 0) setCustomMinutes(String(minutes));
      }
    } else {
      // Default state
      setTotalMinutes(15);
      setIsAlarmOn(true);
    }
  }, [id]);

  const saveAlarm = () => {
    if (!id) return;

    let finalMinutes = 0;
    const hoursNum = parseInt(customHours, 10) || 0;
    const minutesNum = parseInt(customMinutes, 10) || 0;

    if (customHours || customMinutes) {
      finalMinutes = hoursNum * 60 + minutesNum;
    } else {
      finalMinutes = totalMinutes;
    }

    if (isAlarmOn && (isNaN(finalMinutes) || finalMinutes <= 0)) {
      toast({
        title: 'Invalid Time',
        description: 'Please enter a valid time for the alarm.',
        variant: 'destructive',
      });
      return;
    }

    const hours = isAlarmOn ? Math.floor(finalMinutes / 60) : 0;
    const minutes = isAlarmOn ? finalMinutes % 60 : 0;

    const newSettings = { hours, minutes, off: !isAlarmOn };
    localStorage.setItem(`alarm_${id}`, JSON.stringify(newSettings));
    if (!fromCrew) {
        localStorage.setItem('alarmHasBeenSet', 'true'); // Keep this for the initial dialog logic
    }

    toast({
      title: 'Alarm Settings Saved',
      description: isAlarmOn ? `Alarm set for ${hours > 0 ? `${hours}h ` : ''}${minutes > 0 ? `${minutes}min ` : ''}before arrival.` : 'Alarm has been turned off.',
    });
    router.push(`/track/${id}/console`);
  };

  const formatMinutes = (mins: number) => {
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    const remainingMinutes = mins % 60;
    return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}min` : ''}`;
  };

  const handleCustomInputChange = () => {
    setTotalMinutes(0);
  };

  const handlePresetClick = (mins: number) => {
    setTotalMinutes(mins);
    setCustomHours('');
    setCustomMinutes('');
  };

  const alarmRingTime = useMemo(() => {
    if (!isAlarmOn || !routeInfo || !routeInfo.etaDate) return null;
    let finalMinutes = 0;
    if (customHours || customMinutes) {
      finalMinutes = (parseInt(customHours, 10) || 0) * 60 + (parseInt(customMinutes, 10) || 0);
    } else {
      finalMinutes = totalMinutes;
    }
    if (finalMinutes > 0) {
      return subMinutes(routeInfo.etaDate, finalMinutes);
    }
    return null;
  }, [isAlarmOn, routeInfo, customHours, customMinutes, totalMinutes]);

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
  
  const handleDismissAlarmModal = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsArrivalModalOpen(false);
  };

  useEffect(() => {
    if (
      !alarmTriggeredRef.current &&
      isAlarmOn &&
      soundInitialized.current &&
      routeInfo &&
      routeInfo.durationMinutes <= totalMinutes
    ) {
      audioRef.current?.play().catch(e => console.error("Audio play failed:", e));
      setIsArrivalModalOpen(true);
      alarmTriggeredRef.current = true;
    }
  }, [routeInfo, isAlarmOn, fullDroppingPoint, totalMinutes]);

  if (isLoading || isUserLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-96 w-full max-w-md mx-auto" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <Frown className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex justify-center items-center bg-muted/40 p-4">
      <audio ref={audioRef} src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" preload="auto" muted />
      <Card className="w-full max-w-md mx-auto shadow-lg rounded-xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push(`/track/${id}/console`)}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center space-x-3">
                <div className="bg-destructive/10 text-destructive rounded-full p-2">
                  <BellRing className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl font-semibold">Arrival Alarm</CardTitle>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="alarm-switch" className="text-sm font-medium">
                {isAlarmOn ? 'ON' : 'OFF'}
              </Label>
              <Switch id="alarm-switch" checked={isAlarmOn} onCheckedChange={(checked) => { initializeSound(); setIsAlarmOn(checked); }} aria-label="Toggle alarm" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="text-center rounded-lg border p-4 bg-blue-50/50 border-blue-200">
            <p className="text-sm text-blue-800 font-semibold">Estimated Time of Arrival (ETA)</p>
            <p className={cn('text-2xl font-bold', getStatusColor(routeInfo?.delayInMinutes))}>
              {routeInfo ? routeInfo.eta : 'Calculating...'}
              <span className="text-sm font-medium ml-2">{routeInfo ? getStatusText(routeInfo.delayInMinutes) : ''}</span>
            </p>
            <p className="text-xs text-blue-500">({routeInfo ? routeInfo.duration : '...'} remaining)</p>
          </div>

          <div className={cn('space-y-6 transition-opacity', !isAlarmOn && 'opacity-50 pointer-events-none')}>
            <div>
              <p className="font-medium text-sm text-center text-muted-foreground mb-4">Notify me before arrival by:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {presetMinutes.map((mins) => (
                  <Button
                    key={mins}
                    variant={totalMinutes === mins ? 'default' : 'outline'}
                    onClick={() => handlePresetClick(mins)}
                    className={cn(
                      'py-6 text-lg font-semibold transition-all duration-200',
                      totalMinutes === mins ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''
                    )}
                  >
                    {formatMinutes(mins)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">OR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-center block">Enter custom time</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="custom-hours"
                    type="number"
                    placeholder="Hours"
                    value={customHours}
                    onChange={(e) => {
                      setCustomHours(e.target.value);
                      handleCustomInputChange();
                    }}
                    className="pl-10 text-center text-lg h-12"
                  />
                </div>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="custom-minutes"
                    type="number"
                    placeholder="Minutes"
                    value={customMinutes}
                    onChange={(e) => {
                      setCustomMinutes(e.target.value);
                      handleCustomInputChange();
                    }}
                    className="pl-10 text-center text-lg h-12"
                  />
                </div>
              </div>
            </div>
            {alarmRingTime && (
              <div className="text-center rounded-lg border p-3 bg-green-50/50 border-green-200">
                <p className="text-sm font-semibold text-green-800">Alarm will ring at approx.</p>
                <p className="text-lg font-bold text-green-600">{fnsFormat(alarmRingTime, 'p')}</p>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter>
          <Button onClick={saveAlarm} className="w-full">
            Save Settings
          </Button>
        </CardFooter>
      </Card>
      <div className="absolute w-0 h-0 overflow-hidden pointer-events-none opacity-0">
        {bus && schedule && fullDroppingPoint && liveLocation && fullDroppingPoint.time && bus.departureTime && (
          <RouteEtaCalculator
            busId={bus.id}
            startPoint={liveLocation}
            destinationPoint={fullDroppingPoint}
            onRouteInfoChange={setRouteInfo}
            bookingDate={schedule.date}
            scheduledTime={fullDroppingPoint.time}
            departureTime={bus.departureTime}
          />
        )}
      </div>
      {/* High Priority Dropping Point Arrival Modal */}
      {isArrivalModalOpen && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={handleDismissAlarmModal}
        >
          <div 
            className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border-4 border-emerald-500 overflow-hidden text-gray-900 dark:text-zinc-100 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-6 text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner animate-bounce">
                  <Bell className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold bg-white/25 px-2.5 py-0.5 rounded-full animate-pulse">
                      High Priority Notice
                    </span>
                    <span className="text-xs text-emerald-100 font-bold">
                      Approaching Stop
                    </span>
                  </div>
                  <h2 className="text-2xl font-headline font-black tracking-tight text-white mt-1">
                    {fullDroppingPoint?.name || 'Your Drop-off Stop'}
                  </h2>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <p className="font-headline font-black text-xl text-emerald-950 dark:text-emerald-100 leading-snug">
                  Arriving at {fullDroppingPoint?.name} in approximately {totalMinutes} minutes!
                </p>
                <p className="text-sm text-emerald-800 dark:text-emerald-200 font-semibold mt-1.5">
                  Please gather your luggage and personal belongings to prepare for deboarding.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-500 font-semibold block">Scheduled Drop-off Point</span>
                  <span className="font-black text-lg text-gray-900 dark:text-white">
                    {fullDroppingPoint?.name}
                  </span>
                </div>
                <div className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-3 py-1.5 rounded-xl font-bold text-xs">
                  {routeInfo?.duration || `${totalMinutes} min`} away
                </div>
              </div>

              <p className="text-xs text-gray-500 font-medium">
                Tap the button below to turn off the alarm sound and acknowledge your upcoming arrival.
              </p>
            </div>

            {/* Footer */}
            <div className="p-5 bg-gray-50 dark:bg-zinc-900/60 border-t border-gray-100 dark:border-zinc-800">
              <Button
                size="lg"
                onClick={handleDismissAlarmModal}
                className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:opacity-95 text-white font-headline font-black rounded-2xl h-14 text-base shadow-lg shadow-emerald-600/25 transition-all"
              >
                <Check className="w-5 h-5 mr-2" />
                <span>OK, Turn Off Alarm</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AlarmPageWrapper({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    return <SetAlarmPageContent id={resolvedParams.id} />;
}