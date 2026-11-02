
'use client';

import React from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import LiveBusRoute from '@/components/LiveBusRoute';
import { Skeleton } from '@/components/ui/skeleton';
import { findBestMatchIndex } from '@/lib/utils';

import type { Point, Service, Schedule } from '@/lib/types';

interface LiveTrackingMapProps {
  liveLocation: { lat: number; lng: number; heading?: number | null } | null;
  passengerLocation?: { lat: number; lng: number } | null;
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
  passengerLocation,
  mapRouteData,
  activeSchedule,
  destinationPoint,
  waypoints,
}) => {
  const mapCenter = liveLocation || passengerLocation;

  if (!mapCenter) {
    return (
      <div className="flex items-center justify-center h-full bg-muted">
        <p>Waiting for location data...</p>
      </div>
    );
  }

  const busIcon = L.divIcon({
    html: `
      <div style="transform: rotate(${liveLocation?.heading || 0}deg); transform-origin: center;">
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

  const passengerIcon = L.divIcon({
    html: `
        <div class="relative flex items-center justify-center w-6 h-6">
            <div class="absolute w-full h-full bg-sky-500 rounded-full animate-ping opacity-75"></div>
            <div class="relative w-4 h-4 bg-sky-600 border-2 border-white rounded-full shadow-md"></div>
        </div>
    `,
    className: 'bg-transparent border-0',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  let computedWaypoints = waypoints;
  const isPassengerRouting = passengerLocation && !liveLocation;

  if (isPassengerRouting) {
      computedWaypoints = [];
  } else if (!computedWaypoints && mapRouteData && activeSchedule && destinationPoint && liveLocation) {
    const isReturn = activeSchedule.direction === 'RETURN';
    const allBoardingPoints = isReturn ? mapRouteData.return.boarding : mapRouteData.forward.boarding;
    const allDroppingPoints = isReturn ? mapRouteData.return.dropping : mapRouteData.forward.dropping;
    const fullRoutePoints = [...allBoardingPoints, ...allDroppingPoints];

    const closestPointIndex = findBestMatchIndex(fullRoutePoints, undefined, liveLocation);
    if (closestPointIndex !== -1) {
      const destIndex = fullRoutePoints.findIndex(p => p.name === destinationPoint.name);
      if (destIndex !== -1 && closestPointIndex < destIndex) {
        computedWaypoints = fullRoutePoints.slice(closestPointIndex, destIndex);
      }
    }
  }

  return (
    <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={13} scrollWheelZoom={true} className="h-full w-full">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {mapRouteData && activeSchedule && destinationPoint && (
        <LiveBusRoute
          startPoint={isPassengerRouting ? passengerLocation : liveLocation}
          destinationPoint={destinationPoint}
          waypoints={computedWaypoints}
        />
      )}
      {liveLocation && (
        <Marker position={[liveLocation.lat, liveLocation.lng]} icon={busIcon} />
      )}
      {passengerLocation && (
        <Marker position={[passengerLocation.lat, passengerLocation.lng]} icon={passengerIcon} />
      )}
      {destinationPoint && (
        <Marker position={[destinationPoint.lat, destinationPoint.lng]} icon={destinationIcon} />
      )}
    </MapContainer>
  );
};

export default LiveTrackingMap;
