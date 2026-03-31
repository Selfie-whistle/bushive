
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirebase } from '@/firebase';

const manageBookingSchema = z.object({
  identifier: z.string().min(1, 'Please enter a valid Booking ID.'),
});

type FormValues = z.infer<typeof manageBookingSchema>;

export default function ManageBookingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useFirebase();

  const form = useForm<FormValues>({
    resolver: zodResolver(manageBookingSchema),
    defaultValues: { identifier: '' },
  });

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);
    const bookingId = data.identifier.trim();
    if (user) {
      router.push(`/confirmation/${bookingId}`);
    } else {
        router.push(`/confirmation/${bookingId}`);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="font-headline">Find Your Ticket</CardTitle>
          <CardDescription>Enter your Booking ID to find your ticket.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="flex items-end gap-4">
                <FormField
                  control={form.control}
                  name="identifier"
                  render={({ field }) => (
                    <FormItem className="flex-grow">
                      <FormLabel className="sr-only">Booking ID</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="Enter Booking ID" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Searching...' : 'Find Booking'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
