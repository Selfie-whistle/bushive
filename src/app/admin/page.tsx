'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
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
  Users,
  Search,
  Star,
  MessageCircle,
  TrendingUp,
  ArrowRight,
  X,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  CheckCircle
} from 'lucide-react';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import { initializeFirebase } from '@/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { format, parseISO, isToday as isTodayDate, isBefore } from 'date-fns';
import type { Booking, Review } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'framer-motion';

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

function getStatusBadge(status: Booking['status']) {
    switch (status) {
        case 'CONFIRMED':
            return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none shadow-none font-medium">Confirmed</Badge>;
        case 'PENDING':
            return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-none shadow-none font-medium">Pending</Badge>;
        case 'FAILED':
        case 'CANCELLED':
            return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-none shadow-none font-medium">Failed</Badge>;
        default:
            return <Badge variant="secondary">{status}</Badge>;
    }
}

export default function AdminPanelPage() {
  const { user, isUserLoading, auth } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBusesCount, setActiveBusesCount] = useState<number>(0);
  const [todaysBookingsCount, setTodaysBookingsCount] = useState<number>(0);
  const [todaysRevenue, setTodaysRevenue] = useState<number>(0);
  const [recentBookings, setRecentBookings] = useState<ProcessedBooking[]>([]);
  const [emergencyReports, setEmergencyReports] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [now, setNow] = useState(new Date());

  const isInitialLoad = useRef(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) {
      setIsAdmin(false);
      setCheckingAdmin(false);
      return;
    }
    let unsubscribeBookings: (() => void) | undefined;
    let unsubscribeReviews: (() => void) | undefined;
    let unsubscribeSchedules: (() => void) | undefined;

    dataService.isAdmin(user.uid).then(isAdminResult => {
      setIsAdmin(isAdminResult);
      setCheckingAdmin(false);

      if (isAdminResult) {
          dataService.getBusesByOperator(user.uid, user.displayName || '').then(operatorBuses => {
              const operatorBusIds = new Set(operatorBuses.map(b => b.id));

              // Real-time listener for bookings
              unsubscribeBookings = dataService.onAllBookingsSnapshot(async (allBookings) => {
                  const operatorBookings = allBookings.filter(booking => {
                      if (booking.bus && operatorBusIds.has(booking.bus.id)) return true;
                      if (booking.bus?.travelsName === 'CLUB ANAND TRAVEL' && user.displayName === 'CLUB ANAND TRAVEL') return true;
                      return false;
                  });
                  
                  if (!isInitialLoad.current && user) {
                      const lastBooking = operatorBookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                      if (lastBooking && lastBooking.status === 'CONFIRMED') {
                           const timeSinceCreation = new Date().getTime() - new Date(lastBooking.createdAt).getTime();
                           if (timeSinceCreation < 30000) {
                              toast({
                                  title: "New Booking Received! 🎉",
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
                      route: `${b.boardingMain || b.bus.origin} → ${b.droppingMain || b.bus.destination}`,
                      passenger: b.passengers[0]?.name || 'Unknown',
                      seat: b.passengers.map(p => p.seatNumber).join(', '),
                      status: b.status || 'CONFIRMED',
                      createdAt: b.createdAt ? parseISO(b.createdAt) : new Date(),
                      totalFare: b.totalFare,
                  })).sort((a, b) => b.createdAt.getTime() - new Date(a.createdAt).getTime());

                  setRecentBookings(processedBookings.slice(0, 4));
              }, (err) => console.error(err));

              // Real-time listener for reviews
              unsubscribeReviews = dataService.onAllReviewsSnapshot((allReviews) => {
                const operatorReviews = allReviews.filter(review => operatorBusIds.has(review.busId));
                setReviews(operatorReviews);
              });

              // Real-time listener for emergency incidents across operator schedules
              const firestoreDb = initializeFirebase().firestore;
              if (!firestoreDb) return;
              const schedulesRef = collection(firestoreDb, 'schedules');
              unsubscribeSchedules = onSnapshot(schedulesRef, (snapshot) => {
                  // Build emergency reports list
                  const reports: any[] = [];
                  snapshot.docs.forEach(doc => {
                      const data = doc.data();
                      if (data.busId && operatorBusIds.has(data.busId)) {
                          if (data.emergencyHistory && Array.isArray(data.emergencyHistory)) {
                              data.emergencyHistory.forEach((h: any) => {
                                  reports.push({
                                      busId: data.actualBusId || data.busId,
                                      scheduleId: doc.id,
                                      ...h
                                  });
                              });
                          }
                          // Also include standalone active alarms if not already in history
                          if (data.emergencyAlarm?.active) {
                              const alreadyInHistory = data.emergencyHistory?.some((h: any) => h.timestamp === data.emergencyAlarm.timestamp);
                              if (!alreadyInHistory) {
                                  reports.push({
                                      busId: data.actualBusId || data.busId,
                                      scheduleId: doc.id,
                                      timestamp: data.emergencyAlarm.timestamp,
                                      seatNumber: data.emergencyAlarm.seatNumber,
                                      passengerName: data.emergencyAlarm.passengerName,
                                      bookingId: data.emergencyAlarm.bookingId,
                                      status: 'active',
                                      severe: data.emergencyAlarm.severe || false,
                                      adminApproved: false
                                  });
                              }
                          }
                          // Also include standalone withdrawn emergency calls if not already in history
                          if (data.emergencyAlarm?.withdrawn) {
                              const alreadyInHistory = data.emergencyHistory?.some((h: any) => h.timestamp === data.emergencyAlarm.timestamp);
                              if (!alreadyInHistory) {
                                  reports.push({
                                      busId: data.actualBusId || data.busId,
                                      scheduleId: doc.id,
                                      timestamp: data.emergencyAlarm.timestamp,
                                      seatNumber: data.emergencyAlarm.seatNumber,
                                      passengerName: data.emergencyAlarm.passengerName,
                                      bookingId: data.emergencyAlarm.bookingId,
                                      status: 'withdrawn',
                                      withdrawnAt: data.emergencyAlarm.withdrawnAt || data.emergencyAlarm.timestamp,
                                      severe: data.emergencyAlarm.severe || false,
                                      severeAt: data.emergencyAlarm.severeAt || null,
                                      adminApproved: data.emergencyAlarm.adminApproved || false
                                  });
                              }
                          }
                      }
                  });
                  reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                  setEmergencyReports(reports);
              });
          });
      }
    });

    return () => {
        if (unsubscribeBookings) unsubscribeBookings();
        if (unsubscribeReviews) unsubscribeReviews();
        if (unsubscribeSchedules) unsubscribeSchedules();
        isInitialLoad.current = true;
    }
  }, [user, isUserLoading, toast]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + r.busRating, 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  const unapprovedEmergencyCount = useMemo(() => {
    return emergencyReports.filter(r => !r.adminApproved).length;
  }, [emergencyReports]);

  function goto(path: string) {
    router.push(path);
  }

  const metrics = useMemo(() => [
    { id: 'revenue', title: "Today's Revenue", value: `₹${todaysRevenue.toLocaleString('en-IN')}`, icon: IndianRupee, path: '/admin/reports', trend: '+12%', color: 'from-emerald-400 to-teal-500', shadow: 'shadow-emerald-500/20' },
    { id: 'bookings', title: "Today's Bookings", value: todaysBookingsCount, icon: Ticket, path: '/admin/bookings', trend: '+5%', color: 'from-blue-400 to-indigo-500', shadow: 'shadow-blue-500/20' },
    { id: 'buses', title: 'Active Buses', value: activeBusesCount, icon: Bus, path: '/admin/trips', trend: 'Online', color: 'from-rose-400 to-red-500', shadow: 'shadow-rose-500/20' },
    { id: 'ratings', title: "Avg Rating", value: `${averageRating} ★`, icon: Star, path: '/admin/reviews', trend: `${reviews.length} reviews`, color: 'from-amber-400 to-orange-500', shadow: 'shadow-amber-500/20' },
    { id: 'emergencies', title: "Emergency Logs", value: unapprovedEmergencyCount, icon: ShieldAlert, path: '/admin/emergency-reports', trend: unapprovedEmergencyCount === 0 ? 'All Reviewed' : `${unapprovedEmergencyCount} Unapproved`, color: 'from-red-500 to-red-700', shadow: 'shadow-red-600/30' },
  ], [activeBusesCount, todaysBookingsCount, todaysRevenue, averageRating, reviews.length, unapprovedEmergencyCount]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: any = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  if (isUserLoading || checkingAdmin) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50/50">
        <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-rose-200 border-t-rose-600 animate-spin" />
            <p className="text-slate-500 font-medium animate-pulse">Authenticating Workspace...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="h-full flex items-center justify-center p-4 bg-slate-50/50">
        <Card className="max-w-md w-full border-0 shadow-2xl shadow-rose-900/5 bg-white/80 backdrop-blur-xl">
          <CardHeader className="text-center pb-2">
            <div className="w-20 h-20 mx-auto bg-rose-100 rounded-full flex items-center justify-center mb-4">
                <Frown className="w-10 h-10 text-rose-600" />
            </div>
            <CardTitle className="text-2xl font-bold">Access Denied</CardTitle>
            <CardDescription className="text-base mt-2">You lack the necessary operator permissions to view this dashboard.</CardDescription>
          </CardHeader>
          <CardFooter className="pt-6">
            <Button onClick={() => router.push('/')} className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-12">Return Home</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        <div className="relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6 py-8 px-6 md:px-10 rounded-2xl border border-slate-200/50 shadow-sm" style={{ 
            backgroundImage: `linear-gradient(to right, rgba(248, 243, 235, 0.95) 0%, rgba(248, 243, 235, 0.85) 45%, rgba(248, 243, 235, 0.6) 100%), url('https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80')`, 
            backgroundSize: 'cover', 
            backgroundPosition: 'center' 
        }}>
          {/* Section 1: Welcome & Name */}
          <div className="flex-1 text-left z-10 md:pr-6 w-full">
              <h1 className="text-lg md:text-xl font-medium text-[#2c3e50] tracking-tight">
                  Welcome back,
              </h1>
              <div className="text-2xl md:text-3xl font-black text-[#1a252f] mt-1 mb-3 uppercase tracking-tight">
                  {user.displayName || 'CLUB ANAND TRAVEL'}
              </div>
              <p className="text-[#34495e] font-medium text-sm md:text-base max-w-xs">
                  Here is what is happening<br/>with your fleet today.
              </p>
          </div>

          {/* Vertical Divider 1 */}
          <div className="hidden md:block w-px h-32 bg-[#bdc3c7] z-10"></div>

          {/* Section 2: Clock & Date */}
          <div className="flex-none flex flex-col justify-center px-4 md:px-8 z-10 w-full md:w-auto">
              {/* Clock */}
              <div className="flex items-stretch drop-shadow-md">
                  <span className="text-5xl md:text-6xl font-black text-[#0f172a] tracking-tighter tabular-nums slashed-zero italic">
                      {format(now, 'hh:mm')}
                  </span>
                  <div className="flex flex-col items-center justify-center ml-2 pt-1">
                      <span className="text-2xl md:text-3xl font-black text-[#ef4444] leading-none tabular-nums slashed-zero italic">
                          {format(now, 'ss')}
                      </span>
                      <span className="text-lg md:text-xl font-bold text-[#0f172a] leading-none mt-1 uppercase tracking-tight">
                          {format(now, 'a')}
                      </span>
                  </div>
              </div>
              {/* Date */}
              <div className="mt-3 flex flex-col">
                  <span className="text-xs md:text-sm font-bold text-[#2c3e50] uppercase tracking-[0.2em] mb-1">
                      {format(now, 'EEEE,')}
                  </span>
                  <div className="flex items-baseline gap-2">
                      <span className="text-4xl md:text-5xl font-black text-[#1a252f] tracking-tighter">
                          {format(now, 'dd')}
                      </span>
                      <span className="text-sm md:text-base font-bold text-[#2c3e50] uppercase tracking-widest">
                          {format(now, 'MMMM')}
                      </span>
                  </div>
              </div>
          </div>

          {/* Vertical Divider 2 */}
          <div className="hidden md:block w-px h-32 bg-[#bdc3c7] z-10"></div>

          {/* Section 3: Quote & Accent */}
          <div className="flex-1 text-right flex flex-col items-start md:items-end justify-center md:pl-6 z-10 w-full">
              <div className="text-sm md:text-base font-bold text-[#8a4e32] uppercase tracking-[0.3em] leading-loose text-left md:text-right max-w-[150px]">
                  Always<br/>On The<br/>Move
              </div>
              <div className="h-1 w-12 bg-[#b35900] mt-3 rounded-full mr-auto md:mr-0 md:ml-auto"></div>
          </div>
        </div>
      </motion.div>

      {/* Metrics Grid */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6"
      >
        {metrics.map((m) => (
          <motion.div key={m.id} variants={itemVariants}>
              <div 
                onClick={() => goto(m.path)}
                className={cn(
                    "relative overflow-hidden p-6 rounded-3xl bg-white border border-slate-100 hover:border-slate-200 transition-all duration-300 cursor-pointer group hover:-translate-y-1 shadow-lg shadow-slate-200/20 hover:shadow-xl",
                    m.shadow
                )}
              >
                  <div className="flex items-start justify-between relative z-10">
                      <div>
                          <p className="text-sm font-bold text-slate-400 mb-1">{m.title}</p>
                          <h3 className="text-3xl font-black text-slate-800 tracking-tight">{m.value}</h3>
                          <div className="flex items-center gap-1 mt-3">
                              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-xs font-bold text-emerald-600">{m.trend}</span>
                          </div>
                      </div>
                      <motion.div 
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ type: "spring", stiffness: 300 }}
                        className={cn("p-3 rounded-2xl text-white bg-gradient-to-br shadow-lg", m.color, m.shadow)}
                      >
                          <m.icon className="w-6 h-6 drop-shadow-md" />
                      </motion.div>
                  </div>
                  <div className={cn("absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-10 bg-gradient-to-br blur-2xl group-hover:opacity-20 transition-opacity", m.color)} />
              </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Grid Layout */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 lg:grid-cols-3 gap-8"
      >
        {/* Recent Bookings - Takes up 2/3 space on large screens */}
        <motion.div variants={itemVariants} className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-rose-500" /> Recent Bookings
                    <span className="relative flex h-3 w-3 ml-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                    </span>
                </h2>
                <Button variant="ghost" className="text-sm font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-all hover:translate-x-1" onClick={() => goto('/admin/bookings')}>
                    View All <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
            </div>
            <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-rose-100/20 via-transparent to-blue-100/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
                {recentBookings.length > 0 ? (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-50/50">
                                <TR>
                                    <TH className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-slate-500">Booking ID</TH>
                                    <TH className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-slate-500">Route & Passenger</TH>
                                    <TH className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-slate-500">Seat</TH>
                                    <TH className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-slate-500">Status</TH>
                                    <TH className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Action</TH>
                                </TR>
                            </TableHeader>
                            <TableBody>
                                {recentBookings.map((r) => {
                                    const displayStatus = getDisplayStatus(r);
                                    return (
                                        <motion.tr 
                                            key={r.id} 
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.1, type: "spring" }}
                                            className="group hover:bg-slate-50/80 transition-colors border-b border-slate-50/50 last:border-0"
                                        >
                                            <TD className="py-4 px-6">
                                                <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100/80 px-2 py-1 rounded-md">{r.id.substring(0, 8)}...</span>
                                            </TD>
                                            <TD className="py-4 px-6">
                                                <p className="font-bold text-slate-800 group-hover:text-rose-600 transition-colors">{r.route}</p>
                                                <p className="text-xs text-slate-500 font-medium mt-0.5">{r.passenger} • {format(r.createdAt, 'MMM dd, p')}</p>
                                            </TD>
                                            <TD className="py-4 px-6 font-bold text-slate-700">{r.seat}</TD>
                                            <TD className="py-4 px-6">
                                                {getStatusBadge(displayStatus)}
                                            </TD>
                                            <TD className="py-4 px-6 text-right">
                                                <Button size="sm" variant="secondary" className="opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 rounded-lg font-bold bg-white shadow-sm border border-slate-200 hover:bg-slate-50 hover:text-rose-600" onClick={() => goto(`/confirmation/${r.id}?from=admin`)}>
                                                    View
                                                </Button>
                                            </TD>
                                        </motion.tr>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <Ticket className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="font-medium">No recent bookings found.</p>
                        <p className="text-sm mt-1">Bookings will appear here as they come in.</p>
                    </div>
                )}
            </div>
        </motion.div>

        {/* Reviews */}
        <motion.div variants={itemVariants} className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-amber-500" /> Latest Feedback
                </h2>
                <div className="flex items-center gap-1 bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full font-bold text-sm">
                    <Star className="w-3.5 h-3.5 fill-amber-500" /> {averageRating}
                </div>
            </div>
            
            <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-2 overflow-hidden flex flex-col h-[400px] relative group">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-50/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-3 relative z-10">
                    {reviews.length > 0 ? (
                        reviews.slice(0, 5).map((review) => (
                            <motion.div 
                                key={review.id} 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.1 }}
                                whileHover={{ scale: 1.02 }}
                                className="p-4 rounded-2xl bg-white/60 border border-slate-100/50 hover:border-amber-200/50 hover:bg-white shadow-sm transition-all cursor-pointer"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9 border-2 border-white shadow-sm">
                                            <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-700 font-bold">
                                                {review.passengerName?.[0] || 'P'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">{review.passengerName || 'Anonymous'}</p>
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                                {review.timestamp ? format(parseISO(review.timestamp), 'MMM dd, yyyy') : 'Recently'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center bg-white px-2 py-1 rounded-full shadow-sm border border-slate-100">
                                        <Star className="w-3 h-3 text-amber-400 fill-amber-400 mr-1" />
                                        <span className="text-xs font-bold text-slate-700">{review.busRating}.0</span>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-600 leading-relaxed font-medium">"{review.busFeedback || 'Great journey, highly recommended!'}"</p>
                            </motion.div>
                        ))
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <MessageCircle className="w-12 h-12 opacity-20 mb-3" />
                            <p className="font-medium text-sm">No feedback received yet.</p>
                        </div>
                    )}
                </div>
                <div className="p-2 pt-0 mt-2">
                    <Button 
                        variant="ghost" 
                        className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold rounded-xl"
                        onClick={() => goto('/admin/reviews')}
                    >
                        View All Reviews
                    </Button>
                </div>
            </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
