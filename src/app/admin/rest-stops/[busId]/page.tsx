
'use client';

import { Suspense, use } from 'react';
import RestStopsClientPage from './rest-stops-client-page';
import { Skeleton } from '@/components/ui/skeleton';

function LoadingSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8 max-w-3xl">
            <Skeleton className="h-8 w-1/2 mb-4" />
            <div className="space-y-4">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
            </div>
        </div>
    );
}

export default function RestStopsPage({ params }: { params: Promise<{ busId: string }> }) {
    const resolvedParams = use(params);
    return (
        <Suspense fallback={<LoadingSkeleton />}>
            <RestStopsClientPage busId={resolvedParams.busId} />
        </Suspense>
    );
}

    
