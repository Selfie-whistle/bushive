
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

type SeatStatus = "available" | "male" | "female" | "sold" | "selected" | "male-booked" | "female-booked";
type FareSection = "lowerDouble" | "lowerSingle" | "upperDouble" | "upperSingle";

function Section({ title, berth, type, value, onChange, onApply }: { title: string, berth: 'lower' | 'upper', type: 'single' | 'double', value: number | '', onChange: (value: string) => void, onApply: () => void }) {
    return (
      <div className="p-4 border rounded-lg">
        <h4 className="font-semibold text-center mb-2">{title}</h4>
        <div className="flex gap-2 items-center">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-24 h-8"
            placeholder="Fare"
            type="number"
          />
          <Button size="sm" onClick={onApply}>Set</Button>
        </div>
      </div>
    );
}

function IndianSleeper36Layout({
  schedule,
  bus,
  onSeatSelection,
  gender,
  berth,
  preSelectedSeats = [],
}: {
  schedule: Schedule | null;
  bus: Bus | null;
  onSeatSelection?: (seats: Seat[]) => void;
  gender?: string;
  berth: 'lower' | 'upper';
  preSelectedSeats?: string[];
}) {
    const { toast } = useToast();
    const [selectedSeats, setSelectedSeats] = useState<string[]>(preSelectedSeats);

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

            seat.status =
                booking.gender === "male" ? "male-booked" : "female-booked";
        });

        return seatData;
    }, [bus, schedule?.seatPrices, schedule?.bookings]);
    
    const visibleSeats = useMemo(
        () => Object.values(allSeats).filter(seat => seat.deck === berth),
        [allSeats, berth]
    );

    const getSeatStatus = useCallback((seatId: string): SeatStatus => {
        if (selectedSeats.includes(seatId)) return "selected";
        const seat = allSeats[seatId];
        return seat ? (seat.status as SeatStatus) : 'available';
    }, [allSeats, selectedSeats]);

    const handleSeatClick = (seatId: string) => {
        if (onSeatSelection) { // Only allow selection on booking page
            const seat = allSeats[seatId];
            if (!seat) return;
            
            const currentStatus = getSeatStatus(seatId);
            if (currentStatus.includes('booked')) return;

            if (gender) {
                const bookings = schedule?.bookings || [];
                if (!canSelectSeat(seatId, gender as any, bookings, selectedSeats)) {
                    toast({
                        variant: 'destructive',
                        title: 'Adjacent Seat Restriction',
                        description: 'This seat is adjacent to a seat booked by a different gender.',
                    });
                    return;
                }
            }
            
            const updatedSelected = selectedSeats.includes(seatId)
                ? selectedSeats.filter(s => s !== seatId)
                : [...selectedSeats, seatId];
                
            if (updatedSelected.length > 6) {
                toast({
                    title: "Selection Limit",
                    description: "You can select a maximum of 6 seats.",
                    variant: "destructive"
                });
                return;
            }

            setSelectedSeats(updatedSelected);
            
            const selectedSeatObjects = updatedSelected.map(id => {
              const baseSeat = allSeats[id];
              return { ...baseSeat, price: baseSeat.price };
            }).filter(Boolean) as Seat[];
            onSeatSelection(selectedSeatObjects);
        }
    };

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
                onSeatClick={handleSeatClick}
                getSeatStatus={getSeatStatus}
                title={berth === 'lower' ? 'Lower Berth' : 'Upper Berth'}
            />
        </div>
    </div>
  )
}

