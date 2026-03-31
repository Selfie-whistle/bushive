
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Bus as BusType } from '@/lib/types';
import { dataService } from '@/lib/data/client-service';

export default function RouteSelectionPage() {
  const { busId } = useParams();
  const router = useRouter();
  const [bus, setBus] = useState<BusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadBus() {
      if (typeof busId !== 'string') {
        setError("Invalid Bus ID provided.");
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await dataService.getBusById(busId);
        if (data) {
          setBus(data);
          if (!data.serviceId) {
            setError(`This bus (${data.busNumber}) is not yet assigned to a service route.`);
          }
        } else {
          setError("Bus not found.");
        }
      } catch (e) {
        setError("Failed to load bus data.");
      } finally {
        setLoading(false);
      }
    }
    loadBus();
  }, [busId]);

  useEffect(() => {
    if (!loading && bus && bus.serviceId) {
      router.replace(`/admin/route/${bus.serviceId}`);
    }
  }, [bus, loading, router]);


  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-2" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
        <div className="container mx-auto px-4 py-8 max-w-md">
             <Card>
                <CardHeader>
                    <CardTitle>Error</CardTitle>
                    <CardDescription>{error}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={() => router.back()} variant="outline">Go Back</Button>
                </CardContent>
             </Card>
        </div>
    )
  }
  
  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
        <p>Redirecting to the route editor...</p>
    </div>
  );
}
