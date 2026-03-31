
'use client';
import { Suspense } from 'react';
import { TripsClientPage } from './trips-client-page';
import Loading from './loading';

export default function TripsPage() {
    return (
        <Suspense fallback={<Loading />}>
            <TripsClientPage />
        </Suspense>
    );
}
