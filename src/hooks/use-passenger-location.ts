import { useState, useEffect } from 'react';

interface LocationState {
  coords: { lat: number; lng: number } | null;
  error: string | null;
  loading: boolean;
}

export function usePassengerLocation() {
  const [location, setLocation] = useState<LocationState>({
    coords: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation({
        coords: null,
        error: 'Geolocation is not supported by your browser',
        loading: false,
      });
      return;
    }

    const success = (position: GeolocationPosition) => {
      setLocation({
        coords: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
        error: null,
        loading: false,
      });
    };

    const error = (err: GeolocationPositionError) => {
      let errorMessage = 'Unable to retrieve your location';
      if (err.code === err.PERMISSION_DENIED) {
        errorMessage = 'Location permission denied';
      }
      setLocation(prev => ({
        ...prev,
        error: errorMessage,
        loading: false,
      }));
    };

    // Get initial position
    navigator.geolocation.getCurrentPosition(success, error, {
      enableHighAccuracy: true,
    });

    // Watch for updates
    const watcherId = navigator.geolocation.watchPosition(success, error, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 5000,
    });

    return () => {
      navigator.geolocation.clearWatch(watcherId);
    };
  }, []);

  return location;
}
