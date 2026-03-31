
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { dataService } from '@/lib/data/client-service';
import type { Bus, ConsoleFeatures } from '@/lib/types';
import { Separator } from '@/components/ui/separator';

const defaultFeatures: ConsoleFeatures = {
  manifest: true,
  attendance: true,
  liveTracking: true,
  snacks: true,
  restStopCheckins: true,
  createTicket: true,
  busExpenses: true,
  passengerTrackBus: true,
  passengerCallCabin: true,
  passengerRestStops: true,
  passengerAlarm: true,
  passengerEmergencyKit: true,
};

const cabinCrewFeatures: (keyof ConsoleFeatures)[] = [
  'manifest',
  'attendance',
  'liveTracking',
  'snacks',
  'restStopCheckins',
  'createTicket',
  'busExpenses',
];

const passengerFeatures: (keyof ConsoleFeatures)[] = [
  'passengerTrackBus',
  'passengerCallCabin',
  'passengerRestStops',
  'passengerAlarm',
  'passengerEmergencyKit',
];

export default function BusFeaturesClientPage({ busId }: { busId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [bus, setBus] = useState<Bus | null>(null);
  const [features, setFeatures] = useState<ConsoleFeatures>(defaultFeatures);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadBus() {
      if (!busId) return;
      setLoading(true);
      const data = await dataService.getBusById(busId);
      setBus(data);
      if (data?.consoleFeatures) {
        setFeatures({ ...defaultFeatures, ...data.consoleFeatures });
      } else {
        setFeatures(defaultFeatures);
      }
      setLoading(false);
    }
    loadBus();
  }, [busId]);

  const handleFeatureToggle = (feature: keyof ConsoleFeatures, value: boolean) => {
    setFeatures(prev => ({ ...prev, [feature]: value }));
  };

  const handleSaveChanges = async () => {
    if (!bus) return;
    setIsSaving(true);
    try {
      await dataService.addBus({ ...bus, consoleFeatures: features });
      toast({
        title: "Features Saved",
        description: `Console settings for ${bus.travelsName} have been updated.`,
      });
      router.push('/admin/trips');
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Could not update the console features.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
        <div className="container mx-auto max-w-2xl px-4 py-8">
            <Skeleton className="h-8 w-48 mb-4" />
            <Card>
                <CardHeader>
                    <Skeleton className="h-7 w-1/2" />
                    <Skeleton className="h-4 w-3/4 mt-2" />
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <Skeleton className="h-6 w-1/3" />
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                    <Skeleton className="h-px w-full" />
                    <Skeleton className="h-6 w-1/3" />
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </CardContent>
            </Card>
        </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-2xl font-bold font-headline">Console Features</h1>
          <p className="text-muted-foreground">{bus?.travelsName} • {bus?.busNumber}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configure Console Features
          </CardTitle>
          <CardDescription>
            Enable or disable features for the Cabin Crew and Passenger consoles for this specific bus.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div>
            <h3 className="text-lg font-semibold mb-4">Cabin Crew Console</h3>
            <div className="space-y-4">
              {cabinCrewFeatures.map((key) => (
                <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor={key} className="capitalize font-medium">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </Label>
                  <Switch
                    id={key}
                    checked={features[key as keyof ConsoleFeatures]}
                    onCheckedChange={(checked) => handleFeatureToggle(key as keyof ConsoleFeatures, checked)}
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-lg font-semibold mb-4">Passenger Console</h3>
            <div className="space-y-4">
              {passengerFeatures.map((key) => (
                <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor={key} className="capitalize font-medium">
                    {key.replace('passenger', '').replace(/([A-Z])/g, ' $1').trim()}
                  </Label>
                  <Switch
                    id={key}
                    checked={features[key as keyof ConsoleFeatures]}
                    onCheckedChange={(checked) => handleFeatureToggle(key as keyof ConsoleFeatures, checked)}
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter>
            <Button onClick={handleSaveChanges} className="w-full" disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Feature Settings"}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
