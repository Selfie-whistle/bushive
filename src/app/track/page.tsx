
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { dataService } from '@/lib/data/client-service';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { Search, Navigation, Ticket } from 'lucide-react';

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
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-sky-50 -z-20" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-60 mix-blend-multiply z-0">
          <motion.div 
              animate={{ rotate: 360, scale: [1, 1.2, 1], x: [0, 50, -30, 0], y: [0, 40, -40, 0] }} 
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-300/40 blur-[100px]"
          />
          <motion.div 
              animate={{ rotate: -360, scale: [1, 1.3, 1], x: [0, -40, 50, 0], y: [0, -50, 60, 0] }} 
              transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
              className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-sky-300/30 blur-[100px]"
          />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
        >
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-3">Track Your Journey</h1>
            <p className="text-lg text-gray-500 font-medium">Enter your details below to get live updates on your bus</p>
        </motion.div>

        <div className="max-w-2xl mx-auto space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-white/80 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-3xl overflow-hidden ring-1 ring-black/5">
              <CardHeader className="border-b border-gray-100/50 bg-gray-50/30 pb-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                        <Navigation className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-2xl font-black text-gray-800">Find Your Bus</CardTitle>
                </div>
                <CardDescription className="text-sm font-medium text-gray-500 ml-13">Enter your Booking ID, PNR, or Phone Number to find your upcoming tickets.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <div className="flex-grow relative">
                      <label htmlFor="booking-id" className="sr-only">Booking ID, PNR, or Phone Number</label>
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Search className="h-5 w-5 text-gray-400" />
                      </div>
                      <Input 
                        id="booking-id" 
                        placeholder="e.g. 9876543210 or PNR"
                        value={trackingInput}
                        onChange={(e) => setTrackingInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
                        className="h-14 pl-12 bg-white/50 border-gray-200 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 rounded-xl text-base shadow-sm"
                      />
                  </div>
                  <Button onClick={handleTrack} className="h-14 px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-105 active:scale-95 text-base">
                      Find
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-white/80 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-3xl overflow-hidden ring-1 ring-black/5 opacity-90 hover:opacity-100 transition-opacity">
              <CardHeader className="border-b border-gray-100/50 bg-gray-50/30 pb-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                        <Ticket className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-xl font-bold text-gray-800">Crew Generated Ticket</CardTitle>
                </div>
                <CardDescription className="text-sm font-medium text-gray-500 ml-13">Looking for a ticket manually created by a cabin crew member?</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <div className="flex-grow relative">
                      <label htmlFor="crew-booking-id" className="sr-only">Crew Generated Booking ID, PNR, or Phone</label>
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Search className="h-5 w-5 text-gray-400" />
                      </div>
                      <Input 
                        id="crew-booking-id" 
                        placeholder="Enter PNR or Phone"
                        value={crewTicketInput}
                        onChange={(e) => setCrewTicketInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCrewTicketTrack()}
                        className="h-14 pl-12 bg-white/50 border-gray-200 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-xl text-base shadow-sm"
                      />
                  </div>
                  <Button variant="secondary" onClick={handleCrewTicketTrack} className="h-14 px-8 font-bold rounded-xl shadow-sm transition-all hover:scale-105 active:scale-95 text-base border-2 border-transparent hover:border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
                      Find Ticket
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
