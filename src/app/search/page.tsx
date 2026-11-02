'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { dataService } from '@/lib/data/client-service';
import { BusCard } from '@/components/bus-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Bus as BusTypeIcon, Frown, ChevronLeft, ChevronRight, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { format, addDays, subDays, isBefore, startOfToday, parseISO } from 'date-fns';
import { formatIndianDate, isValidDate } from '@/lib/utils';
import Loading from './loading';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { Bus, Schedule } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';

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
    const timeToMinutes = (time?: string) => {
      if (!time || typeof time !== 'string') return 0;
      const [hours, minutes] = time.split(':').map(Number);
      return (hours * 60) + minutes;
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
      <div className="container mx-auto px-4 py-12 flex justify-center">
        <Alert variant="destructive" className="max-w-md shadow-xl border-red-200 bg-white">
          <Frown className="h-5 w-5 text-red-500" />
          <AlertTitle className="text-red-700 font-bold text-lg">Invalid Search</AlertTitle>
          <AlertDescription className="text-red-600">
            Please provide origin, destination, and date to search for buses.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sleek Gradient Header */}
      <div className="relative bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-500 text-white overflow-hidden shadow-md">
        {/* Decorative background elements */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2 pointer-events-none"></div>
        
        <div className="container mx-auto px-4 py-10 relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
                <h1 className="text-3xl md:text-5xl font-headline font-bold tracking-tight text-white mb-2 flex items-center gap-3">
                    {origin} 
                    <span className="text-white/60 font-light text-2xl">→</span> 
                    {destination}
                </h1>
                <p className="text-white/80 font-medium text-lg flex items-center gap-2">
                    <BusTypeIcon className="w-5 h-5" /> Let the journey begin!
                </p>
            </div>
            
            {/* Glassmorphic Date Selector */}
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 p-2 rounded-2xl shadow-lg">
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 rounded-xl text-white hover:bg-white/20 hover:text-white transition-colors" 
                    onClick={() => handleDateChange(subDays(currentDateObj, 1))} 
                    disabled={isPrevDateDisabled}
                >
                    <ChevronLeft className="h-5 w-5" strokeWidth={2} />
                </Button>
                <div className="px-4 py-2 min-w-[140px] text-center">
                    <p className="text-sm text-white/70 font-semibold uppercase tracking-wider mb-0.5">{format(currentDateObj, 'EEEE')}</p>
                    <p className="text-lg font-bold text-white leading-none">{format(currentDateObj, 'dd MMM yyyy')}</p>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 rounded-xl text-white hover:bg-white/20 hover:text-white transition-colors" 
                    onClick={() => handleDateChange(addDays(currentDateObj, 1))}
                >
                    <ChevronRight className="h-5 w-5" strokeWidth={2} />
                </Button>
            </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Enhanced Filter Sidebar */}
          <aside className="w-full lg:w-1/4 xl:w-1/5 shrink-0">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 p-6 sticky top-24">
              <div className="flex items-center gap-2 mb-6">
                <SlidersHorizontal className="w-5 h-5 text-indigo-500" />
                <h2 className="text-xl font-bold text-slate-800 font-headline">Filters</h2>
              </div>
              
              <div className="space-y-8">
                {/* Bus Type Section */}
                <div>
                  <h3 className="font-semibold text-slate-900 mb-4 tracking-tight">Bus Type</h3>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3 group cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
                      <Checkbox 
                        id="ac" 
                        checked={filters.busType.includes('a/c')}
                        onCheckedChange={() => handleFilterChange('busType', 'a/c')}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 w-5 h-5"
                      />
                      <span className="text-slate-600 group-hover:text-slate-900 font-medium select-none">A/C (Air Conditioned)</span>
                    </label>
                    <label className="flex items-center space-x-3 group cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
                      <Checkbox 
                        id="non-ac" 
                        checked={filters.busType.includes('non-a/c')}
                        onCheckedChange={() => handleFilterChange('busType', 'non-a/c')}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 w-5 h-5"
                      />
                      <span className="text-slate-600 group-hover:text-slate-900 font-medium select-none">Non-A/C</span>
                    </label>
                  </div>
                </div>
                
                {/* Seat Type Section */}
                <div>
                  <h3 className="font-semibold text-slate-900 mb-4 tracking-tight">Seat Type</h3>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3 group cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
                      <Checkbox 
                        id="seater" 
                        checked={filters.seatType.includes('seater')}
                        onCheckedChange={() => handleFilterChange('seatType', 'seater')}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 w-5 h-5"
                      />
                      <span className="text-slate-600 group-hover:text-slate-900 font-medium select-none">Seater</span>
                    </label>
                    <label className="flex items-center space-x-3 group cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
                      <Checkbox 
                        id="sleeper" 
                        checked={filters.seatType.includes('sleeper')}
                        onCheckedChange={() => handleFilterChange('seatType', 'sleeper')}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 w-5 h-5"
                      />
                      <span className="text-slate-600 group-hover:text-slate-900 font-medium select-none">Sleeper</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Results Area */}
          <main className="flex-1 space-y-6 min-w-0">
            {/* Results Header */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100 gap-4">
                <p className="text-slate-600 font-medium">
                    Found <span className="font-bold text-slate-900">{sortedBuses.length}</span> {sortedBuses.length === 1 ? 'bus' : 'buses'} matching your criteria
                </p>
                <div className="flex items-center gap-3">
                    <ArrowUpDown className="w-4 h-4 text-slate-400" />
                    <Select value={sortOption} onValueChange={setSortOption}>
                        <SelectTrigger className="w-[200px] border-slate-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 font-medium">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-slate-100 shadow-xl">
                            <SelectItem value="earlyDeparture">Early Departure</SelectItem>
                            <SelectItem value="lateDeparture">Late Departure</SelectItem>
                            <SelectItem value="priceLowToHigh">Price: Low to High</SelectItem>
                            <SelectItem value="priceHighToLow">Price: High to Low</SelectItem>
                            <SelectItem value="bestRated">Best Rated</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Bus Cards List */}
            <div className="space-y-5">
              <AnimatePresence>
                {sortedBuses.length > 0 ? (
                  sortedBuses.map(({ service, actualBus, schedule }, index) => (
                    <motion.div
                        key={schedule.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                        <BusCard 
                            bus={actualBus} 
                            schedule={schedule} 
                            service={service} 
                            date={date} 
                            searchOrigin={origin} 
                            searchDestination={destination} 
                        />
                    </motion.div>
                  ))
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-3xl p-12 text-center shadow-lg border border-slate-100 flex flex-col items-center justify-center min-h-[40vh]"
                    >
                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                            <Frown className="w-12 h-12 text-slate-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2 font-headline">No Buses Found</h2>
                        <p className="text-slate-500 max-w-md mx-auto">
                            We couldn't find any buses matching your current filters for this route and date. Try adjusting your search criteria.
                        </p>
                        <Button 
                            variant="outline" 
                            className="mt-6 rounded-xl text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                            onClick={() => setFilters({ busType: [], seatType: [] })}
                        >
                            Clear Filters
                        </Button>
                    </motion.div>
                )}
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default SearchPageWrapper;
