
'use client';

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { dataService } from '@/lib/data/client-service';
import { BusCard } from '@/components/bus-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Frown, Ticket } from 'lucide-react';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import Loading from '@/app/search/loading';
import { Button } from '@/components/ui/button';
import { format, isBefore, startOfToday, parseISO } from 'date-fns';
import { formatIndianDate, getScheduledDateTime } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function TicketsListPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isUserLoading } = useFirebase();
  const { toast } = useToast();
  const phoneSearch = searchParams.get('phone');
  const flowParam = searchParams.get('flow');

  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOption, setSortOption] = useState("travelDateAsc");
  const [filterOption] = useState(phoneSearch ? "upcoming" : "all");

  useEffect(() => {
    async function findBookings() {
      if (isUserLoading) return;
      setIsLoading(true);

      try {
        let foundBookings: any[] = [];
        if (phoneSearch) {
          foundBookings = await dataService.getUserTicketsByPhone(phoneSearch);
        } else if (user) {
          foundBookings = await dataService.getUserTicketsByUserId(user.uid);
        }
        setBookings(foundBookings);
      } catch (e: any) {
        console.error("Failed to find bookings:", e);
        toast({
          title: 'Search Failed',
          description: e.message || 'Could not retrieve your bookings.',
          variant: 'destructive',
        });
        setBookings([]);
      } finally {
        setIsLoading(false);
      }
    }
    
    findBookings();
  }, [user, phoneSearch, isUserLoading, toast]);


  const filteredAndSortedBookings = useMemo(() => {
    const now = new Date();
    let filtered = bookings.filter(booking => {
      if (flowParam === 'crew') {
        if (booking.generatedBy !== 'crew') {
            return false;
        }
        return true;
      }

      if (!booking.bookingDate) return false;
      
      const departureDateTime = getScheduledDateTime(booking.bookingDate, booking.busDetails.departureTime, booking.busDetails.departureTime);
      if (!departureDateTime) return false;
      const isPast = isBefore(departureDateTime, now);
      
      let matchesFilter = true;
      if (filterOption === 'upcoming') {
        matchesFilter = !isPast;
      } else if (filterOption === 'past') {
        matchesFilter = isPast;
      }
      
      return matchesFilter;
    });

    return [...filtered].sort((a, b) => {
        switch(sortOption) {
            case 'travelDateAsc':
                return new Date(a.bookingDate).getTime() - new Date(b.bookingDate).getTime();
            case 'travelDateDesc':
            default:
                return new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime();
        }
    });
  }, [bookings, sortOption, filterOption, flowParam]);

  if (isLoading || isUserLoading) {
    return <Loading />;
  }

  if (!user && !phoneSearch) {
    return (
        <div className="container mx-auto px-4 py-8">
            <Card className="max-w-2xl mx-auto text-center">
                <CardHeader>
                    <Ticket className="w-16 h-16 mx-auto text-primary" />
                    <CardTitle>View Your Bookings</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Please log in to see your bookings.</p>
                </CardContent>
                <CardContent className="flex justify-center gap-4">
                    <Button onClick={() => router.push('/login')}>Log In</Button>
                </CardContent>
            </Card>
        </div>
    );
  }

  let lastDate: string | null = null;
  const getPointDateTime = (
    baseDateStr: string,
    pointTime: string,
    boardingReferenceTime: string
  ): Date | null => {
    if (!baseDateStr || !pointTime || !boardingReferenceTime) return null;
  
    const baseDate = parseISO(baseDateStr);
    if (!isValidDate(baseDate)) return null;
  
    const [pH, pM] = pointTime.split(':').map(Number);
    const [bH, bM] = boardingReferenceTime.split(':').map(Number);
  
    const dt = new Date(baseDate);
    dt.setHours(pH, pM, 0, 0);
  
    if (pH * 60 + pM < bH * 60 + bM) {
      dt.setDate(dt.getDate() + 1);
    }
  
    return dt;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-4xl mx-auto mt-8">
        <CardHeader className="border-b">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div className="flex flex-col">
                    <CardTitle className="text-2xl font-headline font-semibold">My Bookings</CardTitle>
                    <CardDescription>
                      {phoneSearch ? `Bookings for ${phoneSearch}` : `You have ${filteredAndSortedBookings.length} booking(s) matching the criteria.`}
                    </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                     <div className="flex items-center gap-2">
                        <Label htmlFor="sort-by" className="font-semibold shrink-0">Sort by</Label>
                         <Select value={sortOption} onValueChange={setSortOption}>
                            <SelectTrigger className="w-full sm:w-[220px]" id="sort-by">
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="travelDateAsc">First Upcoming to Last</SelectItem>
                                <SelectItem value="travelDateDesc">Last Upcoming to First</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>
        </CardHeader>
        <CardContent className="p-6">
        {filteredAndSortedBookings.length > 0 ? (
          <div className="space-y-6">
            {filteredAndSortedBookings.map((booking, index) => {
              if (!booking.bookingDate) return null; // Safety check
              const seatNumbers = booking.passengers.map((p: any) => p.seatNumber);

              const firstBoardingTime = booking.busDetails.boardingPoints?.[0]?.time || booking.busDetails.departureTime;
              const boardingDateTime = getPointDateTime(booking.bookingDate, booking.busDetails.departureTime, firstBoardingTime);
              
              const headerDateStr = boardingDateTime ? format(boardingDateTime, 'yyyy-MM-dd') : '';
              
              const showDateHeader = headerDateStr !== lastDate;
              const showThickSeparator = showDateHeader && index > 0;
              const showThinSeparator = !showDateHeader && index > 0;
              lastDate = headerDateStr;

              let cardFlow: 'view' | 'track' = 'view';
              if (flowParam === 'track' || filterOption === 'upcoming') {
                 cardFlow = 'track';
              }


              return (
                <React.Fragment key={booking.id}>
                    {showThickSeparator && <Separator className="my-6 border-b-2 border-border" />}
                    {showThinSeparator && <Separator className="my-4" />}
                    <div className="space-y-2">
                    {showDateHeader && (
                        <p className="text-left font-bold">
                            {formatIndianDate(boardingDateTime!)}
                        </p>
                    )}
                    <BusCard 
                        bus={booking.busDetails} 
                        schedule={booking}
                        service={booking.service}
                        date={booking.bookingDate.toString()} 
                        bookingId={booking.id} 
                        totalFare={booking.totalFare}
                        seatNumbers={seatNumbers}
                        flow={cardFlow}
                    />
                    </div>
                </React.Fragment>
              )
            })}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <Frown className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-headline">No Bookings Found</h2>
            <p className="text-muted-foreground">
                No bookings found matching your search criteria.
            </p>
          </Card>
        )}
        </CardContent>
      </Card>
    </div>
  );
}

function isValidDate(d?: Date | null): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
}

export default function TicketsPage() {
    return (
        <Suspense fallback={<Loading />}>
            <TicketsListPageContent />
        </Suspense>
    )
}
