'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Ticket, Bus, User, Phone, Save, MapPin, CalendarDays, IndianRupee, ShieldAlert, Lock, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { dataService } from '@/lib/data/client-service';
import type { Bus as BusType, Schedule, Seat, Point } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addDays } from 'date-fns';
import { useFirebase } from '@/firebase';
import { Separator } from '@/components/ui/separator';
import { IndianSleeper36Layout } from '@/components/ui/indian-sleeper-36-layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { doc, onSnapshot } from 'firebase/firestore';

export default function GenerateTicketsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { user, firestore } = useFirebase();

  const [buses, setBuses] = useState<BusType[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [liveSchedule, setLiveSchedule] = useState<Schedule | null>(null);

  // Wizard state
  const [selectedRoute, setSelectedRoute] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [boardingPoint, setBoardingPoint] = useState<string>('');
  const [droppingPoint, setDroppingPoint] = useState<string>('');

  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([]);
  const [passengers, setPassengers] = useState<{name: string, age: string, gender: 'male'|'female'|'other', seatNumber: string}[]>([]);
  const [contactPhone, setContactPhone] = useState('');
  const [activeBerth, setActiveBerth] = useState<'lower'|'upper'>('lower');

  // 1. Fetch Buses and Schedules
  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      try {
        const busData = await dataService.getBusesByOperator(user.uid);
        setBuses(busData);
        
        const allSchedules = await dataService.getSchedules();
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day so today's schedules are included
        const thirtyDaysFromNow = addDays(today, 30);
        const operatorBusIds = new Set(busData.map(b => b.id));
        
        const operatorSchedules = allSchedules.filter(s => {
            const sDate = new Date(s.date);
            sDate.setHours(0,0,0,0);
            return operatorBusIds.has(s.busId) &&
                   sDate >= today &&
                   sDate <= thirtyDaysFromNow;
        });
        setSchedules(operatorSchedules);
      } catch (error) {
        toast({ title: 'Error Fetching Data', description: 'Could not load buses and schedules.', variant: 'destructive' });
      }
    }
    fetchData();
  }, [user, toast]);

  // Sync passengers array with selected seats
  useEffect(() => {
      setPassengers(prev => {
          return selectedSeats.map(seat => {
              const existing = prev.find(p => p.seatNumber === seat.number);
              if (existing) return existing;
              return { name: '', age: '', gender: 'male', seatNumber: seat.number };
          });
      });
  }, [selectedSeats]);

  // Compute available routes
  const availableRoutes = useMemo(() => {
      const routeMap = new Map<string, { origin: string, destination: string }>();
      buses.forEach(b => {
          const fwdStr = `${b.origin} to ${b.destination}`;
          if (!routeMap.has(fwdStr)) routeMap.set(fwdStr, { origin: b.origin, destination: b.destination });
          const retStr = `${b.destination} to ${b.origin}`;
          if (!routeMap.has(retStr)) routeMap.set(retStr, { origin: b.destination, destination: b.origin });
      });
      return Array.from(routeMap.keys()).sort();
  }, [buses]);

  // Compute available dates for selected route
  const availableDates = useMemo(() => {
      if (!selectedRoute) return [];
      const validSchedules = schedules.filter(s => {
           const bus = buses.find(b => b.id === s.busId);
           if (!bus) return false;
           const sDir = s.direction || 'FORWARD';
           const routeStr = sDir === 'FORWARD' ? `${bus.origin} to ${bus.destination}` : `${bus.destination} to ${bus.origin}`;
           return routeStr === selectedRoute;
      });
      const dates = new Set(validSchedules.map(s => s.date));
      return Array.from(dates).sort();
  }, [selectedRoute, schedules, buses]);

  // Identify active bus and schedule
  const { activeSchedule, activeBus } = useMemo(() => {
      if (!selectedRoute || !selectedDate) return { activeSchedule: null, activeBus: null };
      const validSchedules = schedules.filter(s => {
           if (s.date !== selectedDate) return false;
           const bus = buses.find(b => b.id === s.busId);
           if (!bus) return false;
           const sDir = s.direction || 'FORWARD';
           const routeStr = sDir === 'FORWARD' ? `${bus.origin} to ${bus.destination}` : `${bus.destination} to ${bus.origin}`;
           return routeStr === selectedRoute;
      });
      const sched = validSchedules[0];
      const bus = sched ? buses.find(b => b.id === sched.busId) : null;
      return { activeSchedule: sched, activeBus: bus };
  }, [selectedRoute, selectedDate, schedules, buses]);

  // Real-time subscription to the selected schedule so blocked/booked seats reflect instantly
  useEffect(() => {
    if (!activeSchedule?.id || !firestore) {
      setLiveSchedule(null);
      return;
    }
    setLiveSchedule(activeSchedule);
    const scheduleRef = doc(firestore, 'schedules', activeSchedule.id);
    const unsubscribe = onSnapshot(scheduleRef, (snap) => {
      if (snap.exists()) {
        setLiveSchedule({ id: snap.id, ...snap.data() } as Schedule);
      }
    });
    return () => unsubscribe();
  }, [activeSchedule?.id, firestore]);

  const currentSchedule = liveSchedule || activeSchedule;

  const blockedBookings = useMemo(() => {
    if (!currentSchedule?.bookings) return [];
    return currentSchedule.bookings.filter((b: any) => b.blocked || b.gender === 'other' || !b.gender);
  }, [currentSchedule]);

  const handleBlockSeats = async () => {
    if (!user) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    if (!currentSchedule) return;
    if (selectedSeats.length === 0) {
      toast({ title: "Select Seats", description: "Please select at least one seat to block.", variant: "destructive" });
      return;
    }

    const existingBookedSeatNumbers = new Set((currentSchedule.bookings || []).map((b: any) => b.seat));
    const alreadyBooked = selectedSeats.filter(s => existingBookedSeatNumbers.has(s.number));
    if (alreadyBooked.length > 0) {
      toast({
        title: "Seat Already Sold",
        description: `Seat(s) ${alreadyBooked.map(s => s.number).join(', ')} are already sold or blocked. You can only block unsold seats.`,
        variant: "destructive"
      });
      return;
    }

    setIsBlocking(true);
    try {
      const seatNumbersToBlock = selectedSeats.map(s => s.number);
      const res = await dataService.blockSeats(currentSchedule.id, seatNumbersToBlock, user.uid);
      if (res.success) {
        toast({
          title: "Seat(s) Blocked Successfully",
          description: `Seat(s) ${seatNumbersToBlock.join(', ')} are now blocked and unavailable for users to book.`,
        });
        setSelectedSeats([]);
      } else {
        toast({
          title: "Failed to Block Seats",
          description: res.message || "An error occurred while blocking seats.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive"
      });
    } finally {
      setIsBlocking(false);
    }
  };

  const handleUnblockSeat = async (seatNumber: string) => {
    if (!currentSchedule) return;
    try {
      const res = await dataService.unblockSeats(currentSchedule.id, [seatNumber]);
      if (res.success) {
        toast({
          title: "Seat Unblocked",
          description: `Seat ${seatNumber} has been unblocked and is now available for booking.`,
        });
      } else {
        toast({
          title: "Error",
          description: res.message || "Could not unblock seat.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive"
      });
    }
  };

  // Compute available boarding and dropping points
  const points = useMemo(() => {
      if (!activeBus || !activeSchedule) return { boarding: [], dropping: [] };
      const sDir = activeSchedule.direction || 'FORWARD';
      const boarding = sDir === 'FORWARD' ? activeBus.boardingPointsForward : activeBus.boardingPointsReturn;
      const dropping = sDir === 'FORWARD' ? activeBus.droppingPointsForward : activeBus.droppingPointsReturn;
      
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

      const sortPoints = (pts: Point[] | undefined) => {
          if (!pts || pts.length === 0) return [];
          const timeSet = new Set<number>();
          pts.forEach(p => {
              const t = parseTime(p.time);
              if (t !== -1) timeSet.add(t);
          });
          
          let tripStart = 0;
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

          return [...pts].sort((a, b) => getNormalizedTime(a.time) - getNormalizedTime(b.time));
      };

      return { boarding: sortPoints(boarding), dropping: sortPoints(dropping) };
  }, [activeBus, activeSchedule]);

  const updatePassenger = (seatNumber: string, field: string, value: string) => {
      setPassengers(prev => prev.map(p => p.seatNumber === seatNumber ? { ...p, [field]: value } : p));
  };

  const totalPrice = useMemo(() => {
      if (!currentSchedule) return 0;
      return selectedSeats.reduce((sum, seat) => {
          return sum + (currentSchedule.seatPrices?.[seat.number] ?? currentSchedule.fare);
      }, 0);
  }, [selectedSeats, currentSchedule]);

  const handleGenerateTicket = async () => {
    if (!user) {
        toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
        return;
    }
    if (!currentSchedule || !activeBus) return;
    if (selectedSeats.length === 0) {
        toast({ title: "Select Seats", description: "Please select at least one seat.", variant: "destructive" });
        return;
    }
    if (!boardingPoint || !droppingPoint || !contactPhone) {
        toast({ title: "Missing Details", description: "Please provide boarding, dropping points and contact number.", variant: "destructive" });
        return;
    }

    const missingNames = passengers.some(p => !p.name || !p.age);
    if (missingNames) {
         toast({ title: "Missing Passenger Details", description: "Please provide name and age for all passengers.", variant: "destructive" });
         return;
    }

    setIsLoading(true);

    const bookingData = {
        busId: activeBus.id,
        scheduleId: currentSchedule.id,
        passengers: passengers.map(p => ({
            name: p.name,
            age: parseInt(p.age, 10),
            gender: p.gender,
            seatNumber: p.seatNumber,
            price: currentSchedule.seatPrices?.[p.seatNumber] ?? currentSchedule.fare,
        })),
        contact: { phone: contactPhone },
        boardingPoint,
        droppingPoint,
        boardingMain: boardingPoint,
        boardingTime: points.boarding.find(p => p.name === boardingPoint)?.time || '00:00',
        droppingMain: droppingPoint,
        droppingTime: points.dropping.find(p => p.name === droppingPoint)?.time || '00:00',
        totalFare: totalPrice,
        bookingDate: currentSchedule.date,
        busDetails: {
            name: activeBus.travelsName,
            operator: activeBus.operator || '',
            origin: activeBus.origin,
            destination: activeBus.destination,
            departureTime: activeBus.departureTime,
            arrivalTime: activeBus.arrivalTime,
            duration: activeBus.duration || '',
            busNumber: activeBus.busNumber,
            boardingPoints: activeBus.boardingPointsForward || [],
            droppingPoints: activeBus.droppingPointsForward || [],
        },
        generatedBy: 'owner' as any
    };

    // Save to session storage for the checkout page
    sessionStorage.setItem('admin_pending_booking', JSON.stringify(bookingData));
    router.push(`/admin/generate-tickets/checkout`);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Trip Selection & Passenger Details */}
        <div className="lg:col-span-7 space-y-6">
            <Card>
                <CardHeader>
                <CardTitle className="font-headline flex items-center gap-3 text-xl">
                    <Ticket className="w-6 h-6 text-primary" />
                    Book Tickets & Block Seats
                </CardTitle>
                <CardDescription>
                    Select route and date to load the live seat map, book passenger tickets, or select & block seats.
                </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Route Selection */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 font-medium">
                        <MapPin className="w-4 h-4 text-muted-foreground" /> Route
                        </Label>
                        <Select value={selectedRoute} onValueChange={(val) => { setSelectedRoute(val); setSelectedDate(''); setBoardingPoint(''); setDroppingPoint(''); setSelectedSeats([]); }}>
                            <SelectTrigger><SelectValue placeholder="Select Route" /></SelectTrigger>
                            <SelectContent>
                                {availableRoutes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date Selection */}
                    {selectedRoute && (
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 font-medium">
                            <CalendarDays className="w-4 h-4 text-muted-foreground" /> Travel Date
                            </Label>
                            <Select value={selectedDate} onValueChange={(val) => { setSelectedDate(val); setBoardingPoint(''); setDroppingPoint(''); setSelectedSeats([]); }}>
                                <SelectTrigger><SelectValue placeholder={availableDates.length > 0 ? "Select Date" : "No schedules available"} /></SelectTrigger>
                                <SelectContent position="popper" side="bottom" avoidCollisions={false}>
                                    {availableDates.map(d => <SelectItem key={d} value={d}>{format(new Date(d), 'dd-MMM-yyyy, EEEE')}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Boarding & Dropping Points */}
                    {selectedDate && activeSchedule && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            <div className="space-y-2">
                                <Label>Boarding Point</Label>
                                <Select value={boardingPoint} onValueChange={setBoardingPoint}>
                                    <SelectTrigger><SelectValue placeholder="Select boarding" /></SelectTrigger>
                                    <SelectContent>
                                        {points.boarding.map(p => (
                                            <SelectItem key={p.name} value={p.name}>
                                                <div className="flex flex-col text-left">
                                                    <span className="font-medium">{p.name} <span className="text-muted-foreground text-xs">({p.time})</span></span>
                                                    {p.description && <span className="text-xs text-muted-foreground line-clamp-1">{p.description}</span>}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Dropping Point</Label>
                                <Select value={droppingPoint} onValueChange={setDroppingPoint}>
                                    <SelectTrigger><SelectValue placeholder="Select dropping" /></SelectTrigger>
                                    <SelectContent>
                                        {points.dropping.map(p => (
                                            <SelectItem key={p.name} value={p.name}>
                                                <div className="flex flex-col text-left">
                                                    <span className="font-medium">{p.name} <span className="text-muted-foreground text-xs">({p.time})</span></span>
                                                    {p.description && <span className="text-xs text-muted-foreground line-clamp-1">{p.description}</span>}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Passenger Forms */}
            {selectedSeats.length > 0 && (
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <User className="w-5 h-5" /> Passenger Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {passengers.map((p, index) => (
                            <div key={p.seatNumber} className="space-y-3">
                                <h4 className="font-medium text-sm text-primary">Seat {p.seatNumber}</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <Input placeholder="Full Name" value={p.name} onChange={e => updatePassenger(p.seatNumber, 'name', e.target.value)} />
                                    <Input type="number" placeholder="Age" value={p.age} onChange={e => updatePassenger(p.seatNumber, 'age', e.target.value)} />
                                    <Select value={p.gender} onValueChange={(val) => updatePassenger(p.seatNumber, 'gender', val)}>
                                        <SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="male">Male</SelectItem>
                                            <SelectItem value="female">Female</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {index < passengers.length - 1 && <Separator className="mt-4" />}
                            </div>
                        ))}
                        
                        <div className="pt-4 space-y-2">
                            <Label className="flex items-center gap-2 font-medium">
                                <Phone className="w-4 h-4 text-muted-foreground" /> Contact Mobile Number
                            </Label>
                            <Input type="tel" placeholder="e.g. 9876543210" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
                        </div>
                    </CardContent>
                 </Card>
            )}
        </div>

        {/* RIGHT COLUMN: Live Seat Map & Summary */}
        <div className="lg:col-span-5 space-y-6">
             {selectedDate && activeBus ? (
                 <Card className="sticky top-20 border-primary/20 shadow-lg">
                    <CardHeader className="bg-primary/5 pb-4 border-b">
                        <CardTitle className="text-lg flex justify-between items-center">
                            Live Seat Map
                            {activeBus.busNumber && <span className="text-sm font-normal text-muted-foreground bg-white px-2 py-1 rounded-md border">{activeBus.busNumber}</span>}
                        </CardTitle>
                        <CardDescription>Click to select seats. Green/Blue/Pink colors match standard passenger views.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 pb-2">
                         <div className="max-w-[300px] mx-auto">
                            <Tabs value={activeBerth} onValueChange={v => setActiveBerth(v as any)}>
                                <TabsList className="grid grid-cols-2 mb-4">
                                    <TabsTrigger value="lower">Lower Berth</TabsTrigger>
                                    <TabsTrigger value="upper">Upper Berth</TabsTrigger>
                                </TabsList>
                                <TabsContent value="lower">
                                    <IndianSleeper36Layout
                                        schedule={currentSchedule}
                                        bus={activeBus}
                                        berth="lower"
                                        onSeatSelection={setSelectedSeats}
                                        gender={passengers.length > 0 ? passengers[0].gender : undefined}
                                        preSelectedSeats={selectedSeats.map(s => s.number)}
                                    />
                                </TabsContent>
                                <TabsContent value="upper">
                                    <IndianSleeper36Layout
                                        schedule={currentSchedule}
                                        bus={activeBus}
                                        berth="upper"
                                        onSeatSelection={setSelectedSeats}
                                        gender={passengers.length > 0 ? passengers[0].gender : undefined}
                                        preSelectedSeats={selectedSeats.map(s => s.number)}
                                    />
                                </TabsContent>
                            </Tabs>
                         </div>
                    </CardContent>
                    
                    {selectedSeats.length > 0 && (
                        <div className="bg-muted/30 p-4 border-t space-y-4">
                            <div className="flex justify-between items-center font-medium">
                                <span>Selected Seats ({selectedSeats.length})</span>
                                <span className="font-bold text-primary">{selectedSeats.map(s => s.number).join(', ')}</span>
                            </div>

                            {/* SELECT & BLOCK BUTTON */}
                            <Button
                                size="lg"
                                className="w-full text-base bg-zinc-900 hover:bg-black text-white font-semibold flex items-center justify-center gap-2 shadow"
                                onClick={handleBlockSeats}
                                disabled={isBlocking || isLoading}
                            >
                                <ShieldAlert className="w-5 h-5 text-amber-400" />
                                {isBlocking ? "Blocking..." : "Select & Block"}
                            </Button>
                            <p className="text-xs text-center text-muted-foreground">
                                Marks selected seat(s) as unavailable for users to book (shown as sold without color).
                            </p>

                            <div className="relative my-2">
                                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                                <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground font-medium">Or Book For Passenger</span></div>
                            </div>

                            <div className="flex justify-between items-center text-lg font-bold">
                                <span>Total Fare</span>
                                <span className="flex items-center text-primary"><IndianRupee className="w-5 h-5"/>{totalPrice}</span>
                            </div>
                            <Button size="lg" className="w-full text-base" onClick={handleGenerateTicket} disabled={isLoading || isBlocking || !boardingPoint || !droppingPoint || !contactPhone}>
                                <Save className="w-5 h-5 mr-2" />
                                {isLoading ? "Processing..." : "Review Booking & Invoice"}
                            </Button>
                        </div>
                    )}

                    {blockedBookings.length > 0 && (
                        <div className="p-4 bg-zinc-50 border-t space-y-2">
                            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                                <Lock className="w-3.5 h-3.5" />
                                Currently Blocked Seats ({blockedBookings.length})
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {blockedBookings.map((b: any) => (
                                    <div key={b.seat} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-zinc-300 rounded-md text-xs font-medium text-zinc-800 shadow-sm">
                                        <span className="w-2 h-2 rounded-full bg-zinc-400" />
                                        Seat {b.seat}
                                        <button
                                            type="button"
                                            onClick={() => handleUnblockSeat(b.seat)}
                                            className="ml-1 text-red-600 hover:text-red-800 hover:underline text-[11px] font-normal"
                                            title={`Unblock Seat ${b.seat}`}
                                        >
                                            ✕ Unblock
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                 </Card>
             ) : (
                 <Card className="h-full min-h-[400px] flex items-center justify-center border-dashed bg-muted/20">
                     <div className="text-center p-6 text-muted-foreground">
                         <Bus className="w-12 h-12 mx-auto mb-4 opacity-20" />
                         <p>Select a route and date to load the live seat layout.</p>
                     </div>
                 </Card>
             )}
        </div>

      </div>
    </div>
  );
}

