
'use client';

import React, { useEffect, useState, Suspense, useRef, use } from 'react';
import Link from 'next/link';
import { Frown, Download, Home } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { dataService } from '@/lib/data/client-service';
import type { Booking, Schedule, Bus, Service, Point } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TicketCard } from '@/components/ticket-card';
import { useFirebase } from '@/firebase';
import { resolvePointAny } from '@/lib/point-resolver';
import { getScheduledDateTime } from '@/lib/utils';

function ConfirmationPageContent({ id, from }: { id: string, from: string | undefined}) {
  const fromAdmin = from === 'admin';
  const { user, isUserLoading } = useFirebase();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [bus, setBus] = useState<Bus | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBookingDetails() {
      if (isUserLoading || !id) return;
      
      setLoading(true);
      try {
        const fetchedBooking = await dataService.getPublicBookingById(id);

        if (fetchedBooking) {
          setBooking(fetchedBooking);
          const [scheduleData, busData] = await Promise.all([
            dataService.getSchedule(fetchedBooking.scheduleId),
            dataService.getBusById(fetchedBooking.busId)
          ]);

          if (scheduleData && busData) {
            setSchedule(scheduleData);
            setBus(busData);

            if (scheduleData.serviceId) {
              const serviceData = await dataService.getServiceById(scheduleData.serviceId);
              setService(serviceData);
            }
          } else {
             setError('Could not retrieve full trip details.');
          }
        } else {
          setError('The requested booking could not be found. Please check the details and try again.');
        }
      } catch (e: any) {
        console.error(e);
        setError(`An error occurred while fetching your booking: ${e.message}`);
      } finally {
        setLoading(false);
      }
    }

    fetchBookingDetails();
  }, [id, isUserLoading]);

  const handleDownload = async () => {
    const ticketElement = document.getElementById('ticket-to-print');
    if (!ticketElement || !booking) return;

    const canvas = await html2canvas(ticketElement, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const ratio = imgWidth / imgHeight;

    let finalWidth = pdfWidth - 20; // with margin
    let finalHeight = finalWidth / ratio;
    
    if (finalHeight > pdfHeight - 20) {
        finalHeight = pdfHeight - 20;
        finalWidth = finalHeight * ratio;
    }
    
    const x = (pdfWidth - finalWidth) / 2;
    const y = 10; // Margin from top

    pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
    pdf.save(`BharatBus-Ticket-${booking.id}.pdf`);
  };


  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="text-center p-6">
              <Skeleton className="h-8 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto mt-2" />
            </div>
            <div className="p-6 space-y-6">
              <div className="text-center py-4">
                <Skeleton className="h-16 w-16 rounded-full mx-auto" />
                <Skeleton className="h-4 w-3/4 mx-auto mt-4" />
              </div>
              <Skeleton className="h-40 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
            <div className="text-center p-4 bg-muted/50">
              <Skeleton className="h-4 w-1/2 mx-auto" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <Frown className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!booking || !bus || !schedule || !service) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <Frown className="h-4 w-4" />
          <AlertTitle>Incomplete Booking Data</AlertTitle>
          <AlertDescription>
            Could not load all necessary details for this booking. Some information might be missing.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen py-12 flex justify-center items-center">
      <div className="w-full max-w-4xl px-4">
        <div id="ticket-to-print">
            <TicketCard 
                booking={booking} 
                bus={bus} 
                schedule={schedule}
                service={service}
                fromAdmin={fromAdmin}
            />
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button asChild className="w-full">
            <Link href={fromAdmin ? "/admin/bookings" : (from === 'tickets' ? "/tickets" : "/")}>
              <Home className="mr-2"/>
              {fromAdmin ? "Back to Admin" : (from === 'tickets' ? 'Back to My Bookings' : 'Back to Home')}
            </Link>
          </Button>
          <Button onClick={handleDownload} variant="outline" className="w-full">
            <Download className="mr-2"/>
            Download Ticket
          </Button>
        </div>
    </div>
    </div>
  );
}

export default function ConfirmationPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ from?: string }> }) {
  const resolvedParams = use(params);
  const resolvedSearchParams = use(searchParams);

  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          Loading booking details...
        </div>
      }
    >
      <ConfirmationPageContent id={resolvedParams.id} from={resolvedSearchParams.from} />
    </Suspense>
  );
}

    