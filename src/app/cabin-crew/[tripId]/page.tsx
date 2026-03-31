'use client';

import React, { useEffect, useState, useMemo, use, Suspense, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Phone, MapPin, Users, RefreshCw, Search,
  CheckCircle, Ban, MoreVertical, LogOut, UserCheck, UserX,
  Clock, Bus, Calendar, ChevronRight, Filter, LayoutDashboard,
  Users2, BarChart3, Settings, Download, Printer, MessageCircle, AlertCircle, LifeBuoy,
  Route as RouteIcon, ArrowRight, Armchair, Sparkles, Loader2, RotateCcw
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { refineCrewMessage } from '@/ai/flows/refine-crew-message';
import { Label } from '@/components/ui/label';


interface DetailedPassenger extends Passenger {
    boarded?: boolean;
    deboarded?: boolean;
    bookingId: string;
    boardingPoint: string;
    boardingSubPoint?: string;
    droppingPoint: string;
    droppingSubPoint?: string;
    phone: string;
    email?: string;
    age?: number;
    gender?: string;
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
                                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-headline font-bold">
                                        Seat {passenger.seatNumber}
                                    </Badge>
                                    <div className="flex items-center gap-1">
                                        {type === 'boarding' ? (
                                            !passenger.boarded ? (
                                                <>
                                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold" onClick={() => onAction(passenger, 'board')}>
                                                        <CheckCircle className="h-4 w-4 mr-2" />
                                                        Boarded
                                                    </Button>
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
    const { toast } = useToast();
    
    // State
    const [schedule, setSchedule] = useState<Schedule | null>(null);
    const [bus, setBus] = useState<BusType | null>(null);
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
    const [activeBerth, setActiveBerth] = useState<'lower' | 'upper'>('lower');

    // New state for highlighting
    const previousPassengersRef = useRef<DetailedPassenger[]>([]);
    const [newPassengerIds, setNewPassengerIds] = useState<Set<string>>(new Set());
    const [emergencyMessage, setEmergencyMessage] = useState('');
    const [refinedEmergencyMessage, setRefinedEmergencyMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Load trip data
    useEffect(() => {
        if (!tripId) return;

        const unsubscribe = dataService.onScheduleSnapshot(tripId, async (scheduleData) => {
            if (!scheduleData) {
                setLoading(false);
                return;
            }
            
            setSchedule(scheduleData);
            
            const busIdToFetch = scheduleData.actualBusId || scheduleData.busId;
            const busData = await dataService.getBusById(busIdToFetch);
            setBus(busData);

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
    
    // New useEffect to detect new passengers for highlighting
    useEffect(() => {
        if (previousPassengersRef.current.length > 0) {
            const prevIds = new Set(previousPassengersRef.current.map(p => `${p.bookingId}-${p.seatNumber}`));
            const newPassengers = passengers.filter(p => !prevIds.has(`${p.bookingId}-${p.seatNumber}`));
            
            if (newPassengers.length > 0) {
                const newIdsToAdd = new Set(newPassengers.map(p => `${p.bookingId}-${p.seatNumber}`));
                
                setNewPassengerIds(currentNewIds => new Set([...currentNewIds, ...newIdsToAdd]));

                newPassengers.forEach(p => {
                    setTimeout(() => {
                        setNewPassengerIds(currentNewIds => {
                            const updatedIds = new Set(currentNewIds);
                            updatedIds.delete(`${p.bookingId}-${p.seatNumber}`);
                            return updatedIds;
                        });
                    }, 60000); // 60 seconds
                });
            }
        }
        previousPassengersRef.current = passengers;
    }, [passengers]);

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

        try {
            if (action === 'board') {
                await dataService.updateBoardingStatus(schedule.id, passenger.bookingId, passenger.seatNumber, true);
                toast({
                    title: 'Passenger Boarded',
                    description: `${passenger.name} has been marked as boarded.`,
                });
            } else if (action === 'unboard') {
                 await dataService.updateBoardingStatus(schedule.id, passenger.bookingId, passenger.seatNumber, false);
                 toast({
                    title: 'Boarding Status Reverted',
                    description: `${passenger.name} is now marked as not boarded.`,
                });
            } else if (action === 'deboard') {
                await dataService.updateDeboardingStatus(schedule.id, passenger.bookingId, passenger.seatNumber, true);
                toast({
                    title: 'Passenger Deboarded',
                    description: `${passenger.name} has been marked as deboarded.`,
                });
            } else if (action === 'no-show') {
                await dataService.updateBoardingStatus(schedule.id, passenger.bookingId, passenger.seatNumber, false); 
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
          const result = await refineCrewMessage({ rawMessage: emergencyMessage });
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
            toast({ title: 'Failed to send message', description: e.message, variant: 'destructive' });
        } finally {
            setIsSending(false);
        }
    };

    // Filter passengers by search
    const filteredPassengers = useMemo(() => {
      let filtered = passengers;
      
      if (searchQuery) {
        filtered = filtered.filter(p => 
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.seatNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.phone.includes(searchQuery)
        );
      }
      
      return filtered;
    }, [passengers, searchQuery]);

    const buildGroupedData = useCallback((type: 'boarding' | 'dropping'): MainPointGroup[] => {
      if (!bus || !schedule) return [];
    
      const points =
        type === 'boarding'
          ? schedule.direction === 'RETURN'
            ? bus.boardingPointsReturn || []
            : bus.boardingPointsForward || []
          : schedule.direction === 'RETURN'
          ? bus.droppingPointsReturn || []
          : bus.droppingPointsForward || [];
    
      if (!points) return [];
      
      const sortedPoints = [...points].sort(
        (a, b) => (a.order || 999) - (b.order || 999)
      );
    
      const mainMap = new Map<string, {
        order: number;
        subPoints: Map<string, {
            order: number;
            passengers: DetailedPassenger[];
        }>
      }>();
    
      sortedPoints.forEach((point) => {
        const mainKey = point.main || 'Uncategorized';
    
        if (!mainMap.has(mainKey)) {
          mainMap.set(mainKey, {
            order: point.order || 999,
            subPoints: new Map(),
          });
        }
    
        const relatedPassengers = filteredPassengers.filter((p) =>
          type === 'boarding'
            ? p.boardingSubPoint === point.name
            : p.droppingSubPoint === point.name
        );
    
        if (relatedPassengers.length > 0) {
          mainMap.get(mainKey)!.subPoints.set(point.name, {
            order: point.order || 999,
            passengers: relatedPassengers.sort((a, b) =>
              a.seatNumber.localeCompare(b.seatNumber, undefined, {
                numeric: true,
              })
            ),
          });
        }
      });
    
      return Array.from(mainMap.entries())
        .map(([mainPoint, value]: [string, any]) => {
          const subPoints = Array.from(value.subPoints.entries())
            .map(([subPointName, data]: [string, any]) => ({
              subPointName,
              order: data.order,
              passengers: data.passengers as DetailedPassenger[],
            }))
            .sort((a, b) => a.order - b.order);

          const totalCount = subPoints.reduce((acc, sp) => acc + sp.passengers.length, 0);
          
          // For boarding tab, we want to know how many have boarded.
          // For dropping tab, we want to know how many have deboarded.
          const statusCount = subPoints.reduce((acc, sp) => 
            acc + sp.passengers.filter((p) => type === 'boarding' ? p.boarded : p.deboarded).length, 0
          );

          return {
            mainPoint,
            order: value.order,
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
                                          {schedule?.direction === 'RETURN' ? bus?.destination : bus?.origin} 
                                          <ArrowRight className="h-3 w-3 text-gray-400" /> 
                                          {schedule?.direction === 'RETURN' ? bus?.origin : bus?.destination}
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
                    
                    <Tabs defaultValue="boarding" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 gap-1 bg-muted p-1 rounded-lg mb-6">
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
                                        className="min-h-[80px] bg-muted/50"
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
                                                    <p className="font-mono">{refinedEmergencyMessage || "The message preview will appear here."}</p>
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
