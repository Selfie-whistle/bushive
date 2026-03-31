
'use client';

import React from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import LiveBusRoute from '@/components/LiveBusRoute';
import { Skeleton } from '@/components/ui/skeleton';

import type { Point, Service, Schedule } from '@/lib/types';

interface LiveTrackingMapProps {
  liveLocation: { lat: number; lng: number; heading?: number | null } | null;
  mapRouteData: {
    forward: {
      boarding: Point[];
      dropping: Point[];
    };
    return: {
      boarding: Point[];
      dropping: Point[];
    };
  } | null;
  activeSchedule: Schedule | null;
  destinationPoint: Point | null;
  waypoints?: Point[];
}

const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({
  liveLocation,
  mapRouteData,
  activeSchedule,
  destinationPoint,
  waypoints,
}) => {
  if (!liveLocation) {
    return (
      <div className="flex items-center justify-center h-full bg-muted">
        <p>Waiting for live location data...</p>
      </div>
    );
  }

  const busIcon = L.divIcon({
    html: `
      <div style="transform: rotate(${liveLocation.heading || 0}deg); transform-origin: center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#1d4ed8" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="drop-shadow-lg">
          <polygon points="12 2 19 21 12 17 5 21 12 2" />
        </svg>
      </div>
    `,
    className: 'bg-transparent border-0',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  const destinationIcon = L.divIcon({
    html: `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#dc2626" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drop-shadow-lg">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
        </svg>
    `,
    className: 'bg-transparent border-0',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });


  return (
    <MapContainer center={[liveLocation.lat, liveLocation.lng]} zoom={13} scrollWheelZoom={true} className="h-full w-full">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {mapRouteData && activeSchedule && destinationPoint && (
        <LiveBusRoute
          startPoint={liveLocation}
          destinationPoint={destinationPoint}
          waypoints={waypoints}
        />
      )}
      <Marker position={[liveLocation.lat, liveLocation.lng]} icon={busIcon} />
      {destinationPoint && (
        <Marker position={[destinationPoint.lat, destinationPoint.lng]} icon={destinationIcon} />
      )}
    </MapContainer>
  );
};

export default LiveTrackingMap;
