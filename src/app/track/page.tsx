
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { dataService } from '@/lib/data/client-service';
import { useToast } from '@/hooks/use-toast';

export default function TrackBusPage() {
  const [trackingInput, setTrackingInput] = useState('');
  const [crewTicketInput, setCrewTicketInput] = useState('');
  const router = useRouter();
  const { toast } = useToast();

  const handleSearch = async (input: string, flow?: 'crew' | 'track') => {
    if (!input) return;

    // PNR (6 digits)
    if (/^\d{6}$/.test(input)) {
        const booking = await dataService.getBookingByPnr(input);
        if (booking) {
            router.push(`/confirmation/${booking.id}`);
        } else {
            toast({ title: "Not Found", description: "No booking found for that PNR.", variant: "destructive" });
        }
    } 
    // Phone Number (10 digits)
    else if (/^\d{10}$/.test(input)) {
        const flowQuery = flow ? `&flow=${flow}` : '';
        router.push(`/tickets?phone=${input}${flowQuery}`);
    } 
    // Booking ID (default fallback for manual IDs)
    else {
        router.push(`/confirmation/${input}`);
    }
  };

  const handleTrack = () => {
    handleSearch(trackingInput.trim());
  };
  
  const handleCrewTicketTrack = () => {
    handleSearch(crewTicketInput.trim(), 'crew');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Find Your Bus</CardTitle>
            <CardDescription>Enter your Booking ID, PNR, or Phone Number to find your upcoming tickets.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div className="flex-grow">
                  <label htmlFor="booking-id" className="sr-only">Booking ID, PNR, or Phone Number</label>
                  <Input 
                    id="booking-id" 
                    placeholder="Enter PNR or Phone (e.g. 9876543210)"
                    value={trackingInput}
                    onChange={(e) => setTrackingInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
                  />
              </div>
              <Button onClick={handleTrack}>Find</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Find Crew Generated Ticket</CardTitle>
            <CardDescription>Enter the Booking ID, PNR, or Phone Number for a ticket manually created by a crew member.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div className="flex-grow">
                  <label htmlFor="crew-booking-id" className="sr-only">Crew Generated Booking ID, PNR, or Phone</label>
                  <Input 
                    id="crew-booking-id" 
                    placeholder="Enter PNR or Phone"
                    value={crewTicketInput}
                    onChange={(e) => setCrewTicketInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCrewTicketTrack()}
                  />
              </div>
              <Button onClick={handleCrewTicketTrack}>Find Ticket</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
