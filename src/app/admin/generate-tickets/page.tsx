
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Ticket, Bus, User, Phone, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { dataService } from '@/lib/data/client-service';
import type { Bus as BusType, Schedule } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addDays } from 'date-fns';
import { useFirebase } from '@/firebase';
import { Separator } from '@/components/ui/separator';

export default function GenerateTicketsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useFirebase();

  const [buses, setBuses] = useState<BusType[]>([]);
  const [selectedBus, setSelectedBus] = useState<string>('');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<string>('');

  const [passengerName, setPassengerName] = useState('');
  const [passengerAge, setPassengerAge] = useState('');
  const [passengerGender, setPassengerGender] = useState<'male' | 'female' | 'other'>('male');
  const [contactPhone, setContactPhone] = useState('');
  const [boardingPoint, setBoardingPoint] = useState('');
  const [droppingPoint, setDroppingPoint] = useState('');

  const [openBusCombobox, setOpenBusCombobox] = useState(false);

  useEffect(() => {
    async function fetchBuses() {
      if (!user) return;
      try {
        const busData = await dataService.getBusesByOperator(user.uid);
        setBuses(busData);
      } catch (error) {
        toast({
          title: 'Error Fetching Buses',
          description: 'Could not load the list of available buses.',
          variant: 'destructive',
        });
      }
    }
    fetchBuses();
  }, [user, toast]);

  useEffect(() => {
    async function fetchSchedules() {
        if (!selectedBus) {
            setSchedules([]);
            setSelectedSchedule('');
            return;
        };

        const today = new Date();
        const thirtyDaysFromNow = addDays(today, 30);
        
        try {
            const allSchedules = await dataService.getSchedules();
            const busSchedules = allSchedules.filter(s => 
                s.busId === selectedBus &&
                new Date(s.date) >= today &&
                new Date(s.date) <= thirtyDaysFromNow
            ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            setSchedules(busSchedules);
        } catch (error) {
            toast({ title: "Error", description: "Could not fetch schedules for the selected bus.", variant: "destructive"});
        }
    }
    fetchSchedules();
  }, [selectedBus, toast]);
  
  const selectedBusDetails = useMemo(() => buses.find(b => b.id === selectedBus), [buses, selectedBus]);

  const handleGenerateTicket = async () => {
    if (!user) {
        toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" });
        return;
    }
    if (!selectedSchedule || !passengerName || !passengerAge || !contactPhone || !boardingPoint || !droppingPoint) {
      toast({ title: "Missing Information", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    setIsLoading(true);

    const schedule = schedules.find(s => s.id === selectedSchedule);
    if (!schedule || !selectedBusDetails) {
        toast({ title: "Error", description: "Selected bus or schedule not found.", variant: "destructive"});
        setIsLoading(false);
        return;
    }
    
    // Find next available seat
    const bookedSeats = new Set((schedule.bookings || []).map(b => b.seat));
    const nextAvailableSeat = (selectedBusDetails.seatLayout.seats || []).find(s => !bookedSeats.has(s.number));

    if(!nextAvailableSeat) {
        toast({ title: "No Seats Available", description: "This bus is full.", variant: "destructive"});
        setIsLoading(false);
        return;
    }

    const bookingData = {
        busId: selectedBusDetails.id,
        scheduleId: schedule.id,
        passengers: [{
            name: passengerName,
            age: parseInt(passengerAge, 10),
            gender: passengerGender,
            seatNumber: nextAvailableSeat.number,
            price: schedule.seatPrices?.[nextAvailableSeat.number] ?? schedule.fare,
        }],
        contact: { phone: contactPhone },
        boardingPoint,
        droppingPoint,
        totalFare: schedule.seatPrices?.[nextAvailableSeat.number] ?? schedule.fare,
        bookingDate: schedule.date,
        busDetails: {
            name: selectedBusDetails.travelsName,
            operator: selectedBusDetails.operator || '',
            origin: selectedBusDetails.origin,
            destination: selectedBusDetails.destination,
            departureTime: selectedBusDetails.departureTime,
            arrivalTime: selectedBusDetails.arrivalTime,
            duration: selectedBusDetails.duration || '',
            busNumber: selectedBusDetails.busNumber,
            boardingPoints: selectedBusDetails.boardingPointsForward || [],
            droppingPoints: selectedBusDetails.droppingPointsForward || [],
        },
    };

    try {
        const createdBooking = await dataService.createPendingBooking({ ...bookingData, userId: user.uid, baseFare: 0, taxes: 0, discount: 0 });
        const bookingResult = await dataService.bookSeats(schedule.id, [{ seatNumber: nextAvailableSeat.number, gender: passengerGender }], user.uid, createdBooking.id);
        
        if (!bookingResult.success) {
            throw new Error(bookingResult.message || 'Seat could not be booked.');
        }

        await dataService.updateTicketStatus(user.uid, createdBooking.id, 'CONFIRMED');

        toast({
            title: 'Ticket Generated!',
            description: `Booking for ${passengerName} on seat ${nextAvailableSeat.number} created.`,
        });
        
        router.push(`/confirmation/${createdBooking.id}`);

    } catch (error: any) {
      toast({ title: 'Ticket Generation Failed', description: error.message, variant: 'destructive' });
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
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
            Generate a ticket for passengers who booked through other platforms. This will grant them access to in-app features like live tracking and arrival alarms. The next available seat will be assigned.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 font-medium">
              <Bus className="w-5 h-5 text-muted-foreground" />
              <span>Select Bus</span>
            </Label>
            <Popover open={openBusCombobox} onOpenChange={setOpenBusCombobox}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openBusCombobox}
                  className="w-full justify-between"
                >
                  {selectedBus ? buses.find((bus) => bus.id === selectedBus)?.travelsName : "Choose a bus"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search bus..." />
                  <CommandList>
                    <CommandEmpty>No bus found.</CommandEmpty>
                    <CommandGroup>
                      {buses.map((bus) => (
                        <CommandItem
                          key={bus.id}
                          value={bus.id}
                          onSelect={(currentValue) => {
                            setSelectedBus(currentValue === selectedBus ? "" : currentValue)
                            setOpenBusCombobox(false)
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedBus === bus.id ? "opacity-100" : "opacity-0")} />
                          {bus.travelsName} ({bus.busNumber})
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          
          {selectedBus && (
            <>
            <div className="space-y-2">
                <Label>Select Schedule</Label>
                <Select value={selectedSchedule} onValueChange={setSelectedSchedule} disabled={schedules.length === 0}>
                    <SelectTrigger>
                        <SelectValue placeholder={schedules.length > 0 ? "Select a date" : "No upcoming schedules"} />
                    </SelectTrigger>
                    <SelectContent>
                        {schedules.map(s => (
                            <SelectItem key={s.id} value={s.id}>{format(new Date(s.date), 'PPP')}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Boarding Point</Label>
                    <Select value={boardingPoint} onValueChange={setBoardingPoint}>
                        <SelectTrigger><SelectValue placeholder="Select boarding point" /></SelectTrigger>
                        <SelectContent>
                            {(selectedBusDetails?.boardingPointsForward || []).map(p => <SelectItem key={p.name} value={p.name}>{p.name} ({p.time})</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                 <div className="space-y-2">
                    <Label>Dropping Point</Label>
                    <Select value={droppingPoint} onValueChange={setDroppingPoint}>
                        <SelectTrigger><SelectValue placeholder="Select dropping point" /></SelectTrigger>
                        <SelectContent>
                            {(selectedBusDetails?.droppingPointsForward || []).map(p => <SelectItem key={p.name} value={p.name}>{p.name} ({p.time})</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            
            <Separator />

            <div className="space-y-2">
                <Label className="flex items-center gap-2 font-medium">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <span>Passenger Details</span>
                </Label>
                <Input placeholder="Passenger Name" value={passengerName} onChange={e => setPassengerName(e.target.value)} />
                <div className="grid grid-cols-2 gap-4">
                    <Input type="number" placeholder="Age" value={passengerAge} onChange={e => setPassengerAge(e.target.value)} />
                </div>
            </div>

            <div className="space-y-2">
                <Label className="flex items-center gap-2 font-medium">
                  <Phone className="w-5 h-5 text-muted-foreground" />
                  <span>Contact Details</span>
                </Label>
                <Input type="tel" placeholder="Phone Number" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
            </div>
            </>
          )}

        </CardContent>
        <CardFooter>
            <Button onClick={handleGenerateTicket} disabled={isLoading || !selectedSchedule} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {isLoading ? 'Generating...' : 'Generate Ticket'}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
