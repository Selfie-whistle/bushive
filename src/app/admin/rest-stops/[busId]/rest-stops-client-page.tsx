'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  Utensils,
  Navigation,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { dataService } from '@/lib/data/client-service';
import type { Bus } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const restStopSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Rest stop name is required.'),
  location: z.string().min(2, 'Location is required.'),
  description: z.string().optional(),
  coordinates: z.string().optional(),
  type: z.enum(['FOOD', 'REST', 'SCENIC']).optional(),
  duration: z.coerce.number().min(5, 'Minimum 5 minutes'),
  amenities: z.array(z.string()).optional(),
});

const formSchema = z.object({
  restStops: z.array(restStopSchema),
});

type FormValues = z.infer<typeof formSchema>;
type RouteDirection = 'forward' | 'return';

export default function RestStopsClientPage({ busId }: { busId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [bus, setBus] = useState<Bus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const activeDirection =
    (searchParams.get('direction') as RouteDirection) || 'forward';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { restStops: [] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'restStops',
  });

  const loadBusData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dataService.getBusById(busId);
      if (data) {
        setBus(data);
        const stopsKey =
          activeDirection === 'forward' ? 'restStopsForward' : 'restStopsReturn';
        const restStops = (data as any)[stopsKey] || data.restStops || [];

        const normalizedRestStops = restStops.map((stop: any) => ({
          ...stop,
          description: stop.description || '',
          coordinates: stop.coordinates || '',
          amenities: stop.amenities || [],
          type: stop.type || 'FOOD',
          duration: stop.duration || 20,
        }));
        form.reset({ restStops: normalizedRestStops });
      } else {
        toast({
          title: 'Error',
          description: 'Bus not found',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load bus data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [busId, form, toast, activeDirection]);

  useEffect(() => {
    loadBusData();
  }, [loadBusData]);

  const onSubmit = async (data: FormValues) => {
    if (!bus) return;
    setIsSaving(true);
    try {
      const stopsToSave = data.restStops.map((stop) => ({
        ...stop,
        id: stop.id || `rs_${Date.now()}_${Math.random()}`,
      }));

      const stopsKey =
        activeDirection === 'forward' ? 'restStopsForward' : 'restStopsReturn';
      const updatedBusData = { ...bus, [stopsKey]: stopsToSave };

      await dataService.addBus(updatedBusData);
      toast({
        title: 'Saved',
        description: 'Rest stops updated successfully',
      });
      await loadBusData();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save rest stops',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDirectionChange = (direction: RouteDirection) => {
    router.push(`/admin/rest-stops/${busId}?direction=${direction}`);
  };


  if (loading) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-1/3 mb-6" />
        <Skeleton className="h-20 w-full mb-4" />
        <Skeleton className="h-32 w-full mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/admin/trips')}
        >
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Manage Rest Stops</h1>
          <p className="text-muted-foreground text-sm">{bus?.travelsName}</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              className="flex-1 h-12 justify-start px-6"
              variant={activeDirection === 'forward' ? 'default' : 'outline'}
              onClick={() => handleDirectionChange('forward')}
            >
              <div className="flex items-center gap-3 w-full">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Navigation className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Forward Route</div>
                  <div className="text-xs text-muted-foreground">
                    {bus?.origin} → {bus?.destination}
                  </div>
                </div>
              </div>
            </Button>
            <Button
              className="flex-1 h-12 justify-start px-6"
              variant={activeDirection === 'return' ? 'default' : 'outline'}
              onClick={() => handleDirectionChange('return')}
            >
              <div className="flex items-center gap-3 w-full">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <Navigation className="h-4 w-4 text-green-600 dark:text-green-400 rotate-180" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Return Route</div>
                  <div className="text-xs text-muted-foreground">
                    {bus?.destination} → {bus?.origin}
                  </div>
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Rest Stops ({activeDirection} trip)</CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    append({
                      id: `new_${Date.now()}`,
                      name: '',
                      location: '',
                      description: '',
                      coordinates: '',
                      type: 'FOOD',
                      duration: 20,
                      amenities: [],
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Stop
                </Button>
              </div>
              <CardDescription>
                Configure halt points and durations for this route
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {fields.length === 0 && (
                <div className="py-10 text-center text-muted-foreground">
                  <Utensils className="h-10 w-10 mx-auto mb-3" />
                  No rest stops added
                </div>
              )}

              {fields.map((item, index) => (
                <Card key={item.id} className="bg-muted/30">
                  <CardHeader className="p-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Stop {index + 1}</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`restStops.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Hotel / Dhaba" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`restStops.${index}.location`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location</FormLabel>
                            <FormControl>
                              <Input placeholder="City / Highway" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name={`restStops.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., Good for families"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name={`restStops.${index}.coordinates`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Coordinates</FormLabel>
                            <FormControl>
                              <Input placeholder="lat, lng" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`restStops.${index}.type`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Type</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="FOOD">Food Stop</SelectItem>
                                <SelectItem value="REST">Rest Stop</SelectItem>
                                <SelectItem value="SCENIC">Scenic</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`restStops.${index}.duration`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Duration (min)</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>

          <Button type="submit" className="w-full" disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving…' : 'Save Changes'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
