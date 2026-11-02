'use client';

import React, { use, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle, ShieldAlert, UserX, XCircle, Clock, CheckCircle2 } from 'lucide-react';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Booking } from '@/lib/types';
import { dataService } from '@/lib/data/client-service';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Animated Bell SVG ─────────────────────────────────────────── */
function BellIcon({ size = 84, ringing = false }: { size?: number; ringing?: boolean }) {
  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
      animate={ringing ? { rotate: [-18, 18, -14, 14, -8, 8, 0] } : { rotate: 0 }}
      transition={ringing ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.2 } : {}}
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      {ringing && <>
        <motion.line x1="20" y1="4" x2="22" y2="2" strokeWidth={1.5}
          animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 0.2 }} />
        <motion.line x1="4" y1="4" x2="2" y2="2" strokeWidth={1.5}
          animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 0.2, delay: 0.1 }} />
        <motion.line x1="22" y1="12" x2="24" y2="12" strokeWidth={1.5}
          animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 0.2, delay: 0.05 }} />
      </>}
    </motion.svg>
  );
}

/* ── Ripple Ring ───────────────────────────────────────────────── */
function Ripple({ delay }: { delay: number }) {
  return (
    <motion.span
      className="absolute rounded-full border-2 border-red-500 pointer-events-none"
      style={{ width: 220, height: 220, top: '50%', left: '50%', x: '-50%', y: '-50%' }}
      animate={{ scale: [1, 2.8], opacity: [0.65, 0] }}
      transition={{ duration: 1.8, delay, repeat: Infinity, ease: 'easeOut' }}
    />
  );
}

/* ── Timer Arc ─────────────────────────────────────────────────── */
function TimerArc({ timeLeft, total = 180 }: { timeLeft: number; total?: number }) {
  const r = 120;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - timeLeft / total);
  const stroke = timeLeft > 60 ? '#22c55e' : timeLeft > 30 ? '#f59e0b' : '#ef4444';
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 280 280">
      <circle cx={140} cy={140} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
      <circle cx={140} cy={140} r={r} fill="none" stroke={stroke} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        transform="rotate(-90 140 140)"
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }} />
    </svg>
  );
}

