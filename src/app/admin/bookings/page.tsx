
'use client';

import React, { useState, useEffect, Suspense, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bus, CalendarIcon, Search, Ticket } from 'lucide-react';
import { dataService } from '@/lib/data/client-service';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import type { Bus as BusType, Booking } from '@/lib/types';
import { cn, formatIndianDate } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO, isBefore } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TD, TH, TableHeader, TR } from '@/components/ui/table';
import { useFirebase } from '@/firebase';

interface ProcessedBooking extends Booking {
  bus: BusType;
}

function getDisplayStatus(booking: ProcessedBooking): Booking['status'] {
    if (booking.status === 'PENDING') {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const createdAt = parseISO(booking.createdAt);
        if (isBefore(createdAt, tenMinutesAgo)) {
            return 'FAILED';
        }
    }
    return booking.status;
}

function getStatusColor(status: Booking['status']) {
    switch (status) {
        case 'CONFIRMED':
            return 'bg-green-100 text-green-700';
        case 'PENDING':
            return 'bg-yellow-100 text-yellow-800';
        case 'FAILED':
        case 'CANCELLED':
            return 'bg-red-100 text-red-700';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}


function AllBookingsPageContent() {
    const { user } = useFirebase();
    const [allBookings, setAllBookings] = useState<ProcessedBooking[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortOption, setSortOption] = useState("createdAtDesc");
    const [searchQuery, setSearchQuery] = useState('');
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const dateFilter = searchParams.get('date');
    const [now, setNow] = useState(new Date());

    const previousBookingIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(new Date());
        }, 60 * 1000); // Update every minute to re-check pending status

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        const unsubscribe = dataService.onAllBookingsSnapshot(
            async (fetchedBookings) => {
                const operatorBuses = await dataService.getBusesByOperator(user.uid, user.displayName || '');
                const operatorBusIds = new Set(operatorBuses.map(b => b.id));
                
                const operatorBookings = fetchedBookings.filter(booking => {
                    if (booking.bus && operatorBusIds.has(booking.bus.id)) {
                        return true;
                    }
                    if (booking.bus?.travelsName === 'CLUB ANAND TRAVEL' && user.displayName === 'CLUB ANAND TRAVEL') {
                        return true;
                    }
                    return false;
                });

                const newBookingIds = new Set(operatorBookings.map(b => b.id));

                if (previousBookingIds.current.size > 0) { // Don't show notifications on initial load
                    for (const booking of operatorBookings) {
                        if (!previousBookingIds.current.has(booking.id)) {
                            // This is a new booking
                            toast({
                                title: "New Booking Received!",
                                description: `Seat(s) ${booking.passengers.map(p => p.seatNumber).join(', ')} booked on ${booking.bus.travelsName}.`,
                                duration: 5000,
                            });
                        }
                    }
                }
                
                previousBookingIds.current = newBookingIds;
                setAllBookings(operatorBookings as ProcessedBooking[]);
                setLoading(false);
            },
            (error) => {
                console.error("Failed to fetch bookings in real-time:", error);
                toast({
                    title: "Error",
                    description: "Could not load booking data in real-time.",
                    variant: "destructive"
                });
                setLoading(false);
            }
        );

        // Cleanup the listener when the component unmounts
        return () => unsubscribe();
    }, [toast, user]);

    const filteredAndSortedBookings = useMemo(() => {
        let filtered = [...allBookings];
        
        if (dateFilter) {
            filtered = filtered.filter(b => b.bookingDate === dateFilter);
        }

        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(b => 
                b.id.toLowerCase().includes(lowercasedQuery) ||
                b.passengers.some(p => p.name.toLowerCase().includes(lowercasedQuery)) ||
                b.contact.phone.toLowerCase().includes(lowercasedQuery) ||
                (b.bus && b.bus.origin.toLowerCase().includes(lowercasedQuery)) ||
                (b.bus && b.bus.destination.toLowerCase().includes(lowercasedQuery))
            );
        }
        
        const sorted = filtered.sort((a, b) => {
            switch (sortOption) {
                case "createdAtAsc":
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                case "travelDateAsc":
                    return new Date(a.bookingDate).getTime() - new Date(b.bookingDate).getTime();
                case "travelDateDesc":
                    return new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime();
                case "createdAtDesc":
                default:
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
        });
        return sorted;
    }, [allBookings, sortOption, dateFilter, searchQuery]);

    if (loading) {
        return (
             <div className="container mx-auto px-4 py-8">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-1/3" />
                        <Skeleton className="h-4 w-1/4 mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                       {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </CardContent>
                </Card>
             </div>
        );
    }
    
    return (
        <div className="container mx-auto px-4 py-8">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center gap-4">
                        <div className="flex-grow">
                            <CardTitle className="flex items-center gap-3">
                                <Ticket className="w-6 h-6 text-primary" />
                                All Bookings
                            </CardTitle>
                            <CardDescription>
                                {filteredAndSortedBookings.length} booking(s) found.
                                {dateFilter && <Button variant="link" onClick={() => router.push('/admin/bookings')}>Clear Date Filter</Button>}
                            </CardDescription>
                        </div>
                         <div className="flex items-center gap-2">
                             <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Search by ID, passenger, phone..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 w-[280px]"
                                />
                             </div>
                             <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant={"outline"}
                                    className={cn(
                                      "w-[240px] justify-start text-left font-normal",
                                      !dateFilter && "text-muted-foreground"
                                    )}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateFilter ? format(parseISO(dateFilter), "PPP") : <span>Filter by travel date</span>}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                  <Calendar
                                    mode="single"
                                    selected={dateFilter ? parseISO(dateFilter) : undefined}
                                    onSelect={(day) => router.push(`/admin/bookings?date=${format(day!, 'yyyy-MM-dd')}`)}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                            <Select value={sortOption} onValueChange={setSortOption}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Sort by" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="createdAtDesc">Newest First</SelectItem>
                                    <SelectItem value="createdAtAsc">Oldest First</SelectItem>
                                    <SelectItem value="travelDateAsc">Travel Date: Asc</SelectItem>
                                    <SelectItem value="travelDateDesc">Travel Date: Desc</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                     <Table>
                        <TableHeader>
                            <TR>
                            <TH>Booking ID</TH>
                            <TH>Route</TH>
                            <TH>Passenger(s)</TH>
                            <TH>Seats</TH>
                            <TH>Status</TH>
                            <TH>Booked On</TH>
                            <TH />
                            </TR>
                        </TableHeader>
                        <TableBody>
                            {filteredAndSortedBookings.map((booking) => {
                                const displayStatus = getDisplayStatus(booking);
                                return (
                                <TR key={booking.id}>
                                    <TD className="font-mono text-xs">{booking.id}</TD>
                                    <TD>
                                        <div className="font-medium">{booking.bus?.origin} → {booking.bus?.destination}</div>
                                        <div className="text-xs text-muted-foreground">{formatIndianDate(booking.bookingDate)}</div>
                                    </TD>
                                    <TD>
                                        <div>{booking.passengers[0].name}</div>
                                        {booking.passengers.length > 1 && <div className="text-xs text-muted-foreground">+{booking.passengers.length - 1} more</div>}
                                    </TD>
                                    <TD className="font-mono text-sm">{booking.passengers.map(p => p.seatNumber).join(', ')}</TD>
                                    <TD>
                                    <span
                                        className={cn(
                                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                                            getStatusColor(displayStatus)
                                        )}
                                    >
                                        {displayStatus}
                                    </span>
                                    </TD>
                                    <TD className="text-xs">{format(parseISO(booking.createdAt), 'dd MMM yyyy, p')}</TD>
                                    <TD>
                                    <div className="flex gap-2 justify-end">
                                        <Button size="sm" variant="ghost" onClick={() => router.push(`/confirmation/${booking.id}?from=admin`)}>
                                        View
                                        </Button>
                                    </div>
                                    </TD>
                                </TR>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

export default function AllBookingsPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <AllBookingsPageContent />
        </Suspense>
    )
}
