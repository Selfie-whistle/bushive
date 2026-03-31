

'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Info, Ticket, ArrowLeft, Copy } from 'lucide-react';

import { dataService } from '@/lib/data/client-service';
import type { Booking } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Frown } from 'lucide-react';

function ConfirmationPageContent({ id }: { id: string }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    async function fetchBooking() {
      if (!id) return;
      setLoading(true);
      try {
        const bookingData = await dataService.getPublicBookingById(id);
        if (bookingData) {
          setBooking(bookingData);
        } else {
          setError('The requested booking could not be found.');
        }
      } catch (e: any) {
        setError(`An error occurred: ${e.message}`);
      } finally {
        setLoading(false);
      }
    }

    fetchBooking();
  }, [id]);

  const handleCopyBookingId = () => {
    if (booking) {
      navigator.clipboard.writeText(booking.id);
      toast({
        title: "Copied!",
        description: "Booking ID copied to clipboard.",
      });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Alert variant="destructive">
          <Frown className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error || 'Booking not found.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card className="shadow-lg">
            <CardHeader className="text-center bg-green-50 rounded-t-lg p-6">
                <CheckCircle className="w-16 h-16 mx-auto text-green-600" />
                <CardTitle className="text-2xl mt-4">Manual Ticket Generated</CardTitle>
                <CardDescription>A record has been created for the passenger.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
                <Alert variant="destructive" className="bg-yellow-50 border-yellow-200 text-yellow-800">
                    <Info className="h-4 w-4 !text-yellow-800" />
                    <AlertTitle className="font-semibold">For App Use Only</AlertTitle>
                    <AlertDescription>
                        This digital record is for accessing in-app features like live tracking and is **not a valid ticket for travel**. The passenger must present their original ticket.
                    </AlertDescription>
                </Alert>

                <Separator className="my-6" />

                <div className="space-y-4 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Booking ID</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono">{booking.id}</span>
                          <Button variant="ghost" size="icon" onClick={handleCopyBookingId} className="h-6 w-6">
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">PNR</span>
                        <span className="font-medium font-mono">{booking.pnr}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Passenger</span>
                        <span className="font-medium">{booking.passengers[0].name}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">Seat</span>
                        <span className="font-medium">{booking.passengers[0].seatNumber}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Contact</span>
                        <span className="font-medium">{booking.contact.phone}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Bus</span>
                        <span className="font-medium">{booking.busDetails.name}</span>
                    </div>
                </div>

                <Button onClick={() => router.push('/cabin-crew/generate-tickets')} className="w-full mt-8">
                    Generate Another Ticket
                </Button>
                <Button variant="outline" onClick={() => router.push('/cabin-crew')} className="w-full mt-2">
                    <ArrowLeft className="mr-2 h-4 w-4"/>
                    Back to Console
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}


export default function CrewConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  return <ConfirmationPageContent id={resolvedParams.id} />;
}