/* ── Main Page ─────────────────────────────────────────────────── */
function EmergencyPageContent({ id }: { id: string }) {
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [isActive, setIsActive] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180);
  const [showInfo, setShowInfo] = useState(true);
  const [tapAnim, setTapAnim] = useState(false);
  const prevAlarmTs = useRef<string | null>(null);
  const dbRef = useRef<any>(null);

  const getDb = useCallback(() => {
    if (!dbRef.current) {
      const { firestore } = initializeFirebase();
      dbRef.current = firestore;
    }
    return dbRef.current;
  }, []);

  // Load booking — stored in publicBookings collection
  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'publicBookings', id), (snap) => {
      if (snap.exists()) {
        setBooking({ id: snap.id, ...snap.data() } as Booking);
      } else {
        // Fallback: try users subcollection via booking_lookups
        console.warn('Booking not found in publicBookings for id:', id);
      }
    });
    return () => unsub();
  }, [id, getDb]);

  // Listen to schedule
  useEffect(() => {
    if (!booking?.scheduleId) return;
    const db = getDb();
    const unsub = onSnapshot(doc(db, 'schedules', booking.scheduleId), (snap) => {
      if (!snap.exists()) return;
      const sched = snap.data();
      setScheduleData(sched);
      const alarm = sched.emergencyAlarm;
      if (alarm?.active && alarm?.bookingId === id) {
        setIsActive(true);
        setIsSending(false);
      } else {
        setIsActive(false);
        setIsSending(false);
        setTimeLeft(180);
      }
    });
    return () => unsub();
  }, [booking?.scheduleId, id, getDb]);

  // Countdown
  useEffect(() => {
    if (!isActive) return;
    if (timeLeft <= 0) {
      if (booking && scheduleData && !scheduleData.emergencyAlarm?.severe) {
        updateDoc(doc(getDb(), 'schedules', booking.scheduleId), {
          'emergencyAlarm.severe': true,
          'emergencyAlarm.severeAt': new Date().toISOString(),
        }).catch(console.error);
      }
      return;
    }
    const t = setInterval(() => setTimeLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [isActive, timeLeft, booking, scheduleData, getDb]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleTap = async () => {
    if (isActive || isSending) return;
    if (!booking) {
      console.warn('No booking loaded yet — cannot send emergency');
      return;
    }
    if (!booking.scheduleId) {
      console.error('Booking has no scheduleId:', booking);
      return;
    }

    // Trigger local animation immediately
    setTapAnim(true);
    setIsSending(true);
    setTimeout(() => setTapAnim(false), 400);

    const db = getDb();
    try {
      await updateDoc(doc(db, 'schedules', booking.scheduleId), {
        emergencyAlarm: {
          active: true,
          severe: false,
          withdrawn: false,
          timestamp: new Date().toISOString(),
          seatNumber: booking.passengers?.[0]?.seatNumber ?? 'Unknown',
          passengerName: booking.passengers?.[0]?.name ?? 'Unknown',
          bookingId: id,
        },
      });
      // isActive will be set to true by the onSnapshot listener
    } catch (err) {
      console.error('Emergency write failed:', err);
      setIsSending(false);
    }
  };

  const handleMarkResponded = async () => {
    if (!booking || !isActive || !scheduleData?.emergencyAlarm) return;
    try {
        await dataService.respondToEmergency(booking.scheduleId, scheduleData.emergencyAlarm);
    } catch (err) {
        console.error('Failed to mark as responded:', err);
    }
  };

  const handleWithdraw = async () => {
    if (!booking || !isActive) return;
    try {
      await dataService.withdrawEmergency(
        booking.scheduleId,
        scheduleData?.emergencyAlarm || {
          timestamp: new Date().toISOString(),
          seatNumber: booking.passengers?.[0]?.seatNumber ?? 'Unknown',
          passengerName: booking.passengers?.[0]?.name ?? 'Unknown',
          bookingId: id,
        }
      );
    } catch (err) {
      console.error('Withdraw failed:', err);
    }
  };

  const isSevere = isActive && scheduleData?.emergencyAlarm?.severe;

  return (
    <div
      className="min-h-screen font-sans flex flex-col relative overflow-hidden select-none"
      style={{
        background: isActive
          ? 'linear-gradient(180deg, #1a0000 0%, #2d0000 100%)'
          : '#fafafa',
        transition: 'background 0.6s'
      }}
    >
      {/* Red radial glow — active only */}
      <AnimatePresence>
        {isActive && (
          <motion.div key="glow" className="absolute inset-0 pointer-events-none z-0"
            initial={{ opacity: 0 }} animate={{ opacity: [0.4, 0.8, 0.4] }} exit={{ opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(200,0,0,0.4) 0%, transparent 70%)' }}
          />
        )}
      </AnimatePresence>

      {/* Idle wavy footer */}
      {!isActive && (
        <div className="absolute bottom-0 left-0 w-full h-40 pointer-events-none z-0 opacity-50">
          <svg viewBox="0 0 1440 200" className="w-full h-full" preserveAspectRatio="none">
            <path fill="none" stroke="#fca5a5" strokeWidth="1" d="M0,150 C360,250 600,50 960,130 C1200,190 1380,100 1440,80" />
            <path fill="none" stroke="#ef4444" strokeWidth="2" d="M0,170 C400,280 650,60 1000,160 C1250,230 1380,120 1440,100" />
          </svg>
        </div>
      )}

      <div className="relative z-10 max-w-md mx-auto w-full flex flex-col flex-1 px-6 pt-8 pb-24">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => router.push(`/track/${id}/console`)}
            className={`p-2 -ml-2 rounded-full transition-colors ${isActive ? 'text-white/70 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <span className={`text-sm font-bold absolute left-1/2 -translate-x-1/2 ${isActive ? 'text-white/80' : 'text-slate-800'}`}>
            Emergency Alarm
          </span>
          <div className="w-8" />
        </div>

        {/* Info card — idle only */}
        <AnimatePresence>
          {showInfo && !isActive && (
            <motion.div key="info"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, overflow: 'hidden', marginBottom: 0 }}
              className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span className="font-bold text-amber-900 text-sm">When to use this alarm</span>
                </div>
                <button onClick={() => setShowInfo(false)}><XCircle className="w-4 h-4 text-amber-400" /></button>
              </div>
              <ul className="space-y-2">
                {[
                  { Icon: UserX, color: 'text-amber-600', text: <>You are the <strong>last passenger</strong> and feel unsafe or uncomfortable with cabin crew.</> },
                  { Icon: AlertTriangle, color: 'text-red-500', text: <><strong>Misbehaviour or harassment</strong> from cabin crew — physical or verbal.</> },
                  { Icon: ShieldAlert, color: 'text-amber-600', text: <>Any <strong>severe on-board security threat</strong> needing immediate help.</> },
                ].map(({ Icon, color, text }, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-amber-800 leading-relaxed">
                    <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${color}`} />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] font-black text-red-600 tracking-wide uppercase">⚠ Use only for genuine, serious emergencies</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status text area */}
        <div className="min-h-[150px] flex flex-col items-center justify-end pb-4">
          <AnimatePresence mode="wait">
            {!isActive ? (
              <motion.div key="idle-text" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-center space-y-3">
                <p className="text-[10px] font-bold tracking-[0.3em] text-slate-400 uppercase">Your Safety<br />Comes First</p>
                <h2 className="text-[36px] font-black tracking-tight leading-none text-[#0a192f]">
                  Tap in an<br /><span className="text-red-600">Emergency</span>
                </h2>
                <p className="text-[12px] text-slate-500 max-w-[250px] mx-auto leading-relaxed">
                  {isSending ? '⏳ Sending alert to cabin crew…' : 'Use only for severe safety threats or crew misconduct.'}
                </p>
              </motion.div>
            ) : (
              <motion.div key="active-text" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-center space-y-3">
                {/* small ringing bell */}
                <motion.div className="mx-auto w-12 h-12 rounded-full bg-red-600/30 flex items-center justify-center border border-red-500/40"
                  animate={{ scale: [1, 1.12, 1], boxShadow: ['0 0 0 0 rgba(239,68,68,0.5)', '0 0 0 12px rgba(239,68,68,0)', '0 0 0 0 rgba(239,68,68,0)'] }}
                  transition={{ duration: 1.2, repeat: Infinity }}>
                  <BellIcon size={26} ringing={true} />
                </motion.div>
                {isSevere && (
                  <motion.p className="bg-red-800 text-white text-[11px] font-black tracking-wider px-4 py-1 rounded-lg inline-block"
                    animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 0.7, repeat: Infinity }}>
                    🔴 ADMIN ALERTED — PRIORITY
                  </motion.p>
                )}
                <h2 className="text-[34px] font-black tracking-tight leading-none">
                  <motion.span className="text-red-400" animate={{ opacity: [1, 0.7, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>ALERT</motion.span>{' '}
                  <span className="text-white">ACTIVATED</span>
                </h2>
                <p className="text-[12px] text-red-200/70 max-w-[250px] mx-auto leading-relaxed">
                  Emergency alert sent to cabin crew and bus operator.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ─── BUTTON AREA ─── */}
        <div className="relative flex items-center justify-center" style={{ height: 300 }}>

          {/* Ripple rings */}
          {isActive && <>
            <Ripple delay={0} />
            <Ripple delay={0.45} />
            <Ripple delay={0.9} />
            <Ripple delay={1.35} />
          </>}

          {/* Timer arc */}
          {isActive && (
            <>
              <div className="absolute" style={{ width: 280, height: 280 }}>
                <TimerArc timeLeft={timeLeft} total={180} />
              </div>
              <div className="absolute top-2 right-10 flex flex-col items-center bg-black/40 rounded-xl px-2 py-1">
                <Clock className="w-3 h-3 text-white/50 mb-0.5" />
                <span className={`text-[12px] font-black tabular-nums ${timeLeft < 30 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                  {fmt(timeLeft)}
                </span>
              </div>
            </>
          )}

          {/* Big 3D Button — single click target */}
          <motion.button
            onClick={handleTap}
            disabled={isActive || isSending}
            animate={tapAnim ? { scale: [1, 0.88, 1.06, 1] } : isActive ? { scale: [1, 1.02, 1] } : { scale: 1 }}
            transition={tapAnim ? { duration: 0.35 } : isActive ? { duration: 1.4, repeat: Infinity } : {}}
            className="relative z-10 rounded-full overflow-hidden focus:outline-none disabled:cursor-default"
            style={{
              width: 224,
              height: 224,
              background: 'linear-gradient(145deg, #555 0%, #111 100%)',
              padding: 14,
              boxShadow: isActive
                ? '0 0 70px rgba(220,0,0,0.8), 0 20px 50px rgba(0,0,0,0.7)'
                : '0 20px 50px rgba(0,0,0,0.45)',
              transition: 'box-shadow 0.5s',
            }}
          >
            {/* Outer ring highlight */}
            <div className="absolute inset-0 rounded-full border border-white/10 pointer-events-none" />

            {/* Neon glow ring */}
            <AnimatePresence>
              {isActive && (
                <motion.div
                  key="neon-ring"
                  className="absolute inset-[11px] rounded-full border-[3px] border-red-500 pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  style={{ boxShadow: '0 0 22px #ef4444, inset 0 0 22px #ef4444' }}
                />
              )}
            </AnimatePresence>

            {/* Red surface */}
            <div
              className="relative w-full h-full rounded-full flex items-center justify-center overflow-hidden"
              style={{
                background: isActive
                  ? 'radial-gradient(circle at 45% 28%, #ff3333 0%, #cc0000 55%, #5a0000 100%)'
                  : 'radial-gradient(circle at 50% 28%, #ef4444 0%, #b91c1c 60%, #7f1d1d 100%)',
                boxShadow: 'inset 0 -10px 22px rgba(0,0,0,0.55), inset 0 8px 18px rgba(255,255,255,0.28)',
                transition: 'background 0.5s',
              }}
            >
              {/* Sheen */}
              <div className="absolute top-[12%] left-[16%] w-[38%] h-[28%] bg-white/20 rounded-full blur-md pointer-events-none" />
              {/* Bell */}
              <BellIcon size={86} ringing={isActive} />
            </div>
          </motion.button>
        </div>

        {/* Status label */}
        <div className="flex flex-col items-center mt-4 min-h-[32px]">
          <AnimatePresence mode="wait">
            {!isActive ? (
              <motion.p key="lbl-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[11px] font-bold tracking-[0.25em] text-slate-500 uppercase">
                {isSending ? 'Sending…' : 'Emergency Alarm'}
              </motion.p>
            ) : (
              <motion.p key="lbl-active"
                className="text-[11px] font-bold tracking-[0.25em] text-red-400 uppercase"
                animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>
                Help is on the way
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Withdraw button */}
        <AnimatePresence>
          {isActive && (
            <motion.div key="withdraw"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
              className="mt-8 w-full"
            >
              <div className="flex flex-col gap-3">
                {/* Mark as Responded / Resolved */}
                <button
                  onClick={handleMarkResponded}
                  className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-[15px] tracking-wide active:scale-95 transition-transform shadow-xl"
                  style={{
                    background: 'linear-gradient(to right, #10b981, #059669)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.2)'
                  }}
                >
                  <CheckCircle2 className="w-5 h-5 text-green-100" />
                  Mark as Resolved (Crew Arrived)
                </button>

                {/* Withdraw / Mistake */}
                <button
                  onClick={handleWithdraw}
                  className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm text-white/90 tracking-wide active:scale-95 transition-transform"
                  style={{
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <XCircle className="w-4 h-4 text-red-400" />
                  Cancel Alarm (Mistake)
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Footer */}
      <p className={`absolute bottom-5 w-full text-center text-[9px] font-bold tracking-[0.3em] uppercase z-10 pointer-events-none ${isActive ? 'text-white/25' : 'text-slate-400'}`}>
        Travel Safer Together
      </p>
    </div>
  );
}

export default function EmergencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EmergencyPageContent id={id} />;
}
