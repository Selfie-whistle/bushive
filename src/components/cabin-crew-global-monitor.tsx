'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import { format } from 'date-fns';
import { 
  Ticket, 
  MapPin, 
  User, 
  Phone, 
  Clock, 
  CheckCircle2, 
  X, 
  ArrowRight, 
  BellRing,
  Bus as BusIcon,
  AlertTriangle,
  HeartPulse,
  Send,
  Loader2,
  Fuel,
  Ban,
  PhoneCall,
  Navigation,
  MessageSquare,
  AlertCircle,
  Volume2,
  VolumeX
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Booking, StopRequest } from '@/lib/types';

interface NewTicketAlert {
  id: string;
  scheduleId: string;
  seats: string[];
  boardingLocation: string;
  boardingTime?: string;
  passengerName: string;
  pnr?: string;
  phone?: string;
  bookedAt: string;
  tripDirection?: string;
  busName?: string;
}

export function CabinCrewGlobalMonitor() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isUserLoading } = useFirebase();

  const [notification, setNotification] = useState<NewTicketAlert | null>(null);
  const [stopRequestAlert, setStopRequestAlert] = useState<(StopRequest & { scheduleId: string }) | null>(null);
  const [isStopAlertModalOpen, setIsStopAlertModalOpen] = useState(false);
  const [respondingOption, setRespondingOption] = useState<string | null>(null);
  const isResponding = respondingOption !== null;
  const [monitoredScheduleIds, setMonitoredScheduleIds] = useState<string[]>([]);

  // Emergency Alarm state (Global passenger emergency alert)
  const [activeEmergencyAlert, setActiveEmergencyAlert] = useState<{
    scheduleId: string;
    busId: string;
    timestamp: string;
    seatNumber: string;
    passengerName: string;
    bookingId?: string;
    severe?: boolean;
    active: boolean;
  } | null>(null);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isAlarmMuted, setIsAlarmMuted] = useState(false);
  const isAlarmMutedRef = useRef(false);
  isAlarmMutedRef.current = isAlarmMuted;

  // Admin Incident Report Request state
  const [pendingReportRequest, setPendingReportRequest] = useState<{
    id: string;
    incidentTimestamp: string;
    scheduleId: string;
    seatNumber: string;
    passengerName: string;
    requestedAt: string;
  } | null>(null);
  const pendingReportRequestsByScheduleRef = useRef<Map<string, any>>(new Map());
  const playedChimeReportReqIdsRef = useRef<Set<string>>(new Set());

  const activeEmergencyAlertRef = useRef(activeEmergencyAlert);
  activeEmergencyAlertRef.current = activeEmergencyAlert;
  const emergencyAlarmsByScheduleRef = useRef<Map<string, any>>(new Map());
  const emergencyAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopRequestAlertRef = useRef(stopRequestAlert);
  stopRequestAlertRef.current = stopRequestAlert;
  const closedRequestIdsRef = useRef<Set<string>>(new Set());
  const playedChimeRequestIdsRef = useRef<Set<string>>(new Set());
  const pendingRequestsByScheduleRef = useRef<Map<string, StopRequest & { scheduleId: string }>>(new Map());

  // Track known bookings per schedule so we don't alert on historical bookings
  const knownBookingKeysRef = useRef<Set<string>>(new Set());
  const initialSnapshotsRef = useRef<Set<string>>(new Set());
  const activeUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const handledStopRequestIdsRef = useRef<Set<string>>(new Set());

  // Web Audio Context for pleasant synthesized chime
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Play pleasant 3-tone boarding announcement chime
  const playChime = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContextClass();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const playTone = (freq: number, startDelay: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);

        gain.gain.setValueAtTime(0.35, ctx.currentTime + startDelay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + startDelay);
        osc.stop(ctx.currentTime + startDelay + duration);
      };

      // Crisp, pleasant 3-note chime (C5 -> E5 -> G5)
      playTone(523.25, 0.0, 0.35);
      playTone(659.25, 0.22, 0.35);
      playTone(783.99, 0.44, 0.55);
    } catch (e) {
      console.warn('Audio chime playback error:', e);
    }
  }, []);

  // Play urgent attention chime for stop requests
  const playUrgentChime = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContextClass();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const playTone = (freq: number, startDelay: number, duration: number, type: OscillatorType = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);

        gain.gain.setValueAtTime(0.4, ctx.currentTime + startDelay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + startDelay);
        osc.stop(ctx.currentTime + startDelay + duration);
      };

      // High priority alert pattern
      playTone(880, 0.0, 0.2, 'sine');
      playTone(1174.66, 0.18, 0.25, 'sine');
      playTone(880, 0.38, 0.2, 'sine');
      playTone(1174.66, 0.56, 0.35, 'sine');
    } catch (e) {
      console.warn('Audio urgent chime playback error:', e);
    }
  }, []);

  // Play continuous looping emergency alarm
  const playEmergencyAlarm = useCallback(() => {
    try {
      if (isAlarmMutedRef.current) return;
      if (emergencyAudioRef.current) {
        emergencyAudioRef.current.currentTime = 0;
        emergencyAudioRef.current.play().catch(() => {});
      }
    } catch (e) {}
  }, []);

  const stopEmergencyAlarm = useCallback(() => {
    try {
      if (emergencyAudioRef.current) {
        emergencyAudioRef.current.pause();
        emergencyAudioRef.current.currentTime = 0;
      }
    } catch (e) {}
  }, []);

  const handleToggleAlarmMute = useCallback(() => {
    if (isAlarmMutedRef.current) {
      setIsAlarmMuted(false);
      isAlarmMutedRef.current = false;
      if (emergencyAudioRef.current) {
        emergencyAudioRef.current.currentTime = 0;
        emergencyAudioRef.current.play().catch(() => {});
      }
    } else {
      setIsAlarmMuted(true);
      isAlarmMutedRef.current = true;
      if (emergencyAudioRef.current) {
        emergencyAudioRef.current.pause();
      }
    }
  }, []);

  // 1. Detect which schedule(s) correspond to the cabin crew console
  useEffect(() => {
    const detectedIds = new Set<string>();

    // A. Check URL pathname for /cabin-crew/[tripId]
    if (pathname) {
      const restStopMatch = pathname.match(/^\/cabin-crew\/rest-stop-manifest\/([^/?#]+)/);
      if (restStopMatch && restStopMatch[1]) {
        detectedIds.add(restStopMatch[1]);
      } else {
        const tripMatch = pathname.match(/^\/cabin-crew\/([^/?#]+)/);
        if (tripMatch && tripMatch[1]) {
          const staticRoutes = [
            'attendance',
            'confirmation',
            'expenses',
            'generate-tickets',
            'luggage',
            'photo-update',
            'rest-stop-manifest',
            'snacks',
            'tracking',
            'verify'
          ];
          if (!staticRoutes.includes(tripMatch[1])) {
            detectedIds.add(tripMatch[1]);
          }
        }
      }
    }

    // B. Check URL searchParams (e.g., ?tripId=... or ?scheduleId=...)
    const queryTripId = searchParams?.get('tripId') || searchParams?.get('scheduleId');
    if (queryTripId) {
      detectedIds.add(queryTripId);
    }

    // C. Check stored trip ID from session/local storage
    try {
      if (detectedIds.size > 0) {
        const primaryId = Array.from(detectedIds)[0];
        sessionStorage.setItem('bushive_crew_active_trip_id', primaryId);
        localStorage.setItem('bushive_crew_active_trip_id', primaryId);
      } else {
        const storedId = sessionStorage.getItem('bushive_crew_active_trip_id') || localStorage.getItem('bushive_crew_active_trip_id');
        if (storedId) {
          detectedIds.add(storedId);
        }
      }
    } catch (e) {}

    // D. Unconditionally monitor active schedules & pending stop requests for today
    const now = new Date();
    const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const dateToUse = now < noon ? new Date(now.setDate(now.getDate() - 1)) : now;
    const dateStr = format(dateToUse, 'yyyy-MM-dd');

    const unsubToday = dataService.onSchedulesForDateSnapshot(dateStr, schedules => {
      schedules.forEach(s => {
        const hasPendingStop = Array.isArray(s.stopRequests) && s.stopRequests.some((r: any) => r.status === 'pending');
        const hasActiveEmergency = Boolean(s.emergencyAlarm?.active);
        const hasPendingReportReq = Boolean(s.pendingReportRequest?.active);
        // Monitor if it has pending requests, active emergency, report request, or is an active/current schedule
        if (hasPendingStop || hasActiveEmergency || hasPendingReportReq || s.tripStatus === 'in-progress' || !s.tripStatus || s.tripStatus === 'not-started') {
          detectedIds.add(s.id);
        }
      });
      setMonitoredScheduleIds(Array.from(detectedIds));
    }, (err) => console.error('Error listening to today schedules:', err));

    // Also listen to window event for trip changes or manually opening a request
    const handleActiveTripChanged = (e: any) => {
      if (e?.detail?.tripId) {
        setMonitoredScheduleIds(prev => Array.from(new Set([...prev, e.detail.tripId])));
      }
    };

    const handleOpenStopRequest = (e: any) => {
      if (e?.detail) {
        setStopRequestAlert(e.detail);
        setIsStopAlertModalOpen(true);
        if (e.detail.id) {
          closedRequestIdsRef.current.delete(e.detail.id);
          try {
            sessionStorage.removeItem('bushive_closed_stop_req_' + e.detail.id);
          } catch (err) {}
        }
      }
    };

    window.addEventListener('bushive:active_trip_changed', handleActiveTripChanged);
    window.addEventListener('bushive:open_stop_request', handleOpenStopRequest);

    return () => {
      unsubToday();
      window.removeEventListener('bushive:active_trip_changed', handleActiveTripChanged);
      window.removeEventListener('bushive:open_stop_request', handleOpenStopRequest);
    };
  }, [pathname, searchParams, user, isUserLoading]);

  // 2. Set up real-time schedule listeners for each monitored schedule
  useEffect(() => {
    if (monitoredScheduleIds.length === 0) return;

    // Unsubscribe from any schedules that are no longer monitored
    for (const [schedId, unsub] of activeUnsubsRef.current.entries()) {
      if (!monitoredScheduleIds.includes(schedId)) {
        unsub();
        activeUnsubsRef.current.delete(schedId);
        pendingRequestsByScheduleRef.current.delete(schedId);
        emergencyAlarmsByScheduleRef.current.delete(schedId);
      }
    }

    // Subscribe to any new schedules
    monitoredScheduleIds.forEach(scheduleId => {
      if (activeUnsubsRef.current.has(scheduleId)) return;

      const unsub = dataService.onScheduleSnapshot(scheduleId, async (scheduleData) => {
        if (!scheduleData) return;

        const schedId = scheduleData.id || scheduleId;
        const currentBookings = Array.isArray(scheduleData.bookings) ? scheduleData.bookings : [];

        // First snapshot for this schedule: seed existing bookings to prevent false historical alerts
        if (!initialSnapshotsRef.current.has(schedId)) {
          initialSnapshotsRef.current.add(schedId);
          currentBookings.forEach((b: any) => {
            if (b.bookingId && b.seat) {
              knownBookingKeysRef.current.add(`${schedId}_${b.bookingId}_${b.seat}`);
            }
          });
          return;
        }

        // Subsequent snapshot: look for newly booked seats
        const newItems = currentBookings.filter((b: any) => 
          b.bookingId && b.seat && !knownBookingKeysRef.current.has(`${schedId}_${b.bookingId}_${b.seat}`)
        );

        if (newItems.length > 0) {
          // Immediately mark as known so we never re-trigger for the same booking
          newItems.forEach((b: any) => {
            knownBookingKeysRef.current.add(`${schedId}_${b.bookingId}_${b.seat}`);
          });

          // Group by bookingId so multiple seats in the same checkout appear in one cohesive alert
          const groupedByBooking = new Map<string, typeof newItems>();
          newItems.forEach((b: any) => {
            const list = groupedByBooking.get(b.bookingId) || [];
            list.push(b);
            groupedByBooking.set(b.bookingId, list);
          });

          for (const [bookingId, items] of groupedByBooking.entries()) {
            const seats = items.map((i: any) => i.seat);
            const firstItem = items[0] as any;

            let passengerName = firstItem.passengerName || 'Passenger';
            let boardingLocation = firstItem.boardingPoint || firstItem.boardingMain || '';
            let boardingTime = '';
            let pnr = bookingId.substring(0, 8).toUpperCase();
            let phone = '';

            // Fetch richer booking details from database if needed
            try {
              const bookingDetails = await dataService.getBookingById(firstItem.userId, bookingId);
              if (bookingDetails) {
                pnr = bookingDetails.pnr || pnr;
                phone = bookingDetails.contact?.phone || '';

                if (!boardingLocation) {
                  if (bookingDetails.boardingPoint && bookingDetails.boardingMain) {
                    boardingLocation = `${bookingDetails.boardingPoint}, ${bookingDetails.boardingMain}`;
                  } else {
                    boardingLocation = bookingDetails.boardingPoint || bookingDetails.boardingMain || '';
                  }
                }

                boardingTime = bookingDetails.boardingTime || '';

                const matchedPax = bookingDetails.passengers?.find(p => p.seatNumber === firstItem.seat);
                if (matchedPax?.name) {
                  passengerName = items.length > 1 
                    ? `${matchedPax.name} (+${items.length - 1} more)` 
                    : matchedPax.name;
                } else if (bookingDetails.passengers?.[0]?.name) {
                  passengerName = items.length > 1
                    ? `${bookingDetails.passengers[0].name} (+${items.length - 1} more)`
                    : bookingDetails.passengers[0].name;
                }
              }
            } catch (err) {
              console.error('Error fetching booking details for alert:', err);
            }

            if (!boardingLocation) {
              boardingLocation = 'Main Boarding Point';
            }

            // Play audio chime
            playChime();

            // Display center modal notification
            setNotification({
              id: `${schedId}_${bookingId}_${Date.now()}`,
              scheduleId: schedId,
              seats,
              boardingLocation,
              boardingTime,
              passengerName,
              pnr,
              phone,
              bookedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              tripDirection: scheduleData.direction || '',
              busName: (scheduleData as any).busDetails?.name || 'Bus'
            });
          }
        }

        // Check for urgent stop requests (Washroom / Vomiting Tendency)
        const currentStopRequests: StopRequest[] = Array.isArray(scheduleData.stopRequests) ? scheduleData.stopRequests : [];
        const pendingStopRequests = currentStopRequests.filter(r => r.status === 'pending');

        if (pendingStopRequests.length > 0) {
          pendingRequestsByScheduleRef.current.set(schedId, {
            ...pendingStopRequests[0],
            scheduleId: schedId,
          });
        } else {
          pendingRequestsByScheduleRef.current.delete(schedId);
        }

        // Get primary pending request across all monitored schedules
        const allPendingRequests = Array.from(pendingRequestsByScheduleRef.current.values());
        const primaryPending = allPendingRequests[0] || null;

        setStopRequestAlert(primaryPending);

        if (primaryPending) {
          const isClosedInSession = closedRequestIdsRef.current.has(primaryPending.id) ||
            (() => {
              try {
                return sessionStorage.getItem('bushive_closed_stop_req_' + primaryPending.id) === 'true';
              } catch (e) {
                return false;
              }
            })();

          if (!isClosedInSession) {
            setIsStopAlertModalOpen(true);
            if (!playedChimeRequestIdsRef.current.has(primaryPending.id)) {
              playedChimeRequestIdsRef.current.add(primaryPending.id);
              playUrgentChime();
            }
          }
        } else {
          setIsStopAlertModalOpen(false);
        }

        // Check for active Emergency Alarm (whichever screen cabin crew is currently on)
        if (scheduleData.emergencyAlarm && scheduleData.emergencyAlarm.active) {
          emergencyAlarmsByScheduleRef.current.set(schedId, {
            scheduleId: schedId,
            busId: scheduleData.actualBusId || scheduleData.busId,
            ...scheduleData.emergencyAlarm,
          });
        } else {
          emergencyAlarmsByScheduleRef.current.delete(schedId);
        }

        const allActiveEmergencies = Array.from(emergencyAlarmsByScheduleRef.current.values());
        const primaryEmergency = allActiveEmergencies[0] || null;

        if (primaryEmergency && primaryEmergency.active) {
          const isNew = !activeEmergencyAlertRef.current || 
            activeEmergencyAlertRef.current.timestamp !== primaryEmergency.timestamp ||
            activeEmergencyAlertRef.current.seatNumber !== primaryEmergency.seatNumber ||
            activeEmergencyAlertRef.current.severe !== primaryEmergency.severe;
          
          setActiveEmergencyAlert(primaryEmergency);
          if (isNew) {
            // ALWAYS reset mute so any new emergency rings aloud!
            setIsAlarmMuted(false);
            isAlarmMutedRef.current = false;
            setIsEmergencyModalOpen(true);
            playEmergencyAlarm();
          }
        } else {
          if (activeEmergencyAlertRef.current) {
            stopEmergencyAlarm();
          }
          // Reset mute state when alarm ceases or passenger withdraws!
          setIsAlarmMuted(false);
          isAlarmMutedRef.current = false;
          setActiveEmergencyAlert(null);
          setIsEmergencyModalOpen(false);
        }

        // Check for active Admin Report Request
        if (scheduleData.pendingReportRequest && scheduleData.pendingReportRequest.active) {
          pendingReportRequestsByScheduleRef.current.set(schedId, {
            ...scheduleData.pendingReportRequest,
            scheduleId: schedId,
          });
        } else {
          pendingReportRequestsByScheduleRef.current.delete(schedId);
        }

        const allReportRequests = Array.from(pendingReportRequestsByScheduleRef.current.values());
        const primaryReportReq = allReportRequests[0] || null;
        setPendingReportRequest(primaryReportReq);

        if (primaryReportReq && !playedChimeReportReqIdsRef.current.has(primaryReportReq.id || primaryReportReq.incidentTimestamp)) {
          playedChimeReportReqIdsRef.current.add(primaryReportReq.id || primaryReportReq.incidentTimestamp);
          playUrgentChime();
        }
      });

      activeUnsubsRef.current.set(scheduleId, unsub);
    });

    return () => {
      // Don't clean up unsubs on simple state changes unless component completely unmounts
    };
  }, [monitoredScheduleIds, playChime, playUrgentChime, playEmergencyAlarm, stopEmergencyAlarm]);

  // Clean up all active listeners on unmount
  useEffect(() => {
    return () => {
      activeUnsubsRef.current.forEach(unsub => unsub());
      activeUnsubsRef.current.clear();
      pendingRequestsByScheduleRef.current.clear();
      emergencyAlarmsByScheduleRef.current.clear();
      pendingReportRequestsByScheduleRef.current.clear();
      stopEmergencyAlarm();
    };
  }, [stopEmergencyAlarm]);

  const handleCloseModal = () => {
    if (stopRequestAlert) {
      closedRequestIdsRef.current.add(stopRequestAlert.id);
      try {
        sessionStorage.setItem('bushive_closed_stop_req_' + stopRequestAlert.id, 'true');
      } catch (e) {}
    }
    setIsStopAlertModalOpen(false);
  };

  const handleReopenModal = () => {
    if (stopRequestAlert) {
      closedRequestIdsRef.current.delete(stopRequestAlert.id);
      try {
        sessionStorage.removeItem('bushive_closed_stop_req_' + stopRequestAlert.id);
      } catch (e) {}
    }
    setIsStopAlertModalOpen(true);
  };

  const handleSendCrewResponse = async (responseMessage: string) => {
    if (!stopRequestAlert || respondingOption !== null) return;
    setRespondingOption(responseMessage);
    try {
      if (stopRequestAlert.id) {
        closedRequestIdsRef.current.delete(stopRequestAlert.id);
        try {
          sessionStorage.removeItem('bushive_closed_stop_req_' + stopRequestAlert.id);
        } catch (e) {}
        playedChimeRequestIdsRef.current.delete(stopRequestAlert.id);
      }
      await dataService.respondToStopRequest(stopRequestAlert.scheduleId, stopRequestAlert.id, responseMessage);
      pendingRequestsByScheduleRef.current.delete(stopRequestAlert.scheduleId);
      const remainingPending = Array.from(pendingRequestsByScheduleRef.current.values());
      const nextPending = remainingPending[0] || null;
      setStopRequestAlert(nextPending);
      setIsStopAlertModalOpen(false);
    } catch (err) {
      console.error('Failed to send stop response to passenger:', err);
    } finally {
      setRespondingOption(null);
    }
  };

  const isCurrentPageTrip = notification ? pathname?.includes(notification.scheduleId) : false;

  return (
    <>
      <audio 
        ref={emergencyAudioRef} 
        src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" 
        loop 
        preload="auto" 
      />

      {/* ─── 0. GLOBAL FULL-SCREEN EMERGENCY ALERT MODAL (SECOND MESSAGE DIRECTLY) ─── */}
      {activeEmergencyAlert && isEmergencyModalOpen && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200"
        >
          <div 
            className="relative w-full max-w-sm sm:max-w-md rounded-3xl overflow-hidden shadow-2xl border-4 border-red-500 animate-in zoom-in-95 duration-200"
            style={{ background: 'linear-gradient(160deg, #1a0000 0%, #7f1d1d 50%, #1a0000 100%)' }}
          >
            {/* Animated pulsing border glow */}
            <div className="absolute inset-0 rounded-3xl pointer-events-none animate-pulse border-4 border-red-500/50" />

            {/* Ripple ping */}
            <div className="absolute inset-0 flex items-start justify-center pointer-events-none overflow-hidden">
              <span className="animate-ping absolute top-10 inline-flex h-32 w-32 rounded-full bg-red-500 opacity-20"></span>
            </div>

            <div className="relative z-10 p-7 flex flex-col items-center text-center gap-4">
              {/* Siren Bell with Seat badge */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-red-700/60 flex items-center justify-center border-2 border-red-400 shadow-[0_0_40px_rgba(239,68,68,0.7)] animate-bounce">
                  <AlertTriangle className="w-10 h-10 text-white animate-pulse" />
                </div>
                <div className="absolute -top-1 -right-2 bg-white text-red-700 text-xs font-black px-2.5 py-0.5 rounded-full shadow-lg border-2 border-red-500">
                  SEAT {activeEmergencyAlert.seatNumber}
                </div>
              </div>

              {/* Title & Passenger Name */}
              <div>
                <p className="text-[11px] font-black tracking-[0.3em] text-red-300 uppercase mb-1">
                  🚨 Critical Passenger Emergency
                </p>
                <h2 className="text-4xl font-black text-white leading-tight">
                  SEAT <span className="text-red-400">{activeEmergencyAlert.seatNumber}</span>
                </h2>
                <p className="text-red-100 text-base font-bold mt-1">
                  {activeEmergencyAlert.passengerName || 'Passenger'}
                </p>
              </div>

              {/* Severe badge if escalated */}
              {activeEmergencyAlert.severe && (
                <div className="bg-red-950 border-2 border-red-500 rounded-xl px-4 py-2 w-full animate-pulse">
                  <p className="text-xs font-black text-red-200 tracking-wider uppercase flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    No Response in 3 Minutes — Admin Alerted
                  </p>
                </div>
              )}

              {/* THE DIRECT SECOND ALERT MESSAGE (ACTION REQUIRED) */}
              <div className="w-full py-4 px-4 rounded-2xl bg-black/60 border-2 border-red-500/60 text-red-100 shadow-inner">
                <p className="text-xs uppercase font-black tracking-widest text-red-400 mb-1.5">
                  Action Required
                </p>
                <p className="text-base font-bold leading-snug text-white">
                  Go to Seat {activeEmergencyAlert.seatNumber} immediately. The passenger must confirm your arrival to dismiss this alert.
                </p>
              </div>

              {/* Mute Siren and Console Lockout Status (No minimize allowed) */}
              <div className="w-full flex flex-col gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleToggleAlarmMute}
                  className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-black text-sm tracking-wide transition-all border-2 border-red-400/60 active:scale-98 flex items-center justify-center gap-2 shadow-lg"
                >
                  {isAlarmMuted ? (
                    <>
                      <Volume2 className="w-5 h-5 text-amber-300" />
                      <span>Unmute Alarm Sound</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-5 h-5 text-red-300" />
                      <span>Mute Alarm Siren</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-red-200/90 pt-1">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>Console locked • Awaiting passenger confirmation or withdrawal</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 0.a ADMIN REPORT REQUEST PRIORITY TOP BANNER ─── */}
      {pendingReportRequest && (
        <div className="fixed top-3 left-0 right-0 z-[99990] px-4 pointer-events-none animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <div 
              onClick={() => {
                router.push(`/cabin-crew/${pendingReportRequest.scheduleId}?tab=incidents`);
              }}
              className="group cursor-pointer bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border-2 border-amber-300/80 flex items-center justify-between gap-3 hover:scale-[1.01] transition-transform backdrop-blur-md"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center shrink-0 border border-white/30">
                  <BellRing className="w-5 h-5 text-white animate-bounce" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-white/25 text-amber-100 px-2 py-0.5 rounded-full">
                      Priority Notice • Admin Request
                    </span>
                    <span className="text-xs font-black text-white bg-black/30 px-2 py-0.5 rounded-lg">
                      Seat {pendingReportRequest.seatNumber}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white leading-tight mt-1 truncate">
                    Admin requested Incident Report for {pendingReportRequest.passengerName || 'Passenger'}
                  </p>
                  <p className="text-xs text-amber-100/90 font-medium hidden sm:block">
                    Tap to open Incidents tab & submit details
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-black uppercase bg-white text-amber-800 px-3 py-2 rounded-xl shadow-sm group-hover:bg-amber-50 transition-colors flex items-center gap-1.5">
                  <span>Write Report</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingReportRequest(null);
                  }}
                  className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                  title="Dismiss banner"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. URGENT PASSENGER HALT REQUEST (Washroom / Vomiting) */}
      {stopRequestAlert && isStopAlertModalOpen && (
        <div 
          className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={handleCloseModal}
        >
          <div 
            className={cn(
              "relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl overflow-hidden text-gray-900 dark:text-zinc-100 animate-in zoom-in-95 duration-200 border-2",
              stopRequestAlert.type === 'vomiting' 
                ? "border-rose-500 shadow-rose-500/20" 
                : "border-amber-500 shadow-amber-500/20"
            )}
            onClick={e => e.stopPropagation()}
          >
            {/* Header Banner */}
            <div className={cn(
              "p-5 text-white flex items-center justify-between shadow-md",
              stopRequestAlert.type === 'vomiting'
                ? "bg-gradient-to-r from-rose-600 via-red-600 to-rose-700"
                : "bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700"
            )}>
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center w-12 h-12 bg-white/20 rounded-2xl backdrop-blur-sm shadow-inner">
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-90"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-yellow-300"></span>
                  </span>
                  {stopRequestAlert.type === 'vomiting' ? (
                    <HeartPulse className="w-6 h-6 text-white animate-pulse" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider font-extrabold bg-white/25 px-2.5 py-0.5 rounded-full">
                      High Priority Alert
                    </span>
                    <span className="text-xs text-white/90 font-medium">
                      {stopRequestAlert.requestedAt ? new Date(stopRequestAlert.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </span>
                  </div>
                  <h2 className="text-xl font-headline font-black tracking-tight text-white mt-0.5">
                    {stopRequestAlert.type === 'vomiting' ? 'Vomiting Tendency Reported!' : 'Urgent Washroom Stop Requested!'}
                  </h2>
                </div>
              </div>

              <button
                onClick={handleCloseModal}
                className="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                title="Minimize window"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Highlighted Warning Statement */}
              <div className={cn(
                "p-4 rounded-2xl border flex items-start gap-3",
                stopRequestAlert.type === 'vomiting'
                  ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100"
                  : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100"
              )}>
                <AlertTriangle className={cn("w-5 h-5 mt-0.5 shrink-0", stopRequestAlert.type === 'vomiting' ? "text-rose-600" : "text-amber-600")} />
                <div>
                  <p className="font-bold text-sm leading-snug">
                    {stopRequestAlert.type === 'vomiting' ? (
                      <>
                        Passenger has reported a <span className="underline font-black">vomiting tendency</span> and urgently requests the bus to stop at the earliest.
                      </>
                    ) : (
                      <>
                        Passenger has requested an urgent stop for <span className="underline font-black">washroom / restroom facility</span>.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Seat & Passenger Info Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-zinc-900 p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 text-center">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">
                    Seat Number
                  </span>
                  <p className="font-headline font-black text-2xl text-rose-600 dark:text-rose-400">
                    Seat {stopRequestAlert.seatNumber}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-zinc-900 p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 flex flex-col justify-center">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">
                    Passenger
                  </span>
                  <p className="font-bold text-gray-900 dark:text-white truncate text-base">
                    {stopRequestAlert.passengerName || 'Passenger'}
                  </p>
                </div>
              </div>

              {/* Action Buttons Section */}
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  <span className="text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    Select Response to Notify Passenger Real-time:
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {(() => {
                    const opt1 = "Bus will stop now, kindly come to cabin";
                    const isSelected = respondingOption === opt1;
                    const isOther = isResponding && !isSelected;
                    return (
                      <button
                        disabled={isResponding}
                        onClick={() => handleSendCrewResponse(opt1)}
                        className={cn(
                          "w-full text-left p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between group active:scale-[0.99]",
                          isSelected 
                            ? "border-emerald-600 bg-emerald-100/90 dark:bg-emerald-950/70 shadow-md ring-2 ring-emerald-500/30" 
                            : isOther
                            ? "opacity-40 border-gray-200 dark:border-zinc-800 bg-gray-50/50 cursor-not-allowed"
                            : "border-emerald-500/40 hover:border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/30 hover:bg-emerald-100"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors", isSelected ? "bg-emerald-700 text-white" : "bg-emerald-600 text-white")}>
                            <Navigation className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 block">
                                Immediate Halt
                              </span>
                              {isSelected && (
                                <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-200 dark:bg-emerald-800 dark:text-emerald-100 px-2 py-0.5 rounded-full animate-pulse">
                                  Sending...
                                </span>
                              )}
                            </div>
                            <p className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-emerald-950">
                              {opt1}
                            </p>
                          </div>
                        </div>
                        {isSelected ? (
                          <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                          </div>
                        ) : (
                          <Send className="w-4 h-4 text-emerald-600 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                        )}
                      </button>
                    );
                  })()}

                  {(() => {
                    const opt2 = "Currently running on road where stopping is not possible";
                    const isSelected = respondingOption === opt2;
                    const isOther = isResponding && !isSelected;
                    return (
                      <button
                        disabled={isResponding}
                        onClick={() => handleSendCrewResponse(opt2)}
                        className={cn(
                          "w-full text-left p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between group active:scale-[0.99]",
                          isSelected 
                            ? "border-amber-600 bg-amber-100/90 dark:bg-amber-950/70 shadow-md ring-2 ring-amber-500/30" 
                            : isOther
                            ? "opacity-40 border-gray-200 dark:border-zinc-800 bg-gray-50/50 cursor-not-allowed"
                            : "border-amber-500/40 hover:border-amber-600 bg-amber-50/80 dark:bg-amber-950/30 hover:bg-amber-100"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors", isSelected ? "bg-amber-700 text-white" : "bg-amber-600 text-white")}>
                            <Ban className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 block">
                                Safety Constraint
                              </span>
                              {isSelected && (
                                <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-200 dark:bg-amber-800 dark:text-amber-100 px-2 py-0.5 rounded-full animate-pulse">
                                  Sending...
                                </span>
                              )}
                            </div>
                            <p className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-amber-950">
                              {opt2}
                            </p>
                          </div>
                        </div>
                        {isSelected ? (
                          <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs">
                            <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                          </div>
                        ) : (
                          <Send className="w-4 h-4 text-amber-600 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                        )}
                      </button>
                    );
                  })()}

                  {(() => {
                    const opt3 = "Will stop bus at nearest petrol pump, kindly wait";
                    const isSelected = respondingOption === opt3;
                    const isOther = isResponding && !isSelected;
                    return (
                      <button
                        disabled={isResponding}
                        onClick={() => handleSendCrewResponse(opt3)}
                        className={cn(
                          "w-full text-left p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between group active:scale-[0.99]",
                          isSelected 
                            ? "border-blue-600 bg-blue-100/90 dark:bg-blue-950/70 shadow-md ring-2 ring-blue-500/30" 
                            : isOther
                            ? "opacity-40 border-gray-200 dark:border-zinc-800 bg-gray-50/50 cursor-not-allowed"
                            : "border-blue-500/40 hover:border-blue-600 bg-blue-50/80 dark:bg-blue-950/30 hover:bg-blue-100"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors", isSelected ? "bg-blue-700 text-white" : "bg-blue-600 text-white")}>
                            <Fuel className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 block">
                                Facility Ahead
                              </span>
                              {isSelected && (
                                <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider text-blue-800 bg-blue-200 dark:bg-blue-800 dark:text-blue-100 px-2 py-0.5 rounded-full animate-pulse">
                                  Sending...
                                </span>
                              )}
                            </div>
                            <p className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-blue-950">
                              {opt3}
                            </p>
                          </div>
                        </div>
                        {isSelected ? (
                          <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          </div>
                        ) : (
                          <Send className="w-4 h-4 text-blue-600 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                        )}
                      </button>
                    );
                  })()}

                  {(() => {
                    const opt4 = "Will call you when bus is possible to stop";
                    const isSelected = respondingOption === opt4;
                    const isOther = isResponding && !isSelected;
                    return (
                      <button
                        disabled={isResponding}
                        onClick={() => handleSendCrewResponse(opt4)}
                        className={cn(
                          "w-full text-left p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between group active:scale-[0.99]",
                          isSelected 
                            ? "border-purple-600 bg-purple-100/90 dark:bg-purple-950/70 shadow-md ring-2 ring-purple-500/30" 
                            : isOther
                            ? "opacity-40 border-gray-200 dark:border-zinc-800 bg-gray-50/50 cursor-not-allowed"
                            : "border-purple-500/40 hover:border-purple-600 bg-purple-50/80 dark:bg-purple-950/30 hover:bg-purple-100"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors", isSelected ? "bg-purple-700 text-white" : "bg-purple-600 text-white")}>
                            <PhoneCall className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 block">
                                Personal Follow-up
                              </span>
                              {isSelected && (
                                <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider text-purple-800 bg-purple-200 dark:bg-purple-800 dark:text-purple-100 px-2 py-0.5 rounded-full animate-pulse">
                                  Sending...
                                </span>
                              )}
                            </div>
                            <p className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-purple-950">
                              {opt4}
                            </p>
                          </div>
                        </div>
                        {isSelected ? (
                          <div className="flex items-center gap-1.5 text-purple-700 font-bold text-xs">
                            <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                          </div>
                        ) : (
                          <Send className="w-4 h-4 text-purple-600 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                        )}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-gray-50 dark:bg-zinc-900/60 border-t border-gray-100 dark:border-zinc-800 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-800"
              >
                Minimize (Respond Later)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 1.a MINIMIZED FLOATING ICON IN TOP RIGHT (Re-open notification) */}
      {stopRequestAlert && !isStopAlertModalOpen && (
        <div className="fixed top-20 right-4 sm:right-6 z-[99999] animate-in fade-in zoom-in duration-300">
          <button
            onClick={handleReopenModal}
            className={cn(
              "group flex items-center gap-2.5 px-3.5 py-2 rounded-2xl shadow-2xl border-2 transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md ring-2 ring-black/5 animate-pulse",
              stopRequestAlert.type === 'vomiting'
                ? "bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 text-white border-rose-300 shadow-rose-500/40"
                : "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white border-amber-300 shadow-amber-500/40"
            )}
            title="Click to respond to passenger halt request"
          >
            <div className="relative flex items-center justify-center">
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-85"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-300"></span>
              </span>
              <div className="p-1.5 rounded-xl bg-white/20 backdrop-blur-sm">
                {stopRequestAlert.type === 'vomiting' ? (
                  <HeartPulse className="w-4 h-4 text-white animate-pulse" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-white" />
                )}
              </div>
            </div>
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-black tracking-widest text-white/90 leading-tight">
                  Seat {stopRequestAlert.seatNumber}
                </span>
                <span className="text-[9px] font-extrabold uppercase bg-white/25 px-1.5 py-0.5 rounded-full leading-none">
                  Pending
                </span>
              </div>
              <span className="text-xs font-bold text-white leading-tight mt-0.5">
                {stopRequestAlert.type === 'vomiting' ? 'Vomiting Alert' : 'Washroom Request'}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* 2. TICKET BOOKING NOTIFICATION */}
      {notification && (
        <div 
          className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setNotification(null)}
        >
          <div 
            className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border-2 border-emerald-500 overflow-hidden text-gray-900 dark:text-zinc-100 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Top Header Banner */}
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-5 text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center w-12 h-12 bg-white/20 rounded-2xl backdrop-blur-sm shadow-inner">
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400"></span>
                  </span>
                  <Ticket className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider font-extrabold bg-white/25 px-2.5 py-0.5 rounded-full">
                      Live Update
                    </span>
                    <span className="text-xs text-emerald-100 font-medium">
                      {notification.bookedAt}
                    </span>
                  </div>
                  <h2 className="text-xl font-headline font-black tracking-tight text-white mt-0.5">
                    New Ticket Booked!
                  </h2>
                </div>
              </div>

              <button
                onClick={() => setNotification(null)}
                className="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                title="Dismiss notification"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-5">
              {/* 1. SEAT NUMBER DISPLAY (Hero Highlight) */}
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-4 text-center">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-widest block mb-2">
                  {notification.seats.length > 1 ? 'Reserved Seat Numbers' : 'Reserved Seat Number'}
                </span>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {notification.seats.map((seat, idx) => (
                    <div 
                      key={idx}
                      className="px-5 py-2.5 bg-emerald-600 text-white font-headline font-black text-2xl md:text-3xl rounded-xl shadow-md border border-emerald-500 tracking-tight"
                    >
                      Seat {seat}
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. BOARDING LOCATION DISPLAY (Hero Highlight) */}
              <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-sm mt-0.5">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                      Location of Boarding
                    </span>
                    <p className="text-lg font-headline font-black text-gray-900 dark:text-white leading-tight mt-0.5 break-words">
                      {notification.boardingLocation}
                    </p>
                    {notification.boardingTime && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-semibold mt-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Scheduled Time: {notification.boardingTime}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Passenger & Booking Metadata */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 dark:bg-zinc-900 p-3 rounded-xl border border-gray-100 dark:border-zinc-800">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Passenger</span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-white truncate">
                    {notification.passengerName}
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-zinc-900 p-3 rounded-xl border border-gray-100 dark:border-zinc-800">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">
                    <Ticket className="w-3.5 h-3.5 text-emerald-600" />
                    <span>PNR / Ticket</span>
                  </div>
                  <p className="font-mono font-bold text-gray-900 dark:text-white truncate">
                    {notification.pnr || 'CONFIRMED'}
                  </p>
                </div>

                {notification.phone && (
                  <div className="col-span-2 bg-gray-50 dark:bg-zinc-900 p-3 rounded-xl border border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Contact:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{notification.phone}</span>
                    </div>
                    <a 
                      href={`tel:${notification.phone}`}
                      className="text-xs font-bold text-emerald-600 hover:underline"
                    >
                      Call Passenger
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-5 bg-gray-50 dark:bg-zinc-900/60 border-t border-gray-100 dark:border-zinc-800/80 flex flex-col sm:flex-row gap-3">
              {!isCurrentPageTrip && (
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 font-headline font-bold rounded-xl h-12 gap-2 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                  onClick={() => {
                    setNotification(null);
                    router.push(`/cabin-crew/${notification.scheduleId}`);
                  }}
                >
                  <span>Open Trip Console</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}

              <Button
                size="lg"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-headline font-bold rounded-xl h-12 text-base shadow-md hover:shadow-lg transition-all"
                onClick={() => setNotification(null)}
              >
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Acknowledge
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
