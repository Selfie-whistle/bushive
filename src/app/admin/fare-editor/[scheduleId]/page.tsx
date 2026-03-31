
'use client';

import { Suspense, use } from 'react';
import FareEditorClientPage from './fare-editor-client-page';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

function LoadingSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-10 w-24" />
            </div>
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-1/4" />
                </CardHeader>
                <CardContent className="p-6 flex justify-center">
                    <Skeleton className="h-96 w-full max-w-4xl" />
                </CardContent>
            </Card>
        </div>
    )
}

export default function FareEditorPage({ params }: { params: Promise<{ scheduleId: string }> }) {
    const resolvedParams = use(params);
    return (
        <Suspense fallback={<LoadingSkeleton />}>
            <FareEditorClientPage scheduleId={resolvedParams.scheduleId} />
        </Suspense>
    )
}
