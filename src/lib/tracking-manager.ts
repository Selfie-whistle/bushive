
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
  private status: TrackingStatus = { isActive: false, status: 'idle' };
  private busId: string | null = null;
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
  }

  public start(busId: string) {
    if (this.watchId !== null) {
      console.warn("Tracking is already active.");
      return;
    }
    
    if (!busId) {
      this.setStatus({ isActive: false, status: 'error', error: 'Bus ID is required to start tracking.' });
      throw new Error("Bus ID is required to start tracking.");
    }
    
    this.busId = busId;

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

  public async stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
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

    this.setStatus({ isActive: false, status: 'stopped' });
    this.busId = null; // Clear busId on stop
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
    start: (busId: string): void => {
        InternalTrackingManager.getInstance().start(busId);
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
