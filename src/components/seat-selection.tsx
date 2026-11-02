
'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Bus, Seat } from '@/lib/types';
import { cn } from '@/lib/utils';
import { canSelectSeat } from '@/lib/utils';
import { SteeringWheelIcon } from './icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from '@/hooks/use-toast';
import { useSchedule } from '@/hooks/use-schedule';
import { dataService } from '@/lib/data/client-service';


interface SeatSelectionProps {
  bus: Bus;
  onSeatSelection: (seats: Seat[]) => void;
  gender: 'male' | 'female' | 'other' | undefined;
  date: string;
}

const seatColor = (status: string) => {
    if (status === "male") return "bg-blue-700 text-white";
    if (status === "female") return "bg-pink-700 text-white";
    if (status === "sold") return "bg-gray-200 text-gray-500 border-gray-400";
    if (status === "selected") return "bg-red-600 text-white border-red-800";
    return "bg-white text-black border-gray-400";
};

const SeatComponent = ({ seat, onClick, status }: { seat: Seat, onClick: (seat: string) => void, status: string }) => {
    const isBooked = status === 'male' || status === 'female' || status === 'sold';
  
    return (
      <div
        onClick={() => !isBooked && onClick(seat.number)}
        className={cn(
          'w-12 h-12 border-2 rounded-md flex items-center justify-center text-sm font-medium',
          !isBooked ? 'cursor-pointer hover:scale-105 transition-transform' : 'cursor-not-allowed',
          seatColor(status)
        )}
        title={`Seat ${seat.number}`}
      >
        {seat.number}
      </div>
    );
};
  
const Deck = ({ deckName, layout, onSeatClick, getSeatStatus }: { deckName?: string, layout: Seat[][], onSeatClick: (seat: string) => void, getSeatStatus: (seat: Seat) => string }) => (
    <div className="p-4 border rounded-lg bg-white relative overflow-x-auto">
        {deckName === 'lower' && (
          <div className="absolute top-1/2 -translate-y-1/2 left-4 transform -rotate-90 origin-center">
            <SteeringWheelIcon className="w-8 h-8 text-gray-400" />
        </div>
        )}
        {deckName && (
          <div className="absolute top-1/2 -translate-y-1/2 left-2 font-semibold text-muted-foreground" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{deckName.charAt(0).toUpperCase() + deckName.slice(1)}</div>
        )}
        <div className="flex flex-col items-center pl-8">
            {layout.map((row, rowIndex) => (
                <div key={rowIndex} className="flex justify-center gap-3 my-2">
                {row.map((seat, seatIndex) => {
                    if (!seat.number) {
                        return <div key={`empty-${rowIndex}-${seatIndex}`} className="w-12 h-12" />;
                    }
                    const status = getSeatStatus(seat);

                    return (
                        <SeatComponent
                            key={seat.id || `seat-${seatIndex}`}
                            seat={seat}
                            onClick={onSeatClick}
                            status={status}
                        />
                    );
                })}
                </div>
            ))}
        </div>
    </div>
);


export function SeatSelection({ bus, onSeatSelection, gender, date }: SeatSelectionProps) {
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const { toast } = useToast();

  const scheduleId = useMemo(() => {
    if (!date || !bus.busNumber) return undefined;
    return `${date}_${bus.busNumber.replace(/\s/g, '')}`;
  }, [date, bus.busNumber]);

  const { schedule } = useSchedule(scheduleId);
  const bookings = useMemo(() => schedule?.bookings || [], [schedule]);

  const getSeatStatus = useCallback((seat: Seat): string => {
    if (selectedSeats.includes(seat.number)) return "selected";
    
    const booking = bookings.find((b: any) => b.seat === seat.number);
    if (booking) {
      if (booking.blocked || booking.gender === 'other' || !booking.gender) return "sold";
      return booking.gender;
    }

    return "available";
  }, [bookings, selectedSeats]);

  const toggleSeat = useCallback((seatNumber: string) => {
    const seat = (bus.seatLayout?.seats || []).find(s => s.number === seatNumber);
    if (!seat) return;
    const status = getSeatStatus(seat);
    if (status === "male" || status === "female" || status === "sold") return; // cannot select booked

    // If a gender is not yet selected for the first passenger, don't enforce rules
    if (gender) {
      if (!canSelectSeat(seatNumber, gender, bookings, selectedSeats)) {
        toast({
            variant: 'destructive',
            title: 'Adjacent Seat Restriction',
            description: 'This seat is adjacent to a seat booked by a different gender.',
        });
        return;
      }
    }
    
    let updated: string[];
    if (selectedSeats.includes(seatNumber)) {
      updated = selectedSeats.filter(s => s !== seatNumber);
    } else {
      if (selectedSeats.length >= 6) {
          toast({
              variant: "destructive",
              title: "Selection Limit Reached",
              description: "You can select a maximum of 6 seats.",
          });
          return;
      }
      updated = [...selectedSeats, seatNumber];
    }
    
    setSelectedSeats(updated);

    const allSeats = bus.seatLayout.seats || [];
    const selectedSeatObjects = updated.map(num => allSeats.find(s => s.number === num)).filter(Boolean) as Seat[];
    onSeatSelection(selectedSeatObjects);

  }, [selectedSeats, onSeatSelection, toast, gender, bookings, getSeatStatus, bus.seatLayout]);

  const layout: Seat[][] = useMemo(() => {
    const newLayout: Seat[][] = [];
    if (!bus.seatLayout || !bus.seatLayout.seats) return [];
  
    const sortedSeats = [...bus.seatLayout.seats].sort((a, b) => {
      if (a.row !== b.row) {
        return a.row - b.row;
      }
      return a.col - b.col;
    });
  
    let currentRow: Seat[] = [];
    let lastRow = -1;
  
    sortedSeats.forEach(seat => {
      if (seat.row !== lastRow && lastRow !== -1) {
        newLayout.push(currentRow);
        currentRow = [];
      }
      currentRow.push(seat);
      lastRow = seat.row;
    });
  
    if (currentRow.length > 0) {
      newLayout.push(currentRow);
    }
  
    return newLayout;
  }, [bus.seatLayout]);
  
  if (!scheduleId) {
    return <div className="p-10 text-center text-muted-foreground">Initializing...</div>;
  }

  return (
    <div className="flex flex-col items-center gap-6">
       <div className="w-full">
            <Deck layout={layout} onSeatClick={toggleSeat} getSeatStatus={getSeatStatus} />
        </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <div className={`flex items-center gap-2 border px-2 py-1 rounded-md ${seatColor('available')}`}>Available</div>
            <div className={`flex items-center gap-2 border px-2 py-1 rounded-md ${seatColor('male')}`}>Male</div>
            <div className={`flex items-center gap-2 border px-2 py-1 rounded-md ${seatColor('female')}`}>Female</div>
            <div className={`flex items-center gap-2 border px-2 py-1 rounded-md ${seatColor('selected')}`}>Selected</div>
      </div>
    </div>
  );
}
