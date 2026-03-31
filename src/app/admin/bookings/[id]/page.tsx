
'use client';

import { Suspense, use } from 'react';
import BookingDetailsPageContent from './booking-details-content';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';


function BookingDetailsPageSkeleton() {
    const router = useRouter();
    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex items-center gap-4 mb-4">
            <Button variant="outline" size="icon" onClick={() => router.push('/admin/bookings')}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold">Loading...</h1>
            </div>
            <Card>
            <CardHeader>
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-4 w-1/4 mt-2" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-40 w-full" />
            </CardContent>
            </Card>
        </div>
    );
}

export default function BookingDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    return (
        <Suspense fallback={<BookingDetailsPageSkeleton />}>
            <BookingDetailsPageContent scheduleId={resolvedParams.id} />
        </Suspense>
    )
}
