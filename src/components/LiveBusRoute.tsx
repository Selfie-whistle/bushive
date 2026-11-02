'use client';

// Global queue to prevent OSRM 429 Too Many Requests
let routingQueue = Promise.resolve();

import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';
import { getScheduledDateTime } from '@/lib/utils';
import type { Point } from '@/lib/types';

interface LiveBusRouteProps {
  liveLocation?: { lat: number; lng: number } | null;
  startPoint?: { lat: number; lng: number };
  destinationPoint: Point | null;
  waypoints?: Point[];
  onRouteInfoChange?: (info: any) => void;
  bookingDate?: string;
  scheduledTime?: string;
  departureTime?: string;
}

const LiveBusRoute: React.FC<LiveBusRouteProps> = ({ 
  liveLocation, 
  startPoint, 
  destinationPoint, 
  waypoints = [],
  onRouteInfoChange,
  bookingDate,
  scheduledTime,
  departureTime
}) => {
  const map = useMap();
  const routingControlRef = useRef<any>(null);

  useEffect(() => {
    if (!map) return;

    const routingControl = L.Routing.control({
      waypoints: [],
      routeWhileDragging: false,
      show: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: false,
      lineOptions: {
        styles: [{ color: '#3b82f6', weight: 6, opacity: 0.9 }]
      },
      createMarker: () => null,
      // OSRM usually provides better road-network matching
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1'
      })
    }).addTo(map);

    routingControl.on('routesfound', function(e: any) {
        const routes = e.routes;
        if (!routes.length) return;
        const summary = routes[0].summary;
        if (onRouteInfoChange) {
            const etaDate = new Date(Date.now() + summary.totalTime * 1000);
            
            let delayInMinutes = 0;
            if (bookingDate && scheduledTime) {
                const scheduledArrival = getScheduledDateTime(bookingDate, scheduledTime, departureTime);
                if(scheduledArrival) {
                    delayInMinutes = Math.round((etaDate.getTime() - scheduledArrival.getTime()) / 60000);
                }
            }

            onRouteInfoChange({
                distance: summary.totalDistance > 1000 ? `${(summary.totalDistance / 1000).toFixed(1)} km` : `${Math.round(summary.totalDistance)} m`,
                duration: summary.totalTime > 3600 ? `${Math.floor(summary.totalTime/3600)}h ${Math.round((summary.totalTime%3600)/60)}m` : `${Math.round(summary.totalTime/60)} min`,
                eta: etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                etaDate,
                delayInMinutes,
                durationMinutes: Math.round(summary.totalTime / 60)
            });
        }
    });

    routingControl.on('routingerror', function(e: any) {
      // Silence empty error objects and log significant ones
      if (e.error && Object.keys(e.error).length > 0) {
        console.warn("Routing engine error:", e.error);
      }
    });

    routingControlRef.current = routingControl;

    return () => {
      if (map && routingControlRef.current) {
        try {
          // Suppress errors during cleanup if layers are already detached
          const control = routingControlRef.current;
          routingControlRef.current = null;
          
          if (control.getPlan()) {
             try { control.getPlan().setWaypoints([]); } catch(e) {}
          }
          try { map.removeControl(control); } catch(e) {}
        } catch (e) {
          console.warn("Could not clean up routing control.", e);
        }
      }
    };
  }, [map, onRouteInfoChange, bookingDate, scheduledTime, departureTime]);

  useEffect(() => {
    if (!routingControlRef.current || !destinationPoint) return;

    const origin = startPoint || liveLocation;
    if (!origin) return;

    const allPoints = [origin, ...waypoints, destinationPoint];
    const validPoints = allPoints.filter(p => 
      p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
    );

    // Routing requires at least 2 distinct points to avoid OSRM 400 errors
    if (validPoints.length < 2) {
      routingControlRef.current.getPlan().setWaypoints([]);
      return;
    }
    
    const waypointsLatLng = validPoints.map(p => L.latLng(p.lat, p.lng));
    
    // Stability check: Only update if waypoints have actually changed
    // This prevents the "blinking" effect during minor location drifts
    const currentWps = routingControlRef.current.getWaypoints().map((w: any) => w.latLng);
    const isDifferent = waypointsLatLng.length !== currentWps.length || 
                        waypointsLatLng.some((wp, i) => !wp || !currentWps[i] || wp.distanceTo(currentWps[i]) > 5);

    let isMounted = true;

    if (isDifferent) {
      routingQueue = routingQueue.then(() => new Promise<void>(resolve => {
         if (isMounted && routingControlRef.current) {
             try {
                 routingControlRef.current.setWaypoints(waypointsLatLng);
             } catch(e) {
                 console.warn("Error setting waypoints", e);
             }
         }
         // Wait 1.5 seconds before allowing the next request
         setTimeout(resolve, 1500);
      }));
    }
    
    return () => {
        isMounted = false;
    };
  }, [liveLocation, startPoint, destinationPoint, waypoints]);

  return null;
};

export default LiveBusRoute;