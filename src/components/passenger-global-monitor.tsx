'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import type { Booking, Schedule, StopRequest, RestStop, Bus as BusType } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ShieldAlert, 
  Sparkles, 
  CheckCircle2, 
  Loader2, 
  Clock,
  Bell,
  BellRing,
  Coffee,
  MapPin,
  Check,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function analyzeCrewResponse(message: string, requestType: 'washroom' | 'vomiting') {
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

export function PassengerGlobalMonitor() {
  const pathname = usePathname();
  const { user } = useFirebase();
  const { toast } = useToast();

  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [bus, setBus] = useState<BusType | null>(null);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const previousRespondedIdRef = useRef<string | null>(null);

  // Subscribed rest stops and alerts state
  const [subscribedStopIds, setSubscribedStopIds] = useState<Set<string>>(new Set());
  const [activeRestStopArrival, setActiveRestStopArrival] = useState<{
    stopId: string;
    stopName: string;
    location: string;
    duration: number;
    type?: string;
    amenities?: string[];
  } | null>(null);

  const [notifyActivatedCard, setNotifyActivatedCard] = useState<{
    stopId: string;
    stopName: string;
    location: string;
    duration?: number;
    type?: string;
    amenities?: string[];
    eta?: string;
    remainingTime?: string;
  } | null>(null);

  const prevStopStatusesRef = useRef<Record<string, string>>({});
  const playedArrivalChimeRef = useRef<Set<string>>(new Set());

  // Pleasant audio chime when notification is activated
  const playNotificationChime = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  }, []);

  // Attention alarm chime when rest stop arrives
  const playArrivalAlarm = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') ctx.resume();
      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.35, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      playTone(523.25, 0, 0.3);
      playTone(783.99, 0.22, 0.3);
      playTone(1046.50, 0.44, 0.5);
    } catch (e) {}
  }, []);

  // 1. Determine active booking ID from URL or Storage
  useEffect(() => {
    if (pathname.startsWith('/cabin-crew') || pathname.startsWith('/admin')) {
      return;
    }

    const urlMatch = pathname.match(/\/(?:track|confirmation)\/([a-zA-Z0-9_-]+)/);
    if (urlMatch && urlMatch[1] && urlMatch[1] !== 'finished') {
      const extractedId = urlMatch[1];
      setActiveBookingId(extractedId);
      try {
        sessionStorage.setItem('bushive_passenger_active_booking_id', extractedId);
        localStorage.setItem('bushive_passenger_active_booking_id', extractedId);
      } catch (e) {}
      return;
    }

    try {
      const stored = 
        sessionStorage.getItem('bushive_passenger_active_booking_id') || 
        localStorage.getItem('bushive_passenger_active_booking_id');
      if (stored) {
        setActiveBookingId(stored);
      }
    } catch (e) {}
  }, [pathname]);

  // 2. Listen to public booking snapshot
  useEffect(() => {
    if (!activeBookingId) {
      setBooking(null);
      return;
    }

    const unsubBooking = dataService.onPublicBookingSnapshot(activeBookingId, (bookingData) => {
      setBooking(bookingData || null);
    });

    return () => unsubBooking();
  }, [activeBookingId]);

  // 3. Listen to active schedule snapshot
  useEffect(() => {
    if (!booking?.scheduleId) {
      setSchedule(null);
      return;
    }

    const unsubSchedule = dataService.onScheduleSnapshot(booking.scheduleId, (scheduleData) => {
      setSchedule(scheduleData || null);
    });

    return () => unsubSchedule();
  }, [booking?.scheduleId]);

  // 4. Fetch Bus details for rest stops in real time
  const busIdToListen = schedule?.actualBusId || schedule?.busId || booking?.busId;

  useEffect(() => {
    if (!busIdToListen) {
      setBus(null);
      return;
    }

    const unsubBus = dataService.onBusSnapshot(busIdToListen, (busData) => {
      setBus(busData || null);
    });

    return () => unsubBus();
  }, [busIdToListen]);

  const isReturn = useMemo(() => {
    if (schedule?.direction) return schedule.direction === 'RETURN';
    if (schedule?.id && schedule.id.includes('_RETURN')) return true;
    if (booking?.scheduleDirection) return booking.scheduleDirection === 'RETURN';
    if (booking?.scheduleId && booking.scheduleId.includes('_RETURN')) return true;
    return false;
  }, [schedule?.direction, schedule?.id, booking?.scheduleDirection, booking?.scheduleId]);

  const allRestStops: RestStop[] = useMemo(() => {
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

  // 5. Sync subscriptions from localStorage
  const syncSubscribedStops = useCallback(() => {
    if (!activeBookingId) return;
    try {
      const raw = localStorage.getItem(`notifyme_${activeBookingId}`);
      if (raw) {
        setSubscribedStopIds(new Set(JSON.parse(raw)));
      } else {
        setSubscribedStopIds(new Set());
      }
    } catch (e) {}
  }, [activeBookingId]);

  useEffect(() => {
    syncSubscribedStops();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === `notifyme_${activeBookingId}`) {
        syncSubscribedStops();
      }
    };

    const handleCustomSync = () => syncSubscribedStops();

    const handleNotifyCard = (e: any) => {
      if (e.detail) {
        setNotifyActivatedCard(e.detail);
        playNotificationChime();
        syncSubscribedStops();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('bushive:rest_stop_subscription_changed', handleCustomSync);
    window.addEventListener('bushive:rest_stop_notify_card', handleNotifyCard);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('bushive:rest_stop_subscription_changed', handleCustomSync);
      window.removeEventListener('bushive:rest_stop_notify_card', handleNotifyCard);
    };
  }, [activeBookingId, syncSubscribedStops, playNotificationChime]);

  // 6. Monitor Schedule Rest Stop Arrivals for Subscribed Stops
  useEffect(() => {
    if (!schedule || !allRestStops.length || subscribedStopIds.size === 0) return;

    const stopStatuses = schedule.stopStatuses || {};

    allRestStops.forEach(stop => {
      if (!subscribedStopIds.has(stop.id)) return;

      const currentStatus = stopStatuses[stop.id]?.status || 'upcoming';

      const dismissedKey = `bushive_dismissed_arrival_${activeBookingId}_${stop.id}`;
      let isDismissed = false;
      try {
        isDismissed = sessionStorage.getItem(dismissedKey) === 'true';
      } catch (e) {}

      if (currentStatus === 'arrived' && !isDismissed) {
        setActiveRestStopArrival({
          stopId: stop.id,
          stopName: stop.name,
          location: stop.location,
          duration: stop.duration,
          type: stop.type,
          amenities: stop.amenities || []
        });

        if (!playedArrivalChimeRef.current.has(stop.id)) {
          playedArrivalChimeRef.current.add(stop.id);
          playArrivalAlarm();
        }
      }

      prevStopStatusesRef.current[stop.id] = currentStatus;
    });
  }, [schedule, allRestStops, subscribedStopIds, activeBookingId, playArrivalAlarm]);

  const handleDismissRestStopArrival = () => {
    if (activeRestStopArrival && activeBookingId) {
      try {
        sessionStorage.setItem(`bushive_dismissed_arrival_${activeBookingId}_${activeRestStopArrival.stopId}`, 'true');
      } catch (e) {}
    }
    setActiveRestStopArrival(null);
  };

  // 7. Derive seat number and latest request for cabin crew halt responses
  const primarySeat = useMemo(() => {
    if (booking?.passengers && booking.passengers.length > 0) {
      return booking.passengers.map(p => p.seatNumber).filter(Boolean).join(', ') || 'Seat';
    }
    return (booking as any)?.seatNumber || 'Seat';
  }, [booking]);

  const myStopRequests = useMemo(() => {
    if (!schedule?.stopRequests || !booking) return [];
    return schedule.stopRequests.filter((r: StopRequest) => 
      r.bookingId === booking.id || 
      (primarySeat !== 'Seat' && r.seatNumber === primarySeat)
    );
  }, [schedule?.stopRequests, booking, primarySeat]);

  const latestRequest = useMemo(() => {
    if (myStopRequests.length === 0) return null;
    return myStopRequests[myStopRequests.length - 1];
  }, [myStopRequests]);

  const isResponded = Boolean(
    latestRequest && 
    latestRequest.status === 'responded' && 
    !latestRequest.acknowledgedByPassenger
  );

  // Play chime sound when response arrives from cabin crew
  useEffect(() => {
    if (isResponded && latestRequest && previousRespondedIdRef.current !== latestRequest.id) {
      previousRespondedIdRef.current = latestRequest.id;
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          if (ctx.state === 'suspended') ctx.resume();
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

  // Handle Acknowledge for crew response
  const handleAcknowledgeResponse = async () => {
    if (!booking?.scheduleId || !latestRequest || isAcknowledging) return;
    setIsAcknowledging(true);
    try {
      await dataService.acknowledgeStopRequest(booking.scheduleId, latestRequest.id);
      toast({
        title: 'Acknowledged',
        description: 'Thank you. You can request again whenever needed.',
      });
    } catch (err: any) {
      console.error('Error acknowledging response:', err);
      toast({
        title: 'Error acknowledging response',
        description: err.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsAcknowledging(false);
    }
  };

  // Don't show in crew or admin pages
  if (pathname.startsWith('/cabin-crew') || pathname.startsWith('/admin')) {
    return null;
  }

  const analysis = latestRequest ? analyzeCrewResponse(latestRequest.responseMessage || '', latestRequest.type) : null;

  return (
    <>
      {/* ─── 1. REST STOP NOTIFICATION SET CARD (CONFIRMATION WITH OK) ─── */}
      {notifyActivatedCard && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setNotifyActivatedCard(null)}
        >
          <div 
            className="relative w-full max-w-md bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border-2 border-yellow-400 overflow-hidden text-gray-900 dark:text-zinc-100 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500 p-5 text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
                  <BellRing className="w-6 h-6 animate-pulse text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold bg-white/30 px-2.5 py-0.5 rounded-full">
                      High Priority Notification
                    </span>
                    <span className="text-xs text-yellow-100 font-semibold">
                      Alarm Set
                    </span>
                  </div>
                  <h2 className="text-xl font-headline font-black tracking-tight text-white mt-0.5">
                    Rest Stop Alert Active
                  </h2>
                </div>
              </div>
              <button 
                onClick={() => setNotifyActivatedCard(null)}
                className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/20 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800">
                <span className="text-xs font-bold text-yellow-800 dark:text-yellow-300 uppercase tracking-widest block mb-1">
                  Target Rest Stop:
                </span>
                <p className="font-headline font-black text-xl text-yellow-950 dark:text-yellow-100">
                  {notifyActivatedCard.stopName}
                </p>
                {notifyActivatedCard.location && (
                  <p className="text-xs text-yellow-800 dark:text-yellow-200 font-semibold mt-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-yellow-600 shrink-0" />
                    <span>{notifyActivatedCard.location}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Halt Duration</span>
                  <span className="font-black text-gray-900 dark:text-white text-base">
                    {notifyActivatedCard.duration || 15} mins
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-0.5">Estimated Arrival</span>
                  <span className="font-black text-gray-900 dark:text-white text-base truncate block">
                    {notifyActivatedCard.eta ? `${notifyActivatedCard.eta}` : 'Live route tracking'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs font-medium text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>We will alert you with full priority and alarm sound the moment the bus reaches this halt, no matter which screen you are on.</span>
              </div>
            </div>

            {/* Footer with OK button */}
            <div className="p-5 bg-gray-50 dark:bg-zinc-900/60 border-t border-gray-100 dark:border-zinc-800">
              <Button
                size="lg"
                onClick={() => setNotifyActivatedCard(null)}
                className="w-full bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500 hover:opacity-95 text-yellow-950 font-headline font-black rounded-2xl h-12 text-base shadow-lg transition-all"
              >
                <Check className="w-5 h-5 mr-1.5" />
                <span>OK</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 2. REST STOP ARRIVED CARD (ACTIVE ACROSS ANY PAGE) ─── */}
      {activeRestStopArrival && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={handleDismissRestStopArrival}
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
                      High Priority Notice
                    </span>
                    <span className="text-xs text-emerald-100 font-bold">
                      Bus Halted
                    </span>
                  </div>
                  <h2 className="text-2xl font-headline font-black tracking-tight text-white mt-1">
                    {activeRestStopArrival.stopName}
                  </h2>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <p className="font-headline font-black text-xl text-emerald-950 dark:text-emerald-100 leading-snug">
                  The bus has safely arrived at {activeRestStopArrival.stopName}!
                </p>
                {activeRestStopArrival.location && (
                  <p className="text-sm text-emerald-800 dark:text-emerald-200 font-semibold mt-1.5 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Location: {activeRestStopArrival.location}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
                  <span className="text-xs text-gray-500 font-semibold block">Break Duration</span>
                  <span className="font-black text-lg text-gray-900 dark:text-white">
                    {activeRestStopArrival.duration || 15} minutes
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
                  <span className="text-xs text-gray-500 font-semibold block">Halt Status</span>
                  <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">
                    Active Break
                  </span>
                </div>
              </div>

              {activeRestStopArrival.amenities && activeRestStopArrival.amenities.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Available Amenities</span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeRestStopArrival.amenities.map((amenity, idx) => (
                      <span key={idx} className="bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-lg text-xs font-semibold">
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500 font-medium leading-relaxed bg-gray-50 dark:bg-zinc-900 p-3 rounded-xl border border-gray-100 dark:border-zinc-800">
                Please remember your seat and bus number before stepping out. Make sure to return to the vehicle before the scheduled break concludes.
              </p>
            </div>

            {/* Footer with OK button */}
            <div className="p-5 bg-gray-50 dark:bg-zinc-900/60 border-t border-gray-100 dark:border-zinc-800">
              <Button
                size="lg"
                onClick={handleDismissRestStopArrival}
                className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:opacity-95 text-white font-headline font-black rounded-2xl h-14 text-base shadow-lg shadow-emerald-600/25 transition-all"
              >
                <Check className="w-5 h-5 mr-2" />
                <span>OK, Understood</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 3. CABIN CREW HALT RESPONSE MODAL ─── */}
      {isResponded && latestRequest && analysis && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
        >
          <div 
            className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border-2 border-primary/50 overflow-hidden text-gray-900 dark:text-zinc-100 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 p-5 text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
                  <ShieldAlert className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider font-extrabold bg-white/25 px-2.5 py-0.5 rounded-full">
                      Cabin Crew Response
                    </span>
                    <span className="text-xs text-white/90 font-medium">
                      {latestRequest.respondedAt ? new Date(latestRequest.respondedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </span>
                  </div>
                  <h2 className="text-xl font-headline font-black tracking-tight text-white mt-0.5">
                    {analysis.title}
                  </h2>
                </div>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <Badge className={cn("px-3 py-1 font-bold rounded-lg text-xs", analysis.badgeColor)}>
                  {analysis.badge}
                </Badge>
                <span className="text-xs font-bold text-gray-500">Seat {latestRequest.seatNumber}</span>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">
                  Direct Response from Cabin Crew:
                </span>
                <p className="font-headline font-black text-lg text-gray-900 dark:text-white leading-snug">
                  &ldquo;{latestRequest.responseMessage}&rdquo;
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
                <span className="text-xs font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider block mb-1">
                  Situation Analysis & Instructions:
                </span>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-relaxed">
                  {analysis.explanation}
                </p>
              </div>

              {analysis.tip && (
                <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs font-medium text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{analysis.tip}</span>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-5 bg-gray-50 dark:bg-zinc-900/60 border-t border-gray-100 dark:border-zinc-800 flex justify-end">
              <Button
                size="lg"
                disabled={isAcknowledging}
                onClick={handleAcknowledgeResponse}
                className="w-full bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:opacity-95 text-white font-headline font-black rounded-2xl h-12 text-base shadow-lg transition-all"
              >
                {isAcknowledging ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    <span>OK, Understood</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
