
'use client';

import React, { Suspense, use } from 'react';
import { ProgressClientPage } from './progress-client-page';
import { Skeleton } from '@/components/ui/skeleton';

function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-96 w-full rounded-2xl bg-gray-700" />
        </div>
    </div>
  );
}

export default function TripProgressPage({ params }: { params: Promise<{ tripId: string }> }) {
  const resolvedParams = use(params);
  return (
    <Suspense fallback={<Loading />}>
      <ProgressClientPage tripId={resolvedParams.tripId} />
    </Suspense>
  );
}

