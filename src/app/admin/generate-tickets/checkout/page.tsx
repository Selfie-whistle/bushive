'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import { ArrowLeft, Receipt, CheckCircle, Percent, Download, Plus } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export default function AdminCheckoutPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading } = useFirebase();

  const [bookingData, setBookingData] = useState<any>(null);
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmedBookingId, setConfirmedBookingId] = useState<string>('');

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_pending_booking');
    if (stored) {
      try {
        setBookingData(JSON.parse(stored));
      } catch (e) {
        toast({ title: 'Error', description: 'Failed to parse booking data.', variant: 'destructive' });
        router.push('/admin/generate-tickets');
      }
    } else {
      router.push('/admin/generate-tickets');
    }
  }, [router, toast]);

  if (!bookingData) {
    return <div className="p-8 text-center text-muted-foreground">Loading checkout...</div>;
  }

  // Mathematics
  const baseFare = bookingData.totalFare || 0; // Total sum of seat prices
  const taxAmount = baseFare * 0.05; // 5% GST
  const grossTotal = baseFare + taxAmount;
  const discountAmount = grossTotal * (discountPercentage / 100);
  const finalTotal = grossTotal - discountAmount;

  const handleBook = async () => {
    if (!user) return;
    setIsProcessing(true);

    try {
      // 1. Create the pending booking record with the final calculated amounts
      const createdBooking = await dataService.createPendingBooking({ 
          ...bookingData, 
          userId: user.uid, 
          baseFare: baseFare, 
          taxes: taxAmount, 
          discount: discountAmount,
          totalFare: finalTotal // Override the total fare with the final discounted amount
      });
      
      // 2. Actually book the seats on the schedule
      const seatsToBook = bookingData.passengers.map((p: any) => ({ 
          seatNumber: p.seatNumber, 
          gender: p.gender,
          passengerName: p.name,
          boardingPoint: bookingData.boardingPoint || ''
      }));
      const bookingResult = await dataService.bookSeats(
          bookingData.scheduleId, 
          seatsToBook, 
          user.uid, 
          createdBooking.id,
          {
              boardingPoint: bookingData.boardingPoint || '',
              passengerName: bookingData.passengers?.[0]?.name || ''
          }
      );
      
      if (!bookingResult.success) {
          throw new Error(bookingResult.message || 'Seats could not be booked.');
      }

      // 3. Mark the booking as confirmed
      await dataService.updateTicketStatus(user.uid, createdBooking.id, 'CONFIRMED');

      setConfirmedBookingId(createdBooking.id);
      setIsConfirmed(true);
      toast({
          title: 'Payment Confirmed & Ticket Generated!',
          description: `Successfully booked ${bookingData.passengers.length} seats.`,
      });

    } catch (error: any) {
      toast({ title: 'Ticket Generation Failed', description: error.message, variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  const handleDownloadInvoice = async () => {
    const invoiceElement = document.getElementById('invoice-to-print');
    if (!invoiceElement) return;

    const canvas = await html2canvas(invoiceElement, { scale: 2, useCORS: true });
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
    pdf.save(`BharatBus-Invoice-${confirmedBookingId}.pdf`);
  };

  if (isConfirmed) {
      return (
          <div className="container mx-auto px-4 py-12 max-w-2xl text-center space-y-8">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-10 h-10 text-green-600" />
                  </div>
                  <h1 className="text-3xl font-headline font-bold text-green-700">Booking Confirmed!</h1>
                  <p className="text-muted-foreground">The tickets have been generated and the seats are secured.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button onClick={handleDownloadInvoice} size="lg" className="font-headline" variant="outline">
                      <Download className="w-5 h-5 mr-2" /> Download Invoice (PDF)
                  </Button>
                  <Button onClick={() => { sessionStorage.removeItem('admin_pending_booking'); router.push('/admin/generate-tickets'); }} size="lg" className="font-headline">
                      <Plus className="w-5 h-5 mr-2" /> Generate Another Ticket
                  </Button>
              </div>

              {/* Hidden Invoice layout for PDF generation */}
              <div className="absolute -left-[9999px] top-0">
                  <div id="invoice-to-print" className="w-[800px] p-8 bg-white text-black space-y-6">
                      <div className="border-b-2 border-gray-200 pb-4 flex justify-between items-end">
                          <div>
                              <h2 className="text-2xl font-bold font-headline">INVOICE</h2>
                              <p className="text-sm text-gray-500">Booking ID: {confirmedBookingId}</p>
                              <p className="text-sm text-gray-500">Date: {new Date().toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                              <h3 className="font-bold">{bookingData.busDetails.name}</h3>
                              <p className="text-sm text-gray-500">{bookingData.busDetails.busNumber}</p>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-8 text-sm">
                          <div>
                              <p className="text-gray-500 font-medium">Route Details</p>
                              <p className="font-bold">{bookingData.busDetails.origin} to {bookingData.busDetails.destination}</p>
                              <p>Travel Date: {bookingData.bookingDate}</p>
                              <p>Boarding: {bookingData.boardingPoint}</p>
                              <p>Dropping: {bookingData.droppingPoint}</p>
                          </div>
                          <div>
                              <p className="text-gray-500 font-medium">Contact Details</p>
                              <p>{bookingData.contact.phone}</p>
                          </div>
                      </div>

                      <div className="pt-4">
                          <p className="text-gray-500 font-medium mb-2 text-sm">Passenger Manifest</p>
                          <table className="w-full text-sm">
                              <thead>
                                  <tr className="border-b border-gray-200">
                                      <th className="text-left py-2">Name</th>
                                      <th className="text-left py-2">Age/Gender</th>
                                      <th className="text-right py-2">Seat</th>
                                      <th className="text-right py-2">Amount</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {bookingData.passengers.map((p: any, idx: number) => (
                                      <tr key={idx} className="border-b border-gray-100">
                                          <td className="py-2">{p.name}</td>
                                          <td className="py-2">{p.age} / {p.gender}</td>
                                          <td className="text-right py-2">{p.seatNumber}</td>
                                          <td className="text-right py-2 font-medium">Rs {p.price.toFixed(2)}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>

                      <div className="flex justify-end pt-4">
                          <div className="w-64 space-y-2 text-sm">
                              <div className="flex justify-between">
                                  <span className="text-gray-500">Base Fare</span>
                                  <span>Rs {baseFare.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                  <span className="text-gray-500">Taxes (5%)</span>
                                  <span>Rs {taxAmount.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between font-bold border-t border-gray-200 pt-2">
                                  <span>Gross Total</span>
                                  <span>Rs {grossTotal.toFixed(2)}</span>
                              </div>
                              {discountPercentage > 0 && (
                                  <div className="flex justify-between text-green-600">
                                      <span>Discount ({discountPercentage}%)</span>
                                      <span>- Rs {discountAmount.toFixed(2)}</span>
                                  </div>
                              )}
                              <div className="flex justify-between font-bold text-lg border-t border-gray-200 pt-2">
                                  <span>Amount Paid</span>
                                  <span>Rs {finalTotal.toFixed(2)}</span>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Booking
      </Button>

      <Card className="shadow-lg border-primary/20">
        <CardHeader className="bg-primary/5 border-b pb-6">
          <CardTitle className="font-headline flex items-center gap-2 text-2xl">
            <Receipt className="w-6 h-6 text-primary" />
            Booking Invoice Review
          </CardTitle>
          <CardDescription className="font-headline">
            Review the final charges and apply any manual discounts before confirming the payment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          
          <div className="space-y-4">
              <h3 className="font-headline text-sm font-semibold uppercase text-muted-foreground tracking-wider">Trip Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-md font-headline">
                  <div>
                      <p className="text-muted-foreground">Route</p>
                      <p className="font-medium">{bookingData.busDetails.origin} → {bookingData.busDetails.destination}</p>
                  </div>
                  <div>
                      <p className="text-muted-foreground">Travel Date</p>
                      <p className="font-medium">{bookingData.bookingDate}</p>
                  </div>
                  <div>
                      <p className="text-muted-foreground">Boarding</p>
                      <p className="font-medium">{bookingData.boardingPoint}</p>
                  </div>
                  <div>
                      <p className="text-muted-foreground">Dropping</p>
                      <p className="font-medium">{bookingData.droppingPoint}</p>
                  </div>
              </div>
          </div>

          <div className="space-y-4">
              <h3 className="font-headline text-sm font-semibold uppercase text-muted-foreground tracking-wider">Passengers & Seats</h3>
              <div className="space-y-2 font-headline">
                  {bookingData.passengers.map((p: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                          <div>
                              <span className="font-medium">{p.name}</span> ({p.age}, {p.gender})
                          </div>
                          <div className="text-right">
                              <span className="text-muted-foreground mr-2">Seat {p.seatNumber}</span>
                              <span className="font-medium">₹{p.price.toFixed(2)}</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>

          <Separator />

          <div className="space-y-4">
              <h3 className="font-headline text-sm font-semibold uppercase text-muted-foreground tracking-wider">Apply Discount</h3>
              <div className="flex items-center gap-4 max-w-sm">
                  <div className="flex-1 space-y-1">
                      <Label className="font-headline">Discount Percentage (%)</Label>
                      <div className="relative">
                          <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input 
                              type="number" 
                              className="pl-9"
                              min="0" 
                              max="100"
                              value={discountPercentage || ''}
                              onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setDiscountPercentage(isNaN(val) ? 0 : Math.min(100, Math.max(0, val)));
                              }}
                              placeholder="e.g. 10"
                          />
                      </div>
                  </div>
              </div>
              <p className="text-xs text-muted-foreground">The discount is applied to the gross total (including tax).</p>
          </div>

          <Separator />

          <div className="space-y-3 bg-muted/20 p-4 rounded-lg font-headline">
              <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Base Fare</span>
                  <span>₹{baseFare.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxes (5% GST)</span>
                  <span>₹{taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium">
                  <span>Gross Total</span>
                  <span>₹{grossTotal.toFixed(2)}</span>
              </div>
              
              {discountPercentage > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                      <span>Discount ({discountPercentage}%)</span>
                      <span>- ₹{discountAmount.toFixed(2)}</span>
                  </div>
              )}
              
              <Separator className="my-2 bg-primary/20" />
              
              <div className="flex justify-between text-xl font-bold text-primary">
                  <span>Final Payable Amount</span>
                  <span>₹{finalTotal.toFixed(2)}</span>
              </div>
          </div>

        </CardContent>
        <CardFooter className="bg-primary/5 pt-4">
            <Button 
                size="lg" 
                className="w-full text-base h-14 font-headline" 
                onClick={handleBook} 
                disabled={isProcessing || isUserLoading}
            >
                <CheckCircle className="w-5 h-5 mr-2" />
                {isProcessing ? "Processing Booking..." : "Confirm Payment Received & Book Ticket"}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
