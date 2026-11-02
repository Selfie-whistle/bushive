import { Suspense } from 'react';
import { CabinCrewGlobalMonitor } from '@/components/cabin-crew-global-monitor';

export default function CabinCrewLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Suspense fallback={null}>
                <CabinCrewGlobalMonitor />
            </Suspense>
            {children}
        </>
    );
}
