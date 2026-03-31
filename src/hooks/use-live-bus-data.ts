
'use client';

import { useState, useEffect, useMemo } from 'react';
import { onSnapshot, doc } from 'firebase/firestore';
import { getDb } from '@/lib/data/client-service';
import type { Bus } from '@/lib/types';

/**
 * A custom hook to subscribe to real-time location and status updates for a specific bus.
 * @param busId The ID of the bus to track.
 * @returns An object containing the live bus location and tracking status.
 */
export function useLiveBusData(busId: string | null) {
  const [liveLocation, setLiveLocation] = useState<{ lat: number; lng: number; ts: number; heading?: number | null; speed?: number | null; accuracy?: number | null; } | null>(null);
  const [isTrackingActive, setIsTrackingActive] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);

  useEffect(() => {
    if (!busId) {
      setLiveLocation(null);
      setIsTrackingActive(false);
      setLocationName(null);
      return;
    }

    const busRef = doc(getDb(), 'buses', busId);
    const unsubscribe = onSnapshot(busRef, (docSnap) => {
      if (docSnap.exists()) {
        const busData = docSnap.data() as Bus & { locationName?: string }; // Cast to include potential locationName
        const newLocation = busData.liveLocation || null;
        setLiveLocation(newLocation);
        setIsTrackingActive(!!newLocation);
        setLocationName(busData.locationName || null); // Read locationName from the top-level of the bus document
      } else {
        setLiveLocation(null);
        setIsTrackingActive(false);
        setLocationName(null);
      }
    });

    return () => unsubscribe(); // Cleanup listener on component unmount
  }, [busId]);

  return useMemo(() => ({
    liveLocation,
    isTrackingActive,
    locationName,
  }), [liveLocation, isTrackingActive, locationName]);
}
