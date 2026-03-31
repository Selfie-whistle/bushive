'use client';

import React, { Suspense, use } from 'react';
import { RoutePageClient } from './route-page-client';
import { Skeleton } from '@/components/ui/skeleton';

function Loading() {
  return <Skeleton className="h-96 w-full" />;
}

export default function AdminRoutePage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const resolvedParams = use(params);
  return (
    <Suspense fallback={<Loading />}>
      <RoutePageClient serviceId={resolvedParams.serviceId} />
    </Suspense>
  );
}
