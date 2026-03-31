'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfDay, addDays, isBefore } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Bus,
  PlusCircle,
  Route,
  Settings,
  Calendar as CalendarIcon,
  Pencil,
  Trash2,
  ArrowLeftRight,
  Upload,
  X,
  ImageIcon,
  Loader2,
} from 'lucide-react';
import { useToast, toast } from '@/hooks/use-toast';
import type { Bus as BusType, Schedule, Service } from '@/lib/types';
import { dataService } from '@/lib/data/client-service';
import { useFirebase } from '@/firebase';
import Loading from './loading';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
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
import { Separator } from '@/components/ui/separator';
import { generateIndianSleeper36Layout } from '@/lib/seat-layouts/indianSleeper36';
import { Badge } from '@/components/ui/badge';
import { scheduleRoundTripMonthAction, swapBusRotationForServiceAction } from '@/lib/actions/schedule-actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import Image from 'next/image';

/* ---------------- IMAGE UPLOADER SUB-COMPONENT ---------------- */
function BusImageUploader({
  label,
  urls,
  onUrlsChange,
  onUpload,
}: {
  label: string;
  urls: string[];
  onUrlsChange: (urls: string[]) => void;
  onUpload: (file: File, onProgress?: (p: number, e?: number) => void) => Promise<string>;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatETA = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const allowedExtensions = ['.jpg', '.jpeg', '.png'];
    const fileList = Array.from(files).filter(file => {
        const name = file.name.toLowerCase();
        return allowedExtensions.some(ext => name.endsWith(ext));
    });

    if (fileList.length === 0) return; // Browser 'accept' handles most, silent fallback here

    setUploading(true);
    setProgress(0);
    setEta(null);
    try {
      const newUrls: string[] = [];
      
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const url = await onUpload(file, (p, e) => {
            setProgress(p);
            if (e !== undefined) setEta(e);
        });
        newUrls.push(url);
        console.log(`Uploaded file ${i+1}/${fileList.length}:`, url);
      }
      onUrlsChange([...urls, ...newUrls]);
      console.log('Updated URLs list:', [...urls, ...newUrls]);
    } catch (error) {
      console.error('Upload failed debug:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred during upload.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      setProgress(0);
      setEta(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeUrl = (idx: number) => {
    onUrlsChange(urls.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ImageIcon className="h-4 w-4" />
          {label}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="h-8 border-dashed hover:border-primary hover:text-primary transition-colors"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <PlusCircle className="h-4 w-4 mr-2" />
          )}
          {uploading ? 'Uploading…' : urls.length > 0 ? 'Add More' : 'Add Images'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {uploading && (
        <div className="space-y-2 py-1">
            <div className="flex justify-between text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Uploading… {Math.round(progress)}%</span>
                {eta !== null && eta > 0 && <span>ETA: {formatETA(eta)}</span>}
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div 
                    className="h-full bg-primary transition-all duration-300 ease-out" 
                    style={{ width: `${progress}%` }} 
                />
            </div>
        </div>
      )}

      {urls.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {urls.map((url, idx) => (
            <div key={idx} className="relative group w-20 h-16 rounded-lg overflow-hidden border border-gray-200">
              <Image src={url} alt={`img-${idx}`} fill className="object-cover" sizes="80px" />
              <button
                type="button"
                onClick={() => removeUrl(idx)}
                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No images yet. Click "Add Images" to upload.</p>
      )}
    </div>
  );
}


const busFormSchema = z.object({
  travelsName: z.string().min(2, 'Travels name is required.'),
  operatorName: z.string().min(2, 'Operator name is required.'),
  busNumber: z.string().min(1, 'Bus number is required.'),
  busType: z.string().optional(),
  busModel: z.string().optional(),
  cabinCrewId: z.string().optional(),
  serviceId: z.string().optional(),
});

type BusFormValues = z.infer<typeof busFormSchema>;

function BusFormDialog({
  open,
  onOpenChange,
  onSave,
  bus,
  oppositeBus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (busData: BusType, isOpposite: boolean) => void;
  bus?: BusType | null;
  oppositeBus?: boolean;
}) {
  const router = useRouter();
  const { user } = useFirebase();
  const form = useForm<BusFormValues>({
    resolver: zodResolver(busFormSchema),
    defaultValues: {
      travelsName: '',
      operatorName: '',
      busNumber: '',
      busType: 'A/C Sleeper(2+1)',
      busModel: 'BharatBenz Glider',
      cabinCrewId: '',
      serviceId: '',
    },
  });

  const [busImages, setBusImages] = useState<string[]>([]);
  const [operatorImages, setOperatorImages] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      if (bus) {
        form.reset({
          travelsName: bus.travelsName || '',
          operatorName: bus.operator || '',
          busNumber: bus.busNumber || '',
          busType: bus.busType || '',
          busModel: bus.busModel || '',
          cabinCrewId: bus.cabinCrewId || '',
          serviceId: bus.serviceId || '',
        });
        setBusImages(bus.images || []);
        setOperatorImages(bus.operatorImages || []);
      } else {
        form.reset({
          travelsName: '',
          operatorName: '',
          busNumber: '',
          busType: 'A/C Sleeper(2+1)',
          busModel: 'BharatBenz Glider',
          cabinCrewId: '',
          serviceId: '',
        });
        setBusImages([]);
        setOperatorImages([]);
      }
    }
  }, [bus, oppositeBus, open, form]);

  const handleSave = (values: BusFormValues) => {
    const newBusData: Partial<BusType> = {
      ...bus,
      travelsName: values.travelsName,
      operator: values.operatorName,
      busNumber: values.busNumber,
      busType: values.busType,
      busModel: values.busModel,
      cabinCrewId: values.cabinCrewId,
      serviceId: values.serviceId,
      images: busImages,
      operatorImages: operatorImages,
      id: bus?.id && !oppositeBus ? bus.id : values.busNumber.replace(/\s+/g, ''),
    };

    if (!newBusData.id) {
      return;
    }

    if (!bus || oppositeBus) { // If it's a new bus or an opposite route for an existing bus
      newBusData.seatLayout = generateIndianSleeper36Layout();
      newBusData.totalSeats = 36;
      newBusData.baseFare = 1500;
      newBusData.rating = 4.5;
      newBusData.amenities = ['A/C', 'Live Tracking', 'Water Bottle', 'Charging Point'];
      newBusData.busCategory = 'Sleeper';
      if(bus) {
        newBusData.serviceId = bus.serviceId;
        newBusData.origin = bus.destination;
        // @ts-ignore
        newBusData.destination = bus.origin;
      }
    }

    onSave(newBusData as BusType, !!oppositeBus);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
        <div className="p-6 pb-0">
            <DialogHeader>
            <DialogTitle>{bus && !oppositeBus ? 'Edit Bus' : 'Add New Bus'}</DialogTitle>
            <DialogDescription>
                {oppositeBus
                ? `Adding the return trip for ${bus?.travelsName}.`
                : 'Fill in the details of the bus service.'}
            </DialogDescription>
            </DialogHeader>
        </div>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSave)}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-muted-foreground/20">
                <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="travelsName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Travels Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Anand Travels" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="operatorName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Operator Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Your Company Inc" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="busNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bus Number</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. KL 05 BC 9435" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="busType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bus Type</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. A/C Sleeper (2+1)" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <FormField
                    control={form.control}
                    name="busModel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bus Model</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. BharatBenz" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cabinCrewId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cabin Crew ID</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="crew@example.com"/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                    <FormField
                      control={form.control}
                      name="serviceId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service ID (Route ID)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g. punalur-bangalore" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                </div>

                {bus && !oppositeBus && (
                  <div className="space-y-6 pt-4">
                    <Separator />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Image Gallery</h3>
                    <div className="grid grid-cols-1 gap-6">
                       <BusImageUploader
                         label="Bus-Specific Images"
                         urls={busImages}
                         onUrlsChange={setBusImages}
                         onUpload={(file, pCb) => dataService.uploadBusImage(bus.id, file, pCb)}
                       />
                       <BusImageUploader
                          label="Operator Images (Shared)"
                          urls={operatorImages}
                          onUrlsChange={setOperatorImages}
                          onUpload={(file, pCb) => dataService.uploadOperatorImage(user?.uid as string, file, pCb)}
                       />
                    </div>
                  </div>
                )}
            </div>

            <DialogFooter className="p-6 pt-4 border-t bg-muted/10 backdrop-blur-sm self-stretch">
              <div className="flex w-full justify-between items-center gap-4">
                <div>
                  {bus && !oppositeBus && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push(`/admin/rest-stops/${bus.id}`)}
                      className="hover:bg-primary/5"
                    >
                      <Route className="mr-2 h-4 w-4" />
                      Rest Stops
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" className="min-w-[100px]">Save Changes</Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function MonthlyScheduleDialog({
  forwardBus,
  returnBus,
  serviceId,
}: {
  forwardBus?: BusType;
  returnBus?: BusType;
  serviceId: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  const handleGenerate = async () => {
    if (!forwardBus || !returnBus || !serviceId) {
      toast({
        title: 'Missing Information',
        description: 'Both forward and return buses must be defined for this service.',
        variant: 'destructive',
      });
      return;
    }
    setIsGenerating(true);
    try {
      await scheduleRoundTripMonthAction(
        forwardBus.id,
        returnBus.id,
        serviceId,
        selectedYear,
        selectedMonth
      );
  
      toast({
        title: 'Schedules Generated',
        description: `Schedules for ${format(new Date(selectedYear, selectedMonth), 'MMMM yyyy')} have been created.`,
      });
      
      setIsOpen(false);
      router.push(`/admin/schedules?serviceId=${serviceId}`);

    } catch (e: any) {
      console.error(e);
      toast({
        title: 'Scheduling Failed',
        description: e.message || 'Could not generate schedules.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const months = Array.from({ length: 12 }, (_, i) => new Date(0, i).toLocaleString('default', { month: 'long' }));
  const years = Array.from({ length: 5 }, (_, i) => currentYear + i);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CalendarIcon className="mr-2 h-4 w-4" />
          Monthly Schedule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Monthly Schedules</DialogTitle>
          <DialogDescription>
            Create alternating schedules for a full month. Existing schedules will not be overwritten.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="month">Month</Label>
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger id="month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((month, index) => (
                  <SelectItem key={month} value={String(index)}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="year">Year</Label>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger id="year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(year => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate Schedules'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ---------------- MAIN PAGE ---------------- */

export function TripsClientPage() {
  const router = useRouter();
  const { user, isUserLoading } = useFirebase();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [buses, setBuses] = useState<BusType[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<BusType | null>(null);
  const [isOpposite, setIsOpposite] = useState(false);
  
  const { trips, unlinkedBuses } = useMemo(() => {
    const serviceMap = new Map<string, BusType[]>();
    const unlinked: BusType[] = [];

    buses.forEach((bus) => {
        if (bus.serviceId) {
            if (!serviceMap.has(bus.serviceId)) {
                serviceMap.set(bus.serviceId, []);
            }
            serviceMap.get(bus.serviceId)!.push(bus);
        } else {
            unlinked.push(bus);
        }
    });

    return { trips: Array.from(serviceMap.values()), unlinkedBuses: unlinked };
  }, [buses]);

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) {
      setLoading(false);
      setIsAdmin(false);
      return;
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const unsubSchedules = dataService.onSchedulesForDateSnapshot(todayStr, setSchedules, (err) => {
        console.error("Failed to load schedules", err);
    });

    const unsubServices = dataService.onServicesSnapshot(setServices, (err) => {
        console.error("Failed to load services", err);
    });

    const unsubscribe = dataService.onBusesSnapshot(
      async (allBuses) => {
        const adminStatus = await dataService.isAdmin(user.uid);
        setIsAdmin(adminStatus);
        if (adminStatus) {
          const operatorBuses = await dataService.getBusesByOperator(
            user.uid,
            user.displayName || ''
          );
          setBuses(operatorBuses);
          setLoading(false);
        } else {
          setLoading(false);
        }
      },
      (error) => {
        console.error('Error fetching buses:', error);
        setLoading(false);
      }
    );

    return () => {
        unsubscribe();
        unsubSchedules();
        unsubServices();
    };
  }, [user, isUserLoading]);

  const handleOpenForm = (bus?: BusType | null, isOppositeRoute = false) => {
    setEditingBus(bus || null);
    setIsOpposite(isOppositeRoute);
    setIsFormOpen(true);
  };

  const handleSaveBus = async (busData: BusType, isOpposite: boolean) => {
    try {
      const dataToSave: BusType = {
        ...busData,
        operatorId: user?.uid as string,
      };

      console.log('Final data to save (Persistence check):', {
        busId: dataToSave.id,
        imagesCount: dataToSave.images?.length,
        operatorImagesCount: dataToSave.operatorImages?.length,
        images: dataToSave.images
      });

      if (dataToSave.serviceId) {
        const service = await dataService.getServiceById(dataToSave.serviceId);
        if (service) {
            if (isOpposite && editingBus) {
                dataToSave.origin = editingBus.destination;
                dataToSave.destination = editingBus.origin;
            } else {
                dataToSave.origin = service.origin;
                dataToSave.destination = service.destination;
            }
          dataToSave.boardingPointsForward = service.boardingPointsForward;
          dataToSave.droppingPointsForward = service.droppingPointsForward;
          dataToSave.boardingPointsReturn = service.boardingPointsReturn;
          dataToSave.droppingPointsReturn = service.droppingPointsReturn;
        }
      }

      await dataService.addBus(dataToSave);

      // If operator images changed, update all buses for this operator
      if (editingBus && JSON.stringify(dataToSave.operatorImages) !== JSON.stringify(editingBus.operatorImages)) {
        await dataService.updateOperatorImages(user?.uid as string, dataToSave.operatorImages || []);
      }

      toast({ title: 'Bus details saved successfully' });
      setIsFormOpen(false);
    } catch (e: any) {
      toast({
        title: 'Failed to save bus',
        description: e.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteBus = async (busId: string) => {
    try {
      await dataService.deleteBusAndSchedules(busId);
      toast({
        title: 'Bus Deleted',
        description: 'The bus and its associated schedules have been removed.',
      });
    } catch (error: any) {
      toast({
        title: 'Deletion Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };
  
  const handleSwap = async (serviceId: string) => {
    try {
      const result = await swapBusRotationForServiceAction(serviceId);
      if (result.success) {
        toast({
          title: 'Bus Rotation Swapped',
          description: result.message,
        });
      } else {
        throw new Error(result.message);
      }
    } catch (e: any) {
      toast({
        title: 'Swap Failed',
        description: e.message,
        variant: 'destructive',
      });
    }
  };

  if (loading || isUserLoading || isAdmin === null) return <Loading />;
  if (!isAdmin) return <p>Access denied</p>;

  return (
    <div className="container mx-auto px-4 py-8">
      <BusFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSave={handleSaveBus}
        bus={editingBus}
        oppositeBus={isOpposite}
      />
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Bus /> Available Buses & Trips
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push('/admin/routes/new')}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Define New Service
              </Button>
              <Button onClick={() => handleOpenForm(null)}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Bus
              </Button>
            </div>
          </div>
          <CardDescription>
            {buses.length} buses configured for your account. Trips are grouped by service.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {trips.map((group, i) => {
            const serviceId = group[0].serviceId;
            const service = services.find(s => s.id === serviceId);
            
            // Stable identify buses based on service configuration
            // This ensures they "interchange" visually when forwardBusId swaps
            const primaryBus = group.find(b => b.id === service?.forwardBusId) || group[0];
            const returnBus = group.find(b => b.id !== primaryBus.id);
            
            const serviceOrigin = service?.origin || primaryBus.origin;
            const serviceDestination = service?.destination || primaryBus.destination;
            
            return (
              <div key={serviceId || i} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{primaryBus.travelsName}</h3>
                        <Badge className="bg-green-800 text-white hover:bg-green-700">{serviceId}</Badge>
                    </div>
                   <div className="flex items-center gap-2">
                       {serviceId && (
                           <>
                               <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/route/${serviceId}`)}>
                                   <Route className="mr-2 h-4 w-4" />
                                   Route
                               </Button>
                               <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/schedules?serviceId=${serviceId}`)}>
                                   <CalendarIcon className="mr-2 h-4 w-4" />
                                   Schedules
                               </Button>
                           </>
                       )}
                   </div>
                </div>
                
                {/* Interchange logic: Primary (Forward) always on top */}
                <BusRow
                  bus={primaryBus}
                  isForward={true}
                  onEdit={handleOpenForm}
                  onDelete={handleDeleteBus}
                  schedules={schedules}
                  serviceOrigin={serviceOrigin}
                  serviceDestination={serviceDestination}
                />
                
                {returnBus ? (
                  <>
                    <div className="flex items-center justify-center my-2">
                       <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Swap bus rotation for all future schedules"
                            >
                              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Swap Bus Rotation?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will interchange the buses assigned to Forward and Return roles for all
                                future dates. The visual positions in this list will also swap.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleSwap(serviceId!)}>
                                Confirm Swap
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </div>
                    <BusRow
                      bus={returnBus}
                      isForward={false}
                      onEdit={handleOpenForm}
                      onDelete={handleDeleteBus}
                      schedules={schedules}
                      serviceOrigin={serviceOrigin}
                      serviceDestination={serviceDestination}
                    />
                  </>
                ) : (
                   <Button
                    variant="link"
                    className="w-full"
                    onClick={() => handleOpenForm(primaryBus, true)}
                  >
                    + Add Opposite Route
                  </Button>
                )}

                {serviceId && (
                  <div className="border-t pt-4 mt-4 flex justify-between items-center">
                    <p className="text-sm font-medium">Rotation Schedule</p>
                    <MonthlyScheduleDialog
                      serviceId={serviceId}
                      forwardBus={primaryBus}
                      returnBus={returnBus}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {unlinkedBuses.length > 0 && (
            <div>
              <Separator className="my-6" />
              <h3 className="text-lg font-semibold mb-4">Unlinked Buses</h3>
              {unlinkedBuses.map((bus) => (
                  <BusRow
                    key={bus.id}
                    bus={bus}
                    onEdit={handleOpenForm}
                    onDelete={handleDeleteBus}
                    schedules={schedules}
                  />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const BusRow = ({
  bus,
  schedules,
  onEdit,
  onDelete,
  serviceOrigin,
  serviceDestination,
  isForward,
}: {
  bus: BusType;
  schedules: Schedule[];
  onEdit: (bus: BusType, isOpposite?: boolean) => void;
  onDelete: (busId: string) => void;
  serviceOrigin?: string;
  serviceDestination?: string;
  isForward?: boolean;
}) => {
  const router = useRouter();

  // Find if this specific bus is running today
  const todaysSchedule = useMemo(() => {
    return schedules.find(s => s.actualBusId === bus.id);
  }, [schedules, bus.id]);

  const routeText = useMemo(() => {
    // If a trip is scheduled for today, show exactly what it is doing
    if (todaysSchedule) {
        if (serviceOrigin && serviceDestination) {
            return todaysSchedule.direction === 'FORWARD'
                ? `${serviceOrigin} → ${serviceDestination}`
                : `${serviceDestination} → ${serviceOrigin}`;
        }
        return `${bus.origin} → ${bus.destination}`;
    }

    // If NOT scheduled, show the "intended" route based on assigned role (isForward)
    let baseOrigin = bus.origin;
    let baseDestination = bus.destination;

    if (serviceOrigin && serviceDestination && isForward !== undefined) {
        if (isForward) {
          baseOrigin = serviceOrigin;
          baseDestination = serviceDestination;
        } else {
          baseOrigin = serviceDestination;
          baseDestination = serviceOrigin;
        }
    }

    return `${baseOrigin} → ${baseDestination} (Not Running TODAY)`;
  }, [todaysSchedule, serviceOrigin, serviceDestination, bus.origin, bus.destination, isForward]);

  return (
    <div className="flex justify-between items-center p-2 rounded-md hover:bg-muted/50">
      <div className="flex items-center gap-4">
        <div>
          <div className="bg-yellow-400 text-black font-mono text-sm font-bold px-2 py-1 rounded-md border-2 border-black inline-block">
            {bus.busNumber}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
             {routeText}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => router.push(`/admin/features/${bus.id}`)}
        >
          <Settings className="mr-2 h-4 w-4" />
          Features
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onEdit(bus)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the bus and all of its associated schedules.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(bus.id)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};
