'use client';

import React from 'react';
import { MapContainer } from 'react-leaflet';
import LiveBusRoute from '@/components/LiveBusRoute';
import { findBestMatchIndex } from '@/lib/utils';
import type { Point, Schedule } from '@/lib/types';

interface RouteEtaCalculatorProps {
    busId: string;
    startPoint: { lat: number; lng: number };
    destinationPoint: Point;
    onRouteInfoChange: (info: any) => void;
    bookingDate: string;
    scheduledTime: string;
    departureTime: string;
    waypoints?: Point[];
    mapRouteData?: {
        forward: { boarding: Point[]; dropping: Point[]; };
        return: { boarding: Point[]; dropping: Point[]; };
    } | null;
    activeSchedule?: Schedule | null;
}

const RouteEtaCalculator: React.FC<RouteEtaCalculatorProps> = (props) => {
    let computedWaypoints = props.waypoints;

    if (!computedWaypoints && props.mapRouteData && props.activeSchedule) {
        const isReturn = props.activeSchedule.direction === 'RETURN';
        const allBoardingPoints = isReturn ? props.mapRouteData.return.boarding : props.mapRouteData.forward.boarding;
        const allDroppingPoints = isReturn ? props.mapRouteData.return.dropping : props.mapRouteData.forward.dropping;
        const fullRoutePoints = [...allBoardingPoints, ...allDroppingPoints];

        const closestPointIndex = findBestMatchIndex(fullRoutePoints, undefined, props.startPoint);
        if (closestPointIndex !== -1) {
            const destIndex = fullRoutePoints.findIndex(p => p.name === props.destinationPoint.name);
            if (destIndex !== -1 && closestPointIndex < destIndex) {
                computedWaypoints = fullRoutePoints.slice(closestPointIndex, destIndex);
            }
        }
    }

    return (
        <MapContainer center={[0,0]} zoom={1} style={{ width: 0, height: 0 }}>
            <LiveBusRoute {...props} waypoints={computedWaypoints} />
        </MapContainer>
    );
}

export default RouteEtaCalculator;
