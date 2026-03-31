'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bus, Frown, Route, ArrowRight } from 'lucide-react';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import { format } from 'date-fns';
import type { Bus as BusType, Schedule } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';

export default function LiveTrackingPage() {
  const { user, isUserLoading } = useFirebase();
  const router = useRouter();
  const [activeTrips, setActiveTrips] = useState<{ schedule: Schedule; bus: BusType }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isUserLoading || !user) {
      if (!isUserLoading) setLoading(false);
      return;
    }

    setLoading(true);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    
    const unsubscribe = dataService.onSchedulesForDateSnapshot(todayStr, async (schedules) => {
      const adminBuses = await dataService.getBusesByOperator(user.uid, user.displayName || '');
      const adminBusIds = new Set(adminBuses.map(b => b.id));
      
      const operatorSchedules = schedules.filter(s => adminBusIds.has(s.actualBusId || s.busId));
      
      const trips = await Promise.all(
        operatorSchedules.map(async (schedule) => {
          const bus = await dataService.getBusById(schedule.actualBusId || schedule.busId);
          return bus ? { schedule, bus } : null;
        })
      );
      
      setActiveTrips(trips.filter(Boolean) as { schedule: Schedule; bus: BusType }[]);
      setLoading(false);
    }, (error) => {
      console.error("Failed to load active trips:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, isUserLoading]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-4 w-1/2 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-lg w-full text-center">
          <CardHeader>
            <Frown className="w-14 h-14 mx-auto text-destructive" />
            <CardTitle className="mt-2">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">You must be logged in to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Live Bus Tracking</CardTitle>
          <CardDescription>{activeTrips.length} bus(es) are active today.</CardDescription>
        </CardHeader>
        <CardContent>
          {activeTrips.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {activeTrips.map(({ schedule, bus }) => (
                <AccordionItem value={schedule.id} key={schedule.id}>
                  <AccordionTrigger className="p-4 hover:no-underline hover:bg-muted/50">
                    <div className="flex justify-between items-center w-full">
                        <div className="flex items-center gap-4">
                            <Bus className="h-6 w-6 text-primary" />
                            <div>
                                <p className="font-semibold">{bus.travelsName}</p>
                                <div className="bg-yellow-400 text-black font-mono text-sm font-bold px-2 py-1 rounded-md border-2 border-black inline-block my-1">
                                  {bus.busNumber}
                                </div>
                            </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {bus.origin} <ArrowRight className="inline h-4 w-4" /> {bus.destination}
                        </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <p>Passengers: {schedule.bookings.length}</p>
                            <p>Boarded: {schedule.bookings.filter((b: any) => b.boarded).length}</p>
                        </div>
                        <Button onClick={() => router.push(`/admin/track/progress/${schedule.id}`)}>
                            <Route className="mr-2 h-4 w-4" />
                            Route Progress
                        </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="text-center py-10">
              <Frown className="w-12 h-12 mx-auto text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">No Active Buses</h3>
              <p className="text-sm text-muted-foreground">There are no buses scheduled for tracking today.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
