'use client';

import React, { Suspense, use } from 'react';
import RestStopManifestClient from './rest-stop-manifest-client';
import { Skeleton } from '@/components/ui/skeleton';

function LoadingSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8 max-w-2xl">
            <Skeleton className="h-8 w-1/2 mb-4" />
            <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
    );
}

export default function RestStopManifestPage({ params }: { params: Promise<{ scheduleId: string }> }) {
    const { scheduleId } = use(params);
    return (
        <Suspense fallback={<LoadingSkeleton />}>
            <RestStopManifestClient scheduleId={scheduleId} />
        </Suspense>
    );
}