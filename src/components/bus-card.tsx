

'use client';

import Link from 'next/link';
import type { Bus, Schedule, Seat, Point, PointGroup, Service } from '@/lib/types';
import { cn, formatTime, isValidDate } from '@/lib/utils';
import { ArrowRight, Star, AirVent, BatteryCharging, LocateFixed, Wifi, GlassWater, Tv2, Video, Armchair, Map } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { useMemo, useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from './ui/separator';
import * as React from 'react';
import { dataService } from '@/lib/data/client-service';
import dynamic from 'next/dynamic';
import { Skeleton } from './ui/skeleton';

const BusRouteMap = dynamic(() => import('./LiveBusRoute'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted"><Skeleton className="h-full w-full" /></div>
});




type BusCardProps = {
  bus: Bus;
  schedule: Schedule;
  service: Service;
  date: string;
  bookingId?: string;
  totalFare?: number;
  seatNumbers?: string[];
  flow?: 'view' | 'track';
  searchOrigin?: string;
  searchDestination?: string;
};

const amenityIcons: { [key: string]: React.ReactNode } = {
    'A/C': <AirVent className="w-4 h-4" />,
    'Non-AC': <AirVent className="w-4 h-4 relative"> <span className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-destructive font-bold">×</span> </AirVent>,
    'Water Bottle': <GlassWater className="w-4 h-4" />,
    'Wi-Fi': <Wifi className="w-4 h-4" />,
    'Charging Point': <BatteryCharging className="w-4 h-4" />,
    'Live Tracking': <LocateFixed className="w-4 h-4" />,
    'Movie': <Video className="w-4 h-4" />,
    'TV': <Tv2 className="w-4 h-4" />,
};

export function BusCard({ 
    bus, 
    schedule, 
    service,
    date, 
    bookingId, 
    totalFare, 
    seatNumbers, 
    flow = 'view', 
    searchOrigin,
    searchDestination
}: BusCardProps) {
  const [boardedStatus, setBoardedStatus] = useState(false);
  
  useEffect(() => {
    if (bookingId) {
      const isLocallyMarked = 
        localStorage.getItem(`boarded_${bookingId}`) === 'true' || 
        localStorage.getItem(`bushive_welcome_shown_${bookingId}`) === 'true';
      const isBoardedInSchedule = schedule?.bookings?.some(
        (b: any) => b.bookingId === bookingId && b.boarded
      );
      setBoardedStatus(Boolean(isLocallyMarked || isBoardedInSchedule));
    }
  }, [bookingId, schedule]);

  if (!bus || !schedule) return null;

  const getPointsForDirection = (type: 'boarding' | 'dropping') => {
    if (!service) return [];
    if (schedule.direction === 'RETURN') {
        return type === 'boarding' ? service.boardingPointsReturn : service.droppingPointsReturn;
    }
    return type === 'boarding' ? service.boardingPointsForward : service.droppingPointsForward;
  };
  
  const boardingPoints = getPointsForDirection('boarding');
  const droppingPoints = getPointsForDirection('dropping');

  const { boardingPointToShow, droppingPointToShow } = useMemo(() => {
    const normalizedOrigin = searchOrigin?.trim().toLowerCase();
    const normalizedDestination = searchDestination?.trim().toLowerCase();

    let finalBoardingPoint: Point | null = null;
    let finalDroppingPoint: Point | null = null;

    if (normalizedOrigin && boardingPoints) {
        const exactSubPointMatch = boardingPoints.find(p => p.name.toLowerCase() === normalizedOrigin);
        if (exactSubPointMatch) {
            finalBoardingPoint = exactSubPointMatch;
        } else {
            const mainPointMatches = boardingPoints.filter(p => p.main?.toLowerCase() === normalizedOrigin);
            if (mainPointMatches.length > 0) {
                 // Use first sub-point for main boarding point search
                finalBoardingPoint = mainPointMatches[0];
            }
        }
    }
    if (!finalBoardingPoint) {
        finalBoardingPoint = { name: bus.origin, time: bus.departureTime } as Point;
    }

    if (normalizedDestination && droppingPoints) {
        const exactSubPointMatch = droppingPoints.find(p => p.name.toLowerCase() === normalizedDestination);
        if (exactSubPointMatch) {
            finalDroppingPoint = exactSubPointMatch;
        } else {
            const mainPointMatches = droppingPoints.filter(p => p.main?.toLowerCase() === normalizedDestination);
            if (mainPointMatches.length > 0) {
                 // Use last sub-point for main dropping point search
                finalDroppingPoint = mainPointMatches[mainPointMatches.length - 1];
            }
        }
    }
    if (!finalDroppingPoint) {
        finalDroppingPoint = { name: bus.destination, time: bus.arrivalTime } as Point;
    }

    return { boardingPointToShow: finalBoardingPoint, droppingPointToShow: finalDroppingPoint };
  }, [searchOrigin, searchDestination, boardingPoints, droppingPoints, bus.origin, bus.destination, bus.departureTime, bus.arrivalTime]);
  
  const getPointDateTime = (
    pointTime: string,
    boardingReferenceTime: string
  ): Date | null => {
    if (!date || !pointTime || !boardingReferenceTime) return null;
  
    const baseDate = parseISO(date);
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

  const firstBoardingTime = boardingPoints?.[0]?.time || bus.departureTime;
  const departureDateTime = getPointDateTime(boardingPointToShow?.time || bus.departureTime, firstBoardingTime);
  const arrivalDateTime = getPointDateTime(droppingPointToShow?.time || bus.arrivalTime, firstBoardingTime);
  
  const hasDepartureTimePassed = useMemo(() => {
    if (bookingId || !departureDateTime) return false;
    return new Date() > departureDateTime;
  }, [departureDateTime, bookingId]);
  
  const totalAvailable = schedule.availableSeats;

  const singleSeatsAvailable = useMemo(() => {
    if (!bus.seatLayout || !bus.seatLayout.seats) return 0;
    const bookedSeatNumbers = new Set(schedule.bookings.map((b: any) => b.seat));
    
    const isSingleSeat = (seatNumber: string) => {
      if (!seatNumber) return false;
      const num = parseInt(seatNumber.slice(1), 10);
      return (num - 1) % 3 === 0;
    };
    
    const allSingleSeats = bus.seatLayout.seats.filter(seat => seat && isSingleSeat(seat.number));
      
    const availableSingleSeats = allSingleSeats.filter(seat => seat && !bookedSeatNumbers.has(seat.number));
    return availableSingleSeats.length;
  }, [bus.seatLayout, schedule.bookings]);

  const displayFare = useMemo(() => {
    if (bookingId && totalFare) return totalFare;
    if (bookingId) return bus.baseFare;

    if (!schedule || !bus?.seatLayout?.seats) return schedule?.fare ?? bus?.baseFare ?? 0;
  
    const allSeats: Seat[] = bus.seatLayout.seats;
    const bookedSeatNumbers = new Set(schedule.bookings?.map((b: any) => b.seat));
    const seatPrices = schedule.seatPrices || {};
  
    const availableSeats = allSeats.filter(seat => seat && !bookedSeatNumbers.has(seat.number));
  
    if (availableSeats.length === 0) {
        return schedule.fare;
    }
    
    const validPrices = availableSeats.map(seat => seatPrices[seat.number] || bus.baseFare).filter(price => price > 0);
  
    if (validPrices.length === 0) return schedule.fare;
    
    return Math.min(...validPrices);
  }, [bookingId, totalFare, bus, schedule]);

  const viewButtonHref = () => {
    if (bookingId) {
      if (flow === 'track') {
         return boardedStatus ? `/track/${bookingId}/console` : `/track/${bookingId}`;
      }
      return `/confirmation/${bookingId}?from=tickets`;
    }
    
    const slug = schedule.id; // Use the actual schedule ID as the slug
    const params = new URLSearchParams();
    params.set('date', date);
    if (searchOrigin) params.set('from', searchOrigin);
    if (searchDestination) params.set('to', searchDestination);

    return `/book/${slug}?${params.toString()}`;
  };

  const viewButtonText = () => {
    if (bookingId) {
      return flow === 'track' ? 'Track' : 'View';
    }
    return 'Select Seats';
  };

  const totalSeatsColorClass =
    totalAvailable > 10
      ? 'text-availability-green'
      : totalAvailable < 5
      ? 'text-availability-red'
      : 'text-availability-orange';

  const singleSeatsColorClass =
    singleSeatsAvailable > 7
      ? 'text-availability-green'
      : singleSeatsAvailable < 3
      ? 'text-availability-red'
      : 'text-availability-orange';

  return (
    <Dialog>
      <Card className="w-full rounded-2xl hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden bg-white border border-slate-100 group relative">
        <CardContent className="p-0 flex flex-col md:flex-row h-full">
          {/* Decorative Gradient Edge */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-rose-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

          {/* Main Details Section */}
          <div className="flex-grow p-4 md:p-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg md:text-xl font-headline font-bold text-slate-800 tracking-tight">{bus.travelsName}</h3>
                <div className="flex flex-col md:flex-row md:items-center gap-x-3 text-xs text-slate-500 mt-1">
                  <p className="font-medium text-slate-600">{bus.busType} {bus.busModel ? <span className="opacity-70">({bus.busModel})</span> : ''}</p>
                  {!bookingId && (
                    <p className="font-medium flex items-center gap-1.5">
                      <span className={cn("px-1.5 py-0.5 rounded text-[11px]", totalSeatsColorClass)}>
                        {totalAvailable} seats left
                      </span>
                      {singleSeatsAvailable > 0 && (
                        <span className={cn("text-[11px]", singleSeatsColorClass)}>
                          ({singleSeatsAvailable} single)
                        </span>
                      )}
                    </p>
                  )}
                  {seatNumbers && seatNumbers.length > 0 && (
                    <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[11px] font-bold">
                      <Armchair className="w-3 h-3"/>
                      <span>{seatNumbers.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
              <Badge variant="secondary" className="flex items-center gap-1 shrink-0 bg-yellow-100/50 text-yellow-700 hover:bg-yellow-100/80 border border-yellow-200 py-0.5">
                <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                <span className="font-bold text-xs">{bus.rating || 'N/A'}</span>
              </Badge>
            </div>

            {/* Timings & Route Layout */}
            <div className="flex items-center justify-between text-sm font-medium mt-4 bg-slate-50/50 rounded-xl p-3 border border-slate-100 relative">
              
              {/* Origin */}
              <div className="text-left w-1/3">
                <p className="font-bold text-xl font-headline text-slate-800">
                  {formatTime(boardingPointToShow?.time || bus.departureTime)}
                </p>
                <p className="text-slate-500 mt-0.5 truncate pr-2 text-xs" title={searchOrigin || bus.origin}>
                  {searchOrigin || bus.origin}
                </p>
                {departureDateTime && (
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                    {format(departureDateTime, 'dd MMM yyyy')}
                  </p>
                )}
              </div>
            
              {/* Duration Graphic */}
              <div className="flex flex-col items-center justify-center w-1/3 absolute left-1/2 -translate-x-1/2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 bg-white px-2 rounded-full border border-slate-100 z-10">{bus.duration}</div>
                <div className="w-full h-px bg-slate-300 absolute top-1/2 flex items-center justify-between z-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 -ml-1"></div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 absolute left-1/2 -translate-x-1/2 bg-slate-50/50" />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 -mr-1"></div>
                </div>
              </div>
            
              {/* Destination */}
              <div className="text-right w-1/3">
                <p className="font-bold text-xl font-headline text-slate-800">
                  {formatTime(droppingPointToShow?.time || bus.arrivalTime)}
                </p>
                <p className="text-slate-500 mt-0.5 truncate pl-2 text-xs" title={searchDestination || bus.destination}>
                  {searchDestination || bus.destination}
                </p>
                {arrivalDateTime && (
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                    {format(arrivalDateTime, 'dd MMM yyyy')}
                  </p>
                )}
              </div>
            </div>
            
            {/* Amenities */}
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              {bus.amenities?.map(amenity => (
                <div key={amenity} className="flex items-center gap-1 bg-slate-50 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
                  <span className="opacity-70">{amenityIcons[amenity] || <Star className="w-3 h-3" />}</span>
                  <span>{amenity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Separator for mobile */}
          <div className="md:hidden">
             <Separator className="bg-slate-100" />
          </div>

          {/* Fare and Action Section */}
          <div className="w-full md:w-48 bg-gradient-to-b from-slate-50 to-indigo-50/30 flex flex-row md:flex-col items-center md:items-end justify-between p-4 md:border-l border-slate-100 relative">
            
            <div className='text-left md:text-right w-full mb-3 md:mb-0'>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">{bookingId ? 'Total Fare' : 'Starting from'}</p>
              <p className="text-2xl font-bold font-headline text-slate-900 tracking-tight">₹{displayFare}</p>
            </div>
            
            <div className="w-auto md:w-full mt-0 md:mt-auto">
              <Button 
                asChild 
                className="w-full h-10 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-sm shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-300 transition-all active:scale-[0.98]"
              >
                  <Link href={viewButtonHref()}>{viewButtonText()}</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col rounded-3xl overflow-hidden p-0">
        <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
          <DialogTitle className="font-headline text-2xl">{bus.travelsName}</DialogTitle>
          <DialogDescription className="text-base text-slate-500">
            {bus.origin} to {bus.destination} • <span className="font-semibold">{bus.busNumber}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow relative p-6 bg-white">
            <h4 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800 font-headline">
                <Map className="w-5 h-5 text-indigo-500" />
                Route Map
            </h4>
            <div className="h-[calc(100%-2rem)] rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
                {bus && service && (
                    <BusRouteMap 
                        destinationPoint={droppingPointToShow}
                        waypoints={boardingPoints}
                    />
                )}
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
