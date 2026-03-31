

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
      const status = localStorage.getItem(`boarded_${bookingId}`) === 'true';
      setBoardedStatus(status);
    }
  }, [bookingId]);

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
      <Card className="w-full hover:shadow-lg transition-shadow duration-300 overflow-hidden">
        <CardContent className="p-0 flex flex-col md:flex-row">
          {/* No Image Thumbnail as per request */}
          

          {/* Main Details Section */}
          <div className="flex-grow p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-headline font-semibold">{bus.travelsName}</h3>
                <div className="flex flex-col md:flex-row md:items-center gap-x-4 text-sm text-muted-foreground">
                  <p>{bus.busType} {bus.busModel ? `(${bus.busModel})` : ''}</p>
                  {!bookingId && (
                    <p className="font-medium">
                      <span className={cn(totalSeatsColorClass)}>
                        {totalAvailable} seats left
                      </span>
                      {singleSeatsAvailable > 0 && (
                        <span className={cn(singleSeatsColorClass)}>
                          {' '}({singleSeatsAvailable} single)
                        </span>
                      )}
                    </p>
                  )}
                  {seatNumbers && seatNumbers.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Armchair className="w-4 h-4"/>
                      <span className="font-medium text-foreground">{seatNumbers.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
              <Badge variant="outline" className="flex items-center gap-1 shrink-0">
                <Star className="w-4 h-4 text-yellow-400 fill-current" />
                <span className="font-bold">{bus.rating || 'N/A'}</span>
              </Badge>
            </div>

            <div className="flex items-center justify-between text-sm font-medium mt-2">
              <div className="text-center">
                <p className="font-bold text-base text-foreground">
                  {formatTime(boardingPointToShow?.time || bus.departureTime)}
                  <span className="text-xs font-normal text-foreground"> ({departureDateTime ? format(departureDateTime, 'dd MMM') : ''})</span>
                </p>
                <p className="text-foreground">
                  {searchOrigin || bus.origin}
                </p>
              </div>
            
              <div className="text-center text-muted-foreground">
                <ArrowRight className="w-4 h-4 mx-auto" />
                <span>{bus.duration}</span>
              </div>
            
              <div className="text-center">
                <p className="font-bold text-base text-foreground">
                  {formatTime(droppingPointToShow?.time || bus.arrivalTime)}
                   <span className="text-xs font-normal text-foreground"> ({arrivalDateTime ? format(arrivalDateTime, 'dd MMM') : ''})</span>
                </p>
                <p className="text-foreground">
                  {searchDestination || bus.destination}
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground mt-1">
              {bus.amenities?.slice(0, 4).map(amenity => (
                <div key={amenity} className="flex items-center gap-1">
                  {amenityIcons[amenity] || null}
                  <span>{amenity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Separator for mobile */}
          <div className="md:hidden px-4">
             <Separator />
          </div>

          {/* Fare and Action Section */}
          <div className="w-full md:w-48 flex flex-row md:flex-col items-center justify-between p-4 md:border-l">
            <div className='text-left md:text-right w-full'>
              <p className="text-sm text-muted-foreground">{bookingId ? 'Total Fare' : 'Starting from'}</p>
              <p className="text-xl font-bold font-headline">₹{displayFare}</p>
            </div>
            <div className="w-full mt-0 md:mt-auto">
              <Button asChild className="w-full">
                  <Link href={viewButtonHref()}>{viewButtonText()}</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Details for {bus.travelsName}</DialogTitle>
          <DialogDescription>
            {bus.origin} to {bus.destination} • {bus.busNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow relative p-4">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Map className="w-4 h-4" />
                Route Map
            </h4>
            {bus && service && (
                <BusRouteMap 
                    destinationPoint={droppingPointToShow}
                    waypoints={boardingPoints}
                />
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
