

'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { dataService } from '@/lib/data/client-service';
import { BusCard } from '@/components/bus-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Bus as BusTypeIcon, Frown, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, subDays, isBefore, startOfToday, parseISO } from 'date-fns';
import { formatIndianDate, isValidDate } from '@/lib/utils';
import Loading from './loading';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { Bus, Schedule } from '@/lib/types';

function SearchPageWrapper() {
    return (
        <Suspense fallback={<Loading />}>
          <SearchPage />
        </Suspense>
    );
}

type FilterState = {
  busType: string[];
  seatType: string[];
};

function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const origin = searchParams.get('origin') || undefined;
  const destination = searchParams.get('destination') || undefined;
  const date = searchParams.get('date') || undefined;
  
  const [results, setResults] = useState<{service: any, schedule: any, actualBus: any}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    busType: [],
    seatType: [],
  });
  const [sortOption, setSortOption] = useState("earlyDeparture");

  const currentDateObj = useMemo(() => date ? parseISO(date) : new Date(), [date]);
  const isPrevDateDisabled = isBefore(currentDateObj, startOfToday());


  const handleDateChange = (newDate: Date) => {
    const params = new URLSearchParams();
    if (origin) params.set('origin', origin);
    if (destination) params.set('destination', destination);
    params.set('date', format(newDate, 'yyyy-MM-dd'));
    router.push(`/search?${params.toString()}`);
  };

  useEffect(() => {
    async function fetchBuses() {
      if (origin && destination && date) {
        setIsLoading(true);
        try {
          const foundResults = await dataService.searchBuses(origin, destination, date);
          setResults(foundResults);
        } catch (error) {
          console.error("Failed to fetch buses:", error);
          setResults([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    }
    fetchBuses();
  }, [origin, destination, date]);

  const handleFilterChange = (filterGroup: keyof FilterState, value: string) => {
    setFilters(prev => {
      const currentGroup = prev[filterGroup];
      const newGroup = currentGroup.includes(value)
        ? currentGroup.filter(item => item !== value)
        : [...currentGroup, value];
      return { ...prev, [filterGroup]: newGroup };
    });
  };

  const filteredBuses = useMemo(() => {
    const now = new Date();

    return results.filter(result => {
      const { actualBus, schedule, service } = result;

      const boardingPoints = schedule.direction === 'RETURN' ? service.boardingPointsReturn : service.boardingPointsForward;

      // Departure time check
      const normalizedOrigin = origin?.trim().toLowerCase();
      const relevantBoardingPoints = (boardingPoints || []).filter(
        (p: any) => p.main?.toLowerCase() === normalizedOrigin || p.name?.toLowerCase() === normalizedOrigin
      );
      const boardingPointForSearch = relevantBoardingPoints.length > 0 ? relevantBoardingPoints[relevantBoardingPoints.length - 1] : null;
      
      const boardingTime = boardingPointForSearch?.time || actualBus.departureTime;
      const [bH, bM] = boardingTime.split(":").map(Number);
      const departureDateTimeForCheck = new Date(currentDateObj);
      departureDateTimeForCheck.setHours(bH, bM, 0, 0);

      if (now > departureDateTimeForCheck) {
        return false;
      }
      
      // Other filters
      const busTypeLower = actualBus.busType ? actualBus.busType.toLowerCase() : '';
      const seatTypeLower = actualBus.busCategory ? actualBus.busCategory.toLowerCase() : '';

      const busTypeMatch =
        filters.busType.length === 0 ||
        filters.busType.some(type => busTypeLower.includes(type));

      const seatTypeMatch =
        filters.seatType.length === 0 ||
        filters.seatType.some(type => seatTypeLower.includes(type));

      return busTypeMatch && seatTypeMatch;
    });
  }, [results, filters, origin, currentDateObj]);

  const sortedBuses = useMemo(() => {
    const timeToMinutes = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    return [...filteredBuses].sort((a, b) => {
      switch (sortOption) {
        case "earlyDeparture":
          return timeToMinutes(a.actualBus.departureTime) - timeToMinutes(b.actualBus.departureTime);
        case "lateDeparture":
          return timeToMinutes(b.actualBus.departureTime) - timeToMinutes(a.actualBus.departureTime);
        case "priceLowToHigh":
          return a.schedule.fare - b.schedule.fare;
        case "priceHighToLow":
          return b.schedule.fare - a.schedule.fare;
        case "bestRated":
          return (b.actualBus.rating || 0) - (a.actualBus.rating || 0);
        default:
          return 0;
      }
    });
  }, [filteredBuses, sortOption]);

  const headerDateText = useMemo(() => {
    if (!date) return '';
    const dateObj = parseISO(date);
    return isValidDate(dateObj) ? formatIndianDate(dateObj) : '';
  }, [date]);

  if (isLoading) {
    return <Loading />;
  }
  
  if (!origin || !destination || !date) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <Frown className="h-4 w-4" />
          <AlertTitle>Invalid Search</AlertTitle>
          <AlertDescription>
            Please provide origin, destination, and date to search for buses.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="bg-muted/40">
      <div className="bg-primary text-primary-foreground py-4">
        <div className="container mx-auto px-4">
            <h1 className="text-2xl font-headline font-bold">{origin} to {destination}</h1>
            <div className="flex items-center gap-4 mt-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDateChange(subDays(currentDateObj, 1))} disabled={isPrevDateDisabled}>
                    <ChevronLeft className="h-8 w-8" strokeWidth={1.5} />
                </Button>
                <p className="opacity-90 text-center font-semibold">{headerDateText}</p>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDateChange(addDays(currentDateObj, 1))}>
                    <ChevronRight className="h-8 w-8" strokeWidth={1.5} />
                </Button>
            </div>
        </div>
      </div>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          <aside className="w-full md:w-1/4">
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Bus Type</h3>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ac" 
                        checked={filters.busType.includes('a/c')}
                        onCheckedChange={() => handleFilterChange('busType', 'a/c')}
                        />
                      <Label htmlFor="ac">A/C</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="non-ac" 
                        checked={filters.busType.includes('non-a/c')}
                        onCheckedChange={() => handleFilterChange('busType', 'non-a/c')}
                        />
                      <Label htmlFor="non-ac">Non-A/C</Label>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Seat Type</h3>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="seater" 
                        checked={filters.seatType.includes('seater')}
                        onCheckedChange={() => handleFilterChange('seatType', 'seater')}
                        />
                      <Label htmlFor="seater">Seater</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="sleeper" 
                        checked={filters.seatType.includes('sleeper')}
                        onCheckedChange={() => handleFilterChange('seatType', 'sleeper')}
                        />
                      <Label htmlFor="sleeper">Sleeper</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
          <main className="w-full md:w-3/4 space-y-4">
            <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">Showing {sortedBuses.length} of {results.length} buses</p>
                <Select value={sortOption} onValueChange={setSortOption}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="earlyDeparture">Early Departure</SelectItem>
                        <SelectItem value="lateDeparture">Late Departure</SelectItem>
                        <SelectItem value="priceLowToHigh">Price: Low to High</SelectItem>
                        <SelectItem value="priceHighToLow">Price: High to Low</SelectItem>
                        <SelectItem value="bestRated">Best Rated</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {sortedBuses.length > 0 ? (
              sortedBuses.map(({ service, actualBus, schedule }) => <BusCard key={schedule.id} bus={actualBus} schedule={schedule} service={service} date={date} searchOrigin={origin} searchDestination={destination} />)
            ) : (
                <Card className="flex flex-col items-center justify-center p-12 text-center">
                    <Frown className="w-16 h-16 text-muted-foreground mb-4" />
                    <h2 className="text-xl font-headline">No Buses Found</h2>
                    <p className="text-muted-foreground">Sorry, we couldn't find any buses for the selected route, date, and filters.</p>
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default SearchPageWrapper;
