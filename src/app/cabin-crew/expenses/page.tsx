
'use client';

import React, {
  useState,
  useEffect,
  Suspense,
  useMemo,
  useRef,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  PlusCircle,
  History,
  Fuel,
  Wrench,
  Car,
  ParkingSquare,
  AlertTriangle,
  MoreHorizontal,
  IndianRupee,
  Calendar,
  Clock,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { dataService } from '@/lib/data/client-service';
import type { Expense, Bus as BusType } from '@/lib/types';
import MileageCalculator from '@/components/EnhancedMileageCalculator';
import { format, isValid, parseISO } from 'date-fns';

const expenseSchema = z.object({
  type: z.enum(['fuel', 'service', 'repair', 'parking', 'fine', 'other']),
  amount: z.coerce.number().min(1, 'Amount is required'),
  litres: z.coerce.number().optional(),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof expenseSchema>;

const expenseIcons = {
  fuel: Fuel,
  service: Wrench,
  repair: Car,
  parking: ParkingSquare,
  fine: AlertTriangle,
  other: MoreHorizontal,
};

const expenseColors = {
  fuel: 'bg-blue-100 text-blue-800 border-blue-200',
  service: 'bg-green-100 text-green-800 border-green-200',
  repair: 'bg-red-100 text-red-800 border-red-200',
  parking: 'bg-purple-100 text-purple-800 border-purple-200',
  fine: 'bg-amber-100 text-amber-800 border-amber-200',
  other: 'bg-gray-100 text-gray-800 border-gray-200',
};

// Helper function to safely format dates
const safeFormatDate = (dateString: string | undefined | null) => {
  if (!dateString) return 'Invalid date';
  
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return 'Invalid date';
    return format(date, 'MMM dd, yyyy');
  } catch {
    return 'Invalid date';
  }
};

// Helper function to safely format time
const safeFormatTime = (dateString: string | undefined | null) => {
  if (!dateString) return 'Invalid time';
  
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return 'Invalid time';
    return format(date, 'hh:mm a');
  } catch {
    return 'Invalid time';
  }
};

// Helper function to check if a date is valid
const isValidDate = (dateString: string | undefined | null) => {
  if (!dateString) return false;
  
  try {
    const date = parseISO(dateString);
    return isValid(date);
  } catch {
    return false;
  }
};

// Function to generate a unique key for expenses
const getExpenseKey = (expense: Expense, index: number) => {
  if (expense.id && expense.id !== '') {
    return expense.id;
  }
  // Fallback to timestamp + index for expenses without proper IDs
  return `${expense.timestamp || 'no-timestamp'}_${index}_${expense.type}`;
};

function ExpensePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const busId = searchParams.get('busId');
  const { toast } = useToast();

  const [bus, setBus] = useState<BusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'add' | 'history'>('add');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const optimisticIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!busId) {
      setLoading(false);
      return;
    }

    const unsubscribe = dataService.onBusSnapshot(
      busId,
      (busData) => {
        if (
          optimisticIdRef.current &&
          !busData?.expenses?.some(
            (e) => e.id === optimisticIdRef.current
          )
        ) {
          return;
        }

        optimisticIdRef.current = null;
        setBus(busData);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [busId]);

  const form = useForm<FormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      type: 'fuel',
      description: '',
      amount: '' as any,
      litres: '' as any,
    },
  });

  const expenseType = form.watch('type');

  const onSubmit = async (data: FormValues) => {
    if (!bus) return;

    setIsSubmitting(true);

    const tempId = `temp_${Date.now()}`;
    optimisticIdRef.current = tempId;

    const optimisticExpense: Expense = {
      ...data,
      id: tempId,
      timestamp: new Date().toISOString(),
      description: data.description || data.type,
    };

    setBus((prev) =>
      prev
        ? {
            ...prev,
            expenses: [
              optimisticExpense,
              ...(prev.expenses || []),
            ],
          }
        : prev
    );

    setActiveTab('history');

    try {
      await dataService.addExpenseToBus(bus.id, optimisticExpense);

      toast({
        title: 'Expense added successfully',
        description: 'New expense has been recorded',
      });

      form.reset({
        type: 'fuel',
        description: '',
        amount: '' as any,
        litres: '' as any,
      });
    } catch (error) {
      setBus((prev) =>
        prev
          ? {
              ...prev,
              expenses: prev.expenses.filter(
                (e) => e.id !== tempId
              ),
            }
          : prev
      );

      optimisticIdRef.current = null;

      toast({
        title: 'Failed to add expense',
        description: 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalExpenses = useMemo(
    () =>
      bus?.expenses?.reduce(
        (sum, e) => sum + e.amount,
        0
      ) || 0,
    [bus?.expenses]
  );

  const recentExpenses = useMemo(
    () => bus?.expenses?.slice(0, 5) || [],
    [bus?.expenses]
  );

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-48 lg:col-span-2" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!bus) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Bus not found</h3>
            <p className="text-muted-foreground mb-6">The requested bus could not be located</p>
            <Button onClick={() => router.back()} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => router.back()}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Expense Management</h1>
            <div className="flex items-center gap-2 mt-1">
                <p className="text-muted-foreground">{bus.travelsName}</p>
                <div className="bg-yellow-400 text-black font-mono text-sm font-bold px-2 py-1 rounded-md border-2 border-black inline-block">
                    {bus.busNumber}
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Form */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlusCircle className="h-5 w-5" />
                Add New Expense
              </CardTitle>
              <CardDescription>
                Record fuel, maintenance, and other operational costs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as any)}
                className="w-full"
              >
                <TabsList className="grid grid-cols-2 mb-6">
                  <TabsTrigger value="add" className="flex items-center gap-2">
                    <PlusCircle className="h-4 w-4" />
                    Add Expense
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Expense History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="add" className="space-y-6">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          name="type"
                          control={form.control}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-headline">Expense Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger className="h-11">
                                  <div className="flex items-center gap-2">
                                    {field.value && expenseIcons[field.value] && 
                                      React.createElement(expenseIcons[field.value], { className: "h-4 w-4" })
                                    }
                                    <SelectValue placeholder="Select type" />
                                  </div>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="fuel" className="flex items-center gap-2">
                                    Fuel
                                  </SelectItem>
                                  <SelectItem value="service" className="flex items-center gap-2">
                                    <Wrench className="h-4 w-4" />
                                    Service
                                  </SelectItem>
                                  <SelectItem value="repair" className="flex items-center gap-2">
                                    <Car className="h-4 w-4" />
                                    Repair
                                  </SelectItem>
                                  <SelectItem value="parking" className="flex items-center gap-2">
                                    <ParkingSquare className="h-4 w-4" />
                                    Parking
                                  </SelectItem>
                                  <SelectItem value="fine" className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    Fine
                                  </SelectItem>
                                  <SelectItem value="other" className="flex items-center gap-2">
                                    <MoreHorizontal className="h-4 w-4" />
                                    Other
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          name="amount"
                          control={form.control}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-headline">Amount (₹)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="Enter amount"
                                  className="h-11"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {expenseType === 'fuel' && (
                        <FormField
                          name="litres"
                          control={form.control}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-headline">Fuel Quantity (Litres)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="Enter litres"
                                  className="h-11"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <FormField
                        name="description"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-headline">Description (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Add notes about this expense"
                                className="h-11"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex gap-3 pt-4">
                        <Button 
                          type="submit" 
                          disabled={isSubmitting}
                          className="flex-1 h-11"
                        >
                          {isSubmitting ? (
                            <>
                              <span className="animate-spin mr-2">⟳</span>
                              Processing...
                            </>
                          ) : (
                            <>
                              <PlusCircle className="mr-2 h-4 w-4" />
                              Add Expense
                            </>
                          )}
                        </Button>
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => form.reset()}
                          className="h-11"
                        >
                          Clear
                        </Button>
                      </div>
                    </form>
                  </Form>

                  {expenseType === 'fuel' && (
                    <div className="mt-8 pt-6 border-t">
                      <MileageCalculator />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                  <div className="space-y-3">
                    {bus.expenses?.map((expense, index) => {
                      const ExpenseIcon = expenseIcons[expense.type] || MoreHorizontal;
                      const hasValidDate = isValidDate(expense.timestamp);
                      const expenseKey = getExpenseKey(expense, index);
                      
                      return (
                        <Card key={expenseKey} className="overflow-hidden hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${expenseColors[expense.type]}`}>
                                  <ExpenseIcon className="h-4 w-4" />
                                </div>
                                <div>
                                  <div className="font-semibold capitalize">
                                    {expense.description || expense.type}
                                  </div>
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                                    <Badge variant="outline" className={`text-xs ${expenseColors[expense.type]}`}>
                                      {expense.type}
                                    </Badge>
                                    {hasValidDate ? (
                                      <>
                                        <div className="flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {safeFormatDate(expense.timestamp)}
                                        </div>
                                        <span className="text-xs">•</span>
                                        <div className="flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          {safeFormatTime(expense.timestamp)}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-xs text-amber-600">
                                        Date not available
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold flex items-center justify-end">
                                  <IndianRupee className="h-4 w-4 mr-1" />
                                  {expense.amount.toLocaleString('en-IN')}
                                </div>
                                {expense.type === 'fuel' && expense.litres && (
                                  <div className="text-sm text-muted-foreground">
                                    {expense.litres} L
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                    
                    {(!bus.expenses || bus.expenses.length === 0) && (
                      <div className="text-center py-12">
                        <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No expenses yet</h3>
                        <p className="text-muted-foreground">Start by adding your first expense</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Stats & Recent */}
        <div className="space-y-6">
        </div>
      </div>
    </div>
  );
}

export default function ExpensePageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <div className="space-y-6">
            <Skeleton className="h-12 w-64" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Skeleton className="h-48 lg:col-span-2" />
              <Skeleton className="h-48" />
            </div>
          </div>
        </div>
      }
    >
      <ExpensePageContent />
    </Suspense>
  );
}
