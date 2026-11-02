'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Briefcase, Printer, CheckCircle2, Download } from 'lucide-react';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import type { LuggageRecord, Bus } from '@/lib/types';
import { Separator } from '@/components/ui/separator';

const luggageSchema = z.object({
  passengerName: z.string().min(1, "Passenger name is required"),
  seatNumber: z.string().optional(),
  boardingPoint: z.string().optional(),
  droppingPoint: z.string().optional(),
  itemsCount: z.coerce.number().optional(),
  weight: z.coerce.number().optional(),
  description: z.string().optional(),
  amount: z.coerce.number().optional(),
});

export default function LuggageRegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripId = searchParams.get('tripId');
  const busId = searchParams.get('busId');
  const { user } = useFirebase();
  const { toast } = useToast();

  const invoiceRef = useRef<HTMLDivElement>(null);
  const [busData, setBusData] = useState<Bus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [createdRecord, setCreatedRecord] = useState<LuggageRecord | null>(null);

  useEffect(() => {
    if (busId) {
      dataService.getBusById(busId).then(setBusData).catch(console.error);
    }
  }, [busId]);

  const form = useForm<z.infer<typeof luggageSchema>>({
    resolver: zodResolver(luggageSchema),
    defaultValues: {
      passengerName: '',
      seatNumber: '',
      boardingPoint: '',
      droppingPoint: '',
      itemsCount: undefined,
      weight: undefined,
      description: '',
      amount: undefined,
    },
  });

  if (!tripId || !busId) {
    return (
      <div className="p-8 text-center text-red-500">
        Missing trip or bus information. Please go back and try again.
      </div>
    );
  }

  async function onSubmit(values: z.infer<typeof luggageSchema>) {
    if (!user?.email) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const rawRecordData = {
        scheduleId: tripId!,
        busId: busId!,
        passengerName: values.passengerName,
        seatNumber: values.seatNumber,
        boardingPoint: values.boardingPoint,
        droppingPoint: values.droppingPoint,
        itemsCount: values.itemsCount,
        weight: values.weight,
        description: values.description || '',
        amount: values.amount,
        timestamp: new Date().toISOString(),
        crewEmail: user.email,
      };

      // Firestore does not support undefined values, so we filter them out.
      const recordData = Object.fromEntries(
        Object.entries(rawRecordData).filter(([_, v]) => v !== undefined)
      ) as Omit<LuggageRecord, 'id'>;

      const record = await dataService.addLuggageRecord(recordData);
      setCreatedRecord(record);
      toast({ title: "Success", description: "Luggage invoice created successfully." });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to create luggage record.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current || !createdRecord) return;
    setIsDownloading(true);
    
    try {
      const canvas = await html2canvas(invoiceRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Luggage_Invoice_${createdRecord.id.slice(-8).toUpperCase()}.pdf`);
      toast({ title: "Downloaded", description: "Invoice PDF has been saved." });
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast({ title: "Error", description: "Failed to generate PDF.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const resetForm = () => {
    form.reset();
    setCreatedRecord(null);
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-md font-serif">
      <Button variant="ghost" className="mb-4" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Console
      </Button>

      {createdRecord ? (
        <div className="space-y-4">
          <div className="text-center pb-2">
            <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-2" />
            <h2 className="text-2xl font-bold text-green-800">Invoice Created</h2>
          </div>
          
          {/* Invoice Preview Container */}
          <div 
            ref={invoiceRef} 
            className="bg-white p-6 rounded-lg border shadow-sm text-sm space-y-4 text-slate-800"
            style={{ width: '400px', maxWidth: '100%', margin: '0 auto' }}
          >
            {/* Header */}
            <div className="text-center border-b pb-4">
              <h3 className="text-2xl font-bold uppercase tracking-wider">{busData?.travelsName || 'BUS OPERATOR'}</h3>
              <p className="text-muted-foreground">{busData?.operator || 'Logistics & Travel'}</p>
              {busData?.busNumber && <p className="font-bold mt-1 bg-slate-100 inline-block px-2 py-1 rounded">{busData.busNumber}</p>}
            </div>

            <div className="text-center">
              <h4 className="font-bold text-lg border border-slate-300 inline-block px-4 py-1">LUGGAGE INVOICE</h4>
            </div>

            {/* Meta Data */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Invoice No:</p>
                <p className="font-bold">{createdRecord.id.slice(-8).toUpperCase()}</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">Date & Time:</p>
                <p className="font-bold">{format(new Date(createdRecord.timestamp), 'dd MMM yyyy, HH:mm')}</p>
              </div>
            </div>

            <Separator />

            {/* Passenger Info */}
            <div className="space-y-1">
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground col-span-1">Passenger:</span>
                <span className="font-bold col-span-2 text-right">{createdRecord.passengerName}</span>
              </div>
              {createdRecord.seatNumber && (
                <div className="grid grid-cols-3">
                  <span className="text-muted-foreground col-span-1">Seat:</span>
                  <span className="font-bold col-span-2 text-right">{createdRecord.seatNumber}</span>
                </div>
              )}
              {createdRecord.boardingPoint && (
                <div className="grid grid-cols-3">
                  <span className="text-muted-foreground col-span-1">Boarding:</span>
                  <span className="font-bold col-span-2 text-right">{createdRecord.boardingPoint}</span>
                </div>
              )}
              {createdRecord.droppingPoint && (
                <div className="grid grid-cols-3">
                  <span className="text-muted-foreground col-span-1">Dropping:</span>
                  <span className="font-bold col-span-2 text-right">{createdRecord.droppingPoint}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Luggage Details */}
            <div className="space-y-1 bg-slate-50 p-2 rounded">
              <h5 className="font-bold text-xs uppercase mb-2">Luggage Particulars</h5>
              {createdRecord.itemsCount !== undefined && (
                <div className="flex justify-between">
                  <span>Number of Items:</span>
                  <span className="font-bold">{createdRecord.itemsCount}</span>
                </div>
              )}
              {createdRecord.weight !== undefined && (
                <div className="flex justify-between">
                  <span>Total Weight:</span>
                  <span className="font-bold">{createdRecord.weight} kg</span>
                </div>
              )}
              {createdRecord.description && (
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground block">Description:</span>
                  <span className="text-sm font-medium">{createdRecord.description}</span>
                </div>
              )}
            </div>

            {/* Total */}
            {createdRecord.amount !== undefined && (
              <div className="flex justify-between items-center border-t-2 border-slate-800 pt-2 mt-4 text-lg">
                <span className="font-bold">TOTAL AMOUNT:</span>
                <span className="font-bold">₹{createdRecord.amount}</span>
              </div>
            )}
            
            <div className="text-center text-[10px] text-muted-foreground pt-4 pb-2">
              Generated by Cabin Crew Console
            </div>
          </div>
          
          <div className="flex flex-col gap-2 pt-4">
             <Button className="w-full" onClick={handleDownloadPDF} disabled={isDownloading}>
               <Download className="w-4 h-4 mr-2" /> {isDownloading ? "Generating PDF..." : "Download as PDF"}
             </Button>
             <Button variant="outline" className="w-full" onClick={resetForm}>
               Create New Invoice
             </Button>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" /> Luggage Register
            </CardTitle>
            <CardDescription>
              Create an invoice for passenger luggage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="passengerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Passenger Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="seatNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Seat (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 1A" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="boardingPoint"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Boarding (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="City or Stop" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="droppingPoint"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dropping (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="City or Stop" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="itemsCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Items (Optional)</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="weight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weight kg (Optional)</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" step="0.1" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="e.g. 1 large suitcase" className="resize-none" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount ₹ (Optional)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground">₹</span>
                          <Input type="number" className="pl-7 text-lg font-bold" min="0" {...field} value={field.value ?? ''} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full h-12 text-lg" disabled={isSubmitting}>
                  {isSubmitting ? "Generating Invoice..." : "Create Invoice"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
