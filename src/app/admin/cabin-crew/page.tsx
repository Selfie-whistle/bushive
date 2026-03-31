'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Frown, ArrowRight, UserCheck, MoreVertical, Pencil, X, Clock, CheckCircle2, Lock, Flame, PlusCircle } from 'lucide-react';
import { dataService } from '@/lib/data/client-service';
import { format } from 'date-fns';
import type { Schedule, Bus as BusType } from '@/lib/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';

interface CabinCrewMember {
  id: string;
  email: string;
  name?: string;
  assignedTrip?: {
    bus: BusType;
    schedule: Schedule;
  };
}

// New type for live status display
type LiveCrewStatus = {
  role: string;
  name: string;
  checkedIn: boolean;
  onHotseat: boolean;
  duty: 'first' | 'second' | null;
  dutyLocked: boolean;
  checkInTime: string | null;
  hotseatSince: string | null;
}

export default function CabinCrewManagementPage() {
  const [crewMembers, setCrewMembers] = useState<CabinCrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCrew, setEditingCrew] = useState<CabinCrewMember | null>(null);
  const { user } = useFirebase();

  const [selectedCrew, setSelectedCrew] = useState<CabinCrewMember | null>(null);
  const [liveSchedule, setLiveSchedule] = useState<Schedule | null>(null);
  
  const [crewDetails, setCrewDetails] = useState({
    driver1: '',
    driver2: '',
    cleaner1: '',
    cleaner2: '',
  });

  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    const unsubscribe = dataService.onBusesSnapshot(async (allBuses) => {
        const operatorBuses = await dataService.getBusesByOperator(user.uid, user.displayName || '');
        const busesWithCrew = operatorBuses.filter(bus => bus.cabinCrewId);
        
        const schedulesToday = await dataService.getSchedulesForDate(todayStr);

        const assignments = busesWithCrew.map(bus => {
          const assignedSchedule = schedulesToday.find(s => s.busId === bus.id);
          
          return {
            id: bus.cabinCrewId!,
            email: bus.cabinCrewId!,
            name: bus.driver1 || bus.cabinCrewId,
            assignedTrip: assignedSchedule ? { bus, schedule: assignedSchedule } : undefined,
          };
        });

        setCrewMembers(assignments);
        setLoading(false);

    }, (error) => {
        console.error("Failed to fetch cabin crew data:", error);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);
  
  // Real-time listener for the selected schedule
  useEffect(() => {
    if (selectedCrew?.assignedTrip?.schedule.id) {
      const scheduleId = selectedCrew.assignedTrip.schedule.id;
      const unsubscribe = dataService.onScheduleSnapshot(scheduleId, (scheduleData) => {
        setLiveSchedule(scheduleData);
      });
      return () => unsubscribe();
    } else {
      setLiveSchedule(null);
    }
  }, [selectedCrew]);

  const handleEditClick = (crewMember: CabinCrewMember) => {
    setEditingCrew(crewMember);
    if(crewMember.assignedTrip?.bus) {
      setCrewDetails({
          driver1: crewMember.assignedTrip.bus.driver1 || '',
          driver2: crewMember.assignedTrip.bus.driver2 || '',
          cleaner1: crewMember.assignedTrip.bus.cleaner1 || '',
          cleaner2: crewMember.assignedTrip.bus.cleaner2 || '',
      });
    }
    setIsEditDialogOpen(true);
  };

  const handleSaveChanges = async () => {
    if (!editingCrew || !editingCrew.assignedTrip) return;
    
    try {
        const busToUpdate = editingCrew.assignedTrip.bus;
        const updatedBusData: BusType = { 
            ...busToUpdate, 
            driver1: crewDetails.driver1,
            driver2: crewDetails.driver2,
            cleaner1: crewDetails.cleaner1,
            cleaner2: crewDetails.cleaner2,
        };
        await dataService.addBus(updatedBusData);
        toast({
            title: "Success",
            description: "Crew details have been updated.",
        });
    } catch(e) {
        toast({
            title: "Error",
            description: "Failed to update crew details.",
            variant: "destructive"
        });
    }

    setIsEditDialogOpen(false);
    setEditingCrew(null);
  };

  const renderCrewStatus = () => {
    if (!selectedCrew || !selectedCrew.assignedTrip) return null;
    
    const { bus } = selectedCrew.assignedTrip;
    const scheduleToDisplay = liveSchedule || selectedCrew.assignedTrip.schedule;
    const attendance = scheduleToDisplay.attendance || {};

    const allCrewRoles: LiveCrewStatus[] = [
        { role: 'driver1', name: bus.driver1 },
        { role: 'driver2', name: bus.driver2 },
        { role: 'cleaner1', name: bus.cleaner1 },
        { role: 'cleaner2', name: bus.cleaner2 }
    ]
    .filter(c => c.name)
    .map(({ role, name }) => {
      const record = attendance[role as keyof typeof attendance];
      return {
        role,
        name: name!,
        checkedIn: !!record,
        onHotseat: !!record?.onHotseat,
        duty: record?.duty || null,
        dutyLocked: !!record?.dutyLocked,
        checkInTime: record ? new Date(record.timestamp).toLocaleTimeString() : null,
        hotseatSince: record?.hotseatSince ? new Date(record.hotseatSince).toLocaleTimeString() : null,
      };
    });

    return (
        <Card className="mt-6">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Live Crew Status</CardTitle>
                        <CardDescription>Real-time check-in details for the selected trip.</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedCrew(null)}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-4 p-4 rounded-lg bg-muted mb-4">
                    <div>
                        <p className="font-bold text-lg">{bus.travelsName}</p>
                        <p className="text-sm text-muted-foreground">{bus.origin} <ArrowRight className="inline w-3 h-3" /> {bus.destination}</p>
                    </div>
                    <div className="bg-yellow-400 text-black font-mono text-sm font-bold px-2 py-1 rounded-md border-2 border-black inline-block">
                        {bus.busNumber}
                    </div>
                </div>

                <div className="space-y-3">
                    {allCrewRoles.map(({ role, name, checkedIn, onHotseat, duty, dutyLocked, checkInTime, hotseatSince }) => {
                        const dutyLabel = duty === 'first' ? '1st Duty' : duty === 'second' ? '2nd Duty' : null;

                        return (
                            <div key={role} className="flex items-center justify-between p-3 border rounded-md">
                                <div>
                                    <p className="font-medium">{name}</p>
                                    <p className="text-xs capitalize text-muted-foreground">{role.replace(/\d/, ' ')}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                  {dutyLabel && <Badge variant={duty === 'first' ? 'destructive' : 'secondary'}>{dutyLabel}</Badge>}
                                  {onHotseat && (
                                    <div className="text-right">
                                        <Badge className="bg-orange-500 hover:bg-orange-600"><Flame className="h-3 w-3 mr-1" /> Hotseat</Badge>
                                        {hotseatSince && <p className="text-xs text-muted-foreground mt-1 flex items-center justify-end gap-1"><Clock className="h-3 w-3"/> since {hotseatSince}</p>}
                                    </div>
                                  )}
                                  {dutyLocked && <Badge variant="default" className="bg-slate-700"><Lock className="h-3 w-3 mr-1" /> Locked</Badge>}
                                  {checkedIn ? (
                                      <div className="text-right">
                                          <Badge variant="default" className="bg-green-100 text-green-700">
                                              <CheckCircle2 className="h-3 w-3 mr-1" />
                                              Checked In
                                          </Badge>
                                          <p className="text-xs text-muted-foreground mt-1 flex items-center justify-end gap-1">
                                              <Clock className="h-3 w-3"/> {checkInTime}
                                          </p>
                                      </div>
                                  ) : (
                                      <Badge variant="secondary">Not Checked In</Badge>
                                  )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
  }


  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-3">
                <UserCheck className="w-6 h-6 text-primary" />
                Cabin Crew Management
              </CardTitle>
              <CardDescription>{crewMembers.length} crew member(s) found for your operations.</CardDescription>
            </div>
            <Button onClick={() => router.push('/admin/cabin-crew/register')}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Crew Member
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading crew members...</p>
          ) : crewMembers.length > 0 ? (
            <Table>
              <TableHeader>
                <TR>
                  <TH>Crew</TH>
                  <TH>Login ID</TH>
                  <TH>Assigned Trip Today</TH>
                  <TH>Bus Number</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </TableHeader>
              <TableBody>
                {crewMembers.map(crew => {
                  const bus = crew.assignedTrip?.bus;
                  const crewNames = [bus?.driver1, bus?.driver2, bus?.cleaner1, bus?.cleaner2].filter(Boolean);

                  return (
                    <TR key={crew.id} onClick={() => setSelectedCrew(crew)} className="cursor-pointer">
                      <TD>
                        {crewNames.length > 0 ? (
                          <div>
                            {crewNames.map((name, index) => (
                              <div key={index}>{name}</div>
                            ))}
                          </div>
                        ) : (
                          'N/A'
                        )}
                      </TD>
                      <TD>
                        <div className="font-medium">{crew.email}</div>
                      </TD>
                      <TD>
                        {crew.assignedTrip ? (
                          <>
                            <div className="font-medium">{crew.assignedTrip.bus.travelsName}</div>
                            <div className="text-sm text-muted-foreground">
                              {crew.assignedTrip.bus.origin} <ArrowRight className="inline w-3 h-3" /> {crew.assignedTrip.bus.destination}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Not Assigned</span>
                        )}
                      </TD>
                      <TD>
                          {crew.assignedTrip ? (
                               <div className="bg-yellow-400 text-black font-mono text-sm font-bold px-2 py-1 rounded-md border-2 border-black inline-block">
                                  {crew.assignedTrip.bus.busNumber}
                              </div>
                          ) : 'N/A'}
                      </TD>
                      <TD>
                         <Badge variant={crew.assignedTrip ? "default" : "secondary"}>
                            {crew.assignedTrip ? "On Duty" : "Off Duty"}
                         </Badge>
                      </TD>
                       <TD className="text-right">
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                  <DropdownMenuItem onClick={() => handleEditClick(crew)} disabled={!crew.assignedTrip}>
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive">Remove Crew</DropdownMenuItem>
                              </DropdownMenuContent>
                          </DropdownMenu>
                      </TD>
                    </TR>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-10">
              <Frown className="w-12 h-12 mx-auto text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">No Cabin Crew Found</h3>
              <p className="text-sm text-muted-foreground">No crew members are currently assigned to your active buses.</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {selectedCrew && renderCrewStatus()}
      
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Crew Members Details</DialogTitle>
            <DialogDescription>
              Update the crew details for bus {editingCrew?.assignedTrip?.bus.busNumber}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="driver1">Driver 1</Label>
              <Input
                id="driver1"
                value={crewDetails.driver1}
                onChange={(e) => setCrewDetails({...crewDetails, driver1: e.target.value})}
              />
            </div>
             <div className="space-y-2">
              <Label htmlFor="driver2">Driver 2</Label>
              <Input
                id="driver2"
                value={crewDetails.driver2}
                onChange={(e) => setCrewDetails({...crewDetails, driver2: e.target.value})}
              />
            </div>
             <div className="space-y-2">
              <Label htmlFor="cleaner1">Cleaner 1</Label>
              <Input
                id="cleaner1"
                value={crewDetails.cleaner1}
                onChange={(e) => setCrewDetails({...crewDetails, cleaner1: e.target.value})}
              />
            </div>
             <div className="space-y-2">
              <Label htmlFor="cleaner2">Cleaner 2</Label>
              <Input
                id="cleaner2"
                placeholder="(optional)"
                value={crewDetails.cleaner2}
                onChange={(e) => setCrewDetails({...crewDetails, cleaner2: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleSaveChanges}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
