
'use client';

import { Suspense, use } from 'react';
import BusFeaturesClientPage from './features-client-page';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

function LoadingSkeleton() {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-3/4 mt-2" />
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <Skeleton className="h-6 w-1/3" />
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-6 w-1/3" />
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </CardContent>
        </Card>
      </div>
    );
}

export default function BusFeaturesPage({ params }: { params: Promise<{ busId: string }> }) {
    const resolvedParams = use(params);
    return (
        <Suspense fallback={<LoadingSkeleton />}>
            <BusFeaturesClientPage busId={resolvedParams.busId} />
        </Suspense>
    );
}
