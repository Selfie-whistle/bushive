
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { format } from 'date-fns';
import { MapPin, CalendarIcon, Search, User, Bus, Ticket } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  FormLabel,
} from '@/components/ui/form';
import { Card, CardContent } from '@/components/ui/card';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { LocationSearch } from '@/components/location-search';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { dataService } from '@/lib/data/client-service';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

const searchSchema = z.object({
  origin: z.string().min(2, 'Origin is required'),
  destination: z.string().min(2, 'Destination is required'),
  date: z.date({
    message: 'A date of travel is required.',
  }),
});

type SearchFormValues = z.infer<typeof searchSchema>;

const defaultValues: SearchFormValues = {
  origin: '',
  destination: '',
  date: new Date(),
};

export default function HomePage() {
  const router = useRouter();
  const { user, isUserLoading } = useFirebase();
  const { toast } = useToast();
  const [isMounted, setIsMounted] = React.useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = React.useState(false);
  const [locations, setLocations] = React.useState<string[]>([]);
  const [isRedirecting, setIsRedirecting] = React.useState(true);

  React.useEffect(() => {
    if (isUserLoading) {
      return;
    }
  
    async function checkRoleAndRedirect() {
      if (user) {
        const isAdmin = await dataService.isAdmin(user.uid);
        if (isAdmin) {
          router.replace('/admin');
          return;
        }
        
        const isCrew = await dataService.isCabinCrew(user.email!);
        if (isCrew) {
          router.replace('/cabin-crew');
          return;
        }
      }
      setIsRedirecting(false); // Only stop redirecting if user is not a special role
    }
  
    checkRoleAndRedirect();
  }, [user, isUserLoading, router]);

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues,
  });

  React.useEffect(() => {
    setIsMounted(true);

    async function load() {
      const allLocations = await dataService.getAllLocations();
      setLocations(allLocations.sort());
    }

    if (typeof window !== 'undefined') load();
  }, []);

  const onSubmit = (data: SearchFormValues) => {
    if (!user) {
      toast({
        title: 'Please Log In',
        description: 'You need to be logged in to search for buses.',
        variant: 'destructive',
      });
      router.push('/login');
      return;
    }
    const params = new URLSearchParams();
    params.set('origin', data.origin);
    params.set('destination', data.destination);
    params.set('date', format(data.date, 'yyyy-MM-dd'));
    router.push(`/search?${params.toString()}`);
  };

  const heroImage = {
    imageUrl: '/sleeper-interior.jpeg',
    description: 'Sleeper bus interior with green berths',
    imageHint: 'Sleeper bus interior green beds',
  };

  if (isRedirecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
          <Bus className="w-16 h-16 animate-pulse text-primary" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">Redirecting to your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* HERO */}
      <section className="relative w-full h-[60vh] md:h-[70vh] flex items-center justify-center">
        <Image
          src={heroImage.imageUrl}
          alt={heroImage.description}
          fill
          className="object-cover"
          priority
          data-ai-hint={heroImage.imageHint}
        />
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 flex flex-col items-center text-center text-white p-4">
          <h1 className="text-4xl md:text-6xl font-bold [text-shadow:0_4px_8px_rgba(0,0,0,0.4)] drop-shadow-[0_2px_4px_rgba(255,255,255,0.5)]">
            Because Your Journey Deserves More.
          </h1>
          <p className="mt-4 text-lg md:text-xl max-w-2xl">
            “Discover the art of travel"
          </p>
        </div>
      </section>

      {/* SEARCH BAR */}
      <div className="relative z-20 -mt-24 md:-mt-16 w-full max-w-5xl mx-auto px-4">
        <Card className="shadow-2xl border border-gray-300">
          <CardContent className="p-4 md:p-6">
            {!isMounted ? (
              <div className="grid grid-cols-1 md:grid-cols-9 gap-4 items-end">
                <Skeleton className="h-12 md:col-span-3" />
                <Skeleton className="h-12 md:col-span-3" />
                <Skeleton className="h-12 md:col-span-2" />
                <Skeleton className="h-12 md:col-span-1" />
              </div>
            ) : (
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="grid grid-cols-1 md:grid-cols-9 gap-4 items-end"
                >
                  {/* FROM */}
                  <FormField
                    control={form.control}
                    name="origin"
                    render={({ field }) => (
                      <FormItem className="md:col-span-3 space-y-1">
                        <FormLabel>From</FormLabel>
                        <FormControl>
                          <div className="h-12 rounded-md border border-input bg-background flex items-center px-3 [&_input]:border-0 [&_input]:shadow-none [&_input]:focus-visible:ring-0">
                            <LocationSearch
                              value={field.value}
                              onValueChange={field.onChange}
                              locations={locations}
                              placeholder="Enter boarding location"
                              icon={
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                              }
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* TO */}
                  <FormField
                    control={form.control}
                    name="destination"
                    render={({ field }) => (
                      <FormItem className="md:col-span-3 space-y-1">
                        <FormLabel>To</FormLabel>
                        <FormControl>
                           <div className="h-12 rounded-md border border-input bg-background flex items-center px-3 [&_input]:border-0 [&_input]:shadow-none [&_input]:focus-visible:ring-0">
                            <LocationSearch
                              value={field.value}
                              onValueChange={field.onChange}
                              locations={locations}
                              placeholder="Enter destination"
                              icon={
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                              }
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* DATE */}
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2 space-y-1">
                        <FormLabel>Date</FormLabel>
                        <Popover
                          open={isDatePickerOpen}
                          onOpenChange={setIsDatePickerOpen}
                        >
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full h-12 justify-start font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {isMounted && field.value
                                  ? format(field.value, "PPP")
                                  : 'Pick a date'}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="p-0">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => {
                                if (date) {
                                    form.setValue('date', date, { shouldValidate: true });
                                }
                                setIsDatePickerOpen(false);
                              }}
                              disabled={(date) =>
                                date <
                                new Date(
                                  new Date().setHours(0, 0, 0, 0)
                                )
                              }
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* SEARCH BUTTON */}
                  <FormItem className="md:col-span-1">
                    <Button
                      type="submit"
                      className="w-full h-12"
                      disabled={isUserLoading}
                    >
                      <Search className="h-4 w-4" />
                      <span className="hidden md:inline ml-2">Search</span>
                    </Button>
                  </FormItem>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
      <section className="py-20 text-center">
        <h2 className="text-3xl font-semibold">Why Choose BusHive?</h2>
        <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto">Experience seamless travel with a platform designed for comfort, reliability, and effortless booking.</p>
      </section>
    </div>
  );
}
