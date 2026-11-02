'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, 
  Users, 
  Bus, 
  ShieldAlert, 
  X, 
  ArrowRight, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  Clock 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFirebase, initializeFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import { collection, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface AdminEmergencyState {
  scheduleId: string;
  busId: string;
  timestamp: string;
  seatNumber: string;
  passengerName: string;
  bookingId?: string;
  severe?: boolean;
  severeAt?: string | null;
  active: boolean;
}

export function AdminGlobalMonitor() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isUserLoading } = useFirebase();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState(false);
  const [activeEmergency, setActiveEmergency] = useState<AdminEmergencyState | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const prevEmergencyTimestampRef = useRef<string | null>(null);
  const prevSevereTimestampRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  // Verify admin status
  useEffect(() => {
    if (isUserLoading || !user) {
      setIsAdmin(false);
      return;
    }
    dataService.isAdmin(user.uid).then(status => {
      setIsAdmin(Boolean(status));
    });
  }, [user, isUserLoading]);

  // Audio helper functions
  const playAlarm = () => {
    try {
      if (audioRef.current && !isMutedRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    } catch (e) {}
  };

  const stopAlarm = () => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch (e) {}
  };

  // Timer for elapsed seconds
  useEffect(() => {
    if (!activeEmergency) {
      setElapsedSeconds(0);
      return;
    }

    const startMs = activeEmergency.timestamp ? new Date(activeEmergency.timestamp).getTime() : Date.now();
    const updateElapsed = () => {
      const nowMs = Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((nowMs - startMs) / 1000)));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeEmergency]);

  // Listen to schedules for operator buses
  useEffect(() => {
    if (!isAdmin || !user) return;

    let unsubscribe: (() => void) | undefined;
    const firestoreDb = initializeFirebase().firestore;
    if (!firestoreDb) return;

    dataService.getBusesByOperator(user.uid, user.displayName || '').then(operatorBuses => {
      const operatorBusIds = new Set(operatorBuses.map(b => b.id));

      const schedulesRef = collection(firestoreDb, 'schedules');
      unsubscribe = onSnapshot(schedulesRef, (snapshot) => {
        const activeAlarms: AdminEmergencyState[] = [];

        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (data.busId && operatorBusIds.has(data.busId)) {
            const alarm = data.emergencyAlarm;
            if (alarm && alarm.active) {
              activeAlarms.push({
                scheduleId: docSnap.id,
                busId: data.actualBusId || data.busId,
                timestamp: alarm.timestamp,
                seatNumber: alarm.seatNumber,
                passengerName: alarm.passengerName || 'Passenger',
                bookingId: alarm.bookingId,
                severe: alarm.severe || false,
                severeAt: alarm.severeAt || null,
                active: true,
              });
            }
          }
        });

        if (activeAlarms.length > 0) {
          const primary = activeAlarms[0];

          // Check if this is a newly triggered emergency
          if (primary.timestamp !== prevEmergencyTimestampRef.current) {
            prevEmergencyTimestampRef.current = primary.timestamp;
            // Always reset mute on new emergency arrival!
            setIsMuted(false);
            isMutedRef.current = false;

            toast({
              title: `🚨 EMERGENCY — SEAT ${primary.seatNumber}`,
              description: `Bus ${primary.busId}: ${primary.passengerName} (Seat ${primary.seatNumber}) triggered emergency. Crew alerted.`,
              duration: 60000,
              variant: "destructive",
            });
            playAlarm();
          }

          // Check if escalated to severe
          if (primary.severe && primary.timestamp !== prevSevereTimestampRef.current) {
            prevSevereTimestampRef.current = primary.timestamp;
            toast({
              title: `🔴 PRIORITY — NO CABIN CREW RESPONSE`,
              description: `No response from cabin crew within 3 minutes for Seat ${primary.seatNumber} on Bus ${primary.busId}. IMMEDIATE action required.`,
              duration: 60000,
              variant: "destructive",
            });
            playAlarm();
          }

          setActiveEmergency(primary);
        } else {
          // If no active alarms
          if (prevEmergencyTimestampRef.current !== null) {
            toast({
              title: `✅ Emergency Resolved`,
              description: `Passenger emergency status has been resolved or withdrawn.`,
              duration: 8000,
            });
          }
          prevEmergencyTimestampRef.current = null;
          prevSevereTimestampRef.current = null;
          stopAlarm();
          setActiveEmergency(null);
          setIsMuted(false);
          isMutedRef.current = false;
        }
      }, (err) => {
        console.error("Error listening to admin emergencies:", err);
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
      stopAlarm();
    };
  }, [isAdmin, user, toast]);

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      isMutedRef.current = false;
      playAlarm();
    } else {
      setIsMuted(true);
      isMutedRef.current = true;
      stopAlarm();
    }
  };

  const handleNavigateToEmergencyLogs = () => {
    stopAlarm();
    router.push('/admin/emergency-reports');
  };

  if (!isAdmin) return null;

  return (
    <>
      <audio 
        ref={audioRef} 
        src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" 
        loop 
        preload="auto" 
      />

      <AnimatePresence>
        {activeEmergency && (
          <motion.div
            key="admin-global-emergency-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-8"
            style={{ backdropFilter: 'blur(16px)', backgroundColor: 'rgba(0,0,0,0.88)' }}
          >
            <motion.div
              initial={{ scale: 0.85, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0, filter: 'blur(10px)' }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="relative w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-[0_0_120px_rgba(220,38,38,0.5)] border-4 border-red-500"
              style={{ background: '#0a0000' }}
            >
              {/* Hazard Stripes Pattern */}
              <div 
                className="absolute inset-0 opacity-15 pointer-events-none"
                style={{
                  backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 20px, #ff0000 20px, #ff0000 40px)`
                }}
              />

              {/* Pulsing Red Edge Glow */}
              <motion.div
                className="absolute inset-0 rounded-[2.5rem] pointer-events-none border-8 border-red-600/50"
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />

              {/* Top Controls: Sound Mute & Close */}
              <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleToggleMute}
                  className="rounded-full bg-black/60 border-red-500/50 text-white hover:bg-red-950 hover:text-white px-3.5 h-10 gap-1.5"
                >
                  {isMuted ? (
                    <>
                      <Volume2 className="h-4 w-4 text-amber-400" />
                      <span className="text-xs font-bold">Unmute</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="h-4 w-4 text-red-400" />
                      <span className="text-xs font-bold">Mute Sound</span>
                    </>
                  )}
                </Button>
                
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => {
                    stopAlarm();
                    setActiveEmergency(null);
                  }} 
                  className="text-white border-red-500/50 hover:bg-red-500 hover:text-white rounded-full h-10 w-10 bg-black/60 backdrop-blur-md"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Modal Content */}
              <div className="relative z-10 p-7 sm:p-10 flex flex-col items-center text-center gap-5">
                {/* Siren Animation */}
                <div className="relative mt-2">
                  <motion.div
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-red-600 flex items-center justify-center border-4 border-white shadow-[0_0_50px_rgba(220,38,38,0.9)]"
                    animate={{ scale: [1, 1.12, 1], rotate: [-4, 4, -4] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  >
                    <AlertTriangle className="w-12 h-12 sm:w-14 sm:h-14 text-white" strokeWidth={2.5} />
                  </motion.div>
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white text-red-700 text-xs font-black px-3.5 py-1 rounded-full shadow-xl border-2 border-red-500 whitespace-nowrap">
                    HIGH PRIORITY ALERT
                  </div>
                </div>

                {/* Main Heading */}
                <div className="mt-2">
                  <motion.div
                    className="inline-block bg-red-950 text-red-200 text-xs font-black tracking-[0.3em] uppercase px-4 py-1 rounded-full mb-3 border border-red-500"
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  >
                    Immediate Operator Attention
                  </motion.div>
                  <h2 className="text-4xl sm:text-6xl font-black text-white leading-tight tracking-tight drop-shadow-2xl">
                    SEAT <span className="text-red-500">{activeEmergency.seatNumber}</span>
                  </h2>
                </div>

                {/* Details Card */}
                <div className="w-full bg-red-950/60 rounded-2xl p-5 sm:p-6 border border-red-800/80 text-left shadow-inner">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-red-400 text-xs uppercase font-black tracking-widest mb-1 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Passenger in Distress
                      </p>
                      <p className="text-white font-bold text-lg sm:text-xl truncate">{activeEmergency.passengerName}</p>
                    </div>
                    <div>
                      <p className="text-red-400 text-xs uppercase font-black tracking-widest mb-1 flex items-center gap-1.5">
                        <Bus className="w-3.5 h-3.5" /> Assigned Bus
                      </p>
                      <p className="text-white font-bold text-lg sm:text-xl truncate">{activeEmergency.busId}</p>
                    </div>
                  </div>

                  {/* Elapsed Timer */}
                  <div className="mt-4 pt-3 border-t border-red-900/80 flex items-center justify-between text-xs font-bold text-red-300">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-red-400" />
                      Active Duration:
                    </span>
                    <span className="font-mono text-sm text-white font-black bg-black/40 px-2.5 py-0.5 rounded-lg border border-red-800">
                      {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
                    </span>
                  </div>

                  {/* Severe Escalation Notice */}
                  {activeEmergency.severe && (
                    <div className="mt-4 bg-red-900/90 border-2 border-red-500 p-3.5 rounded-xl animate-pulse">
                      <p className="text-white font-black text-center uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-red-200 shrink-0" />
                        CRITICAL: No Crew Response within 3 Minutes
                      </p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                  <Button
                    onClick={handleNavigateToEmergencyLogs}
                    className="w-full h-14 bg-red-600 hover:bg-red-700 text-white font-black text-base tracking-wide rounded-2xl shadow-lg border-2 border-red-400 uppercase flex items-center justify-center gap-2"
                  >
                    <span>Open Emergency Logs</span>
                    <ArrowRight className="w-5 h-5" />
                  </Button>

                  <Button
                    onClick={() => {
                      stopAlarm();
                      setActiveEmergency(null);
                    }}
                    variant="outline"
                    className="w-full h-14 bg-white/10 hover:bg-white/20 text-white font-bold text-base rounded-2xl border-white/20 uppercase"
                  >
                    Acknowledge
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
