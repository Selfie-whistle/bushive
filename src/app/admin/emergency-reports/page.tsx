'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldAlert, 
  ArrowLeft, 
  Search, 
  Filter, 
  CheckCircle, 
  Sparkles, 
  AlertTriangle, 
  Clock, 
  Bus, 
  User, 
  Download, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  RefreshCw,
  Frown,
  Send
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Table, TableHeader, TableBody, TR, TH, TD } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import { initializeFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Bus as BusType } from '@/lib/types';

interface EmergencyIncident {
  scheduleId: string;
  busId: string;
  busNumber?: string;
  travelsName?: string;
  timestamp: string;
  seatNumber: string;
  passengerName: string;
  bookingId?: string;
  status?: string;
  severe?: boolean;
  severeAt?: string | null;
  respondedAt?: string | null;
  withdrawnAt?: string | null;
  issueReport?: string | null;
  aiAnalysis?: string | null;
  adminApproved?: boolean;
  adminApprovedAt?: string | null;
  reportRequested?: boolean;
  reportRequestedAt?: string | null;
}

export default function EmergencyReportsPage() {
  const router = useRouter();
  const { user, isUserLoading } = useFirebase();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<EmergencyIncident[]>([]);
  const [buses, setBuses] = useState<Record<string, BusType>>({});
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'severe' | 'resolved' | 'withdrawn' | 'needs-approval'>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'all'>('today');
  const [approvingTimestamp, setApprovingTimestamp] = useState<string | null>(null);
  const [requestingReportId, setRequestingReportId] = useState<string | null>(null);

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    dataService.isAdmin(user.uid).then(status => {
      setIsAdmin(status);
      if (!status) {
        setLoading(false);
      }
    });
  }, [user, isUserLoading]);

  // Load operator buses and subscribe to schedules
  useEffect(() => {
    if (!isAdmin || !user) return;

    let unsubscribeSchedules: (() => void) | undefined;
    const firestoreDb = initializeFirebase().firestore;
    if (!firestoreDb) return;

    dataService.getBuses().then(operatorBuses => {
      const busMap: Record<string, BusType> = {};
      operatorBuses.forEach(b => {
        busMap[b.id] = b;
      });
      setBuses(busMap);

      const operatorBusIds = new Set(operatorBuses.map(b => b.id));

      const now = new Date();
      const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
      const dateToUse = now < noon ? new Date(now.setDate(now.getDate() - 1)) : now;
      const dateStr = format(dateToUse, 'yyyy-MM-dd');

      const schedulesRef = collection(firestoreDb, 'schedules');
      const qSchedules = dateFilter === 'today'
        ? query(schedulesRef, where('date', '==', dateStr))
        : query(schedulesRef);

      unsubscribeSchedules = onSnapshot(qSchedules, (snapshot) => {
        const incidents: EmergencyIncident[] = [];

        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          const targetBusId = data.actualBusId || data.busId;
          if (data.busId && operatorBusIds.has(data.busId)) {
            const matchedBus = busMap[targetBusId] || busMap[data.busId];

            if (data.emergencyHistory && Array.isArray(data.emergencyHistory)) {
              data.emergencyHistory.forEach((h: any) => {
                const isPendingReport = Boolean(data.pendingReportRequest?.active && data.pendingReportRequest?.incidentTimestamp === h.timestamp);
                incidents.push({
                  scheduleId: docSnap.id,
                  busId: targetBusId,
                  busNumber: matchedBus?.busNumber || targetBusId,
                  travelsName: matchedBus?.travelsName || '',
                  ...h,
                  reportRequested: h.reportRequested || isPendingReport,
                  reportRequestedAt: h.reportRequestedAt || (isPendingReport ? data.pendingReportRequest?.requestedAt : null),
                });
              });
            }

            // Include standalone active alerts not yet converted to history
            if (data.emergencyAlarm?.active) {
              const alreadyInHistory = data.emergencyHistory?.some((h: any) => h.timestamp === data.emergencyAlarm.timestamp);
              if (!alreadyInHistory) {
                const isPendingReport = Boolean(data.pendingReportRequest?.active && data.pendingReportRequest?.incidentTimestamp === data.emergencyAlarm.timestamp);
                incidents.push({
                  scheduleId: docSnap.id,
                  busId: targetBusId,
                  busNumber: matchedBus?.busNumber || targetBusId,
                  travelsName: matchedBus?.travelsName || '',
                  timestamp: data.emergencyAlarm.timestamp,
                  seatNumber: data.emergencyAlarm.seatNumber,
                  passengerName: data.emergencyAlarm.passengerName,
                  bookingId: data.emergencyAlarm.bookingId,
                  status: 'active',
                  severe: data.emergencyAlarm.severe || false,
                  severeAt: data.emergencyAlarm.severeAt || null,
                  issueReport: data.emergencyAlarm.issueReport || null,
                  aiAnalysis: data.emergencyAlarm.aiAnalysis || null,
                  adminApproved: false,
                  reportRequested: isPendingReport,
                  reportRequestedAt: isPendingReport ? data.pendingReportRequest?.requestedAt : null,
                });
              }
            }

            // Include standalone withdrawn alerts not yet converted to history
            if (data.emergencyAlarm?.withdrawn) {
              const alreadyInHistory = data.emergencyHistory?.some((h: any) => h.timestamp === data.emergencyAlarm.timestamp);
              if (!alreadyInHistory) {
                const isPendingReport = Boolean(data.pendingReportRequest?.active && data.pendingReportRequest?.incidentTimestamp === data.emergencyAlarm.timestamp);
                incidents.push({
                  scheduleId: docSnap.id,
                  busId: targetBusId,
                  busNumber: matchedBus?.busNumber || targetBusId,
                  travelsName: matchedBus?.travelsName || '',
                  timestamp: data.emergencyAlarm.timestamp,
                  seatNumber: data.emergencyAlarm.seatNumber,
                  passengerName: data.emergencyAlarm.passengerName,
                  bookingId: data.emergencyAlarm.bookingId,
                  status: 'withdrawn',
                  withdrawnAt: data.emergencyAlarm.withdrawnAt || data.emergencyAlarm.timestamp,
                  severe: data.emergencyAlarm.severe || false,
                  severeAt: data.emergencyAlarm.severeAt || null,
                  issueReport: data.emergencyAlarm.issueReport || null,
                  aiAnalysis: data.emergencyAlarm.aiAnalysis || null,
                  adminApproved: data.emergencyAlarm.adminApproved || false,
                  reportRequested: data.emergencyAlarm.reportRequested || isPendingReport,
                  reportRequestedAt: data.emergencyAlarm.reportRequestedAt || (isPendingReport ? data.pendingReportRequest?.requestedAt : null),
                });
              }
            }
          }
        });

        incidents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setReports(incidents);
        setLoading(false);
      }, (err) => {
        console.error("Error subscribing to emergency reports:", err);
        setLoading(false);
      });
    });

    return () => {
      if (unsubscribeSchedules) unsubscribeSchedules();
    };
  }, [isAdmin, user, dateFilter]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesPassenger = r.passengerName?.toLowerCase().includes(q);
        const matchesSeat = r.seatNumber?.toLowerCase().includes(q);
        const matchesBus = r.busNumber?.toLowerCase().includes(q) || r.busId?.toLowerCase().includes(q);
        const matchesReport = r.issueReport?.toLowerCase().includes(q);
        if (!matchesPassenger && !matchesSeat && !matchesBus && !matchesReport) {
          return false;
        }
      }

      // 2. Status Filter
      if (statusFilter === 'severe') {
        return r.severe && r.status !== 'withdrawn';
      }
      if (statusFilter === 'resolved') {
        return !r.severe && r.status !== 'withdrawn';
      }
      if (statusFilter === 'withdrawn') {
        return r.status === 'withdrawn';
      }
      if (statusFilter === 'needs-approval') {
        return r.issueReport && !r.adminApproved;
      }

      return true;
    });
  }, [reports, searchQuery, statusFilter]);

  // Metric counts
  const stats = useMemo(() => {
    const total = reports.length;
    const severeCount = reports.filter(r => r.severe && r.status !== 'withdrawn').length;
    const resolvedInTime = reports.filter(r => !r.severe && r.status !== 'withdrawn').length;
    const withdrawnCount = reports.filter(r => r.status === 'withdrawn').length;
    const pendingApproval = reports.filter(r => r.issueReport && !r.adminApproved).length;

    return { total, severeCount, resolvedInTime, withdrawnCount, pendingApproval };
  }, [reports]);

  const handleApprove = async (scheduleId: string, timestamp: string) => {
    setApprovingTimestamp(timestamp);
    try {
      await dataService.approveIncidentReport(scheduleId, timestamp);
      toast({
        title: "Incident Approved",
        description: "The crew emergency report has been marked as officially reviewed and approved by admin.",
      });
    } catch (err: any) {
      toast({
        title: "Approval Failed",
        description: err.message || "Failed to approve report. Try again.",
        variant: "destructive",
      });
    } finally {
      setApprovingTimestamp(null);
    }
  };

  const handleRequestReport = async (scheduleId: string, timestamp: string, seatNumber: string, passengerName: string) => {
    setRequestingReportId(timestamp);
    try {
      await dataService.requestIncidentReport(scheduleId, timestamp, seatNumber, passengerName);
      toast({
        title: "Report Requested",
        description: `High-priority notification sent to cabin crew console for Seat ${seatNumber} (${passengerName}).`,
      });
    } catch (err: any) {
      toast({
        title: "Request Failed",
        description: err.message || "Failed to send report request to crew.",
        variant: "destructive",
      });
    } finally {
      setRequestingReportId(null);
    }
  };

  const handleExportCSV = () => {
    if (filteredReports.length === 0) {
      toast({ title: "No Reports", description: "No emergency records to export." });
      return;
    }

    const headers = [
      "Incident #",
      "Triggered At",
      "Passenger Name",
      "Seat Number",
      "Bus Number",
      "Status",
      "Response Time (s)",
      "Withdrawn",
      "Crew Report",
      "AI Analysis",
      "Admin Approved"
    ];

    const rows = filteredReports.map((r, idx) => {
      const incidentNum = filteredReports.length - idx;
      const triggered = r.timestamp ? format(new Date(r.timestamp), 'yyyy-MM-dd HH:mm:ss') : '';
      const responseTime = r.respondedAt && r.timestamp 
        ? Math.max(0, Math.round((new Date(r.respondedAt).getTime() - new Date(r.timestamp).getTime()) / 1000))
        : '';
      const isWithdrawn = r.status === 'withdrawn' ? 'Yes' : 'No';
      const statusText = r.status === 'withdrawn' 
        ? 'Withdrawn by Passenger' 
        : r.severe 
        ? 'Escalated (No Crew Response)' 
        : 'Resolved In Time';
      const approved = r.adminApproved ? 'Yes' : 'No';

      const escapeCSV = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;

      return [
        incidentNum,
        escapeCSV(triggered),
        escapeCSV(r.passengerName),
        escapeCSV(r.seatNumber),
        escapeCSV(r.busNumber || r.busId),
        escapeCSV(statusText),
        responseTime,
        isWithdrawn,
        escapeCSV(r.issueReport || ''),
        escapeCSV(r.aiAnalysis || ''),
        approved
      ].join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `emergency_audit_logs_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Successful",
      description: `Downloaded ${filteredReports.length} emergency logs.`,
    });
  };

  if (isUserLoading || loading) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-3xl mt-6" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="h-full flex items-center justify-center p-4 bg-slate-50/50 min-h-[60vh]">
        <Card className="max-w-md w-full border-0 shadow-2xl shadow-rose-900/5 bg-white/80 backdrop-blur-xl">
          <CardHeader className="text-center pb-2">
            <div className="w-20 h-20 mx-auto bg-rose-100 rounded-full flex items-center justify-center mb-4">
              <Frown className="w-10 h-10 text-rose-600" />
            </div>
            <CardTitle className="text-2xl font-bold">Access Denied</CardTitle>
            <CardDescription className="text-base mt-2">You lack operator permissions to view emergency logs.</CardDescription>
          </CardHeader>
          <div className="p-6 pt-2">
            <Button onClick={() => router.push('/admin')} className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-12">
              Return to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 select-text">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.push('/admin')} 
            className="rounded-full hover:bg-white shadow-sm border border-slate-200"
            title="Back to Admin Dashboard"
          >
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                <ShieldAlert className="w-7 h-7 text-red-600" />
                Emergency Response Reports
              </h1>
              <Badge className="bg-red-600 text-white font-black text-xs px-2.5 py-0.5 rounded-full border-0">
                {reports.length} Total
              </Badge>
            </div>
            <p className="text-slate-500 font-medium text-sm mt-1">
              Complete audit log of passenger emergency alarms, withdrawals, cabin crew response times, and AI incident analysis.
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="rounded-xl border-slate-200 hover:bg-slate-100 font-bold text-slate-700 gap-2 shadow-sm"
          >
            <Download className="w-4 h-4 text-slate-600" />
            Export Audit Log
          </Button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card 
          onClick={() => setStatusFilter('all')}
          className={cn(
            "cursor-pointer border transition-all hover:scale-[1.02] shadow-sm",
            statusFilter === 'all' ? "border-slate-800 ring-2 ring-slate-800/20 bg-slate-900 text-white" : "bg-white border-slate-200"
          )}
        >
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <span className={cn("text-xs font-bold uppercase tracking-wider", statusFilter === 'all' ? "text-slate-300" : "text-slate-500")}>
              All Incidents
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-black">{stats.total}</span>
              <ShieldAlert className={cn("w-5 h-5", statusFilter === 'all' ? "text-red-400" : "text-slate-400")} />
            </div>
          </CardContent>
        </Card>

        <Card 
          onClick={() => setStatusFilter('severe')}
          className={cn(
            "cursor-pointer border transition-all hover:scale-[1.02] shadow-sm",
            statusFilter === 'severe' ? "border-red-600 ring-2 ring-red-500/20 bg-red-600 text-white" : "bg-white border-slate-200"
          )}
        >
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <span className={cn("text-xs font-bold uppercase tracking-wider", statusFilter === 'severe' ? "text-red-100" : "text-red-600")}>
              Escalated (&gt; 3m)
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-black">{stats.severeCount}</span>
              <AlertTriangle className={cn("w-5 h-5", statusFilter === 'severe' ? "text-white" : "text-red-500")} />
            </div>
          </CardContent>
        </Card>

        <Card 
          onClick={() => setStatusFilter('resolved')}
          className={cn(
            "cursor-pointer border transition-all hover:scale-[1.02] shadow-sm",
            statusFilter === 'resolved' ? "border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-600 text-white" : "bg-white border-slate-200"
          )}
        >
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <span className={cn("text-xs font-bold uppercase tracking-wider", statusFilter === 'resolved' ? "text-emerald-100" : "text-emerald-600")}>
              Resolved In Time
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-black">{stats.resolvedInTime}</span>
              <CheckCircle2 className={cn("w-5 h-5", statusFilter === 'resolved' ? "text-white" : "text-emerald-500")} />
            </div>
          </CardContent>
        </Card>

        <Card 
          onClick={() => setStatusFilter('withdrawn')}
          className={cn(
            "cursor-pointer border transition-all hover:scale-[1.02] shadow-sm",
            statusFilter === 'withdrawn' ? "border-amber-600 ring-2 ring-amber-500/20 bg-amber-600 text-white" : "bg-white border-slate-200"
          )}
        >
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <span className={cn("text-xs font-bold uppercase tracking-wider", statusFilter === 'withdrawn' ? "text-amber-100" : "text-amber-600")}>
              Withdrawn
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-black">{stats.withdrawnCount}</span>
              <XCircle className={cn("w-5 h-5", statusFilter === 'withdrawn' ? "text-white" : "text-amber-500")} />
            </div>
          </CardContent>
        </Card>

        <Card 
          onClick={() => setStatusFilter('needs-approval')}
          className={cn(
            "cursor-pointer border transition-all hover:scale-[1.02] shadow-sm col-span-2 sm:col-span-1",
            statusFilter === 'needs-approval' ? "border-purple-600 ring-2 ring-purple-500/20 bg-purple-600 text-white" : "bg-white border-slate-200"
          )}
        >
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <span className={cn("text-xs font-bold uppercase tracking-wider", statusFilter === 'needs-approval' ? "text-purple-100" : "text-purple-600")}>
              Needs Approval
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-black">{stats.pendingApproval}</span>
              <Sparkles className={cn("w-5 h-5", statusFilter === 'needs-approval' ? "text-white" : "text-purple-500")} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="border-slate-200 shadow-sm bg-white/90 backdrop-blur-md">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search seat, passenger, bus..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                <SelectTrigger className="w-full sm:w-[180px] rounded-xl border-slate-200">
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <SelectValue placeholder="Status Filter" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Incidents ({stats.total})</SelectItem>
                  <SelectItem value="severe">Escalated ({stats.severeCount})</SelectItem>
                  <SelectItem value="resolved">Resolved In Time ({stats.resolvedInTime})</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn ({stats.withdrawnCount})</SelectItem>
                  <SelectItem value="needs-approval">Needs Approval ({stats.pendingApproval})</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={(val: any) => setDateFilter(val)}>
                <SelectTrigger className="w-full sm:w-[160px] rounded-xl border-slate-200">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <SelectValue placeholder="Date Range" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today's Trips</SelectItem>
                  <SelectItem value="all">All-Time History</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table Card */}
      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white/95 backdrop-blur-md">
        <CardHeader className="bg-slate-50/70 border-b border-slate-200/80 py-4 px-6 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600" />
              Emergency Response Audit Log
            </CardTitle>
            <Badge variant="outline" className="text-xs font-bold text-slate-600 bg-white">
              Showing {filteredReports.length} of {reports.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Live Updates
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredReports.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-red-50/40">
                  <TR>
                    <TH className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-red-700">Incident #</TH>
                    <TH className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-red-700">Triggered At</TH>
                    <TH className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-red-700">Passenger & Seat</TH>
                    <TH className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-red-700">Bus Assigned</TH>
                    <TH className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-red-700">Response / Action</TH>
                    <TH className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-red-700 text-right">Status</TH>
                  </TR>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report, idx) => {
                    const incidentNumber = reports.length - reports.findIndex(r => r.timestamp === report.timestamp && r.scheduleId === report.scheduleId);
                    const isWithdrawn = report.status === 'withdrawn';
                    const isSevere = report.severe && !isWithdrawn;
                    const responseSeconds = report.respondedAt && report.timestamp 
                      ? Math.max(0, Math.round((new Date(report.respondedAt).getTime() - new Date(report.timestamp).getTime()) / 1000))
                      : null;
                    const withdrawnSeconds = report.withdrawnAt && report.timestamp
                      ? Math.max(0, Math.round((new Date(report.withdrawnAt).getTime() - new Date(report.timestamp).getTime()) / 1000))
                      : null;

                    return (
                      <React.Fragment key={`${report.scheduleId}-${report.timestamp}-${idx}`}>
                        <TR className="hover:bg-red-50/20 transition-colors border-t border-slate-100">
                          <TD className="py-4 px-6 font-mono font-black text-xs text-slate-700">
                            <Badge className="bg-slate-900 text-white font-mono text-[11px] px-2 py-0.5 rounded-md border-0">
                              #{incidentNumber > 0 ? incidentNumber : filteredReports.length - idx}
                            </Badge>
                          </TD>
                          <TD className="py-4 px-6">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900">
                                {report.timestamp ? format(new Date(report.timestamp), 'hh:mm:ss a') : '--:--'}
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium">
                                {report.timestamp ? format(new Date(report.timestamp), 'dd MMM yyyy') : ''}
                              </span>
                            </div>
                          </TD>
                          <TD className="py-4 px-6">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 text-sm">
                                {report.passengerName || 'Passenger'}
                              </span>
                              <span className="text-xs text-rose-700 font-extrabold mt-0.5">
                                Seat {report.seatNumber}
                              </span>
                            </div>
                          </TD>
                          <TD className="py-4 px-6">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 text-sm">
                                {report.busNumber || report.busId}
                              </span>
                              <span className="text-xs text-slate-500 font-medium truncate max-w-[140px]">
                                {report.travelsName || 'Assigned Bus'}
                              </span>
                            </div>
                          </TD>
                          <TD className="py-4 px-6">
                            <div className="flex flex-col">
                              {isWithdrawn ? (
                                <>
                                  <span className="font-bold text-amber-700 text-sm">
                                    {report.withdrawnAt ? format(new Date(report.withdrawnAt), 'hh:mm:ss a') : '--:--'}
                                  </span>
                                  <span className="text-xs text-amber-600 font-medium">
                                    Withdrawn by Pax {withdrawnSeconds !== null ? `(after ${withdrawnSeconds}s)` : ''}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="font-bold text-emerald-700 text-sm">
                                    {report.respondedAt ? format(new Date(report.respondedAt), 'hh:mm:ss a') : '--:--'}
                                  </span>
                                  <span className="text-xs text-emerald-600 font-medium">
                                    Crew Responded {responseSeconds !== null ? `(in ${responseSeconds}s)` : ''}
                                  </span>
                                </>
                              )}
                            </div>
                          </TD>
                          <TD className="py-4 px-6 text-right">
                            {isWithdrawn ? (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-bold text-xs">
                                WITHDRAWN BY PASSENGER
                              </Badge>
                            ) : isSevere ? (
                              <Badge className="bg-red-100 text-red-700 border-red-300 font-bold text-xs animate-pulse">
                                ESCALATED (NO CREW RESPONSE)
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 font-bold text-xs">
                                RESOLVED IN TIME
                              </Badge>
                            )}
                          </TD>
                        </TR>

                        {/* Crew Report, AI Analysis & Action Expansion */}
                        <TR className="bg-red-50/15 border-t-0">
                          <TD colSpan={6} className="py-4 px-8 border-l-4 border-l-red-500 bg-white/90">
                            <div className="flex flex-col md:flex-row gap-6 items-start">
                              <div className="flex-1">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                  Crew Incident Report
                                </p>
                                {report.issueReport ? (
                                  <p className="text-sm text-slate-800 font-medium bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                    {report.issueReport}
                                  </p>
                                ) : (
                                  <div className="p-3.5 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 flex flex-col gap-1.5">
                                    <p className="text-sm text-amber-900 font-semibold">
                                      {isWithdrawn 
                                        ? "Passenger withdrew the alarm before crew assistance. No crew incident report was submitted." 
                                        : "Crew report has not been submitted yet for this emergency incident."
                                      }
                                    </p>
                                    {report.reportRequested && (
                                      <div className="flex items-center gap-1 text-xs font-bold text-amber-800">
                                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                                        <span>Report requested by Admin • High-priority alert sent to Cabin Crew</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="flex-1">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> AI Incident Analysis
                                </p>
                                <p className="text-sm text-slate-800 font-medium bg-amber-50/60 p-3.5 rounded-xl border border-amber-200/60">
                                  {report.aiAnalysis || (report.issueReport ? "AI analysis in progress..." : isWithdrawn ? "Resolved via passenger withdrawal. No severe escalation." : "Pending crew report submission to generate automated AI insights.")}
                                </p>
                              </div>

                              <div className="flex flex-col items-end justify-center min-w-[200px] gap-2 pt-5 md:pt-0 self-center">
                                {report.adminApproved ? (
                                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100 px-4 py-2.5 flex items-center gap-2 border border-green-300 font-bold text-xs rounded-xl shadow-sm">
                                    <CheckCircle className="w-4 h-4 text-green-600" /> 
                                    Admin Approved
                                  </Badge>
                                ) : report.issueReport ? (
                                  <Button 
                                    disabled={approvingTimestamp === report.timestamp}
                                    onClick={() => handleApprove(report.scheduleId, report.timestamp)}
                                    className="bg-red-600 hover:bg-red-700 text-white font-bold w-full rounded-xl shadow-sm h-11"
                                  >
                                    {approvingTimestamp === report.timestamp ? (
                                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Approving...</>
                                    ) : (
                                      "Approve Report"
                                    )}
                                  </Button>
                                ) : (
                                  <Button 
                                    disabled={requestingReportId === report.timestamp}
                                    onClick={() => handleRequestReport(report.scheduleId, report.timestamp, report.seatNumber, report.passengerName)}
                                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold w-full rounded-xl shadow-sm h-11 gap-2"
                                  >
                                    {requestingReportId === report.timestamp ? (
                                      <><Loader2 className="w-4 h-4 animate-spin" /> Requesting...</>
                                    ) : report.reportRequested ? (
                                      <><RefreshCw className="w-4 h-4" /> Re-request Report</>
                                    ) : (
                                      <><Send className="w-4 h-4" /> Request Crew Report</>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </TD>
                        </TR>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-16 text-center flex flex-col items-center justify-center text-slate-500">
              <ShieldAlert className="w-14 h-14 opacity-20 mb-3 text-red-500" />
              <p className="font-bold text-slate-700 text-lg">No emergency incident reports found</p>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                {searchQuery || statusFilter !== 'all' 
                  ? "Try clearing your search or status filter to see other emergency records."
                  : "All passenger emergency alarms, withdrawals, and cabin crew responses will be logged here."
                }
              </p>
              {(searchQuery || statusFilter !== 'all') && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                  className="mt-4 rounded-xl"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
