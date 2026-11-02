
'use client';

import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { getDb } from '@/lib/data/client-service';

export type TrackingStatus = {
  isActive: boolean;
  status: 'idle' | 'tracking' | 'error' | 'stopped';
  error?: string;
};

export interface LiveLocationPayload {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  ts: number;
}

type TrackingOptions = {
  enableHighAccuracy?: boolean;
};

type StatusListener = (status: TrackingStatus) => void;

function getGeolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission denied. Please enable it in your browser settings.";
    case error.POSITION_UNAVAILABLE:
      return "Location information is currently unavailable.";
    case error.TIMEOUT:
      return "The request to get user location timed out.";
    default:
      return "An unknown geolocation error occurred.";
  }
}

class InternalTrackingManager {
  private static instance: InternalTrackingManager;
  private watchId: number | null = null;
  private mockInterval: ReturnType<typeof setInterval> | null = null;
  private status: TrackingStatus = { isActive: false, status: 'idle' };
  private busId: string | null = null;
  private secondaryBusId: string | null = null;
  private listeners: Set<StatusListener> = new Set();

  private options: TrackingOptions = {
    enableHighAccuracy: true,
  };

  private constructor() {
    this.loadState();
  }

  public static getInstance(): InternalTrackingManager {
    if (!InternalTrackingManager.instance) {
      InternalTrackingManager.instance = new InternalTrackingManager();
    }
    return InternalTrackingManager.instance;
  }

  private setStatus(newStatus: Partial<TrackingStatus>) {
    this.status = { ...this.status, ...newStatus };
    this.saveState();
    this.emitStatusChange();
  }

  private emitStatusChange() {
    this.listeners.forEach(listener => listener(this.status));
  }

  private saveState() {
    if (typeof window === 'undefined') return;
    localStorage.setItem('trackingManager_status', JSON.stringify({
      isActive: this.status.isActive,
      busId: this.busId,
    }));
  }

  private loadState() {
    if (typeof window === 'undefined') return;
    try {
      const savedState = localStorage.getItem('trackingManager_status');
      if (savedState) {
        const { isActive, busId } = JSON.parse(savedState);
        this.status.isActive = isActive;
        this.busId = busId;
        if (isActive && busId) {
          this.status.status = 'tracking';
          this.start(busId); // Auto-start if it was active
        }
      }
    } catch (error) {
      console.error("Failed to load tracking state:", error);
    }
  }

  private getDocRef(busId: string) {
    const db = getDb();
    return doc(db, 'buses', busId);
  }

  private async pushLocation(position: GeolocationPosition) {
    if (!this.busId) {
        console.warn("Cannot push location, busId is not set.");
        return;
    }
    const { latitude, longitude, heading, speed, accuracy } = position.coords;
    
    const payload: LiveLocationPayload = {
      lat: latitude,
      lng: longitude,
      ts: Date.now(),
    };

    if (heading !== null) payload.heading = heading;
    if (speed !== null) payload.speed = speed;
    if (accuracy !== null) payload.accuracy = accuracy;
    
    await setDoc(
      this.getDocRef(this.busId),
      { liveLocation: payload },
      { merge: true }
    );

    if (this.secondaryBusId && this.secondaryBusId !== this.busId) {
      try {
        await setDoc(
          this.getDocRef(this.secondaryBusId),
          { liveLocation: payload },
          { merge: true }
        );
      } catch (e) {
        console.warn('Failed to push location to secondary bus id:', e);
      }
    }
  }