function Berth({
  seats,
  onSeatClick,
  getSeatStatus,
  title,
}: {
  seats: Seat[];
  onSeatClick: (id: string) => void;
  getSeatStatus: (id: string) => SeatStatus;
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
      bookings.includes("male-booked") &&
      bookings.includes("female-booked")
    ) {
      // Do nothing — mixed booking allowed
    }
    // ✅ Case: only one booked → reserve the other
    else {
      if (top && middle) {
        if (topStatus === "male-booked" && middleStatus === "available") {
          reservedGender[middle.id] = "male";
        }
        if (topStatus === "female-booked" && middleStatus === "available") {
          reservedGender[middle.id] = "female";
        }
        if (middleStatus === "male-booked" && topStatus === "available") {
          reservedGender[top.id] = "male";
        }
        if (middleStatus === "female-booked" && topStatus === "available") {
          reservedGender[top.id] = "female";
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
  

function SeatBox({ seat, isLegend, onSeatClick, status, reservedFor }: { seat?: Seat; isLegend?: boolean; onSeatClick?: (id: string) => void; status?: SeatStatus; reservedFor?: 'male' | 'female' }) {
    if (!seat && !isLegend) return <div className="w-16 h-7" />;
    if (!seat && isLegend) {
        seat = { id: '', number: '', row: 0, col: 0, status: 'available', price: 0 };
    }
    if(!seat) return null;
  
  let currentStatus = status || seat.status;
  if(currentStatus === 'available' && reservedFor) {
    currentStatus = reservedFor;
  }
  const isBooked = currentStatus.includes('booked');
  
  return (
    <div
      onClick={() => !isBooked && onSeatClick && onSeatClick(seat.id)}
      className={cn(
        "relative w-24 h-10 rounded-[6px] border-2 flex flex-col items-center justify-center text-[10px] font-headline transition",
        currentStatus === "available" && "bg-white border-green-600 text-gray-500",
        currentStatus === "selected" && "bg-red-600 border-red-600 text-white",
        currentStatus === "male" && "bg-white border-blue-500 text-gray-500",
        currentStatus === "female" && "bg-white border-pink-500 text-gray-500",
        currentStatus === "male-booked" && "bg-gray-200 border-blue-500 text-gray-500",
        currentStatus === "female-booked" && "bg-gray-200 border-pink-500 text-gray-500",
        isLegend ? "cursor-default" : !isBooked && "cursor-pointer hover:border-red-600",
        isBooked && "cursor-not-allowed opacity-70"
      )}
    >
      <div className="text-[9px] font-sans font-bold text-gray-400">{getSeatType(seat)}</div>
      <div
        className={cn(
          "absolute right-[3px] top-1/2 -translate-y-1/2 w-[4px] h-[70%] rounded-full",
          (currentStatus === "male" || currentStatus === 'male-booked') && "bg-blue-400",
          (currentStatus === "female" || currentStatus === 'female-booked') && "bg-pink-400",
          (currentStatus === "available" || currentStatus === "selected") && "bg-gray-400"
        )}
      />
      {isBooked ? (
         <span className="text-gray-500 text-[10px] font-sans">SOLD</span>
      ) : seat.price && currentStatus === 'available' ? (
        <span className="text-gray-500 text-[10px] font-headline">₹{seat.price}</span>
      ) : seat.number}
    </div>
  )
}

export function FareScheduler({
    bus,
    schedule,
    onFareChange,
  }: {
    bus: Bus;
    schedule: Schedule;
    onFareChange: (overrides: { [key: string]: number }) => void;
  }) {
    const { toast } = useToast();
    const [fares, setFares] = useState<{
        lowerDouble: number | '';
        lowerSingle: number | '';
        upperDouble: number | '';
        upperSingle: number | '';
    }>({
        lowerDouble: '',
        lowerSingle: '',
        upperDouble: '',
        upperSingle: ''
    });

    useEffect(() => {
      // Initialize fares from schedule or bus base fare
      if (schedule && bus) {
        const getInitialFare = (deck: 'lower' | 'upper', type: 'single' | 'double') => {
          const seat = bus.seatLayout.seats.find(s => s.deck === deck && (s.number.endsWith('1') || s.number.endsWith('4')) === (type === 'single'));
          if (!seat) return bus.baseFare;
          return schedule.seatPrices?.[seat.number] ?? bus.baseFare;
        }

        setFares({
          lowerDouble: getInitialFare('lower', 'double'),
          lowerSingle: getInitialFare('lower', 'single'),
          upperDouble: getInitialFare('upper', 'double'),
          upperSingle: getInitialFare('upper', 'single')
        })
      }
    }, [schedule, bus]);
  
    const update = (sectionKey: FareSection, value: string) => {
      setFares(prev => ({ ...prev, [sectionKey]: value === '' ? '' : parseFloat(value) }));
    };

    const applyFares = (section: FareSection) => {
        const newOverrides: {[key: string]: number} = {};
        const sectionFare = fares[section];

        if (typeof sectionFare !== 'number' || sectionFare <= 0) { // Should not be 0 or less
            toast({
                title: "Invalid Fare",
                description: "Please enter a valid fare greater than 0.",
                variant: "destructive"
            });
            return;
        };

        const isUpper = section.startsWith('upper');
        const isSingle = section.endsWith('Single');
        
        const seatsToUpdate = (bus.seatLayout?.seats || []).filter(s => {
            const seatDeck = s.deck;
            const seatNum = parseInt(s.number.substring(1));
            const seatIsSingle = seatNum % 3 === 1;

            return seatDeck === (isUpper ? 'upper' : 'lower') && seatIsSingle === isSingle;
        });

        seatsToUpdate.forEach(s => {
            newOverrides[s.number] = sectionFare;
        });
        
        onFareChange(newOverrides);
        toast({
            title: "Fares Staged",
            description: `Set fare for ${seatsToUpdate.length} seats to ₹${sectionFare}. Click 'Save Fares' to confirm.`,
        });
    }
  
    return (
      <div className="space-y-6">
        <div>
            <h3 className="font-bold text-center mb-2">Lower Berth</h3>
            <div className="flex justify-center gap-4">
                <Section 
                    title="Single Seats" 
                    berth="lower" 
                    type="single" 
                    value={fares.lowerSingle} 
                    onChange={(val) => update('lowerSingle', val)}
                    onApply={() => applyFares('lowerSingle')}
                />
                <Section 
                    title="Double Seats" 
                    berth="lower" 
                    type="double" 
                    value={fares.lowerDouble} 
                    onChange={(val) => update('lowerDouble', val)}
                    onApply={() => applyFares('lowerDouble')}
                />
            </div>
        </div>
        <div>
            <h3 className="font-bold text-center mb-2">Upper Berth</h3>
            <div className="flex justify-center gap-4">
                <Section 
                    title="Single Seats" 
                    berth="upper" 
                    type="single" 
                    value={fares.upperSingle} 
                    onChange={(val) => update('upperSingle', val)}
                    onApply={() => applyFares('upperSingle')}
                />
                <Section 
                    title="Double Seats" 
                    berth="upper" 
                    type="double" 
                    value={fares.upperDouble} 
                    onChange={(val) => update('upperDouble', val)}
                    onApply={() => applyFares('upperDouble')}
                />
            </div>
        </div>
        <div className="w-full">
            <IndianSleeper36Layout bus={bus} schedule={schedule} berth="lower" />
            <div className="my-4" />
            <IndianSleeper36Layout bus={bus} schedule={schedule} berth="upper" />
        </div>
        <div className="mt-3 pt-3 border-t w-full flex justify-center">
            <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-[11px] max-w-md">
                <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'available', price: 0 }}
                    isLegend
                />
                <span>Available</span>
                </div>

                 <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'female', price: 0 }}
                    isLegend
                />
                <span>Only Female</span>
                </div>

                <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'male', price: 0 }}
                    isLegend
                />
                <span>Only Male</span>
                </div>

                <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'female-booked', price: 0 }}
                    isLegend
                />
                <span>Booked (Female)</span>
                </div>

                <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'male-booked', price: 0 }}
                    isLegend
                />
                <span>Booked (Male)</span>
                </div>

                <div className="flex items-center gap-2">
                <SeatBox
                    seat={{ id: '', number: '', row: 0, col: 0, status: 'selected', price: 0 }}
                    isLegend
                />
                <span>Selected</span>
                </div>
            </div>
        </div>
      </div>
    );
  }
