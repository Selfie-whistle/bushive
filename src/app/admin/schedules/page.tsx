'use client';

import { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { dataService } from '@/lib/data/client-service';
import type { Bus, Schedule, Seat } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TD, TH, TableHeader, TR } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Frown, ArrowLeft, ArrowRight, Eye, Trash2, Ban, Route, ArrowLeftRight } from 'lucide-react';
import { format, isBefore, startOfToday } from 'date-fns';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { swapBusesForDayAction, swapBusRotationForServiceAction } from '@/lib/actions/schedule-actions';

/* ================= PAGE ================= */

function SchedulesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serviceId = searchParams.get('serviceId');
  const { toast } = useToast();

  const [serviceBus, setServiceBus] = useState<Bus | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [busesById, setBusesById] = useState<Record<string, Bus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busFilter, setBusFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');

  /* ---------- ROUTE PER SCHEDULE (KEY FIX) ---------- */
  const getRouteForSchedule = useCallback(
    (schedule: Schedule) => {
      if (!serviceBus) return '';
      return schedule.direction === 'RETURN'
        ? `${serviceBus.destination} → ${serviceBus.origin}`
        : `${serviceBus.origin} → ${serviceBus.destination}`;
    },
    [serviceBus]
  );

  /* ---------- FETCH ---------- */
  const fetchSchedules = useCallback(async () => {
    if (!serviceId) {
      // No ID, so we can't proceed. The UI will handle this.
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const allSchedules = await dataService.getSchedules();
      const schedulesForService = allSchedules.filter(s => s.serviceId === serviceId);

      const serviceData = await dataService.getServiceById(serviceId);
      
      let forwardBus: Bus | null = null;

      if (serviceData?.forwardBusId) {
        forwardBus = await dataService.getBusById(serviceData.forwardBusId);
      }

      if (!forwardBus) {
        // fallback: infer from schedules
        const anySchedule = schedulesForService.find(s => s.serviceId === serviceId);
        if (anySchedule) {
          forwardBus = await dataService.getBusById(anySchedule.busId);
        }
      }

      if (!forwardBus) {
        setError('No bus found for this service');
        setLoading(false);
        return;
      }
      
      setServiceBus(forwardBus);

      const allBuses = await dataService.getBuses();
      const busMap = allBuses.reduce((acc, b) => {
        acc[b.id] = b;
        return acc;
      }, {} as Record<string, Bus>);
      setBusesById(busMap);

      const today = startOfToday();

      const futureSchedules = schedulesForService
        .filter(s => !isBefore(new Date(s.date), today))
        .sort((a, b) => {
            const dateComp = new Date(a.date).getTime() - new Date(b.date).getTime();
            if (dateComp !== 0) return dateComp;
            return a.direction === 'FORWARD' ? -1 : 1; // Show FORWARD first on same day
        });

      setSchedules(futureSchedules);
    } catch (e) {
      console.error(e);
      setError('Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);
  
  const filteredSchedules = useMemo(() => {
    return schedules.filter(schedule => {
        const busMatch = busFilter === 'all' || schedule.actualBusId === busFilter;
        const routeMatch = routeFilter === 'all' || schedule.direction === routeFilter;
        return busMatch && routeMatch;
    });
  }, [schedules, busFilter, routeFilter]);


  /* ---------- LOWEST FARE ---------- */
  const getLowestFare = useCallback(
    (schedule: Schedule) => {
      const busForSchedule = busesById[schedule.actualBusId || schedule.busId];
      if (!busForSchedule?.seatLayout?.seats) return schedule.fare;

      const allSeats: Seat[] = busForSchedule.seatLayout.seats;
      const booked = new Set(schedule.bookings?.map(b => b.seat));
      const prices = schedule.seatPrices || {};

      const available = allSeats.filter(s => s && !booked.has(s.number));
      if (!available.length) return schedule.fare;
      
      const validPrices = available.map(s => prices[s.number] ?? busForSchedule.baseFare).filter(p => p > 0);
      if (validPrices.length === 0) return schedule.fare;

      return Math.min(...validPrices);
    },
    [busesById]
  );
  
  const serviceBuses = useMemo(() => {
    if (!schedules.length || !serviceBus) return [];
    
    // Find all unique bus IDs associated with this service's schedules.
    const serviceScheduleBusIds = new Set(schedules.map(s => s.actualBusId).filter(Boolean));
    
    const potentialReturnBus = Object.values(busesById).find(b => 
        b.origin === serviceBus.destination && 
        b.destination === serviceBus.origin &&
        b.operatorId === serviceBus.operatorId
    );
    if(potentialReturnBus) {
        serviceScheduleBusIds.add(potentialReturnBus.id);
    }

    return Object.values(busesById).filter(b => serviceScheduleBusIds.has(b.id));
  }, [schedules, busesById, serviceBus]);

  /* ---------- ACTIONS ---------- */
  const handleSwapForDate = async (date: string, serviceId: string) => {
    try {
        const result = await swapBusesForDayAction(serviceId, date);
        if (result.success) {
            toast({ title: 'Buses Swapped', description: result.message });
            fetchSchedules(); // to refresh data
        } else {
            throw new Error(result.message);
        }
    } catch (e: any) {
        toast({ title: 'Swap Failed', description: e.message, variant: 'destructive'});
    }
  }

  const handleBulkSwap = async () => {
    if (!serviceId) return;
    try {
      const result = await swapBusRotationForServiceAction(serviceId);
      if (result.success) {
        toast({ title: 'Rotation Swapped', description: result.message });
        fetchSchedules();
      } else {
        throw new Error(result.message);
      }
    } catch (e: any) {
      toast({ title: 'Swap Failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    await dataService.deleteSchedule(id);
    toast({ title: 'Schedule deleted' });
    fetchSchedules();
  };

  const handleCancel = async (s: Schedule) => {
    await dataService.cancelScheduleAndBookings(s.id, s.bookings);
    toast({ title: 'Trip cancelled' });
    fetchSchedules();
  };

  const handleDeleteAll = async () => {
    if (!serviceId) return;
    try {
        const result = await dataService.deleteAllSchedulesForService(serviceId);
        if (result.success) {
            toast({ title: 'Schedules Cleared', description: result.message });
        } else {
            throw new Error(result.message);
        }
        fetchSchedules();
    } catch(e: any) {
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  /* ---------- STATES ---------- */
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-10 w-1/3 mb-4" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!serviceId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <Route className="h-4 w-4" />
          <AlertTitle>No Service Selected</AlertTitle>
          <AlertDescription>
            Please select a service from the Trips page to view its schedules.
            <Button variant="link" onClick={() => router.push('/admin/trips')} className="p-0 h-auto ml-1">
              Go to Trips
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <Frown className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  /* ---------- UI ---------- */
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.push('/admin/trips')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{serviceBus?.travelsName}</h1>
            <p className="text-muted-foreground">
                {serviceBus?.origin} &lt;--&gt; {serviceBus?.destination}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
              <div>
                  <CardTitle>Scheduled Trips</CardTitle>
                  <CardDescription>{filteredSchedules.length} upcoming trips found for this service route.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={busFilter} onValueChange={setBusFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Buses" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Buses</SelectItem>
                        {serviceBuses.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.busNumber}
                              </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
                 <Select value={routeFilter} onValueChange={setRouteFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Routes" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Routes</SelectItem>
                        <SelectItem value="FORWARD">Forward</SelectItem>
                        <SelectItem value="RETURN">Return</SelectItem>
                    </SelectContent>
                </Select>
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4 mr-2" /> Delete All
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete all future, non-booked schedules for this bus service. This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteAll}>
                                Delete All Schedules
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
              </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TR>
                <TH>Date</TH>
                <TH>Route</TH>
                <TH>
                  <div className="flex items-center gap-2">
                    <span>Bus No.</span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Interchange bus assignments for all dates">
                          <ArrowLeftRight className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Interchange Bus Assignments?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will swap the assigned buses for every scheduled date in this service.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleBulkSwap}>
                            Confirm Interchange
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TH>
                <TH className="text-right">Available</TH>
                <TH className="text-right">Starts From</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </TableHeader>

            <TableBody>
              {filteredSchedules.map((s, index) => {
                const hasBookings = (s.bookings?.length || 0) > 0;
                const busForSchedule = busesById[s.actualBusId || ''];
                const isFirstOfDate = index === 0 || filteredSchedules[index - 1].date !== s.date;
                const canSwap = filteredSchedules.some(other => other.date === s.date && other.id !== s.id);

                return (
                  <TR key={s.id}>
                    <TD>{format(new Date(s.date), 'PPP')}</TD>
                    <TD className="font-semibold text-sm">
                      {getRouteForSchedule(s)}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span>{busForSchedule?.busNumber || 'N/A'}</span>
                        {isFirstOfDate && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!canSwap} title="Swap buses for this date">
                                <ArrowLeftRight className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Swap buses for {format(new Date(s.date), 'PPP')}?</AlertDialogTitle>
                                <AlertDialogDescription>This will swap the assigned buses for both forward and return trips for this date.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleSwapForDate(s.date, s.serviceId!)}>
                                    Confirm Swap
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TD>
                    <TD className="text-right">{s.availableSeats}</TD>
                    <TD className="text-right font-headline font-semibold">₹{getLowestFare(s)}</TD>
                    <TD>
                        <div className="flex gap-2 justify-end">
                       <Button size="sm" variant="outline" onClick={() => router.push(`/admin/fare-editor/${s.id}`)}>
                        Fare Editor
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/bookings/${s.id}`)}>
                        <Eye className="h-4 w-4 mr-1" /> Manifest
                      </Button>

                      {hasBookings ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="destructive">
                              <Ban className="h-4 w-4 mr-1" /> Cancel
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel Trip?</AlertDialogTitle>
                              <AlertDialogDescription>
                                All bookings will be cancelled.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>No</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleCancel(s)}>
                                Yes
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="destructive">
                              <Trash2 className="h-4 w-4 mr-1" /> Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Schedule?</AlertDialogTitle>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>No</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(s.id)}>
                                Yes
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TableBody>
          </Table>

          {filteredSchedules.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              No schedules found for the selected filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- WRAPPER ---------- */
export default function SchedulesPage() {
  return (
    <Suspense fallback={<div>Loading schedules…</div>}>
      <SchedulesPageContent />
    </Suspense>
  );
}
