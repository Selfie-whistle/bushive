
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Ticket, Bus, User, Phone, Save, ArrowRight, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { dataService } from '@/lib/data/client-service';
import type { Bus as BusType, Schedule, Point } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { useFirebase } from '@/firebase';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function GenerateTicketsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();
  const { user, isUserLoading } = useFirebase();

  const [bus, setBus] = useState<BusType | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);

  const [passengerName, setPassengerName] = useState('');
  const [passengerAge, setPassengerAge] = useState('');
  const [passengerGender, setPassengerGender] = useState<'male' | 'female' | 'other'>('male');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [seatNumber, setSeatNumber] = useState('');

  const [mainBoardingPoint, setMainBoardingPoint] = useState('');
  const [subBoardingPoint, setSubBoardingPoint] = useState('');
  const [mainDroppingPoint, setMainDroppingPoint] = useState('');
  const [subDroppingPoint, setSubDroppingPoint] = useState('');

  useEffect(() => {
    if (isUserLoading) return;
    if (!user || user.email !== 'cabincrew9435@gmail.com') {
        setIsLoading(false);
        return;
    };
    
    async function fetchTripDetails() {
        try {
            const allBuses = await dataService.getBuses();
            const assignedBus = allBuses.find(b => b.cabinCrewId === user?.email);
            setBus(assignedBus || null);

            if (assignedBus) {
                const now = new Date();
                const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
                const dateToUse = now < noon ? new Date(now.setDate(now.getDate() - 1)) : now;
                const dateStr = format(dateToUse, 'yyyy-MM-dd');

                const todaySchedule = await dataService.getSchedule(`${dateStr}_${assignedBus.id}`);
                setSchedule(todaySchedule);
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Could not load assigned trip details.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }

    fetchTripDetails();
  }, [user, isUserLoading, toast]);

  const mainBoardingPoints = useMemo(() => {
    if (!bus?.boardingPointsForward) return [];
    return [...new Set(bus.boardingPointsForward.map(p => p.main).filter(Boolean))];
  }, [bus]);

  const subBoardingPoints = useMemo(() => {
    if (!bus?.boardingPointsForward || !mainBoardingPoint) return [];
    return bus.boardingPointsForward.filter(p => p.main === mainBoardingPoint);
  }, [bus, mainBoardingPoint]);

  const mainDroppingPoints = useMemo(() => {
    if (!bus?.droppingPointsForward) return [];
    return [...new Set(bus.droppingPointsForward.map(p => p.main).filter(Boolean))];
  }, [bus]);

  const subDroppingPoints = useMemo(() => {
    if (!bus?.droppingPointsForward || !mainDroppingPoint) return [];
    return bus.droppingPointsForward.filter(p => p.main === mainDroppingPoint);
  }, [bus, mainDroppingPoint]);


  const handleGenerateTicket = async () => {
    if (!user) {
        toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" });
        return;
    }
    if (!schedule || !bus || !passengerName || !contactPhone || !seatNumber || !subBoardingPoint || !subDroppingPoint) {
      toast({ title: "Missing Information", description: "All fields except email are required.", variant: "destructive" });
      return;
    }
    setIsLoading(true);

    const passengerUserId = `${contactPhone}@example.com`;
    const normalizedSeatNumber = seatNumber.toUpperCase().trim();

    // Validation for existing booking
    const existingBookingRef = schedule.bookings.find(b => b.seat === normalizedSeatNumber);
    if (existingBookingRef) {
        const existingBookingDetails = await dataService.getBookingById(existingBookingRef.userId, existingBookingRef.bookingId);
        if (existingBookingDetails) {
            const existingPassenger = existingBookingDetails.passengers[0];
            const enteredAge = parseInt(passengerAge, 10);

            // Check if details roughly match. Allow some flexibility.
            if (
                existingPassenger.name.toLowerCase() !== passengerName.toLowerCase() ||
                (enteredAge > 0 && existingPassenger.age !== enteredAge) ||
                existingPassenger.gender !== passengerGender
            ) {
                toast({
                    title: "Seat Already Booked",
                    description: `Seat ${normalizedSeatNumber} is booked for a different passenger. Please verify details.`,
                    variant: 'destructive',
                });
                setIsLoading(false);
                return;
            }
            // If details match, we can proceed to just ensure the ticket exists.
            router.push(`/cabin-crew/confirmation/${existingBookingDetails.id}`);
            setIsLoading(false);
            return;
        }
    }


    const bookingData = {
        busId: bus.id,
        scheduleId: schedule.id,
        passengers: [{
            name: passengerName,
            age: parseInt(passengerAge, 10) || 0,
            gender: passengerGender,
            seatNumber: normalizedSeatNumber,
            price: 0, 
        }],
        contact: { phone: contactPhone, email: contactEmail },
        boardingPoint: subBoardingPoint,
        droppingPoint: subDroppingPoint,
        totalFare: 0,
        bookingDate: schedule.date,
        generatedBy: 'crew',
        busDetails: {
            name: bus.travelsName,
            operator: bus.operator || '',
            origin: bus.origin,
            destination: bus.destination,
            departureTime: bus.departureTime,
            arrivalTime: bus.arrivalTime,
            duration: bus.duration || '',
            busNumber: bus.busNumber,
            contactNumber: bus.contactNumber || '',
            boardingPoints: bus.boardingPointsForward || [],
            droppingPoints: bus.droppingPointsForward || [],
        },
    };

    try {
        const createdBooking = await dataService.createPendingBooking({ ...bookingData, userId: passengerUserId, baseFare: 0, taxes: 0, discount: 0 });
        
        await dataService.updateTicketStatus(passengerUserId, createdBooking.id, 'CONFIRMED');

        const bookingResult = await dataService.bookSeats(
            schedule.id,
            [{ 
                seatNumber: normalizedSeatNumber, 
                gender: passengerGender,
                passengerName: passengerName,
                boardingPoint: bookingData.boardingPoint || bus.origin
            }],
            passengerUserId,
            createdBooking.id,
            {
                boardingPoint: bookingData.boardingPoint || bus.origin,
                boardingMain: bus.origin,
                passengerName: passengerName
            }
        );
        
        if (!bookingResult.success) {
            throw new Error(bookingResult.message || 'Seat could not be reserved in schedule.');
        }

        toast({
            title: 'Ticket Generated!',
            description: `A ticket has been created for ${passengerName} on seat ${normalizedSeatNumber}.`,
        });
        
        router.push(`/cabin-crew/confirmation/${createdBooking.id}`);

    } catch (error: any) {
      toast({ title: 'Ticket Generation Failed', description: error.message, variant: 'destructive' });
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
        <div className="container mx-auto px-4 py-8">
            <Card className="max-w-2xl mx-auto">
                <CardHeader><Skeleton className="h-8 w-2/3" /></CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        </div>
    );
  }

  if (!bus || !schedule) {
    return (
        <div className="container mx-auto px-4 py-8">
            <Card className="max-w-2xl mx-auto text-center">
                <CardHeader>
                    <CardTitle>No Active Trip</CardTitle>
                    <CardDescription>You do not seem to be assigned to an active trip for today.</CardDescription>
                </CardHeader>
                 <CardFooter>
                    <Button onClick={() => router.push('/cabin-crew')}>Back to Console</Button>
                 </CardFooter>
            </Card>
        </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Button variant="ghost" size="sm" onClick={() => router.push('/cabin-crew')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-3">
            <Ticket className="w-6 h-6 text-primary" />
            Generate Manual Ticket
          </CardTitle>
          <CardDescription>
            Generate a ticket for passengers who booked through other platforms. This will grant them access to in-app features like live tracking and arrival alarms.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <Card className="bg-muted/50">
                <CardHeader className="text-center">
                    <div className="text-xl font-bold font-headline text-black">
                        {bus.travelsName}
                    </div>
                    {bus.busNumber && (
                        <div className="mt-1 inline-block mx-auto">
                            <div className="bg-yellow-400 text-black font-mono text-sm font-bold px-2 py-1 rounded-md border-2 border-black">
                                {bus.busNumber}
                            </div>
                        </div>
                    )}
                    <CardDescription className="font-bold text-black mt-1 flex items-center justify-center gap-2">
                      {bus.origin} <ArrowRight className="h-5 w-5" /> {bus.destination}
                    </CardDescription>
                     <p className="text-sm font-bold text-red-600">
                        {format(new Date(schedule.date), 'dd MMMM yyyy, EEEE')}
                     </p>
                </CardHeader>
            </Card>
            
            <Separator />

            <div className="space-y-2">
                <Label className="flex items-center gap-2 font-medium">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <span>Passenger Details</span>
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input placeholder="Passenger Name" value={passengerName} onChange={e => setPassengerName(e.target.value)} />
                    <Input placeholder="Seat Number (e.g., L5)" value={seatNumber} onChange={e => setSeatNumber(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Input type="number" placeholder="Age" value={passengerAge} onChange={e => setPassengerAge(e.target.value)} />
                    <Select value={passengerGender} onValueChange={(v) => setPassengerGender(v as any)}>
                        <SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label className="flex items-center gap-2 font-medium">
                  <Phone className="w-5 h-5 text-muted-foreground" />
                  <span>Contact Details</span>
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input type="tel" placeholder="Phone Number" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-10" type="email" placeholder="Email (Optional)" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
                    </div>
                </div>
            </div>

            <Separator />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Boarding Point</Label>
                    <Select value={mainBoardingPoint} onValueChange={setMainBoardingPoint}>
                        <SelectTrigger><SelectValue placeholder="Select Area" /></SelectTrigger>
                        <SelectContent>
                            {mainBoardingPoints.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {mainBoardingPoint && (
                        <Select value={subBoardingPoint} onValueChange={setSubBoardingPoint}>
                            <SelectTrigger><SelectValue placeholder="Select Point" /></SelectTrigger>
                            <SelectContent>
                                {subBoardingPoints.map(p => <SelectItem key={p.name} value={p.name}>{p.name} ({p.time})</SelectItem>)}
                            </SelectContent>
                        </Select>
                    )}
                </div>
                <div className="space-y-2">
                    <Label>Dropping Point</Label>
                    <Select value={mainDroppingPoint} onValueChange={setMainDroppingPoint}>
                        <SelectTrigger><SelectValue placeholder="Select Area" /></SelectTrigger>
                        <SelectContent>
                            {mainDroppingPoints.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {mainDroppingPoint && (
                         <Select value={subDroppingPoint} onValueChange={setSubDroppingPoint}>
                            <SelectTrigger><SelectValue placeholder="Select Point" /></SelectTrigger>
                            <SelectContent>
                                {subDroppingPoints.map(p => <SelectItem key={p.name} value={p.name}>{p.name} ({p.time})</SelectItem>)}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

        </CardContent>
        <CardFooter>
            <Button onClick={handleGenerateTicket} disabled={isLoading} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {isLoading ? 'Generating...' : 'Generate Ticket'}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
