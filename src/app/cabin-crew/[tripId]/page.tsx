'use client';

import React, { useEffect, useState, useMemo, use, Suspense, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Phone, MapPin, Users, RefreshCw, Search,
  CheckCircle, Ban, MoreVertical, LogOut, UserCheck, UserX,
  Clock, Bus, Calendar, ChevronRight, Filter, LayoutDashboard,
  Users2, BarChart3, Settings, Download, Printer, MessageCircle, AlertCircle, LifeBuoy,
  Route as RouteIcon, ArrowRight, Armchair, Sparkles, Loader2, RotateCcw, X, Ticket, XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import type { Schedule, Bus as BusType, Passenger, Point } from '@/lib/types';
import { dataService } from '@/lib/data/client-service';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { TooltipProvider } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { IndianSleeper36Layout } from '@/components/ui/indian-sleeper-36-layout';
import { SlideToBoard } from '@/components/ui/slide-to-board';
import { Textarea } from '@/components/ui/textarea';
import { refineCrewMessage } from '@/ai/flows/refine-crew-message';
import { analyzeIncident } from '@/ai/flows/analyze-incident';
import { Label } from '@/components/ui/label';
import { initializeFirebase } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Service } from '@/lib/types';

interface DetailedPassenger extends Passenger {
    boarded?: boolean;
    deboarded?: boolean;
    bookingId: string;
    boardingPoint: string;
    boardingSubPoint?: string;
    droppingPoint: string;
    droppingSubPoint?: string;
    phone: string;
    pnr?: string;
    email?: string;
    age?: number;
    gender?: string;
    generatedBy?: 'crew' | 'owner' | 'user';
    boardingTime?: string;
    droppingTime?: string;
}

interface SubPointGroup {
    subPointName: string;
    passengers: DetailedPassenger[];
    mainPoint: string;
}

interface MainPointGroup {
    mainPoint: string;
    subPoints: SubPointGroup[];
    totalCount: number;
    boardedCount: number;
    deboardedCount: number;
}

interface TripStats {
    total: number;
    boarded: number;
    pending: number;
    deboarded: number;
    occupancyRate: number;
    onTimePerformance: number;
    averageAge?: number;
    genderDistribution: { male: number; female: number; other: number };
}

function EmptyState({ title, description, icon: Icon = Users }: { title: string, description: string, icon?: any }) {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
      <div className="w-16 h-16 mx-auto bg-gray-50 rounded-full flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-sm mx-auto">{description}</p>
    </div>
  );
}

