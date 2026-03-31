
'use client';

import { Suspense, use } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { BookPageClient } from './book-page-client';
import Loading from './loading';

export default function Page() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();

  const scheduleId = params.slug;

  if (!scheduleId) {
    return <div className="p-6 text-red-600">Invalid booking URL: Schedule ID is missing.</div>;
  }

  return (
    <div className="flex-1">
      <Suspense fallback={<Loading />}>
        <BookPageClient
          scheduleId={scheduleId}
          date={searchParams.get('date') ?? ''}
          searchedFrom={searchParams.get('from') ?? ''}
          searchedTo={searchParams.get('to') ?? ''}
        />
      </Suspense>
    </div>
  );
}
