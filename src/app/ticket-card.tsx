'use client';

import React, { useMemo } from 'react';
import type { Booking, Bus as BusType, Point, Schedule, Service } from '@/lib/types';
import { format, parseISO, isValid } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Bus, MapPin, User, Navigation, Bed, Ticket } from 'lucide-react';
import { Button } from './ui/button';
import { resolvePointAny } from '@/lib/point-resolver';
import { getScheduledDateTime } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export function TicketCard({
  booking,
  bus,
  schedule,
  service,
  fromAdmin,
}: {
  booking: Booking;
  bus: BusType;
  schedule: Schedule;
  service: Service;
  fromAdmin?: boolean;
}) {
  const router = useRouter();

  const {
    id,
    pnr,
    passengers,
    bookingDate,
    totalFare,
    baseFare,
    taxes,
    discount,
  } = booking;

  /* ---------------- DATA RESOLUTION ---------------- */
  const boardingPoints = useMemo(
    () => schedule.direction === 'RETURN' 
      ? service.boardingPointsReturn || [] 
      : service.boardingPointsForward || [],
    [schedule.direction, service]
  );

  const droppingPoints = useMemo(
    () => schedule.direction === 'RETURN' 
      ? service.droppingPointsReturn || [] 
      : service.droppingPointsForward || [],
    [schedule.direction, service]
  );
  
  const fullBoardingPoint = useMemo(
    () => resolvePointAny(boardingPoints, booking.boardingPoint),
    [boardingPoints, booking.boardingPoint]
  );

  const fullDroppingPoint = useMemo(
    () => resolvePointAny(droppingPoints, booking.droppingPoint),
    [droppingPoints, booking.droppingPoint]
  );
  
  const parsedBookingDate = useMemo(() => {
    try {
      const date = bookingDate ? parseISO(bookingDate) : new Date();
      return isValid(date) ? date : new Date();
    } catch {
      return new Date();
    }
  }, [bookingDate]);

  /* ---------------- DATE & TIME FORMATTING ---------------- */
  const boardingDateTime = useMemo(
    () =>
      fullBoardingPoint?.time
        ? getScheduledDateTime(
            parsedBookingDate,
            fullBoardingPoint.time,
            bus.departureTime
          )
        : null,
    [fullBoardingPoint?.time, parsedBookingDate, bus.departureTime]
  );
  
  const droppingDateTime = useMemo(
    () =>
      fullDroppingPoint?.time
        ? getScheduledDateTime(
            parsedBookingDate,
            fullDroppingPoint.time,
            bus.departureTime
          )
        : null,
    [fullDroppingPoint?.time, parsedBookingDate, bus.departureTime]
  );

  const formatTime = (date: Date | null): string => {
    if (!date) return '--:--';
    return format(date, 'hh:mm a');
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return '--';
    return format(date, 'dd MMM yyyy');
  };

  /* ---------------- FARE CALCULATION ---------------- */
  const fareDetails = useMemo(() => {
    const calculatedBaseFare = baseFare || Math.round(totalFare / 1.05);
    const calculatedTaxes = taxes || totalFare - calculatedBaseFare;
    const calculatedDiscount = discount || 0;
    
    return {
      baseFare: calculatedBaseFare,
      taxes: calculatedTaxes,
      discount: calculatedDiscount,
      totalFare,
    };
  }, [baseFare, taxes, discount, totalFare]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleTrackBus = () => {
    const passengerSeat = booking.passengers?.[0]?.seatNumber;
    const isBoarded = schedule?.bookings?.some(
      (b: any) => b.bookingId === id && (!passengerSeat || b.seat === passengerSeat) && b.boarded
    );
    if (isBoarded) {
      router.push(`/track/${id}/console${fromAdmin ? '?from=admin' : ''}`);
    } else {
      router.push(`/track/${id}${fromAdmin ? '?from=admin' : ''}`);
    }
  };

  const isSleeper = bus.busType?.toLowerCase().includes('sleeper') || bus.busCategory?.toLowerCase().includes('sleeper');

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="bg-gradient-to-br from-white via-blue-50/30 to-white rounded-3xl shadow-2xl overflow-hidden border border-white/50">
        
        <div className="relative bg-gradient-to-r from-blue-600 via-blue-700 to-purple-600 p-6">
          <div className="absolute inset-0 bg-gradient-to-t from-white/20 via-transparent to-white/10"></div>
          <div className="absolute top-4 right-4 w-16 h-16 bg-yellow-400/20 rounded-full"></div>
          
          <div className="relative text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 mb-4">
              <Ticket className="h-8 w-8 text-white" />
              <div className="absolute -top-2 -right-2">
                <div className="w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center">
                  <div className="text-sm">✨</div>
                </div>
              </div>
            </div>
            
            <h1 className="text-3xl font-bold text-white mb-2">
              🚌 TICKET CONFIRMED! ✨
            </h1>
            <p className="text-lg text-white/90">
              Adventure Awaits! Let&apos;s Roll! 🎢
            </p>
          </div>
        </div>

        <div className="p-6 border-b border-blue-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">PNR NUMBER</p>
                <p className="text-2xl font-bold text-gray-800 font-mono">{pnr || 'N/A'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500 mb-1">TRAVEL PARTNER</p>
                <p className="text-lg font-semibold text-gray-800">{bus.operator}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">BOOKING ID</p>
                <p className="text-lg font-semibold text-gray-800 font-mono">
                  {id}
                </p>
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-sm text-gray-500 mb-1">BUS NUMBER</p>
                  <div className="bg-yellow-400 text-black font-mono text-sm font-bold px-2 py-1 rounded-md border-2 border-black inline-block">
                    {bus.busNumber || 'N/A'}
                  </div>
                </div>
                
                <Button
                  onClick={handleTrackBus}
                  className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 shadow-md"
                  size="sm"
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Track Bus
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-b border-blue-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl border-2 border-blue-200 p-4">
              <h2 className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="text-lg">🎪</span>
                Boarding Point
              </h2>
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-1">
                  <p className="text-lg font-bold text-red-600 leading-tight">{fullBoardingPoint?.name || booking.boardingPoint}</p>
                  <p className="text-gray-600 text-xs mt-1">{fullBoardingPoint?.description}</p>
                </div>
              </div>
              <div className="space-y-2 border-t border-blue-100 pt-3 mt-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Time</span>
                  <span className="font-bold text-gray-800">{formatTime(boardingDateTime)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Date</span>
                  <span className="font-bold text-black">{formatDate(boardingDateTime)}</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-white rounded-xl border-2 border-green-200 p-4">
              <h2 className="text-xs font-bold text-green-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="text-lg">🏁</span>
                Dropping Point
              </h2>
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-1">
                  <p className="text-lg font-bold text-red-600 leading-tight">{fullDroppingPoint?.name || booking.droppingPoint}</p>
                  <p className="text-gray-600 text-xs mt-1">{fullDroppingPoint?.description}</p>
                </div>
              </div>
              <div className="space-y-2 border-t border-green-100 pt-3 mt-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Time</span>
                  <span className="font-bold text-gray-800">{formatTime(droppingDateTime)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Date</span>
                  <span className="font-bold text-black">{formatDate(droppingDateTime)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-b border-blue-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100">
              <div className="text-xl">👤</div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800">ADVENTURER DETAILS</h3>
              <p className="text-gray-600 text-sm">Comfort awaits our traveler! 🎪</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {passengers?.map((passenger, index) => (
              <div key={index} className="bg-white p-4 rounded-xl border border-purple-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                      <User className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-800">{passenger.name}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        {isSleeper ? (
                          <span className="flex items-center gap-1">
                            <Bed className="h-4 w-4 text-blue-500" />
                            Sleeper: {passenger.seatNumber}
                          </span>
                        ) : (
                          <span>Seat: {passenger.seatNumber}</span>
                        )}
                        <span className="flex items-center gap-1">
                          {passenger.gender?.toLowerCase() === 'male' ? '👦' : 
                           passenger.gender?.toLowerCase() === 'female' ? '👧' : '👤'}
                          {passenger.gender}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {isSleeper && (
                    <div className="text-right">
                      <div className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full">
                        <Bed className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-700">SLEEPER</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-100 to-yellow-100">
              <div className="text-xl">💰</div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800 font-headline">PAYMENT SUMMARY</h3>
              <p className="text-gray-600 text-sm">Complete fare breakdown</p>
            </div>
          </div>
          
          <div className="space-y-4 font-headline">
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Base Fare</span>
              <span className="font-semibold text-gray-800">{formatCurrency(fareDetails.baseFare)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Taxes & Fees</span>
              <span className="font-semibold text-red-500">+ {formatCurrency(fareDetails.taxes)}</span>
            </div>
            
            {fareDetails.discount > 0 && (
              <div className="flex justify-between items-center text-green-600">
                <span>Discount</span>
                <span className="font-semibold flex items-center gap-1">
                  - {formatCurrency(fareDetails.discount)}
                  <span className="text-lg">🎉</span>
                </span>
              </div>
            )}
            
            <Separator className="my-4" />
            
            <div className="flex justify-between items-center bg-gradient-to-r from-blue-50 to-white p-4 rounded-xl border border-blue-100">
              <span className="text-xl font-bold text-gray-800">TOTAL PAID</span>
              <span className="text-3xl font-bold text-blue-600">
                {formatCurrency(fareDetails.totalFare)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 border-t border-blue-100 text-center">
          <p className="font-semibold text-gray-800 mb-1">
            ✨ Safe journey! Your adventure begins... ✨
          </p>
          <p className="text-sm text-gray-600">
            Need help? Call 1800-123-4567
          </p>
        </div>
      </div>
    </div>
  );
}