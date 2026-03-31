
'use client';

import { useState, useMemo, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Frown, Copy, Sparkles, Ticket } from 'lucide-react';
import { PaymentMethods } from '@/components/payment-methods';
import ConfettiAnimation from '@/components/confetti-animation';
import { dataService } from '@/lib/data/client-service';
import { useFirebase } from '@/firebase';
import type { Bus, Point } from '@/lib/types';
import { resolvePointAny } from '@/lib/point-resolver';


function PaymentPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading } = useFirebase();

  const [bookingData, setBookingData] = useState<any>(null);
  const [bus, setBus] = useState<Bus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [couponGenerated, setCouponGenerated] = useState(false);
  const [generatedCoupon, setGeneratedCoupon] = useState<{ code: string; discount: number; percent: number } | null>(null);
  const [showCouponGenerator, setShowCouponGenerator] = useState(false);


  useEffect(() => {
    const bookingParam = sessionStorage.getItem('booking');
    if (bookingParam) {
        const data = JSON.parse(bookingParam);
        setBookingData(data);
        if (data.busId) {
            dataService.getBusById(data.busId).then(setBus);
        }
    }
  }, []);
  
  const baseFare = useMemo(() => bookingData ? bookingData.totalFare : 0, [bookingData]);
  
  const taxes = useMemo(
    () => bookingData ? baseFare * 0.05 : 0,
    [bookingData, baseFare]
  );
  
  const totalFareBeforeDiscount = useMemo(
    () => baseFare + taxes,
    [baseFare, taxes]
  );


  const finalAmount = useMemo(() => {
    if (!bookingData) return 0;
    const amount = totalFareBeforeDiscount - discount;
    return amount > 0 ? amount : 0;
  }, [totalFareBeforeDiscount, discount, bookingData]);
  
  if (!bookingData) {
    return (
        <div className="container mx-auto px-4 py-8">
            <Card className="max-w-2xl mx-auto text-center">
                <CardHeader>
                    <Frown className="w-16 h-16 mx-auto text-destructive" />
                    <CardTitle>Error: Missing Booking Information</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">We couldn't load the payment details. Please go back and try again.</p>
                </CardContent>
                <CardFooter>
                    <Button onClick={() => router.back()} className="w-full">Go Back</Button>
                </CardFooter>
            </Card>
        </div>
    );
  }

  const handleApplyPromo = () => {
    if (promoApplied) {
      setPromoCode('');
      setDiscount(0);
      setDiscountPercent(0);
      setPromoApplied(false);
      return;
    }

    const upperCasePromoCode = promoCode.toUpperCase();
    if (upperCasePromoCode === 'BUSHIVE10' || upperCasePromoCode === 'BUSPASS10') {
        const calculatedDiscount = totalFareBeforeDiscount * 0.1;
        setDiscount(calculatedDiscount);
        setDiscountPercent(10);
        setPromoApplied(true);
        setShowConfetti(true);
    } else if (generatedCoupon && upperCasePromoCode === generatedCoupon.code) {
        setDiscount(generatedCoupon.discount);
        setDiscountPercent(generatedCoupon.percent);
        setPromoApplied(true);
        setShowConfetti(true);
    }
    else {
        setDiscount(0);
        setDiscountPercent(0);
        setPromoApplied(false);
        toast({
            title: 'Invalid Promo Code',
            variant: 'destructive',
        });
    }
  };

  const handleGenerateCoupon = () => {
    const prefixes = ['SAVE', 'RIDE', 'TRIP', 'GO', 'HIVE', 'BUS'];
    const suffixes = ['GO', 'NOW', 'FLY', 'FAST', 'SALE'];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randomPercent = Math.floor(Math.random() * (15 - 5 + 1)) + 5;
    let randomCode = '';

    const formatType = Math.floor(Math.random() * 4);

    switch (formatType) {
        case 0: // Format: SAVE24XY
            const year = new Date().getFullYear().toString().slice(-2);
            let randomChars = '';
            for(let i=0; i<2; i++) randomChars += chars[Math.floor(Math.random() * chars.length)];
            randomCode = `${prefixes[Math.floor(Math.random() * prefixes.length)]}${year}${randomChars}`;
            break;
        case 1: // Format: BH7531GO
            const randomNumbers = Math.floor(1000 + Math.random() * 9000);
            randomCode = `BH${randomNumbers}${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
            break;
        case 2: // Format: RIDE482
             randomCode = `${prefixes[Math.floor(Math.random() * prefixes.length)]}${Math.floor(100 + Math.random() * 900)}`;
            break;
        case 3: // Format: TRIPGO15
        default:
            randomCode = `${prefixes[Math.floor(Math.random() * prefixes.length)]}${suffixes[Math.floor(Math.random() * suffixes.length)]}${randomPercent}`;
            break;
    }
    
    const calculatedDiscount = totalFareBeforeDiscount * (randomPercent / 100);
    
    setGeneratedCoupon({ code: randomCode, discount: calculatedDiscount, percent: randomPercent });
    setCouponGenerated(true);
    
    toast({
        title: 'Coupon Generated!',
        description: `Your ${randomPercent}% off coupon is ready. Copy and apply it!`
    })
  };

  const handleCopyCoupon = () => {
    if (generatedCoupon) {
      navigator.clipboard.writeText(generatedCoupon.code);
      setPromoCode(generatedCoupon.code);
      
      // Auto-apply the coupon
      setDiscount(generatedCoupon.discount);
      setDiscountPercent(generatedCoupon.percent);
      setPromoApplied(true);
      setShowConfetti(true);

      toast({
        title: "Coupon Applied!",
        description: "Your coupon has been copied and automatically applied.",
      });
    }
  };

  const handlePayment = async () => {
    if (!selectedPaymentMethod) {
        toast({
            title: 'Payment method not selected',
            description: 'Please select a payment method to proceed.',
            variant: 'destructive',
        });
        return;
    }
    
    if (isUserLoading || !bus) {
      toast({ title: 'Please wait', description: 'User data or bus details are loading. Please try again in a moment.' });
      return;
    }

    if (!user) {
      toast({ title: 'Authentication Error', description: 'You must be signed in to make a booking.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    let masterBookingId: string | null = null;
    
    try {
        const isReturn = bookingData.scheduleDirection === 'RETURN';
        const boardingPoints = isReturn ? bus.boardingPointsReturn : bus.boardingPointsForward;
        const droppingPoints = isReturn ? bus.droppingPointsReturn : bus.droppingPointsForward;
        
        const pickupPoint = resolvePointAny(boardingPoints, bookingData.boardingPoint);
        const dropPoint = resolvePointAny(droppingPoints, bookingData.droppingPoint);

        const bookingToCreate = {
            ...bookingData,
            userId: user.uid,
            baseFare: baseFare,
            taxes: taxes,
            discount: discount,
            totalFare: finalAmount,
            boardingPoint: pickupPoint?.name ?? bookingData.boardingPoint,
            droppingPoint: dropPoint?.name ?? bookingData.droppingPoint,
            boardingMain: pickupPoint?.main ?? bookingData.boardingPoint,
            boardingTime: pickupPoint?.time ?? bus.departureTime,
            droppingMain: dropPoint?.main ?? bookingData.droppingPoint,
            droppingTime: dropPoint?.time ?? bus.arrivalTime,
        };
        
        const createdBooking = await dataService.createPendingBooking(bookingToCreate);
        masterBookingId = createdBooking.id;

        const scheduleId = bookingData.scheduleId;
        const seatsToBook = bookingData.passengers.map((p: any) => ({
            seatNumber: p.seatNumber,
            gender: p.gender,
        }));
        
        const bookingResult = await dataService.bookSeats(scheduleId, seatsToBook, user.uid, masterBookingId);

        if (!bookingResult.success) {
            throw new Error(bookingResult.message || 'One or more seats could not be booked.');
        }
        
        await dataService.updateTicketStatus(user.uid, masterBookingId, 'CONFIRMED');
        
        sessionStorage.removeItem('booking');
        router.push(`/confirmation/${masterBookingId}`);

    } catch(e: any) {
        console.error("Booking failed:", e);
        if (masterBookingId && user) {
            await dataService.updateTicketStatus(user.uid, masterBookingId, 'FAILED');
        }
        toast({
            title: 'Booking Failed',
            description: e.message || 'Could not process your booking. Please try again.',
            variant: 'destructive',
        });
        setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-muted/40 py-12 relative">
      {showConfetti && <ConfettiAnimation onComplete={() => setShowConfetti(false)} />}
      <div className={`container mx-auto px-4 transition-filter duration-500 ${showConfetti ? 'blur-sm' : ''}`}>
            <div className="max-w-xl mx-auto space-y-8">
                <PaymentMethods onPaymentMethodSelect={setSelectedPaymentMethod} />

                <Card>
                    <CardHeader>
                    <CardTitle>Promo Code</CardTitle>
                    </CardHeader>
                    <CardContent>
                    <div className="flex gap-2">
                        <Input
                        placeholder="PROMOCODE"
                        value={promoCode}
                        onChange={(e) => {
                            setPromoCode(e.target.value);
                            if (promoApplied) {
                              setPromoApplied(false);
                              setDiscount(0);
                              setDiscountPercent(0);
                            }
                        }}
                        />
                        <Button onClick={handleApplyPromo} variant="destructive">
                            {promoApplied ? 'Applied' : 'Apply'}
                        </Button>
                    </div>
                    
                     <div className="mt-6 text-left">
                        {!showCouponGenerator ? (
                          <button onClick={() => setShowCouponGenerator(true)} className="text-sm font-medium text-link underline">
                            Create Coupon
                          </button>
                        ) : !generatedCoupon ? (
                            <Button onClick={handleGenerateCoupon} disabled={couponGenerated} className="font-headline bg-blue-600 hover:bg-blue-700">
                                <Sparkles className="mr-2 h-4 w-4"/> Generate Random Coupon
                            </Button>
                        ) : (
                            <div className="flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-lg bg-green-50 border-green-200">
                                <span className="font-mono text-lg font-bold text-green-700">{generatedCoupon.code}</span>
                                <Button size="icon" variant="ghost" onClick={handleCopyCoupon}>
                                    <Copy className="w-5 h-5 text-green-700" />
                                </Button>
                            </div>
                        )}
                    </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                    <CardTitle>{bookingData.isSeatChangeMode ? 'Seat Change Summary' : 'Fare Details'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                    {bookingData.isSeatChangeMode && bookingData.originalBooking ? (
                        <>
                        <div className="flex justify-between text-sm">
                            <span>Original Seat:</span>
                            <span className='font-medium'>{bookingData.originalBooking.passengers[0].seatNumber}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span>New Seat:</span>
                            <span className='font-medium'>{bookingData.passengers[0]?.seatNumber || '...'}</span>
                        </div>
                        </>
                    ) : (
                    <>
                    <div className="flex justify-between text-sm">
                        <span className='font-headline'>Base Fare</span>
                        <span className='font-headline'>₹{baseFare.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-red-600">
                        <span className='font-headline'>Taxes & Fees (5%)</span>
                        <span className='font-headline'>+ ₹{taxes.toFixed(2)}</span>
                    </div>
                    {promoApplied && discount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                            <span className='font-headline'>Discount ({discountPercent}%)</span>
                            <span className='font-headline'>- ₹{discount.toFixed(2)}</span>
                        </div>
                    )}
                    </>
                    )}
                
                <Separator />
                {!bookingData.isSeatChangeMode && (
                <div className="flex justify-between font-bold text-lg">
                    <span className="font-headline">Total Paid</span>
                    <span className='font-headline'>₹{finalAmount.toFixed(2)}</span>
                </div>
                )}
                </CardContent>
                <CardFooter>
                  {bookingData.isSeatChangeMode ? (
                    <Button className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? 'Confirming...' : 'Confirm Seat Change'}
                    </Button>
                  ) : (
                    <Button type="submit" className="w-full font-headline" disabled={isSubmitting || !selectedPaymentMethod} onClick={handlePayment}>
                        {isSubmitting ? 'Processing...' : `Pay ₹${finalAmount.toFixed(2)}`}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </div>
        </div>
    </div>
  );
}

export default function PaymentPage() {
    return (
        <Suspense fallback={<div>Loading payment details...</div>}>
            <PaymentPageContent />
        </Suspense>
    )
}
