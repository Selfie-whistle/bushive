
'use client';

import { Suspense, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Home,
  Bus,
  MapPin,
  Clock,
  Star,
  Ticket,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { dataService } from '@/lib/data/client-service';
import type { Booking } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

function TripFinishedContent() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('bookingId');

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [busRating, setBusRating] = useState(0);
  const [appRating, setAppRating] = useState(0);
  const [busFeedback, setBusFeedback] = useState('');
  const [appFeedback, setAppFeedback] = useState('');

  useEffect(() => {
    async function fetchBooking() {
      if (!bookingId) {
        setLoading(false);
        return;
      }
      const bookingData = await dataService.getPublicBookingById(bookingId);
      setBooking(bookingData);
      setLoading(false);
    }
    fetchBooking();
  }, [bookingId]);

  const handleSubmitFeedback = async () => {
    if (busRating === 0) {
      toast({
        title: "Please rate the bus",
        description: "Your rating helps us improve our service.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await dataService.addReview({
        bookingId: bookingId || 'unknown',
        busId: booking?.busId || 'unknown',
        busRating,
        appRating,
        busFeedback,
        appFeedback,
        passengerName: booking?.passengers[0]?.name || 'Traveler',
        timestamp: new Date().toISOString(), // Explicitly set timestamp here too
      });

      setSubmitted(true);
      toast({
        title: "Feedback Submitted",
        description: "Thank you for sharing your experience with us!",
      });
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "Could not save your feedback. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Skeleton className="h-[600px] w-full max-w-md rounded-3xl" />
      </div>
    );
  }

  const boardedTime = booking?.boardedAt
    ? format(new Date(booking.boardedAt), 'hh:mm a')
    : '--:--';

  const droppedTime = booking?.deboardedAt
    ? format(new Date(booking.deboardedAt), 'hh:mm a')
    : '--:--';
    
  const seatNumber = booking?.passengers.map(p => p.seatNumber).join(', ');

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-4 py-10 flex justify-center">
      <Card className="w-full max-w-md overflow-hidden rounded-3xl shadow-2xl border-0">

        {/* 🎉 HERO */}
        <div className="bg-gradient-to-r from-emerald-600 to-green-500 text-white px-6 md:px-10 py-12 text-center">
          <CheckCircle2 className="w-20 h-20 mx-auto mb-4 drop-shadow" />
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Journey Completed</h1>
          <p className="text-white/90 text-md md:text-lg">
            You’ve arrived safely at your destination
          </p>
        </div>

        {/* 🎫 TRIP TICKET */}
        {booking && (
          <div className="px-6 md:px-10 py-6 bg-white">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600">
                <Ticket className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-lg md:text-xl font-semibold">
                  {booking.busDetails.name}
                </p>
                <p className="text-muted-foreground text-sm">
                  Operated by {booking.busDetails.operator}
                </p>
                <p className="text-sm text-muted-foreground">
                  Trip ID: <span className="font-medium">{booking.id}</span>
                </p>
                {seatNumber && (
                  <p className="text-sm text-muted-foreground">
                    Seat: <span className="font-medium">{seatNumber}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 🛣️ JOURNEY DETAILS */}
        <div className="px-6 md:px-10 py-6 bg-muted/40">
          <p className="font-semibold text-md mb-4">Your Journey</p>

          <div className="relative pl-6 space-y-8">
            <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-emerald-200" />

            <div className="flex gap-4">
              <div className="w-4 h-4 rounded-full bg-emerald-500 mt-1" />
              <div>
                <p className="font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  {booking?.boardingPoint}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Boarded at {boardedTime}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-4 h-4 rounded-full bg-green-600 mt-1" />
              <div>
                <p className="font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-green-600" />
                  {booking?.droppingPoint}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Dropped at {droppedTime}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ⭐ FEEDBACK */}
        <div className="px-6 md:px-10 py-8 bg-white space-y-8">
          {submitted ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">Thank you!</h3>
              <p className="text-muted-foreground">Your feedback has been received.</p>
            </div>
          ) : (
            <>
              <div>
                <p className="font-semibold text-md mb-2">
                  Rate your bus & journey
                </p>
                <div className="flex gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => setBusRating(s)}>
                      <Star
                        className={`w-7 h-7 ${
                          busRating >= s
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-muted-foreground'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <Textarea
                  placeholder="Feedback about the bus or journey (optional)"
                  value={busFeedback}
                  onChange={(e) => setBusFeedback(e.target.value)}
                />
              </div>

              <div>
                <p className="font-semibold text-md mb-2">
                  Rate your app experience
                </p>
                <div className="flex gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => setAppRating(s)}>
                      <Star
                        className={`w-7 h-7 ${
                          appRating >= s
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-muted-foreground'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <Textarea
                  placeholder="Feedback about the app (optional)"
                  value={appFeedback}
                  onChange={(e) => setAppFeedback(e.target.value)}
                />
              </div>

              <Button 
                onClick={handleSubmitFeedback} 
                disabled={isSubmitting || busRating === 0} 
                className="w-full h-11 bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </Button>
            </>
          )}
        </div>

        {/* 🙏 THANK YOU */}
        <div className="px-6 md:px-10 py-8 bg-muted/30 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            💚 Thank you for choosing{' '}
            <span className="font-medium">{booking?.busDetails.operator}</span>.  
            We hope you had a comfortable journey.
          </p>
          <p className="text-sm text-muted-foreground">
            🚍 Thank you for using our app.  
            Wishing you a wonderful day ahead!
          </p>
        </div>

        {/* 🏠 CTA */}
        <div className="px-6 md:px-10 py-6 bg-white border-t">
          <Button asChild className="w-full h-11 text-base">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go to Homepage
            </Link>
          </Button>
        </div>

      </Card>
    </div>
  );
}

export default function TripFinishedPage() {
  return (
    <Suspense fallback={null}>
      <TripFinishedContent />
    </Suspense>
  );
}
