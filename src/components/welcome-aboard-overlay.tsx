'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Sparkles, 
  CheckCircle2, 
  Navigation, 
  ShieldAlert, 
  BellRing, 
  Armchair
} from 'lucide-react';

interface WelcomeAboardOverlayProps {
  passengerName?: string;
  seatNumber?: string;
  destination?: string;
  busName?: string;
  durationSeconds?: number;
  onComplete: () => void;
  onGoToConsole?: () => void;
  onGoToTracking?: () => void;
}

export function WelcomeAboardOverlay({
  passengerName = 'Passenger',
  seatNumber,
  destination,
  busName,
  durationSeconds = 3,
  onComplete,
  onGoToConsole,
  onGoToTracking
}: WelcomeAboardOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(durationSeconds);
  const audioPlayedRef = useRef(false);

  // Play pleasant celebratory boarding chime
  useEffect(() => {
    if (audioPlayedRef.current) return;
    audioPlayedRef.current = true;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        if (ctx.state === 'suspended') {
          ctx.resume();
        }

        const playTone = (freq: number, startDelay: number, duration: number, type: OscillatorType = 'sine') => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = type;
          osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);

          gain.gain.setValueAtTime(0.25, ctx.currentTime + startDelay);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(ctx.currentTime + startDelay);
          osc.stop(ctx.currentTime + startDelay + duration);
        };

        // Rising celebratory 3-tone chime (C5 -> E5 -> G5)
        playTone(523.25, 0.0, 0.25);
        playTone(659.25, 0.18, 0.25);
        playTone(783.99, 0.36, 0.45);
      }
    } catch (e) {
      console.warn('Welcome chime playback error:', e);
    }
  }, []);

  // 3-second animated progress timer
  useEffect(() => {
    const startTime = Date.now();
    const totalMs = durationSeconds * 1000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / totalMs) * 100);
      const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));

      setProgress(pct);
      setSecondsRemaining(remaining);

      if (elapsed >= totalMs) {
        clearInterval(interval);
        onComplete();
      }
    }, 40);

    return () => clearInterval(interval);
  }, [durationSeconds, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.4, ease: 'easeInOut' } }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/70 dark:bg-zinc-950/85 backdrop-blur-xl p-4 sm:p-6 overflow-hidden select-none"
    >
      {/* Animated Background Ambience matching BharatBus theme */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div 
          animate={{ scale: [1, 1.15, 1], rotate: [0, 180, 360], opacity: [0.35, 0.5, 0.35] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-[15%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-indigo-300/25 blur-[100px]"
        />
        <motion.div 
          animate={{ scale: [1.15, 1, 1.15], rotate: [360, 180, 0], opacity: [0.35, 0.5, 0.35] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute -bottom-[15%] -right-[10%] w-[55vw] h-[55vw] rounded-full bg-rose-300/25 blur-[100px]"
        />
      </div>

      {/* Main Glassmorphic BharatBus Card */}
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 240 }}
        className="relative z-10 w-full max-w-lg bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-gray-200/80 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center overflow-hidden ring-1 ring-black/5"
      >
        {/* Top BharatBus Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-600 via-rose-500 to-red-600" />

        {/* Top Verified Pill */}
        <motion.div 
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-headline font-black uppercase tracking-wider mb-5 shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-rose-500 animate-spin" />
          <span>Boarding Verified • Access Unlocked</span>
        </motion.div>

        {/* Central Icon Illustration */}
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 16, stiffness: 260, delay: 0.15 }}
          className="relative flex items-center justify-center w-20 h-20 mb-5"
        >
          <span className="absolute inset-0 rounded-full bg-rose-400/20 animate-ping opacity-75" />
          <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400 ring-8 ring-rose-50/70 dark:ring-rose-950/40 shadow-inner border border-rose-200/60 dark:border-rose-800/40">
            <CheckCircle2 className="w-10 h-10" />
          </div>
        </motion.div>

        {/* Headings */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h1 className="text-3xl sm:text-4xl font-headline font-black tracking-tight pb-1 bg-gradient-to-r from-indigo-600 via-rose-500 to-red-600 bg-clip-text text-transparent">
            Welcome Aboard!
          </h1>
          
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            <span className="text-base sm:text-lg font-headline font-bold text-gray-800 dark:text-zinc-100">
              {passengerName}
            </span>
            {seatNumber && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/60 font-headline font-black text-sm shadow-sm">
                <Armchair className="w-3.5 h-3.5" />
                Seat {seatNumber}
              </span>
            )}
          </div>

          <p className="text-xs sm:text-sm text-gray-600 dark:text-zinc-400 mt-2.5 max-w-sm mx-auto leading-relaxed">
            You are officially checked in. Your in-trip Passenger Console, live destination tracker, and onboard emergency features are now active.
          </p>
        </motion.div>

        {/* Unlocked Features Preview Grid */}
        <motion.div 
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="w-full grid grid-cols-3 gap-2.5 my-5 text-left"
        >
          <div className="bg-gray-50/90 dark:bg-zinc-800/60 border border-gray-100 dark:border-zinc-800 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center text-center">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl mb-1.5">
              <Navigation className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-headline font-bold text-gray-900 dark:text-white leading-tight">Live Tracking</span>
            <span className="text-[9px] text-gray-500 dark:text-zinc-400 mt-0.5">Real-time GPS</span>
          </div>

          <div className="bg-gray-50/90 dark:bg-zinc-800/60 border border-gray-100 dark:border-zinc-800 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center text-center">
            <div className="p-2 bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 rounded-xl mb-1.5">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-headline font-bold text-gray-900 dark:text-white leading-tight">Emergency SOS</span>
            <span className="text-[9px] text-gray-500 dark:text-zinc-400 mt-0.5">Instant crew alert</span>
          </div>

          <div className="bg-gray-50/90 dark:bg-zinc-800/60 border border-gray-100 dark:border-zinc-800 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center text-center">
            <div className="p-2 bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-xl mb-1.5">
              <BellRing className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-headline font-bold text-gray-900 dark:text-white leading-tight">Arrival Alarms</span>
            <span className="text-[9px] text-gray-500 dark:text-zinc-400 mt-0.5">Wakeup alerts</span>
          </div>
        </motion.div>

        {/* Action Buttons for Passenger */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4 mb-3">
          {onGoToConsole && (
            <button
              onClick={onGoToConsole}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-headline font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <Armchair className="w-4 h-4" />
              <span>Passenger Console</span>
            </button>
          )}
          {onGoToTracking && (
            <button
              onClick={onGoToTracking}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-headline font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <Navigation className="w-4 h-4" />
              <span>Live Tracking</span>
            </button>
          )}
        </div>

        {/* 3-Second Countdown & Progress Bar */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="w-full space-y-1.5 pt-1"
        >
          <div className="flex justify-between items-center text-xs font-headline font-bold text-gray-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-[11px]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
              </span>
              Closing in {secondsRemaining}s
            </span>
            <button 
              onClick={onComplete}
              className="text-[11px] font-bold text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 underline"
            >
              Dismiss
            </button>
          </div>

          {/* Glowing Progress Track */}
          <div className="w-full h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-gray-200/50 dark:border-zinc-700">
            <motion.div 
              className="h-full bg-gradient-to-r from-indigo-600 via-rose-500 to-red-600 rounded-full shadow-sm"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
