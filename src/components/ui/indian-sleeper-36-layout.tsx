"use client"

import { cn } from "@/lib/utils"
import { useSchedule as useScheduleHook } from "@/hooks/use-schedule";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { Bus, Seat, Schedule } from "@/lib/types";
import { canSelectSeat } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Input } from "./input";
import { Button } from "./button";
import { dataService } from "@/lib/data/client-service";
import { SteeringWheelIcon } from "../icons";

type SeatStatus = "available" | "male" | "female" | "sold" | "selected" | "male-booked" | "female-booked" | "boarded" | "reboarded";

export function IndianSleeper36Layout({
  schedule,
  bus,
  onSeatSelection,
  onBoardingToggle,
  gender,
  berth,
  preSelectedSeats = [],
  showLegend = true,
  showPrice = true,
  disableGenderReservation = false,
  isRestStopManifest = false,
  showBoardedStatus = false,
  checkedInSeats = [],
}: {
  schedule: Schedule | null;
  bus: Bus | null;
  onSeatSelection?: (seats: Seat[]) => void;
  onBoardingToggle?: (seatNumber: string, bookingId: string, isBoarded: boolean) => void;
  gender?: string;
  berth: 'lower' | 'upper';
  preSelectedSeats?: string[];
  showLegend?: boolean;
  showPrice?: boolean;
  disableGenderReservation?: boolean;
  isRestStopManifest?: boolean;
  showBoardedStatus?: boolean;
  checkedInSeats?: string[];
}) {
    const { toast } = useToast();

    const bookings = useMemo(() => schedule?.bookings || [], [schedule]);

    const allSeats = useMemo(() => {
        const seatData: Record<string, Seat> = {};
        if (!bus?.seatLayout?.seats) return seatData;

        bus.seatLayout.seats.forEach((seat) => {
            seatData[seat.number] = {
                ...seat,
                status: 'available',
                price: schedule?.seatPrices?.[seat.number] ?? bus?.baseFare ?? 0,
            };
        });

        const customBookings = schedule?.bookings || [];

        customBookings.forEach((booking: any) => {
            const seat = seatData[booking.seat];
            if (!seat) return;
            
            seat.gender = booking.gender;

            if (isRestStopManifest) {
                // REST STOP MODE LOGIC: 
                // Only passengers who were originally on the bus (boarded: true) are shown
                if (booking.boarded && !booking.deboarded) {
                    if (checkedInSeats.includes(seat.number)) {
                        seat.status = 'reboarded'; // Dim Light Violet
                    } else {
                        // Pending passengers show in their gender colors
                        seat.status = booking.gender === 'female' ? 'female' : 'male';
                    }
                } else {
                    // Not boarded or deboarded passengers appear as empty available seats
                    seat.status = 'available';
                }
            } else {
                // NORMAL MODE LOGIC
                if (showBoardedStatus && booking.boarded) {
                    seat.status = 'boarded';
                } else {
                    seat.status =
                        booking.gender === "male" ? "male-booked" : "female-booked";
                }
            }
        });

        return seatData;
    }, [bus, schedule?.seatPrices, schedule?.bookings, showBoardedStatus, isRestStopManifest, checkedInSeats]);
    
    const visibleSeats = useMemo(
        () => Object.values(allSeats).filter(seat => seat.deck === berth),
        [allSeats, berth]
    );

    const getSeatStatus = useCallback((seatId: string): SeatStatus => {
        if (preSelectedSeats.includes(seatId)) return "selected";
        const seat = allSeats[seatId];
        return seat ? (seat.status as SeatStatus) : 'available';
    }, [allSeats, preSelectedSeats]);

    const handleSeatClick = (seatId: string) => {
        const seat = allSeats[seatId];
        if (!seat) return;

        if (onSeatSelection) { // For booking page
            const currentStatus = getSeatStatus(seatId);
            if (currentStatus.includes('booked') || currentStatus === 'boarded' || currentStatus === 'reboarded') return;

            const isAlreadySelected = preSelectedSeats.includes(seatId);
            const updatedSelected = isAlreadySelected
                ? preSelectedSeats.filter(s => s !== seatId)
                : [...preSelectedSeats, seatId];
            
            if (!isAlreadySelected && updatedSelected.length > 6) {
                toast({
                    title: "Selection Limit",
                    description: "You can select a maximum of 6 seats.",
                    variant: "destructive"
                });
                return;
            }

            if (gender && !disableGenderReservation) {
                if (!canSelectSeat(seatId, gender as any, bookings, preSelectedSeats)) {
                    toast({
                        variant: 'destructive',
                        title: 'Adjacent Seat Restriction',
                        description: 'This seat is adjacent to a seat booked by a different gender.',
                    });
                    return;
                }
            }
            
            const selectedSeatObjects = updatedSelected.map(id => {
              const baseSeat = allSeats[id];
              return { ...baseSeat, price: baseSeat.price };
            }).filter(Boolean) as Seat[];
            onSeatSelection(selectedSeatObjects);

        } else if (onBoardingToggle) { // For manifest page
            const currentStatus = getSeatStatus(seatId);
            // Only allow interaction with originally boarded seats (male/female/reboarded in this mode)
            if (currentStatus === 'male' || currentStatus === 'female' || currentStatus === 'reboarded') {
                const booking = bookings.find((b: any) => b.seat === seat.number);
                if (booking) {
                    onBoardingToggle(seat.number, booking.bookingId, currentStatus === 'reboarded');
                }
            }
        }
    };
    
    const isInteractive = !!onSeatSelection || !!onBoardingToggle;

    if (!bus || !schedule) {
      return (
        <div className="p-10 text-center text-muted-foreground">
          Loading seat layout…
        </div>
      );
    }
    
  return (
    <div className="flex flex-col items-center gap-6">
       <div className="w-full relative">
            <Berth
                seats={visibleSeats}
                onSeatClick={isInteractive ? handleSeatClick : undefined}
                getSeatStatus={getSeatStatus}
                showPrice={showPrice}
                disableGenderReservation={disableGenderReservation}
                isRestStopManifest={isRestStopManifest}
                title={berth === 'lower' ? 'Lower Berth' : 'Upper Berth'}
            />
        </div>
      {showLegend && (
        <div className="mt-3 pt-3 border-t w-full flex justify-center">
            <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-[11px] max-w-md">
                <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'available', price: 0 }}
                    isLegend
                    showPrice={showPrice}
                    isRestStopManifest={isRestStopManifest}
                />
                <span>Available</span>
                </div>

                 <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'female', price: 0 }}
                    isLegend
                    showPrice={showPrice}
                    isRestStopManifest={isRestStopManifest}
                />
                <span>Only Female</span>
                </div>

                <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'male', price: 0 }}
                    isLegend
                    showPrice={showPrice}
                    isRestStopManifest={isRestStopManifest}
                />
                <span>Only Male</span>
                </div>

                <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'female-booked', price: 0 }}
                    isLegend
                    showPrice={showPrice}
                    isRestStopManifest={isRestStopManifest}
                />
                <span>Booked (Female)</span>
                </div>

                <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'male-booked', price: 0 }}
                    isLegend
                    showPrice={showPrice}
                    isRestStopManifest={isRestStopManifest}
                />
                <span>Booked (Male)</span>
                </div>
                
                <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'selected', price: 0 }}
                    isLegend
                    showPrice={showPrice}
                    isRestStopManifest={isRestStopManifest}
                />
                <span>Selected</span>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}

