
'use client';

import React, { useState, useEffect, use, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardDescription, CardHeader, CardTitle, CardFooter, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bus, Phone, Coffee, ArrowRight, Bell, LifeBuoy, Volume2, VolumeX } from "lucide-react";
import { useFirebase } from '@/firebase';
import type { Booking, Bus as BusDetails, RestStop, Schedule } from '@/lib/types';
import { dataService, getDb } from '@/lib/data/client-service';
import { Skeleton } from '@/components/ui/skeleton';
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
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useLiveBusData } from '@/hooks/use-live-bus-data';

interface LiveTrip extends Schedule {
  bus: Bus;
  totalPassengers: number;
  boardedCount: number;
}

function PassengerConsolePageContent({ id }: { id: string }) {
    const router = useRouter();
    const { user, isUserLoading } = useFirebase();
    const [booking, setBooking] = useState<Booking | null>(null);
    const [busDetails, setBusDetails] = useState<BusDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [alarmSettings, setAlarmSettings] = useState({ hours: '0', minutes: '15', off: false });
    const [hasSetAlarmBefore, setHasSetAlarmBefore] = useState(false);
    const { toast } = useToast();
    const [selectedSeatForKit, setSelectedSeatForKit] = useState<string | null>(null);
    const [kitRequest, setKitRequest] = useState<EmergencyKitRequest | null>(null);
    
    const busId = useMemo(() => booking?.busId || null, [booking]);
    const { isTrackingActive } = useLiveBusData(busId);
    
    // Sound related state
    const alarmAudioRef = useRef<HTMLAudioElement>(null);
    const [isSoundEnabled, setIsSoundEnabled] = useState(true);
    const soundInitialized = useRef(false);
    const lastBroadcastTimestamp = useRef<string | null>(null);

    const initializeSound = useCallback(() => {
      if (!soundInitialized.current && audioRef.current) {
          const audio = audioRef.current;
          audio.muted = true;
          audio.play().then(() => {
              audio.pause();
              audio.currentTime = 0;
              audio.muted = false;
              soundInitialized.current = true;
          }).catch(e => {
              console.warn("Could not initialize sound automatically:", e);
              setIsSoundEnabled(false);
          });
      }
    }, []);

    const toggleSound = () => {
      if (!soundInitialized.current) {
          initializeSound();
      }
      setIsSoundEnabled(prev => {
        const newState = !prev;
        toast({ title: `Sound ${newState ? 'enabled' : 'disabled'}` });
        return newState;
      });
    };
    
    useEffect(() => {
        const hasBeenSet = localStorage.getItem('alarmHasBeenSet');
        setHasSetAlarmBefore(hasBeenSet === 'true');
    }, []);
    
    useEffect(() => {
        const loadAlarmSettings = () => {
            if (!id) return;
            const savedSettings = localStorage.getItem(`alarm_${id}`);

            if (savedSettings) {
                try {
                    const { hours, minutes, off } = JSON.parse(savedSettings);
                    setAlarmSettings({
                        hours: String(hours || 0),
                        minutes: String(minutes || 0),
                        off: off || false,
                    });
                } catch(e) {
                    console.error("Failed to parse alarm settings", e);
                     setAlarmSettings({ hours: '0', minutes: '15', off: false });
                }
            } else {
                setAlarmSettings({ hours: '0', minutes: '15', off: false });
            }
        };
        
        loadAlarmSettings();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                loadAlarmSettings();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [id]);
    
      useEffect(() => {
        if (isUserLoading || !id) return;
    
        let bookingUnsubscribe: (() => void) | undefined;
        let busUnsubscribe: (() => void) | undefined;
        let scheduleUnsubscribe: (() => void) | undefined;
    
        const cleanup = () => {
          bookingUnsubscribe?.();
          busUnsubscribe?.();
          scheduleUnsubscribe?.();
        };
    
        const fetchAndListen = async () => {
          try {
            let ownerId = user?.uid;
            
            if (!ownerId) {
                const ownerInfo = await dataService.getBookingOwner(id);
                if (ownerInfo?.userId) ownerId = ownerInfo.userId;
            }

            if (!ownerId) {
                const publicBooking = await dataService.getPublicBookingById(id);
                if(publicBooking) {
                    setBooking(publicBooking);
                    busUnsubscribe = dataService.onBusSnapshot(publicBooking.busId, setBusDetails);
                }
                setIsLoading(false);
                return;
            }
    
            bookingUnsubscribe = dataService.onBookingSnapshot(ownerId, id, async (bookingData) => {
              if (bookingData) {
                setBooking(bookingData);
                
                busUnsubscribe?.(); 
                busUnsubscribe = dataService.onBusSnapshot(bookingData.busId, setBusDetails);
                
                scheduleUnsubscribe?.(); 
                scheduleUnsubscribe = dataService.onScheduleSnapshot(bookingData.scheduleId, (scheduleData) => {
                  if (scheduleData) {
                    const passengerForThisBooking = bookingData.passengers[0];
                    const scheduleBookingInfo = scheduleData.bookings?.find(
                      (b: any) => b.bookingId === id && b.seat === passengerForThisBooking.seatNumber
                    );
    
                    if (scheduleBookingInfo?.deboarded) {
                      router.replace(`/track/finished?bookingId=${id}`);
                      return;
                    }

                     const pendingRequest = scheduleData.kitRequests?.find(req => req.status === 'pending' && req.bookingId === id);
                      if (pendingRequest && !kitRequest) { 
                        setKitRequest(pendingRequest);
                        if (isSoundEnabled) {
                            if (soundInitialized.current) {
                                alarmAudioRef.current?.play().catch(e => console.error("Audio play failed", e));
                            } else {
                                toast({
                                    title: "Emergency Kit Requested!",
                                    description: "Click the sound icon to enable audio alerts for future requests.",
                                });
                            }
                        }
                      }
                      
                    // Check for new broadcast
                    if (
                        scheduleData?.broadcast &&
                        scheduleData.broadcast.timestamp !== lastBroadcastTimestamp.current
                    ) {
                        // Only show toast if it's a new message since the component mounted or last seen
                        if (lastBroadcastTimestamp.current !== null) {
                        toast({
                            title: "Update from Crew",
                            description: scheduleData.broadcast.message,
                            duration: 10000,
                        });
                        }
                        lastBroadcastTimestamp.current = scheduleData.broadcast.timestamp;
                    }
                  }
                });

                if (bookingData.passengers.length === 1) {
                  setSelectedSeatForKit(bookingData.passengers[0].seatNumber);
                } else {
                  setSelectedSeatForKit(null);
                }
              }
              setIsLoading(false);
            });
    
          } catch (error) {
            console.error("Failed to fetch details:", error);
            setIsLoading(false);
          }
        };
    
        fetchAndListen();
    
        return cleanup;
      }, [id, isUserLoading, user, router, toast, isSoundEnabled, kitRequest]);
    
    const getAlarmDescription = () => {
        if (alarmSettings.off) {
            return 'Alarm is currently turned off.';
        }
        const { hours, minutes } = alarmSettings;
        let description = 'Alarm set for ';
        if (hours !== '0') {
            description += `${hours} hour(s) `;
        }
        if (minutes !== '0') {
            description += `${minutes} minute(s) `;
        }
        description += 'before arrival.';
        return description;
    };

    const handleAlarmClick = () => {
        initializeSound();
        localStorage.setItem('alarmHasBeenSet', 'true');
        setHasSetAlarmBefore(true);
        router.push(`/track/${id}/alarm`);
    };
    
    const handleRequestKit = async () => {
        initializeSound();
        if (!selectedSeatForKit || !booking) {
            toast({
                title: "Seat Not Selected",
                description: "Please select a passenger/seat for the request.",
                variant: "destructive"
            });
            return;
        }

        const passenger = booking.passengers.find(p => p.seatNumber === selectedSeatForKit);
        if (!passenger) {
             toast({ title: "Error", description: "Could not find passenger details.", variant: "destructive" });
             return;
        }

        try {
            await dataService.requestEmergencyKit(
                booking.scheduleId,
                booking.id,
                selectedSeatForKit,
                passenger.name
            );

            toast({
                title: "Request Sent",
                description: `Your request for an emergency kit for seat ${selectedSeatForKit} has been sent to the cabin crew.`,
            });
        } catch (error: any) {
            toast({
                title: "Request Failed",
                description: error.message || "Could not send the request. Please try again.",
                variant: "destructive"
            });
        }
    };
    
    const features = useMemo(() => {
        const defaultFeatures = {
          passengerTrackBus: true,
          passengerCallCabin: true,
          passengerRestStops: true,
          passengerAlarm: true,
          passengerEmergencyKit: true,
        };

        return { ...defaultFeatures, ...busDetails?.consoleFeatures };
    }, [busDetails]);

    if (isLoading) {
        return (
            <div className="container mx-auto px-4 py-8">
                 <div className="max-w-2xl mx-auto text-center mb-8">
                    <Skeleton className="h-9 w-3/4 mx-auto" />
                    <Skeleton className="h-5 w-1/2 mx-auto mt-3" />
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6">
                    {[...Array(5)].map((_, i) => (
                        <Card key={i} className="flex flex-col justify-between">
                            <CardHeader>
                                <Skeleton className="h-16 w-16 rounded-full mx-auto" />
                                <Skeleton className="h-6 w-3/5 mx-auto mt-4" />
                                <Skeleton className="h-4 w-4/5 mx-auto mt-2" />
                            </CardHeader>
                            <CardFooter>
                                <Skeleton className="h-10 w-full" />
                            </CardFooter>
                        </Card>
                    ))}
                 </div>
            </div>
        );
    }
     const handleAcknowledgeKitRequest = async () => {
    if (!kitRequest || !booking) return;
    try {
        await dataService.acknowledgeKitRequest(booking.scheduleId, kitRequest.timestamp);
        setKitRequest(null);
        alarmAudioRef.current?.pause();
        if (alarmAudioRef.current) alarmAudioRef.current.currentTime = 0;
        toast({
            title: "Request Acknowledged",
            description: `Please deliver the kit to ${kitRequest.passengerName} at seat ${kitRequest.seatNumber}.`
        });
    } catch (error) {
        toast({ title: "Error", description: "Could not acknowledge the request.", variant: "destructive" });
    }
  };

    const hasMultiplePassengers = booking && booking.passengers.length > 1;

    return (
        <div className="container mx-auto px-4 py-6">
            <audio ref={alarmAudioRef} src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" loop preload="auto" />
            <AlertDialog open={!!kitRequest}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <div className="flex justify-center mb-4">
                            <div className="bg-pink-100 text-pink-600 rounded-full p-4 animate-pulse">
                                <LifeBuoy className="w-12 h-12" />
                            </div>
                        </div>
                        <AlertDialogTitle className="text-2xl text-center">
                            Emergency Kit Request
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-center text-lg pt-2">
                          <span>Please deliver a kit to:</span>
                          <span className="font-bold text-xl text-foreground mt-2 block">
                              {kitRequest?.passengerName}
                          </span>
                          <span className="font-mono text-base text-muted-foreground block">
                              Seat: {kitRequest?.seatNumber}
                          </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={handleAcknowledgeKitRequest} className="w-full">
                            Acknowledge & Stop Alarm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <header className="text-center mb-6">
                <h1 className="text-3xl font-bold font-headline">Passenger Console</h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <p className="text-muted-foreground">
                      Your central hub for journey: {busDetails?.origin} to {busDetails?.destination}.
                  </p>
                </div>
            </header>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {features.passengerTrackBus && (
                    <Card className="flex flex-col justify-between hover:shadow-lg transition-shadow">
                        <CardHeader>
                            <div className="flex justify-center mb-4">
                                <div className="bg-red-100 text-red-600 rounded-full p-3">
                                    <Bus className="h-8 w-8" />
                                </div>
                            </div>
                            <CardTitle className="text-center">Track Bus</CardTitle>
                            <CardDescription className="text-center">
                                Live Sharing is {isTrackingActive ? '(ACTIVE)' : '(INACTIVE)'}
                            </CardDescription>
                        </CardHeader>
                        <CardFooter>
                            <Button onClick={() => { router.push(`/track/${id}/boarded`); }} className="w-full">
                                Track <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                )}
                {features.passengerCallCabin && (
                    <Card className="flex flex-col justify-between hover:shadow-lg transition-shadow">
                         <CardHeader>
                            <div className="flex justify-center mb-4">
                                <div className="bg-green-100 text-green-600 rounded-full p-3">
                                    <Phone className="h-8 w-8" />
                                </div>
                            </div>
                            <CardTitle className="text-center">Call Cabin</CardTitle>
                            <CardDescription className="text-center">
                                Need assistance? Contact the bus cabin crew directly.
                            </CardDescription>
                        </CardHeader>
                        <CardFooter>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button disabled={!busDetails?.contactNumber} className="w-full bg-green-600 hover:bg-green-700 text-white">
                                    Call Now
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Call Bus Cabin?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      <span>You are about to call the crew of {busDetails?.travelsName}.</span>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction asChild>
                                      <a href={`tel:${busDetails?.contactNumber}`}>Yes</a>
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardFooter>
                    </Card>
                )}
                {features.passengerRestStops && (
                    <Card asChild className="flex flex-col justify-between hover:shadow-lg transition-shadow cursor-pointer">
                        <Link href={`/track/${id}/rest-stop`}>
                            <CardHeader>
                                <div className="flex justify-center mb-4">
                                    <div className="bg-blue-100 text-blue-600 rounded-full p-3">
                                        <Coffee className="h-8 w-8" />
                                    </div>
                                </div>
                                <CardTitle className="text-center">Rest Stops</CardTitle>
                                <CardDescription className="text-center">
                                View upcoming rest stops and plan your breaks.
                                </CardDescription>
                            </CardHeader>
                            <CardFooter>
                                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                                    View Stops
                                </Button>
                            </CardFooter>
                        </Link>
                    </Card>
                )}
                {features.passengerAlarm && (
                    <Card className="flex flex-col justify-between hover:shadow-lg transition-shadow">
                         <CardHeader>
                            <div className="flex justify-center mb-4">
                                <div className="bg-yellow-100 text-yellow-600 rounded-full p-3">
                                    <Bell className="h-8 w-8" />
                                </div>
                            </div>
                            <CardTitle className="text-center">Alarm</CardTitle>
                            <CardDescription className="text-center">
                                {getAlarmDescription()}
                            </CardDescription>
                        </CardHeader>
                        <CardFooter>
                            {hasSetAlarmBefore ? (
                                <Button onClick={() => router.push(`/track/${id}/alarm`)} className="w-full bg-yellow-600 hover:bg-yellow-700 text-white">
                                    Set Alarm
                                </Button>
                            ) : (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button className="w-full bg-yellow-600 hover:bg-yellow-700 text-white" onClick={initializeSound}>
                                            Set Alarm
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Set Arrival Alarm</AlertDialogTitle>
                                            <AlertDialogDescription>
                                               <span>Alarm set for 15 minute(s) before arrival by default. You can edit or turn off the alarm.</span>
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogAction onClick={handleAlarmClick}>
                                                OK
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </CardFooter>
                    </Card>
                )}
                {features.passengerEmergencyKit && (
                    <Card className="flex flex-col justify-between hover:shadow-lg transition-shadow">
                        <CardHeader>
                            <div className="flex justify-center mb-4">
                                <div className="bg-pink-100 text-pink-600 rounded-full p-3">
                                    <LifeBuoy className="h-8 w-8" />
                                </div>
                            </div>
                            <CardTitle className="text-center">Emergency Kit</CardTitle>
                            <CardDescription className="text-center">
                                Request a complimentary periods kit.
                            </CardDescription>
                        </CardHeader>
                        <CardFooter>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button className="w-full bg-pink-600 hover:bg-pink-700 text-white" onClick={initializeSound}>Request Kit</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Confirm Request</AlertDialogTitle>
                                        {hasMultiplePassengers && booking ? (
                                            <>
                                                <AlertDialogDescription>
                                                    <span>Please select the passenger who requires the kit.</span>
                                                </AlertDialogDescription>
                                                <RadioGroup
                                                    value={selectedSeatForKit || ''}
                                                    onValueChange={setSelectedSeatForKit}
                                                    className="py-4 space-y-2"
                                                >
                                                    {booking.passengers.map(p => (
                                                        <div key={p.seatNumber} className="flex items-center space-x-2">
                                                            <RadioGroupItem value={p.seatNumber} id={p.seatNumber} />
                                                            <Label htmlFor={p.seatNumber}>{p.name} (Seat {p.seatNumber})</Label>
                                                        </div>
                                                    ))}
                                                </RadioGroup>
                                            </>
                                        ) : (
                                            <AlertDialogDescription>
                                                <span>This will send a request to the cabin crew for a complimentary periods kit for seat number <span className="font-bold">{booking?.passengers[0]?.seatNumber}</span>.</span>
                                            </AlertDialogDescription>
                                        )}
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleRequestKit} disabled={hasMultiplePassengers && !selectedSeatForKit}>
                                            Confirm Request
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardFooter>
                    </Card>
                )}
            </div>
        </div>
    );
}

export default function PassengerConsolePageWrapper({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    return <PassengerConsolePageContent id={resolvedParams.id} />;
}
