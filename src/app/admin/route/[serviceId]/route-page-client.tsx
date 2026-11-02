

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { dataService } from '@/lib/data/client-service';
import type { Service, Point } from '@/lib/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Save, Trash2, MapPin, Clock, Navigation, User, Bus, ChevronRight, Hash, Check } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

const pointSchema = z.object({
  name: z.string().optional(),
  time: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  coordinates: z.string().optional(),
  description: z.string().optional(),
  main: z.string().optional(),
  order: z.number().optional(),
});

const routeFormSchema = z.object({
  boardingPointsForward: z.array(pointSchema).optional().default([]),
  droppingPointsForward: z.array(pointSchema).optional().default([]),
  boardingPointsReturn: z.array(pointSchema).optional().default([]),
  droppingPointsReturn: z.array(pointSchema).optional().default([]),
  bigDataText: z.string().optional(),
});

type FormValues = z.infer<typeof routeFormSchema>;

const PointFormArray = ({ form, name, title, description, iconColor = "blue" }: any) => {
  const { control } = form;
  const { fields, append, remove } = useFieldArray({ control, name });
  const { toast } = useToast();
  
  const watchedValues = form.watch(name);

  const sortedFields = React.useMemo(() => {
    return fields
      .map((field, index) => ({ ...field, originalIndex: index }))
      .sort((a, b) => {
        const timeA = watchedValues?.[a.originalIndex]?.time || '99:99';
        const timeB = watchedValues?.[b.originalIndex]?.time || '99:99';
        return timeA.localeCompare(timeB);
      });
  }, [fields, watchedValues]);

  const handleRemoveBoth = (indexToRemove: number) => {
    const getOppositeName = (currentName: string): string | null => {
      if (currentName.endsWith('Forward')) return currentName.replace('Forward', 'Return');
      if (currentName.endsWith('Return')) return currentName.replace('Return', 'Forward');
      return null;
    }
    const oppositeName = getOppositeName(name);

    if (oppositeName) {
        const oppositeArray: any[] = form.getValues(oppositeName) || [];
        if (oppositeArray.length > indexToRemove) {
            const newOppositeArray = oppositeArray.filter((_, i) => i !== indexToRemove);
            form.setValue(oppositeName, newOppositeArray);
        }
    }
    
    remove(indexToRemove);
    toast({ title: 'Point(s) removed' });
  };
  
  const handleRemoveSingle = (index: number) => {
    remove(index);
    toast({ title: 'Point removed' });
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {name.includes('boarding') ? (
                <div className="p-2 rounded-md bg-blue-50">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
              ) : (
                <div className="p-2 rounded-md bg-green-50">
                  <MapPin className="h-4 w-4 text-green-600" />
                </div>
              )}
              {title}
            </CardTitle>
            <CardDescription className="mt-1">{description || `Manage ${fields.length} points`}</CardDescription>
          </div>
          <Badge variant="outline" className="text-sm font-normal">
            {fields.length} points
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
              {name.includes('boarding') ? (
                <User className="h-6 w-6 text-muted-foreground" />
              ) : (
                <MapPin className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <h4 className="font-medium">No points added yet</h4>
            <p className="text-sm text-muted-foreground mt-1">Start by adding your first point</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedFields.map((item, displayIndex) => (
              <Card key={item.id} className="border relative overflow-hidden">
                <div className="absolute top-3 right-3">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Point</AlertDialogTitle>
                        <AlertDialogDescription>
                          Would you like to delete this point from only this route, or from both the forward and return routes?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleRemoveSingle(item.originalIndex)}>
                          Delete from This Route
                        </AlertDialogAction>
                        <AlertDialogAction
                          className={buttonVariants({ variant: 'destructive' })}
                          onClick={() => handleRemoveBoth(item.originalIndex)}
                        >
                          Delete from Both
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-gray-700 text-sm font-medium">
                      {displayIndex + 1}
                    </div>
                    <div className="flex-1 max-w-[250px]">
                      <FormField
                        control={control}
                        name={`${name}.${item.originalIndex}.main`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input 
                                {...field} 
                                value={field.value || ''}
                                placeholder="Main Point Name" 
                                className="h-7 text-sm font-headline font-semibold text-red-600 bg-transparent border-transparent hover:border-gray-200 focus:border-red-500 focus-visible:ring-0 shadow-none px-2" 
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <FormField
                      control={control}
                      name={`${name}.${item.originalIndex}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium flex items-center gap-1">
                            <Navigation className="h-3 w-3" />
                            Point Name
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter point name" className="h-9" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name={`${name}.${item.originalIndex}.time`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Arrival Time
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="HH:MM" className="h-9" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={control}
                      name={`${name}.${item.originalIndex}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Description</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Optional description" 
                              {...field} 
                              className="h-9" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name={`${name}.${item.originalIndex}.coordinates`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Coordinates (Latitude, Longitude)</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ''} placeholder="e.g. 9.123, 76.456" className="h-9" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => append({ name: '', time: '00:00', lat: 0, lng: 0, description: '' })}
          className="w-full mt-4 h-10 border-dashed"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add New Point
        </Button>
      </CardContent>
    </Card>
  );
};

export function RoutePageClient({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const [service, setService] = useState<Service | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'boarding' | 'dropping'>('boarding');

  const [routeDirection, setRouteDirection] = useState<'forward' | 'return'>('forward');

  const form = useForm<FormValues>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: {
      boardingPointsForward: [],
      droppingPointsForward: [],
      boardingPointsReturn: [],
      droppingPointsReturn: [],
      bigDataText: '',
    },
  });

  useEffect(() => {
    (async () => {
      const data = await dataService.getServiceById(serviceId);
      if (!data) return;
      
      const mapCoordinates = (points: any[]) => points?.map(p => ({
        ...p,
        coordinates: (p.lat || p.lng) ? `${p.lat}, ${p.lng}` : ''
      })) || [];

      data.boardingPointsForward = mapCoordinates(data.boardingPointsForward);
      data.droppingPointsForward = mapCoordinates(data.droppingPointsForward);
      data.boardingPointsReturn = mapCoordinates(data.boardingPointsReturn);
      data.droppingPointsReturn = mapCoordinates(data.droppingPointsReturn);

      setService(data);
      form.reset(data);
      setIsLoading(false);
    })();
  }, [serviceId, form]);

  const onSubmit = async (data: FormValues) => {
    setIsSaving(true);

    const sortAndAddOrder = (points: any[]) => {
      if (!points) return [];
      // Sort by main point name, then assign order index
      return [...points]
        .sort((a, b) => {
            const mainDiff = (a.main || '').localeCompare(b.main || '');
            if (mainDiff !== 0) return mainDiff;
            return (a.time || '99:99').localeCompare(b.time || '99:99');
        })
        .map((p, i) => {
            let lat = p.lat || 0;
            let lng = p.lng || 0;
            if (p.coordinates) {
                const parts = p.coordinates.split(',').map((s: string) => s.trim());
                if (parts.length >= 2) {
                    lat = parseFloat(parts[0]) || 0;
                    lng = parseFloat(parts[1]) || 0;
                }
            }
            return { 
                name: p.name || '', 
                time: p.time || '', 
                description: p.description || '', 
                main: p.main || '', 
                order: i, 
                lat, 
                lng 
            };
        });
    };

    const dataWithOrder = {
        boardingPointsForward: sortAndAddOrder(data.boardingPointsForward),
        droppingPointsForward: sortAndAddOrder(data.droppingPointsForward),
        boardingPointsReturn: sortAndAddOrder(data.boardingPointsReturn),
        droppingPointsReturn: sortAndAddOrder(data.droppingPointsReturn),
    };

    try {
        await dataService.updateService(serviceId, dataWithOrder);
        toast({ title: 'Route saved' });
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
        setIsDialogOpen(false);
    } catch (e: any) {
        toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };

  const handleParseData = (e: React.MouseEvent) => {
    e.preventDefault();
    const text = form.getValues('bigDataText');
    if (!text) {
        toast({ title: 'No text to parse', variant: 'destructive' });
        return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    const newPoints = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 1. Try parsing as a table row (Markdown '|' or Excel '\t')
        let cols = [];
        if (line.includes('|')) {
            cols = line.split('|').map(c => c.trim()).filter(c => c !== '' && !/^[-:]+$/.test(c)); // Ignore markdown separator rows
        } else if (line.includes('\t')) {
            cols = line.split('\t').map(c => c.trim()).filter(c => c !== '');
        }

        if (cols.length >= 2) {
            const timeColIndex = cols.findIndex(c => /^(\d{1,2})[:.](\d{2})(?:\s*(AM|PM|am|pm))?$/.test(c));
            if (timeColIndex !== -1) {
                const timeMatch = cols[timeColIndex].match(/^(\d{1,2})[:.](\d{2})(?:\s*(AM|PM|am|pm))?$/);
                if (timeMatch) {
                    let hour = parseInt(timeMatch[1], 10);
                    let ampm = timeMatch[3];
                    if (ampm) {
                        const isPM = ampm.toLowerCase() === 'pm';
                        if (isPM && hour < 12) hour += 12;
                        if (!isPM && hour === 12) hour = 0;
                    }
                    const timeStr = `${hour.toString().padStart(2, '0')}:${timeMatch[2]}`;
                    const name = cols[timeColIndex + 1] || 'Unknown Point';
                    const desc = cols[timeColIndex + 2] || '';
                    
                    newPoints.push({
                        name: name,
                        time: timeStr,
                        description: desc,
                        lat: 0,
                        lng: 0,
                        main: name,
                    });
                    continue; // Successfully parsed row
                }
            }
        }

        // 2. Fallback to block parsing (Number, Time, Name, Desc in separate lines)
        const timeMatch = line.match(/^(\d{1,2})[:.](\d{2})(?:\s*(AM|PM|am|pm))?$/);
        
        if (timeMatch) {
            let hour = parseInt(timeMatch[1], 10);
            let ampm = timeMatch[3];
            if (ampm) {
                const isPM = ampm.toLowerCase() === 'pm';
                if (isPM && hour < 12) hour += 12;
                if (!isPM && hour === 12) hour = 0;
            }
            let timeStr = `${hour.toString().padStart(2, '0')}:${timeMatch[2]}`;

            const name = lines[i+1] || 'Unknown Point';
            let desc = '';
            
            // Check if the line after name exists and isn't the next number or time
            if (i + 2 < lines.length && !/^\d+$/.test(lines[i+2]) && !/^\d{1,2}[:.]\d{2}/.test(lines[i+2])) {
                desc = lines[i+2];
            }
            
            newPoints.push({
                name: name,
                time: timeStr,
                description: desc,
                lat: 0,
                lng: 0,
                main: name,
            });
        }
    }

    if (newPoints.length === 0) {
        toast({ title: 'No valid data found', description: 'Could not find any times in HH:MM format.', variant: 'destructive' });
        return;
    }

    let target = '';
    if (activeTab === 'boarding' && routeDirection === 'forward') target = 'boardingPointsForward';
    if (activeTab === 'dropping' && routeDirection === 'forward') target = 'droppingPointsForward';
    if (activeTab === 'boarding' && routeDirection === 'return') target = 'boardingPointsReturn';
    if (activeTab === 'dropping' && routeDirection === 'return') target = 'droppingPointsReturn';

    const currentPoints = form.getValues(target as any) || [];
    form.setValue(target as any, [...currentPoints, ...newPoints], { shouldDirty: true });
    
    form.setValue('bigDataText', '');
    toast({ 
        title: 'Points Parsed Successfully', 
        description: `Added ${newPoints.length} points to the ${routeDirection} ${activeTab} list.` 
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!service) return null;

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.back()}
            className="h-10 w-10 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Route Points Manager</h1>
            <div className="flex items-center gap-2 text-muted-foreground mt-1">
              <Bus className="h-4 w-4" />
              <span className="font-medium">{service.origin}</span>
              <ChevronRight className="h-3 w-3" />
              <span className="font-medium">{service.destination}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <Hash className="h-3 w-3" />
                <span className="text-xs font-mono font-bold text-green-800">{serviceId}</span>
            </div>
          </div>
        </div>

        <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button
              disabled={isSaving || isSaved}
              size="lg"
              className={`h-10 px-6 transition-all duration-300 ${isSaved ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
            >
              {isSaved ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? 'Saving...' : 'Save All Changes'}
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Save Route Changes?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently save all boarding and dropping points for both forward and return routes. Are you sure you want to proceed?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button 
                onClick={(e) => {
                  e.preventDefault();
                  form.handleSubmit(onSubmit, (errors) => {
                      let errMessages = [];
                      Object.keys(errors).forEach(key => {
                          if (errors[key]?.type === 'array') {
                              errors[key].forEach((err, idx) => {
                                  if (err) errMessages.push(`${key}[${idx}] failed`);
                              });
                          } else {
                              errMessages.push(key);
                          }
                      });
                      toast({ title: 'Validation Error', description: `Check fields: ${JSON.stringify(errors).substring(0, 150)}`, variant: 'destructive' });
                      setIsDialogOpen(false);
                  })();
                }}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Confirm Save'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Route Direction Selector */}
      <Card className="border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              className="flex-1 h-12 justify-start px-6"
              variant={routeDirection === 'forward' ? 'default' : 'outline'}
              onClick={() => setRouteDirection('forward')}
            >
              <div className="flex items-center gap-3 w-full">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Navigation className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Forward Route</div>
                  <div className="text-xs text-muted-foreground">{service.origin} → {service.destination}</div>
                </div>
              </div>
            </Button>
            <Button
              className="flex-1 h-12 justify-start px-6"
              variant={routeDirection === 'return' ? 'default' : 'outline'}
              onClick={() => setRouteDirection('return')}
            >
              <div className="flex items-center gap-3 w-full">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <Navigation className="h-4 w-4 text-green-600 dark:text-green-400 rotate-180" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Return Route</div>
                  <div className="text-xs text-muted-foreground">{service.destination} → {service.origin}</div>
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Additional Information / Bulk Import</CardTitle>
                <CardDescription>Paste list of points here to auto-fill (Format: Number, Time, City, Description)</CardDescription>
              </div>
              <Button type="button" variant="secondary" onClick={handleParseData}>
                Parse into {routeDirection === 'forward' ? 'Forward' : 'Return'} {activeTab === 'boarding' ? 'Boarding' : 'Dropping'}
              </Button>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="bigDataText"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter big data text here..." 
                        className="min-h-[120px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                <div className="border-b">
                  <TabsList className="h-12 bg-transparent p-0 w-full">
                    <TabsTrigger
                      value="boarding"
                      className="flex-1 h-12 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 rounded-none"
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span className="font-medium">Boarding Points</span>
                      </div>
                    </TabsTrigger>
                    <TabsTrigger
                      value="dropping"
                      className="flex-1 h-12 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-green-500 data-[state=active]:text-green-600 rounded-none"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span className="font-medium">Dropping Points</span>
                      </div>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-6">
                  <TabsContent value="boarding" className="mt-0 space-y-4">
                    <div className={routeDirection === 'forward' ? 'block' : 'hidden'}>
                      <PointFormArray
                        form={form}
                        name="boardingPointsForward"
                        title="Boarding Points - Forward Route"
                        description="Passenger pickup locations for the forward journey"
                      />
                    </div>
                    <div className={routeDirection === 'return' ? 'block' : 'hidden'}>
                      <PointFormArray
                        form={form}
                        name="boardingPointsReturn"
                        title="Boarding Points - Return Route"
                        description="Passenger pickup locations for the return journey"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="dropping" className="mt-0 space-y-4">
                    <div className={routeDirection === 'forward' ? 'block' : 'hidden'}>
                      <PointFormArray
                        form={form}
                        name="droppingPointsForward"
                        title="Dropping Points - Forward Route"
                        description="Passenger drop-off locations for the forward journey"
                      />
                    </div>
                    <div className={routeDirection === 'return' ? 'block' : 'hidden'}>
                      <PointFormArray
                        form={form}
                        name="droppingPointsReturn"
                        title="Dropping Points - Return Route"
                        description="Passenger drop-off locations for the return journey"
                      />
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
