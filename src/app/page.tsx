
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { format } from 'date-fns';
import { MapPin, CalendarIcon, Search, User, Bus, Ticket, Sparkles, Crown, Gift } from 'lucide-react';

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
  const [isDatePickerOpen, setIsDatePickerOpen] = React.useState(false);
  const [locations, setLocations] = React.useState<string[]>([]);
  const [isRedirecting, setIsRedirecting] = React.useState(false);

  React.useEffect(() => {
    if (isUserLoading) {
      return;
    }
  
    async function checkRoleAndRedirect() {
      if (user) {
        try {
          const isAdmin = await dataService.isAdmin(user.uid);
          if (isAdmin) {
            router.replace('/admin');
            return;
          }
          
          if (user.email) {
            const isCrew = await dataService.isCabinCrew(user.email);
            if (isCrew) {
              router.replace('/cabin-crew');
              return;
            }
          }
        } catch (error) {
          console.error("Error checking user roles:", error);
        }
      }
      setIsRedirecting(false); // Stop redirecting if user is not a special role or if an error occurred
    }
  
    checkRoleAndRedirect();
  }, [user, isUserLoading, router]);

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues,
  });

  React.useEffect(() => {
    async function load() {
      try {
        const allLocations = await dataService.getAllLocations();
        setLocations(allLocations.sort());
      } catch (e) {
        console.error("Failed to load locations", e);
      }
    }
    load();
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
      <section className="relative w-full h-[60vh] md:h-[70vh] flex items-center justify-center overflow-hidden">
        <Image
          src={heroImage.imageUrl}
          alt={heroImage.description}
          fill
          className="object-cover"
          priority
          data-ai-hint={heroImage.imageHint}
        />
        <div className="absolute inset-0 bg-black/60" />
        
        {/* Animated Background Blobs inside Hero */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-50 mix-blend-screen z-0">
           <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1, rotate: 360, scale: [1, 1.3, 1], x: [0, 60, -30, 0], y: [0, 50, -50, 0] }} 
               transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
               className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-500/40 blur-[120px]"
           />
           <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1, rotate: -360, scale: [1, 1.4, 1], x: [0, -50, 50, 0], y: [0, -40, 60, 0] }} 
               transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
               className="absolute bottom-[-20%] right-[-10%] w-[55vw] h-[55vw] rounded-full bg-sky-500/40 blur-[120px]"
           />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center text-white p-4 max-w-5xl">
            <h1 className="text-4xl md:text-6xl font-bold [text-shadow:0_4px_8px_rgba(0,0,0,0.4)] drop-shadow-[0_2px_4px_rgba(255,255,255,0.5)]">
              Because Your Journey Deserves More.
            </h1>
            <p className="mt-4 text-lg md:text-xl max-w-2xl font-bold">
              “Discover the art of travel”
            </p>
        </div>
      </section>

      {/* SEARCH BAR */}
      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="relative z-20 -mt-24 md:-mt-16 w-full max-w-5xl mx-auto px-4"
      >
        <Card className="shadow-2xl border-white/20 bg-white/90 backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-black/5 hover:shadow-indigo-500/10 transition-shadow">
          <CardContent className="p-6 md:p-8">
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
                                {field.value
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
          </CardContent>
        </Card>
      </motion.div>

      {/* WHY CHOOSE US */}
      <section className="py-24 px-4 relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[40vw] bg-gradient-to-tr from-sky-100 to-indigo-50 blur-[120px] -z-10 rounded-full opacity-60" />
        
        <div className="text-center max-w-3xl mx-auto mb-16">
            <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-900 to-indigo-600 tracking-tight"
            >
                Why Choose BusHive?
            </motion.h2>
            <motion.p 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="mt-6 text-xl text-gray-600 font-medium"
            >
                Experience seamless travel with a platform designed for comfort, reliability, and effortless booking.
            </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <motion.div 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                whileHover={{ y: -10 }}
                className="bg-white/80 backdrop-blur-sm p-8 rounded-3xl shadow-lg border border-white hover:shadow-xl transition-all"
            >
                <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                    <Sparkles className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-black text-gray-800 mb-3">Premium Comfort</h3>
                <p className="text-gray-600 leading-relaxed">Relax in our state-of-the-art sleeper berths designed for maximum space, privacy, and a restful journey.</p>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                whileHover={{ y: -10 }}
                className="bg-white/80 backdrop-blur-sm p-8 rounded-3xl shadow-lg border border-white hover:shadow-xl transition-all"
            >
                <div className="w-14 h-14 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mb-6">
                    <MapPin className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-black text-gray-800 mb-3">Live Tracking</h3>
                <p className="text-gray-600 leading-relaxed">Know exactly where your bus is with our real-time GPS tracking and live ETA updates sent directly to your phone.</p>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                whileHover={{ y: -10 }}
                className="bg-white/80 backdrop-blur-sm p-8 rounded-3xl shadow-lg border border-white hover:shadow-xl transition-all"
            >
                <div className="w-14 h-14 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-6">
                    <User className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-black text-gray-800 mb-3">Dedicated Crew</h3>
                <p className="text-gray-600 leading-relaxed">Our highly trained cabin crew is on board to assist with luggage, refreshments, and ensure your comfort.</p>
            </motion.div>
        </div>
      </section>

      {/* PREMIUM BANNER */}
      <motion.section 
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="w-full max-w-6xl mx-auto px-4 pb-24"
      >
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-8 md:p-12 text-white shadow-2xl border border-white/10">
          {/* Animated Background Orbs */}
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-700"></div>
          
          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex-1 text-center lg:text-left">
              <div className="flex flex-wrap justify-center lg:justify-start gap-3 mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs md:text-sm font-semibold tracking-wide uppercase">
                  <Sparkles className="w-4 h-4 text-yellow-400" />
                  Exclusive Membership
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-400/20 backdrop-blur-md border border-yellow-400/30 text-xs md:text-sm font-bold tracking-wide uppercase text-yellow-400">
                  <Crown className="w-4 h-4" />
                  Go Premium Now
                </div>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight drop-shadow-sm">
                Upgrade to <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-500">BusHive Gold</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-white/80">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                  </div>
                  <span>Zero Cancellation Fees</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                  </div>
                  <span>Priority Boarding & Seating</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                  </div>
                  <span>Extra Luggage Allowance</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                  </div>
                  <span>24/7 Premium Support</span>
                </div>
              </div>
              <p className="text-white/60 text-sm font-medium">
                Limited Time Offer: Get 25% off on your membership with code <span className="text-white font-bold px-2 py-0.5 rounded bg-white/20 border border-white/30">BUSHIVE25</span>
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row lg:flex-col gap-4 w-full md:w-auto shrink-0">
              <Link href="/premium">
                <Button variant="secondary" size="lg" className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 text-black hover:scale-105 transition-all font-bold shadow-lg h-14 px-8 border-0">
                  <Gift className="w-5 h-5 mr-3" />
                  Explore Offers
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
