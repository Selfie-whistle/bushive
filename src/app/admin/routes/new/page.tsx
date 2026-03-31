
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Route, ChevronRight, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { dataService } from '@/lib/data/client-service';
import { useFirebase } from '@/firebase';
import type { Service } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

const routeFormSchema = z.object({
  origin: z.string().min(2, 'Origin city is required.'),
  destination: z.string().min(2, 'Destination city is required.'),
});

type FormValues = z.infer<typeof routeFormSchema>;

export default function AddNewRoutePage() {
  const router = useRouter();
  const { user } = useFirebase();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: {
      origin: '',
      destination: '',
    },
  });

  useEffect(() => {
    async function loadServices() {
        setIsLoadingServices(true);
        try {
            const fetchedServices = await dataService.getServices();
            setServices(fetchedServices);
        } catch (error) {
            toast({
                title: 'Error fetching routes',
                description: 'Could not load existing routes.',
                variant: 'destructive',
            });
        } finally {
            setIsLoadingServices(false);
        }
    }
    loadServices();
  }, [toast]);


  const onSubmit = async (data: FormValues) => {
    if (!user) {
        toast({ title: 'Authentication Error', description: 'You must be logged in.', variant: 'destructive'});
        return;
    }
    setIsSaving(true);
    
    try {
        const locations = [data.origin, data.destination].sort();
        const serviceId = locations.map(l => l.toLowerCase().replace(/\s+/g, '-')).join('-');
        
        await dataService.addService(serviceId, {
            id: serviceId,
            origin: data.origin,
            destination: data.destination,
        });

        toast({
            title: "Service Defined",
            description: `Now add the specific points for this route.`,
        });

        router.push(`/admin/route/${serviceId}`);

    } catch (e: any) {
      toast({
        title: 'Failed to create route',
        description: e.message,
        variant: 'destructive',
      });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Trips
        </Button>
        <h1 className="text-3xl font-bold font-headline">Manage Services</h1>
        <p className="text-muted-foreground">Define and view all your service routes.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-headline">
            <Route />
            Define New Service
          </CardTitle>
          <CardDescription>
            Define the main origin and destination for a new round-trip service. You can add buses and points in the next step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="origin" render={({ field }) => (
                      <FormItem><FormLabel>Origin City</FormLabel><FormControl><Input placeholder="e.g., Punalur" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="destination" render={({ field }) => (
                      <FormItem><FormLabel>Destination City</FormLabel><FormControl><Input placeholder="e.g., Bangalore" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
              
              <Button type="submit" disabled={isSaving} className="w-full md:w-auto">
                <Save className="mr-2" />
                {isSaving ? 'Saving...' : 'Define & Continue'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle>Existing Services</CardTitle>
        </CardHeader>
        <CardContent>
            {isLoadingServices ? (
                <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
            ) : (
                <div className="space-y-2">
                    {services.map(service => (
                        <div key={service.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                            <Link href={`/admin/route/${service.id}`} className="flex items-center gap-3 flex-grow">
                                <span className="font-semibold">{service.origin} &harr; {service.destination}</span>
                            </Link>
                            <div className="flex items-center gap-2">
                                <span className="text-green-800 font-mono text-xs font-semibold">{service.id}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(service.id);
                                        toast({
                                            title: "Copied!",
                                            description: "Service ID copied to clipboard.",
                                        });
                                    }}
                                >
                                    <Copy className="h-3 w-3" />
                                </Button>
                                <Link href={`/admin/route/${service.id}`}>
                                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </CardContent>
      </Card>

    </div>
  );
}