function Berth({
  seats,
  onSeatClick,
  getSeatStatus,
  showPrice,
  disableGenderReservation,
  isRestStopManifest,
  title,
}: {
  seats: Seat[];
  onSeatClick?: (id: string) => void;
  getSeatStatus: (id: string) => SeatStatus;
  showPrice?: boolean;
  disableGenderReservation?: boolean;
  isRestStopManifest: boolean;
  title?: string;
}) {
  if (seats.length === 0) return null;

  // Map seat number -> seat (L1..L18 / U1..U18)
  const seatByNumber: Record<number, Seat> = {};
  const reservedGender: Record<string, 'male' | 'female'> = {};

  seats.forEach(seat => {
    const num = parseInt(String(seat.number).replace(/\D/g, ""), 10);
    if (!isNaN(num)) {
      seatByNumber[num] = seat;
    }
  });

  const getStatus = (seat: Seat | null): SeatStatus | null => {
      return seat ? getSeatStatus(seat.id) : null;
  };
  
  if (!disableGenderReservation) {
    // Group pairs of double berths
    for (let i = 0; i < 6; i++) {
      const base = i * 3;
      const top = seatByNumber[base + 3];
      const middle = seatByNumber[base + 2];
      
      // ✅ Apply gender reservation ONLY for double beds
      const topStatus = getStatus(top);
      const middleStatus = getStatus(middle);

      const bookings = [topStatus, middleStatus].filter(Boolean);

      // 🚫 Case: both booked with different genders → ALLOW (no rule)
      if (
        bookings.length === 2 &&
        (bookings.includes("male-booked") || bookings.includes("boarded") || bookings.includes("reboarded")) &&
        (bookings.includes("female-booked") || bookings.includes("boarded") || bookings.includes("reboarded"))
      ) {
        // Do nothing — mixed booking allowed
      }
      // ✅ Case: only one booked → reserve the other
      else {
        if (top && middle) {
          if ((topStatus === "male-booked" || (topStatus === "boarded" && top.gender === "male") || (topStatus === "reboarded" && top.gender === "male")) && middleStatus === "available") {
            reservedGender[middle.id] = "male";
          }
          if ((topStatus === "female-booked" || (topStatus === "boarded" && top.gender === "female") || (topStatus === "reboarded" && top.gender === "female")) && middleStatus === "available") {
            reservedGender[middle.id] = "female";
          }
          if ((middleStatus === "male-booked" || (middleStatus === "boarded" && middle.gender === "male") || (middleStatus === "reboarded" && middle.gender === "male")) && topStatus === "available") {
            reservedGender[top.id] = "male";
          }
          if ((middleStatus === "female-booked" || (middleStatus === "boarded" && middle.gender === "female") || (middleStatus === "reboarded" && middle.gender === "female")) && topStatus === "available") {
            reservedGender[top.id] = "female";
          }
        }
      }
    }
  }


  // Build rows exactly as required
  const topRow: (Seat | null)[] = [];
  const middleRow: (Seat | null)[] = [];
  const bottomRow: (Seat | null)[] = [];

  for (let col = 0; col < 6; col++) {
    const base = col * 3;

    topRow.push(seatByNumber[base + 3] ?? null);    // L3, L6, L9...
    middleRow.push(seatByNumber[base + 2] ?? null); // L2, L5, L8...
    bottomRow.push(seatByNumber[base + 1] ?? null); // L1, L4, L7...
  }

  const renderRow = (row: (Seat | null)[]) => (
    <div className="flex justify-center gap-4">
      {row.map((seat, index) =>
        seat ? (
          <SeatBox
            key={seat.id}
            seat={seat}
            onSeatClick={onSeatClick}
            status={getSeatStatus(seat.id)}
            reservedFor={reservedGender[seat.id]}
            showPrice={showPrice}
            isRestStopManifest={isRestStopManifest}
          />
        ) : (
          <div key={index} className="w-16 h-7" />
        )
      )}
    </div>
  );

  return (
    <div className="p-4 bg-white rounded-lg overflow-x-auto">
      {title && <h3 className="font-bold text-center mb-4">{title}</h3>}
      <div className="flex flex-col min-w-max">
        {/* Top row */}
        {renderRow(topRow)}

        <div className="h-1" />

        {/* Middle row */}
        {renderRow(middleRow)}

        <div className="h-4" />

        {/* Bottom row */}
        {renderRow(bottomRow)}
      </div>
    </div>
  );
}


