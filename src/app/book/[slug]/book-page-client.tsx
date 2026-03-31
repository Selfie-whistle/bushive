
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight,
  Mail,
  Phone,
  Frown,
  Bus as BusIcon,
  MapIcon,
  Star,
  MessageCircle,
  Filter,
  Image as ImageIcon,
} from 'lucide-react';
import { format, parseISO, isToday } from 'date-fns';

import type { Bus, Seat, Schedule, Point, PointGroup, Service, Review } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { signInAnonymously } from 'firebase/auth';
import { IndianSleeper36Layout } from '@/components/ui/indian-sleeper-36-layout';
import { dataService } from '@/lib/data/client-service';
import Loading from './loading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, isValidDate, formatTime } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BusImageGallery } from '@/components/bus-image-gallery';

/* ---------------- SCHEMA ---------------- */

const passengerSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters' }),
  age: z.coerce
    .number()
    .min(1, { message: 'Age must be at least 1' })
    .max(120, { message: 'Age must be less than 120' }),
  gender: z.enum(['male', 'female', 'other'], {
    required_error: 'Gender is required',
  }),
  price: z.number(),
  seatNumber: z.string(),
});

const bookingSchema = z.object({
  passengers: z
    .array(passengerSchema)
    .min(1, { message: 'At least one passenger is required.' }),
  contact: z.object({
    email: z.union([z.string().email(), z.literal('')]).optional(),
    phone: z.string().min(10, { message: 'Phone number must be at least 10 digits' }),
  }),
  boardingPoint: z.string().min(1, { message: 'Boarding point is required' }),
  droppingPoint: z.string().min(1, { message: 'Dropping point is required' }),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

// ===== POINT FILTERING BASED ON SEARCH (MAIN / SUB) =====
const filterPointsBySearch = (
  points: Point[],
  searched?: string
): Point[] => {
  if (!points || points.length === 0 || !searched) return points;

  const normalizedSearch = searched.toLowerCase().trim();

  // 1️⃣ Find the matched point (can be main OR sub)
  const matchedPoint = points.find(
    p =>
      p.name.toLowerCase().trim() === normalizedSearch ||
      p.main?.toLowerCase().trim() === normalizedSearch
  );

  if (!matchedPoint) return points;

  const targetMain = matchedPoint.main || matchedPoint.name;

  // 2️⃣ Return ALL points under the same main
  return points.filter(
    p =>
      (p.main?.toLowerCase().trim() === targetMain.toLowerCase().trim()) ||
      (p.name.toLowerCase().trim() === targetMain.toLowerCase().trim())
  );
};


/* ---------------- PAGE ---------------- */

export function BookPageClient({
  scheduleId,
  date,
  searchedFrom,
  searchedTo,
  changeSeatFor,
}: {
  scheduleId: string;
  date: string;
  searchedFrom?: string;
  searchedTo?: string;
  changeSeatFor?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { auth, user, isUserLoading } = useFirebase();

  const [bus, setBus] = useState<Bus | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<'boarding' | 'dropping'>('boarding');
  const [activeBerth, setActiveBerth] = useState<'lower' | 'upper'>('lower');

  // Review Filter & Sort State
  const [ratingFilter, setRatingFilter] = useState('all');
  const [sortOption, setSortOption] = useState('newest');

  const isSeatChangeMode = !!changeSeatFor;

  const selectedSeatNumbers = useMemo(() => selectedSeats.map(s => s.number), [selectedSeats]);

  /* ---------------- FETCH ---------------- */

  useEffect(() => {
    if (!scheduleId || isUserLoading) return;

    const unsub = dataService.onScheduleSnapshot(scheduleId, async (s) => {
      if (!s) {
        setError('Schedule not found');
        setIsLoading(false);
        return;
      }
      setSchedule(s);
      const busIdToFetch = s.actualBusId || s.busId;
      const busData = await dataService.getBusById(busIdToFetch);
      setBus(busData);
      
      if (s.serviceId) {
        const serviceData = await dataService.getServiceById(s.serviceId);
        setService(serviceData);
      }

      setIsLoading(false);
    });

    return () => unsub?.();
  }, [scheduleId, isUserLoading]);

  useEffect(() => {
    if (bus?.id) {
      const unsubReviews = dataService.onBusReviewsSnapshot(bus.id, setReviews);
      return () => unsubReviews();
    }
  }, [bus?.id]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return null;
    const sum = reviews.reduce((acc, r) => acc + r.busRating, 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  const processedReviews = useMemo(() => {
    let result = [...reviews];

    // Filter by rating
    if (ratingFilter !== 'all') {
      const targetRating = parseInt(ratingFilter, 10);
      result = result.filter(r => r.busRating === targetRating);
    }

    // Sort
    result.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;

      switch (sortOption) {
        case 'highest': return b.busRating - a.busRating;
        case 'lowest': return a.busRating - b.busRating;
        case 'oldest': return timeA - timeB;
        case 'newest':
        default: return timeB - timeA;
      }
    });

    return result;
  }, [reviews, ratingFilter, sortOption]);

  const getRatingColorClasses = (rating: number) => {
    switch (rating) {
      case 5:
        return "bg-green-700/10 border-green-700 text-green-900";
      case 4:
        return "bg-green-400/10 border-green-400 text-green-800";
      case 3:
        return "bg-yellow-400/10 border-yellow-400 text-yellow-800";
      case 2:
        return "bg-orange-400/10 border-orange-400 text-orange-800";
      case 1:
        return "bg-red-400/10 border-red-400 text-red-800";
      default:
        return "bg-primary/5 border-primary/20 text-gray-700";
    }
  };

  /* ---------------- FORM ---------------- */

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { passengers: [], contact: { email: '', phone: '' } },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: 'passengers',
  });
  
  const firstPassengerGender = form.watch('passengers.0.gender');

  /* ---------------- POINT HELPERS ---------------- */

  const onTabChange = (value: string) => {
    setActiveTab(value as 'boarding' | 'dropping');
  };

  const getPointDateTime = (
    pointTime: string,
    boardingReferenceTime: string
  ): Date | null => {
    if (!date || !pointTime || !boardingReferenceTime) return null;
  
    const baseDate = parseISO(date);
    if (!isValidDate(baseDate)) return null;
  
    const [pH, pM] = pointTime.split(':').map(Number);
    const [bH, bM] = boardingReferenceTime.split(':').map(Number);
  
    const dt = new Date(baseDate);
    dt.setHours(pH, pM, 0, 0);
  
    // 🔑 Overnight detection
    if (pH * 60 + pM < bH * 60 + bM) {
      dt.setDate(dt.getDate() + 1);
    }
  
    return dt;
  };

  const boardingPoints = useMemo(() => {
    if (!service || !schedule) return [];
  
    const points =
      schedule.direction === 'RETURN'
        ? service.boardingPointsReturn || []
        : service.boardingPointsForward || [];
  
    const filteredBySearch = filterPointsBySearch(points, searchedFrom);

    // Only filter past points if the journey date is today
    const journeyDate = parseISO(date);
    if (!isToday(journeyDate)) {
        return filteredBySearch;
    }
    
    const now = new Date();
    // Use the first available boarding point's time as the reference for overnight calculation
    const firstTime = filteredBySearch.length > 0 ? filteredBySearch[0].time : bus?.departureTime;
    
    return filteredBySearch.filter(point => {
        const pointDateTime = getPointDateTime(point.time, firstTime || '00:00');
        // Keep the point if dateTime is in the future, or if dateTime calculation fails (failsafe)
        return pointDateTime ? pointDateTime >= now : true;
    });

  }, [service, schedule, searchedFrom, date, bus?.departureTime]);
  
  const droppingPoints = useMemo(() => {
    if (!service || !schedule) return [];
  
    const points =
      schedule.direction === 'RETURN'
        ? service.droppingPointsReturn || []
        : service.droppingPointsForward || [];
  
    return filterPointsBySearch(points, searchedTo);
  }, [service, schedule, searchedTo]);

  const groupPoints = (points: Point[]): PointGroup[] => {
    if (!points) return [];
    const map = new Map<string, Point[]>();
    points.forEach((p) => {
      const key = p.main || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return Array.from(map.entries()).map(([main, pts]) => ({
      main,
      points: pts.sort((a, b) => a.time.localeCompare(b.time)),
    }));
  };

  const boardingGroups = useMemo(
    () => groupPoints(boardingPoints),
    [boardingPoints]
  );
  const droppingGroups = useMemo(
    () => groupPoints(droppingPoints),
    [droppingPoints]
  );
  
  const firstBoardingTime = useMemo(() => {
    if (!boardingPoints || boardingPoints.length === 0) return bus?.departureTime;
    return boardingPoints[0].time;
  }, [boardingPoints, bus?.departureTime]);

  /* ---------------- SEAT HANDLER ---------------- */

  const handleSeatSelection = useCallback((seats: Seat[]) => {
    if (isSeatChangeMode && seats.length > 1) {
        toast({
            title: 'Select only one seat',
            description: "You can only change one seat at a time.",
            variant: "destructive"
        });
        const lastSeat = seats[seats.length - 1];
        const singleSeatArr = [lastSeat];
        setSelectedSeats(singleSeatArr);
        replace([{
          name: '',
          age: 0,
          gender: 'male',
          price: lastSeat.price,
          seatNumber: lastSeat.number
        }]);
        return;
    }
    
    setSelectedSeats(seats);
    
    // Sync form fields while trying to preserve existing passenger data by seat number
    const currentPassengers = form.getValues('passengers') || [];
    const newPassengers = seats.map((seat) => {
        const existing = currentPassengers.find(p => p.seatNumber === seat.number);
        return existing || {
            name: '',
            age: 0,
            gender: 'male',
            price: seat.price,
            seatNumber: seat.number,
        };
    });
    replace(newPassengers);
  }, [isSeatChangeMode, replace, form, toast]);

  /* ---------------- SUBMIT ---------------- */
  const finalAmount = useMemo(() => {
    return selectedSeats.reduce((t, s) => t + s.price, 0);
  }, [selectedSeats]);

  const onSubmit = async (data: BookingFormValues) => {
    if (!bus || !schedule) return;
    if (!user && auth) await signInAnonymously(auth);
  
    sessionStorage.setItem(
      'booking',
      JSON.stringify({
        busId: bus.id,
        scheduleId: schedule.id,
        passengers: data.passengers,
        contact: data.contact,
        boardingPoint: data.boardingPoint,
        droppingPoint: data.droppingPoint,
        totalFare: finalAmount,
        isSeatChangeMode,
        originalBookingId: changeSeatFor,
        scheduleDirection: schedule.direction,
      })
    );
  
    router.push('/payment');
  };

  /* ---------------- STATES ---------------- */

  if (isLoading || isUserLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (error || !bus || !schedule) {
    return (
      <div className="container mx-auto px-4 py-10">
        <Alert variant="destructive">
          <Frown className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error ?? 'Not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }


  /* ---------------- UI ---------------- */

  return (
    <div className="relative pb-28 bg-muted/40">
      {/* PAGE HEADER */}
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BusIcon className="w-6 h-6 text-primary" />
          {bus.travelsName}
        </h1>
      </div>

      {/* MAIN CONTENT */}
      <div className="container mx-auto px-4 space-y-8">
        <Form {...form}>
          <form id="bookingForm" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            
            {/* BUS PHOTOS GALLERY */}
            {(bus.images?.length || 0) + (bus.operatorImages?.length || 0) > 0 && (
              <Card className="overflow-hidden border-none shadow-sm">
                <CardHeader className="bg-primary/5 py-3">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-primary" />
                    Bus Photos
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 bg-white">
                  <BusImageGallery images={bus.images} operatorImages={bus.operatorImages} />
                </CardContent>
              </Card>
            )}

            {/* SEAT LAYOUT */}
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
                      onSeatSelection={handleSeatSelection}
                      gender={firstPassengerGender}
                      preSelectedSeats={selectedSeatNumbers}
                    />
                  </TabsContent>

                  <TabsContent value="upper">
                    <IndianSleeper36Layout
                      schedule={schedule}
                      bus={bus}
                      berth="upper"
                      onSeatSelection={handleSeatSelection}
                      gender={firstPassengerGender}
                      preSelectedSeats={selectedSeatNumbers}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* BOARDING / DROPPING */}
            {!isSeatChangeMode && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {activeTab === 'boarding'
                      ? 'Where should we pick you up?'
                      : 'Where should we drop you?'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="max-w-xl mx-auto">
                    <Tabs value={activeTab} onValueChange={onTabChange}>
                        <TabsList className="grid grid-cols-2 mb-4">
                        <TabsTrigger value="boarding">Boarding</TabsTrigger>
                        <TabsTrigger value="dropping">Dropping</TabsTrigger>
                        </TabsList>
                        <TabsContent value="boarding" className="mt-0">
                        <FormField
                            control={form.control}
                            name="boardingPoint"
                            render={({ field }) => (
                            <RadioGroup
                                value={field.value}
                                onValueChange={(value) => {
                                field.onChange(value);
                                setActiveTab('dropping');
                                }}
                                className="space-y-4"
                            >
                                {boardingGroups.map(group => (
                                <div key={group.main}>
                                    <p className="text-sm font-semibold mb-2">
                                    {group.main}
                                    </p>
                                    <div className="space-y-2">
                                    {group.points.map(point => {
                                      const pointDateTime = getPointDateTime(point.time, firstBoardingTime || bus.departureTime);
                                      return (
                                        <FormItem
                                        key={point.name}
                                        className="border rounded-md has-[input:checked]:border-primary has-[input:checked]:bg-primary/10"
                                        >
                                        <FormLabel className="flex items-start gap-3 p-3 cursor-pointer">
                                            <FormControl>
                                            <RadioGroupItem value={point.name} />
                                            </FormControl>
                                            <div className="flex-1">
                                            <div className="flex justify-between text-sm font-medium">
                                                <span>{point.name}</span>
                                                {pointDateTime && <span className="text-right">{formatTime(point.time)} <span className="text-muted-foreground text-xs">{format(pointDateTime, 'dd MMM')}</span></span>}
                                            </div>
                                            {point.description && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                {point.description}
                                                </p>
                                            )}
                                            </div>
                                        </FormLabel>
                                        </FormItem>
                                    )})}
                                    </div>
                                </div>
                                ))}
                            </RadioGroup>
                            )}
                        />
                        </TabsContent>

                        <TabsContent value="dropping" className="mt-0">
                        <FormField
                            control={form.control}
                            name="droppingPoint"
                            render={({ field }) => (
                            <RadioGroup
                                value={field.value}
                                onValueChange={field.onChange}
                                className="space-y-4"
                            >
                                {droppingGroups.map(group => (
                                <div key={group.main}>
                                    <p className="text-sm font-semibold mb-2">
                                    {group.main}
                                    </p>
                                    <div className="space-y-2">
                                    {group.points.map(point => {
                                      const pointDateTime = getPointDateTime(point.time, firstBoardingTime || bus.departureTime);
                                      return (
                                        <FormItem
                                        key={point.name}
                                        className="border rounded-md has-[input:checked]:border-primary has-[input:checked]:bg-primary/10"
                                        >
                                        <FormLabel className="flex items-start gap-3 p-3 cursor-pointer">
                                            <FormControl>
                                            <RadioGroupItem value={point.name} />
                                            </FormControl>
                                            <div className="flex-1">
                                            <div className="flex justify-between text-sm font-medium">
                                                <span>{point.name}</span>
                                                {pointDateTime && <span className="text-right">{formatTime(point.time)} <span className="text-muted-foreground text-xs">{format(pointDateTime, 'dd MMM')}</span></span>}
                                            </div>
                                            {point.description && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                {point.description}
                                                </p>
                                            )}
                                            </div>
                                        </FormLabel>
                                        </FormItem>
                                    )})}
                                    </div>
                                </div>
                                ))}
                            </RadioGroup>
                            )}
                        />
                        </TabsContent>
                    </Tabs>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* PASSENGER DETAILS */}
            {selectedSeats.length > 0 && !isSeatChangeMode && (
              <Card>
                <CardHeader>
                  <CardTitle>Passenger Details</CardTitle>
                  <CardDescription>
                    Complete info for each selected seat.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {fields.map((field, index) => (
                    <div key={field.id} className="p-4 border rounded-lg space-y-4">
                      <p className="font-semibold">Passenger {index + 1} (Seat {field.seatNumber})</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`passengers.${index}.name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`passengers.${index}.age`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Age</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="Enter age" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`passengers.${index}.gender`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Gender</FormLabel>
                                <FormControl>
                                <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-3 gap-4">
                                    <FormItem>
                                        <FormLabel className={cn("flex items-center justify-center gap-2 rounded-lg border p-3 font-normal cursor-pointer", field.value === 'male' && "bg-blue-100 border-blue-600 text-blue-800")}>
                                            <FormControl><RadioGroupItem value="male" className="sr-only" /></FormControl>Male
                                        </FormLabel>
                                    </FormItem>
                                    <FormItem>
                                        <FormLabel className={cn("flex items-center justify-center gap-2 rounded-lg border p-3 font-normal cursor-pointer", field.value === 'female' && "bg-pink-100 border-pink-600 text-pink-800")}>
                                            <FormControl><RadioGroupItem value="female" className="sr-only" /></FormControl>Female
                                        </FormLabel>
                                    </FormItem>
                                    <FormItem>
                                        <FormLabel className={cn("flex items-center justify-center gap-2 rounded-lg border p-3 font-normal cursor-pointer", field.value === 'other' && "bg-green-100 border-green-600 text-green-800")}>
                                            <FormControl><RadioGroupItem value="other" className="sr-only" /></FormControl>Other
                                        </FormLabel>
                                    </FormItem>
                                </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                      />
                    </div>
                  ))}
                  
                  <Separator />

                  <div>
                     <CardTitle className="text-base mb-2">Contact Details</CardTitle>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="contact.phone" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Phone Number</FormLabel>
                                <FormControl><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-10" type="tel" {...field} /></div></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="contact.email" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Email (Optional)</FormLabel>
                                <FormControl><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-10" type="email" {...field} /></div></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                     </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ASSIGNED BUS */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm uppercase text-muted-foreground">
                  Assigned Bus
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="inline-block bg-yellow-400 text-black font-mono text-sm font-bold px-2 py-1 rounded-md border-2 border-black">
                      {bus.busNumber}
                    </div>
                    {averageRating && (
                        <div className="flex items-center gap-1 mt-2">
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <span className="text-sm font-bold">{averageRating}/5.0</span>
                            <span className="text-sm text-muted-foreground">({reviews.length} ratings)</span>
                        </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* PASSENGER REVIEWS */}
            {reviews.length > 0 && (
              <Card className="border-none shadow-sm bg-white">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 font-headline text-lg">
                        <MessageCircle className="w-5 h-5 text-primary" />
                        Passenger Reviews
                      </CardTitle>
                      <CardDescription>Verified feedback from travelers who deboarded this bus.</CardDescription>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={ratingFilter} onValueChange={setRatingFilter}>
                        <SelectTrigger className="w-[130px] h-8 text-xs">
                          <div className="flex items-center gap-2">
                            <Filter className="h-3 w-3 text-muted-foreground" />
                            <SelectValue placeholder="Rating" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Ratings</SelectItem>
                          <SelectItem value="5">5 Stars</SelectItem>
                          <SelectItem value="4">4 Stars</SelectItem>
                          <SelectItem value="3">3 Stars</SelectItem>
                          <SelectItem value="2">2 Stars</SelectItem>
                          <SelectItem value="1">1 Star</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={sortOption} onValueChange={setSortOption}>
                        <SelectTrigger className="w-[130px] h-8 text-xs">
                          <SelectValue placeholder="Sort" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">Newest First</SelectItem>
                          <SelectItem value="oldest">Oldest First</SelectItem>
                          <SelectItem value="highest">Highest Rating</SelectItem>
                          <SelectItem value="lowest">Lowest Rating</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {processedReviews.length > 0 ? (
                    processedReviews.map((review) => (
                      <div key={review.id} className={cn(
                        "p-4 rounded-xl border transition-colors",
                        getRatingColorClasses(review.busRating)
                      )}>
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 border shadow-sm">
                              <AvatarFallback className="bg-white/50 text-[10px] font-bold">
                                {review.passengerName?.[0] || 'P'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-bold">{review.passengerName || 'Anonymous Traveler'}</p>
                              <p className="text-[10px] opacity-70">
                                {review.timestamp ? format(parseISO(review.timestamp), 'dd MMM yyyy') : 'Recently'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5">
                            {[...Array(5)].map((_, i) => (
                              <Star 
                                key={i} 
                                className={cn(
                                  "w-3 h-3", 
                                  i < review.busRating ? "fill-current" : "opacity-20"
                                )} 
                              />
                            ))}
                          </div>
                        </div>
                        <p className="text-sm italic">&quot;{review.busFeedback || 'Great journey!'}&quot;</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 text-muted-foreground border border-dashed rounded-xl">
                      No reviews found matching the selected rating.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </form>
        </Form>
      </div>

      {/* STICKY BOTTOM PAYMENT BAR */}
      {!isSeatChangeMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Amount</p>
              <p className="text-xl font-bold font-headline">₹{finalAmount.toFixed(2)}</p>
            </div>

            <Button
              size="lg"
              disabled={selectedSeats.length === 0 || isSubmitting}
              onClick={() => form.handleSubmit(onSubmit)()}
            >
              Proceed to Payment
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
