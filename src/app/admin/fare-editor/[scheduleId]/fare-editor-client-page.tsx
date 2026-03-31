
'use client';

import { useRouter } from "next/navigation";
import { useSchedule as useScheduleHook } from "@/hooks/use-schedule";
import { FareScheduler } from "@/components/ui/fare-scheduler-layout";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dataService } from "@/lib/data/client-service";
import type { Bus } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

export default function FareEditorClientPage({ scheduleId }: { scheduleId: string }) {
    const router = useRouter();
    const { toast } = useToast();
    
    const { schedule, isLoading: isScheduleLoading, refresh: refreshSchedule } = useScheduleHook(scheduleId);
    const [bus, setBus] = useState<Bus | null>(null);
    const [loadingBus, setLoadingBus] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // This state will hold the fare overrides from the FareScheduler
    const [fareOverrides, setFareOverrides] = useState<{[key: string]: number}>({});

    useEffect(() => {
        async function fetchBusDetails() {
            if (schedule?.busId) {
                setLoadingBus(true);
                const busData = await dataService.getBusById(schedule.busId);
                setBus(busData);
                setLoadingBus(false);
            } else if (!isScheduleLoading) {
                setLoadingBus(false);
            }
        }
        fetchBusDetails();
    }, [schedule, isScheduleLoading]);
    
    const handleFareChange = (newOverrides: { [key: string]: number }) => {
      setFareOverrides(prev => ({
        ...prev,
        ...newOverrides
      }));
    };

    const handleSaveFares = async () => {
        if (!schedule || Object.keys(fareOverrides).length === 0) {
            toast({ title: "No Changes", description: "No new fares to save." });
            return;
        }
        setIsSaving(true);
        try {
            const newSeatPrices = { ...schedule.seatPrices, ...fareOverrides };
            const validPrices = Object.values(newSeatPrices).filter(p => typeof p === 'number' && p > 0);
            const newBaseFare = validPrices.length > 0 ? Math.min(...validPrices) : schedule.fare;

            await dataService.updateScheduleSeatPrices(schedule.id, newSeatPrices, newBaseFare);
            
            toast({
                title: "Fares Updated!",
                description: "The new seat prices have been saved for this schedule.",
            });

            // Reset local overrides and refresh data from the server
            setFareOverrides({});
            await refreshSchedule();

        } catch(error) {
            console.error("Failed to save fares", error);
            toast({
                title: "Save Failed",
                description: "Could not update the seat prices.",
                variant: "destructive",
            })
        } finally {
            setIsSaving(false);
        }
    };

    const isLoading = isScheduleLoading || loadingBus;

    if (isLoading) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-6">
                    <Skeleton className="h-8 w-1/3" />
                    <Skeleton className="h-10 w-24" />
                </div>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-1/4" />
                    </CardHeader>
                    <CardContent className="p-6 flex justify-center">
                        <Skeleton className="h-96 w-full max-w-4xl" />
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (!schedule || !bus) {
        return <div className="p-10 text-center">Schedule or bus not found.</div>
    }

    // Apply local overrides to the schedule for display
    const displaySchedule = {
      ...schedule,
      seatPrices: { ...schedule.seatPrices, ...fareOverrides },
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/schedules?busId=${bus.id}`)} className="mb-2">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Schedules
                    </Button>
                    <h1 className="text-3xl font-bold font-headline">Fare Editor</h1>
                    <p className="text-muted-foreground">Set custom fares for {bus.travelsName} on {schedule.date}</p>
                </div>
                <Button onClick={handleSaveFares} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Fares'}
                </Button>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Seat & Fare Layout</CardTitle>
                    <CardDescription>Click on a fare to edit it. You can set prices for different sections or individual seats.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 flex justify-center">
                    <FareScheduler 
                        bus={bus} 
                        schedule={displaySchedule} 
                        onFareChange={handleFareChange}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
