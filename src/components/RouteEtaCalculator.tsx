'use client';

import React from 'react';
import { MapContainer } from 'react-leaflet';
import LiveBusRoute from '@/components/LiveBusRoute';
import type { Point } from '@/lib/types';

interface RouteEtaCalculatorProps {
    busId: string;
    startPoint: { lat: number; lng: number };
    destinationPoint: Point;
    onRouteInfoChange: (info: any) => void;
    bookingDate: string;
    scheduledTime: string;
    departureTime: string;
    waypoints?: Point[];
}

const RouteEtaCalculator: React.FC<RouteEtaCalculatorProps> = (props) => {
    return (
        <MapContainer center={[0,0]} zoom={1} style={{ width: 0, height: 0 }}>
            <LiveBusRoute {...props} />
        </MapContainer>
    );
}

export default RouteEtaCalculator;