const getSeatType = (seat: Seat): string => {
    if (!seat.number) return "";
    const num = parseInt(seat.number.substring(1), 10);
    if (num % 3 === 1) return "Single";
    if (seat.row === 0) return "Window";
    if (seat.row === 1) return "Aisle";
    return "";
};

function SeatBox({ seat, isLegend, onSeatClick, status, reservedFor, showPrice, isRestStopManifest }: { seat?: Seat; isLegend?: boolean; onSeatClick?: (id: string) => void; status?: SeatStatus; reservedFor?: 'male' | 'female', showPrice?: boolean, isRestStopManifest?: boolean }) {
    if (!seat && !isLegend) return <div className="w-16 h-7" />;
    if (!seat && isLegend) {
        seat = { id: '', number: '', row: 0, col: 0, status: 'available', price: 0 };
    }
    if(!seat) return null;
  
    let currentStatus = status || seat.status;
    if(currentStatus === 'available' && reservedFor) {
      currentStatus = reservedFor;
    }
    
    const isBooked = currentStatus.includes('booked') || currentStatus === 'reboarded';
    const isBoarded = currentStatus === 'boarded';
    const isInteractive = !!onSeatClick && !isLegend;
    const canClick = isInteractive && (isRestStopManifest ? (currentStatus === 'male' || currentStatus === 'female' || currentStatus === 'reboarded') : !isBooked);
  
  return (
    <div
      onClick={() => canClick && onSeatClick!(seat!.id)}
      className={cn(
        "relative w-24 h-10 rounded-[6px] border-2 flex flex-col items-center justify-center text-[10px] font-headline transition",
        currentStatus === "available" && "bg-white border-green-600 text-gray-500",
        currentStatus === "selected" && "bg-red-600 border-red-600 text-white",
        
        // GENDER RESERVED STYLING: Outline only, no full color
        currentStatus === "male" && "bg-white border-blue-600 text-blue-600",
        currentStatus === "female" && "bg-white border-pink-600 text-pink-600",
        
        currentStatus === "male-booked" && "bg-gray-200 border-blue-500 text-gray-500",
        currentStatus === "female-booked" && "bg-gray-200 border-pink-500 text-gray-500",
        currentStatus === "boarded" && (seat.gender === 'male' ? 'bg-blue-600 border-blue-700 text-white' : seat.gender === 'female' ? 'bg-pink-600 border-pink-700 text-white' : 'bg-green-600 border-green-700 text-white'),
        currentStatus === "reboarded" && "bg-violet-400 border-violet-500 text-white", // Dim Light Violet for re-boarded

        canClick ? "cursor-pointer hover:border-red-600" : "cursor-default",
        isBooked && !isRestStopManifest && "opacity-70"
      )}
    >
      <div className="text-[9px] font-sans font-bold text-gray-400">{getSeatType(seat)}</div>
      <div
        className={cn(
          "absolute right-[3px] top-1/2 -translate-y-1/2 w-[4px] h-[70%] rounded-full",
          (currentStatus === 'male-booked' || currentStatus === 'female-booked' || currentStatus === 'boarded' || currentStatus === 'reboarded' || currentStatus === 'male' || currentStatus === 'female') && "bg-white/80",
          (currentStatus === 'available' || currentStatus === 'selected') && 'bg-gray-400'
        )}
      />
      {/* SHOW RATE INSTEAD OF SOLD FOR GENDER RESERVED SEATS */}
      {(isBooked || isBoarded) ? (
        <span className="text-[10px] font-sans">
          {isRestStopManifest ? seat.number : (currentStatus === 'boarded' ? seat.number : 'SOLD')}
        </span>
      ) : (showPrice && seat.price) ? (
        <span className="text-gray-500 text-[10px] font-headline">₹{seat.price}</span>
      ) : seat.number}
    </div>
  )
}