function SubPointSection({ subPoint, passengers, type, onAction, newPassengerIds }: { 
  subPoint: string, 
  passengers: DetailedPassenger[], 
  type: 'boarding' | 'dropping', 
  onAction: (passenger: DetailedPassenger, action: 'board' | 'deboard' | 'no-show' | 'unboard') => void,
  newPassengerIds: Set<string>
}) {
    const boardedCount = passengers.filter(p => p.boarded).length;
    const deboardedCount = passengers.filter(p => p.deboarded).length;
    
    // In Boarding tab, pending means haven't boarded yet.
    // In Dropping tab, pending means on bus but haven't dropped yet.
    const pendingCount = type === 'boarding' 
        ? passengers.filter(p => !p.boarded).length 
        : passengers.filter(p => p.boarded && !p.deboarded).length;

    return (
        <div className="border-t border-gray-100 first:border-t-0">
            <div className="p-4">
                {/* Sub-point header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 bg-gray-100 rounded-md flex items-center justify-center">
                            <MapPin className="h-3.5 w-3.5 text-gray-600" />
                        </div>
                        <span className="font-bold text-red-600">
                            {subPoint === 'Main Stop' ? 'Main Stop' : subPoint}
                        </span>
                        <Badge variant="outline" className="ml-2 bg-white">
                            {passengers.length} passengers
                        </Badge>
                    </div>
                    
                    {/* Sub-point stats */}
                    <div className="flex items-center gap-3 text-xs">
                        {boardedCount > 0 && (
                            <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="h-3 w-3" />
                                {boardedCount} boarded
                            </span>
                        )}
                        {pendingCount > 0 && (
                            <span className="flex items-center gap-1 text-yellow-600">
                                <Clock className="h-3 w-3" />
                                {type === 'boarding' ? `${pendingCount} pending` : `${pendingCount} on bus`}
                            </span>
                        )}
                        {deboardedCount > 0 && (
                            <span className="flex items-center gap-1 text-gray-600">
                                <LogOut className="h-3 w-3" />
                                {deboardedCount} deboarded
                            </span>
                        )}
                    </div>
                </div>

                {/* Passengers list */}
                <div className="space-y-2">
                    {passengers.map((passenger) => {
                        const avatarContent =
                            passenger.gender === 'male' ? 'M' :
                            passenger.gender === 'female' ? 'F' :
                            passenger.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                        
                        const avatarColor =
                            passenger.gender === 'male' ? 'bg-blue-100 text-blue-700' :
                            passenger.gender === 'female' ? 'bg-pink-100 text-pink-700' :
                            'bg-gray-100 text-gray-600';
                        
                        const isNew = newPassengerIds.has(`${passenger.bookingId}-${passenger.seatNumber}`);

                        return (
                            <div
                                key={`${passenger.bookingId}-${passenger.seatNumber}`}
                                className={cn(
                                    "group flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all",
                                    isNew && "animate-highlight-new"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                                        <AvatarFallback className={cn("text-sm font-bold", avatarColor)}>
                                            {avatarContent}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-black font-headline">
                                                {passenger.name}
                                            </span>
                                            {passenger.pnr && (
                                                <span className="text-xs font-mono font-bold text-violet-600">
                                                    PNR: {passenger.pnr}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                                            {type === 'boarding' ? (
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" />
                                                    To: {passenger.droppingPoint}
                                                    {passenger.droppingSubPoint && ` (${passenger.droppingSubPoint})`}
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" />
                                                    From: {passenger.boardingPoint}
                                                    {passenger.boardingSubPoint && ` (${passenger.boardingSubPoint})`}
                                                </span>
                                            )}
                                            <span>•</span>
                                            <a href={`tel:${passenger.phone}`} className="flex items-center gap-1 text-gray-500 hover:text-primary transition-colors font-bold font-headline">
                                                <Phone className="h-3 w-3" />
                                                {passenger.phone}
                                            </a>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-headline font-bold">
                                            Seat {passenger.seatNumber}
                                        </Badge>
                                        <Badge className="bg-gray-100 text-gray-600 border-gray-200 font-headline font-semibold text-[10px]">
                                            {passenger.generatedBy === 'crew' || passenger.generatedBy === 'owner' ? 'Owner' : 'Bushive'}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {type === 'boarding' ? (
                                            !passenger.boarded ? (
                                                <>
                                                    <SlideToBoard 
                                                        onComplete={() => onAction(passenger, 'board')} 
                                                        text="Slide to Board" 
                                                    />
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem className="text-destructive gap-2" onClick={() => onAction(passenger, 'no-show')}>
                                                                <Ban className="h-4 w-4" />
                                                                <span>Mark as No-Show</span>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="px-3 py-1.5 rounded-md bg-green-600 text-white border border-green-700 flex items-center text-sm font-bold shadow-sm">
                                                        <CheckCircle className="h-4 w-4 mr-2" />
                                                        Boarded
                                                    </div>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem className="text-destructive gap-2" onClick={() => onAction(passenger, 'unboard')}>
                                                                <UserX className="h-4 w-4" />
                                                                <span>Mark as Not Boarded</span>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </>
                                            )
                                        ) : (
                                            /* type === 'dropping' */
                                            passenger.boarded && !passenger.deboarded ? (
                                                <>
                                                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white font-bold" onClick={() => onAction(passenger, 'deboard')}>
                                                        <LogOut className="h-4 w-4 mr-2" />
                                                        Deboarded
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem className="text-destructive gap-2" onClick={() => onAction(passenger, 'unboard')}>
                                                                <UserX className="h-4 w-4" />
                                                                <span>Mark as Not Boarded</span>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </>
                                            ) : passenger.deboarded ? (
                                                <div className="px-3 py-1.5 rounded-md bg-green-50 text-green-700 border border-green-200 flex items-center text-sm font-bold">
                                                    <LogOut className="h-4 w-4 mr-2" />
                                                    Deboarded
                                                </div>
                                            ) : (
                                                <div className="px-3 py-1.5 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-200 flex items-center text-sm font-bold opacity-50">
                                                    <Clock className="h-4 w-4 mr-2" />
                                                    Waiting
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}

function TripConsolePageContent({ tripId }: { tripId: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    
    // State
    const [schedule, setSchedule] = useState<Schedule | null>(null);
    const [bus, setBus] = useState<BusType | null>(null);
    const [service, setService] = useState<any>(null);
    const [passengers, setPassengers] = useState<DetailedPassenger[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState<TripStats>({
      total: 0,
      boarded: 0,
      pending: 0,
      deboarded: 0,
      occupancyRate: 0,
      onTimePerformance: 0,
      genderDistribution: { male: 0, female: 0, other: 0 }
    });
    
    const [activeTab, setActiveTab] = useState<'boarding' | 'dropping' | 'summary'>('boarding');
    const [currentTab, setCurrentTab] = useState<string>(searchParams.get('tab') || 'boarding');
    const [activeBerth, setActiveBerth] = useState<'lower' | 'upper'>('lower');

    useEffect(() => {
        const tabFromUrl = searchParams.get('tab');
        if (tabFromUrl) {
            setCurrentTab(tabFromUrl);
        }
    }, [searchParams]);
    
    // Incident Reports State
    const [incidentReportsText, setIncidentReportsText] = useState<Record<string, string>>({});
    const [analyzingIncident, setAnalyzingIncident] = useState<string | null>(null);

    const emergencyHistoryWithWithdrawn = useMemo(() => {
        const list = [...(schedule?.emergencyHistory || [])];
        if (schedule?.emergencyAlarm?.withdrawn) {
            const alreadyIn = list.some(h => h.timestamp === schedule.emergencyAlarm?.timestamp);
            if (!alreadyIn) {
                list.push({
                    timestamp: schedule.emergencyAlarm.timestamp,
                    seatNumber: schedule.emergencyAlarm.seatNumber,
                    passengerName: schedule.emergencyAlarm.passengerName,
                    bookingId: schedule.emergencyAlarm.bookingId,
                    status: 'withdrawn',
                    withdrawnAt: schedule.emergencyAlarm.withdrawnAt || schedule.emergencyAlarm.timestamp,
                    severe: schedule.emergencyAlarm.severe || false,
                    severeAt: schedule.emergencyAlarm.severeAt || null
                });
            }
        }
        return list;
    }, [schedule?.emergencyHistory, schedule?.emergencyAlarm]);

    const unrespondedIncidentsCount = useMemo(() => {
        return emergencyHistoryWithWithdrawn.filter(h => !h.issueReport).length;
    }, [emergencyHistoryWithWithdrawn]);

    // New state for highlighting
    const previousPassengersRef = useRef<DetailedPassenger[]>([]);
    const [newPassengerIds, setNewPassengerIds] = useState<Set<string>>(new Set());
    const [newBookingNotifications, setNewBookingNotifications] = useState<DetailedPassenger[]>([]);
    const [emergencyMessage, setEmergencyMessage] = useState('');
    const [refinedEmergencyMessage, setRefinedEmergencyMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Audio Unlocker
    const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
    const soundInitialized = useRef(false);
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(true);

    // Load trip data
    useEffect(() => {
        if (!tripId) return;
        try {
            sessionStorage.setItem('bushive_crew_active_trip_id', tripId);
            localStorage.setItem('bushive_crew_active_trip_id', tripId);
            window.dispatchEvent(new CustomEvent('bushive:active_trip_changed', { detail: { tripId } }));
        } catch (e) {}

        const unsubscribe = dataService.onScheduleSnapshot(tripId, async (scheduleData) => {
            if (!scheduleData) {
                setLoading(false);
                return;
            }
            
            setSchedule(scheduleData);

            // Bus and service are now handled by the real-time bus listener useEffect below

            if (!scheduleData.bookings || scheduleData.bookings.length === 0) {
                setPassengers([]);
                setLoading(false);
                return;
            }

            const passengerPromises = scheduleData.bookings.map(async (bRef: any) => {
                try {
                    if (!bRef.userId || !bRef.bookingId) return null;
                    
                    const bookingDetails = await dataService.getBookingById(bRef.userId, bRef.bookingId);
                    if (!bookingDetails) return null;
                    
                    const passengerForSeat = bookingDetails.passengers.find(p => p.seatNumber === bRef.seat);
                    if (!passengerForSeat) return null;
                    
                    return {
                        ...passengerForSeat,
                        boarded: bRef.boarded,
                        deboarded: bRef.deboarded,
                        bookingId: bRef.bookingId,
                        boardingPoint: bookingDetails.boardingMain,
                        boardingSubPoint: bookingDetails.boardingPoint,
                        droppingPoint: bookingDetails.droppingMain,
                        droppingSubPoint: bookingDetails.droppingPoint,
                        phone: bookingDetails.contact.phone,
                        pnr: bookingDetails.pnr,
                        generatedBy: bookingDetails.generatedBy,
                        boardingTime: bookingDetails.boardingTime,
                        droppingTime: bookingDetails.droppingTime,
                    };
                } catch (error) {
                    console.error('Error fetching passenger details:', error);
                    return null;
                }
            });
            
            const passengerResults = await Promise.all(passengerPromises);
            const validPassengers = passengerResults.filter(Boolean) as DetailedPassenger[];
            
            setPassengers(validPassengers);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [tripId]);

    // Real-time bus listener — re-attaches whenever actualBusId changes on the schedule
    const prevBusIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (!schedule) return;

        const busIdToListen = schedule.actualBusId || schedule.busId;
        if (!busIdToListen) return;

        // Detect bus swap: if busId changed, notify crew
        if (prevBusIdRef.current && prevBusIdRef.current !== busIdToListen) {
            toast({
                title: '🔄 Bus Swapped',
                description: `This trip has been assigned a different bus. Refreshing bus details now.`,
                duration: 8000,
            });
        }
        prevBusIdRef.current = busIdToListen;

        const db = initializeFirebase().firestore;
        if (!db) return;
        const busRef = doc(db, 'buses', busIdToListen);
        const unsubBus = onSnapshot(busRef, (snap) => {
            if (snap.exists()) {
                setBus({ id: snap.id, ...snap.data() } as any);
            }
        });

        // Also re-fetch service if it changed
        const targetServiceId = schedule.serviceId;
        if (targetServiceId) {
            dataService.getServiceById(targetServiceId).then(setService).catch(console.error);
        }

        return () => unsubBus();
    }, [schedule?.actualBusId, schedule?.busId, schedule?.serviceId]);
    
    // New useEffect to detect new passengers for highlighting
    useEffect(() => {
        if (previousPassengersRef.current.length > 0) {
            const prevIds = new Set(previousPassengersRef.current.map(p => `${p.bookingId}-${p.seatNumber}`));
            const newPassengers = passengers.filter(p => !prevIds.has(`${p.bookingId}-${p.seatNumber}`));
            
            if (newPassengers.length > 0) {
                if (alarmAudioRef.current && isAudioUnlocked) {
                    alarmAudioRef.current.currentTime = 0;
                    alarmAudioRef.current.play().catch(() => {});
                }
                const newIdsToAdd = new Set(newPassengers.map(p => `${p.bookingId}-${p.seatNumber}`));
                
                setNewPassengerIds(currentNewIds => new Set([...currentNewIds, ...newIdsToAdd]));

                setNewBookingNotifications(prev => [...prev, ...newPassengers]);

                newPassengers.forEach(p => {
                    setTimeout(() => {
                        setNewBookingNotifications(prev => prev.filter(n => n.seatNumber !== p.seatNumber));
                    }, 10000); // Auto-close notification after 10 seconds

                    setTimeout(() => {
                        setNewPassengerIds(currentNewIds => {
                            const updatedIds = new Set(currentNewIds);
                            updatedIds.delete(`${p.bookingId}-${p.seatNumber}`);
                            return updatedIds;
                        });
                    }, 60000); // Clear highlight after 60 seconds
                });
            }
        }
        previousPassengersRef.current = passengers;
    }, [passengers]);

    // Emergency Alarm Listener
    const prevEmergencyAlarmRef = useRef<string | null>(null);
    useEffect(() => {
        const alarm = schedule?.emergencyAlarm;
        if (!alarm) return;

        // Handle withdrawal — stop audio + show cabin crew message
        if (alarm.withdrawn && prevEmergencyAlarmRef.current === alarm.timestamp) {
            prevEmergencyAlarmRef.current = null;
            if (alarmAudioRef.current) {
                alarmAudioRef.current.pause();
                alarmAudioRef.current.currentTime = 0;
            }
            toast({
                title: "✅ Emergency Withdrawn by Passenger",
                description: `Passenger ${alarm.passengerName} (Seat ${alarm.seatNumber}) has withdrawn the emergency alert. No further action needed.`,
                duration: 15000,
            });
            return;
        }

        if (alarm.active) {
            if (prevEmergencyAlarmRef.current !== alarm.timestamp) {
                prevEmergencyAlarmRef.current = alarm.timestamp;
                
                // Use AudioContext to bypass silent/vibration mode for maximum volume
                try {
                    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
                    if (AudioCtx && alarmAudioRef.current) {
                        const audioCtx = new AudioCtx();
                        const source = audioCtx.createMediaElementSource(alarmAudioRef.current);
                        const gainNode = audioCtx.createGain();
                        gainNode.gain.value = 5; // boost volume past device limit
                        source.connect(gainNode);
                        gainNode.connect(audioCtx.destination);
                        audioCtx.resume();
                        alarmAudioRef.current.currentTime = 0;
                        alarmAudioRef.current.play().catch(() => {});
                    } else if (alarmAudioRef.current) {
                        alarmAudioRef.current.currentTime = 0;
                        alarmAudioRef.current.play().catch(() => {});
                    }
                } catch (e) {
                    if (alarmAudioRef.current) {
                        alarmAudioRef.current.currentTime = 0;
                        alarmAudioRef.current.play().catch(() => {});
                    }
                }

                toast({
                    title: `🚨 EMERGENCY — SEAT ${alarm.seatNumber} 🚨`,
                    description: `${alarm.passengerName} (Seat ${alarm.seatNumber}) needs IMMEDIATE assistance!`,
                    duration: 60000,
                    variant: "destructive",
                });
            }

            // Handle severe escalation
            if (alarm.severe && prevEmergencyAlarmRef.current === alarm.timestamp) {
                toast({
                    title: "🔴 UNANSWERED — ADMIN ESCALATED",
                    description: `No cabin crew response received within 3 minutes for Seat ${alarm.seatNumber}. Admin has been alerted as priority.`,
                    duration: 30000,
                    variant: "destructive",
                });
            }
        }
    }, [schedule?.emergencyAlarm, toast, isAudioUnlocked]);

    // Audio Unlocker
    
    useEffect(() => {
        const unlockAudio = () => {
            if (!soundInitialized.current && alarmAudioRef.current) {
                const audio = alarmAudioRef.current;
                audio.muted = true;
                audio.play().then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.muted = false;
                    soundInitialized.current = true;
                    setIsAudioUnlocked(true);
                }).catch(e => {
                    // Browser might still block it if not a trusted event
                });
            }
        };

        document.addEventListener('click', unlockAudio, { once: true });
        document.addEventListener('touchstart', unlockAudio, { once: true });
        return () => {
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        };
    }, []);

    // Update stats
    useEffect(() => {
      const total = passengers.length;
      const boarded = passengers.filter(p => p.boarded).length;
      const deboarded = passengers.filter(p => p.deboarded).length;
      const pending = total - boarded;
      const occupancyRate = bus?.totalSeats ? (total / bus.totalSeats) * 100 : 0;
      
      const genderDist = passengers.reduce((acc, p) => {
        if (p.gender === 'male') acc.male++;
        else if (p.gender === 'female') acc.female++;
        else acc.other++;
        return acc;
      }, { male: 0, female: 0, other: 0 });
  
      setStats({ 
        total, 
        boarded, 
        pending, 
        deboarded, 
        occupancyRate,
        onTimePerformance: 98.5, // Mock data
        genderDistribution: genderDist
      });
    }, [passengers, bus]);
  
    const handleRefresh = () => {
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            toast({
                title: "Data Refreshed",
                description: "Latest passenger information loaded.",
            });
        }, 500);
    };

    const handleBack = () => {
        router.back();
    };

    const handleBoardingAction = async (passenger: DetailedPassenger, action: 'board' | 'deboard' | 'no-show' | 'unboard') => {
        if (!schedule) return;

        // Optimistic UI Update: Instantly update the local state so the UI feels lightning fast
        setPassengers(prev => prev.map(p => {
            if (p.bookingId === passenger.bookingId && p.seatNumber === passenger.seatNumber) {
                return {
                    ...p,
                    boarded: action === 'board' ? true : action === 'unboard' ? false : action === 'no-show' ? false : p.boarded,
                    deboarded: action === 'deboard' ? true : p.deboarded
                };
            }
            return p;
        }));

        try {
            if (action === 'board') {
                // Do not wait for toast to avoid blocking
                dataService.updateBoardingStatus(schedule.id, passenger.bookingId, passenger.seatNumber, true).catch((e) => {
                    toast({ title: "Action Failed", description: e.message, variant: "destructive" });
                    // Revert will happen automatically when snapshot re-syncs, or we could manually revert here
                });
                toast({
                    title: 'Passenger Boarded',
                    description: `${passenger.name} has been marked as boarded.`,
                });
            } else if (action === 'unboard') {
                 dataService.updateBoardingStatus(schedule.id, passenger.bookingId, passenger.seatNumber, false).catch((e) => {
                     toast({ title: "Action Failed", description: e.message, variant: "destructive" });
                 });
                 toast({
                    title: 'Boarding Status Reverted',
                    description: `${passenger.name} is now marked as not boarded.`,
                });
            } else if (action === 'deboard') {
                dataService.updateDeboardingStatus(schedule.id, passenger.bookingId, passenger.seatNumber, true).catch((e) => {
                    toast({ title: "Action Failed", description: e.message, variant: "destructive" });
                });
                toast({
                    title: 'Passenger Deboarded',
                    description: `${passenger.name} has been marked as deboarded.`,
                });
            } else if (action === 'no-show') {
                dataService.updateBoardingStatus(schedule.id, passenger.bookingId, passenger.seatNumber, false).catch((e) => {
                    toast({ title: "Action Failed", description: e.message, variant: "destructive" });
                }); 
                toast({
                    title: 'Marked as No-Show',
                    description: `${passenger.name} has been marked as a no-show.`,
                });
            }
        } catch (e: any) {
            toast({
                title: "Action Failed",
                description: e.message,
                variant: "destructive",
            });
        }
    };

    
    const handleRefineMessage = async () => {
        if (!emergencyMessage.trim()) return;
        setIsGenerating(true);
        setRefinedEmergencyMessage('');
        try {
          const result = await refineCrewMessage({ 
              rawMessage: emergencyMessage,
              targetLanguages: selectedLanguages.length > 0 ? selectedLanguages : undefined
          });
          setRefinedEmergencyMessage(result.refinedMessage);
        } catch (error) {
          console.error("Failed to refine message:", error);
          toast({
            title: "AI Refinement Failed",
            description: "Could not generate a refined message. Please try again.",
            variant: "destructive",
          });
        } finally {
          setIsGenerating(false);
        }
    };

    const handleSubmitIncident = async (historyItem: any) => {
        const text = incidentReportsText[historyItem.timestamp];
        if (!text || text.trim() === '') {
            toast({ title: 'Please enter a report first.', variant: 'destructive' });
            return;
        }

        setAnalyzingIncident(historyItem.timestamp);
        try {
            const endTime = historyItem.respondedAt || historyItem.withdrawnAt || historyItem.resolvedAt;
            let timeToRespond: number | null = null;
            if (endTime && historyItem.timestamp) {
                const diff = (new Date(endTime).getTime() - new Date(historyItem.timestamp).getTime()) / 1000;
                if (!isNaN(diff) && diff >= 0) {
                    timeToRespond = Math.round(diff);
                }
            }

            const analysis = await analyzeIncident({
                crewReport: text,
                timeToRespondSeconds: timeToRespond,
                wasSevere: !!historyItem.severe
            });

            await dataService.submitIncidentReport(tripId as string, historyItem.timestamp, text, analysis.aiAnalysis);
            setSchedule(prev => {
                if (!prev) return prev;
                const existing = prev.emergencyHistory || [];
                const updated = existing.some((h: any) => h.timestamp === historyItem.timestamp)
                    ? existing.map((h: any) => h.timestamp === historyItem.timestamp ? { ...h, issueReport: text, aiAnalysis: analysis.aiAnalysis } : h)
                    : [...existing, { ...historyItem, issueReport: text, aiAnalysis: analysis.aiAnalysis }];
                return { ...prev, emergencyHistory: updated };
            });
            toast({ title: 'Incident report submitted and analyzed successfully!' });
        } catch (error) {
            console.error(error);
            toast({ title: 'Error analyzing incident', variant: 'destructive' });
        } finally {
            setAnalyzingIncident(null);
        }
    };

    const handleSendBroadcast = async () => {
        if (!refinedEmergencyMessage.trim()) {
            toast({ title: 'Refined message is empty', description: 'Please generate a refined message first.', variant: 'destructive' });
            return;
        }
        if (!schedule) {
            toast({ title: 'No active schedule', variant: 'destructive'});
            return;
        }
        setIsSending(true);
        try {
            await dataService.sendBroadcastMessage(schedule.id, refinedEmergencyMessage);
            
            toast({
                title: 'Broadcast Sent',
                description: `Your message has been sent to all passengers.`,
            });
    
            setEmergencyMessage('');
            setRefinedEmergencyMessage('');
    
        } catch (e: any) {
            toast({ title: 'Failed to send broadcast', description: e.message, variant: 'destructive' });
        } finally {
            setIsSending(false);
        }
    };

    const handleStopBroadcast = async () => {
        if (!schedule) return;
        setIsSending(true);
        try {
            await dataService.clearBroadcastMessage(schedule.id);
            toast({
                title: 'Broadcast Stopped',
                description: 'The emergency broadcast has been removed.',
            });
        } catch (e: any) {
            toast({ title: 'Failed to stop broadcast', description: e.message, variant: 'destructive' });
        } finally {
            setIsSending(false);
        }
    };

    const handleRespondEmergency = async () => {
        if (!schedule || !schedule.emergencyAlarm?.active) return;
        try {
            await dataService.respondToEmergency(schedule.id, schedule.emergencyAlarm);
            if (alarmAudioRef.current) {
                alarmAudioRef.current.pause();
                alarmAudioRef.current.currentTime = 0;
            }
            toast({
                title: '✅ Emergency Responded',
                description: `Seat ${schedule.emergencyAlarm.seatNumber} emergency marked as responded.`,
            });
        } catch (e: any) {
            toast({ title: 'Failed to respond', description: e.message, variant: 'destructive' });
        }
    };

    // Filter passengers by search
    const filteredPassengers = useMemo(() => {
      let filtered = passengers;
      
      if (searchQuery) {
        filtered = filtered.filter(p => 
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.seatNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.phone?.includes(searchQuery)
        );
      }
      
      return filtered;
    }, [passengers, searchQuery]);

    const buildGroupedData = useCallback((type: 'boarding' | 'dropping'): MainPointGroup[] => {
      if (!bus || !schedule) return [];

      const mainMap = new Map<string, {
        orderValue: number;
        subPoints: Map<string, {
            orderValue: number;
            passengers: DetailedPassenger[];
        }>
      }>();

      const parseTime = (timeStr?: string) => {
          if (!timeStr) return -1;
          const match12 = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
          if (match12) {
              let hours = parseInt(match12[1], 10);
              const minutes = parseInt(match12[2], 10);
              const ampm = match12[3].toUpperCase();
              if (hours === 12 && ampm === 'AM') hours = 0;
              if (hours < 12 && ampm === 'PM') hours += 12;
              return hours * 60 + minutes;
          }
          const match24 = timeStr.match(/(\d+):(\d+)/);
          if (match24) {
              return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
          }
          return -1;
      };

      // Extract all unique valid times to find the trip's logical start time
      const timeSet = new Set<number>();
      filteredPassengers.forEach(p => {
          const bt = parseTime(p.boardingTime);
          const dt = parseTime(p.droppingTime);
          if (bt !== -1) timeSet.add(bt);
          if (dt !== -1) timeSet.add(dt);
      });

      let tripStart = 0; // Default to midnight if no times
      if (timeSet.size > 0) {
          const sortedTimes = Array.from(timeSet).sort((a, b) => a - b);
          let maxGap = -1;
          
          for (let i = 0; i < sortedTimes.length; i++) {
              const current = sortedTimes[i];
              const next = i === sortedTimes.length - 1 ? sortedTimes[0] + 1440 : sortedTimes[i + 1];
              const gap = next - current;
              
              if (gap > maxGap) {
                  maxGap = gap;
                  tripStart = i === sortedTimes.length - 1 ? sortedTimes[0] : sortedTimes[i + 1];
              }
          }
      }

      const getNormalizedTime = (timeStr?: string) => {
          const t = parseTime(timeStr);
          if (t === -1) return 99999;
          return (t - tripStart + 1440) % 1440;
      };

      filteredPassengers.forEach(p => {
          const mainKey = type === 'boarding' ? p.boardingPoint || 'Uncategorized' : p.droppingPoint || 'Uncategorized';
          const subKey = type === 'boarding' ? p.boardingSubPoint || 'Main Stop' : p.droppingSubPoint || 'Main Stop';
          
          const timeStr = type === 'boarding' ? p.boardingTime : p.droppingTime;
          const orderVal = getNormalizedTime(timeStr);
          
          if (!mainMap.has(mainKey)) {
              mainMap.set(mainKey, { orderValue: orderVal, subPoints: new Map() });
          } else {
              if (orderVal < mainMap.get(mainKey)!.orderValue) {
                  mainMap.get(mainKey)!.orderValue = orderVal;
              }
          }
          
          if (!mainMap.get(mainKey)!.subPoints.has(subKey)) {
              mainMap.get(mainKey)!.subPoints.set(subKey, { orderValue: orderVal, passengers: [] });
          } else {
              if (orderVal < mainMap.get(mainKey)!.subPoints.get(subKey)!.orderValue) {
                  mainMap.get(mainKey)!.subPoints.get(subKey)!.orderValue = orderVal;
              }
          }
          
          mainMap.get(mainKey)!.subPoints.get(subKey)!.passengers.push(p);
      });

      return Array.from(mainMap.entries())
        .map(([mainPoint, value]: [string, any]) => {
          const subPoints = Array.from(value.subPoints.entries())
            .map(([subPointName, data]: [string, any]) => ({
              subPointName,
              order: data.orderValue,
              passengers: (data.passengers as DetailedPassenger[]).sort((a, b) =>
                  a.seatNumber.localeCompare(b.seatNumber, undefined, { numeric: true })
              ),
            }))
            .sort((a, b) => a.order - b.order);

          const totalCount = subPoints.reduce((acc, sp) => acc + sp.passengers.length, 0);
          
          const statusCount = subPoints.reduce((acc, sp) => 
            acc + sp.passengers.filter((p: DetailedPassenger) => type === 'boarding' ? p.boarded : p.deboarded).length, 0
          );

          return {
            mainPoint,
            order: value.orderValue,
            subPoints,
            totalCount,
            boardedCount: type === 'boarding' ? statusCount : 0,
            deboardedCount: type === 'dropping' ? statusCount : 0,
          };
        })
        .filter((m) => m.subPoints.length > 0)
        .sort((a, b) => a.order - b.order);
    }, [filteredPassengers, bus, schedule]);

    const filteredBoardingGroups = useMemo(
      () => buildGroupedData('boarding'),
      [buildGroupedData]
    );

    const filteredDroppingGroups = useMemo(
      () => buildGroupedData('dropping'),
      [buildGroupedData]
    );


    if (loading) {
        return <LoadingSkeleton />;
    }

    return (
        <TooltipProvider>
            <div className="min-h-screen bg-gray-50">
                {newBookingNotifications.length > 0 && (
                    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4 flex flex-col gap-3">
                        <AnimatePresence>
                            {newBookingNotifications.map(notification => (
                                <motion.div 
                                    key={`${notification.bookingId}-${notification.seatNumber}`}
                                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                    className="bg-green-600 rounded-xl shadow-2xl border-2 border-green-400 p-4 relative overflow-hidden animate-[pulse_1.5s_ease-in-out_infinite]"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-white/20 p-2 rounded-full">
                                                <Ticket className="h-6 w-6 text-white" />
                                            </div>
                                            <div>
                                                <h4 className="text-white font-bold text-lg leading-tight">New Ticket Booked!</h4>
                                                <p className="text-green-50 text-sm mt-1">
                                                    <span className="font-semibold">{notification.name}</span> booked Seat <span className="font-semibold">{notification.seatNumber}</span>
                                                </p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setNewBookingNotifications(prev => prev.filter(n => n.seatNumber !== notification.seatNumber))}
                                            className="text-green-100 hover:text-white transition-colors bg-black/10 hover:bg-black/20 rounded-full p-1.5"
                                        >
                                            <X className="h-4 w-4" strokeWidth={2.5} />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
                <audio ref={alarmAudioRef} src="/alarm.mp3" preload="auto" />
                
                {/* Header */}
                <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between h-20">
                            <div className="flex items-center gap-4">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={handleBack}
                                    className="hover:bg-gray-100 rounded-lg h-10 w-10"
                                >
                                    <ArrowLeft className="h-5 w-5 text-gray-600" />
                                </Button>
                                <div>
                                    <h1 className="text-2xl font-semibold text-gray-900">
                                        Trip Console
                                    </h1>
                                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                                        <span className="flex items-center gap-1">
                                            <Bus className="h-3.5 w-3.5" />
                                            {bus?.busNumber || 'Bus'}
                                        </span>
                                        <span>•</span>
                                        <div className="font-medium text-gray-900 flex items-center gap-1">
                                          {schedule?.direction === 'RETURN' ? (service?.destination || bus?.destination) : (service?.origin || bus?.origin)} 
                                          <ArrowRight className="h-3 w-3 text-gray-400" /> 
                                          {schedule?.direction === 'RETURN' ? (service?.origin || bus?.origin) : (service?.destination || bus?.destination)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <Button 
                                onClick={handleRefresh}
                                variant="outline"
                                className="border-gray-200 hover:bg-gray-50 rounded-lg"
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Refresh
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    
                    <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-4 gap-1 bg-muted p-1 rounded-lg mb-6 overflow-x-auto">
                            <TabsTrigger 
                                value="boarding"
                                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-bold"
                            >
                                Boarding ({stats.total - stats.boarded} pending)
                            </TabsTrigger>
                            <TabsTrigger 
                                value="dropping"
                                className="data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:font-bold"
                            >
                                Dropping ({stats.total - stats.deboarded} on bus)
                            </TabsTrigger>
                            <TabsTrigger 
                                value="summary"
                                className="data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=active]:font-bold"
                            >
                                Summary
                            </TabsTrigger>
                            <TabsTrigger 
                                value="incidents"
                                className="data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:font-bold relative"
                            >
                                Incidents
                                {unrespondedIncidentsCount > 0 && (
                                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white border-2 border-white shadow-sm animate-pulse">
                                        {unrespondedIncidentsCount}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        {/* Boarding Tab */}
                        <TabsContent value="boarding" className="mt-0">
                            <div className="space-y-6">
                                {filteredBoardingGroups.length === 0 ? (
                                    <EmptyState 
                                        title="No passengers found" 
                                        description="Try adjusting your search or filter"
                                    />
                                ) : (
                                    filteredBoardingGroups.map((group) => (
                                        <Card key={group.mainPoint} className="border-gray-200 shadow-sm overflow-hidden">
                                            <CardHeader className="bg-gray-50 border-b border-gray-200 py-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                                            <MapPin className="h-4 w-4 text-blue-600" />
                                                        </div>
                                                        <div>
                                                            <CardTitle className="text-lg text-gray-900">
                                                                {group.mainPoint}
                                                            </CardTitle>
                                                            <CardDescription>
                                                                {group.subPoints.length} boarding points • {group.totalCount} total passengers
                                                            </CardDescription>
                                                        </div>
                                                    </div>
                                                    <Badge variant="outline" className="bg-white">
                                                        {group.boardedCount} / {group.totalCount} boarded
                                                    </Badge>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="p-0">
                                                {group.subPoints.map((subPoint) => (
                                                    <SubPointSection 
                                                        key={subPoint.subPointName}
                                                        subPoint={subPoint.subPointName}
                                                        passengers={subPoint.passengers}
                                                        type="boarding"
                                                        onAction={handleBoardingAction}
                                                        newPassengerIds={newPassengerIds}
                                                    />
                                                ))}
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        </TabsContent>

                        {/* Dropping Tab */}
                        <TabsContent value="dropping" className="mt-0">
                            <div className="space-y-6">
                                {filteredDroppingGroups.length === 0 ? (
                                    <EmptyState 
                                        title="No passengers found" 
                                        description="Try adjusting your search or filter"
                                    />
                                ) : (
                                    filteredDroppingGroups.map((group) => (
                                        <Card key={group.mainPoint} className="border-gray-200 shadow-sm overflow-hidden">
                                            <CardHeader className="bg-gray-50 border-b border-gray-200 py-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
                                                            <MapPin className="h-4 w-4 text-purple-600" />
                                                        </div>
                                                        <div>
                                                            <CardTitle className="text-lg text-gray-900">
                                                                {group.mainPoint}
                                                            </CardTitle>
                                                            <CardDescription>
                                                                {group.subPoints.length} dropping points • {group.totalCount} total passengers
                                                            </CardDescription>
                                                        </div>
                                                    </div>
                                                    <Badge variant="outline" className="bg-white">
                                                        {group.deboardedCount} / {group.totalCount} deboarded
                                                    </Badge>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="p-0">
                                                {group.subPoints.map((subPoint) => (
                                                    <SubPointSection 
                                                        key={subPoint.subPointName}
                                                        subPoint={subPoint.subPointName}
                                                        passengers={subPoint.passengers}
                                                        type="dropping"
                                                        onAction={handleBoardingAction}
                                                        newPassengerIds={newPassengerIds}
                                                    />
                                                ))}
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        </TabsContent>

                        {/* Summary Tab */}
                        <TabsContent value="summary" className="mt-0 space-y-6">
                           <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                                            <Users2 className="h-5 w-5 text-blue-500" />
                                            Total Passengers
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-4xl font-bold">{stats.total}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                                            <CheckCircle className="h-5 w-5 text-green-500" />
                                            Boarded
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-4xl font-bold text-green-600">{stats.boarded}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                                            <Clock className="h-5 w-5 text-yellow-500" />
                                            Pending
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-4xl font-bold text-yellow-600">{stats.pending}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                                            <LogOut className="h-5 w-5 text-gray-500" />
                                            Deboarded
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-4xl font-bold text-gray-600">{stats.deboarded}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                                            <LayoutDashboard className="h-5 w-5 text-purple-500" />
                                            Occupancy
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-4xl font-bold text-purple-600">{stats.occupancyRate.toFixed(0)}%</p>
                                    </CardContent>
                                </Card>
                            </div>
                            
                            <Card>
                                <CardHeader>
                                    <CardTitle>Seat Layout</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Tabs value={activeBerth} onValueChange={v => setActiveBerth(v as any)}>
                                    <TabsList className="grid grid-cols-2 mb-4">
                                        <TabsTrigger value="lower">Lower Berth</TabsTrigger>
                                        <TabsTrigger value="upper">Upper Berth</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="lower">
                                        <IndianSleeper36Layout 
                                            schedule={schedule}
                                            bus={bus}
                                            berth="lower"
                                            showPrice={false}
                                            disableGenderReservation={true}
                                            isRestStopManifest={false}
                                            showLegend={false}
                                        />
                                    </TabsContent>
                                    <TabsContent value="upper">
                                        <IndianSleeper36Layout 
                                            schedule={schedule}
                                            bus={bus}
                                            berth="upper" 
                                            showPrice={false}
                                            disableGenderReservation={true}
                                            isRestStopManifest={false}
                                            showLegend={false}
                                        />
                                    </TabsContent>
                                    </Tabs>
                                </CardContent>
                            </Card>
                            
                            <Card className="border-gray-200 shadow-sm lg:col-span-3">
                                <CardHeader>
                                    <CardTitle className="text-lg">Emergency Broadcast</CardTitle>
                                    <CardDescription>
                                        Type a raw message, then use AI to refine it for passengers before sending.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <Textarea
                                        placeholder="Type your raw message here (e.g., 'bus broken down, wait for replacement')..."
                                        value={emergencyMessage}
                                        onChange={(e) => setEmergencyMessage(e.target.value)}
                                        className="min-h-[80px]"
                                    />
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-gray-700">Translate to additional languages (English is default):</p>
                                        <div className="flex flex-wrap gap-4">
                                            {['Hindi', 'Tamil', 'Malayalam', 'Kannada', 'Telugu'].map((lang) => (
                                                <div key={lang} className="flex items-center space-x-2">
                                                    <Checkbox 
                                                        id={`lang-${lang}`} 
                                                        checked={selectedLanguages.includes(lang)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedLanguages(prev => [...prev, lang]);
                                                            } else {
                                                                setSelectedLanguages(prev => prev.filter(l => l !== lang));
                                                            }
                                                        }}
                                                    />
                                                    <label 
                                                        htmlFor={`lang-${lang}`}
                                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                    >
                                                        {lang}
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex justify-center">
                                        <Button
                                            onClick={handleRefineMessage}
                                            disabled={!emergencyMessage.trim() || isGenerating}
                                            variant="outline"
                                        >
                                            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                            {isGenerating ? 'Refining...' : 'Refine with AI'}
                                        </Button>
                                    </div>
                                    <Textarea
                                        placeholder="AI-generated professional message will appear here..."
                                        value={refinedEmergencyMessage}
                                        readOnly
                                        className="min-h-[160px] bg-muted/50"
                                    />
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button 
                                                variant="destructive" 
                                                className="w-full" 
                                                disabled={!refinedEmergencyMessage.trim() || isSending}
                                            >
                                                <MessageCircle className="mr-2 h-4 w-4" />
                                                {isSending ? 'Sending...' : 'Send Broadcast to Passengers'}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Confirm Emergency Broadcast</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  The following message will be sent to all passengers.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <div className="relative -mt-2">
                                                <div className="p-3 bg-muted rounded-md border text-sm">
                                                    <p className="font-mono whitespace-pre-wrap">{refinedEmergencyMessage || "The message preview will appear here."}</p>
                                                </div>
                                            </div>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleSendBroadcast} disabled={isSending}>
                                                    {isSending ? 'Sending...' : 'Confirm & Send'}
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                    
                                    {schedule?.broadcast?.message && (
                                        <div className="mt-6 p-4 border border-red-200 bg-red-50 rounded-md">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h4 className="font-semibold text-red-800 flex items-center">
                                                        <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse mr-2"></span>
                                                        Active Broadcast
                                                    </h4>
                                                    <p className="text-sm text-red-700 mt-1 whitespace-pre-wrap">{schedule.broadcast.message}</p>
                                                    <p className="text-xs text-red-500 mt-2">
                                                        Sent at {new Date(schedule.broadcast.timestamp).toLocaleTimeString()}
                                                    </p>
                                                </div>
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={handleStopBroadcast}
                                                    disabled={isSending}
                                                    className="text-red-600 border-red-200 hover:bg-red-100"
                                                >
                                                    Stop Broadcasting
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between py-4">
                                        <div>
                                            <CardTitle className="flex items-center gap-2">
                                                <LifeBuoy className="h-5 w-5 text-gray-500" />
                                                Emergency Response History
                                            </CardTitle>
                                            <CardDescription className="mt-1">Log of past alarms, crew responses, and passenger withdrawals</CardDescription>
                                        </div>
                                        <Badge variant="outline" className="text-xs font-bold text-gray-700 border-gray-300 bg-white shrink-0">
                                            Total Incidents: {emergencyHistoryWithWithdrawn.length}
                                        </Badge>
                                    </CardHeader>
                                    <CardContent>
                                        {(!emergencyHistoryWithWithdrawn || emergencyHistoryWithWithdrawn.length === 0) ? (
                                            <div className="text-center py-8 text-gray-500">
                                                No emergency history for this trip.
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {[...emergencyHistoryWithWithdrawn].reverse().map((record, idx) => {
                                                    const incidentNum = emergencyHistoryWithWithdrawn.length - idx;
                                                    return (
                                                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-gray-100 bg-gray-50 gap-4">
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <Badge className="bg-gray-900 text-white font-black text-xs px-2 py-0.5 rounded-md border-0">
                                                                        Incident #{incidentNum}
                                                                    </Badge>
                                                                    <p className="font-semibold text-gray-900">
                                                                        {record.passengerName} (Seat {record.seatNumber})
                                                                    </p>
                                                                </div>
                                                                <div className="text-sm text-gray-500 mt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                                                                    <span>Triggered: {record.timestamp ? new Date(record.timestamp).toLocaleTimeString() : '--:--'}</span>
                                                                    <span className="hidden sm:inline">•</span>
                                                                    {record.status === 'withdrawn' ? (
                                                                        <span className="text-amber-700 font-semibold">Withdrawn: {record.withdrawnAt ? new Date(record.withdrawnAt).toLocaleTimeString() : 'By passenger'}</span>
                                                                    ) : (
                                                                        <span>Resolved: {record.respondedAt ? new Date(record.respondedAt).toLocaleTimeString() : '--:--'}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {record.status === 'withdrawn' ? (
                                                                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 shrink-0 flex items-center gap-1">
                                                                    <XCircle className="h-3.5 w-3.5 text-amber-600" />
                                                                    Withdrawn by Passenger
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 shrink-0 flex items-center gap-1">
                                                                    <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                                                    Responded
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                        </TabsContent>

                        {/* Incidents Tab */}
                        <TabsContent value="incidents" className="mt-0 space-y-6">
                            <Card className="border-red-100 shadow-sm">
                                <CardHeader className="bg-red-50/50 border-b border-red-100">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2 text-red-700">
                                            <AlertCircle className="h-5 w-5" />
                                            Emergency Incident Reports
                                        </CardTitle>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-xs font-bold text-gray-700 border-gray-300 bg-white">
                                                Total Incidents: {emergencyHistoryWithWithdrawn.length}
                                            </Badge>
                                            {unrespondedIncidentsCount > 0 ? (
                                                <Badge className="bg-red-600 text-white font-black text-xs px-2.5 py-0.5 rounded-full border-0 animate-pulse">
                                                    {unrespondedIncidentsCount} Left Unresponded
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-emerald-600 text-white font-bold text-xs px-2.5 py-0.5 rounded-full border-0">
                                                    All Responded ✓
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <CardDescription>
                                        Fill out reports for past emergency alarms and withdrawals. These are reviewed by the administration.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {!emergencyHistoryWithWithdrawn || emergencyHistoryWithWithdrawn.length === 0 ? (
                                        <div className="p-12 text-center text-gray-500">
                                            <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                                            <p className="font-semibold text-gray-700">No Incidents</p>
                                            <p className="text-sm">There have been no passenger emergencies on this trip.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-100">
                                            {[...emergencyHistoryWithWithdrawn].reverse().map((incident, idx) => {
                                                const incidentNumber = emergencyHistoryWithWithdrawn.length - idx;
                                                return (
                                                    <div key={incident.timestamp + idx} className="p-6">
                                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                                                            <div className="flex-1 space-y-3">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <Badge className="bg-gray-900 text-white font-black text-xs px-2.5 py-0.5 rounded-md border-0 shadow-sm">
                                                                        Incident #{incidentNumber}
                                                                    </Badge>
                                                                    {incident.status === 'withdrawn' ? (
                                                                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 flex items-center gap-1 font-bold">
                                                                            <XCircle className="h-3.5 w-3.5 text-amber-600" />
                                                                            WITHDRAWN BY PASSENGER
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="outline" className={incident.severe ? 'bg-red-50 text-red-700 border-red-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}>
                                                                            {incident.severe ? 'SEVERE INCIDENT' : 'STANDARD ALERT'}
                                                                        </Badge>
                                                                    )}
                                                                    {incident.issueReport ? (
                                                                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-xs flex items-center gap-1">
                                                                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                                                            Report Responded & Submitted
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge className="bg-red-100 text-red-800 border-red-300 font-bold text-xs animate-pulse">
                                                                            Unresponded • Report Required
                                                                        </Badge>
                                                                    )}
                                                                    <span className="text-xs font-semibold text-gray-500">
                                                                        {incident.timestamp ? format(new Date(incident.timestamp), 'hh:mm a') : '--:--'} - {
                                                                            incident.status === 'withdrawn'
                                                                                ? (incident.withdrawnAt ? format(new Date(incident.withdrawnAt), 'hh:mm a') : 'Withdrawn')
                                                                                : (incident.respondedAt ? format(new Date(incident.respondedAt), 'hh:mm a') : '--:--')
                                                                        }
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold text-gray-900 text-lg">Seat {incident.seatNumber} • {incident.passengerName}</p>
                                                                {incident.status === 'withdrawn' ? (
                                                                    <p className="text-sm text-amber-700 font-medium">
                                                                        Withdrawn by passenger {incident.withdrawnAt && incident.timestamp ? `after ${Math.max(0, Math.round((new Date(incident.withdrawnAt).getTime() - new Date(incident.timestamp).getTime()) / 1000))}s` : ''} (cancelled by passenger).
                                                                    </p>
                                                                ) : (
                                                                    <p className="text-sm text-gray-500">
                                                                        Response time: {incident.respondedAt && incident.timestamp ? Math.max(0, Math.round((new Date(incident.respondedAt).getTime() - new Date(incident.timestamp).getTime()) / 1000)) : 0} seconds
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {incident.issueReport ? (
                                                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mt-2">
                                                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Crew Report</p>
                                                                    <p className="text-gray-800 text-sm">{incident.issueReport}</p>
                                                                    {incident.adminApproved && (
                                                                        <Badge className="mt-3 bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                                                                            <CheckCircle className="w-3 h-3 mr-1" /> Admin Approved
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-2 space-y-3">
                                                                    <Label className={`text-sm font-bold ${incident.status === 'withdrawn' ? 'text-amber-800' : 'text-red-600'}`}>
                                                                        {incident.status === 'withdrawn' ? 'Optional Report / Notes (Withdrawn Alert)' : 'Pending Report Required'}
                                                                    </Label>
                                                                    <Textarea 
                                                                        placeholder={incident.status === 'withdrawn' ? "Optional: Enter observations or context regarding this withdrawn emergency..." : "Describe what happened, what the passenger needed, and how the situation was resolved..."}
                                                                        className={`min-h-[100px] ${incident.status === 'withdrawn' ? 'border-amber-200 focus-visible:ring-amber-500' : 'border-red-200 focus-visible:ring-red-500'}`}
                                                                        value={incidentReportsText[incident.timestamp] || ''}
                                                                        onChange={(e) => setIncidentReportsText(prev => ({...prev, [incident.timestamp]: e.target.value}))}
                                                                        disabled={analyzingIncident === incident.timestamp}
                                                                    />
                                                                    <Button 
                                                                        onClick={() => handleSubmitIncident(incident)}
                                                                        disabled={analyzingIncident === incident.timestamp}
                                                                        className={incident.status === 'withdrawn' ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
                                                                    >
                                                                        {analyzingIncident === incident.timestamp ? (
                                                                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting & Analyzing...</>
                                                                        ) : (
                                                                            incident.status === 'withdrawn' ? 'Save Notes & Analysis' : 'Submit Incident Report'
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </TooltipProvider>
    );
}

function LoadingSkeleton() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="border-b bg-white">
              <div className="max-w-7xl mx-auto px-6 py-4">
                <Skeleton className="h-8 w-64" />
              </div>
            </div>
            <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-32 rounded-lg" />
                    ))}
                </div>
                <Skeleton className="h-12 w-full rounded-lg" />
                <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-64 w-full rounded-lg" />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function TripConsolePage({ params }: { params: Promise<{ tripId: string }> }) {
    const resolvedParams = use(params);
    return (
        <Suspense fallback={<LoadingSkeleton />}>
            <TripConsolePageContent tripId={resolvedParams.tripId} />
        </Suspense>
    );
}
