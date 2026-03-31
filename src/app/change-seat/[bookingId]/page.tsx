
'use client';

// This page is no longer used and will be removed in a future update.
// The seat change functionality has been integrated into the main booking page
// by using a query parameter.
// See src/app/book/[slug]/book-page-client.tsx for the new implementation.

import { Frown } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export default function DeprecatedChangeSeatPage() {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <Frown className="h-4 w-4" />
          <AlertTitle>Page Deprecated</AlertTitle>
          <AlertDescription>
            This page is no longer in use. Seat changes are now handled through the main booking interface.
          </AlertDescription>
        </Alert>
      </div>
    );
}
