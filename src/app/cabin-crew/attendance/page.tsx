

'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  UserCheck,
  Frown,
  CheckCircle2,
  LogOut,
  Flame,
  Lock,
  Play,
  StopCircle,
  ArrowRight,
} from 'lucide-react';
import { format } from 'date-fns';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import type { Schedule, Bus } from '@/lib/types';
import { cn } from '@/lib/utils';
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
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useSchedule as useScheduleHook } from '@/hooks/use-schedule';

type Duty = 'first' | 'second' | null;

type CrewMember = {
  role: 'driver1' | 'driver2' | 'cleaner1' | 'cleaner2';
  name: string;
  checkedIn: boolean;
  onHotseat: boolean;
  duty: Duty;
  dutyLocked: boolean;
};

function AttendancePageContent() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get('tripId');
  const router = useRouter();
  const { toast } = useToast();

  const { schedule, isLoading: isScheduleLoading } =
    useScheduleHook(tripId || undefined);

  const [bus, setBus] = useState<Bus | null>(null);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loadingBus, setLoadingBus] = useState(true);

  useEffect(() => {
    async function fetchBus() {
      if (schedule?.busId) {
        const busData = await dataService.getBusById(schedule.busId);
        setBus(busData);
      }
      setLoadingBus(false);
    }
    if (schedule) fetchBus();
  }, [schedule]);

  const refreshCrewState = useCallback(async () => {
    if (!schedule) return;
    const updatedSchedule = await dataService.getSchedule(schedule.id);
    if (updatedSchedule && bus) {
      const attendance = updatedSchedule.attendance || {};
      const newCrewList: CrewMember[] = [];
      const add = (role: CrewMember['role'], name?: string | null) => {
        if (!name) return;
        const record = attendance[role];
        newCrewList.push({
          role,
          name,
          checkedIn: !!record,
          onHotseat: !!record?.onHotseat,
          duty: record?.duty || null,
          dutyLocked: !!record?.dutyLocked,
        });
      };
      
        add('driver1', bus.driver1);
        add('driver2', bus.driver2);
        add('cleaner1', bus.cleaner1);
        add('cleaner2', bus.cleaner2);
      
      setCrew(newCrewList);
    }
  }, [schedule, bus]);

  useEffect(() => {
    if (!bus || !schedule) return;

    const attendance = schedule.attendance || {};
    const list: CrewMember[] = [];

    const add = (role: CrewMember['role'], name?: string | null) => {
      if (!name) return;
      const record = attendance[role];
      list.push({
        role,
        name,
        checkedIn: !!record,
        onHotseat: !!record?.onHotseat,
        duty: record?.duty || null,
        dutyLocked: !!record?.dutyLocked,
      });
    };

    add('driver1', bus.driver1);
    add('driver2', bus.driver2);
    add('cleaner1', bus.cleaner1);
    add('cleaner2', bus.cleaner2);

    setCrew(list);
  }, [bus, schedule]);


  const handleCheckIn = async (role: CrewMember['role'], checkIn: boolean) => {
    if (!schedule) return;
    
    try {
      if (checkIn) {
        let duty: Duty = null;
        let onHotseat = false;

        if (role.startsWith('driver')) {
            const checkedInDrivers = crew.filter(c => c.role.startsWith('driver') && c.checkedIn);
            if (checkedInDrivers.length === 0) {
                duty = 'first';
                onHotseat = true;
            } else if (checkedInDrivers.length === 1 && !checkedInDrivers.some(d => d.duty === 'second')) {
                duty = 'second';
                onHotseat = false;
            }
        }
        await dataService.markCrewAttendance(schedule.id, role, true, onHotseat, duty);
      } else {
        await dataService.markCrewAttendance(schedule.id, role, false);
      }
      
      await refreshCrewState();
      toast({
        title: checkIn ? 'Checked In' : 'Checked Out',
        description: `${crew.find(c => c.role === role)?.name}`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };
  
  const handleHotseatToggle = async (
    roleToActivate: CrewMember['role']
  ) => {
    if (!schedule) return;
  
    const driverToActivate = crew.find(c => c.role === roleToActivate);
    if (!driverToActivate || !driverToActivate.checkedIn) return;
  
    const now = new Date().toISOString();
    const updates = crew
      .filter(c => c.role.startsWith('driver') && c.checkedIn)
      .map(driver => {
        const isOnHotseat = driver.role === roleToActivate;
        return {
          role: driver.role,
          onHotseat: isOnHotseat,
          duty: driver.duty,
          hotseatSince: isOnHotseat ? now : null, // Set timestamp only for the new hotseat driver
        };
      });
  
    try {
      await dataService.batchUpdateCrewStatus(schedule.id, updates);
      await refreshCrewState();
      toast({
        title: `Hotseat Swapped`,
        description: `${driverToActivate.name} is now on the hotseat.`,
      });
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Error updating hotseat",
        description: e.message,
        variant: "destructive"
      });
    }
  };

  const handleLockDuty = async () => {
    if (!schedule) return;
    const checkedInDrivers = crew.filter(c => c.role.startsWith('driver') && c.checkedIn);
    if (checkedInDrivers.length < 2) {
        toast({ title: "Cannot Lock Duty", description: "Both drivers must be checked in to lock the duty.", variant: "destructive" });
        return;
    }
    
    try {
        const rolesToLock = checkedInDrivers.map(d => d.role);
        await dataService.lockAllDriverDuties(schedule.id, rolesToLock);
        await refreshCrewState();
        toast({
            title: "Duty Roster Locked",
            description: `The duty assignments have been finalized.`
        });
    } catch (error: any) {
        toast({ title: "Error", description: "Could not lock duties.", variant: "destructive" });
    }
  };
  
  const handleTripStatusUpdate = async (status: 'in-progress' | 'completed') => {
    if (!schedule) return;
    try {
        if (status === 'completed') {
            const checkedInCrew = crew.filter(c => c.checkedIn);
            for (const member of checkedInCrew) {
                await dataService.markCrewAttendance(schedule.id, member.role, false);
            }
        }
        await dataService.updateTripStatus(schedule.id, status);
        toast({
            title: status === 'in-progress' ? "Trip Started" : "Trip Ended",
            description: `The trip has been marked as ${status === 'in-progress' ? 'in progress' : 'completed'}.`
        });
    } catch (error: any) {
        toast({ title: "Error", description: "Could not update trip status.", variant: "destructive" });
    }
  };


  const isLoading = isScheduleLoading || loadingBus;

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-xl p-6">
        <Skeleton className="h-8 w-40 mb-4" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  
  if (!schedule || !bus) {
    return (
      <div className="container mx-auto max-w-md p-6">
        <Card className="text-center">
          <CardHeader>
            <Frown className="mx-auto h-10 w-10 text-muted-foreground" />
            <CardTitle>Trip Not Found</CardTitle>
            <CardDescription>Unable to load attendance</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => router.push('/cabin-crew')} className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 py-10">
      <div className="container mx-auto max-w-3xl px-4">
        <Button
          variant="ghost"
          onClick={() => router.push('/cabin-crew')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        <Card className="overflow-hidden rounded-2xl shadow-xl backdrop-blur">
          <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
            <div className='flex justify-between items-start'>
                <div>
                    <CardTitle className="flex items-center gap-3 text-xl">
                      <UserCheck className="h-6 w-6" />
                      Crew Attendance Console
                    </CardTitle>
                    <CardDescription className="text-indigo-100 mt-1">
                      {bus.travelsName} • {bus.busNumber}
                    </CardDescription>
                    <div className="text-white/90 pt-2">
                        <p className="font-semibold">{bus.origin} <ArrowRight className="inline w-4 h-4"/> {bus.destination}</p>
                        <p className="text-sm">{format(new Date(schedule.date), 'dd MMMM yyyy, EEEE')}</p>
                    </div>
                </div>
                <div className="flex-shrink-0">
                    {schedule.tripStatus === 'in-progress' ? (
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="w-full">
                                    <StopCircle className="mr-2 h-4 w-4" /> End Trip
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>End the Trip?</AlertDialogTitle>
                                    <AlertDialogDescription>This will mark the trip as completed for all passengers, stop live tracking, and check out all crew members.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleTripStatusUpdate('completed')}>Confirm End</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    ) : schedule.tripStatus === 'completed' ? (
                        <Button disabled className="w-full">Trip Completed</Button>
                    ) : (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button className="w-full bg-green-600 hover:bg-green-700">
                                    <Play className="mr-2 h-4 w-4" /> Start Trip
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Start the Trip?</AlertDialogTitle>
                                    <AlertDialogDescription>This will activate live tracking and notify passengers that the trip has begun.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleTripStatusUpdate('in-progress')}>Confirm Start</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-6">
            {crew.map((member) => {
              const isDriver = member.role.startsWith('driver');
              const dutyLabel = member.duty === 'first' ? '1st Duty' : member.duty === 'second' ? '2nd Duty' : null;
              const isLockedForThisMember = member.dutyLocked;

              return (
                <div
                  key={member.role}
                  className={cn(
                    'rounded-xl border p-4 transition',
                    member.checkedIn
                      ? 'bg-white shadow-sm'
                      : 'bg-muted/40'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarFallback>
                          {member.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold">{member.name}</p>
                        <div className="flex gap-2 items-center">
                            <Badge variant="outline" className="capitalize">
                                {member.role.replace(/\d/, '')}
                            </Badge>
                            {dutyLabel && (
                                <Badge variant={member.duty === 'first' ? 'destructive' : 'secondary'}>
                                    {dutyLabel}
                                </Badge>
                            )}
                            {isLockedForThisMember && (
                                <Badge variant="default" className="bg-slate-700">
                                    <Lock className="h-3 w-3 mr-1" /> Duty Locked
                                </Badge>
                            )}
                        </div>
                      </div>
                    </div>

                    {!member.checkedIn ? (
                       <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button size="sm" disabled={isLockedForThisMember}>Check In</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Check-in</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to mark {member.name} as present?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleCheckIn(member.role, true)}>Confirm</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    ) : (
                      <Badge className="bg-green-100 text-green-700">
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                        Present
                      </Badge>
                    )}
                  </div>

                  {member.checkedIn && (
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      {isDriver && (
                        <>
                           {!member.onHotseat ? (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" >
                                        <Flame className="mr-2 h-4 w-4" /> Set Hotseat
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Set Driver on Hotseat?</AlertDialogTitle>
                                        <AlertDialogDescription>This will set {member.name} as the active driver.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleHotseatToggle(member.role)}>Confirm</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                                        <Flame className="mr-2 h-4 w-4" /> On Hotseat
                                    </Button>
                                </AlertDialogTrigger>
                                 <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>End Hotseat for {member.name}?</AlertDialogTitle>
                                        <AlertDialogDescription>This action is only possible if another driver takes over.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    </AlertDialogFooter>
                                 </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </>
                      )}

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                    <LogOut className="mr-1 h-4 w-4" /> Check Out
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Check-out</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to check out {member.name}?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleCheckIn(member.role, false)}>Confirm</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                  )}
                </div>
              );
            })}
             {crew.filter(c => c.role.startsWith('driver') && c.checkedIn).length > 0 && !crew.some(c => c.dutyLocked) && (
                <div className="pt-4 border-t">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="secondary" className="w-full">
                                <Lock className="mr-2 h-4 w-4" />
                                Lock Duty Roster
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Lock Duty Assignments?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will finalize the current duty assignments for all checked-in drivers.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleLockDuty}>Yes, Lock Roster</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AttendancePageContent />
    </Suspense>
  );
}