  public start(busId: string, secondaryBusId?: string | null) {
    if (this.watchId !== null) {
      console.warn("Tracking is already active.");
      return;
    }
    
    if (!busId) {
      this.setStatus({ isActive: false, status: 'error', error: 'Bus ID is required to start tracking.' });
      throw new Error("Bus ID is required to start tracking.");
    }
    
    this.busId = busId;
    this.secondaryBusId = secondaryBusId || null;

    if (!navigator.geolocation) {
      this.setStatus({ isActive: false, status: 'error', error: 'Geolocation not supported' });
      throw new Error('Geolocation not supported');
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.pushLocation(pos).catch((err) => {
          console.error('Failed to push location', err);
        });
        this.setStatus({ isActive: true, status: 'tracking', error: undefined });
      },
      (err) => {
        const errorMessage = getGeolocationErrorMessage(err);
        this.setStatus({ isActive: false, status: 'error', error: errorMessage });
        this.stop();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0, // Force fresh position
        timeout: 20000, // Allow more time to get a fix
      }
    );
  }

  public startMock(busId: string, routePoints: {lat: number, lng: number}[]) {
    if (this.watchId !== null || this.mockInterval !== null) {
      console.warn("Tracking is already active.");
      return;
    }
    
    if (!busId) {
      this.setStatus({ isActive: false, status: 'error', error: 'Bus ID is required to start tracking.' });
      throw new Error("Bus ID is required to start tracking.");
    }

    if (!routePoints || routePoints.length < 2) {
       this.setStatus({ isActive: false, status: 'error', error: 'Route points are required for mock tracking.' });
       throw new Error("Route points are required for mock tracking.");
    }
    
    this.busId = busId;

    let currentSegment = 0;
    let progress = 0; // 0 to 1

    this.mockInterval = setInterval(() => {
        if (currentSegment >= routePoints.length - 1) {
            this.stop(); // Reached destination
            return;
        }

        const p1 = routePoints[currentSegment];
        const p2 = routePoints[currentSegment + 1];

        const lat = p1.lat + (p2.lat - p1.lat) * progress;
        const lng = p1.lng + (p2.lng - p1.lng) * progress;

        // Calculate heading
        const dLon = (p2.lng - p1.lng) * Math.PI / 180;
        const lat1 = p1.lat * Math.PI / 180;
        const lat2 = p2.lat * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const heading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

        const mockPosition = {
            coords: {
                latitude: lat,
                longitude: lng,
                altitude: null,
                accuracy: 5,
                altitudeAccuracy: null,
                heading: heading,
                speed: 15,
            },
            timestamp: Date.now()
        } as GeolocationPosition;

        this.pushLocation(mockPosition).catch((err) => {
          console.error('Failed to push mock location', err);
        });
        this.setStatus({ isActive: true, status: 'tracking', error: undefined });

        // Advance progress
        progress += 0.05; // 20 ticks per segment
        if (progress >= 1) {
            progress = 0;
            currentSegment++;
        }
    }, 2000); // update every 2 seconds
  }

  public async stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.mockInterval !== null) {
        clearInterval(this.mockInterval);
        this.mockInterval = null;
    }
    
    if (this.busId) {
        try {
            await updateDoc(this.getDocRef(this.busId), {
                liveLocation: null,
                locationName: null,
            });
        } catch (err) {
            console.error("Failed to clear live location on stop:", err);
        }
    }

    if (this.secondaryBusId && this.secondaryBusId !== this.busId) {
        try {
            await updateDoc(this.getDocRef(this.secondaryBusId), {
                liveLocation: null,
                locationName: null,
            });
        } catch (err) {
            console.error("Failed to clear secondary live location on stop:", err);
        }
    }

    this.setStatus({ isActive: false, status: 'stopped' });
    this.busId = null; // Clear busId on stop
    this.secondaryBusId = null;
    this.saveState(); // Explicitly save the stopped state
  }

  public getStatus(): TrackingStatus {
    return this.status;
  }

  public on(event: 'statusChange', listener: StatusListener) {
    if (event === 'statusChange') {
      this.listeners.add(listener);
    }
  }

  public off(event: 'statusChange', listener: StatusListener) {
    if (event === 'statusChange') {
      this.listeners.delete(listener);
    }
  }
}

// --- Public Singleton Wrapper ---
export const TrackingManager = {
    start: (busId: string, secondaryBusId?: string | null): void => {
        InternalTrackingManager.getInstance().start(busId, secondaryBusId);
    },
    startMock: (busId: string, routePoints: {lat: number, lng: number}[]): void => {
        InternalTrackingManager.getInstance().startMock(busId, routePoints);
    },
    stop: (): void => {
        InternalTrackingManager.getInstance().stop();
    },
    getStatus: (): TrackingStatus => {
        return InternalTrackingManager.getInstance().getStatus();
    },
    on: (event: 'statusChange', listener: StatusListener): void => {
        InternalTrackingManager.getInstance().on(event, listener);
    },
    off: (event: 'statusChange', listener: StatusListener): void => {
        InternalTrackingManager.getInstance().off(event, listener);
    }
};
