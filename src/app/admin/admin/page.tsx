
'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TR, TH, TD } from '@/components/ui/table';
import {
  Ticket,
  Bus,
  IndianRupee,
  MapPin,
  Frown,
  LogOut,
  Users,
  Search,
  Settings,
} from 'lucide-react';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import { format, parseISO, isToday as isTodayDate, isBefore } from 'date-fns';
import type { Bus as BusType, Schedule, Booking } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { handleSignOut } from '@/lib/auth';

interface ProcessedBooking {
  id: string;
  route: string;
  passenger: string;
  seat: string;
  status: Booking['status'];
  createdAt: Date;
  totalFare: number;
}

function getDisplayStatus(booking: { status: Booking['status'], createdAt: string | Date }): Booking['status'] {
    if (booking.status === 'PENDING') {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const createdAtDate = typeof booking.createdAt === 'string' ? parseISO(booking.createdAt) : booking.createdAt;
        if (isBefore(createdAtDate, tenMinutesAgo)) {
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


export default function AdminPanelPage() {
  const { user, isUserLoading, auth } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [query, setQuery] = useState('');
  const [activeBusesCount, setActiveBusesCount] = useState<number>(0);
  const [todaysBookingsCount, setTodaysBookingsCount] = useState<number>(0);
  const [todaysRevenue, setTodaysRevenue] = useState<number>(0);
  const [recentBookings, setRecentBookings] = useState<ProcessedBooking[]>([]);
  const [now, setNow] = useState(new Date());

  const isInitialLoad = useRef(true);

   useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000); // Update every second

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isUserLoading) return;

    if (!user) {
      setIsAdmin(false);
      setCheckingAdmin(false);
      return;
    }
    
    dataService.isAdmin(user.uid).then(isAdminResult => {
      setIsAdmin(isAdminResult);
      setCheckingAdmin(false);

      if (isAdminResult) {
          // Real-time listener for bookings
          const unsubscribe = dataService.onAllBookingsSnapshot(async (allBookings) => {
              const operatorBuses = await dataService.getBusesByOperator(user.uid, user.displayName || '');
              const operatorBusIds = new Set(operatorBuses.map(b => b.id));

              const operatorBookings = allBookings.filter(booking => {
                  if (booking.bus && operatorBusIds.has(booking.bus.id)) {
                      return true;
                  }
                  // Specific check for Club Anand Travel
                  if (booking.bus?.travelsName === 'CLUB ANAND TRAVEL' && user.displayName === 'CLUB ANAND TRAVEL') {
                      return true;
                  }
                  return false;
              });
              
              if (!isInitialLoad.current && user) {
                  const lastBooking = operatorBookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                  if (lastBooking && lastBooking.status === 'CONFIRMED') {
                       const timeSinceCreation = new Date().getTime() - new Date(lastBooking.createdAt).getTime();
                       if (timeSinceCreation < 30000) { // Only toast for very recent bookings
                          toast({
                              title: "New Booking Received!",
                              description: `Seat(s) ${lastBooking.passengers.map(p => p.seatNumber).join(', ')} booked on ${lastBooking.bus.travelsName}.`,
                              duration: 5000,
                          });
                       }
                  }
              } else {
                  isInitialLoad.current = false;
              }

              const allSchedules = await dataService.getSchedules();
              const todayStr = format(new Date(), 'yyyy-MM-dd');
              
              const activeBusIds = new Set(
                allSchedules
                  .filter(s => s.busId && operatorBusIds.has(s.busId) && s.date === todayStr)
                  .map(s => s.busId)
              );
              setActiveBusesCount(activeBusIds.size);
              
              const confirmedBookings = operatorBookings.filter(b => b.status === 'CONFIRMED');

              const todaysBookings = confirmedBookings.filter(b => b.createdAt && isTodayDate(parseISO(b.createdAt)));
              setTodaysBookingsCount(todaysBookings.length);
              
              const totalRevenue = todaysBookings.reduce((acc, booking) => acc + booking.totalFare, 0);
              setTodaysRevenue(totalRevenue);

              const processedBookings = operatorBookings.map(b => ({
                  id: b.id,
                  route: `${b.bus.origin} → ${b.bus.destination}`,
                  passenger: b.passengers[0]?.name || 'Unknown',
                  seat: b.passengers.map(p => p.seatNumber).join(', '),
                  status: b.status || 'CONFIRMED',
                  createdAt: parseISO(b.createdAt),
                  totalFare: b.totalFare,
              })).sort((a, b) => b.createdAt.getTime() - new Date(a.createdAt).getTime());

              setRecentBookings(processedBookings.slice(0, 3));
          });

          return () => {
              unsubscribe();
              isInitialLoad.current = true;
          }
      }
    });

  }, [user, isUserLoading, toast]);

  const onSignOut = async () => {
    await handleSignOut(auth);
    router.push('/');
  }

  function goto(path: string) {
    router.push(path);
  }

  const metrics = useMemo(() => [
    { id: 'bookings', title: "Today's Bookings", value: todaysBookingsCount, icon: Ticket, path: '/admin/bookings'},
    { id: 'buses', title: 'Active Buses Today', value: activeBusesCount, icon: Bus, path: '/admin/trips' },
    { id: 'revenue', title: "Today's Revenue", value: `₹${todaysRevenue.toLocaleString('en-IN')}`, icon: IndianRupee, path: '/admin/reports' },
    { id: 'generate-tickets', title: "Book tickets", value: "Terminal & Block", icon: Ticket, path: '/admin/generate-tickets' },
    { id: 'tracking', title: 'Live Tracking', value: `${activeBusesCount} Online`, icon: MapPin, path: '/admin/track' },
    { id: 'cabin-crew', title: "Cabin Crew", value: "Manage", icon: Users, path: '/admin/cabin-crew' },
  ], [activeBusesCount, todaysBookingsCount, todaysRevenue]);

  // Loading or unauthorized states
  if (isUserLoading || checkingAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">Preparing Admin Panel...</p>
          <p className="text-sm text-muted-foreground mt-2">Verifying permissions and loading data.</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
        <Card className="max-w-lg w-full text-center">
          <CardHeader>
            <Frown className="w-14 h-14 mx-auto text-destructive" />
            <CardTitle className="mt-2">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">You do not have permission to view this page.</p>
          </CardContent>
          <CardFooter className="flex justify-center gap-2">
            <Button onClick={() => router.push('/')} variant="ghost">Go home</Button>
            {user && (
              <Button variant="outline" onClick={onSignOut}>
                <LogOut className="mr-2" /> Sign out
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Admin UI
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Top bar */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-gradient-to-r from-rose-500 to-red-600 p-3 text-white shadow-lg">
            <Bus className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{user?.displayName || 'Admin Panel'}</h1>
            <p className="text-sm text-muted-foreground">Manage bookings, pricing and track buses in real time</p>
          </div>
        </div>

        <div className="text-center">
            <p className="text-4xl font-bold font-mono text-red-600">
                {format(now, 'hh:mm:ss a')}
            </p>
            <p className="text-sm font-medium text-black mt-1">
                {format(now, 'EEEE, dd MMMM yyyy')}
            </p>
        </div>


        <div className="flex items-center gap-3">
          <div className="w-full">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search bookings, passengers, routes..."
              className="w-full md:w-[360px]"
              aria-label="Search"
            />
          </div>
        </div>
      </header>

      {/* Metrics */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {metrics.map((m) => (
          <Card key={m.id} className="p-4 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => goto(m.path)}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{m.title}</p>
                <h3 className="text-xl font-headline font-semibold mt-1">{m.value}</h3>
              </div>
              <div className="rounded-full bg-gray-100 p-2">
                <m.icon className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
          </Card>
        ))}
      </section>

      <main className="grid grid-cols-1 gap-6">
        {/* Left: Recent bookings list */}
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Bookings</CardTitle>
                <Badge variant="secondary">Latest</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TR>
                      <TH>Booking ID</TH>
                      <TH>Route</TH>
                      <TH>Passenger</TH>
                      <TH>Seat</TH>
                      <TH>Status</TH>
                      <TH>Booked On</TH>
                      <TH />
                    </TR>
                  </TableHeader>
                  <TableBody>
                    {recentBookings.map((r) => {
                      const displayStatus = getDisplayStatus(r);
                      return (
                      <TR key={r.id}>
                        <TD className="font-mono text-xs">{r.id}</TD>
                        <TD>{r.route}</TD>
                        <TD>{r.passenger}</TD>
                        <TD>{r.seat}</TD>
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
                        <TD className="text-xs">{format(r.createdAt, 'dd MMM yyyy, p')}</TD>
                        <TD>
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => goto(`/confirmation/${r.id}?from=admin`)}>
                              View
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    )})}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button onClick={() => goto('/admin/bookings')}>View all bookings</Button>
              <Button variant="ghost" onClick={() => goto('/admin/reports')}>Generate report</Button>
            </CardFooter>
          </Card>
        </section>
      </main>
    </div>
  );
}
