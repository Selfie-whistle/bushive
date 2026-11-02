

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, format, parseISO } from 'date-fns';
import { 
  ArrowLeft, 
  Bus, 
  Clock, 
  CheckCircle2, 
  MapPin, 
  Navigation, 
  Calendar,
  ChevronRight,
  Route as RouteIcon,
  Target,
  Circle,
  Flag,
  CircleDot
} from 'lucide-react';
import dynamic from 'next/dynamic';

import { dataService } from '@/lib/data/client-service';
import type { Bus as BusType, Schedule, Service, Point } from '@/lib/types';
import { useLiveBusData } from '@/hooks/use-live-bus-data';
import { findBestMatchIndex, getScheduledDateTime } from '@/lib/utils';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

const RouteEtaCalculator = dynamic(() => import('@/components/RouteEtaCalculator'), { ssr: false });

type RouteInfo = {
  distance: string;
  duration: string;
  eta: string;
  etaDate: Date;
  delayInMinutes: number;
  locationName: string | null;
  durationMinutes: number;
};

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}


export function ProgressClientPage({ tripId }: { tripId: string }) {
  const router = useRouter();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [bus, setBus] = useState<BusType | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextPointRouteInfo, setNextPointRouteInfo] = useState<{ delayInMinutes?: number } | null>(null);
  const [finalDestinationRouteInfo, setFinalDestinationRouteInfo] = useState<RouteInfo | null>(null);
  const [actualPassedTimes, setActualPassedTimes] = useState<Record<string, Date>>({});

  const busId = useMemo(
    () => schedule?.actualBusId || schedule?.busId || null,
    [schedule]
  );

  const { liveLocation, isTrackingActive } = useLiveBusData(busId);

  const mapRouteData = useMemo(() => {
    if (!service) return null;
    return {
      forward: {
        boarding: service.boardingPointsForward || [],
        dropping: service.droppingPointsForward || [],
      },
      return: {
        boarding: service.boardingPointsReturn || [],
        dropping: service.droppingPointsReturn || [],
      },
    };
  }, [service]);

  useEffect(() => {
    const unsub = dataService.onScheduleSnapshot(tripId, async (s) => {
      if (!s) {
        setLoading(false);
        setError("Trip not found or has been removed.");
        return;
      }

      setSchedule(s);

      const b = await dataService.getBusById(s.actualBusId || s.busId);
      setBus(b || null);

      if (b?.serviceId) {
        const svc = await dataService.getServiceById(b.serviceId);
        setService(svc || null);
      } else if (b) {
        const svc = await dataService.getServiceById(b.serviceId as string);
        setService(svc || null);
      }

      setLoading(false);
    });

    return () => unsub();
  }, [tripId]);

  const journeyPoints = useMemo(() => {
    if (!service || !schedule || !bus) return [];
  
    const boarding =
      schedule.direction === 'RETURN'
        ? service.boardingPointsReturn || []
        : service.boardingPointsForward || [];
  
    const dropping =
      schedule.direction === 'RETURN'
        ? service.droppingPointsReturn || []
        : service.droppingPointsForward || [];
  
    const routePoints = [...boarding, ...dropping];
  
    if (!routePoints.length) return [];
  
    const departureDateTime = getScheduledDateTime(
      schedule.date,
      bus.departureTime,
      bus.departureTime
    );
  
    if (!departureDateTime) return [];
  
    let lastTime = departureDateTime;
    const seen = new Set<string>();
  
    const processed: (Point & {
      calculatedTime: Date;
      actualPassedTime?: Date | null;
      pointType: 'boarding' | 'dropping';
      sequence: number;
      isFirst: boolean;
      isLast: boolean;
    })[] = [];
  
    routePoints.forEach((point, index) => {
      if (!point?.time) return;
  
      const key = `${point.name}-${point.time}`;
      if (seen.has(key)) return;
      seen.add(key);
  
      let calculated = getScheduledDateTime(
        schedule.date,
        point.time,
        bus.departureTime
      );
  
      if (!calculated) return;
  
      if (calculated < lastTime) {
        calculated = addDays(calculated, 1);
      }
  
      lastTime = calculated;
  
      processed.push({
        ...point,
        calculatedTime: calculated,
        actualPassedTime: null, // 🔥 realtime field
        pointType: index < boarding.length ? 'boarding' : 'dropping',
        sequence: processed.length + 1,
        isFirst: processed.length === 0,
        isLast: false,
      });
    });
  
    if (processed.length > 0) {
      processed[processed.length - 1].isLast = true;
    }
  
    return processed;
  }, [service, schedule, bus]);

  useEffect(() => {
    if (!liveLocation || journeyPoints.length === 0) return;
  
    const threshold = 0.3; // km radius for stop detection
  
    journeyPoints.forEach((point) => {
      if (point.actualPassedTime) return;
  
      if (!point.lat || !point.lng) return;
  
      const distance = getDistanceKm(liveLocation.lat, liveLocation.lng, point.lat, point.lng);
  
      if (distance <= threshold) {
        setActualPassedTimes(prev => ({
          ...prev,
          [`${point.name}-${point.time}`]: new Date()
        }));
      }
    });
  }, [liveLocation, journeyPoints]);

  // Find current position in journey
  const currentPosition = useMemo(() => {
    if (!liveLocation || journeyPoints.length === 0) return -1;
    return findBestMatchIndex(journeyPoints, undefined, liveLocation);
  }, [liveLocation, journeyPoints]);

  // Calculate journey progress
  const progressPercentage = useMemo(() => {
    if (journeyPoints.length === 0) return 0;
    return Math.round(((currentPosition + 1) / journeyPoints.length) * 100);
  }, [currentPosition, journeyPoints.length]);

  // Get next upcoming point
  const nextPoint = useMemo(() => {
    if (currentPosition === -1) return journeyPoints[0] || null;
    if (currentPosition < journeyPoints.length - 1) return journeyPoints[currentPosition + 1];
    return null;
  }, [currentPosition, journeyPoints]);

  // Get current/active point
  const activePoint = useMemo(() => {
    if (currentPosition === -1) return null;
    return journeyPoints[currentPosition];
  }, [currentPosition, journeyPoints]);

  const getTimeStatus = (point: any) => {
    if (!schedule || !bus || !point.calculatedTime) return null;
    
    const now = new Date();
    const diffMs = point.calculatedTime.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    
    if (Math.abs(diffMinutes) <= 5) return { status: 'on-time', label: 'On Time', color: 'text-green-600' };
    if (diffMinutes > 5) return { status: 'late', label: `${diffMinutes} min late`, color: 'text-amber-600' };
    return { status: 'early', label: `${Math.abs(diffMinutes)} min early`, color: 'text-blue-600' };
  };

  const getPointIcon = (point: any, index: number) => {
    if (point.isFirst) return Flag;
    if (point.isLast) return Flag;
    if (index === currentPosition) return CircleDot;
    if (index < currentPosition) return CheckCircle2;
    return Circle;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }
  
  if (!schedule || !bus || !service) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertTitle>Incomplete Data</AlertTitle>
            <AlertDescription>Could not load all necessary details for this trip.</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const finalDestinationPoint = journeyPoints[journeyPoints.length -1];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="rounded-full border border-gray-200 hover:bg-gray-50"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Trip Progress</h1>
              <p className="text-gray-600">
                {bus.travelsName} • {format(new Date(schedule.date), 'MMM d, yyyy')} • {bus.departureTime}
              </p>
            </div>
          </div>

          {/* Progress Overview */}
          <Card className="border shadow-sm">
            <CardContent className="pt-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Journey Progress</p>
                    <p className="text-3xl font-bold text-gray-900">{progressPercentage}%</p>
                  </div>
                  <Badge 
                    variant={isTrackingActive ? "default" : "secondary"}
                    className={cn(
                      isTrackingActive ? "bg-green-100 text-green-800 hover:bg-green-100 border-green-200" : ""
                    )}
                  >
                    {isTrackingActive ? 'Live Tracking Active' : 'Live Tracking Paused'}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <Progress value={progressPercentage} className="h-3 bg-gray-100" />
                  <div className="flex justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-blue-600" />
                      <span className="text-gray-600">{journeyPoints[0]?.name || 'Start'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">{journeyPoints[journeyPoints.length - 1]?.name || 'End'}</span>
                      <Flag className="h-4 w-4 text-red-600" />
                    </div>
                  </div>
                </div>

                {/* Current Status */}
                {activePoint && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-100 rounded-full">
                        <Navigation className="h-5 w-5 text-blue-700" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-700">Current Position</p>
                        <p className="text-lg font-semibold text-gray-900 mt-1">{activePoint.name}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <div className="flex items-center gap-1 text-gray-600">
                            <Clock className="h-4 w-4" />
                            <span>Scheduled: {format(activePoint.calculatedTime, 'h:mm a')}</span>
                          </div>
                          {activePoint.pointType && (
                            <Badge variant="outline" className="bg-white">
                              {activePoint.pointType === 'boarding' ? 'Boarding Stop' : 'Dropping Stop'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Sidebar - Trip Info */}
          <div className="lg:col-span-4 space-y-6">
            {/* Vehicle Details */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Bus className="h-5 w-5 text-gray-700" />
                  </div>
                  <span>Vehicle Details</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Bus Number</span>
                  <div className="bg-yellow-400 text-black font-mono font-bold px-3 py-1.5 rounded-md border-2 border-black">
                    {bus.busNumber}
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Operator</span>
                  <span className="font-semibold">{bus.travelsName}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Direction</span>
                  <Badge variant="outline" className="capitalize">
                    {schedule.direction === 'RETURN' 
                      ? `${bus.destination} → ${bus.origin}` 
                      : `${bus.origin} → ${bus.destination}`}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Next Stop Preview */}
            {nextPoint && (
              <Card className="border shadow-sm bg-gradient-to-br from-blue-50 to-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Navigation className="h-5 w-5 text-blue-700" />
                    </div>
                    <span>Next Stop</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xl font-bold text-gray-900">{nextPoint.name}</p>
                      {nextPoint.description && (
                        <p className="text-sm text-gray-600 mt-1">{nextPoint.description}</p>
                      )}
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Scheduled</span>
                        <span className="font-semibold text-blue-700">
                          {format(nextPoint.calculatedTime, 'h:mm a')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Status</span>
                        <Badge className={cn(
                          "border",
                          getTimeStatus(nextPoint)?.status === 'on-time' && "bg-green-100 text-green-800 border-green-200",
                          getTimeStatus(nextPoint)?.status === 'late' && "bg-amber-100 text-amber-800 border-amber-200",
                          getTimeStatus(nextPoint)?.status === 'early' && "bg-blue-100 text-blue-800 border-blue-200"
                        )}>
                          {getTimeStatus(nextPoint)?.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Journey Stats */}
            <Card className="border shadow-sm">
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{journeyPoints.length}</p>
                    <p className="text-xs text-gray-500 mt-1">Total Stops</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">
                      {Math.max(0, currentPosition + 1)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">
                      {Math.max(0, journeyPoints.length - currentPosition - 1)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Remaining</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Journey Timeline */}
          <div className="lg:col-span-8">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <RouteIcon className="h-5 w-5 text-gray-700" />
                    </div>
                    <span>Journey Timeline</span>
                  </CardTitle>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="relative">
                  {/* Timeline Container */}
                  <div className="space-y-3">
                    {journeyPoints.map((point, index) => {
                      const Icon = getPointIcon(point, index);
                      const isPassed = index < currentPosition;
                      const isActive = index === currentPosition;
                      const isUpcoming = index > currentPosition;
                      const timeStatus = getTimeStatus(point);
                      const key = `${point.name}-${point.time}`;
                      const actualTime = actualPassedTimes[key];

                      
                      return (
                        <div 
                          key={`${point.name}-${point.sequence}`}
                          className={cn(
                            "relative flex gap-4 p-4 rounded-lg transition-all duration-200",
                            isActive && "bg-blue-50 border border-blue-200 shadow-sm",
                            isPassed && "opacity-75",
                            "hover:bg-gray-50"
                          )}
                        >
                          {/* Timeline Icon */}
                          <div className="relative flex-shrink-0">
                            <div className={cn(
                              "p-2 rounded-full",
                              isActive && "bg-blue-100",
                              isPassed && !point.isFirst && !point.isLast && "bg-green-100",
                              point.isFirst && "bg-blue-100",
                              point.isLast && "bg-red-100",
                              isUpcoming && !point.isFirst && !point.isLast && "bg-gray-100"
                            )}>
                              <Icon className={cn(
                                "h-5 w-5",
                                isActive && "text-blue-600",
                                isPassed && !point.isFirst && !point.isLast && "text-green-600",
                                point.isFirst && "text-blue-600",
                                point.isLast && "text-red-600",
                                isUpcoming && !point.isFirst && !point.isLast && "text-gray-400"
                              )} />
                            </div>
                            {/* Vertical Connector */}
                            {index < journeyPoints.length - 1 && (
                              <div className={cn(
                                "absolute left-1/2 top-full w-0.5 h-6 -translate-x-1/2",
                                index < currentPosition ? "bg-green-300" : "bg-gray-200"
                              )} />
                            )}
                          </div>

                          {/* Point Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className={cn(
                                    "font-semibold",
                                    isActive && "text-blue-900",
                                    isPassed && "text-gray-700",
                                    isUpcoming && "text-gray-900"
                                  )}>
                                    {point.name}
                                  </h4>
                                  
                                  {/* Status Badges */}
                                  {isActive && (
                                    <Badge className="bg-blue-600 text-white border-0">
                                      Current Stop
                                    </Badge>
                                  )}
                                  {isPassed && !point.isFirst && !point.isLast && (
                                    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                                      Completed
                                    </Badge>
                                  )}
                                  {point.isFirst && (
                                    <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50">
                                      Departure
                                    </Badge>
                                  )}
                                  {point.isLast && (
                                    <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50">
                                      Destination
                                    </Badge>
                                  )}
                                  <Badge variant="secondary" className="text-xs">
                                    Stop #{point.sequence}
                                  </Badge>
                                </div>

                                <div className="mt-2 space-y-2">
                                  {/* Time & Schedule */}
                                  <div className="flex items-center gap-4 text-sm">
                                    <div className="flex items-center gap-1.5">
                                      <Clock className="h-4 w-4 text-gray-500" />
                                      <span className="font-medium text-gray-700">
                                        {format(point.actualPassedTime || point.calculatedTime, 'h:mm a')}
                                      </span>
                                    </div>
                                    
                                    {isPassed && point.actualPassedTime ? (
                                      <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">Actual Time</Badge>
                                    ) : !isPassed && timeStatus ? (
                                      <div className={cn("flex items-center gap-1.5", timeStatus.color)}>
                                        <Circle className="h-2 w-2 fill-current" />
                                        <span className="text-sm font-medium">{timeStatus.label}</span>
                                      </div>
                                    ) : null}
                                  </div>

                                  {/* Description */}
                                  {point.description && (
                                    <div className="flex items-start gap-1.5 text-sm text-gray-600">
                                      <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                      <span>{point.description}</span>
                                    </div>
                                  )}

                                  {/* Point Type */}
                                  <div className="flex items-center gap-2 text-xs">
                                    <Badge variant="outline" className={cn(
                                      point.pointType === 'boarding' 
                                        ? "border-purple-200 text-purple-700 bg-purple-50" 
                                        : "border-orange-200 text-orange-700 bg-orange-50"
                                    )}>
                                      {point.pointType === 'boarding' ? 'Boarding Point' : 'Dropping Point'}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Timeline Legend */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-900 mb-4">Journey Status Legend</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-blue-600" />
                      <span className="text-sm text-gray-600">Departure Point</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-red-600" />
                      <span className="text-sm text-gray-600">Destination</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-gray-600">Completed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CircleDot className="h-4 w-4 text-blue-600" />
                      <span className="text-sm text-gray-600">Current Stop</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Circle className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600">Upcoming</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-blue-600" />
                      <span className="text-sm text-gray-600">Live Position</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex justify-end items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="border-gray-300"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tracking
          </Button>
          <Button
            onClick={() => router.push(`/schedule/${tripId}`)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            View Full Schedule
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
      <div className="absolute w-0 h-0 overflow-hidden pointer-events-none opacity-0">
        {bus && schedule && liveLocation && (
          <>
            {nextPoint && (
              <RouteEtaCalculator
                busId={bus.id}
                startPoint={liveLocation}
                destinationPoint={nextPoint}
                onRouteInfoChange={setNextPointRouteInfo}
                bookingDate={schedule.date}
                scheduledTime={nextPoint.time}
                departureTime={bus.departureTime}
                mapRouteData={mapRouteData}
                activeSchedule={schedule}
              />
            )}
            {finalDestinationPoint && (
              <RouteEtaCalculator
                busId={bus.id}
                startPoint={liveLocation}
                destinationPoint={finalDestinationPoint}
                onRouteInfoChange={setFinalDestinationRouteInfo}
                bookingDate={schedule.date}
                scheduledTime={finalDestinationPoint.time}
                departureTime={bus.departureTime}
                mapRouteData={mapRouteData}
                activeSchedule={schedule}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
