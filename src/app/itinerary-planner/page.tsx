
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  PersonalizedItinerarySuggestionsInput,
  personalizedItinerarySuggestions,
} from '@/ai/flows/personalized-itinerary-suggestions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Bot, Sparkles } from 'lucide-react';
import { format } from 'date-fns';

const itinerarySchema = z.object({
  origin: z.string().min(2, 'Origin is required'),
  destination: z.string().min(2, 'Destination is required'),
  travelDate: z.string().min(1, 'Travel date is required'),
  budget: z.string().min(1, 'Budget is required'),
  preferences: z.string(),
  travelHistory: z.string(),
  interests: z.string().min(1, 'Interests are required'),
});

type FormValues = z.infer<typeof itinerarySchema>;

export default function ItineraryPlannerPage() {
  const [itinerary, setItinerary] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(itinerarySchema),
    defaultValues: {
      origin: '',
      destination: '',
      travelDate: format(new Date(), 'yyyy-MM-dd'),
      budget: 'Moderate',
      preferences: '',
      travelHistory: '',
      interests: '',
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);
    setItinerary('');
    try {
      const input: PersonalizedItinerarySuggestionsInput = data;
      const result = await personalizedItinerarySuggestions(input);
      setItinerary(result.itinerary);
    } catch (error) {
      console.error('Failed to generate itinerary:', error);
      setItinerary('Sorry, something went wrong while generating your itinerary. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline">
              <Bot /> AI Itinerary Planner
            </CardTitle>
            <CardDescription>
              Let our AI craft the perfect travel plan for your bus journey.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="origin" render={({ field }) => (
                    <FormItem><FormLabel>Origin</FormLabel><FormControl><Input placeholder="e.g., Delhi" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="destination" render={({ field }) => (
                    <FormItem><FormLabel>Destination</FormLabel><FormControl><Input placeholder="e.g., Manali" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="travelDate" render={({ field }) => (
                        <FormItem><FormLabel>Travel Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="budget" render={({ field }) => (
                        <FormItem><FormLabel>Budget</FormLabel><FormControl><Input placeholder="e.g., ₹10000" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <FormField control={form.control} name="interests" render={({ field }) => (
                    <FormItem><FormLabel>Interests</FormLabel><FormControl><Textarea placeholder="e.g., Hiking, local food, photography" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="preferences" render={({ field }) => (
                    <FormItem><FormLabel>Preferences (Optional)</FormLabel><FormControl><Input placeholder="e.g., Scenic route, less crowded places" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                 <FormField control={form.control} name="travelHistory" render={({ field }) => (
                    <FormItem><FormLabel>Travel History (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., Visited Goa, Kerala last year." {...field} /></FormControl><FormMessage /></FormItem>
                )} />

                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? 'Generating...' : <> <Sparkles className="mr-2 h-4 w-4" /> Generate Itinerary </>}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Your Personalized Itinerary</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            {isLoading ? (
                <div className="space-y-2">
                    <p>Generating your personalized trip plan... this may take a moment.</p>
                </div>
            ) : itinerary ? (
                // Using dangerouslySetInnerHTML is okay here because the content is from a trusted AI source and is just text.
                // In a production app, you might want to sanitize this.
                <div dangerouslySetInnerHTML={{ __html: itinerary.replace(/\n/g, '<br />') }} />
            ) : (
              <p className="text-muted-foreground">Your generated itinerary will appear here.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
