
'use client';

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IndianRupee, CalendarIcon, Search, Ticket, Users, BarChart, Download, Calendar as LucideCalendar } from 'lucide-react';
import { dataService } from '@/lib/data/client-service';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import type { Bus as BusType, Booking } from '@/lib/types';
import { cn, formatIndianDate } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO, isSameMonth, startOfMonth, endOfMonth, isToday, isWithinInterval, startOfWeek, endOfWeek, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TD, TH, TableHeader, TR } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { useFirebase } from '@/firebase';


interface ProcessedBooking extends Booking {
  bus: BusType;
}

interface BusRevenue {
  bus: BusType;
  revenue: number;
  bookingsCount: number;
}

function RevenueReportPageContent() {
    const { user } = useFirebase();
    const [allBookings, setAllBookings] = useState<ProcessedBooking[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [sortOption, setSortOption] = useState("revenueDesc");
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
    const [isPeriodDialogOpen, setIsPeriodDialogOpen] = useState(false);
    const [activePreset, setActivePreset] = useState<string | null>('month');

    // State for historical reporting
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const [downloadMonth, setDownloadMonth] = useState(new Date().getMonth());
    const [downloadYear, setDownloadYear] = useState(new Date().getFullYear());

    const selectedPeriod = useMemo(() => new Date(selectedYear, selectedMonth, 1), [selectedYear, selectedMonth]);
    const periodLabel = useMemo(() => format(selectedPeriod, 'MMMM yyyy'), [selectedPeriod]);

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

                setAllBookings(operatorBookings as ProcessedBooking[]);
                setLoading(false);
            },
            (error: any) => {
                console.error("Failed to fetch bookings in real-time:", error);
                toast({
                    title: "Error",
                    description: "Could not load booking data in real-time.",
                    variant: "destructive"
                });
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [toast, user]);
    
    const summaryStats = useMemo(() => {
        const confirmedBookings = allBookings.filter(b => b.status === 'CONFIRMED');

        const todaysBookings = confirmedBookings.filter(b => b.createdAt && isToday(parseISO(b.createdAt)));
        const todaysRevenue = todaysBookings.reduce((sum, booking) => sum + booking.totalFare, 0);

        const monthlyBookings = confirmedBookings.filter(b => b.createdAt && isSameMonth(parseISO(b.createdAt), selectedPeriod));
        
        const monthlyRevenue = monthlyBookings.reduce((sum, booking) => sum + booking.totalFare, 0);
        const totalMonthlyBookings = monthlyBookings.length;
        
        return {
            todaysRevenue,
            totalMonthlyBookings,
            monthlyRevenue
        }
    }, [allBookings, selectedPeriod]);

    const busRevenueData = useMemo(() => {
        const confirmedBookings = allBookings.filter(b => b.status === 'CONFIRMED');
        const revenueByBus: { [busId: string]: BusRevenue } = {};
        
        confirmedBookings.forEach(booking => {
            if (!booking.bus || !booking.bus.id) return;
            const busId = booking.bus.id;
            
            if (!revenueByBus[busId]) {
                revenueByBus[busId] = {
                    bus: booking.bus,
                    revenue: 0,
                    bookingsCount: 0,
                };
            }
            
            revenueByBus[busId].revenue += booking.totalFare;
            revenueByBus[busId].bookingsCount += booking.passengers.length;
        });

        let filteredData = Object.values(revenueByBus);
        
        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            filteredData = filteredData.filter(item => 
                item.bus.travelsName.toLowerCase().includes(lowercasedQuery) ||
                item.bus.busNumber.toLowerCase().includes(lowercasedQuery)
            );
        }

        const sortedData = filteredData.sort((a, b) => {
            switch (sortOption) {
                case "busNameAsc":
                    return a.bus.travelsName.localeCompare(b.bus.travelsName);
                case "busNameDesc":
                    return b.bus.travelsName.localeCompare(a.bus.travelsName);
                case "revenueDesc":
                    return b.revenue - a.revenue;
                case "revenueAsc":
                    return a.revenue - b.revenue;
                case "bookingsDesc":
                    return b.bookingsCount - a.bookingsCount;
                case "bookingsAsc":
                    return a.bookingsCount - b.bookingsCount;
                default:
                    return b.revenue - a.revenue;
            }
        });
        return sortedData;
    }, [allBookings, sortOption, searchQuery]);
    
    const downloadReport = (range: DateRange | undefined) => {
        const headers = ["#", "Bus Name", "Bus Number", "Operator", "Route", "Total Revenue", "Total Bookings"];
        const csvRows = [headers.join(',')];

        const confirmedBookingsInRange = allBookings.filter(b => {
            if (b.status !== 'CONFIRMED' || !b.createdAt) return false;
            const createdAt = parseISO(b.createdAt);
            if (!range?.from) return true;
            if (!range?.to) return isToday(createdAt); // Fallback for single date
            return isWithinInterval(createdAt, { start: range.from, end: range.to });
        });

        const revenueByBus: { [busId: string]: BusRevenue } = {};
        confirmedBookingsInRange.forEach(booking => {
            if (!booking.bus || !booking.bus.id) return;
            const busId = booking.bus.id;
            if (!revenueByBus[busId]) {
                revenueByBus[busId] = { bus: booking.bus, revenue: 0, bookingsCount: 0 };
            }
            revenueByBus[busId].revenue += booking.totalFare;
            revenueByBus[busId].bookingsCount += booking.passengers.length;
        });

        Object.values(revenueByBus).sort((a,b) => b.revenue - a.revenue).forEach((item, index) => {
            const row = [
                index + 1,
                `"${item.bus.travelsName}"`,
                `"${item.bus.busNumber}"`,
                `"${item.bus.operator}"`,
                `"${item.bus.origin} → ${item.bus.destination}"`,
                item.revenue,
                item.bookingsCount
            ];
            csvRows.push(row.join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        const datePart = range?.from ? `${format(range.from, 'yyyy-MM-dd')}_to_${format(range.to || range.from, 'yyyy-MM-dd')}` : 'all-time';
        link.setAttribute('download', `revenue_report_${datePart}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsDownloadDialogOpen(false);
    };

    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 5 }, (_, i) => currentYear - i);
    }, []);

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
        <div className="container mx-auto px-4 py-8 space-y-6">
            <header className="relative">
                <div className="text-center">
                    <h1 className="text-3xl font-bold font-headline">Revenue Report</h1>
                    <p className="text-lg font-bold text-red-600 mt-1">
                        {format(new Date(), 'dd MMMM yyyy, EEEE')}
                    </p>
                    <p className="text-muted-foreground mt-1">Analyze your sales and booking data.</p>
                </div>
                <div className="absolute top-0 right-0">
                    <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Download className="mr-2 h-4 w-4" />
                                Download Report
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[520px]">
                            <DialogHeader>
                                <DialogTitle className="text-lg font-semibold">
                                Select Report Range
                                </DialogTitle>
                                <DialogDescription>
                                Choose a period to download your report
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 mt-2">
                                <div className="grid grid-cols-3 gap-2">
                                <Button
                                    size="sm"
                                    variant={activePreset === 'today' ? 'destructive' : 'outline'}
                                    onClick={() => {
                                        setDateRange({ from: new Date(), to: new Date() });
                                        setActivePreset('today');
                                    }}
                                >
                                    Today
                                </Button>

                                <Button
                                    size="sm"
                                    variant={activePreset === 'week' ? 'destructive' : 'outline'}
                                    onClick={() => {
                                        setDateRange({ from: startOfWeek(new Date()), to: endOfWeek(new Date()) });
                                        setActivePreset('week');
                                    }}
                                >
                                    This Week
                                </Button>

                                <Button
                                    size="sm"
                                    variant={activePreset === 'month' ? 'destructive' : 'outline'}
                                    onClick={() => {
                                        setDateRange({ from: startOfToday(), to: new Date() });
                                        setActivePreset('month');
                                    }}
                                >
                                    This Month
                                </Button>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Historical Monthly Report</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Select value={String(downloadMonth)} onValueChange={(v) => {
                                            const m = Number(v);
                                            setDownloadMonth(m);
                                            const d = new Date(downloadYear, m, 1);
                                            setDateRange({ from: startOfMonth(d), to: endOfMonth(d) });
                                            setActivePreset('historical');
                                        }}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Month" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {months.map((m, i) => (
                                                    <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={String(downloadYear)} onValueChange={(v) => {
                                            const y = Number(v);
                                            setDownloadYear(y);
                                            const d = new Date(y, downloadMonth, 1);
                                            setDateRange({ from: startOfMonth(d), to: endOfMonth(d) });
                                            setActivePreset('historical');
                                        }}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Year" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {years.map(y => (
                                                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-border" />
                                <span className="text-xs text-muted-foreground">Custom range</span>
                                <div className="flex-1 h-px bg-border" />
                                </div>

                                <div className="flex justify-center">
                                <Calendar
                                    mode="range"
                                    selected={dateRange}
                                    onSelect={(range) => {
                                        setDateRange(range);
                                        setActivePreset(null);
                                    }}
                                    className="rounded-md border"
                                />
                                </div>
                            </div>

                            <DialogFooter className="mt-4 flex justify-between">
                                <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setIsDownloadDialogOpen(false)}
                                >
                                Cancel
                                </Button>
                                <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        size="sm"
                                        disabled={!dateRange?.from}
                                        className="bg-red-600 hover:bg-red-700"
                                    >
                                        Download
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Download</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        You are about to download a report for the period: <br />
                                        <span className="font-semibold text-primary">
                                            {dateRange?.from ? format(dateRange.from, 'PPP') : ''}
                                            {dateRange?.to && dateRange.to !== dateRange.from ? ` to ${format(dateRange.to, 'PPP')}` : ''}
                                        </span>.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => downloadReport(dateRange)}>
                                        Confirm & Download
                                    </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                                </AlertDialog>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </header>


            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
                        <IndianRupee className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold font-headline">₹{summaryStats.todaysRevenue.toLocaleString('en-IN')}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Bookings ({periodLabel})</CardTitle>
                        <Ticket className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold font-headline">{summaryStats.totalMonthlyBookings}</div>
                    </CardContent>
                </Card>
                <Dialog open={isPeriodDialogOpen} onOpenChange={setIsPeriodDialogOpen}>
                    <DialogTrigger asChild>
                        <Card className="cursor-pointer hover:shadow-md transition-shadow group">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Revenue ({periodLabel})</CardTitle>
                                <div className="flex items-center gap-2">
                                    <LucideCalendar className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                    <BarChart className="h-4 w-4 text-muted-foreground" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-4xl font-bold font-headline">₹{summaryStats.monthlyRevenue.toLocaleString('en-IN')}</div>
                                <p className="text-xs text-muted-foreground mt-2">Click to change period</p>
                            </CardContent>
                        </Card>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[400px]">
                        <DialogHeader>
                            <DialogTitle>Select Reporting Period</DialogTitle>
                            <DialogDescription>
                                Choose a month and year to view detailed reports.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="month" className="text-right">Month</Label>
                                <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                                    <SelectTrigger className="col-span-3">
                                        <SelectValue placeholder="Select Month" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {months.map((m, i) => (
                                            <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="year" className="text-right">Year</Label>
                                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                                    <SelectTrigger className="col-span-3">
                                        <SelectValue placeholder="Select Year" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {years.map(y => (
                                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={() => setIsPeriodDialogOpen(false)}>Apply Filter</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>


            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Detailed Report ({periodLabel})</CardTitle>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                               <Input
                                  placeholder="Search by Bus Name or Number..."
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  className="pl-10 w-[280px]"
                                />
                            </div>
                            <Select value={sortOption} onValueChange={setSortOption}>
                                <SelectTrigger className="w-[220px]" id="sort-by">
                                    <SelectValue placeholder="Sort by" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="revenueDesc">Total Revenue: High to Low</SelectItem>
                                    <SelectItem value="revenueAsc">Total Revenue: Low to High</SelectItem>
                                    <SelectItem value="bookingsDesc">Total Bookings: High to Low</SelectItem>
                                    <SelectItem value="bookingsAsc">Total Bookings: Low to High</SelectItem>
                                    <SelectItem value="busNameAsc">Bus Name (A-Z)</SelectItem>
                                    <SelectItem value="busNameDesc">Bus Name (Z-A)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TR>
                                <TH>#</TH>
                                <TH>Bus Details</TH>
                                <TH>Route</TH>
                                <TH className="text-right">Today's Revenue</TH>
                                <TH className="text-right">Today's Bookings</TH>
                                <TH className="text-right">Revenue ({periodLabel})</TH>
                                <TH className="text-right">Bookings ({periodLabel})</TH>
                            </TR>
                        </TableHeader>
                        <TableBody>
                            {busRevenueData.map(({ bus }, index) => {
                                const confirmedBookingsForBus = allBookings.filter(b => b.status === 'CONFIRMED' && b.bus.id === bus.id);
                                
                                const todaysBookings = confirmedBookingsForBus.filter(b => b.createdAt && isToday(parseISO(b.createdAt)));
                                const dailyRevenue = todaysBookings.reduce((sum, b) => sum + b.totalFare, 0);
                                const dailyBookingsCount = todaysBookings.length;

                                const monthlyBookings = confirmedBookingsForBus.filter(b => b.createdAt && isSameMonth(parseISO(b.createdAt), selectedPeriod));
                                const monthlyRevenue = monthlyBookings.reduce((sum, b) => sum + b.totalFare, 0);
                                const monthlyBookingsCount = monthlyBookings.length;

                                return(
                                <TR key={bus.id}>
                                    <TD>{index + 1}</TD>
                                    <TD>
                                        <div className="font-medium">{bus.travelsName}</div>
                                        <div className="bg-yellow-400 text-black font-mono text-sm font-bold px-2 py-1 rounded-md border-2 border-black inline-block my-1">
                                          {bus.busNumber}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{bus.operator}</div>
                                    </TD>
                                    <TD>
                                        <div className="font-medium">{bus.origin} → {bus.destination}</div>
                                    </TD>
                                    <TD className="text-right font-medium font-headline">₹{dailyRevenue.toLocaleString('en-IN')}</TD>
                                    <TD className="text-right font-medium font-headline">{dailyBookingsCount}</TD>
                                    <TD className="text-right font-bold font-headline">₹{monthlyRevenue.toLocaleString('en-IN')}</TD>
                                    <TD className="text-right font-bold font-headline">{monthlyBookingsCount}</TD>
                                </TR>
                            )})}
                        </TableBody>
                    </Table>
                     {busRevenueData.length === 0 && (
                        <div className="text-center py-10 text-muted-foreground">
                            No revenue data available for the selected filters.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

export default function ReportsPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <RevenueReportPageContent />
        </Suspense>
    )
}
